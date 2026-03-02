# Stream 1D Completion Plan — Cancellation Email System & Pre-Launch Fixes

**Date:** February 28, 2026
**Author:** Kiro (AI Agent, supervised by SWR)
**Status:** ✅ Complete — SWR Approved (Mar 1, 2026)
**Source:** `docs/plg/20260228_CANCELLATION_EMAIL_REPORT_AND_PRE_LAUNCH_RECOMMENDATIONS.md`
**Tracker:** `docs/launch/20260218_LAUNCH_EXECUTION_TRACKER.md` — Stream 1D, Phase 1

---

## Table of Contents

1. [Overview & Scope](#1-overview--scope)
2. [Reference Architecture](#2-reference-architecture)
3. [Pre-Implementation Checklist](#3-pre-implementation-checklist)
4. [Implementation Tasks](#4-implementation-tasks)
   - [Task 1: Naming Standardization — `CANCELED` / `paymentFailureCount`](#task-1-naming-standardization)
   - [Task 2: Shared Constants — `MAX_PAYMENT_FAILURES` & `CANCELLATION_PENDING`](#task-2-shared-constants)
   - [Task 3: `updateCustomerSubscription` — `clearEmailsSent` Support & Cooldown Guard](#task-3-updatecustomersubscription)
   - [Task 4: Webhook Handler — `handleSubscriptionUpdated`](#task-4-webhook-handler--handlesubscriptionupdated)
   - [Task 5: Webhook Handler — `handleSubscriptionDeleted`](#task-5-webhook-handler--handlesubscriptiondeleted)
   - [Task 6: Webhook Handler — `handlePaymentSucceeded`](#task-6-webhook-handler--handlepaymentsucceeded)
   - [Task 7: customer-update Lambda — Race Condition Fix & `handleSubscriptionDeleted` Alignment](#task-7-customer-update-lambda)
   - [Task 8: Email Templates — New Templates, Updated Mapping, Dead Code Removal](#task-8-email-templates)
   - [Task 9: email-sender Lambda — Guard 2 Logging & `EMAIL_ACTIONS` Rename](#task-9-email-sender-lambda)
   - [Task 10: email-sender Lambda — Org Member Fan-Out Routing](#task-10-email-sender-lambda--org-fan-out)
   - [Task 11: scheduled-tasks Lambda — Win-Back Query Fix & `TRIAL_ENDING` Dead Code Removal](#task-11-scheduled-tasks-lambda)
   - [Task 12: Portal UI — `cancellation_pending` & `expired` Status Display](#task-12-portal-ui)
   - [Task 13: SES Layer Rebuild & Lambda Redeployment](#task-13-ses-layer-rebuild--lambda-redeployment)
5. [Test Plan](#5-test-plan)
   - [Unit Tests](#unit-tests)
   - [Integration Tests](#integration-tests)
   - [E2E Validation Scenarios](#e2e-validation-scenarios)
6. [Deployment Sequence](#6-deployment-sequence)
7. [Acceptance Criteria](#7-acceptance-criteria)
8. [Files Changed Summary](#8-files-changed-summary)
9. [Open Items & Decisions](#9-open-items--decisions)

---

## 1. Overview & Scope

During E2E validation of the Stripe Customer Portal email flows, two bugs were discovered: (1) Cancel Subscription sends zero emails (regression from duplicate-email fix), and (2) Don't Cancel sends the wrong template (payment recovery copy instead of reversal confirmation). Investigation revealed four root causes: a permanent dedup guard that blocks repeatable lifecycle emails, overloaded event types (`SUBSCRIPTION_CANCELLED` and `SUBSCRIPTION_REACTIVATED` each serve two semantically different scenarios), a race condition between the webhook handler and the `customer-update` Lambda, and missing subscription statuses for intermediate lifecycle states.

This plan addresses all four root causes and establishes the event-driven architecture needed for post-launch email engagement campaigns. It covers 12 implementation tasks (Task 10 deferred — see §10), 4 new email templates, 4 new event types, 2 new subscription statuses, naming standardization, dead code removal, and portal UI updates.

**Source Report:** `docs/plg/20260228_CANCELLATION_EMAIL_REPORT_AND_PRE_LAUNCH_RECOMMENDATIONS.md`
**Tracker Location:** `docs/launch/20260218_LAUNCH_EXECUTION_TRACKER.md` — Phase 1, Stream 1D

**Scope Boundary:** This plan covers Individual account cancellation flows only. Organization (Business) member fan-out notification routing (Task 10, templates 8f/8g) is deferred to the "Must Do ASAP Post-Launch" list — see §10 for rationale and tracking.

---

## 2. Reference Architecture

### Email Pipeline Flow

```
Stripe Event
  → Webhook Handler (route.js) writes eventType + email on PROFILE record
  → DynamoDB Stream fires on MODIFY
  → StreamProcessor Lambda classifies by PK/SK prefix
  → SNS Topic (CUSTOMER, PAYMENT, or LICENSE)
  → SQS Queue
  → EmailSender Lambda reads eventType, selects template, sends via SES
  → EmailSender writes emailsSent.<eventType> = timestamp back to PROFILE (dedup guard)
```

### Subscription State Machine (Proposed)

```
                    checkout.session.completed
                              │
                              ▼
                         ┌─────────┐
                         │  active  │◄──────────────────────────────┐
                         └────┬─────┘                               │
                              │                                     │
              ┌───────────────┼───────────────┐                     │
              │               │               │                     │
    cancel requested    payment failed    dispute created           │
              │               │               │                     │
              ▼               ▼               ▼                     │
   ┌──────────────────┐  ┌──────────┐  ┌───────────┐               │
   │ cancellation_    │  │ past_due │  │ disputed  │               │
   │ pending          │  └────┬─────┘  └─────┬─────┘               │
   └───────┬──────────┘       │              │                     │
           │                  │         dispute closed              │
           │            3+ failures     (won/withdrawn)             │
    ┌──────┴──────┐           │              │                     │
    │             │           ▼              │                     │
 don't cancel  term ends  ┌───────────┐     │                     │
    │             │       │ suspended │     │                     │
    │             │       └─────┬─────┘     │                     │
    │             │             │            │                     │
    ▼             ▼             ▼            │                     │
  active       expired       expired        │              payment succeeds
  (CANCELLATION_ (VOLUNTARY_  (NONPAYMENT_  │              (SUBSCRIPTION_
   REVERSED)     CANCELLATION_ CANCELLATION) │               REACTIVATED)
                 EXPIRED)                    │                     │
                                             │                     │
                                        dispute lost               │
                                             │                     │
                                             ▼                     │
                                         suspended ────────────────┘
                                         (fraudulent)        (if cleared)
```

### Event-to-Template Mapping (Before → After)

| Event Type (Before) | Template (Before) | Event Type (After) | Template (After) |
|---|---|---|---|
| `SUBSCRIPTION_CANCELLED` (cancel request) | `cancellation` | `CANCELLATION_REQUESTED` | `cancellationRequested` (NEW) |
| `SUBSCRIPTION_CANCELLED` (term expires) | `cancellation` | `VOLUNTARY_CANCELLATION_EXPIRED` | `voluntaryCancellationExpired` (NEW) |
| `SUBSCRIPTION_CANCELLED` (nonpayment) | `cancellation` | `NONPAYMENT_CANCELLATION_EXPIRED` | `nonpaymentCancellationExpired` (NEW) |
| `SUBSCRIPTION_REACTIVATED` (don't cancel) | `reactivation` | `CANCELLATION_REVERSED` | `cancellationReversed` (NEW) |
| `SUBSCRIPTION_REACTIVATED` (payment recovery) | `reactivation` | `SUBSCRIPTION_REACTIVATED` (unchanged) | `reactivation` (unchanged) |
| `TRIAL_ENDING` | `trialEnding` | _(removed — dead code)_ | _(removed)_ |

---

## 3. Pre-Implementation Checklist

- [ ] Create feature branch: `feature/stream-1d-cancellation-emails`
- [ ] Run full test suite — record baseline count (currently ~1,483+ website tests + facade tests)
- [ ] Confirm no pending DynamoDB migrations or schema changes in flight
- [ ] Verify staging environment is stable and accessible
- [ ] Read this plan in full before beginning any implementation
- [ ] Confirm access to: `plg-website/` source, `dm/layers/ses/` source, `dm/tests/` test files

---

## 4. Implementation Tasks

### Task 1: Naming Standardization

#### 1a. `CANCELLED` → `CANCELED` (American single-L)

**Risk:** LOW — naming only, no logic changes
**Depends on:** Nothing (first task)

**File:** `plg-website/src/lib/constants.js`
- Line 125: `CANCELLED: "CANCELLED"` → `CANCELED: "CANCELED"`
- Line 137: `CANCELLED: { label: "Cancelled", variant: "error" }` → `CANCELED: { label: "Canceled", variant: "error" }`

**Ripple — test files and fixtures (update all references to `CANCELLED` → `CANCELED`):**
- `plg-website/__tests__/unit/lib/constants.test.js` — line 197: `LICENSE_STATUS.CANCELLED` → `LICENSE_STATUS.CANCELED`
- `plg-website/__tests__/fixtures/users.js` — `cancelledUser` variable name and all `cancelled` references in the fixture object (lines 63–79). Rename export to `canceledUser`.
- `plg-website/__tests__/fixtures/subscriptions.js` — `cancelled` export and all `cancelled` references (lines 161–197). Rename export to `canceled`.
- `plg-website/__tests__/fixtures/licenses.js` — line 86: `expiry_reason: "subscription_cancelled"` — leave as-is (this mirrors a Stripe-side value, not an HIC constant)
- `plg-website/__tests__/fixtures/index.js` — update re-exports: `cancelledUser` → `canceledUser`, `cancelled` → `canceled`
- `plg-website/__tests__/unit/api/team.test.js` — lines 217–222: update `cancelled` → `canceled` in test descriptions and fixture references
- `plg-website/__tests__/unit/api/billing.test.js` — line 130: update test description and fixture reference
- `plg-website/__tests__/unit/api/checkout.test.js` — lines 80, 220: `cancelled=true` in URL query params — leave as-is (user-facing URL parameter, not an HIC constant)
- `plg-website/__tests__/unit/api/invite.test.js` — lines 64, 112, 116–124, 192: `cancelled` in error messages and test descriptions — leave as-is (user-facing copy about invite status, not subscription status)
- `plg-website/__tests__/unit/api/delete-account.test.js` — line 131: `cancelled` in comment — update to `canceled`

**Note on user-facing copy:** `plg-website/src/app/portal/settings/page.js` line 585 says "Your subscription will be cancelled" — update to "Your subscription will be canceled" for consistency with American English standardization.

#### 1b. `paymentFailedCount` → `paymentFailureCount` (functional bug fix)

**Risk:** MEDIUM — fixes a functional bug where webhook and Lambda write different DynamoDB attribute names
**Depends on:** Nothing (can run parallel with 1a)

**The Bug:** `route.js` writes `paymentFailedCount` (line 636) but `customer-update/index.js` reads/writes `paymentFailureCount` (lines 365, 370, 419, 424). These are different DynamoDB attributes. The customer-update Lambda's threshold check `(customer.paymentFailureCount || 0)` always evaluates to `0` because the webhook wrote to a different attribute name.

**Fix:** Consolidate to `paymentFailureCount` (the name used more consistently in customer-update and its tests).

**File:** `plg-website/src/app/api/webhooks/stripe/route.js`
- Line 636: `paymentFailedCount: attempt_count` → `paymentFailureCount: attempt_count`

**Ripple — test files:**
- `plg-website/__tests__/unit/api/webhooks.test.js` — update any assertions referencing `paymentFailedCount` to `paymentFailureCount`
- `plg-website/__tests__/unit/lambda/customer-update.test.js` — lines 335, 377, 413, 448: already use `paymentFailureCount` (correct) — no changes needed

**DynamoDB note:** No migration needed. All existing records with `paymentFailedCount` belong to throwaway Yopmail test accounts. New records will use the correct `paymentFailureCount` attribute name.

---

### Task 2: Shared Constants

#### 2a. Extract `MAX_PAYMENT_FAILURES` to `constants.js`

**Risk:** LOW — extracting hardcoded value to shared constant
**Depends on:** Nothing

**Current state:**
- `customer-update/index.js` line 60: `const MAX_PAYMENT_FAILURES = 3;` (local constant)
- `route.js` line ~655: `if (attempt_count >= 3)` (hardcoded literal)

**Fix:**
1. Add to `plg-website/src/lib/constants.js`:
   ```javascript
   export const MAX_PAYMENT_FAILURES = 3;
   ```
2. In `route.js`: import `MAX_PAYMENT_FAILURES` from `@/lib/constants`, replace `attempt_count >= 3` with `attempt_count >= MAX_PAYMENT_FAILURES`
3. In `customer-update/index.js`: import `MAX_PAYMENT_FAILURES` from the constants layer (via `hic-base-layer` or direct import depending on Lambda bundling), remove local `const MAX_PAYMENT_FAILURES = 3;` at line 60

**Note:** The customer-update Lambda runs in AWS Lambda, not Next.js, so it cannot use `@/lib/constants` directly. The constant should be added to `constants.js` for the webhook handler, and the Lambda should either: (a) keep its own local constant with a comment referencing the canonical value in `constants.js`, or (b) import from a shared layer. Option (a) is simpler and lower-risk for launch; the implementing agent should use option (a) with a `// Canonical value: plg-website/src/lib/constants.js MAX_PAYMENT_FAILURES` comment.

#### 2b. Add `CANCELLATION_PENDING` to `LICENSE_STATUS` and `LICENSE_STATUS_DISPLAY`

**Risk:** LOW — additive only
**Depends on:** Nothing

**File:** `plg-website/src/lib/constants.js`

Add after `PAST_DUE` (line 125):
```javascript
  CANCELLATION_PENDING: "CANCELLATION_PENDING",
```

Add to `LICENSE_STATUS_DISPLAY` after `PAST_DUE` (line 137):
```javascript
  CANCELLATION_PENDING: { label: "Cancellation Pending", variant: "warning" },
```

**Effect:** The portal billing card on `/portal/page.js` uses `LICENSE_STATUS_DISPLAY[subscriptionStatus?.toUpperCase()]` — this will automatically display "Cancellation Pending" with a warning badge when `subscriptionStatus` is `cancellation_pending`. No portal code changes needed for this specific display.

---

### Task 3: `updateCustomerSubscription`

#### 3a. Add `clearEmailsSent` Array Parameter

**Risk:** MEDIUM — modifies core DynamoDB helper used by all webhook handlers
**Depends on:** Nothing

**File:** `plg-website/src/lib/dynamodb.js` — `updateCustomerSubscription` function (line 190)

**Current implementation:** Builds only `SET` expressions from all key-value pairs in the `updates` object. Does not support `REMOVE` expressions.

**Required change:** Accept an optional `clearEmailsSent` array parameter. When present, generate `REMOVE` expressions for each specified key in the `emailsSent` map. DynamoDB supports combining `SET` and `REMOVE` in a single `UpdateExpression`.

**Proposed signature:**
```javascript
async function updateCustomerSubscription(userId, updates, { clearEmailsSent = [] } = {}) {
```

**UpdateExpression construction:**
```javascript
// Build SET clause (existing logic)
const setExpressions = [...];

// Build REMOVE clause (new)
const removeExpressions = clearEmailsSent.map((key, i) => {
  expressionNames[`#clearKey${i}`] = key;
  return `#emailsSentMap.#clearKey${i}`;
});
if (removeExpressions.length > 0) {
  expressionNames["#emailsSentMap"] = "emailsSent";
}

const updateExpression = [
  `SET ${setExpressions.join(", ")}`,
  removeExpressions.length > 0 ? `REMOVE ${removeExpressions.join(", ")}` : "",
].filter(Boolean).join(" ");
```

**Security note:** The `clearEmailsSent` values come from hardcoded string literals in the webhook handler (e.g., `["CANCELLATION_REQUESTED"]`), not from user input. No injection risk.

#### 3b. Implement 1-Hour Cooldown Guard

**Risk:** LOW — additive guard logic
**Depends on:** Task 3a

**Cooldown window:** 1 hour (3600 seconds). Rationale: blocks rapid cancel/uncancel toggling within a single portal session while allowing legitimate lifecycle re-sends across billing cycles (e.g., cancel in the morning, reverse in the afternoon).

**Implementation:** Before clearing an `emailsSent` key, check the timestamp of the existing entry. If sent within the last 3600 seconds, skip the clear and do not write a new `eventType` — this prevents the email pipeline from firing.

**Location:** Inside `updateCustomerSubscription` (dynamodb.js), when processing the `clearEmailsSent` array. Before adding each key to the `REMOVE` expression, query the current `emailsSent` map value. If the timestamp is within the cooldown window, exclude that key from the `REMOVE` clause.

**Alternative (simpler):** Implement the cooldown check in the webhook handler itself, before calling `updateCustomerSubscription`. The handler already has `dbCustomer` loaded — it can check `dbCustomer.emailsSent?.CANCELLATION_REQUESTED` timestamp and skip the entire `eventType` + `clearEmailsSent` write if within cooldown. This avoids adding read-before-write complexity to the DynamoDB helper.

**Recommended approach:** Implement in the webhook handler (simpler, no extra DynamoDB read). The implementing agent should choose the approach that results in the cleanest code.

---

### Task 4: Webhook Handler — `handleSubscriptionUpdated`

#### 4a. `cancel_at_period_end: true` Path — New Event Type & Status

**Risk:** HIGH — core billing pipeline, most complex change
**Depends on:** Task 2b (CANCELLATION_PENDING status), Task 3a (clearEmailsSent)

**File:** `plg-website/src/app/api/webhooks/stripe/route.js` — `handleSubscriptionUpdated` function (line 409)

**Current code (cancel path, lines 448–454):**
```javascript
if (cancel_at_period_end) {
    // ... cancelAt formatting ...
    subscriptionUpdate.eventType = "SUBSCRIPTION_CANCELLED";
    subscriptionUpdate.email = dbCustomer.email;
    subscriptionUpdate.accessUntil = cancelAt;
}
```

**New code:**
```javascript
if (cancel_at_period_end) {
    // ... cancelAt formatting ...
    subscriptionUpdate.subscriptionStatus = "cancellation_pending";
    subscriptionUpdate.eventType = "CANCELLATION_REQUESTED";
    subscriptionUpdate.email = dbCustomer.email;
    subscriptionUpdate.accessUntil = cancelAt;
    // Clear reversal dedup so future reversals can send
    clearEmailsSent = ["CANCELLATION_REVERSED"];
}
```

**Key changes:**
1. `subscriptionStatus` overridden to `"cancellation_pending"` (instead of whatever `statusMap` resolved — typically `"active"`)
2. `eventType` changed from `"SUBSCRIPTION_CANCELLED"` to `"CANCELLATION_REQUESTED"`
3. `clearEmailsSent` array populated to clear any prior reversal dedup stamp

**Cooldown guard (per Task 3b):** Before writing `eventType`, check `dbCustomer.emailsSent?.CANCELLATION_REQUESTED` — if timestamp is within 3600 seconds, skip writing `eventType` and `clearEmailsSent` (the status update still proceeds).

#### 4b. `cancel_at_period_end: false` Path — New Event Type, Status Revert & Dedup Clear

**Risk:** HIGH — core billing pipeline
**Depends on:** Task 3a (clearEmailsSent)

**File:** `plg-website/src/app/api/webhooks/stripe/route.js` — `handleSubscriptionUpdated` function (line 409)

**Current code (uncancel path, lines 455–459):**
```javascript
} else if (!cancel_at_period_end && dbCustomer.cancelAtPeriodEnd) {
    subscriptionUpdate.eventType = "SUBSCRIPTION_REACTIVATED";
    subscriptionUpdate.email = dbCustomer.email;
}
```

**New code:**
```javascript
} else if (!cancel_at_period_end && dbCustomer.cancelAtPeriodEnd) {
    subscriptionUpdate.subscriptionStatus = "active";
    subscriptionUpdate.eventType = "CANCELLATION_REVERSED";
    subscriptionUpdate.email = dbCustomer.email;
    // Clear cancellation dedup so future cancellations can send
    clearEmailsSent = ["CANCELLATION_REQUESTED"];
}
```

**Key changes:**
1. `subscriptionStatus` explicitly set to `"active"` (reverts from `cancellation_pending`)
2. `eventType` changed from `"SUBSCRIPTION_REACTIVATED"` to `"CANCELLATION_REVERSED"`
3. `clearEmailsSent` clears `CANCELLATION_REQUESTED` so a future cancel triggers a fresh email

**Note:** `SUBSCRIPTION_REACTIVATED` remains valid and unchanged for the payment-recovery path in `handlePaymentSucceeded` (Task 6).

**Plumbing:** The `clearEmailsSent` array must be passed to `updateCustomerSubscription` as the third argument: `await updateCustomerSubscription(dbCustomer.userId, subscriptionUpdate, { clearEmailsSent });`

---

### Task 5: Webhook Handler — `handleSubscriptionDeleted`

#### 5a. Determine Expiration Event Type from Prior Status

**Risk:** HIGH — core billing pipeline
**Depends on:** Task 2b (expired status concept)

**File:** `plg-website/src/app/api/webhooks/stripe/route.js` — `handleSubscriptionDeleted` function (line 515)

**Current code (lines 537–541):**
```javascript
await updateCustomerSubscription(dbCustomer.userId, {
    subscriptionStatus: "canceled",
    eventType: "SUBSCRIPTION_CANCELLED",
    email: dbCustomer.email,
    accessUntil: cancelAt,
});
```

**New code:**
```javascript
// Determine expiration event type based on prior subscription status
const priorStatus = dbCustomer.subscriptionStatus;
let expirationEventType;
if (priorStatus === "cancellation_pending") {
    expirationEventType = "VOLUNTARY_CANCELLATION_EXPIRED";
} else if (priorStatus === "past_due" || priorStatus === "suspended") {
    expirationEventType = "NONPAYMENT_CANCELLATION_EXPIRED";
} else {
    // Fallback — treat as voluntary (safest default)
    expirationEventType = "VOLUNTARY_CANCELLATION_EXPIRED";
}

await updateCustomerSubscription(dbCustomer.userId, {
    subscriptionStatus: "expired",
    eventType: expirationEventType,
    email: dbCustomer.email,
    accessUntil: cancelAt,
    canceledAt: new Date().toISOString(),
});
```

**Key changes:**
1. Reads `dbCustomer.subscriptionStatus` to determine which expiration path
2. `subscriptionStatus` changed from `"canceled"` to `"expired"`
3. `eventType` split into `VOLUNTARY_CANCELLATION_EXPIRED` vs `NONPAYMENT_CANCELLATION_EXPIRED`
4. Added `canceledAt` timestamp (needed by win-back queries in Task 11)

#### 5b. Set `expired` Status

**Covered by 5a above.** The `subscriptionStatus: "expired"` change is included in the 5a code block. The Keygen license status update on the same function (line ~547) should also change from `"canceled"` to `"expired"`:

```javascript
// Before:
await updateLicenseStatus(dbCustomer.keygenLicenseId, "canceled");
// After:
await updateLicenseStatus(dbCustomer.keygenLicenseId, "expired");
```

#### 5c. `statusMap` — Remap `incomplete_expired` to `pending`

**Note:** The `statusMap` in `handleSubscriptionUpdated` (line 431) currently maps `incomplete_expired: "expired"`. This is correct and should remain unchanged — `incomplete_expired` is a Stripe status for checkout sessions that never completed, which is semantically different from subscription expiration. The `"expired"` mapping here is coincidentally correct.

However, the `statusMap` also maps `canceled: "canceled"`. This should be updated to `canceled: "expired"` to align with the new taxonomy — when Stripe reports a subscription as `canceled`, our system should reflect it as `expired`.

**Change in `statusMap` (line 431):**
```javascript
// Before:
canceled: "canceled",
// After:
canceled: "expired",
```

---

### Task 6: Webhook Handler — `handlePaymentSucceeded`

#### 6a. Expand Reactivation Trigger to Include `suspended` Status

**Risk:** MEDIUM — expands existing logic
**Depends on:** Nothing

**File:** `plg-website/src/app/api/webhooks/stripe/route.js` — `handlePaymentSucceeded` function (line 562)

**Current code (line 594):**
```javascript
if (dbCustomer.subscriptionStatus === "past_due") {
```

**New code:**
```javascript
if (dbCustomer.subscriptionStatus === "past_due" || dbCustomer.subscriptionStatus === "suspended") {
```

**Rationale:** A customer at 3+ payment failures has `subscriptionStatus: "suspended"`. When their payment eventually succeeds, they should receive the reactivation email and have their license reinstated. Currently only `past_due` triggers this path.

#### 6b. Clear `emailsSent.PAYMENT_FAILED` on Recovery

**Risk:** LOW — additive
**Depends on:** Task 3a (clearEmailsSent)

**File:** `plg-website/src/app/api/webhooks/stripe/route.js` — `handlePaymentSucceeded` function (line 562)

Inside the reactivation block (after the status check from 6a), pass `clearEmailsSent` to clear the payment failure dedup stamp:

```javascript
await updateCustomerSubscription(dbCustomer.userId, {
    subscriptionStatus: "active",
    eventType: "SUBSCRIPTION_REACTIVATED",
    email: dbCustomer.email,
}, { clearEmailsSent: ["PAYMENT_FAILED"] });
```

**Effect:** Clears `emailsSent.PAYMENT_FAILED` so that if the customer's payment fails again in a future billing cycle, they'll receive a fresh payment failure email.

---

### Task 7: customer-update Lambda

#### 7a. `handleSubscriptionUpdated` — Skip Redundant Write When Webhook Handled

**Risk:** MEDIUM — race condition fix
**Depends on:** Tasks 4, 5 (new event types must be defined first)

**File:** `plg-website/infrastructure/lambda/customer-update/index.js` — `handleSubscriptionUpdated` function (line 231)

**Current behavior:** Reads fields from the DynamoDB stream's `newImage` and writes them back to the same PROFILE record, potentially overwriting or racing with the webhook's write. Does not check whether the webhook already handled the event.

**Fix:** Add a guard at the top of the function — if `newImage` contains `eventType`, the webhook already handled this update. Skip the redundant `updateCustomerSubscription` call.

```javascript
// If the webhook handler already wrote eventType, it handled the full update.
// Skip our redundant write to avoid overwriting eventType or racing.
const eventType = getField(newImage, "eventType");
if (eventType) {
    log.info("webhook-handled", { eventType, reason: "skipping redundant customer-update write" });
    // Still update license status if needed (license updates are idempotent)
    // ... existing license status update logic ...
    return;
}
```

**Important:** The license status update block (lines 276–293) should still execute even when skipping the PROFILE write — license updates are idempotent and the customer-update Lambda may be the only path that updates Keygen license status for certain subscription state changes.

#### 7b. `handleSubscriptionDeleted` — Align Status & Event Type with New Taxonomy

**Risk:** MEDIUM — must align with Task 5 taxonomy
**Depends on:** Task 5 (new event types and statuses)

**File:** `plg-website/infrastructure/lambda/customer-update/index.js` — `handleSubscriptionDeleted` function (line 298)

**Changes:**
1. Line 322: `subscriptionStatus: "canceled"` → `subscriptionStatus: "expired"`
2. Lines 326–329: `eventType: "SUBSCRIPTION_CANCELLED"` in `updateLicenseStatus` call → determine from prior status (same logic as Task 5a)
3. Add the same webhook-handled guard as Task 7a — if `newImage` contains `eventType`, skip the redundant PROFILE write

**Note:** This Lambda reads from the DynamoDB stream, so it sees the record after the webhook handler has already written to it. The `subscriptionStatus` in `newImage` will already be `"expired"` (set by the webhook in Task 5). The guard from 7a should catch this and skip the redundant write.

---

### Task 8: Email Templates

#### 8a. Confirm `TRIAL_ENDING` Dead Code & Remove

**Risk:** LOW — dead code removal (confirmed)
**Depends on:** Nothing

**Status: CONFIRMED DEAD CODE.** Investigation verified the full chain:
- `handleTrialReminder` (scheduled-tasks/index.js line 154) queries for `subscriptionStatus: "trialing"` on PROFILE records
- The only write path for `"trialing"` is the `statusMap` in `handleSubscriptionUpdated` (route.js line 432), which only fires on Stripe `customer.subscription.updated` events
- Trial licenses are issued by installing the Mouse extension and managed through Keygen — no Stripe subscription is created for trial users
- No Stripe subscription = no `customer.subscription.updated` event = `"trialing"` is never written to a PROFILE record
- The `TRIAL_ENDING` entry in `EVENT_TYPE_TO_TEMPLATE` is also dead — it's never used by the event pipeline since `handleTrialReminder` calls `sendEmail` directly

**Files to modify:**
- `plg-website/infrastructure/lambda/scheduled-tasks/index.js`: remove `handleTrialReminder` function (lines 154–204), remove `"trial-reminder": handleTrialReminder` from `TASK_HANDLERS` map (line 471)
- `dm/layers/ses/src/email-templates.js`: remove `TRIAL_ENDING: "trialEnding"` from `EVENT_TYPE_TO_TEMPLATE` (line 820), remove `"trialEnding"` from `TEMPLATE_NAMES` array (line 797), remove the `trialEnding` template from `createTemplates` (line 229+)
- `plg-website/src/lib/ses.js`: remove `sendTrialEndingEmail` function (line 113)
- `dm/layers/ses/generate-email-preview.js`: remove `trialEnding` preview data and metadata entry

**Test files to modify:**
- `plg-website/__tests__/unit/lambda/scheduled-tasks.test.js`: remove entire `trial-reminder Job` describe block and the `detail-type: "trial-reminder"` extraction test
- `dm/tests/facade/unit/email-templates.test.js`: remove `TRIAL_ENDING` mapping test (line 161), `trialEnding` template test (line 408), `trialEnding` from TEMPLATE_NAMES assertion (line 101)
- `plg-website/__tests__/unit/lib/ses.test.js`: remove `sendTrialEndingEmail` tests and import

**Note:** Leave the read-side `"trialing"` checks in portal/status/route.js, license/check/route.js, portal/page.js, and customer-update/index.js — they're defensive and harmless, and `"trialing"` remains a valid Stripe status.

#### 8b. Add `cancellationRequested` Template

**Risk:** LOW — additive
**Depends on:** Nothing

**File:** `dm/layers/ses/src/email-templates.js` — add inside `createTemplates` function

**Trigger:** `CANCELLATION_REQUESTED`
**Tone:** Warm, slightly persuasive — best chance to retain the customer
**Parameters:** `{ email, accessUntil }`
**Key elements:**
- Acknowledge the cancellation
- Remind them Mouse remains fully active until `{accessUntil}`
- CTA: "Changed your mind? Reactivate anytime before your access expires" → link to `/portal/billing`
- Soft ask: "If something wasn't working right, we'd love to hear about it" → link to `billing@hic-ai.com`

See report §6 Template 1 for full copy direction.

#### 8c. Add `cancellationReversed` Template

**Risk:** LOW — additive
**Depends on:** Nothing

**Trigger:** `CANCELLATION_REVERSED`
**Tone:** Warm, celebratory but understated
**Parameters:** `{ email }`
**Key elements:**
- Confirm subscription continues as normal
- Explicitly state: no action needed, Mouse remains fully active
- No mention of reinstatement, restoration, or payment
- CTA: "Go to Portal" (low-key) → link to `/portal`

See report §6 Template 2 for full copy direction.

#### 8d. Add `voluntaryCancellationExpired` Template

**Risk:** LOW — additive
**Depends on:** Nothing

**Trigger:** `VOLUNTARY_CANCELLATION_EXPIRED`
**Tone:** Respectful, door-open
**Parameters:** `{ email }`
**Key elements:**
- Confirm subscription has ended
- License is now inactive
- Account and data preserved
- CTA: "Resubscribe anytime" → link to `/pricing`

See report §6 Template 3 for full copy direction.

#### 8e. Add `nonpaymentCancellationExpired` Template

**Risk:** LOW — additive
**Depends on:** Nothing

**Trigger:** `NONPAYMENT_CANCELLATION_EXPIRED`
**Tone:** Neutral, factual, helpful
**Parameters:** `{ email }`
**Key elements:**
- Confirm subscription ended due to unresolved payment issue
- License is now inactive
- No blame or judgment
- CTA: "Purchase a new license" → link to `/pricing`
- Mention: "If you believe this is an error, contact billing@hic-ai.com"

See report §6 Template 4 for full copy direction.

#### 8f. Add `orgCancellationRequested` Template

> **⚠️ DEFERRED TO POST-LAUNCH.** See §10 for rationale and tracking.

#### 8g. Add `orgCancellationExpired` Template

> **⚠️ DEFERRED TO POST-LAUNCH.** See §10 for rationale and tracking.

#### 8h. Update `EVENT_TYPE_TO_TEMPLATE` Mapping

**Risk:** LOW — additive mapping changes
**Depends on:** Tasks 8a–8e

**File:** `dm/layers/ses/src/email-templates.js`

**New `EVENT_TYPE_TO_TEMPLATE`:**
```javascript
export const EVENT_TYPE_TO_TEMPLATE = {
  LICENSE_CREATED: "licenseDelivery",
  LICENSE_REVOKED: "licenseRevoked",
  LICENSE_SUSPENDED: "licenseSuspended",
  CUSTOMER_CREATED: "welcome",
  CANCELLATION_REQUESTED: "cancellationRequested",
  CANCELLATION_REVERSED: "cancellationReversed",
  VOLUNTARY_CANCELLATION_EXPIRED: "voluntaryCancellationExpired",
  NONPAYMENT_CANCELLATION_EXPIRED: "nonpaymentCancellationExpired",
  SUBSCRIPTION_REACTIVATED: "reactivation",
  PAYMENT_FAILED: "paymentFailed",
  TEAM_INVITE_CREATED: "enterpriseInvite",
  TEAM_INVITE_RESENT: "enterpriseInvite",
};
```

**Removed:** `SUBSCRIPTION_CANCELLED`, `TRIAL_ENDING`
**Added:** `CANCELLATION_REQUESTED`, `CANCELLATION_REVERSED`, `VOLUNTARY_CANCELLATION_EXPIRED`, `NONPAYMENT_CANCELLATION_EXPIRED`

#### 8i. Update `TEMPLATE_NAMES` Array & Deprecate `SUBSCRIPTION_CANCELLED`

**Risk:** LOW — additive
**Depends on:** Tasks 8a–8e

**File:** `dm/layers/ses/src/email-templates.js`

**New `TEMPLATE_NAMES`:**
```javascript
export const TEMPLATE_NAMES = [
  "welcome",
  "licenseDelivery",
  "paymentFailed",
  "reactivation",
  "cancellationRequested",
  "cancellationReversed",
  "voluntaryCancellationExpired",
  "nonpaymentCancellationExpired",
  "licenseRevoked",
  "licenseSuspended",
  "winBack30",
  "winBack90",
  "enterpriseInvite",
  "disputeAlert",
];
```

**Removed:** `"trialEnding"`, `"cancellation"`
**Added:** `"cancellationRequested"`, `"cancellationReversed"`, `"voluntaryCancellationExpired"`, `"nonpaymentCancellationExpired"`

**Note:** The `cancellation` template itself can remain in `createTemplates` for backward compatibility but should be removed from the mapping and TEMPLATE_NAMES. If no code references it after the mapping removal, it can be deleted entirely.

---

### Task 9: email-sender Lambda

#### 9a. Rename `EMAIL_ACTIONS` to `EVENT_TYPE_TO_TEMPLATE`

**Risk:** LOW — one-line rename
**Depends on:** Nothing

**File:** `plg-website/infrastructure/lambda/email-sender/index.js` — line ~74

**Current:** `const EMAIL_ACTIONS = EVENT_TYPE_TO_TEMPLATE;`
**New:** Remove the alias entirely. Replace all references to `EMAIL_ACTIONS` with `EVENT_TYPE_TO_TEMPLATE` (there's only one usage at line ~74 and the reference in the handler loop).

Alternatively, if `EMAIL_ACTIONS` is used in multiple places within the file, a simple rename of the variable is sufficient.

#### 9b. Add Dedup Logging (Permanent vs. Lifecycle)

**Risk:** LOW — logging only, no behavior change
**Depends on:** Nothing

**File:** `plg-website/infrastructure/lambda/email-sender/index.js`

In Guard 2 (the `emailsSent` dedup check), enhance the log message to distinguish between permanent and lifecycle dedup:

```javascript
// Define one-time event types that should never be re-sent
const PERMANENT_DEDUP_EVENTS = ["CUSTOMER_CREATED", "LICENSE_CREATED"];

// In Guard 2:
if (emailsSentMap?.[eventType]) {
    const dedupType = PERMANENT_DEDUP_EVENTS.includes(eventType) ? "permanent" : "lifecycle";
    log.debug("already-sent", { eventType, dedupType });
    continue;
}
```

This aids debugging — when a lifecycle email is unexpectedly deduped, the log will show `dedupType: "lifecycle"` indicating the `emailsSent` key should have been cleared by a prior state transition.

---

### Task 10: email-sender Lambda — Org Fan-Out

> **⚠️ DEFERRED TO POST-LAUNCH.** This entire task (10a and 10b) is deferred to the "Must Do ASAP Post-Launch" list. See §10 for rationale and tracking.
>
> **Summary of deferred work:** When a Business account owner cancels their subscription, the email-sender Lambda should detect `accountType: "business"` on the customer record, query org members, and fan out org-variant templates (`orgCancellationRequested`, `orgCancellationExpired`) to each member. The same 4 cancellation lifecycle events drive both Individual and Business flows — no ORG-specific event types needed. The event describes what happened; the Lambda routes by who it happened to.
>
> **Why deferral is safe:** Org cancellation cannot mathematically occur until at least one billing cycle after launch (minimum ~30 days). The owner will still receive their Individual-variant cancellation emails correctly. The gap is that org members won't be notified — they'll discover the cancellation when their license expires.

#### 10a. Account Type Detection & Template Routing

#### 10b. Org Member Query & Fan-Out Logic

---

### Task 11: scheduled-tasks Lambda

#### 11a. Update Win-Back Queries from `canceled` to `expired`

**Risk:** LOW — query filter change
**Depends on:** Task 5 (expired status)

**File:** `plg-website/infrastructure/lambda/scheduled-tasks/index.js`

- `handleWinback30` (line 221): change `":status": "canceled"` to `":status": "expired"`
- `handleWinback90` (line 272): change `":status": "canceled"` to `":status": "expired"`

**Note:** Per SWR, all existing `canceled` records belong to throwaway test accounts. No transition-period dual-query needed.

#### 11b. Remove `handleTrialReminder` & `trial-reminder` Job Registration

**Risk:** LOW — dead code removal (confirmed in Task 8a)
**Depends on:** Task 8a (confirmation)

**File:** `plg-website/infrastructure/lambda/scheduled-tasks/index.js`

- Remove `handleTrialReminder` function (lines 154–204)
- Remove `"trial-reminder": handleTrialReminder` from `TASK_HANDLERS` map (line 471)

**Test file:** `plg-website/__tests__/unit/lambda/scheduled-tasks.test.js` — remove entire `trial-reminder Job` describe block and the `detail-type: "trial-reminder"` extraction test.

---

### Task 12: Portal UI

#### 12a. `portal/page.js` — Billing Card `cancellation_pending` Status Display

**Risk:** LOW — already works via Task 2b
**Depends on:** Task 2b (CANCELLATION_PENDING in LICENSE_STATUS_DISPLAY)

**File:** `plg-website/src/app/portal/page.js`

The billing card (line ~264) uses `LICENSE_STATUS_DISPLAY[subscriptionStatus?.toUpperCase()]`. Once `CANCELLATION_PENDING` is added to `LICENSE_STATUS_DISPLAY` in Task 2b, this will automatically display "Cancellation Pending" with a `warning` variant badge.

**Additional UX improvement:** Update the billing card status text (lines 337–341) to handle `cancellation_pending`:

```javascript
// Current:
subscriptionStatus === "active" || subscriptionStatus === "trialing"
  ? "Subscription active"
  : "No active subscription"

// New:
subscriptionStatus === "active" || subscriptionStatus === "trialing"
  ? "Subscription active"
  : subscriptionStatus === "cancellation_pending"
    ? "Cancellation pending"
    : "No active subscription"
```

#### 12b. `portal/billing/page.js` — Status Badge Mapping for New Statuses

**Risk:** LOW — additive mapping entries
**Depends on:** Nothing

**File:** `plg-website/src/app/portal/billing/page.js` — `SubscriptionStatusBadge` function (line 339)

Add to `variants` map:
```javascript
cancellation_pending: "warning",
expired: "secondary",
```

Add to `labels` map:
```javascript
cancellation_pending: "Cancellation Pending",
expired: "Expired",
```

**Note:** The existing `canceled: "secondary"` / `canceled: "Canceled"` entries can remain for backward compatibility but will no longer be written by new code paths.

---

### Task 13: SES Layer Rebuild & Lambda Redeployment

#### 13a. Rebuild `hic-ses-layer`

**Risk:** MEDIUM — layer rebuild affects all consuming Lambdas
**Depends on:** Task 8 (all template changes complete)

Rebuild the `hic-ses-layer` using the existing build process in `dm/build/`. The layer contains the updated `email-templates.js` with new templates, new `EVENT_TYPE_TO_TEMPLATE` mapping, and updated `TEMPLATE_NAMES`.

#### 13b. Publish New Layer Version

Publish the rebuilt layer as a new version in AWS Lambda. Record the new layer version ARN.

#### 13c. Update Lambda Layer References & Redeploy

Update the following Lambdas to reference the new `hic-ses-layer` version and redeploy:
- `email-sender` — consumes new event types and templates
- `scheduled-tasks` — `trialEnding` template removed, win-back queries updated

Also redeploy:
- `customer-update` — race condition fix (Task 7)

The webhook handler changes (Tasks 4–6) deploy automatically with the Next.js website via Amplify.

---

## 5. Test Plan

### Unit Tests

#### Tests for Task 1 — Naming Standardization

- Verify all instances of `CANCELLED` (double-L) are renamed to `CANCELED` (single-L) across constants, route.js, customer-update, email-templates, and email-sender
- Verify `SUBSCRIPTION_CANCELLED` event type references are updated to new taxonomy names
- Verify `paymentFailedCount` → `paymentFailureCount` rename in route.js (line ~636) and confirm customer-update reads the corrected attribute name
- Confirm no orphaned references to old names remain in any touched file

#### Tests for Task 3 — `updateCustomerSubscription` with `clearEmailsSent`

- Test `updateCustomerSubscription` with `clearEmailsSent: ['CANCELLATION_REQUESTED']` generates correct combined `SET` + `REMOVE` UpdateExpression
- Test `clearEmailsSent` with empty array produces no `REMOVE` clause
- Test `clearEmailsSent` with multiple keys generates `REMOVE emailsSent.#key1, emailsSent.#key2`
- Test cooldown guard: call with `emailsSent.CANCELLATION_REQUESTED` timestamp < 1 hour ago → skip clear, return unchanged
- Test cooldown guard: call with `emailsSent.CANCELLATION_REQUESTED` timestamp > 1 hour ago → clear succeeds
- Test cooldown guard: call with no prior `emailsSent` entry → clear succeeds (no timestamp to check)

#### Tests for Task 4 — `handleSubscriptionUpdated`

- Test `cancel_at_period_end: true` path writes `subscriptionStatus: "cancellation_pending"` and `eventType: "CANCELLATION_REQUESTED"`
- Test `cancel_at_period_end: true` path calls `clearEmailsSent: ['CANCELLATION_REVERSED']`
- Test `cancel_at_period_end: false` (uncancel) path writes `subscriptionStatus: "active"` and `eventType: "CANCELLATION_REVERSED"`
- Test uncancel path calls `clearEmailsSent: ['CANCELLATION_REQUESTED']`
- Test neither path fires when `cancel_at_period_end` unchanged (no-op guard)

#### Tests for Task 5 — `handleSubscriptionDeleted`

- Test prior status `cancellation_pending` → `eventType: "VOLUNTARY_CANCELLATION_EXPIRED"`
- Test prior status `past_due` → `eventType: "NONPAYMENT_CANCELLATION_EXPIRED"`
- Test prior status `suspended` → `eventType: "NONPAYMENT_CANCELLATION_EXPIRED"`
- Test fallback (unknown prior status) → `eventType: "VOLUNTARY_CANCELLATION_EXPIRED"`
- Test all paths write `subscriptionStatus: "expired"` (not `canceled`)
- Test `statusMap` remaps `incomplete_expired` to `pending` (not `expired`)

#### Tests for Task 6 — `handlePaymentSucceeded`

- Test reactivation triggers on `past_due` status (existing behavior, regression guard)
- Test reactivation triggers on `suspended` status (new behavior)
- Test reactivation does NOT trigger on `active` status
- Test `emailsSent.PAYMENT_FAILED` is cleared on successful recovery
- Test `emailsSent.PAYMENT_FAILED` clear respects cooldown guard

#### Tests for Task 7 — customer-update Lambda

- Test `handleSubscriptionUpdated` skips write when `newImage` contains `eventType` (webhook already handled)
- Test `handleSubscriptionUpdated` proceeds with write when `newImage` lacks `eventType` (legacy path)
- Test `handleSubscriptionDeleted` writes `subscriptionStatus: "expired"` (not `canceled`)
- Test `handleSubscriptionDeleted` determines correct event type from prior `subscriptionStatus`
- Test `handleSubscriptionDeleted` skips write when webhook already handled

#### Tests for Task 8 — Email Templates

- Test `TRIAL_ENDING` mapping and `trialEnding` template are removed
- Test 4 new templates (`cancellationRequested`, `cancellationReversed`, `voluntaryCancellationExpired`, `nonpaymentCancellationExpired`) exist with correct subject lines and body content
- Test `EVENT_TYPE_TO_TEMPLATE` maps all 4 new event types to correct templates
- Test `TEMPLATE_NAMES` array includes all new template names and excludes `trialEnding`
- Test `SUBSCRIPTION_CANCELLED` is removed from `EVENT_TYPE_TO_TEMPLATE`
- Test deferred templates 8f/8g (`orgCancellationRequested`, `orgCancellationExpired`) are NOT present (deferred to post-launch)

#### Tests for Task 9 — email-sender Lambda

- Test `EMAIL_ACTIONS` alias is renamed to `EVENT_TYPE_TO_TEMPLATE`
- Test dedup guard logs "permanent dedup" when `emailsSent` key exists and is not clearable
- Test dedup guard logs "lifecycle dedup" when `emailsSent` key exists but was recently cleared and re-sent
- Test all 4 new event types route to correct templates via the renamed mapping

#### Tests for Task 10 — Org Fan-Out

> **DEFERRED TO POST-LAUNCH.** Org fan-out logic (Tasks 10a/10b) cannot trigger for ~30 days post-launch. No unit tests required at this time. Track on "Must Do ASAP Post-Launch" list.

#### Tests for Task 11 — scheduled-tasks Lambda

- Test `handleWinback30` and `handleWinback90` query for `subscriptionStatus: "expired"` (not `canceled`)
- Test `handleTrialReminder` function is removed
- Test `trial-reminder` job registration is removed from the jobs array
- Test remaining scheduled jobs still register and execute correctly

#### Tests for Task 12 — Portal UI

- Test `LICENSE_STATUS_DISPLAY` includes `CANCELLATION_PENDING` with label "Cancellation Pending" and variant "warning"
- Test `LICENSE_STATUS_DISPLAY` includes `EXPIRED` with appropriate label and variant
- Test `SubscriptionStatusBadge` renders correctly for `cancellation_pending` and `expired` statuses
- Test billing card on `/portal` page displays `cancellation_pending` status when present

### Integration Tests

Integration tests validate the end-to-end data flow across component boundaries without hitting live AWS infrastructure.

- **Webhook → DynamoDB → Stream → customer-update:** Simulate a Stripe `customer.subscription.updated` event with `cancel_at_period_end: true`. Verify the webhook writes `cancellation_pending` + `CANCELLATION_REQUESTED` to DynamoDB, the stream triggers customer-update, and customer-update skips the redundant write (eventType present in newImage).
- **Webhook → DynamoDB → email-sender:** Simulate the same event and verify the EVENT record triggers the email-sender Lambda, which selects the `cancellationRequested` template and passes dedup guard (no prior `emailsSent.CANCELLATION_REQUESTED`).
- **Cooldown integration:** Simulate cancel → uncancel → cancel within 1 hour. Verify the second cancel's `clearEmailsSent` is blocked by the cooldown guard, and no duplicate email is sent.
- **Expiration chain:** Simulate `handleSubscriptionUpdated` (cancel) followed by `handleSubscriptionDeleted` (term end). Verify status transitions: `active` → `cancellation_pending` → `expired`, and event types: `CANCELLATION_REQUESTED` → `VOLUNTARY_CANCELLATION_EXPIRED`.
- **Payment recovery chain:** Simulate `past_due` → `handlePaymentSucceeded`. Verify status reverts to `active`, `emailsSent.PAYMENT_FAILED` is cleared, and `PAYMENT_RECOVERED` event is written.

### E2E Validation Scenarios

> **⚠️ IMPORTANT — Staging Limitations:** Several scenarios below (particularly C, D, E, F) require simulating the passage of time (billing period expiration, payment failure escalation). These may be impracticable or impossible to test manually in staging without Stripe test clocks or similar time-advancement mechanisms. For scenarios that cannot be validated end-to-end in staging:
>
> 1. **Implement carefully mocked automated tests** that simulate the time-dependent state transitions and verify the correct event types, status changes, and email triggers.
> 2. **Consider injectable system settings** — term duration, cooldown period, and payment retry intervals should be extractable as environment variables or feature flags that can be toggled to "test mode" with shortened durations where feasible.
> 3. **Accept that some scenarios may only be fully testable in production** after real billing cycles elapse. Document these as known gaps and plan for manual verification post-launch.
>
> The goal is to test what we can, mock what we must, and document what remains untestable until production.

#### Scenario A: Cancel Subscription → Receive Cancellation Email

**Trigger:** In Stripe Customer Portal (staging), click "Cancel plan" → confirm.
**Verify:**
1. DynamoDB PROFILE record: `subscriptionStatus: "cancellation_pending"`, `cancelAtPeriodEnd: true`
2. DynamoDB EVENT record: `eventType: "CANCELLATION_REQUESTED"`
3. Email received at customer email address with `cancellationRequested` template content
4. Portal billing page shows "Cancellation Pending" badge and "Access until [date]" message
5. Portal main page billing card reflects pending cancellation status

#### Scenario B: Don't Cancel → Receive Reversal Confirmation

**Trigger:** After Scenario A, return to Stripe Customer Portal and click "Don't cancel" (reverse cancellation).
**Verify:**
1. DynamoDB PROFILE record: `subscriptionStatus: "active"`, `cancelAtPeriodEnd: false`
2. DynamoDB EVENT record: `eventType: "CANCELLATION_REVERSED"`
3. `emailsSent.CANCELLATION_REQUESTED` cleared from PROFILE
4. Email received with `cancellationReversed` template content
5. Portal billing page shows "Active" badge, cancellation messaging removed

#### Scenario C: Term Expires After Voluntary Cancel → Receive Expiration Email

**Trigger:** After Scenario A (cancel confirmed), wait for billing period to end (or use Stripe test clock to advance past `cancel_at`).
**Verify:**
1. Stripe fires `customer.subscription.deleted` webhook
2. DynamoDB PROFILE record: `subscriptionStatus: "expired"`
3. DynamoDB EVENT record: `eventType: "VOLUNTARY_CANCELLATION_EXPIRED"`
4. Email received with `voluntaryCancellationExpired` template content
5. Portal shows "Expired" status, Mouse license deactivated

#### Scenario D: Nonpayment Expiration → Receive Nonpayment Notice

**Trigger:** Simulate payment failure leading to subscription deletion (use Stripe test card `4000000000000341` or test clock to advance through `past_due` → `canceled`).
**Verify:**
1. DynamoDB PROFILE record: `subscriptionStatus: "expired"`
2. DynamoDB EVENT record: `eventType: "NONPAYMENT_CANCELLATION_EXPIRED"`
3. Email received with `nonpaymentCancellationExpired` template content (different tone from voluntary)
4. Prior `PAYMENT_FAILED` emails were sent during the `past_due` phase

#### Scenario E: Payment Recovery from `past_due` → Receive Reactivation Email

**Trigger:** From a `past_due` subscription state, update payment method to a valid card and trigger successful payment.
**Verify:**
1. DynamoDB PROFILE record: `subscriptionStatus: "active"`
2. `emailsSent.PAYMENT_FAILED` cleared from PROFILE
3. Reactivation event written
4. Mouse license reactivated

#### Scenario F: Payment Recovery from `suspended` → Receive Reactivation Email

**Trigger:** From a `suspended` subscription state (if reachable in staging), update payment method and trigger successful payment.
**Verify:**
1. Same as Scenario E — reactivation triggers from `suspended` as well as `past_due`
2. DynamoDB PROFILE record: `subscriptionStatus: "active"`
3. `emailsSent.PAYMENT_FAILED` cleared

**Note:** If `suspended` is not directly reachable in Stripe test mode, verify via unit/integration tests and document as a known gap.

#### Scenario G: Business Account Cancel → Owner + All Members Notified

> **DEFERRED TO POST-LAUNCH.** Org fan-out logic is not implemented pre-launch. This scenario will be validated when Task 10 is completed. Track on "Must Do ASAP Post-Launch" list.
>
> **Expected behavior (post-implementation):** When a Business account Owner cancels, both the Owner and all Members receive org-variant email templates (`orgCancellationRequested`, `orgCancellationExpired`).

#### Scenario H: Dedup Guard — Second Cancel After Reversal Sends Fresh Email

**Trigger:** Cancel subscription (Scenario A) → reverse cancellation (Scenario B) → cancel again (after cooldown period expires, i.e., >1 hour later).
**Verify:**
1. First cancel: `CANCELLATION_REQUESTED` email sent, `emailsSent.CANCELLATION_REQUESTED` stamped
2. Reversal: `CANCELLATION_REVERSED` email sent, `emailsSent.CANCELLATION_REQUESTED` cleared
3. Second cancel: `CANCELLATION_REQUESTED` email sent again (fresh send, not deduped)
4. `emailsSent.CANCELLATION_REQUESTED` re-stamped with new timestamp

#### Scenario I: Cooldown Guard — Rapid Toggle Does Not Flood Email

**Trigger:** Cancel subscription → reverse → cancel again within <1 hour (rapid toggle).
**Verify:**
1. First cancel: email sent normally
2. Reversal: email sent normally
3. Second cancel within cooldown window: `clearEmailsSent` blocked by cooldown guard, `emailsSent.CANCELLATION_REQUESTED` NOT cleared, email-sender dedup guard blocks the duplicate → no email sent
4. CloudWatch logs show cooldown guard activation with timestamp comparison

---

## 6. Deployment Sequence

---

All changes deploy on a single feature branch (`feature/stream-1d-cancellation-emails`) merged to `development` then `main`.

**Phase 1 — Code Changes (local):**
1. Tasks 1–2: Naming standardization + shared constants (`constants.js`, `route.js`, `customer-update/index.js`, `email-templates.js`, `email-sender/index.js`)
2. Task 3: `updateCustomerSubscription` with `clearEmailsSent` + cooldown guard (`dynamodb.js`)
3. Tasks 4–6: Webhook handler updates (`route.js`)
4. Task 7: customer-update Lambda race condition fix (`customer-update/index.js`)
5. Task 8: Email templates — remove `TRIAL_ENDING`, add 4 new templates, update mappings (`email-templates.js`)
6. Task 9: email-sender Lambda — rename alias + dedup logging (`email-sender/index.js`)
7. Task 11: scheduled-tasks Lambda — win-back query update + dead code removal (`scheduled-tasks/index.js`)
8. Task 12: Portal UI — status badge + billing card updates (`portal/page.js`, `portal/billing/page.js`)

**Phase 2 — Unit & Integration Tests (local):**
9. Run all existing tests → fix any regressions
10. Write new tests per Section 5 → bring to 100%
11. Push to CI/CD → all tests pass

**Phase 3 — Infrastructure (AWS):**
12. Task 13a: Rebuild `hic-ses-layer` with updated `email-templates.js`
13. Task 13b: Publish new layer version
14. Task 13c: Update layer references on all consuming Lambdas:
    - `email-sender` (new templates + renamed alias)
    - `customer-update` (race condition fix — redeploy function code)
    - `scheduled-tasks` (win-back query + dead code removal — redeploy function code)
15. Deploy website changes (Amplify auto-deploys on push to `development`)

**Phase 4 — E2E Validation (manual, staging):**
16. Execute Scenarios A through F, H, I on `staging.hic-ai.com` (Scenario G deferred)
17. Verify CloudWatch logs for each Lambda invocation
18. Verify SES delivery logs for each email
19. Verify DynamoDB records match expected state after each scenario
20. Sign off → merge to `main` → production deploy

## 7. Acceptance Criteria

---

All of the following must be true before Stream 1D is considered complete:

1. ✅ **All existing tests pass** — zero regressions confirmed
2. ✅ **New unit tests pass at 100%** — expanded coverage, all passing
3. ✅ **Integration tests pass** — cross-component data flow validated
4. ✅ **E2E Scenarios A–F, H, I pass on staging** — emails delivered, correct templates, correct events; minor duplicate email bug (A.6) documented in Addendum
5. ✅ **Scenario G documented as deferred** — org fan-out tracked on post-launch list
6. ✅ **No hardcoded credentials** — all secrets via AWS Secrets Manager / SSM
7. ✅ **CloudWatch logs confirm** — correct event types, template selections, dedup/cooldown guard activations
8. ✅ **DynamoDB records match expected state** — `cancellation_pending`, `expired`, `active` transitions verified
9. ✅ **SES delivery confirmed** — all 4 new templates delivered successfully in staging (Gmail clean; Outlook caught by aggressive law firm spam policy, not an SES issue)
10. ✅ **Portal UI renders correctly** — `cancellation_pending` and `expired` statuses display with correct badges and messaging
11. ✅ **No orphaned references** — `CANCELLED` (double-L), `paymentFailedCount`, `SUBSCRIPTION_CANCELLED`, `TRIAL_ENDING` fully removed
12. ✅ **SWR sign-off** — approved Mar 1, 2026

## 8. Files Changed Summary

---

| File | Tasks | Changes |
|---|---|---|
| `plg-website/src/lib/constants.js` | 1a, 2a, 2b | Rename `CANCELLED` → `CANCELED`, extract `MAX_PAYMENT_FAILURES`, add `CANCELLATION_PENDING` to `LICENSE_STATUS` + `LICENSE_STATUS_DISPLAY` |
| `plg-website/src/lib/dynamodb.js` | 3a, 3b | Add `clearEmailsSent` parameter + `REMOVE` expression support, implement 1-hour cooldown guard |
| `plg-website/src/app/api/webhooks/stripe/route.js` | 1a, 1b, 2a, 4a, 4b, 5a, 5b, 5c, 6a, 6b | Naming fixes, constant references, cancel/uncancel paths, expiration logic, payment recovery expansion |
| `plg-website/infrastructure/lambda/customer-update/index.js` | 1a, 1b, 7a, 7b | Naming fixes, skip-if-webhook-handled guard, align `handleSubscriptionDeleted` with new taxonomy |
| `plg-website/infrastructure/lambda/email-sender/index.js` | 1a, 9a, 9b | Naming fix, rename `EMAIL_ACTIONS` → `EVENT_TYPE_TO_TEMPLATE`, add dedup logging |
| `plg-website/infrastructure/lambda/scheduled-tasks/index.js` | 11a, 11b | Update win-back queries to `expired`, remove `handleTrialReminder` + `trial-reminder` job |
| `dm/layers/ses/src/email-templates.js` | 1a, 8a, 8b, 8c, 8d, 8e, 8h, 8i | Naming fix, remove `TRIAL_ENDING`/`trialEnding`, add 4 new templates, update `EVENT_TYPE_TO_TEMPLATE` mapping, update `TEMPLATE_NAMES` |
| `plg-website/src/app/portal/page.js` | 12a | Billing card displays `cancellation_pending` status |
| `plg-website/src/app/portal/billing/page.js` | 12b | `SubscriptionStatusBadge` mapping for `cancellation_pending` and `expired` |

**Test Files (new or updated):**

| Test File | Covers |
|---|---|
| `plg-website/src/lib/tests/constants.test.js` | Tasks 1a, 2a, 2b |
| `plg-website/src/lib/tests/dynamodb.test.js` | Tasks 3a, 3b |
| `plg-website/src/app/api/webhooks/stripe/tests/route.test.js` | Tasks 1a, 1b, 4a, 4b, 5a, 5b, 5c, 6a, 6b |
| `plg-website/infrastructure/lambda/customer-update/tests/index.test.js` | Tasks 7a, 7b |
| `plg-website/infrastructure/lambda/email-sender/tests/index.test.js` | Tasks 9a, 9b |
| `plg-website/infrastructure/lambda/scheduled-tasks/tests/index.test.js` | Tasks 11a, 11b |
| `dm/layers/ses/src/tests/email-templates.test.js` | Tasks 8a–8i |
| `plg-website/src/app/portal/tests/page.test.js` | Task 12a |
| `plg-website/src/app/portal/billing/tests/page.test.js` | Task 12b |

**Infrastructure (no source file — operational):**

| Action | Task |
|---|---|
| Rebuild `hic-ses-layer` | 13a |
| Publish new layer version | 13b |
| Update layer refs + redeploy `email-sender`, `customer-update`, `scheduled-tasks` | 13c |

**Deferred (post-launch):**

| File | Tasks | Changes |
|---|---|---|
| `dm/layers/ses/src/email-templates.js` | 8f, 8g | Add `orgCancellationRequested` + `orgCancellationExpired` templates |
| `plg-website/infrastructure/lambda/email-sender/index.js` | 10a, 10b | Account type detection, org member query, fan-out logic |

## 9. Open Items & Decisions

---

### Deferred: Org Fan-Out (Tasks 8f, 8g, 10a, 10b)

**Status:** Deferred to post-launch — tracked on "Must Do ASAP Post-Launch" list.

**Rationale:** Org fan-out logic (notifying Business account Members when the Owner cancels) cannot mathematically trigger until ~30 days post-launch at the earliest. No Business accounts with multiple Members will exist on Day 1, and even the first Business subscriber would need to complete at least one billing cycle before cancellation scenarios become relevant.

**What's deferred:**
- Task 8f: `orgCancellationRequested` email template
- Task 8g: `orgCancellationExpired` email template
- Task 10a: Account type detection & template routing in email-sender Lambda
- Task 10b: Org member query & fan-out logic in email-sender Lambda
- E2E Scenario G: Business Account Cancel → Owner + All Members Notified

**Risk if not completed:** Business account Members would not receive cancellation/expiration emails when the Owner cancels. The Owner would still receive Individual-variant emails correctly. Members would eventually see `EXPIRED` status in their portal but without advance email notification.

**Tracking:** Add to `docs/launch/POST_LAUNCH_MUST_DO.md` (or equivalent) with HIGH priority.

### Decision Log

| Decision | Rationale | Decided By |
|---|---|---|
| Org fan-out deferred to post-launch | Cannot trigger for ~30 days; no Business multi-seat accounts on Day 1 | SWR |
| `TRIAL_ENDING` confirmed dead code — remove | No code path writes `subscriptionStatus: "trialing"` to PROFILE records; trial licenses are device-bound pre-authentication | SWR + agent investigation |
| 1-hour cooldown guard | Blocks rapid cancel/uncancel email flooding while allowing legitimate lifecycle re-sends across billing cycles | Agent recommendation, SWR deferred |
| `CANCELLED` → `CANCELED` (American English) | Naming consistency across codebase; American single-L is the project standard | SWR |
| No migration for existing `canceled` records | All existing records are Yopmail throwaway test accounts | SWR |
| No `SUBSCRIPTION_CANCELLED` backward compat | All EVENT records referencing old type belong to throwaway test accounts | SWR |

_Plan complete. Ready for SWR review and approval before handoff to Spec mode implementation._

---

## Addendum — Post-E2E Validation Findings

**Date:** March 1, 2026
**Author:** Kiro (AI Agent, supervised by SWR)
**Status:** Documented — Pending SWR Prioritization Decision
**Context:** Findings from E2E validation of Stream 1D deliverables. Four issues identified: one confirmed bug in the email pipeline, one confirmed bug in the portal routing (fixed during this session), and two portal display gaps not covered by Stream 1D requirements.

---

### A.1 Bug: Duplicate `CANCELLATION_REQUESTED` Email (Confirmed, Reproduced)

**Severity:** Medium — user-facing, but not data-corrupting.

**Symptom:** When a user cancels their subscription, they receive two copies of the "Cancellation Confirmed" email (`cancellationRequested` template) within seconds of each other.

**Root Cause:** The cooldown guard in `handleSubscriptionUpdated` (webhook handler) reads `dbCustomer.emailsSent?.CANCELLATION_REQUESTED` to determine whether to suppress the `eventType` write. This stamp is written by the email-sender Lambda *after* the email is sent — asynchronously, via the DynamoDB Stream → StreamProcessor → SNS → SQS → email-sender pipeline. That pipeline has non-trivial latency (seconds to tens of seconds).

Stripe routinely fires 2–3 `customer.subscription.updated` events in rapid succession for a single user action in the Customer Portal. Both (or all three) webhook invocations arrive and execute before the email-sender Lambda has had a chance to write the dedup stamp. Each invocation reads an empty `emailsSent.CANCELLATION_REQUESTED`, passes the cooldown check, writes `eventType: "CANCELLATION_REQUESTED"` to the PROFILE record, and triggers a separate email send.

The cooldown guard was designed to prevent re-sends across *separate user actions* (e.g., cancel → uncancel → cancel again within an hour). It does not protect against Stripe's duplicate event delivery for a *single* user action, because the dedup stamp it relies on does not exist yet at the time the duplicate webhooks arrive.

**What the cooldown guard does protect against:** A user who cancels, then reverses, then cancels again within 60 minutes. In that case the stamp from the first cancel is present and the guard fires correctly. This behavior is confirmed working.

**Proposed Fix:** Add an idempotency key check at the webhook handler level, before the cooldown guard. Stripe provides a unique `event.id` per event object. The fix is to write the Stripe `event.id` to a short-lived DynamoDB record (TTL ~5 minutes) as an atomic conditional write (`attribute_not_exists`) before processing. If the write fails (item already exists), the event is a duplicate and the handler returns 200 without processing. This is the standard Stripe idempotency pattern and eliminates the race entirely.

Alternatively, a simpler but less robust approach: write `eventType` to the PROFILE record using a DynamoDB conditional expression (`attribute_not_exists(eventType)`) so only the first writer wins. This is weaker because it relies on the `eventType` field being cleared between events, which is not guaranteed.

**Recommended approach:** Stripe event-level idempotency table (TTL-based). Scope is small — one new DynamoDB write per webhook invocation, one new table or GSI, no changes to the email pipeline.

**Files affected:** `plg-website/src/app/api/webhooks/stripe/route.js`, `plg-website/src/lib/dynamodb.js`, possibly `infrastructure/` for the new table or TTL configuration.

---

### A.2 Bug: Portal Shows "Activate Your Mouse License" for `cancellation_pending` Users (Fixed)

**Severity:** High — actively misleading UX for a user who just cancelled.

**Symptom:** After cancelling a subscription, the main `/portal` page displayed "Activate Your Mouse License" with a checkout CTA, as if the user had no subscription at all. The `/portal/billing` page correctly showed the cancellation state.

**Root Cause:** The status API (`/api/portal/status`) evaluated `hasActiveSubscription` as `["active", "trialing"].includes(subscriptionStatus)`. When a user cancels, the Stripe webhook writes `subscriptionStatus: "cancellation_pending"` to DynamoDB (not `"active"`). This value was not in the active set, so `hasSubscription: false` was returned. The portal page branched to `NewUserDashboard` on `hasSubscription === false`.

Additionally, the status API did not return `cancelAtPeriodEnd` or `accessUntil` from the DynamoDB record, so even if the routing had been correct, the portal had no data to display the expiry notice.

**Fix Applied (this session):**
1. `status/route.js`: Added `"cancellation_pending"` to the `hasActiveSubscription` array. Added `cancelAtPeriodEnd` and `accessUntil` to the response payload.
2. `portal/page.js`: Added `cancelAtPeriodEnd` and `accessUntil` to `ActiveUserDashboard` props. Added an amber "Access until {date}" notice below the billing card status text, matching the pattern already used on `/portal/billing`.

**Status:** Fixed and deployed to development branch.

---

### A.3 Gap: Portal Shows "Activate Your Mouse License" for `past_due` and `suspended` Users

**Severity:** Medium — misleading UX, but affects a small population (users who have missed multiple payments).

**Symptom:** A user whose subscription is `past_due` (payment failed, within retry window) or `suspended` (payment failed after `MAX_PAYMENT_FAILURES = 3` attempts, Keygen license suspended) sees `NewUserDashboard` with "Activate Your Mouse License" and a checkout CTA. This is wrong — they have an existing account and should be directed to update their payment method, not purchase a new license.

**Root Cause:** The status API includes `"past_due"` in `hasExpiredSubscription` (which returns `hasSubscription: false`). `"suspended"` is not in any of the three status sets (`hasActiveSubscription`, `hasExpiredSubscription`, or the implicit "none" bucket), so it also falls through to `hasSubscription: false`. Both states route to `NewUserDashboard`.

This was not a regression — Stream 1D Requirement 12 only specified portal display for `cancellation_pending` and `expired`. The `past_due` and `suspended` portal states were never specified.

**Proposed Fix:** Add a third dashboard branch: `PaymentIssueDashboard`. The status API should classify `past_due` and `suspended` as a distinct `"payment_issue"` status (separate from both `"active"` and `"expired"`). The portal page branches on this to show a targeted message: "There's an issue with your payment — please update your billing information to restore access," with a direct link to `/portal/billing`. The license card should show the appropriate `PAST_DUE` or `SUSPENDED` badge from `LICENSE_STATUS_DISPLAY` (both are already defined in `constants.js`).

**Files affected:** `plg-website/src/app/api/portal/status/route.js`, `plg-website/src/app/portal/page.js`.

**Deferral risk:** Low. `past_due` requires at least one failed payment attempt; `suspended` requires three. Neither will affect Day 1 users. However, once real paying customers exist, this becomes a support burden — a suspended user who sees "Activate Your License" may purchase a second subscription rather than updating their payment method.

---

### A.4 Gap: Portal Shows "Activate Your Mouse License" for `expired` Users

**Severity:** Low-Medium — the CTA is directionally correct (resubscribe) but the framing is wrong.

**Symptom:** A user whose subscription has fully expired (Stripe subscription deleted, `subscriptionStatus: "expired"` in DynamoDB) sees `NewUserDashboard` with "Activate Your Mouse License." The messaging is not wrong per se — they do need to purchase again — but it treats a returning customer identically to a brand-new user who has never subscribed, which is a missed opportunity and slightly jarring.

**Root Cause:** `"expired"` is in `hasExpiredSubscription`, which returns `hasSubscription: false`, routing to `NewUserDashboard`. Same structural issue as A.3.

**Proposed Fix:** The `PaymentIssueDashboard` branch proposed in A.3 can be extended, or a separate `ExpiredDashboard` branch added. The expired state warrants slightly different copy: "Your Mouse subscription has ended. Your account and data are preserved — resubscribe anytime to restore access," with a CTA to `/pricing`. This is warmer and more accurate than the new-user "Activate Your Mouse License" framing. The license card should show the `EXPIRED` badge (already defined in `LICENSE_STATUS_DISPLAY`).

**Files affected:** Same as A.3.

**Deferral risk:** Low for launch. Expired subscriptions require a full billing cycle to lapse. No users will be in this state on Day 1. Post-launch, this becomes relevant for churned users returning to the site.

---

### A.5 Gap: Suspended/Revoked Business Members See "Activate Your Mouse License"

**Severity:** High — actively misleading and potentially causes support tickets or accidental duplicate purchases.

**Symptom:** A Business tier member whose seat has been suspended or revoked by their org admin logs into the portal and sees `NewUserDashboard` with "Activate Your Mouse License" and a checkout CTA. They have no indication that their access was administratively removed.

**Root Cause:** `getUserOrgMembership` in `dynamodb.js` filters to `status === "active"` only:

```js
const membership = result.Items?.find((item) => item.status === "active");
```

A suspended or revoked member returns `null` from this query. The status API then finds no customer record and no org membership, concludes the user is a new user, and returns `hasSubscription: false, shouldRedirectToCheckout: true`. The portal renders `NewUserDashboard`.

This is a meaningful gap: the admin action (suspend/revoke) has no visible effect on the member's portal experience — they just silently lose access at the Keygen level while the portal tells them to buy a license.

**Proposed Fix:** Two-part:

1. `dynamodb.js` — `getUserOrgMembership` should return the membership record regardless of status (or a separate `getAnyOrgMembership` query should be added). The status field should be passed through to the caller.

2. `status/route.js` — After retrieving the org membership, check `orgMembership.status`. If `"suspended"` or `"revoked"`, return a distinct response: `hasSubscription: false, memberStatus: "suspended"` (or `"revoked"`), `shouldRedirectToCheckout: false`. Do not return `shouldRedirectToCheckout: true` for these users.

3. `portal/page.js` — Add a `SuspendedMemberDashboard` branch that renders a clear, non-alarming message: "Your access has been suspended by your organization administrator. Please contact your admin to restore access." No checkout CTA. Include the user's email and a link to support.

**Files affected:** `plg-website/src/lib/dynamodb.js`, `plg-website/src/app/api/portal/status/route.js`, `plg-website/src/app/portal/page.js`.

**Deferral risk:** Medium. This only affects Business tier accounts with multiple members, which cannot exist until at least one Business subscriber has added team members. However, the admin suspend/revoke feature is fully implemented and exposed in the Team Management UI — the moment a Business customer uses it, the affected member will see the wrong portal state. Given that the admin action is live, this gap should be closed before or shortly after launch.

---

### A.6 Bug: Duplicate `CANCELLATION_REQUESTED` Email Persists After Idempotency Guard

**Discovered:** E2E validation session, 2026-02-28 (second round, post-idempotency-guard deployment)

**Status:** Open — idempotency guard deployed but not resolving the duplicate.

**Symptom:** The user receives two copies of the "Cancellation Confirmed" email (subject: "We've received your cancellation request...") on every cancellation action. The portal UX is correct; only the email is duplicated.

**Root cause analysis:**

The idempotency guard (`claimWebhookIdempotencyKey`) operates at the Stripe `event.id` level. However, Stripe fires *two distinct events* for a single cancel-at-period-end action:

1. `customer.subscription.updated` with `cancel_at_period_end: true` — this is the primary event that writes `eventType: CANCELLATION_REQUESTED` to DynamoDB and triggers the email pipeline.
2. A second `customer.subscription.updated` event (different `event.id`) that Stripe fires as part of the same subscription state transition — possibly a metadata update, invoice preview, or internal Stripe reconciliation event — which also has `cancel_at_period_end: true` and therefore passes through `handleSubscriptionUpdated` and writes `eventType: CANCELLATION_REQUESTED` a second time.

Because each event has a unique `event.id`, the idempotency guard correctly allows both through. The guard is working as designed — the problem is upstream: Stripe is emitting two semantically equivalent events for one user action.

**Why the cooldown guard also fails here:**

The cooldown guard in `handleSubscriptionUpdated` checks `dbCustomer.emailsSent.CANCELLATION_REQUESTED`. This timestamp is written by the email-sender Lambda *after* it sends the email — asynchronously, via DynamoDB Streams → SNS → Lambda. The two Stripe events arrive within milliseconds of each other, both before the email-sender Lambda has had time to write the `emailsSent` stamp. So both events pass the cooldown check and both trigger the email pipeline.

**Proposed fix options:**

*Option A (recommended): Subscription-level idempotency guard.*
In `handleSubscriptionUpdated`, before writing `eventType`, check whether `dbCustomer.cancelAtPeriodEnd` is already `true` (i.e., the subscription is already in cancellation-pending state). If so, skip writing `eventType: CANCELLATION_REQUESTED` — the email has already been (or is being) sent. This is a pure in-handler state check with no async dependency.

```js
// In handleSubscriptionUpdated, inside the cancel_at_period_end branch:
if (cancel_at_period_end && dbCustomer.cancelAtPeriodEnd === true) {
  // Already in cancellation_pending — skip eventType to avoid duplicate email
  log.info("cancellation_already_pending", "Skipping CANCELLATION_REQUESTED — already pending");
  eventTypeToWrite = null;
}
```

*Option B: Synchronous emailsSent stamp.*
Write `emailsSent.CANCELLATION_REQUESTED` in the same `updateCustomerSubscription` call that writes `eventType`, so the cooldown guard has the timestamp available immediately. The email-sender Lambda would then need to be idempotent (skip sending if `emailsSent` already set). More invasive.

*Option C: Stripe webhook deduplication by subscription ID + event semantics.*
Maintain a short-TTL dedup table keyed on `SUBSCRIPTION#{subId}#CANCELLATION_REQUESTED` rather than `event.id`. Any second write within the TTL window is suppressed. More robust but more infrastructure.

**Recommended path:** Option A — it is the simplest, has no async dependency, and directly addresses the root cause (idempotent state transition). Implement and validate in the next E2E round.

**Files affected:** `plg-website/src/app/api/webhooks/stripe/route.js`

**Severity:** Medium. Affects every cancellation. Duplicate email is confusing but not harmful — no data corruption, no billing impact.

**Affects Day 1?** Yes — any subscriber who cancels will receive a duplicate email.

---

### A.7 Bug: Keygen Heartbeat 401 Errors — Licensed Heartbeats Rejected

**Discovered:** E2E validation session, 2026-02-28 (originally logged as "Premature EXPIRED Status — Suspected Keygen Webhook Disconnect")

**Status:** ✅ Resolved — Mar 1, 2026.

**Root cause (confirmed):** The `/api/license/heartbeat` route required a Cognito JWT (`verifyAuthToken`) for licensed heartbeats. The VS Code extension never receives or stores a JWT — the JWT only exists in the browser during the activation flow. Every subsequent heartbeat from the extension arrived with no Authorization header, causing the route to return 401. Keygen never received the `machine.heartbeat.ping` events, so machines appeared inactive and the Keygen event log showed no heartbeat activity.

A secondary pre-existing bug was also found: `getLicense(licenseKey)` was being called with a `MOUSE-XXXX` key string, but that function expects a Keygen UUID — it always returned null, meaning the license was never looked up in DynamoDB on the heartbeat path.

**Fix applied (Mar 1, 2026):**
- Removed `verifyAuthToken` from the licensed heartbeat path entirely. The extension already sends `licenseKey + fingerprint + machineId` on every heartbeat — these credentials are sufficient to validate the request without a JWT.
- Replaced `getLicense(licenseKey)` with `getLicenseByKey(licenseKey)` (GSI2 query by MOUSE-XXXX key string).
- `deviceUserId` is now resolved from the DynamoDB device record written during activation (via `getDeviceByFingerprint`), replacing the former JWT-derived `authedUserId`. Gracefully degrades to null if the device record is not found or the lookup throws.
- Added `machineId` as a required field for licensed heartbeats (400 if missing).
- Extension repo required zero changes.

**E2E verification (Mar 1, 2026):** After deploying the fix, `machine.created` fired 200 OK on license activation (same as before), and `machine.heartbeat.ping` also returned 200 OK on the next heartbeat — confirmed in Keygen event log. Bug squashed.

**Files changed:** `plg-website/src/app/api/license/heartbeat/route.js`
**Tests updated:** `plg-website/__tests__/unit/api/heartbeat-route.contract.test.js`, `plg-website/__tests__/unit/api/commit4-logging.contract.test.js`, `plg-website/__tests__/unit/api/heartbeat.test.js` (1,584 tests passing)

**Severity:** High (was). Active subscribers' machines were not being tracked in Keygen; device concurrency enforcement was effectively disabled.

**Affects Day 1?** Was yes — resolved before launch.

---

### A.8 Configuration Bug: Stripe Customer Portal Permits Tier Switching

**Discovered:** E2E validation session, 2026-02-28

**Status:** Partially resolved — deferred to Phase 3 Stream 3C (per SWR, Mar 1, 2026). "Customers can switch plans" toggle disabled in Stripe Dashboard as immediate mitigation, eliminating the Day 1 risk of cross-tier switching. Full fix (per-tier portal configurations with interval-only switching) deferred to Stream 3C where all SMP and portal finalization work is consolidated. See Tracker item 3.5.

**Symptom:** The "Update Subscription" option in the Stripe Customer Portal allows customers to switch between Individual and Business tiers (upgrade or downgrade). This is not a supported operation — tier changes require a separate checkout flow with seat configuration, org provisioning, and Cognito RBAC group assignment. Only billing interval switching (monthly ↔ annual) should be permitted via the portal's Update Subscription flow.

**Root cause:** The Stripe Customer Portal is configured to allow product/price switching across all prices in the product catalog, rather than being restricted to interval-only switches within the same product tier.

**Fix:** In the Stripe Dashboard → Customer Portal settings → Subscription updates:
- Set "Allow customers to switch plans" to restrict to interval changes only (monthly ↔ annual within the same tier).
- Disable cross-product switching (Individual ↔ Business).
- Alternatively, configure separate portal configurations per product tier if Stripe's UI does not support interval-only restriction natively — in that case, the portal link generation in `plg-website/src/app/api/portal/billing-portal/route.js` would need to pass the appropriate `configuration` ID based on the customer's current plan.

**Note:** Even if a customer successfully switches tier via the portal today, the downstream effects (org provisioning, seat limits, Cognito group assignment) would not fire correctly because those are handled in `handleCheckoutCompleted`, not `handleSubscriptionUpdated`. The result would be a billing tier mismatch with no corresponding infrastructure change — a silent data integrity issue.

**Files likely affected:** Stripe Dashboard configuration (no code change required for the simple fix); `plg-website/src/app/api/portal/billing-portal/route.js` if per-tier portal configurations are needed.

**Severity:** High. Allows customers to take an action that produces a broken account state with no recovery path short of manual intervention.

**Affects Day 1?** Yes — any subscriber who discovers the Update Subscription option could trigger this.

### A.9 Summary Table

| ID | Issue | Type | Severity | Affects Day 1? | Proposed Action |
|---|---|---|---|---|---|
| A.1 | Duplicate `CANCELLATION_REQUESTED` email | Bug | Medium | Yes — any cancellation | Superseded by A.6 (deeper analysis) |
| A.2 | `cancellation_pending` → "Activate License" | Bug | High | Yes — any cancellation | **Fixed this session** |
| A.3 | `past_due` / `suspended` → "Activate License" | Gap | Medium | No (requires failed payments) | Fix pre-launch recommended |
| A.4 | `expired` → "Activate License" | Gap | Low-Medium | No (requires full lapse) | Fix pre-launch or shortly after |
| A.5 | Suspended/revoked Business member → "Activate License" | Gap | High | No (requires Business + team members) | Fix before Business tier goes live |
| A.6 | Duplicate cancellation email persists (Stripe dual-event) | Bug | Medium | Yes — any cancellation | Fix: subscription-level state check (Option A) |
| A.7 | Keygen heartbeat 401 — licensed heartbeats rejected (JWT required, extension has no JWT) | Bug | High | Yes — all licensed users | ✅ Fixed (Mar 1): replaced JWT auth with license-credential validation on heartbeat path |
| A.8 | Stripe Portal permits Individual ↔ Business tier switching | Config Bug | High | Yes — any subscriber | ✅ Mitigated (Mar 1): "switch plans" toggle disabled. Full fix (per-tier configs) deferred to Phase 3 Stream 3C item 3.5 |

### Decision Log

| Decision | Rationale | Decided By |
|---|---|---|
| A.2 fixed immediately | Active bug affecting any cancellation during E2E validation | SWR + agent |
| A.1–A.5 documented as addendum (round 1) | Prioritization decision deferred to SWR | SWR |
| A.6–A.8 documented as addendum (round 2) | Further E2E findings after idempotency guard deployment | SWR + agent |
| A.8 mitigated — "switch plans" disabled; full fix deferred to Stream 3C | Stripe UI cannot restrict to interval-only switching natively; per-tier portal configs require API work best consolidated with SMP finalization | SWR (Mar 1) |
| A.7 resolved — JWT auth removed from licensed heartbeat path; license-credential validation implemented | Extension has no long-lived JWT; licenseKey + fingerprint + machineId are sufficient; user-device pairing already in DynamoDB from activation | SWR + agent (Mar 1) |
