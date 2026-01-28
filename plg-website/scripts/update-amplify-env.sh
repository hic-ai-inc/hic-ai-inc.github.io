#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# PLG Website - Safe Amplify Environment Variables Update Script
# ═══════════════════════════════════════════════════════════════════
#
# This script safely adds or updates environment variables by:
# 1. Creating a backup of current state
# 2. Merging new variables with existing ones
# 3. Applying the combined set atomically
#
# Usage:
#   ./scripts/update-amplify-env.sh <key>=<value> [<key>=<value> ...]
#   ./scripts/update-amplify-env.sh -f <json-file>
#
# Examples:
#   ./scripts/update-amplify-env.sh NEW_VAR=value
#   ./scripts/update-amplify-env.sh VAR1=value1 VAR2=value2
#   ./scripts/update-amplify-env.sh -f new-vars.json
#
# ═══════════════════════════════════════════════════════════════════

set -e

# ───────────────────────────────────────────────────────────────────
# Configuration
# ───────────────────────────────────────────────────────────────────

APP_ID="d2yhz9h4xdd5rb"
BRANCH="${AMPLIFY_BRANCH:-development}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ───────────────────────────────────────────────────────────────────
# Functions
# ───────────────────────────────────────────────────────────────────

log_info() {
    echo "[INFO] $1"
}

log_error() {
    echo "[ERROR] $1" >&2
}

log_success() {
    echo "[SUCCESS] $1"
}

log_warn() {
    echo "[WARN] $1"
}

show_usage() {
    echo "Usage:"
    echo "  $0 <key>=<value> [<key>=<value> ...]"
    echo "  $0 -f <json-file>"
    echo ""
    echo "Options:"
    echo "  -f <file>   Read variables from JSON file"
    echo "  -b <branch> Target branch (default: development)"
    echo "  -h          Show this help"
    echo ""
    echo "Examples:"
    echo "  $0 MY_VAR=myvalue"
    echo "  $0 VAR1=value1 VAR2=value2"
    echo "  $0 -f new-vars.json"
    echo ""
    echo "Environment:"
    echo "  AMPLIFY_BRANCH  Target branch (default: development)"
}

# ───────────────────────────────────────────────────────────────────
# Parse arguments
# ───────────────────────────────────────────────────────────────────

FROM_FILE=""
NEW_VARS="{}"

while getopts "f:b:h" opt; do
    case $opt in
        f) FROM_FILE="$OPTARG" ;;
        b) BRANCH="$OPTARG" ;;
        h) show_usage; exit 0 ;;
        *) show_usage; exit 1 ;;
    esac
done
shift $((OPTIND - 1))

# ───────────────────────────────────────────────────────────────────
# Build new variables object
# ───────────────────────────────────────────────────────────────────

if [ -n "${FROM_FILE}" ]; then
    # Load from file
    if [ ! -f "${FROM_FILE}" ]; then
        log_error "File not found: ${FROM_FILE}"
        exit 1
    fi
    NEW_VARS=$(cat "${FROM_FILE}")
elif [ $# -eq 0 ]; then
    log_error "No variables specified"
    show_usage
    exit 1
else
    # Parse key=value pairs
    for pair in "$@"; do
        if [[ ! "${pair}" =~ ^[A-Za-z_][A-Za-z0-9_]*=.+$ ]]; then
            log_error "Invalid format: ${pair}"
            log_error "Expected: KEY=value"
            exit 1
        fi
        key="${pair%%=*}"
        value="${pair#*=}"
        NEW_VARS=$(echo "${NEW_VARS}" | jq --arg k "${key}" --arg v "${value}" '. + {($k): $v}')
    done
fi

# ───────────────────────────────────────────────────────────────────
# Main
# ───────────────────────────────────────────────────────────────────

log_info "Safe Amplify Environment Variables Update"
log_info "App ID: ${APP_ID}"
log_info "Branch: ${BRANCH}"

# Check AWS credentials
if ! aws sts get-caller-identity > /dev/null 2>&1; then
    log_error "AWS credentials not configured or expired"
    exit 1
fi

# Step 1: Create backup
log_info "Step 1/4: Creating backup..."
"${SCRIPT_DIR}/backup-amplify-env.sh" "${BRANCH}" > /dev/null
log_success "Backup created"

# Step 2: Fetch current variables
log_info "Step 2/4: Fetching current variables..."
CURRENT_VARS=$(aws amplify get-branch \
    --app-id "${APP_ID}" \
    --branch-name "${BRANCH}" \
    --query "branch.environmentVariables" \
    --output json)

CURRENT_COUNT=$(echo "${CURRENT_VARS}" | jq 'keys | length')
log_info "Current variables: ${CURRENT_COUNT}"

# Step 3: Merge variables
log_info "Step 3/4: Merging variables..."
MERGED_VARS=$(echo "${CURRENT_VARS}" | jq --argjson new "${NEW_VARS}" '. + $new')
MERGED_COUNT=$(echo "${MERGED_VARS}" | jq 'keys | length')

# Show what's changing
echo ""
echo "Changes to be applied:"
echo "${NEW_VARS}" | jq -r 'keys[]' | while read -r key; do
    if echo "${CURRENT_VARS}" | jq -e --arg k "${key}" 'has($k)' > /dev/null 2>&1; then
        echo "  [UPDATE] ${key}"
    else
        echo "  [ADD] ${key}"
    fi
done
echo ""

# Step 4: Apply merged variables
log_info "Step 4/4: Applying merged variables..."

MERGED_FILE=$(mktemp)
echo "${MERGED_VARS}" > "${MERGED_FILE}"

RESULT=$(aws amplify update-branch \
    --app-id "${APP_ID}" \
    --branch-name "${BRANCH}" \
    --environment-variables "file://${MERGED_FILE}" \
    --query "branch.environmentVariables" \
    --output json)

rm -f "${MERGED_FILE}"

FINAL_COUNT=$(echo "${RESULT}" | jq 'keys | length')

log_success "Update complete!"
log_info "Previous count: ${CURRENT_COUNT}"
log_info "Final count: ${FINAL_COUNT}"

echo ""
log_info "NOTE: You may need to trigger a new deployment for changes to take effect."
