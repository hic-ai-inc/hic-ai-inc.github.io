#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# 01 — Backup Current Keygen State
# ═══════════════════════════════════════════════════════════════
#
# READ-ONLY. No mutations. Safe to run multiple times.
#
# Saves full JSON snapshots of:
#   - All policies (list + individual detail for each)
#   - All licenses (to identify SWR's license for step 04)
#
# Output files in snapshots/:
#   policies-list.json           Full policy list response
#   policy-individual.json       Individual policy detail
#   policy-business.json         Business policy detail
#   licenses-list.json           All licenses
# ═══════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/config.sh"

load_keygen_token
load_current_policy_ids

TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
log_step "Backing up Keygen state (${TIMESTAMP})"

# ── 1. List All Policies ──────────────────────────────────────
log_info "Fetching policy list..."
keygen_get "/policies" "${SNAPSHOTS_DIR}/policies-list.json"
json_format "${SNAPSHOTS_DIR}/policies-list.json"
log_ok "Saved policies-list.json"

POLICY_COUNT=$(json_field "${SNAPSHOTS_DIR}/policies-list.json" "meta.count" 2>/dev/null || echo "?")
log_info "Found ${POLICY_COUNT} policies"

# ── 2. Individual Policy Detail ───────────────────────────────
log_info "Fetching Individual policy (${POLICY_ID_INDIVIDUAL})..."
keygen_get "/policies/${POLICY_ID_INDIVIDUAL}" "${SNAPSHOTS_DIR}/policy-individual.json"
json_format "${SNAPSHOTS_DIR}/policy-individual.json"

INDIVIDUAL_NAME=$(json_field "${SNAPSHOTS_DIR}/policy-individual.json" "data.attributes.name")
INDIVIDUAL_DURATION=$(json_field "${SNAPSHOTS_DIR}/policy-individual.json" "data.attributes.duration")
log_ok "Individual: name=\"${INDIVIDUAL_NAME}\", duration=${INDIVIDUAL_DURATION:-null}"

# ── 3. Business Policy Detail ─────────────────────────────────
log_info "Fetching Business policy (${POLICY_ID_BUSINESS})..."
keygen_get "/policies/${POLICY_ID_BUSINESS}" "${SNAPSHOTS_DIR}/policy-business.json"
json_format "${SNAPSHOTS_DIR}/policy-business.json"

BUSINESS_NAME=$(json_field "${SNAPSHOTS_DIR}/policy-business.json" "data.attributes.name")
BUSINESS_DURATION=$(json_field "${SNAPSHOTS_DIR}/policy-business.json" "data.attributes.duration")
log_ok "Business: name=\"${BUSINESS_NAME}\", duration=${BUSINESS_DURATION:-null}"

# ── 4. List All Licenses ──────────────────────────────────────
log_info "Fetching license list..."
keygen_get "/licenses?limit=100" "${SNAPSHOTS_DIR}/licenses-list.json"
json_format "${SNAPSHOTS_DIR}/licenses-list.json"

LICENSE_COUNT=$(json_field "${SNAPSHOTS_DIR}/licenses-list.json" "meta.count" 2>/dev/null || echo "?")
log_ok "Saved licenses-list.json (${LICENSE_COUNT} licenses)"

# ── 5. Summary ────────────────────────────────────────────────
log_step "Backup Complete"
echo ""
echo "  Snapshots saved to: ${SNAPSHOTS_DIR}/"
echo "  ├── policies-list.json"
echo "  ├── policy-individual.json  (${INDIVIDUAL_NAME})"
echo "  ├── policy-business.json    (${BUSINESS_NAME})"
echo "  └── licenses-list.json      (${LICENSE_COUNT} licenses)"
echo ""
echo "  Review these files before proceeding to step 02."
echo ""

# Show licenses on Business policy (relevant for step 04 transfer)
log_info "Licenses on Business policy (candidates for transfer in step 04):"
node -e "
  const data = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
  const bizPolicyId = process.argv[2];
  const licenses = data.data || [];
  const bizLicenses = licenses.filter(l =>
    l.relationships?.policy?.data?.id === bizPolicyId
  );
  if (bizLicenses.length === 0) {
    console.log('  (none found)');
  } else {
    bizLicenses.forEach(l => {
      const name = l.attributes?.name || l.attributes?.metadata?.email || '(unnamed)';
      const key = l.attributes?.key ? l.attributes.key.substring(0, 12) + '...' : '(no key)';
      console.log('  ID: ' + l.id + '  name: ' + name + '  key: ' + key);
    });
  }
" "${SNAPSHOTS_DIR}/licenses-list.json" "${POLICY_ID_BUSINESS}"

echo ""
log_ok "Step 01 complete. Review snapshots, then run 02-update-monthly-policies.sh"
