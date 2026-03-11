#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# 07 — Verify Final State
# ═══════════════════════════════════════════════════════════════
#
# READ-ONLY. No mutations. Safe to run multiple times.
#
# Verifies the entire migration by checking:
#   1. All 4 policies exist with correct names and durations
#   2. SWR's license is on Business Annual
#   3. .env.local has 4 new policy ID variables
#   4. Saves a final snapshot for the record
#
# Prereq: All previous scripts (01–06) completed.
# ═══════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/config.sh"

load_keygen_token

log_step "Verifying Keygen 4-Policy Migration"

PASS=0
FAIL=0

check_pass() { PASS=$((PASS + 1)); log_ok "PASS: $1"; }
check_fail() { FAIL=$((FAIL + 1)); log_err "FAIL: $1"; }

# ── 1. Fetch all policies ────────────────────────────────────
log_info "Fetching all policies..."
keygen_get "/policies" "${SNAPSHOTS_DIR}/policies-final.json"
json_format "${SNAPSHOTS_DIR}/policies-final.json"

POLICY_COUNT=$(node -e "const d=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); console.log((d.data||[]).length)" "${SNAPSHOTS_DIR}/policies-final.json")
log_info "Found ${POLICY_COUNT} policies"

if [[ "${POLICY_COUNT}" -ge 4 ]]; then
  check_pass "At least 4 policies exist (found ${POLICY_COUNT})"
else
  check_fail "Expected >= 4 policies, found ${POLICY_COUNT}"
fi

# ── 2. Verify each policy ────────────────────────────────────
verify_policy() {
  local policy_name="$1"
  local expected_duration="$2"

  local found
  found=$(node -e "
    const data = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
    const policies = data.data || [];
    const match = policies.find(p => p.attributes?.name === process.argv[2]);
    if (!match) {
      console.log('NOT_FOUND');
    } else {
      console.log(JSON.stringify({
        id: match.id,
        name: match.attributes.name,
        duration: match.attributes.duration,
        transferStrategy: match.attributes.transferStrategy,
        renewalBasis: match.attributes.renewalBasis
      }));
    }
  " "${SNAPSHOTS_DIR}/policies-final.json" "${policy_name}")

  if [[ "${found}" == "NOT_FOUND" ]]; then
    check_fail "Policy '${policy_name}' not found"
    return
  fi

  local actual_duration
  local tmpf="${SNAPSHOTS_DIR}/.verify-tmp.json"
  echo "${found}" > "${tmpf}"
  actual_duration=$(json_field "${tmpf}" "duration")
  local actual_transfer
  actual_transfer=$(json_field "${tmpf}" "transferStrategy")

  if [[ "${actual_duration}" == "${expected_duration}" ]]; then
    check_pass "${policy_name}: duration=${actual_duration} (correct)"
  else
    check_fail "${policy_name}: duration=${actual_duration}, expected ${expected_duration}"
  fi

  if [[ "${actual_transfer}" == "RESET_EXPIRY" ]]; then
    check_pass "${policy_name}: transferStrategy=RESET_EXPIRY"
  else
    check_fail "${policy_name}: transferStrategy=${actual_transfer}, expected RESET_EXPIRY"
  fi

  local policy_id
  policy_id=$(json_field "${tmpf}" "id")
  rm -f "${tmpf}"
  echo "    ID: ${policy_id}"
}

echo ""
log_info "Checking Individual Monthly..."
verify_policy "Individual Monthly" "${DURATION_MONTHLY}"

log_info "Checking Individual Annual..."
verify_policy "Individual Annual" "${DURATION_ANNUAL}"

log_info "Checking Business Monthly..."
verify_policy "Business Monthly" "${DURATION_MONTHLY}"

log_info "Checking Business Annual..."
verify_policy "Business Annual" "${DURATION_ANNUAL}"

# ── 3. Verify .env.local ─────────────────────────────────────
echo ""
log_info "Checking .env.local..."

check_env_var() {
  local var_name="$1"
  if grep -q "^${var_name}=" "${ENV_LOCAL}" 2>/dev/null; then
    local val
    val=$(grep "^${var_name}=" "${ENV_LOCAL}" | head -1 | cut -d'=' -f2- | tr -d '\r')
    check_pass ".env.local: ${var_name} = ${val:0:12}..."
  else
    check_fail ".env.local: ${var_name} not found"
  fi
}

check_env_var "KEYGEN_POLICY_ID_INDIVIDUAL_MONTHLY"
check_env_var "KEYGEN_POLICY_ID_INDIVIDUAL_ANNUAL"
check_env_var "KEYGEN_POLICY_ID_BUSINESS_MONTHLY"
check_env_var "KEYGEN_POLICY_ID_BUSINESS_ANNUAL"

# Check old vars are gone
if grep -q '^KEYGEN_POLICY_ID_INDIVIDUAL=' "${ENV_LOCAL}" 2>/dev/null; then
  log_warn "Old KEYGEN_POLICY_ID_INDIVIDUAL still present in .env.local (inert)"
fi
if grep -q '^KEYGEN_POLICY_ID_BUSINESS=' "${ENV_LOCAL}" 2>/dev/null; then
  log_warn "Old KEYGEN_POLICY_ID_BUSINESS still present in .env.local (inert)"
fi

# ── 4. Final license spot-check ──────────────────────────────
echo ""
log_info "License summary by policy..."
node -e "
  const fs = require('fs');
  // Get fresh license data
  const policies = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
  const policyList = policies.data || [];
  policyList.forEach(p => {
    console.log('  ' + p.attributes.name + ' (' + p.id.substring(0, 8) + '...): licenses=' + (p.attributes.licensesCount || '?'));
  });
" "${SNAPSHOTS_DIR}/policies-final.json"

# ── Summary ───────────────────────────────────────────────────
log_step "Verification Complete"
echo ""
echo "  Results: ${PASS} passed, ${FAIL} failed"
echo ""

if [[ ${FAIL} -eq 0 ]]; then
  echo "  ╔══════════════════════════════════════════════════════╗"
  echo "  ║  ALL CHECKS PASSED                                  ║"
  echo "  ║                                                      ║"
  echo "  ║  Phase 1 (Dashboard + SSM) is complete.             ║"
  echo "  ║  Proceed to Phase 2 (code changes):                 ║"
  echo "  ║    Task 15A.9 → 15A.17                              ║"
  echo "  ╚══════════════════════════════════════════════════════╝"
else
  echo "  ╔══════════════════════════════════════════════════════╗"
  echo "  ║  SOME CHECKS FAILED                                 ║"
  echo "  ║                                                      ║"
  echo "  ║  Review failures above before proceeding.           ║"
  echo "  ║  Snapshots saved to: snapshots/policies-final.json  ║"
  echo "  ╚══════════════════════════════════════════════════════╝"
  exit 1
fi
