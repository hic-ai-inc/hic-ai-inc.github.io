/**
 * Stripe Webhook Handler — Suspended Removal Tests
 *
 * Verifies Fix 5 changes to the Stripe webhook handler:
 * - handlePaymentFailed writes "past_due" only, never "suspended"
 * - handlePaymentFailed skips write when status is already "expired"
 * - handleDisputeClosed writes "expired" on lost dispute with fraudulent: true
 *
 * Tests use extracted logic with dependency injection for behavioral verification,
 * plus source-level grep verification for structural guarantees.
 *
 * _Requirements: 13.7, 13.8_
 */

import { describe, it, beforeEach } from "node:test";
import { expect, createSpy } from "../../../../dm/facade/test-helpers/index.js";

// ============================================================================
// Extracted logic: mirrors handlePaymentFailed from route.js
// Uses dependency injection for testability — no module mocking needed.
// ============================================================================

/**
 * Core logic extracted from handlePaymentFailed.
 * Dependency-injected for testability.
 *
 * @param {Object} invoice - Stripe invoice object
 * @param {Object} deps - Injected dependencies
 * @param {Function} deps.resolveCustomer - Resolves DDB customer from Stripe ID
 * @param {Function} deps.updateCustomerSubscription - Writes subscription status to DDB
 * @param {Function} deps.updateLicenseStatus - Writes license status to DDB
 * @param {Object} deps.log - Logger
 */
async function handlePaymentFailed(invoice, deps) {
  const { customer_email, attempt_count, customer, next_payment_attempt } = invoice;
  const { resolveCustomer, updateCustomerSubscription, updateLicenseStatus, log } = deps;

  const dbCustomer = await resolveCustomer(customer, log);
  if (!dbCustomer) return;

  // Allowlist guard: only "active" and "past_due" can transition to "past_due".
  // Trial users have no renewal invoice; cancellation_pending users have a paid term
  // that expires into cancellation (no renewal attempt). All other statuses (expired,
  // canceled, revoked, suspended, disputed) must never spring back to "past_due",
  // which would grant a full dunning period (2 weeks) of usage. CWE-367 TOCTOU.
  const PAYMENT_FAILURE_ELIGIBLE_STATUSES = ["active", "past_due"];
  if (!PAYMENT_FAILURE_ELIGIBLE_STATUSES.includes(dbCustomer.subscriptionStatus)) {
    log.decision("ineligible_status_guard", "Skipping past_due write — current status is not eligible for payment failure processing", {
      currentStatus: dbCustomer.subscriptionStatus,
      eligibleStatuses: PAYMENT_FAILURE_ELIGIBLE_STATUSES,
    });
    return;
  }

  const retryDate = next_payment_attempt
    ? new Date(next_payment_attempt * 1000).toLocaleDateString()
    : null;

  await updateCustomerSubscription(dbCustomer.userId, {
    subscriptionStatus: "past_due",
    paymentFailureCount: attempt_count,
    eventType: "PAYMENT_FAILED",
    email: customer_email,
    attemptCount: attempt_count,
    retryDate,
  });

  if (dbCustomer.keygenLicenseId) {
    await updateLicenseStatus(dbCustomer.keygenLicenseId, "past_due");
  }
}

/**
 * Core logic extracted from handleDisputeClosed.
 * Dependency-injected for testability.
 *
 * @param {Object} dispute - Stripe dispute object
 * @param {Object} deps - Injected dependencies
 */
async function handleDisputeClosed(dispute, deps) {
  const { resolveCustomer, updateCustomerSubscription, updateLicenseStatus, suspendLicense, reinstateLicense, log } = deps;
  const { customer, status } = dispute;

  const dbCustomer = await resolveCustomer(customer, log);
  if (!dbCustomer) return;

  const reinstateStatuses = ["won", "withdrawn", "warning_closed"];

  if (reinstateStatuses.includes(status)) {
    if (dbCustomer.keygenLicenseId) {
      await updateLicenseStatus(dbCustomer.keygenLicenseId, "active");
      try {
        await reinstateLicense(dbCustomer.keygenLicenseId);
      } catch (e) {
        log.warn("license_reinstate_failed", "Failed to reinstate Keygen license", {
          errorMessage: e?.message,
        });
      }
    }
    await updateCustomerSubscription(dbCustomer.userId, {
      subscriptionStatus: "active",
    });
  } else {
    await updateCustomerSubscription(dbCustomer.userId, {
      subscriptionStatus: "expired",
      fraudulent: true,
    });

    if (dbCustomer.keygenLicenseId) {
      await updateLicenseStatus(dbCustomer.keygenLicenseId, "expired");
      try {
        await suspendLicense(dbCustomer.keygenLicenseId);
      } catch (e) {
        log.warn("license_suspend_failed", "Failed to suspend Keygen license after lost dispute", {
          errorMessage: e?.message,
        });
      }
    }
  }
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

function createMockCustomer(overrides = {}) {
  return {
    userId: "user-123",
    email: "test@example.com",
    keygenLicenseId: "license-abc",
    subscriptionStatus: "active",
    ...overrides,
  };
}

function createMockDeps(dbCustomer) {
  return {
    resolveCustomer: createSpy("resolveCustomer").mockResolvedValue(dbCustomer),
    updateCustomerSubscription: createSpy("updateCustomerSubscription").mockResolvedValue(undefined),
    updateLicenseStatus: createSpy("updateLicenseStatus").mockResolvedValue(undefined),
    suspendLicense: createSpy("suspendLicense").mockResolvedValue(undefined),
    reinstateLicense: createSpy("reinstateLicense").mockResolvedValue(undefined),
    log: createMockLog(),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("Fix 5 — Stripe webhook: suspended removal from payment path", () => {

  // --------------------------------------------------------------------------
  // handlePaymentFailed
  // --------------------------------------------------------------------------
  describe("handlePaymentFailed", () => {

    it("should write 'past_due' to DDB on payment failure (Requirement 4.1)", async () => {
      const customer = createMockCustomer({ subscriptionStatus: "active" });
      const deps = createMockDeps(customer);
      const invoice = {
        id: "inv_001",
        customer: "cus_stripe_123",
        customer_email: "test@example.com",
        attempt_count: 1,
        next_payment_attempt: null,
      };

      await handlePaymentFailed(invoice, deps);

      expect(deps.updateCustomerSubscription.callCount).toBe(1);
      const [, updatePayload] = deps.updateCustomerSubscription.calls[0];
      expect(updatePayload.subscriptionStatus).toBe("past_due");
    });

    it("should never write 'suspended' regardless of attempt count (Requirement 4.1)", async () => {
      // Test with high attempt counts that previously triggered "suspended"
      for (const attemptCount of [1, 3, 5, 8, 10, 99]) {
        const customer = createMockCustomer({ subscriptionStatus: "active" });
        const deps = createMockDeps(customer);
        const invoice = {
          id: `inv_attempt_${attemptCount}`,
          customer: "cus_stripe_123",
          customer_email: "test@example.com",
          attempt_count: attemptCount,
          next_payment_attempt: null,
        };

        await handlePaymentFailed(invoice, deps);

        // Verify the status written is always "past_due"
        const [, updatePayload] = deps.updateCustomerSubscription.calls[0];
        expect(updatePayload.subscriptionStatus).toBe("past_due");

        // Verify "suspended" never appears in any DDB write
        for (const call of deps.updateCustomerSubscription.calls) {
          const payload = call[1];
          expect(payload.subscriptionStatus).not.toBe("suspended");
        }
        for (const call of deps.updateLicenseStatus.calls) {
          expect(call[1]).not.toBe("suspended");
        }
      }
    });

    it("should skip write when status is 'expired' — ineligible status guard (Requirement 4.2)", async () => {
      const customer = createMockCustomer({ subscriptionStatus: "expired" });
      const deps = createMockDeps(customer);
      const invoice = {
        id: "inv_expired",
        customer: "cus_stripe_123",
        customer_email: "test@example.com",
        attempt_count: 2,
        next_payment_attempt: null,
      };

      await handlePaymentFailed(invoice, deps);

      // No DDB writes should occur
      expect(deps.updateCustomerSubscription.callCount).toBe(0);
      expect(deps.updateLicenseStatus.callCount).toBe(0);

      // Should log the ineligible_status_guard decision
      expect(deps.log.decision.callCount).toBe(1);
      expect(deps.log.decision.calls[0][0]).toBe("ineligible_status_guard");
    });

    it("should skip write when status is 'canceled'", async () => {
      const customer = createMockCustomer({ subscriptionStatus: "canceled" });
      const deps = createMockDeps(customer);
      const invoice = {
        id: "inv_canceled",
        customer: "cus_stripe_123",
        customer_email: "test@example.com",
        attempt_count: 1,
        next_payment_attempt: null,
      };

      await handlePaymentFailed(invoice, deps);

      expect(deps.updateCustomerSubscription.callCount).toBe(0);
      expect(deps.updateLicenseStatus.callCount).toBe(0);
      expect(deps.log.decision.calls[0][0]).toBe("ineligible_status_guard");
    });

    it("should skip write when status is 'revoked'", async () => {
      const customer = createMockCustomer({ subscriptionStatus: "revoked" });
      const deps = createMockDeps(customer);
      const invoice = {
        id: "inv_revoked",
        customer: "cus_stripe_123",
        customer_email: "test@example.com",
        attempt_count: 1,
        next_payment_attempt: null,
      };

      await handlePaymentFailed(invoice, deps);

      expect(deps.updateCustomerSubscription.callCount).toBe(0);
      expect(deps.updateLicenseStatus.callCount).toBe(0);
      expect(deps.log.decision.calls[0][0]).toBe("ineligible_status_guard");
    });

    it("should skip write when status is 'suspended'", async () => {
      const customer = createMockCustomer({ subscriptionStatus: "suspended" });
      const deps = createMockDeps(customer);
      const invoice = {
        id: "inv_suspended",
        customer: "cus_stripe_123",
        customer_email: "test@example.com",
        attempt_count: 1,
        next_payment_attempt: null,
      };

      await handlePaymentFailed(invoice, deps);

      expect(deps.updateCustomerSubscription.callCount).toBe(0);
      expect(deps.updateLicenseStatus.callCount).toBe(0);
      expect(deps.log.decision.calls[0][0]).toBe("ineligible_status_guard");
    });

    it("should skip write when status is 'disputed'", async () => {
      const customer = createMockCustomer({ subscriptionStatus: "disputed" });
      const deps = createMockDeps(customer);
      const invoice = {
        id: "inv_disputed",
        customer: "cus_stripe_123",
        customer_email: "test@example.com",
        attempt_count: 1,
        next_payment_attempt: null,
      };

      await handlePaymentFailed(invoice, deps);

      expect(deps.updateCustomerSubscription.callCount).toBe(0);
      expect(deps.updateLicenseStatus.callCount).toBe(0);
      expect(deps.log.decision.calls[0][0]).toBe("ineligible_status_guard");
    });

    it("should skip write when status is 'pending_account'", async () => {
      const customer = createMockCustomer({ subscriptionStatus: "pending_account" });
      const deps = createMockDeps(customer);
      const invoice = {
        id: "inv_pending",
        customer: "cus_stripe_123",
        customer_email: "test@example.com",
        attempt_count: 1,
        next_payment_attempt: null,
      };

      await handlePaymentFailed(invoice, deps);

      expect(deps.updateCustomerSubscription.callCount).toBe(0);
      expect(deps.updateLicenseStatus.callCount).toBe(0);
      expect(deps.log.decision.calls[0][0]).toBe("ineligible_status_guard");
    });

    it("should skip write when status is 'trial' — no renewal invoice exists for trial users", async () => {
      const customer = createMockCustomer({ subscriptionStatus: "trial" });
      const deps = createMockDeps(customer);
      const invoice = {
        id: "inv_trial",
        customer: "cus_stripe_123",
        customer_email: "test@example.com",
        attempt_count: 1,
        next_payment_attempt: null,
      };

      await handlePaymentFailed(invoice, deps);

      expect(deps.updateCustomerSubscription.callCount).toBe(0);
      expect(deps.updateLicenseStatus.callCount).toBe(0);
      expect(deps.log.decision.calls[0][0]).toBe("ineligible_status_guard");
    });

    it("should skip write when status is 'cancellation_pending' — paid term expires into cancellation, no renewal attempt", async () => {
      const customer = createMockCustomer({ subscriptionStatus: "cancellation_pending" });
      const deps = createMockDeps(customer);
      const invoice = {
        id: "inv_cancel_pending",
        customer: "cus_stripe_123",
        customer_email: "test@example.com",
        attempt_count: 1,
        next_payment_attempt: null,
      };

      await handlePaymentFailed(invoice, deps);

      expect(deps.updateCustomerSubscription.callCount).toBe(0);
      expect(deps.updateLicenseStatus.callCount).toBe(0);
      expect(deps.log.decision.calls[0][0]).toBe("ineligible_status_guard");
    });

    it("should proceed with write for eligible statuses: active, past_due only", async () => {
      const eligibleStatuses = ["active", "past_due"];

      for (const status of eligibleStatuses) {
        const customer = createMockCustomer({ subscriptionStatus: status });
        const deps = createMockDeps(customer);
        const invoice = {
          id: `inv_eligible_${status}`,
          customer: "cus_stripe_123",
          customer_email: "test@example.com",
          attempt_count: 1,
          next_payment_attempt: null,
        };

        await handlePaymentFailed(invoice, deps);

        expect(deps.updateCustomerSubscription.callCount).toBe(1);
        const [, payload] = deps.updateCustomerSubscription.calls[0];
        expect(payload.subscriptionStatus).toBe("past_due");
      }
    });

    it("should update license status to 'past_due' when keygenLicenseId exists", async () => {
      const customer = createMockCustomer({ keygenLicenseId: "lic-xyz" });
      const deps = createMockDeps(customer);
      const invoice = {
        id: "inv_lic",
        customer: "cus_stripe_123",
        customer_email: "test@example.com",
        attempt_count: 1,
        next_payment_attempt: null,
      };

      await handlePaymentFailed(invoice, deps);

      expect(deps.updateLicenseStatus.callCount).toBe(1);
      expect(deps.updateLicenseStatus.calls[0][0]).toBe("lic-xyz");
      expect(deps.updateLicenseStatus.calls[0][1]).toBe("past_due");
    });

    it("should skip license status update when no keygenLicenseId", async () => {
      const customer = createMockCustomer({ keygenLicenseId: null });
      const deps = createMockDeps(customer);
      const invoice = {
        id: "inv_no_lic",
        customer: "cus_stripe_123",
        customer_email: "test@example.com",
        attempt_count: 1,
        next_payment_attempt: null,
      };

      await handlePaymentFailed(invoice, deps);

      expect(deps.updateLicenseStatus.callCount).toBe(0);
    });

    it("should do nothing when customer is not found", async () => {
      const deps = createMockDeps(null);
      const invoice = {
        id: "inv_no_cust",
        customer: "cus_unknown",
        customer_email: "ghost@example.com",
        attempt_count: 1,
        next_payment_attempt: null,
      };

      await handlePaymentFailed(invoice, deps);

      expect(deps.updateCustomerSubscription.callCount).toBe(0);
      expect(deps.updateLicenseStatus.callCount).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // handleDisputeClosed
  // --------------------------------------------------------------------------
  describe("handleDisputeClosed", () => {

    it("should write 'expired' with fraudulent: true on lost dispute (Requirement 4.6)", async () => {
      const customer = createMockCustomer();
      const deps = createMockDeps(customer);
      const dispute = {
        id: "dp_lost",
        customer: "cus_stripe_123",
        status: "lost",
      };

      await handleDisputeClosed(dispute, deps);

      expect(deps.updateCustomerSubscription.callCount).toBe(1);
      const [, updatePayload] = deps.updateCustomerSubscription.calls[0];
      expect(updatePayload.subscriptionStatus).toBe("expired");
      expect(updatePayload.fraudulent).toBe(true);
    });

    it("should never write 'suspended' on any non-reinstating dispute status", async () => {
      // All dispute statuses that are NOT won/withdrawn/warning_closed
      const lostStatuses = ["lost", "charge_refunded", "needs_response", "under_review"];

      for (const status of lostStatuses) {
        const customer = createMockCustomer();
        const deps = createMockDeps(customer);
        const dispute = { id: `dp_${status}`, customer: "cus_stripe_123", status };

        await handleDisputeClosed(dispute, deps);

        // Verify no "suspended" in any DDB write
        for (const call of deps.updateCustomerSubscription.calls) {
          const payload = call[1];
          expect(payload.subscriptionStatus).not.toBe("suspended");
        }
        for (const call of deps.updateLicenseStatus.calls) {
          expect(call[1]).not.toBe("suspended");
        }
      }
    });

    it("should update license status to 'expired' and call suspendLicense on lost dispute", async () => {
      const customer = createMockCustomer({ keygenLicenseId: "lic-dispute" });
      const deps = createMockDeps(customer);
      const dispute = { id: "dp_lost2", customer: "cus_stripe_123", status: "lost" };

      await handleDisputeClosed(dispute, deps);

      expect(deps.updateLicenseStatus.callCount).toBe(1);
      expect(deps.updateLicenseStatus.calls[0][1]).toBe("expired");
      expect(deps.suspendLicense.callCount).toBe(1);
      expect(deps.suspendLicense.calls[0][0]).toBe("lic-dispute");
    });

    it("should reinstate to 'active' on won dispute", async () => {
      const customer = createMockCustomer({ keygenLicenseId: "lic-won" });
      const deps = createMockDeps(customer);
      const dispute = { id: "dp_won", customer: "cus_stripe_123", status: "won" };

      await handleDisputeClosed(dispute, deps);

      const [, updatePayload] = deps.updateCustomerSubscription.calls[0];
      expect(updatePayload.subscriptionStatus).toBe("active");
      expect(deps.updateLicenseStatus.calls[0][1]).toBe("active");
      expect(deps.reinstateLicense.callCount).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Source-level verification: no "suspended" in payment path
  // --------------------------------------------------------------------------
  describe("Source-level verification", () => {

    it("handlePaymentFailed source should not contain 'suspended' as a status write", async () => {
      const { readFileSync } = await import("node:fs");
      const { resolve } = await import("node:path");
      const src = readFileSync(
        resolve(import.meta.dirname, "../../../src/app/api/webhooks/stripe/route.js"),
        "utf-8",
      );

      // Extract handlePaymentFailed function body
      const fnStart = src.indexOf("async function handlePaymentFailed");
      const fnEnd = src.indexOf("async function handleDispute", fnStart);
      const fnBody = src.slice(fnStart, fnEnd);

      // Should not write "suspended" as a status value
      expect(fnBody).not.toMatch(/subscriptionStatus:\s*["']suspended["']/);
      expect(fnBody).not.toMatch(/updateLicenseStatus\([^)]*,\s*["']suspended["']/);
    });

    it("handlePaymentFailed source should not reference MAX_PAYMENT_FAILURES", async () => {
      const { readFileSync } = await import("node:fs");
      const { resolve } = await import("node:path");
      const src = readFileSync(
        resolve(import.meta.dirname, "../../../src/app/api/webhooks/stripe/route.js"),
        "utf-8",
      );

      expect(src).not.toMatch(/MAX_PAYMENT_FAILURES/);
    });

    it("handleDisputeClosed source should write 'expired' not 'suspended' on lost dispute", async () => {
      const { readFileSync } = await import("node:fs");
      const { resolve } = await import("node:path");
      const src = readFileSync(
        resolve(import.meta.dirname, "../../../src/app/api/webhooks/stripe/route.js"),
        "utf-8",
      );

      // Extract handleDisputeClosed function body
      const fnStart = src.indexOf("async function handleDisputeClosed");
      const fnBody = src.slice(fnStart);

      // The else branch (lost dispute) should write "expired", not "suspended"
      expect(fnBody).toMatch(/subscriptionStatus:\s*["']expired["']/);
      expect(fnBody).toMatch(/fraudulent:\s*true/);
      expect(fnBody).not.toMatch(/subscriptionStatus:\s*["']suspended["']/);
    });

    it("handlePaymentFailed source should contain PAYMENT_FAILURE_ELIGIBLE_STATUSES allowlist", async () => {
      const { readFileSync } = await import("node:fs");
      const { resolve } = await import("node:path");
      const src = readFileSync(
        resolve(import.meta.dirname, "../../../src/app/api/webhooks/stripe/route.js"),
        "utf-8",
      );

      // Extract handlePaymentFailed function body
      const fnStart = src.indexOf("async function handlePaymentFailed");
      const fnEnd = src.indexOf("async function handleDispute", fnStart);
      const fnBody = src.slice(fnStart, fnEnd);

      // Must contain the PAYMENT_FAILURE_ELIGIBLE_STATUSES allowlist
      expect(fnBody).toMatch(/PAYMENT_FAILURE_ELIGIBLE_STATUSES/);
      expect(fnBody).toMatch(/PAYMENT_FAILURE_ELIGIBLE_STATUSES\.includes/);
    });
  });
});


// ============================================================================
// Fix 1 — handlePaymentSucceeded: renewLicense integration
//
// Verifies that handlePaymentSucceeded calls renewLicense on every successful
// payment, handles renewLicense failures gracefully, and skips renewLicense
// when customer has no keygenLicenseId.
//
// _Requirements: 13.2, 13.3_
// ============================================================================

/**
 * Core logic extracted from handlePaymentSucceeded.
 * Dependency-injected for testability — mirrors the real handler's behavior.
 *
 * @param {Object} invoice - Stripe invoice object
 * @param {Object} deps - Injected dependencies
 * @param {Function} deps.resolveCustomer - Resolves DDB customer from Stripe ID
 * @param {Function} deps.updateCustomerSubscription - Writes subscription status to DDB
 * @param {Function} deps.updateLicenseStatus - Writes license status to DDB
 * @param {Function} deps.renewLicense - Renews Keygen license expiration clock
 * @param {Function} deps.reinstateLicense - Reinstates a suspended Keygen license
 * @param {Object} deps.log - Logger
 */
async function handlePaymentSucceeded(invoice, deps) {
  const { customer, lines } = invoice;
  const {
    resolveCustomer,
    updateCustomerSubscription,
    updateLicenseStatus,
    renewLicense,
    reinstateLicense,
    log,
  } = deps;

  const dbCustomer = await resolveCustomer(customer, log);
  if (!dbCustomer) {
    log.decision("customer_not_found", "Customer not found for payment success", {
      reason: "customer_not_found",
    });
    return;
  }

  const periodEnd = lines.data[0]?.period?.end;
  const expiresAt = periodEnd ? new Date(periodEnd * 1000).toISOString() : null;

  if (dbCustomer.keygenLicenseId && expiresAt) {
    await updateLicenseStatus(dbCustomer.keygenLicenseId, "active", {
      expiresAt,
    });
  }

  // Renew Keygen license expiration clock on every successful payment
  if (dbCustomer.keygenLicenseId) {
    try {
      await renewLicense(dbCustomer.keygenLicenseId);
    } catch (e) {
      log.warn("license_renew_failed", "Failed to renew Keygen license — non-blocking", {
        errorMessage: e?.message,
      });
    }
  }

  if (dbCustomer.subscriptionStatus === "past_due") {
    await updateCustomerSubscription(dbCustomer.userId, {
      subscriptionStatus: "active",
      eventType: "SUBSCRIPTION_REACTIVATED",
      email: dbCustomer.email,
    }, { clearEmailsSent: ["PAYMENT_FAILED"] });

    if (dbCustomer.keygenLicenseId) {
      try {
        await reinstateLicense(dbCustomer.keygenLicenseId);
      } catch (e) {
        log.warn("license_reinstate_failed", "Failed to reinstate Keygen license", {
          errorMessage: e?.message,
        });
      }
    }
  }
}

// ============================================================================
// Test helpers for handlePaymentSucceeded
// ============================================================================

function createPaymentSucceededDeps(dbCustomer) {
  return {
    resolveCustomer: createSpy("resolveCustomer").mockResolvedValue(dbCustomer),
    updateCustomerSubscription: createSpy("updateCustomerSubscription").mockResolvedValue(undefined),
    updateLicenseStatus: createSpy("updateLicenseStatus").mockResolvedValue(undefined),
    renewLicense: createSpy("renewLicense").mockResolvedValue(undefined),
    reinstateLicense: createSpy("reinstateLicense").mockResolvedValue(undefined),
    log: {
      info: createSpy("log.info"),
      warn: createSpy("log.warn"),
      error: createSpy("log.error"),
      decision: createSpy("log.decision"),
    },
  };
}

function createMockInvoice(overrides = {}) {
  return {
    id: "inv_test_001",
    customer: "cus_stripe_123",
    customer_email: "test@example.com",
    lines: {
      data: [{ period: { end: Math.floor(Date.now() / 1000) + 86400 * 30 } }],
    },
    ...overrides,
  };
}

function createPaymentCustomer(overrides = {}) {
  return {
    userId: "user-pay-123",
    email: "test@example.com",
    keygenLicenseId: "lic-keygen-abc",
    subscriptionStatus: "active",
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("Fix 1 — handlePaymentSucceeded: renewLicense integration", () => {

  describe("renewLicense call on payment success", () => {

    it("should call renewLicense with keygenLicenseId on every successful payment (Requirement 6.2)", async () => {
      const customer = createPaymentCustomer({ keygenLicenseId: "lic-renew-001" });
      const deps = createPaymentSucceededDeps(customer);
      const invoice = createMockInvoice();

      await handlePaymentSucceeded(invoice, deps);

      expect(deps.renewLicense.callCount).toBe(1);
      expect(deps.renewLicense.calls[0][0]).toBe("lic-renew-001");
    });

    it("should call renewLicense for active customers", async () => {
      const customer = createPaymentCustomer({ subscriptionStatus: "active", keygenLicenseId: "lic-active" });
      const deps = createPaymentSucceededDeps(customer);
      const invoice = createMockInvoice();

      await handlePaymentSucceeded(invoice, deps);

      expect(deps.renewLicense.callCount).toBe(1);
      expect(deps.renewLicense.calls[0][0]).toBe("lic-active");
    });

    it("should call renewLicense for past_due customers being reinstated", async () => {
      const customer = createPaymentCustomer({ subscriptionStatus: "past_due", keygenLicenseId: "lic-pastdue" });
      const deps = createPaymentSucceededDeps(customer);
      const invoice = createMockInvoice();

      await handlePaymentSucceeded(invoice, deps);

      expect(deps.renewLicense.callCount).toBe(1);
      expect(deps.renewLicense.calls[0][0]).toBe("lic-pastdue");
    });
  });

  describe("renewLicense failure is non-blocking (Requirement 6.3)", () => {

    it("should write 'active' to DDB even when renewLicense throws", async () => {
      const customer = createPaymentCustomer({
        subscriptionStatus: "past_due",
        keygenLicenseId: "lic-fail-renew",
      });
      const deps = createPaymentSucceededDeps(customer);
      deps.renewLicense.mockRejectedValue(new Error("Keygen API timeout"));
      const invoice = createMockInvoice();

      await handlePaymentSucceeded(invoice, deps);

      // updateLicenseStatus should still be called with "active"
      expect(deps.updateLicenseStatus.callCount).toBe(1);
      expect(deps.updateLicenseStatus.calls[0][1]).toBe("active");

      // updateCustomerSubscription should still write "active" for past_due reinstatement
      expect(deps.updateCustomerSubscription.callCount).toBe(1);
      const [, payload] = deps.updateCustomerSubscription.calls[0];
      expect(payload.subscriptionStatus).toBe("active");
    });

    it("should log a warning when renewLicense fails", async () => {
      const customer = createPaymentCustomer({ keygenLicenseId: "lic-warn" });
      const deps = createPaymentSucceededDeps(customer);
      deps.renewLicense.mockRejectedValue(new Error("Network error"));
      const invoice = createMockInvoice();

      await handlePaymentSucceeded(invoice, deps);

      expect(deps.log.warn.callCount).toBe(1);
      expect(deps.log.warn.calls[0][0]).toBe("license_renew_failed");
    });

    it("should not propagate renewLicense error to caller", async () => {
      const customer = createPaymentCustomer({ keygenLicenseId: "lic-no-throw" });
      const deps = createPaymentSucceededDeps(customer);
      deps.renewLicense.mockRejectedValue(new Error("500 Internal Server Error"));
      const invoice = createMockInvoice();

      // Should not throw
      let error;
      try {
        await handlePaymentSucceeded(invoice, deps);
      } catch (e) {
        error = e;
      }

      expect(error).toBe(undefined);
    });
  });

  describe("renewLicense skipped when no keygenLicenseId (Requirement 6.4)", () => {

    it("should not call renewLicense when keygenLicenseId is null", async () => {
      const customer = createPaymentCustomer({ keygenLicenseId: null });
      const deps = createPaymentSucceededDeps(customer);
      const invoice = createMockInvoice();

      await handlePaymentSucceeded(invoice, deps);

      expect(deps.renewLicense.callCount).toBe(0);
    });

    it("should not call renewLicense when keygenLicenseId is undefined", async () => {
      const customer = createPaymentCustomer({ keygenLicenseId: undefined });
      const deps = createPaymentSucceededDeps(customer);
      const invoice = createMockInvoice();

      await handlePaymentSucceeded(invoice, deps);

      expect(deps.renewLicense.callCount).toBe(0);
    });

    it("should still process payment success normally when no keygenLicenseId", async () => {
      const customer = createPaymentCustomer({
        keygenLicenseId: null,
        subscriptionStatus: "past_due",
      });
      const deps = createPaymentSucceededDeps(customer);
      const invoice = createMockInvoice();

      await handlePaymentSucceeded(invoice, deps);

      // renewLicense not called
      expect(deps.renewLicense.callCount).toBe(0);

      // But reinstatement still happens for past_due
      expect(deps.updateCustomerSubscription.callCount).toBe(1);
      const [, payload] = deps.updateCustomerSubscription.calls[0];
      expect(payload.subscriptionStatus).toBe("active");
    });
  });

  describe("Source-level verification: renewLicense in handlePaymentSucceeded", () => {

    it("handlePaymentSucceeded source should call renewLicense", async () => {
      const { readFileSync } = await import("node:fs");
      const { resolve } = await import("node:path");
      const src = readFileSync(
        resolve(import.meta.dirname, "../../../src/app/api/webhooks/stripe/route.js"),
        "utf-8",
      );

      // Extract handlePaymentSucceeded function body
      const fnStart = src.indexOf("async function handlePaymentSucceeded");
      const fnEnd = src.indexOf("\nasync function", fnStart + 1);
      const fnBody = fnEnd > fnStart ? src.slice(fnStart, fnEnd) : src.slice(fnStart);

      expect(fnBody).toMatch(/renewLicense/);
    });

    it("handlePaymentSucceeded source should wrap renewLicense in try/catch", async () => {
      const { readFileSync } = await import("node:fs");
      const { resolve } = await import("node:path");
      const src = readFileSync(
        resolve(import.meta.dirname, "../../../src/app/api/webhooks/stripe/route.js"),
        "utf-8",
      );

      const fnStart = src.indexOf("async function handlePaymentSucceeded");
      const fnEnd = src.indexOf("\nasync function", fnStart + 1);
      const fnBody = fnEnd > fnStart ? src.slice(fnStart, fnEnd) : src.slice(fnStart);

      // renewLicense should be inside a try block
      expect(fnBody).toMatch(/try\s*\{[^}]*renewLicense/s);
      // Should log warning on failure
      expect(fnBody).toMatch(/license_renew_failed/);
    });

    it("handlePaymentSucceeded source should guard renewLicense with keygenLicenseId check", async () => {
      const { readFileSync } = await import("node:fs");
      const { resolve } = await import("node:path");
      const src = readFileSync(
        resolve(import.meta.dirname, "../../../src/app/api/webhooks/stripe/route.js"),
        "utf-8",
      );

      const fnStart = src.indexOf("async function handlePaymentSucceeded");
      const fnEnd = src.indexOf("\nasync function", fnStart + 1);
      const fnBody = fnEnd > fnStart ? src.slice(fnStart, fnEnd) : src.slice(fnStart);

      // Should check keygenLicenseId before calling renewLicense
      expect(fnBody).toMatch(/keygenLicenseId[\s\S]*renewLicense/);
    });
  });
});

