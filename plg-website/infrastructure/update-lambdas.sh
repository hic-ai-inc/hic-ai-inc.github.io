#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# HIC PLG Lambda Function Update Script
# ═══════════════════════════════════════════════════════════════════════════════
#
# Usage:
#   ./update-lambdas.sh [environment] [options]
#
# Examples:
#   ./update-lambdas.sh staging                    # Update all staging Lambdas
#   ./update-lambdas.sh staging --function stream-processor  # Update one function
#   ./update-lambdas.sh staging --dry-run          # Preview without deploying
#   ./update-lambdas.sh prod                       # Update all production Lambdas
#
# Options:
#   --function, -f   Update specific function only (stream-processor, customer-update, etc.)
#   --dry-run        Package but don't deploy
#   --help           Show this help message
#
# Prerequisites:
#   - AWS CLI configured with appropriate credentials
#   - zip command available
#
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ───────────────────────────────────────────────────────────────────────────────
# Configuration
# ───────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAMBDA_DIR="${SCRIPT_DIR}/lambda"
BUILD_DIR="${SCRIPT_DIR}/.lambda-build"

# Default values
ENVIRONMENT="${1:-staging}"
DRY_RUN=false
SPECIFIC_FUNCTION=""
REGION="${AWS_REGION:-us-east-1}"

# Lambda function definitions (directory name -> Lambda function name pattern)
declare -A LAMBDA_FUNCTIONS=(
    ["stream-processor"]="plg-stream-processor"
    ["customer-update"]="plg-customer-update"
    ["email-sender"]="plg-email-sender"
    ["scheduled-tasks"]="plg-scheduled-tasks"
    ["cognito-post-confirmation"]="plg-cognito-post-confirmation"
    ["cognito-pre-token"]="plg-cognito-pre-token"
)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ───────────────────────────────────────────────────────────────────────────────
# Helper Functions
# ───────────────────────────────────────────────────────────────────────────────

print_header() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
}

print_step() {
    echo -e "${YELLOW}▸${NC} $1"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

show_help() {
    head -25 "$0" | tail -20
    exit 0
}

cleanup() {
    if [[ -d "$BUILD_DIR" ]]; then
        rm -rf "$BUILD_DIR"
    fi
}

trap cleanup EXIT

# ───────────────────────────────────────────────────────────────────────────────
# Parse Arguments
# ───────────────────────────────────────────────────────────────────────────────

shift || true  # Remove first positional arg (environment)

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --function|-f)
            SPECIFIC_FUNCTION="$2"
            shift 2
            ;;
        --help|-h)
            show_help
            ;;
        --region)
            REGION="$2"
            shift 2
            ;;
        *)
            # Check if it's the environment (first positional)
            if [[ "$1" =~ ^(dev|staging|prod)$ ]]; then
                ENVIRONMENT="$1"
            else
                print_error "Unknown option: $1"
                show_help
            fi
            shift
            ;;
    esac
done

# ───────────────────────────────────────────────────────────────────────────────
# Validate Environment
# ───────────────────────────────────────────────────────────────────────────────

if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|prod)$ ]]; then
    print_error "Environment must be 'dev', 'staging', or 'prod'"
    exit 1
fi

# ───────────────────────────────────────────────────────────────────────────────
# Display Configuration
# ───────────────────────────────────────────────────────────────────────────────

print_header "🚀 HIC PLG Lambda Update"

echo ""
echo "  Environment:     ${ENVIRONMENT}"
echo "  Region:          ${REGION}"
echo "  Lambda Dir:      ${LAMBDA_DIR}"
echo "  Dry Run:         ${DRY_RUN}"
if [[ -n "$SPECIFIC_FUNCTION" ]]; then
    echo "  Function:        ${SPECIFIC_FUNCTION}"
fi
echo ""

# ───────────────────────────────────────────────────────────────────────────────
# Verify AWS Credentials
# ───────────────────────────────────────────────────────────────────────────────

print_step "Validating AWS credentials..."
AWS_ACCOUNT=$(aws sts get-caller-identity --query "Account" --output text 2>/dev/null || true)
if [[ -z "$AWS_ACCOUNT" ]]; then
    print_error "AWS credentials not configured or invalid"
    exit 1
fi
print_success "AWS Account: ${AWS_ACCOUNT}"

# ───────────────────────────────────────────────────────────────────────────────
# Create Build Directory
# ───────────────────────────────────────────────────────────────────────────────

print_step "Creating build directory..."
mkdir -p "$BUILD_DIR"

# ───────────────────────────────────────────────────────────────────────────────
# Package and Deploy Functions
# ───────────────────────────────────────────────────────────────────────────────

update_lambda() {
    local dir_name="$1"
    local base_name="${LAMBDA_FUNCTIONS[$dir_name]}"
    local function_name="${base_name}-${ENVIRONMENT}"
    local source_dir="${LAMBDA_DIR}/${dir_name}"
    local zip_file="${BUILD_DIR}/${dir_name}.zip"

    if [[ ! -d "$source_dir" ]]; then
        print_warning "Source directory not found: ${source_dir}"
        return 1
    fi

    print_step "Packaging ${dir_name}..."
    
    # Create zip from the function directory
    (cd "$source_dir" && zip -r "$zip_file" . -x "*.test.js" -x "__tests__/*" -x "node_modules/*" > /dev/null)
    
    local zip_size=$(du -h "$zip_file" | cut -f1)
    echo "    📦 Created ${zip_file} (${zip_size})"

    if [[ "$DRY_RUN" == "true" ]]; then
        print_warning "DRY RUN: Would update ${function_name}"
        return 0
    fi

    print_step "Deploying ${function_name}..."
    
    # Check if function exists
    if ! aws lambda get-function --function-name "$function_name" --region "$REGION" > /dev/null 2>&1; then
        print_warning "Function ${function_name} does not exist, skipping"
        return 1
    fi

    # Convert path to Windows format for AWS CLI fileb:// protocol (Git Bash compatibility)
    local zip_file_win="$zip_file"
    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
        # Convert /c/path to C:/path for Windows
        zip_file_win=$(cygpath -w "$zip_file" 2>/dev/null || echo "$zip_file" | sed 's|^/\([a-zA-Z]\)/|\1:/|')
    fi

    # Update function code
    aws lambda update-function-code \
        --function-name "$function_name" \
        --zip-file "fileb://${zip_file_win}" \
        --region "$REGION" \
        --output text \
        --query "LastModified" > /dev/null

    print_success "Updated ${function_name}"
    
    # Wait for update to complete
    print_step "Waiting for update to complete..."
    aws lambda wait function-updated \
        --function-name "$function_name" \
        --region "$REGION"
    
    print_success "${function_name} is ready"

    # ── Layer Version Update ──────────────────────────────────────────────────
    # Parse layer dependencies from source file and update to latest versions
    print_step "Checking layer versions for ${function_name}..."

    local layer_deps
    layer_deps=$(grep "Layer Dependencies:" "$source_dir/index.js" 2>/dev/null | sed 's/.*Layer Dependencies: //' | tr ',' '\n' | tr -d ' ')

    if [[ -n "$layer_deps" ]]; then
        local layer_arns=""
        local layers_updated=false

        # Get current layers on the function
        local current_layers
        current_layers=$(aws lambda get-function-configuration \
            --function-name "$function_name" \
            --region "$REGION" \
            --query "Layers[*].Arn" \
            --output text 2>/dev/null)

        for layer_name in $layer_deps; do
            # Get latest version ARN for this layer
            local latest_arn
            latest_arn=$(aws lambda list-layer-versions \
                --layer-name "$layer_name" \
                --region "$REGION" \
                --query "LayerVersions[0].LayerVersionArn" \
                --output text 2>/dev/null)

            if [[ -z "$latest_arn" || "$latest_arn" == "None" ]]; then
                print_warning "Layer ${layer_name} not found, skipping"
                continue
            fi

            layer_arns="${layer_arns} ${latest_arn}"

            # Check if current version differs
            if ! echo "$current_layers" | grep -q "$latest_arn"; then
                layers_updated=true
                local version_num
                version_num=$(echo "$latest_arn" | grep -o '[0-9]*$')
                echo "    ⬆️  ${layer_name} -> v${version_num}"
            fi
        done

        if [[ "$layers_updated" == "true" ]]; then
            if [[ "$DRY_RUN" == "true" ]]; then
                print_warning "DRY RUN: Would update layers for ${function_name}"
            else
                print_step "Updating layers for ${function_name}..."
                # shellcheck disable=SC2086
                aws lambda update-function-configuration \
                    --function-name "$function_name" \
                    --layers $layer_arns \
                    --region "$REGION" \
                    --output text \
                    --query "LastModified" > /dev/null

                aws lambda wait function-updated \
                    --function-name "$function_name" \
                    --region "$REGION"
                print_success "Layers updated for ${function_name}"
            fi
        else
            echo "    ✅ All layers at latest versions"
        fi
    else
        echo "    ℹ️  No layer dependencies declared"
    fi
}

# ───────────────────────────────────────────────────────────────────────────────
# Main Execution
# ───────────────────────────────────────────────────────────────────────────────

UPDATED=0
FAILED=0

if [[ -n "$SPECIFIC_FUNCTION" ]]; then
    # Update specific function
    if [[ -z "${LAMBDA_FUNCTIONS[$SPECIFIC_FUNCTION]:-}" ]]; then
        print_error "Unknown function: ${SPECIFIC_FUNCTION}"
        echo "Available functions: ${!LAMBDA_FUNCTIONS[*]}"
        exit 1
    fi
    
    if update_lambda "$SPECIFIC_FUNCTION"; then
        ((++UPDATED)) || true  # pre-increment to avoid exit code 1 when 0
    else
        ((++FAILED)) || true
    fi
else
    # Update all functions
    for dir_name in "${!LAMBDA_FUNCTIONS[@]}"; do
        echo ""
        if update_lambda "$dir_name"; then
            ((++UPDATED)) || true  # pre-increment to avoid exit code 1 when 0
        else
            ((++FAILED)) || true
        fi
    done
fi

# ───────────────────────────────────────────────────────────────────────────────
# Summary
# ───────────────────────────────────────────────────────────────────────────────

echo ""
print_header "📊 Update Summary"
echo ""
echo "  ✅ Updated:  ${UPDATED}"
echo "  ❌ Failed:   ${FAILED}"
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
    print_warning "This was a DRY RUN - no changes were made"
fi

if [[ $FAILED -gt 0 ]]; then
    exit 1
fi

print_success "Lambda update complete!"
