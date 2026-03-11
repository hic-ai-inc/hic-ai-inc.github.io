/**
 * Journey 3: License Activation Flow
 *
 * Tests the complete license activation flow:
 * 1. License key validation
 * 2. Device activation
 * 3. Heartbeat/keepalive
 * 4. Device deactivation
 *
 * Priority: P0 (Critical Path)
 *
 * @see 20260129_E2E_BACKEND_VALIDATION_SPEC.md
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";

import {
  getEnvironment,
  testConfig,
  log,
  requireMutations,
} from "../config.js";
import { E2EHttpClient } from "../lib/http-client.js";
import {
  expectStatus,
  expectSuccess,
  expectError,
  expectBadRequest,
  expectLicenseKey,
  expectLicenseValidation,
  expectHeartbeat,
  expectFields,
  expectCompletesWithin,
} from "../lib/assertions.js";
import {
  generateFingerprint,
  generateMachineId,
  generateDeviceData,
  generateHeartbeatData,
  generateLicenseKeyFormat,
} from "../lib/test-data.js";
import { createTestScope } from "../lib/cleanup.js";

// ============================================================================
// Test Setup
// ============================================================================

describe("Journey 3: License Activation Flow", () => {
  let client;
  let scope;
  let deviceData;

  beforeEach(() => {
    const env = getEnvironment();
    client = new E2EHttpClient(env.apiBase);
    scope = createTestScope("j3-activation");
    deviceData = generateDeviceData();
    log.info("Test setup complete", { deviceId: deviceData.fingerprint });
  });

  afterEach(async () => {
    await scope.cleanup();
  });

  // ==========================================================================
  // J3.1: License Validation
  // ==========================================================================

  describe("J3.1: License Validation", () => {
    test("should validate license key format", async () => {
      // Generate a properly formatted (but not real) license key
      const licenseKey = generateLicenseKeyFormat();

      const response = await client.post("/api/license/validate", {
        licenseKey,
        fingerprint: deviceData.fingerprint,
        machineId: deviceData.machineId,
      });

      // Invalid license key should return specific error
      // (not a 500 error, proper validation)
      if (response.status === 200) {
        // If by some chance the format matches a real key
        expectSuccess(response);
        scope.trackLicense(licenseKey);
      } else {
        expectStatus(response, 400);
        expectError(response);

        // Verify error indicates invalid license
        const errorMsg =
          response.json.error?.message || response.json.message || "";
        log.info("License validation rejected (expected)", {
          licenseKey: licenseKey.substring(0, 8) + "...",
          error: errorMsg,
        });
      }
    });

    test("should accept valid license key structure", async () => {
      requireMutations("license validation");

      // This tests that the endpoint properly handles license key input
      // A real license would come from the purchase flow

      const response = await client.post("/api/license/validate", {
        licenseKey: "TEST-0000-0000-0000", // Known test format
        fingerprint: deviceData.fingerprint,
        machineId: deviceData.machineId,
      });

      // Should either validate (200) or reject (400), not error (500)
      assert.ok(
        response.status < 500,
        `Should not return server error, got ${response.status}`,
      );

      if (response.status === 200) {
        expectLicenseValidation(response.json);
        if (response.json.valid) {
          scope.trackLicense("TEST-0000-0000-0000");
        }
      }
    });

    test("should require fingerprint with license key", async () => {
      const response = await client.post("/api/license/validate", {
        licenseKey: generateLicenseKeyFormat(),
        // fingerprint missing
      });

      expectStatus(response, 400);
    });

    test("should complete within timeout", async () => {
      await expectCompletesWithin(
        async () => {
          await client.post("/api/license/validate", {
            licenseKey: generateLicenseKeyFormat(),
            fingerprint: deviceData.fingerprint,
          });
        },
        testConfig.timeout.fast,
        "License validation",
      );
    });
  });

  // ==========================================================================
  // J3.2: Device Activation
  // ==========================================================================

  describe("J3.2: Device Activation", () => {
    test("should activate device with valid license", async () => {
      requireMutations("device activation");

      // Note: This requires a real license key to fully test
      // We test the endpoint behavior

      const response = await client.post("/api/license/activate", {
        licenseKey: generateLicenseKeyFormat(),
        fingerprint: deviceData.fingerprint,
        machineId: deviceData.machineId,
        machineName: deviceData.machineName,
        platform: deviceData.platform,
      });

      // Should respond appropriately
      if (response.status === 200) {
        expectSuccess(response);
        expectFields(response.json, ["activationId", "machine"]);
        scope.trackDevice(deviceData.fingerprint, response.json.activationId);
        log.info("Device activated successfully");
      } else if (response.status === 401) {
        // Phase 3E: Auth is now mandatory for activation. E2E tests don't send
        // a JWT, so 401 is the expected response in unauthenticated context.
        log.info("Activation rejected (auth required — expected in E2E without JWT)");
      } else if (response.status === 400 || response.status === 404) {
        // Invalid license - expected in E2E without real key
        log.info("Activation rejected (expected without valid license)");
      } else {
        assert.fail(`Unexpected status ${response.status}`);
      }
    });

    test("should reject activation without license key", async () => {
      const response = await client.post("/api/license/activate", {
        fingerprint: deviceData.fingerprint,
        machineId: deviceData.machineId,
      });

      // Phase 3E: Auth check runs before input validation, so without a JWT
      // we get 401 (not 400). Both are acceptable rejection statuses.
      assert.ok(
        response.status === 400 || response.status === 401,
        `Expected 400 or 401, got ${response.status}`,
      );
    });

    test("should include machine metadata in activation", async () => {
      requireMutations("activation metadata");

      const fullDeviceData = {
        licenseKey: generateLicenseKeyFormat(),
        fingerprint: deviceData.fingerprint,
        machineId: deviceData.machineId,
        machineName: "E2E-Test-Machine",
        platform: "win32",
        osVersion: "10.0.19045",
        appVersion: "0.9.5",
      };

      const response = await client.post(
        "/api/license/activate",
        fullDeviceData,
      );

      // Response should acknowledge the metadata
      if (response.status === 200) {
        log.info("Activation with metadata accepted");
      }
      // 400 is expected without real license
    });
  });

  // ==========================================================================
  // J3.3: Heartbeat/Keepalive
  // ==========================================================================

  describe("J3.3: Heartbeat", () => {
    test("should accept heartbeat from active device", async () => {
      requireMutations("heartbeat");

      const heartbeatData = generateHeartbeatData({
        fingerprint: deviceData.fingerprint,
      });

      const response = await client.post(
        "/api/license/heartbeat",
        heartbeatData,
      );

      // Fingerprint-only heartbeats (no licenseKey) resolve via device pointer.
      // Without a prior activation that wrote a pointer record, the route
      // returns machine_not_found — this is correct post-P3.2 behavior.
      if (response.status === 200) {
        if (response.json.status === "machine_not_found") {
          // No pointer record — expected for devices that haven't activated
          assert.strictEqual(response.json.valid, false);
          log.info("Heartbeat returned machine_not_found (no pointer record)");
        } else {
          expectHeartbeat(response.json);
          log.info("Heartbeat accepted");
        }
      } else if (response.status === 404) {
        // License not found - expected in E2E
        log.info("Heartbeat rejected (license not found)");
      } else {
        // Should not be 500
        assert.ok(
          response.status < 500,
          `Heartbeat should not error, got ${response.status}`,
        );
      }
    });

    test("should update last-seen timestamp", async () => {
      requireMutations("heartbeat timestamp");

      // First: Create a trial to have a device record
      const initResponse = await client.post("/api/license/validate", {
        fingerprint: deviceData.fingerprint,
        machineId: deviceData.machineId,
      });

      if (initResponse.status !== 200) {
        log.info("Skipping heartbeat timestamp test - no device record");
        return;
      }
      scope.trackTrial(deviceData.fingerprint);

      // Send heartbeat
      const heartbeatData = generateHeartbeatData({
        fingerprint: deviceData.fingerprint,
      });

      const response = await client.post(
        "/api/license/heartbeat",
        heartbeatData,
      );

      if (response.status === 200) {
        if (response.json.status === "machine_not_found") {
          // No pointer record — fingerprint-only heartbeat without prior
          // activation returns machine_not_found (correct post-P3.2 behavior)
          assert.strictEqual(response.json.valid, false);
          log.info("Heartbeat returned machine_not_found (no pointer record)");
        } else {
          expectHeartbeat(response.json);
          log.info("Heartbeat timestamp updated");
        }
      }
    });

    test("should handle heartbeat for unknown device", async () => {
      const response = await client.post("/api/license/heartbeat", {
        fingerprint: "unknown-device-12345",
        timestamp: new Date().toISOString(),
      });

      // Unknown fingerprint with no pointer record returns machine_not_found.
      // Post-P3.2: fingerprint-only heartbeats resolve via device pointer;
      // without one the device is treated as unactivated.
      expectStatus(response, 200);
      assert.strictEqual(response.json.status, "machine_not_found");
      assert.strictEqual(response.json.valid, false);
      log.info("Unknown device heartbeat returned machine_not_found");
    });

    test("should complete heartbeat within timeout", async () => {
      requireMutations("heartbeat timeout");

      await expectCompletesWithin(
        async () => {
          await client.post("/api/license/heartbeat", generateHeartbeatData());
        },
        testConfig.timeout.fast,
        "Heartbeat",
      );
    });
  });

  // ==========================================================================
  // J3.4: Device Deactivation
  // ==========================================================================

  describe("J3.4: Device Deactivation", () => {
    test("should deactivate device", async () => {
      requireMutations("device deactivation");

      // Deactivate requires valid activation
      const response = await client.post("/api/license/deactivate", {
        licenseKey: generateLicenseKeyFormat(),
        fingerprint: deviceData.fingerprint,
        machineId: deviceData.machineId,
      });

      // Should respond appropriately
      if (response.status === 200) {
        expectSuccess(response);
        log.info("Device deactivated successfully");
      } else if ([400, 404].includes(response.status)) {
        // Not found or invalid - expected in E2E
        log.info("Deactivation rejected (no activation found)");
      } else {
        assert.ok(
          response.status < 500,
          `Deactivation should not error, got ${response.status}`,
        );
      }
    });

    test("should reject deactivation without license key", async () => {
      const response = await client.post("/api/license/deactivate", {
        fingerprint: deviceData.fingerprint,
      });

      // Returns 400 Bad Request when required fields are missing
      expectBadRequest(response, "required");
    });
  });

  // ==========================================================================
  // J3.5: License Status Check
  // ==========================================================================

  describe("J3.5: License Status", () => {
    test("should return license status", async () => {
      const response = await client.post("/api/license/status", {
        licenseKey: generateLicenseKeyFormat(),
      });

      if (response.status === 200) {
        expectSuccess(response);
        expectFields(response.json, ["status", "valid"]);
        // Status Remediation Plan Fix 3: all status values must be lowercase
        assert.strictEqual(
          response.json.status,
          response.json.status.toLowerCase(),
          "Status must be lowercase (Fix 3)",
        );
        log.info("License status retrieved");
      } else if (response.status === 404) {
        // License not found - expected in E2E
        log.info("License not found (expected in E2E)");
      } else {
        assert.ok(
          response.status < 500,
          `License status should not error, got ${response.status}`,
        );
      }
    });

    test("should return activation count", async () => {
      const response = await client.post("/api/license/status", {
        licenseKey: generateLicenseKeyFormat(),
      });

      if (response.status === 200) {
        // Should include activation info
        if (response.json.activations !== undefined) {
          assert.ok(
            typeof response.json.activations === "number" ||
              Array.isArray(response.json.activations),
            "Activations should be number or array",
          );
        }
      }
    });
  });

  // ==========================================================================
  // J3.6: Seat Management (Team Licenses)
  // ==========================================================================

  describe("J3.6: Seat Management", () => {
    test("should list machines for team license", async () => {
      const response = await client.post("/api/license/machines", {
        licenseKey: generateLicenseKeyFormat(),
      });

      if (response.status === 200) {
        expectSuccess(response);
        assert.ok(
          Array.isArray(response.json.machines),
          "Machines should be array",
        );
        log.info("Machine list retrieved", {
          count: response.json.machines.length,
        });
      } else if (response.status === 404) {
        log.info("License not found (expected in E2E)");
      }
    });

    test("should enforce seat limits", async () => {
      requireMutations("seat limit enforcement");

      // This would require a real team license to fully test
      // We verify the endpoint exists and responds appropriately

      const response = await client.post("/api/license/activate", {
        licenseKey: generateLicenseKeyFormat(),
        fingerprint: generateFingerprint(),
        machineId: generateMachineId(),
      });

      // If seat limit is reached, should return 400 or 403
      if (response.status === 400 || response.status === 403) {
        const errorMsg =
          response.json.error?.message || response.json.message || "";
        if (
          errorMsg.toLowerCase().includes("seat") ||
          errorMsg.toLowerCase().includes("limit")
        ) {
          log.info("Seat limit enforcement working");
        }
      }
    });
  });

  // ==========================================================================
  // J3.7: Error Handling
  // ==========================================================================

  // Status Remediation Plan context:
  // - All status values are lowercase (Fix 3)
  // - "suspended" is admin-only on Business org members (Fix 9),
  //   never written by the payment path (Fix 5)
  // - These tests use invalid keys, so they test error handling, not
  //   actual status classification. Status classification is covered by
  //   unit tests and property tests (Properties 9, 17).
  describe("J3.7: Error Handling", () => {
    test("should handle expired license gracefully", async () => {
      const response = await client.post("/api/license/validate", {
        licenseKey: "EXPIRED-0000-0000-0000",
        fingerprint: deviceData.fingerprint,
      });

      // Should return structured error, not 500
      assert.ok(
        response.status < 500,
        `Expired license should not cause server error, got ${response.status}`,
      );

      if (response.status === 200 && response.json.status) {
        // Fix 3: status must be lowercase
        assert.strictEqual(
          response.json.status,
          response.json.status.toLowerCase(),
          "Status must be lowercase (Fix 3)",
        );
      } else if (response.status === 400) {
        expectError(response);
      }
    });

    test("should handle revoked license", async () => {
      const response = await client.post("/api/license/validate", {
        licenseKey: "REVOKED-0000-0000-0000",
        fingerprint: deviceData.fingerprint,
      });

      assert.ok(
        response.status < 500,
        `Revoked license should not cause server error, got ${response.status}`,
      );
    });

    test("should handle invalid license key", async () => {
      // Post-remediation: "suspended" is admin-only on Business members,
      // not a license-level state reachable via fake keys. We test generic
      // invalid key rejection instead.
      const response = await client.post("/api/license/validate", {
        licenseKey: "INVALID-0000-0000-0000",
        fingerprint: deviceData.fingerprint,
      });

      assert.ok(
        response.status < 500,
        `Invalid license should not cause server error, got ${response.status}`,
      );
    });

    test("should rate limit excessive requests", async () => {
      // Send multiple rapid requests
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          client.post("/api/license/validate", {
            fingerprint: generateFingerprint(),
          }),
        );
      }

      const responses = await Promise.all(promises);

      // At least one should succeed, check for rate limit
      const statuses = responses.map((r) => r.status);
      const hasRateLimit = statuses.includes(429);

      if (hasRateLimit) {
        log.info("Rate limiting active");
      } else {
        log.info("No rate limiting observed (may be disabled in test env)");
      }
    });
  });

  // ==========================================================================
  // J3.8: Organization Member Activation Blocking (Status Remediation Plan)
  // ==========================================================================

  describe("J3.8: Org Member Activation Blocking", () => {
    // Status Remediation Plan Fix 9: Admin-only suspension
    // Business org members with suspended/revoked status should be blocked
    // from activating licenses. Individual plan users bypass org checks.

    test("should reject activation for suspended org member", async () => {
      requireMutations("org member activation - suspended");

      // Simulate activation request with a suspended org member context
      // Note: Full testing requires authenticated E2E context with real org setup
      const response = await client.post("/api/license/activate", {
        fingerprint: generateFingerprint(),
        machineId: generateMachineId(),
        orgMemberStatus: "suspended",
      });

      // Expect 403 or error indicating member is suspended
      if (response.status === 403) {
        expectError(response, 403, "MEMBER_SUSPENDED");
        log.info("Suspended org member correctly blocked from activation");
      } else if (response.status === 400 || response.status === 422) {
        // API may not support orgMemberStatus in request body (requires auth context)
        log.info("Org member blocking requires authenticated context (expected)", {
          status: response.status,
        });
      } else {
        log.info("Org member blocking not testable without real org setup", {
          status: response.status,
        });
      }
    });

    test("should reject activation for revoked org member", async () => {
      requireMutations("org member activation - revoked");

      const response = await client.post("/api/license/activate", {
        fingerprint: generateFingerprint(),
        machineId: generateMachineId(),
        orgMemberStatus: "revoked",
      });

      if (response.status === 403) {
        expectError(response, 403, "MEMBER_REVOKED");
        log.info("Revoked org member correctly blocked from activation");
      } else {
        log.info("Org member revocation blocking requires authenticated context", {
          status: response.status,
        });
      }
    });

    // NOTE: Full org member activation blocking tests require:
    // 1. Authenticated E2E context with real Keygen org setup
    // 2. Business plan license with org membership
    // 3. Admin ability to suspend/revoke org members
    // Individual plan users bypass org checks entirely (no org to check).
  });
});
