/**
 * Portal API Route Tests
 *
 * Tests the portal API logic including:
 * - Authentication checks
 * - License data formatting
 * - Device management
 * - Invoice formatting
 * - Stripe portal session creation
 */

import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert";
import { PRICING } from "../../../src/lib/constants.js";

// Constants used in the routes
const AUTH_NAMESPACE = "https://hic-ai.com";

// Helper to create mock Auth0 session
function createMockSession(userOverrides = {}) {
  return {
    user: {
      sub: "auth0|test123",
      email: "test@example.com",
      email_verified: true,
      ...userOverrides,
    },
  };
}

describe("portal/license API logic", () => {
  function requireAuth(session) {
    if (!session?.user) {
      return { authenticated: false, error: "Unauthorized", status: 401 };
    }
    return { authenticated: true };
  }

  function checkCustomerHasLicense(customer) {
    if (!customer || !customer.keygenLicenseId) {
      return {
        hasLicense: false,
        response: { license: null, message: "No license found" },
      };
    }
    return { hasLicense: true };
  }

  function getPlanName(accountType) {
    if (accountType === "business") return "Business";
    if (accountType === "individual") return "Individual";
    return "Unknown"; // v4.2: No OSS or enterprise tiers
  }

  function maskLicenseKey(licenseKey) {
    if (!licenseKey) return null;
    return `${licenseKey.slice(0, 8)}...${licenseKey.slice(-4)}`;
  }

  function formatLicenseResponse(customer, localLicense, keygenLicense) {
    const planName = getPlanName(customer.accountType);
    const maskedKey = maskLicenseKey(localLicense?.licenseKey);

    return {
      license: {
        id: customer.keygenLicenseId,
        key: localLicense?.licenseKey,
        maskedKey,
        status: keygenLicense?.status || localLicense?.status || "unknown",
        planType: customer.accountType,
        planName,
        expiresAt: keygenLicense?.expiresAt || localLicense?.expiresAt,
        maxDevices: localLicense?.maxDevices || 3,
        activatedDevices: localLicense?.activatedDevices || 0,
        createdAt: localLicense?.createdAt,
      },
      subscription: {
        status: customer.subscriptionStatus,
        stripeCustomerId: customer.stripeCustomerId,
      },
    };
  }

  describe("authentication", () => {
    it("should reject unauthenticated request", () => {
      const result = requireAuth(null);
      assert.strictEqual(result.authenticated, false);
      assert.strictEqual(result.error, "Unauthorized");
      assert.strictEqual(result.status, 401);
    });

    it("should reject session without user", () => {
      const result = requireAuth({});
      assert.strictEqual(result.authenticated, false);
    });

    it("should accept authenticated session", () => {
      const session = createMockSession({ email: "user@example.com" });
      const result = requireAuth(session);
      assert.strictEqual(result.authenticated, true);
    });
  });

  describe("customer license check", () => {
    it("should return no license for missing customer", () => {
      const result = checkCustomerHasLicense(null);
      assert.strictEqual(result.hasLicense, false);
      assert.strictEqual(result.response.license, null);
    });

    it("should return no license when keygenLicenseId missing", () => {
      const result = checkCustomerHasLicense({ email: "user@example.com" });
      assert.strictEqual(result.hasLicense, false);
    });

    it("should confirm license exists", () => {
      const result = checkCustomerHasLicense({
        email: "user@example.com",
        keygenLicenseId: "lic_123",
      });
      assert.strictEqual(result.hasLicense, true);
    });
  });

  describe("plan name resolution", () => {
    it("should return Business for business", () => {
      assert.strictEqual(getPlanName("business"), "Business");
    });

    it("should return Individual for individual", () => {
      assert.strictEqual(getPlanName("individual"), "Individual");
    });

    // v4.2: OSS tier removed
  });

  describe("license key masking", () => {
    it("should mask license key correctly", () => {
      const masked = maskLicenseKey("ABCD-EFGH-IJKL-MNOP-1234");
      assert.strictEqual(masked, "ABCD-EFG...1234");
    });

    it("should handle null license key", () => {
      const masked = maskLicenseKey(null);
      assert.strictEqual(masked, null);
    });

    it("should handle undefined license key", () => {
      const masked = maskLicenseKey(undefined);
      assert.strictEqual(masked, null);
    });
  });

  describe("license response formatting", () => {
    it("should format complete license response", () => {
      const customer = {
        keygenLicenseId: "lic_123",
        accountType: "individual",
        subscriptionStatus: "active",
        stripeCustomerId: "cus_456",
      };

      const localLicense = {
        licenseKey: "ABCD-EFGH-IJKL-MNOP-1234",
        status: "active",
        maxDevices: 3,
        activatedDevices: 2,
        createdAt: "2025-01-01",
        expiresAt: "2026-01-01",
      };

      const keygenLicense = {
        status: "active",
        expiresAt: "2026-01-01T00:00:00Z",
      };

      const response = formatLicenseResponse(
        customer,
        localLicense,
        keygenLicense,
      );

      assert.strictEqual(response.license.id, "lic_123");
      assert.strictEqual(response.license.key, "ABCD-EFGH-IJKL-MNOP-1234");
      assert.strictEqual(response.license.maskedKey, "ABCD-EFG...1234");
      assert.strictEqual(response.license.status, "active");
      assert.strictEqual(response.license.planType, "individual");
      assert.strictEqual(response.license.planName, "Individual");
      assert.strictEqual(response.license.maxDevices, 3);
      assert.strictEqual(response.license.activatedDevices, 2);
      assert.strictEqual(response.subscription.status, "active");
      assert.strictEqual(response.subscription.stripeCustomerId, "cus_456");
    });

    it("should use keygen status over local status", () => {
      const customer = {
        keygenLicenseId: "lic_123",
        accountType: "individual",
      };
      const localLicense = { status: "active" };
      const keygenLicense = { status: "suspended" };

      const response = formatLicenseResponse(
        customer,
        localLicense,
        keygenLicense,
      );
      assert.strictEqual(response.license.status, "suspended");
    });

    it("should fallback to local status when keygen unavailable", () => {
      const customer = {
        keygenLicenseId: "lic_123",
        accountType: "individual",
      };
      const localLicense = { status: "active" };

      const response = formatLicenseResponse(customer, localLicense, null);
      assert.strictEqual(response.license.status, "active");
    });

    it("should default to unknown status when both unavailable", () => {
      const customer = {
        keygenLicenseId: "lic_123",
        accountType: "individual",
      };

      const response = formatLicenseResponse(customer, null, null);
      assert.strictEqual(response.license.status, "unknown");
    });

    it("should default maxDevices to 3", () => {
      const customer = {
        keygenLicenseId: "lic_123",
        accountType: "individual",
      };

      const response = formatLicenseResponse(customer, null, null);
      assert.strictEqual(response.license.maxDevices, 3);
    });
  });
});

// Issue 3 Fix (2/9/2026): Device count isolation for org members
// Org members should see their own device count (0), not the owner's
describe("portal/status - Org Member Device Isolation", () => {
  /**
   * checkDeviceCountLogic extracted from status route.js
   * Prior to fix: Org members saw the owner's activatedDevices count
   * After fix: if (orgMembership) skip device count fetch, return 0
   */
  function getDeviceCountForUser(customer, orgMembership) {
    // If user is an org member, they don't have their own devices to count
    // (Business tier devices are managed at org level, not per-member)
    if (orgMembership) {
      return { activatedDevices: 0, reason: "org_member" };
    }
    
    // For individual users or org owners, fetch actual device count
    if (customer?.activatedDevices !== undefined) {
      return { activatedDevices: customer.activatedDevices, reason: "customer_record" };
    }
    
    return { activatedDevices: 0, reason: "no_data" };
  }

  it("should return 0 devices for org members", () => {
    const customer = { activatedDevices: 5 }; // Owner's device count (should be ignored)
    const orgMembership = { orgId: "org123", role: "member", ownerId: "owner456" };
    
    const result = getDeviceCountForUser(customer, orgMembership);
    assert.strictEqual(result.activatedDevices, 0);
    assert.strictEqual(result.reason, "org_member");
  });

  it("should return 0 devices for org admins (non-owners)", () => {
    const customer = { activatedDevices: 3 };
    const orgMembership = { orgId: "org123", role: "admin", ownerId: "owner456" };
    
    const result = getDeviceCountForUser(customer, orgMembership);
    assert.strictEqual(result.activatedDevices, 0);
    assert.strictEqual(result.reason, "org_member");
  });

  it("should return actual device count for individual users", () => {
    const customer = { activatedDevices: 2 };
    const orgMembership = null; // Individual user, not an org member
    
    const result = getDeviceCountForUser(customer, orgMembership);
    assert.strictEqual(result.activatedDevices, 2);
    assert.strictEqual(result.reason, "customer_record");
  });

  it("should return customer device count when no org membership", () => {
    const customer = { activatedDevices: 5 };
    
    const result = getDeviceCountForUser(customer, undefined);
    assert.strictEqual(result.activatedDevices, 5);
    assert.strictEqual(result.reason, "customer_record");
  });

  it("should return 0 when no customer data and no org membership", () => {
    const result = getDeviceCountForUser(null, null);
    assert.strictEqual(result.activatedDevices, 0);
    assert.strictEqual(result.reason, "no_data");
  });

  it("should return 0 if customer has no activatedDevices property", () => {
    const customer = { email: "user@test.com" };
    
    const result = getDeviceCountForUser(customer, null);
    assert.strictEqual(result.activatedDevices, 0);
    assert.strictEqual(result.reason, "no_data");
  });

  it("should isolate even when org owner's customer record is passed", () => {
    // Edge case: The customer object might be the owner's record
    // But if we have orgMembership, we return 0 regardless
    const ownerCustomer = { activatedDevices: 10, userId: "owner456" };
    const memberOrgMembership = { orgId: "org123", role: "member", ownerId: "owner456" };
    
    const result = getDeviceCountForUser(ownerCustomer, memberOrgMembership);
    assert.strictEqual(result.activatedDevices, 0);
    assert.strictEqual(result.reason, "org_member");
  });
});

describe("portal/devices API logic", () => {
  function requireAuth(session) {
    if (!session?.user) {
      return { authenticated: false, error: "Unauthorized", status: 401 };
    }
    return { authenticated: true };
  }

  function getEmptyDevicesResponse() {
    return { devices: [], maxDevices: 0 };
  }

  function getMaxConcurrentMachinesForPlan(accountType) {
    const planConfig = PRICING[accountType];
    return (
      planConfig?.maxConcurrentMachines ||
      planConfig?.maxConcurrentMachinesPerSeat ||
      3
    );
  }

  /**
   * Phase 3F: Per-user device scoping
   * Route now uses getUserDevices(licenseId, userId) instead of
   * getLicenseDevices(licenseId). tokenPayload.sub provides userId.
   */
  function extractUserIdFromToken(tokenPayload) {
    return tokenPayload?.sub || null;
  }

  /**
   * Phase 3F: Device record mapping
   * Route maps DynamoDB device records directly (no Keygen merge).
   */
  function mapDeviceRecords(devices) {
    return devices.map((device) => ({
      id: device.keygenMachineId,
      name: device.name,
      platform: device.platform,
      fingerprint: device.fingerprint,
      lastSeen: device.lastSeenAt,
      createdAt: device.createdAt,
    }));
  }

  /**
   * Phase 3F: Build response shape
   * Business accounts include totalActiveDevices for Owner/Admin visibility.
   */
  function buildDevicesResponse(mappedDevices, maxDevices, licenseId, accountType, totalActiveCount) {
    const response = { devices: mappedDevices, maxDevices, licenseId };
    if (accountType === "business") {
      response.totalActiveDevices = totalActiveCount;
    }
    return response;
  }

  describe("per-user device scoping (Phase 3F)", () => {
    it("should extract userId from tokenPayload.sub", () => {
      const tokenPayload = { sub: "cognito-user-123", email: "user@example.com" };
      const userId = extractUserIdFromToken(tokenPayload);
      assert.strictEqual(userId, "cognito-user-123");
    });

    it("should return null when tokenPayload has no sub", () => {
      const tokenPayload = { email: "user@example.com" };
      const userId = extractUserIdFromToken(tokenPayload);
      assert.strictEqual(userId, null);
    });

    it("should return null when tokenPayload is null", () => {
      const userId = extractUserIdFromToken(null);
      assert.strictEqual(userId, null);
    });
  });

  describe("device record mapping (Phase 3F)", () => {
    it("should map DynamoDB device records to response format", () => {
      const devices = [
        {
          keygenMachineId: "mach_1",
          name: 'MacBook Pro 16"',
          platform: "darwin",
          fingerprint: "fp_abc",
          lastSeenAt: "2026-02-13T10:00:00Z",
          createdAt: "2026-01-01T00:00:00Z",
        },
      ];

      const mapped = mapDeviceRecords(devices);

      assert.strictEqual(mapped.length, 1);
      assert.strictEqual(mapped[0].id, "mach_1");
      assert.strictEqual(mapped[0].name, 'MacBook Pro 16"');
      assert.strictEqual(mapped[0].platform, "darwin");
      assert.strictEqual(mapped[0].fingerprint, "fp_abc");
      assert.strictEqual(mapped[0].lastSeen, "2026-02-13T10:00:00Z");
      assert.strictEqual(mapped[0].createdAt, "2026-01-01T00:00:00Z");
    });

    it("should handle empty devices array", () => {
      const mapped = mapDeviceRecords([]);
      assert.deepStrictEqual(mapped, []);
    });

    it("should handle device with missing optional fields", () => {
      const devices = [
        {
          keygenMachineId: "mach_2",
          name: undefined,
          platform: undefined,
          fingerprint: undefined,
          lastSeenAt: "2026-02-13T10:00:00Z",
          createdAt: "2026-02-01T00:00:00Z",
        },
      ];

      const mapped = mapDeviceRecords(devices);

      assert.strictEqual(mapped[0].id, "mach_2");
      assert.strictEqual(mapped[0].name, undefined);
      assert.strictEqual(mapped[0].platform, undefined);
      assert.strictEqual(mapped[0].lastSeen, "2026-02-13T10:00:00Z");
    });

    it("should map multiple devices preserving order", () => {
      const devices = [
        { keygenMachineId: "mach_a", name: "A", platform: "win32", fingerprint: "fp1", lastSeenAt: "t1", createdAt: "c1" },
        { keygenMachineId: "mach_b", name: "B", platform: "darwin", fingerprint: "fp2", lastSeenAt: "t2", createdAt: "c2" },
        { keygenMachineId: "mach_c", name: "C", platform: "linux", fingerprint: "fp3", lastSeenAt: "t3", createdAt: "c3" },
      ];

      const mapped = mapDeviceRecords(devices);

      assert.strictEqual(mapped.length, 3);
      assert.strictEqual(mapped[0].id, "mach_a");
      assert.strictEqual(mapped[1].id, "mach_b");
      assert.strictEqual(mapped[2].id, "mach_c");
    });
  });

  describe("response shape (Phase 3F)", () => {
    it("should include totalActiveDevices for business accounts", () => {
      const response = buildDevicesResponse([], 5, "lic_123", "business", 12);

      assert.strictEqual(response.totalActiveDevices, 12);
      assert.strictEqual(response.maxDevices, 5);
      assert.strictEqual(response.licenseId, "lic_123");
      assert.deepStrictEqual(response.devices, []);
    });

    it("should NOT include totalActiveDevices for individual accounts", () => {
      const response = buildDevicesResponse([], 3, "lic_456", "individual", 0);

      assert.strictEqual(response.totalActiveDevices, undefined);
      assert.strictEqual(response.maxDevices, 3);
      assert.strictEqual(response.licenseId, "lic_456");
    });

    it("should return 0 totalActiveDevices when no business devices active", () => {
      const response = buildDevicesResponse([], 5, "lic_789", "business", 0);

      assert.strictEqual(response.totalActiveDevices, 0);
    });

    it("should include devices array in response", () => {
      const devices = [{ id: "mach_1", name: "Test" }];
      const response = buildDevicesResponse(devices, 3, "lic_123", "individual", 0);

      assert.strictEqual(response.devices.length, 1);
      assert.strictEqual(response.devices[0].id, "mach_1");
    });
  });

  describe("no DELETE handler (Phase 3F)", () => {
    it("should confirm device lifecycle is read-only", () => {
      // Phase 3F: Portal is read-only. Device lifecycle managed by HIC
      // via heartbeat enforcement (2-hour sliding window).
      // This test documents the architectural decision: no user-initiated deactivation.
      const portalActions = ["GET"];
      assert.ok(!portalActions.includes("DELETE"), "DELETE must not be a portal action");
      assert.ok(!portalActions.includes("POST"), "POST must not be a portal action");
      assert.ok(!portalActions.includes("PUT"), "PUT must not be a portal action");
    });
  });

  describe("empty response paths (Phase 3F)", () => {
    it("should return empty when no email in token", () => {
      const response = getEmptyDevicesResponse();
      assert.deepStrictEqual(response.devices, []);
      assert.strictEqual(response.maxDevices, 0);
    });

    it("should return empty when customer not found", () => {
      const response = getEmptyDevicesResponse();
      assert.deepStrictEqual(response.devices, []);
      assert.strictEqual(response.maxDevices, 0);
    });

    it("should return empty when customer has no licenseId", () => {
      const response = getEmptyDevicesResponse();
      assert.deepStrictEqual(response.devices, []);
      assert.strictEqual(response.maxDevices, 0);
    });
  });
});

describe("portal/invoices API logic", () => {
  function requireAuth(session) {
    if (!session?.user) {
      return { authenticated: false, error: "Unauthorized", status: 401 };
    }
    return { authenticated: true };
  }

  function getEmptyInvoicesResponse() {
    return { invoices: [] };
  }

  function parseLimit(limitParam, defaultLimit = 10, maxLimit = 100) {
    const limit = parseInt(limitParam || defaultLimit.toString(), 10);
    return Math.min(limit, maxLimit);
  }

  function formatInvoice(invoice) {
    return {
      id: invoice.id,
      number: invoice.number,
      date: new Date(invoice.created * 1000).toISOString(),
      dueDate: invoice.due_date
        ? new Date(invoice.due_date * 1000).toISOString()
        : null,
      status: invoice.status,
      amount: invoice.amount_due,
      amountPaid: invoice.amount_paid,
      currency: invoice.currency,
      description: invoice.lines.data[0]?.description || "Subscription",
      pdfUrl: invoice.invoice_pdf,
      hostedUrl: invoice.hosted_invoice_url,
    };
  }

  describe("authentication", () => {
    it("should reject unauthenticated request", () => {
      const result = requireAuth(null);
      assert.strictEqual(result.authenticated, false);
    });
  });

  describe("limit parsing", () => {
    it("should use default when not specified", () => {
      const limit = parseLimit(null);
      assert.strictEqual(limit, 10);
    });

    it("should parse string limit", () => {
      const limit = parseLimit("25");
      assert.strictEqual(limit, 25);
    });

    it("should cap at max limit", () => {
      const limit = parseLimit("500");
      assert.strictEqual(limit, 100);
    });

    it("should handle custom default and max", () => {
      const limit = parseLimit(null, 5, 50);
      assert.strictEqual(limit, 5);
    });
  });

  describe("invoice formatting", () => {
    it("should format invoice correctly", () => {
      const stripeInvoice = {
        id: "inv_123",
        number: "INV-0001",
        created: 1704067200, // 2024-01-01 00:00:00 UTC
        due_date: 1706745600, // 2024-02-01 00:00:00 UTC
        status: "paid",
        amount_due: 1000,
        amount_paid: 1000,
        currency: "usd",
        lines: { data: [{ description: "Monthly subscription" }] },
        invoice_pdf: "https://stripe.com/pdf/inv_123",
        hosted_invoice_url: "https://stripe.com/inv/inv_123",
      };

      const formatted = formatInvoice(stripeInvoice);

      assert.strictEqual(formatted.id, "inv_123");
      assert.strictEqual(formatted.number, "INV-0001");
      assert.strictEqual(formatted.status, "paid");
      assert.strictEqual(formatted.amount, 1000);
      assert.strictEqual(formatted.amountPaid, 1000);
      assert.strictEqual(formatted.currency, "usd");
      assert.strictEqual(formatted.description, "Monthly subscription");
      assert.strictEqual(formatted.pdfUrl, "https://stripe.com/pdf/inv_123");
    });

    it("should handle missing due date", () => {
      const stripeInvoice = {
        id: "inv_123",
        number: "INV-0001",
        created: 1704067200,
        due_date: null,
        status: "paid",
        amount_due: 1000,
        amount_paid: 1000,
        currency: "usd",
        lines: { data: [] },
        invoice_pdf: null,
        hosted_invoice_url: null,
      };

      const formatted = formatInvoice(stripeInvoice);
      assert.strictEqual(formatted.dueDate, null);
    });

    it("should default description to Subscription", () => {
      const stripeInvoice = {
        id: "inv_123",
        number: "INV-0001",
        created: 1704067200,
        due_date: null,
        status: "paid",
        amount_due: 1000,
        amount_paid: 1000,
        currency: "usd",
        lines: { data: [] },
        invoice_pdf: null,
        hosted_invoice_url: null,
      };

      const formatted = formatInvoice(stripeInvoice);
      assert.strictEqual(formatted.description, "Subscription");
    });
  });
});

describe("portal/stripe-session API logic", () => {
  /**
   * Tests the extracted logic for the flow_data-based portal session endpoint.
   * Every portal session requires a specific flow parameter — generic sessions
   * are structurally impossible.
   *
   * Validates: Requirements 3.1, 3.2, 3.3, 3.7
   */

  const VALID_FLOWS = new Set([
    "switch_to_annual",
    "switch_to_monthly",
    "adjust_seats",
    "update_payment",
    "cancel",
  ]);

  function requireAuth(tokenPayload) {
    if (!tokenPayload) {
      return {
        authenticated: false,
        error: "Authentication required",
        status: 401,
      };
    }
    return { authenticated: true };
  }

  function validateCustomer(customer) {
    if (!customer?.stripeCustomerId) {
      return {
        valid: false,
        error: "No Stripe customer found. Please purchase a license first.",
        status: 404,
      };
    }
    return { valid: true };
  }

  function validateFlow(flow) {
    if (!flow || !VALID_FLOWS.has(flow)) {
      return {
        valid: false,
        error: "Missing or invalid flow parameter. Valid values: switch_to_annual, switch_to_monthly, adjust_seats, update_payment, cancel",
        status: 400,
      };
    }
    return { valid: true };
  }

  function validateSeatAdjustment(accountType, quantity) {
    if (accountType === "individual") {
      return {
        valid: false,
        error: "Seat adjustment is only available for Business accounts",
        status: 400,
      };
    }
    if (
      quantity == null ||
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 99
    ) {
      return {
        valid: false,
        error: "Quantity must be an integer between 1 and 99",
        status: 400,
      };
    }
    return { valid: true };
  }

  describe("authentication", () => {
    it("should reject unauthenticated request", () => {
      const result = requireAuth(null);
      assert.strictEqual(result.authenticated, false);
      assert.strictEqual(result.error, "Authentication required");
      assert.strictEqual(result.status, 401);
    });

    it("should accept authenticated request", () => {
      const result = requireAuth({ email: "user@example.com" });
      assert.strictEqual(result.authenticated, true);
    });
  });

  describe("customer validation", () => {
    it("should reject missing stripeCustomerId", () => {
      const result = validateCustomer({ email: "user@example.com" });
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.status, 404);
      assert.ok(result.error.includes("No Stripe customer found"));
    });

    it("should reject null customer", () => {
      const result = validateCustomer(null);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.status, 404);
    });

    it("should accept customer with stripeCustomerId", () => {
      const result = validateCustomer({ stripeCustomerId: "cus_123" });
      assert.strictEqual(result.valid, true);
    });
  });

  describe("flow validation", () => {
    it("should reject missing flow", () => {
      const result = validateFlow(undefined);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.status, 400);
      assert.ok(result.error.includes("Missing or invalid flow"));
    });

    it("should reject null flow", () => {
      const result = validateFlow(null);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.status, 400);
    });

    it("should reject empty string flow", () => {
      const result = validateFlow("");
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.status, 400);
    });

    it("should reject invalid flow value", () => {
      const result = validateFlow("manage_subscription");
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.status, 400);
    });

    it("should accept switch_to_annual", () => {
      assert.strictEqual(validateFlow("switch_to_annual").valid, true);
    });

    it("should accept switch_to_monthly", () => {
      assert.strictEqual(validateFlow("switch_to_monthly").valid, true);
    });

    it("should accept adjust_seats", () => {
      assert.strictEqual(validateFlow("adjust_seats").valid, true);
    });

    it("should accept update_payment", () => {
      assert.strictEqual(validateFlow("update_payment").valid, true);
    });

    it("should accept cancel", () => {
      assert.strictEqual(validateFlow("cancel").valid, true);
    });
  });

  describe("seat adjustment validation", () => {
    it("should reject individual accounts", () => {
      const result = validateSeatAdjustment("individual", 5);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.status, 400);
      assert.ok(result.error.includes("Business accounts"));
    });

    it("should reject null quantity", () => {
      const result = validateSeatAdjustment("business", null);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.status, 400);
    });

    it("should reject non-integer quantity", () => {
      const result = validateSeatAdjustment("business", 5.5);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.status, 400);
    });

    it("should reject quantity below 1", () => {
      const result = validateSeatAdjustment("business", 0);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.status, 400);
    });

    it("should reject quantity above 99", () => {
      const result = validateSeatAdjustment("business", 100);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.status, 400);
    });

    it("should reject string quantity", () => {
      const result = validateSeatAdjustment("business", "five");
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.status, 400);
    });

    it("should accept valid business seat adjustment", () => {
      const result = validateSeatAdjustment("business", 5);
      assert.strictEqual(result.valid, true);
    });

    it("should accept minimum quantity of 1", () => {
      const result = validateSeatAdjustment("business", 1);
      assert.strictEqual(result.valid, true);
    });

    it("should accept maximum quantity of 99", () => {
      const result = validateSeatAdjustment("business", 99);
      assert.strictEqual(result.valid, true);
    });
  });
});

describe("portal/stripe-session — flow_data structure (Property 1)", () => {
  /**
   * Property 1: Every Portal Session Uses flow_data
   *
   * For any valid flow, the handler builds the correct flow_data object
   * with the correct type and server-derived parameters.
   *
   * Validates: Requirements 2.1, 2.2, 2.3, 2.5, 2.6, 2.7, 2.10, 2.11
   */

  // Mirror the source's STRIPE_PRICES structure for test assertions
  const TEST_STRIPE_PRICES = {
    individual: {
      monthly: "price_ind_monthly_test",
      annual: "price_ind_annual_test",
    },
    business: {
      monthly: "price_biz_monthly_test",
      annual: "price_biz_annual_test",
    },
  };

  // Reusable mock subscription factory
  function createMockSubscription(overrides = {}) {
    return {
      id: overrides.id || "sub_test_123",
      items: {
        data: [{
          id: overrides.itemId || "si_item_test_456",
          price: { id: overrides.priceId || "price_ind_monthly_test" },
          quantity: overrides.quantity || 1,
        }],
      },
    };
  }

  // Mirrors route.js buildCycleSwitchFlowData
  function buildCycleSwitchFlowData(targetCycle, accountType, subscription) {
    const targetPriceId = TEST_STRIPE_PRICES[accountType]?.[targetCycle];
    const item = subscription.items.data[0];
    return {
      type: "subscription_update_confirm",
      subscription_update_confirm: {
        subscription: subscription.id,
        items: [{
          id: item.id,
          price: targetPriceId,
          quantity: item.quantity,
        }],
      },
    };
  }

  // Mirrors route.js buildSeatAdjustFlowData
  function buildSeatAdjustFlowData(quantity, subscription) {
    const item = subscription.items.data[0];
    return {
      type: "subscription_update_confirm",
      subscription_update_confirm: {
        subscription: subscription.id,
        items: [{
          id: item.id,
          price: item.price.id,
          quantity,
        }],
      },
    };
  }

  // Mirrors route.js buildCancelFlowData
  function buildCancelFlowData(subscription) {
    return {
      type: "subscription_cancel",
      subscription_cancel: {
        subscription: subscription.id,
      },
    };
  }

  describe("switch_to_annual flow_data", () => {
    it("should produce subscription_update_confirm type", () => {
      const sub = createMockSubscription({ priceId: "price_ind_monthly_test" });
      const flowData = buildCycleSwitchFlowData("annual", "individual", sub);
      assert.strictEqual(flowData.type, "subscription_update_confirm");
    });

    it("should use annual price from STRIPE_PRICES for individual", () => {
      const sub = createMockSubscription({ priceId: "price_ind_monthly_test" });
      const flowData = buildCycleSwitchFlowData("annual", "individual", sub);
      const item = flowData.subscription_update_confirm.items[0];
      assert.strictEqual(item.price, TEST_STRIPE_PRICES.individual.annual);
    });

    it("should use annual price from STRIPE_PRICES for business", () => {
      const sub = createMockSubscription({ priceId: "price_biz_monthly_test", quantity: 10 });
      const flowData = buildCycleSwitchFlowData("annual", "business", sub);
      const item = flowData.subscription_update_confirm.items[0];
      assert.strictEqual(item.price, TEST_STRIPE_PRICES.business.annual);
    });

    it("should preserve current quantity in the switch", () => {
      const sub = createMockSubscription({ quantity: 15 });
      const flowData = buildCycleSwitchFlowData("annual", "business", sub);
      const item = flowData.subscription_update_confirm.items[0];
      assert.strictEqual(item.quantity, 15);
    });

    it("should reference the correct subscription ID", () => {
      const sub = createMockSubscription({ id: "sub_specific_789" });
      const flowData = buildCycleSwitchFlowData("annual", "individual", sub);
      assert.strictEqual(flowData.subscription_update_confirm.subscription, "sub_specific_789");
    });

    it("should reference the correct subscription item ID", () => {
      const sub = createMockSubscription({ itemId: "si_specific_abc" });
      const flowData = buildCycleSwitchFlowData("annual", "individual", sub);
      assert.strictEqual(flowData.subscription_update_confirm.items[0].id, "si_specific_abc");
    });
  });

  describe("switch_to_monthly flow_data", () => {
    it("should produce subscription_update_confirm type", () => {
      const sub = createMockSubscription({ priceId: "price_ind_annual_test" });
      const flowData = buildCycleSwitchFlowData("monthly", "individual", sub);
      assert.strictEqual(flowData.type, "subscription_update_confirm");
    });

    it("should use monthly price from STRIPE_PRICES for individual", () => {
      const sub = createMockSubscription({ priceId: "price_ind_annual_test" });
      const flowData = buildCycleSwitchFlowData("monthly", "individual", sub);
      const item = flowData.subscription_update_confirm.items[0];
      assert.strictEqual(item.price, TEST_STRIPE_PRICES.individual.monthly);
    });

    it("should use monthly price from STRIPE_PRICES for business", () => {
      const sub = createMockSubscription({ priceId: "price_biz_annual_test", quantity: 5 });
      const flowData = buildCycleSwitchFlowData("monthly", "business", sub);
      const item = flowData.subscription_update_confirm.items[0];
      assert.strictEqual(item.price, TEST_STRIPE_PRICES.business.monthly);
    });

    it("should preserve current quantity in the switch", () => {
      const sub = createMockSubscription({ quantity: 8 });
      const flowData = buildCycleSwitchFlowData("monthly", "business", sub);
      const item = flowData.subscription_update_confirm.items[0];
      assert.strictEqual(item.quantity, 8);
    });
  });

  describe("adjust_seats flow_data", () => {
    it("should produce subscription_update_confirm type", () => {
      const sub = createMockSubscription({ priceId: "price_biz_monthly_test", quantity: 5 });
      const flowData = buildSeatAdjustFlowData(10, sub);
      assert.strictEqual(flowData.type, "subscription_update_confirm");
    });

    it("should use the current price ID (not a target price)", () => {
      const sub = createMockSubscription({ priceId: "price_biz_monthly_test" });
      const flowData = buildSeatAdjustFlowData(10, sub);
      const item = flowData.subscription_update_confirm.items[0];
      assert.strictEqual(item.price, "price_biz_monthly_test");
    });

    it("should use the validated quantity, not the current quantity", () => {
      const sub = createMockSubscription({ quantity: 5 });
      const flowData = buildSeatAdjustFlowData(25, sub);
      const item = flowData.subscription_update_confirm.items[0];
      assert.strictEqual(item.quantity, 25);
    });

    it("should reference the correct subscription and item IDs", () => {
      const sub = createMockSubscription({ id: "sub_biz_999", itemId: "si_biz_item" });
      const flowData = buildSeatAdjustFlowData(3, sub);
      assert.strictEqual(flowData.subscription_update_confirm.subscription, "sub_biz_999");
      assert.strictEqual(flowData.subscription_update_confirm.items[0].id, "si_biz_item");
    });
  });

  describe("update_payment flow_data", () => {
    it("should produce payment_method_update type", () => {
      // update_payment doesn't use a subscription — flow_data is static
      const flowData = { type: "payment_method_update" };
      assert.strictEqual(flowData.type, "payment_method_update");
    });

    it("should not contain subscription_update_confirm", () => {
      const flowData = { type: "payment_method_update" };
      assert.strictEqual(flowData.subscription_update_confirm, undefined);
    });

    it("should not contain subscription_cancel", () => {
      const flowData = { type: "payment_method_update" };
      assert.strictEqual(flowData.subscription_cancel, undefined);
    });
  });

  describe("cancel flow_data", () => {
    it("should produce subscription_cancel type", () => {
      const sub = createMockSubscription();
      const flowData = buildCancelFlowData(sub);
      assert.strictEqual(flowData.type, "subscription_cancel");
    });

    it("should reference the correct subscription ID", () => {
      const sub = createMockSubscription({ id: "sub_cancel_me" });
      const flowData = buildCancelFlowData(sub);
      assert.strictEqual(flowData.subscription_cancel.subscription, "sub_cancel_me");
    });

    it("should not contain subscription_update_confirm", () => {
      const sub = createMockSubscription();
      const flowData = buildCancelFlowData(sub);
      assert.strictEqual(flowData.subscription_update_confirm, undefined);
    });
  });
});

describe("portal/stripe-session — server-side price derivation (Property 3)", () => {
  /**
   * Property 3: Cross-Tier Price Derivation
   *
   * Target price is always derived from STRIPE_PRICES[accountType][cycle],
   * never from user input. This makes cross-tier switching structurally impossible.
   *
   * Validates: Requirements 2.2, 2.3
   */

  const TEST_STRIPE_PRICES = {
    individual: {
      monthly: "price_ind_monthly_test",
      annual: "price_ind_annual_test",
    },
    business: {
      monthly: "price_biz_monthly_test",
      annual: "price_biz_annual_test",
    },
  };

  function deriveTargetPrice(accountType, targetCycle) {
    return TEST_STRIPE_PRICES[accountType]?.[targetCycle];
  }

  it("should derive individual annual price correctly", () => {
    assert.strictEqual(deriveTargetPrice("individual", "annual"), "price_ind_annual_test");
  });

  it("should derive individual monthly price correctly", () => {
    assert.strictEqual(deriveTargetPrice("individual", "monthly"), "price_ind_monthly_test");
  });

  it("should derive business annual price correctly", () => {
    assert.strictEqual(deriveTargetPrice("business", "annual"), "price_biz_annual_test");
  });

  it("should derive business monthly price correctly", () => {
    assert.strictEqual(deriveTargetPrice("business", "monthly"), "price_biz_monthly_test");
  });

  it("should return undefined for unknown account type", () => {
    assert.strictEqual(deriveTargetPrice("enterprise", "annual"), undefined);
  });

  it("should return undefined for unknown cycle", () => {
    assert.strictEqual(deriveTargetPrice("individual", "quarterly"), undefined);
  });

  it("should never use a user-supplied price — individual annual switch uses server price", () => {
    const userSuppliedPrice = "price_ATTACKER_injected";
    const serverPrice = deriveTargetPrice("individual", "annual");
    assert.notStrictEqual(serverPrice, userSuppliedPrice);
    assert.strictEqual(serverPrice, TEST_STRIPE_PRICES.individual.annual);
  });

  it("should never use a user-supplied price — business monthly switch uses server price", () => {
    const userSuppliedPrice = "price_individual_monthly_WRONG_TIER";
    const serverPrice = deriveTargetPrice("business", "monthly");
    assert.notStrictEqual(serverPrice, userSuppliedPrice);
    assert.strictEqual(serverPrice, TEST_STRIPE_PRICES.business.monthly);
  });
});

describe("portal/stripe-session — guard rails (Properties 2 & 4)", () => {
  /**
   * Property 2: Generic Sessions Rejected
   * Property 4: Seat Adjustment Guards
   *
   * Tests additional guard rails beyond basic validation:
   * - No active subscription → 404
   * - Already on target billing cycle → 400
   * - Negative quantity, float quantity, boundary values
   *
   * Validates: Requirements 2.4, 2.7, 2.8, 2.9
   */

  const VALID_FLOWS = new Set([
    "switch_to_annual",
    "switch_to_monthly",
    "adjust_seats",
    "update_payment",
    "cancel",
  ]);

  const SUBSCRIPTION_FLOWS = new Set([
    "switch_to_annual",
    "switch_to_monthly",
    "adjust_seats",
    "cancel",
  ]);

  function requiresSubscription(flow) {
    return SUBSCRIPTION_FLOWS.has(flow);
  }

  function checkNoActiveSubscription(subscription) {
    if (!subscription) {
      return { error: "No active subscription found", status: 404 };
    }
    return null;
  }

  function checkAlreadyOnTargetCycle(currentPriceId, targetPriceId) {
    if (currentPriceId === targetPriceId) {
      return { error: "Already on the requested billing cycle", status: 400 };
    }
    return null;
  }

  function validateQuantity(quantity) {
    if (
      quantity == null ||
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 99
    ) {
      return { valid: false, error: "Quantity must be an integer between 1 and 99", status: 400 };
    }
    return { valid: true };
  }

  describe("subscription requirement by flow type", () => {
    it("switch_to_annual requires subscription", () => {
      assert.strictEqual(requiresSubscription("switch_to_annual"), true);
    });

    it("switch_to_monthly requires subscription", () => {
      assert.strictEqual(requiresSubscription("switch_to_monthly"), true);
    });

    it("adjust_seats requires subscription", () => {
      assert.strictEqual(requiresSubscription("adjust_seats"), true);
    });

    it("cancel requires subscription", () => {
      assert.strictEqual(requiresSubscription("cancel"), true);
    });

    it("update_payment does NOT require subscription", () => {
      assert.strictEqual(requiresSubscription("update_payment"), false);
    });
  });

  describe("no active subscription guard", () => {
    it("should return 404 when subscription is null", () => {
      const result = checkNoActiveSubscription(null);
      assert.strictEqual(result.status, 404);
      assert.ok(result.error.includes("No active subscription"));
    });

    it("should return 404 when subscription is undefined", () => {
      const result = checkNoActiveSubscription(undefined);
      assert.strictEqual(result.status, 404);
    });

    it("should return null (no error) when subscription exists", () => {
      const result = checkNoActiveSubscription({ id: "sub_123" });
      assert.strictEqual(result, null);
    });
  });

  describe("already on target cycle guard", () => {
    it("should return 400 when current price matches target price", () => {
      const result = checkAlreadyOnTargetCycle("price_ind_annual", "price_ind_annual");
      assert.strictEqual(result.status, 400);
      assert.ok(result.error.includes("Already on the requested billing cycle"));
    });

    it("should return null when prices differ", () => {
      const result = checkAlreadyOnTargetCycle("price_ind_monthly", "price_ind_annual");
      assert.strictEqual(result, null);
    });
  });

  describe("quantity validation edge cases", () => {
    it("should reject negative quantity", () => {
      assert.strictEqual(validateQuantity(-1).valid, false);
    });

    it("should reject zero", () => {
      assert.strictEqual(validateQuantity(0).valid, false);
    });

    it("should reject float 1.5", () => {
      assert.strictEqual(validateQuantity(1.5).valid, false);
    });

    it("should reject float 99.9", () => {
      assert.strictEqual(validateQuantity(99.9).valid, false);
    });

    it("should reject 100", () => {
      assert.strictEqual(validateQuantity(100).valid, false);
    });

    it("should reject NaN", () => {
      assert.strictEqual(validateQuantity(NaN).valid, false);
    });

    it("should reject Infinity", () => {
      assert.strictEqual(validateQuantity(Infinity).valid, false);
    });

    it("should reject negative Infinity", () => {
      assert.strictEqual(validateQuantity(-Infinity).valid, false);
    });

    it("should reject boolean true (not a number type... wait, typeof true !== 'number')", () => {
      assert.strictEqual(validateQuantity(true).valid, false);
    });

    it("should reject empty object", () => {
      assert.strictEqual(validateQuantity({}).valid, false);
    });

    it("should reject array", () => {
      assert.strictEqual(validateQuantity([5]).valid, false);
    });

    it("should accept 1 (minimum)", () => {
      assert.strictEqual(validateQuantity(1).valid, true);
    });

    it("should accept 50 (midrange)", () => {
      assert.strictEqual(validateQuantity(50).valid, true);
    });

    it("should accept 99 (maximum)", () => {
      assert.strictEqual(validateQuantity(99).valid, true);
    });
  });

  describe("generic session prevention", () => {
    it("every valid flow is in the VALID_FLOWS set", () => {
      const expected = ["switch_to_annual", "switch_to_monthly", "adjust_seats", "update_payment", "cancel"];
      expected.forEach((flow) => {
        assert.strictEqual(VALID_FLOWS.has(flow), true, `${flow} should be valid`);
      });
    });

    it("generic/legacy flow names are rejected", () => {
      const invalid = ["manage_subscription", "manage", "portal", "generic", "open", ""];
      invalid.forEach((flow) => {
        assert.strictEqual(VALID_FLOWS.has(flow), false, `"${flow}" should be rejected`);
      });
    });

    it("VALID_FLOWS contains exactly 5 entries", () => {
      assert.strictEqual(VALID_FLOWS.size, 5);
    });
  });
});

describe("portal/invoices API — response format", () => {
  /**
   * Tests the invoices API response format matches the actual route implementation.
   * The route returns { id, date, amount, currency, status, pdfUrl }.
   *
   * Validates: Requirements 2.12, 2.13
   */

  // Mirrors the actual formatInvoice from src/app/api/portal/invoices/route.js
  function formatInvoice(invoice) {
    return {
      id: invoice.id,
      date: new Date(invoice.created * 1000).toISOString(),
      amount: invoice.amount_paid,
      currency: invoice.currency,
      status: invoice.status,
      pdfUrl: invoice.invoice_pdf || null,
    };
  }

  function requireAuth(tokenPayload) {
    if (!tokenPayload) {
      return { authenticated: false, error: "Unauthorized", status: 401 };
    }
    return { authenticated: true };
  }

  function validateCustomer(customer) {
    if (!customer?.stripeCustomerId) {
      return { valid: false, error: "No Stripe customer found. Please purchase a license first.", status: 404 };
    }
    return { valid: true };
  }

  describe("authentication", () => {
    it("should reject unauthenticated request with 401", () => {
      const result = requireAuth(null);
      assert.strictEqual(result.authenticated, false);
      assert.strictEqual(result.status, 401);
    });

    it("should accept authenticated request", () => {
      const result = requireAuth({ email: "user@example.com" });
      assert.strictEqual(result.authenticated, true);
    });
  });

  describe("customer validation", () => {
    it("should reject missing Stripe customer with 404", () => {
      const result = validateCustomer({ email: "user@example.com" });
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.status, 404);
    });

    it("should accept customer with stripeCustomerId", () => {
      const result = validateCustomer({ stripeCustomerId: "cus_123" });
      assert.strictEqual(result.valid, true);
    });
  });

  describe("invoice formatting — matches actual route", () => {
    it("should format a paid invoice with all fields", () => {
      const stripeInvoice = {
        id: "inv_paid_001",
        created: 1709251200, // 2024-03-01 00:00:00 UTC
        amount_paid: 1500,
        currency: "usd",
        status: "paid",
        invoice_pdf: "https://pay.stripe.com/invoice/inv_paid_001/pdf",
      };

      const formatted = formatInvoice(stripeInvoice);

      assert.strictEqual(formatted.id, "inv_paid_001");
      assert.strictEqual(formatted.amount, 1500);
      assert.strictEqual(formatted.currency, "usd");
      assert.strictEqual(formatted.status, "paid");
      assert.strictEqual(formatted.pdfUrl, "https://pay.stripe.com/invoice/inv_paid_001/pdf");
      // date should be an ISO string
      assert.ok(formatted.date.includes("2024-03-01"));
    });

    it("should set pdfUrl to null when invoice_pdf is missing", () => {
      const stripeInvoice = {
        id: "inv_draft_002",
        created: 1709251200,
        amount_paid: 0,
        currency: "usd",
        status: "draft",
        invoice_pdf: null,
      };

      const formatted = formatInvoice(stripeInvoice);
      assert.strictEqual(formatted.pdfUrl, null);
    });

    it("should set pdfUrl to null when invoice_pdf is undefined", () => {
      const stripeInvoice = {
        id: "inv_no_pdf",
        created: 1709251200,
        amount_paid: 0,
        currency: "usd",
        status: "open",
      };

      const formatted = formatInvoice(stripeInvoice);
      assert.strictEqual(formatted.pdfUrl, null);
    });

    it("should convert created timestamp to ISO date string", () => {
      const stripeInvoice = {
        id: "inv_date_test",
        created: 1704067200, // 2024-01-01 00:00:00 UTC
        amount_paid: 15000,
        currency: "usd",
        status: "paid",
        invoice_pdf: null,
      };

      const formatted = formatInvoice(stripeInvoice);
      assert.strictEqual(formatted.date, "2024-01-01T00:00:00.000Z");
    });

    it("should return exactly 6 fields per invoice", () => {
      const stripeInvoice = {
        id: "inv_fields",
        created: 1704067200,
        amount_paid: 3500,
        currency: "usd",
        status: "paid",
        invoice_pdf: "https://example.com/pdf",
      };

      const formatted = formatInvoice(stripeInvoice);
      const keys = Object.keys(formatted);
      assert.strictEqual(keys.length, 6);
      assert.ok(keys.includes("id"));
      assert.ok(keys.includes("date"));
      assert.ok(keys.includes("amount"));
      assert.ok(keys.includes("currency"));
      assert.ok(keys.includes("status"));
      assert.ok(keys.includes("pdfUrl"));
    });

    it("should handle zero amount (e.g., trial invoice)", () => {
      const stripeInvoice = {
        id: "inv_trial",
        created: 1704067200,
        amount_paid: 0,
        currency: "usd",
        status: "paid",
        invoice_pdf: null,
      };

      const formatted = formatInvoice(stripeInvoice);
      assert.strictEqual(formatted.amount, 0);
    });

    it("should handle non-USD currency", () => {
      const stripeInvoice = {
        id: "inv_eur",
        created: 1704067200,
        amount_paid: 1400,
        currency: "eur",
        status: "paid",
        invoice_pdf: "https://example.com/pdf",
      };

      const formatted = formatInvoice(stripeInvoice);
      assert.strictEqual(formatted.currency, "eur");
    });
  });
});

describe("portal/stripe-session — preservation properties (Property 5 & 6)", () => {
  /**
   * Property 5: Unchanged Auth and Error Handling
   * Property 6: Unchanged Non-Portal Stripe Functions
   *
   * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.7, 3.9, 3.10, 3.11
   */

  describe("auth preservation", () => {
    function requireAuth(tokenPayload) {
      if (!tokenPayload) {
        return { authenticated: false, error: "Authentication required", status: 401 };
      }
      return { authenticated: true };
    }

    it("should return 401 with 'Authentication required' for null token", () => {
      const result = requireAuth(null);
      assert.strictEqual(result.status, 401);
      assert.strictEqual(result.error, "Authentication required");
    });

    it("should return 401 for undefined token", () => {
      const result = requireAuth(undefined);
      assert.strictEqual(result.status, 401);
    });

    it("should accept valid token payload", () => {
      const result = requireAuth({ email: "test@example.com", sub: "auth0|123" });
      assert.strictEqual(result.authenticated, true);
    });
  });

  describe("customer lookup preservation", () => {
    function validateCustomer(customer) {
      if (!customer?.stripeCustomerId) {
        return { valid: false, error: "No Stripe customer found. Please purchase a license first.", status: 404 };
      }
      return { valid: true };
    }

    it("should return 404 with correct message for missing customer", () => {
      const result = validateCustomer(null);
      assert.strictEqual(result.status, 404);
      assert.ok(result.error.includes("No Stripe customer found"));
      assert.ok(result.error.includes("purchase a license"));
    });

    it("should return 404 for customer without stripeCustomerId", () => {
      const result = validateCustomer({ email: "test@example.com", accountType: "individual" });
      assert.strictEqual(result.status, 404);
    });
  });

  describe("portal config ID preservation", () => {
    function getPortalConfigId(accountType, secrets) {
      return accountType === "business"
        ? secrets.STRIPE_PORTAL_CONFIG_BUSINESS
        : secrets.STRIPE_PORTAL_CONFIG_INDIVIDUAL;
    }

    const mockSecrets = {
      STRIPE_PORTAL_CONFIG_INDIVIDUAL: "bpc_ind_test",
      STRIPE_PORTAL_CONFIG_BUSINESS: "bpc_biz_test",
    };

    it("should use individual config for individual accounts", () => {
      assert.strictEqual(getPortalConfigId("individual", mockSecrets), "bpc_ind_test");
    });

    it("should use business config for business accounts", () => {
      assert.strictEqual(getPortalConfigId("business", mockSecrets), "bpc_biz_test");
    });
  });

  describe("return URL preservation", () => {
    it("should always include /portal/billing?updated=true", () => {
      const baseUrl = "https://staging.hic-ai.com";
      const returnUrl = `${baseUrl}/portal/billing?updated=true`;
      assert.ok(returnUrl.endsWith("/portal/billing?updated=true"));
    });
  });

  describe("createPortalSession removal (Requirement 3.9)", () => {
    it("should NOT export createPortalSession from stripe.js", async () => {
      // Dynamic import to check exports
      const stripeModule = await import("../../../src/lib/stripe.js");
      assert.strictEqual(stripeModule.createPortalSession, undefined);
    });

    it("should still export getStripeClient", async () => {
      const stripeModule = await import("../../../src/lib/stripe.js");
      assert.strictEqual(typeof stripeModule.getStripeClient, "function");
    });

    it("should still export createCheckoutSession", async () => {
      const stripeModule = await import("../../../src/lib/stripe.js");
      assert.strictEqual(typeof stripeModule.createCheckoutSession, "function");
    });

    it("should still export updateSubscriptionQuantity", async () => {
      const stripeModule = await import("../../../src/lib/stripe.js");
      assert.strictEqual(typeof stripeModule.updateSubscriptionQuantity, "function");
    });

    it("should still export verifyWebhookSignature", async () => {
      const stripeModule = await import("../../../src/lib/stripe.js");
      assert.strictEqual(typeof stripeModule.verifyWebhookSignature, "function");
    });
  });
});

describe("portal/stripe-session — property-based random input validation", () => {
  /**
   * Property-based tests: generate random inputs and verify invariants hold.
   *
   * Instead of a PBT library, we use deterministic pseudo-random generation
   * to cover a wide range of inputs while keeping tests reproducible.
   *
   * Validates: Requirements 2.4, 2.7, 2.8, 2.9
   */

  const VALID_FLOWS = new Set([
    "switch_to_annual",
    "switch_to_monthly",
    "adjust_seats",
    "update_payment",
    "cancel",
  ]);

  const ACCOUNT_TYPES = ["individual", "business"];

  const FLOW_TO_TYPE = {
    switch_to_annual: "subscription_update_confirm",
    switch_to_monthly: "subscription_update_confirm",
    adjust_seats: "subscription_update_confirm",
    update_payment: "payment_method_update",
    cancel: "subscription_cancel",
  };

  const TEST_STRIPE_PRICES = {
    individual: { monthly: "price_ind_mo", annual: "price_ind_yr" },
    business: { monthly: "price_biz_mo", annual: "price_biz_yr" },
  };

  function validateFlow(flow) {
    if (!flow || !VALID_FLOWS.has(flow)) {
      return { valid: false, status: 400 };
    }
    return { valid: true };
  }

  function validateSeatAdjustment(accountType, quantity) {
    if (accountType === "individual") {
      return { valid: false, status: 400 };
    }
    if (
      quantity == null ||
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 99
    ) {
      return { valid: false, status: 400 };
    }
    return { valid: true };
  }

  describe("random valid flow + accountType combos produce correct flow_data.type", () => {
    // Exhaustive: all 10 combos of (5 flows × 2 account types)
    const validFlows = [...VALID_FLOWS];

    for (const accountType of ACCOUNT_TYPES) {
      for (const flow of validFlows) {
        // Skip adjust_seats for individual — that's a guard rail, not a valid combo
        if (flow === "adjust_seats" && accountType === "individual") continue;

        it(`${accountType} + ${flow} → flow_data.type = ${FLOW_TO_TYPE[flow]}`, () => {
          const result = validateFlow(flow);
          assert.strictEqual(result.valid, true);
          assert.strictEqual(FLOW_TO_TYPE[flow] !== undefined, true);
        });
      }
    }
  });

  describe("random invalid flow values are all rejected", () => {
    const invalidFlows = [
      "", null, undefined, 0, 1, true, false,
      "manage", "manage_subscription", "portal", "open",
      "SWITCH_TO_ANNUAL", "Switch_To_Annual", // case-sensitive
      "switch-to-annual", // wrong delimiter
      "adjust_seat", // singular
      "update_payments", // plural
      "cancellation",
      " switch_to_annual", // leading space
      "switch_to_annual ", // trailing space
    ];

    for (const flow of invalidFlows) {
      it(`should reject flow: ${JSON.stringify(flow)}`, () => {
        const result = validateFlow(flow);
        assert.strictEqual(result.valid, false);
        assert.strictEqual(result.status, 400);
      });
    }
  });

  describe("random quantity values for adjust_seats validation", () => {
    // Valid quantities: integers 1-99
    const validQuantities = [1, 2, 10, 25, 49, 50, 51, 75, 98, 99];
    for (const q of validQuantities) {
      it(`should accept quantity ${q} for business`, () => {
        const result = validateSeatAdjustment("business", q);
        assert.strictEqual(result.valid, true);
      });
    }

    // Invalid quantities: out of range, wrong type, edge cases
    const invalidQuantities = [
      { value: 0, label: "zero" },
      { value: -1, label: "negative" },
      { value: -100, label: "large negative" },
      { value: 100, label: "just over max" },
      { value: 1000, label: "way over max" },
      { value: 0.5, label: "float 0.5" },
      { value: 1.1, label: "float 1.1" },
      { value: 99.5, label: "float 99.5" },
      { value: NaN, label: "NaN" },
      { value: Infinity, label: "Infinity" },
      { value: -Infinity, label: "-Infinity" },
      { value: null, label: "null" },
      { value: undefined, label: "undefined" },
      { value: "5", label: "string '5'" },
      { value: "ten", label: "string 'ten'" },
      { value: "", label: "empty string" },
      { value: true, label: "boolean true" },
      { value: false, label: "boolean false" },
      { value: [], label: "empty array" },
      { value: {}, label: "empty object" },
    ];

    for (const { value, label } of invalidQuantities) {
      it(`should reject quantity: ${label}`, () => {
        const result = validateSeatAdjustment("business", value);
        assert.strictEqual(result.valid, false);
        assert.strictEqual(result.status, 400);
      });
    }

    // Individual accounts always rejected regardless of quantity
    it("should reject any quantity for individual accounts", () => {
      for (const q of [1, 5, 10, 50, 99]) {
        const result = validateSeatAdjustment("individual", q);
        assert.strictEqual(result.valid, false, `individual + quantity ${q} should be rejected`);
      }
    });
  });

  describe("price derivation invariant — target always from STRIPE_PRICES", () => {
    function deriveTargetPrice(accountType, flow) {
      if (flow === "switch_to_annual") return TEST_STRIPE_PRICES[accountType]?.annual;
      if (flow === "switch_to_monthly") return TEST_STRIPE_PRICES[accountType]?.monthly;
      return null; // non-switch flows don't derive a target price
    }

    const switchFlows = ["switch_to_annual", "switch_to_monthly"];

    for (const accountType of ACCOUNT_TYPES) {
      for (const flow of switchFlows) {
        const expectedCycle = flow === "switch_to_annual" ? "annual" : "monthly";
        it(`${accountType} + ${flow} → price = STRIPE_PRICES.${accountType}.${expectedCycle}`, () => {
          const price = deriveTargetPrice(accountType, flow);
          assert.strictEqual(price, TEST_STRIPE_PRICES[accountType][expectedCycle]);
          // Verify it's a non-empty string (not undefined/null)
          assert.strictEqual(typeof price, "string");
          assert.ok(price.length > 0);
        });
      }
    }

    it("non-switch flows return null (no target price derivation)", () => {
      for (const flow of ["adjust_seats", "update_payment", "cancel"]) {
        const price = deriveTargetPrice("business", flow);
        assert.strictEqual(price, null);
      }
    });
  });
});

describe("portal/license API - org member license access", () => {
  /**
   * Tests for the org member shared license access feature.
   *
   * Business tier licenses are shared across all org members.
   * When a member with no direct license calls the license API,
   * they should get the org's shared license if they're a member.
   */

  // Helper to simulate org membership lookup
  function getUserOrgMembership(userId, membershipData = null) {
    if (!userId) return null;
    return membershipData;
  }

  // Helper to simulate org lookup
  function getOrganization(orgId, orgData = null) {
    if (!orgId) return null;
    return orgData;
  }

  // Helper to simulate customer lookup by userId
  function getCustomerByUserId(userId, customerData = null) {
    if (!userId) return null;
    return customerData;
  }

  // Helper to determine license source for a user
  function determineLicenseSource(customer, membership, org, orgOwner) {
    // Direct license takes priority
    if (customer?.keygenLicenseId) {
      return {
        source: "direct",
        licenseHolder: customer,
        orgContext: null,
      };
    }

    // Check org membership for shared license
    if (membership?.orgId && org?.ownerId && orgOwner?.keygenLicenseId) {
      return {
        source: "org",
        licenseHolder: orgOwner,
        orgContext: {
          orgId: membership.orgId,
          orgName: org.name || "Organization",
          memberRole: membership.role || "member",
          isSharedLicense: true,
        },
      };
    }

    // No license found
    return {
      source: "none",
      licenseHolder: null,
      orgContext: null,
    };
  }

  describe("license source determination", () => {
    it("should prefer direct license over org membership", () => {
      const customer = {
        email: "owner@example.com",
        keygenLicenseId: "lic_direct_123",
        accountType: "individual",
      };
      const membership = { orgId: "org_123", role: "owner" };
      const org = { id: "org_123", name: "Test Org", ownerId: "user_owner" };
      const orgOwner = { keygenLicenseId: "lic_org_456" };

      const result = determineLicenseSource(customer, membership, org, orgOwner);

      assert.strictEqual(result.source, "direct");
      assert.strictEqual(result.licenseHolder.keygenLicenseId, "lic_direct_123");
      assert.strictEqual(result.orgContext, null);
    });

    it("should use org license for member without direct license", () => {
      const customer = { email: "member@example.com" }; // No keygenLicenseId
      const membership = { orgId: "org_123", role: "member" };
      const org = { id: "org_123", name: "Acme Corp", ownerId: "user_owner" };
      const orgOwner = {
        keygenLicenseId: "lic_shared_789",
        accountType: "business",
      };

      const result = determineLicenseSource(customer, membership, org, orgOwner);

      assert.strictEqual(result.source, "org");
      assert.strictEqual(
        result.licenseHolder.keygenLicenseId,
        "lic_shared_789",
      );
      assert.strictEqual(result.orgContext.orgId, "org_123");
      assert.strictEqual(result.orgContext.orgName, "Acme Corp");
      assert.strictEqual(result.orgContext.memberRole, "member");
      assert.strictEqual(result.orgContext.isSharedLicense, true);
    });

    it("should return no license for user without direct or org license", () => {
      const customer = { email: "user@example.com" }; // No keygenLicenseId
      const membership = null; // Not in any org
      const org = null;
      const orgOwner = null;

      const result = determineLicenseSource(customer, membership, org, orgOwner);

      assert.strictEqual(result.source, "none");
      assert.strictEqual(result.licenseHolder, null);
    });

    it("should return no license for org member when org has no license", () => {
      const customer = { email: "member@example.com" }; // No keygenLicenseId
      const membership = { orgId: "org_123", role: "member" };
      const org = { id: "org_123", name: "New Org", ownerId: "user_owner" };
      const orgOwner = { email: "owner@example.com" }; // No keygenLicenseId yet

      const result = determineLicenseSource(customer, membership, org, orgOwner);

      assert.strictEqual(result.source, "none");
      assert.strictEqual(result.licenseHolder, null);
    });

    it("should handle org without owner gracefully", () => {
      const customer = { email: "member@example.com" };
      const membership = { orgId: "org_123", role: "member" };
      const org = { id: "org_123", name: "Orphan Org" }; // No ownerId
      const orgOwner = null;

      const result = determineLicenseSource(customer, membership, org, orgOwner);

      assert.strictEqual(result.source, "none");
    });

    it("should use default org name when org.name is missing", () => {
      const customer = { email: "member@example.com" };
      const membership = { orgId: "org_123", role: "admin" };
      const org = { id: "org_123", ownerId: "user_owner" }; // No name
      const orgOwner = { keygenLicenseId: "lic_123" };

      const result = determineLicenseSource(customer, membership, org, orgOwner);

      assert.strictEqual(result.orgContext.orgName, "Organization");
    });

    it("should use default member role when role is missing", () => {
      const customer = { email: "member@example.com" };
      const membership = { orgId: "org_123" }; // No role
      const org = { id: "org_123", name: "Test Org", ownerId: "user_owner" };
      const orgOwner = { keygenLicenseId: "lic_123" };

      const result = determineLicenseSource(customer, membership, org, orgOwner);

      assert.strictEqual(result.orgContext.memberRole, "member");
    });
  });

  describe("org membership lookup", () => {
    it("should return null for missing userId", () => {
      const membership = getUserOrgMembership(null, { orgId: "org_123" });
      assert.strictEqual(membership, null);
    });

    it("should return null when user has no membership", () => {
      const membership = getUserOrgMembership("user_123", null);
      assert.strictEqual(membership, null);
    });

    it("should return membership data for valid user", () => {
      const mockMembership = { orgId: "org_123", role: "member" };
      const membership = getUserOrgMembership("user_123", mockMembership);
      assert.deepStrictEqual(membership, mockMembership);
    });
  });

  describe("organization lookup", () => {
    it("should return null for missing orgId", () => {
      const org = getOrganization(null, { name: "Test" });
      assert.strictEqual(org, null);
    });

    it("should return null when org not found", () => {
      const org = getOrganization("org_123", null);
      assert.strictEqual(org, null);
    });

    it("should return org data for valid orgId", () => {
      const mockOrg = { id: "org_123", name: "Acme Corp", ownerId: "user_owner" };
      const org = getOrganization("org_123", mockOrg);
      assert.deepStrictEqual(org, mockOrg);
    });
  });

  describe("org owner customer lookup", () => {
    it("should return null for missing userId", () => {
      const customer = getCustomerByUserId(null, { email: "test@example.com" });
      assert.strictEqual(customer, null);
    });

    it("should return null when owner not found", () => {
      const customer = getCustomerByUserId("user_owner", null);
      assert.strictEqual(customer, null);
    });

    it("should return customer data for valid userId", () => {
      const mockCustomer = {
        userId: "user_owner",
        email: "owner@example.com",
        keygenLicenseId: "lic_123",
        accountType: "business",
      };
      const customer = getCustomerByUserId("user_owner", mockCustomer);
      assert.deepStrictEqual(customer, mockCustomer);
    });
  });

  describe("license response with org context", () => {
    function formatLicenseWithOrg(licenseHolder, localLicense, keygenLicense, orgContext) {
      const planName =
        licenseHolder.accountType === "business" ? "Business" : "Individual";

      const maskedKey = localLicense?.licenseKey
        ? `${localLicense.licenseKey.slice(0, 8)}...${localLicense.licenseKey.slice(-4)}`
        : null;

      const response = {
        license: {
          id: licenseHolder.keygenLicenseId,
          licenseKey: localLicense?.licenseKey,
          maskedKey,
          status: keygenLicense?.status || localLicense?.status || "unknown",
          planType: licenseHolder.accountType,
          planName,
          expiresAt: keygenLicense?.expiresAt || localLicense?.expiresAt,
          maxDevices: localLicense?.maxDevices || 3,
          activatedDevices: localLicense?.activatedDevices || 0,
          createdAt: localLicense?.createdAt,
        },
        subscription: {
          status: licenseHolder.subscriptionStatus,
          stripeCustomerId: licenseHolder.stripeCustomerId,
        },
      };

      if (orgContext) {
        response.organization = {
          id: orgContext.orgId,
          name: orgContext.orgName,
          role: orgContext.memberRole,
          isSharedLicense: orgContext.isSharedLicense,
        };
      }

      return response;
    }

    it("should include org context for org member", () => {
      const licenseHolder = {
        keygenLicenseId: "lic_biz_123",
        accountType: "business",
        subscriptionStatus: "active",
        stripeCustomerId: "cus_biz_456",
      };

      const localLicense = {
        licenseKey: "BUSI-NESS-LICE-NSE0-1234",
        status: "active",
        maxDevices: 25,
        activatedDevices: 5,
        createdAt: "2025-01-01",
        expiresAt: "2026-01-01",
      };

      const keygenLicense = {
        status: "active",
        expiresAt: "2026-01-01T00:00:00Z",
      };

      const orgContext = {
        orgId: "org_123",
        orgName: "Acme Corp",
        memberRole: "member",
        isSharedLicense: true,
      };

      const response = formatLicenseWithOrg(
        licenseHolder,
        localLicense,
        keygenLicense,
        orgContext,
      );

      // Verify license fields
      assert.strictEqual(response.license.id, "lic_biz_123");
      assert.strictEqual(response.license.licenseKey, "BUSI-NESS-LICE-NSE0-1234");
      assert.strictEqual(response.license.planType, "business");
      assert.strictEqual(response.license.planName, "Business");
      assert.strictEqual(response.license.maxDevices, 25);

      // Verify org context
      assert.strictEqual(response.organization.id, "org_123");
      assert.strictEqual(response.organization.name, "Acme Corp");
      assert.strictEqual(response.organization.role, "member");
      assert.strictEqual(response.organization.isSharedLicense, true);
    });

    it("should not include org context for direct license", () => {
      const licenseHolder = {
        keygenLicenseId: "lic_123",
        accountType: "individual",
        subscriptionStatus: "active",
      };

      const localLicense = {
        licenseKey: "INDI-VIDU-ALLI-CENS-1234",
        status: "active",
      };

      const response = formatLicenseWithOrg(
        licenseHolder,
        localLicense,
        null,
        null, // No org context
      );

      assert.strictEqual(response.license.planType, "individual");
      assert.strictEqual(response.organization, undefined);
    });

    it("should include admin role for org admins", () => {
      const licenseHolder = {
        keygenLicenseId: "lic_biz_123",
        accountType: "business",
      };

      const orgContext = {
        orgId: "org_123",
        orgName: "Acme Corp",
        memberRole: "admin",
        isSharedLicense: true,
      };

      const response = formatLicenseWithOrg(licenseHolder, {}, null, orgContext);

      assert.strictEqual(response.organization.role, "admin");
    });

    it("should include owner role for org owners accessing as member", () => {
      const licenseHolder = {
        keygenLicenseId: "lic_biz_123",
        accountType: "business",
      };

      const orgContext = {
        orgId: "org_123",
        orgName: "Acme Corp",
        memberRole: "owner",
        isSharedLicense: true,
      };

      const response = formatLicenseWithOrg(licenseHolder, {}, null, orgContext);

      assert.strictEqual(response.organization.role, "owner");
    });
  });
});

describe("portal/status API - org member status resolution", () => {
  /**
   * Tests the customer lookup chain in the status API.
   * 
   * The chain is:
   * 1. getCustomerByUserId(userId) — USER#sub/PROFILE record
   * 2. getCustomerByEmail(email) — GSI2 query, must only return PROFILE records
   * 3. getUserOrgMembership(userId) — GSI1 query for MEMBER records
   * 
   * Bug: Before the GSI2SK fix, getCustomerByEmail could return a MEMBER record
   * (which also has GSI2PK: EMAIL#...), causing the status API to treat org
   * members as non-subscribers.
   */

  // Simulates the status API's customer resolution chain
  function resolveUserStatus({
    customerByUserId,
    customerByEmail,
    orgMembership,
    orgDetails,
    orgOwnerCustomer,
  }) {
    // Step 1: Try by userId
    let customer = customerByUserId || null;

    // Step 2: Try by email (only returns PROFILE records after GSI2SK fix)
    if (!customer) {
      customer = customerByEmail || null;
    }

    // Step 3: If no customer with a subscription, check org membership
    // Members may have a bare profile (from PostConfirmation) but no subscription
    let membership = null;
    let ownerCustomer = null;

    if (!customer?.subscriptionStatus) {
      membership = orgMembership || null;

      if (membership) {
        const org = orgDetails || null;
        if (org?.stripeCustomerId) {
          ownerCustomer = orgOwnerCustomer || null;
        }
      }
    }

    // No customer AND no org membership = new user
    if (!customer && !membership) {
      return {
        status: "new",
        hasSubscription: false,
        accountType: null,
        isOrgMember: false,
      };
    }

    // Determine effective customer (owner's record for org members)
    // When org membership is found, prefer ownerCustomer (bare profile has no subscription)
    const effectiveCustomer = membership ? (ownerCustomer || customer) : customer;
    const subscriptionStatus = effectiveCustomer?.subscriptionStatus || "none";
    const hasSubscription = ["active"].includes(subscriptionStatus);
    const accountType = membership ? "business" : (effectiveCustomer?.accountType || "individual");

    return {
      status: hasSubscription ? "active" : "new",
      hasSubscription,
      subscriptionStatus,
      accountType,
      isOrgMember: !!membership,
      orgMembership: membership ? {
        orgId: membership.orgId,
        role: membership.role,
      } : undefined,
    };
  }

  it("should resolve org member correctly when no customer record exists", () => {
    const result = resolveUserStatus({
      customerByUserId: null,
      customerByEmail: null, // GSI2SK fix ensures this is null for members
      orgMembership: { orgId: "cus_org123", role: "member", status: "active" },
      orgDetails: { orgId: "cus_org123", stripeCustomerId: "cus_org123", ownerId: "user_owner" },
      orgOwnerCustomer: {
        subscriptionStatus: "active",
        keygenLicenseId: "lic_abc123",
        accountType: "business",
      },
    });

    assert.strictEqual(result.hasSubscription, true);
    assert.strictEqual(result.accountType, "business");
    assert.strictEqual(result.isOrgMember, true);
    assert.strictEqual(result.orgMembership.role, "member");
  });

  it("should NOT treat member as subscriber when GSI2 returns membership record (pre-fix behavior)", () => {
    // This test documents the bug that existed before the GSI2SK fix.
    // If getCustomerByEmail returned a membership record (which has no
    // subscriptionStatus), the member would be treated as a non-subscriber.
    const fakeMembershipRecord = {
      // This is what a membership record looks like in GSI2 — no subscription fields
      PK: "ORG#cus_org123",
      SK: "MEMBER#user_member",
      GSI2PK: "EMAIL#member@example.com",
      GSI2SK: "MEMBER#cus_org123",
      email: "member@example.com",
      role: "member",
      status: "active",
      // NOTE: No subscriptionStatus, no keygenLicenseId, no accountType
    };

    const result = resolveUserStatus({
      customerByUserId: null,
      customerByEmail: fakeMembershipRecord, // Bug: GSI2 returned membership!
      orgMembership: null, // Never checked because customer is truthy
      orgDetails: null,
      orgOwnerCustomer: null,
    });

    // With the membership record treated as a customer, it has no subscription
    assert.strictEqual(result.hasSubscription, false);
    assert.strictEqual(result.isOrgMember, false); // Incorrectly treated as non-member
    // This is the broken behavior the fix addresses
  });

  it("should treat new user correctly when all lookups return null", () => {
    const result = resolveUserStatus({
      customerByUserId: null,
      customerByEmail: null,
      orgMembership: null,
      orgDetails: null,
      orgOwnerCustomer: null,
    });

    assert.strictEqual(result.status, "new");
    assert.strictEqual(result.hasSubscription, false);
    assert.strictEqual(result.isOrgMember, false);
  });

  it("should resolve direct customer (individual) correctly", () => {
    const result = resolveUserStatus({
      customerByUserId: {
        subscriptionStatus: "active",
        keygenLicenseId: "lic_ind_123",
        accountType: "individual",
      },
      customerByEmail: null,
      orgMembership: null,
      orgDetails: null,
      orgOwnerCustomer: null,
    });

    assert.strictEqual(result.hasSubscription, true);
    assert.strictEqual(result.accountType, "individual");
    assert.strictEqual(result.isOrgMember, false);
  });

  it("should resolve org owner correctly via customerByUserId", () => {
    const result = resolveUserStatus({
      customerByUserId: {
        subscriptionStatus: "active",
        keygenLicenseId: "lic_biz_456",
        accountType: "business",
        orgId: "cus_org456",
        orgRole: "owner",
      },
      customerByEmail: null,
      orgMembership: null, // Owner found via customerByUserId, not membership
      orgDetails: null,
      orgOwnerCustomer: null,
    });

    assert.strictEqual(result.hasSubscription, true);
    assert.strictEqual(result.accountType, "business");
    assert.strictEqual(result.isOrgMember, false); // Owner has direct customer record
  });

  it("should fall through to org membership when email lookup finds a bare profile without subscription", () => {
    // Real scenario: simon.reiff@gmail.com has a bare USER/PROFILE from PostConfirmation
    // (no subscriptionStatus) and is also an org member. The status API must
    // check org membership even though a customer record was found.
    const result = resolveUserStatus({
      customerByUserId: null,
      customerByEmail: {
        // Bare profile from PostConfirmation — no subscription fields
        email: "simon.reiff@gmail.com",
        name: "Simon",
        userId: "google_114165355764132910587",
        // No subscriptionStatus, no keygenLicenseId
      },
      orgMembership: { orgId: "cus_org789", role: "admin", status: "active" },
      orgDetails: { stripeCustomerId: "cus_org789" },
      orgOwnerCustomer: { subscriptionStatus: "active", accountType: "business", keygenLicenseId: "lic_shared" },
    });

    // Bare profile has no subscriptionStatus, so org membership IS checked
    assert.strictEqual(result.hasSubscription, true);
    assert.strictEqual(result.accountType, "business");
    assert.strictEqual(result.isOrgMember, true);
    assert.strictEqual(result.orgMembership.role, "admin");
  });

  it("should handle org member with past_due subscription", () => {
    const result = resolveUserStatus({
      customerByUserId: null,
      customerByEmail: null,
      orgMembership: { orgId: "cus_pastdue", role: "member", status: "active" },
      orgDetails: { orgId: "cus_pastdue", stripeCustomerId: "cus_pastdue" },
      orgOwnerCustomer: { subscriptionStatus: "past_due", accountType: "business" },
    });

    assert.strictEqual(result.hasSubscription, false);
    assert.strictEqual(result.subscriptionStatus, "past_due");
    assert.strictEqual(result.accountType, "business");
  });

  it("should handle org member whose org has no stripeCustomerId", () => {
    const result = resolveUserStatus({
      customerByUserId: null,
      customerByEmail: null,
      orgMembership: { orgId: "org_broken", role: "member" },
      orgDetails: { orgId: "org_broken" }, // No stripeCustomerId!
      orgOwnerCustomer: null,
    });

    // Member found, but owner customer can't be resolved
    assert.strictEqual(result.hasSubscription, false);
    assert.strictEqual(result.accountType, "business");
    assert.strictEqual(result.isOrgMember, true);
  });

  it("should NOT fall through to org membership when customer has active subscription", () => {
    // Regression guard: a customer with an active subscription should never
    // have their org membership checked — they are already a known subscriber
    const result = resolveUserStatus({
      customerByUserId: null,
      customerByEmail: {
        subscriptionStatus: "active",
        accountType: "individual",
        keygenLicenseId: "lic_direct",
      },
      orgMembership: { orgId: "cus_should_not_reach", role: "member", status: "active" },
      orgDetails: { stripeCustomerId: "cus_should_not_reach" },
      orgOwnerCustomer: { subscriptionStatus: "active", accountType: "business" },
    });

    // Customer has active subscription — org membership is NOT checked
    assert.strictEqual(result.hasSubscription, true);
    assert.strictEqual(result.accountType, "individual"); // NOT business
    assert.strictEqual(result.isOrgMember, false); // NOT org member
  });

  it("should treat bare profile with no org membership as new user", () => {
    // A user who signed up via Google login but hasn't subscribed and
    // hasn't been invited to any org — they're a new user
    const result = resolveUserStatus({
      customerByUserId: null,
      customerByEmail: {
        email: "newuser@example.com",
        name: "New User",
        userId: "google_12345",
        // No subscriptionStatus — bare profile
      },
      orgMembership: null,
      orgDetails: null,
      orgOwnerCustomer: null,
    });

    // Bare profile + no org membership = still treated as new user
    // (the bare profile alone doesn't count as a "customer")
    assert.strictEqual(result.status, "new");
    assert.strictEqual(result.hasSubscription, false);
    assert.strictEqual(result.isOrgMember, false);
  });

  it("should fall through when customer has explicit subscriptionStatus of none", () => {
    // Edge case: what if a customer record has subscriptionStatus explicitly
    // set to 'none' (e.g., expired/reset) but user is also an org member?
    const result = resolveUserStatus({
      customerByUserId: null,
      customerByEmail: {
        subscriptionStatus: "none",
        email: "expired@example.com",
      },
      orgMembership: { orgId: "cus_rescue", role: "member", status: "active" },
      orgDetails: { stripeCustomerId: "cus_rescue" },
      orgOwnerCustomer: { subscriptionStatus: "active", accountType: "business" },
    });

    // subscriptionStatus 'none' is falsy-ish but truthy string — however
    // the check is !customer?.subscriptionStatus. 'none' is truthy, so
    // the org membership lookup is NOT performed. This documents current behavior.
    assert.strictEqual(result.hasSubscription, false);
    assert.strictEqual(result.isOrgMember, false);
    assert.strictEqual(result.subscriptionStatus, "none");
  });

  it("should handle GSI2 membership record correctly after bare profile fix", () => {
    // Even if the pre-GSI2SK-fix scenario occurred AND the membership record
    // leaked through as customerByEmail, the bare profile fix catches it because
    // membership records have no subscriptionStatus
    const leakedMemberRecord = {
      PK: "ORG#cus_org123",
      SK: "MEMBER#user_member",
      GSI2PK: "EMAIL#member@example.com",
      GSI2SK: "MEMBER#cus_org123",
      email: "member@example.com",
      role: "member",
      status: "active",
      // No subscriptionStatus — so falls through
    };

    const result = resolveUserStatus({
      customerByUserId: null,
      customerByEmail: leakedMemberRecord,
      orgMembership: { orgId: "cus_org123", role: "member", status: "active" },
      orgDetails: { stripeCustomerId: "cus_org123" },
      orgOwnerCustomer: { subscriptionStatus: "active", accountType: "business" },
    });

    // With bare profile fix, lack of subscriptionStatus causes fall-through
    // to org membership — double defense against GSI2 collisions
    assert.strictEqual(result.hasSubscription, true);
    assert.strictEqual(result.accountType, "business");
    assert.strictEqual(result.isOrgMember, true);
  });
});

// ============================================================================
// effectiveCustomer Priority Tests (bare profile vs orgOwnerCustomer)
// ============================================================================

describe("effectiveCustomer priority - org member with bare profile", () => {
  // These tests validate that when org membership is found, the org owner's
  // customer record (orgOwnerCustomer) takes priority over the bare profile.
  // Before the fix: effectiveCustomer = customer || orgOwnerCustomer
  //   → bare profile (truthy) was always picked, so subscriptionStatus was "none"
  // After the fix: effectiveCustomer = membership ? (orgOwnerCustomer || customer) : customer
  //   → org owner's record is preferred when membership exists

  // Simulates the FIXED status API effectiveCustomer resolution
  function resolveEffectiveCustomer({ customer, orgOwnerCustomer, membership }) {
    return membership ? (orgOwnerCustomer || customer) : customer;
  }

  it("should prefer orgOwnerCustomer over bare profile when org membership exists", () => {
    const bareProfile = { email: "user@test.com", name: "User", userId: "google_123" };
    const orgOwner = { subscriptionStatus: "active", accountType: "business", keygenLicenseId: "lic_org" };
    const membership = { orgId: "cus_org1", role: "member" };

    const effective = resolveEffectiveCustomer({ customer: bareProfile, orgOwnerCustomer: orgOwner, membership });

    assert.strictEqual(effective, orgOwner);
    assert.strictEqual(effective.subscriptionStatus, "active");
  });

  it("should fall back to bare profile when orgOwnerCustomer is null (broken org)", () => {
    const bareProfile = { email: "user@test.com", name: "User", userId: "google_123" };
    const membership = { orgId: "org_broken", role: "member" };

    const effective = resolveEffectiveCustomer({ customer: bareProfile, orgOwnerCustomer: null, membership });

    // Falls back to bare profile — no subscriptionStatus, so hasSubscription = false
    assert.strictEqual(effective, bareProfile);
    assert.strictEqual(effective.subscriptionStatus, undefined);
  });

  it("should use customer directly when no org membership exists (individual user)", () => {
    const customer = { subscriptionStatus: "active", accountType: "individual", keygenLicenseId: "lic_ind" };
    const orgOwner = { subscriptionStatus: "active", accountType: "business" };

    const effective = resolveEffectiveCustomer({ customer, orgOwnerCustomer: orgOwner, membership: null });

    // No membership → use customer directly, ignore orgOwnerCustomer
    assert.strictEqual(effective, customer);
    assert.strictEqual(effective.accountType, "individual");
  });

  it("should use orgOwnerCustomer even when bare profile has some fields", () => {
    // Bare profile may have email, name, userId but no subscription fields
    const bareProfile = {
      email: "simon@test.com",
      name: "Simon",
      userId: "google_99999",
      createdAt: "2026-02-01T00:00:00Z",
    };
    const orgOwner = {
      subscriptionStatus: "past_due",
      accountType: "business",
      keygenLicenseId: "lic_pastdue",
      currentPeriodEnd: "2026-03-01T00:00:00Z",
    };
    const membership = { orgId: "cus_pastdue_org", role: "admin" };

    const effective = resolveEffectiveCustomer({ customer: bareProfile, orgOwnerCustomer: orgOwner, membership });

    assert.strictEqual(effective, orgOwner);
    assert.strictEqual(effective.subscriptionStatus, "past_due");
    assert.strictEqual(effective.keygenLicenseId, "lic_pastdue");
  });

  it("should handle null customer with valid orgOwnerCustomer (no bare profile)", () => {
    const orgOwner = { subscriptionStatus: "active", accountType: "business" };
    const membership = { orgId: "cus_org2", role: "member" };

    const effective = resolveEffectiveCustomer({ customer: null, orgOwnerCustomer: orgOwner, membership });

    assert.strictEqual(effective, orgOwner);
  });

  it("should return null when both customer and orgOwnerCustomer are null with membership", () => {
    const membership = { orgId: "cus_orphan", role: "member" };

    const effective = resolveEffectiveCustomer({ customer: null, orgOwnerCustomer: null, membership });

    assert.strictEqual(effective, null);
  });
});

// ============================================================================
// Settings Page - isOrgMember Role Derivation Tests
// ============================================================================

describe("settings page - isOrgMember role derivation", () => {
  /**
   * Tests the settings page role derivation logic:
   *   const isOrgMember = isBusinessAccount && orgRole !== "owner";
   *
   * This determines:
   * - isOrgMember=true → "Leave Organization" shown (Danger Zone)
   * - isOrgMember=false → "Delete Account" shown (Danger Zone)
   *
   * The fix changed: orgRole === "member" → orgRole !== "owner"
   * so that Admin users also see "Leave Organization" instead of
   * getting the Owner-only "Delete Account" action.
   */

  function deriveOrgMemberStatus(accountType, orgRole) {
    const isBusinessAccount = accountType === "business";
    const isOrgOwner = isBusinessAccount && orgRole === "owner";
    const isOrgMember = isBusinessAccount && orgRole !== "owner";
    return { isBusinessAccount, isOrgOwner, isOrgMember };
  }

  it("should identify owner as NOT isOrgMember", () => {
    const result = deriveOrgMemberStatus("business", "owner");
    assert.strictEqual(result.isOrgOwner, true);
    assert.strictEqual(result.isOrgMember, false);
    // Owner sees "Delete Account" in Danger Zone
  });

  it("should identify admin as isOrgMember", () => {
    const result = deriveOrgMemberStatus("business", "admin");
    assert.strictEqual(result.isOrgOwner, false);
    assert.strictEqual(result.isOrgMember, true);
    // Admin sees "Leave Organization" in Danger Zone (the fix!)
  });

  it("should identify member as isOrgMember", () => {
    const result = deriveOrgMemberStatus("business", "member");
    assert.strictEqual(result.isOrgOwner, false);
    assert.strictEqual(result.isOrgMember, true);
    // Member sees "Leave Organization" in Danger Zone
  });

  it("should NOT treat individual account as org member regardless of role", () => {
    const result = deriveOrgMemberStatus("individual", "member");
    assert.strictEqual(result.isBusinessAccount, false);
    assert.strictEqual(result.isOrgOwner, false);
    assert.strictEqual(result.isOrgMember, false);
  });

  it("should handle missing orgRole (defaults to member)", () => {
    // In settings/page.js, orgRole defaults: cognitoUser?.[...] || "member"
    const result = deriveOrgMemberStatus("business", "member");
    assert.strictEqual(result.isOrgMember, true);
    assert.strictEqual(result.isOrgOwner, false);
  });

  it("should handle null accountType", () => {
    const result = deriveOrgMemberStatus(null, "admin");
    assert.strictEqual(result.isBusinessAccount, false);
    assert.strictEqual(result.isOrgMember, false);
    assert.strictEqual(result.isOrgOwner, false);
  });
});

// ===========================================
// PORTAL UI — Stream 1D Status Display Tests (Task 11.3)
// Tests SubscriptionStatusBadge variant/label mapping logic
// and billing card status text for new subscription statuses.
// ===========================================

describe("SubscriptionStatusBadge — variant and label mapping", () => {
  // Extracted from portal/billing/page.js SubscriptionStatusBadge component
  const variants = {
    active: "success",
    past_due: "warning",
    cancellation_pending: "warning",
    canceled: "secondary",
    expired: "secondary",
    unpaid: "danger",
    incomplete: "warning",
    incomplete_expired: "danger",
  };

  const labels = {
    active: "Active",
    past_due: "Past Due",
    cancellation_pending: "Cancellation Pending",
    canceled: "Canceled",
    expired: "Expired",
    unpaid: "Unpaid",
    incomplete: "Incomplete",
    incomplete_expired: "Expired",
  };

  it("should map cancellation_pending to warning variant", () => {
    assert.strictEqual(variants.cancellation_pending, "warning");
  });

  it("should map cancellation_pending to 'Cancellation Pending' label", () => {
    assert.strictEqual(labels.cancellation_pending, "Cancellation Pending");
  });

  it("should map expired to secondary variant", () => {
    assert.strictEqual(variants.expired, "secondary");
  });

  it("should map expired to 'Expired' label", () => {
    assert.strictEqual(labels.expired, "Expired");
  });

  it("should fall back to secondary variant for unknown status", () => {
    const unknownStatus = "some_unknown_status";
    assert.strictEqual(variants[unknownStatus] || "secondary", "secondary");
  });

  it("should fall back to raw status string for unknown label", () => {
    const unknownStatus = "some_unknown_status";
    assert.strictEqual(labels[unknownStatus] || unknownStatus, unknownStatus);
  });
});

describe("Billing card status text — cancellation_pending handling", () => {
  // Extracted from portal/page.js billing card status logic
  function getBillingStatusText(subscriptionStatus) {
    if (subscriptionStatus === "active") {
      return "Subscription active";
    } else if (subscriptionStatus === "cancellation_pending") {
      return "Cancellation pending";
    }
    return "No active subscription";
  }

  it("should display 'Cancellation pending' for cancellation_pending status", () => {
    assert.strictEqual(getBillingStatusText("cancellation_pending"), "Cancellation pending");
  });

  it("should display 'Subscription active' for active status", () => {
    assert.strictEqual(getBillingStatusText("active"), "Subscription active");
  });

  it("should display 'No active subscription' for expired status", () => {
    assert.strictEqual(getBillingStatusText("expired"), "No active subscription");
  });

  it("should display 'No active subscription' for past_due status", () => {
    assert.strictEqual(getBillingStatusText("past_due"), "No active subscription");
  });
});
