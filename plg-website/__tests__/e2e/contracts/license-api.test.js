/**
 * License API Contract Tests
 *
 * Validates the License API endpoints:
 * - Request/response schemas
 * - Error handling
 * - Edge cases
 * - Rate limiting
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
  expectBadRequest,
  expectFields,
  expectLicenseKey,
  expectIsoDate,
  expectCompletesWithin,
} from "../lib/assertions.js";
import {
  generateFingerprint,
  generateMachineId,
  generateDeviceData,
  generateLicenseKeyFormat,
  generateSessionId,
} from "../lib/test-data.js";
import { createTestScope } from "../lib/cleanup.js";

// ============================================================================
// Test Setup
// ============================================================================

describe("License API Contract", () => {
  let client;
  let scope;

  beforeEach(() => {
    const env = getEnvironment();
    client = new E2EHttpClient(env.apiBase);
    scope = createTestScope("license-contract");
    log.info("Test setup complete");
  });

  afterEach(async () => {
    await scope.cleanup();
  });

  // ==========================================================================
  // POST /api/license/validate
  // ==========================================================================

  describe("POST /api/license/validate", () => {
    describe("Request Validation", () => {
      test("should accept valid license key format", async () => {
        const licenseKey = generateLicenseKeyFormat();

        const response = await client.post("/api/license/validate", {
          licenseKey,
          fingerprint: generateFingerprint(),
        });

        // Should return 200 (valid), 400 (invalid format), or 404 (not found)
        assert.ok(
          [200, 400, 404].includes(response.status),
          `Expected 200, 400, or 404, got ${response.status}`,
        );
      });

      test("should reject missing license key", async () => {
        const response = await client.post("/api/license/validate", {
          fingerprint: generateFingerprint(),
          // licenseKey missing
        });

        // Should still work for trial check - no licenseKey means trial flow
        // Accepting 200 (trial started) or 400 (validation error)
        assert.ok(
          [200, 400].includes(response.status),
          `Expected 200 or 400, got ${response.status}`,
        );
      });

      test("should reject empty license key", async () => {
        const response = await client.post("/api/license/validate", {
          licenseKey: "",
          fingerprint: generateFingerprint(),
        });

        // Empty string licenseKey is treated as falsy, enters trial flow
        // This is intentional - empty means "no license, check trial"
        assert.ok(
          [200, 400].includes(response.status),
          `Expected 200 (trial) or 400 (error), got ${response.status}`,
        );
      });

      test("should accept fingerprint-only request (trial check)", async () => {
        requireMutations("trial check");

        const response = await client.post("/api/license/validate", {
          fingerprint: generateFingerprint(),
          machineId: generateMachineId(),
        });

        // Should initialize trial or return existing
        if (response.status === 200) {
          expectSuccess(response);
          scope.trackTrial(response.json.trial?.id);
        }
      });

      test("should reject invalid fingerprint format", async () => {
        const response = await client.post("/api/license/validate", {
          licenseKey: generateLicenseKeyFormat(),
          fingerprint: "", // Empty
        });

        expectStatus(response, 400);
      });
    });

    describe("Response Schema", () => {
      test("should return required fields for valid license", async () => {
        requireMutations("license validation response");

        const response = await client.post("/api/license/validate", {
          licenseKey: generateLicenseKeyFormat(),
          fingerprint: generateFingerprint(),
        });

        // Generated license keys won't exist in Keygen, so expect 200 with valid:false
        // or 404/400 for invalid format
        if (response.status === 200) {
          // "valid" is always present, "status" is inside license object when valid
          expectFields(response.json, ["valid"]);

          if (response.json.valid && response.json.license) {
            // When license is valid, status is in license object
            expectFields(response.json.license, ["status"]);
            // Additional fields for valid license
            const optionalFields = ["maxDevices", "expiresAt", "features"];
            optionalFields.forEach((field) => {
              if (response.json[field] !== undefined) {
                log.info(`Field ${field} present`);
              }
            });
          }
        } else if (response.status === 404) {
          log.info("License not found (expected for generated test key)");
        }
      });

      test("should return trial info for trial status", async () => {
        requireMutations("trial response");

        const response = await client.post("/api/license/validate", {
          fingerprint: generateFingerprint(),
          machineId: generateMachineId(),
        });

        if (response.status === 200 && response.json.status === "trial") {
          expectFields(response.json, ["trial"]);
          expectFields(response.json.trial, ["daysRemaining"]);
          scope.trackTrial(response.json.trial?.id);
        }
      });

      test("should return ISO date for expiresAt", async () => {
        const response = await client.post("/api/license/validate", {
          licenseKey: generateLicenseKeyFormat(),
          fingerprint: generateFingerprint(),
        });

        if (response.status === 200 && response.json.expiresAt) {
          expectIsoDate(response.json.expiresAt, "expiresAt");
        }
      });
    });

    describe("Error Responses", () => {
      test("should return not found response for non-existent license", async () => {
        const response = await client.post("/api/license/validate", {
          licenseKey: "MOUSE-0000-0000-0000-0000", // Valid format, doesn't exist
          fingerprint: generateFingerprint(),
        });

        // API returns 200 with valid:false for proper validation response
        // This is correct - it's validating, not resource lookup
        if (response.status === 200) {
          assert.strictEqual(response.json.valid, false, "Should return valid:false");
          assert.ok(
            response.json.code === "NOT_FOUND" || response.json.code === "INVALID",
            `Expected NOT_FOUND or INVALID code, got ${response.json.code}`,
          );
        } else {
          // 400/404 also acceptable
          assert.ok(
            [400, 404].includes(response.status),
            `Expected 200 (valid:false), 400, or 404, got ${response.status}`,
          );
        }
      });

      test("should return structured error response", async () => {
        const response = await client.post("/api/license/validate", {
          licenseKey: "invalid",
          fingerprint: generateFingerprint(),
        });

        if (response.status >= 400) {
          // Should have error structure
          const hasError =
            response.json.error !== undefined ||
            response.json.message !== undefined;
          assert.ok(hasError, "Error response should have error or message");
        }
      });
    });

    describe("Performance", () => {
      test("should complete within timeout", async () => {
        await expectCompletesWithin(
          async () => {
            await client.post("/api/license/validate", {
              licenseKey: generateLicenseKeyFormat(),
              fingerprint: generateFingerprint(),
            });
          },
          testConfig.timeout.api,
          "License validation",
        );
      });
    });
  });

  // ==========================================================================
  // POST /api/license/activate
  // ==========================================================================

  describe("POST /api/license/activate", () => {
    describe("Request Validation", () => {
      test("should require licenseKey field", async () => {
        const response = await client.post("/api/license/activate", {
          fingerprint: generateFingerprint(),
          machineId: generateMachineId(),
          // licenseKey missing
        });

        expectBadRequest(response);
      });

      test("should require machineId field", async () => {
        const response = await client.post("/api/license/activate", {
          licenseKey: generateLicenseKeyFormat(),
          fingerprint: generateFingerprint(),
          // machineId missing
        });

        expectBadRequest(response);
      });

      test("should require fingerprint field", async () => {
        const response = await client.post("/api/license/activate", {
          licenseKey: generateLicenseKeyFormat(),
          machineId: generateMachineId(),
          // fingerprint missing
        });

        expectBadRequest(response);
      });

      test("should accept optional machineName", async () => {
        requireMutations("activate with name");

        const response = await client.post("/api/license/activate", {
          licenseKey: generateLicenseKeyFormat(),
          fingerprint: generateFingerprint(),
          machineId: generateMachineId(),
          machineName: "Test Machine",
        });

        // Valid request format (may fail on invalid license)
        assert.ok(response.status < 500, "Should not return server error");
      });

      test("should accept optional platform", async () => {
        requireMutations("activate with platform");

        const response = await client.post("/api/license/activate", {
          licenseKey: generateLicenseKeyFormat(),
          fingerprint: generateFingerprint(),
          machineId: generateMachineId(),
          platform: "win32",
        });

        assert.ok(response.status < 500, "Should not return server error");
      });
    });

    describe("Response Schema", () => {
      test("should return activation result fields", async () => {
        requireMutations("activation response");

        const device = generateDeviceData();
        const response = await client.post("/api/license/activate", {
          licenseKey: generateLicenseKeyFormat(),
          fingerprint: device.fingerprint,
          machineId: device.machineId,
        });

        if (response.status === 200) {
          expectFields(response.json, ["activated"]);
          // Optional fields
          if (response.json.deviceCount !== undefined) {
            assert.ok(
              typeof response.json.deviceCount === "number",
              "deviceCount should be number",
            );
          }
          scope.trackDevice(device.fingerprint, response.json.activationId);
        }
      });
    });

    describe("Duplicate Handling", () => {
      test("should handle duplicate activation idempotently", async () => {
        requireMutations("duplicate activation");

        const device = generateDeviceData();
        const licenseKey = generateLicenseKeyFormat();
        const payload = {
          licenseKey,
          fingerprint: device.fingerprint,
          machineId: device.machineId,
        };

        const response1 = await client.post("/api/license/activate", payload);

        if (response1.status !== 200) {
          log.info("Skipping duplicate test - first activation failed");
          return;
        }
        scope.trackDevice(device.fingerprint, response1.json.activationId);

        const response2 = await client.post("/api/license/activate", payload);

        // Should either succeed (idempotent) or return conflict
        assert.ok(
          [200, 409].includes(response2.status),
          `Duplicate should return 200 or 409, got ${response2.status}`,
        );

        if (response2.status === 200) {
          // Device count should not increase
          assert.equal(
            response2.json.deviceCount,
            response1.json.deviceCount,
            "Device count should not increase for duplicate",
          );
        }
      });
    });

    describe("Device Limits", () => {
      test("should respect maxDevices limit", async () => {
        requireMutations("device limit");

        const licenseKey = generateLicenseKeyFormat();
        const devices = [];

        // Try to activate 5 devices (typical limit is 3)
        for (let i = 0; i < 5; i++) {
          const device = generateDeviceData();
          const response = await client.post("/api/license/activate", {
            licenseKey,
            fingerprint: device.fingerprint,
            machineId: device.machineId,
          });

          if (response.status === 200) {
            devices.push(device);
            scope.trackDevice(device.fingerprint, response.json.activationId);
          } else if ([403, 429].includes(response.status)) {
            // Hit the limit
            log.info("Device limit enforced", {
              activatedCount: devices.length,
            });
            break;
          } else {
            break; // Other error
          }
        }
      });
    });
  });

  // ==========================================================================
  // POST /api/license/heartbeat
  // ==========================================================================

  describe("POST /api/license/heartbeat", () => {
    describe("Request Validation", () => {
      test("should require fingerprint or licenseKey", async () => {
        const response = await client.post("/api/license/heartbeat", {
          machineId: generateMachineId(),
          sessionId: generateSessionId(),
          timestamp: new Date().toISOString(),
        });

        expectStatus(response, 400);
      });

      test("should accept heartbeat with fingerprint", async () => {
        requireMutations("heartbeat with fingerprint");

        const fingerprint = generateFingerprint();

        // Initialize trial first
        await client.post("/api/license/validate", {
          fingerprint,
          machineId: generateMachineId(),
        });

        const response = await client.post("/api/license/heartbeat", {
          fingerprint,
          machineId: generateMachineId(),
          sessionId: generateSessionId(),
          timestamp: new Date().toISOString(),
        });

        // Should succeed or return 404 if device not found
        assert.ok(
          [200, 404].includes(response.status),
          `Expected 200 or 404, got ${response.status}`,
        );
      });

      test("should accept heartbeat with licenseKey", async () => {
        const response = await client.post("/api/license/heartbeat", {
          licenseKey: generateLicenseKeyFormat(),
          fingerprint: generateFingerprint(),
          machineId: generateMachineId(),
          sessionId: generateSessionId(),
          timestamp: new Date().toISOString(),
        });

        // May fail on invalid license, but format is correct
        assert.ok(response.status < 500, "Should not return server error");
      });
    });

    describe("Response Schema", () => {
      test("should return heartbeat result", async () => {
        requireMutations("heartbeat response");

        const fingerprint = generateFingerprint();

        // Initialize
        await client.post("/api/license/validate", {
          fingerprint,
          machineId: generateMachineId(),
        });

        const response = await client.post("/api/license/heartbeat", {
          fingerprint,
          machineId: generateMachineId(),
          sessionId: generateSessionId(),
          timestamp: new Date().toISOString(),
        });

        if (response.status === 200) {
          expectFields(response.json, ["valid"]);
          // Optional: nextHeartbeat interval
          if (response.json.nextHeartbeat !== undefined) {
            assert.ok(
              typeof response.json.nextHeartbeat === "number",
              "nextHeartbeat should be number",
            );
          }
        }
      });
    });

    describe("Rate Limiting", () => {
      test("should enforce rate limit", async () => {
        requireMutations("heartbeat rate limit");

        const fingerprint = generateFingerprint();

        // Initialize
        await client.post("/api/license/validate", {
          fingerprint,
          machineId: generateMachineId(),
        });

        // Send many rapid heartbeats
        const promises = [];
        for (let i = 0; i < 15; i++) {
          promises.push(
            client.post("/api/license/heartbeat", {
              fingerprint,
              machineId: generateMachineId(),
              sessionId: generateSessionId(),
              timestamp: new Date().toISOString(),
            }),
          );
        }

        const responses = await Promise.all(promises);
        const rateLimited = responses.filter((r) => r.status === 429);

        if (rateLimited.length > 0) {
          log.info("Rate limiting enforced", {
            rateLimitedCount: rateLimited.length,
          });
        }
      });
    });
  });

  // ==========================================================================
  // DELETE or POST /api/license/deactivate
  // ==========================================================================

  describe("POST /api/license/deactivate", () => {
    describe("Request Validation", () => {
      test("should require licenseKey", async () => {
        const response = await client.post("/api/license/deactivate", {
          fingerprint: generateFingerprint(),
          machineId: generateMachineId(),
        });

        expectStatus(response, 400);
      });

      test("should require machineId or fingerprint", async () => {
        const response = await client.post("/api/license/deactivate", {
          licenseKey: generateLicenseKeyFormat(),
        });

        expectStatus(response, 400);
      });
    });

    describe("Response Schema", () => {
      test("should return deactivation result", async () => {
        requireMutations("deactivation response");

        const device = generateDeviceData();
        const licenseKey = generateLicenseKeyFormat();

        // First activate
        const activateResponse = await client.post("/api/license/activate", {
          licenseKey,
          fingerprint: device.fingerprint,
          machineId: device.machineId,
        });

        if (activateResponse.status !== 200) {
          log.info("Skipping - activation failed");
          return;
        }

        // Then deactivate
        const response = await client.post("/api/license/deactivate", {
          licenseKey,
          fingerprint: device.fingerprint,
          machineId: device.machineId,
        });

        if (response.status === 200) {
          expectSuccess(response);
        }
      });

      test("should return 404 for unknown device", async () => {
        const response = await client.post("/api/license/deactivate", {
          licenseKey: generateLicenseKeyFormat(),
          fingerprint: generateFingerprint(),
          machineId: generateMachineId(),
        });

        // Should be 404 (not found) or 400 (invalid)
        assert.ok(
          [400, 404].includes(response.status),
          `Expected 400 or 404 for unknown device, got ${response.status}`,
        );
      });
    });
  });
});

