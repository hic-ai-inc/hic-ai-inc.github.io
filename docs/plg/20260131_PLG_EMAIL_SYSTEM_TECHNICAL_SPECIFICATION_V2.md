# PLG Email System Technical Specification V2

**Document ID:** 20260131_PLG_EMAIL_SYSTEM_TECHNICAL_SPECIFICATION_V2  
**Date:** January 31, 2026  
**Status:** Reviewed & Corrected  
**Original Author:** GitHub Copilot (Haiku 4.5)  
**Reviewer:** GitHub Copilot (Opus 4.5)  
**Owner:** SWR

---

## Executive Summary

The PLG email system uses an **event-driven architecture** via DynamoDB Streams → SNS → SQS → Lambda → SES. Comprehensive code review reveals the system is **more complete than initially assessed**. Most lifecycle email triggers are implemented and wired correctly.

### Current State Summary

| Category            | Status                                          |
| ------------------- | ----------------------------------------------- |
| Event-driven emails | ✅ 6 of 8 event types implemented               |
| Scheduled tasks     | ✅ Lambda exists with 3 job handlers            |
| Direct-call emails  | ✅ 2 working (dispute alert, enterprise invite) |
| Template management | ⚠️ 3 copies exist - consolidation needed        |

### Actual Gaps (3 Total)

1. **`LICENSE_SUSPENDED` event** - Status updates but no email trigger
2. **Template drift risk** - 3 separate template copies need consolidation
3. **Trial reminder timing** - Implementation uses 3 days, business requirement unclear

---

## Architecture Overview

### Event Pipeline (Implemented & Working)

```
DynamoDB Write (with eventType field)
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

### Implementation Status

**✅ Working Paths (Event-Driven):**

| Event Type                 | Trigger                                         | Email Template  | Source Location                |
| -------------------------- | ----------------------------------------------- | --------------- | ------------------------------ |
| `LICENSE_CREATED`          | License provisioning                            | licenseDelivery | `webhooks/stripe/route.js:191` |
| `CUSTOMER_CREATED`         | Stripe checkout complete                        | welcome         | `webhooks/stripe/route.js:183` |
| `SUBSCRIPTION_CANCELLED`   | Subscription update with `cancel_at_period_end` | cancellation    | `webhooks/stripe/route.js:316` |
| `SUBSCRIPTION_REACTIVATED` | Payment success after `past_due`                | reactivation    | `webhooks/stripe/route.js:416` |
| `PAYMENT_FAILED`           | Invoice payment failure                         | paymentFailed   | `webhooks/stripe/route.js:462` |
| `LICENSE_REVOKED`          | Keygen license revocation                       | licenseRevoked  | `webhooks/keygen/route.js:280` |

**✅ Working Paths (Direct Call):**

| Function                      | Trigger                                 | Source Location                |
| ----------------------------- | --------------------------------------- | ------------------------------ |
| `sendDisputeAlert()`          | Stripe `charge.dispute.created` webhook | `webhooks/stripe/route.js:510` |
| `sendEnterpriseInviteEmail()` | Team invite action in portal            | `api/portal/team/invite`       |

**✅ Working Paths (Scheduled Tasks):**

| Job              | Schedule            | Email Template | Source Location                    |
| ---------------- | ------------------- | -------------- | ---------------------------------- |
| `trial-reminder` | Daily (EventBridge) | trialEnding    | `scheduled-tasks/index.js:257-297` |
| `winback-30`     | Daily (EventBridge) | winback30      | `scheduled-tasks/index.js:302-345` |
| `winback-90`     | Daily (EventBridge) | winback90      | `scheduled-tasks/index.js:350-393` |

**⚠️ Partial Implementation:**

| Event Type          | Issue                                                      | Impact                                |
| ------------------- | ---------------------------------------------------------- | ------------------------------------- |
| `LICENSE_SUSPENDED` | Keygen webhook updates status but does NOT write eventType | No suspension notification email sent |

**❌ Not Implemented:**

| Feature                           | Notes                                                      |
| --------------------------------- | ---------------------------------------------------------- |
| `TRIAL_ENDING` via event pipeline | Handled by scheduled task instead (acceptable alternative) |

---

## Email Functions Inventory (11 Total)

All defined in `plg-website/src/lib/ses.js` with SES integration.

| Function                      | Template         | Trigger Method                            | Status     |
| ----------------------------- | ---------------- | ----------------------------------------- | ---------- |
| `sendWelcomeEmail()`          | welcome          | Event-driven (`CUSTOMER_CREATED`)         | ✅ Working |
| `sendLicenseEmail()`          | licenseDelivery  | Event-driven (`LICENSE_CREATED`)          | ✅ Working |
| `sendPaymentFailedEmail()`    | paymentFailed    | Event-driven (`PAYMENT_FAILED`)           | ✅ Working |
| `sendTrialEndingEmail()`      | trialEnding      | Scheduled task (3-day reminder)           | ✅ Working |
| `sendReactivationEmail()`     | reactivation     | Event-driven (`SUBSCRIPTION_REACTIVATED`) | ✅ Working |
| `sendCancellationEmail()`     | cancellation     | Event-driven (`SUBSCRIPTION_CANCELLED`)   | ✅ Working |
| `sendLicenseRevokedEmail()`   | licenseRevoked   | Event-driven (`LICENSE_REVOKED`)          | ✅ Working |
| `sendDisputeAlert()`          | disputeAlert     | Direct call in webhook                    | ✅ Working |
| `sendWinBack30Email()`        | winBack30        | Scheduled task (30d post-cancel)          | ✅ Working |
| `sendWinBack90Email()`        | winBack90        | Scheduled task (90d post-cancel)          | ✅ Working |
| `sendEnterpriseInviteEmail()` | enterpriseInvite | Direct call in portal API                 | ✅ Working |

---

## Detailed Gap Analysis

### Gap 1: LICENSE_SUSPENDED Event Not Triggering Email

**Current State:**

The Keygen webhook handler at `webhooks/keygen/route.js` handles `license.suspended` events:

```javascript
// Lines 232-245 in webhooks/keygen/route.js
async function handleLicenseSuspended(data) {
  const licenseId = data.id;
  console.log("License suspended:", licenseId);

  await updateLicenseStatus(licenseId, "suspended", {
    suspendedAt: new Date().toISOString(),
  });
  // NOTE: No eventType written - email NOT triggered
}
```

**Problem:**

- Status is updated correctly in DynamoDB
- No `eventType: "LICENSE_SUSPENDED"` is written
- EmailSender Lambda has mapping but event never fires

**Impact:** Customers whose licenses are suspended via Keygen (e.g., policy violation, admin action) don't receive notification email.

**Fix Required:**

```javascript
async function handleLicenseSuspended(data) {
  const licenseId = data.id;
  console.log("License suspended:", licenseId);

  const license = await getLicense(licenseId);

  await updateLicenseStatus(licenseId, "suspended", {
    suspendedAt: new Date().toISOString(),
    eventType: "LICENSE_SUSPENDED", // ADD THIS
    email: license?.email, // ADD THIS
  });
}
```

**Effort:** Low (< 1 hour)

---

### Gap 2: Template Drift Risk (3 Copies)

**Current State:**

Email templates are duplicated in THREE locations:

| Location                                         | Templates        | Purpose                        |
| ------------------------------------------------ | ---------------- | ------------------------------ |
| `plg-website/src/lib/ses.js`                     | All 11 templates | Application-side email sending |
| `infrastructure/lambda/email-sender/index.js`    | 8 templates      | Event-driven email sending     |
| `infrastructure/lambda/scheduled-tasks/index.js` | 3 templates      | Scheduled job email sending    |

**Specific Duplications:**

| Template         | ses.js | email-sender | scheduled-tasks |
| ---------------- | ------ | ------------ | --------------- |
| welcome          | ✅     | ✅           | ❌              |
| licenseDelivery  | ✅     | ✅           | ❌              |
| paymentFailed    | ✅     | ✅           | ❌              |
| trialEnding      | ✅     | ✅           | ✅              |
| reactivation     | ✅     | ✅           | ❌              |
| cancellation     | ✅     | ✅           | ❌              |
| licenseRevoked   | ✅     | ✅           | ❌              |
| winBack30        | ✅     | ❌           | ✅              |
| winBack90        | ✅     | ❌           | ✅              |
| enterpriseInvite | ✅     | ❌           | ❌              |
| disputeAlert     | ✅     | ❌           | ❌              |

**Impact:**

- Template changes require updates in multiple locations
- Risk of inconsistent customer experience
- Maintenance burden

**Recommended Solution:**

**Option A: Shared Template Layer (Preferred)**

- Create `infrastructure/layers/email-templates/` as Lambda layer
- Export template functions from single source
- Both Lambdas import from layer

**Option B: Environment Variable Templates**

- Store templates in SSM Parameter Store or S3
- Lambdas fetch templates at cold start
- More complex but enables runtime updates

**Option C: Template Service**

- Dedicated Lambda that returns rendered templates
- Other Lambdas call template service
- Adds latency but maximum flexibility

**Effort:** Medium (4-8 hours for Option A)

---

### Gap 3: Trial Reminder Timing Clarification Needed

**Current Implementation:**

```javascript
// scheduled-tasks/index.js line 261
const { startOfDay, endOfDay, dateString } = getDateRange(3); // 3 days
```

The scheduled task sends trial reminders **3 days** before expiration.

**Original Document Stated:** 7 days before expiration

**Business Decision Required:**

- Is 3 days the correct lead time?
- Should there be multiple reminders (e.g., 7 days AND 3 days)?
- What's the conversion rate data suggesting?

**No Code Change Needed** unless business decides to change timing.

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

### Working: License Delivery (LICENSE_CREATED)

```
Stripe checkout completes (or provision-license API)
    ↓
createDynamoDBLicense() with eventType: "LICENSE_CREATED"
    ↓
DynamoDB write triggers Stream
    ↓
StreamProcessor Lambda → SNS (LICENSE topic)
    ↓
SQS → EmailSender Lambda
    ↓
EMAIL_ACTIONS["LICENSE_CREATED"] = "licenseDelivery"
    ↓
SES sends license key email ✅
```

### Working: Payment Failed (PAYMENT_FAILED)

```
Stripe webhook: invoice.payment_failed
    ↓
POST /api/webhooks/stripe
    ↓
handlePaymentFailed() calls updateCustomerSubscription() with eventType: "PAYMENT_FAILED"
    ↓
DynamoDB write triggers Stream
    ↓
StreamProcessor Lambda → SNS (PAYMENT topic)
    ↓
SQS → EmailSender Lambda
    ↓
EMAIL_ACTIONS["PAYMENT_FAILED"] = "paymentFailed"
    ↓
SES sends payment failed email ✅
```

### Working: Cancellation Email (SUBSCRIPTION_CANCELLED)

```
Stripe webhook: customer.subscription.updated (with cancel_at_period_end: true)
    ↓
POST /api/webhooks/stripe
    ↓
handleSubscriptionUpdated() calls updateCustomerSubscription() with eventType: "SUBSCRIPTION_CANCELLED"
    ↓
DynamoDB write triggers Stream
    ↓
StreamProcessor Lambda → SNS (PAYMENT topic)
    ↓
SQS → EmailSender Lambda
    ↓
EMAIL_ACTIONS["SUBSCRIPTION_CANCELLED"] = "cancellation"
    ↓
SES sends cancellation email ✅
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

### Broken: License Suspended (Missing eventType)

```
Keygen webhook: license.suspended
    ↓
POST /api/webhooks/keygen
    ↓
handleLicenseSuspended() calls updateLicenseStatus()
    ↓
❌ No eventType written
    ↓
❌ DynamoDB Stream fires but EmailSender ignores (no eventType)
    ↓
❌ No suspension email sent
```

---

## Recommended Implementation Priority

### Phase 1 (Quick Win) - Fix LICENSE_SUSPENDED

**Effort:** < 1 hour  
**Impact:** Customers notified when license suspended

1. Add `eventType: "LICENSE_SUSPENDED"` in Keygen webhook handler
2. Ensure email field is included for template
3. Test end-to-end

### Phase 2 (Technical Debt) - Template Consolidation

**Effort:** 4-8 hours  
**Impact:** Reduced maintenance burden, eliminated drift risk

1. Create shared email-templates Lambda layer
2. Migrate email-sender to use shared templates
3. Migrate scheduled-tasks to use shared templates
4. Update deployment scripts to include layer
5. Remove duplicate template code

### Phase 3 (Business Decision) - Trial Reminder Timing

**Effort:** Minimal code change, requires business input  
**Impact:** Potentially improved trial conversion

1. Review conversion data for current 3-day reminder
2. Decide on single vs. multiple reminders
3. Adjust `getDateRange()` parameter if needed

---

## Testing Status

### Unit Tests

| Component               | Coverage  | Location                                         |
| ----------------------- | --------- | ------------------------------------------------ |
| ses.js email functions  | ✅ Tested | `__tests__/unit/lib/ses.test.js`                 |
| email-sender Lambda     | ✅ Tested | `__tests__/unit/lambda/email-sender.test.js`     |
| scheduled-tasks Lambda  | ✅ Tested | `__tests__/unit/lambda/scheduled-tasks.test.js`  |
| stream-processor Lambda | ✅ Tested | `__tests__/unit/lambda/stream-processor.test.js` |

### Integration Tests

| Flow                                    | Status     | Notes                     |
| --------------------------------------- | ---------- | ------------------------- |
| Webhook → DynamoDB event write          | ✅ Tested  | In webhook tests          |
| DynamoDB Stream → StreamProcessor → SNS | ✅ Tested  | In stream-processor tests |
| SNS → SQS → EmailSender                 | ⚠️ Partial | Mocked in unit tests      |
| EmailSender → SES                       | ⚠️ Partial | SES client mocked         |

### E2E Tests Recommended

| Scenario                                            | Priority |
| --------------------------------------------------- | -------- |
| Stripe checkout → welcome + license emails received | High     |
| Payment failure → payment failed email received     | High     |
| Subscription cancel → cancellation email received   | Medium   |
| Trial expiring → reminder email received            | Medium   |
| License revoked → revocation email received         | Medium   |

---

## Configuration & Environment Variables

### Currently Configured (Verified)

| Variable              | Value                    | Used By               |
| --------------------- | ------------------------ | --------------------- |
| `SES_FROM_EMAIL`      | noreply@hic-ai.com       | All email functions   |
| `AWS_REGION`          | us-east-1                | All AWS clients       |
| `NEXT_PUBLIC_APP_URL` | https://mouse.hic-ai.com | Email template links  |
| `APP_URL`             | https://mouse.hic-ai.com | Lambda template links |
| `SUPPORT_EMAIL`       | support@hic-ai.com       | Dispute alerts        |

### SNS/SQS Configuration (Infrastructure)

| Variable                    | Purpose                | Used By         |
| --------------------------- | ---------------------- | --------------- |
| `PAYMENT_EVENTS_TOPIC_ARN`  | Payment event routing  | StreamProcessor |
| `CUSTOMER_EVENTS_TOPIC_ARN` | Customer event routing | StreamProcessor |
| `LICENSE_EVENTS_TOPIC_ARN`  | License event routing  | StreamProcessor |
| `DYNAMODB_TABLE_NAME`       | PLG data table         | scheduled-tasks |

### EventBridge Schedules (Infrastructure)

| Rule                  | Schedule                    | Target                 |
| --------------------- | --------------------------- | ---------------------- |
| `trial-reminder-rule` | Daily (suggested: 9 AM UTC) | scheduled-tasks Lambda |
| `winback-30-rule`     | Daily (suggested: 9 AM UTC) | scheduled-tasks Lambda |
| `winback-90-rule`     | Daily (suggested: 9 AM UTC) | scheduled-tasks Lambda |

---

## Summary: Corrections from V1 Document

| V1 Claim                                  | V2 Finding                                                        |
| ----------------------------------------- | ----------------------------------------------------------------- |
| "Welcome email never called"              | ❌ Wrong - `CUSTOMER_CREATED` event IS written on checkout        |
| "7 of 8 email action mappings never fire" | ❌ Wrong - 6 of 8 ARE implemented                                 |
| "No scheduled tasks exist"                | ❌ Wrong - scheduled-tasks Lambda EXISTS with 3 job handlers      |
| "Webhook handlers incomplete"             | ❌ Mostly wrong - payment, cancellation, reactivation all handled |
| "Template duplication in 2 places"        | ⚠️ Understated - actually 3 places                                |
| "Trial reminder at 7 days"                | ⚠️ Wrong - implementation uses 3 days                             |

---

## Action Items

| #   | Action                                              | Owner | Priority | Effort   |
| --- | --------------------------------------------------- | ----- | -------- | -------- |
| 1   | Add `LICENSE_SUSPENDED` eventType to Keygen webhook | Dev   | High     | Low      |
| 2   | Decide trial reminder timing (3d vs 7d vs both)     | SWR   | Medium   | Decision |
| 3   | Design template consolidation approach              | Dev   | Medium   | Medium   |
| 4   | Implement template consolidation                    | Dev   | Low      | Medium   |
| 5   | Add E2E email tests                                 | Dev   | Low      | High     |

---

## Agent/Model Recommendations for Implementation

| Task                                  | Classification                 | Recommended Agent           |
| ------------------------------------- | ------------------------------ | --------------------------- |
| LICENSE_SUSPENDED fix                 | Routine - Simple code addition | Haiku 4.5                   |
| Template layer design                 | Non-routine - Architecture     | Opus 4.5 review recommended |
| Template consolidation implementation | Routine - Refactoring          | Haiku 4.5                   |
| E2E test design                       | Non-routine - Test strategy    | Opus 4.5                    |
| E2E test implementation               | Routine - Test code            | Haiku 4.5                   |
| Trial timing decision                 | Human decision                 | SWR                         |

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

| Version | Date       | Author                    | Changes                                                                                                                |
| ------- | ---------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| V1      | 2026-01-31 | GitHub Copilot (Haiku 4.5)   | Initial specification with gap analysis                                                                                |
| V2      | 2026-01-31 | GitHub Copilot (Opus 4.5) | Corrected gap analysis based on code review; reduced 5 gaps to 3 actual gaps; added implementation status verification |
