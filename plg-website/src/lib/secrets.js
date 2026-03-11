/**
 * AWS Secrets Manager Integration for PLG Website
 *
 * This module provides secure runtime fetching of secrets from AWS Secrets Manager.
 * Secrets are cached in memory to minimize API calls and latency.
 *
 * Environment-aware: Uses different secret paths for staging vs production.
 *
 * Usage:
 *   import { getSecret, getStripeSecrets } from '@/lib/secrets';
 *   const { STRIPE_SECRET_KEY } = await getStripeSecrets();
 *
 * @module lib/secrets
 */

import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

import { safeJsonParse } from "../../../dm/layers/base/src/index.js";
// ═══════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════

const REGION = process.env.DYNAMODB_REGION || "us-east-1";

// Environment detection: 'staging' or 'production'
const ENVIRONMENT = process.env.NEXT_PUBLIC_APP_URL?.includes("staging")
  ? "staging"
  : process.env.NODE_ENV === "production"
    ? "production"
    : "staging";

// Secret paths by category (AWS Secrets Manager)
const SECRET_PATHS = {
  stripe: `plg/${ENVIRONMENT}/stripe`,
  keygen: `plg/${ENVIRONMENT}/keygen`,
  app: `plg/${ENVIRONMENT}/app`,
};

// Cache TTL: 5 minutes (secrets rarely change, but we want eventual consistency)
const CACHE_TTL_MS = 5 * 60 * 1000;

// ═══════════════════════════════════════════════════════════════════
// Secrets Client (lazy initialization)
// ═══════════════════════════════════════════════════════════════════

let secretsClient = null;

function getSecretsClient() {
  if (!secretsClient) {
    secretsClient = new SecretsManagerClient({ region: REGION });
  }
  return secretsClient;
}

// ═══════════════════════════════════════════════════════════════════
// In-Memory Cache
// ═══════════════════════════════════════════════════════════════════

const secretsCache = new Map();

/**
 * Cache entry structure:
 * {
 *   value: Object,      // Parsed secret JSON
 *   fetchedAt: number,  // Timestamp when fetched
 * }
 */

function getCachedSecret(secretName) {
  const cached = secretsCache.get(secretName);
  if (!cached) return null;

  const age = Date.now() - cached.fetchedAt;
  if (age > CACHE_TTL_MS) {
    secretsCache.delete(secretName);
    return null;
  }

  return cached.value;
}

function setCachedSecret(secretName, value) {
  secretsCache.set(secretName, {
    value,
    fetchedAt: Date.now(),
  });
}

// ═══════════════════════════════════════════════════════════════════
// Core Secret Fetching
// ═══════════════════════════════════════════════════════════════════

/**
 * Fetch a secret from AWS Secrets Manager
 *
 * @param {string} secretName - The name/path of the secret (e.g., 'plg/staging/stripe')
 * @returns {Promise<Object>} Parsed secret as JSON object
 * @throws {Error} If secret cannot be fetched or parsed
 */
export async function getSecret(secretName) {
  // Check cache first
  const cached = getCachedSecret(secretName);
  if (cached) {
    return cached;
  }

  // Fetch from Secrets Manager
  const client = getSecretsClient();
  const command = new GetSecretValueCommand({ SecretId: secretName });

  try {
    const response = await client.send(command);

    if (!response.SecretString) {
      throw new Error(`Secret ${secretName} has no string value`);
    }

    const parsed = safeJsonParse(response.SecretString, { source: `secrets-manager-${secretName}` });

    // Cache the result
    setCachedSecret(secretName, parsed);

    return parsed;
  } catch (error) {
    // Don't cache errors - allow retry
    console.error(`Failed to fetch secret ${secretName}:`, error.message);
    throw new Error(`Unable to retrieve secret: ${secretName}`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Typed Secret Accessors
// ═══════════════════════════════════════════════════════════════════

/**
 * Get Stripe secrets (API key and webhook secret)
 *
 * Priority order:
 * 1. Non-production (dev/test/CI): process.env (from .env.local)
 * 2. AWS Secrets Manager (plg/{env}/stripe) — canonical source
 *
 * Only NODE_ENV=production hits AWS. All other environments use process.env.
 * Throws if Secrets Manager is unavailable in production.
 * See: FINDING-3, FINDING-4 in 20260215_AUDIT_REPORT_ON_SECRETS_HYGIENE.md
 *
 * @returns {Promise<{STRIPE_SECRET_KEY: string, STRIPE_WEBHOOK_SECRET: string}>}
 */
export async function getStripeSecrets() {
  console.log("[Secrets] getStripeSecrets called, NODE_ENV:", process.env.NODE_ENV);

  // Non-production (dev, test, CI): use .env.local / process.env
  if (process.env.NODE_ENV !== "production") {
    console.log("[Secrets] Non-production mode - using process.env");
    return {
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
      // Portal config IDs (not secrets — resource identifiers stored here
      // because Amplify Gen 2 env vars don't propagate to SSR reliably)
      STRIPE_PORTAL_CONFIG_INDIVIDUAL: process.env.STRIPE_PORTAL_CONFIG_INDIVIDUAL,
      STRIPE_PORTAL_CONFIG_BUSINESS: process.env.STRIPE_PORTAL_CONFIG_BUSINESS,
    };
  }

  // Production/staging: Secrets Manager is the canonical source
  console.log("[Secrets] Production mode - trying Secrets Manager...");
  try {
    const secrets = await getSecret(SECRET_PATHS.stripe);
    console.log("[Secrets] Secrets Manager success");
    return {
      STRIPE_SECRET_KEY: secrets.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: secrets.STRIPE_WEBHOOK_SECRET,
      STRIPE_PORTAL_CONFIG_INDIVIDUAL: secrets.STRIPE_PORTAL_CONFIG_INDIVIDUAL,
      STRIPE_PORTAL_CONFIG_BUSINESS: secrets.STRIPE_PORTAL_CONFIG_BUSINESS,
    };
  } catch (error) {
    console.error("CRITICAL: Secrets Manager failed for Stripe:", error.message);
    throw new Error("Stripe secrets unavailable");
  }
}

/**
 * Get Keygen secrets (product token)
 *
 * Priority order:
 * 1. Non-production (dev/test/CI): process.env (from .env.local)
 * 2. AWS Secrets Manager (plg/{env}/keygen) — canonical source
 *
 * Only NODE_ENV=production hits AWS. All other environments use process.env.
 * Throws if Secrets Manager is unavailable in production.
 * See: FINDING-3, FINDING-4 in 20260215_AUDIT_REPORT_ON_SECRETS_HYGIENE.md
 *
 * @returns {Promise<{KEYGEN_PRODUCT_TOKEN: string, KEYGEN_WEBHOOK_PUBLIC_KEY: string}>}
 */
export async function getKeygenSecrets() {
  console.log("[Secrets] getKeygenSecrets called, NODE_ENV:", process.env.NODE_ENV);

  // Non-production (dev, test, CI): use .env.local / process.env
  if (process.env.NODE_ENV !== "production") {
    console.log("[Secrets] Non-production mode - using process.env for Keygen");
    return {
      KEYGEN_PRODUCT_TOKEN: process.env.KEYGEN_PRODUCT_TOKEN,
      KEYGEN_WEBHOOK_PUBLIC_KEY: process.env.KEYGEN_WEBHOOK_PUBLIC_KEY,
    };
  }

  // Production/staging: Secrets Manager is the canonical source
  console.log("[Secrets] Production mode - trying Secrets Manager for Keygen...");
  try {
    const secrets = await getSecret(SECRET_PATHS.keygen);
    console.log("[Secrets] Secrets Manager success for Keygen");
    return {
      KEYGEN_PRODUCT_TOKEN: secrets.KEYGEN_PRODUCT_TOKEN,
      KEYGEN_WEBHOOK_PUBLIC_KEY: secrets.KEYGEN_WEBHOOK_PUBLIC_KEY,
    };
  } catch (error) {
    console.error("CRITICAL: Secrets Manager failed for Keygen:", error.message);
    throw new Error("Keygen secrets unavailable");
  }
}

/**
 * Get Keygen policy IDs for license creation
 *
 * Priority order:
 * 1. Non-production (dev/test/CI): process.env (from .env.local)
 * 2. AWS Secrets Manager (plg/{env}/keygen) — canonical source
 *
 * Only NODE_ENV=production hits AWS. All other environments use process.env.
 * Throws if Secrets Manager is unavailable or any policy ID is missing.
 *
 * CRITICAL: These IDs are required to provision licenses after successful
 * payment. If this function throws, the checkout flow will fail to issue
 * a license key. This is the worst-case failure mode.
 *
 * @returns {Promise<{individualMonthly: string, individualAnnual: string, businessMonthly: string, businessAnnual: string}>}
 */
export async function getKeygenPolicyIds() {
  console.log("[Secrets] getKeygenPolicyIds called, NODE_ENV:", process.env.NODE_ENV);

  // Non-production (dev, test, CI): use .env.local / process.env
  if (process.env.NODE_ENV !== "production") {
    console.log("[Secrets] Non-production mode - using process.env for Keygen policy IDs");
    return {
      individualMonthly: process.env.KEYGEN_POLICY_ID_INDIVIDUAL_MONTHLY,
      individualAnnual: process.env.KEYGEN_POLICY_ID_INDIVIDUAL_ANNUAL,
      businessMonthly: process.env.KEYGEN_POLICY_ID_BUSINESS_MONTHLY,
      businessAnnual: process.env.KEYGEN_POLICY_ID_BUSINESS_ANNUAL,
    };
  }

  // Production/staging: Secrets Manager is the canonical source
  console.log("[Secrets] Production mode - fetching Keygen policy IDs from Secrets Manager...");
  try {
    const secrets = await getSecret(SECRET_PATHS.keygen);

    const result = {
      individualMonthly: secrets.KEYGEN_POLICY_ID_INDIVIDUAL_MONTHLY,
      individualAnnual: secrets.KEYGEN_POLICY_ID_INDIVIDUAL_ANNUAL,
      businessMonthly: secrets.KEYGEN_POLICY_ID_BUSINESS_MONTHLY,
      businessAnnual: secrets.KEYGEN_POLICY_ID_BUSINESS_ANNUAL,
    };

    // Validate all 4 policy IDs are present — missing any is a fatal config error
    const missing = Object.entries(result)
      .filter(([, v]) => !v)
      .map(([k]) => k);

    if (missing.length > 0) {
      console.error("CRITICAL: Keygen policy IDs missing from Secrets Manager:", missing);
      throw new Error(`Keygen policy IDs missing: ${missing.join(", ")}`);
    }

    console.log("[Secrets] Secrets Manager Keygen policy IDs found (all 4 present)");
    return result;
  } catch (error) {
    console.error("CRITICAL: Secrets Manager failed for Keygen policy IDs:", error.message);
    throw new Error("Keygen policy IDs unavailable");
  }
}

/**
 * Get application secrets (trial token signing, admin keys, etc.)
 *
 * Non-production uses process.env; production uses Secrets Manager.
 *
 * @returns {Promise<{TRIAL_TOKEN_SECRET: string, TEST_ADMIN_KEY?: string}>}
 */
export async function getAppSecrets() {
  // Non-production (dev, test, CI): use process.env
  if (process.env.NODE_ENV !== "production") {
    return {
      TRIAL_TOKEN_SECRET:
        process.env.TRIAL_TOKEN_SECRET ||
        "dev-trial-secret-for-local-development-only",
      TEST_ADMIN_KEY: process.env.TEST_ADMIN_KEY || "dev-admin-key",
    };
  }

  // Production/staging: fetch from Secrets Manager
  try {
    const secrets = await getSecret(SECRET_PATHS.app);
    return {
      TRIAL_TOKEN_SECRET: secrets.TRIAL_TOKEN_SECRET,
      TEST_ADMIN_KEY: secrets.TEST_ADMIN_KEY, // Only set in staging
    };
  } catch (error) {
    // Emergency fallback - log error but don't expose in production
    console.error("CRITICAL: Unable to fetch app secrets from Secrets Manager");
    throw new Error("Application secrets unavailable");
  }
}

// ═══════════════════════════════════════════════════════════════════
// Cache Management (for testing)
// ═══════════════════════════════════════════════════════════════════

/**
 * Clear the secrets cache (for testing only)
 */
export function __clearSecretsCache() {
  secretsCache.clear();
}

/**
 * Inject a mock client (for testing only)
 */
export function __setSecretsClientForTests(mockClient) {
  secretsClient = mockClient;
}
