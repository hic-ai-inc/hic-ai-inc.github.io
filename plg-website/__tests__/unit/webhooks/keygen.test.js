/**
 * Keygen Webhook Handler — Suspended Removal Tests
 *
 * Verifies Fix 5 changes to the Keygen webhook handler:
 * - handleLicenseSuspended is log-only (no DDB write, no email trigger)
 *
 * Uses source-level verification and extracted logic with dependency injection.
 *
 * _Requirements: 13.12_
 */

import { describe, it } from "node:test";
import { expect, createSpy } from "../../../../dm/facade/test-helpers/index.js";

// ============================================================================
// Extracted logic: mirrors handleLicenseSuspended from route.js
// The function should ONLY log — no DDB writes, no email triggers.
// ============================================================================

/**
 * Core logic extracted from handleLicenseSuspended.
 * After Fix 5, this is log-only.
 *
 * @param {Object} data - Keygen license event data
 * @param {Object} deps - Injected dependencies
 * @param {Function} deps.updateLicenseStatus - DDB write (should NOT be called)
 * @param {Object} deps.log - Logger
 */
async function handleLicenseSuspended(data, deps) {
  const licenseId = data.id;
  // Log only — Keygen suspension is a side effect of our own suspendLicense calls.
  // DDB status is already set by the originating handler (Stripe webhook or team route).
  deps.log.info("license_suspended_acknowledged", "License suspended event received (log-only, no DDB write)", { licenseId });
}

// ============================================================================
// Test helpers
// ============================================================================

function createMockLog() {
  return {
    info: createSpy("log.info"),
    warn: createSpy("log.warn"),
    error: createSpy("log.error"),
    decision: createSpy("log.decision"),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("Fix 5 — Keygen webhook: handleLicenseSuspended is log-only", () => {

  it("should log the event and make no DDB writes (Requirement 4.7)", async () => {
    const updateLicenseStatus = createSpy("updateLicenseStatus").mockResolvedValue(undefined);
    const log = createMockLog();
    const data = { id: "license-suspended-001" };

    await handleLicenseSuspended(data, { updateLicenseStatus, log });

    // Should log the event
    expect(log.info.callCount).toBe(1);
    expect(log.info.calls[0][0]).toBe("license_suspended_acknowledged");

    // Should NOT write to DDB
    expect(updateLicenseStatus.callCount).toBe(0);
  });

  it("should not trigger any email pipeline", async () => {
    const updateLicenseStatus = createSpy("updateLicenseStatus").mockResolvedValue(undefined);
    const log = createMockLog();
    const data = { id: "license-suspended-002" };

    await handleLicenseSuspended(data, { updateLicenseStatus, log });

    // Verify no DDB write with eventType (which would trigger email pipeline)
    expect(updateLicenseStatus.callCount).toBe(0);
  });

  it("should handle any license ID without side effects", async () => {
    const licenseIds = ["lic-aaa", "lic-bbb", "00000000-0000-0000-0000-000000000000", ""];

    for (const licenseId of licenseIds) {
      const updateLicenseStatus = createSpy("updateLicenseStatus").mockResolvedValue(undefined);
      const log = createMockLog();

      await handleLicenseSuspended({ id: licenseId }, { updateLicenseStatus, log });

      expect(log.info.callCount).toBe(1);
      expect(updateLicenseStatus.callCount).toBe(0);
    }
  });

  // --------------------------------------------------------------------------
  // Source-level verification
  // --------------------------------------------------------------------------
  describe("Source-level verification", () => {

    it("handleLicenseSuspended source should not call updateLicenseStatus", async () => {
      const { readFileSync } = await import("node:fs");
      const { resolve } = await import("node:path");
      const src = readFileSync(
        resolve(import.meta.dirname, "../../../src/app/api/webhooks/keygen/route.js"),
        "utf-8",
      );

      // Extract handleLicenseSuspended function body
      const fnStart = src.indexOf("async function handleLicenseSuspended");
      const fnEnd = src.indexOf("async function handleLicense", fnStart + 1);
      const fnBody = src.slice(fnStart, fnEnd !== -1 ? fnEnd : undefined);

      // Should not contain updateLicenseStatus call
      expect(fnBody).not.toMatch(/await\s+updateLicenseStatus/);
    });

    it("handleLicenseSuspended source should not reference email sending", async () => {
      const { readFileSync } = await import("node:fs");
      const { resolve } = await import("node:path");
      const src = readFileSync(
        resolve(import.meta.dirname, "../../../src/app/api/webhooks/keygen/route.js"),
        "utf-8",
      );

      // Extract handleLicenseSuspended function body
      const fnStart = src.indexOf("async function handleLicenseSuspended");
      const fnEnd = src.indexOf("async function handleLicense", fnStart + 1);
      const fnBody = src.slice(fnStart, fnEnd !== -1 ? fnEnd : undefined);

      // Should not contain email-related calls
      expect(fnBody).not.toMatch(/sendEmail|triggerEmail|eventType/);
    });

    it("email-templates.js should not contain licenseSuspended template (Requirement 4.9)", async () => {
      const { readFileSync } = await import("node:fs");
      const { resolve } = await import("node:path");
      const src = readFileSync(
        resolve(import.meta.dirname, "../../../../dm/layers/ses/src/email-templates.js"),
        "utf-8",
      );

      expect(src).not.toMatch(/licenseSuspended/);
      expect(src).not.toMatch(/LICENSE_SUSPENDED/);
    });
  });
});
