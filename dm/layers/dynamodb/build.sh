#!/usr/bin/env bash
set -euo pipefail

export LAYER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export LAYER_NAME="${LAYER_NAME:-hic-dynamodb-layer}"
export LAYER_DESCRIPTION="${LAYER_DESCRIPTION:-DynamoDB operations: GetItem, PutItem, UpdateItem, Scan, Query}"
export EXPORTS_RELATIVE_FILE_PATH="src/index.js"

# Dependencies from versions.env
# AWS SDK DynamoDB
source "${LAYER_DIR}/../versions.env"

export LAYER_DEPENDENCIES="$(
  jq -n \
    --arg ddbClient "${AWS_SDK_CLIENT_DYNAMODB_VERSION}" \
    --arg ddbUtil   "${AWS_SDK_UTIL_DYNAMODB_VERSION}" \
    --arg ddbLib    "${AWS_SDK_LIB_DYNAMODB_VERSION}" \
    --arg ddbStreams "${AWS_SDK_CLIENT_DYNAMODB_STREAMS_VERSION}" \
    '{
      "@aws-sdk/client-dynamodb": $ddbClient,
      "@aws-sdk/util-dynamodb":   $ddbUtil,
      "@aws-sdk/lib-dynamodb":    $ddbLib,
      "@aws-sdk/client-dynamodb-streams": $ddbStreams
    }'
)"

export LAYER_SUBPATH_EXPORTS='{
  "./client": "./node_modules/@aws-sdk/client-dynamodb",
  "./util": "./node_modules/@aws-sdk/util-dynamodb",
  "./lib": "./node_modules/@aws-sdk/lib-dynamodb",
  "./streams": "./node_modules/@aws-sdk/client-dynamodb-streams"
}'

# Kick off via the Lambda layer builder
"${LAYER_DIR}/../build-lambda-layer.sh"
