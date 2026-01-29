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

  function mergeDeviceData(localDevices, keygenDevices) {
    return localDevices.map((device) => {
      const keygenDevice = keygenDevices.find(
        (kd) => kd.id === device.keygenMachineId,
      );
      return {
        id: device.keygenMachineId,
        name: keygenDevice?.name || device.name,
        platform: keygenDevice?.platform || device.platform,
        fingerprint: device.fingerprint,
        lastSeen: keygenDevice?.lastHeartbeat || device.lastSeenAt,
        createdAt: keygenDevice?.createdAt || device.createdAt,
      };
    });
  }

  function validateDeleteInput(body) {
    const { machineId, licenseId } = body || {};

    if (!machineId || !licenseId) {
      return {
        valid: false,
        error: "Machine ID and License ID required",
        status: 400,
      };
    }
    return { valid: true };
  }

  describe("authentication", () => {
    it("should reject unauthenticated request", () => {
      const result = requireAuth(null);
      assert.strictEqual(result.authenticated, false);
    });

    it("should accept authenticated session", () => {
      const session = createMockSession({ email: "user@example.com" });
      const result = requireAuth(session);
      assert.strictEqual(result.authenticated, true);
    });
  });

  describe("empty responses", () => {
    it("should return empty devices array", () => {
      const response = getEmptyDevicesResponse();
      assert.deepStrictEqual(response.devices, []);
      assert.strictEqual(response.maxDevices, 0);
    });
  });

  describe("max concurrent machines by plan", () => {
    it("should return correct max for individual plan", () => {
      const max = getMaxConcurrentMachinesForPlan("individual");
      assert.strictEqual(max, PRICING.individual.maxConcurrentMachines);
    });

    it("should return correct max for business plan", () => {
      const max = getMaxConcurrentMachinesForPlan("business");
      // Business uses maxConcurrentMachinesPerSeat
      assert.ok(max > 0);
    });

    it("should default to 3 for unknown plan", () => {
      const max = getMaxConcurrentMachinesForPlan("unknown");
      assert.strictEqual(max, 3);
    });
  });

  describe("device data merging", () => {
    it("should merge local and keygen device data", () => {
      const localDevices = [
        {
          keygenMachineId: "mach_1",
          name: "Local Name",
          platform: "win32",
          fingerprint: "fp_1",
          lastSeenAt: "2025-01-01",
          createdAt: "2025-01-01",
        },
      ];

      const keygenDevices = [
        {
          id: "mach_1",
          name: "Keygen Name",
          platform: "win32",
          lastHeartbeat: "2025-01-15",
          createdAt: "2025-01-01",
        },
      ];

      const merged = mergeDeviceData(localDevices, keygenDevices);

      assert.strictEqual(merged[0].id, "mach_1");
      assert.strictEqual(merged[0].name, "Keygen Name"); // Prefers keygen
      assert.strictEqual(merged[0].lastSeen, "2025-01-15"); // Uses heartbeat
    });

    it("should use local data when keygen unavailable", () => {
      const localDevices = [
        {
          keygenMachineId: "mach_1",
          name: "Local Name",
          platform: "darwin",
          fingerprint: "fp_1",
          lastSeenAt: "2025-01-01",
          createdAt: "2025-01-01",
        },
      ];

      const merged = mergeDeviceData(localDevices, []);

      assert.strictEqual(merged[0].name, "Local Name");
      assert.strictEqual(merged[0].lastSeen, "2025-01-01");
    });
  });

  describe("delete input validation", () => {
    it("should reject missing machine ID", () => {
      const result = validateDeleteInput({ licenseId: "lic_123" });
      assert.strictEqual(result.valid, false);
    });

    it("should reject missing license ID", () => {
      const result = validateDeleteInput({ machineId: "mach_123" });
      assert.strictEqual(result.valid, false);
    });

    it("should accept valid input", () => {
      const result = validateDeleteInput({
        machineId: "mach_123",
        licenseId: "lic_456",
      });
      assert.strictEqual(result.valid, true);
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
  const AUTH0_NS = "https://hic-ai.com";

  function requireAuth(session) {
    if (!session?.user) {
      return {
        authenticated: false,
        error: "Authentication required",
        status: 401,
      };
    }
    return { authenticated: true };
  }

  function getCustomerId(session) {
    return session?.user?.[`${AUTH0_NS}/customer_id`] || null;
  }

  function validateCustomerId(customerId) {
    if (!customerId) {
      return {
        valid: false,
        error: "No Stripe customer found",
        status: 404,
      };
    }
    return { valid: true };
  }

  describe("authentication", () => {
    it("should reject unauthenticated request", () => {
      const result = requireAuth(null);
      assert.strictEqual(result.authenticated, false);
      assert.strictEqual(result.error, "Authentication required");
    });
  });

  describe("customer ID extraction", () => {
    it("should extract customer ID from session", () => {
      const session = createMockSession({
        email: "user@example.com",
        [`${AUTH0_NS}/customer_id`]: "cus_123",
      });

      const customerId = getCustomerId(session);
      assert.strictEqual(customerId, "cus_123");
    });

    it("should return null when customer ID missing", () => {
      const session = createMockSession({ email: "user@example.com" });
      const customerId = getCustomerId(session);
      assert.strictEqual(customerId, null);
    });
  });

  describe("customer ID validation", () => {
    it("should reject missing customer ID", () => {
      const result = validateCustomerId(null);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, "No Stripe customer found");
      assert.strictEqual(result.status, 404);
    });

    it("should accept valid customer ID", () => {
      const result = validateCustomerId("cus_123");
      assert.strictEqual(result.valid, true);
    });
  });
});
