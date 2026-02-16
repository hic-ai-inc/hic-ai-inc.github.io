#!/usr/bin/env bash
# ================================================================
# safe-path-audit.sh — CWE-22/23 Path Traversal Exposure Audit
# ================================================================
# Scans the repo for bare path construction (path.join, path.resolve,
# path.normalize, fs.* calls, etc.) that are NOT guarded by the HIC
# safePath() utility from dm/layers/base/src/safe-path.js.
#
# The purpose is to inventory paths that MAY need safePath() wrapping
# before launch. Not every hit is a true positive — build scripts
# and test fixtures using static literals are generally safe — but
# every hit should be reviewed for external-input exposure.
#
# Usage:
#   scripts/safe-path-audit.sh [target_root]
#
# CWE references:
#   CWE-22  Improper Limitation of a Pathname to a Restricted Directory
#   CWE-23  Relative Path Traversal
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
# Patterns that indicate path construction from potentially
# dynamic input (the things safePath() is designed to protect)
# ----------------------------------------------------------------
PATH_CONSTRUCTION_PATTERN='path\.(join|resolve|normalize)\('

# File-system operations that accept a path argument
FS_OPERATION_PATTERN='fs\.(readFileSync|writeFileSync|readFile|writeFile|createReadStream|createWriteStream|accessSync|access|statSync|stat|unlinkSync|unlink|mkdirSync|mkdir|rmdirSync|rmdir|renameSync|rename|copyFileSync|copyFile|realpathSync|realpath|existsSync|exists|openSync|open|readdirSync|readdir)\('

# Pattern confirming a file already imports/uses safePath
SAFEPATH_GUARD='safePath|safe-path'

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

print_header "Path Traversal Safety Audit (CWE-22/23)"
echo "generated_at_utc: $(timestamp)"
echo "target_root: $TARGET_ROOT"
echo "scanned_js_files: $TOTAL_FILES"
echo "guarded_by: dm/layers/base/src/safe-path.js (safePath)"

if [[ "$TOTAL_FILES" -eq 0 ]]; then
  echo
  echo "No JavaScript files found in target."
  exit 0
fi

# ----------------------------------------------------------------
# 1) Global path safety footprint
# ----------------------------------------------------------------
TMP_GUARDED="$(mktemp)"
TMP_UNGUARDED="$(mktemp)"
TMP_PATH_FILES="$(mktemp)"
trap 'rm -f "$TMP_GUARDED" "$TMP_UNGUARDED" "$TMP_PATH_FILES"' EXIT

# Files that import safePath
rgrep -El "$SAFEPATH_GUARD" "$TARGET_ROOT" > "$TMP_GUARDED"
FILES_WITH_SAFEPATH="$(wc -l < "$TMP_GUARDED" | tr -d ' ')"

# Files with path construction
rgrep -El "$PATH_CONSTRUCTION_PATTERN" "$TARGET_ROOT" > "$TMP_PATH_FILES"

# Files with path construction but WITHOUT safePath import
while IFS= read -r file; do
  if ! grep -qE 'safePath|safe-path' "$file" 2>/dev/null; then
    echo "$file"
  fi
done < "$TMP_PATH_FILES" > "$TMP_UNGUARDED"

UNGUARDED_PATH_FILES="$(wc -l < "$TMP_UNGUARDED" | tr -d ' ')"

TOTAL_PATH_CALLS="$(rgrep -Eho "$PATH_CONSTRUCTION_PATTERN" "$TARGET_ROOT" | wc -l | tr -d ' ')"
TOTAL_FS_CALLS="$(rgrep -Eho "$FS_OPERATION_PATTERN" "$TARGET_ROOT" | wc -l | tr -d ' ')"

if [[ -s "$TMP_UNGUARDED" ]]; then
  UNGUARDED_PATH_CALLS=0
  UNGUARDED_FS_CALLS=0
  while IFS= read -r file; do
    count="$(grep -Eho "$PATH_CONSTRUCTION_PATTERN" "$file" 2>/dev/null | wc -l | tr -d ' ')"
    UNGUARDED_PATH_CALLS=$((UNGUARDED_PATH_CALLS + count))
    count="$(grep -Eho "$FS_OPERATION_PATTERN" "$file" 2>/dev/null | wc -l | tr -d ' ')"
    UNGUARDED_FS_CALLS=$((UNGUARDED_FS_CALLS + count))
  done < "$TMP_UNGUARDED"
else
  UNGUARDED_PATH_CALLS=0
  UNGUARDED_FS_CALLS=0
fi

print_header "1) Global Path Safety Footprint"
echo "files_with_safePath_import: $FILES_WITH_SAFEPATH"
echo "total_path_construction_calls: $TOTAL_PATH_CALLS"
echo "total_fs_operation_calls: $TOTAL_FS_CALLS"
echo "files_with_path_ops_but_no_safePath: $UNGUARDED_PATH_FILES"
echo "unguarded_path_construction_calls: $UNGUARDED_PATH_CALLS"
echo "unguarded_fs_operation_calls: $UNGUARDED_FS_CALLS"

# ----------------------------------------------------------------
# 2) Categorize unguarded files by directory area
# ----------------------------------------------------------------
print_header "2) Unguarded Files by Area"

if [[ ! -s "$TMP_UNGUARDED" ]]; then
  echo "(none — all path-constructing files import safePath)"
else
  # Use sort+uniq for portable categorization (no associative arrays)
  TMP_AREAS="$(mktemp)"
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
      dm/tests/*)                   echo "dm/tests (dm tests)" ;;
      dm/analysis/*)                echo "dm/analysis (analysis tools)" ;;
      scripts/*)                    echo "scripts (repo-level)" ;;
      mcp/*)                        echo "mcp (MCP tools)" ;;
      *)                            echo "other" ;;
    esac
  done < "$TMP_UNGUARDED" | sort | uniq -c | sort -rn | while read -r count area; do
    printf "  %-50s %d file(s)\n" "$area" "$count"
  done
  rm -f "$TMP_AREAS"
fi

# ----------------------------------------------------------------
# 3) Detailed listing: unguarded path construction calls
# ----------------------------------------------------------------
print_header "3) Unguarded path.join / path.resolve / path.normalize Calls"

if [[ -s "$TMP_UNGUARDED" ]]; then
  hit_count=0
  while IFS= read -r file; do
    rel="${file#"$TARGET_ROOT"/}"
    grep -En "$PATH_CONSTRUCTION_PATTERN" "$file" 2>/dev/null | while IFS= read -r match; do
      echo "$rel:$match"
    done
    file_hits="$(grep -Ec "$PATH_CONSTRUCTION_PATTERN" "$file" 2>/dev/null || true)"
    hit_count=$((hit_count + file_hits))
  done < "$TMP_UNGUARDED"
  echo
  echo "total_unguarded_files: $UNGUARDED_PATH_FILES"
else
  echo "(none)"
fi

# ----------------------------------------------------------------
# 4) Detailed listing: unguarded fs.* operations
# ----------------------------------------------------------------
print_header "4) Unguarded fs.* Operation Calls"

if [[ -s "$TMP_UNGUARDED" ]]; then
  while IFS= read -r file; do
    rel="${file#"$TARGET_ROOT"/}"
    grep -En "$FS_OPERATION_PATTERN" "$file" 2>/dev/null | while IFS= read -r match; do
      echo "$rel:$match"
    done
  done < "$TMP_UNGUARDED"
  echo
  echo "total_unguarded_files: $UNGUARDED_PATH_FILES"
else
  echo "(none)"
fi

# ----------------------------------------------------------------
# 5) High-risk patterns: user/external input flowing into paths
# ----------------------------------------------------------------
print_header "5) High-Risk Patterns (external input -> path construction)"
echo "-- Files where request params, query strings, or dynamic input flow into path ops --"

rgrep -En '(req\.(params|query|body)|request\.(params|query|body)|searchParams|\.get\(|event\.(path|body|queryString)).*path\.(join|resolve|normalize)' "$TARGET_ROOT"

echo
echo "-- Files with string concatenation into fs operations --"
rgrep -En 'fs\.[a-zA-Z]+\([^)]*\+[^)]*\)' "$TARGET_ROOT"

# ----------------------------------------------------------------
# 6) Files that ARE already guarded (for completeness)
# ----------------------------------------------------------------
print_header "6) Files Already Importing safePath (good)"
if [[ -s "$TMP_GUARDED" ]]; then
  while IFS= read -r file; do
    echo "  ${file#"$TARGET_ROOT"/}"
  done < "$TMP_GUARDED"
else
  echo "  (none)"
fi

# ----------------------------------------------------------------
# Summary & next steps
# ----------------------------------------------------------------
print_header "7) Suggested Next Actions"
echo "- Review all hits in sections 3-5 above for external-input exposure."
echo "- API routes and Lambda handlers accepting user input are highest priority."
echo "- Build scripts / test fixtures using only static literals are generally safe."
echo "- Wrap dynamic path construction with: import { safePath } from 'dm/layers/base/src/index.js';"
echo "- Reference: CWE-22 (https://cwe.mitre.org/data/definitions/22.html)"
echo "- Reference: CWE-23 (https://cwe.mitre.org/data/definitions/23.html)"
