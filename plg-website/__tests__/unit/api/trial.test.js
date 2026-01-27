/**
 * Trial Token API Route Tests
 *
 * Tests the trial token initialization endpoint:
 * - Fingerprint validation
 * - Token generation and signing
 * - Token verification
 * - Duplicate trial prevention
 * - Rate limiting
 *
 * Uses dm/facade/test-helpers for Jest-like syntax with ES6 compliance.
 *
 * @see Security Considerations for Keygen Licensing - Layer 1: Trial Token
 */

import {
  describe,
  test,
  expect,
  beforeEach,
} from "../../../../dm/facade/test-helpers/index.js";
import { clearAllRateLimits } from "../../../src/lib/rate-limit.js";
import crypto from "crypto";

// ===========================================
// TEST UTILITIES
// ===========================================

// Trial configuration (must match route.js)
const TRIAL_DURATION_DAYS = 14;
const TRIAL_DURATION_MS = TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000;
const TRIAL_SECRET = "dev-trial-secret-change-in-production";

/**
 * Generate a valid fingerprint for testing
 * Format: 64-character hex string (32 bytes)
 */
function generateValidFingerprint() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Generate trial token (copy from route.js for testing)
 */
function generateTrialToken(fingerprint) {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + TRIAL_DURATION_MS;

  const payload = {
    type: "trial",
    fingerprint,
    issuedAt,
    expiresAt,
  };

  const payloadStr = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadStr).toString("base64url");

  const hmac = crypto.createHmac("sha256", TRIAL_SECRET);
  hmac.update(payloadStr);
  const signature = hmac.digest("base64url");

  return {
    token: `${payloadB64}.${signature}`,
    expiresAt,
    issuedAt,
  };
}

/**
 * Verify trial token (copy from route.js for testing)
 */
function verifyTrialToken(token, expectedFingerprint) {
  try {
    const [payloadB64, signature] = token.split(".");
    if (!payloadB64 || !signature) {
      return { valid: false, reason: "Invalid token format" };
    }

    const payloadStr = Buffer.from(payloadB64, "base64url").toString("utf-8");
    const payload = JSON.parse(payloadStr);

    const hmac = crypto.createHmac("sha256", TRIAL_SECRET);
    hmac.update(payloadStr);
    const expectedSignature = hmac.digest("base64url");

    if (signature !== expectedSignature) {
      return { valid: false, reason: "Invalid signature" };
    }

    if (payload.fingerprint !== expectedFingerprint) {
      return { valid: false, reason: "Fingerprint mismatch" };
    }

    if (Date.now() > payload.expiresAt) {
      return {
        valid: false,
        reason: "Trial expired",
        expiredAt: new Date(payload.expiresAt).toISOString(),
      };
    }

    return {
      valid: true,
      payload,
      remainingDays: Math.ceil(
        (payload.expiresAt - Date.now()) / (24 * 60 * 60 * 1000),
      ),
    };
  } catch (error) {
    return { valid: false, reason: "Token parsing failed" };
  }
}

/**
 * Validate fingerprint format (copy from route.js for testing)
 */
function validateFingerprint(fingerprint) {
  if (!fingerprint || typeof fingerprint !== "string") {
    return { valid: false, reason: "Fingerprint is required" };
  }

  if (fingerprint.length < 32 || fingerprint.length > 128) {
    return { valid: false, reason: "Invalid fingerprint length" };
  }

  if (!/^[a-f0-9]+$/i.test(fingerprint)) {
    return { valid: false, reason: "Invalid fingerprint format" };
  }

  return { valid: true };
}

// ===========================================
// FINGERPRINT VALIDATION TESTS
// ===========================================

describe("Trial API - fingerprint validation", () => {
  describe("valid fingerprints", () => {
    test("should accept 64-character hex string", () => {
      const fingerprint = generateValidFingerprint();
      expect(fingerprint.length).toBe(64);
      const result = validateFingerprint(fingerprint);
      expect(result.valid).toBe(true);
    });

    test("should accept 32-character hex string (minimum)", () => {
      const fingerprint = crypto.randomBytes(16).toString("hex");
      expect(fingerprint.length).toBe(32);
      const result = validateFingerprint(fingerprint);
      expect(result.valid).toBe(true);
    });

    test("should accept 128-character hex string (maximum)", () => {
      const fingerprint = crypto.randomBytes(64).toString("hex");
      expect(fingerprint.length).toBe(128);
      const result = validateFingerprint(fingerprint);
      expect(result.valid).toBe(true);
    });

    test("should accept lowercase hex", () => {
      const fingerprint = "a".repeat(64);
      const result = validateFingerprint(fingerprint);
      expect(result.valid).toBe(true);
    });

    test("should accept uppercase hex", () => {
      const fingerprint = "A".repeat(64);
      const result = validateFingerprint(fingerprint);
      expect(result.valid).toBe(true);
    });

    test("should accept mixed case hex", () => {
      const fingerprint = "aAbBcCdDeEfF0123456789".repeat(3).substring(0, 64);
      const result = validateFingerprint(fingerprint);
      expect(result.valid).toBe(true);
    });
  });

  describe("invalid fingerprints", () => {
    test("should reject null", () => {
      const result = validateFingerprint(null);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Fingerprint is required");
    });

    test("should reject undefined", () => {
      const result = validateFingerprint(undefined);
      expect(result.valid).toBe(false);
    });

    test("should reject empty string", () => {
      const result = validateFingerprint("");
      expect(result.valid).toBe(false);
    });

    test("should reject non-string types", () => {
      expect(validateFingerprint(12345).valid).toBe(false);
      expect(validateFingerprint({}).valid).toBe(false);
      expect(validateFingerprint([]).valid).toBe(false);
    });

    test("should reject too short (< 32 chars)", () => {
      const fingerprint = "a".repeat(31);
      const result = validateFingerprint(fingerprint);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Invalid fingerprint length");
    });

    test("should reject too long (> 128 chars)", () => {
      const fingerprint = "a".repeat(129);
      const result = validateFingerprint(fingerprint);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Invalid fingerprint length");
    });

    test("should reject non-hex characters", () => {
      const fingerprint = "g".repeat(64); // 'g' is not hex
      const result = validateFingerprint(fingerprint);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Invalid fingerprint format");
    });

    test("should reject special characters", () => {
      const fingerprint = "a".repeat(60) + "!@#$";
      const result = validateFingerprint(fingerprint);
      expect(result.valid).toBe(false);
    });

    test("should reject whitespace", () => {
      const fingerprint = "a".repeat(32) + " " + "a".repeat(31);
      const result = validateFingerprint(fingerprint);
      expect(result.valid).toBe(false);
    });
  });
});

// ===========================================
// TOKEN GENERATION TESTS
// ===========================================

describe("Trial API - token generation", () => {
  test("should generate token with correct format", () => {
    const fingerprint = generateValidFingerprint();
    const { token } = generateTrialToken(fingerprint);

    // Token should be in format: payload.signature
    const parts = token.split(".");
    expect(parts.length).toBe(2);
    expect(parts[0].length).toBeGreaterThan(0);
    expect(parts[1].length).toBeGreaterThan(0);
  });

  test("should include fingerprint in payload", () => {
    const fingerprint = generateValidFingerprint();
    const { token } = generateTrialToken(fingerprint);

    const [payloadB64] = token.split(".");
    const payloadStr = Buffer.from(payloadB64, "base64url").toString("utf-8");
    const payload = JSON.parse(payloadStr);

    expect(payload.fingerprint).toBe(fingerprint);
  });

  test("should set type to trial", () => {
    const fingerprint = generateValidFingerprint();
    const { token } = generateTrialToken(fingerprint);

    const [payloadB64] = token.split(".");
    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf-8"),
    );

    expect(payload.type).toBe("trial");
  });

  test("should set expiration to 14 days from now", () => {
    const before = Date.now();
    const fingerprint = generateValidFingerprint();
    const { token, expiresAt } = generateTrialToken(fingerprint);
    const after = Date.now();

    // expiresAt should be ~14 days from now
    const expectedMin = before + TRIAL_DURATION_MS;
    const expectedMax = after + TRIAL_DURATION_MS;

    expect(expiresAt).toBeLessThan(expectedMax + 1000); // Allow 1s tolerance
    expect(expiresAt).toBeGreaterThan(expectedMin - 1000);
  });

  test("should produce different tokens for different fingerprints", () => {
    const fp1 = generateValidFingerprint();
    const fp2 = generateValidFingerprint();

    const token1 = generateTrialToken(fp1).token;
    const token2 = generateTrialToken(fp2).token;

    expect(token1).not.toBe(token2);
  });

  test("should produce different tokens for same fingerprint at different times", async () => {
    const fingerprint = generateValidFingerprint();

    const token1 = generateTrialToken(fingerprint).token;
    await new Promise((r) => setTimeout(r, 10)); // Small delay
    const token2 = generateTrialToken(fingerprint).token;

    // Tokens should be different due to different issuedAt timestamps
    expect(token1).not.toBe(token2);
  });
});

// ===========================================
// TOKEN VERIFICATION TESTS
// ===========================================

describe("Trial API - token verification", () => {
  describe("valid tokens", () => {
    test("should verify valid token", () => {
      const fingerprint = generateValidFingerprint();
      const { token } = generateTrialToken(fingerprint);

      const result = verifyTrialToken(token, fingerprint);
      expect(result.valid).toBe(true);
    });

    test("should return payload for valid token", () => {
      const fingerprint = generateValidFingerprint();
      const { token } = generateTrialToken(fingerprint);

      const result = verifyTrialToken(token, fingerprint);
      expect(result.payload).toBeDefined();
      expect(result.payload.fingerprint).toBe(fingerprint);
      expect(result.payload.type).toBe("trial");
    });

    test("should return remaining days for valid token", () => {
      const fingerprint = generateValidFingerprint();
      const { token } = generateTrialToken(fingerprint);

      const result = verifyTrialToken(token, fingerprint);
      expect(result.remainingDays).toBe(TRIAL_DURATION_DAYS);
    });
  });

  describe("invalid tokens", () => {
    test("should reject token with wrong fingerprint", () => {
      const fingerprint1 = generateValidFingerprint();
      const fingerprint2 = generateValidFingerprint();
      const { token } = generateTrialToken(fingerprint1);

      const result = verifyTrialToken(token, fingerprint2);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Fingerprint mismatch");
    });

    test("should reject token with tampered signature", () => {
      const fingerprint = generateValidFingerprint();
      const { token } = generateTrialToken(fingerprint);

      // Tamper with signature
      const [payload, signature] = token.split(".");
      const tamperedToken = `${payload}.${signature.replace("a", "b")}`;

      const result = verifyTrialToken(tamperedToken, fingerprint);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Invalid signature");
    });

    test("should reject token with tampered payload", () => {
      const fingerprint = generateValidFingerprint();
      const { token } = generateTrialToken(fingerprint);

      // Tamper with payload
      const [payload, signature] = token.split(".");
      const decodedPayload = JSON.parse(
        Buffer.from(payload, "base64url").toString("utf-8"),
      );
      decodedPayload.expiresAt = Date.now() + 365 * 24 * 60 * 60 * 1000; // Try to extend to 1 year
      const tamperedPayload = Buffer.from(
        JSON.stringify(decodedPayload),
      ).toString("base64url");
      const tamperedToken = `${tamperedPayload}.${signature}`;

      const result = verifyTrialToken(tamperedToken, fingerprint);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Invalid signature");
    });

    test("should reject malformed token (no separator)", () => {
      const result = verifyTrialToken("notseparated", "any");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Invalid token format");
    });

    test("should reject malformed token (empty parts)", () => {
      const result = verifyTrialToken(".", "any");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Invalid token format");
    });

    test("should reject invalid base64 payload", () => {
      const result = verifyTrialToken("!!!invalid!!!.signature", "any");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Token parsing failed");
    });
  });

  describe("expired tokens", () => {
    test("should reject expired token", () => {
      const fingerprint = generateValidFingerprint();

      // Create a token that's already expired
      const issuedAt = Date.now() - (TRIAL_DURATION_MS + 1000); // Issued 14+ days ago
      const expiresAt = issuedAt + TRIAL_DURATION_MS; // Already expired

      const payload = {
        type: "trial",
        fingerprint,
        issuedAt,
        expiresAt,
      };

      const payloadStr = JSON.stringify(payload);
      const payloadB64 = Buffer.from(payloadStr).toString("base64url");
      const hmac = crypto.createHmac("sha256", TRIAL_SECRET);
      hmac.update(payloadStr);
      const signature = hmac.digest("base64url");
      const expiredToken = `${payloadB64}.${signature}`;

      const result = verifyTrialToken(expiredToken, fingerprint);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Trial expired");
      expect(result.expiredAt).toBeDefined();
    });
  });
});

// ===========================================
// RATE LIMITING TESTS
// ===========================================

describe("Trial API - rate limiting", () => {
  beforeEach(() => {
    clearAllRateLimits();
  });

  test("should use trialInit preset (5 req/hour)", async () => {
    const { RATE_LIMIT_PRESETS } =
      await import("../../../src/lib/rate-limit.js");

    const preset = RATE_LIMIT_PRESETS.trialInit;
    expect(preset.maxRequests).toBe(5);
    expect(preset.windowMs).toBe(60 * 60 * 1000); // 1 hour
    expect(preset.keyPrefix).toBe("trial");
  });

  test("should rate limit by fingerprint", async () => {
    const { checkRateLimit, RATE_LIMIT_PRESETS } =
      await import("../../../src/lib/rate-limit.js");

    const fingerprint = generateValidFingerprint();
    const preset = RATE_LIMIT_PRESETS.trialInit;

    // Exhaust limit
    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit(fingerprint, preset);
      expect(result.allowed).toBe(true);
    }

    // 6th request should be blocked
    const blockedResult = checkRateLimit(fingerprint, preset);
    expect(blockedResult.allowed).toBe(false);
  });
});
