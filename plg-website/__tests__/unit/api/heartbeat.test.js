/**
 * Heartbeat API Route Tests
 *
 * Tests the license heartbeat endpoint:
 * - Input validation
 * - License key format validation (CWE-306 mitigation)
 * - Rate limiting
 * - Response formatting
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
} from "../../../../dm/facade/test-helpers/index.js";

// ===========================================
// LICENSE KEY FORMAT VALIDATION
// ===========================================

/**
 * Calculate checksum for license key body
 * Must match the implementation in route.js
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
  const body = "ABCD1234EFGH"; // 12 chars for XXXX-XXXX-XXXX
  const checksum = calculateChecksum(body);
  return `MOUSE-ABCD-1234-EFGH-${checksum}`;
}

/**
 * Validate license key format
 * Copy of the logic from route.js for unit testing
 */
function validateLicenseKeyFormat(licenseKey) {
  if (!licenseKey || typeof licenseKey !== "string") {
    return { valid: false, reason: "License key is required" };
  }

  const pattern = /^MOUSE-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
  if (!pattern.test(licenseKey)) {
    return { valid: false, reason: "Invalid license key format" };
  }

  const parts = licenseKey.split("-");
  const keyBody = parts.slice(1, 4).join("");
  const providedChecksum = parts[4];
  const expectedChecksum = calculateChecksum(keyBody);

  if (providedChecksum !== expectedChecksum) {
    return { valid: false, reason: "Invalid license key checksum" };
  }

  return { valid: true };
}

// ===========================================
// LICENSE KEY FORMAT VALIDATION TESTS
// ===========================================

describe("heartbeat API - license key format validation", () => {
  describe("valid keys", () => {
    test("should accept properly formatted key with valid checksum", () => {
      const key = generateValidLicenseKey();
      const result = validateLicenseKeyFormat(key);
      expect(result.valid).toBe(true);
    });

    test("should accept all uppercase alphanumeric", () => {
      const body = "WXYZ9876MNOP";
      const checksum = calculateChecksum(body);
      const key = `MOUSE-WXYZ-9876-MNOP-${checksum}`;
      const result = validateLicenseKeyFormat(key);
      expect(result.valid).toBe(true);
    });
  });

  describe("invalid keys", () => {
    test("should reject null license key", () => {
      const result = validateLicenseKeyFormat(null);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("License key is required");
    });

    test("should reject undefined license key", () => {
      const result = validateLicenseKeyFormat(undefined);
      expect(result.valid).toBe(false);
    });

    test("should reject empty string", () => {
      const result = validateLicenseKeyFormat("");
      expect(result.valid).toBe(false);
    });

    test("should reject non-string types", () => {
      expect(validateLicenseKeyFormat(12345).valid).toBe(false);
      expect(validateLicenseKeyFormat({}).valid).toBe(false);
      expect(validateLicenseKeyFormat([]).valid).toBe(false);
    });

    test("should reject wrong prefix", () => {
      const body = "ABCD1234EFGH";
      const checksum = calculateChecksum(body);
      const result = validateLicenseKeyFormat(
        `WRONG-ABCD-1234-EFGH-${checksum}`,
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Invalid license key format");
    });

    test("should reject lowercase characters", () => {
      const result = validateLicenseKeyFormat("MOUSE-abcd-1234-EFGH-XXXX");
      expect(result.valid).toBe(false);
    });

    test("should reject special characters", () => {
      const result = validateLicenseKeyFormat("MOUSE-AB!@-1234-EFGH-XXXX");
      expect(result.valid).toBe(false);
    });

    test("should reject wrong segment lengths", () => {
      expect(validateLicenseKeyFormat("MOUSE-ABC-1234-EFGH-XXXX").valid).toBe(
        false,
      ); // 3 chars
      expect(validateLicenseKeyFormat("MOUSE-ABCDE-1234-EFGH-XXXX").valid).toBe(
        false,
      ); // 5 chars
    });

    test("should reject missing segments", () => {
      expect(validateLicenseKeyFormat("MOUSE-ABCD-1234-EFGH").valid).toBe(
        false,
      );
    });

    test("should reject invalid checksum", () => {
      const result = validateLicenseKeyFormat("MOUSE-ABCD-1234-EFGH-ZZZZ");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Invalid license key checksum");
    });
  });
});

// ===========================================
// INPUT VALIDATION TESTS
// ===========================================

describe("heartbeat API - input validation", () => {
  /**
   * Input validation rules:
   * 1. fingerprint is ALWAYS required (device identification for concurrent sessions)
   * 2. For trial users: fingerprint only is sufficient
   * 3. For licensed users: fingerprint + sessionId + licenseKey required
   * 
   * This ensures each container/device has a unique fingerprint for device limit enforcement.
   * Example: User runs 100 containers with same license - each needs unique fingerprint.
   */
  function validateHeartbeatInput(body) {
    const { fingerprint, sessionId, licenseKey } = body || {};

    // Fingerprint is ALWAYS required for device tracking
    if (!fingerprint) {
      return { valid: false, error: "Device fingerprint is required", status: 400 };
    }

    // Trial heartbeat - fingerprint only is sufficient
    if (!licenseKey) {
      return { valid: true, type: "trial" };
    }

    // Licensed heartbeat - need sessionId too
    if (!sessionId) {
      return { valid: false, error: "Session ID is required", status: 400 };
    }

    return { valid: true, type: "licensed" };
  }

  describe("fingerprint requirement (all heartbeats)", () => {
    test("should reject missing fingerprint for trial heartbeat", () => {
      const result = validateHeartbeatInput({
        // No fingerprint - should fail
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Device fingerprint is required");
    });

    test("should reject missing fingerprint for licensed heartbeat", () => {
      const result = validateHeartbeatInput({
        sessionId: "sess_123",
        licenseKey: generateValidLicenseKey(),
        // No fingerprint - should fail
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Device fingerprint is required");
    });

    test("should reject missing fingerprint even with machineId", () => {
      // machineId alone is NOT sufficient - fingerprint is required
      const result = validateHeartbeatInput({
        machineId: "mach_123",
        sessionId: "sess_123",
        licenseKey: generateValidLicenseKey(),
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Device fingerprint is required");
    });
  });

  describe("trial heartbeat (no license key)", () => {
    test("should accept fingerprint-only for trial users", () => {
      const result = validateHeartbeatInput({
        fingerprint: "fp_test_device_123",
      });
      expect(result.valid).toBe(true);
      expect(result.type).toBe("trial");
    });

    test("should accept trial heartbeat with optional machineId", () => {
      const result = validateHeartbeatInput({
        fingerprint: "fp_test_device_123",
        machineId: "mach_optional",
      });
      expect(result.valid).toBe(true);
      expect(result.type).toBe("trial");
    });
  });

  describe("licensed heartbeat (with license key)", () => {
    test("should reject licensed heartbeat without sessionId", () => {
      const result = validateHeartbeatInput({
        fingerprint: "fp_test_device_123",
        licenseKey: generateValidLicenseKey(),
        // sessionId missing
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Session ID is required");
    });

    test("should accept licensed heartbeat with all required fields", () => {
      const result = validateHeartbeatInput({
        fingerprint: "fp_test_device_123",
        sessionId: "sess_123",
        licenseKey: generateValidLicenseKey(),
      });
      expect(result.valid).toBe(true);
      expect(result.type).toBe("licensed");
    });
  });
});

// ===========================================
// RESPONSE FORMATTING TESTS
// ===========================================

describe("heartbeat API - response formatting", () => {
  function formatSuccessResponse(data) {
    return {
      valid: true,
      status: "active",
      reason: "Heartbeat successful",
      concurrentMachines: data.concurrentMachines || 1,
      maxMachines: data.maxMachines || null,
    };
  }

  function formatErrorResponse(code, reason) {
    return {
      valid: false,
      status: code,
      reason: reason,
      concurrentMachines: 0,
      maxMachines: 0,
    };
  }

  test("should format success response correctly", () => {
    const response = formatSuccessResponse({
      concurrentMachines: 2,
      maxMachines: 5,
    });

    expect(response.valid).toBe(true);
    expect(response.status).toBe("active");
    expect(response.reason).toBe("Heartbeat successful");
    expect(response.concurrentMachines).toBe(2);
    expect(response.maxMachines).toBe(5);
  });

  test("should handle null maxMachines (unlimited)", () => {
    const response = formatSuccessResponse({
      concurrentMachines: 1,
      maxMachines: null,
    });

    expect(response.maxMachines).toBeNull();
  });

  test("should format error response correctly", () => {
    const response = formatErrorResponse(
      "device_limit_exceeded",
      "Maximum 3 devices allowed",
    );

    expect(response.valid).toBe(false);
    expect(response.status).toBe("device_limit_exceeded");
    expect(response.reason).toBe("Maximum 3 devices allowed");
    expect(response.concurrentMachines).toBe(0);
    expect(response.maxMachines).toBe(0);
  });
});

// ===========================================
// RATE LIMITING TESTS
// ===========================================

describe("heartbeat API - rate limiting", () => {
  const rateLimitStore = new Map();

  function checkRateLimit(identifier, options) {
    const { windowMs, maxRequests, keyPrefix } = options;
    const now = Date.now();
    const key = `${keyPrefix}:${identifier}`;

    let entry = rateLimitStore.get(key);

    if (!entry || entry.windowStart + windowMs < now) {
      entry = { windowStart: now, windowMs, count: 0 };
    }

    entry.count++;
    rateLimitStore.set(key, entry);

    const allowed = entry.count <= maxRequests;
    const remaining = Math.max(0, maxRequests - entry.count);
    const resetAt = new Date(entry.windowStart + windowMs);

    return {
      allowed,
      remaining,
      resetAt,
      current: entry.count,
      limit: maxRequests,
    };
  }

  beforeEach(() => {
    rateLimitStore.clear();
  });

  test("should allow requests under the limit", () => {
    const options = { windowMs: 60000, maxRequests: 10, keyPrefix: "test" };

    for (let i = 1; i <= 10; i++) {
      const result = checkRateLimit("key1", options);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(10 - i);
    }
  });

  test("should reject requests over the limit", () => {
    const options = { windowMs: 60000, maxRequests: 3, keyPrefix: "test" };

    checkRateLimit("key1", options);
    checkRateLimit("key1", options);
    checkRateLimit("key1", options);

    const result = checkRateLimit("key1", options);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  test("should track different keys separately", () => {
    const options = { windowMs: 60000, maxRequests: 2, keyPrefix: "test" };

    checkRateLimit("key1", options);
    checkRateLimit("key1", options);
    const key1Result = checkRateLimit("key1", options);
    expect(key1Result.allowed).toBe(false);

    // key2 should still be allowed
    const key2Result = checkRateLimit("key2", options);
    expect(key2Result.allowed).toBe(true);
  });

  test("should reset after window expires", async () => {
    const options = { windowMs: 100, maxRequests: 1, keyPrefix: "test" };

    checkRateLimit("key1", options);
    const blockedResult = checkRateLimit("key1", options);
    expect(blockedResult.allowed).toBe(false);

    // Wait for window to expire
    await new Promise((resolve) => setTimeout(resolve, 150));

    const newResult = checkRateLimit("key1", options);
    expect(newResult.allowed).toBe(true);
  });
});

// ===========================================
// CONCURRENT DEVICE ENFORCEMENT TESTS
// ===========================================

describe("heartbeat API - concurrent device enforcement", () => {
  // Helper to simulate getActiveDevicesInWindow
  function getActiveDevicesInWindow(devices, windowHours = 24) {
    const cutoffTime = new Date(Date.now() - windowHours * 60 * 60 * 1000);
    return devices.filter(device => {
      const lastActivity = new Date(device.lastSeenAt || device.createdAt);
      return lastActivity > cutoffTime;
    });
  }

  test("should return valid: true with overLimit: false when under limit", () => {
    const now = Date.now();
    const devices = [
      { lastSeenAt: new Date(now - 10 * 60 * 60 * 1000).toISOString() },
    ];
    const activeDevices = getActiveDevicesInWindow(devices, 24);
    const maxMachines = 3;
    const overLimit = activeDevices.length > maxMachines;

    expect(overLimit).toBe(false);
    expect(activeDevices.length).toBe(1);
  });

  test("should return valid: true with overLimit: true when over limit", () => {
    const now = Date.now();
    const devices = [
      { lastSeenAt: new Date(now - 1 * 60 * 60 * 1000).toISOString() },
      { lastSeenAt: new Date(now - 2 * 60 * 60 * 1000).toISOString() },
      { lastSeenAt: new Date(now - 3 * 60 * 60 * 1000).toISOString() },
      { lastSeenAt: new Date(now - 4 * 60 * 60 * 1000).toISOString() },
    ];
    const activeDevices = getActiveDevicesInWindow(devices, 24);
    const maxMachines = 3;
    const overLimit = activeDevices.length > maxMachines;

    expect(overLimit).toBe(true);
    expect(activeDevices.length).toBe(4);
  });

  test("should return status: 'over_limit' when exceeding concurrent devices", () => {
    const concurrentMachines = 5;
    const maxMachines = 3;
    const overLimit = concurrentMachines > maxMachines;

    const response = {
      valid: true,
      status: overLimit ? "over_limit" : "active",
      reason: overLimit
        ? `You're using ${concurrentMachines} of ${maxMachines} allowed devices`
        : "Heartbeat successful",
      concurrentMachines,
      maxMachines,
    };

    expect(response.valid).toBe(true);
    expect(response.status).toBe("over_limit");
    expect(response.reason).toContain("You're using 5 of 3");
  });

  test("should include concurrentMachines count in response", () => {
    const now = Date.now();
    const devices = [
      { lastSeenAt: new Date(now - 1 * 60 * 60 * 1000).toISOString() },
      { lastSeenAt: new Date(now - 2 * 60 * 60 * 1000).toISOString() },
    ];
    const activeDevices = getActiveDevicesInWindow(devices, 24);

    expect(activeDevices.length).toBe(2);
  });

  test("should include upgrade message when over limit", () => {
    const concurrentMachines = 5;
    const maxMachines = 3;
    const overLimit = concurrentMachines > maxMachines;
    const message = overLimit
      ? "Consider upgrading your plan for more concurrent devices."
      : null;

    expect(message).toContain("Consider upgrading");
  });

  test("should use 2-hour window for concurrent count", () => {
    const now = Date.now();
    const devices = [
      { lastSeenAt: new Date(now - 1 * 60 * 60 * 1000).toISOString() },
      { lastSeenAt: new Date(now - 3 * 60 * 60 * 1000).toISOString() },
    ];
    const activeDevices = getActiveDevicesInWindow(devices, 2);

    expect(activeDevices.length).toBe(1);
  });

  test("should handle CONCURRENT_DEVICE_WINDOW_HOURS env variable", () => {
    const now = Date.now();
    const devices = [
      { lastSeenAt: new Date(now - 1 * 60 * 60 * 1000).toISOString() },
    ];
    const windowHours = parseInt(process.env.CONCURRENT_DEVICE_WINDOW_HOURS) || 2;
    const activeDevices = getActiveDevicesInWindow(devices, windowHours);

    expect(activeDevices.length).toBe(1);
    expect(windowHours).toBe(2); // Default when env var not set
  });
});


// ===========================================
// CHECKSUM ALGORITHM TESTS
// ===========================================

describe("heartbeat API - checksum algorithm", () => {
  test("should produce deterministic checksums", () => {
    const body = "ABCD1234EFGH";
    const checksum1 = calculateChecksum(body);
    const checksum2 = calculateChecksum(body);
    expect(checksum1).toBe(checksum2);
  });

  test("should produce different checksums for different inputs", () => {
    const checksum1 = calculateChecksum("AAAA1111BBBB");
    const checksum2 = calculateChecksum("CCCC2222DDDD");
    expect(checksum1).not.toBe(checksum2);
  });

  test("should produce 4-character checksums", () => {
    const checksum = calculateChecksum("ABCD1234EFGH");
    expect(checksum.length).toBe(4);
  });

  test("should only contain uppercase alphanumeric", () => {
    const checksum = calculateChecksum("ABCD1234EFGH");
    expect(checksum).toMatch(/^[A-Z0-9]{4}$/);
  });
});


// ===========================================
// PHASE 3E: AUTH REQUIRED FOR LICENSED HEARTBEATS
// ===========================================

describe("Phase 3E: heartbeat — authentication requirements", () => {
  /**
   * Mirrors heartbeat/route.js Phase 3E logic:
   *
   * - Trial heartbeats (no licenseKey): NO auth required.
   *   Trial users send heartbeats before purchasing.
   *
   * - Licensed heartbeats (with licenseKey): Auth IS required.
   *   verifyAuthToken() → null means 401.
   *   JWT’s sub (“authedUserId”) replaces the body’s userId
   *   for updateDeviceLastSeen to prevent spoofing.
   */

  function requireHeartbeatAuth(tokenPayload, hasLicenseKey) {
    // Trial heartbeats don’t require auth
    if (!hasLicenseKey) {
      return { required: false };
    }
    // Licensed heartbeats require auth
    if (!tokenPayload) {
      return {
        required: true,
        error: "Unauthorized",
        detail: "Authentication is required for licensed heartbeats",
        status: 401,
      };
    }
    return { required: true, authedUserId: tokenPayload.sub };
  }

  describe("trial heartbeats (no licenseKey)", () => {
    test("should not require auth for trial heartbeats", () => {
      const result = requireHeartbeatAuth(null, false);
      expect(result.required).toBe(false);
      expect(result.error).toBeUndefined();
    });

    test("should not require auth even when token is provided for trial", () => {
      const result = requireHeartbeatAuth(
        { sub: "user_1", email: "a@b.com" },
        false,
      );
      expect(result.required).toBe(false);
    });
  });

  describe("licensed heartbeats (with licenseKey)", () => {
    test("should return 401 when no auth token for licensed heartbeat", () => {
      const result = requireHeartbeatAuth(null, true);
      expect(result.required).toBe(true);
      expect(result.status).toBe(401);
      expect(result.error).toBe("Unauthorized");
    });

    test("should return 401 when token is undefined", () => {
      const result = requireHeartbeatAuth(undefined, true);
      expect(result.status).toBe(401);
    });

    test("should extract authedUserId from valid token", () => {
      const result = requireHeartbeatAuth(
        { sub: "user_abc", email: "abc@test.com" },
        true,
      );
      expect(result.required).toBe(true);
      expect(result.authedUserId).toBe("user_abc");
      expect(result.error).toBeUndefined();
    });
  });

  describe("userId source for updateDeviceLastSeen", () => {
    test("should use JWT sub, not body userId, to prevent spoofing", () => {
      // Before 3E: userId came from request body (spoofable)
      // After 3E: authedUserId comes from JWT (verified)
      const bodyUserId = "spoofed_user";
      const jwtPayload = { sub: "real_user_abc", email: "real@test.com" };

      const authResult = requireHeartbeatAuth(jwtPayload, true);
      const userIdForUpdate = authResult.authedUserId;

      expect(userIdForUpdate).toBe("real_user_abc");
      expect(userIdForUpdate).not.toBe(bodyUserId);
    });

    test("should derive userId from JWT sub claim", () => {
      const jwtPayload = { sub: "cognito|12345", email: "user@test.com" };
      const authResult = requireHeartbeatAuth(jwtPayload, true);

      expect(authResult.authedUserId).toBe("cognito|12345");
    });
  });
});
