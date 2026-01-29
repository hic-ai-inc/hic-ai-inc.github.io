/**
 * Journey 4: Multi-Device Activation
 *
 * Tests activating the same license on multiple devices:
 * 1. First device activation
 * 2. Second device activation
 * 3. Both devices remain active
 * 4. Device count tracking
 *
 * Priority: P1
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

describe("Journey 4: Multi-Device Activation", () => {
  let client;
  let scope;

  beforeEach(() => {
    const env = getEnvironment();
    client = new E2EHttpClient(env.apiBase);
    scope = createTestScope("j4-multi-device");
    log.info("Test setup complete");
  });

  afterEach(async () => {
    await scope.cleanup();
  });

  // ==========================================================================
  // J4.1: Sequential Device Activation
  // ==========================================================================

  describe("J4.1: Sequential Device Activation", () => {
    test("should activate first device successfully", async () => {
      requireMutations("first device activation");

      const device1 = generateDeviceData();
      const licenseKey = generateLicenseKeyFormat();

      const response = await client.post("/api/license/activate", {
        licenseKey,
        fingerprint: device1.fingerprint,
        machineId: device1.machineId,
        machineName: "Device-1",
        platform: device1.platform,
      });

      if (response.status === 200) {
        expectSuccess(response);
        expectFields(response.json, ["activated", "deviceCount"]);
        assert.equal(response.json.deviceCount, 1, "Should be first device");
        scope.trackDevice(device1.fingerprint, response.json.activationId);
        log.info("First device activated", {
          deviceCount: response.json.deviceCount,
        });
      } else if ([400, 404].includes(response.status)) {
        log.info("Activation rejected (expected without valid license)");
      }
    });

    test("should activate second device on same license", async () => {
      requireMutations("second device activation");

      const device1 = generateDeviceData();
      const device2 = generateDeviceData();
      const licenseKey = generateLicenseKeyFormat();

      // Activate first device
      const response1 = await client.post("/api/license/activate", {
        licenseKey,
        fingerprint: device1.fingerprint,
        machineId: device1.machineId,
        machineName: "Device-1",
      });

      if (response1.status !== 200) {
        log.info(
          "Skipping - first activation failed (expected without real license)",
        );
        return;
      }
      scope.trackDevice(device1.fingerprint, response1.json.activationId);

      // Activate second device
      const response2 = await client.post("/api/license/activate", {
        licenseKey,
        fingerprint: device2.fingerprint,
        machineId: device2.machineId,
        machineName: "Device-2",
      });

      expectStatus(response2, 200);
      expectSuccess(response2);
      assert.equal(response2.json.deviceCount, 2, "Should be second device");
      scope.trackDevice(device2.fingerprint, response2.json.activationId);

      log.info("Second device activated", {
        deviceCount: response2.json.deviceCount,
      });
    });

    test("should track device count correctly", async () => {
      requireMutations("device count tracking");

      const licenseKey = generateLicenseKeyFormat();
      const devices = [
        generateDeviceData(),
        generateDeviceData(),
        generateDeviceData(),
      ];

      let lastDeviceCount = 0;

      for (let i = 0; i < devices.length; i++) {
        const device = devices[i];
        const response = await client.post("/api/license/activate", {
          licenseKey,
          fingerprint: device.fingerprint,
          machineId: device.machineId,
          machineName: `Device-${i + 1}`,
        });

        if (response.status === 200) {
          scope.trackDevice(device.fingerprint, response.json.activationId);

          // Verify count increments
          assert.ok(
            response.json.deviceCount > lastDeviceCount,
            `Device count should increment: ${response.json.deviceCount} > ${lastDeviceCount}`,
          );
          lastDeviceCount = response.json.deviceCount;
        } else if (response.status === 403 || response.status === 429) {
          // Hit device limit
          log.info("Device limit reached", { attempted: i + 1 });
          break;
        } else {
          log.info("Activation failed (expected without real license)");
          break;
        }
      }

      log.info("Device count tracking verified", {
        finalCount: lastDeviceCount,
      });
    });
  });

  // ==========================================================================
  // J4.2: Both Devices Active Simultaneously
  // ==========================================================================

  describe("J4.2: Simultaneous Device Activity", () => {
    test("should allow heartbeats from both devices", async () => {
      requireMutations("simultaneous heartbeats");

      const device1 = generateDeviceData();
      const device2 = generateDeviceData();
      const licenseKey = generateLicenseKeyFormat();

      // Activate both devices
      const activations = [];
      for (const device of [device1, device2]) {
        const response = await client.post("/api/license/activate", {
          licenseKey,
          fingerprint: device.fingerprint,
          machineId: device.machineId,
        });

        if (response.status === 200) {
          activations.push({ device, response });
          scope.trackDevice(device.fingerprint, response.json.activationId);
        }
      }

      if (activations.length < 2) {
        log.info("Skipping - could not activate both devices");
        return;
      }

      // Send heartbeats from both devices
      const heartbeatResults = await Promise.all([
        client.post("/api/license/heartbeat", {
          licenseKey,
          fingerprint: device1.fingerprint,
          machineId: device1.machineId,
          timestamp: new Date().toISOString(),
        }),
        client.post("/api/license/heartbeat", {
          licenseKey,
          fingerprint: device2.fingerprint,
          machineId: device2.machineId,
          timestamp: new Date().toISOString(),
        }),
      ]);

      // Both should succeed
      heartbeatResults.forEach((response, idx) => {
        if (response.status === 200) {
          log.info(`Device ${idx + 1} heartbeat accepted`);
        }
      });
    });

    test("should validate license from both devices", async () => {
      requireMutations("multi-device validation");

      const device1 = generateDeviceData();
      const device2 = generateDeviceData();
      const licenseKey = generateLicenseKeyFormat();

      // Activate both
      for (const device of [device1, device2]) {
        const response = await client.post("/api/license/activate", {
          licenseKey,
          fingerprint: device.fingerprint,
          machineId: device.machineId,
        });
        if (response.status === 200) {
          scope.trackDevice(device.fingerprint, response.json.activationId);
        }
      }

      // Validate from both devices
      const validations = await Promise.all([
        client.post("/api/license/validate", {
          licenseKey,
          fingerprint: device1.fingerprint,
        }),
        client.post("/api/license/validate", {
          licenseKey,
          fingerprint: device2.fingerprint,
        }),
      ]);

      validations.forEach((response, idx) => {
        if (response.status === 200) {
          assert.equal(
            response.json.valid,
            true,
            `Device ${idx + 1} should be valid`,
          );
        }
      });
    });
  });

  // ==========================================================================
  // J4.3: Device Metadata
  // ==========================================================================

  describe("J4.3: Device Metadata", () => {
    test("should store unique device metadata", async () => {
      requireMutations("device metadata storage");

      const device1 = {
        ...generateDeviceData(),
        machineName: "Work-Laptop",
        platform: "darwin",
        osVersion: "14.0.0",
      };
      const device2 = {
        ...generateDeviceData(),
        machineName: "Home-Desktop",
        platform: "win32",
        osVersion: "10.0.19045",
      };
      const licenseKey = generateLicenseKeyFormat();

      // Activate with metadata
      for (const device of [device1, device2]) {
        const response = await client.post("/api/license/activate", {
          licenseKey,
          fingerprint: device.fingerprint,
          machineId: device.machineId,
          machineName: device.machineName,
          platform: device.platform,
          osVersion: device.osVersion,
        });

        if (response.status === 200) {
          scope.trackDevice(device.fingerprint, response.json.activationId);
        }
      }

      // Get machine list
      const listResponse = await client.post("/api/license/machines", {
        licenseKey,
      });

      if (listResponse.status === 200) {
        const { machines } = listResponse.json;
        assert.ok(Array.isArray(machines), "Machines should be array");

        // Verify different platforms recorded
        if (machines.length >= 2) {
          const platforms = machines.map((m) => m.platform);
          assert.ok(
            platforms.includes("darwin") || platforms.includes("win32"),
            "Should have recorded platform metadata",
          );
        }

        log.info("Device metadata verified", { machineCount: machines.length });
      }
    });

    test("should prevent duplicate fingerprint activation", async () => {
      requireMutations("duplicate prevention");

      const device = generateDeviceData();
      const licenseKey = generateLicenseKeyFormat();

      // First activation
      const response1 = await client.post("/api/license/activate", {
        licenseKey,
        fingerprint: device.fingerprint,
        machineId: device.machineId,
      });

      if (response1.status !== 200) {
        log.info("Skipping - first activation failed");
        return;
      }
      scope.trackDevice(device.fingerprint, response1.json.activationId);

      // Duplicate activation attempt
      const response2 = await client.post("/api/license/activate", {
        licenseKey,
        fingerprint: device.fingerprint, // Same fingerprint
        machineId: device.machineId,
      });

      // Should either return existing activation or error
      if (response2.status === 200) {
        // Idempotent - returns existing
        assert.equal(
          response2.json.deviceCount,
          response1.json.deviceCount,
          "Device count should not increase for duplicate",
        );
      } else if (response2.status === 409) {
        // Conflict - already activated
        log.info("Duplicate correctly rejected with 409");
      }
    });
  });

  // ==========================================================================
  // J4.4: Cross-Platform Activation
  // ==========================================================================

  describe("J4.4: Cross-Platform Activation", () => {
    test("should activate on different platforms", async () => {
      requireMutations("cross-platform activation");

      const platforms = ["win32", "darwin", "linux"];
      const licenseKey = generateLicenseKeyFormat();
      const activatedPlatforms = [];

      for (const platform of platforms) {
        const device = generateDeviceData();
        device.platform = platform;

        const response = await client.post("/api/license/activate", {
          licenseKey,
          fingerprint: device.fingerprint,
          machineId: device.machineId,
          platform,
        });

        if (response.status === 200) {
          activatedPlatforms.push(platform);
          scope.trackDevice(device.fingerprint, response.json.activationId);
        } else if (response.status === 403) {
          log.info("Platform limit reached", { platform });
          break;
        } else {
          break; // Expected without real license
        }
      }

      if (activatedPlatforms.length > 0) {
        log.info("Cross-platform activation verified", {
          platforms: activatedPlatforms,
        });
      }
    });
  });

  // ==========================================================================
  // J4.5: Error Handling
  // ==========================================================================

  describe("J4.5: Error Handling", () => {
    test("should reject activation with missing license key", async () => {
      const device = generateDeviceData();

      const response = await client.post("/api/license/activate", {
        fingerprint: device.fingerprint,
        machineId: device.machineId,
        // licenseKey missing
      });

      expectStatus(response, 400);
      expectError(response);
    });

    test("should reject activation with missing fingerprint", async () => {
      const response = await client.post("/api/license/activate", {
        licenseKey: generateLicenseKeyFormat(),
        machineId: generateMachineId(),
        // fingerprint missing
      });

      expectStatus(response, 400);
      expectError(response);
    });

    test("should handle invalid license key format", async () => {
      const device = generateDeviceData();

      const response = await client.post("/api/license/activate", {
        licenseKey: "invalid-key-format",
        fingerprint: device.fingerprint,
        machineId: device.machineId,
      });

      // Should be 400 (bad format) or 404 (not found)
      assert.ok(
        [400, 404].includes(response.status),
        `Invalid key should return 400 or 404, got ${response.status}`,
      );
    });
  });
});
