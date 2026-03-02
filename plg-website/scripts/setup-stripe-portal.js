#!/usr/bin/env node
/**
 * Stripe Customer Portal Configuration Script
 *
 * Configures the Stripe Customer Portal to enable subscription switching
 * between monthly and annual billing frequencies for Individual and Business tiers.
 *
 * USAGE:
 *   node scripts/setup-stripe-portal.js [--live]
 *
 * FLAGS:
 *   --live    Use live mode (default: test mode)
 *
 * REQUIRES:
 *   - STRIPE_SECRET_KEY or STRIPE_SECRET_KEY_LIVE env var
 *   - Price IDs configured in environment
 *
 * IDEMPOTENT: Running multiple times updates the existing default configuration.
 *
 * ⚠️  WARNING: Do NOT modify portal configuration via the Stripe Dashboard.
 * The Dashboard can silently add fields (e.g., "quantity" to default_allowed_updates)
 * that override the API-set configuration, causing drift. This script is the canonical
 * source of truth for portal settings. If the Dashboard and this script disagree,
 * re-run this script to restore the correct configuration.
 *
 * @see https://stripe.com/docs/billing/subscriptions/customer-portal
 */

const Stripe = require("stripe");

// ===========================================
// CONFIGURATION
// ===========================================

const RETURN_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://staging.hic-ai.com";

/**
 * Get price IDs from environment, with fallbacks for staging
 */
function getPriceIds() {
  return {
    individualMonthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_INDIVIDUAL_MONTHLY,
    individualAnnual: process.env.NEXT_PUBLIC_STRIPE_PRICE_INDIVIDUAL_ANNUAL,
    businessMonthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_MONTHLY,
    businessAnnual: process.env.NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_ANNUAL,
  };
}

/**
 * Validate required environment variables
 */
function validateEnvironment(isLive) {
  const keyName = isLive ? "STRIPE_SECRET_KEY_LIVE" : "STRIPE_SECRET_KEY";
  const secretKey = process.env[keyName] || process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    console.error(`❌ Missing ${keyName} environment variable`);
    process.exit(1);
  }

  const prices = getPriceIds();
  const missing = Object.entries(prices)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    console.error("❌ Missing price ID environment variables:");
    missing.forEach((key) =>
      console.error(`   - NEXT_PUBLIC_STRIPE_PRICE_${key.toUpperCase()}`),
    );
    process.exit(1);
  }

  return { secretKey, prices };
}

/**
 * Create or update the default billing portal configuration
 *
 * @param {Stripe} stripe - Stripe client
 * @param {Object} prices - Price IDs object
 * @returns {Promise<Object>} Configuration result
 */
async function configurePortal(stripe, prices) {
  console.log("\n📋 Configuring Stripe Customer Portal...\n");

  // Build product configurations - each price can switch to its counterpart frequency
  const productConfigs = [
    // Individual: monthly <-> annual
    {
      product: await getProductIdForPrice(stripe, prices.individualMonthly),
      prices: [prices.individualMonthly, prices.individualAnnual],
    },
    // Business: monthly <-> annual
    {
      product: await getProductIdForPrice(stripe, prices.businessMonthly),
      prices: [prices.businessMonthly, prices.businessAnnual],
    },
  ];

  // Deduplicate products (monthly and annual are same product)
  const uniqueProducts = [];
  const seenProducts = new Set();
  for (const config of productConfigs) {
    if (!seenProducts.has(config.product)) {
      seenProducts.add(config.product);
      uniqueProducts.push(config);
    }
  }

  console.log("   Products configured for switching:");
  for (const config of uniqueProducts) {
    console.log(`   - ${config.product}: ${config.prices.join(", ")}`);
  }

  // Portal configuration settings
  const portalConfig = {
    business_profile: {
      headline: "Manage your Mouse subscription",
      privacy_policy_url: `${RETURN_URL}/privacy`,
      terms_of_service_url: `${RETURN_URL}/terms`,
    },
    features: {
      // Allow customers to switch billing frequency (monthly <-> annual) within their tier.
      // CRITICAL: Only "price" and "promotion_code" are permitted here.
      // - "quantity" is intentionally excluded — Individual is always 1 seat,
      //   and Business seat changes go through our admin portal, not Stripe's.
      // - The products array scopes each tier to its own prices only,
      //   preventing cross-tier switching (Individual <-> Business).
      subscription_update: {
        enabled: true,
        default_allowed_updates: ["price", "promotion_code"],
        proration_behavior: "create_prorations",
        products: uniqueProducts,
      },
      // Allow subscription cancellation
      subscription_cancel: {
        enabled: true,
        mode: "at_period_end",
        cancellation_reason: {
          enabled: true,
          options: [
            "too_expensive",
            "missing_features",
            "switched_service",
            "unused",
            "other",
          ],
        },
      },
      // Allow reactivation of cancelled subscriptions
      subscription_pause: {
        enabled: false, // We don't support pausing, only cancel
      },
      // Payment method updates
      payment_method_update: {
        enabled: true,
      },
      // Customer can update their billing info
      customer_update: {
        enabled: true,
        allowed_updates: ["email", "address", "phone", "tax_id"],
      },
      // Invoice history
      invoice_history: {
        enabled: true,
      },
    },
    default_return_url: `${RETURN_URL}/portal/billing`,
  };

  try {
    // Check for existing configuration
    const existingConfigs = await stripe.billingPortal.configurations.list({
      limit: 1,
    });

    let configuration;
    if (existingConfigs.data.length > 0 && existingConfigs.data[0].is_default) {
      // Update existing default configuration
      console.log("\n   ℹ️  Updating existing default configuration...");
      configuration = await stripe.billingPortal.configurations.update(
        existingConfigs.data[0].id,
        portalConfig,
      );
    } else {
      // Create new configuration
      console.log("\n   ℹ️  Creating new portal configuration...");
      configuration =
        await stripe.billingPortal.configurations.create(portalConfig);
    }

    // Verify the configuration matches expectations
    verifyConfiguration(configuration);

    return configuration;
  } catch (error) {
    console.error("\n❌ Failed to configure portal:", error.message);
    if (error.raw?.message) {
      console.error("   Stripe error:", error.raw.message);
    }
    throw error;
  }
}

/**
 * Verify the saved configuration matches our expectations.
 * Guards against Stripe Dashboard drift silently adding unwanted fields.
 *
 * @param {Object} config - The saved Stripe portal configuration
 */
function verifyConfiguration(config) {
  const allowedUpdates = config.features?.subscription_update?.default_allowed_updates || [];

  // "quantity" must never appear — it allows users to change seat counts in the portal
  if (allowedUpdates.includes("quantity")) {
    console.error("\n❌ DRIFT DETECTED: 'quantity' found in default_allowed_updates.");
    console.error("   This was likely added by the Stripe Dashboard.");
    console.error("   Re-run this script to fix, or update via CLI:");
    console.error('   stripe post /v1/billing_portal/configurations/' + config.id);
    console.error('     -d "features[subscription_update][default_allowed_updates][0]=price"');
    console.error('     -d "features[subscription_update][default_allowed_updates][1]=promotion_code"');
    process.exit(1);
  }

  // Only "price" and "promotion_code" should be present
  const expected = ["price", "promotion_code"];
  const unexpected = allowedUpdates.filter((u) => !expected.includes(u));
  if (unexpected.length > 0) {
    console.warn(`\n⚠️  Unexpected allowed_updates: ${unexpected.join(", ")}`);
    console.warn("   Review whether these should be permitted.");
  }

  console.log("
   ✅ Configuration verified: no drift detected");
}

/**
 * Get the product ID for a given price ID
 *
 * @param {Stripe} stripe - Stripe client
 * @param {string} priceId - Price ID
 * @returns {Promise<string>} Product ID
 */
async function getProductIdForPrice(stripe, priceId) {
  const price = await stripe.prices.retrieve(priceId);
  return price.product;
}

/**
 * Display configuration summary
 */
function displaySummary(config, isLive) {
  console.log("\n" + "=".repeat(60));
  console.log("✅ STRIPE CUSTOMER PORTAL CONFIGURED");
  console.log("=".repeat(60));
  console.log(`\n   Mode:           ${isLive ? "🔴 LIVE" : "🟡 TEST"}`);
  console.log(`   Configuration:  ${config.id}`);
  console.log(`   Is Default:     ${config.is_default}`);
  console.log(`   Return URL:     ${config.default_return_url}`);
  console.log("\n   Features Enabled:");
  console.log(`   ✅ Subscription Update (plan switching)`);
  console.log(`   ✅ Subscription Cancel`);
  console.log(`   ✅ Payment Method Update`);
  console.log(`   ✅ Customer Info Update`);
  console.log(`   ✅ Invoice History`);
  console.log("\n   Proration: Immediate charges/credits on plan switch");
  console.log("\n" + "=".repeat(60));

  if (!isLive) {
    console.log(
      "\n⚠️  This configured TEST mode. Run with --live for production.\n",
    );
  }
}

// ===========================================
// MAIN
// ===========================================

async function main() {
  const args = process.argv.slice(2);
  const isLive = args.includes("--live");

  console.log("\n🔧 Stripe Customer Portal Setup");
  console.log(`   Mode: ${isLive ? "LIVE 🔴" : "TEST 🟡"}`);

  // Validate environment
  const { secretKey, prices } = validateEnvironment(isLive);

  // Initialize Stripe client
  const stripe = new Stripe(secretKey, {
    apiVersion: "2024-12-18.acacia",
  });

  try {
    // Configure the portal
    const config = await configurePortal(stripe, prices);

    // Display summary
    displaySummary(config, isLive);

    console.log("✅ Portal configuration complete!\n");
    console.log("   Users can now switch between monthly/annual billing");
    console.log("   from the Stripe Customer Portal.\n");
  } catch (error) {
    console.error("\n❌ Setup failed:", error.message);
    process.exit(1);
  }
}

main();
