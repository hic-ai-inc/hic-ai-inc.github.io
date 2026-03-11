#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# 02 — Update Existing Policies → Monthly
# ═══════════════════════════════════════════════════════════════
#
# MUTATES: Renames both existing policies and sets duration.
#
# Changes per policy:
#   name           → "Individual Monthly" / "Business Monthly"
#   duration       → 3801600 (44 days = 30 + 14 grace)
#   transferStrategy → RESET_EXPIRY
#   renewalBasis   → FROM_EXPIRY
#
# Prereq: Run 01-backup-current-state.sh first.
#
# Output files in snapshots/:
#   policy-individual-monthly-updated.json
#   policy-business-monthly-updated.json
# ═══════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/config.sh"

load_keygen_token
load_current_policy_ids

# ── Pre-flight checks ─────────────────────────────────────────
if [[ ! -f "${SNAPSHOTS_DIR}/policy-individual.json" ]]; then
  log_err "No backup found. Run 01-backup-current-state.sh first."
  exit 1
fi

log_step "Updating Existing Policies to Monthly"

# ── 1. Patch Individual → Individual Monthly ──────────────────
log_info "Patching Individual policy → Individual Monthly..."
PATCH_BODY_INDIVIDUAL=$(node -e "
  console.log(JSON.stringify({
    data: {
      type: 'policies',
      attributes: {
        name: 'Individual Monthly',
        duration: ${DURATION_MONTHLY},
        transferStrategy: 'RESET_EXPIRY',
        renewalBasis: 'FROM_EXPIRY'
      }
    }
  }));
")

INDIV_OUT="${SNAPSHOTS_DIR}/policy-individual-monthly-updated.json"
keygen_patch "/policies/${POLICY_ID_INDIVIDUAL}" "${PATCH_BODY_INDIVIDUAL}" "${INDIV_OUT}"
json_format "${INDIV_OUT}"

UPDATED_NAME=$(json_field "${INDIV_OUT}" "data.attributes.name")
UPDATED_DURATION=$(json_field "${INDIV_OUT}" "data.attributes.duration")
UPDATED_TRANSFER=$(json_field "${INDIV_OUT}" "data.attributes.transferStrategy")
log_ok "Individual: name=\"${UPDATED_NAME}\", duration=${UPDATED_DURATION}, transfer=${UPDATED_TRANSFER}"

# ── 2. Patch Business → Business Monthly ──────────────────────
log_info "Patching Business policy → Business Monthly..."
PATCH_BODY_BUSINESS=$(node -e "
  console.log(JSON.stringify({
    data: {
      type: 'policies',
      attributes: {
        name: 'Business Monthly',
        duration: ${DURATION_MONTHLY},
        transferStrategy: 'RESET_EXPIRY',
        renewalBasis: 'FROM_EXPIRY'
      }
    }
  }));
")

BIZ_OUT="${SNAPSHOTS_DIR}/policy-business-monthly-updated.json"
keygen_patch "/policies/${POLICY_ID_BUSINESS}" "${PATCH_BODY_BUSINESS}" "${BIZ_OUT}"
json_format "${BIZ_OUT}"

UPDATED_NAME=$(json_field "${BIZ_OUT}" "data.attributes.name")
UPDATED_DURATION=$(json_field "${BIZ_OUT}" "data.attributes.duration")
UPDATED_TRANSFER=$(json_field "${BIZ_OUT}" "data.attributes.transferStrategy")
log_ok "Business: name=\"${UPDATED_NAME}\", duration=${UPDATED_DURATION}, transfer=${UPDATED_TRANSFER}"

# ── Summary ───────────────────────────────────────────────────
log_step "Monthly Policy Updates Complete"
echo ""
echo "  Both policies renamed and configured:"
echo "  ├── Individual Monthly  (${POLICY_ID_INDIVIDUAL})"
echo "  │   duration=${DURATION_MONTHLY}s (44 days)"
echo "  │   transferStrategy=RESET_EXPIRY, renewalBasis=FROM_EXPIRY"
echo "  └── Business Monthly    (${POLICY_ID_BUSINESS})"
echo "      duration=${DURATION_MONTHLY}s (44 days)"
echo "      transferStrategy=RESET_EXPIRY, renewalBasis=FROM_EXPIRY"
echo ""
echo "  Snapshots saved. Review, then run 03-create-annual-policies.sh"
