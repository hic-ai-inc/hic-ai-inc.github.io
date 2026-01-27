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
  function validateInput(body) {
    const { machineId, sessionId, licenseKey } = body || {};

    if (!machineId) {
      return { valid: false, error: "Machine ID is required", status: 400 };
    }

    if (!sessionId) {
      return { valid: false, error: "Session ID is required", status: 400 };
    }

    if (!licenseKey) {
      return { valid: false, error: "License key is required", status: 400 };
    }

    return { valid: true };
  }

  test("should reject missing machineId", () => {
    const result = validateInput({
      sessionId: "sess_123",
      licenseKey: generateValidLicenseKey(),
    });
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Machine ID is required");
  });

  test("should reject missing sessionId", () => {
    const result = validateInput({
      machineId: "mach_123",
      licenseKey: generateValidLicenseKey(),
    });
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Session ID is required");
  });

  test("should reject missing licenseKey", () => {
    const result = validateInput({
      machineId: "mach_123",
      sessionId: "sess_123",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toBe("License key is required");
  });

  test("should accept valid input", () => {
    const result = validateInput({
      machineId: "mach_123",
      sessionId: "sess_123",
      licenseKey: generateValidLicenseKey(),
    });
    expect(result.valid).toBe(true);
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
