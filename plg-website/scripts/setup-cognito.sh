#!/bin/bash
#
# Cognito User Pool Setup Script
# 
# This script creates and configures an Amazon Cognito User Pool for the PLG website.
# Run this script with appropriate AWS credentials configured.
#
# Prerequisites:
# - AWS CLI v2 installed and configured
# - Appropriate IAM permissions for Cognito operations
# - Google OAuth credentials (Client ID and Secret) from Google Cloud Console
#
# Usage:
#   chmod +x scripts/setup-cognito.sh
#   ./scripts/setup-cognito.sh
#
# After running, update your .env.local and Amplify environment variables.

set -e

# ============================================
# CONFIGURATION - Update these values
# ============================================
AWS_REGION="us-east-1"
ENVIRONMENT="staging"  # staging or production
APP_NAME="mouse-plg"

# Domain prefix for Cognito Hosted UI (must be globally unique)
# Format: <prefix>.auth.<region>.amazoncognito.com
COGNITO_DOMAIN_PREFIX="mouse-${ENVIRONMENT}"

# Callback URLs (update for your environment)
if [ "$ENVIRONMENT" = "production" ]; then
  APP_URL="https://hic-ai.com"
else
  APP_URL="https://staging.hic-ai.com"
fi

# Google OAuth credentials (get these from Google Cloud Console)
# https://console.cloud.google.com/apis/credentials
GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}"
GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-}"

# ============================================
# VALIDATION
# ============================================
echo "🔍 Validating prerequisites..."

if ! command -v aws &> /dev/null; then
  echo "❌ AWS CLI is not installed. Please install it first."
  exit 1
fi

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
  echo "❌ AWS credentials not configured. Please run 'aws configure' first."
  exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "✅ Using AWS Account: $ACCOUNT_ID"
echo "✅ Region: $AWS_REGION"
echo "✅ Environment: $ENVIRONMENT"

# ============================================
# STEP 1: Create User Pool
# ============================================
echo ""
echo "📦 Step 1: Creating Cognito User Pool..."

USER_POOL_NAME="${APP_NAME}-${ENVIRONMENT}"

# Check if user pool already exists
EXISTING_POOL=$(aws cognito-idp list-user-pools --max-results 60 --region $AWS_REGION \
  --query "UserPools[?Name=='${USER_POOL_NAME}'].Id" --output text 2>/dev/null || echo "")

if [ -n "$EXISTING_POOL" ]; then
  echo "⚠️  User Pool '${USER_POOL_NAME}' already exists: $EXISTING_POOL"
  USER_POOL_ID=$EXISTING_POOL
else
  USER_POOL_ID=$(aws cognito-idp create-user-pool \
    --pool-name "$USER_POOL_NAME" \
    --region $AWS_REGION \
    --auto-verified-attributes email \
    --username-attributes email \
    --username-configuration "CaseSensitive=false" \
    --mfa-configuration OFF \
    --account-recovery-setting "RecoveryMechanisms=[{Priority=1,Name=verified_email}]" \
    --admin-create-user-config "AllowAdminCreateUserOnly=false" \
    --email-configuration "EmailSendingAccount=COGNITO_DEFAULT" \
    --user-attribute-update-settings "AttributesRequireVerificationBeforeUpdate=[email]" \
    --policies '{
      "PasswordPolicy": {
        "MinimumLength": 8,
        "RequireUppercase": true,
        "RequireLowercase": true,
        "RequireNumbers": true,
        "RequireSymbols": false,
        "TemporaryPasswordValidityDays": 7
      }
    }' \
    --schema '[
      {"Name": "email", "Required": true, "Mutable": true, "AttributeDataType": "String"},
      {"Name": "name", "Required": false, "Mutable": true, "AttributeDataType": "String"},
      {"Name": "account_type", "Required": false, "Mutable": true, "AttributeDataType": "String", "StringAttributeConstraints": {"MinLength": "1", "MaxLength": "50"}},
      {"Name": "org_id", "Required": false, "Mutable": true, "AttributeDataType": "String", "StringAttributeConstraints": {"MinLength": "0", "MaxLength": "100"}},
      {"Name": "org_role", "Required": false, "Mutable": true, "AttributeDataType": "String", "StringAttributeConstraints": {"MinLength": "0", "MaxLength": "50"}},
      {"Name": "stripe_customer_id", "Required": false, "Mutable": true, "AttributeDataType": "String", "StringAttributeConstraints": {"MinLength": "0", "MaxLength": "100"}},
      {"Name": "subscription_status", "Required": false, "Mutable": true, "AttributeDataType": "String", "StringAttributeConstraints": {"MinLength": "0", "MaxLength": "50"}},
      {"Name": "plan_type", "Required": false, "Mutable": true, "AttributeDataType": "String", "StringAttributeConstraints": {"MinLength": "0", "MaxLength": "50"}}
    ]' \
    --query 'UserPool.Id' --output text)
  
  echo "✅ Created User Pool: $USER_POOL_ID"
fi

# ============================================
# STEP 2: Configure Cognito Domain
# ============================================
echo ""
echo "🌐 Step 2: Configuring Cognito Hosted UI Domain..."

# Check if domain already exists
EXISTING_DOMAIN=$(aws cognito-idp describe-user-pool --user-pool-id $USER_POOL_ID --region $AWS_REGION \
  --query 'UserPool.Domain' --output text 2>/dev/null || echo "None")

if [ "$EXISTING_DOMAIN" != "None" ] && [ -n "$EXISTING_DOMAIN" ]; then
  echo "⚠️  Domain already configured: ${EXISTING_DOMAIN}.auth.${AWS_REGION}.amazoncognito.com"
  COGNITO_DOMAIN="${EXISTING_DOMAIN}.auth.${AWS_REGION}.amazoncognito.com"
else
  aws cognito-idp create-user-pool-domain \
    --domain "$COGNITO_DOMAIN_PREFIX" \
    --user-pool-id $USER_POOL_ID \
    --region $AWS_REGION 2>/dev/null || {
      # Domain might be taken, try with random suffix
      COGNITO_DOMAIN_PREFIX="${COGNITO_DOMAIN_PREFIX}-$(date +%s | tail -c 5)"
      aws cognito-idp create-user-pool-domain \
        --domain "$COGNITO_DOMAIN_PREFIX" \
        --user-pool-id $USER_POOL_ID \
        --region $AWS_REGION
    }
  
  COGNITO_DOMAIN="${COGNITO_DOMAIN_PREFIX}.auth.${AWS_REGION}.amazoncognito.com"
  echo "✅ Created domain: $COGNITO_DOMAIN"
fi

# ============================================
# STEP 3: Create App Client
# ============================================
echo ""
echo "📱 Step 3: Creating App Client..."

CLIENT_NAME="${APP_NAME}-${ENVIRONMENT}-client"

# Check if client already exists
EXISTING_CLIENT=$(aws cognito-idp list-user-pool-clients --user-pool-id $USER_POOL_ID --region $AWS_REGION \
  --query "UserPoolClients[?ClientName=='${CLIENT_NAME}'].ClientId" --output text 2>/dev/null || echo "")

if [ -n "$EXISTING_CLIENT" ]; then
  echo "⚠️  App Client '${CLIENT_NAME}' already exists: $EXISTING_CLIENT"
  CLIENT_ID=$EXISTING_CLIENT
else
  CLIENT_ID=$(aws cognito-idp create-user-pool-client \
    --user-pool-id $USER_POOL_ID \
    --client-name "$CLIENT_NAME" \
    --region $AWS_REGION \
    --generate-secret \
    --explicit-auth-flows "ALLOW_USER_SRP_AUTH" "ALLOW_REFRESH_TOKEN_AUTH" \
    --supported-identity-providers "COGNITO" \
    --callback-urls "${APP_URL}/auth/callback" "http://localhost:3000/auth/callback" \
    --logout-urls "${APP_URL}/" "http://localhost:3000/" \
    --allowed-o-auth-flows "code" \
    --allowed-o-auth-scopes "openid" "email" "profile" \
    --allowed-o-auth-flows-user-pool-client \
    --prevent-user-existence-errors ENABLED \
    --enable-token-revocation \
    --access-token-validity 1 \
    --id-token-validity 1 \
    --refresh-token-validity 30 \
    --token-validity-units '{"AccessToken":"hours","IdToken":"hours","RefreshToken":"days"}' \
    --read-attributes "email" "email_verified" "name" "custom:account_type" "custom:org_id" "custom:org_role" "custom:stripe_customer_id" "custom:subscription_status" "custom:plan_type" \
    --write-attributes "email" "name" "custom:account_type" "custom:org_id" "custom:org_role" "custom:stripe_customer_id" "custom:subscription_status" "custom:plan_type" \
    --query 'UserPoolClient.ClientId' --output text)
  
  echo "✅ Created App Client: $CLIENT_ID"
fi

# Get client secret
CLIENT_SECRET=$(aws cognito-idp describe-user-pool-client \
  --user-pool-id $USER_POOL_ID \
  --client-id $CLIENT_ID \
  --region $AWS_REGION \
  --query 'UserPoolClient.ClientSecret' --output text)

# ============================================
# STEP 4: Add Google Identity Provider (Optional)
# ============================================
echo ""
echo "🔐 Step 4: Configuring Google Identity Provider..."

if [ -n "$GOOGLE_CLIENT_ID" ] && [ -n "$GOOGLE_CLIENT_SECRET" ]; then
  # Check if Google IdP already exists
  EXISTING_IDP=$(aws cognito-idp list-identity-providers --user-pool-id $USER_POOL_ID --region $AWS_REGION \
    --query "Providers[?ProviderName=='Google'].ProviderName" --output text 2>/dev/null || echo "")
  
  if [ -n "$EXISTING_IDP" ]; then
    echo "⚠️  Google IdP already configured, updating..."
    aws cognito-idp update-identity-provider \
      --user-pool-id $USER_POOL_ID \
      --provider-name Google \
      --region $AWS_REGION \
      --provider-details "client_id=${GOOGLE_CLIENT_ID},client_secret=${GOOGLE_CLIENT_SECRET},authorize_scopes=openid email profile" \
      --attribute-mapping "email=email,name=name,username=sub" > /dev/null
  else
    aws cognito-idp create-identity-provider \
      --user-pool-id $USER_POOL_ID \
      --provider-name Google \
      --provider-type Google \
      --region $AWS_REGION \
      --provider-details "client_id=${GOOGLE_CLIENT_ID},client_secret=${GOOGLE_CLIENT_SECRET},authorize_scopes=openid email profile" \
      --attribute-mapping "email=email,name=name,username=sub" > /dev/null
    
    echo "✅ Added Google Identity Provider"
  fi
  
  # Update app client to include Google
  aws cognito-idp update-user-pool-client \
    --user-pool-id $USER_POOL_ID \
    --client-id $CLIENT_ID \
    --region $AWS_REGION \
    --supported-identity-providers "COGNITO" "Google" \
    --callback-urls "${APP_URL}/auth/callback" "http://localhost:3000/auth/callback" \
    --logout-urls "${APP_URL}/" "http://localhost:3000/" \
    --allowed-o-auth-flows "code" \
    --allowed-o-auth-scopes "openid" "email" "profile" \
    --allowed-o-auth-flows-user-pool-client > /dev/null
  
  echo "✅ Updated App Client with Google IdP"
else
  echo "⚠️  Skipping Google IdP setup (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET not set)"
  echo "   To add later, set these environment variables and re-run the script."
fi

# ============================================
# OUTPUT SUMMARY
# ============================================
echo ""
echo "============================================"
echo "🎉 Cognito Setup Complete!"
echo "============================================"
echo ""
echo "Add these to your .env.local file:"
echo ""
echo "NEXT_PUBLIC_COGNITO_USER_POOL_ID=$USER_POOL_ID"
echo "NEXT_PUBLIC_COGNITO_CLIENT_ID=$CLIENT_ID"
echo "NEXT_PUBLIC_COGNITO_DOMAIN=$COGNITO_DOMAIN"
echo "NEXT_PUBLIC_APP_URL=$APP_URL"
echo ""
echo "For server-side operations (if needed):"
echo "COGNITO_CLIENT_SECRET=$CLIENT_SECRET"
echo ""
echo "============================================"
echo "📋 Add to AWS Amplify Environment Variables:"
echo "============================================"
echo ""
echo "In Amplify Console > App Settings > Environment Variables:"
echo ""
echo "NEXT_PUBLIC_COGNITO_USER_POOL_ID = $USER_POOL_ID"
echo "NEXT_PUBLIC_COGNITO_CLIENT_ID = $CLIENT_ID"
echo "NEXT_PUBLIC_COGNITO_DOMAIN = $COGNITO_DOMAIN"
echo "NEXT_PUBLIC_APP_URL = $APP_URL"
echo ""

# Also for Google OAuth setup instructions
if [ -z "$GOOGLE_CLIENT_ID" ]; then
  echo "============================================"
  echo "📋 Google OAuth Setup (Do this in Google Cloud Console):"
  echo "============================================"
  echo ""
  echo "1. Go to: https://console.cloud.google.com/apis/credentials"
  echo "2. Create OAuth 2.0 Client ID (Web application)"
  echo "3. Authorized JavaScript origins:"
  echo "   - https://${COGNITO_DOMAIN}"
  echo "   - ${APP_URL}"
  echo "   - http://localhost:3000"
  echo ""
  echo "4. Authorized redirect URIs:"
  echo "   - https://${COGNITO_DOMAIN}/oauth2/idpresponse"
  echo ""
  echo "5. Then run this script again with:"
  echo "   GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy ./scripts/setup-cognito.sh"
  echo ""
fi

# Save config to file for reference
CONFIG_FILE="cognito-config-${ENVIRONMENT}.txt"
cat > $CONFIG_FILE << EOF
# Cognito Configuration for ${ENVIRONMENT}
# Generated: $(date)

USER_POOL_ID=$USER_POOL_ID
CLIENT_ID=$CLIENT_ID
CLIENT_SECRET=$CLIENT_SECRET
COGNITO_DOMAIN=$COGNITO_DOMAIN
APP_URL=$APP_URL
AWS_REGION=$AWS_REGION

# For .env.local:
NEXT_PUBLIC_COGNITO_USER_POOL_ID=$USER_POOL_ID
NEXT_PUBLIC_COGNITO_CLIENT_ID=$CLIENT_ID
NEXT_PUBLIC_COGNITO_DOMAIN=$COGNITO_DOMAIN
NEXT_PUBLIC_APP_URL=$APP_URL
EOF

echo "💾 Configuration saved to: $CONFIG_FILE"
echo ""
echo "Done! 🚀"
