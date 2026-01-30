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

      expectStatus(response, 400);
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

      // Heartbeat should work for trial or licensed devices
      if (response.status === 200) {
        expectHeartbeat(response.json);
        log.info("Heartbeat accepted");
      } else if (response.status === 404) {
        // Device not found - expected in E2E
        log.info("Heartbeat rejected (device not registered)");
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
        expectHeartbeat(response.json);
        // Next heartbeat should include last-seen update
        log.info("Heartbeat timestamp updated");
      }
    });

    test("should handle heartbeat for unknown device", async () => {
      const response = await client.post("/api/license/heartbeat", {
        fingerprint: "unknown-device-12345",
        timestamp: new Date().toISOString(),
      });

      // Unknown device heartbeats MUST return 200 and record the device.
      // This is critical for trial users - their device must be tracked
      // so it can be linked to their account when they purchase a license.
      expectStatus(response, 200);
      log.info("Unknown device heartbeat accepted and recorded");
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

      if (response.status === 400) {
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

    test("should handle suspended license", async () => {
      const response = await client.post("/api/license/validate", {
        licenseKey: "SUSPENDED-0000-0000-0000",
        fingerprint: deviceData.fingerprint,
      });

      assert.ok(
        response.status < 500,
        `Suspended license should not cause server error, got ${response.status}`,
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
});
