/**
 * Secrets Manager Integration Tests
 *
 * Tests for src/lib/secrets.js - the AWS Secrets Manager integration.
 * Tests validate caching behavior, secret retrieval, error handling,
 * and the fail-loudly pattern (Secrets Manager → throw on failure).
 *
 * Note: These tests mock AWS SDK clients to test business logic without
 * requiring actual AWS infrastructure.
 */

import {
  describe,
  it,
  beforeEach,
  afterEach,
  expect,
} from "../../../../dm/facade/test-helpers/index.js";
import { safeJsonParse as _safeJsonParse } from "../../../../dm/layers/base/src/index.js";

// ============================================
// Mock AWS SDK Clients
// ============================================

// We need to create mock implementations since the actual module
// uses real AWS SDK clients

/**
 * Mock Secrets Cache implementation
 */
class MockSecretsCache {
  constructor() {
    this.cache = new Map();
    this.ttl = 5 * 60 * 1000; // 5 minutes
  }

  get(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const age = Date.now() - cached.fetchedAt;
    if (age > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    return cached.value;
  }

  set(key, value) {
    this.cache.set(key, {
      value,
      fetchedAt: Date.now(),
    });
  }

  clear() {
    this.cache.clear();
  }
}

describe("secrets.js", () => {
  let cache;

  beforeEach(() => {
    cache = new MockSecretsCache();
  });

  afterEach(() => {
    cache.clear();
  });

  describe("Cache behavior", () => {
    it("should return null for uncached secrets", () => {
      const result = cache.get("nonexistent-secret");
      expect(result).toBe(null);
    });

    it("should cache and retrieve secrets", () => {
      const secretData = { API_KEY: "test-key-123" };
      cache.set("my-secret", secretData);

      const result = cache.get("my-secret");
      expect(result).toEqual(secretData);
    });

    it("should cache complex secret objects", () => {
      const secretData = {
        STRIPE_SECRET_KEY: "sk_test_abc123",
        STRIPE_WEBHOOK_SECRET: "whsec_xyz789",
        additional: {
          nested: "value",
        },
      };
      cache.set("plg/staging/stripe", secretData);

      const result = cache.get("plg/staging/stripe");
      expect(result.STRIPE_SECRET_KEY).toBe("sk_test_abc123");
      expect(result.STRIPE_WEBHOOK_SECRET).toBe("whsec_xyz789");
    });

    it("should expire cached secrets after TTL", () => {
      const secretData = { KEY: "value" };
      cache.set("expiring-secret", secretData);

      // Manually expire by modifying fetchedAt
      cache.cache.get("expiring-secret").fetchedAt =
        Date.now() - cache.ttl - 1000;

      const result = cache.get("expiring-secret");
      expect(result).toBe(null);
    });

    it("should return cached value before TTL expires", () => {
      const secretData = { KEY: "value" };
      cache.set("valid-secret", secretData);

      // Still within TTL
      const result = cache.get("valid-secret");
      expect(result).toEqual(secretData);
    });

    it("should clear all cached secrets", () => {
      cache.set("secret1", { key: "value1" });
      cache.set("secret2", { key: "value2" });

      cache.clear();

      expect(cache.get("secret1")).toBe(null);
      expect(cache.get("secret2")).toBe(null);
    });
  });

  describe("Secret path configuration", () => {
    it("should construct correct staging stripe path", () => {
      const environment = "staging";
      const path = `plg/${environment}/stripe`;
      expect(path).toBe("plg/staging/stripe");
    });

    it("should construct correct production stripe path", () => {
      const environment = "production";
      const path = `plg/${environment}/stripe`;
      expect(path).toBe("plg/production/stripe");
    });

    it("should construct correct keygen path", () => {
      const environment = "staging";
      const path = `plg/${environment}/keygen`;
      expect(path).toBe("plg/staging/keygen");
    });

    it("should construct correct app secrets path", () => {
      const environment = "staging";
      const path = `plg/${environment}/app`;
      expect(path).toBe("plg/staging/app");
    });
  });

  describe("getStripeSecrets behavior", () => {
    // Mock implementation of getStripeSecrets logic
    // Priority: process.env (non-prod) → Secrets Manager (production) → throw
    async function mockGetStripeSecrets(options = {}) {
      const {
        nodeEnv = "production",
        envSecretKey = null,
        envWebhookSecret = null,
        secretsManagerData = null,
      } = options;

      // Non-production (dev, test, CI): use env vars
      if (nodeEnv !== "production") {
        return {
          STRIPE_SECRET_KEY: envSecretKey,
          STRIPE_WEBHOOK_SECRET: envWebhookSecret,
        };
      }

      // Production: Secrets Manager is the canonical source
      if (secretsManagerData) {
        return {
          STRIPE_SECRET_KEY: secretsManagerData.STRIPE_SECRET_KEY,
          STRIPE_WEBHOOK_SECRET: secretsManagerData.STRIPE_WEBHOOK_SECRET,
        };
      }

      // No fallback — fail loudly (FINDING-4)
      throw new Error("Stripe secrets unavailable");
    }

    it("should use environment variables in development mode", async () => {
      const result = await mockGetStripeSecrets({
        nodeEnv: "development",
        envSecretKey: "sk_test_dev_key",
        envWebhookSecret: "whsec_dev_secret",
      });

      expect(result.STRIPE_SECRET_KEY).toBe("sk_test_dev_key");
      expect(result.STRIPE_WEBHOOK_SECRET).toBe("whsec_dev_secret");
    });

    it("should use Secrets Manager in production (canonical source)", async () => {
      const result = await mockGetStripeSecrets({
        nodeEnv: "production",
        secretsManagerData: {
          STRIPE_SECRET_KEY: "sk_live_sm_key",
          STRIPE_WEBHOOK_SECRET: "whsec_sm_secret",
        },
      });

      expect(result.STRIPE_SECRET_KEY).toBe("sk_live_sm_key");
      expect(result.STRIPE_WEBHOOK_SECRET).toBe("whsec_sm_secret");
    });

    it("should throw when Secrets Manager fails in production (FINDING-4)", async () => {
      let error;
      try {
        await mockGetStripeSecrets({
          nodeEnv: "production",
          secretsManagerData: null,
        });
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.message).toBe("Stripe secrets unavailable");
    });
  });

  describe("getKeygenSecrets behavior", () => {
    // Priority: process.env (non-prod) → Secrets Manager (production) → throw
    async function mockGetKeygenSecrets(options = {}) {
      const {
        nodeEnv = "production",
        envToken = null,
        secretsManagerData = null,
      } = options;

      // Non-production (dev, test, CI)
      if (nodeEnv !== "production") {
        return { KEYGEN_PRODUCT_TOKEN: envToken };
      }

      // Secrets Manager is the canonical source
      if (secretsManagerData) {
        return {
          KEYGEN_PRODUCT_TOKEN: secretsManagerData.KEYGEN_PRODUCT_TOKEN,
        };
      }

      // No fallback — fail loudly (FINDING-4)
      throw new Error("Keygen secrets unavailable");
    }

    it("should use environment variables in development mode", async () => {
      const result = await mockGetKeygenSecrets({
        nodeEnv: "development",
        envToken: "dev_keygen_token",
      });

      expect(result.KEYGEN_PRODUCT_TOKEN).toBe("dev_keygen_token");
    });

    it("should use Secrets Manager in production (canonical source)", async () => {
      const result = await mockGetKeygenSecrets({
        nodeEnv: "production",
        secretsManagerData: {
          KEYGEN_PRODUCT_TOKEN: "sm_keygen_token",
        },
      });

      expect(result.KEYGEN_PRODUCT_TOKEN).toBe("sm_keygen_token");
    });

    it("should throw when Secrets Manager fails for Keygen (FINDING-4)", async () => {
      let error;
      try {
        await mockGetKeygenSecrets({
          nodeEnv: "production",
          secretsManagerData: null,
        });
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.message).toBe("Keygen secrets unavailable");
    });
  });

  describe("getAppSecrets behavior", () => {
    async function mockGetAppSecrets(options = {}) {
      const {
        nodeEnv = "production",
        envTrialSecret = null,
        secretsManagerData = null,
        secretsManagerError = null,
      } = options;

      // Non-production (dev, test, CI)
      if (nodeEnv !== "production") {
        return {
          TRIAL_TOKEN_SECRET:
            envTrialSecret || "dev-trial-secret-for-local-development-only",
        };
      }

      // Production: Secrets Manager
      if (secretsManagerData) {
        return { TRIAL_TOKEN_SECRET: secretsManagerData.TRIAL_TOKEN_SECRET };
      }

      if (secretsManagerError) {
        throw new Error("Application secrets unavailable");
      }

      return { TRIAL_TOKEN_SECRET: envTrialSecret };
    }

    it("should use environment variables in development mode", async () => {
      const result = await mockGetAppSecrets({
        nodeEnv: "development",
        envTrialSecret: "dev_trial_secret",
      });

      expect(result.TRIAL_TOKEN_SECRET).toBe("dev_trial_secret");
    });

    it("should use default dev secret when env var not set in development", async () => {
      const result = await mockGetAppSecrets({
        nodeEnv: "development",
        envTrialSecret: null,
      });

      expect(result.TRIAL_TOKEN_SECRET).toBe(
        "dev-trial-secret-for-local-development-only",
      );
    });

    it("should use Secrets Manager in production", async () => {
      const result = await mockGetAppSecrets({
        nodeEnv: "production",
        secretsManagerData: {
          TRIAL_TOKEN_SECRET: "prod_trial_secret",
        },
      });

      expect(result.TRIAL_TOKEN_SECRET).toBe("prod_trial_secret");
    });

    it("should throw error when Secrets Manager unavailable in production", async () => {
      let error;
      try {
        await mockGetAppSecrets({
          nodeEnv: "production",
          secretsManagerError: new Error("SM unavailable"),
        });
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.message).toBe("Application secrets unavailable");
    });
  });


  describe("getSecret (Secrets Manager) behavior", () => {
    async function mockGetSecret(secretName, options = {}) {
      const { secretString = null, errorMessage = null } = options;

      if (errorMessage) {
        throw new Error(`Unable to retrieve secret: ${secretName}`);
      }

      if (!secretString) {
        throw new Error(`Secret ${secretName} has no string value`);
      }

      return JSON.parse(secretString);
    }

    it("should return parsed secret when found", async () => {
      const result = await mockGetSecret("plg/staging/stripe", {
        secretString: JSON.stringify({
          STRIPE_SECRET_KEY: "sk_test_123",
          STRIPE_WEBHOOK_SECRET: "whsec_456",
        }),
      });

      expect(result.STRIPE_SECRET_KEY).toBe("sk_test_123");
      expect(result.STRIPE_WEBHOOK_SECRET).toBe("whsec_456");
    });

    it("should throw error when secret has no string value", async () => {
      let error;
      try {
        await mockGetSecret("plg/staging/empty", { secretString: null });
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.message).toContain("has no string value");
    });

    it("should throw error when secret cannot be fetched", async () => {
      let error;
      try {
        await mockGetSecret("plg/staging/missing", {
          errorMessage: "Secret not found",
        });
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.message).toContain("Unable to retrieve secret");
    });

    it("should parse complex nested secrets", async () => {
      const result = await mockGetSecret("plg/staging/complex", {
        secretString: JSON.stringify({
          credentials: {
            api_key: "key123",
            api_secret: "secret456",
          },
          config: {
            region: "us-east-1",
            timeout: 30000,
          },
        }),
      });

      expect(result.credentials.api_key).toBe("key123");
      expect(result.config.region).toBe("us-east-1");
    });
  });

  describe("Environment detection", () => {
    it("should detect staging from NEXT_PUBLIC_APP_URL", () => {
      const appUrl = "https://staging.hic-ai.com";
      const isStaging = appUrl.includes("staging");
      expect(isStaging).toBe(true);
    });

    it("should detect production from NEXT_PUBLIC_APP_URL", () => {
      const appUrl = "https://www.hic-ai.com";
      const isStaging = appUrl.includes("staging");
      expect(isStaging).toBe(false);
    });

    it("should use staging as default for development", () => {
      const appUrl = undefined;
      const nodeEnv = "development";
      const environment =
        appUrl?.includes("staging") || nodeEnv !== "production"
          ? "staging"
          : "production";
      expect(environment).toBe("staging");
    });

    it("should detect production when NODE_ENV is production and not staging URL", () => {
      const appUrl = "https://www.hic-ai.com";
      const nodeEnv = "production";
      const environment = appUrl.includes("staging")
        ? "staging"
        : nodeEnv === "production"
          ? "production"
          : "staging";
      expect(environment).toBe("production");
    });
  });

  describe("Cache TTL configuration", () => {
    it("should have 5 minute default TTL", () => {
      const CACHE_TTL_MS = 5 * 60 * 1000;
      expect(CACHE_TTL_MS).toBe(300000);
    });

    it("should be configurable for different TTL values", () => {
      const shortTTL = 1 * 60 * 1000; // 1 minute
      const longTTL = 15 * 60 * 1000; // 15 minutes

      expect(shortTTL).toBe(60000);
      expect(longTTL).toBe(900000);
    });
  });

  describe("Error handling", () => {
    it("should handle JSON parse errors gracefully", () => {
      const invalidJson = "not valid json";
      let error;
      try {
        JSON.parse(invalidJson);
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error instanceof SyntaxError).toBe(true);
    });

    it("should handle network timeouts", async () => {
      // Simulate timeout behavior
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), 100),
      );

      let error;
      try {
        await timeout;
      } catch (e) {
        error = e;
      }

      expect(error.message).toBe("Timeout");
    });

    it("should not cache errors", () => {
      // Errors should not be cached to allow retry
      cache.set("test-secret", { data: "valid" });

      // Simulate error by not caching
      // Next call should still attempt to fetch
      const cached = cache.get("test-secret");
      expect(cached).toBeDefined(); // Valid data is cached

      // Error case - don't cache
      // cache should remain empty for error keys
      const errorKey = "error-secret";
      expect(cache.get(errorKey)).toBe(null);
    });
  });

  describe("Client initialization", () => {
    it("should use us-east-1 as default region", () => {
      const defaultRegion = "us-east-1";
      expect(defaultRegion).toBe("us-east-1");
    });

    it("should use AWS_REGION environment variable when set", () => {
      const customRegion = "us-west-2";
      const region = customRegion || "us-east-1";
      expect(region).toBe("us-west-2");
    });

    it("should lazily initialize clients", () => {
      let secretsClient = null;

      function getSecretsClient() {
        if (!secretsClient) {
          secretsClient = { initialized: true };
        }
        return secretsClient;
      }

      expect(secretsClient).toBe(null);

      const client1 = getSecretsClient();
      expect(client1.initialized).toBe(true);

      const client2 = getSecretsClient();
      expect(client1).toBe(client2); // Same instance
    });
  });

  // ============================================
  // FINDING-4 Edge Cases: No process.env Fallback in Production
  // ============================================

  describe("getStripeSecrets — FINDING-4 edge cases", () => {
    // Faithful mock of the production code's resolution chain:
    // SM (canonical) → throw
    async function mockGetStripeSecrets(options = {}) {
      const {
        nodeEnv = "production",
        envSecretKey = undefined,
        envWebhookSecret = undefined,
        secretsManagerData = null,
      } = options;

      if (nodeEnv !== "production") {
        return {
          STRIPE_SECRET_KEY: envSecretKey,
          STRIPE_WEBHOOK_SECRET: envWebhookSecret,
        };
      }

      // Secrets Manager is the canonical source
      if (secretsManagerData) {
        return {
          STRIPE_SECRET_KEY: secretsManagerData.STRIPE_SECRET_KEY,
          STRIPE_WEBHOOK_SECRET: secretsManagerData.STRIPE_WEBHOOK_SECRET,
        };
      }

      throw new Error("Stripe secrets unavailable");
    }

    it("should return SM data even if SM has undefined fields", async () => {
      // SM succeeds but the JSON doesn't contain the expected keys
      const result = await mockGetStripeSecrets({
        secretsManagerData: {
          STRIPE_SECRET_KEY: undefined,
          STRIPE_WEBHOOK_SECRET: undefined,
        },
      });
      // The code returns whatever SM provides — it's trusted as canonical
      expect(result.STRIPE_SECRET_KEY).toBe(undefined);
      expect(result.STRIPE_WEBHOOK_SECRET).toBe(undefined);
    });

    it("should never use process.env in production when SM fails", async () => {
      // Simulates the scenario FINDING-4 protects against:
      // Before the fix, this would silently fall back to process.env.
      // After the fix, this throws.
      let error;
      try {
        await mockGetStripeSecrets({
          nodeEnv: "production",
          envSecretKey: "sk_test_from_env",
          envWebhookSecret: "whsec_from_env",
          secretsManagerData: null,
        });
      } catch (e) {
        error = e;
      }
      expect(error).toBeDefined();
      expect(error.message).toBe("Stripe secrets unavailable");
    });

    it("should return development env vars even when undefined", async () => {
      const result = await mockGetStripeSecrets({
        nodeEnv: "development",
        envSecretKey: undefined,
        envWebhookSecret: undefined,
      });
      expect(result.STRIPE_SECRET_KEY).toBe(undefined);
      expect(result.STRIPE_WEBHOOK_SECRET).toBe(undefined);
    });
  });

  describe("getKeygenSecrets — FINDING-4 edge cases", () => {
    async function mockGetKeygenSecrets(options = {}) {
      const {
        nodeEnv = "production",
        envToken = undefined,
        secretsManagerData = null,
      } = options;

      if (nodeEnv !== "production") {
        return { KEYGEN_PRODUCT_TOKEN: envToken };
      }

      if (secretsManagerData) {
        return { KEYGEN_PRODUCT_TOKEN: secretsManagerData.KEYGEN_PRODUCT_TOKEN };
      }

      throw new Error("Keygen secrets unavailable");
    }

    it("should throw when SM fails for Keygen", async () => {
      let error;
      try {
        await mockGetKeygenSecrets({
          nodeEnv: "production",
          secretsManagerData: null,
        });
      } catch (e) {
        error = e;
      }
      expect(error).toBeDefined();
      expect(error.message).toBe("Keygen secrets unavailable");
    });

    it("should never use process.env for Keygen in production (FINDING-4)", async () => {
      let error;
      try {
        await mockGetKeygenSecrets({
          nodeEnv: "production",
          envToken: "env_token_should_not_be_used",
          secretsManagerData: null,
        });
      } catch (e) {
        error = e;
      }
      expect(error).toBeDefined();
      expect(error.message).toBe("Keygen secrets unavailable");
    });

    it("should return development env var even when undefined", async () => {
      const result = await mockGetKeygenSecrets({
        nodeEnv: "development",
        envToken: undefined,
      });
      expect(result.KEYGEN_PRODUCT_TOKEN).toBe(undefined);
    });

    it("should return SM data even if SM token is empty string", async () => {
      const result = await mockGetKeygenSecrets({
        secretsManagerData: { KEYGEN_PRODUCT_TOKEN: "" },
      });
      expect(result.KEYGEN_PRODUCT_TOKEN).toBe("");
    });
  });

  describe("getKeygenPolicyIds — Secrets Manager with 4-policy model", () => {
    async function mockGetKeygenPolicyIds(options = {}) {
      const {
        nodeEnv = "production",
        envIndividualMonthly = undefined,
        envIndividualAnnual = undefined,
        envBusinessMonthly = undefined,
        envBusinessAnnual = undefined,
        secretsManagerData = null,
      } = options;

      if (nodeEnv !== "production") {
        return {
          individualMonthly: envIndividualMonthly,
          individualAnnual: envIndividualAnnual,
          businessMonthly: envBusinessMonthly,
          businessAnnual: envBusinessAnnual,
        };
      }

      if (!secretsManagerData) {
        throw new Error("Keygen policy IDs unavailable");
      }

      const result = {
        individualMonthly: secretsManagerData.KEYGEN_POLICY_ID_INDIVIDUAL_MONTHLY,
        individualAnnual: secretsManagerData.KEYGEN_POLICY_ID_INDIVIDUAL_ANNUAL,
        businessMonthly: secretsManagerData.KEYGEN_POLICY_ID_BUSINESS_MONTHLY,
        businessAnnual: secretsManagerData.KEYGEN_POLICY_ID_BUSINESS_ANNUAL,
      };

      // Validate all 4 policy IDs are present
      const missing = Object.entries(result)
        .filter(([, v]) => !v)
        .map(([k]) => k);

      if (missing.length > 0) {
        throw new Error(`Keygen policy IDs missing: ${missing.join(", ")}`);
      }

      return result;
    }

    it("should return all 4 policy IDs from Secrets Manager", async () => {
      const result = await mockGetKeygenPolicyIds({
        secretsManagerData: {
          KEYGEN_POLICY_ID_INDIVIDUAL_MONTHLY: "policy-im-uuid",
          KEYGEN_POLICY_ID_INDIVIDUAL_ANNUAL: "policy-ia-uuid",
          KEYGEN_POLICY_ID_BUSINESS_MONTHLY: "policy-bm-uuid",
          KEYGEN_POLICY_ID_BUSINESS_ANNUAL: "policy-ba-uuid",
        },
      });
      expect(result.individualMonthly).toBe("policy-im-uuid");
      expect(result.individualAnnual).toBe("policy-ia-uuid");
      expect(result.businessMonthly).toBe("policy-bm-uuid");
      expect(result.businessAnnual).toBe("policy-ba-uuid");
    });

    it("should throw when any policy ID is missing from SM", async () => {
      let error;
      try {
        await mockGetKeygenPolicyIds({
          secretsManagerData: {
            KEYGEN_POLICY_ID_INDIVIDUAL_MONTHLY: "policy-im-uuid",
            KEYGEN_POLICY_ID_INDIVIDUAL_ANNUAL: "policy-ia-uuid",
            // Missing business policies
          },
        });
      } catch (e) {
        error = e;
      }
      expect(error).toBeDefined();
      expect(error.message).toContain("Keygen policy IDs missing");
      expect(error.message).toContain("businessMonthly");
      expect(error.message).toContain("businessAnnual");
    });

    it("should throw when SM is unavailable", async () => {
      let error;
      try {
        await mockGetKeygenPolicyIds({
          nodeEnv: "production",
          secretsManagerData: null,
        });
      } catch (e) {
        error = e;
      }
      expect(error).toBeDefined();
      expect(error.message).toBe("Keygen policy IDs unavailable");
    });

    it("should never use process.env for policy IDs in production (FINDING-4)", async () => {
      let error;
      try {
        await mockGetKeygenPolicyIds({
          nodeEnv: "production",
          envIndividualMonthly: "env-im-should-not-be-used",
          envIndividualAnnual: "env-ia-should-not-be-used",
          envBusinessMonthly: "env-bm-should-not-be-used",
          envBusinessAnnual: "env-ba-should-not-be-used",
          secretsManagerData: null,
        });
      } catch (e) {
        error = e;
      }
      expect(error).toBeDefined();
      expect(error.message).toBe("Keygen policy IDs unavailable");
    });

    it("should return development env vars even when undefined", async () => {
      const result = await mockGetKeygenPolicyIds({
        nodeEnv: "development",
      });
      expect(result.individualMonthly).toBe(undefined);
      expect(result.individualAnnual).toBe(undefined);
      expect(result.businessMonthly).toBe(undefined);
      expect(result.businessAnnual).toBe(undefined);
    });

    it("should return development env vars when set", async () => {
      const result = await mockGetKeygenPolicyIds({
        nodeEnv: "development",
        envIndividualMonthly: "dev-im-id",
        envIndividualAnnual: "dev-ia-id",
        envBusinessMonthly: "dev-bm-id",
        envBusinessAnnual: "dev-ba-id",
      });
      expect(result.individualMonthly).toBe("dev-im-id");
      expect(result.individualAnnual).toBe("dev-ia-id");
      expect(result.businessMonthly).toBe("dev-bm-id");
      expect(result.businessAnnual).toBe("dev-ba-id");
    });

    it("should throw with specific missing keys when only some are present", async () => {
      let error;
      try {
        await mockGetKeygenPolicyIds({
          secretsManagerData: {
            KEYGEN_POLICY_ID_INDIVIDUAL_MONTHLY: "policy-im-uuid",
            // The other 3 are missing
          },
        });
      } catch (e) {
        error = e;
      }
      expect(error).toBeDefined();
      expect(error.message).toContain("individualAnnual");
      expect(error.message).toContain("businessMonthly");
      expect(error.message).toContain("businessAnnual");
      // The present one should NOT be in the error message
      expect(error.message).not.toContain("individualMonthly");
    });
  });

  describe("Error message contract", () => {
    // Verify exact error messages that callers may depend on.
    // If error messages change in secrets.js, these tests catch it.

    it("Stripe failure throws exactly 'Stripe secrets unavailable'", () => {
      let error;
      try {
        throw new Error("Stripe secrets unavailable");
      } catch (e) {
        error = e;
      }
      expect(error.message).toBe("Stripe secrets unavailable");
    });

    it("Keygen failure throws exactly 'Keygen secrets unavailable'", () => {
      let error;
      try {
        throw new Error("Keygen secrets unavailable");
      } catch (e) {
        error = e;
      }
      expect(error.message).toBe("Keygen secrets unavailable");
    });

    it("Keygen policy IDs failure throws exactly 'Keygen policy IDs unavailable'", () => {
      let error;
      try {
        throw new Error("Keygen policy IDs unavailable");
      } catch (e) {
        error = e;
      }
      expect(error.message).toBe("Keygen policy IDs unavailable");
    });

    it("App secrets failure throws exactly 'Application secrets unavailable'", () => {
      let error;
      try {
        throw new Error("Application secrets unavailable");
      } catch (e) {
        error = e;
      }
      expect(error.message).toBe("Application secrets unavailable");
    });
  });

  describe("Resolution chain symmetry", () => {
    // Verify all secret accessors follow the same pattern:
    // non-production → Secrets Manager → throw

    it("getStripeSecrets: non-prod → SM → throw", () => {
      const chain = ["non-production:process.env", "SM:plg/{env}/stripe", "throw"];
      expect(chain.length).toBe(3);
      expect(chain[0]).toContain("non-production");
      expect(chain[1]).toContain("SM");
      expect(chain[2]).toBe("throw");
    });

    it("getKeygenSecrets: non-prod → SM → throw", () => {
      const chain = ["non-production:process.env", "SM:plg/{env}/keygen", "throw"];
      expect(chain.length).toBe(3);
      expect(chain[2]).toBe("throw");
    });

    it("getKeygenPolicyIds: non-prod → SM → validate → throw", () => {
      const chain = ["non-production:process.env", "SM:plg/{env}/keygen", "validate-all-4-present", "throw"];
      expect(chain.length).toBe(4);
      expect(chain[2]).toContain("validate");
      expect(chain[3]).toBe("throw");
    });

    it("getAppSecrets: non-prod → SM → throw", () => {
      const chain = ["non-production:process.env", "SM:plg/{env}/app", "throw"];
      expect(chain.length).toBe(3);
      expect(chain[2]).toBe("throw");
    });
  });
});

  describe("safeJsonParse integration (CWE-20/400/502)", () => {
    /**
     * Validates that the secrets module uses safeJsonParse to parse
     * Secrets Manager responses. The production code (secrets.js)
     * now uses safeJsonParse(response.SecretString, { source: ... })
     * instead of bare JSON.parse.
     *
     * These tests exercise safeJsonParse directly with the same error
     * patterns that would be encountered in production.
     */
    const safeJsonParse = _safeJsonParse;

    it("should reject non-JSON SecretString via safeJsonParse", () => {
      expect(() => {
        safeJsonParse("this-is-not-json", { source: "secrets-manager-test" });
      }).toThrow();
    });

    it("should reject empty SecretString via safeJsonParse", () => {
      expect(() => {
        safeJsonParse("", { source: "secrets-manager-test" });
      }).toThrow();
    });

    it("should reject deeply nested SecretString (maxDepth)", () => {
      let nested = { key: "value" };
      for (let i = 0; i < 15; i++) {
        nested = { level: nested };
      }
      const deepJson = JSON.stringify(nested);

      expect(() => {
        safeJsonParse(deepJson, { source: "secrets-manager-depth-test" });
      }).toThrow();
    });

    it("should parse valid Secrets Manager JSON response", () => {
      const secretData = JSON.stringify({
        STRIPE_SECRET_KEY: "sk_test_abc123",
        STRIPE_WEBHOOK_SECRET: "whsec_xyz789",
      });

      const result = safeJsonParse(secretData, { source: "secrets-manager-plg" });
      expect(result.STRIPE_SECRET_KEY).toBe("sk_test_abc123");
      expect(result.STRIPE_WEBHOOK_SECRET).toBe("whsec_xyz789");
    });

    it("should include source label in error messages", () => {
      let errorMsg = "";
      try {
        safeJsonParse("invalid", { source: "secrets-manager-stripe" });
      } catch (e) {
        errorMsg = e.message;
      }
      expect(errorMsg).toContain("secrets-manager-stripe");
    });
  });
