#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

MIN_LOGS_PER_ENDPOINT="${MIN_LOGS_PER_ENDPOINT:-3}"
STRICT_STRUCTURED="${STRICT_STRUCTURED:-1}"

API_ROOT="$REPO_ROOT/plg-website/src/app/api"

if [[ ! -d "$API_ROOT" ]]; then
  echo "ERROR: API directory not found at $API_ROOT" >&2
  exit 1
fi

critical_endpoints=(
  "license/heartbeat/route.js"
  "license/validate/route.js"
  "license/activate/route.js"
  "license/deactivate/route.js"
  "license/check/route.js"
  "license/trial/init/route.js"
  "checkout/route.js"
  "checkout/verify/route.js"
  "portal/status/route.js"
  "portal/devices/route.js"
  "portal/license/route.js"
  "portal/team/route.js"
  "webhooks/stripe/route.js"
  "webhooks/keygen/route.js"
)

failures=0

echo "Logging gate configuration:"
echo "- MIN_LOGS_PER_ENDPOINT=$MIN_LOGS_PER_ENDPOINT"
echo "- STRICT_STRUCTURED=$STRICT_STRUCTURED"
echo "- critical_endpoints=${#critical_endpoints[@]}"
echo

for rel in "${critical_endpoints[@]}"; do
  file="$API_ROOT/$rel"
  if [[ ! -f "$file" ]]; then
    echo "FAIL | missing endpoint file | $file"
    failures=$((failures + 1))
    continue
  fi

  log_calls="$(grep -Eo 'console\.(log|info|warn|error|debug)|logger\.(info|warn|error|debug)' "$file" || true)"
  log_calls="$(printf '%s\n' "$log_calls" | sed '/^$/d' | wc -l | tr -d ' ')"

  structured_refs="$(grep -Eo 'new HicLog|from ["\x27][^"\x27]*hic-log[^"\x27]*["\x27]|logger\.(info|warn|error|debug)' "$file" || true)"
  structured_refs="$(printf '%s\n' "$structured_refs" | sed '/^$/d' | wc -l | tr -d ' ')"

  status="PASS"
  reasons=()

  if [[ "$log_calls" -lt "$MIN_LOGS_PER_ENDPOINT" ]]; then
    status="FAIL"
    reasons+=("log_calls=$log_calls (<$MIN_LOGS_PER_ENDPOINT)")
  fi

  if [[ "$STRICT_STRUCTURED" == "1" && "$structured_refs" -eq 0 ]]; then
    status="FAIL"
    reasons+=("no_structured_logging_ref")
  fi

  if [[ "$status" == "FAIL" ]]; then
    failures=$((failures + 1))
    echo "FAIL | ${reasons[*]} | $file"
  else
    echo "PASS | log_calls=$log_calls structured_refs=$structured_refs | $file"
  fi
done

echo
if [[ "$failures" -gt 0 ]]; then
  echo "Logging gate result: FAIL ($failures failing endpoint checks)"
  exit 1
fi

echo "Logging gate result: PASS"
