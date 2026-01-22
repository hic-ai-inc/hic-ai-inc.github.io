#!/usr/bin/env bash
set -euo pipefail

export LAYER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export LAYER_NAME="hic-bedrock-layer"
export LAYER_DESCRIPTION="Bedrock and Bedrock Runtime operations for LLM processing"
export EXPORTS_RELATIVE_FILE_PATH="src/index.js"

# Get dependencies from versions.env
# AWS SDK Bedrock runtime
source "${LAYER_DIR}/../versions.env"

export LAYER_DEPENDENCIES="$(
  jq -n \
    --arg runtime "${AWS_SDK_CLIENT_BEDROCK_RUNTIME_VERSION}" \
    --arg control "${AWS_SDK_CLIENT_BEDROCK_VERSION}" \
    '{
      "@aws-sdk/client-bedrock-runtime": $runtime,
      "@aws-sdk/client-bedrock": $control
    }'
)"

export LAYER_SUBPATH_EXPORTS='{
  "./runtime": "./node_modules/@aws-sdk/client-bedrock-runtime",
  "./control": "./node_modules/@aws-sdk/client-bedrock"
}'

# Kick off the Lambda layer builder
"${LAYER_DIR}/../build-lambda-layer.sh"
