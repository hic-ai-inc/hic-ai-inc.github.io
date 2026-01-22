#!/usr/bin/env bash
set -euo pipefail

export LAYER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export LAYER_NAME="${LAYER_NAME:-hic-messaging-layer}"
export LAYER_DESCRIPTION="${LAYER_DESCRIPTION:-HIC Messaging: SNS and SQS operations}"
export EXPORTS_RELATIVE_FILE_PATH="src/index.js"

# Dependencies from versions.env
# AWS SDKs for SNS and SQS
source "${LAYER_DIR}/../versions.env"

export LAYER_DEPENDENCIES="$(
  jq -n \
    --arg sns "${AWS_SDK_CLIENT_SNS_VERSION}" \
    --arg sqs "${AWS_SDK_CLIENT_SQS_VERSION}" \
    '{ 
    "@aws-sdk/client-sns": $sns, 
    "@aws-sdk/client-sqs": $sqs 
    }'
)"

export LAYER_SUBPATH_EXPORTS='{
  "./sns": "./node_modules/@aws-sdk/client-sns",
  "./sqs": "./node_modules/@aws-sdk/client-sqs"
}'

# Kick off via the Lambda layer builder
"${LAYER_DIR}/../build-lambda-layer.sh"
