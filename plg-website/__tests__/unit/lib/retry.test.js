/**
 * withRetry Helper — Unit Tests
 *
 * Verifies the retry logic used for Keygen API write operations:
 * - Succeeds on first attempt (no retry)
 * - Retries on transient failure and succeeds
 * - Exhausts all attempts and returns failure
 * - Correct backoff delays between retries
 * - Logging at each stage (retry, success-after-retry, exhaustion)
 *
 * Uses injected delay to avoid real waits.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import { expect, createSpy } from "../../../../dm/facade/test-helpers/index.js";
import { withRetry, __setDelayForTests, __resetDelayForTests } from "../../../src/lib/retry.js";

// ============================================================================
// Test helpers
// ============================================================================

function createMockLog() {
  return {
    info: createSpy("log.info"),
    warn: createSpy("log.warn"),
    error: createSpy("log.error"),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("withRetry helper", () => {

  let delayCallArgs;

  beforeEach(() => {
    delayCallArgs = [];
    __setDelayForTests((ms) => {
      delayCallArgs.push(ms);
      return Promise.resolve();
    });
  });

  afterEach(() => {
    __resetDelayForTests();
  });

  // --------------------------------------------------------------------------
  // Happy path
  // --------------------------------------------------------------------------

  it("should succeed on first attempt without delay", async () => {
    const fn = createSpy("fn").mockResolvedValue("ok");
    const log = createMockLog();

    const result = await withRetry(fn, { label: "test_op", log });

    expect(result.success).toBe(true);
    expect(result.result).toBe("ok");
    expect(fn.callCount).toBe(1);
    expect(delayCallArgs.length).toBe(0);
    // No warn or error logs on clean success
    expect(log.warn.callCount).toBe(0);
    expect(log.error.callCount).toBe(0);
  });

  // --------------------------------------------------------------------------
  // Retry + succeed
  // --------------------------------------------------------------------------

  it("should retry once and succeed on second attempt", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls === 1) throw new Error("transient failure");
      return "recovered";
    };
    const log = createMockLog();

    const result = await withRetry(fn, { label: "test_op", log });

    expect(result.success).toBe(true);
    expect(result.result).toBe("recovered");
    expect(calls).toBe(2);
    // Should have warned on attempt 1 failure
    expect(log.warn.callCount).toBe(1);
    expect(log.warn.calls[0][0]).toBe("test_op_retry");
    // Should have info'd on retry success
    expect(log.info.callCount).toBe(1);
    expect(log.info.calls[0][0]).toBe("test_op_retry_succeeded");
  });

  it("should retry twice and succeed on third attempt", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 3) throw new Error("transient");
      return "third-time-charm";
    };
    const log = createMockLog();

    const result = await withRetry(fn, { label: "test_op", log });

    expect(result.success).toBe(true);
    expect(result.result).toBe("third-time-charm");
    expect(calls).toBe(3);
    expect(log.warn.callCount).toBe(2);
  });

  // --------------------------------------------------------------------------
  // Exhaustion
  // --------------------------------------------------------------------------

  it("should return failure after exhausting all attempts", async () => {
    const fn = createSpy("fn").mockRejectedValue(new Error("persistent failure"));
    const log = createMockLog();

    const result = await withRetry(fn, { label: "test_op", log, maxAttempts: 3 });

    expect(result.success).toBe(false);
    expect(result.error).toBe("persistent failure");
    expect(fn.callCount).toBe(3);
    // 2 warn logs for retries, 1 error log for exhaustion
    expect(log.warn.callCount).toBe(2);
    expect(log.error.callCount).toBe(1);
    expect(log.error.calls[0][0]).toBe("test_op_exhausted");
  });

  it("should not throw even when all attempts fail", async () => {
    const fn = createSpy("fn").mockRejectedValue(new Error("boom"));
    const log = createMockLog();

    // Should not throw — returns { success: false }
    const result = await withRetry(fn, { label: "test_op", log });

    expect(result.success).toBe(false);
  });

  // --------------------------------------------------------------------------
  // Backoff timing
  // --------------------------------------------------------------------------

  it("should use exponential backoff: 1000ms, 2000ms with default baseDelayMs", async () => {
    const fn = createSpy("fn").mockRejectedValue(new Error("fail"));
    const log = createMockLog();

    await withRetry(fn, { label: "test_op", log, maxAttempts: 3 });

    // Delays between retries: 1000*1=1000, 1000*2=2000
    expect(delayCallArgs.length).toBe(2);
    expect(delayCallArgs[0]).toBe(1000);
    expect(delayCallArgs[1]).toBe(2000);
  });

  it("should respect custom baseDelayMs", async () => {
    const fn = createSpy("fn").mockRejectedValue(new Error("fail"));
    const log = createMockLog();

    await withRetry(fn, { label: "test_op", log, maxAttempts: 3, baseDelayMs: 500 });

    expect(delayCallArgs[0]).toBe(500);
    expect(delayCallArgs[1]).toBe(1000);
  });

  it("should not delay after the final failed attempt", async () => {
    const fn = createSpy("fn").mockRejectedValue(new Error("fail"));
    const log = createMockLog();

    await withRetry(fn, { label: "test_op", log, maxAttempts: 2 });

    // Only 1 delay (between attempt 1 and 2), none after attempt 2
    expect(delayCallArgs.length).toBe(1);
  });

  // --------------------------------------------------------------------------
  // maxAttempts = 1 (no retry)
  // --------------------------------------------------------------------------

  it("should not retry when maxAttempts is 1", async () => {
    const fn = createSpy("fn").mockRejectedValue(new Error("no retry"));
    const log = createMockLog();

    const result = await withRetry(fn, { label: "test_op", log, maxAttempts: 1 });

    expect(result.success).toBe(false);
    expect(fn.callCount).toBe(1);
    expect(delayCallArgs.length).toBe(0);
    // No warn (no retries), just error for exhaustion
    expect(log.warn.callCount).toBe(0);
    expect(log.error.callCount).toBe(1);
  });

  // --------------------------------------------------------------------------
  // Label propagation
  // --------------------------------------------------------------------------

  it("should use the label in all log messages", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 3) throw new Error("fail");
      return "ok";
    };
    const log = createMockLog();

    await withRetry(fn, { label: "license_renew", log });

    // Warn logs should use label prefix
    expect(log.warn.calls[0][0]).toBe("license_renew_retry");
    expect(log.warn.calls[1][0]).toBe("license_renew_retry");
    // Info log for retry success
    expect(log.info.calls[0][0]).toBe("license_renew_retry_succeeded");
  });

  // --------------------------------------------------------------------------
  // Error message passthrough
  // --------------------------------------------------------------------------

  it("should include error message in warn and error logs", async () => {
    const fn = createSpy("fn").mockRejectedValue(new Error("Connection reset"));
    const log = createMockLog();

    await withRetry(fn, { label: "test_op", log, maxAttempts: 2 });

    // Warn log includes errorMessage
    expect(log.warn.calls[0][2]).toHaveProperty("errorMessage", "Connection reset");
    // Error log includes errorMessage
    expect(log.error.calls[0][3]).toHaveProperty("errorMessage", "Connection reset");
  });

  // --------------------------------------------------------------------------
  // No info log on first-attempt success
  // --------------------------------------------------------------------------

  it("should not log retry_succeeded when first attempt works", async () => {
    const fn = createSpy("fn").mockResolvedValue("ok");
    const log = createMockLog();

    await withRetry(fn, { label: "test_op", log });

    expect(log.info.callCount).toBe(0);
  });
});

// ============================================================================
// Source-level verification: Stripe webhook uses withRetry
// ============================================================================

describe("Source-level: Stripe webhook handler uses withRetry for all Keygen writes", () => {

  let routeSource;

  it("should load the Stripe webhook route source", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    routeSource = readFileSync(
      resolve(import.meta.dirname, "../../../src/app/api/webhooks/stripe/route.js"),
      "utf-8",
    );
    expect(routeSource.length).toBeGreaterThan(0);
  });

  it("should import withRetry from @/lib/retry", () => {
    expect(routeSource).toMatch(/import\s*\{\s*withRetry\s*\}\s*from\s*["']@\/lib\/retry["']/);
  });

  it("should have no bare try/catch around suspendLicense", () => {
    // All suspendLicense calls should be wrapped in withRetry, not try/catch
    const suspendMatches = routeSource.match(/suspendLicense/g) || [];
    const withRetryMatches = routeSource.match(/withRetry\(\(\)\s*=>\s*suspendLicense/g) || [];
    // The import line has one reference, all call sites should use withRetry
    expect(withRetryMatches.length).toBe(suspendMatches.length - 1); // -1 for import
  });

  it("should have no bare try/catch around renewLicense", () => {
    const renewMatches = routeSource.match(/renewLicense/g) || [];
    const withRetryMatches = routeSource.match(/withRetry\(\(\)\s*=>\s*renewLicense/g) || [];
    expect(withRetryMatches.length).toBe(renewMatches.length - 1);
  });

  it("should have no bare try/catch around reinstateLicense", () => {
    const reinstateMatches = routeSource.match(/reinstateLicense/g) || [];
    const withRetryMatches = routeSource.match(/withRetry\(\(\)\s*=>\s*reinstateLicense/g) || [];
    expect(withRetryMatches.length).toBe(reinstateMatches.length - 1);
  });

  it("should have no remaining license_suspend_failed / license_renew_failed / license_reinstate_failed log labels", () => {
    expect(routeSource).not.toMatch(/license_suspend_failed/);
    expect(routeSource).not.toMatch(/license_renew_failed/);
    expect(routeSource).not.toMatch(/license_reinstate_failed/);
  });
});
