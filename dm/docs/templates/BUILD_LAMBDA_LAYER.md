#!/bin/bash

# ============================================================================

# Lambda Layer Build Script Template

# Purpose: Build and package AWS Lambda layer for <LAYER_NAME>

# Author: <Your Name>

# Version: <Version>

# ============================================================================

# --- Initialization ---

set -e
set -u
echo "🚀 Starting <LAYER_NAME> Layer Build..."

# Source centralized version management

source "$(dirname "$0")/../versions.env"

# Source shared validation and error handling functions

source "$(dirname "$0")/../../utils/validate.sh"

# --- Environment Variables ---

LAYER_NAME="${LAYER_NAME:-<default-layer-name>}"
LAYER_DESCRIPTION="${LAYER_DESCRIPTION:-<Layer description>}"
BUILD_DIR="${BUILD_DIR:-build}/${LAYER_NAME}"
DIST_DIR="${DIST_DIR:-dist}"
NODE_MODULES_PATH="${NODE_MODULES_PATH:-nodejs/node_modules}"
CREATE_ZIP_UTILITY="${CREATE_ZIP_UTILITY:-../../utils/create-zip.js}"

# --- Validation ---

echo "🔍 Validating environment and dependencies..."
validate_node
validate_npm
validate_semver "${HIC_LAYER_VERSION}"
validate_env_var "<REQUIRED_ENV_VAR>"
validate_file_exists "${CREATE_ZIP_UTILITY}"
validate_files_exist "${SOURCE_DIR}/\*.js"

# --- Build Directories ---

echo "📁 Creating build directories..."
run_or_exit mkdir -p ${BUILD_DIR}/${NODE_MODULES_PATH}/${LAYER_NAME}
run_or_exit mkdir -p ${DIST_DIR}

# --- Copy Source Files ---

echo "📦 Copying source files..."
run_or_exit cp ${SOURCE_DIR}/*.js ${BUILD_DIR}/${NODE_MODULES_PATH}/${LAYER_NAME}/

# --- Create package.json ---

echo "📝 Creating package.json..."
cat > ${BUILD_DIR}/${NODE_MODULES_PATH}/${LAYER_NAME}/package.json << EOF
{
  "name": "${LAYER_NAME}",
"version": "${HIC_LAYER_VERSION}",
  "description": "${LAYER_DESCRIPTION}",
"dependencies": {
"<DEPENDENCY_NAME>": "${DEPENDENCY_VERSION}"
  }
}
EOF
validate_file_exists "${BUILD_DIR}/${NODE_MODULES_PATH}/${LAYER_NAME}/package.json"

# --- Install Dependencies ---

echo "📦 Installing dependencies..."
run_or_exit cd ${BUILD_DIR}/${NODE_MODULES_PATH}/${LAYER_NAME}
run_or_exit npm install --production --no-package-lock
run_or_exit cd ../../..
validate_path_exists "${BUILD_DIR}/${NODE_MODULES_PATH}/${LAYER_NAME}/node_modules/<DEPENDENCY_NAME>"

# --- Package Layer ZIP ---

echo "📦 Packaging layer ZIP..."
run_or_exit node ${CREATE_ZIP_UTILITY} nodejs ${LAYER_NAME}.zip
run_or_exit mv ${LAYER_NAME}.zip ../../${DIST_DIR}/${LAYER_NAME}.zip
run_or_exit cd ../..
validate_file_exists "${DIST_DIR}/${LAYER_NAME}.zip"
validate_zip_size "${DIST_DIR}/${LAYER_NAME}.zip" <MAX_SIZE_KB>
success_msg "${LAYER_NAME}: $(du -h ${DIST_DIR}/${LAYER_NAME}.zip | cut -f1) created successfully"

# --- Cleanup ---

echo "🧹 Cleaning up build artifacts..."
rm -rf ${BUILD_DIR} || {
echo "⚠️ Warning: Failed to clean up build directory ${BUILD_DIR}"
echo "You may need to manually remove it"
}

# --- Output & Usage Instructions ---

echo "🎉 Layer built successfully!"
echo "📁 Find your layer in: ${DIST_DIR}/"
echo "✅ Layer: ${LAYER_NAME}.zip"
echo ""
echo "Ready for deployment to AWS environments."

# ============================================================================

# Notes:

# - Replace placeholders (e.g., <LAYER_NAME>, <DEPENDENCY_NAME>, <MAX_SIZE_KB>) with actual values for each layer.

# - Use run_or_exit for all commands that may fail.

# - Keep validation and error handling consistent across all scripts.

# - Document any layer-specific logic clearly.

# ============================================================================
