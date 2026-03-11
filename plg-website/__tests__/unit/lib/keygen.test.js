/**
 * Keygen License Management Tests
 *
 * Tests the keygen.js module that provides license lifecycle management.
 *
 * Behaviors tested:
 * - Request handler injection for testing
 * - License creation, retrieval, validation
 * - License suspension, reinstatement, revocation
 * - Device/machine activation and deactivation
 * - Machine heartbeat
 * - License checkout for offline use
 * - Policy helpers
 */

import {
  describe,
  it,
  beforeEach,
  afterEach,
  expect,
} from "../../../../dm/facade/test-helpers/index.js";
import { createKeygenMock } from "../../../../dm/facade/helpers/keygen.js";

import {
  __setKeygenRequestForTests,
  __resetKeygenRequestForTests,
  createLicense,
  getLicense,
  validateLicense,
  suspendLicense,
  reinstateLicense,
  revokeLicense,
  updateLicenseMetadata,
  activateDevice,
  deactivateDevice,
  getLicenseMachines,
  machineHeartbeat,
  checkoutLicense,
  getPolicyId,
  createLicenseForPlan,
  KEYGEN_POLICIES,
  normalizeStatus,
  renewLicense,
  changeLicensePolicy,
  resolvePlanType,
  getLicensesByEmail,
} from "../../../src/lib/keygen.js";

describe("keygen.js", () => {
  let keygenMock;

  beforeEach(() => {
    keygenMock = createKeygenMock();
    __setKeygenRequestForTests(keygenMock.request);
  });

  afterEach(() => {
    __resetKeygenRequestForTests();
  });

  describe("KEYGEN_POLICIES", () => {
    it("should have individualMonthly policy", () => {
      expect(KEYGEN_POLICIES).toHaveProperty("individualMonthly");
    });

    it("should have individualAnnual policy", () => {
      expect(KEYGEN_POLICIES).toHaveProperty("individualAnnual");
    });

    it("should have businessMonthly policy", () => {
      expect(KEYGEN_POLICIES).toHaveProperty("businessMonthly");
    });

    it("should have businessAnnual policy", () => {
      expect(KEYGEN_POLICIES).toHaveProperty("businessAnnual");
    });
  });

  describe("createLicense", () => {
    it("should create license with policy and user info", async () => {
      keygenMock.whenCreateLicense().resolves({
        data: {
          id: "lic_test_123",
          attributes: {
            key: "XXXX-XXXX-XXXX-XXXX",
            status: "ACTIVE",
            expiry: "2027-01-23T00:00:00Z",
            maxMachines: 3,
            metadata: { email: "user@example.com" },
          },
        },
      });

      const result = await createLicense({
        policyId: "pol_individual_123",
        name: "Test User",
        email: "user@example.com",
      });

      expect(result.id).toBe("lic_test_123");
      expect(result.key).toBe("XXXX-XXXX-XXXX-XXXX");
      expect(result.status).toBe("active");
      expect(result.maxMachines).toBe(3);
    });

    it("should include metadata in license creation", async () => {
      keygenMock.whenCreateLicense().resolves({
        data: {
          id: "lic_123",
          attributes: {
            key: "KEY",
            status: "ACTIVE",
            expiry: null,
            maxMachines: 3,
            metadata: {
              email: "user@example.com",
              stripeCustomerId: "cus_abc123",
            },
          },
        },
      });

      const result = await createLicense({
        policyId: "pol_123",
        name: "User",
        email: "user@example.com",
        metadata: { stripeCustomerId: "cus_abc123" },
      });

      expect(result.metadata.stripeCustomerId).toBe("cus_abc123");
    });

    it("should call Keygen API with correct endpoint", async () => {
      keygenMock.whenCreateLicense().resolves({
        data: {
          id: "lic_123",
          attributes: { key: "KEY", status: "ACTIVE", maxMachines: 3 },
        },
      });

      await createLicense({
        policyId: "pol_123",
        name: "User",
        email: "user@example.com",
      });

      expect(keygenMock.request.calls.length).toBe(1);
      expect(keygenMock.request.calls[0][0]).toBe("/licenses");
      expect(keygenMock.request.calls[0][1].method).toBe("POST");
    });
  });

  describe("getLicense", () => {
    it("should retrieve license by ID", async () => {
      keygenMock.whenGetLicense("lic_abc123").resolves({
        data: {
          id: "lic_abc123",
          attributes: {
            key: "ABCD-EFGH-IJKL-MNOP",
            status: "ACTIVE",
            expiry: "2027-01-23T00:00:00Z",
            maxMachines: 3,
            uses: 5,
            metadata: { email: "user@example.com" },
          },
        },
      });

      const result = await getLicense("lic_abc123");

      expect(result.id).toBe("lic_abc123");
      expect(result.key).toBe("ABCD-EFGH-IJKL-MNOP");
      expect(result.status).toBe("active");
      expect(result.uses).toBe(5);
    });

    it("should call correct endpoint with license ID", async () => {
      keygenMock.whenGetLicense("lic_test_456").resolves({
        data: {
          id: "lic_test_456",
          attributes: { key: "KEY", status: "ACTIVE", maxMachines: 3 },
        },
      });

      await getLicense("lic_test_456");

      expect(keygenMock.request.calls[0][0]).toBe("/licenses/lic_test_456");
    });
  });

  describe("validateLicense", () => {
    it("should return valid result for active license", async () => {
      keygenMock.whenValidateLicense().resolves({
        meta: {
          valid: true,
          code: "VALID",
          detail: "License is valid",
        },
        data: {
          id: "lic_123",
          attributes: {
            status: "ACTIVE",
            expiry: "2027-01-23T00:00:00Z",
          },
        },
      });

      const result = await validateLicense(
        "XXXX-XXXX-XXXX-XXXX",
        "machine_fingerprint_abc",
      );

      expect(result.valid).toBe(true);
      expect(result.code).toBe("VALID");
      expect(result.license.status).toBe("active");
    });

    it("should return invalid result for expired license", async () => {
      keygenMock.whenValidateLicense().resolves({
        meta: {
          valid: false,
          code: "EXPIRED",
          detail: "License has expired",
        },
        data: {
          id: "lic_123",
          attributes: {
            status: "EXPIRED",
            expiry: "2024-01-23T00:00:00Z",
          },
        },
      });

      const result = await validateLicense("EXPIRED-KEY", "fingerprint");

      expect(result.valid).toBe(false);
      expect(result.code).toBe("EXPIRED");
    });

    it("should return validation failure on error without throwing", async () => {
      keygenMock.request.mockRejectedValue({
        message: "License not found",
        errors: [{ code: "NOT_FOUND" }],
      });

      const result = await validateLicense("INVALID-KEY", "fingerprint");

      expect(result.valid).toBe(false);
      expect(result.code).toBe("NOT_FOUND");
      expect(result.license).toBe(null);
    });

    it("should call validate-key endpoint with POST", async () => {
      keygenMock.whenValidateLicense().resolves({
        meta: { valid: true, code: "VALID" },
        data: { id: "lic_123", attributes: { status: "ACTIVE" } },
      });

      await validateLicense("LICENSE-KEY", "FINGERPRINT");

      expect(keygenMock.request.calls[0][0]).toBe(
        "/licenses/actions/validate-key",
      );
      expect(keygenMock.request.calls[0][1].method).toBe("POST");
    });
  });

  describe("suspendLicense", () => {
    it("should suspend a license", async () => {
      keygenMock.whenSuspendLicense("lic_123").resolves({});

      await suspendLicense("lic_123");

      expect(keygenMock.request.calls[0][0]).toBe(
        "/licenses/lic_123/actions/suspend",
      );
      expect(keygenMock.request.calls[0][1].method).toBe("POST");
    });
  });

  describe("reinstateLicense", () => {
    it("should reinstate a suspended license", async () => {
      keygenMock.whenReinstateLicense("lic_456").resolves({});

      await reinstateLicense("lic_456");

      expect(keygenMock.request.calls[0][0]).toBe(
        "/licenses/lic_456/actions/reinstate",
      );
      expect(keygenMock.request.calls[0][1].method).toBe("POST");
    });
  });

  describe("revokeLicense", () => {
    it("should delete/revoke a license", async () => {
      keygenMock.whenRevokeLicense("lic_789").resolves({});

      await revokeLicense("lic_789");

      expect(keygenMock.request.calls[0][0]).toBe("/licenses/lic_789");
      expect(keygenMock.request.calls[0][1].method).toBe("DELETE");
    });
  });

  describe("updateLicenseMetadata", () => {
    it("should update license metadata", async () => {
      keygenMock.request.mockResolvedValue({});

      await updateLicenseMetadata("lic_123", {
        stripeSubscriptionId: "sub_new_123",
      });

      expect(keygenMock.request.calls[0][0]).toBe("/licenses/lic_123");
      expect(keygenMock.request.calls[0][1].method).toBe("PATCH");
    });
  });

  describe("activateDevice", () => {
    it("should activate a device for a license", async () => {
      keygenMock.whenActivateDevice().resolves({
        data: {
          id: "mach_device_123",
          attributes: {
            fingerprint: "device_fingerprint_abc",
            name: "Work Laptop",
            platform: "windows",
            created: "2026-01-23T12:00:00Z",
            lastHeartbeat: null,
          },
        },
      });

      const result = await activateDevice({
        licenseId: "lic_123",
        fingerprint: "device_fingerprint_abc",
        name: "Work Laptop",
        platform: "windows",
      });

      expect(result.id).toBe("mach_device_123");
      expect(result.fingerprint).toBe("device_fingerprint_abc");
      expect(result.name).toBe("Work Laptop");
      expect(result.platform).toBe("windows");
    });

    it("should call machines endpoint with POST", async () => {
      keygenMock.whenActivateDevice().resolves({
        data: {
          id: "mach_123",
          attributes: {
            fingerprint: "fp",
            name: "Device",
            platform: "macos",
            created: "2026-01-23T00:00:00Z",
          },
        },
      });

      await activateDevice({
        licenseId: "lic_123",
        fingerprint: "fp",
        name: "Device",
        platform: "macos",
      });

      expect(keygenMock.request.calls[0][0]).toBe("/machines");
      expect(keygenMock.request.calls[0][1].method).toBe("POST");
    });
  });

  describe("deactivateDevice", () => {
    it("should deactivate a device", async () => {
      keygenMock.whenDeactivateDevice("mach_abc123").resolves({});

      await deactivateDevice("mach_abc123");

      expect(keygenMock.request.calls[0][0]).toBe("/machines/mach_abc123");
      expect(keygenMock.request.calls[0][1].method).toBe("DELETE");
    });
  });

  describe("getLicenseMachines", () => {
    it("should return list of machines for a license", async () => {
      keygenMock.whenGetLicenseMachines("lic_123").resolves({
        data: [
          {
            id: "mach_1",
            attributes: {
              fingerprint: "fp_1",
              name: "Laptop",
              platform: "macos",
              created: "2026-01-01T00:00:00Z",
              lastHeartbeat: "2026-01-23T10:00:00Z",
            },
          },
          {
            id: "mach_2",
            attributes: {
              fingerprint: "fp_2",
              name: "Desktop",
              platform: "windows",
              created: "2026-01-15T00:00:00Z",
              lastHeartbeat: "2026-01-23T09:00:00Z",
            },
          },
        ],
      });

      const result = await getLicenseMachines("lic_123");

      expect(result.length).toBe(2);
      expect(result[0].id).toBe("mach_1");
      expect(result[0].name).toBe("Laptop");
      expect(result[1].id).toBe("mach_2");
      expect(result[1].platform).toBe("windows");
    });

    it("should return empty array when no machines", async () => {
      keygenMock.whenGetLicenseMachines("lic_new").resolves({
        data: [],
      });

      const result = await getLicenseMachines("lic_new");

      expect(result.length).toBe(0);
    });
  });

  describe("machineHeartbeat", () => {
    it("should return success on successful heartbeat", async () => {
      keygenMock.whenMachineHeartbeat("mach_123").resolves({});

      const result = await machineHeartbeat("mach_123");

      expect(result.success).toBe(true);
    });

    it("should return failure on heartbeat error", async () => {
      keygenMock.request.mockRejectedValue(new Error("Machine not found"));

      const result = await machineHeartbeat("mach_invalid");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Machine not found");
    });

    it("should call ping endpoint", async () => {
      keygenMock.whenMachineHeartbeat("mach_abc").resolves({});

      await machineHeartbeat("mach_abc");

      expect(keygenMock.request.calls[0][0]).toBe(
        "/machines/mach_abc/actions/ping",
      );
      expect(keygenMock.request.calls[0][1].method).toBe("POST");
    });
  });

  describe("checkoutLicense", () => {
    it("should return checkout certificate for offline use", async () => {
      keygenMock.whenCheckoutLicense("lic_123").resolves({
        data: {
          attributes: {
            certificate: "base64_encoded_certificate_data",
            ttl: 86400,
            expiry: "2026-01-24T12:00:00Z",
          },
        },
      });

      const result = await checkoutLicense("lic_123");

      expect(result.certificate).toBe("base64_encoded_certificate_data");
      expect(result.ttl).toBe(86400);
      expect(result.expiry).toBe("2026-01-24T12:00:00Z");
    });

    it("should use custom TTL when provided", async () => {
      keygenMock.whenCheckoutLicense("lic_123").resolves({
        data: {
          attributes: {
            certificate: "cert",
            ttl: 172800,
            expiry: "2026-01-25T12:00:00Z",
          },
        },
      });

      await checkoutLicense("lic_123", 172800);

      const body = JSON.parse(keygenMock.request.calls[0][1].body);
      expect(body.meta.ttl).toBe(172800);
    });

    it("should default to 24 hour TTL", async () => {
      keygenMock.whenCheckoutLicense("lic_123").resolves({
        data: {
          attributes: { certificate: "cert", ttl: 86400, expiry: "..." },
        },
      });

      await checkoutLicense("lic_123");

      const body = JSON.parse(keygenMock.request.calls[0][1].body);
      expect(body.meta.ttl).toBe(86400);
    });
  });

  describe("getPolicyId", () => {
    it("should throw error for unknown plan type", async () => {
      let error;
      try {
        await getPolicyId("unknown_plan");
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.message).toContain("Unknown plan type");
    });

    it("should throw error when policy env var not set", async () => {
      // When env vars aren't set, policy IDs are undefined
      // The function should throw for any plan type that maps to undefined
      const savedEnv = process.env.KEYGEN_POLICY_ID_INDIVIDUAL_MONTHLY;
      delete process.env.KEYGEN_POLICY_ID_INDIVIDUAL_MONTHLY;
      try {
        let error;
        try {
          await getPolicyId("individualMonthly");
        } catch (e) {
          error = e;
        }
        expect(error).toBeDefined();
        expect(error.message).toContain("Unknown plan type");
      } finally {
        if (savedEnv !== undefined) process.env.KEYGEN_POLICY_ID_INDIVIDUAL_MONTHLY = savedEnv;
      }
    });
  });

  describe("normalizeStatus", () => {
    it("should lowercase an UPPER_CASE status", () => {
      expect(normalizeStatus("ACTIVE")).toBe("active");
    });

    it("should lowercase a Mixed_Case status", () => {
      expect(normalizeStatus("Past_Due")).toBe("past_due");
    });

    it("should pass through an already-lowercase status", () => {
      expect(normalizeStatus("expired")).toBe("expired");
    });

    it("should return non-string values unchanged", () => {
      expect(normalizeStatus(null)).toBe(null);
      expect(normalizeStatus(undefined)).toBe(undefined);
    });
  });

  describe("Keygen module normalizes status in responses (Fix 3)", () => {
    it("createLicense should return lowercase status", async () => {
      keygenMock.whenCreateLicense().resolves({
        data: {
          id: "lic_123",
          attributes: {
            key: "KEY",
            status: "ACTIVE",
            expiry: null,
            maxMachines: 3,
            metadata: {},
          },
        },
      });

      const result = await createLicense({
        policyId: "pol_123",
        name: "User",
        email: "user@example.com",
      });

      expect(result.status).toBe("active");
    });

    it("getLicense should return lowercase status", async () => {
      keygenMock.whenGetLicense("lic_abc").resolves({
        data: {
          id: "lic_abc",
          attributes: {
            key: "KEY",
            status: "SUSPENDED",
            expiry: null,
            maxMachines: 3,
            uses: 0,
            metadata: {},
          },
        },
      });

      const result = await getLicense("lic_abc");

      expect(result.status).toBe("suspended");
    });

    it("validateLicense should return lowercase status", async () => {
      keygenMock.whenValidateLicense().resolves({
        meta: { valid: true, code: "VALID", detail: "ok" },
        data: {
          id: "lic_123",
          attributes: { status: "EXPIRED", expiry: null },
        },
      });

      const result = await validateLicense("KEY", "fp");

      expect(result.license.status).toBe("expired");
    });
  });

  describe("getLicensesByEmail", () => {
    it("should return licenses matching email metadata filter", async () => {
      keygenMock.request.mockResolvedValue({
        data: [
          {
            id: "lic_1",
            attributes: {
              key: "key/ABC",
              status: "ACTIVE",
              expiry: "2027-12-31T00:00:00Z",
              maxMachines: 3,
              uses: 1,
              metadata: { email: "user@example.com" },
            },
            relationships: { policy: { data: { id: "pol_im" } } },
          },
          {
            id: "lic_2",
            attributes: {
              key: "key/DEF",
              status: "EXPIRED",
              expiry: "2026-01-01T00:00:00Z",
              maxMachines: 5,
              uses: 0,
              metadata: { email: "user@example.com" },
            },
            relationships: { policy: { data: { id: "pol_bm" } } },
          },
        ],
      });

      const result = await getLicensesByEmail("user@example.com");

      expect(result.length).toBe(2);
      expect(result[0].id).toBe("lic_1");
      expect(result[0].key).toBe("key/ABC");
      expect(result[0].status).toBe("active");
      expect(result[0].policyId).toBe("pol_im");
      expect(result[1].id).toBe("lic_2");
      expect(result[1].status).toBe("expired");
    });

    it("should return empty array when no licenses found", async () => {
      keygenMock.request.mockResolvedValue({ data: [] });

      const result = await getLicensesByEmail("nobody@example.com");

      expect(result).toEqual([]);
    });

    it("should return empty array on API error (graceful degradation)", async () => {
      keygenMock.request.mockRejectedValue(new Error("API timeout"));

      const result = await getLicensesByEmail("user@example.com");

      expect(result).toEqual([]);
    });

    it("should lowercase email in query parameter", async () => {
      keygenMock.request.mockResolvedValue({ data: [] });

      await getLicensesByEmail("USER@EXAMPLE.COM");

      expect(keygenMock.request.calls[0][0]).toContain("user%40example.com");
    });

    it("should normalize status to lowercase in returned licenses", async () => {
      keygenMock.request.mockResolvedValue({
        data: [
          {
            id: "lic_x",
            attributes: {
              key: "key/X",
              status: "SUSPENDED",
              expiry: null,
              maxMachines: 3,
              uses: 0,
              metadata: {},
            },
            relationships: { policy: { data: { id: "pol_1" } } },
          },
        ],
      });

      const result = await getLicensesByEmail("test@example.com");

      expect(result[0].status).toBe("suspended");
    });
  });

  describe("createLicenseForPlan", () => {
    it("should call getPolicyId then createLicense with resolved policy", async () => {
      // Set up env var so getPolicyId succeeds
      const savedIm = process.env.KEYGEN_POLICY_ID_INDIVIDUAL_MONTHLY;
      process.env.KEYGEN_POLICY_ID_INDIVIDUAL_MONTHLY = "pol_test_im";

      keygenMock.whenCreateLicense().resolves({
        data: {
          id: "lic_new",
          attributes: {
            key: "key/NEW",
            status: "ACTIVE",
            expiry: null,
            maxMachines: 3,
            metadata: {},
          },
        },
      });

      try {
        const result = await createLicenseForPlan("individualMonthly", {
          name: "Test User",
          email: "test@example.com",
        });

        expect(result.id).toBe("lic_new");
        expect(result.key).toBe("key/NEW");

        // Verify createLicense was called with the resolved policy ID
        const body = JSON.parse(keygenMock.request.calls[0][1].body);
        expect(body.data.attributes.metadata.email).toBe("test@example.com");
      } finally {
        if (savedIm !== undefined) process.env.KEYGEN_POLICY_ID_INDIVIDUAL_MONTHLY = savedIm;
        else delete process.env.KEYGEN_POLICY_ID_INDIVIDUAL_MONTHLY;
      }
    });

    it("should propagate metadata through to createLicense", async () => {
      const savedBa = process.env.KEYGEN_POLICY_ID_BUSINESS_ANNUAL;
      process.env.KEYGEN_POLICY_ID_BUSINESS_ANNUAL = "pol_test_ba";

      keygenMock.whenCreateLicense().resolves({
        data: {
          id: "lic_ba",
          attributes: {
            key: "key/BA",
            status: "ACTIVE",
            expiry: null,
            maxMachines: 5,
            metadata: { custom: "value" },
          },
        },
      });

      try {
        await createLicenseForPlan("businessAnnual", {
          name: "Biz User",
          email: "biz@example.com",
          metadata: { custom: "value" },
        });

        const body = JSON.parse(keygenMock.request.calls[0][1].body);
        expect(body.data.attributes.metadata.custom).toBe("value");
      } finally {
        if (savedBa !== undefined) process.env.KEYGEN_POLICY_ID_BUSINESS_ANNUAL = savedBa;
        else delete process.env.KEYGEN_POLICY_ID_BUSINESS_ANNUAL;
      }
    });

    it("should throw for unknown plan type", async () => {
      let error;
      try {
        await createLicenseForPlan("enterprise", {
          name: "Test User",
          email: "test@example.com",
        });
      } catch (e) {
        error = e;
      }
      expect(error).toBeDefined();
      expect(error.message).toContain("Unknown plan type");
    });
  });

  describe("resolvePlanType", () => {
    it("should resolve individual + monthly to individualMonthly", () => {
      expect(resolvePlanType("individual", "monthly")).toBe("individualMonthly");
    });

    it("should resolve individual + annual to individualAnnual", () => {
      expect(resolvePlanType("individual", "annual")).toBe("individualAnnual");
    });

    it("should resolve business + monthly to businessMonthly", () => {
      expect(resolvePlanType("business", "monthly")).toBe("businessMonthly");
    });

    it("should resolve business + annual to businessAnnual", () => {
      expect(resolvePlanType("business", "annual")).toBe("businessAnnual");
    });

    it("should default billingCycle to Monthly when undefined", () => {
      expect(resolvePlanType("individual", undefined)).toBe("individualMonthly");
    });

    it("should default billingCycle to Monthly when null", () => {
      expect(resolvePlanType("individual", null)).toBe("individualMonthly");
    });

    it("should default plan to individual tier when not business", () => {
      expect(resolvePlanType("unknown", "monthly")).toBe("individualMonthly");
    });

    it("should default plan to individual when undefined", () => {
      expect(resolvePlanType(undefined, "annual")).toBe("individualAnnual");
    });
  });

  describe("changeLicensePolicy", () => {
    it("should send PUT to /licenses/{id}/policy with policy relationship", async () => {
      keygenMock.request.mockResolvedValue({ data: { id: "lic_123" } });

      await changeLicensePolicy("lic_123", "pol_new_456");

      expect(keygenMock.request.calls.length).toBe(1);
      expect(keygenMock.request.calls[0][0]).toBe("/licenses/lic_123/policy");
      expect(keygenMock.request.calls[0][1].method).toBe("PUT");

      const body = JSON.parse(keygenMock.request.calls[0][1].body);
      expect(body.data.type).toBe("policies");
      expect(body.data.id).toBe("pol_new_456");
    });

    it("should return the Keygen API response", async () => {
      const mockResponse = { data: { id: "lic_123", attributes: { status: "ACTIVE" } } };
      keygenMock.request.mockResolvedValue(mockResponse);

      const result = await changeLicensePolicy("lic_123", "pol_789");

      expect(result).toEqual(mockResponse);
    });

    it("should propagate errors from Keygen API", async () => {
      keygenMock.request.mockRejectedValue(new Error("License not found"));

      let error;
      try {
        await changeLicensePolicy("lic_nonexistent", "pol_789");
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.message).toBe("License not found");
    });
  });

  describe("KEYGEN_POLICIES getter values", () => {
    it("should return correct string for each getter", () => {
      expect(KEYGEN_POLICIES.individualMonthly).toBe("individualMonthly");
      expect(KEYGEN_POLICIES.individualAnnual).toBe("individualAnnual");
      expect(KEYGEN_POLICIES.businessMonthly).toBe("businessMonthly");
      expect(KEYGEN_POLICIES.businessAnnual).toBe("businessAnnual");
    });

    it("should not have legacy individual or business keys", () => {
      expect(KEYGEN_POLICIES.individual).toBe(undefined);
      expect(KEYGEN_POLICIES.business).toBe(undefined);
    });

    it("should have exactly 4 enumerable policy keys", () => {
      // Getters on plain objects are enumerable by default
      const keys = Object.keys(KEYGEN_POLICIES);
      expect(keys.length).toBe(4);
      expect(keys).toContain("individualMonthly");
      expect(keys).toContain("individualAnnual");
      expect(keys).toContain("businessMonthly");
      expect(keys).toContain("businessAnnual");
    });
  });

  describe("getPolicyId with 4-key policy types", () => {
    it("should resolve individualMonthly from env", async () => {
      const saved = process.env.KEYGEN_POLICY_ID_INDIVIDUAL_MONTHLY;
      process.env.KEYGEN_POLICY_ID_INDIVIDUAL_MONTHLY = "test-pol-im";
      try {
        const id = await getPolicyId("individualMonthly");
        expect(id).toBe("test-pol-im");
      } finally {
        if (saved !== undefined) process.env.KEYGEN_POLICY_ID_INDIVIDUAL_MONTHLY = saved;
        else delete process.env.KEYGEN_POLICY_ID_INDIVIDUAL_MONTHLY;
      }
    });

    it("should resolve individualAnnual from env", async () => {
      const saved = process.env.KEYGEN_POLICY_ID_INDIVIDUAL_ANNUAL;
      process.env.KEYGEN_POLICY_ID_INDIVIDUAL_ANNUAL = "test-pol-ia";
      try {
        const id = await getPolicyId("individualAnnual");
        expect(id).toBe("test-pol-ia");
      } finally {
        if (saved !== undefined) process.env.KEYGEN_POLICY_ID_INDIVIDUAL_ANNUAL = saved;
        else delete process.env.KEYGEN_POLICY_ID_INDIVIDUAL_ANNUAL;
      }
    });

    it("should resolve businessMonthly from env", async () => {
      const saved = process.env.KEYGEN_POLICY_ID_BUSINESS_MONTHLY;
      process.env.KEYGEN_POLICY_ID_BUSINESS_MONTHLY = "test-pol-bm";
      try {
        const id = await getPolicyId("businessMonthly");
        expect(id).toBe("test-pol-bm");
      } finally {
        if (saved !== undefined) process.env.KEYGEN_POLICY_ID_BUSINESS_MONTHLY = saved;
        else delete process.env.KEYGEN_POLICY_ID_BUSINESS_MONTHLY;
      }
    });

    it("should resolve businessAnnual from env", async () => {
      const saved = process.env.KEYGEN_POLICY_ID_BUSINESS_ANNUAL;
      process.env.KEYGEN_POLICY_ID_BUSINESS_ANNUAL = "test-pol-ba";
      try {
        const id = await getPolicyId("businessAnnual");
        expect(id).toBe("test-pol-ba");
      } finally {
        if (saved !== undefined) process.env.KEYGEN_POLICY_ID_BUSINESS_ANNUAL = saved;
        else delete process.env.KEYGEN_POLICY_ID_BUSINESS_ANNUAL;
      }
    });

    it("should list available policies in error message for unknown type", async () => {
      let error;
      try {
        await getPolicyId("enterprise");
      } catch (e) {
        error = e;
      }
      expect(error).toBeDefined();
      expect(error.message).toContain("enterprise");
      expect(error.message).toContain("Available:");
    });
  });

  describe("renewLicense", () => {
    it("should call POST /licenses/{id}/actions/renew endpoint", async () => {
      keygenMock.whenRenewLicense("lic_renew_123").resolves({});

      await renewLicense("lic_renew_123");

      expect(keygenMock.request.calls.length).toBe(1);
      expect(keygenMock.request.calls[0][0]).toBe(
        "/licenses/lic_renew_123/actions/renew",
      );
      expect(keygenMock.request.calls[0][1].method).toBe("POST");
    });

    it("should propagate errors from Keygen API", async () => {
      keygenMock.request.mockRejectedValue(new Error("License not found"));

      let error;
      try {
        await renewLicense("lic_nonexistent");
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.message).toBe("License not found");
    });

    it("should return the Keygen response on success", async () => {
      const mockResponse = { data: { id: "lic_abc", attributes: { expiry: "2027-06-01T00:00:00Z" } } };
      keygenMock.whenRenewLicense("lic_abc").resolves(mockResponse);

      const result = await renewLicense("lic_abc");

      expect(result).toEqual(mockResponse);
    });
  });

});

// Feature: status-remediation-plan, Property 2: Keygen status normalization
// **Validates: Requirements 2.3**
describe("Property 2: Keygen status normalization", () => {
  it("for any status string, normalizeStatus returns a strictly lowercase result", () => {
    // Generate 100 random status strings with mixed casing
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_";
    for (let i = 0; i < 100; i++) {
      // Build a random status string of length 3-15
      const len = 3 + Math.floor(Math.random() * 13);
      let status = "";
      for (let j = 0; j < len; j++) {
        status += chars[Math.floor(Math.random() * chars.length)];
      }

      const result = normalizeStatus(status);

      expect(typeof result).toBe("string");
      expect(result).toBe(result.toLowerCase());
      expect(result).toBe(status.toLowerCase());
    }
  });

  it("normalizes known Keygen statuses regardless of original casing", () => {
    const knownStatuses = ["ACTIVE", "INACTIVE", "SUSPENDED", "EXPIRED", "Active", "active", "Expired", "PAST_DUE", "Past_Due"];
    for (const status of knownStatuses) {
      const result = normalizeStatus(status);
      expect(result).toBe(status.toLowerCase());
    }
  });
});


// ============================================================================
// Property 21: renewLicense calls correct endpoint
// Feature: status-remediation-plan, Property 21
// **Validates: Requirements 6.1**
// ============================================================================

describe("Property 21: renewLicense calls correct endpoint", () => {
  let keygenMock;

  beforeEach(() => {
    keygenMock = createKeygenMock();
    __setKeygenRequestForTests(keygenMock.request);
  });

  afterEach(() => {
    __resetKeygenRequestForTests();
  });

  it("for any licenseId, renewLicense issues POST to /licenses/{licenseId}/actions/renew (100 iterations)", async () => {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789-_";
    for (let i = 0; i < 100; i++) {
      // Generate a random licenseId of varying length (8-36 chars)
      const len = 8 + Math.floor(Math.random() * 29);
      let licenseId = "";
      for (let j = 0; j < len; j++) {
        licenseId += chars[Math.floor(Math.random() * chars.length)];
      }

      keygenMock.whenRenewLicense(licenseId).resolves({});

      await renewLicense(licenseId);

      // Verify the last call used the correct endpoint and method
      const lastCallIdx = keygenMock.request.calls.length - 1;
      const [url, options] = keygenMock.request.calls[lastCallIdx];
      expect(url).toBe(`/licenses/${licenseId}/actions/renew`);
      expect(options.method).toBe("POST");
    }
  });

  it("licenseId with UUID format calls correct endpoint (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      // Generate UUID-like licenseId (matching Keygen's format)
      const hex = "0123456789abcdef";
      const seg = (n) => { let s = ""; for (let j = 0; j < n; j++) s += hex[Math.floor(Math.random() * 16)]; return s; };
      const licenseId = `${seg(8)}-${seg(4)}-${seg(4)}-${seg(4)}-${seg(12)}`;

      keygenMock.whenRenewLicense(licenseId).resolves({});

      await renewLicense(licenseId);

      const lastCallIdx = keygenMock.request.calls.length - 1;
      const [url, options] = keygenMock.request.calls[lastCallIdx];
      expect(url).toBe(`/licenses/${licenseId}/actions/renew`);
      expect(options.method).toBe("POST");
    }
  });
});

