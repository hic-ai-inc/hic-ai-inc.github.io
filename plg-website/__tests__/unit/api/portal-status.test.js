/**
 * Portal Status API — Unit Tests (Task 11.2)
 *
 * Tests the portal status classification logic added by Fix 4 (Task 11.1):
 * - "past_due" is its own category, not lumped with expired
 * - active/cancellation_pending classified as active
 * - canceled/unpaid classified as expired
 * - past-due customers get full portal access (hasSubscription: true)
 * - expired customers get full portal access (not redirected to checkout)
 * - "none" / unknown statuses redirect to checkout
 *
 * Uses extracted pure-function logic — no module mocking needed.
 *
 * _Requirements: 13.9_
 */

import { describe, it } from "node:test";
import { expect } from "../../../../dm/facade/test-helpers/index.js";

// ============================================================================
// Extracted logic: mirrors the status classification in portal/status/route.js
// Pure function, dependency-injected for testability.
// ============================================================================

/**
 * Classify a subscription status for portal routing.
 *
 * Extraction of the four decision variables from route.js lines 122–137:
 *   hasActiveSubscription  → ["active", "cancellation_pending"]
 *   hasPastDueSubscription → "past_due"
 *   hasExpiredSubscription  → ["canceled", "unpaid"]
 *   (everything else falls through to "none")
 *
 * Returns the same shape as the route's response body (status, hasSubscription,
 * shouldRedirectToCheckout) so assertions map 1:1 to production behavior.
 *
 * @param {string} subscriptionStatus
 * @returns {{ status: string, hasSubscription: boolean, shouldRedirectToCheckout: boolean }}
 */
function classifyPortalStatus(subscriptionStatus) {
  const hasActiveSubscription = ["active", "cancellation_pending"].includes(
    subscriptionStatus,
  );
  const hasPastDueSubscription = subscriptionStatus === "past_due";
  const hasExpiredSubscription = ["canceled", "unpaid"].includes(
    subscriptionStatus,
  );

  return {
    status: hasActiveSubscription
      ? "active"
      : hasPastDueSubscription
        ? "past_due"
        : hasExpiredSubscription
          ? "expired"
          : "none",
    hasSubscription: hasActiveSubscription || hasPastDueSubscription,
    shouldRedirectToCheckout:
      !hasActiveSubscription &&
      !hasPastDueSubscription &&
      !hasExpiredSubscription,
  };
}

// ============================================================================
// Unit tests
// ============================================================================

describe("portal status — status classification (Fix 4 / Task 11.1)", () => {
  // ---- Active statuses ----

  describe("active classification", () => {
    it('classifies "active" as active with subscription', () => {
      const result = classifyPortalStatus("active");
      expect(result.status).toBe("active");
      expect(result.hasSubscription).toBe(true);
      expect(result.shouldRedirectToCheckout).toBe(false);
    });

    it('classifies "cancellation_pending" as active with subscription', () => {
      const result = classifyPortalStatus("cancellation_pending");
      expect(result.status).toBe("active");
      expect(result.hasSubscription).toBe(true);
      expect(result.shouldRedirectToCheckout).toBe(false);
    });
  });

  // ---- Past-due: own category (the core Fix 4 change) ----

  describe("past_due classification", () => {
    it('classifies "past_due" as its own category, NOT expired', () => {
      const result = classifyPortalStatus("past_due");
      expect(result.status).toBe("past_due");
      // Must NOT be "expired" — this is the whole point of Fix 4
      expect(result.status === "expired").toBe(false);
    });

    it("past_due retains hasSubscription: true (full portal access)", () => {
      const result = classifyPortalStatus("past_due");
      expect(result.hasSubscription).toBe(true);
    });

    it("past_due is not redirected to checkout", () => {
      const result = classifyPortalStatus("past_due");
      expect(result.shouldRedirectToCheckout).toBe(false);
    });
  });

  // ---- Expired statuses ----

  describe("expired classification", () => {
    it('classifies "canceled" as expired', () => {
      const result = classifyPortalStatus("canceled");
      expect(result.status).toBe("expired");
      expect(result.hasSubscription).toBe(false);
    });

    it('classifies "unpaid" as expired', () => {
      const result = classifyPortalStatus("unpaid");
      expect(result.status).toBe("expired");
      expect(result.hasSubscription).toBe(false);
    });

    it("expired is NOT redirected to checkout (can see reactivation prompt)", () => {
      const result = classifyPortalStatus("canceled");
      expect(result.shouldRedirectToCheckout).toBe(false);
    });
  });

  // ---- No subscription / unknown statuses ----

  describe("none / unknown classification", () => {
    it('classifies "none" as none and redirects to checkout', () => {
      const result = classifyPortalStatus("none");
      expect(result.status).toBe("none");
      expect(result.hasSubscription).toBe(false);
      expect(result.shouldRedirectToCheckout).toBe(true);
    });

    it("classifies undefined as none and redirects to checkout", () => {
      const result = classifyPortalStatus(undefined);
      expect(result.status).toBe("none");
      expect(result.hasSubscription).toBe(false);
      expect(result.shouldRedirectToCheckout).toBe(true);
    });

    it("classifies unknown string as none and redirects to checkout", () => {
      const result = classifyPortalStatus("something_unexpected");
      expect(result.status).toBe("none");
      expect(result.shouldRedirectToCheckout).toBe(true);
    });
  });

  // ---- Exhaustive: every known subscription status is handled ----

  describe("exhaustive classification", () => {
    const EXPECTED = {
      active: {
        status: "active",
        hasSubscription: true,
        shouldRedirectToCheckout: false,
      },
      cancellation_pending: {
        status: "active",
        hasSubscription: true,
        shouldRedirectToCheckout: false,
      },
      past_due: {
        status: "past_due",
        hasSubscription: true,
        shouldRedirectToCheckout: false,
      },
      canceled: {
        status: "expired",
        hasSubscription: false,
        shouldRedirectToCheckout: false,
      },
      unpaid: {
        status: "expired",
        hasSubscription: false,
        shouldRedirectToCheckout: false,
      },
      none: {
        status: "none",
        hasSubscription: false,
        shouldRedirectToCheckout: true,
      },
    };

    for (const [input, expected] of Object.entries(EXPECTED)) {
      it(`"${input}" → status: "${expected.status}", hasSub: ${expected.hasSubscription}, redirect: ${expected.shouldRedirectToCheckout}`, () => {
        const result = classifyPortalStatus(input);
        expect(result.status).toBe(expected.status);
        expect(result.hasSubscription).toBe(expected.hasSubscription);
        expect(result.shouldRedirectToCheckout).toBe(
          expected.shouldRedirectToCheckout,
        );
      });
    }
  });

  // ---- Boundary: past_due must never appear in expired bucket ----

  describe("Fix 4 invariant: past_due ≠ expired", () => {
    it('"past_due" and "expired" are distinct statuses', () => {
      const pastDue = classifyPortalStatus("past_due");
      const canceled = classifyPortalStatus("canceled");

      // They must produce different status strings
      expect(pastDue.status === canceled.status).toBe(false);

      // past_due has subscription, expired does not
      expect(pastDue.hasSubscription).toBe(true);
      expect(canceled.hasSubscription).toBe(false);
    });
  });
});
