#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DM_LAYERS_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

export LAYER_DIR="${SCRIPT_DIR}"
export LAYER_NAME="hic-llm-essentials-layer"
export LAYER_DESCRIPTION="HIC LLM AWS services: Bedrock, SSM, Secrets Manager, S3, Step Functions"
export HIC_LAYER_VERSION="$(jq -r '.version' "${LAYER_DIR}/version.manifest.json")"

export REGION="${REGION:-us-east-1}"
export ARTIFACT_BUCKET="${ARTIFACT_BUCKET:-hic-dm-artifacts-${REGION}}"

export CLEANUP_ZIP="${CLEANUP_ZIP:-1}"
export CLEANUP_DIST_IF_EMPTY="${CLEANUP_DIST_IF_EMPTY:-1}"

bash "${DM_LAYERS_ROOT}/publish-lambda-layer.sh"
