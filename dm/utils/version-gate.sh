#!/usr/bin/env bash
set -euo pipefail

# version-gate.sh
# - Runs hic-version.js for a given layer directory
# - Validates JSON output with jq
# - Exports DECISION and NEXT_VERSION as shell variables
# - Generates a version.manifest.json in the layer directory (written by the Node tool)

LAYER_DIR="${1:?usage: version-gate.sh <layer-dir> [layer-name] [exports-file-relative]}"
LAYER_NAME="${2:-$(basename "$LAYER_DIR")}"
EXPORTS_RELATIVE_FILE_PATH="${3:-}"   # e.g., "src/index.js" or empty

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSIONS_ENV="$(cd "$LAYER_DIR/.." && pwd)/versions.env"

# Validate layer directory
if [[ ! -d "$LAYER_DIR" ]]; then
  echo "❌ layer directory does not exist: $LAYER_DIR"
  exit 1
fi

# Validate versions.env file
if [[ ! -f "$VERSIONS_ENV" ]]; then
  echo "❌ versions.env file does not exist: $VERSIONS_ENV"
  exit 1
fi

RAW_JSON="$(
  node "${SCRIPT_DIR}/hic-version.js" \
    --layer-dir "$LAYER_DIR" \
    --name "$LAYER_NAME" \
    --versions-env "$VERSIONS_ENV" \
    ${EXPORTS_RELATIVE_FILE_PATH:+--exports-file "$EXPORTS_RELATIVE_FILE_PATH"}
)"

# Validate it's JSON and extract fields
DECISION="$(echo "$RAW_JSON" | jq -r '.decision // empty')"
NEXT_VERSION="$(echo "$RAW_JSON" | jq -r '.nextVersion // empty')"

# Validate that a decision was calculated and otherwise exit with an error
if [[ -z "$DECISION" ]]; then
  echo "❌ The version gate failed to generate a semver decision as expected. Raw output:"
  echo "$RAW_JSON"
  exit 1
fi

export DECISION
export NEXT_VERSION

echo "🔎 Version gate: decision=${DECISION}${NEXT_VERSION:+, next=${NEXT_VERSION}}"
