/**
 * License API Route Tests
 *
 * Tests the license validation, activation, and deactivation logic:
 * - Input validation
 * - Validation result handling
 * - Device limit checking
 * - Ownership verification
 */

import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert";

// Auth0 namespace for custom claims
const AUTH_NAMESPACE = "https://hic-ai.com";

// Helper to create mock Auth0 session
function createMockSession(userOverrides = {}) {
  return {
    user: {
      sub: "auth0|test123",
      email: "test@example.com",
      email_verified: true,
      ...userOverrides,
    },
  };
}

describe("license/validate API logic", () => {
  function validateInput(body) {
    const { licenseKey, fingerprint } = body || {};

    if (!licenseKey) {
      return { valid: false, error: "License key is required", status: 400 };
    }

    if (!fingerprint) {
      return {
        valid: false,
        error: "Device fingerprint is required",
        status: 400,
      };
    }

    return { valid: true };
  }

  function formatValidationResponse(result, { machineId = null, userId = null, userEmail = null } = {}) {
    return {
      valid: result.valid,
      code: result.code,
      detail: result.detail,
      userId,
      userEmail,
      machineId,
      license: result.license
        ? {
            status: result.license.status,
            expiresAt: result.license.expiresAt,
          }
        : null,
    };
  }

  describe("input validation", () => {
    it("should reject missing license key", () => {
      const result = validateInput({ fingerprint: "fp_123" });
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, "License key is required");
      assert.strictEqual(result.status, 400);
    });

    it("should reject empty license key", () => {
      const result = validateInput({ licenseKey: "", fingerprint: "fp_123" });
      assert.strictEqual(result.valid, false);
    });

    it("should reject missing fingerprint", () => {
      const result = validateInput({ licenseKey: "lic_123" });
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, "Device fingerprint is required");
    });

    it("should accept valid input", () => {
      const result = validateInput({
        licenseKey: "lic_123",
        fingerprint: "fp_456",
      });
      assert.strictEqual(result.valid, true);
    });
  });

  describe("validation response formatting", () => {
    it("should format successful validation", () => {
      const keygenResult = {
        valid: true,
        code: "VALID",
        detail: "License is valid",
        license: {
          id: "lic_123",
          status: "active",
          expiresAt: "2027-01-01T00:00:00Z",
          extra: "ignored",
        },
      };

      const response = formatValidationResponse(keygenResult);

      assert.strictEqual(response.valid, true);
      assert.strictEqual(response.code, "VALID");
      assert.strictEqual(response.detail, "License is valid");
      assert.strictEqual(response.license.status, "active");
      assert.strictEqual(response.license.expiresAt, "2027-01-01T00:00:00Z");
      assert.strictEqual(response.license.id, undefined); // Should be excluded
      // New fields default to null when not provided
      assert.strictEqual(response.machineId, null);
      assert.strictEqual(response.userId, null);
      assert.strictEqual(response.userEmail, null);
    });

    it("should include machineId when provided", () => {
      const keygenResult = {
        valid: true,
        code: "VALID",
        detail: "License is valid",
        license: { id: "lic_123", status: "active", expiresAt: "2027-01-01T00:00:00Z" },
      };

      const response = formatValidationResponse(keygenResult, {
        machineId: "mach_abc123",
        userId: "user_001",
        userEmail: "test@example.com",
      });

      assert.strictEqual(response.machineId, "mach_abc123");
      assert.strictEqual(response.userId, "user_001");
      assert.strictEqual(response.userEmail, "test@example.com");
      assert.strictEqual(response.valid, true);
    });

    it("should format invalid validation", () => {
      const keygenResult = {
        valid: false,
        code: "EXPIRED",
        detail: "License has expired",
        license: null,
      };

      const response = formatValidationResponse(keygenResult);

      assert.strictEqual(response.valid, false);
      assert.strictEqual(response.code, "EXPIRED");
      assert.strictEqual(response.license, null);
    });

    it("should handle missing license in response", () => {
      const keygenResult = {
        valid: false,
        code: "NOT_FOUND",
        detail: "License not found",
      };

      const response = formatValidationResponse(keygenResult);
      assert.strictEqual(response.license, null);
    });
  });
});

describe("validate endpoint — device lookup for machineId/userId/userEmail", () => {
  /**
   * Mirrors the device lookup logic in validate/route.js lines 220-237.
   * After Keygen validation succeeds, we look up the DDB device record
   * to include machineId, userId, and userEmail in the response.
   * This is critical for browser-delegated activation polling.
   */
  function extractDeviceIdentity(devices, fingerprint) {
    const deviceRecord = devices.find((d) => d.fingerprint === fingerprint);
    return {
      machineId: deviceRecord?.keygenMachineId || null,
      userId: deviceRecord?.userId || null,
      userEmail: deviceRecord?.userEmail || null,
    };
  }

  it("should extract machineId from matching device record", () => {
    const devices = [
      { fingerprint: "fp_aaa", keygenMachineId: "mach_111", userId: "u1", userEmail: "a@test.com" },
      { fingerprint: "fp_bbb", keygenMachineId: "mach_222", userId: "u2", userEmail: "b@test.com" },
    ];
    const result = extractDeviceIdentity(devices, "fp_bbb");

    assert.strictEqual(result.machineId, "mach_222");
    assert.strictEqual(result.userId, "u2");
    assert.strictEqual(result.userEmail, "b@test.com");
  });

  it("should return nulls when no matching device found", () => {
    const devices = [
      { fingerprint: "fp_aaa", keygenMachineId: "mach_111", userId: "u1", userEmail: "a@test.com" },
    ];
    const result = extractDeviceIdentity(devices, "fp_nonexistent");

    assert.strictEqual(result.machineId, null);
    assert.strictEqual(result.userId, null);
    assert.strictEqual(result.userEmail, null);
  });

  it("should return nulls when devices array is empty", () => {
    const result = extractDeviceIdentity([], "fp_aaa");

    assert.strictEqual(result.machineId, null);
    assert.strictEqual(result.userId, null);
    assert.strictEqual(result.userEmail, null);
  });

  it("should handle device record missing keygenMachineId", () => {
    const devices = [
      { fingerprint: "fp_aaa", userId: "u1", userEmail: "a@test.com" },
    ];
    const result = extractDeviceIdentity(devices, "fp_aaa");

    assert.strictEqual(result.machineId, null);
    assert.strictEqual(result.userId, "u1");
    assert.strictEqual(result.userEmail, "a@test.com");
  });

  it("should handle device record with empty string values", () => {
    const devices = [
      { fingerprint: "fp_aaa", keygenMachineId: "", userId: "", userEmail: "" },
    ];
    const result = extractDeviceIdentity(devices, "fp_aaa");

    // Empty strings are falsy, should fall through to null
    assert.strictEqual(result.machineId, null);
    assert.strictEqual(result.userId, null);
    assert.strictEqual(result.userEmail, null);
  });

  it("should match first device by fingerprint when duplicates exist", () => {
    const devices = [
      { fingerprint: "fp_aaa", keygenMachineId: "mach_first" },
      { fingerprint: "fp_aaa", keygenMachineId: "mach_second" },
    ];
    const result = extractDeviceIdentity(devices, "fp_aaa");

    assert.strictEqual(result.machineId, "mach_first");
  });
});

describe("validate endpoint — heartbeat gating logic", () => {
  /**
   * Mirrors the heartbeat conditional in validate/route.js lines 205-213.
   * Keygen machineHeartbeat() requires a real machine UUID.
   * If only fingerprint is available, we skip the Keygen ping
   * to avoid silent 404 failures.
   */
  function buildHeartbeatTasks(machineId, fingerprint, licenseId) {
    const trackingId = machineId || fingerprint;
    const tasks = [{ type: "updateDeviceLastSeen", licenseId, trackingId }];
    if (machineId) {
      tasks.push({ type: "machineHeartbeat", machineId });
    }
    return tasks;
  }

  it("should include Keygen heartbeat when machineId is provided", () => {
    const tasks = buildHeartbeatTasks("mach_real_uuid", "fp_abc", "lic_123");

    assert.strictEqual(tasks.length, 2);
    assert.strictEqual(tasks[0].type, "updateDeviceLastSeen");
    assert.strictEqual(tasks[0].trackingId, "mach_real_uuid");
    assert.strictEqual(tasks[1].type, "machineHeartbeat");
    assert.strictEqual(tasks[1].machineId, "mach_real_uuid");
  });

  it("should skip Keygen heartbeat when only fingerprint available", () => {
    const tasks = buildHeartbeatTasks(undefined, "fp_abc", "lic_123");

    assert.strictEqual(tasks.length, 1);
    assert.strictEqual(tasks[0].type, "updateDeviceLastSeen");
    assert.strictEqual(tasks[0].trackingId, "fp_abc");
  });

  it("should skip Keygen heartbeat when machineId is null", () => {
    const tasks = buildHeartbeatTasks(null, "fp_abc", "lic_123");

    assert.strictEqual(tasks.length, 1);
    assert.strictEqual(tasks[0].type, "updateDeviceLastSeen");
    assert.strictEqual(tasks[0].trackingId, "fp_abc");
  });

  it("should skip Keygen heartbeat when machineId is empty string", () => {
    const tasks = buildHeartbeatTasks("", "fp_abc", "lic_123");

    assert.strictEqual(tasks.length, 1);
    assert.strictEqual(tasks[0].type, "updateDeviceLastSeen");
    assert.strictEqual(tasks[0].trackingId, "fp_abc");
  });

  it("should use machineId as trackingId in updateDeviceLastSeen when available", () => {
    const tasks = buildHeartbeatTasks("mach_uuid", "fp_abc", "lic_123");

    assert.strictEqual(tasks[0].trackingId, "mach_uuid");
  });

  it("should fall back to fingerprint as trackingId when no machineId", () => {
    const tasks = buildHeartbeatTasks(null, "fp_fallback", "lic_123");

    assert.strictEqual(tasks[0].trackingId, "fp_fallback");
  });
});

describe("extension poll condition — machineId in validate response", () => {
  /**
   * Mirrors the extension's pollActivationStatus() check in
   * hic/licensing/http-client.js lines 166-170:
   *
   *   if (rawResponse.valid === true && rawResponse.machineId) {
   *     return { success: true, machineId: rawResponse.machineId };
   *   }
   *
   * This was the root cause of the activation bug: the validate response
   * didn't include machineId, so polls always timed out.
   */
  function checkPollCondition(response) {
    if (response.valid === true && response.machineId) {
      return { success: true, machineId: response.machineId };
    }
    return null; // Keep polling
  }

  it("should succeed when response has valid=true AND machineId", () => {
    const response = {
      valid: true,
      code: "VALID",
      machineId: "mach_abc123",
      userId: "user_001",
      license: { status: "active" },
    };
    const result = checkPollCondition(response);

    assert.notStrictEqual(result, null);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.machineId, "mach_abc123");
  });

  it("should keep polling when valid=true but machineId is null (pre-fix behavior)", () => {
    const response = {
      valid: true,
      code: "VALID",
      machineId: null,
      license: { status: "active" },
    };
    const result = checkPollCondition(response);

    assert.strictEqual(result, null); // Keep polling
  });

  it("should keep polling when valid=true but machineId is missing entirely", () => {
    const response = {
      valid: true,
      code: "VALID",
      license: { status: "active" },
    };
    const result = checkPollCondition(response);

    assert.strictEqual(result, null); // This was the original bug
  });

  it("should keep polling when valid=false even with machineId", () => {
    const response = {
      valid: false,
      code: "FINGERPRINT_SCOPE_MISMATCH",
      machineId: "mach_abc123",
    };
    const result = checkPollCondition(response);

    assert.strictEqual(result, null); // Device not activated yet
  });

  it("should keep polling when valid=false and no machineId", () => {
    const response = {
      valid: false,
      code: "NO_MACHINES",
      machineId: null,
    };
    const result = checkPollCondition(response);

    assert.strictEqual(result, null);
  });

  it("should keep polling when response has empty string machineId", () => {
    const response = {
      valid: true,
      code: "VALID",
      machineId: "",
    };
    const result = checkPollCondition(response);

    assert.strictEqual(result, null); // Empty string is falsy
  });
});


describe("license/activate API logic", () => {
  function validateActivationInput(body) {
    const { licenseKey, fingerprint } = body || {};

    if (!licenseKey) {
      return { valid: false, error: "License key is required", status: 400 };
    }

    if (!fingerprint) {
      return {
        valid: false,
        error: "Device fingerprint is required",
        status: 400,
      };
    }

    return { valid: true };
  }

  /**
   * Handle validation result from validateLicense()
   * This mirrors the logic in /api/license/activate/route.js
   *
   * Flow:
   * 1. If valid=true → device already activated, return early success
   * 2. If valid=false with NO_MACHINES or FINGERPRINT_SCOPE_MISMATCH → proceed to activation
   * 3. If valid=false with other codes → return error
   */
  function handleValidationResult(validation) {
    // Check if device is already activated (idempotent success)
    if (validation.valid) {
      return {
        success: true,
        alreadyActivated: true,
        license: validation.license,
        message: "Device already activated",
      };
    }

    // Device not activated yet - these are expected cases, continue to activation
    if (validation.code === "FINGERPRINT_SCOPE_MISMATCH" || validation.code === "NO_MACHINES") {
      return null; // Continue to activation
    }

    // Other validation errors (EXPIRED, SUSPENDED, NOT_FOUND, etc.)
    return {
      error: "License validation failed",
      code: validation.code,
      detail: validation.detail,
      status: 400,
    };
  }

  /**
   * Safety check: ensure license data is available before proceeding
   */
  function checkLicenseDataAvailable(validation) {
    if (!validation.license?.id) {
      return {
        error: "License data unavailable",
        code: "LICENSE_DATA_MISSING",
        detail: "Unable to retrieve license details for activation",
        status: 400,
      };
    }
    return null; // License data available, continue
  }

  function checkDeviceLimit(license, dynamoLicense) {
    if (!license.maxMachines) {
      return { withinLimit: true };
    }

    if (
      dynamoLicense &&
      dynamoLicense.activatedDevices >= license.maxMachines
    ) {
      return {
        withinLimit: false,
        error: "Device limit reached",
        maxDevices: license.maxMachines,
        currentDevices: dynamoLicense.activatedDevices,
      };
    }

    return { withinLimit: true };
  }

  describe("input validation", () => {
    it("should reject missing license key", () => {
      const result = validateActivationInput({ fingerprint: "fp_123" });
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, "License key is required");
    });

    it("should reject missing fingerprint", () => {
      const result = validateActivationInput({ licenseKey: "lic_123" });
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, "Device fingerprint is required");
    });

    it("should accept valid input", () => {
      const result = validateActivationInput({
        licenseKey: "lic_123",
        fingerprint: "fp_456",
      });
      assert.strictEqual(result.valid, true);
    });
  });

  describe("validation result handling", () => {
    // Scenario 1: Device already activated (idempotent success)
    it("should return idempotent success when device is already activated (valid=true)", () => {
      const result = handleValidationResult({
        valid: true,
        code: "VALID",
        license: { id: "lic_123", status: "ACTIVE" },
      });
      // Returns early success - idempotent behavior
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.alreadyActivated, true);
      assert.strictEqual(result.license.id, "lic_123");
      assert.strictEqual(result.message, "Device already activated");
    });

    // Scenario 2: Fresh license with no devices yet
    it("should continue to activation on NO_MACHINES (fresh license)", () => {
      const result = handleValidationResult({
        valid: false,
        code: "NO_MACHINES",
        detail: "License has no machines",
        license: { id: "lic_456" },
      });
      assert.strictEqual(result, null); // Continue to activation
    });

    // Scenario 3: License has devices but not this one
    it("should continue to activation on FINGERPRINT_SCOPE_MISMATCH (new device)", () => {
      const result = handleValidationResult({
        valid: false,
        code: "FINGERPRINT_SCOPE_MISMATCH",
        detail: "Device not activated",
        license: { id: "lic_789" },
      });
      assert.strictEqual(result, null); // Continue to activation
    });

    // Scenario 4: License expired
    it("should return error for expired license", () => {
      const result = handleValidationResult({
        valid: false,
        code: "EXPIRED",
        detail: "License has expired",
      });
      assert.strictEqual(result.error, "License validation failed");
      assert.strictEqual(result.code, "EXPIRED");
      assert.strictEqual(result.status, 400);
    });

    // Scenario 5: License suspended
    it("should return error for suspended license", () => {
      const result = handleValidationResult({
        valid: false,
        code: "SUSPENDED",
        detail: "License is suspended",
      });
      assert.strictEqual(result.error, "License validation failed");
      assert.strictEqual(result.code, "SUSPENDED");
      assert.strictEqual(result.status, 400);
    });

    // Scenario 6: Invalid license key (not found)
    it("should return error for invalid license key (NOT_FOUND)", () => {
      const result = handleValidationResult({
        valid: false,
        code: "NOT_FOUND",
        detail: "License not found",
      });
      assert.strictEqual(result.error, "License validation failed");
      assert.strictEqual(result.code, "NOT_FOUND");
      assert.strictEqual(result.status, 400);
    });

    // Edge case: Unknown error code
    it("should return error for unknown validation codes", () => {
      const result = handleValidationResult({
        valid: false,
        code: "UNKNOWN_ERROR",
        detail: "Something unexpected happened",
      });
      assert.strictEqual(result.error, "License validation failed");
      assert.strictEqual(result.code, "UNKNOWN_ERROR");
    });
  });

  describe("license data availability check", () => {
    it("should pass when license data is available", () => {
      const result = checkLicenseDataAvailable({
        valid: false,
        code: "NO_MACHINES",
        license: { id: "lic_123" },
      });
      assert.strictEqual(result, null); // Continue
    });

    it("should return error when license is null", () => {
      const result = checkLicenseDataAvailable({
        valid: false,
        code: "NO_MACHINES",
        license: null,
      });
      assert.strictEqual(result.error, "License data unavailable");
      assert.strictEqual(result.code, "LICENSE_DATA_MISSING");
      assert.strictEqual(result.status, 400);
    });

    it("should return error when license.id is missing", () => {
      const result = checkLicenseDataAvailable({
        valid: false,
        code: "NO_MACHINES",
        license: { status: "ACTIVE" }, // Missing id
      });
      assert.strictEqual(result.error, "License data unavailable");
      assert.strictEqual(result.code, "LICENSE_DATA_MISSING");
    });

    it("should return error when license is undefined", () => {
      const result = checkLicenseDataAvailable({
        valid: false,
        code: "NO_MACHINES",
      });
      assert.strictEqual(result.code, "LICENSE_DATA_MISSING");
    });
  });

  describe("concurrent device limit checking", () => {
    // Helper to simulate getActiveDevicesInWindow
    function getActiveDevicesInWindow(devices, windowHours = 2) {
      const cutoffTime = new Date(Date.now() - windowHours * 60 * 60 * 1000);
      return devices.filter(device => {
        const lastActivity = new Date(device.lastSeenAt || device.createdAt);
        return lastActivity > cutoffTime;
      });
    }

    it("should allow activation when under concurrent limit", () => {
      const now = Date.now();
      const devices = [
        { lastSeenAt: new Date(now - 1 * 60 * 60 * 1000).toISOString() },
        { lastSeenAt: new Date(now - 3 * 60 * 60 * 1000).toISOString() },
      ];
      const activeDevices = getActiveDevicesInWindow(devices, 2);
      const overLimit = activeDevices.length >= 3;

      assert.strictEqual(overLimit, false);
      assert.strictEqual(activeDevices.length, 1);
    });

    it("should allow activation when at concurrent limit (soft warning)", () => {
      const now = Date.now();
      const devices = [
        { lastSeenAt: new Date(now - 30 * 60 * 1000).toISOString() },
        { lastSeenAt: new Date(now - 60 * 60 * 1000).toISOString() },
        { lastSeenAt: new Date(now - 90 * 60 * 1000).toISOString() },
      ];
      const activeDevices = getActiveDevicesInWindow(devices, 2);
      const maxMachines = 3;
      const overLimit = activeDevices.length >= maxMachines;

      // Should allow activation but flag as over limit
      assert.strictEqual(overLimit, true);
      assert.strictEqual(activeDevices.length, 3);
    });

    it("should allow activation when over concurrent limit (soft warning)", () => {
      const now = Date.now();
      const devices = [
        { lastSeenAt: new Date(now - 15 * 60 * 1000).toISOString() },
        { lastSeenAt: new Date(now - 30 * 60 * 1000).toISOString() },
        { lastSeenAt: new Date(now - 45 * 60 * 1000).toISOString() },
        { lastSeenAt: new Date(now - 60 * 60 * 1000).toISOString() },
      ];
      const activeDevices = getActiveDevicesInWindow(devices, 2);
      const maxMachines = 3;
      const overLimit = activeDevices.length >= maxMachines;

      // Should allow activation but flag as over limit
      assert.strictEqual(overLimit, true);
      assert.strictEqual(activeDevices.length, 4);
    });

    it("should return overLimit: true flag when exceeding limit", () => {
      const activeDevices = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
      const maxMachines = 3;
      const overLimit = activeDevices.length >= maxMachines;

      assert.strictEqual(overLimit, true);
    });

    it("should return overLimit: false when within limit", () => {
      const activeDevices = [{ id: 1 }, { id: 2 }];
      const maxMachines = 3;
      const overLimit = activeDevices.length >= maxMachines;

      assert.strictEqual(overLimit, false);
    });

    it("should include warning message when over limit", () => {
      const activeDevices = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
      const maxMachines = 3;
      const overLimit = activeDevices.length >= maxMachines;
      const message = overLimit
        ? `You're using ${activeDevices.length} of ${maxMachines} allowed devices. Consider upgrading for more concurrent devices.`
        : null;

      assert.strictEqual(overLimit, true);
      assert.ok(message.includes("Consider upgrading"));
    });

    it("should count only devices active in 2-hour window", () => {
      const now = Date.now();
      const devices = [
        { lastSeenAt: new Date(now - 1 * 60 * 60 * 1000).toISOString() },
        { lastSeenAt: new Date(now - 3 * 60 * 60 * 1000).toISOString() },
        { lastSeenAt: new Date(now - 5 * 60 * 60 * 1000).toISOString() },
      ];
      const activeDevices = getActiveDevicesInWindow(devices, 2);

      assert.strictEqual(activeDevices.length, 1);
    });

    it("should not count inactive devices outside window", () => {
      const now = Date.now();
      const devices = [
        { lastSeenAt: new Date(now - 1 * 60 * 60 * 1000).toISOString() },
        { lastSeenAt: new Date(now - 3 * 60 * 60 * 1000).toISOString() },
        { lastSeenAt: new Date(now - 5 * 60 * 60 * 1000).toISOString() },
      ];
      const activeDevices = getActiveDevicesInWindow(devices, 2);

      assert.strictEqual(activeDevices.length, 1);
    });
  });
});

describe("license/deactivate API logic", () => {
  function validateDeactivationInput(body) {
    const { machineId, licenseId } = body || {};

    if (!machineId) {
      return { valid: false, error: "Machine ID is required", status: 400 };
    }

    if (!licenseId) {
      return { valid: false, error: "License ID is required", status: 400 };
    }

    return { valid: true };
  }

  function verifyOwnership(session, userLicenses, licenseId) {
    if (!session?.user) {
      return { authorized: true }; // No session = extension call, allowed
    }

    // SECURITY: Verify license ownership
    const ownsLicense = userLicenses.find(
      (l) => l.keygenLicenseId === licenseId,
    );
    if (!ownsLicense) {
      return { authorized: false, error: "Unauthorized", status: 403 };
    }

    return { authorized: true };
  }

  function handleDeactivationError(error) {
    if (error.status === 404) {
      return {
        success: true,
        message: "Device not found (may already be deactivated)",
      };
    }

    return {
      error: "Deactivation failed",
      detail: error.message,
      status: 500,
    };
  }

  describe("input validation", () => {
    it("should reject missing machine ID", () => {
      const result = validateDeactivationInput({ licenseId: "lic_123" });
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, "Machine ID is required");
    });

    it("should reject missing license ID", () => {
      const result = validateDeactivationInput({ machineId: "mach_123" });
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, "License ID is required");
    });

    it("should accept valid input", () => {
      const result = validateDeactivationInput({
        machineId: "mach_123",
        licenseId: "lic_456",
      });
      assert.strictEqual(result.valid, true);
    });
  });

  describe("ownership verification", () => {
    it("should allow when no session (extension call)", () => {
      const result = verifyOwnership(null, [], "lic_123");
      assert.strictEqual(result.authorized, true);
    });

    it("should allow when user owns license", () => {
      const session = createMockSession({ email: "user@example.com" });
      const userLicenses = [
        { keygenLicenseId: "lic_123" },
        { keygenLicenseId: "lic_456" },
      ];

      const result = verifyOwnership(session, userLicenses, "lic_123");
      assert.strictEqual(result.authorized, true);
    });

    it("should deny when user does not own license", () => {
      const session = createMockSession({ email: "user@example.com" });
      const userLicenses = [{ keygenLicenseId: "lic_other" }];

      const result = verifyOwnership(session, userLicenses, "lic_123");
      assert.strictEqual(result.authorized, false);
      assert.strictEqual(result.error, "Unauthorized");
      assert.strictEqual(result.status, 403);
    });

    it("should deny when user has no licenses", () => {
      const session = createMockSession({ email: "user@example.com" });

      const result = verifyOwnership(session, [], "lic_123");
      assert.strictEqual(result.authorized, false);
    });
  });

  describe("error handling", () => {
    it("should treat 404 as success (already deactivated)", () => {
      const result = handleDeactivationError({ status: 404 });
      assert.strictEqual(result.success, true);
      assert.ok(result.message.includes("already be deactivated"));
    });

    it("should return error for other failures", () => {
      const result = handleDeactivationError({
        status: 500,
        message: "Internal error",
      });
      assert.strictEqual(result.error, "Deactivation failed");
      assert.strictEqual(result.status, 500);
    });
  });
});
