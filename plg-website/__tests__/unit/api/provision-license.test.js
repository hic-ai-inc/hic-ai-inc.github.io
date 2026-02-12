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

// NOTE: Authorization header parsing and JWT user object construction tests
// have been consolidated into __tests__/unit/lib/auth-verify.test.js
// as part of the shared verifyAuthToken() extraction (Phase 1 Step 1.2).

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

    it("should set correct maxDevices for business plan", () => {
      const user = { sub: "user-1", email: "test@example.com" };
      const license = createMockLicense();

      const record = buildLicenseRecord(
        user,
        license,
        "business",
        "Business",
      );

      assert.strictEqual(record.maxDevices, 5);
    });

    it("should default to individual maxDevices for unknown plan", () => {
      const user = { sub: "user-1", email: "test@example.com" };
      const license = createMockLicense();

      const record = buildLicenseRecord(
        user,
        license,
        "unknown",
        "Unknown Plan",
      );

      assert.strictEqual(record.maxDevices, 3);
    });
  });

  describe("owner role assignment for Business plans", () => {
    /**
     * Determines if owner role should be assigned to a user
     * Owner role is assigned when:
     * 1. Plan type is "business"
     * 2. User has a valid Cognito sub (not null/undefined)
     */
    function shouldAssignOwnerRole(planType, cognitoSub) {
      return planType === "business" && !!cognitoSub;
    }

    /**
     * Simulates owner role assignment result
     * Returns { success: true } or throws error
     */
    async function assignOwnerRoleWithResult(cognitoSub, mockBehavior = {}) {
      if (mockBehavior.shouldFail) {
        throw new Error(mockBehavior.errorMessage || "Failed to assign owner role");
      }
      return { success: true, cognitoSub };
    }

    describe("role assignment decision logic", () => {
      it("should assign owner role for business plan with valid cognitoSub", () => {
        const result = shouldAssignOwnerRole("business", "e4a8f4f8-f0a1-704b-a2cf-66461fae76ed");
        assert.strictEqual(result, true);
      });

      it("should NOT assign owner role for individual plan", () => {
        const result = shouldAssignOwnerRole("individual", "e4a8f4f8-f0a1-704b-a2cf-66461fae76ed");
        assert.strictEqual(result, false);
      });

      it("should NOT assign owner role for business plan without cognitoSub", () => {
        const result = shouldAssignOwnerRole("business", null);
        assert.strictEqual(result, false);
      });

      it("should NOT assign owner role for business plan with undefined cognitoSub", () => {
        const result = shouldAssignOwnerRole("business", undefined);
        assert.strictEqual(result, false);
      });

      it("should NOT assign owner role for business plan with empty string cognitoSub", () => {
        const result = shouldAssignOwnerRole("business", "");
        assert.strictEqual(result, false);
      });

      it("should NOT assign owner role for enterprise plan", () => {
        const result = shouldAssignOwnerRole("enterprise", "valid-sub");
        assert.strictEqual(result, false);
      });

      it("should NOT assign owner role for unknown plan type", () => {
        const result = shouldAssignOwnerRole("unknown", "valid-sub");
        assert.strictEqual(result, false);
      });
    });

    describe("role assignment for existing Business customers", () => {
      /**
       * Simulates the existing customer flow in provision-license
       * - Gets planType from existingCustomer.accountType OR checkout metadata
       * - Assigns owner role if business plan
       */
      async function handleExistingBusinessCustomer(existingCustomer, checkoutSession, cognitoSub, mockAssign) {
        const planType = existingCustomer.accountType || checkoutSession.metadata?.planType || "individual";
        
        const result = {
          planType,
          ownerRoleAssigned: false,
          ownerRoleError: null,
        };

        if (planType === "business" && cognitoSub) {
          try {
            await mockAssign(cognitoSub);
            result.ownerRoleAssigned = true;
          } catch (error) {
            result.ownerRoleError = error.message;
            // Non-fatal: continue anyway
          }
        }

        return result;
      }

      it("should assign owner role to existing business customer", async () => {
        const existingCustomer = createMockExistingCustomer({ accountType: "business" });
        const checkoutSession = createMockCheckoutSession({ metadata: { planType: "business" } });
        const cognitoSub = "e4a8f4f8-f0a1-704b-a2cf-66461fae76ed";
        
        const result = await handleExistingBusinessCustomer(
          existingCustomer,
          checkoutSession,
          cognitoSub,
          () => Promise.resolve({ success: true })
        );

        assert.strictEqual(result.planType, "business");
        assert.strictEqual(result.ownerRoleAssigned, true);
        assert.strictEqual(result.ownerRoleError, null);
      });

      it("should NOT assign owner role to existing individual customer", async () => {
        const existingCustomer = createMockExistingCustomer({ accountType: "individual" });
        const checkoutSession = createMockCheckoutSession({ metadata: { planType: "individual" } });
        const cognitoSub = "e4a8f4f8-f0a1-704b-a2cf-66461fae76ed";

        const result = await handleExistingBusinessCustomer(
          existingCustomer,
          checkoutSession,
          cognitoSub,
          () => Promise.resolve({ success: true })
        );

        assert.strictEqual(result.planType, "individual");
        assert.strictEqual(result.ownerRoleAssigned, false);
      });

      it("should fallback to checkout metadata when accountType is missing", async () => {
        const existingCustomer = createMockExistingCustomer({ accountType: undefined });
        const checkoutSession = createMockCheckoutSession({ metadata: { planType: "business" } });
        const cognitoSub = "e4a8f4f8-f0a1-704b-a2cf-66461fae76ed";

        const result = await handleExistingBusinessCustomer(
          existingCustomer,
          checkoutSession,
          cognitoSub,
          () => Promise.resolve({ success: true })
        );

        assert.strictEqual(result.planType, "business");
        assert.strictEqual(result.ownerRoleAssigned, true);
      });

      it("should default to individual when both accountType and metadata are missing", async () => {
        const existingCustomer = createMockExistingCustomer({ accountType: undefined });
        const checkoutSession = createMockCheckoutSession({ metadata: { planType: undefined } });
        const cognitoSub = "e4a8f4f8-f0a1-704b-a2cf-66461fae76ed";

        const result = await handleExistingBusinessCustomer(
          existingCustomer,
          checkoutSession,
          cognitoSub,
          () => Promise.resolve({ success: true })
        );

        assert.strictEqual(result.planType, "individual");
        assert.strictEqual(result.ownerRoleAssigned, false);
      });

      it("should continue on role assignment failure (non-fatal error)", async () => {
        const existingCustomer = createMockExistingCustomer({ accountType: "business" });
        const checkoutSession = createMockCheckoutSession({ metadata: { planType: "business" } });
        const cognitoSub = "e4a8f4f8-f0a1-704b-a2cf-66461fae76ed";

        const result = await handleExistingBusinessCustomer(
          existingCustomer,
          checkoutSession,
          cognitoSub,
          () => Promise.reject(new Error("Cognito API rate limit exceeded"))
        );

        assert.strictEqual(result.planType, "business");
        assert.strictEqual(result.ownerRoleAssigned, false);
        assert.strictEqual(result.ownerRoleError, "Cognito API rate limit exceeded");
      });

      it("should NOT assign role when cognitoSub is missing", async () => {
        const existingCustomer = createMockExistingCustomer({ accountType: "business" });
        const checkoutSession = createMockCheckoutSession({ metadata: { planType: "business" } });

        const mockAssign = () => {
          throw new Error("Should not be called");
        };

        const result = await handleExistingBusinessCustomer(
          existingCustomer,
          checkoutSession,
          null, // No cognitoSub
          mockAssign
        );

        assert.strictEqual(result.ownerRoleAssigned, false);
      });
    });

    describe("role assignment for new Business customers", () => {
      /**
       * Simulates the new customer flow in provision-license
       * - Gets planType from checkout metadata
       * - Assigns owner role if business plan
       */
      async function handleNewBusinessCustomer(checkoutSession, cognitoSub, mockAssign) {
        const planType = checkoutSession.metadata?.planType || "individual";
        
        const result = {
          planType,
          ownerRoleAssigned: false,
          ownerRoleError: null,
        };

        if (planType === "business") {
          try {
            await mockAssign(cognitoSub);
            result.ownerRoleAssigned = true;
          } catch (error) {
            result.ownerRoleError = error.message;
            // Non-fatal: continue anyway
          }
        }

        return result;
      }

      it("should assign owner role for new business purchase", async () => {
        const checkoutSession = createMockCheckoutSession({ metadata: { planType: "business" } });
        const cognitoSub = "new-user-cognito-sub-123";

        const result = await handleNewBusinessCustomer(
          checkoutSession,
          cognitoSub,
          () => Promise.resolve({ success: true })
        );

        assert.strictEqual(result.planType, "business");
        assert.strictEqual(result.ownerRoleAssigned, true);
        assert.strictEqual(result.ownerRoleError, null);
      });

      it("should NOT assign owner role for new individual purchase", async () => {
        const checkoutSession = createMockCheckoutSession({ metadata: { planType: "individual" } });
        const cognitoSub = "new-user-cognito-sub-123";

        const result = await handleNewBusinessCustomer(
          checkoutSession,
          cognitoSub,
          () => { throw new Error("Should not be called"); }
        );

        assert.strictEqual(result.planType, "individual");
        assert.strictEqual(result.ownerRoleAssigned, false);
      });

      it("should continue on role assignment failure for new customer", async () => {
        const checkoutSession = createMockCheckoutSession({ metadata: { planType: "business" } });
        const cognitoSub = "new-user-cognito-sub-123";

        const result = await handleNewBusinessCustomer(
          checkoutSession,
          cognitoSub,
          () => Promise.reject(new Error("User pool not found"))
        );

        assert.strictEqual(result.planType, "business");
        assert.strictEqual(result.ownerRoleAssigned, false);
        assert.strictEqual(result.ownerRoleError, "User pool not found");
      });

      it("should default to individual when planType metadata is missing", async () => {
        const checkoutSession = createMockCheckoutSession({ metadata: {} });
        const cognitoSub = "new-user-cognito-sub-123";

        const result = await handleNewBusinessCustomer(
          checkoutSession,
          cognitoSub,
          () => { throw new Error("Should not be called"); }
        );

        assert.strictEqual(result.planType, "individual");
        assert.strictEqual(result.ownerRoleAssigned, false);
      });
    });

    describe("Cognito group assignment behavior", () => {
      /**
       * Simulates what assignOwnerRole does - adds user to mouse-owner group
       */
      function simulateAssignOwnerRole(cognitoSub, existingGroups = []) {
        const targetGroup = "mouse-owner";
        
        if (!cognitoSub) {
          throw new Error("Cognito sub is required");
        }

        // Check if already in group
        if (existingGroups.includes(targetGroup)) {
          return { success: true, alreadyInGroup: true };
        }

        // Add to group (simulated)
        return { 
          success: true, 
          alreadyInGroup: false,
          groupAdded: targetGroup,
        };
      }

      it("should add user to mouse-owner group", () => {
        const result = simulateAssignOwnerRole("user-sub-123", []);
        
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.alreadyInGroup, false);
        assert.strictEqual(result.groupAdded, "mouse-owner");
      });

      it("should handle user already in mouse-owner group (idempotent)", () => {
        const result = simulateAssignOwnerRole("user-sub-123", ["mouse-owner"]);
        
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.alreadyInGroup, true);
      });

      it("should handle user in other groups (Google auth)", () => {
        const result = simulateAssignOwnerRole(
          "user-sub-123", 
          ["us-east-1_CntYimcMm_Google"]
        );
        
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.alreadyInGroup, false);
        assert.strictEqual(result.groupAdded, "mouse-owner");
      });

      it("should throw error when cognitoSub is missing", () => {
        assert.throws(
          () => simulateAssignOwnerRole(null),
          /Cognito sub is required/
        );
      });
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
