#!/usr/bin/env bash
set -euo pipefail
export LAYER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export LAYER_NAME="hic-auth-layer"
export LAYER_DESCRIPTION="HIC Lambda Layer for Cognito Identity Provider SDK (server-side admin operations)"
export EXPORTS_RELATIVE_FILE_PATH="src/index.js"

# Dependencies from versions.env
source "${LAYER_DIR}/../versions.env"
export LAYER_DEPENDENCIES="$(jq -n \
  --arg cognito "${AWS_SDK_CLIENT_COGNITO_IDENTITY_PROVIDER_VERSION}" \
  '{ "@aws-sdk/client-cognito-identity-provider": $cognito }'
)"

"${LAYER_DIR}/../build-lambda-layer.sh"
