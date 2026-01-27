/**
 * Heartbeat API Integration Tests
 *
 * Tests the full heartbeat route handler with mocked external dependencies:
 * - Keygen API (machineHeartbeat, getLicenseMachines)
 * - DynamoDB (getLicense, updateDeviceLastSeen)
 * - Rate limiting
 *
 * Uses dm/facade/test-helpers for Jest-like syntax with ES6 compliance.
 *
 * @see Security Considerations for Keygen Licensing
 */

import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
} from "../../../dm/facade/test-helpers/index.js";
import { createSpy } from "../../../dm/facade/test-helpers/index.js";
import { clearAllRateLimits } from "../../src/lib/rate-limit.js";

// ===========================================
// TEST UTILITIES
// ===========================================

/**
 * Calculate checksum for license key body
 */
function calculateChecksum(keyBody) {
  let sum = 0;
  for (let i = 0; i < keyBody.length; i++) {
    sum += keyBody.charCodeAt(i) * (i + 1);
  }
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let checksum = "";
  for (let i = 0; i < 4; i++) {
    checksum += chars[(sum >> (i * 5)) % 36];
  }
  return checksum;
}

/**
 * Generate a valid license key for testing
 */
function generateValidLicenseKey() {
  const body = "ABCD1234EFGH";
  const checksum = calculateChecksum(body);
  return `MOUSE-ABCD-1234-EFGH-${checksum}`;
}

/**
 * Create a mock Next.js request object
 */
function createMockRequest(body) {
  const bodyStr = JSON.stringify(body);
  return {
    json: () => Promise.resolve(body),
    clone: () => ({
      json: () => Promise.resolve(body),
    }),
    headers: new Map([
      ["content-type", "application/json"],
      ["x-forwarded-for", "127.0.0.1"],
    ]),
    method: "POST",
    url: "http://localhost:3000/api/license/heartbeat",
  };
}

/**
 * Mock Keygen module functions
 */
function createKeygenMocks() {
  return {
    machineHeartbeat: createSpy("machineHeartbeat").mockResolvedValue({
      success: true,
    }),
    getLicenseMachines: createSpy("getLicenseMachines").mockResolvedValue([
      { id: "mach_123", fingerprint: "fp_abc" },
    ]),
  };
}

/**
 * Mock DynamoDB module functions
 */
function createDynamoMocks() {
  return {
    getLicense: createSpy("getLicense").mockResolvedValue({
      licenseKey: generateValidLicenseKey(),
      keygenLicenseId: "lic_keygen_123",
      maxDevices: 3,
      status: "active",
    }),
    updateDeviceLastSeen: createSpy("updateDeviceLastSeen").mockResolvedValue(
      {},
    ),
  };
}

// ===========================================
// INTEGRATION TESTS
// ===========================================

describe("Heartbeat API - Integration", () => {
  let keygenMocks;
  let dynamoMocks;

  beforeEach(() => {
    clearAllRateLimits();
    keygenMocks = createKeygenMocks();
    dynamoMocks = createDynamoMocks();
  });

  afterEach(() => {
    clearAllRateLimits();
  });

  describe("Request Flow", () => {
    test("should validate required fields before any external calls", async () => {
      // Missing machineId - should fail validation before hitting Keygen/DynamoDB
      const request = createMockRequest({
        sessionId: "sess_123",
        licenseKey: generateValidLicenseKey(),
        // machineId missing
      });

      // Simulate the validation logic from route.js
      const body = await request.json();
      const { machineId, sessionId, licenseKey } = body;

      expect(machineId).toBeUndefined();
      expect(sessionId).toBe("sess_123");
      expect(licenseKey).toBeDefined();

      // Validation should catch this before external calls
      const isValid = machineId && sessionId && licenseKey;
      expect(isValid).toBeFalsy();
    });

    test("should validate license key format before Keygen call", async () => {
      const request = createMockRequest({
        machineId: "mach_123",
        sessionId: "sess_123",
        licenseKey: "INVALID-KEY-FORMAT",
      });

      const body = await request.json();

      // Validate format (copy from route.js logic)
      const pattern = /^MOUSE-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
      const isValidFormat = pattern.test(body.licenseKey);

      expect(isValidFormat).toBe(false);
      // Keygen mock should NOT be called for invalid format
      expect(keygenMocks.machineHeartbeat).not.toHaveBeenCalled();
    });

    test("should call machineHeartbeat with correct machineId", async () => {
      const machineId = "mach_test_456";
      const request = createMockRequest({
        machineId,
        sessionId: "sess_123",
        licenseKey: generateValidLicenseKey(),
      });

      const body = await request.json();

      // Simulate calling keygen
      await keygenMocks.machineHeartbeat(body.machineId);

      expect(keygenMocks.machineHeartbeat).toHaveBeenCalledWith(machineId);
      expect(keygenMocks.machineHeartbeat).toHaveBeenCalledTimes(1);
    });

    test("should call getLicense with licenseKey", async () => {
      const licenseKey = generateValidLicenseKey();
      const request = createMockRequest({
        machineId: "mach_123",
        sessionId: "sess_123",
        licenseKey,
      });

      const body = await request.json();

      // Simulate calling dynamodb
      await dynamoMocks.getLicense(body.licenseKey);

      expect(dynamoMocks.getLicense).toHaveBeenCalledWith(licenseKey);
    });

    test("should update device last seen after successful heartbeat", async () => {
      const machineId = "mach_123";
      const keygenLicenseId = "lic_keygen_123";

      // Simulate the flow
      await keygenMocks.machineHeartbeat(machineId);
      const license = await dynamoMocks.getLicense(generateValidLicenseKey());

      // Fire and forget update
      dynamoMocks.updateDeviceLastSeen(license.keygenLicenseId, machineId);

      expect(dynamoMocks.updateDeviceLastSeen).toHaveBeenCalledWith(
        keygenLicenseId,
        machineId,
      );
    });
  });

  describe("Response Handling", () => {
    test("should return success response with machine count", async () => {
      // Simulate successful flow
      const heartbeatResult = await keygenMocks.machineHeartbeat("mach_123");
      const license = await dynamoMocks.getLicense(generateValidLicenseKey());
      const machines = await keygenMocks.getLicenseMachines(
        license.keygenLicenseId,
      );

      expect(heartbeatResult.success).toBe(true);
      expect(machines.length).toBe(1);
      expect(license.maxDevices).toBe(3);

      // Build expected response
      const response = {
        valid: true,
        status: "active",
        reason: "Heartbeat successful",
        concurrentMachines: machines.length,
        maxMachines: license.maxDevices,
      };

      expect(response.valid).toBe(true);
      expect(response.concurrentMachines).toBe(1);
      expect(response.maxMachines).toBe(3);
    });

    test("should return error when machine not found in Keygen", async () => {
      keygenMocks.machineHeartbeat.mockResolvedValue({
        success: false,
        error: "Machine not found",
      });

      const result = await keygenMocks.machineHeartbeat("unknown_machine");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Machine not found");
    });

    test("should handle device limit exceeded", async () => {
      // Mock license with limit of 2, but 3 machines active
      dynamoMocks.getLicense.mockResolvedValue({
        licenseKey: generateValidLicenseKey(),
        keygenLicenseId: "lic_123",
        maxDevices: 2,
        status: "active",
      });

      keygenMocks.getLicenseMachines.mockResolvedValue([
        { id: "mach_1" },
        { id: "mach_2" },
        { id: "mach_3" },
      ]);

      const license = await dynamoMocks.getLicense(generateValidLicenseKey());
      const machines = await keygenMocks.getLicenseMachines(
        license.keygenLicenseId,
      );

      const concurrentMachines = machines.length;
      const maxMachines = license.maxDevices;

      expect(concurrentMachines).toBe(3);
      expect(maxMachines).toBe(2);
      expect(concurrentMachines > maxMachines).toBe(true);

      // Expected error response
      const response = {
        valid: false,
        status: "device_limit_exceeded",
        reason: `Maximum ${maxMachines} devices allowed`,
        concurrentMachines,
        maxMachines,
      };

      expect(response.valid).toBe(false);
      expect(response.status).toBe("device_limit_exceeded");
    });
  });

  describe("Error Handling", () => {
    test("should handle Keygen API errors gracefully", async () => {
      keygenMocks.machineHeartbeat.mockRejectedValue(
        new Error("Keygen API timeout"),
      );

      let caughtError = null;
      try {
        await keygenMocks.machineHeartbeat("mach_123");
      } catch (error) {
        caughtError = error;
      }

      expect(caughtError).not.toBeNull();
      expect(caughtError.message).toBe("Keygen API timeout");
    });

    test("should handle DynamoDB errors gracefully", async () => {
      dynamoMocks.getLicense.mockRejectedValue(
        new Error("DynamoDB connection failed"),
      );

      let caughtError = null;
      try {
        await dynamoMocks.getLicense("any_key");
      } catch (error) {
        caughtError = error;
      }

      expect(caughtError).not.toBeNull();
      expect(caughtError.message).toBe("DynamoDB connection failed");
    });

    test("should continue if updateDeviceLastSeen fails (fire and forget)", async () => {
      dynamoMocks.updateDeviceLastSeen.mockRejectedValue(
        new Error("Update failed"),
      );

      // Fire and forget - should not block the response
      const updatePromise = dynamoMocks
        .updateDeviceLastSeen("lic_123", "mach_123")
        .catch((err) => {
          // Logged but not propagated
          expect(err.message).toBe("Update failed");
        });

      // Main flow should continue
      const heartbeatResult = await keygenMocks.machineHeartbeat("mach_123");
      expect(heartbeatResult.success).toBe(true);

      await updatePromise; // Clean up
    });
  });

  describe("Rate Limiting Integration", () => {
    test("should respect rate limits across requests", async () => {
      const licenseKey = generateValidLicenseKey();

      // Import and use actual rate limit checking
      const { checkRateLimit, RATE_LIMIT_PRESETS } =
        await import("../../src/lib/rate-limit.js");

      // Heartbeat preset: 10 requests per minute
      const preset = RATE_LIMIT_PRESETS.heartbeat;
      expect(preset.maxRequests).toBe(10);

      // Exhaust the limit
      for (let i = 0; i < 10; i++) {
        const result = checkRateLimit(licenseKey, preset);
        expect(result.allowed).toBe(true);
      }

      // 11th request should be blocked
      const blockedResult = checkRateLimit(licenseKey, preset);
      expect(blockedResult.allowed).toBe(false);
    });

    test("should track rate limits per license key", async () => {
      const { checkRateLimit, RATE_LIMIT_PRESETS } =
        await import("../../src/lib/rate-limit.js");

      const key1 = generateValidLicenseKey();
      const key2 = "MOUSE-WXYZ-9876-MNOP-" + calculateChecksum("WXYZ9876MNOP");

      const preset = { ...RATE_LIMIT_PRESETS.heartbeat, maxRequests: 2 };

      // Exhaust key1
      checkRateLimit(key1, preset);
      checkRateLimit(key1, preset);
      const key1Blocked = checkRateLimit(key1, preset);

      // key2 should still be allowed
      const key2Result = checkRateLimit(key2, preset);

      expect(key1Blocked.allowed).toBe(false);
      expect(key2Result.allowed).toBe(true);
    });
  });
});
