/**
 * Rate Limit Utility Tests
 *
 * Tests the rate limiting functionality used by license APIs:
 * - Sliding window algorithm
 * - Preset configurations
 * - Middleware integration
 * - Headers generation
 *
 * Uses dm/facade/test-helpers for Jest-like syntax with ES6 compliance.
 *
 * @see Security Considerations for Keygen Licensing - Rate Limiting
 */

import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
} from "../../../../dm/facade/test-helpers/index.js";

import {
  checkRateLimit,
  rateLimitMiddleware,
  getRateLimitHeaders,
  resetRateLimit,
  clearAllRateLimits,
  RATE_LIMIT_PRESETS,
} from "../../../src/lib/rate-limit.js";

describe("rate-limit.js", () => {
  beforeEach(() => {
    clearAllRateLimits();
  });

  afterEach(() => {
    clearAllRateLimits();
  });

  // ===========================================
  // PRESETS
  // ===========================================

  describe("RATE_LIMIT_PRESETS", () => {
    test("should have heartbeat preset with 10 req/min", () => {
      const preset = RATE_LIMIT_PRESETS.heartbeat;
      expect(preset.windowMs).toBe(60 * 1000);
      expect(preset.maxRequests).toBe(10);
      expect(preset.keyPrefix).toBe("heartbeat");
    });

    test("should have trialInit preset with 5 req/hour", () => {
      const preset = RATE_LIMIT_PRESETS.trialInit;
      expect(preset.windowMs).toBe(60 * 60 * 1000);
      expect(preset.maxRequests).toBe(5);
      expect(preset.keyPrefix).toBe("trial");
    });

    test("should have validate preset with 20 req/min", () => {
      const preset = RATE_LIMIT_PRESETS.validate;
      expect(preset.windowMs).toBe(60 * 1000);
      expect(preset.maxRequests).toBe(20);
      expect(preset.keyPrefix).toBe("validate");
    });

    test("should have activate preset with 10 req/hour", () => {
      const preset = RATE_LIMIT_PRESETS.activate;
      expect(preset.windowMs).toBe(60 * 60 * 1000);
      expect(preset.maxRequests).toBe(10);
      expect(preset.keyPrefix).toBe("activate");
    });
  });

  // ===========================================
  // checkRateLimit
  // ===========================================

  describe("checkRateLimit", () => {
    const options = {
      windowMs: 60000,
      maxRequests: 5,
      keyPrefix: "test",
    };

    test("should allow first request", () => {
      const result = checkRateLimit("user123", options);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
      expect(result.current).toBe(1);
      expect(result.limit).toBe(5);
    });

    test("should count requests correctly", () => {
      for (let i = 1; i <= 3; i++) {
        checkRateLimit("user123", options);
      }
      const result = checkRateLimit("user123", options);
      expect(result.current).toBe(4);
      expect(result.remaining).toBe(1);
    });

    test("should block when limit exceeded", () => {
      for (let i = 0; i < 5; i++) {
        checkRateLimit("user123", options);
      }
      const result = checkRateLimit("user123", options);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    test("should track different identifiers separately", () => {
      for (let i = 0; i < 5; i++) {
        checkRateLimit("user1", options);
      }
      const user1Result = checkRateLimit("user1", options);
      const user2Result = checkRateLimit("user2", options);

      expect(user1Result.allowed).toBe(false);
      expect(user2Result.allowed).toBe(true);
    });

    test("should provide resetAt timestamp", () => {
      const result = checkRateLimit("user123", options);
      expect(result.resetAt).toBeInstanceOf(Date);
      expect(result.resetAt.getTime()).toBeLessThan(
        Date.now() + options.windowMs + 1000,
      );
    });

    test("should reset after window expires", async () => {
      const shortOptions = { ...options, windowMs: 50 };

      for (let i = 0; i < 5; i++) {
        checkRateLimit("user123", shortOptions);
      }
      const blockedResult = checkRateLimit("user123", shortOptions);
      expect(blockedResult.allowed).toBe(false);

      await new Promise((r) => setTimeout(r, 100));

      const newResult = checkRateLimit("user123", shortOptions);
      expect(newResult.allowed).toBe(true);
      expect(newResult.current).toBe(1);
    });
  });

  // ===========================================
  // rateLimitMiddleware
  // ===========================================

  describe("rateLimitMiddleware", () => {
    function createMockRequest(body) {
      return {
        clone: () => ({
          json: () => Promise.resolve(body),
        }),
      };
    }

    test("should return null when under limit", async () => {
      const request = createMockRequest({ licenseKey: "lic_123" });
      const result = await rateLimitMiddleware(request, {
        getIdentifier: (body) => body.licenseKey,
        limits: "heartbeat",
      });
      expect(result).toBeNull();
    });

    test("should return error object when over limit", async () => {
      // Exhaust the limit
      const options = {
        getIdentifier: (body) => body.licenseKey,
        limits: {
          windowMs: 60000,
          maxRequests: 2,
          keyPrefix: "test-middleware",
        },
      };

      const request = createMockRequest({ licenseKey: "lic_overflow" });

      await rateLimitMiddleware(request, options);
      await rateLimitMiddleware(request, options);
      const result = await rateLimitMiddleware(request, options);

      expect(result.error).toBe("Rate limit exceeded");
      expect(result.limit).toBe(2);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeDefined();
      expect(result.resetAt).toBeDefined();
    });

    test("should return null when identifier is missing", async () => {
      const request = createMockRequest({});
      const result = await rateLimitMiddleware(request, {
        getIdentifier: (body) => body.licenseKey, // Will be undefined
        limits: "heartbeat",
      });
      expect(result).toBeNull();
    });

    test("should accept preset name or custom config", async () => {
      const request = createMockRequest({ key: "test" });

      // Preset name
      const result1 = await rateLimitMiddleware(request, {
        getIdentifier: (body) => body.key,
        limits: "heartbeat",
      });
      expect(result1).toBeNull();

      clearAllRateLimits();

      // Custom config
      const result2 = await rateLimitMiddleware(request, {
        getIdentifier: (body) => body.key,
        limits: { windowMs: 60000, maxRequests: 100, keyPrefix: "custom" },
      });
      expect(result2).toBeNull();
    });
  });

  // ===========================================
  // getRateLimitHeaders
  // ===========================================

  describe("getRateLimitHeaders", () => {
    test("should return headers with limit info", () => {
      const options = {
        windowMs: 60000,
        maxRequests: 10,
        keyPrefix: "headers-test",
      };

      // Make some requests first
      checkRateLimit("user1", options);
      checkRateLimit("user1", options);
      checkRateLimit("user1", options);

      const headers = getRateLimitHeaders("user1", options);

      expect(headers["X-RateLimit-Limit"]).toBe("10");
      expect(headers["X-RateLimit-Remaining"]).toBe("7");
      expect(headers["X-RateLimit-Reset"]).toBeDefined();
    });

    test("should return full limit when no requests made", () => {
      const options = {
        windowMs: 60000,
        maxRequests: 10,
        keyPrefix: "headers-new",
      };

      const headers = getRateLimitHeaders("new-user", options);

      expect(headers["X-RateLimit-Limit"]).toBe("10");
      expect(headers["X-RateLimit-Remaining"]).toBe("10");
    });
  });

  // ===========================================
  // resetRateLimit / clearAllRateLimits
  // ===========================================

  describe("resetRateLimit", () => {
    test("should reset specific key", () => {
      const options = {
        windowMs: 60000,
        maxRequests: 2,
        keyPrefix: "reset-test",
      };

      checkRateLimit("user1", options);
      checkRateLimit("user1", options);
      const blockedResult = checkRateLimit("user1", options);
      expect(blockedResult.allowed).toBe(false);

      resetRateLimit("user1", "reset-test");

      const newResult = checkRateLimit("user1", options);
      expect(newResult.allowed).toBe(true);
      expect(newResult.current).toBe(1);
    });
  });

  describe("clearAllRateLimits", () => {
    test("should reset all keys", () => {
      const options = {
        windowMs: 60000,
        maxRequests: 1,
        keyPrefix: "clear-test",
      };

      checkRateLimit("user1", options);
      checkRateLimit("user2", options);

      clearAllRateLimits();

      const result1 = checkRateLimit("user1", options);
      const result2 = checkRateLimit("user2", options);

      expect(result1.current).toBe(1);
      expect(result2.current).toBe(1);
    });
  });
});
