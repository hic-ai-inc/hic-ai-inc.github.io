#!/usr/bin/env bash
set -euo pipefail
export LAYER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export LAYER_NAME="hic-base-layer"
export LAYER_DESCRIPTION="HIC base utilities + Lambda client"
export EXPORTS_RELATIVE_FILE_PATH="src/index.js"               # For HIC utilities

# Dependencies from versions.env
# AWS SDK Lambda runtime
source "${LAYER_DIR}/../versions.env"
export LAYER_DEPENDENCIES="$(jq -n \
  --arg lambda "${AWS_SDK_CLIENT_LAMBDA_VERSION}" \
  '{ "@aws-sdk/client-lambda": $lambda }'
)"

"${LAYER_DIR}/../build-lambda-layer.sh"