#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# PLG Website - SSM Parameter Store Secrets Management
# ═══════════════════════════════════════════════════════════════════
#
# This script manages secrets in AWS SSM Parameter Store, which are
# accessible at runtime by Next.js SSR (unlike Amplify env vars).
#
# Uses the Amplify Gen 2 naming convention:
#   /amplify/shared/<app-id>/<secret-key>
#
# Usage:
#   ./scripts/manage-ssm-secrets.sh list
#   ./scripts/manage-ssm-secrets.sh get <secret-name>
#   ./scripts/manage-ssm-secrets.sh set <secret-name> <value>
#   ./scripts/manage-ssm-secrets.sh set-from-env <secret-name> <env-var>
#   ./scripts/manage-ssm-secrets.sh delete <secret-name>
#   ./scripts/manage-ssm-secrets.sh copy-from-secrets-manager
#
# Examples:
#   ./scripts/manage-ssm-secrets.sh set STRIPE_SECRET_KEY sk_test_xxx
#   ./scripts/manage-ssm-secrets.sh set-from-env STRIPE_SECRET_KEY STRIPE_SECRET_KEY
#   ./scripts/manage-ssm-secrets.sh copy-from-secrets-manager
#
# ═══════════════════════════════════════════════════════════════════

set -e

# Disable MSYS path conversion (Git Bash on Windows converts /path to C:\path)
export MSYS_NO_PATHCONV=1

# ───────────────────────────────────────────────────────────────────
# Configuration
# ───────────────────────────────────────────────────────────────────

APP_ID="${AWS_APP_ID:-d2yhz9h4xdd5rb}"
REGION="${AWS_REGION:-us-east-1}"
# Use /plg/secrets/ prefix - simpler than Amplify's reserved /amplify/ namespace
SSM_PREFIX="/plg/secrets/${APP_ID}"

# Secrets Manager paths (source for copy)
SM_STRIPE_PATH="plg/staging/stripe"

# ───────────────────────────────────────────────────────────────────
# Functions
# ───────────────────────────────────────────────────────────────────

log_info() {
    echo "[INFO] $1"
}

log_error() {
    echo "[ERROR] $1" >&2
}

log_success() {
    echo "[SUCCESS] $1"
}

log_warn() {
    echo "[WARN] $1"
}

show_usage() {
    echo "Usage:"
    echo "  $0 list                             List all SSM secrets for this app"
    echo "  $0 get <name>                       Get a secret value (masked)"
    echo "  $0 set <name> <value>               Set a secret value"
    echo "  $0 set-from-env <name> <env-var>    Set secret from environment variable"
    echo "  $0 delete <name>                    Delete a secret"
    echo "  $0 copy-from-secrets-manager        Copy Stripe secrets from Secrets Manager"
    echo ""
    echo "Options:"
    echo "  -h, --help   Show this help"
    echo ""
    echo "Environment:"
    echo "  AWS_APP_ID   Amplify app ID (default: d2yhz9h4xdd5rb)"
    echo "  AWS_REGION   AWS region (default: us-east-1)"
    echo ""
    echo "Notes:"
    echo "  - SSM path format: /amplify/shared/<app-id>/<name>"
    echo "  - All secrets are stored encrypted (SecureString)"
    echo "  - These secrets are accessible at SSR runtime"
}

check_aws() {
    if ! aws sts get-caller-identity > /dev/null 2>&1; then
        log_error "AWS credentials not configured or expired"
        exit 1
    fi
}

get_ssm_path() {
    local name="$1"
    # Ensure path starts with / (fully qualified)
    echo "/${SSM_PREFIX#/}/${name}"
}

mask_value() {
    local value="$1"
    local len=${#value}
    if [ "$len" -le 8 ]; then
        echo "********"
    else
        echo "${value:0:4}...${value: -4} (${len} chars)"
    fi
}

# ───────────────────────────────────────────────────────────────────
# Commands
# ───────────────────────────────────────────────────────────────────

cmd_list() {
    log_info "Listing SSM secrets for app: ${APP_ID}"
    log_info "SSM prefix: ${SSM_PREFIX}"
    echo ""

    # List all parameters with this prefix
    PARAMS=$(aws ssm get-parameters-by-path \
        --path "${SSM_PREFIX}" \
        --recursive \
        --with-decryption \
        --region "${REGION}" \
        --query "Parameters[*].{Name:Name,Type:Type}" \
        --output json 2>/dev/null || echo "[]")

    COUNT=$(echo "$PARAMS" | jq 'length')

    if [ "$COUNT" -eq 0 ]; then
        log_warn "No secrets found at ${SSM_PREFIX}"
        log_info "Use '$0 set <name> <value>' to create secrets"
        return
    fi

    echo "Found ${COUNT} secret(s):"
    echo "$PARAMS" | jq -r '.[] | "  - \(.Name | split("/") | last) (\(.Type))"'
}

cmd_get() {
    local name="$1"
    if [ -z "$name" ]; then
        log_error "Secret name required"
        echo "Usage: $0 get <name>"
        exit 1
    fi

    local path
    path=$(get_ssm_path "$name")
    log_info "Getting: ${path}"

    VALUE=$(aws ssm get-parameter \
        --name "${path}" \
        --with-decryption \
        --region "${REGION}" \
        --query "Parameter.Value" \
        --output text 2>/dev/null) || {
        log_error "Secret not found: ${name}"
        exit 1
    }

    echo ""
    echo "Name:  ${name}"
    echo "Path:  ${path}"
    echo "Value: $(mask_value "$VALUE")"
}

cmd_set() {
    local name="$1"
    local value="$2"

    if [ -z "$name" ] || [ -z "$value" ]; then
        log_error "Secret name and value required"
        echo "Usage: $0 set <name> <value>"
        exit 1
    fi

    local path
    path=$(get_ssm_path "$name")
    log_info "Setting: ${path}"

    # Check if it exists (for update vs create message)
    EXISTS=$(aws ssm get-parameter --name "${path}" --region "${REGION}" 2>/dev/null && echo "yes" || echo "no")

    aws ssm put-parameter \
        --name "${path}" \
        --value "${value}" \
        --type "SecureString" \
        --overwrite \
        --region "${REGION}" \
        --description "PLG Website secret (managed by manage-ssm-secrets.sh)" \
        > /dev/null

    if [ "$EXISTS" = "yes" ]; then
        log_success "Updated: ${name}"
    else
        log_success "Created: ${name}"
    fi
    echo "Value: $(mask_value "$value")"
}

cmd_set_from_env() {
    local name="$1"
    local env_var="$2"

    if [ -z "$name" ] || [ -z "$env_var" ]; then
        log_error "Secret name and environment variable name required"
        echo "Usage: $0 set-from-env <name> <env-var>"
        exit 1
    fi

    local value="${!env_var}"
    if [ -z "$value" ]; then
        log_error "Environment variable ${env_var} is not set or empty"
        exit 1
    fi

    cmd_set "$name" "$value"
}

cmd_delete() {
    local name="$1"
    if [ -z "$name" ]; then
        log_error "Secret name required"
        echo "Usage: $0 delete <name>"
        exit 1
    fi

    local path
    path=$(get_ssm_path "$name")
    log_info "Deleting: ${path}"

    aws ssm delete-parameter \
        --name "${path}" \
        --region "${REGION}" 2>/dev/null || {
        log_error "Secret not found or could not be deleted: ${name}"
        exit 1
    }

    log_success "Deleted: ${name}"
}

cmd_copy_from_secrets_manager() {
    log_info "Copying Stripe secrets from AWS Secrets Manager to SSM Parameter Store"
    log_info "Source: ${SM_STRIPE_PATH}"
    log_info "Target: ${SSM_PREFIX}/"
    echo ""

    # Fetch from Secrets Manager
    log_info "Fetching from Secrets Manager..."
    SM_VALUE=$(aws secretsmanager get-secret-value \
        --secret-id "${SM_STRIPE_PATH}" \
        --region "${REGION}" \
        --query "SecretString" \
        --output text 2>/dev/null) || {
        log_error "Could not fetch from Secrets Manager: ${SM_STRIPE_PATH}"
        log_info "Make sure the secret exists and you have access"
        exit 1
    }

    # Parse the JSON
    STRIPE_SECRET_KEY=$(echo "$SM_VALUE" | jq -r '.STRIPE_SECRET_KEY // empty')
    STRIPE_WEBHOOK_SECRET=$(echo "$SM_VALUE" | jq -r '.STRIPE_WEBHOOK_SECRET // empty')

    if [ -z "$STRIPE_SECRET_KEY" ]; then
        log_error "STRIPE_SECRET_KEY not found in Secrets Manager"
        exit 1
    fi

    if [ -z "$STRIPE_WEBHOOK_SECRET" ]; then
        log_warn "STRIPE_WEBHOOK_SECRET not found in Secrets Manager (may be optional)"
    fi

    # Copy to SSM
    log_info "Copying to SSM Parameter Store..."
    cmd_set "STRIPE_SECRET_KEY" "$STRIPE_SECRET_KEY"

    if [ -n "$STRIPE_WEBHOOK_SECRET" ]; then
        cmd_set "STRIPE_WEBHOOK_SECRET" "$STRIPE_WEBHOOK_SECRET"
    fi

    echo ""
    log_success "Copy complete!"
    log_info "Secrets are now accessible at SSR runtime via SSM Parameter Store"
}

# ───────────────────────────────────────────────────────────────────
# Main
# ───────────────────────────────────────────────────────────────────

if [ $# -eq 0 ]; then
    show_usage
    exit 0
fi

case "$1" in
    -h|--help)
        show_usage
        exit 0
        ;;
    list)
        check_aws
        cmd_list
        ;;
    get)
        check_aws
        cmd_get "$2"
        ;;
    set)
        check_aws
        cmd_set "$2" "$3"
        ;;
    set-from-env)
        check_aws
        cmd_set_from_env "$2" "$3"
        ;;
    delete)
        check_aws
        cmd_delete "$2"
        ;;
    copy-from-secrets-manager)
        check_aws
        cmd_copy_from_secrets_manager
        ;;
    *)
        log_error "Unknown command: $1"
        show_usage
        exit 1
        ;;
esac
