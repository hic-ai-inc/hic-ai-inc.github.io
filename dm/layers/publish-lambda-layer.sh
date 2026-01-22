#!/bin/bash
# hic/dm/layers/publish-lambda-layer-v2.sh
#
# Publish a specific Lambda Layer ZIP to S3 and AWS Lambda.

set -euo pipefail
trap 'echo "❌ Error: Script failed at line $LINENO"; exit 1' ERR

# --- Shared helpers  ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DM_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
VALIDATE_SCRIPT="${VALIDATE_SCRIPT:-"${SCRIPT_DIR}/../utils/validate.sh"}"
source "${VALIDATE_SCRIPT}"

echo "🚀 Starting Lambda Layer Publish..."

# --- Required inputs (must be set by per-layer publish.sh wrapper) ---
: "${LAYER_DIR:?LAYER_DIR must be set}"                     # e.g., dm/layers/base
: "${LAYER_NAME:?LAYER_NAME must be set}"                   # e.g., hic-base-layer
: "${HIC_LAYER_VERSION:?HIC_LAYER_VERSION must be set}"     # e.g., 1.0.0
: "${LAYER_DESCRIPTION:?LAYER_DESCRIPTION must be set}"     # e.g., "HIC base utilities + Lambda client"
: "${ARTIFACT_BUCKET:?ARTIFACT_BUCKET must be set}"         # e.g., hic-dm-artifacts-us-east-1

# --- Optional inputs ---
: "${DIST_DIR:=${DM_ROOT}/dist}"
: "${REGION:=${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}}"
: "${RUNTIME:=nodejs20.x}"

# --- Publish manifest ---
PUBLISH_MANIFEST_BASENAME="publish.${HIC_LAYER_VERSION}.manifest.json"
PUBLISH_MANIFEST_PATH="${LAYER_DIR}/${PUBLISH_MANIFEST_BASENAME}"

# --- Cleanup controls ---
: "${CLEANUP_ZIP:=1}"                # 1 = delete the ZIP after successful publish, 0 = keep
: "${CLEANUP_DIST_IF_EMPTY:=1}"      # 1 = rmdir dist if it becomes empty

# --- Validation ---
validate_env_var "LAYER_NAME"
validate_layer_name "${LAYER_NAME}"
validate_env_var "HIC_LAYER_VERSION"
validate_semver "${HIC_LAYER_VERSION}"
validate_env_var "ARTIFACT_BUCKET"
validate_s3_bucket "${ARTIFACT_BUCKET}"
validate_safe_dir "${DIST_DIR}"
validate_jq
validate_lambda_runtime "${RUNTIME}"

# --- ZIP must exactly match the requested version ---
ZIP_PATH="${DIST_DIR}/${LAYER_NAME}-${HIC_LAYER_VERSION}.zip"
validate_file_exists "${ZIP_PATH}"

echo "📌 Publishing ${LAYER_NAME} @ ${HIC_LAYER_VERSION} (region ${REGION})"

# --- Upload to S3 artifact repository ---
S3_KEY="layers/${LAYER_NAME}/${HIC_LAYER_VERSION}/${LAYER_NAME}-${HIC_LAYER_VERSION}.zip"
S3_URI="s3://${ARTIFACT_BUCKET}/${S3_KEY}"

echo "⬆️  Uploading ${ZIP_PATH} → ${S3_URI}"
aws s3 cp "${ZIP_PATH}" "${S3_URI}" --region "${REGION}" >/dev/null

# --- Publish Lambda layer ---
echo "📤 aws lambda publish-layer-version ..."
PUBLISH_JSON="$(
  aws lambda publish-layer-version \
    --region "${REGION}" \
    --layer-name "${LAYER_NAME}" \
    --description "${LAYER_DESCRIPTION}" \
    --content "S3Bucket=${ARTIFACT_BUCKET},S3Key=${S3_KEY}" \
    --compatible-runtimes "${RUNTIME}"
)"

LAYER_VERSION_ARN="$(echo "${PUBLISH_JSON}" | jq -r '.LayerVersionArn')"
PUBLISHED_VERSION="$(echo "${PUBLISH_JSON}" | jq -r '.Version')"
validate_layer_arn "${LAYER_VERSION_ARN}"

echo "✅ Published: ${LAYER_VERSION_ARN} (Lambda version ${PUBLISHED_VERSION})"

# --- Write publish manifest ---
echo "🧾 Writing publish manifest → ${PUBLISH_MANIFEST_PATH}"
jq -n \
  --arg layerName "${LAYER_NAME}" \
  --arg version "${HIC_LAYER_VERSION}" \
  --arg region "${REGION}" \
  --arg s3uri "${S3_URI}" \
  --arg layerVersionArn "${LAYER_VERSION_ARN}" \
  --arg zipPath "${ZIP_PATH}" \
  '{
     layerName: $layerName,
     version: $version,
     region: $region,
     s3Uri: $s3uri,
     layerVersionArn: $layerVersionArn,
     zipPath: $zipPath,
     publishedAt: (now | todate)
   }' > "${PUBLISH_MANIFEST_PATH}"

# --- Cleanup (optional) ---
if [[ "${CLEANUP_ZIP}" == "1" ]]; then
  echo "🧹 Removing ZIP ${ZIP_PATH}"
  rm -f "${ZIP_PATH}"
fi

# --- If dist is empty (or only contains dotfiles) and cleanup is requested, remove it ---
if [[ "${CLEANUP_DIST_IF_EMPTY}" == "1" ]]; then
  shopt -s nullglob dotglob
  dist_entries=("${DIST_DIR}"/*)
  if (( ${#dist_entries[@]} == 0 )); then
    echo "🧹 Removing empty dist directory ${DIST_DIR}"
    rmdir "${DIST_DIR}" || true
  fi
  shopt -u nullglob dotglob
fi

success_msg "Done. ARN: ${LAYER_VERSION_ARN}"