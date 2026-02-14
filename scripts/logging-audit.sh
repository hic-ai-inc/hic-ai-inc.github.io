#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_ROOT="${1:-$REPO_ROOT}"

if [[ ! -d "$TARGET_ROOT" ]]; then
  echo "ERROR: Target path does not exist: $TARGET_ROOT" >&2
  exit 1
fi

timestamp() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

collect_js_files() {
  find "$TARGET_ROOT" \
    \( -path '*/.git/*' -o -path '*/node_modules/*' -o -path '*/dist/*' -o -path '*/coverage/*' -o -path '*/.next/*' -o -path '*/build/*' -o -path '*/deployment-logs/*' -o -path '*/.hic/*' -o -path '*/.tmp/*' \) -prune -o \
    -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.cjs' \) -print
}

print_header() {
  echo
  echo "================================================================"
  echo "$1"
  echo "================================================================"
}

TMP_ALL_FILES="$(mktemp)"
TMP_ROUTE_STATS="$(mktemp)"
trap 'rm -f "$TMP_ALL_FILES" "$TMP_ROUTE_STATS"' EXIT

collect_js_files | sort > "$TMP_ALL_FILES"
TOTAL_FILES="$(wc -l < "$TMP_ALL_FILES" | tr -d ' ')"

print_header "Logging Audit"
echo "generated_at_utc: $(timestamp)"
echo "target_root: $TARGET_ROOT"
echo "scanned_js_files: $TOTAL_FILES"

if [[ "$TOTAL_FILES" -eq 0 ]]; then
  echo
  echo "No JavaScript files found in target."
  exit 0
fi

LOGGER_MATCHES="$(xargs -r grep -Eho 'logger\.(info|warn|error|debug)' < "$TMP_ALL_FILES" | wc -l | tr -d ' ')"
CONSOLE_MATCHES="$(xargs -r grep -Eho 'console\.(log|info|warn|error|debug)' < "$TMP_ALL_FILES" | wc -l | tr -d ' ')"
HICLOG_MATCHES="$(xargs -r grep -Eho '(new HicLog|require\([^)]*hic-log[^)]*\)|from ["\x27][^"\x27]*hic-log[^"\x27]*["\x27])' < "$TMP_ALL_FILES" | wc -l | tr -d ' ')"

FILES_WITH_LOGGER="$(xargs -r grep -El 'logger\.(info|warn|error|debug)' < "$TMP_ALL_FILES" | wc -l | tr -d ' ')"
FILES_WITH_CONSOLE="$(xargs -r grep -El 'console\.(log|info|warn|error|debug)' < "$TMP_ALL_FILES" | wc -l | tr -d ' ')"

print_header "1) Global Logging Footprint"
echo "logger_calls_total: $LOGGER_MATCHES"
echo "console_calls_total: $CONSOLE_MATCHES"
echo "hiclog_references_total: $HICLOG_MATCHES"
echo "files_with_logger_calls: $FILES_WITH_LOGGER"
echo "files_with_console_calls: $FILES_WITH_CONSOLE"

print_header "2) API Endpoint Coverage (plg-website/src/app/api/**/route.js)"

API_DIR="$TARGET_ROOT/plg-website/src/app/api"
if [[ ! -d "$API_DIR" ]]; then
  echo "API directory not found at: $API_DIR"
else
  find "$API_DIR" -type f -name 'route.js' | sort | while read -r file; do
    logs="$(grep -Eo 'logger\.(info|warn|error|debug)|console\.(log|info|warn|error|debug)' "$file" | wc -l | tr -d ' ')"
    responses="$(grep -Eo 'NextResponse\.(json|redirect)|new Response\(|Response\.json\(' "$file" | wc -l | tr -d ' ')"
    returns="$(grep -Eo '\breturn\b' "$file" | wc -l | tr -d ' ')"
    printf "%s|%s|%s|%s\n" "$logs" "$responses" "$returns" "$file" >> "$TMP_ROUTE_STATS"
  done

  if [[ ! -s "$TMP_ROUTE_STATS" ]]; then
    echo "No route.js files found under $API_DIR"
  else
    echo "logs|responses|returns|file"
    sort -t '|' -k1,1n -k2,2n "$TMP_ROUTE_STATS"

    echo
    echo "-- likely gaps (logs=0, responses>0) --"
    awk -F'|' '$1 == 0 && $2 > 0 { print $0 }' "$TMP_ROUTE_STATS" || true

    echo
    echo "-- thin coverage (logs<=1, responses>=3) --"
    awk -F'|' '$1 <= 1 && $2 >= 3 { print $0 }' "$TMP_ROUTE_STATS" || true
  fi
fi

print_header "3) Console Logging Locations"
xargs -r grep -En 'console\.(log|info|warn|error|debug)' < "$TMP_ALL_FILES" || true

print_header "4) Potential Sensitive-Data Log Patterns"
xargs -r grep -Ein '(logger\.|console\.).*(token|authorization|bearer|password|secret|api[_-]?key|cookie|session)' < "$TMP_ALL_FILES" || true

print_header "5) Suggested Next Actions"
echo "- Replace raw console logging in API/auth/licensing paths with structured logger usage."
echo "- Ensure every API route has at least: request context, decision point, and non-2xx response logs."
echo "- Add a contract-level test to prevent regression in logging coverage for critical endpoints."
echo "- Redact/avoid sensitive fields in all logs; log booleans or prefixes only."
