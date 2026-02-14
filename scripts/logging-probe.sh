#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

BASE_URL="${BASE_URL:-http://localhost:3000}"
AUTH_TOKEN="${AUTH_TOKEN:-}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-12}"
DRY_RUN="0"
PROBES_FILTER=""
OUT_DIR="${OUT_DIR:-$REPO_ROOT/.tmp/logging-probe}"
LOG_GROUP="${LOG_GROUP:-}"

usage() {
  cat <<'EOF'
Usage: scripts/logging-probe.sh [options]

Runs safe probe requests against key API endpoints to generate request/response
telemetry and provide a CloudWatch Logs Insights query template.

Options:
  --base-url <url>         Base URL (default: $BASE_URL or http://localhost:3000)
  --auth-token <token>     Bearer token for authenticated probes
  --timeout <seconds>      Request timeout (default: 12)
  --filter <name-fragment> Run only probes whose name contains this fragment
  --out-dir <path>         Output directory for probe artifacts
  --log-group <name>       Optional CloudWatch log group hint for printed commands
  --dry-run                Print requests without sending
  --help                   Show this help

Environment variables:
  BASE_URL, AUTH_TOKEN, TIMEOUT_SECONDS, OUT_DIR, LOG_GROUP

Examples:
  scripts/logging-probe.sh --base-url http://localhost:3000
  scripts/logging-probe.sh --base-url https://dev.example.com --auth-token "$TOKEN"
  scripts/logging-probe.sh --filter heartbeat --dry-run
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      BASE_URL="$2"
      shift 2
      ;;
    --auth-token)
      AUTH_TOKEN="$2"
      shift 2
      ;;
    --timeout)
      TIMEOUT_SECONDS="$2"
      shift 2
      ;;
    --filter)
      PROBES_FILTER="$2"
      shift 2
      ;;
    --out-dir)
      OUT_DIR="$2"
      shift 2
      ;;
    --log-group)
      LOG_GROUP="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN="1"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

ts_utc() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

timestamp_tag() {
  date -u +"%Y%m%dT%H%M%SZ"
}

rand_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 6
  else
    printf '%06x%06x\n' "$RANDOM" "$RANDOM"
  fi
}

PROBE_ID="probe-$(timestamp_tag)-$(rand_hex)"
mkdir -p "$OUT_DIR"
RESULTS_FILE="$OUT_DIR/${PROBE_ID}-results.tsv"
SUMMARY_FILE="$OUT_DIR/${PROBE_ID}-summary.txt"

COMMON_HEADERS=(
  -H "Content-Type: application/json"
  -H "X-HIC-Probe-Id: $PROBE_ID"
  -H "X-Correlation-Id: $PROBE_ID"
  -H "X-Request-Id: $PROBE_ID"
)

if [[ -n "$AUTH_TOKEN" ]]; then
  COMMON_HEADERS+=( -H "Authorization: Bearer $AUTH_TOKEN" )
fi

declare -a PROBE_NAMES=()
declare -a PROBE_METHODS=()
declare -a PROBE_PATHS=()
declare -a PROBE_BODIES=()

add_probe() {
  PROBE_NAMES+=("$1")
  PROBE_METHODS+=("$2")
  PROBE_PATHS+=("$3")
  PROBE_BODIES+=("$4")
}

# Safe probes: intended to produce 4xx/validation/auth branches without mutating state.
add_probe "heartbeat-missing-fingerprint" "POST" "/api/license/heartbeat" '{"licenseKey":"MOUSE-AAAA-BBBB-CCCC-DDDD"}'
add_probe "validate-bad-format" "POST" "/api/license/validate" '{"licenseKey":"INVALID"}'
add_probe "activate-missing-fields" "POST" "/api/license/activate" '{"licenseKey":"INVALID"}'
add_probe "deactivate-missing-fields" "POST" "/api/license/deactivate" '{}'
add_probe "check-missing-key" "GET" "/api/license/check" ''
add_probe "trial-init-minimal" "POST" "/api/license/trial/init" '{}'
add_probe "checkout-verify-missing-session" "GET" "/api/checkout/verify" ''
add_probe "checkout-invalid-plan" "POST" "/api/checkout" '{"plan":"not-a-plan"}'
add_probe "portal-status-no-auth" "GET" "/api/portal/status" ''
add_probe "portal-devices-no-auth" "GET" "/api/portal/devices" ''
add_probe "portal-license-no-auth" "GET" "/api/portal/license" ''
add_probe "portal-team-no-auth" "GET" "/api/portal/team" ''

run_probe() {
  local idx="$1"
  local name="${PROBE_NAMES[$idx]}"
  local method="${PROBE_METHODS[$idx]}"
  local path="${PROBE_PATHS[$idx]}"
  local body="${PROBE_BODIES[$idx]}"
  local url="${BASE_URL%/}${path}"
  local body_file="$OUT_DIR/${PROBE_ID}-${name}.body.txt"

  if [[ -n "$PROBES_FILTER" && "$name" != *"$PROBES_FILTER"* ]]; then
    return 0
  fi

  if [[ "$DRY_RUN" == "1" ]]; then
    echo "DRY-RUN | $method $url | probe=$name"
    printf "%s\t%s\t%s\t%s\t%s\n" "$name" "$method" "$url" "DRY_RUN" "0" >> "$RESULTS_FILE"
    return 0
  fi

  local response_meta
  if [[ "$method" == "GET" ]]; then
    response_meta="$(curl -sS -o "$body_file" -m "$TIMEOUT_SECONDS" -w '%{http_code}|%{time_total}' -X "$method" "$url" "${COMMON_HEADERS[@]}")"
  else
    response_meta="$(curl -sS -o "$body_file" -m "$TIMEOUT_SECONDS" -w '%{http_code}|%{time_total}' -X "$method" "$url" "${COMMON_HEADERS[@]}" --data "$body")"
  fi

  local http_code="${response_meta%%|*}"
  local total_time="${response_meta##*|}"

  echo "$name | $method | $path | status=$http_code | time=${total_time}s"
  printf "%s\t%s\t%s\t%s\t%s\n" "$name" "$method" "$path" "$http_code" "$total_time" >> "$RESULTS_FILE"
}

echo "Logging probe started"
echo "- generated_at_utc: $(ts_utc)"
echo "- base_url: $BASE_URL"
echo "- probe_id: $PROBE_ID"
echo "- output_dir: $OUT_DIR"
echo

printf "probe\tmethod\tpath\thttp_code\ttime_seconds\n" > "$RESULTS_FILE"

for i in "${!PROBE_NAMES[@]}"; do
  run_probe "$i"
done

total_runs="$(($(wc -l < "$RESULTS_FILE") - 1))"
fail_5xx="$(awk -F'\t' 'NR>1 && $4 ~ /^5/ {count++} END {print count+0}' "$RESULTS_FILE")"

{
  echo "logging_probe_summary"
  echo "generated_at_utc: $(ts_utc)"
  echo "probe_id: $PROBE_ID"
  echo "base_url: $BASE_URL"
  echo "total_probes_executed: $total_runs"
  echo "http_5xx_count: $fail_5xx"
  echo
  echo "results_file: $RESULTS_FILE"
  echo "per-probe-response-bodies: $OUT_DIR/${PROBE_ID}-<probe>.body.txt"
} > "$SUMMARY_FILE"

echo
cat "$SUMMARY_FILE"

echo
echo "CloudWatch Logs Insights query template:"
cat <<EOF
fields @timestamp, @message, level, service, event, correlationId, requestId
| filter correlationId = "$PROBE_ID"
    or requestId = "$PROBE_ID"
    or @message like /$PROBE_ID/
| sort @timestamp desc
| limit 200
EOF

if [[ -n "$LOG_GROUP" ]]; then
  echo
  echo "Optional AWS CLI skeleton (fill start/end timestamps):"
  cat <<EOF
aws logs start-query \\
  --log-group-name "$LOG_GROUP" \\
  --start-time <unix_start> \\
  --end-time <unix_end> \\
  --query-string 'fields @timestamp, @message, level, service, event, correlationId, requestId | filter correlationId = "$PROBE_ID" or requestId = "$PROBE_ID" or @message like /$PROBE_ID/ | sort @timestamp desc | limit 200'
EOF
fi

echo
echo "Done."
