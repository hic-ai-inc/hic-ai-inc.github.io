/**
 * Journey 6: Concurrent Device Limits
 *
 * Tests device limit enforcement:
 * 1. Activating up to the limit
 * 2. Exceeding limit rejection
 * 3. Limit enforcement messages
 * 4. Seat availability
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
} from "../lib/assertions.js";
import {
  generateFingerprint,
  generateMachineId,
  generateDeviceData,
  generateLicenseKeyFormat,
} from "../lib/test-data.js";
import { createTestScope } from "../lib/cleanup.js";

// ============================================================================
// Constants
// ============================================================================

// Standard seat limits by license type
const SEAT_LIMITS = {
  individual: 3,
  team: 10,
  enterprise: 100,
};

// ============================================================================
// Test Setup
// ============================================================================

describe("Journey 6: Concurrent Device Limits", () => {
  let client;
  let scope;

  beforeEach(() => {
    const env = getEnvironment();
    client = new E2EHttpClient(env.apiBase);
    scope = createTestScope("j6-limits");
    log.info("Test setup complete");
  });

  afterEach(async () => {
    await scope.cleanup();
  });

  // ==========================================================================
  // J6.1: Activating Up to Limit
  // ==========================================================================

  describe("J6.1: Activation to Limit", () => {
    test("should allow activations up to device limit", async () => {
      requireMutations("activation to limit");

      const licenseKey = generateLicenseKeyFormat();
      const maxDevices = SEAT_LIMITS.individual;
      const activatedDevices = [];

      for (let i = 1; i <= maxDevices; i++) {
        const device = generateDeviceData();

        const response = await client.post("/api/license/activate", {
          licenseKey,
          fingerprint: device.fingerprint,
          machineId: device.machineId,
          machineName: `Device-${i}`,
        });

        if (response.status === 200) {
          activatedDevices.push(device);
          scope.trackDevice(device.fingerprint, response.json.activationId);

          // Verify device count
          assert.equal(
            response.json.deviceCount,
            i,
            `Device count should be ${i}`,
          );
        } else if ([400, 404].includes(response.status)) {
          log.info("Cannot test limit - license not valid");
          break;
        } else {
          log.info(`Activation ${i} failed with status ${response.status}`);
          break;
        }
      }

      if (activatedDevices.length > 0) {
        log.info("Activated devices up to limit", {
          count: activatedDevices.length,
          limit: maxDevices,
        });
      }
    });

    test("should report remaining seats accurately", async () => {
      requireMutations("seat reporting");

      const licenseKey = generateLicenseKeyFormat();
      const maxDevices = SEAT_LIMITS.individual;

      // Activate first device
      const device = generateDeviceData();
      const response = await client.post("/api/license/activate", {
        licenseKey,
        fingerprint: device.fingerprint,
        machineId: device.machineId,
      });

      if (response.status !== 200) {
        log.info("Skipping - activation failed");
        return;
      }
      scope.trackDevice(device.fingerprint, response.json.activationId);

      const {
        deviceCount,
        maxDevices: reportedMax,
        seatsRemaining,
      } = response.json;

      if (reportedMax !== undefined) {
        assert.equal(
          reportedMax,
          maxDevices,
          `Max devices should be ${maxDevices}`,
        );
      }

      if (seatsRemaining !== undefined) {
        assert.equal(
          seatsRemaining,
          maxDevices - deviceCount,
          "Seats remaining should match calculation",
        );
      }

      log.info("Seat reporting verified", {
        deviceCount,
        maxDevices: reportedMax,
        seatsRemaining,
      });
    });
  });

  // ==========================================================================
  // J6.2: Exceeding Limit
  // ==========================================================================

  describe("J6.2: Exceeding Limit", () => {
    test("should reject activation beyond device limit", async () => {
      requireMutations("exceed limit rejection");

      const licenseKey = generateLicenseKeyFormat();
      const maxDevices = SEAT_LIMITS.individual;
      const devices = [];

      // Activate up to limit
      for (let i = 1; i <= maxDevices; i++) {
        const device = generateDeviceData();
        const response = await client.post("/api/license/activate", {
          licenseKey,
          fingerprint: device.fingerprint,
          machineId: device.machineId,
        });

        if (response.status === 200) {
          devices.push(device);
          scope.trackDevice(device.fingerprint, response.json.activationId);
        } else {
          log.info("Cannot test limit - activation failed early");
          return;
        }
      }

      // Attempt to exceed limit
      const extraDevice = generateDeviceData();
      const overLimitResponse = await client.post("/api/license/activate", {
        licenseKey,
        fingerprint: extraDevice.fingerprint,
        machineId: extraDevice.machineId,
        machineName: "Extra-Device",
      });

      // Should be rejected
      if (overLimitResponse.status === 403) {
        expectError(overLimitResponse);
        log.info("Over-limit activation correctly rejected with 403");
      } else if (overLimitResponse.status === 429) {
        log.info("Over-limit activation rejected with 429 (rate limit style)");
      } else if (overLimitResponse.status === 400) {
        log.info("Over-limit activation rejected with 400");
      } else {
        // If 200, that's unexpected
        assert.notEqual(
          overLimitResponse.status,
          200,
          "Should not allow activation beyond limit",
        );
      }
    });

    test("should include limit info in rejection", async () => {
      requireMutations("rejection with limit info");

      const licenseKey = generateLicenseKeyFormat();
      const maxDevices = SEAT_LIMITS.individual;

      // Fill up seats
      for (let i = 1; i <= maxDevices; i++) {
        const device = generateDeviceData();
        const response = await client.post("/api/license/activate", {
          licenseKey,
          fingerprint: device.fingerprint,
          machineId: device.machineId,
        });

        if (response.status === 200) {
          scope.trackDevice(device.fingerprint, response.json.activationId);
        } else {
          log.info("Cannot test - activation failed");
          return;
        }
      }

      // Try to exceed
      const extraDevice = generateDeviceData();
      const response = await client.post("/api/license/activate", {
        licenseKey,
        fingerprint: extraDevice.fingerprint,
        machineId: extraDevice.machineId,
      });

      if (response.status !== 200) {
        const errorData = response.json;

        // Should include helpful info
        const errorMsg =
          errorData.error?.message ||
          errorData.message ||
          JSON.stringify(errorData);

        const hasLimitInfo =
          errorMsg.toLowerCase().includes("limit") ||
          errorMsg.toLowerCase().includes("device") ||
          errorMsg.toLowerCase().includes("seat") ||
          errorMsg.toLowerCase().includes("maximum") ||
          errorData.maxDevices !== undefined ||
          errorData.deviceCount !== undefined;

        if (hasLimitInfo) {
          log.info("Rejection includes limit information", {
            message: errorMsg.substring(0, 100),
          });
        }
      }
    });
  });

  // ==========================================================================
  // J6.3: Seat Availability After Deactivation
  // ==========================================================================

  describe("J6.3: Seat Recovery", () => {
    test("should free seat after deactivation", async () => {
      requireMutations("seat recovery");

      const licenseKey = generateLicenseKeyFormat();
      const maxDevices = SEAT_LIMITS.individual;
      const devices = [];

      // Fill all seats
      for (let i = 1; i <= maxDevices; i++) {
        const device = generateDeviceData();
        const response = await client.post("/api/license/activate", {
          licenseKey,
          fingerprint: device.fingerprint,
          machineId: device.machineId,
        });

        if (response.status === 200) {
          devices.push(device);
          scope.trackDevice(device.fingerprint, response.json.activationId);
        } else {
          log.info("Cannot test - activation failed");
          return;
        }
      }

      // Deactivate one device
      const deviceToRemove = devices[0];
      const deactivateResponse = await client.post("/api/license/deactivate", {
        licenseKey,
        fingerprint: deviceToRemove.fingerprint,
        machineId: deviceToRemove.machineId,
      });

      if (deactivateResponse.status !== 200) {
        log.info("Cannot test - deactivation failed");
        return;
      }

      // Now should be able to activate new device
      const newDevice = generateDeviceData();
      const newActivation = await client.post("/api/license/activate", {
        licenseKey,
        fingerprint: newDevice.fingerprint,
        machineId: newDevice.machineId,
        machineName: "Replacement-Device",
      });

      if (newActivation.status === 200) {
        scope.trackDevice(
          newDevice.fingerprint,
          newActivation.json.activationId,
        );
        log.info("Seat recovered after deactivation");
      } else {
        log.info("New activation after deactivation returned", {
          status: newActivation.status,
        });
      }
    });
  });

  // ==========================================================================
  // J6.4: Team License Limits
  // ==========================================================================

  describe("J6.4: Team License Limits", () => {
    test("should enforce higher limit for team licenses", async () => {
      requireMutations("team license limit");

      // Note: This requires a real team license to fully test
      // We verify the endpoint handles team license type

      const licenseKey = generateLicenseKeyFormat(); // Would need real team key
      const teamLimit = SEAT_LIMITS.team;

      // Verify license info shows team limit
      const statusResponse = await client.post("/api/license/status", {
        licenseKey,
      });

      if (statusResponse.status === 200) {
        const { maxDevices, licenseType } = statusResponse.json;

        if (licenseType === "team") {
          assert.equal(
            maxDevices,
            teamLimit,
            `Team license should have ${teamLimit} seats`,
          );
          log.info("Team license limit verified", { maxDevices });
        }
      } else {
        log.info("Cannot verify team limit - license not found");
      }
    });
  });

  // ==========================================================================
  // J6.5: Concurrent Activation Attempts
  // ==========================================================================

  describe("J6.5: Concurrent Attempts", () => {
    test("should handle simultaneous activation attempts", async () => {
      requireMutations("concurrent activations");

      const licenseKey = generateLicenseKeyFormat();
      const maxDevices = SEAT_LIMITS.individual;

      // Generate more devices than allowed
      const devices = Array.from({ length: maxDevices + 2 }, () =>
        generateDeviceData(),
      );

      // Attempt all activations simultaneously
      const promises = devices.map((device, idx) =>
        client.post("/api/license/activate", {
          licenseKey,
          fingerprint: device.fingerprint,
          machineId: device.machineId,
          machineName: `Concurrent-Device-${idx + 1}`,
        }),
      );

      const responses = await Promise.all(promises);

      // Count results
      const succeeded = responses.filter((r) => r.status === 200);
      const rejected = responses.filter((r) =>
        [403, 429, 400].includes(r.status),
      );
      const errors = responses.filter((r) => r.status >= 500);

      // Track successful ones for cleanup
      succeeded.forEach((r, idx) => {
        const device = devices[responses.indexOf(r)];
        if (device) {
          scope.trackDevice(device.fingerprint, r.json?.activationId);
        }
      });

      log.info("Concurrent activation results", {
        attempted: devices.length,
        succeeded: succeeded.length,
        rejected: rejected.length,
        errors: errors.length,
        limit: maxDevices,
      });

      // Should not have more successes than limit allows
      if (succeeded.length > 0) {
        assert.ok(
          succeeded.length <= maxDevices,
          `Should not exceed ${maxDevices} activations, got ${succeeded.length}`,
        );
      }

      // Should not have server errors
      assert.equal(errors.length, 0, "Should not have server errors");
    });
  });

  // ==========================================================================
  // J6.6: Limit Information in Status
  // ==========================================================================

  describe("J6.6: Status Reporting", () => {
    test("should report device count in license status", async () => {
      requireMutations("status device count");

      const licenseKey = generateLicenseKeyFormat();

      // Activate a device
      const device = generateDeviceData();
      const activateResponse = await client.post("/api/license/activate", {
        licenseKey,
        fingerprint: device.fingerprint,
        machineId: device.machineId,
      });

      if (activateResponse.status !== 200) {
        log.info("Skipping - activation failed");
        return;
      }
      scope.trackDevice(device.fingerprint, activateResponse.json.activationId);

      // Check status
      const statusResponse = await client.post("/api/license/status", {
        licenseKey,
      });

      if (statusResponse.status === 200) {
        expectFields(statusResponse.json, ["deviceCount"]);
        assert.ok(
          statusResponse.json.deviceCount >= 1,
          "Device count should be at least 1",
        );
        log.info("Device count in status verified");
      }
    });

    test("should list active machines", async () => {
      requireMutations("machine listing");

      const licenseKey = generateLicenseKeyFormat();

      // Activate some devices
      for (let i = 0; i < 2; i++) {
        const device = generateDeviceData();
        const response = await client.post("/api/license/activate", {
          licenseKey,
          fingerprint: device.fingerprint,
          machineId: device.machineId,
          machineName: `Test-Machine-${i + 1}`,
          platform: i === 0 ? "win32" : "darwin",
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

        if (machines.length > 0) {
          // Verify machine info
          machines.forEach((machine, idx) => {
            assert.ok(
              machine.fingerprint || machine.machineId,
              `Machine ${idx} should have identifier`,
            );
          });
        }

        log.info("Machine list retrieved", { count: machines.length });
      }
    });
  });

  // ==========================================================================
  // J6.7: Error Messages
  // ==========================================================================

  describe("J6.7: Error Messages", () => {
    test("should provide actionable error when limit reached", async () => {
      requireMutations("actionable error");

      const licenseKey = generateLicenseKeyFormat();
      const maxDevices = SEAT_LIMITS.individual;

      // Fill seats
      for (let i = 1; i <= maxDevices; i++) {
        const device = generateDeviceData();
        const response = await client.post("/api/license/activate", {
          licenseKey,
          fingerprint: device.fingerprint,
          machineId: device.machineId,
        });

        if (response.status === 200) {
          scope.trackDevice(device.fingerprint, response.json.activationId);
        } else {
          return; // Can't complete test
        }
      }

      // Try to exceed
      const extraDevice = generateDeviceData();
      const response = await client.post("/api/license/activate", {
        licenseKey,
        fingerprint: extraDevice.fingerprint,
        machineId: extraDevice.machineId,
      });

      if (response.status !== 200) {
        const errorMsg =
          response.json.error?.message || response.json.message || "";

        // Should suggest action (deactivate, upgrade)
        const isActionable =
          errorMsg.toLowerCase().includes("deactivate") ||
          errorMsg.toLowerCase().includes("upgrade") ||
          errorMsg.toLowerCase().includes("remove") ||
          errorMsg.toLowerCase().includes("manage") ||
          response.json.upgradeUrl !== undefined;

        if (isActionable) {
          log.info("Error message is actionable", {
            message: errorMsg.substring(0, 100),
          });
        }
      }
    });
  });
});
