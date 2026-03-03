#!/usr/bin/env node

/**
 * One-shot patch: Add products array to both portal configurations.
 *
 * Fetches STRIPE_SECRET_KEY from AWS Secrets Manager (plg/staging/stripe)
 * so no credentials need to be exported or hardcoded. Requires active
 * AWS SSO session (`aws sso login`).
 *
 * Usage: node scripts/patch-portal-products.js
 */

import Stripe from "stripe";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

// ── Fetch Stripe key from Secrets Manager ──

async function getStripeKey() {
  const client = new SecretsManagerClient({ region: "us-east-1" });
  const result = await client.send(
    new GetSecretValueCommand({ SecretId: "plg/staging/stripe" }),
  );
  const secrets = JSON.parse(result.SecretString);
  return secrets.STRIPE_SECRET_KEY;
}

// ── Config IDs and product/price mappings ──

const INDIVIDUAL_CONFIG_ID = "bpc_1T6YL1A4W8nJ0u4Tsfs4AM8m";
const BUSINESS_CONFIG_ID = "bpc_1T6YL1A4W8nJ0u4TxSTyOZOg";

const INDIVIDUAL_PRODUCT = {
  product: "prod_TsS4XUxlv9WWue",
  prices: [
    "price_1SuhAeA4W8nJ0u4TxucA8191", // monthly $15
    "price_1SuhAfA4W8nJ0u4T6u53DVXa",  // annual $150
  ],
  adjustable_quantity: { enabled: false },
};

const BUSINESS_PRODUCT = {
  product: "prod_TsS4qfMpxCbjUr",
  prices: [
    "price_1SuhAfA4W8nJ0u4TiWseEnxV", // monthly $35/seat
    "price_1SuhAfA4W8nJ0u4TDACWMZ0a",  // annual $350/seat
  ],
  adjustable_quantity: { enabled: true, minimum: 1 },
};

// ── Main ──

async function main() {
  console.log("Fetching STRIPE_SECRET_KEY from AWS Secrets Manager...");
  const secretKey = await getStripeKey();
  console.log(`Got key: sk_test_...${secretKey.slice(-4)}`);

  const stripe = new Stripe(secretKey, { apiVersion: "2026-02-25.clover" });

  // Patch Individual — single product, no quantity adjustment
  console.log("\nPatching Individual config...");
  const individual = await stripe.billingPortal.configurations.update(
    INDIVIDUAL_CONFIG_ID,
    {
      features: {
        subscription_update: {
          enabled: true,
          default_allowed_updates: ["price", "promotion_code"],
          proration_behavior: "create_prorations",
          products: [INDIVIDUAL_PRODUCT],
        },
      },
    },
  );
  console.log("Individual subscription_update:", JSON.stringify(individual.features.subscription_update, null, 2));

  // Patch Business — single product, quantity adjustable
  console.log("\nPatching Business config...");
  const business = await stripe.billingPortal.configurations.update(
    BUSINESS_CONFIG_ID,
    {
      features: {
        subscription_update: {
          enabled: true,
          default_allowed_updates: ["price", "quantity", "promotion_code"],
          proration_behavior: "create_prorations",
          products: [BUSINESS_PRODUCT],
        },
      },
    },
  );
  console.log("Business subscription_update:", JSON.stringify(business.features.subscription_update, null, 2));

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
