#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# 04 — Transfer SWR's License to Business Annual
# ═══════════════════════════════════════════════════════════════
#
# MUTATES: Changes the policy on SWR's license from
# Business Monthly → Business Annual.
#
# The Keygen "Change Policy" endpoint:
#   PUT /licenses/{id}/policy
# uses the policy's transferStrategy. Since we set
# RESET_EXPIRY on Business Annual, the license expiry
# will be recalculated as now + 379 days.
#
# Usage:
#   bash 04-transfer-swr-license.sh <license-id>
#
# Prereq: Run 03-create-annual-policies.sh first.
#
# Output files in snapshots/:
#   license-swr-before-transfer.json
#   license-swr-after-transfer.json
# ═══════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/config.sh"

load_keygen_token
load_current_policy_ids
load_annual_policy_ids

log_step "Transfer SWR License: Business Monthly → Business Annual"

# ── 1. Validate arguments ─────────────────────────────────────
LICENSE_ID="${1:-}"
if [[ -z "${LICENSE_ID}" ]]; then
  log_err "Usage: $0 <license-id>"
  log_err "  Get license IDs from snapshots/licenses-list.json (run 01 first)"
  exit 1
fi

# ── 3. Snapshot the license before transfer ───────────────────
log_info "Fetching license detail (${LICENSE_ID})..."
BEFORE_OUT="${SNAPSHOTS_DIR}/license-swr-before-transfer.json"
keygen_get "/licenses/${LICENSE_ID}" "${BEFORE_OUT}"
json_format "${BEFORE_OUT}"

CURRENT_POLICY=$(json_field "${BEFORE_OUT}" "data.relationships.policy.data.id")
LICENSE_NAME=$(json_field "${BEFORE_OUT}" "data.attributes.name" 2>/dev/null || echo "(unnamed)")
LICENSE_STATUS=$(json_field "${BEFORE_OUT}" "data.attributes.status" 2>/dev/null || echo "unknown")
log_info "License: ${LICENSE_NAME}, status: ${LICENSE_STATUS}"
log_info "Current policy: ${CURRENT_POLICY}"

if [[ "${CURRENT_POLICY}" != "${POLICY_ID_BUSINESS}" ]]; then
  log_err "License is NOT on Business Monthly policy (${POLICY_ID_BUSINESS})."
  log_err "It is on: ${CURRENT_POLICY}. Aborting."
  exit 1
fi

# ── 3b. Transfer summary ─────────────────────────────────────
log_info "Transfer: ${LICENSE_NAME}"
log_info "  From: Business Monthly (${POLICY_ID_BUSINESS})"
log_info "  To:   Business Annual  (${POLICY_ID_BUSINESS_ANNUAL})"
log_info "  transferStrategy: RESET_EXPIRY → expiry resets to now + 379 days"

# ── 5. Execute transfer ──────────────────────────────────────
log_info "Transferring license to Business Annual..."
TRANSFER_BODY=$(node -e "
  console.log(JSON.stringify({
    data: {
      type: 'policies',
      id: '${POLICY_ID_BUSINESS_ANNUAL}'
    }
  }));
")

AFTER_OUT="${SNAPSHOTS_DIR}/license-swr-after-transfer.json"
keygen_put "/licenses/${LICENSE_ID}/policy" "${TRANSFER_BODY}" "${AFTER_OUT}"
json_format "${AFTER_OUT}"

NEW_POLICY=$(json_field "${AFTER_OUT}" "data.relationships.policy.data.id")
NEW_EXPIRY=$(json_field "${AFTER_OUT}" "data.attributes.expiry" 2>/dev/null || echo "null")
log_ok "Transfer complete"
log_ok "New policy: ${NEW_POLICY}"
log_ok "New expiry: ${NEW_EXPIRY}"

# ── 6. Verify machines preserved ─────────────────────────────
log_info "Verifying machines are preserved..."
MACHINES_OUT="${SNAPSHOTS_DIR}/license-swr-machines.json"
keygen_get "/licenses/${LICENSE_ID}/machines" "${MACHINES_OUT}"
json_format "${MACHINES_OUT}"
MACHINE_COUNT=$(json_field "${MACHINES_OUT}" "meta.count" 2>/dev/null || echo "?")
log_ok "Machines on license: ${MACHINE_COUNT}"

# ── Summary ───────────────────────────────────────────────────
log_step "License Transfer Complete"
echo ""
echo "  License ${LICENSE_ID} transferred:"
echo "  ├── From: Business Monthly  (${POLICY_ID_BUSINESS})"
echo "  └── To:   Business Annual   (${POLICY_ID_BUSINESS_ANNUAL})"
echo "      expiry: ${NEW_EXPIRY}"
echo "      machines: ${MACHINE_COUNT}"
echo ""
echo "  Review snapshots, then run 05-update-env-local.sh"
