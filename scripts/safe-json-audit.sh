#!/usr/bin/env bash
# ================================================================
# safe-json-audit.sh — Bare JSON.parse() Exposure Audit
# ================================================================
# Scans the repo for bare JSON.parse() calls that are NOT guarded
# by the HIC safeJsonParse() / tryJsonParse() utilities from
# dm/layers/base/src/safe-json-parse.js.
#
# safeJsonParse provides:
#   - Input type validation
#   - Byte-size limits (DoS protection)
#   - Key-count limits (complexity bombs)
#   - Depth limits (stack overflow / nested payloads)
#   - Source labelling for debuggability
#
# Every bare JSON.parse() of external/untrusted input should be
# replaced with safeJsonParse() or tryJsonParse().
#
# Usage:
#   scripts/safe-json-audit.sh [target_root]
#
# CWE references:
#   CWE-20   Improper Input Validation
#   CWE-400  Uncontrolled Resource Consumption
#   CWE-502  Deserialization of Untrusted Data
# ================================================================

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

# Standard exclusion flags for grep -r (non-source directories)
GREP_EXCLUDES=(
  --exclude-dir=.git
  --exclude-dir=node_modules
  --exclude-dir=dist
  --exclude-dir=coverage
  --exclude-dir=.next
  --exclude-dir=build
  --exclude-dir=deployment-logs
  --exclude-dir=.hic
  --exclude-dir=.tmp
)
GREP_INCLUDES=(--include='*.js' --include='*.mjs' --include='*.cjs')

# Safe grep wrapper: returns empty on zero matches instead of failing
rgrep() {
  grep -r "${GREP_INCLUDES[@]}" "${GREP_EXCLUDES[@]}" "$@" || true
}

print_header() {
  echo
  echo "================================================================"
  echo "$1"
  echo "================================================================"
}

# ----------------------------------------------------------------
# Detection patterns
# ----------------------------------------------------------------
BARE_JSON_PARSE='JSON\.parse\('

# Pattern confirming a file already imports/uses safe alternatives
SAFE_GUARD='safeJsonParse|tryJsonParse|safe-json-parse'

# ----------------------------------------------------------------
# Collect file counts
# ----------------------------------------------------------------
TOTAL_FILES="$(find "$TARGET_ROOT" \
  \( -path '*/.git/*' -o -path '*/node_modules/*' -o -path '*/dist/*' \
     -o -path '*/coverage/*' -o -path '*/.next/*' -o -path '*/build/*' \
     -o -path '*/deployment-logs/*' -o -path '*/.hic/*' -o -path '*/.tmp/*' \
     -o -path '*/ci-logs*' \) -prune -o \
  -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.cjs' \) -print \
  | wc -l | tr -d ' ')"

print_header "JSON.parse() Safety Audit (CWE-20/400/502)"
echo "generated_at_utc: $(timestamp)"
echo "target_root: $TARGET_ROOT"
echo "scanned_js_files: $TOTAL_FILES"
echo "guarded_by: dm/layers/base/src/safe-json-parse.js (safeJsonParse, tryJsonParse)"

if [[ "$TOTAL_FILES" -eq 0 ]]; then
  echo
  echo "No JavaScript files found in target."
  exit 0
fi

# ----------------------------------------------------------------
# 1) Count files with safe imports vs bare JSON.parse
# ----------------------------------------------------------------
TMP_SAFE="$(mktemp)"
TMP_BARE="$(mktemp)"
TMP_UNGUARDED="$(mktemp)"
TMP_MIXED="$(mktemp)"
trap 'rm -f "$TMP_SAFE" "$TMP_BARE" "$TMP_UNGUARDED" "$TMP_MIXED"' EXIT

# Files that import safe JSON utilities
rgrep -El "$SAFE_GUARD" "$TARGET_ROOT" > "$TMP_SAFE"
FILES_WITH_SAFE_IMPORT="$(wc -l < "$TMP_SAFE" | tr -d ' ')"

# Files with bare JSON.parse
rgrep -El "$BARE_JSON_PARSE" "$TARGET_ROOT" > "$TMP_BARE"
FILES_WITH_BARE_PARSE="$(wc -l < "$TMP_BARE" | tr -d ' ')"

TOTAL_BARE_CALLS="$(rgrep -Eho "$BARE_JSON_PARSE" "$TARGET_ROOT" | wc -l | tr -d ' ')"
TOTAL_SAFE_CALLS="$(rgrep -Eho 'safeJsonParse\(|tryJsonParse\(' "$TARGET_ROOT" | wc -l | tr -d ' ')"

# Files with bare JSON.parse but NO safe import
while IFS= read -r file; do
  if ! grep -qE 'safeJsonParse|tryJsonParse|safe-json-parse' "$file" 2>/dev/null; then
    echo "$file"
  fi
done < "$TMP_BARE" > "$TMP_UNGUARDED"

FULLY_UNGUARDED_FILES="$(wc -l < "$TMP_UNGUARDED" | tr -d ' ')"

# Files that import safe utilities BUT still have bare JSON.parse calls
while IFS= read -r file; do
  if grep -qE 'safeJsonParse|tryJsonParse|safe-json-parse' "$file" 2>/dev/null; then
    echo "$file"
  fi
done < "$TMP_BARE" > "$TMP_MIXED"

MIXED_FILES="$(wc -l < "$TMP_MIXED" | tr -d ' ')"

if [[ -s "$TMP_UNGUARDED" ]]; then
  UNGUARDED_BARE_CALLS=0
  while IFS= read -r file; do
    count="$(grep -Eho "$BARE_JSON_PARSE" "$file" 2>/dev/null | wc -l | tr -d ' ')"
    UNGUARDED_BARE_CALLS=$((UNGUARDED_BARE_CALLS + count))
  done < "$TMP_UNGUARDED"
else
  UNGUARDED_BARE_CALLS=0
fi

print_header "1) Global JSON Parsing Safety Footprint"
echo "files_with_safeJsonParse_import: $FILES_WITH_SAFE_IMPORT"
echo "safe_parse_calls_total: $TOTAL_SAFE_CALLS"
echo "files_with_bare_JSON_parse: $FILES_WITH_BARE_PARSE"
echo "bare_JSON_parse_calls_total: $TOTAL_BARE_CALLS"
echo "files_with_bare_parse_and_NO_safe_import: $FULLY_UNGUARDED_FILES"
echo "bare_calls_in_fully_unguarded_files: $UNGUARDED_BARE_CALLS"
echo "files_with_BOTH_safe_import_and_bare_parse: $MIXED_FILES"

# ----------------------------------------------------------------
# 2) Categorize unguarded files by directory area
# ----------------------------------------------------------------
print_header "2) Fully Unguarded Files by Area"

if [[ ! -s "$TMP_UNGUARDED" ]]; then
  echo "(none — all files with JSON.parse also import safe utilities)"
else
  while IFS= read -r file; do
    rel="${file#"$TARGET_ROOT"/}"
    case "$rel" in
      plg-website/src/app/api/*)    echo "plg-website/src/app/api (API routes)" ;;
      plg-website/src/lib/*)        echo "plg-website/src/lib (shared libraries)" ;;
      plg-website/src/*)            echo "plg-website/src (other source)" ;;
      plg-website/infrastructure/*) echo "plg-website/infrastructure (lambdas/IaC)" ;;
      plg-website/scripts/*)        echo "plg-website/scripts" ;;
      plg-website/__tests__/*)      echo "plg-website/__tests__ (tests)" ;;
      dm/layers/*)                  echo "dm/layers (Lambda layers)" ;;
      dm/utils/*)                   echo "dm/utils (build utilities)" ;;
      dm/facade/*)                  echo "dm/facade (facade helpers)" ;;
      dm/tests/*)                   echo "dm/tests (dm tests)" ;;
      dm/analysis/*)                echo "dm/analysis (analysis tools)" ;;
      scripts/*)                    echo "scripts (repo-level)" ;;
      mcp/*)                        echo "mcp (MCP tools)" ;;
      *)                            echo "other" ;;
    esac
  done < "$TMP_UNGUARDED" | sort | uniq -c | sort -rn | while read -r count area; do
    printf "  %-50s %d file(s)\n" "$area" "$count"
  done
fi

# ----------------------------------------------------------------
# 3) Detailed listing: bare JSON.parse in fully unguarded files
# ----------------------------------------------------------------
print_header "3) Bare JSON.parse() in Fully Unguarded Files"

if [[ -s "$TMP_UNGUARDED" ]]; then
  while IFS= read -r file; do
    rel="${file#"$TARGET_ROOT"/}"
    grep -En "$BARE_JSON_PARSE" "$file" 2>/dev/null | while IFS= read -r match; do
      echo "$rel:$match"
    done
  done < "$TMP_UNGUARDED"
  echo
  echo "total_unguarded_files: $FULLY_UNGUARDED_FILES"
  echo "total_bare_calls_in_unguarded: $UNGUARDED_BARE_CALLS"
else
  echo "(none)"
fi

# ----------------------------------------------------------------
# 4) Mixed files: have safe import BUT also use bare JSON.parse
# ----------------------------------------------------------------
print_header "4) Mixed Files (import safeJsonParse but still use bare JSON.parse)"
echo "-- These files partially adopted safe parsing but still have bare calls --"

if [[ -s "$TMP_MIXED" ]]; then
  while IFS= read -r file; do
    rel="${file#"$TARGET_ROOT"/}"
    bare_count="$(grep -Ec "$BARE_JSON_PARSE" "$file" 2>/dev/null || true)"
    safe_count="$(grep -Ec 'safeJsonParse\(|tryJsonParse\(' "$file" 2>/dev/null || true)"
    echo "  $rel  (bare=$bare_count, safe=$safe_count)"
  done < "$TMP_MIXED"
else
  echo "  (none)"
fi

# ----------------------------------------------------------------
# 5) High-risk patterns: external input flowing into JSON.parse
# ----------------------------------------------------------------
print_header "5) High-Risk Patterns (external/untrusted input -> JSON.parse)"
echo "-- Request body, event body, SQS/SNS messages parsed with bare JSON.parse --"

rgrep -En 'JSON\.parse\((req|request|event)\.(body|Body|message|Message|payload|SecretString)' "$TARGET_ROOT"

echo
echo "-- JSON.parse of record.body / record.Sns.Message (Lambda event sources) --"
rgrep -En 'JSON\.parse\(record\.(body|Body|Sns\.Message|sns\.message)' "$TARGET_ROOT"

echo
echo "-- JSON.parse of response/fetch data --"
rgrep -En 'JSON\.parse\((response|res|data|text|body|msg\.(Body|body|Message))' "$TARGET_ROOT"

# ----------------------------------------------------------------
# 6) Files already fully guarded (for completeness)
# ----------------------------------------------------------------
print_header "6) Files Using safeJsonParse/tryJsonParse (good)"
if [[ -s "$TMP_SAFE" ]]; then
  while IFS= read -r file; do
    echo "  ${file#"$TARGET_ROOT"/}"
  done < "$TMP_SAFE"
else
  echo "  (none)"
fi

# ----------------------------------------------------------------
# Summary & next steps
# ----------------------------------------------------------------
print_header "7) Suggested Next Actions"
echo "- Replace bare JSON.parse() of external input with safeJsonParse() or tryJsonParse()."
echo "- API routes, webhook handlers, and Lambda event processors are highest priority."
echo "- Test files using JSON.parse on known literals are low risk but should still migrate."
echo "- Import from: import { safeJsonParse, tryJsonParse } from 'dm/layers/base/src/index.js';"
echo "- For non-throwing usage: const { ok, value, error } = tryJsonParse(input, { source: 'label' });"
echo "- Reference: CWE-20  (https://cwe.mitre.org/data/definitions/20.html)"
echo "- Reference: CWE-400 (https://cwe.mitre.org/data/definitions/400.html)"
echo "- Reference: CWE-502 (https://cwe.mitre.org/data/definitions/502.html)"
