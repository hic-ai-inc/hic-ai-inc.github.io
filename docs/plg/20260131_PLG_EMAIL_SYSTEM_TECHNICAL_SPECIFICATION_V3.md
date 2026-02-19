# PLG Email System Technical Specification V3

**Document ID:** 20260131_PLG_EMAIL_SYSTEM_TECHNICAL_SPECIFICATION_V3  
**Date:** January 31, 2026  
**Status:** FINAL - Unified Analysis  
**Owner:** SWR (Consolidated Analysis)

---

## Executive Summary

This document represents the definitive technical analysis of the PLG Email System, synthesizing findings from multiple reviews. The system is **largely functional** with an advanced event-driven architecture, but suffers from specific **webhook implementation gaps** and **maintenance debt** regarding email templates.

### Status at a Glance

| Component           | Status               | Notes                                                                      |
| ------------------- | -------------------- | -------------------------------------------------------------------------- |
| **Event Pipeline**  | 🟢 **Healthy**       | DynamoDB Stream → SNS → SQS → Lambda works for 90% of cases.               |
| **Scheduled Tasks** | 🟢 **Healthy**       | Trial reminders (3-day) and Win-back (30/90d) are implemented.             |
| **Templates**       | 🔴 **Critical Debt** | 3 separate copies of templates exist (src, email-sender, scheduled-tasks). |
| **Edge Cases**      | 🟠 **Gaps**          | Immediate cancellation & license suspension do not trigger emails.         |

---

## Architecture Validation

The system correctly implements the intended event-driven pattern:

```
Write with `eventType` → Stream → Processor → SNS → SQS → Sender → SES
```

**Verified Implementations:**

- ✅ **Welcome Email:** Triggered via `CUSTOMER_CREATED` in `handleCheckoutCompleted` (`webhooks/stripe/route.js`).
- ✅ **License Email:** Triggered via `LICENSE_CREATED` in `provision-license/route.js`.
- ✅ **Payment Failed:** Triggered via `PAYMENT_FAILED` in `handlePaymentFailed`.
- ✅ **Scheduled Jobs:** `trial-reminder` (3 days), `winback-30`, `winback-90` are fully implemented in `scheduled-tasks/index.js`.

---

## Critical Gaps & Fixes

### 1. Immediate Cancellation Gap (New Finding)

**Severity:** Medium  
**Location:** `webhooks/stripe/route.js` -> `handleSubscriptionDeleted`

While **scheduled cancellations** (`cancel_at_period_end`) correctly trigger the `SUBSCRIPTION_CANCELLED` event, **immediate cancellations** (e.g., deleted via Stripe Dashboard or API) do **NOT**. The `eventType` is missing from the update call.

**Fix Required:**

```javascript
// In handleSubscriptionDeleted:
await updateCustomerSubscription(dbCustomer.userId, {
  subscriptionStatus: "canceled",
  eventType: "SUBSCRIPTION_CANCELLED", // ADD THIS
  email: dbCustomer.email, // ADD THIS
});
```

### 2. License Suspended Gap

**Severity:** Medium  
**Location:** `webhooks/keygen/route.js` -> `handleLicenseSuspended`

The webhook updates the license status to "suspended" but fails to write the `LICENSE_SUSPENDED` event type, meaning no email is sent.

**Fix Required:**

```javascript
// In handleLicenseSuspended:
await updateLicenseStatus(licenseId, "suspended", {
  suspendedAt: new Date().toISOString(),
  eventType: "LICENSE_SUSPENDED", // ADD THIS
  email: license?.email, // ADD THIS
});
```

### 3. Template Fragmentation (Technical Debt)

**Severity:** High (Maintenance Risk)

Use of email templates is fragmented across three isolated locations. A change to the "Welcome" email must be manually copied to 3 places to ensure consistency across all trigger types.

| Location                                         | Purpose                          |
| ------------------------------------------------ | -------------------------------- |
| `src/lib/ses.js`                                 | Direct app calls (e.g., portals) |
| `infrastructure/lambda/email-sender/index.js`    | Event-driven emails              |
| `infrastructure/lambda/scheduled-tasks/index.js` | Cron-job emails                  |

**Fix Required:**
Refactor templates into a shared `dm/layer` (e.g., `hic-templates-layer`) or a single source of truth file that is built/bundled into the Lambdas.

---

## Detailed Audit Matrix

| Email Function               | Method                             | Status        | Gap?                             |
| ---------------------------- | ---------------------------------- | ------------- | -------------------------------- |
| **Welcome**                  | Event (`CUSTOMER_CREATED`)         | ✅ Working    | None                             |
| **License Delivery**         | Event (`LICENSE_CREATED`)          | ✅ Working    | None                             |
| **Payment Failed**           | Event (`PAYMENT_FAILED`)           | ✅ Working    | None                             |
| **Trial Reminder**           | Scheduled (3 Days)                 | ✅ Working    | None                             |
| **Reactivation**             | Event (`SUBSCRIPTION_REACTIVATED`) | ✅ Working    | None                             |
| **Cancellation (Scheduled)** | Event (`SUBSCRIPTION_CANCELLED`)   | ✅ Working    | None                             |
| **Cancellation (Immediate)** | Event (`SUBSCRIPTION_CANCELLED`)   | ❌ **Broken** | **Missing eventType in webhook** |
| **License Revoked**          | Event (`LICENSE_REVOKED`)          | ✅ Working    | None                             |
| **License Suspended**        | Event (`LICENSE_SUSPENDED`)        | ❌ **Broken** | **Missing eventType in webhook** |
| **Dispute Alert**            | Direct Call                        | ✅ Working    | None                             |
| **Win-Back (30/90d)**        | Scheduled                          | ✅ Working    | None                             |
| **Enterprise Invite**        | Direct Call                        | ✅ Working    | None                             |

---

## Implementation Plan

1.  **Immediate Fixes (Webhooks):**
    - Update `webhooks/stripe/route.js` to add `eventType` to `handleSubscriptionDeleted`.
    - Update `webhooks/keygen/route.js` to add `eventType` to `handleLicenseSuspended`.

2.  **Refactoring (Templates):**
    - Create `dm/layers/templates` to house shared email templates.
    - Update Lambdas to import from this layer.

3.  **Verification:**
    - Run E2E test for immediate cancellation flow.
    - Trigger Keygen suspension webhook and verify email SNS event.

---

**References:**

- V1 Analysis (Initial Audit)
- V2 Analysis (Opus 4.5 Deep Dive)
- Codebase Verification (Stripe/Keygen Webhooks)
