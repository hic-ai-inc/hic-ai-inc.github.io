#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# 06 — Update SSM/Amplify Environment Variables
# ═══════════════════════════════════════════════════════════════
#
# MUTATES: Amplify environment variables (app + branch level)
# via the existing plg-website/scripts/update-amplify-env.sh
#
# Adds 4 new policy ID variables:
#   KEYGEN_POLICY_ID_INDIVIDUAL_MONTHLY
#   KEYGEN_POLICY_ID_INDIVIDUAL_ANNUAL
#   KEYGEN_POLICY_ID_BUSINESS_MONTHLY
#   KEYGEN_POLICY_ID_BUSINESS_ANNUAL
#
# NOTE: The update script only supports add/update (not delete).
# Old variables (KEYGEN_POLICY_ID_INDIVIDUAL, KEYGEN_POLICY_ID_BUSINESS)
# will remain in Amplify until manually removed or a cleanup
# script is added. The code changes in Phase 2 will stop
# reading them, so they become inert.
#
# Prereqs:
#   - Run 03-create-annual-policies.sh (creates annual-policy-ids.env)
#   - AWS credentials configured (aws sts get-caller-identity)
#   - jq installed (used by update-amplify-env.sh)
#
# ═══════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/config.sh"

# Load the 4 new policy IDs from .env.local (written by 05-update-env-local.sh)
POLICY_ID_INDIVIDUAL_MONTHLY=$(grep '^KEYGEN_POLICY_ID_INDIVIDUAL_MONTHLY=' "${ENV_LOCAL}" | head -1 | cut -d'=' -f2- | tr -d '\r')
POLICY_ID_INDIVIDUAL_ANNUAL=$(grep '^KEYGEN_POLICY_ID_INDIVIDUAL_ANNUAL=' "${ENV_LOCAL}" | head -1 | cut -d'=' -f2- | tr -d '\r')
POLICY_ID_BUSINESS_MONTHLY=$(grep '^KEYGEN_POLICY_ID_BUSINESS_MONTHLY=' "${ENV_LOCAL}" | head -1 | cut -d'=' -f2- | tr -d '\r')
POLICY_ID_BUSINESS_ANNUAL=$(grep '^KEYGEN_POLICY_ID_BUSINESS_ANNUAL=' "${ENV_LOCAL}" | head -1 | cut -d'=' -f2- | tr -d '\r')

if [[ -z "${POLICY_ID_INDIVIDUAL_MONTHLY}" || -z "${POLICY_ID_INDIVIDUAL_ANNUAL}" || -z "${POLICY_ID_BUSINESS_MONTHLY}" || -z "${POLICY_ID_BUSINESS_ANNUAL}" ]]; then
  log_err "Could not load all 4 policy IDs from ${ENV_LOCAL}"
  log_err "Run 05-update-env-local.sh first."
  exit 1
fi

log_step "Updating Amplify SSM Environment Variables"

# ── 1. Pre-flight: check dependencies ────────────────────────
if ! command -v aws &>/dev/null; then
  log_err "AWS CLI not found. Install it or configure credentials."
  exit 1
fi

if ! aws sts get-caller-identity &>/dev/null; then
  log_err "AWS credentials not configured or expired."
  log_err "Run: aws sso login --profile <your-profile>"
  exit 1
fi

if [[ ! -f "${AMPLIFY_ENV_SCRIPT}" ]]; then
  log_err "update-amplify-env.sh not found at: ${AMPLIFY_ENV_SCRIPT}"
  exit 1
fi

log_ok "AWS credentials valid"
log_ok "Update script: ${AMPLIFY_ENV_SCRIPT}"

# ── 2. Preview changes ───────────────────────────────────────
echo ""
echo "Variables to ADD to Amplify (development branch):"
echo "  KEYGEN_POLICY_ID_INDIVIDUAL_MONTHLY = ${POLICY_ID_INDIVIDUAL_MONTHLY}"
echo "  KEYGEN_POLICY_ID_INDIVIDUAL_ANNUAL  = ${POLICY_ID_INDIVIDUAL_ANNUAL}"
echo "  KEYGEN_POLICY_ID_BUSINESS_MONTHLY   = ${POLICY_ID_BUSINESS_MONTHLY}"
echo "  KEYGEN_POLICY_ID_BUSINESS_ANNUAL    = ${POLICY_ID_BUSINESS_ANNUAL}"
echo ""


# ── 3. Execute update ────────────────────────────────────────
log_info "Running update-amplify-env.sh..."

"${AMPLIFY_ENV_SCRIPT}" \
  "KEYGEN_POLICY_ID_INDIVIDUAL_MONTHLY=${POLICY_ID_INDIVIDUAL_MONTHLY}" \
  "KEYGEN_POLICY_ID_INDIVIDUAL_ANNUAL=${POLICY_ID_INDIVIDUAL_ANNUAL}" \
  "KEYGEN_POLICY_ID_BUSINESS_MONTHLY=${POLICY_ID_BUSINESS_MONTHLY}" \
  "KEYGEN_POLICY_ID_BUSINESS_ANNUAL=${POLICY_ID_BUSINESS_ANNUAL}"

log_ok "Amplify environment variables updated"

# ── Summary ───────────────────────────────────────────────────
log_step "SSM/Amplify Update Complete"
echo ""
echo "  4 new variables added to Amplify (development branch):"
echo "  ├── KEYGEN_POLICY_ID_INDIVIDUAL_MONTHLY"
echo "  ├── KEYGEN_POLICY_ID_INDIVIDUAL_ANNUAL"
echo "  ├── KEYGEN_POLICY_ID_BUSINESS_MONTHLY"
echo "  └── KEYGEN_POLICY_ID_BUSINESS_ANNUAL"
echo ""
echo "  Old variables (INERT — will be cleaned up after code deploy):"
echo "  ├── KEYGEN_POLICY_ID_INDIVIDUAL"
echo "  └── KEYGEN_POLICY_ID_BUSINESS"
echo ""
echo "  Next: run 07-verify-final-state.sh"
