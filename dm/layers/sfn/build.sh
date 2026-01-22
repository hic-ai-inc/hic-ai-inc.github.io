#!/usr/bin/env bash
set -euo pipefail

export LAYER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export LAYER_NAME="${LAYER_NAME:-hic-sfn-layer}"
export LAYER_DESCRIPTION="${LAYER_DESCRIPTION:-Step Functions operations: StartExecution, SendTaskSuccess, SendTaskFailure}"
export EXPORTS_RELATIVE_FILE_PATH="src/index.js"               

# Dependencies from versions.env
# AWS SDK for Step Functions
source "${LAYER_DIR}/../versions.env"

export LAYER_DEPENDENCIES="$(
  jq -n \
    --arg sfn "${AWS_SDK_CLIENT_SFN_VERSION}" \
    '{ 
    "@aws-sdk/client-sfn": $sfn 
    }'
)"

export LAYER_SUBPATH_EXPORTS='{
  "./client": "./node_modules/@aws-sdk/client-sfn"
}'

# Kick off via the Lambda layer builder
"${LAYER_DIR}/../build-lambda-layer.sh"
