#!/usr/bin/env node

/**
 * Stripe Customer Portal Configuration Script
 *
 * Creates or updates TWO non-default billing portal configurations:
 *   1. Individual — monthly <-> annual switching only, quantity fixed at 1
 *   2. Business — monthly <-> annual switching, quantity adjustable (min 1)
 *
 * Each config is scoped to a single Stripe product, preventing cross-tier
 * switching (Individual <-> Business). The portal session route (route.js)
 * passes the appropriate config ID based on customer.accountType.
 *
 * USAGE:
 *   node scripts/setup-stripe-portal.js [--live] [--dry-run]
 *
 * FLAGS:
 *   --live      Use live mode (default: test mode)
 *   --dry-run   List existing configs and show what would change, no mutations
 *
 * REQUIRES:
 *   - STRIPE_SECRET_KEY or STRIPE_SECRET_KEY_LIVE env var
 *   - NEXT_PUBLIC_STRIPE_PRICE_INDIVIDUAL_MONTHLY
 *   - NEXT_PUBLIC_STRIPE_PRICE_INDIVIDUAL_ANNUAL
 *   - NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_MONTHLY
 *   - NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_ANNUAL
 *
 * IDEMPOTENT: Matches existing configs by metadata.tier tag. Running
 * multiple times updates in place rather than creating duplicates.
 *
 * WARNING: Do NOT modify portal configuration via the Stripe Dashboard.
 * The Dashboard can silently add fields (e.g., "quantity" to
 * default_allowed_updates) that override API-set values. This script
 * is the canonical source of truth for portal settings.
 *
 * @see https://docs.stripe.com/api/customer_portal/configurations/create
 */

import Stripe from "stripe";

const RETURN_URL = process.env.NEXT_PUBLIC_APP_URL || "https://staging.hic-ai.com";

// =========================================================================
// ENVIRONMENT VALIDATION
// =========================================================================

const PRICE_ENV_KEYS = [
  "NEXT_PUBLIC_STRIPE_PRICE_INDIVIDUAL_MONTHLY",
  "NEXT_PUBLIC_STRIPE_PRICE_INDIVIDUAL_ANNUAL",
  "NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_MONTHLY",
  "NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_ANNUAL",
];

/**
 * Validate required env vars and return Stripe secret key + price IDs.
 * @param {boolean} isLive - Whether to use live mode key
 * @returns {{ secretKey: string, prices: Object }}
 */
function validateEnvironment(isLive) {
  const keyName = isLive ? "STRIPE_SECRET_KEY_LIVE" : "STRIPE_SECRET_KEY";
  const secretKey = process.env[keyName] || process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    console.error(`\u274C Missing ${keyName} environment variable`);
    process.exit(1);
  }

  const missing = PRICE_ENV_KEYS.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error("\u274C Missing price ID environment variables:");
    missing.forEach((k) => console.error(`   - ${k}`));
    process.exit(1);
  }

  return {
    secretKey,
    prices: {
      individualMonthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_INDIVIDUAL_MONTHLY,
      individualAnnual: process.env.NEXT_PUBLIC_STRIPE_PRICE_INDIVIDUAL_ANNUAL,
      businessMonthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_MONTHLY,
      businessAnnual: process.env.NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_ANNUAL,
    },
  };
}

// =========================================================================
// HELPERS
// =========================================================================

/**
 * Resolve the Stripe product ID for a given price ID.
 * @param {Stripe} stripe
 * @param {string} priceId
 * @returns {Promise<string>}
 */
async function getProductIdForPrice(stripe, priceId) {
  const price = await stripe.prices.retrieve(priceId);
  return price.product;
}

/**
 * Build the shared portal config shape used by both tiers.
 * Caller patches in the tier-specific product entry.
 *
 * @param {Object} tierProduct - { product, prices } for this tier
 * @param {string} tierName - "individual" or "business"
 * @param {boolean} allowQuantity - Whether to enable adjustable_quantity
 * @returns {Object} Stripe billingPortal.configurations.create params
 */
function buildPortalConfig(tierProduct, tierName, allowQuantity) {
  // Build the product entry with explicit quantity control
  const productEntry = {
    product: tierProduct.product,
    prices: tierProduct.prices,
  };

  // Individual: quantity locked to 1. Business: adjustable, min 1.
  if (allowQuantity) {
    productEntry.adjustable_quantity = { enabled: true, minimum: 1 };
  }

  return {
    business_profile: {
      headline: "Manage your Mouse subscription",
      privacy_policy_url: `${RETURN_URL}/privacy`,
      terms_of_service_url: `${RETURN_URL}/terms`,
    },
    features: {
      subscription_update: {
        enabled: true,
        // "price" allows monthly <-> annual switching within this product.
        // "promotion_code" allows applying coupons.
        // "quantity" is intentionally excluded for Individual; for Business,
        // quantity is controlled per-product via adjustable_quantity above.
        default_allowed_updates: ["price", "promotion_code"],
        proration_behavior: "always_invoice",
        products: [productEntry],
      },
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
      subscription_pause: { enabled: false },
      payment_method_update: { enabled: true },
      customer_update: {
        enabled: true,
        allowed_updates: ["email", "address", "phone", "tax_id"],
      },
      invoice_history: { enabled: true },
    },
    default_return_url: `${RETURN_URL}/portal/billing`,
    metadata: { tier: tierName },
  };
}

/**
 * Verify a saved configuration matches expectations.
 * Guards against Stripe Dashboard drift.
 *
 * @param {Object} config - Saved Stripe portal configuration
 * @param {string} tierName - "individual" or "business"
 */
function verifyConfiguration(config, tierName) {
  const updates = config.features?.subscription_update?.default_allowed_updates || [];

  // "quantity" must never appear in default_allowed_updates
  if (updates.includes("quantity")) {
    console.error(`\n\u274C DRIFT DETECTED [${tierName}]: "quantity" found in default_allowed_updates.`);
    console.error("   This was likely added by the Stripe Dashboard. Re-run this script to fix.");
    process.exit(1);
  }

  const expected = ["price", "promotion_code"];
  const unexpected = updates.filter((u) => !expected.includes(u));
  if (unexpected.length > 0) {
    console.warn(`\n\u26A0\uFE0F  Unexpected allowed_updates [${tierName}]: ${unexpected.join(", ")}`);
  }

  // Verify product scoping — should have exactly 1 product
  const products = config.features?.subscription_update?.products || [];
  if (products.length !== 1) {
    console.error(`\n\u274C DRIFT DETECTED [${tierName}]: Expected 1 product, found ${products.length}.`);
    console.error("   Cross-tier switching may be possible. Re-run this script to fix.");
    process.exit(1);
  }

  console.log(`   \u2705 ${tierName}: verified (1 product, no quantity drift)`);
}

// =========================================================================
// FIND OR CREATE TIER CONFIGS
// =========================================================================

/**
 * Find an existing non-default config by metadata.tier tag.
 * Falls back to matching by product ID if metadata is missing.
 *
 * @param {Stripe} stripe
 * @param {string} tierName - "individual" or "business"
 * @param {string} productId - Expected product ID for this tier
 * @returns {Promise<Object|null>} Existing config or null
 */
async function findExistingConfig(stripe, tierName, productId) {
  const allConfigs = await stripe.billingPortal.configurations.list({ limit: 100 });

  // First pass: match by metadata.tier (preferred, set by this script)
  for (const cfg of allConfigs.data) {
    if (!cfg.is_default && cfg.metadata?.tier === tierName) {
      return cfg;
    }
  }

  // Second pass: match by product ID in subscription_update.products
  for (const cfg of allConfigs.data) {
    if (cfg.is_default) continue;
    const products = cfg.features?.subscription_update?.products || [];
    if (products.length === 1 && products[0].product === productId) {
      return cfg;
    }
  }

  return null;
}

/**
 * Create or update both tier-specific portal configurations.
 *
 * @param {Stripe} stripe
 * @param {Object} prices - { individualMonthly, individualAnnual, businessMonthly, businessAnnual }
 * @param {boolean} dryRun - If true, only inspect and report
 * @returns {Promise<{ individual: Object, business: Object }>}
 */
async function configureTierPortals(stripe, prices, dryRun) {
  console.log("\n\uD83D\uDCCB Resolving product IDs from price IDs...\n");

  // Resolve product IDs (monthly and annual share the same product)
  const individualProductId = await getProductIdForPrice(stripe, prices.individualMonthly);
  const businessProductId = await getProductIdForPrice(stripe, prices.businessMonthly);

  console.log(`   Individual product: ${individualProductId}`);
  console.log(`   Business product:   ${businessProductId}`);

  const tiers = [
    {
      name: "individual",
      productId: individualProductId,
      prices: [prices.individualMonthly, prices.individualAnnual],
      allowQuantity: false,
    },
    {
      name: "business",
      productId: businessProductId,
      prices: [prices.businessMonthly, prices.businessAnnual],
      allowQuantity: true,
    },
  ];

  const results = {};

  for (const tier of tiers) {
    console.log(`\n--- ${tier.name.toUpperCase()} ---`);

    const existing = await findExistingConfig(stripe, tier.name, tier.productId);
    const portalConfig = buildPortalConfig(
      { product: tier.productId, prices: tier.prices },
      tier.name,
      tier.allowQuantity,
    );

    if (dryRun) {
      if (existing) {
        console.log(`   Found existing config: ${existing.id}`);
        console.log(`   Would UPDATE with correct product scoping`);
      } else {
        console.log("   No existing config found");
        console.log("   Would CREATE new non-default config");
      }
      // In dry-run, verify existing config if present
      if (existing) {
        verifyConfiguration(existing, tier.name);
      }
      results[tier.name] = existing || { id: "(would be created)" };
      continue;
    }

    let configuration;
    if (existing) {
      console.log(`   Updating existing config: ${existing.id}`);
      configuration = await stripe.billingPortal.configurations.update(
        existing.id,
        portalConfig,
      );
    } else {
      console.log("   Creating new non-default config...");
      configuration = await stripe.billingPortal.configurations.create(portalConfig);
    }

    verifyConfiguration(configuration, tier.name);
    results[tier.name] = configuration;
  }

  return results;
}

// =========================================================================
// DISPLAY
// =========================================================================

/**
 * Print configuration summary with actionable next steps.
 *
 * @param {{ individual: Object, business: Object }} configs
 * @param {boolean} isLive
 * @param {boolean} dryRun
 */
function displaySummary(configs, isLive, dryRun) {
  const divider = "=".repeat(60);
  const mode = isLive ? "\uD83D\uDD34 LIVE" : "\uD83D\uDFE1 TEST";
  const verb = dryRun ? "DRY RUN COMPLETE" : "PORTAL CONFIGURED";

  console.log(`\n${divider}`);
  console.log(`\u2705 STRIPE CUSTOMER PORTAL ${verb}`);
  console.log(divider);
  console.log(`\n   Mode: ${mode}`);
  console.log(`\n   Individual: ${configs.individual.id}`);
  console.log(`   Business:   ${configs.business.id}`);

  if (!dryRun) {
    console.log(`\n   \u26A0\uFE0F  Store these config IDs in AWS Secrets Manager:`);
    console.log(`       STRIPE_PORTAL_CONFIG_INDIVIDUAL=${configs.individual.id}`);
    console.log(`       STRIPE_PORTAL_CONFIG_BUSINESS=${configs.business.id}`);
    console.log(`\n   Also update .env.local for local development.`);
  }

  console.log(`\n${divider}\n`);

  if (!isLive) {
    console.log("   This configured TEST mode. Run with --live for production.\n");
  }
}

// =========================================================================
// MAIN
// =========================================================================

async function main() {
  const args = process.argv.slice(2);
  const isLive = args.includes("--live");
  const dryRun = args.includes("--dry-run");

  console.log("\n\uD83D\uDD27 Stripe Customer Portal Setup");
  console.log(`   Mode: ${isLive ? "LIVE \uD83D\uDD34" : "TEST \uD83D\uDFE1"}${dryRun ? " (DRY RUN)" : ""}`);

  const { secretKey, prices } = validateEnvironment(isLive);

  const stripe = new Stripe(secretKey, {
    apiVersion: "2024-12-18.acacia",
  });

  try {
    const configs = await configureTierPortals(stripe, prices, dryRun);
    displaySummary(configs, isLive, dryRun);
  } catch (error) {
    console.error(`\n\u274C Setup failed: ${error.message}`);
    if (error.raw?.message) {
      console.error(`   Stripe error: ${error.raw.message}`);
    }
    process.exit(1);
  }
}

main();
