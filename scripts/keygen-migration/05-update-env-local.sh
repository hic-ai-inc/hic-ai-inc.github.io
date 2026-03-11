#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# 05 — Update .env.local with 4 Policy IDs
# ═══════════════════════════════════════════════════════════════
#
# MUTATES: plg-website/.env.local
#
# Replaces:
#   KEYGEN_POLICY_ID_INDIVIDUAL=<uuid>
#   KEYGEN_POLICY_ID_BUSINESS=<uuid>
#
# With:
#   KEYGEN_POLICY_ID_INDIVIDUAL_MONTHLY=<existing individual uuid>
#   KEYGEN_POLICY_ID_INDIVIDUAL_ANNUAL=<new uuid from step 03>
#   KEYGEN_POLICY_ID_BUSINESS_MONTHLY=<existing business uuid>
#   KEYGEN_POLICY_ID_BUSINESS_ANNUAL=<new uuid from step 03>
#
# Creates a backup of .env.local before modifying.
#
# Prereq: Run 03-create-annual-policies.sh first.
# ═══════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/config.sh"

load_current_policy_ids
load_annual_policy_ids

log_step "Updating .env.local with 4 Policy IDs"

# ── 1. Backup current .env.local ─────────────────────────────
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
BACKUP_FILE="${SNAPSHOTS_DIR}/env-local-backup-${TIMESTAMP}"
cp "${ENV_LOCAL}" "${BACKUP_FILE}"
log_ok "Backed up .env.local → ${BACKUP_FILE}"

# ── 2. Show current state ────────────────────────────────────
echo ""
echo "Current policy entries in .env.local:"
grep 'KEYGEN_POLICY_ID' "${ENV_LOCAL}" || echo "  (none found)"
echo ""

# ── 3. Build updated .env.local ──────────────────────────────
# Strategy: remove old entries, then append new ones.
# Uses a temp file to avoid partial-write issues.
TEMP_FILE="${ENV_LOCAL}.migration-tmp"

# Remove old policy ID entries
grep -v '^KEYGEN_POLICY_ID_INDIVIDUAL=' "${ENV_LOCAL}" \
  | grep -v '^KEYGEN_POLICY_ID_BUSINESS=' \
  > "${TEMP_FILE}"

# Ensure file ends with newline before appending
if [[ -s "${TEMP_FILE}" ]] && [[ "$(tail -c 1 "${TEMP_FILE}" | wc -l)" -eq 0 ]]; then
  echo "" >> "${TEMP_FILE}"
fi

# Append new 4-policy entries
cat >> "${TEMP_FILE}" <<EOF
# Keygen 4-Policy IDs (migrated ${TIMESTAMP})
KEYGEN_POLICY_ID_INDIVIDUAL_MONTHLY=${POLICY_ID_INDIVIDUAL}
KEYGEN_POLICY_ID_INDIVIDUAL_ANNUAL=${POLICY_ID_INDIVIDUAL_ANNUAL}
KEYGEN_POLICY_ID_BUSINESS_MONTHLY=${POLICY_ID_BUSINESS}
KEYGEN_POLICY_ID_BUSINESS_ANNUAL=${POLICY_ID_BUSINESS_ANNUAL}
EOF

# ── 4. Preview changes ───────────────────────────────────────
echo "New policy entries:"
echo "  KEYGEN_POLICY_ID_INDIVIDUAL_MONTHLY=${POLICY_ID_INDIVIDUAL}"
echo "  KEYGEN_POLICY_ID_INDIVIDUAL_ANNUAL=${POLICY_ID_INDIVIDUAL_ANNUAL}"
echo "  KEYGEN_POLICY_ID_BUSINESS_MONTHLY=${POLICY_ID_BUSINESS}"
echo "  KEYGEN_POLICY_ID_BUSINESS_ANNUAL=${POLICY_ID_BUSINESS_ANNUAL}"
echo ""

# ── 5. Apply ──────────────────────────────────────────────────
mv "${TEMP_FILE}" "${ENV_LOCAL}"
log_ok ".env.local updated"

# ── 6. Verify ─────────────────────────────────────────────────
echo ""
echo "Updated policy entries in .env.local:"
grep 'KEYGEN_POLICY_ID' "${ENV_LOCAL}"

# ── Summary ───────────────────────────────────────────────────
log_step ".env.local Update Complete"
echo ""
echo "  Backup: ${BACKUP_FILE}"
echo "  ├── Removed: KEYGEN_POLICY_ID_INDIVIDUAL"
echo "  ├── Removed: KEYGEN_POLICY_ID_BUSINESS"
echo "  ├── Added:   KEYGEN_POLICY_ID_INDIVIDUAL_MONTHLY"
echo "  ├── Added:   KEYGEN_POLICY_ID_INDIVIDUAL_ANNUAL"
echo "  ├── Added:   KEYGEN_POLICY_ID_BUSINESS_MONTHLY"
echo "  └── Added:   KEYGEN_POLICY_ID_BUSINESS_ANNUAL"
echo ""
echo "  Next: run 06-update-ssm-parameters.sh"
