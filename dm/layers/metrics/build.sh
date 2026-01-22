#!/usr/bin/env bash
set -euo pipefail

export LAYER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export LAYER_NAME="${LAYER_NAME:-hic-metrics-layer}"
export LAYER_DESCRIPTION="${LAYER_DESCRIPTION:-CloudWatch Metrics: PutMetricData, GetMetricData, Alarms}"
export EXPORTS_RELATIVE_FILE_PATH="src/index.js"

# Dependencies from versions.env
# AWS SDK CloudWatch
source "${LAYER_DIR}/../versions.env"

export LAYER_DEPENDENCIES="$(
  jq -n \
    --arg cloudwatch "${AWS_SDK_CLIENT_CLOUDWATCH_VERSION}" \
    '{ 
    "@aws-sdk/client-cloudwatch": $cloudwatch
    }'
)"

export LAYER_SUBPATH_EXPORTS='{
  "./cloudwatch": "./node_modules/@aws-sdk/client-cloudwatch"
}'

# Kick off via the Lambda layer builder
"${LAYER_DIR}/../build-lambda-layer.sh"
