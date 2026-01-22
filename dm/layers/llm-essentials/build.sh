#!/usr/bin/env bash
set -euo pipefail

export LAYER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export LAYER_NAME="${LAYER_NAME:-hic-llm-essentials-layer}"
export LAYER_DESCRIPTION="${LAYER_DESCRIPTION:-HIC LLM AWS services: Bedrock, SSM, Secrets Manager, S3, Step Functions}"
export EXPORTS_RELATIVE_FILE_PATH="src/index.js"

# Dependencies from versions.env
source "${LAYER_DIR}/../versions.env"

# Aggregate all LLM service dependencies
export LAYER_DEPENDENCIES="$(
  jq -n \
    --arg bedrock        "${AWS_SDK_CLIENT_BEDROCK_VERSION}" \
    --arg bedrockRuntime "${AWS_SDK_CLIENT_BEDROCK_RUNTIME_VERSION}" \
    --arg ssm            "${AWS_SDK_CLIENT_SSM_VERSION}" \
    --arg secrets        "${AWS_SDK_CLIENT_SECRETS_MANAGER_VERSION}" \
    --arg s3             "${AWS_SDK_CLIENT_S3_VERSION}" \
    --arg s3Presigner    "${AWS_SDK_S3_REQUEST_PRESIGNER_VERSION}" \
    --arg sfn            "${AWS_SDK_CLIENT_SFN_VERSION}" \
    '{
      "@aws-sdk/client-bedrock": $bedrock,
      "@aws-sdk/client-bedrock-runtime": $bedrockRuntime,
      "@aws-sdk/client-ssm": $ssm,
      "@aws-sdk/client-secrets-manager": $secrets,
      "@aws-sdk/client-s3": $s3,
      "@aws-sdk/s3-request-presigner": $s3Presigner,
      "@aws-sdk/client-sfn": $sfn
    }'
)"

# Optional subpath exports
export LAYER_SUBPATH_EXPORTS='{
  "./bedrock": "./node_modules/@aws-sdk/client-bedrock-runtime",
  "./config": "./node_modules/@aws-sdk/client-ssm",
  "./s3": "./node_modules/@aws-sdk/client-s3",
  "./sfn": "./node_modules/@aws-sdk/client-sfn"
}'

# Use existing, proven build script
"${LAYER_DIR}/../build-lambda-layer.sh"
