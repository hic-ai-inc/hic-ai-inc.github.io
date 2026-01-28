#!/bin/bash
#
# Add Social Identity Providers to Cognito
#
# This script adds Google and GitHub as identity providers to your Cognito User Pool.
#
# Prerequisites:
# 1. Google OAuth credentials from Google Cloud Console
# 2. GitHub OAuth App from GitHub Developer Settings
#
# Usage:
#   # Google only:
#   GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy ./scripts/setup-social-idp.sh
#
#   # Google + GitHub:
#   GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy \
#   GITHUB_CLIENT_ID=xxx GITHUB_CLIENT_SECRET=yyy \
#   ./scripts/setup-social-idp.sh

set -e

# ============================================
# CONFIGURATION
# ============================================
AWS_REGION="us-east-1"
USER_POOL_ID="${COGNITO_USER_POOL_ID:-us-east-1_MDTi26EOf}"
CLIENT_ID="${COGNITO_CLIENT_ID:-4a9etnr30ovab9k3np3u0mb4b2}"
COGNITO_DOMAIN="${COGNITO_DOMAIN:-mouse-staging.auth.us-east-1.amazoncognito.com}"
APP_URL="${APP_URL:-https://staging.hic-ai.com}"

# Social provider credentials (from environment)
GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}"
GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-}"
GITHUB_CLIENT_ID="${GITHUB_CLIENT_ID:-}"
GITHUB_CLIENT_SECRET="${GITHUB_CLIENT_SECRET:-}"

echo "============================================"
echo "🔐 Cognito Social Identity Provider Setup"
echo "============================================"
echo ""
echo "User Pool ID: $USER_POOL_ID"
echo "App Client ID: $CLIENT_ID"
echo "Cognito Domain: $COGNITO_DOMAIN"
echo ""

# Track which providers we're adding
PROVIDERS=("COGNITO")

# ============================================
# GOOGLE SETUP
# ============================================
if [ -n "$GOOGLE_CLIENT_ID" ] && [ -n "$GOOGLE_CLIENT_SECRET" ]; then
  echo "📱 Setting up Google Identity Provider..."
  
  # Check if Google IdP already exists
  EXISTING=$(aws cognito-idp list-identity-providers \
    --user-pool-id $USER_POOL_ID \
    --region $AWS_REGION \
    --query "Providers[?ProviderName=='Google'].ProviderName" \
    --output text 2>/dev/null || echo "")
  
  if [ -n "$EXISTING" ]; then
    echo "   Updating existing Google IdP..."
    aws cognito-idp update-identity-provider \
      --user-pool-id $USER_POOL_ID \
      --provider-name Google \
      --region $AWS_REGION \
      --provider-details \
        "client_id=${GOOGLE_CLIENT_ID}" \
        "client_secret=${GOOGLE_CLIENT_SECRET}" \
        "authorize_scopes=openid email profile" \
      --attribute-mapping \
        "email=email" \
        "name=name" \
        "picture=picture" \
        "username=sub" > /dev/null
  else
    echo "   Creating Google IdP..."
    aws cognito-idp create-identity-provider \
      --user-pool-id $USER_POOL_ID \
      --provider-name Google \
      --provider-type Google \
      --region $AWS_REGION \
      --provider-details \
        "client_id=${GOOGLE_CLIENT_ID}" \
        "client_secret=${GOOGLE_CLIENT_SECRET}" \
        "authorize_scopes=openid email profile" \
      --attribute-mapping \
        "email=email" \
        "name=name" \
        "picture=picture" \
        "username=sub" > /dev/null
  fi
  
  PROVIDERS+=("Google")
  echo "   ✅ Google IdP configured"
else
  echo "⚠️  Skipping Google (GOOGLE_CLIENT_ID/SECRET not set)"
  echo ""
  echo "   To set up Google:"
  echo "   1. Go to: https://console.cloud.google.com/apis/credentials"
  echo "   2. Create OAuth 2.0 Client ID (Web application)"
  echo "   3. Authorized JavaScript origins:"
  echo "      - https://${COGNITO_DOMAIN}"
  echo "      - ${APP_URL}"
  echo "      - http://localhost:3000"
  echo "   4. Authorized redirect URIs:"
  echo "      - https://${COGNITO_DOMAIN}/oauth2/idpresponse"
  echo ""
fi

# ============================================
# GITHUB SETUP (via OIDC)
# ============================================
if [ -n "$GITHUB_CLIENT_ID" ] && [ -n "$GITHUB_CLIENT_SECRET" ]; then
  echo ""
  echo "🐙 Setting up GitHub Identity Provider (via OIDC)..."
  
  # Check if GitHub OIDC IdP already exists
  EXISTING=$(aws cognito-idp list-identity-providers \
    --user-pool-id $USER_POOL_ID \
    --region $AWS_REGION \
    --query "Providers[?ProviderName=='GitHub'].ProviderName" \
    --output text 2>/dev/null || echo "")
  
  # GitHub OIDC endpoints
  # Note: GitHub's OIDC is non-standard, so we use their OAuth endpoints
  GITHUB_ISSUER="https://github.com"
  GITHUB_AUTH_URL="https://github.com/login/oauth/authorize"
  GITHUB_TOKEN_URL="https://github.com/login/oauth/access_token"
  GITHUB_USERINFO_URL="https://api.github.com/user"
  GITHUB_JWKS_URL="https://token.actions.githubusercontent.com/.well-known/jwks"
  
  if [ -n "$EXISTING" ]; then
    echo "   Updating existing GitHub OIDC IdP..."
    aws cognito-idp update-identity-provider \
      --user-pool-id $USER_POOL_ID \
      --provider-name GitHub \
      --region $AWS_REGION \
      --provider-details \
        "client_id=${GITHUB_CLIENT_ID}" \
        "client_secret=${GITHUB_CLIENT_SECRET}" \
        "authorize_scopes=user:email read:user" \
        "oidc_issuer=${GITHUB_ISSUER}" \
        "authorize_url=${GITHUB_AUTH_URL}" \
        "token_url=${GITHUB_TOKEN_URL}" \
        "attributes_url=${GITHUB_USERINFO_URL}" \
        "attributes_url_add_attributes=false" \
      --attribute-mapping \
        "email=email" \
        "name=name" \
        "picture=avatar_url" \
        "username=id" > /dev/null
  else
    echo "   Creating GitHub OIDC IdP..."
    aws cognito-idp create-identity-provider \
      --user-pool-id $USER_POOL_ID \
      --provider-name GitHub \
      --provider-type OIDC \
      --region $AWS_REGION \
      --provider-details \
        "client_id=${GITHUB_CLIENT_ID}" \
        "client_secret=${GITHUB_CLIENT_SECRET}" \
        "authorize_scopes=user:email read:user" \
        "oidc_issuer=${GITHUB_ISSUER}" \
        "authorize_url=${GITHUB_AUTH_URL}" \
        "token_url=${GITHUB_TOKEN_URL}" \
        "attributes_url=${GITHUB_USERINFO_URL}" \
        "attributes_url_add_attributes=false" \
      --attribute-mapping \
        "email=email" \
        "name=name" \
        "picture=avatar_url" \
        "username=id" > /dev/null
  fi
  
  PROVIDERS+=("GitHub")
  echo "   ✅ GitHub OIDC IdP configured"
else
  echo ""
  echo "⚠️  Skipping GitHub (GITHUB_CLIENT_ID/SECRET not set)"
  echo ""
  echo "   To set up GitHub:"
  echo "   1. Go to: https://github.com/settings/developers"
  echo "   2. Click 'New OAuth App' (or 'Register a new application')"
  echo "   3. Application name: Mouse by HIC AI"
  echo "   4. Homepage URL: ${APP_URL}"
  echo "   5. Authorization callback URL:"
  echo "      https://${COGNITO_DOMAIN}/oauth2/idpresponse"
  echo "   6. Note the Client ID and generate a Client Secret"
  echo ""
fi

# ============================================
# UPDATE APP CLIENT WITH ALL PROVIDERS
# ============================================
echo ""
echo "🔄 Updating App Client with identity providers..."

# Build providers list as JSON array
PROVIDERS_JSON=$(printf '%s\n' "${PROVIDERS[@]}" | jq -R . | jq -s .)

aws cognito-idp update-user-pool-client \
  --user-pool-id $USER_POOL_ID \
  --client-id $CLIENT_ID \
  --region $AWS_REGION \
  --supported-identity-providers ${PROVIDERS[@]} \
  --callback-urls "${APP_URL}/auth/callback" "http://localhost:3000/auth/callback" \
  --logout-urls "${APP_URL}/" "http://localhost:3000/" \
  --allowed-o-auth-flows "code" \
  --allowed-o-auth-scopes "openid" "email" "profile" \
  --allowed-o-auth-flows-user-pool-client > /dev/null

echo "✅ App Client updated with providers: ${PROVIDERS[*]}"

# ============================================
# SUMMARY
# ============================================
echo ""
echo "============================================"
echo "🎉 Social Identity Provider Setup Complete!"
echo "============================================"
echo ""
echo "Configured providers:"
for p in "${PROVIDERS[@]}"; do
  echo "  ✓ $p"
done
echo ""
echo "Cognito Hosted UI: https://${COGNITO_DOMAIN}/login"
echo ""

# Show which providers still need setup
if [ -z "$GOOGLE_CLIENT_ID" ] || [ -z "$GITHUB_CLIENT_ID" ]; then
  echo "To add remaining providers, run:"
  echo ""
  if [ -z "$GOOGLE_CLIENT_ID" ]; then
    echo "  GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy \\"
  fi
  if [ -z "$GITHUB_CLIENT_ID" ]; then
    echo "  GITHUB_CLIENT_ID=xxx GITHUB_CLIENT_SECRET=yyy \\"
  fi
  echo "  ./scripts/setup-social-idp.sh"
fi
