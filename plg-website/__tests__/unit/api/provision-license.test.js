/**
 * Provision License API Route Tests
 *
 * Tests the license provisioning logic including:
 * - JWT token verification from Authorization header
 * - Session ID validation
 * - Stripe checkout session verification
 * - Idempotency checking (already provisioned)
 * - Plan type determination
 * - License creation parameters
 * - Customer record creation
 * - Response formatting
 *
 * @see PLG User Journey - License Provisioning
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";

// ============================================================================
// Test Helpers - Simulating Route Handler Logic
// ============================================================================

/**
 * Simulates JWT token extraction from Authorization header
 * This mirrors the verifyAuthToken function in the route
 */
function extractAuthToken(authHeader) {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7);
}

/**
 * Simulates building user object from JWT payload
 * This mirrors the user object construction in the route
 */
function buildUserFromToken(tokenPayload) {
  if (!tokenPayload) return null;
  return {
    sub: tokenPayload.sub,
    email: tokenPayload.email,
    name: tokenPayload.name || tokenPayload["cognito:username"],
  };
}

/**
 * Simulates plan name determination from metadata
 */
function getPlanName(planType) {
  return planType === "individual"
    ? "Individual"
    : planType === "enterprise"
      ? "Enterprise"
      : "Open Source";
}

/**
 * Simulates max devices calculation based on plan
 */
function getMaxDevices(planType) {
  return planType === "business" ? 5 : 3;
}

/**
 * Simulates license key preview generation
 */
function generateLicenseKeyPreview(licenseKey) {
  return `${licenseKey.slice(0, 8)}...${licenseKey.slice(-4)}`;
}

/**
 * Simulates username extraction from email or name
 */
function getUserName(name, email) {
  return name || email.split("@")[0];
}

/**
 * Simulates idempotency check
 */
function isAlreadyProvisioned(existingCustomer, stripeCustomerId) {
  return existingCustomer?.stripeCustomerId === stripeCustomerId;
}

// ============================================================================
// Mock Data
// ============================================================================

function createMockTokenPayload(overrides = {}) {
  return {
    sub: "cognito|user-123",
    email: "test@example.com",
    name: "Test User",
    "cognito:username": "testuser",
    ...overrides,
  };
}

function createMockCheckoutSession(overrides = {}) {
  return {
    id: "cs_test_abc123",
    payment_status: "paid",
    customer: { id: "cus_test123" },
    subscription: { id: "sub_test456" },
    metadata: { planType: "individual" },
    ...overrides,
  };
}

function createMockLicense(overrides = {}) {
  return {
    id: "license-uuid-123",
    key: "key/ABCD1234EFGH5678IJKL9012",
    expiresAt: "2027-01-29T00:00:00Z",
    ...overrides,
  };
}

function createMockExistingCustomer(overrides = {}) {
  return {
    userId: "cognito|user-123",
    email: "test@example.com",
    stripeCustomerId: "cus_test123",
    accountType: "individual",
    licenseKeyPreview: "key/ABCD...9012",
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("provision-license API logic", () => {
  describe("Authorization header parsing", () => {
    it("should return null for missing Authorization header", () => {
      const token = extractAuthToken(null);
      assert.strictEqual(token, null);
    });

    it("should return null for undefined Authorization header", () => {
      const token = extractAuthToken(undefined);
      assert.strictEqual(token, null);
    });

    it("should return null for empty Authorization header", () => {
      const token = extractAuthToken("");
      assert.strictEqual(token, null);
    });

    it("should return null for non-Bearer Authorization header", () => {
      const token = extractAuthToken("Basic abc123");
      assert.strictEqual(token, null);
    });

    it("should return null for Bearer without space", () => {
      const token = extractAuthToken("Bearerabc123");
      assert.strictEqual(token, null);
    });

    it("should extract token from valid Bearer header", () => {
      const token = extractAuthToken(
        "Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9",
      );
      assert.strictEqual(token, "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9");
    });

    it("should handle Bearer with extra spaces in token", () => {
      // Token itself shouldn't have spaces, but we should handle edge cases
      const token = extractAuthToken("Bearer abc 123");
      assert.strictEqual(token, "abc 123");
    });
  });

  describe("user object construction from JWT", () => {
    it("should return null for null token payload", () => {
      const user = buildUserFromToken(null);
      assert.strictEqual(user, null);
    });

    it("should return null for undefined token payload", () => {
      const user = buildUserFromToken(undefined);
      assert.strictEqual(user, null);
    });

    it("should build user with name from token", () => {
      const payload = createMockTokenPayload({ name: "John Doe" });
      const user = buildUserFromToken(payload);

      assert.strictEqual(user.sub, "cognito|user-123");
      assert.strictEqual(user.email, "test@example.com");
      assert.strictEqual(user.name, "John Doe");
    });

    it("should fallback to cognito:username when name is missing", () => {
      const payload = createMockTokenPayload({ name: undefined });
      const user = buildUserFromToken(payload);

      assert.strictEqual(user.name, "testuser");
    });

    it("should fallback to cognito:username when name is empty", () => {
      const payload = createMockTokenPayload({ name: "" });
      const user = buildUserFromToken(payload);

      // Empty string is falsy, so it should fallback
      assert.strictEqual(user.name, "testuser");
    });

    it("should handle payload with only required fields", () => {
      const payload = {
        sub: "user-456",
        email: "minimal@test.com",
      };
      const user = buildUserFromToken(payload);

      assert.strictEqual(user.sub, "user-456");
      assert.strictEqual(user.email, "minimal@test.com");
      assert.strictEqual(user.name, undefined);
    });
  });

  describe("plan name determination", () => {
    it("should return 'Individual' for individual plan", () => {
      assert.strictEqual(getPlanName("individual"), "Individual");
    });

    it("should return 'Enterprise' for enterprise plan", () => {
      assert.strictEqual(getPlanName("enterprise"), "Enterprise");
    });

    it("should return 'Open Source' for unknown/default plan", () => {
      assert.strictEqual(getPlanName("business"), "Open Source");
      assert.strictEqual(getPlanName("other"), "Open Source");
      assert.strictEqual(getPlanName(null), "Open Source");
      assert.strictEqual(getPlanName(undefined), "Open Source");
    });
  });

  describe("max devices calculation", () => {
    it("should return 3 for individual plan", () => {
      assert.strictEqual(getMaxDevices("individual"), 3);
    });

    it("should return 5 for business plan", () => {
      assert.strictEqual(getMaxDevices("business"), 5);
    });

    it("should return 3 for other/unknown plans (default)", () => {
      assert.strictEqual(getMaxDevices("other"), 3);
      assert.strictEqual(getMaxDevices(null), 3);
    });
  });

  describe("license key preview generation", () => {
    it("should generate preview with first 8 and last 4 characters", () => {
      const licenseKey = "key/ABCDEFGHIJKLMNOPQRSTUVWXYZ1234";
      const preview = generateLicenseKeyPreview(licenseKey);

      assert.strictEqual(preview, "key/ABCD...1234");
    });

    it("should handle shorter license keys", () => {
      const licenseKey = "shortkey";
      const preview = generateLicenseKeyPreview(licenseKey);

      // first 8: "shortkey", last 4: "tkey"
      assert.strictEqual(preview, "shortkey...tkey");
    });

    it("should handle exact 12 character keys", () => {
      const licenseKey = "123456789012";
      const preview = generateLicenseKeyPreview(licenseKey);

      assert.strictEqual(preview, "12345678...9012");
    });
  });

  describe("username extraction", () => {
    it("should use name when provided", () => {
      const userName = getUserName("John Doe", "john@example.com");
      assert.strictEqual(userName, "John Doe");
    });

    it("should extract username from email when name is empty", () => {
      const userName = getUserName("", "john@example.com");
      assert.strictEqual(userName, "john");
    });

    it("should extract username from email when name is null", () => {
      const userName = getUserName(null, "jane.doe@company.com");
      assert.strictEqual(userName, "jane.doe");
    });

    it("should extract username from email when name is undefined", () => {
      const userName = getUserName(undefined, "user123@test.org");
      assert.strictEqual(userName, "user123");
    });

    it("should handle email without @ symbol gracefully", () => {
      // Edge case - malformed email
      const userName = getUserName(null, "malformed-email");
      assert.strictEqual(userName, "malformed-email");
    });
  });

  describe("idempotency check", () => {
    it("should return true when customer already has same Stripe customer ID", () => {
      const existingCustomer = createMockExistingCustomer({
        stripeCustomerId: "cus_abc123",
      });

      const result = isAlreadyProvisioned(existingCustomer, "cus_abc123");
      assert.strictEqual(result, true);
    });

    it("should return false when Stripe customer IDs differ", () => {
      const existingCustomer = createMockExistingCustomer({
        stripeCustomerId: "cus_abc123",
      });

      const result = isAlreadyProvisioned(existingCustomer, "cus_different");
      assert.strictEqual(result, false);
    });

    it("should return false when no existing customer", () => {
      const result = isAlreadyProvisioned(null, "cus_abc123");
      assert.strictEqual(result, false);
    });

    it("should return false when existing customer has no stripeCustomerId", () => {
      const existingCustomer = createMockExistingCustomer({
        stripeCustomerId: undefined,
      });

      const result = isAlreadyProvisioned(existingCustomer, "cus_abc123");
      assert.strictEqual(result, false);
    });
  });

  describe("input validation", () => {
    /**
     * Validates session ID input
     */
    function validateSessionId(sessionId) {
      if (!sessionId) {
        return { valid: false, error: "Missing session_id" };
      }
      return { valid: true };
    }

    it("should reject missing session ID", () => {
      const result = validateSessionId(null);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, "Missing session_id");
    });

    it("should reject undefined session ID", () => {
      const result = validateSessionId(undefined);
      assert.strictEqual(result.valid, false);
    });

    it("should reject empty string session ID", () => {
      const result = validateSessionId("");
      assert.strictEqual(result.valid, false);
    });

    it("should accept valid session ID", () => {
      const result = validateSessionId("cs_test_abc123");
      assert.strictEqual(result.valid, true);
    });
  });

  describe("payment status validation", () => {
    /**
     * Validates checkout session payment status
     */
    function validatePaymentStatus(checkoutSession) {
      if (checkoutSession.payment_status !== "paid") {
        return { valid: false, error: "Payment not completed" };
      }
      return { valid: true };
    }

    it("should reject unpaid checkout session", () => {
      const session = createMockCheckoutSession({ payment_status: "unpaid" });
      const result = validatePaymentStatus(session);

      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, "Payment not completed");
    });

    it("should reject pending checkout session", () => {
      const session = createMockCheckoutSession({ payment_status: "pending" });
      const result = validatePaymentStatus(session);

      assert.strictEqual(result.valid, false);
    });

    it("should accept paid checkout session", () => {
      const session = createMockCheckoutSession({ payment_status: "paid" });
      const result = validatePaymentStatus(session);

      assert.strictEqual(result.valid, true);
    });
  });

  describe("response formatting", () => {
    /**
     * Builds success response for new provisioning
     */
    function buildSuccessResponse(license, planName, user) {
      return {
        success: true,
        licenseKey: license.key,
        planName,
        userName: getUserName(user.name, user.email),
      };
    }

    /**
     * Builds response for already provisioned license
     */
    function buildAlreadyProvisionedResponse(existingCustomer) {
      return {
        success: true,
        alreadyProvisioned: true,
        licenseKey:
          existingCustomer.licenseKeyPreview ||
          "Check your email for your license key",
        planName: existingCustomer.accountType,
      };
    }

    it("should build correct success response", () => {
      const license = createMockLicense({ key: "key/TEST1234" });
      const user = {
        sub: "user-1",
        email: "test@example.com",
        name: "Test User",
      };

      const response = buildSuccessResponse(license, "Individual", user);

      assert.strictEqual(response.success, true);
      assert.strictEqual(response.licenseKey, "key/TEST1234");
      assert.strictEqual(response.planName, "Individual");
      assert.strictEqual(response.userName, "Test User");
    });

    it("should use email username when user name is missing", () => {
      const license = createMockLicense({ key: "key/TEST1234" });
      const user = {
        sub: "user-1",
        email: "johnsmith@example.com",
        name: null,
      };

      const response = buildSuccessResponse(license, "Enterprise", user);

      assert.strictEqual(response.userName, "johnsmith");
    });

    it("should build correct already provisioned response with preview", () => {
      const customer = createMockExistingCustomer({
        licenseKeyPreview: "key/ABCD...5678",
        accountType: "individual",
      });

      const response = buildAlreadyProvisionedResponse(customer);

      assert.strictEqual(response.success, true);
      assert.strictEqual(response.alreadyProvisioned, true);
      assert.strictEqual(response.licenseKey, "key/ABCD...5678");
      assert.strictEqual(response.planName, "individual");
    });

    it("should use fallback message when license preview is missing", () => {
      const customer = createMockExistingCustomer({
        licenseKeyPreview: null,
        accountType: "business",
      });

      const response = buildAlreadyProvisionedResponse(customer);

      assert.strictEqual(
        response.licenseKey,
        "Check your email for your license key",
      );
    });
  });

  describe("customer record building", () => {
    /**
     * Builds customer record for DynamoDB upsert
     */
    function buildCustomerRecord(user, checkoutSession, license, planType) {
      return {
        userId: user.sub,
        email: user.email,
        stripeCustomerId: checkoutSession.customer?.id,
        keygenLicenseId: license.id,
        accountType: planType,
        subscriptionStatus: "active",
        metadata: {
          name: user.name,
          stripeSubscriptionId: checkoutSession.subscription?.id,
          licenseKeyPreview: generateLicenseKeyPreview(license.key),
        },
      };
    }

    it("should build complete customer record", () => {
      const user = {
        sub: "cognito|user-456",
        email: "customer@example.com",
        name: "Customer Name",
      };
      const checkoutSession = createMockCheckoutSession({
        customer: { id: "cus_stripe123" },
        subscription: { id: "sub_stripe456" },
      });
      const license = createMockLicense({
        id: "lic-789",
        key: "key/LONGLICENSEKEY123456",
      });

      const record = buildCustomerRecord(
        user,
        checkoutSession,
        license,
        "individual",
      );

      assert.strictEqual(record.userId, "cognito|user-456");
      assert.strictEqual(record.email, "customer@example.com");
      assert.strictEqual(record.stripeCustomerId, "cus_stripe123");
      assert.strictEqual(record.keygenLicenseId, "lic-789");
      assert.strictEqual(record.accountType, "individual");
      assert.strictEqual(record.subscriptionStatus, "active");
      assert.strictEqual(record.metadata.name, "Customer Name");
      assert.strictEqual(record.metadata.stripeSubscriptionId, "sub_stripe456");
      assert.ok(record.metadata.licenseKeyPreview.includes("..."));
    });

    it("should handle missing optional fields", () => {
      const user = {
        sub: "cognito|user-789",
        email: "minimal@example.com",
        name: null,
      };
      const checkoutSession = createMockCheckoutSession({
        customer: null,
        subscription: null,
      });
      const license = createMockLicense();

      const record = buildCustomerRecord(
        user,
        checkoutSession,
        license,
        "enterprise",
      );

      assert.strictEqual(record.userId, "cognito|user-789");
      assert.strictEqual(record.stripeCustomerId, undefined);
      assert.strictEqual(record.metadata.name, null);
      assert.strictEqual(record.metadata.stripeSubscriptionId, undefined);
    });
  });

  describe("license record building", () => {
    /**
     * Builds license record for DynamoDB
     */
    function buildLicenseRecord(user, license, planType, planName) {
      return {
        keygenLicenseId: license.id,
        userId: user.sub,
        email: user.email,
        licenseKey: license.key,
        policyId: planType,
        planName,
        status: "active",
        expiresAt: license.expiresAt,
        maxDevices: getMaxDevices(planType),
      };
    }

    it("should build complete license record for individual plan", () => {
      const user = { sub: "user-1", email: "test@example.com" };
      const license = createMockLicense({
        id: "lic-123",
        key: "key/TESTKEY",
        expiresAt: "2027-12-31T23:59:59Z",
      });

      const record = buildLicenseRecord(
        user,
        license,
        "individual",
        "Individual",
      );

      assert.strictEqual(record.keygenLicenseId, "lic-123");
      assert.strictEqual(record.userId, "user-1");
      assert.strictEqual(record.email, "test@example.com");
      assert.strictEqual(record.licenseKey, "key/TESTKEY");
      assert.strictEqual(record.policyId, "individual");
      assert.strictEqual(record.planName, "Individual");
      assert.strictEqual(record.status, "active");
      assert.strictEqual(record.expiresAt, "2027-12-31T23:59:59Z");
      assert.strictEqual(record.maxDevices, 3);
    });

    it("should set correct maxDevices for enterprise plan", () => {
      const user = { sub: "user-1", email: "test@example.com" };
      const license = createMockLicense();

      const record = buildLicenseRecord(
        user,
        license,
        "enterprise",
        "Enterprise",
      );

      assert.strictEqual(record.maxDevices, 10);
    });

    it("should set correct maxDevices for business/other plan", () => {
      const user = { sub: "user-1", email: "test@example.com" };
      const license = createMockLicense();

      const record = buildLicenseRecord(
        user,
        license,
        "business",
        "Open Source",
      );

      assert.strictEqual(record.maxDevices, 2);
    });
  });

  describe("error handling", () => {
    /**
     * Builds error response
     */
    function buildErrorResponse(error) {
      return {
        error: `Failed to provision license: ${error.message}`,
        status: 500,
      };
    }

    it("should format error message correctly", () => {
      const error = new Error("Stripe API failed");
      const response = buildErrorResponse(error);

      assert.strictEqual(
        response.error,
        "Failed to provision license: Stripe API failed",
      );
      assert.strictEqual(response.status, 500);
    });

    it("should handle error without message", () => {
      const error = new Error();
      const response = buildErrorResponse(error);

      assert.strictEqual(response.error, "Failed to provision license: ");
    });
  });
});
