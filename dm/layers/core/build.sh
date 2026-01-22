#!/usr/bin/env bash
set -euo pipefail

export LAYER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export LAYER_NAME="${LAYER_NAME:-hic-core-layer}"
export LAYER_DESCRIPTION="${LAYER_DESCRIPTION:-HIC core AWS services: DynamoDB, SNS, SQS, CloudWatch}"
export EXPORTS_RELATIVE_FILE_PATH="src/index.js"

# Dependencies from versions.env
source "${LAYER_DIR}/../versions.env"

# Aggregate all core service dependencies
export LAYER_DEPENDENCIES="$(
  jq -n \
    --arg ddbClient  "${AWS_SDK_CLIENT_DYNAMODB_VERSION}" \
    --arg ddbUtil    "${AWS_SDK_UTIL_DYNAMODB_VERSION}" \
    --arg ddbLib     "${AWS_SDK_LIB_DYNAMODB_VERSION}" \
    --arg ddbStreams "${AWS_SDK_CLIENT_DYNAMODB_STREAMS_VERSION}" \
    --arg sns        "${AWS_SDK_CLIENT_SNS_VERSION}" \
    --arg sqs        "${AWS_SDK_CLIENT_SQS_VERSION}" \
    --arg cw         "${AWS_SDK_CLIENT_CLOUDWATCH_VERSION}" \
    '{
      "@aws-sdk/client-dynamodb": $ddbClient,
      "@aws-sdk/util-dynamodb": $ddbUtil,
      "@aws-sdk/lib-dynamodb": $ddbLib,
      "@aws-sdk/client-dynamodb-streams": $ddbStreams,
      "@aws-sdk/client-sns": $sns,
      "@aws-sdk/client-sqs": $sqs,
      "@aws-sdk/client-cloudwatch": $cw
    }'
)"

# Optional subpath exports for convenience
export LAYER_SUBPATH_EXPORTS='{
  "./dynamodb": "./node_modules/@aws-sdk/client-dynamodb",
  "./sns": "./node_modules/@aws-sdk/client-sns",
  "./sqs": "./node_modules/@aws-sdk/client-sqs",
  "./cloudwatch": "./node_modules/@aws-sdk/client-cloudwatch"
}'

# Use existing, proven build script
"${LAYER_DIR}/../build-lambda-layer.sh"
