#!/bin/bash
# hic\dm\layers\build-lambda-layer.sh
#
# Uniform Lambda layer build (namespaced package mode):
#   • Every layer MUST provide:  <layer>/src/index.js
#   • We publish a package at:   /opt/nodejs/node_modules/${LAYER_NAME}/
#         - index.js
#         - package.json   (name="${LAYER_NAME}", type="module", main="./index.js")
#         - exports: { ".": "./index.js", ...subpaths }
#
# Optional:
#   • LAYER_SUBPATH_EXPORTS       — JSON object merged into package.json.exports
#                                   (e.g. {"./client":"./node_modules/@aws-sdk/client-dynamodb"})
#   • EXPORTS_RELATIVE_FILE_PATH  — path used by version-gate (e.g. "src/index.js")
#
# Notes:
#   • Import from your Lambda with:
#         import { safeLog } from "hic-base-layer";
#         import { BedrockRuntimeClient } from "hic-bedrock-layer/runtime";
#
#   • No top-level /opt/nodejs/package.json is created (prevents cross-layer collisions).

set -euo pipefail
trap 'echo "❌ Error: Script failed at line $LINENO"; exit 1' ERR

# --- Source shared validation and error handling ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DM_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
source "${SCRIPT_DIR}/../utils/validate.sh"

echo "🚀 Starting Lambda Layer Build..."

# --- Required inputs provided by the *per-layer* build.sh wrapper ---
: "${LAYER_DIR:?LAYER_DIR must be set}"                             # e.g., dm/layers/base
: "${LAYER_NAME:?LAYER_NAME must be set}"                           # e.g., hic-base-layer
: "${LAYER_DESCRIPTION:?LAYER_DESCRIPTION must be set}"             # e.g., "Universal utilities and Lambda runtimes for all HIC Lambda functions"
: "${LAYER_DEPENDENCIES:?LAYER_DEPENDENCIES must be set as JSON}"   # e.g., {"@aws-sdk/client-lambda":"3.700.0"}

# --- Optional inputs ---
: "${DIST_DIR:=${DM_ROOT}/dist}"
: "${BUILD_DIR:=${DM_ROOT}/build/${LAYER_NAME}}"
: "${NODEJS_DIR:=${BUILD_DIR}/nodejs}"                              # content that becomes /opt/nodejs
: "${SRC_DIR:=${LAYER_DIR}/src}"                                    # MUST contain index.js; copied verbatim to nodejs/
: "${CREATE_ZIP_UTILITY:=../utils/create-zip.js}"
: "${EXPORTS_RELATIVE_FILE_PATH:=}"                                 # e.g., "src/index.js" for API-aware bumps
: "${LAYER_SUBPATH_EXPORTS:=}"                                      # JSON object with extra export map
: "${PRESERVE_BUILD:=0}"

# --- Validation ---
validate_node
validate_npm
validate_jq
validate_env_var "LAYER_NAME"
validate_env_var "LAYER_DESCRIPTION"
validate_env_var "LAYER_DEPENDENCIES"
validate_safe_dir "${BUILD_DIR}"
validate_json_string  "${LAYER_DEPENDENCIES}"
if [[ -n "${LAYER_SUBPATH_EXPORTS}" ]]; then
  validate_json_string "${LAYER_SUBPATH_EXPORTS}"
fi

# --- Must have src/index.js for uniform build ---
INDEX_JS_PATH="${SRC_DIR}/index.js"
validate_file_exists "${INDEX_JS_PATH}"

# --- Resolve utility path relative to script dir and validate ---
ZIP_UTILITY_ABS="${SCRIPT_DIR}/${CREATE_ZIP_UTILITY}"
validate_file_exists "${ZIP_UTILITY_ABS}"

# --- versions.env is expected at dm/layers/versions.env (parent of layer dir) ---
VERSIONS_ENV="$(cd "${LAYER_DIR}/.." && pwd)/versions.env"
validate_file_exists "${VERSIONS_ENV}"

# --- Version gate ---
unset DECISION NEXT_VERSION || true
source "${SCRIPT_DIR}/../utils/version-gate.sh" "${LAYER_DIR}" "${LAYER_NAME}" "${EXPORTS_RELATIVE_FILE_PATH}"

if [[ "${DECISION}" == "noop" ]]; then
  echo "✅ No changes detected for ${LAYER_NAME}. Skipping build."
  exit 0
fi

# --- Adopt the computed version from the gate ---
HIC_LAYER_VERSION="${NEXT_VERSION:?version gate did not set NEXT_VERSION}"
validate_semver "${HIC_LAYER_VERSION}"

echo "📌 Building ${LAYER_NAME} @ ${HIC_LAYER_VERSION}"

# --- Build Directories ---
run_or_exit mkdir -p "${NODEJS_DIR}"
run_or_exit mkdir -p "${DIST_DIR}"

# Package directory: /opt/nodejs/node_modules/${LAYER_NAME}
LAYER_PKG_DIR="${NODEJS_DIR}/node_modules/${LAYER_NAME}"
run_or_exit mkdir -p "${LAYER_PKG_DIR}"

# --- Create top-level package.json with third-party dependencies ---
cat > "${NODEJS_DIR}/package.json" << EOF
{
  "name": "${LAYER_NAME}-deps",
  "private": true,
  "type": "module",
  "dependencies": ${LAYER_DEPENDENCIES}
}
EOF

# --- Install dependencies FLAT at nodejs/node_modules ---
pushd "${NODEJS_DIR}" > /dev/null
run_or_exit npm install --omit=dev --no-package-lock --no-audit --no-fund
popd > /dev/null

# --- Copy first-party source into the package directory (src/* => .../${LAYER_NAME}/*) ---
run_or_exit cp -a "${SRC_DIR}/." "${LAYER_PKG_DIR}/"
echo "📁 Copied source to ${LAYER_PKG_DIR}"

# --- Ensure no nested node_modules under package ---
rm -rf "${LAYER_PKG_DIR}/node_modules" || true

# --- Create per-layer package.json (without dependencies - they're at nodejs level) ---
PKG_PATH="${LAYER_PKG_DIR}/package.json"
jq -n \
  --arg name "${LAYER_NAME}" \
  --arg ver  "${HIC_LAYER_VERSION}" \
  --arg desc "${LAYER_DESCRIPTION}" \
  '{
     name: $name,
     version: $ver,
     private: true,
     description: $desc,
     type: "module",
     main: "./index.js",
     exports: { ".": "./index.js" }
   }' > "${PKG_PATH}"
validate_file_exists "${PKG_PATH}"

# Merge optional subpath exports (if provided)
if [[ -n "${LAYER_SUBPATH_EXPORTS}" ]]; then
  tmp="${PKG_PATH}.tmp"
  jq --argjson extra "${LAYER_SUBPATH_EXPORTS}" '.exports += $extra' \
    "${PKG_PATH}" > "${tmp}" && mv "${tmp}" "${PKG_PATH}"
  echo "🔧 Added subpath exports to package.json"
fi

# --- Package ZIP (of /opt/nodejs) ---
ZIP_BASENAME="${LAYER_NAME}-${HIC_LAYER_VERSION}.zip"
ZIP_PATH="${DIST_DIR}/${ZIP_BASENAME}"
run_or_exit node "${ZIP_UTILITY_ABS}" "${NODEJS_DIR}" "${ZIP_PATH}"
validate_file_exists "${ZIP_PATH}"
validate_zip_size "${ZIP_PATH}" 2048

# --- Cleanup ---
if [[ "${PRESERVE_BUILD:-0}" != "0" ]]; then
  echo "🧩 PRESERVE_BUILD set; leaving build directory: ${BUILD_DIR}"
else
  rm -rf "${BUILD_DIR}" || echo "⚠️ Warning: Failed to clean up build directory"
fi

echo "🎉 Layer built: ${ZIP_PATH}"
