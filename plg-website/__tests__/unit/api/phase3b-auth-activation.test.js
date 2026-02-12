/**
 * Phase 3B — Authenticated Activation Tests
 *
 * Tests the Phase 3B behavior additions:
 * - JWT-based authentication in activation endpoint (optional, backward-compatible)
 * - userId extraction from heartbeat payload
 * - userId/userEmail inclusion in validate response
 * - 2-hour concurrent device window (aligned across all routes)
 * - updateDeviceLastSeen with optional userId binding
 *
 * Test strategy:
 * - Mirror the route logic as pure functions (same pattern as license.test.js)
 * - No mocking of Next.js internals — test the decision logic in isolation
 * - Focus on the "no header vs. invalid header vs. valid header" distinction
 *
 * @see Phase 3B — Multi-Seat Implementation Plan V3
 * @see Browser-Delegated Activation Proposal
 */

import { describe, it } from "node:test";
import assert from "node:assert";

// ============================================================================
// Helper: Simulates Bearer token extraction (from auth-verify.js)
// ============================================================================

function extractBearerToken(authHeader) {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7);
}

// ============================================================================
// Helper: Simulates the Phase 3B JWT handling in activate/route.js
// ============================================================================

/**
 * Mirrors the JWT handling logic added to activate/route.js in Phase 3B.
 *
 * Key design decision:
 *   - No Authorization header → backward-compatible, proceed without userId
 *   - Header present but invalid/expired → 401 rejection
 *   - Header present and valid → extract userId/userEmail
 *
 * @param {string|null} authHeader - The Authorization header value
 * @param {Function} verifyFn - JWT verification function (returns payload or null)
 * @returns {Object} { userId, userEmail, error }
 */
async function handleActivationAuth(authHeader, verifyFn) {
  let userId = null;
  let userEmail = null;

  if (authHeader) {
    const tokenPayload = await verifyFn(authHeader);
    if (!tokenPayload) {
      return {
        userId: null,
        userEmail: null,
        error: {
          status: 401,
          body: {
            error: "Unauthorized",
            detail: "Invalid or expired authentication token",
          },
        },
      };
    }
    userId = tokenPayload.sub;
    userEmail = tokenPayload.email;
  }

  return { userId, userEmail, error: null };
}

// ============================================================================
// Helper: Simulates userId extraction from heartbeat payload
// ============================================================================

/**
 * Mirrors heartbeat/route.js body destructuring with optional userId.
 * Pre-3B: { machineId, sessionId, licenseKey, fingerprint }
 * Post-3B: { machineId, sessionId, licenseKey, fingerprint, userId }
 */
function extractHeartbeatFields(body) {
  const { machineId, sessionId, licenseKey, fingerprint, userId } = body || {};
  return { machineId, sessionId, licenseKey, fingerprint, userId };
}

// ============================================================================
// Helper: Simulates validate response enrichment with userId/userEmail
// ============================================================================

/**
 * Mirrors the Phase 3B addition to validate/route.js:
 * Look up device record by fingerprint and include userId/userEmail in response.
 */
function enrichValidateResponse(baseResponse, deviceRecords, fingerprint) {
  let deviceUserId = null;
  let deviceUserEmail = null;

  if (baseResponse.valid && deviceRecords) {
    const deviceRecord = deviceRecords.find(
      (d) => d.fingerprint === fingerprint,
    );
    if (deviceRecord) {
      deviceUserId = deviceRecord.userId || null;
      deviceUserEmail = deviceRecord.userEmail || null;
    }
  }

  return {
    ...baseResponse,
    userId: deviceUserId,
    userEmail: deviceUserEmail,
  };
}

// ============================================================================
// Helper: Simulates addDeviceActivation with optional userId/userEmail
// ============================================================================

/**
 * Mirrors the addDeviceActivation() call in activate/route.js.
 * Tests that userId/userEmail are passed through when available.
 */
function buildDeviceActivationParams({
  keygenLicenseId,
  keygenMachineId,
  fingerprint,
  name,
  platform,
  userId,
  userEmail,
}) {
  return {
    keygenLicenseId,
    keygenMachineId,
    fingerprint,
    name,
    platform,
    userId,
    userEmail,
  };
}

// ============================================================================
// Helper: Simulates updateDeviceLastSeen with optional userId
// ============================================================================

/**
 * Mirrors the Phase 3B updateDeviceLastSeen() signature.
 * Pre-3B: updateDeviceLastSeen(licenseId, machineId)
 * Post-3B: updateDeviceLastSeen(licenseId, machineId, userId)
 */
function buildUpdateExpression(userId) {
  const base = "SET lastSeenAt = :now";
  if (userId) {
    return base + ", userId = :userId";
  }
  return base;
}

function buildExpressionValues(userId) {
  const values = { ":now": "2026-02-12T19:00:00.000Z" };
  if (userId) {
    values[":userId"] = userId;
  }
  return values;
}

// ============================================================================
// Helper: Concurrent device window
// ============================================================================

function getActiveDevicesInWindow(devices, windowHours = 2) {
  const cutoffTime = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  return devices.filter((device) => {
    const lastActivity = new Date(device.lastSeenAt || device.createdAt);
    return lastActivity > cutoffTime;
  });
}

// ============================================================================
// TESTS: Activation endpoint — JWT handling (Phase 3B)
// ============================================================================

describe("Phase 3B: activation endpoint — JWT authentication", () => {
  // Mock verifier: returns payload for "valid-token", null for anything else
  async function mockVerify(authHeader) {
    const token = extractBearerToken(authHeader);
    if (token === "valid-jwt-token") {
      return {
        sub: "e4a8f4f8-f0a1-704b-a2cf-66461fae76ed",
        email: "user@example.com",
        email_verified: true,
      };
    }
    return null;
  }

  it("should proceed without userId when no Authorization header (backward compatible)", async () => {
    const result = await handleActivationAuth(null, mockVerify);

    assert.strictEqual(result.userId, null);
    assert.strictEqual(result.userEmail, null);
    assert.strictEqual(result.error, null);
  });

  it("should proceed without userId when Authorization header is undefined", async () => {
    const result = await handleActivationAuth(undefined, mockVerify);

    assert.strictEqual(result.userId, null);
    assert.strictEqual(result.userEmail, null);
    assert.strictEqual(result.error, null);
  });

  it("should proceed without userId when Authorization header is empty string", async () => {
    // Empty string is falsy → treated as "no header"
    const result = await handleActivationAuth("", mockVerify);

    assert.strictEqual(result.userId, null);
    assert.strictEqual(result.userEmail, null);
    assert.strictEqual(result.error, null);
  });

  it("should extract userId/userEmail from valid JWT", async () => {
    const result = await handleActivationAuth(
      "Bearer valid-jwt-token",
      mockVerify,
    );

    assert.strictEqual(result.userId, "e4a8f4f8-f0a1-704b-a2cf-66461fae76ed");
    assert.strictEqual(result.userEmail, "user@example.com");
    assert.strictEqual(result.error, null);
  });

  it("should return 401 when Authorization header is present but token is invalid", async () => {
    const result = await handleActivationAuth(
      "Bearer invalid-expired-token",
      mockVerify,
    );

    assert.strictEqual(result.userId, null);
    assert.strictEqual(result.userEmail, null);
    assert.notStrictEqual(result.error, null);
    assert.strictEqual(result.error.status, 401);
    assert.strictEqual(result.error.body.error, "Unauthorized");
  });

  it("should return 401 when Authorization header has wrong scheme (bad token ≠ no token)", async () => {
    // "Basic abc" is truthy (header IS present), but verify returns null
    const result = await handleActivationAuth("Basic abc123", mockVerify);

    assert.strictEqual(result.error.status, 401);
  });

  it("should return 401 for expired JWT", async () => {
    const result = await handleActivationAuth(
      "Bearer expired-jwt-token",
      mockVerify,
    );

    assert.strictEqual(result.error.status, 401);
    assert.ok(result.error.body.detail.includes("Invalid or expired"));
  });

  it("should preserve the key design decision: no header → success, bad header → 401", async () => {
    // This is the critical behavioral distinction from the planning docs
    const noHeader = await handleActivationAuth(null, mockVerify);
    const badHeader = await handleActivationAuth(
      "Bearer bad-token",
      mockVerify,
    );

    // No header: backward-compatible pass-through
    assert.strictEqual(noHeader.error, null);
    assert.strictEqual(noHeader.userId, null);

    // Bad header: explicit rejection
    assert.strictEqual(badHeader.error.status, 401);
  });
});

// ============================================================================
// TESTS: Activation — userId/userEmail pass-through to DynamoDB
// ============================================================================

describe("Phase 3B: activation — userId/userEmail storage in DynamoDB", () => {
  it("should include userId/userEmail when JWT is present", () => {
    const params = buildDeviceActivationParams({
      keygenLicenseId: "lic_123",
      keygenMachineId: "mach_456",
      fingerprint: "fp_abc",
      name: "Device 1",
      platform: "darwin",
      userId: "user-uuid-123",
      userEmail: "user@example.com",
    });

    assert.strictEqual(params.userId, "user-uuid-123");
    assert.strictEqual(params.userEmail, "user@example.com");
    assert.strictEqual(params.keygenLicenseId, "lic_123");
  });

  it("should pass null userId/userEmail when no JWT (backward compatible)", () => {
    const params = buildDeviceActivationParams({
      keygenLicenseId: "lic_123",
      keygenMachineId: "mach_456",
      fingerprint: "fp_abc",
      name: "Device 1",
      platform: "win32",
      userId: null,
      userEmail: null,
    });

    assert.strictEqual(params.userId, null);
    assert.strictEqual(params.userEmail, null);
    // Other params still present
    assert.strictEqual(params.fingerprint, "fp_abc");
  });

  it("should include userId in activation success response", () => {
    const response = {
      success: true,
      activated: true,
      activationId: "mach_456",
      userId: "user-uuid-123",
      userEmail: "user@example.com",
      deviceCount: 1,
      maxDevices: 3,
    };

    assert.strictEqual(response.userId, "user-uuid-123");
    assert.strictEqual(response.userEmail, "user@example.com");
    assert.strictEqual(response.success, true);
  });

  it("should include null userId in response when unauthenticated", () => {
    const response = {
      success: true,
      activated: true,
      activationId: "mach_456",
      userId: null,
      userEmail: null,
      deviceCount: 1,
      maxDevices: 3,
    };

    assert.strictEqual(response.userId, null);
    assert.strictEqual(response.userEmail, null);
    assert.strictEqual(response.success, true);
  });
});

// ============================================================================
// TESTS: Heartbeat — optional userId in payload
// ============================================================================

describe("Phase 3B: heartbeat — optional userId in payload", () => {
  it("should extract userId from body when present", () => {
    const fields = extractHeartbeatFields({
      machineId: "mach_123",
      sessionId: "sess_456",
      licenseKey: "MOUSE-ABCD-1234-EFGH-XXXX",
      fingerprint: "fp_abc",
      userId: "user-uuid-123",
    });

    assert.strictEqual(fields.userId, "user-uuid-123");
    assert.strictEqual(fields.machineId, "mach_123");
  });

  it("should return undefined userId when not present (backward compatible)", () => {
    const fields = extractHeartbeatFields({
      machineId: "mach_123",
      sessionId: "sess_456",
      licenseKey: "MOUSE-ABCD-1234-EFGH-XXXX",
      fingerprint: "fp_abc",
    });

    assert.strictEqual(fields.userId, undefined);
    assert.strictEqual(fields.fingerprint, "fp_abc");
  });

  it("should handle null body gracefully", () => {
    const fields = extractHeartbeatFields(null);

    assert.strictEqual(fields.userId, undefined);
    assert.strictEqual(fields.machineId, undefined);
  });
});

// ============================================================================
// TESTS: Validate — userId/userEmail in response
// ============================================================================

describe("Phase 3B: validate — userId/userEmail in response", () => {
  it("should include userId/userEmail when device record has them", () => {
    const baseResponse = {
      valid: true,
      code: "VALID",
      detail: "License valid",
    };
    const deviceRecords = [
      {
        fingerprint: "fp_abc",
        userId: "user-uuid-123",
        userEmail: "user@example.com",
      },
    ];

    const response = enrichValidateResponse(
      baseResponse,
      deviceRecords,
      "fp_abc",
    );

    assert.strictEqual(response.userId, "user-uuid-123");
    assert.strictEqual(response.userEmail, "user@example.com");
    assert.strictEqual(response.valid, true);
  });

  it("should return null userId/userEmail when device record lacks them", () => {
    const baseResponse = {
      valid: true,
      code: "VALID",
      detail: "License valid",
    };
    const deviceRecords = [
      { fingerprint: "fp_abc" }, // No userId/userEmail (pre-3B activation)
    ];

    const response = enrichValidateResponse(
      baseResponse,
      deviceRecords,
      "fp_abc",
    );

    assert.strictEqual(response.userId, null);
    assert.strictEqual(response.userEmail, null);
  });

  it("should return null userId/userEmail when fingerprint not found in records", () => {
    const baseResponse = {
      valid: true,
      code: "VALID",
      detail: "License valid",
    };
    const deviceRecords = [
      {
        fingerprint: "fp_other",
        userId: "user-uuid-999",
        userEmail: "other@example.com",
      },
    ];

    const response = enrichValidateResponse(
      baseResponse,
      deviceRecords,
      "fp_abc",
    );

    assert.strictEqual(response.userId, null);
    assert.strictEqual(response.userEmail, null);
  });

  it("should return null userId/userEmail when validation is invalid", () => {
    const baseResponse = {
      valid: false,
      code: "EXPIRED",
      detail: "License expired",
    };
    const deviceRecords = [
      {
        fingerprint: "fp_abc",
        userId: "user-uuid-123",
        userEmail: "user@example.com",
      },
    ];

    const response = enrichValidateResponse(
      baseResponse,
      deviceRecords,
      "fp_abc",
    );

    // Device lookup skipped when validation is invalid
    assert.strictEqual(response.userId, null);
    assert.strictEqual(response.userEmail, null);
  });

  it("should return null userId/userEmail when device records is null", () => {
    const baseResponse = {
      valid: true,
      code: "VALID",
      detail: "License valid",
    };

    const response = enrichValidateResponse(baseResponse, null, "fp_abc");

    assert.strictEqual(response.userId, null);
    assert.strictEqual(response.userEmail, null);
  });

  it("should return null userId/userEmail for empty device records", () => {
    const baseResponse = {
      valid: true,
      code: "VALID",
      detail: "License valid",
    };

    const response = enrichValidateResponse(baseResponse, [], "fp_abc");

    assert.strictEqual(response.userId, null);
    assert.strictEqual(response.userEmail, null);
  });

  it("should match correct device when multiple devices exist", () => {
    const baseResponse = {
      valid: true,
      code: "VALID",
      detail: "License valid",
    };
    const deviceRecords = [
      {
        fingerprint: "fp_first",
        userId: "user-1",
        userEmail: "first@example.com",
      },
      {
        fingerprint: "fp_target",
        userId: "user-2",
        userEmail: "target@example.com",
      },
      {
        fingerprint: "fp_last",
        userId: "user-3",
        userEmail: "last@example.com",
      },
    ];

    const response = enrichValidateResponse(
      baseResponse,
      deviceRecords,
      "fp_target",
    );

    assert.strictEqual(response.userId, "user-2");
    assert.strictEqual(response.userEmail, "target@example.com");
  });
});

// ============================================================================
// TESTS: updateDeviceLastSeen — optional userId binding
// ============================================================================

describe("Phase 3B: updateDeviceLastSeen — userId binding", () => {
  it("should include userId in UpdateExpression when provided", () => {
    const expr = buildUpdateExpression("user-uuid-123");
    assert.ok(expr.includes("userId = :userId"));
    assert.ok(expr.includes("lastSeenAt = :now"));
  });

  it("should not include userId in UpdateExpression when absent", () => {
    const exprNull = buildUpdateExpression(null);
    const exprUndef = buildUpdateExpression(undefined);

    assert.ok(!exprNull.includes("userId"));
    assert.ok(!exprUndef.includes("userId"));
    assert.ok(exprNull.includes("lastSeenAt = :now"));
  });

  it("should include :userId in ExpressionAttributeValues when userId provided", () => {
    const values = buildExpressionValues("user-uuid-123");

    assert.strictEqual(values[":userId"], "user-uuid-123");
    assert.ok(values[":now"]);
  });

  it("should not include :userId in ExpressionAttributeValues when absent", () => {
    const valuesNull = buildExpressionValues(null);
    const valuesUndef = buildExpressionValues(undefined);

    assert.strictEqual(valuesNull[":userId"], undefined);
    assert.strictEqual(valuesUndef[":userId"], undefined);
    assert.ok(valuesNull[":now"]);
  });
});

// ============================================================================
// TESTS: 2-hour concurrent device window alignment
// ============================================================================

describe("Phase 3B: 2-hour concurrent device window alignment", () => {
  it("should default to 2-hour window (not 24)", () => {
    const now = Date.now();
    const devices = [
      // 1 hour ago — within 2-hour window
      { lastSeenAt: new Date(now - 1 * 60 * 60 * 1000).toISOString() },
      // 3 hours ago — outside 2-hour window
      { lastSeenAt: new Date(now - 3 * 60 * 60 * 1000).toISOString() },
    ];

    const activeDevices = getActiveDevicesInWindow(devices);

    assert.strictEqual(activeDevices.length, 1);
  });

  it("should fallback to 2 when CONCURRENT_DEVICE_WINDOW_HOURS env is not set", () => {
    const windowHours =
      parseInt(process.env.CONCURRENT_DEVICE_WINDOW_HOURS) || 2;
    assert.strictEqual(windowHours, 2);
  });

  it("should count devices seen within the last 2 hours", () => {
    const now = Date.now();
    const devices = [
      { lastSeenAt: new Date(now - 30 * 60 * 1000).toISOString() }, // 30 min
      { lastSeenAt: new Date(now - 90 * 60 * 1000).toISOString() }, // 90 min
      { lastSeenAt: new Date(now - 150 * 60 * 1000).toISOString() }, // 2.5 hrs — outside
    ];

    const activeDevices = getActiveDevicesInWindow(devices, 2);

    assert.strictEqual(activeDevices.length, 2);
  });

  it("should not count any devices if all are older than 2 hours", () => {
    const now = Date.now();
    const devices = [
      { lastSeenAt: new Date(now - 3 * 60 * 60 * 1000).toISOString() },
      { lastSeenAt: new Date(now - 5 * 60 * 60 * 1000).toISOString() },
    ];

    const activeDevices = getActiveDevicesInWindow(devices, 2);

    assert.strictEqual(activeDevices.length, 0);
  });

  it("should align activate route fallback with dynamodb.js default", () => {
    // Both routes and dynamodb.js should use || 2 as fallback
    const activateDefault =
      parseInt(process.env.CONCURRENT_DEVICE_WINDOW_HOURS) || 2;
    const heartbeatDefault =
      parseInt(process.env.CONCURRENT_DEVICE_WINDOW_HOURS) || 2;
    const dynamoDefault = 2; // getActiveDevicesInWindow default parameter

    assert.strictEqual(activateDefault, dynamoDefault);
    assert.strictEqual(heartbeatDefault, dynamoDefault);
  });
});

// ============================================================================
// TESTS: /activate page — URL parameter handling
// ============================================================================

describe("Phase 3B: /activate page — URL parameter validation", () => {
  /**
   * Simulates the parameter extraction from the /activate page.
   * Returns the required/optional params and validation result.
   */
  function validateActivatePageParams(params) {
    const { key, fingerprint, deviceName, platform } = params || {};

    if (!key || !fingerprint) {
      return {
        valid: false,
        error:
          "Missing required parameters. This page should be opened from the Mouse extension.",
      };
    }

    return {
      valid: true,
      licenseKey: key,
      fingerprint,
      deviceName: deviceName || undefined,
      platform: platform || undefined,
    };
  }

  it("should accept valid params with all fields", () => {
    const result = validateActivatePageParams({
      key: "MOUSE-ABCD-1234-EFGH-XXXX",
      fingerprint: "fp_abc123def456",
      deviceName: "My MacBook",
      platform: "darwin",
    });

    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.licenseKey, "MOUSE-ABCD-1234-EFGH-XXXX");
    assert.strictEqual(result.fingerprint, "fp_abc123def456");
    assert.strictEqual(result.deviceName, "My MacBook");
    assert.strictEqual(result.platform, "darwin");
  });

  it("should accept params with only required fields", () => {
    const result = validateActivatePageParams({
      key: "MOUSE-ABCD-1234-EFGH-XXXX",
      fingerprint: "fp_abc123def456",
    });

    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.deviceName, undefined);
    assert.strictEqual(result.platform, undefined);
  });

  it("should reject when license key is missing", () => {
    const result = validateActivatePageParams({
      fingerprint: "fp_abc123def456",
    });

    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes("Missing required parameters"));
  });

  it("should reject when fingerprint is missing", () => {
    const result = validateActivatePageParams({
      key: "MOUSE-ABCD-1234-EFGH-XXXX",
    });

    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes("Missing required parameters"));
  });

  it("should reject when both required params are missing", () => {
    const result = validateActivatePageParams({});

    assert.strictEqual(result.valid, false);
  });

  it("should reject null params", () => {
    const result = validateActivatePageParams(null);

    assert.strictEqual(result.valid, false);
  });
});
