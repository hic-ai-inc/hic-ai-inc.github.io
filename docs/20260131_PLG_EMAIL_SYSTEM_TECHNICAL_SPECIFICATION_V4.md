# PLG Email System Technical Specification V4

**Document ID:** 20260131_PLG_EMAIL_SYSTEM_TECHNICAL_SPECIFICATION_V4  
**Date:** January 31, 2026  
**Status:** FINAL  
**Owner:** SWR  
**Contributors:** Q Developer (Haiku 4.5), GitHub Copilot (Opus 4.5), Gemini 3

---

## Executive Summary

This document represents the definitive technical analysis of the PLG Email System, synthesizing findings from multiple reviews. The system is **largely functional** with an advanced event-driven architecture, but suffers from specific **webhook implementation gaps** and **maintenance debt** regarding email templates.

### Status at a Glance

| Component           | Status               | Notes                                                                      |
| ------------------- | -------------------- | -------------------------------------------------------------------------- |
| **Event Pipeline**  | 🟢 **Healthy**       | DynamoDB Stream → SNS → SQS → Lambda works for 90% of cases.               |
| **Scheduled Tasks** | 🟢 **Healthy**       | Trial reminders (3-day) and Win-back (30/90d) are implemented.             |
| **Templates**       | 🟢 **Resolved**      | Consolidated into `hic-ses-layer` v0.2.0 `email-templates.js` (Jan 31). |
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

### 3. Template Fragmentation ~~(Technical Debt)~~ ✅ RESOLVED

**Status:** ✅ RESOLVED (January 31, 2026)

Templates consolidated into `dm/layers/ses/src/email-templates.js` (824 lines, 12 templates). The `hic-ses-layer` v0.2.0 now exports `createTemplates()` function used by all consumers:

| Consumer | Import |
| -------- | ------ |
| `src/lib/ses.js` | `import { createTemplates } from 'hic-ses-layer/email-templates.js'` |
| `email-sender/index.js` | Same layer import |
| `scheduled-tasks/index.js` | Same layer import |

**Implementation:** Single source of truth. Changes to templates only need to be made in one place.

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

## Event Flow Diagrams

### Working: Welcome Email (CUSTOMER_CREATED)

```
Stripe checkout completes
    ↓
POST /api/webhooks/stripe (checkout.session.completed)
    ↓
handleCheckoutCompleted() calls upsertCustomer() with eventType: "CUSTOMER_CREATED"
    ↓
DynamoDB write triggers Stream
    ↓
StreamProcessor Lambda → SNS (CUSTOMER topic)
    ↓
SQS → EmailSender Lambda
    ↓
EMAIL_ACTIONS["CUSTOMER_CREATED"] = "welcome"
    ↓
SES sends welcome email ✅
```

### Working: Trial Reminder (Scheduled)

```
EventBridge rule fires daily at configured time
    ↓
scheduled-tasks Lambda invoked with taskType: "trial-reminder"
    ↓
handleTrialReminder() scans for trialing customers expiring in 3 days
    ↓
For each customer (if not already sent):
    ↓
sendEmail("trialEnding", {...}) via SES
    ↓
markEmailSent() to prevent duplicates ✅
```

### Broken: Immediate Cancellation (Missing eventType)

```
Stripe webhook: customer.subscription.deleted
    ↓
POST /api/webhooks/stripe
    ↓
handleSubscriptionDeleted() calls updateCustomerSubscription()
    ↓
❌ No eventType written (only subscriptionStatus: "canceled")
    ↓
❌ DynamoDB Stream fires but EmailSender ignores (no eventType)
    ↓
❌ No cancellation email sent
```

---

## Testing Status

### Unit Tests

| Component | Coverage | Location |
|-----------|----------|----------|
| ses.js email functions | ✅ Tested | `__tests__/unit/lib/ses.test.js` |
| email-sender Lambda | ✅ Tested | `__tests__/unit/lambda/email-sender.test.js` |
| scheduled-tasks Lambda | ✅ Tested | `__tests__/unit/lambda/scheduled-tasks.test.js` |
| stream-processor Lambda | ✅ Tested | `__tests__/unit/lambda/stream-processor.test.js` |

### Integration Tests

| Flow | Status | Notes |
|------|--------|-------|
| Webhook → DynamoDB event write | ✅ Tested | In webhook tests |
| DynamoDB Stream → StreamProcessor → SNS | ✅ Tested | In stream-processor tests |
| SNS → SQS → EmailSender | ⚠️ Partial | Mocked in unit tests |
| EmailSender → SES | ⚠️ Partial | SES client mocked |

### E2E Tests Recommended

| Scenario | Priority |
|----------|----------|
| Stripe checkout → welcome + license emails received | High |
| Payment failure → payment failed email received | High |
| Immediate subscription cancel → cancellation email received | High |
| Trial expiring → reminder email received | Medium |
| License revoked → revocation email received | Medium |

---

## Configuration & Environment Variables

### Currently Configured (Verified)

| Variable | Value | Used By |
|----------|-------|---------|
| `SES_FROM_EMAIL` | noreply@hic-ai.com | All email functions |
| `AWS_REGION` | us-east-1 | All AWS clients |
| `NEXT_PUBLIC_APP_URL` | https://mouse.hic-ai.com | Email template links |
| `APP_URL` | https://mouse.hic-ai.com | Lambda template links |
| `SUPPORT_EMAIL` | support@hic-ai.com | Dispute alerts |

### SNS/SQS Configuration (Infrastructure)

| Variable | Purpose | Used By |
|----------|---------|---------|
| `PAYMENT_EVENTS_TOPIC_ARN` | Payment event routing | StreamProcessor |
| `CUSTOMER_EVENTS_TOPIC_ARN` | Customer event routing | StreamProcessor |
| `LICENSE_EVENTS_TOPIC_ARN` | License event routing | StreamProcessor |
| `DYNAMODB_TABLE_NAME` | PLG data table | scheduled-tasks |

### EventBridge Schedules (Infrastructure)

| Rule | Schedule | Target |
|------|----------|--------|
| `trial-reminder-rule` | Daily (9 AM UTC) | scheduled-tasks Lambda |
| `winback-30-rule` | Daily (9 AM UTC) | scheduled-tasks Lambda |
| `winback-90-rule` | Daily (9 AM UTC) | scheduled-tasks Lambda |

---

## Agent/Model Recommendations for Implementation

| Task | Classification | Recommended Agent |
|------|----------------|-------------------|
| Immediate cancellation fix | Routine - Simple code addition | Haiku 4.5 |
| LICENSE_SUSPENDED fix | Routine - Simple code addition | Haiku 4.5 |
| Template layer design | Non-routine - Architecture | Opus 4.5 review recommended |
| Template consolidation implementation | Routine - Refactoring | Haiku 4.5 |
| E2E test design | Non-routine - Test strategy | Opus 4.5 |
| E2E test implementation | Routine - Test code | Haiku 4.5 |

---

## References

- [Stripe Webhook Events](https://stripe.com/docs/api/events/types)
- [Keygen Webhook Events](https://keygen.sh/docs/api/webhooks/)
- [AWS SES API Reference](https://docs.aws.amazon.com/ses/latest/APIReference/)
- [DynamoDB Streams](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Streams.html)
- [SNS/SQS Fan-Out Pattern](https://docs.aws.amazon.com/sns/latest/dg/SendMessageToSQS.html)
- [EventBridge Rules](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rules.html)

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| V1 | 2026-01-31 | Q Developer (Haiku 4.5) | Initial specification with gap analysis |
| V2 | 2026-01-31 | GitHub Copilot (Opus 4.5) | Corrected gap analysis; reduced 5 gaps to 3 |
| V3 | 2026-01-31 | Gemini 3 | Identified immediate cancellation gap; streamlined format |
| V4 | 2026-01-31 | GitHub Copilot (Opus 4.5) | Final consolidation with reference materials |
