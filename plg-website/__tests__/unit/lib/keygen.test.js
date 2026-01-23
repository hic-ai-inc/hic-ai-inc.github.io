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
    it("should have individual policy from env", () => {
      expect(KEYGEN_POLICIES).toHaveProperty("individual");
    });

    it("should have enterprise policy from env", () => {
      expect(KEYGEN_POLICIES).toHaveProperty("enterprise");
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
      expect(result.status).toBe("ACTIVE");
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
      expect(result.status).toBe("ACTIVE");
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
      expect(result.license.status).toBe("ACTIVE");
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
    it("should throw error for unknown plan type", () => {
      let error;
      try {
        getPolicyId("unknown_plan");
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.message).toContain("Unknown plan type");
    });

    it("should throw error when policy env var not set", () => {
      // When env vars aren't set, KEYGEN_POLICIES values are undefined
      // The function should throw for any plan type that maps to undefined
      if (!KEYGEN_POLICIES.individual) {
        let error;
        try {
          getPolicyId("individual");
        } catch (e) {
          error = e;
        }
        // When env var is not set, the policy is undefined, which causes "Unknown plan type"
        expect(error).toBeDefined();
      }
    });
  });

  describe("createLicenseForPlan", () => {
    it("should throw when policy not configured", async () => {
      // When env vars aren't set, createLicenseForPlan will fail at getPolicyId
      if (!KEYGEN_POLICIES.individual) {
        let error;
        try {
          await createLicenseForPlan("individual", {
            name: "Test User",
            email: "test@example.com",
          });
        } catch (e) {
          error = e;
        }
        expect(error).toBeDefined();
        expect(error.message).toContain("Unknown plan type");
      }
    });
  });
});
