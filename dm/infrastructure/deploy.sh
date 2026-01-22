#!/bin/bash
set -euo pipefail

# Validation function for environment and inputs
validate_environment() {
    echo "🔍 Validating environment and inputs..."
    
    # Validate AWS credentials
    if ! aws sts get-caller-identity &>/dev/null; then
        echo "❌ ERROR: No valid AWS credentials found"
        echo "   Please configure AWS credentials using 'aws configure' or environment variables"
        exit 1
    fi
    
    # Validate bucket names follow AWS S3 naming rules
    if [[ ! "$ARTIFACT_BUCKET_NAME" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]]; then
        echo "❌ ERROR: Invalid artifact bucket name format: $ARTIFACT_BUCKET_NAME"
        echo "   S3 bucket names must be 3-63 characters, lowercase, start/end with alphanumeric"
        exit 1
    fi
    
    if [[ ! "$TRAIL_BUCKET_NAME" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]]; then
        echo "❌ ERROR: Invalid trail bucket name format: $TRAIL_BUCKET_NAME"
        echo "   S3 bucket names must be 3-63 characters, lowercase, start/end with alphanumeric"
        exit 1
    fi
    
    # Validate region format
    if [[ ! "$REGION" =~ ^[a-z0-9-]+$ ]]; then
        echo "❌ ERROR: Invalid AWS region format: $REGION"
        exit 1
    fi
    
    # Validate numeric parameters
    if ! [[ "$CloudWatchRetentionDays" =~ ^[0-9]+$ ]] || [ "$CloudWatchRetentionDays" -lt 1 ]; then
        echo "❌ ERROR: CloudWatch retention days must be a positive integer: $CloudWatchRetentionDays"
        exit 1
    fi
    
    # Validate template file exists
    if [[ ! -f "$TEMPLATE_FILE" ]]; then
        echo "❌ ERROR: CloudFormation template not found: $TEMPLATE_FILE"
        exit 1
    fi
    
    # Validate we can access the specified region
    if ! aws ec2 describe-regions --region "$REGION" &>/dev/null; then
        echo "❌ ERROR: Cannot access AWS region: $REGION"
        exit 1
    fi
    
    echo "✅ Environment validation passed"
    echo "   AWS Account: $(aws sts get-caller-identity --query Account --output text)"
    echo "   Region: $REGION"
    echo "   Artifact Bucket: $ARTIFACT_BUCKET_NAME"
    echo "   Trail Bucket: $TRAIL_BUCKET_NAME"
}

STACK_NAME="hic-dm-layer-artifacts"
TEMPLATE_FILE="lambda-layer-artifact-repository-stack.yaml"
REGION="us-east-1"

# You must supply globally unique bucket names
ARTIFACT_BUCKET_NAME=${ARTIFACT_BUCKET_NAME:-"hic-dm-artifacts-${REGION}"}
TRAIL_BUCKET_NAME=${TRAIL_BUCKET_NAME:-"hic-dm-cloudtrail-${REGION}"}

# Allow override via env or args
CloudWatchRetentionDays=${CloudWatchRetentionDays:-90}
TrailName=${TrailName:-hic-dm-artifact-trail}
ALLOWED_PRINCIPALS=${ALLOWED_PRINCIPALS:-""}

# Validate allowed principals format if provided
if [[ -n "$ALLOWED_PRINCIPALS" ]]; then
    # Check each principal ARN format
    IFS=',' read -ra PRINCIPALS <<< "$ALLOWED_PRINCIPALS"
    for principal in "${PRINCIPALS[@]}"; do
        if [[ ! "$principal" =~ ^arn:aws:iam::[0-9]{12}:(role|user)/.+ ]]; then
            echo "❌ ERROR: Invalid principal ARN format: $principal"
            echo "   Expected format: arn:aws:iam::123456789012:role/RoleName"
            exit 1
        fi
    done
    echo "✅ Validated ${#PRINCIPALS[@]} allowed principal(s)"
fi

# Validate environment before proceeding
validate_environment

echo "🚀 Deploying $STACK_NAME to $REGION..."
aws cloudformation deploy \
  --stack-name "$STACK_NAME" \
  --template-file "$TEMPLATE_FILE" \
  --capabilities CAPABILITY_NAMED_IAM \
  --region "$REGION" \
  --parameter-overrides \
      ArtifactBucketName="$ARTIFACT_BUCKET_NAME" \
      TrailBucketName="$TRAIL_BUCKET_NAME" \
      CloudWatchLogRetentionDays="$CloudWatchRetentionDays" \
      TrailName="$TrailName" \
      AllowedPrincipals="$ALLOWED_PRINCIPALS"

echo "✅ Deployment complete."
