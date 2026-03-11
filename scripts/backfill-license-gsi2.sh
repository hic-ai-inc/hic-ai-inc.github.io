#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Backfill GSI2PK/GSI2SK on LICENSE#* records
# ═══════════════════════════════════════════════════════════════
#
# Root cause: createLicense() in dynamodb.js never wrote GSI2PK
# or GSI2SK, so getLicenseByKey() (which queries GSI2) always
# returns null — breaking license validation and heartbeat.
#
# This script scans all LICENSE#*/DETAILS records, checks for
# a licenseKey attribute, and adds:
#   GSI2PK = LICENSE_KEY#<licenseKey>
#   GSI2SK = LICENSE#DETAILS
#
# Usage:
#   ./scripts/backfill-license-gsi2.sh              # dry-run (default)
#   ./scripts/backfill-license-gsi2.sh --execute    # live update
#
# Safety:
#   - Dry-run by default — no mutations without --execute
#   - Idempotent — skips records that already have GSI2PK
#   - Skips records without a licenseKey attribute
#   - Reports before/after counts for verification
#
# Ref: docs/plg/20260311_LICENSE_ACTIVATION_BUG_ROOT_CAUSE_ANALYSIS_AND_PROPOSED_FIX.md
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────
TABLE_NAME="${DYNAMODB_TABLE_NAME:-hic-plg-staging}"
REGION="${AWS_REGION:-us-east-1}"
DRY_RUN=true

if [[ "${1:-}" == "--execute" ]]; then
  DRY_RUN=false
fi

# ── Logging helpers ───────────────────────────────────────────
log_info()  { echo "[INFO]  $*"; }
log_ok()    { echo "[OK]    $*"; }
log_warn()  { echo "[WARN]  $*"; }
log_error() { echo "[ERROR] $*" >&2; }
log_skip()  { echo "[SKIP]  $*"; }

# ── Sum helper (handles paginated --output text from AWS CLI) ─
# AWS CLI scan with --select COUNT --output text returns one
# number per page, separated by whitespace. This sums them.
sum_numbers() { node -e "let s=0;process.stdin.on('data',d=>{d.toString().trim().split(/\s+/).forEach(n=>{if(n)s+=Number(n)})});process.stdin.on('end',()=>console.log(s))"; }

# ── Banner ────────────────────────────────────────────────────
echo "═══════════════════════════════════════════════════════════"
echo " Backfill LICENSE GSI2PK/GSI2SK"
echo " Table:   ${TABLE_NAME}"
echo " Region:  ${REGION}"
if $DRY_RUN; then
  echo " Mode:    DRY-RUN (no mutations)"
else
  echo " Mode:    EXECUTE (will write to DynamoDB)"
fi
echo "═══════════════════════════════════════════════════════════"
echo ""

# ── Step 1: Count license records ────────────────────────────
log_info "Scanning for LICENSE#*/DETAILS records..."

TOTAL_COUNT=$(MSYS_NO_PATHCONV=1 aws dynamodb scan \
  --table-name "${TABLE_NAME}" \
  --region "${REGION}" \
  --filter-expression "begins_with(PK, :pk) AND SK = :sk" \
  --expression-attribute-values '{":pk":{"S":"LICENSE#"},":sk":{"S":"DETAILS"}}' \
  --select "COUNT" \
  --query "Count" \
  --output text | sum_numbers)

log_info "Total license records: ${TOTAL_COUNT}"

# ── Step 2: Count records already with GSI2PK ────────────────
ALREADY_DONE=$(MSYS_NO_PATHCONV=1 aws dynamodb scan \
  --table-name "${TABLE_NAME}" \
  --region "${REGION}" \
  --filter-expression "begins_with(PK, :pk) AND SK = :sk AND attribute_exists(GSI2PK)" \
  --expression-attribute-values '{":pk":{"S":"LICENSE#"},":sk":{"S":"DETAILS"}}' \
  --select "COUNT" \
  --query "Count" \
  --output text | sum_numbers)

log_info "Already have GSI2PK: ${ALREADY_DONE}"

NEED_BACKFILL=$((TOTAL_COUNT - ALREADY_DONE))
log_info "Need backfill: ${NEED_BACKFILL}"
echo ""

if [[ "${NEED_BACKFILL}" -eq 0 ]]; then
  log_ok "All license records already have GSI2PK. Nothing to do."
  exit 0
fi

# ── Step 3: Fetch records needing backfill ────────────────────
# We need PK, SK, and licenseKey for each record missing GSI2PK
log_info "Fetching records that need backfill..."

# Use pagination to handle arbitrarily large tables
RECORDS_JSON=$(MSYS_NO_PATHCONV=1 aws dynamodb scan \
  --table-name "${TABLE_NAME}" \
  --region "${REGION}" \
  --filter-expression "begins_with(PK, :pk) AND SK = :sk AND attribute_not_exists(GSI2PK)" \
  --expression-attribute-values '{":pk":{"S":"LICENSE#"},":sk":{"S":"DETAILS"}}' \
  --projection-expression "PK,SK,licenseKey" \
  --output json)

# Parse records using Node.js (no Python per repo conventions)
ITEMS=$(node -e "
  const data = JSON.parse(process.argv[1]);
  const items = data.Items || [];
  items.forEach(item => {
    const pk = item.PK?.S || '';
    const sk = item.SK?.S || '';
    const key = item.licenseKey?.S || '';
    // Tab-separated: PK, SK, licenseKey
    console.log(pk + '\t' + sk + '\t' + key);
  });
" "${RECORDS_JSON}")

# ── Step 4: Process each record ──────────────────────────────
UPDATED=0
SKIPPED=0
ERRORS=0

while IFS=$'\t' read -r PK SK LICENSE_KEY; do
  # Skip empty lines
  [[ -z "${PK}" ]] && continue

  # Validate licenseKey exists
  if [[ -z "${LICENSE_KEY}" ]]; then
    log_skip "${PK} — no licenseKey attribute, cannot derive GSI2PK"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Truncate key for display (show first 20 chars)
  KEY_SHORT="${LICENSE_KEY:0:20}..."
  GSI2PK_VALUE="LICENSE_KEY#${LICENSE_KEY}"

  if $DRY_RUN; then
    log_info "[DRY-RUN] Would update ${PK}"
    log_info "  GSI2PK = LICENSE_KEY#${KEY_SHORT}"
    log_info "  GSI2SK = LICENSE#DETAILS"
    UPDATED=$((UPDATED + 1))
  else
    # Conditional update: only if GSI2PK doesn't exist (idempotent)
    if MSYS_NO_PATHCONV=1 aws dynamodb update-item \
      --table-name "${TABLE_NAME}" \
      --region "${REGION}" \
      --key "{\"PK\":{\"S\":\"${PK}\"},\"SK\":{\"S\":\"${SK}\"}}" \
      --update-expression "SET GSI2PK = :gsi2pk, GSI2SK = :gsi2sk" \
      --condition-expression "attribute_not_exists(GSI2PK)" \
      --expression-attribute-values "{\":gsi2pk\":{\"S\":\"${GSI2PK_VALUE}\"},\":gsi2sk\":{\"S\":\"LICENSE#DETAILS\"}}" \
      2>/dev/null; then
      log_ok "Updated ${PK} — GSI2PK = LICENSE_KEY#${KEY_SHORT}"
      UPDATED=$((UPDATED + 1))
    else
      log_warn "Skipped ${PK} — condition check failed (already has GSI2PK or item changed)"
      SKIPPED=$((SKIPPED + 1))
    fi
  fi
done <<< "${ITEMS}"

# ── Step 5: Summary ──────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
if $DRY_RUN; then
  echo " DRY-RUN COMPLETE"
else
  echo " EXECUTION COMPLETE"
fi
echo " Updated:  ${UPDATED}"
echo " Skipped:  ${SKIPPED}"
echo " Errors:   ${ERRORS}"
echo "═══════════════════════════════════════════════════════════"

# ── Step 6: Post-execution verification (live mode only) ─────
if ! $DRY_RUN && [[ "${UPDATED}" -gt 0 ]]; then
  echo ""
  log_info "Verifying backfill..."
  sleep 2  # Brief pause for GSI propagation

  POST_COUNT=$(MSYS_NO_PATHCONV=1 aws dynamodb scan \
    --table-name "${TABLE_NAME}" \
    --region "${REGION}" \
    --filter-expression "begins_with(PK, :pk) AND SK = :sk AND attribute_exists(GSI2PK)" \
    --expression-attribute-values '{":pk":{"S":"LICENSE#"},":sk":{"S":"DETAILS"}}' \
    --select "COUNT" \
    --query "Count" \
    --output text | sum_numbers)

  log_info "License records with GSI2PK after backfill: ${POST_COUNT} / ${TOTAL_COUNT}"

  if [[ "${POST_COUNT}" -eq "${TOTAL_COUNT}" ]]; then
    log_ok "All license records now have GSI2PK. Backfill successful."
  else
    REMAINING=$((TOTAL_COUNT - POST_COUNT))
    log_warn "${REMAINING} records still missing GSI2PK (may lack licenseKey attribute)."
  fi
fi
