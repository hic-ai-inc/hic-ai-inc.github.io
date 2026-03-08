/**
 * Property-Based Tests — Stripe Webhook Handler
 *
 * Feature: status-remediation-plan, Property 5
 *
 * Property 5: Payment failure always writes "past_due"
 * For any `invoice.payment_failed` event with any `attempt_count`,
 * `handlePaymentFailed` must write "past_due" and never "suspended",
 * unless current status is "expired" (skip).
 *
 * Uses extracted logic with dependency injection — same pattern as unit tests.
 * Generates random attempt_count values and pre-existing statuses to verify
 * the invariant holds across all inputs.
 *
 * **Validates: Requirements 4.1, 4.2**
 */

import { describe, it } from "node:test";
import { expect, createSpy } from "../../../../dm/facade/test-helpers/index.js";

// ============================================================================
// Extracted logic: mirrors handlePaymentFailed from route.js
// Dependency-injected for testability — no module mocking needed.
// ============================================================================

/**
 * Core logic extracted from handlePaymentFailed.
 * @param {Object} invoice - Stripe invoice object
 * @param {Object} deps - Injected dependencies
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

// ============================================================================
// Generators
// ============================================================================

/** Random integer in [min, max] inclusive */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Random string of given length from charset */
function randomString(len, charset = "abcdefghijklmnopqrstuvwxyz0123456789") {
  let s = "";
  for (let i = 0; i < len; i++) s += charset[Math.floor(Math.random() * charset.length)];
  return s;
}

/** Generate a random attempt_count — covers edge cases and wide range */
function generateAttemptCount() {
  // Mix of small, medium, large, and boundary values
  const special = [0, 1, 2, 3, 4, 5, 8, 10, 99, 100, 255, 1000];
  if (Math.random() < 0.3) {
    return special[Math.floor(Math.random() * special.length)];
  }
  return randomInt(1, 10000);
}

/** Generate a random eligible subscription status (only active and past_due can transition to past_due) */
function generateEligibleStatus() {
  const statuses = ["active", "past_due"];
  return statuses[Math.floor(Math.random() * statuses.length)];
}

/** Generate a random ineligible subscription status (statuses that must be blocked from past_due write) */
function generateIneligibleStatus() {
  const statuses = ["expired", "canceled", "revoked", "suspended", "disputed", "pending_account", "cancellation_pending"];
  return statuses[Math.floor(Math.random() * statuses.length)];
}

/** Generate a random Stripe invoice object */
function generateInvoice(attemptCount) {
  const hasRetry = Math.random() > 0.5;
  return {
    id: `inv_${randomString(12)}`,
    customer: `cus_${randomString(14)}`,
    customer_email: `${randomString(8)}@${randomString(5)}.com`,
    attempt_count: attemptCount,
    next_payment_attempt: hasRetry ? Math.floor(Date.now() / 1000) + randomInt(3600, 1209600) : null,
  };
}

/** Generate a random mock customer record */
function generateCustomer(statusOverride) {
  const hasLicense = Math.random() > 0.2; // 80% have a license
  return {
    userId: `user-${randomString(10)}`,
    email: `${randomString(8)}@${randomString(5)}.com`,
    keygenLicenseId: hasLicense ? `lic-${randomString(12)}` : null,
    subscriptionStatus: statusOverride,
  };
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

function createMockDeps(dbCustomer) {
  return {
    resolveCustomer: createSpy("resolveCustomer").mockResolvedValue(dbCustomer),
    updateCustomerSubscription: createSpy("updateCustomerSubscription").mockResolvedValue(undefined),
    updateLicenseStatus: createSpy("updateLicenseStatus").mockResolvedValue(undefined),
    log: createMockLog(),
  };
}

// ============================================================================
// Property 5: Payment failure always writes "past_due"
// Feature: status-remediation-plan, Property 5
// **Validates: Requirements 4.1, 4.2**
// ============================================================================

describe("Property 5: Payment failure always writes 'past_due'", () => {

  it("for any attempt_count with eligible status, always writes 'past_due' and never 'suspended' (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const attemptCount = generateAttemptCount();
      const status = generateEligibleStatus();
      const customer = generateCustomer(status);
      const deps = createMockDeps(customer);
      const invoice = generateInvoice(attemptCount);

      await handlePaymentFailed(invoice, deps);

      // Must have called updateCustomerSubscription exactly once
      expect(deps.updateCustomerSubscription.callCount).toBe(1);

      // The written status must be "past_due"
      const [, payload] = deps.updateCustomerSubscription.calls[0];
      expect(payload.subscriptionStatus).toBe("past_due");

      // "suspended" must never appear in any DDB write
      for (const call of deps.updateCustomerSubscription.calls) {
        expect(call[1].subscriptionStatus).not.toBe("suspended");
      }

      // If customer has a license, license status must also be "past_due"
      if (customer.keygenLicenseId) {
        expect(deps.updateLicenseStatus.callCount).toBe(1);
        expect(deps.updateLicenseStatus.calls[0][1]).toBe("past_due");
        expect(deps.updateLicenseStatus.calls[0][1]).not.toBe("suspended");
      }
    }
  });

  it("for any attempt_count with ineligible status, skips the write entirely (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const attemptCount = generateAttemptCount();
      const status = generateIneligibleStatus();
      const customer = generateCustomer(status);
      const deps = createMockDeps(customer);
      const invoice = generateInvoice(attemptCount);

      await handlePaymentFailed(invoice, deps);

      // No DDB writes should occur — ineligible status guard
      expect(deps.updateCustomerSubscription.callCount).toBe(0);
      expect(deps.updateLicenseStatus.callCount).toBe(0);

      // Should log the ineligible_status_guard decision
      expect(deps.log.decision.callCount).toBe(1);
      expect(deps.log.decision.calls[0][0]).toBe("ineligible_status_guard");
    }
  });

  it("attempt_count value is faithfully passed through to the DDB payload (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const attemptCount = generateAttemptCount();
      const customer = generateCustomer("active");
      const deps = createMockDeps(customer);
      const invoice = generateInvoice(attemptCount);

      await handlePaymentFailed(invoice, deps);

      const [, payload] = deps.updateCustomerSubscription.calls[0];
      expect(payload.attemptCount).toBe(attemptCount);
      expect(payload.paymentFailureCount).toBe(attemptCount);
    }
  });
});

// ============================================================================
// Extracted logic: mirrors handleDisputeClosed from route.js
// Dependency-injected for testability — no module mocking needed.
// ============================================================================

/**
 * Core logic extracted from handleDisputeClosed.
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
// Generators — Property 6
// ============================================================================

/** All dispute statuses that are NOT reinstating (i.e., not won/withdrawn/warning_closed) */
const NON_REINSTATING_STATUSES = [
  "lost",
  "charge_refunded",
  "needs_response",
  "under_review",
  "warning_needs_response",
  "warning_under_review",
];

/** Generate a random non-reinstating dispute status */
function generateNonReinstatingStatus() {
  return NON_REINSTATING_STATUSES[Math.floor(Math.random() * NON_REINSTATING_STATUSES.length)];
}

/** Generate a random dispute object with a non-reinstating status */
function generateLostDispute() {
  const hasCustomer = Math.random() > 0.05; // 95% have a customer ID
  return {
    id: `dp_${randomString(14)}`,
    customer: hasCustomer ? `cus_${randomString(14)}` : null,
    status: generateNonReinstatingStatus(),
    amount: randomInt(100, 999999),
    currency: ["usd", "eur", "gbp"][Math.floor(Math.random() * 3)],
    charge: `ch_${randomString(14)}`,
    created: Math.floor(Date.now() / 1000) - randomInt(0, 2592000),
  };
}

/** Generate a random customer record for dispute tests */
function generateDisputeCustomer() {
  const hasLicense = Math.random() > 0.2; // 80% have a license
  return {
    userId: `user-${randomString(10)}`,
    email: `${randomString(8)}@${randomString(5)}.com`,
    keygenLicenseId: hasLicense ? `lic-${randomString(12)}` : null,
    subscriptionStatus: ["active", "past_due", "disputed"][Math.floor(Math.random() * 3)],
  };
}

/** Create mock deps for handleDisputeClosed */
function createDisputeMockDeps(dbCustomer) {
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
// Property 6: Lost dispute writes "expired" with fraudulent flag
// Feature: status-remediation-plan, Property 6
// **Validates: Requirements 4.6**
// ============================================================================

describe("Property 6: Lost dispute writes 'expired' with fraudulent flag", () => {

  it("for any non-reinstating dispute status, always writes 'expired' with fraudulent: true and never 'suspended' (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const dispute = generateLostDispute();
      const customer = generateDisputeCustomer();
      const deps = createDisputeMockDeps(customer);

      await handleDisputeClosed(dispute, deps);

      // Must have called updateCustomerSubscription exactly once
      expect(deps.updateCustomerSubscription.callCount).toBe(1);

      // The written status must be "expired"
      const [, payload] = deps.updateCustomerSubscription.calls[0];
      expect(payload.subscriptionStatus).toBe("expired");

      // The fraudulent flag must be true
      expect(payload.fraudulent).toBe(true);

      // "suspended" must never appear in any DDB write
      for (const call of deps.updateCustomerSubscription.calls) {
        expect(call[1].subscriptionStatus).not.toBe("suspended");
      }

      // If customer has a license, license status must be "expired" (not "suspended")
      if (customer.keygenLicenseId) {
        expect(deps.updateLicenseStatus.callCount).toBe(1);
        expect(deps.updateLicenseStatus.calls[0][1]).toBe("expired");
        expect(deps.updateLicenseStatus.calls[0][1]).not.toBe("suspended");
      }
    }
  });

  it("for any non-reinstating dispute with a licensed customer, calls suspendLicense on Keygen (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const dispute = generateLostDispute();
      // Force customer to have a license for this sub-property
      const customer = generateDisputeCustomer();
      customer.keygenLicenseId = `lic-${randomString(12)}`;
      const deps = createDisputeMockDeps(customer);

      await handleDisputeClosed(dispute, deps);

      // suspendLicense must be called with the customer's license ID
      expect(deps.suspendLicense.callCount).toBe(1);
      expect(deps.suspendLicense.calls[0][0]).toBe(customer.keygenLicenseId);

      // reinstateLicense must NOT be called for non-reinstating statuses
      expect(deps.reinstateLicense.callCount).toBe(0);
    }
  });

  it("for any non-reinstating dispute with no keygenLicenseId, skips license operations (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const dispute = generateLostDispute();
      const customer = generateDisputeCustomer();
      customer.keygenLicenseId = null; // Force no license
      const deps = createDisputeMockDeps(customer);

      await handleDisputeClosed(dispute, deps);

      // DDB subscription write still happens
      expect(deps.updateCustomerSubscription.callCount).toBe(1);
      const [, payload] = deps.updateCustomerSubscription.calls[0];
      expect(payload.subscriptionStatus).toBe("expired");
      expect(payload.fraudulent).toBe(true);

      // No license operations
      expect(deps.updateLicenseStatus.callCount).toBe(0);
      expect(deps.suspendLicense.callCount).toBe(0);
      expect(deps.reinstateLicense.callCount).toBe(0);
    }
  });
});


// ============================================================================
// Extracted logic: mirrors handlePaymentSucceeded from route.js
// Dependency-injected for testability — no module mocking needed.
// ============================================================================

/**
 * Core logic extracted from handlePaymentSucceeded.
 * Only the reinstatement path is relevant to Property 22 — license status
 * update (active + expiresAt) always happens regardless and is tested by
 * Properties 7/8. This extraction focuses on the "past_due" → "active"
 * subscription reinstatement and reinstateLicense call.
 * @param {Object} invoice - Stripe invoice object
 * @param {Object} deps - Injected dependencies
 */
async function handlePaymentSucceeded(invoice, deps) {
  const { customer, lines } = invoice;
  const { resolveCustomer, updateCustomerSubscription, updateLicenseStatus, reinstateLicense, log } = deps;

  const dbCustomer = await resolveCustomer(customer, log);
  if (!dbCustomer) return;

  const periodEnd = lines.data[0]?.period?.end;
  const expiresAt = periodEnd ? new Date(periodEnd * 1000).toISOString() : null;

  // License status always updated to "active" with expiresAt (separate from reinstatement)
  if (dbCustomer.keygenLicenseId && expiresAt) {
    await updateLicenseStatus(dbCustomer.keygenLicenseId, "active", { expiresAt });
  }

  // Reinstatement: only from "past_due" — never from "suspended"
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
// Generators — Property 22
// ============================================================================

/** Generate a random Stripe invoice with line item period data */
function generatePaymentSucceededInvoice() {
  const hasPeriod = Math.random() > 0.1; // 90% have period data
  const periodEnd = hasPeriod ? Math.floor(Date.now() / 1000) + randomInt(86400, 31536000) : null;
  return {
    id: `inv_${randomString(14)}`,
    customer: `cus_${randomString(14)}`,
    lines: {
      data: periodEnd
        ? [{ period: { end: periodEnd } }]
        : [],
    },
  };
}

/** All statuses that are NOT "past_due" — reinstatement must NOT trigger for these */
const NON_PAST_DUE_STATUSES = [
  "active",
  "cancellation_pending",
  "canceled",
  "expired",
  "disputed",
  "revoked",
  "suspended",
  "pending_account",
];

/** Generate a random non-past_due status */
function generateNonPastDueStatus() {
  return NON_PAST_DUE_STATUSES[Math.floor(Math.random() * NON_PAST_DUE_STATUSES.length)];
}

/** Generate a random customer for payment success tests */
function generatePaymentSucceededCustomer(statusOverride) {
  const hasLicense = Math.random() > 0.2; // 80% have a license
  return {
    userId: `user-${randomString(10)}`,
    email: `${randomString(8)}@${randomString(5)}.com`,
    keygenLicenseId: hasLicense ? `lic-${randomString(12)}` : null,
    subscriptionStatus: statusOverride,
  };
}

/** Create mock deps for handlePaymentSucceeded */
function createPaymentSucceededMockDeps(dbCustomer) {
  return {
    resolveCustomer: createSpy("resolveCustomer").mockResolvedValue(dbCustomer),
    updateCustomerSubscription: createSpy("updateCustomerSubscription").mockResolvedValue(undefined),
    updateLicenseStatus: createSpy("updateLicenseStatus").mockResolvedValue(undefined),
    reinstateLicense: createSpy("reinstateLicense").mockResolvedValue(undefined),
    log: createMockLog(),
  };
}

// ============================================================================
// Property 22: Payment success reinstates from past_due only
// Feature: status-remediation-plan, Property 22
// **Validates: Requirements 4.3**
// ============================================================================

describe("Property 22: Payment success reinstates from past_due only", () => {

  it("for any payment success where prior status is 'past_due', writes 'active' and calls reinstateLicense (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const customer = generatePaymentSucceededCustomer("past_due");
      customer.keygenLicenseId = `lic-${randomString(12)}`; // Force license for reinstatement path
      const deps = createPaymentSucceededMockDeps(customer);
      const invoice = generatePaymentSucceededInvoice();

      await handlePaymentSucceeded(invoice, deps);

      // Must write "active" subscription status via updateCustomerSubscription
      expect(deps.updateCustomerSubscription.callCount).toBe(1);
      const [, payload] = deps.updateCustomerSubscription.calls[0];
      expect(payload.subscriptionStatus).toBe("active");
      expect(payload.eventType).toBe("SUBSCRIPTION_REACTIVATED");

      // Must call reinstateLicense with the customer's license ID
      expect(deps.reinstateLicense.callCount).toBe(1);
      expect(deps.reinstateLicense.calls[0][0]).toBe(customer.keygenLicenseId);

      // "suspended" must never appear in any written status
      for (const call of deps.updateCustomerSubscription.calls) {
        expect(call[1].subscriptionStatus).not.toBe("suspended");
      }
    }
  });

  it("for any payment success where prior status is NOT 'past_due', does NOT reinstate (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const status = generateNonPastDueStatus();
      const customer = generatePaymentSucceededCustomer(status);
      const deps = createPaymentSucceededMockDeps(customer);
      const invoice = generatePaymentSucceededInvoice();

      await handlePaymentSucceeded(invoice, deps);

      // Must NOT call updateCustomerSubscription — reinstatement is past_due-only
      expect(deps.updateCustomerSubscription.callCount).toBe(0);

      // Must NOT call reinstateLicense
      expect(deps.reinstateLicense.callCount).toBe(0);
    }
  });

  it("'suspended' status specifically does NOT trigger reinstatement (100 iterations)", async () => {
    // Explicit sub-property: the function never checks for "suspended"
    for (let i = 0; i < 100; i++) {
      const customer = generatePaymentSucceededCustomer("suspended");
      customer.keygenLicenseId = `lic-${randomString(12)}`; // Force license to prove reinstateLicense is NOT called
      const deps = createPaymentSucceededMockDeps(customer);
      const invoice = generatePaymentSucceededInvoice();

      await handlePaymentSucceeded(invoice, deps);

      // No subscription update — "suspended" is not "past_due"
      expect(deps.updateCustomerSubscription.callCount).toBe(0);

      // No reinstateLicense call
      expect(deps.reinstateLicense.callCount).toBe(0);

      // License status update (active + expiresAt) still happens if period data exists —
      // that's separate from reinstatement and tested by Properties 7/8
    }
  });

  it("for past_due customer with no keygenLicenseId, writes 'active' but skips reinstateLicense (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const customer = generatePaymentSucceededCustomer("past_due");
      customer.keygenLicenseId = null; // Force no license
      const deps = createPaymentSucceededMockDeps(customer);
      const invoice = generatePaymentSucceededInvoice();

      await handlePaymentSucceeded(invoice, deps);

      // Subscription update still happens — past_due → active
      expect(deps.updateCustomerSubscription.callCount).toBe(1);
      const [, payload] = deps.updateCustomerSubscription.calls[0];
      expect(payload.subscriptionStatus).toBe("active");

      // reinstateLicense must NOT be called when no license ID
      expect(deps.reinstateLicense.callCount).toBe(0);

      // No license status update either (no keygenLicenseId)
      expect(deps.updateLicenseStatus.callCount).toBe(0);
    }
  });
});


// ============================================================================
// Extracted logic: mirrors handlePaymentSucceeded from route.js
// Includes renewLicense call — Properties 7 and 8 test this path.
// Property 22's extraction above omits renewLicense (focuses on reinstatement).
// ============================================================================

/**
 * Core logic extracted from handlePaymentSucceeded — full version with renewLicense.
 * @param {Object} invoice - Stripe invoice object
 * @param {Object} deps - Injected dependencies
 */
async function handlePaymentSucceededWithRenew(invoice, deps) {
  const { customer, lines } = invoice;
  const { resolveCustomer, updateCustomerSubscription, updateLicenseStatus, renewLicense, reinstateLicense, log } = deps;

  const dbCustomer = await resolveCustomer(customer, log);
  if (!dbCustomer) return;

  const periodEnd = lines.data[0]?.period?.end;
  const expiresAt = periodEnd ? new Date(periodEnd * 1000).toISOString() : null;

  // Step 1: License status always updated to "active" with expiresAt
  if (dbCustomer.keygenLicenseId && expiresAt) {
    await updateLicenseStatus(dbCustomer.keygenLicenseId, "active", { expiresAt });
  }

  // Step 2: renewLicense — non-blocking, wrapped in try/catch
  if (dbCustomer.keygenLicenseId) {
    try {
      await renewLicense(dbCustomer.keygenLicenseId);
    } catch (e) {
      log.warn("license_renew_failed", "Failed to renew Keygen license — non-blocking", {
        errorMessage: e?.message,
      });
    }
  }

  // Step 3: Reinstatement from past_due
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
// Generators — Properties 7 and 8
// ============================================================================

/** All valid subscription statuses */
const ALL_STATUSES = [
  "active", "past_due", "cancellation_pending",
  "canceled", "expired", "disputed", "revoked", "suspended", "pending_account",
];

/** Generate a random customer with guaranteed keygenLicenseId for renew tests */
function generateRenewCustomer() {
  return {
    userId: `user-${randomString(10)}`,
    email: `${randomString(8)}@${randomString(5)}.com`,
    keygenLicenseId: `lic-${randomString(12)}`,
    subscriptionStatus: ALL_STATUSES[Math.floor(Math.random() * ALL_STATUSES.length)],
  };
}

/** Create mock deps for full handlePaymentSucceeded (with renewLicense) */
function createRenewMockDeps(dbCustomer) {
  return {
    resolveCustomer: createSpy("resolveCustomer").mockResolvedValue(dbCustomer),
    updateCustomerSubscription: createSpy("updateCustomerSubscription").mockResolvedValue(undefined),
    updateLicenseStatus: createSpy("updateLicenseStatus").mockResolvedValue(undefined),
    renewLicense: createSpy("renewLicense").mockResolvedValue(undefined),
    reinstateLicense: createSpy("reinstateLicense").mockResolvedValue(undefined),
    log: createMockLog(),
  };
}

// ============================================================================
// Property 7: Payment success calls renewLicense
// Feature: status-remediation-plan, Property 7
// **Validates: Requirements 6.2**
// ============================================================================

describe("Property 7: Payment success calls renewLicense", () => {

  it("for any payment success where customer has keygenLicenseId, renewLicense is called with that ID (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const customer = generateRenewCustomer();
      const deps = createRenewMockDeps(customer);
      const invoice = generatePaymentSucceededInvoice();

      await handlePaymentSucceededWithRenew(invoice, deps);

      // renewLicense must be called exactly once with the customer's keygenLicenseId
      expect(deps.renewLicense.callCount).toBe(1);
      expect(deps.renewLicense.calls[0][0]).toBe(customer.keygenLicenseId);
    }
  });

  it("for any payment success where customer has no keygenLicenseId, renewLicense is never called (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const customer = generateRenewCustomer();
      customer.keygenLicenseId = Math.random() > 0.5 ? null : undefined;
      const deps = createRenewMockDeps(customer);
      const invoice = generatePaymentSucceededInvoice();

      await handlePaymentSucceededWithRenew(invoice, deps);

      // renewLicense must NOT be called
      expect(deps.renewLicense.callCount).toBe(0);
    }
  });

  it("renewLicense is called regardless of subscriptionStatus (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const status = ALL_STATUSES[Math.floor(Math.random() * ALL_STATUSES.length)];
      const customer = generateRenewCustomer();
      customer.subscriptionStatus = status;
      const deps = createRenewMockDeps(customer);
      const invoice = generatePaymentSucceededInvoice();

      await handlePaymentSucceededWithRenew(invoice, deps);

      // renewLicense is called on every payment success, regardless of status
      expect(deps.renewLicense.callCount).toBe(1);
    }
  });
});

// ============================================================================
// Property 8: renewLicense failure does not block DDB active write
// Feature: status-remediation-plan, Property 8
// **Validates: Requirements 6.3**
// ============================================================================

describe("Property 8: renewLicense failure does not block DDB active write", () => {

  it("for any payment success where renewLicense throws, DDB still writes 'active' (100 iterations)", async () => {
    const errors = [
      "Keygen API timeout",
      "503 Service Unavailable",
      "Network error",
      "ECONNREFUSED",
      "License not found",
      "401 Unauthorized",
      "Rate limit exceeded",
      "Internal Server Error",
    ];

    for (let i = 0; i < 100; i++) {
      const customer = generateRenewCustomer();
      const deps = createRenewMockDeps(customer);
      const errorMsg = errors[Math.floor(Math.random() * errors.length)];
      deps.renewLicense.mockRejectedValue(new Error(errorMsg));
      const invoice = generatePaymentSucceededInvoice();
      // Ensure invoice has line item data so expiresAt is computed
      invoice.lines = { data: [{ period: { end: Math.floor(Date.now() / 1000) + 86400 * 30 } }] };

      await handlePaymentSucceededWithRenew(invoice, deps);

      // DDB license status must be updated to "active" despite renewLicense failure
      expect(deps.updateLicenseStatus.callCount).toBe(1);
      expect(deps.updateLicenseStatus.calls[0][1]).toBe("active");
    }
  });

  it("renewLicense failure does not throw — handler completes normally (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const customer = generateRenewCustomer();
      const deps = createRenewMockDeps(customer);
      deps.renewLicense.mockRejectedValue(new Error(`Failure iteration ${i}`));
      const invoice = generatePaymentSucceededInvoice();

      // Must NOT throw
      let threw = false;
      try {
        await handlePaymentSucceededWithRenew(invoice, deps);
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    }
  });

  it("renewLicense failure logs a warning (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const customer = generateRenewCustomer();
      const deps = createRenewMockDeps(customer);
      deps.renewLicense.mockRejectedValue(new Error("test error"));
      const invoice = generatePaymentSucceededInvoice();

      await handlePaymentSucceededWithRenew(invoice, deps);

      // Must log a warning for the failure
      expect(deps.log.warn.callCount).toBeGreaterThanOrEqual(1);
      const warnCalls = deps.log.warn.calls.map((c) => c[0]);
      expect(warnCalls).toContain("license_renew_failed");
    }
  });

  it("for past_due customers, renewLicense failure does not block reinstatement (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const customer = generateRenewCustomer();
      customer.subscriptionStatus = "past_due";
      const deps = createRenewMockDeps(customer);
      deps.renewLicense.mockRejectedValue(new Error("Keygen down"));
      const invoice = generatePaymentSucceededInvoice();

      await handlePaymentSucceededWithRenew(invoice, deps);

      // Reinstatement must still happen — updateCustomerSubscription writes "active"
      expect(deps.updateCustomerSubscription.callCount).toBe(1);
      const [, payload] = deps.updateCustomerSubscription.calls[0];
      expect(payload.subscriptionStatus).toBe("active");
    }
  });
});

