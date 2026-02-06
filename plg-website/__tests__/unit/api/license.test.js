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

  function formatValidationResponse(result) {
    return {
      valid: result.valid,
      code: result.code,
      detail: result.detail,
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
    function getActiveDevicesInWindow(devices, windowHours = 24) {
      const cutoffTime = new Date(Date.now() - windowHours * 60 * 60 * 1000);
      return devices.filter(device => {
        const lastActivity = new Date(device.lastSeenAt || device.createdAt);
        return lastActivity > cutoffTime;
      });
    }

    it("should allow activation when under concurrent limit", () => {
      const now = Date.now();
      const devices = [
        { lastSeenAt: new Date(now - 10 * 60 * 60 * 1000).toISOString() },
        { lastSeenAt: new Date(now - 30 * 60 * 60 * 1000).toISOString() },
      ];
      const activeDevices = getActiveDevicesInWindow(devices, 24);
      const overLimit = activeDevices.length >= 3;

      assert.strictEqual(overLimit, false);
      assert.strictEqual(activeDevices.length, 1);
    });

    it("should allow activation when at concurrent limit (soft warning)", () => {
      const now = Date.now();
      const devices = [
        { lastSeenAt: new Date(now - 10 * 60 * 60 * 1000).toISOString() },
        { lastSeenAt: new Date(now - 12 * 60 * 60 * 1000).toISOString() },
        { lastSeenAt: new Date(now - 14 * 60 * 60 * 1000).toISOString() },
      ];
      const activeDevices = getActiveDevicesInWindow(devices, 24);
      const maxMachines = 3;
      const overLimit = activeDevices.length >= maxMachines;

      // Should allow activation but flag as over limit
      assert.strictEqual(overLimit, true);
      assert.strictEqual(activeDevices.length, 3);
    });

    it("should allow activation when over concurrent limit (soft warning)", () => {
      const now = Date.now();
      const devices = [
        { lastSeenAt: new Date(now - 1 * 60 * 60 * 1000).toISOString() },
        { lastSeenAt: new Date(now - 2 * 60 * 60 * 1000).toISOString() },
        { lastSeenAt: new Date(now - 3 * 60 * 60 * 1000).toISOString() },
        { lastSeenAt: new Date(now - 4 * 60 * 60 * 1000).toISOString() },
      ];
      const activeDevices = getActiveDevicesInWindow(devices, 24);
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

    it("should count only devices active in 24-hour window", () => {
      const now = Date.now();
      const devices = [
        { lastSeenAt: new Date(now - 10 * 60 * 60 * 1000).toISOString() },
        { lastSeenAt: new Date(now - 30 * 60 * 60 * 1000).toISOString() },
        { lastSeenAt: new Date(now - 48 * 60 * 60 * 1000).toISOString() },
      ];
      const activeDevices = getActiveDevicesInWindow(devices, 24);

      assert.strictEqual(activeDevices.length, 1);
    });

    it("should not count inactive devices from yesterday", () => {
      const now = Date.now();
      const devices = [
        { lastSeenAt: new Date(now - 1 * 60 * 60 * 1000).toISOString() },
        { lastSeenAt: new Date(now - 25 * 60 * 60 * 1000).toISOString() },
        { lastSeenAt: new Date(now - 26 * 60 * 60 * 1000).toISOString() },
      ];
      const activeDevices = getActiveDevicesInWindow(devices, 24);

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
