#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# run-stripe-portal-setup.sh
#
# Wrapper script that fetches the Stripe secret key from AWS Secrets Manager,
# sets the required price ID env vars, and runs setup-stripe-portal.js.
#
# Usage:
#   ./scripts/run-stripe-portal-setup.sh           # test mode (default)
#   ./scripts/run-stripe-portal-setup.sh --live     # live mode
#   ./scripts/run-stripe-portal-setup.sh --dry-run  # dry run
#
# Requires: AWS SSO login active, node available
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---------------------------------------------------------------------------
# Parse flags — pass through to setup-stripe-portal.js
# ---------------------------------------------------------------------------
FLAGS=()
for arg in "$@"; do
  FLAGS+=("$arg")
done

# ---------------------------------------------------------------------------
# Fetch Stripe secret key from AWS Secrets Manager
# ---------------------------------------------------------------------------
echo "🔑 Fetching Stripe secret key from AWS Secrets Manager (plg/staging/stripe)..."

SECRET_JSON=$(aws secretsmanager get-secret-value \
  --secret-id "plg/staging/stripe" \
  --query "SecretString" \
  --output text)

if [[ -z "$SECRET_JSON" ]]; then
  echo "❌ Failed to retrieve secret from Secrets Manager"
  exit 1
fi

# Extract STRIPE_SECRET_KEY from JSON using node (no external deps)
STRIPE_SECRET_KEY=$(node -e "console.log(JSON.parse(process.argv[1]).STRIPE_SECRET_KEY)" "$SECRET_JSON")

if [[ -z "$STRIPE_SECRET_KEY" || "$STRIPE_SECRET_KEY" == "undefined" ]]; then
  echo "❌ STRIPE_SECRET_KEY not found in secret JSON"
  exit 1
fi

echo "✅ Secret key retrieved ([REDACTED:stripe-key])"

# ---------------------------------------------------------------------------
# Set price IDs (staging/test mode)
# ---------------------------------------------------------------------------
export STRIPE_SECRET_KEY
export NEXT_PUBLIC_STRIPE_PRICE_INDIVIDUAL_MONTHLY="price_1SuhAeA4W8nJ0u4TxucA8191"
export NEXT_PUBLIC_STRIPE_PRICE_INDIVIDUAL_ANNUAL="price_1SuhAfA4W8nJ0u4T6u53DVXa"
export NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_MONTHLY="price_1SuhAfA4W8nJ0u4TiWseEnxV"
export NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_ANNUAL="price_1SuhAfA4W8nJ0u4TDACWMZ0a"

# ---------------------------------------------------------------------------
# Run the portal configuration script
# ---------------------------------------------------------------------------
echo "🚀 Running setup-stripe-portal.js ${FLAGS[*]+"${FLAGS[*]}"}..."
echo ""

node "$SCRIPT_DIR/setup-stripe-portal.js" "${FLAGS[@]+"${FLAGS[@]}"}"
