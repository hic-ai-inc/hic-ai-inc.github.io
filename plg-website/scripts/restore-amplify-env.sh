#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# PLG Website - Amplify Environment Variables Restore Script
# ═══════════════════════════════════════════════════════════════════
#
# This script restores Amplify environment variables from a backup file.
# IMPORTANT: This REPLACES all existing variables (Amplify CLI behavior).
#
# Usage:
#   ./scripts/restore-amplify-env.sh <backup-file>
#
# Arguments:
#   backup-file - Path to the backup JSON file
#
# ═══════════════════════════════════════════════════════════════════

set -e

# Prevent Git Bash from mangling file:// paths on Windows
export MSYS_NO_PATHCONV=1

# ───────────────────────────────────────────────────────────────────
# Configuration
# ───────────────────────────────────────────────────────────────────

BACKUP_FILE="${1:-}"
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

# ───────────────────────────────────────────────────────────────────
# Validation
# ───────────────────────────────────────────────────────────────────

if [ -z "${BACKUP_FILE}" ]; then
    log_error "Usage: $0 <backup-file>"
    log_error "Example: $0 ./scripts/backups/amplify-env-development-20260128_120000.json"
    exit 1
fi

if [ ! -f "${BACKUP_FILE}" ]; then
    log_error "Backup file not found: ${BACKUP_FILE}"
    exit 1
fi

# ───────────────────────────────────────────────────────────────────
# Main
# ───────────────────────────────────────────────────────────────────

log_info "Starting Amplify environment variables restore..."
log_info "Backup file: ${BACKUP_FILE}"

# Parse metadata
APP_ID=$(jq -r '._metadata.appId' "${BACKUP_FILE}")
BRANCH=$(jq -r '._metadata.branch' "${BACKUP_FILE}")
BACKUP_TIMESTAMP=$(jq -r '._metadata.timestamp' "${BACKUP_FILE}")
VAR_COUNT=$(jq -r '._metadata.variableCount' "${BACKUP_FILE}")

log_info "App ID: ${APP_ID}"
log_info "Branch: ${BRANCH}"
log_info "Backup timestamp: ${BACKUP_TIMESTAMP}"
log_info "Variables to restore: ${VAR_COUNT}"

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

# Convert backup file to absolute path before pushd
BACKUP_FILE_ABS="$(cd "$(dirname "${BACKUP_FILE}")" && pwd)/$(basename "${BACKUP_FILE}")"

# Extract environment variables JSON (use relative path for Windows Git Bash compatibility)
ENV_VARS_FILE=".env-restore-temp.json"
pushd "${SCRIPT_DIR}" > /dev/null
jq '.environmentVariables' "${BACKUP_FILE_ABS}" > "${ENV_VARS_FILE}"

# Confirmation prompt
echo ""
log_warn "⚠️  WARNING: This will REPLACE ALL existing environment variables!"
echo ""
echo "Variables to be restored:"
jq -r 'keys[]' "${ENV_VARS_FILE}" | while read -r key; do
    echo "  - ${key}"
done
echo ""
read -p "Are you sure you want to proceed? (yes/no): " CONFIRM

if [ "${CONFIRM}" != "yes" ]; then
    log_info "Restore cancelled."
    rm -f "${ENV_VARS_FILE}"
    exit 0
fi

# Perform the restore to BOTH levels
log_info "Restoring to BRANCH level..."
BRANCH_RESULT=$(aws amplify update-branch \
    --app-id "${APP_ID}" \
    --branch-name "${BRANCH}" \
    --environment-variables "file://${ENV_VARS_FILE}" \
    --query "branch.environmentVariables" \
    --output json)

log_info "Restoring to APP level..."
APP_RESULT=$(aws amplify update-app \
    --app-id "${APP_ID}" \
    --environment-variables "file://${ENV_VARS_FILE}" \
    --query "app.environmentVariables" \
    --output json)

RESULT="${BRANCH_RESULT}"

# Cleanup
rm -f "${ENV_VARS_FILE}"
popd > /dev/null

# Verify
RESTORED_COUNT=$(echo "${RESULT}" | jq 'keys | length')

if [ "${RESTORED_COUNT}" -eq "${VAR_COUNT}" ]; then
    log_success "Restore complete! ${RESTORED_COUNT} variables restored."
else
    log_warn "Restored ${RESTORED_COUNT} variables (expected ${VAR_COUNT})"
fi

echo ""
log_info "Restored variables:"
echo "${RESULT}" | jq -r 'keys[]' | while read -r key; do
    echo "  - ${key}"
done

echo ""
log_info "NOTE: You may need to trigger a new deployment for changes to take effect."
log_info "Run: aws amplify start-job --app-id ${APP_ID} --branch-name ${BRANCH} --job-type RELEASE"
