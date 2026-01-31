# PLG Email System Technical Specification

**Document ID:** 20260131_PLG_EMAIL_SYSTEM_TECHNICAL_SPECIFICATION  
**Date:** January 31, 2026  
**Status:** Review - Critical Gaps Identified  
**Owner:** SWR (Q Developer/Copilot Analysis)

---

## Executive Summary

The PLG email system uses an **event-driven architecture** via DynamoDB Streams → SNS → SQS → Lambda → SES. However, comprehensive audit reveals **5 critical gaps** preventing most lifecycle emails from being delivered to customers. Only **dispute alerts and enterprise invites** are currently working due to direct function calls. All other email lifecycle events (welcome, license delivery, payment failures, trial reminders, cancellation, win-back) are either:

1. Defined but never triggered (welcome email)
2. Mapped in email-sender Lambda but never published to SNS
3. Missing scheduled triggers entirely (trial ending, win-back emails)

This document catalogs the current state and required fixes.

---

## Architecture Overview

### Event Pipeline (Intended)

```
DynamoDB Write (with eventType)
    ↓
DynamoDB Stream (captures all writes)
    ↓
StreamProcessor Lambda (classifies by PK/SK/eventType)
    ↓
SNS Topic (routes by event type: PAYMENT, CUSTOMER, LICENSE)
    ↓
SQS Queue (decouples from subscribers)
    ↓
EmailSender Lambda (maps eventType → template)
    ↓
AWS SES (sends email)
```

### Current Implementation Status

**Working Path:**

- Stripe dispute events → Direct `sendDisputeAlert()` call → SES ✅
- Enterprise invite flow → Direct `sendEnterpriseInviteEmail()` call → SES ✅

**Partially Working Path:**

- License creation → DynamoDB write with `eventType: "LICENSE_CREATED"` → Event fires → EmailSender Lambda receives → **Template is hardcoded, not reused** ⚠️

**Broken Paths:**

- Welcome email → Function defined but never called
- Payment failure → Function defined, no webhook trigger, no event write
- Trial ending → Function defined, no scheduled task
- Reactivation → Function defined, no webhook trigger
- Cancellation → Function defined, no webhook trigger
- License revoked → Function defined, no webhook trigger
- Win-back (30/90 day) → Functions defined, no scheduled tasks

---

## Current Email Functions (11 Total)

All defined in `plg-website/src/lib/ses.js` with SES integration.

| Function                      | Template         | Trigger                          | Status                                  |
| ----------------------------- | ---------------- | -------------------------------- | --------------------------------------- |
| `sendWelcomeEmail()`          | welcome          | After Stripe checkout            | ❌ Never called                         |
| `sendLicenseEmail()`          | licenseDelivery  | After account creation           | ⚠️ Event-triggered, hardcoded in Lambda |
| `sendPaymentFailedEmail()`    | paymentFailed    | Stripe webhook retry event       | ❌ No webhook handler                   |
| `sendTrialEndingEmail()`      | trialEnding      | Scheduled task                   | ❌ No scheduled task                    |
| `sendReactivationEmail()`     | reactivation     | Stripe webhook reactivation      | ❌ No webhook handler                   |
| `sendCancellationEmail()`     | cancellation     | Stripe webhook cancellation      | ❌ No webhook handler                   |
| `sendLicenseRevokedEmail()`   | licenseRevoked   | Keygen webhook revocation        | ❌ No webhook handler                   |
| `sendDisputeAlert()`          | disputeAlert     | Stripe webhook chargeback        | ✅ Direct call in webhook               |
| `sendWinBack30Email()`        | winBack30        | Scheduled task (30d post-cancel) | ❌ No scheduled task                    |
| `sendWinBack90Email()`        | winBack90        | Scheduled task (90d post-cancel) | ❌ No scheduled task                    |
| `sendEnterpriseInviteEmail()` | enterpriseInvite | Team invite action               | ✅ Direct call in portal API            |

---

## Detailed Gap Analysis

### Gap 1: Welcome Email Never Triggered

**Current State:**

- `sendWelcomeEmail(email, sessionId)` function exists
- Template defined with setup completion link
- Session ID passed to portal's welcome page

**Missing:**

- No call after Stripe checkout success
- Should be called in `provision-license/route.js` BEFORE or AFTER license provisioning

**Impact:** Customers don't receive onboarding email with setup instructions.

**Fix Required:**

```javascript
// In provision-license/route.js, after successful license creation:
await sendWelcomeEmail(user.email, sessionId);
```

---

### Gap 2: License Email Architecture Mismatch

**Current State:**

- `createLicense()` writes to DynamoDB with `eventType: "LICENSE_CREATED"`
- StreamProcessor reads stream and publishes to SNS
- EmailSender Lambda subscribes to SNS, receives the event
- EmailSender has **hardcoded template** for `licenseDelivery`

**Problem:**

- `ses.js` maintains template in application code
- `email-sender/index.js` maintains **identical template** separately
- If template changes in `ses.js`, Lambda template isn't updated automatically
- No way to reuse template from shared library in Lambda

**Templates Location:**

- Source: `plg-website/src/lib/ses.js` (lines 100-145)
- Lambda copy: `plg-website/infrastructure/lambda/email-sender/index.js` (lines 56-95)

**Impact:** Template maintenance burden, risk of drift, duplicated code.

**Fix Required:**

- Extract templates to shared module or environment variables
- Reference single source of truth in both `ses.js` and `email-sender/index.js`

---

### Gap 3: Email Event Mapping Not Wired

**EmailSender Lambda Maps These Events:**

```javascript
const EMAIL_ACTIONS = {
  LICENSE_CREATED: "licenseDelivery", // ✅ Being written
  LICENSE_REVOKED: "licenseRevoked", // ❌ Never written
  LICENSE_SUSPENDED: "licenseSuspended", // ❌ Never written
  CUSTOMER_CREATED: "welcome", // ❌ Never written
  SUBSCRIPTION_CANCELLED: "cancellation", // ❌ Never written
  SUBSCRIPTION_REACTIVATED: "reactivation", // ❌ Never written
  PAYMENT_FAILED: "paymentFailed", // ❌ Never written
  TRIAL_ENDING: "trialEnding", // ❌ Never written
};
```

**Problem:**

- Event mapping exists but events are never written to DynamoDB
- `CUSTOMER_CREATED` should be written when customer is first created (webhook or provisioning)
- `SUBSCRIPTION_CANCELLED`, `SUBSCRIPTION_REACTIVATED` should be written on Stripe webhook events
- `LICENSE_REVOKED`, `LICENSE_SUSPENDED` should be written on Keygen webhook events
- `PAYMENT_FAILED` should be written on Stripe invoice payment failure
- `TRIAL_ENDING` should be written by scheduled task

**Impact:** 7 of 8 email action mappings never fire.

**Fix Required:**
Add event writes in:

1. Stripe webhook handler (`webhooks/stripe/route.js`)
2. Keygen webhook handler (`webhooks/keygen/route.js`)
3. DynamoDB operations (`lib/dynamodb.js`)
4. Scheduled tasks Lambda

---

### Gap 4: No Scheduled Tasks for Trial & Win-Back Emails

**Missing Scheduled Triggers:**

1. **Trial Ending Reminder** (7 days before expiry)
   - Function: `sendTrialEndingEmail(email, daysRemaining, planName)`
   - Should run daily, checking for trials expiring in 7 days
   - Query: `SELECT * FROM licenses WHERE expiresAt <= NOW() + 7 days AND trialEnding_email_sent = false`

2. **Win-Back at 30 Days** (post-cancellation)
   - Function: `sendWinBack30Email(email)`
   - Should run daily, checking cancellations from 30 days ago
   - Query: `SELECT * FROM customers WHERE cancelledAt = NOW() - 30 days AND winback30_email_sent = false`

3. **Win-Back at 90 Days with Discount** (post-cancellation)
   - Function: `sendWinBack90Email(email, discountCode)`
   - Should run daily, checking cancellations from 90 days ago
   - Query: `SELECT * FROM customers WHERE cancelledAt = NOW() - 90 days AND winback90_email_sent = false`

**Current State:** No scheduled tasks exist.

**Impact:** No customer re-engagement emails, lost retention opportunities.

**Fix Required:**

- Create Lambda function: `scheduled-tasks/index.js` (or extend existing if present)
- EventBridge rules to trigger daily at 9 AM UTC
- Implement query logic for each email type
- Track email send state with `*_email_sent` flags to prevent duplicates

---

### Gap 5: Webhook Event Handlers Incomplete

**Stripe Webhook Handler** (`webhooks/stripe/route.js`)

Currently handles:

- ✅ `charge.dispute.created` → calls `sendDisputeAlert()` (direct)
- ❌ `invoice.payment_failed` → should write `PAYMENT_FAILED` event
- ❌ `customer.subscription.deleted` → should write `SUBSCRIPTION_CANCELLED` event
- ❌ `customer.subscription.updated` (status: active) → should write `SUBSCRIPTION_REACTIVATED` event

**Keygen Webhook Handler** (`webhooks/keygen/route.js`)

Currently handles:

- License status updates → calls `updateLicenseStatus()` with `eventType`
- ❌ Should include `LICENSE_REVOKED` event type when status changes to revoked
- ❌ Should include `LICENSE_SUSPENDED` event type when status changes to suspended

**Impact:** Payment and subscription events don't trigger email notifications.

---

## Event Flow Diagrams

### Currently Working: Enterprise Invite

```
User requests team invite
    ↓
POST /api/portal/team/invite
    ↓
sendEnterpriseInviteEmail() [DIRECT CALL]
    ↓
SES sends email ✅
```

### Currently Working: Dispute Alert

```
Stripe customer disputes charge
    ↓
Stripe webhook: charge.dispute.created
    ↓
POST /api/webhooks/stripe
    ↓
sendDisputeAlert() [DIRECT CALL]
    ↓
SES sends to support@hic-ai.com ✅
```

### Currently Working (Partially): License Delivery

```
POST /api/provision-license
    ↓
createLicense() in DynamoDB
    ↓
DynamoDB Stream event
    ↓
StreamProcessor Lambda
    ↓
Publish to SNS (LICENSE topic)
    ↓
SQS subscribes
    ↓
EmailSender Lambda triggered
    ↓
Hardcoded template → SES ⚠️
```

### Currently Broken: Welcome Email

```
Stripe checkout completes
    ↓
POST /api/provision-license
    ↓
createLicense() [license email sent but welcome is not]
    ↓
❌ sendWelcomeEmail() never called
    ↓
❌ Customer never receives setup instructions
```

### Currently Broken: Cancellation Email

```
Stripe webhook: customer.subscription.deleted
    ↓
POST /api/webhooks/stripe
    ↓
❌ No event write (SUBSCRIPTION_CANCELLED)
    ↓
❌ No DynamoDB Stream event
    ↓
❌ sendCancellationEmail() never triggered
```

---

## Recommended Implementation Priority

### Phase 1 (Critical) - Get Core Lifecycle Emails Working

1. Fix welcome email: Add call in `provision-license/route.js`
2. Extract email templates to shared module
3. Update EmailSender Lambda to use shared templates
4. Add webhook event writers for payment/subscription events

### Phase 2 (High) - Complete Webhook Coverage

1. Add `PAYMENT_FAILED` event writes on Stripe webhook
2. Add `SUBSCRIPTION_CANCELLED` event write on Stripe webhook
3. Add `SUBSCRIPTION_REACTIVATED` event write on Stripe webhook
4. Add `LICENSE_REVOKED` event write on Keygen webhook
5. Test event-to-email flow end-to-end

### Phase 3 (Medium) - Scheduled Task System

1. Create scheduled-tasks Lambda (if not present)
2. Implement trial ending reminder (7 days before expiry)
3. Implement win-back 30-day email
4. Implement win-back 90-day email with discount
5. Add EventBridge rules for daily execution

### Phase 4 (Optional) - Template System Enhancement

1. Build template management interface in admin portal
2. Allow non-technical editing of email templates
3. Add A/B testing capability
4. Add email preview and send test functionality

---

## Testing Requirements

### Unit Tests

- All 11 email functions tested in `ses.test.js` ✅
- Each function validates template, subject, HTML/text body

### Integration Tests

- ✅ Webhook → DynamoDB event write
- ✅ DynamoDB Stream → StreamProcessor → SNS
- ❌ SNS → SQS → EmailSender Lambda
- ❌ EmailSender Lambda → SES

### E2E Tests

- ✅ Stripe checkout → license provisioned
- ❌ License created → welcome email received
- ❌ Stripe subscription cancelled → cancellation email received
- ❌ Trial expires in 7 days → trial reminder received

---

## Configuration & Environment Variables

### Required (Currently Set)

- `SES_FROM_EMAIL` = noreply@hic-ai.com
- `AWS_REGION` = us-east-1
- `NEXT_PUBLIC_APP_URL` = https://mouse.hic-ai.com

### Required (Missing/Needs Verification)

- `PAYMENT_EVENTS_TOPIC_ARN` - StreamProcessor publishes payment events
- `CUSTOMER_EVENTS_TOPIC_ARN` - StreamProcessor publishes customer events
- `LICENSE_EVENTS_TOPIC_ARN` - StreamProcessor publishes license events
- `EMAIL_QUEUE_URL` - EmailSender Lambda polls for messages

### Required (New - for Scheduled Tasks)

- `TRIAL_CHECK_SCHEDULE` - EventBridge cron (suggest: `0 9 * * ? *` = 9 AM UTC daily)
- `WINBACK_CHECK_SCHEDULE` - EventBridge cron (suggest: same as trial)

---

## Summary Table: Required Fixes

| Email             | Current       | Issue              | Fix                       |
| ----------------- | ------------- | ------------------ | ------------------------- |
| Welcome           | Function only | Never called       | Call in provision-license |
| License Delivery  | Event-driven  | Hardcoded template | Extract shared template   |
| Payment Failed    | Function only | No webhook event   | Add webhook handler       |
| Trial Ending      | Function only | No scheduled task  | Create scheduled task     |
| Reactivation      | Function only | No webhook event   | Add webhook handler       |
| Cancellation      | Function only | No webhook event   | Add webhook handler       |
| License Revoked   | Function only | No webhook event   | Add webhook handler       |
| Dispute Alert     | Direct call   | ✅ Working         | No action                 |
| Win-Back 30d      | Function only | No scheduled task  | Create scheduled task     |
| Win-Back 90d      | Function only | No scheduled task  | Create scheduled task     |
| Enterprise Invite | Direct call   | ✅ Working         | No action                 |

---

## References

- [Stripe Webhook Events](https://stripe.com/docs/api/events/types)
- [Keygen Webhook Events](https://keygen.sh/docs/api/webhooks/)
- [AWS SES API Reference](https://docs.aws.amazon.com/ses/latest/APIReference/)
- [DynamoDB Streams](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Streams.html)
- [SNS/SQS Fan-Out Pattern](https://docs.aws.amazon.com/sns/latest/dg/SendMessageToSQS.html)
- [EventBridge Rules](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rules.html)

---

**Next Steps:** Review with SWR and Q Developer. Prioritize Phase 1 fixes before next PLG feature release.
