#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DM_LAYERS_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

export LAYER_DIR="${SCRIPT_DIR}"
export LAYER_NAME="${LAYER_NAME:-hic-dynamodb-layer}"
export LAYER_DESCRIPTION="${LAYER_DESCRIPTION:-DynamoDB operations: GetItem, PutItem, UpdateItem, Scan, Query}"
export HIC_LAYER_VERSION="$(jq -r '.version' "${LAYER_DIR}/version.manifest.json")"

export REGION="${REGION:-us-east-1}"
export ARTIFACT_BUCKET="${ARTIFACT_BUCKET:-hic-dm-artifacts-${REGION}}"

export CLEANUP_ZIP="${CLEANUP_ZIP:-1}"
export CLEANUP_DIST_IF_EMPTY="${CLEANUP_DIST_IF_EMPTY:-1}"

bash "${DM_LAYERS_ROOT}/publish-lambda-layer.sh"
