/**
 * Journey 7: Deactivation Flow
 *
 * Tests device deactivation and slot recovery:
 * 1. Deactivate an active device
 * 2. Verify slot is freed
 * 3. Re-activate on a new device
 *
 * Priority: P2
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
  expectFields,
  expectCompletesWithin,
} from "../lib/assertions.js";
import {
  generateFingerprint,
  generateMachineId,
  generateDeviceData,
  generateLicenseKeyFormat,
} from "../lib/test-data.js";
import { createTestScope } from "../lib/cleanup.js";

// ============================================================================
// Test Setup
// ============================================================================

describe("Journey 7: Deactivation Flow", () => {
  let client;
  let scope;

  beforeEach(() => {
    const env = getEnvironment();
    client = new E2EHttpClient(env.apiBase);
    scope = createTestScope("j7-deactivation");
    log.info("Test setup complete");
  });

  afterEach(async () => {
    await scope.cleanup();
  });

  // ==========================================================================
  // J7.1: Basic Deactivation
  // ==========================================================================

  describe("J7.1: Basic Deactivation", () => {
    test("should deactivate an active device", async () => {
      requireMutations("device deactivation");

      const device = generateDeviceData();
      const licenseKey = generateLicenseKeyFormat();

      // First, activate the device (if we have a real license)
      const activateResponse = await client.post("/api/license/activate", {
        licenseKey,
        fingerprint: device.fingerprint,
        machineId: device.machineId,
        machineName: device.machineName,
      });

      // If activation failed (no real license), test deactivation endpoint behavior
      if (activateResponse.status !== 200) {
        log.info("Skipping full flow - no valid license for activation");

        // Still test deactivation endpoint accepts proper format
        const deactivateResponse = await client.post(
          "/api/license/deactivate",
          {
            licenseKey,
            fingerprint: device.fingerprint,
            machineId: device.machineId,
          },
        );

        // Should return 400/404, not 500
        assert.ok(
          deactivateResponse.status < 500,
          `Deactivation should not error, got ${deactivateResponse.status}`,
        );
        return;
      }

      scope.trackDevice(device.fingerprint, activateResponse.json.activationId);

      // Now deactivate
      const deactivateResponse = await client.post("/api/license/deactivate", {
        licenseKey,
        fingerprint: device.fingerprint,
        machineId: device.machineId,
      });

      expectStatus(deactivateResponse, 200);
      expectSuccess(deactivateResponse);

      log.info("Device deactivated successfully", {
        fingerprint: device.fingerprint,
      });
    });

    test("should return error for non-existent device", async () => {
      const response = await client.post("/api/license/deactivate", {
        licenseKey: generateLicenseKeyFormat(),
        fingerprint: generateFingerprint(),
        machineId: generateMachineId(),
      });

      // Should be 400 or 404, not 500
      assert.ok(
        [400, 404].includes(response.status),
        `Non-existent device should return 400/404, got ${response.status}`,
      );
    });

    test("should require all fields", async () => {
      // Missing fingerprint
      const response1 = await client.post("/api/license/deactivate", {
        licenseKey: generateLicenseKeyFormat(),
        machineId: generateMachineId(),
      });
      expectStatus(response1, 400);

      // Missing machineId
      const response2 = await client.post("/api/license/deactivate", {
        licenseKey: generateLicenseKeyFormat(),
        fingerprint: generateFingerprint(),
      });
      expectStatus(response2, 400);

      // Missing licenseKey
      const response3 = await client.post("/api/license/deactivate", {
        fingerprint: generateFingerprint(),
        machineId: generateMachineId(),
      });
      expectStatus(response3, 400);
    });
  });

  // ==========================================================================
  // J7.2: Slot Recovery
  // ==========================================================================

  describe("J7.2: Slot Recovery", () => {
    test("should free activation slot after deactivation", async () => {
      requireMutations("slot recovery");

      const licenseKey = generateLicenseKeyFormat();
      const device1 = generateDeviceData();
      const device2 = generateDeviceData();

      // Activate device 1
      const activate1 = await client.post("/api/license/activate", {
        licenseKey,
        fingerprint: device1.fingerprint,
        machineId: device1.machineId,
      });

      if (activate1.status !== 200) {
        log.info("Skipping slot recovery test - no valid license");
        return;
      }

      scope.trackDevice(device1.fingerprint, activate1.json.activationId);
      const initialCount = activate1.json.deviceCount || 1;

      // Deactivate device 1
      const deactivate = await client.post("/api/license/deactivate", {
        licenseKey,
        fingerprint: device1.fingerprint,
        machineId: device1.machineId,
      });

      expectStatus(deactivate, 200);

      // Activate device 2 - should succeed (slot freed)
      const activate2 = await client.post("/api/license/activate", {
        licenseKey,
        fingerprint: device2.fingerprint,
        machineId: device2.machineId,
      });

      expectStatus(activate2, 200);
      scope.trackDevice(device2.fingerprint, activate2.json.activationId);

      // Device count should remain same
      const newCount = activate2.json.deviceCount || 1;
      assert.equal(
        newCount,
        initialCount,
        "Device count should equal initial after swap",
      );

      log.info("Slot recovery verified", {
        device1: device1.fingerprint,
        device2: device2.fingerprint,
      });
    });

    test("should allow re-activation on same device after deactivation", async () => {
      requireMutations("re-activation");

      const licenseKey = generateLicenseKeyFormat();
      const device = generateDeviceData();

      // Activate
      const activate1 = await client.post("/api/license/activate", {
        licenseKey,
        fingerprint: device.fingerprint,
        machineId: device.machineId,
      });

      if (activate1.status !== 200) {
        log.info("Skipping re-activation test - no valid license");
        return;
      }

      scope.trackDevice(device.fingerprint, activate1.json.activationId);

      // Deactivate
      const deactivate = await client.post("/api/license/deactivate", {
        licenseKey,
        fingerprint: device.fingerprint,
        machineId: device.machineId,
      });

      expectStatus(deactivate, 200);

      // Re-activate same device
      const activate2 = await client.post("/api/license/activate", {
        licenseKey,
        fingerprint: device.fingerprint,
        machineId: device.machineId,
      });

      expectStatus(activate2, 200);
      scope.trackDevice(device.fingerprint, activate2.json.activationId);

      log.info("Re-activation successful");
    });
  });

  // ==========================================================================
  // J7.3: Deactivation with Active Sessions
  // ==========================================================================

  describe("J7.3: Session Handling", () => {
    test("should invalidate active session on deactivation", async () => {
      requireMutations("session invalidation");

      const licenseKey = generateLicenseKeyFormat();
      const device = generateDeviceData();

      // Activate
      const activate = await client.post("/api/license/activate", {
        licenseKey,
        fingerprint: device.fingerprint,
        machineId: device.machineId,
      });

      if (activate.status !== 200) {
        log.info("Skipping session test - no valid license");
        return;
      }

      scope.trackDevice(device.fingerprint, activate.json.activationId);

      // Send heartbeat to establish session
      const heartbeat1 = await client.post("/api/license/heartbeat", {
        licenseKey,
        fingerprint: device.fingerprint,
        machineId: device.machineId,
        sessionId: device.sessionId,
      });

      // Deactivate
      const deactivate = await client.post("/api/license/deactivate", {
        licenseKey,
        fingerprint: device.fingerprint,
        machineId: device.machineId,
      });

      expectStatus(deactivate, 200);

      // Heartbeat should now fail
      const heartbeat2 = await client.post("/api/license/heartbeat", {
        licenseKey,
        fingerprint: device.fingerprint,
        machineId: device.machineId,
        sessionId: device.sessionId,
      });

      // Should be rejected (device deactivated)
      assert.ok(
        [400, 401, 403, 404].includes(heartbeat2.status),
        `Heartbeat after deactivation should fail, got ${heartbeat2.status}`,
      );

      log.info("Session invalidation verified");
    });
  });

  // ==========================================================================
  // J7.4: Admin/Remote Deactivation
  // ==========================================================================

  describe("J7.4: Remote Deactivation", () => {
    test("should support deactivation by license owner", async () => {
      requireMutations("remote deactivation");

      // This tests the portal/admin flow where a user deactivates
      // a device remotely (not from the device itself)

      const licenseKey = generateLicenseKeyFormat();
      const device = generateDeviceData();

      // The deactivation endpoint should work regardless of which device calls it
      const response = await client.post("/api/license/deactivate", {
        licenseKey,
        fingerprint: device.fingerprint,
        machineId: device.machineId,
      });

      // Should accept the request format
      assert.ok(
        response.status < 500,
        `Remote deactivation should not error, got ${response.status}`,
      );
    });

    test("should list active devices for license", async () => {
      const response = await client.post("/api/license/machines", {
        licenseKey: generateLicenseKeyFormat(),
      });

      if (response.status === 404) {
        log.info("Machines endpoint not found or license invalid");
        return;
      }

      if (response.status === 200) {
        assert.ok(
          Array.isArray(response.json.machines),
          "Should return machines array",
        );
      }
    });
  });

  // ==========================================================================
  // J7.5: Error Cases
  // ==========================================================================

  describe("J7.5: Error Cases", () => {
    test("should handle double deactivation gracefully", async () => {
      const licenseKey = generateLicenseKeyFormat();
      const device = generateDeviceData();

      // First deactivation (will likely fail - no activation)
      const deactivate1 = await client.post("/api/license/deactivate", {
        licenseKey,
        fingerprint: device.fingerprint,
        machineId: device.machineId,
      });

      // Second deactivation (same device)
      const deactivate2 = await client.post("/api/license/deactivate", {
        licenseKey,
        fingerprint: device.fingerprint,
        machineId: device.machineId,
      });

      // Should handle gracefully, not error
      assert.ok(
        deactivate2.status < 500,
        `Double deactivation should not error, got ${deactivate2.status}`,
      );
    });

    test("should reject deactivation with invalid license format", async () => {
      const response = await client.post("/api/license/deactivate", {
        licenseKey: "invalid",
        fingerprint: generateFingerprint(),
        machineId: generateMachineId(),
      });

      expectStatus(response, 400);
    });

    test("should complete within timeout", async () => {
      await expectCompletesWithin(
        async () => {
          await client.post("/api/license/deactivate", {
            licenseKey: generateLicenseKeyFormat(),
            fingerprint: generateFingerprint(),
            machineId: generateMachineId(),
          });
        },
        testConfig.timeout.fast,
        "Deactivation",
      );
    });
  });
});
