#!/bin/bash
# hic/dm/utils/validate.sh

set -euo pipefail
trap 'echo "❌ Error: Script failed at line $LINENO"; exit 1' ERR

validate_safe_dir() {
    local dir="$1"
    if [[ -z "$dir" || "$dir" == "/" || "$dir" == "." || "$dir" == ".." || "$dir" =~ \.\. ]]; then
        echo "❌ Error: Unsafe directory path: $dir"
        exit 1
    fi
}

validate_command() {
  local cmd="$1"; local human="${2:-$1}"
  command -v "$cmd" >/dev/null 2>&1 || error_exit "$human not found."
}

validate_node() { validate_command node "Node.js"; }
validate_npm()  { validate_command npm  "npm"; }
validate_jq() { validate_command jq "jq"; }

validate_json_string() {
    local json="$1"
    echo "$json" | jq empty > /dev/null 2>&1 || {
        echo "❌ Error: Invalid JSON string: $json"
        exit 1
    }
}

validate_file_exists() {
    local file="$1"
    [[ -f "$file" ]] || error_exit "File not found: $file"
}

validate_path_exists() {
    local path="$1"
    [[ -e "$path" ]] || error_exit "Path does not exist: $path"
}

validate_semver() {
    local version="$1"
    [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || error_exit "Invalid version format: $version"
}

validate_zip_size() {
    local zip="$1"
    local min_size="$2"
    local size=$(stat -c%s "$zip" 2>/dev/null || stat -f%z "$zip" 2>/dev/null || echo "0")
    [[ $size -ge $min_size ]] || error_exit "ZIP file too small or corrupted ($size bytes): $zip"
}

error_exit() {
    echo "❌ Error: $1"
    exit 1
}

success_msg() {
    echo "✅ $1"
}

validate_env_var() {
    local var_name="$1"
    [[ -n "${!var_name:-}" ]] || error_exit "Environment variable '$var_name' is not set or empty."
}

run_or_exit() {
    "$@" || error_exit "Command failed: $*"
}

validate_lambda_runtime() {
  local runtime="$1"

  if [[ -z "${runtime}" ]]; then
    error_exit "Lambda runtime is empty."
  fi

  # List of supported runtimes (trimmed to current major ones; update as AWS adds more)
  local valid_runtimes=(
    "nodejs18.x" "nodejs20.x" "nodejs22.x"
    "python3.9" "python3.10" "python3.11" "python3.12"
    "java11" "java17"
    "dotnet6" "dotnet8"
    "ruby3.2"
    "provided" "provided.al2" "provided.al2023"
  )

  for valid in "${valid_runtimes[@]}"; do
    if [[ "$runtime" == "$valid" ]]; then
      return 0
    fi
  done

  error_exit "Invalid Lambda runtime '${runtime}'. Allowed values: ${valid_runtimes[*]}"
}

validate_sdk_version() {
    local version="$1"
    [[ "$version" =~ ^[~^]?[0-9]+\.[0-9]+\.[0-9]+$ ]] || error_exit "Invalid AWS SDK version format: $version. Expected: ^x.y.z, ~x.y.z, or x.y.z"
}

validate_s3_bucket() {
  local bucket="$1"
  if ! aws s3api head-bucket --bucket "${bucket}" >/dev/null 2>&1; then
    error_exit "S3 bucket does not exist or is not accessible: ${bucket}"
  fi
}

validate_layer_name() {
  local name="$1"

  if [[ -z "${name}" ]]; then
    error_exit "Layer name is empty."
  fi

  if [[ ! "${name}" =~ ^[A-Za-z0-9_-]+$ ]]; then
    error_exit "Invalid layer name '${name}'. Allowed characters: letters, numbers, hyphens (-), underscores (_)."
  fi

  if (( ${#name} > 140 )); then
    error_exit "Invalid layer name '${name}'. Must not exceed 140 characters (got ${#name})."
  fi
}

validate_layer_arn() {
  local arn="$1"

  # Must not be empty
  if [[ -z "${arn}" ]]; then
    error_exit "Failed to create layer version (ARN is empty)."
  fi

  # Must look like an AWS Lambda LayerVersion ARN
  # Region pattern is more restrictive - valid AWS regions like us-east-1, eu-west-1, ap-south-1, etc.
  if [[ ! "${arn}" =~ ^arn:aws:lambda:(us|eu|ap|ca|sa|af|me|il|cn|gov)-(east|west|north|south|southeast|southwest|northeast|northwest|central)-[1-9]:[0-9]{12}:layer:[A-Za-z0-9._-]+:[0-9]+$ ]]; then
    error_exit "Invalid LayerVersion ARN format: ${arn}"
  fi
}

validate_files_exist() {
    local pattern="$1"
    ls $pattern 1> /dev/null 2>&1 || error_exit "No files found matching pattern: $pattern"
}
