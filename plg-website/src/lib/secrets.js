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

// ═══════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════

const REGION = process.env.AWS_REGION || "us-east-1";

// Environment detection: 'staging' or 'production'
const ENVIRONMENT = process.env.NEXT_PUBLIC_APP_URL?.includes("staging")
  ? "staging"
  : process.env.NODE_ENV === "production"
    ? "production"
    : "staging";

// Secret paths by category
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

    const parsed = JSON.parse(response.SecretString);

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
 * Falls back to environment variables for local development.
 *
 * @returns {Promise<{STRIPE_SECRET_KEY: string, STRIPE_WEBHOOK_SECRET: string}>}
 */
export async function getStripeSecrets() {
  // Local development fallback
  if (process.env.NODE_ENV === "development") {
    return {
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    };
  }

  // Production/staging: fetch from Secrets Manager
  try {
    const secrets = await getSecret(SECRET_PATHS.stripe);
    return {
      STRIPE_SECRET_KEY: secrets.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: secrets.STRIPE_WEBHOOK_SECRET,
    };
  } catch (error) {
    // Emergency fallback to env vars (should not happen in production)
    console.warn(
      "Secrets Manager unavailable, falling back to environment variables",
    );
    return {
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    };
  }
}

/**
 * Get Keygen secrets (product token)
 *
 * Falls back to environment variables for local development.
 *
 * @returns {Promise<{KEYGEN_PRODUCT_TOKEN: string}>}
 */
export async function getKeygenSecrets() {
  // Local development fallback
  if (process.env.NODE_ENV === "development") {
    return {
      KEYGEN_PRODUCT_TOKEN: process.env.KEYGEN_PRODUCT_TOKEN,
    };
  }

  // Production/staging: fetch from Secrets Manager
  try {
    const secrets = await getSecret(SECRET_PATHS.keygen);
    return {
      KEYGEN_PRODUCT_TOKEN: secrets.KEYGEN_PRODUCT_TOKEN,
    };
  } catch (error) {
    // Emergency fallback to env vars
    console.warn(
      "Secrets Manager unavailable, falling back to environment variables",
    );
    return {
      KEYGEN_PRODUCT_TOKEN: process.env.KEYGEN_PRODUCT_TOKEN,
    };
  }
}

/**
 * Get application secrets (trial token signing, etc.)
 *
 * Falls back to environment variables for local development.
 *
 * @returns {Promise<{TRIAL_TOKEN_SECRET: string}>}
 */
export async function getAppSecrets() {
  // Local development fallback
  if (process.env.NODE_ENV === "development") {
    return {
      TRIAL_TOKEN_SECRET:
        process.env.TRIAL_TOKEN_SECRET ||
        "dev-trial-secret-for-local-development-only",
    };
  }

  // Production/staging: fetch from Secrets Manager
  try {
    const secrets = await getSecret(SECRET_PATHS.app);
    return {
      TRIAL_TOKEN_SECRET: secrets.TRIAL_TOKEN_SECRET,
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
