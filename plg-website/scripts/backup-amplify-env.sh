#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# PLG Website - Amplify Environment Variables Backup Script
# ═══════════════════════════════════════════════════════════════════
#
# This script backs up all Amplify environment variables to a local
# JSON file. Run this BEFORE making any changes to env vars.
#
# Usage:
#   ./scripts/backup-amplify-env.sh [branch]
#
# Arguments:
#   branch   - Amplify branch name (default: development)
#
# Output:
#   Creates timestamped backup in scripts/backups/
#
# ═══════════════════════════════════════════════════════════════════

set -e

# ───────────────────────────────────────────────────────────────────
# Configuration
# ───────────────────────────────────────────────────────────────────

APP_ID="d2yhz9h4xdd5rb"
BRANCH="${1:-development}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${SCRIPT_DIR}/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/amplify-env-${BRANCH}-${TIMESTAMP}.json"

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
    echo "[WARN] $1" >&2
}

# ───────────────────────────────────────────────────────────────────
# Main
# ───────────────────────────────────────────────────────────────────

log_info "Starting Amplify environment variables backup..."
log_info "App ID: ${APP_ID}"
log_info "Branch: ${BRANCH}"

# Create backup directory if it doesn't exist
mkdir -p "${BACKUP_DIR}"

# Check AWS credentials
if ! aws sts get-caller-identity > /dev/null 2>&1; then
    log_error "AWS credentials not configured or expired"
    exit 1
fi

# Verify the app and branch exist
if ! aws amplify get-branch --app-id "${APP_ID}" --branch-name "${BRANCH}" > /dev/null 2>&1; then
    log_error "Cannot find branch '${BRANCH}' in app '${APP_ID}'"
    exit 1
fi

# Fetch environment variables from BOTH levels
log_info "Fetching environment variables..."

# Get branch-level variables (primary source)
BRANCH_VARS=$(aws amplify get-branch \
    --app-id "${APP_ID}" \
    --branch-name "${BRANCH}" \
    --query "branch.environmentVariables" \
    --output json)

# Get app-level variables (should be identical)
APP_VARS=$(aws amplify get-app \
    --app-id "${APP_ID}" \
    --query "app.environmentVariables" \
    --output json)

# Use branch-level as primary (merged/complete set)
ENV_VARS="${BRANCH_VARS}"

# Count variables
VAR_COUNT=$(echo "${ENV_VARS}" | jq 'keys | length')
APP_VAR_COUNT=$(echo "${APP_VARS}" | jq 'keys | length')

# Warn if app-level and branch-level are out of sync
if [ "${VAR_COUNT}" -ne "${APP_VAR_COUNT}" ]; then
    log_warn "⚠️  App-level (${APP_VAR_COUNT}) and branch-level (${VAR_COUNT}) variables are OUT OF SYNC!"
    log_warn "   Run update-amplify-env.sh to resync both levels."
fi

if [ "${VAR_COUNT}" -eq 0 ]; then
    log_error "No environment variables found!"
    exit 1
fi

# Create backup with metadata
cat > "${BACKUP_FILE}" << EOF
{
  "_metadata": {
    "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "appId": "${APP_ID}",
    "branch": "${BRANCH}",
    "variableCount": ${VAR_COUNT},
    "createdBy": "$(whoami)@$(hostname)"
  },
  "environmentVariables": ${ENV_VARS}
}
EOF

log_success "Backup created: ${BACKUP_FILE}"
log_info "Total variables backed up: ${VAR_COUNT}"

# List the variables (names only, not values)
log_info "Variables included:"
echo "${ENV_VARS}" | jq -r 'keys[]' | while read -r key; do
    echo "  - ${key}"
done

# Keep only the last 10 backups
log_info "Cleaning up old backups (keeping last 10)..."
ls -t "${BACKUP_DIR}"/amplify-env-${BRANCH}-*.json 2>/dev/null | tail -n +11 | xargs -r rm -f

log_success "Backup complete!"
echo ""
echo "To restore this backup, run:"
echo "  ./scripts/restore-amplify-env.sh ${BACKUP_FILE}"
