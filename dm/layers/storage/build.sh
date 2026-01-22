#!/usr/bin/env bash
set -euo pipefail

export LAYER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export LAYER_NAME="${LAYER_NAME:-hic-storage-layer}"
export LAYER_DESCRIPTION="${LAYER_DESCRIPTION:-S3 operations: GetObject, PutObject, DeleteObject, ListObjects}"
export EXPORTS_RELATIVE_FILE_PATH="src/index.js"

# Dependencies from versions.env
# AWS SDK for S3
source "${LAYER_DIR}/../versions.env"

export LAYER_DEPENDENCIES="$(
  jq -n \
    --arg s3 "${AWS_SDK_CLIENT_S3_VERSION}" \
    --arg s3Presigner "${AWS_SDK_S3_REQUEST_PRESIGNER_VERSION}" \
    '{ 
    "@aws-sdk/client-s3": $s3,
    "@aws-sdk/s3-request-presigner": $s3Presigner 
    }'
)"

export LAYER_SUBPATH_EXPORTS='{
  "./s3": "./node_modules/@aws-sdk/client-s3",
  "./s3-presigner": "./node_modules/@aws-sdk/s3-request-presigner"
}'

# Kick off via the Lambda layer builder
"${LAYER_DIR}/../build-lambda-layer.sh"
