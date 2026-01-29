/**
 * E2E Test Environment Configuration
 *
 * Supports local, staging, and production environments.
 * Production tests are READ-ONLY (no mutations).
 *
 * Environment selection via E2E_ENV variable:
 *   E2E_ENV=local npm run test:e2e
 *   E2E_ENV=staging npm run test:e2e:staging
 *
 * @see 20260129_E2E_BACKEND_VALIDATION_SPEC.md
 */

// ============================================================================
// Environment Definitions
// ============================================================================

export const environments = {
  local: {
    name: "local",
    apiBase: "http://localhost:3000/api",
    stripeMode: "test",
    allowMutations: true,
    timeout: 5000,
    retries: 0,
  },
  staging: {
    name: "staging",
    apiBase: "https://staging.hic-ai.com/api",
    stripeMode: "test",
    allowMutations: true,
    timeout: 10000,
    retries: 2,
  },
  production: {
    name: "production",
    apiBase: "https://hic-ai.com/api",
    stripeMode: "live",
    allowMutations: false, // READ-ONLY!
    timeout: 10000,
    retries: 2,
  },
};

// ============================================================================
// Environment Selection
// ============================================================================

/**
 * Get the current test environment configuration
 * @returns {Object} Environment configuration
 * @throws {Error} If unknown environment specified
 */
export function getEnvironment() {
  const envName = process.env.E2E_ENV || "local";
  const env = environments[envName];

  if (!env) {
    const validEnvs = Object.keys(environments).join(", ");
    throw new Error(
      `Unknown E2E environment: "${envName}". Valid environments: ${validEnvs}`,
    );
  }

  return env;
}

/**
 * Check if current environment allows mutations (writes)
 * @returns {boolean}
 */
export function canMutate() {
  return getEnvironment().allowMutations;
}

/**
 * Get API base URL for current environment
 * @returns {string}
 */
export function getApiBase() {
  return getEnvironment().apiBase;
}

// ============================================================================
// Test Configuration
// ============================================================================

export const testConfig = {
  // Timing
  defaultTimeout: 10000,
  heartbeatInterval: 600, // Expected heartbeat interval in seconds
  pollInterval: 500, // Polling interval for async operations

  // Limits
  maxRetries: 3,
  maxDevicesPerLicense: 3,
  trialDurationDays: 14,

  // Rate limiting
  heartbeatRateLimit: 10, // per minute
  validationRateLimit: 30, // per minute

  // Test data prefixes (for cleanup identification)
  testDataPrefix: "e2e-test-",

  // Verbose logging
  verbose: process.env.E2E_VERBOSE === "true",

  // Auto cleanup after tests
  autoCleanup: process.env.E2E_CLEANUP !== "false",
};

// ============================================================================
// Required Environment Variables
// ============================================================================

/**
 * Environment variables required for each environment
 */
export const requiredEnvVars = {
  local: [],
  staging: [
    "E2E_STRIPE_TEST_KEY",
    "E2E_KEYGEN_TEST_KEY",
    // Cognito vars optional for unauthenticated endpoints
  ],
  production: [
    // Production is read-only, minimal requirements
  ],
};

/**
 * Validate that required environment variables are set
 * @throws {Error} If required variables are missing
 */
export function validateEnvironment() {
  const env = getEnvironment();
  const required = requiredEnvVars[env.name] || [];
  const missing = required.filter((varName) => !process.env[varName]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables for ${env.name}: ${missing.join(", ")}`,
    );
  }
}

// ============================================================================
// API Endpoints
// ============================================================================

/**
 * API endpoint paths (relative to apiBase)
 */
export const endpoints = {
  // License APIs
  license: {
    trialInit: "/license/trial/init",
    validate: "/license/validate",
    activate: "/license/activate",
    deactivate: "/license/deactivate",
    heartbeat: "/license/heartbeat",
    check: "/license/check",
  },

  // Checkout APIs
  checkout: {
    create: "/checkout",
    verify: "/checkout/verify",
  },

  // Webhook APIs (for simulated webhook testing)
  webhooks: {
    stripe: "/webhooks/stripe",
    keygen: "/webhooks/keygen",
  },

  // Portal APIs (require authentication)
  portal: {
    status: "/portal/status",
    license: "/portal/license",
    billing: "/portal/billing",
    invoices: "/portal/invoices",
    team: "/portal/team",
    settings: "/portal/settings",
  },
};

/**
 * Get full URL for an endpoint
 * @param {string} path - Relative path
 * @returns {string} Full URL
 */
export function getEndpointUrl(path) {
  return `${getApiBase()}${path}`;
}

// ============================================================================
// Logging
// ============================================================================

/**
 * Conditional logging based on verbose setting
 */
export const log = {
  info: (...args) => {
    if (testConfig.verbose) {
      console.log("[E2E]", ...args);
    }
  },
  warn: (...args) => {
    console.warn("[E2E WARN]", ...args);
  },
  error: (...args) => {
    console.error("[E2E ERROR]", ...args);
  },
  debug: (...args) => {
    if (testConfig.verbose) {
      console.log("[E2E DEBUG]", ...args);
    }
  },
};

export default {
  environments,
  getEnvironment,
  canMutate,
  getApiBase,
  testConfig,
  validateEnvironment,
  endpoints,
  getEndpointUrl,
  log,
};
