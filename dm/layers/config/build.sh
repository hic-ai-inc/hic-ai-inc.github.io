#!/usr/bin/env bash
set -euo pipefail

export LAYER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export LAYER_NAME="${LAYER_NAME:-hic-config-layer}"
export LAYER_DESCRIPTION="${LAYER_DESCRIPTION:-Configuration and Secrets: SSM Parameter Store and Secrets Manager operations}"
export EXPORTS_RELATIVE_FILE_PATH="src/index.js"

# Dependencies from versions.env
# AWS SDK SSM and Secrets Manager 
source "${LAYER_DIR}/../versions.env"

export LAYER_DEPENDENCIES="$(
  jq -n \
    --arg ssmVer "${AWS_SDK_CLIENT_SSM_VERSION}" \
    --arg secVer "${AWS_SDK_CLIENT_SECRETS_MANAGER_VERSION}" \
    '{ 
    "@aws-sdk/client-ssm": $ssmVer, 
    "@aws-sdk/client-secrets-manager": $secVer 
    }'
)"

export LAYER_SUBPATH_EXPORTS='{
  "./ssm": "./node_modules/@aws-sdk/client-ssm",
  "./secrets": "./node_modules/@aws-sdk/client-secrets-manager"
}'

# Kick off the Lambda layer builder
"${LAYER_DIR}/../build-lambda-layer.sh"
