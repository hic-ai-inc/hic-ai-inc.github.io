#!/usr/bin/env bash
set -euo pipefail

export LAYER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export LAYER_NAME="${LAYER_NAME:-hic-ses-layer}"
export LAYER_DESCRIPTION="${LAYER_DESCRIPTION:-HIC SES: SendEmail, SendTemplatedEmail, SendBulkTemplatedEmail}"
export EXPORTS_RELATIVE_FILE_PATH="src/index.js"

# Dependencies from versions.env
# AWS SDK for SES
source "${LAYER_DIR}/../versions.env"

export LAYER_DEPENDENCIES="$(
  jq -n \
    --arg ses "${AWS_SDK_CLIENT_SES_VERSION}" \
    '{ 
    "@aws-sdk/client-ses": $ses 
    }'
)"

export LAYER_SUBPATH_EXPORTS='{
  "./client": "./node_modules/@aws-sdk/client-ses"
}'

# Kick off via the Lambda layer builder
"${LAYER_DIR}/../build-lambda-layer.sh"
