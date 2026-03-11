#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Keygen 4-Policy Migration — Shared Configuration
# ═══════════════════════════════════════════════════════════════
#
# Sourced by all numbered migration scripts. Provides:
#   - Public identifiers (account, product)
#   - Runtime token loading from .env.local (never hardcoded)
#   - Keygen API helpers (GET, PATCH, POST, PUT)
#   - JSON manipulation helpers (Node.js — no Python)
#   - Path resolution
#
# Security: KEYGEN_PRODUCT_TOKEN is loaded at runtime from
# plg-website/.env.local and never written to disk or echoed.
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

# ── Public Identifiers (not secrets — hardcoded in source) ────
KEYGEN_ACCOUNT_ID="868fccd3-676d-4b9d-90ab-c86ae54419f6"
KEYGEN_PRODUCT_ID="4abf1f35-fc54-45ab-8499-10012073ac2d"
KEYGEN_API_BASE="https://api.keygen.sh/v1/accounts/${KEYGEN_ACCOUNT_ID}"

# Duration constants (seconds)
DURATION_MONTHLY=3801600   # 44 days = (30 + 14 grace) × 86400
DURATION_ANNUAL=32745600   # 379 days = (365 + 14 grace) × 86400

# ── Path Resolution ───────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PLG_DIR="${REPO_ROOT}/plg-website"
SNAPSHOTS_DIR="${SCRIPT_DIR}/snapshots"
ENV_LOCAL="${PLG_DIR}/.env.local"

# Amplify env update script (for SSM parameter management)
AMPLIFY_ENV_SCRIPT="${PLG_DIR}/scripts/update-amplify-env.sh"

mkdir -p "${SNAPSHOTS_DIR}"

# ── Token Loading ─────────────────────────────────────────────
load_keygen_token() {
  if [[ ! -f "${ENV_LOCAL}" ]]; then
    echo "ERROR: ${ENV_LOCAL} not found" >&2
    echo "  Ensure plg-website/.env.local exists with KEYGEN_PRODUCT_TOKEN" >&2
    exit 1
  fi
  KEYGEN_TOKEN=$(grep '^KEYGEN_PRODUCT_TOKEN=' "${ENV_LOCAL}" | head -1 | cut -d'=' -f2- | tr -d '\r')
  if [[ -z "${KEYGEN_TOKEN:-}" ]]; then
    echo "ERROR: KEYGEN_PRODUCT_TOKEN not found in ${ENV_LOCAL}" >&2
    exit 1
  fi
  export KEYGEN_TOKEN
  echo "[config] Token loaded from .env.local"
}

# ── Policy ID Loading ─────────────────────────────────────────
load_current_policy_ids() {
  POLICY_ID_INDIVIDUAL=$(grep '^KEYGEN_POLICY_ID_INDIVIDUAL=' "${ENV_LOCAL}" | head -1 | cut -d'=' -f2- | tr -d '\r' || echo "")
  POLICY_ID_BUSINESS=$(grep '^KEYGEN_POLICY_ID_BUSINESS=' "${ENV_LOCAL}" | head -1 | cut -d'=' -f2- | tr -d '\r' || echo "")

  if [[ -z "${POLICY_ID_INDIVIDUAL}" || -z "${POLICY_ID_BUSINESS}" ]]; then
    echo "ERROR: Could not load current policy IDs from ${ENV_LOCAL}" >&2
    echo "  Expected KEYGEN_POLICY_ID_INDIVIDUAL and KEYGEN_POLICY_ID_BUSINESS" >&2
    exit 1
  fi
  export POLICY_ID_INDIVIDUAL POLICY_ID_BUSINESS
  echo "[config] Individual policy: ${POLICY_ID_INDIVIDUAL}"
  echo "[config] Business policy:   ${POLICY_ID_BUSINESS}"
}

# Load new annual policy IDs (written by 03-create-annual-policies.sh)
load_annual_policy_ids() {
  local ids_file="${SNAPSHOTS_DIR}/annual-policy-ids.env"
  if [[ ! -f "${ids_file}" ]]; then
    echo "ERROR: ${ids_file} not found" >&2
    echo "  Run 03-create-annual-policies.sh first" >&2
    exit 1
  fi
  # shellcheck source=/dev/null
  source "${ids_file}"
  if [[ -z "${POLICY_ID_INDIVIDUAL_ANNUAL:-}" || -z "${POLICY_ID_BUSINESS_ANNUAL:-}" ]]; then
    echo "ERROR: Annual policy IDs not set in ${ids_file}" >&2
    exit 1
  fi
  export POLICY_ID_INDIVIDUAL_ANNUAL POLICY_ID_BUSINESS_ANNUAL
  echo "[config] Individual Annual policy: ${POLICY_ID_INDIVIDUAL_ANNUAL}"
  echo "[config] Business Annual policy:   ${POLICY_ID_BUSINESS_ANNUAL}"
}

# ── Keygen API Helpers ────────────────────────────────────────
# All helpers return raw JSON. Caller is responsible for formatting/parsing.
# Uses -f (fail silently on HTTP errors) and -s (silent mode).
# On error, curl returns non-zero which triggers set -e.

# All API helpers write response to an output file (arg: $2 or $3).
# This avoids stdin/pipe issues in Git Bash/MINGW on Windows.

keygen_get() {
  local path="$1"
  local outfile="$2"
  curl -sf --max-time 30 -X GET "${KEYGEN_API_BASE}${path}" \
    -H 'Accept: application/vnd.api+json' \
    -H "Authorization: Bearer ${KEYGEN_TOKEN}" \
    -o "${outfile}"
}

keygen_patch() {
  local path="$1"
  local body="$2"
  local outfile="$3"
  curl -sf --max-time 30 -X PATCH "${KEYGEN_API_BASE}${path}" \
    -H 'Content-Type: application/vnd.api+json' \
    -H 'Accept: application/vnd.api+json' \
    -H "Authorization: Bearer ${KEYGEN_TOKEN}" \
    -d "${body}" \
    -o "${outfile}"
}

keygen_post() {
  local path="$1"
  local body="$2"
  local outfile="$3"
  curl -sf --max-time 30 -X POST "${KEYGEN_API_BASE}${path}" \
    -H 'Content-Type: application/vnd.api+json' \
    -H 'Accept: application/vnd.api+json' \
    -H "Authorization: Bearer ${KEYGEN_TOKEN}" \
    -d "${body}" \
    -o "${outfile}"
}

keygen_put() {
  local path="$1"
  local body="$2"
  local outfile="$3"
  curl -sf --max-time 30 -X PUT "${KEYGEN_API_BASE}${path}" \
    -H 'Content-Type: application/vnd.api+json' \
    -H 'Accept: application/vnd.api+json' \
    -H "Authorization: Bearer ${KEYGEN_TOKEN}" \
    -d "${body}" \
    -o "${outfile}"
}

# ── JSON Helpers (Node.js) ────────────────────────────────────

# Pretty-print a JSON file in-place
# Usage: json_format <file>
json_format() {
  local file="$1"
  node -e "
    const fs = require('fs');
    const raw = fs.readFileSync(process.argv[1], 'utf8').trim();
    fs.writeFileSync(process.argv[1], JSON.stringify(JSON.parse(raw), null, 2) + '\n');
  " "${file}"
}

# Extract a dot-delimited field from a JSON file
# Usage: json_field <file> <dot.path>
json_field() {
  local file="$1"
  local field_path="$2"
  node -e "
    const fs = require('fs');
    const obj = JSON.parse(fs.readFileSync(process.argv[1], 'utf8').trim());
    const keys = process.argv[2].split('.');
    let val = obj;
    for (const k of keys) {
      if (val == null) { console.error('null at key: ' + k); process.exit(1); }
      val = val[k];
    }
    if (val === undefined) { console.error('undefined: ' + process.argv[2]); process.exit(1); }
    process.stdout.write(typeof val === 'object' ? JSON.stringify(val) : String(val));
  " "${file}" "${field_path}"
}

# ── Logging ───────────────────────────────────────────────────
log_step() { echo ""; echo "═══ $1 ═══"; }
log_info() { echo "[INFO] $1"; }
log_ok()   { echo "[OK]   $1"; }
log_warn() { echo "[WARN] $1"; }
log_err()  { echo "[ERR]  $1" >&2; }

echo "[config] Keygen migration config loaded"
echo "[config] Account:   ${KEYGEN_ACCOUNT_ID}"
echo "[config] Product:   ${KEYGEN_PRODUCT_ID}"
echo "[config] Snapshots: ${SNAPSHOTS_DIR}"
