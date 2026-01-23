#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# HIC PLG Infrastructure Deployment Script
# ═══════════════════════════════════════════════════════════════════════════════
#
# Usage:
#   ./deploy.sh [environment] [options]
#
# Examples:
#   ./deploy.sh dev --dry-run        # Preview changes for dev
#   ./deploy.sh staging              # Deploy to staging
#   ./deploy.sh prod --dry-run       # Preview production changes
#   ./deploy.sh prod                 # Deploy to production
#
# Options:
#   --dry-run     Preview changes without deploying
#   --skip-upload Skip S3 template upload (use existing)
#   --help        Show this help message
#
# Prerequisites:
#   - AWS CLI configured with appropriate credentials
#   - S3 bucket for CloudFormation templates (created automatically)
#
# Per: 20260123_INFRASTRUCTURE_GAP_ANALYSIS_AND_PLAN.md
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ───────────────────────────────────────────────────────────────────────────────
# Configuration
# ───────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATES_DIR="${SCRIPT_DIR}/cloudformation"
PARAMS_DIR="${SCRIPT_DIR}/parameters"

# Default values
ENVIRONMENT="${1:-dev}"
DRY_RUN=false
SKIP_UPLOAD=false
REGION="${AWS_REGION:-us-east-1}"

# Stack naming
STACK_NAME="hic-plg-${ENVIRONMENT}"
TEMPLATES_BUCKET="hic-plg-templates-${ENVIRONMENT}"

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
    head -35 "$0" | tail -30
    exit 0
}

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
        --skip-upload)
            SKIP_UPLOAD=true
            shift
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
                STACK_NAME="hic-plg-${ENVIRONMENT}"
                TEMPLATES_BUCKET="hic-plg-templates-${ENVIRONMENT}"
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

PARAMS_FILE="${PARAMS_DIR}/${ENVIRONMENT}.json"
if [[ ! -f "$PARAMS_FILE" ]]; then
    print_error "Parameters file not found: ${PARAMS_FILE}"
    exit 1
fi

# ───────────────────────────────────────────────────────────────────────────────
# Display Configuration
# ───────────────────────────────────────────────────────────────────────────────

print_header "🚀 HIC PLG Infrastructure Deployment"

echo ""
echo "  Environment:     ${ENVIRONMENT}"
echo "  Stack Name:      ${STACK_NAME}"
echo "  Region:          ${REGION}"
echo "  Templates:       ${TEMPLATES_DIR}"
echo "  Parameters:      ${PARAMS_FILE}"
echo "  Dry Run:         ${DRY_RUN}"
echo ""

# Production confirmation
if [[ "$ENVIRONMENT" == "prod" && "$DRY_RUN" == "false" ]]; then
    print_warning "You are about to deploy to PRODUCTION!"
    read -p "Type 'yes' to confirm: " confirm
    if [[ "$confirm" != "yes" ]]; then
        print_error "Deployment cancelled"
        exit 1
    fi
fi

# ───────────────────────────────────────────────────────────────────────────────
# Validate AWS Credentials
# ───────────────────────────────────────────────────────────────────────────────

print_step "Validating AWS credentials..."

if ! aws sts get-caller-identity &>/dev/null; then
    print_error "No valid AWS credentials found"
    echo "  Run: aws configure"
    exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
print_success "AWS Account: ${ACCOUNT_ID}"

# ───────────────────────────────────────────────────────────────────────────────
# Create/Verify S3 Bucket for Templates
# ───────────────────────────────────────────────────────────────────────────────

print_step "Ensuring S3 bucket exists: ${TEMPLATES_BUCKET}..."

if ! aws s3api head-bucket --bucket "$TEMPLATES_BUCKET" 2>/dev/null; then
    print_step "Creating S3 bucket..."
    aws s3api create-bucket \
        --bucket "$TEMPLATES_BUCKET" \
        --region "$REGION" \
        $(if [ "$REGION" != "us-east-1" ]; then echo "--create-bucket-configuration LocationConstraint=$REGION"; fi)
    
    # Enable versioning
    aws s3api put-bucket-versioning \
        --bucket "$TEMPLATES_BUCKET" \
        --versioning-configuration Status=Enabled
    
    print_success "S3 bucket created: ${TEMPLATES_BUCKET}"
else
    print_success "S3 bucket exists: ${TEMPLATES_BUCKET}"
fi

# ───────────────────────────────────────────────────────────────────────────────
# Upload CloudFormation Templates
# ───────────────────────────────────────────────────────────────────────────────

if [[ "$SKIP_UPLOAD" == "false" ]]; then
    print_step "Uploading CloudFormation templates to S3..."
    
    # Validate all templates first
    for template in "${TEMPLATES_DIR}"/*.yaml; do
        template_name=$(basename "$template")
        print_step "  Validating ${template_name}..."
        
        if ! aws cloudformation validate-template \
            --template-body "file://${template}" \
            --region "$REGION" > /dev/null 2>&1; then
            print_error "Template validation failed: ${template_name}"
            aws cloudformation validate-template \
                --template-body "file://${template}" \
                --region "$REGION"
            exit 1
        fi
    done
    print_success "All templates validated"
    
    # Upload templates
    aws s3 sync "$TEMPLATES_DIR" "s3://${TEMPLATES_BUCKET}/cloudformation/" \
        --delete \
        --exclude ".DS_Store"
    
    print_success "Templates uploaded to s3://${TEMPLATES_BUCKET}/cloudformation/"
else
    print_warning "Skipping template upload (--skip-upload)"
fi

# ───────────────────────────────────────────────────────────────────────────────
# Retrieve HIC Lambda Layer ARNs
# ───────────────────────────────────────────────────────────────────────────────

print_step "Retrieving HIC Lambda layer versions..."

# Retrieve layer versions in parallel for efficiency
HIC_BASE_LAYER_VERSION=""
HIC_MESSAGING_LAYER_VERSION=""
HIC_DYNAMODB_LAYER_VERSION=""
HIC_SES_LAYER_VERSION=""
HIC_CONFIG_LAYER_VERSION=""

{
    HIC_BASE_LAYER_VERSION=$(aws lambda list-layer-versions \
        --layer-name "hic-base-layer" \
        --region "${REGION}" \
        --query 'LayerVersions[0].Version' \
        --output text 2>/dev/null)
} &
{
    HIC_MESSAGING_LAYER_VERSION=$(aws lambda list-layer-versions \
        --layer-name "hic-messaging-layer" \
        --region "${REGION}" \
        --query 'LayerVersions[0].Version' \
        --output text 2>/dev/null)
} &
{
    HIC_DYNAMODB_LAYER_VERSION=$(aws lambda list-layer-versions \
        --layer-name "hic-dynamodb-layer" \
        --region "${REGION}" \
        --query 'LayerVersions[0].Version' \
        --output text 2>/dev/null)
} &
{
    HIC_SES_LAYER_VERSION=$(aws lambda list-layer-versions \
        --layer-name "hic-ses-layer" \
        --region "${REGION}" \
        --query 'LayerVersions[0].Version' \
        --output text 2>/dev/null)
} &
{
    HIC_CONFIG_LAYER_VERSION=$(aws lambda list-layer-versions \
        --layer-name "hic-config-layer" \
        --region "${REGION}" \
        --query 'LayerVersions[0].Version' \
        --output text 2>/dev/null)
} &
wait

# Re-fetch (parallel execution doesn't export to parent shell)
HIC_BASE_LAYER_VERSION=$(aws lambda list-layer-versions \
    --layer-name "hic-base-layer" \
    --region "${REGION}" \
    --query 'LayerVersions[0].Version' \
    --output text 2>/dev/null)
HIC_MESSAGING_LAYER_VERSION=$(aws lambda list-layer-versions \
    --layer-name "hic-messaging-layer" \
    --region "${REGION}" \
    --query 'LayerVersions[0].Version' \
    --output text 2>/dev/null)
HIC_DYNAMODB_LAYER_VERSION=$(aws lambda list-layer-versions \
    --layer-name "hic-dynamodb-layer" \
    --region "${REGION}" \
    --query 'LayerVersions[0].Version' \
    --output text 2>/dev/null)
HIC_SES_LAYER_VERSION=$(aws lambda list-layer-versions \
    --layer-name "hic-ses-layer" \
    --region "${REGION}" \
    --query 'LayerVersions[0].Version' \
    --output text 2>/dev/null)
HIC_CONFIG_LAYER_VERSION=$(aws lambda list-layer-versions \
    --layer-name "hic-config-layer" \
    --region "${REGION}" \
    --query 'LayerVersions[0].Version' \
    --output text 2>/dev/null)

# Validate layers exist
MISSING_LAYERS=""
if [[ -z "$HIC_BASE_LAYER_VERSION" || "$HIC_BASE_LAYER_VERSION" == "None" ]]; then
    MISSING_LAYERS="${MISSING_LAYERS} hic-base-layer"
fi
if [[ -z "$HIC_MESSAGING_LAYER_VERSION" || "$HIC_MESSAGING_LAYER_VERSION" == "None" ]]; then
    MISSING_LAYERS="${MISSING_LAYERS} hic-messaging-layer"
fi
if [[ -z "$HIC_DYNAMODB_LAYER_VERSION" || "$HIC_DYNAMODB_LAYER_VERSION" == "None" ]]; then
    MISSING_LAYERS="${MISSING_LAYERS} hic-dynamodb-layer"
fi
if [[ -z "$HIC_SES_LAYER_VERSION" || "$HIC_SES_LAYER_VERSION" == "None" ]]; then
    MISSING_LAYERS="${MISSING_LAYERS} hic-ses-layer"
fi
if [[ -z "$HIC_CONFIG_LAYER_VERSION" || "$HIC_CONFIG_LAYER_VERSION" == "None" ]]; then
    MISSING_LAYERS="${MISSING_LAYERS} hic-config-layer"
fi

if [[ -n "$MISSING_LAYERS" ]]; then
    print_error "Missing Lambda layers:${MISSING_LAYERS}"
    echo ""
    echo "  Deploy HIC layers first using the dm/layers scripts:"
    echo "    cd dm/layers"
    echo "    ./base/publish.sh && ./messaging/publish.sh && ./dynamodb/publish.sh && ./ses/publish.sh && ./config/publish.sh"
    echo ""
    exit 1
fi

# Construct layer ARNs
HIC_BASE_LAYER_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:layer:hic-base-layer:${HIC_BASE_LAYER_VERSION}"
HIC_MESSAGING_LAYER_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:layer:hic-messaging-layer:${HIC_MESSAGING_LAYER_VERSION}"
HIC_DYNAMODB_LAYER_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:layer:hic-dynamodb-layer:${HIC_DYNAMODB_LAYER_VERSION}"
HIC_SES_LAYER_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:layer:hic-ses-layer:${HIC_SES_LAYER_VERSION}"
HIC_CONFIG_LAYER_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:layer:hic-config-layer:${HIC_CONFIG_LAYER_VERSION}"

print_success "Lambda layers found:"
echo "    hic-base-layer:${HIC_BASE_LAYER_VERSION}"
echo "    hic-messaging-layer:${HIC_MESSAGING_LAYER_VERSION}"
echo "    hic-dynamodb-layer:${HIC_DYNAMODB_LAYER_VERSION}"
echo "    hic-ses-layer:${HIC_SES_LAYER_VERSION}"
echo "    hic-config-layer:${HIC_CONFIG_LAYER_VERSION}"

# ───────────────────────────────────────────────────────────────────────────────
# Merge Layer ARNs into Parameters
# ───────────────────────────────────────────────────────────────────────────────

print_step "Merging layer ARNs into parameters..."

# Create temporary parameters file with layer ARNs
TEMP_PARAMS_FILE=$(mktemp)
trap "rm -f $TEMP_PARAMS_FILE" EXIT

jq --arg baseArn "$HIC_BASE_LAYER_ARN" \
   --arg messagingArn "$HIC_MESSAGING_LAYER_ARN" \
   --arg dynamoArn "$HIC_DYNAMODB_LAYER_ARN" \
   --arg sesArn "$HIC_SES_LAYER_ARN" \
   --arg configArn "$HIC_CONFIG_LAYER_ARN" \
   '. + [
     {"ParameterKey": "HicBaseLayerArn", "ParameterValue": $baseArn},
     {"ParameterKey": "HicMessagingLayerArn", "ParameterValue": $messagingArn},
     {"ParameterKey": "HicDynamoDBLayerArn", "ParameterValue": $dynamoArn},
     {"ParameterKey": "HicSesLayerArn", "ParameterValue": $sesArn},
     {"ParameterKey": "HicConfigLayerArn", "ParameterValue": $configArn}
   ]' "$PARAMS_FILE" > "$TEMP_PARAMS_FILE"

print_success "Parameters prepared with layer ARNs"

# ───────────────────────────────────────────────────────────────────────────────
# Create/Update Stack
# ───────────────────────────────────────────────────────────────────────────────

print_step "Checking if stack exists..."

STACK_EXISTS=false
if aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" &>/dev/null; then
    STACK_EXISTS=true
    print_success "Stack exists, will update"
else
    print_success "Stack does not exist, will create"
fi

# Create change set
CHANGE_SET_NAME="deploy-$(date +%Y%m%d-%H%M%S)"
CHANGE_SET_TYPE=$(if [ "$STACK_EXISTS" == "true" ]; then echo "UPDATE"; else echo "CREATE"; fi)

print_step "Creating change set: ${CHANGE_SET_NAME}..."

aws cloudformation create-change-set \
    --stack-name "$STACK_NAME" \
    --change-set-name "$CHANGE_SET_NAME" \
    --template-url "https://${TEMPLATES_BUCKET}.s3.amazonaws.com/cloudformation/plg-main-stack.yaml" \
    --parameters "file://${TEMP_PARAMS_FILE}" \
    --capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND \
    --region "$REGION" \
    --change-set-type "$CHANGE_SET_TYPE" \
    --tags \
        Key=Environment,Value="$ENVIRONMENT" \
        Key=Application,Value=plg-website \
        Key=ManagedBy,Value=cloudformation

# Wait for change set
print_step "Waiting for change set creation..."

CHANGE_SET_STATUS=""
while [[ "$CHANGE_SET_STATUS" != "CREATE_COMPLETE" && "$CHANGE_SET_STATUS" != "FAILED" ]]; do
    sleep 2
    CHANGE_SET_STATUS=$(aws cloudformation describe-change-set \
        --stack-name "$STACK_NAME" \
        --change-set-name "$CHANGE_SET_NAME" \
        --region "$REGION" \
        --query 'Status' \
        --output text)
done

if [[ "$CHANGE_SET_STATUS" == "FAILED" ]]; then
    STATUS_REASON=$(aws cloudformation describe-change-set \
        --stack-name "$STACK_NAME" \
        --change-set-name "$CHANGE_SET_NAME" \
        --region "$REGION" \
        --query 'StatusReason' \
        --output text)
    
    if [[ "$STATUS_REASON" == *"didn't contain changes"* ]]; then
        print_warning "No changes detected"
        aws cloudformation delete-change-set \
            --stack-name "$STACK_NAME" \
            --change-set-name "$CHANGE_SET_NAME" \
            --region "$REGION"
        exit 0
    else
        print_error "Change set creation failed: ${STATUS_REASON}"
        exit 1
    fi
fi

# ───────────────────────────────────────────────────────────────────────────────
# Display Proposed Changes
# ───────────────────────────────────────────────────────────────────────────────

print_header "📋 Proposed Changes"

aws cloudformation describe-change-set \
    --stack-name "$STACK_NAME" \
    --change-set-name "$CHANGE_SET_NAME" \
    --region "$REGION" \
    --query 'Changes[*].ResourceChange.{Action:Action,LogicalId:LogicalResourceId,Type:ResourceType,Replacement:Replacement}' \
    --output table

# ───────────────────────────────────────────────────────────────────────────────
# Dry Run Exit
# ───────────────────────────────────────────────────────────────────────────────

if [[ "$DRY_RUN" == "true" ]]; then
    print_header "🔍 DRY RUN MODE - No changes applied"
    echo ""
    echo "  To deploy these changes, run:"
    echo "    ./deploy.sh ${ENVIRONMENT}"
    echo ""
    
    # Clean up change set
    aws cloudformation delete-change-set \
        --stack-name "$STACK_NAME" \
        --change-set-name "$CHANGE_SET_NAME" \
        --region "$REGION"
    
    exit 0
fi

# ───────────────────────────────────────────────────────────────────────────────
# Execute Change Set
# ───────────────────────────────────────────────────────────────────────────────

print_step "Executing change set..."

aws cloudformation execute-change-set \
    --stack-name "$STACK_NAME" \
    --change-set-name "$CHANGE_SET_NAME" \
    --region "$REGION"

# Wait for deployment
print_step "Waiting for deployment to complete..."
echo "  (This may take 5-15 minutes for initial deployment)"

if [[ "$STACK_EXISTS" == "true" ]]; then
    aws cloudformation wait stack-update-complete \
        --stack-name "$STACK_NAME" \
        --region "$REGION"
else
    aws cloudformation wait stack-create-complete \
        --stack-name "$STACK_NAME" \
        --region "$REGION"
fi

# ───────────────────────────────────────────────────────────────────────────────
# Display Outputs
# ───────────────────────────────────────────────────────────────────────────────

print_header "✅ Deployment Complete!"

echo ""
echo "Stack Outputs:"
echo ""

aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs[*].{Key:OutputKey,Value:OutputValue}' \
    --output table

echo ""
print_success "PLG infrastructure deployed to ${ENVIRONMENT}"
echo ""
echo "Next steps:"
echo "  1. Add SES DNS records to GoDaddy (see AWS SES Console)"
echo "  2. Configure Amplify with the AmplifyExecutionRoleArn"
echo "  3. Set environment variables in Amplify Console"
echo "  4. Run: npm run dev (in plg-website/)"
echo ""
