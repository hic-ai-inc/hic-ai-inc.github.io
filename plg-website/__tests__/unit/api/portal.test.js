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
    const hasSubscription = ["active", "trialing"].includes(subscriptionStatus);
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

  it("should handle org member with trialing subscription", () => {
    const result = resolveUserStatus({
      customerByUserId: null,
      customerByEmail: null,
      orgMembership: { orgId: "cus_trial", role: "member", status: "active" },
      orgDetails: { orgId: "cus_trial", stripeCustomerId: "cus_trial" },
      orgOwnerCustomer: { subscriptionStatus: "trialing", accountType: "business" },
    });

    assert.strictEqual(result.hasSubscription, true);
    assert.strictEqual(result.subscriptionStatus, "trialing");
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
      subscriptionStatus: "trialing",
      accountType: "business",
      keygenLicenseId: "lic_trial",
      currentPeriodEnd: "2026-03-01T00:00:00Z",
    };
    const membership = { orgId: "cus_trial_org", role: "admin" };

    const effective = resolveEffectiveCustomer({ customer: bareProfile, orgOwnerCustomer: orgOwner, membership });

    assert.strictEqual(effective, orgOwner);
    assert.strictEqual(effective.subscriptionStatus, "trialing");
    assert.strictEqual(effective.keygenLicenseId, "lic_trial");
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

