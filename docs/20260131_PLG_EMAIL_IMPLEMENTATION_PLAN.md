# PLG Email System Implementation Plan & Execution Framework

**Date:** January 31, 2026  
**Status:** Ready for Execution  
**Commit:** 1f4773d (Development branch)

---

## Executive Overview

After comprehensive multi-agent analysis (Haiku 4.5 → Opus 4.5 → Gemini 3 → Opus 4.5 consolidated), the PLG email system has been validated as **90% functional** with a healthy event-driven architecture. The implementation plan is organized into **three sequential phases** with clear ownership and validation strategies.

---

## Phase 1: Critical Webhook Fixes (2 Hours)

**Objective:** Unblock immediate cancellation and license suspension emails

### 1.1 Immediate Cancellation Fix

**File:** `plg-website/src/app/api/webhooks/stripe/route.js`  
**Function:** `handleSubscriptionDeleted`  
**Issue:** Immediate cancellations (via Stripe Dashboard/API) don't trigger cancellation emails

**Current Code (Lines 360-375):**

```javascript
async function handleSubscriptionDeleted(subscription) {
  console.log("Subscription deleted:", subscription.id);

  const { customer } = subscription;

  // Find customer by Stripe ID
  const dbCustomer = await getCustomerByStripeId(customer);
  if (!dbCustomer) {
    console.log("Customer not found for subscription deletion");
    return;
  }

  // Update customer status
  await updateCustomerSubscription(dbCustomer.userId, {
    subscriptionStatus: "canceled",
  });
```

**Fix:** Add `eventType`, `email`, and `cancelAt` fields to trigger email pipeline

```javascript
// Update customer status
const cancelAt = new Date().toLocaleDateString("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

await updateCustomerSubscription(dbCustomer.userId, {
  subscriptionStatus: "canceled",
  eventType: "SUBSCRIPTION_CANCELLED", // ADD THIS
  email: dbCustomer.email, // ADD THIS
  accessUntil: cancelAt, // ADD THIS
});
```

**Owner:** Q Developer (Haiku 4.5)  
**Effort:** 30 minutes  
**Risk:** Low (isolated change, matches pattern in `handleUpdatedSubscription`)

---

### 1.2 License Suspended Fix

**File:** `plg-website/src/app/api/webhooks/keygen/route.js`  
**Function:** `handleLicenseSuspended`  
**Issue:** License suspensions don't trigger suspension emails

**Current Code (Lines 232-245):**

```javascript
async function handleLicenseSuspended(data) {
  const licenseId = data.id;
  console.log("License suspended:", licenseId);

  await updateLicenseStatus(licenseId, "suspended", {
    suspendedAt: new Date().toISOString(),
  });

  // Get license to find owner email
  const license = await getLicense(licenseId);
  if (license?.email) {
    // Note: Suspension usually happens via Stripe webhook which sends its own emails
    // Only send payment failed email if this is a standalone suspension
    console.log(`License ${licenseId} suspended for ${license.email}`);
  }
}
```

**Fix:** Add `eventType` and `email` to trigger email pipeline

```javascript
async function handleLicenseSuspended(data) {
  const licenseId = data.id;
  console.log("License suspended:", licenseId);

  // Get license first to include email in update
  const license = await getLicense(licenseId);

  await updateLicenseStatus(licenseId, "suspended", {
    suspendedAt: new Date().toISOString(),
    eventType: "LICENSE_SUSPENDED", // ADD THIS
    email: license?.email, // ADD THIS
  });

  if (license?.email) {
    console.log(
      `License ${licenseId} suspended - email will be sent via event pipeline`,
    );
  }
}
```

**Owner:** Q Developer (Haiku 4.5)  
**Effort:** 20 minutes  
**Risk:** Low (matches pattern in `handleLicenseRevoked`)

---

### 1.3 Validation (Phase 1)

**Unit Tests:** Existing webhook tests should already cover these flows

- Verify `updateCustomerSubscription` receives `eventType: "SUBSCRIPTION_CANCELLED"`
- Verify `updateLicenseStatus` receives `eventType: "LICENSE_SUSPENDED"`

**Test Files:**

- `plg-website/__tests__/unit/api/webhooks.test.js` (Stripe webhook tests)
- `plg-website/__tests__/unit/api/keygen-webhooks.test.js` (Keygen webhook tests)

**Command:**

```bash
cd plg-website && npm test -- --testPathPattern="webhooks"
```

**Success Criteria:**

- ✅ Webhook tests pass
- ✅ No regression in existing email flows
- ✅ New eventType fields are written to DynamoDB

---

## Phase 2: Template Consolidation (4-6 Hours)

**Objective:** Eliminate template duplication and create single source of truth

### 2.1 Create Email Templates Layer

**New Directory:** `dm/layers/email-templates/`

**Structure:**

```
dm/layers/email-templates/
├── package.json
├── src/
│   ├── index.js                    (Export all templates)
│   ├── templates.js                (Template definitions)
│   └── template-engine.js          (Rendering logic)
└── tests/
    └── templates.test.js
```

**Implementation Strategy (Opus 4.5 Review Recommended):**

1. **Export all 11 email templates** from a single module
2. **Create factory function** that accepts template name + data
3. **Return standardized format:** `{ subject, html, text }`
4. **Handle environment variables** (FROM_EMAIL, APP_URL, etc.) within layer

**Example:**

```javascript
// dm/layers/email-templates/src/index.js
export function getEmailTemplate(templateName, data) {
  const templates = {
    welcome: (data) => ({ subject: "...", html: "...", text: "..." }),
    licenseDelivery: (data) => ({ subject: "...", html: "...", text: "..." }),
    // ... all 11 templates
  };

  if (!templates[templateName]) {
    throw new Error(`Unknown template: ${templateName}`);
  }

  return templates[templateName](data);
}
```

**Owner:** Q Developer (Haiku 4.5) with Opus 4.5 architectural review  
**Effort:** 4-6 hours  
**Risk:** Medium (requires refactoring 3 locations + build process changes)

---

### 2.2 Migrate Applications

**File 1:** `plg-website/src/lib/ses.js`

- Remove inline template definitions
- Import from `email-templates` layer
- Update `sendEmail()` to use factory function

**File 2:** `infrastructure/lambda/email-sender/index.js`

- Remove inline template definitions
- Import from `email-templates` layer in Lambda layer bundle
- Update EMAIL_ACTIONS to reference factory

**File 3:** `infrastructure/lambda/scheduled-tasks/index.js`

- Remove inline template definitions
- Import from `email-templates` layer
- Update sendEmail() helper

**Owner:** Q Developer (Haiku 4.5)  
**Effort:** 2 hours  
**Risk:** Low (mechanical changes)

---

### 2.3 Validation (Phase 2)

**Unit Tests:**

- Template factory produces consistent output across all 11 templates
- Environment variable injection works correctly
- No regressions in existing ses.js tests

**Command:**

```bash
cd dm/layers/email-templates && npm test
cd ../../plg-website && npm test -- --testPathPattern="ses"
```

**Success Criteria:**

- ✅ All template tests pass
- ✅ All ses.js tests pass
- ✅ All Lambda unit tests pass
- ✅ Single source of truth confirmed (no duplicates)

---

## Phase 3: End-to-End Validation (2-4 Hours)

**Objective:** Verify the complete email pipeline works for all critical flows

### 3.1 E2E Test Scenarios

| Scenario                    | Trigger                                          | Expected Email    | Priority | Owner                                    |
| --------------------------- | ------------------------------------------------ | ----------------- | -------- | ---------------------------------------- |
| **Checkout Complete**       | Stripe checkout.session.completed                | Welcome + License | High     | Opus 4.5 (test design), Haiku 4.5 (impl) |
| **Payment Failure**         | Stripe invoice.payment_failed                    | Payment Failed    | High     | Opus 4.5 (test design), Haiku 4.5 (impl) |
| **Immediate Cancel**        | Stripe subscription.deleted                      | Cancellation      | High     | Opus 4.5 (test design), Haiku 4.5 (impl) |
| **Subscription Reactivate** | Stripe invoice.payment_succeeded (from past_due) | Reactivation      | Medium   | Opus 4.5 (test design), Haiku 4.5 (impl) |
| **Trial Expiring**          | Scheduled task (3 days before)                   | Trial Reminder    | Medium   | Opus 4.5 (test design), Haiku 4.5 (impl) |
| **License Revoked**         | Keygen license.revoked webhook                   | License Revoked   | Medium   | Opus 4.5 (test design), Haiku 4.5 (impl) |
| **License Suspended**       | Keygen license.suspended webhook                 | License Suspended | Medium   | Opus 4.5 (test design), Haiku 4.5 (impl) |
| **Win-Back 30d**            | Scheduled task (30 days post-cancel)             | Win-Back 30       | Low      | Opus 4.5 (test design), Haiku 4.5 (impl) |
| **Win-Back 90d**            | Scheduled task (90 days post-cancel)             | Win-Back 90       | Low      | Opus 4.5 (test design), Haiku 4.5 (impl) |
| **Enterprise Invite**       | Portal team invite                               | Enterprise Invite | Low      | Opus 4.5 (test design), Haiku 4.5 (impl) |

### 3.2 Test Architecture

**Approach:** Use existing SES mock + SNS/SQS event inspection

```javascript
// Example E2E test: Immediate cancellation triggers email
describe("Email Pipeline - Immediate Cancellation", () => {
  it("should send cancellation email when subscription is deleted", async () => {
    // 1. Trigger Stripe webhook
    const stripeWebhookPayload = {
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_123", customer: "cus_123" } },
    };

    // 2. Call webhook handler
    const response = await POST(request);
    expect(response.status).toBe(200);

    // 3. Verify DynamoDB update included eventType
    const customer = await getCustomer("cus_123");
    expect(customer.eventType).toBe("SUBSCRIPTION_CANCELLED");

    // 4. Simulate StreamProcessor reading the DynamoDB Stream
    const snsPublishSpy = jest.spyOn(snsClient, "send");

    // 5. Verify SNS publish was called with SUBSCRIPTION_CANCELLED event
    expect(snsPublishSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        MessageAttributes: {
          eventType: { StringValue: "SUBSCRIPTION_CANCELLED" },
        },
      }),
    );

    // 6. Verify EmailSender Lambda would send cancellation template
    const emailAction = EMAIL_ACTIONS["SUBSCRIPTION_CANCELLED"];
    expect(emailAction).toBe("cancellation");
  });
});
```

**Test File Location:** `plg-website/__tests__/e2e/email-pipeline.test.js`

**Owner:** Opus 4.5 (E2E test strategy design), Q Developer (implementation)  
**Effort:** 2-4 hours  
**Risk:** Low (existing infrastructure, new test coverage)

---

### 3.3 Manual Validation (Staging Environment)

If automated E2E tests are insufficient, manual testing in staging:

1. **Create test Stripe customer** in staging
2. **Trigger checkout** → Verify welcome + license emails in Mailhog
3. **Cancel subscription immediately** → Verify cancellation email
4. **Trigger payment failure** → Verify payment failed email
5. **Revoke Keygen license** → Verify revocation email
6. **Suspend Keygen license** → Verify suspension email
7. **Wait 3 days** → Trial reminder task runs → Verify email sent

**Owner:** SWR (manual validation)  
**Effort:** 1-2 hours  
**Tools:** Mailhog (staging email capture)

---

### 3.4 Success Criteria (Phase 3)

- ✅ All 10 E2E test scenarios pass
- ✅ Manual staging validation confirms emails received
- ✅ No errors in CloudWatch logs
- ✅ SNS/SQS metrics show correct fan-out
- ✅ Email delivery confirmed (headers + content verified)

---

## Implementation Timeline

| Phase                       | Owner                       | Effort    | Week             |
| --------------------------- | --------------------------- | --------- | ---------------- |
| **Phase 1: Webhook Fixes**  | Haiku 4.5                   | 1 hour    | Week 1 (Mon)     |
| **Phase 1: Validation**     | Haiku 4.5                   | 0.5 hours | Week 1 (Mon)     |
| **Phase 2: Template Layer** | Haiku 4.5 + Opus 4.5 review | 4-6 hours | Week 1 (Tue-Wed) |
| **Phase 2: Migration**      | Haiku 4.5                   | 2 hours   | Week 1 (Wed)     |
| **Phase 2: Validation**     | Haiku 4.5                   | 1 hour    | Week 1 (Wed)     |
| **Phase 3: E2E Design**     | Opus 4.5                    | 1-2 hours | Week 1 (Thu)     |
| **Phase 3: E2E Impl**       | Haiku 4.5                   | 1-2 hours | Week 1 (Thu-Fri) |
| **Phase 3: Validation**     | SWR (manual staging)        | 1-2 hours | Week 2 (Mon)     |

**Total Effort:** ~13-17 hours spread over 2 weeks

---

## Roles & Responsibilities

| Role                          | Responsibility                                                                |
| ----------------------------- | ----------------------------------------------------------------------------- |
| **Q Developer (Haiku 4.5)**   | Execute Phases 1-2-3 code changes; run unit tests; own implementation quality |
| **GitHub Copilot (Opus 4.5)** | Design E2E test strategy; review Phase 2 architecture; ensure best practices  |
| **SWR (Human)**               | Approve phase gates; manual staging validation; final sign-off                |

---

## Risk Mitigation

| Risk                                 | Probability | Mitigation                                         |
| ------------------------------------ | ----------- | -------------------------------------------------- |
| Webhook changes break existing flows | Low         | Unit tests verify no regressions                   |
| Template layer build failures        | Medium      | Separate layer testing before integration          |
| E2E tests are flaky                  | Medium      | Start with high-priority (High) scenarios first    |
| Manual validation discovers new gaps | Low         | Pre-staging review of V4 spec catches major issues |

---

## Success Metrics (Go-Live)

1. **Functional Completeness:** 11 of 11 email flows working (100%)
2. **Test Coverage:** E2E tests cover 8 of 10 critical scenarios
3. **Template Debt:** Eliminated (single source of truth)
4. **Email Delivery:** SES confirms 100% delivery for test scenarios
5. **Documentation:** V4 spec validated against implementation

---

## Next Steps

1. ✅ **Now:** Commit & push analysis documents (DONE - commit 1f4773d)
2. **This Week (Phase 1):** Execute webhook fixes + unit test validation
3. **This Week (Phase 2):** Design & implement template layer
4. **Next Week (Phase 3):** E2E testing + manual staging validation
5. **Sign-Off:** SWR confirms all success metrics met

---

**Document Status:** Ready for Execution  
**Decision Gate:** Awaiting SWR approval to proceed with Phase 1
