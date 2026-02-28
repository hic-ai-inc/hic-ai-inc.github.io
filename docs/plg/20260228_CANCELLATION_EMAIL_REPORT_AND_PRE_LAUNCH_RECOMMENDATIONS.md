# Cancellation Email System — Bug Report & Pre-Launch Recommendations

**Date:** February 28, 2026
**Author:** Kiro (AI Agent, supervised by SWR)
**Status:** Draft — Pending SWR Review
**Scope:** Subscription lifecycle email system — final pass before Mouse launch

---

## Executive Summary

During E2E validation of the Stripe Customer Portal email flows, two bugs were discovered:

1. **Cancel Subscription** — zero emails sent (regression from earlier duplicate-email fix)
2. **Don't Cancel Subscription** — wrong email template (payment recovery copy sent instead of renewal confirmation)

Investigation revealed deeper architectural issues: overloaded event types, a permanent dedup guard that blocks repeatable lifecycle emails, a race condition between the webhook handler and the `customer-update` Lambda, and missing subscription statuses for intermediate lifecycle states. This report documents all findings and proposes a comprehensive fix that establishes the event-driven architecture needed for post-launch email engagement campaigns.

---

## Table of Contents

1. [Current Architecture](#1-current-architecture)
2. [Bugs Found](#2-bugs-found)
3. [Root Cause Analysis](#3-root-cause-analysis)
4. [Complete Subscription Lifecycle Analysis](#4-complete-subscription-lifecycle-analysis)
5. [Proposed Event Type & Status Taxonomy](#5-proposed-event-type--status-taxonomy)
6. [Proposed Email Template Changes](#6-proposed-email-template-changes)
7. [Implementation Plan](#7-implementation-plan)
8. [Files Requiring Changes](#8-files-requiring-changes)
9. [Open Questions](#9-open-questions)
10. [Post-Launch Roadmap Considerations](#10-post-launch-roadmap-considerations)

---

## 1. Current Architecture

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

### Stripe Events Handled (8)

| Stripe Event | Handler Function | Current eventType Written | Current subscriptionStatus Set |
|---|---|---|---|
| `checkout.session.completed` | `handleCheckoutCompleted` | `CUSTOMER_CREATED` (new customers) | `active` |
| `customer.subscription.created` | `handleSubscriptionCreated` | _(none — no-op)_ | _(none)_ |
| `customer.subscription.updated` | `handleSubscriptionUpdated` | `SUBSCRIPTION_CANCELLED` or `SUBSCRIPTION_REACTIVATED` | Mapped from Stripe status |
| `customer.subscription.deleted` | `handleSubscriptionDeleted` | `SUBSCRIPTION_CANCELLED` | `canceled` |
| `invoice.payment_succeeded` | `handlePaymentSucceeded` | `SUBSCRIPTION_REACTIVATED` (if was `past_due`) | `active` |
| `invoice.payment_failed` | `handlePaymentFailed` | `PAYMENT_FAILED` | `past_due` → `suspended` at 3 failures |
| `charge.dispute.created` | `handleDisputeCreated` | _(none — internal alert only)_ | `disputed` |
| `charge.dispute.closed` | `handleDisputeClosed` | _(none)_ | `active` or `suspended` |

### Current Event-to-Template Mapping

From `dm/layers/ses/src/email-templates.js`:

```javascript
export const EVENT_TYPE_TO_TEMPLATE = {
  LICENSE_CREATED: "licenseDelivery",
  LICENSE_REVOKED: "licenseRevoked",
  LICENSE_SUSPENDED: "licenseSuspended",
  CUSTOMER_CREATED: "welcome",
  SUBSCRIPTION_CANCELLED: "cancellation",
  SUBSCRIPTION_REACTIVATED: "reactivation",
  PAYMENT_FAILED: "paymentFailed",
  TRIAL_ENDING: "trialEnding",
  TEAM_INVITE_CREATED: "enterpriseInvite",
  TEAM_INVITE_RESENT: "enterpriseInvite",
};
```

### Current Subscription Statuses (in use)

From `route.js` statusMap and various handlers:

| Status | Source | Meaning |
|---|---|---|
| `active` | Stripe `active` | Subscription is current and paid |
| `trialing` | Stripe `trialing` | Free trial period |
| `past_due` | Stripe `past_due` / payment failure | Payment failed, grace period |
| `suspended` | 3+ payment failures or dispute lost | License suspended, Mouse degraded |
| `canceled` | Stripe `canceled` / `subscription.deleted` | Subscription terminated |
| `disputed` | `charge.dispute.created` | Chargeback in progress |
| `pending` | Stripe `incomplete` | Checkout not completed |
| `expired` | Stripe `incomplete_expired` | Checkout expired |
| `paused` | Stripe `paused` | Subscription paused |
| `none` | Portal status default | No subscription exists |

### Current License Statuses (from `constants.js`)

```javascript
export const LICENSE_STATUS = {
  PENDING_ACCOUNT: "PENDING_ACCOUNT",
  TRIAL: "TRIAL",
  ACTIVE: "ACTIVE",
  PAST_DUE: "PAST_DUE",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
  RETIRED: "RETIRED",     // Enterprise seat retired by admin
  DISPUTED: "DISPUTED",   // Chargeback dispute in progress
  REVOKED: "REVOKED",     // License revoked by admin
};
```

### Email Dedup Guard (EmailSender Lambda)

```javascript
// Guard 2: Check emailsSent map — if this eventType was already sent, skip
const emailsSentMap = newImage?.emailsSent?.M;
if (emailsSentMap?.[eventType]) {
  log.debug("already-sent", { eventType });
  continue;
}
```

After sending, the Lambda writes back:

```javascript
UpdateExpression: "SET ... #emailsSent.#eventType = :timestamp"
```

This creates a permanent, per-eventType dedup stamp on the customer's PROFILE record.

---

## 2. Bugs Found

### Bug 1: Cancel Subscription → Zero Emails (Regression)

**Steps to reproduce:**
1. Customer clicks "Cancel Subscription" in Stripe Customer Portal
2. Stripe fires `customer.subscription.updated` with `cancel_at_period_end: true`
3. Expected: Customer receives "Sorry to see you go" cancellation email
4. Actual: No email received

**Introduced by:** Commit `0c3aa73` ("Fix duplicate cancellation email and missing reactivation email in Stripe Customer Portal") — the fix removed the `EVENT#` record write from `customer-update/index.js` to prevent duplicates, but this exposed the underlying dedup guard issue.

### Bug 2: Don't Cancel Subscription → Wrong Email Template

**Steps to reproduce:**
1. Customer clicks "Cancel Subscription" in Stripe Customer Portal
2. Customer then clicks "Don't Cancel" (reverses pending cancellation)
3. Stripe fires `customer.subscription.updated` with `cancel_at_period_end: false`
4. Expected: Customer receives "Glad you're staying" confirmation
5. Actual: Customer receives "Payment Successful! Your license has been reinstated" — the `reactivation` template, which is written for payment recovery after suspension

---

## 3. Root Cause Analysis

### Root Cause 1: `emailsSent` Dedup Guard Is Permanent

The `emailsSent` map on the PROFILE record is write-once-per-key. Once `emailsSent.SUBSCRIPTION_CANCELLED` is stamped (from any prior test or real cancellation), every subsequent cancellation event for that customer is silently skipped forever.

This is correct behavior for one-time emails (welcome, license delivery) but fundamentally wrong for repeatable lifecycle events like cancellation, payment failure, and reactivation.

**Evidence:** The email-sender Lambda's Guard 2 checks:
```javascript
const emailsSentMap = newImage?.emailsSent?.M;
if (emailsSentMap?.[eventType]) {
  log.debug("already-sent", { eventType });
  continue;  // ← permanently blocked
}
```

There is no mechanism to clear entries from `emailsSent` when the customer's state changes.

### Root Cause 2: `SUBSCRIPTION_CANCELLED` Is Overloaded

The same event type is used for two semantically different scenarios:

| Scenario | Stripe Event | Current eventType | What Customer Expects |
|---|---|---|---|
| User clicks "Cancel" | `subscription.updated` (`cancel_at_period_end: true`) | `SUBSCRIPTION_CANCELLED` | "Sorry to see you go, you have access until [date]" |
| Subscription actually expires | `subscription.deleted` | `SUBSCRIPTION_CANCELLED` | "Your subscription has ended" |

Because both write the same `eventType`, the dedup guard blocks the second email after the first one fires. A customer who cancels mid-term will never receive the final "your subscription has ended" email when the term expires.

### Root Cause 3: `SUBSCRIPTION_REACTIVATED` Is Overloaded

Used for two semantically different scenarios:

| Scenario | Trigger | Current eventType | Correct Copy |
|---|---|---|---|
| Payment recovered after dunning | `invoice.payment_succeeded` (was `past_due`) | `SUBSCRIPTION_REACTIVATED` | "Payment successful, license reinstated" ✅ |
| User reverses pending cancellation | `subscription.updated` (`cancel_at_period_end: false`) | `SUBSCRIPTION_REACTIVATED` | "Glad you're staying, nothing changed" ❌ |

The `reactivation` template references license reinstatement and functionality restoration — completely inappropriate for a customer whose Mouse never stopped working.

### Root Cause 4: Race Condition Between Webhook and customer-update Lambda

The webhook handler (`route.js`) writes `eventType` on the PROFILE record. The DynamoDB stream fires, triggering the `customer-update` Lambda, which writes its own update to the same PROFILE record without preserving `eventType`. If the `customer-update` Lambda's write lands and triggers a second stream event, the email-sender may see a record without `eventType` and skip it.

The `customer-update` Lambda has a comment acknowledging this:
```javascript
// NOTE: Cancellation email is triggered by the webhook handler writing
// eventType on the customer profile update. Do NOT write a separate EVENT#
// record here — that causes duplicate emails. (Fixed 2026-02-28)
```

However, the Lambda still writes to the PROFILE (updating `subscriptionStatus`, `cancelAtPeriodEnd`, etc.), which can overwrite or race with the webhook's write.

---

## 4. Complete Subscription Lifecycle Analysis

### All Scenarios a Customer Can Experience

Below is every path a customer can take through the subscription lifecycle, what should happen at each step, and the current state of the system.

#### Scenario 1: Happy Path — New Customer

```
User → Checkout → checkout.session.completed
```

- **subscriptionStatus:** `active`
- **eventType:** `CUSTOMER_CREATED` (triggers welcome email), `LICENSE_CREATED` (triggers license delivery email)
- **Mouse state:** Fully functional
- **Current status:** ✅ Working correctly

#### Scenario 2: User Clicks "Cancel Subscription"

```
User → Stripe Portal → Cancel Subscription → customer.subscription.updated (cancel_at_period_end: true)
```

- **subscriptionStatus should be:** `cancellation_pending` (NEW — currently stays `active`)
- **eventType should be:** `CANCELLATION_REQUESTED` (NEW — currently `SUBSCRIPTION_CANCELLED`)
- **Mouse state:** Fully functional through end of term
- **Email:** "Sorry to see you go" with access-until date, CTA to reverse
- **Current status:** 🔴 BROKEN — no email sent due to dedup guard

#### Scenario 3: User Reverses Pending Cancellation ("Don't Cancel")

```
User → Stripe Portal → Don't Cancel → customer.subscription.updated (cancel_at_period_end: false)
```

- **subscriptionStatus should be:** `active` (reverts from `cancellation_pending`)
- **eventType should be:** `CANCELLATION_REVERSED` (NEW — currently `SUBSCRIPTION_REACTIVATED`)
- **Mouse state:** Fully functional (never changed)
- **Email:** "Glad you're staying" — no mention of reinstatement or restoration
- **Current status:** 🟡 Wrong template — sends payment recovery copy
- **Dedup clearing:** Must clear `CANCELLATION_REQUESTED` from `emailsSent` so a future cancel triggers a new email

#### Scenario 4: Subscription Expires at Period End (User Cancelled and Didn't Reverse)

```
Term ends → Stripe → customer.subscription.deleted
```

- **subscriptionStatus should be:** `expired` (NEW — currently `canceled`)
- **eventType should be:** `VOLUNTARY_CANCELLATION_EXPIRED` (NEW — currently `SUBSCRIPTION_CANCELLED`, blocked by dedup)
- **Mouse state:** License suspended, Mouse degraded
- **Email:** "Your Mouse subscription has ended" — different tone from the initial "sorry to see you go"
- **Current status:** 🔴 BROKEN — no email due to dedup collision with Scenario 2

#### Scenario 5: Payment Fails (Dunning)

```
Stripe → invoice.payment_failed
```

- **subscriptionStatus:** `past_due` (1-2 failures) → `suspended` (3+ failures)
- **eventType:** `PAYMENT_FAILED`
- **Mouse state:** Functional during `past_due`, degraded at `suspended`
- **Email:** "Payment failed" with retry date
- **Current status:** ✅ Working correctly
- **Dedup note:** Should be clearable — customer may have multiple payment failures across billing cycles

#### Scenario 6: Payment Recovers After Failure

```
Stripe → invoice.payment_succeeded (was past_due)
```

- **subscriptionStatus:** `active`
- **eventType:** `SUBSCRIPTION_REACTIVATED` (correct for this scenario)
- **Mouse state:** Fully functional (license reinstated)
- **Email:** "Payment successful, license reinstated" — correct template
- **Current status:** ✅ Working correctly
- **Dedup clearing:** Must clear `PAYMENT_FAILED` from `emailsSent`

#### Scenario 7: Subscription Expires Due to Nonpayment (Stripe Gives Up on Dunning)

```
Stripe exhausts retries → customer.subscription.deleted (after past_due/suspended)
```

- **subscriptionStatus should be:** `expired`
- **eventType should be:** `NONPAYMENT_CANCELLATION_EXPIRED` (NEW)
- **Mouse state:** License suspended, Mouse degraded
- **Email:** Neutral cancellation notice due to nonpayment, invite to purchase new license
- **Current status:** 🟡 Sends generic `SUBSCRIPTION_CANCELLED` cancellation template (if not dedup-blocked)

#### Scenario 8: Team Admin Suspends a Member

```
Admin → Portal → Suspend Member → writeEventRecord("LICENSE_SUSPENDED")
```

- **eventType:** `LICENSE_SUSPENDED`
- **Mouse state:** Degraded for that member
- **Email:** "Your license has been suspended" (existing `licenseSuspended` template)
- **Current status:** ✅ Working correctly

#### Scenario 9: Team Admin Removes a Member

```
Admin → Portal → Remove Member → writeEventRecord("LICENSE_REVOKED")
```

- **eventType:** `LICENSE_REVOKED`
- **Mouse state:** Inactive for that member
- **Email:** "Your license has been revoked" with option to buy Individual license (existing `licenseRevoked` template)
- **Current status:** ✅ Working correctly

#### Scenario 10: Organization Subscription Cancelled (Affects All Members)

```
Org owner cancels → customer.subscription.updated (cancel_at_period_end: true)
→ Eventually: customer.subscription.deleted
```

- **subscriptionStatus should be:** `cancellation_pending` → `expired`
- **eventType:** Same as Individual — `CANCELLATION_REQUESTED` → `VOLUNTARY_CANCELLATION_EXPIRED` (or `NONPAYMENT_CANCELLATION_EXPIRED`)
- **Mouse state:** Functional through end of term, then degraded for all members
- **Email to owner:** Same as Scenario 2/4 flow
- **Email to members:** The email-sender Lambda checks `accountType` on the customer record. For `business` accounts, it fans out org-variant templates to all members (e.g., "Your organization's Mouse subscription is ending"). No separate ORG-specific event types needed — the event describes what happened; the Lambda routes by who it happened to.
- **Current status:** 🔴 NOT IMPLEMENTED — org cancellation currently only affects the owner's record; members are not notified

#### Scenario 11: Dispute (Chargeback)

```
Stripe → charge.dispute.created → charge.dispute.closed
```

- **subscriptionStatus:** `disputed` → `active` (won) or `suspended` (lost)
- **eventType:** Internal `disputeAlert` only (no customer-facing email)
- **Mouse state:** Suspended immediately on dispute, reinstated if won
- **Current status:** ✅ Working correctly

#### Scenario 12: Trial Ending

```
Scheduled task → 3 days before trial expires
```

- **eventType:** `TRIAL_ENDING`
- **Email:** "Your trial is ending soon"
- **Current status:** ✅ Working correctly (uses `wasEmailSent` guard in scheduled-tasks Lambda)

#### Scenario 13: Win-Back Emails (30 and 90 Days Post-Cancellation)

```
Scheduled task → 30/90 days after canceledAt
```

- **eventType:** N/A (sent directly by scheduled-tasks Lambda)
- **Email:** Win-back with increasing urgency/discount
- **Current status:** ✅ Working correctly (uses `wasEmailSent` guard)
- **Note:** These query for `subscriptionStatus: "canceled"` — will need updating to query `expired` instead

---

## 5. Proposed Event Type & Status Taxonomy

### New Subscription Statuses

Add to the existing status space:

| Status | Meaning | Mouse State | Replaces |
|---|---|---|---|
| `cancellation_pending` | User requested cancellation; subscription active through end of term | Fully functional | _(new)_ |
| `expired` | Subscription has ended (any reason) | License inactive | `canceled` (in most contexts) |

**Note:** `canceled` remains valid as a Stripe-mapped status but should only be used as a transient internal state. The customer-facing status should be `expired` once the subscription actually ends.

### New Event Types

| Event Type | Trigger | Template | Scenario |
|---|---|---|---|
| `CANCELLATION_REQUESTED` | `subscription.updated` with `cancel_at_period_end: true` | `cancellationRequested` (NEW) | User clicks "Cancel" |
| `CANCELLATION_REVERSED` | `subscription.updated` with `cancel_at_period_end: false` (was `true`) | `cancellationReversed` (NEW) | User clicks "Don't Cancel" |
| `VOLUNTARY_CANCELLATION_EXPIRED` | `subscription.deleted` when previous status was `cancellation_pending` | `voluntaryCancellationExpired` (NEW) | Term ends after user-initiated cancel |
| `NONPAYMENT_CANCELLATION_EXPIRED` | `subscription.deleted` when previous status was `past_due` or `suspended` | `nonpaymentCancellationExpired` (NEW) | Stripe gives up on dunning |

### Retired Event Types

| Old Event Type | Replaced By | Reason |
|---|---|---|
| `SUBSCRIPTION_CANCELLED` | Split into `CANCELLATION_REQUESTED`, `VOLUNTARY_CANCELLATION_EXPIRED`, `NONPAYMENT_CANCELLATION_EXPIRED` | Overloaded — same event for 3 different scenarios |
| `SUBSCRIPTION_REACTIVATED` (for "Don't Cancel" path only) | `CANCELLATION_REVERSED` | Wrong semantics — reactivation implies recovery from degradation |

**Note:** `SUBSCRIPTION_REACTIVATED` remains valid for the payment-recovery scenario (Scenario 6).

### Complete Event-to-Template Mapping (Proposed)

```javascript
export const EVENT_TYPE_TO_TEMPLATE = {
  // Onboarding
  CUSTOMER_CREATED: "welcome",
  LICENSE_CREATED: "licenseDelivery",

  // Cancellation lifecycle
  CANCELLATION_REQUESTED: "cancellationRequested",           // NEW
  CANCELLATION_REVERSED: "cancellationReversed",             // NEW
  VOLUNTARY_CANCELLATION_EXPIRED: "voluntaryCancellationExpired", // NEW
  NONPAYMENT_CANCELLATION_EXPIRED: "nonpaymentCancellationExpired", // NEW

  // Payment lifecycle
  SUBSCRIPTION_REACTIVATED: "reactivation",                  // UNCHANGED (payment recovery only)
  PAYMENT_FAILED: "paymentFailed",                           // UNCHANGED

  // License management
  LICENSE_REVOKED: "licenseRevoked",                         // UNCHANGED
  LICENSE_SUSPENDED: "licenseSuspended",                     // UNCHANGED

  // Trial
  TRIAL_ENDING: "trialEnding",                               // UNCHANGED

  // Team
  TEAM_INVITE_CREATED: "enterpriseInvite",                   // UNCHANGED
  TEAM_INVITE_RESENT: "enterpriseInvite",                    // UNCHANGED

  // DEPRECATED — remove after migration
  // SUBSCRIPTION_CANCELLED: "cancellation",
};
```

### emailsSent Dedup Strategy

Classify event types into two categories:

**One-time events** (permanent dedup — never clear):
- `CUSTOMER_CREATED`
- `LICENSE_CREATED`

**Repeatable lifecycle events** (clear on state transition):
- `CANCELLATION_REQUESTED` → clear when `cancelAtPeriodEnd` flips to `false`
- `CANCELLATION_REVERSED` → clear when `cancelAtPeriodEnd` flips to `true`
- `PAYMENT_FAILED` → clear when payment succeeds
- `SUBSCRIPTION_REACTIVATED` → clear when payment fails again
- `VOLUNTARY_CANCELLATION_EXPIRED` → clear on re-subscription (checkout)
- `NONPAYMENT_CANCELLATION_EXPIRED` → clear on re-subscription (checkout)

**Implementation:** The webhook handler should clear the relevant `emailsSent` keys when writing the new state. For example, when writing `CANCELLATION_REVERSED`, also clear `emailsSent.CANCELLATION_REQUESTED`:

```javascript
// In handleSubscriptionUpdated, when cancel_at_period_end flips to false:
subscriptionUpdate.eventType = "CANCELLATION_REVERSED";
// Clear the previous cancellation dedup stamp so future cancellations can send
subscriptionUpdate.clearEmailsSent = ["CANCELLATION_REQUESTED"];
```

The `updateCustomerSubscription` helper would need to support a `clearEmailsSent` array that uses `REMOVE` expressions on the `emailsSent` map keys.

---

## 6. Proposed Email Template Changes

### New Templates (6)

**Note on org-variant templates:** The `orgCancellationRequested` and `orgCancellationExpired` templates listed below (templates 5 and 6) are not triggered by separate event types. They are selected by the email-sender Lambda when it detects `accountType: "business"` on the customer record. The same 4 cancellation lifecycle events (`CANCELLATION_REQUESTED`, `CANCELLATION_REVERSED`, `VOLUNTARY_CANCELLATION_EXPIRED`, `NONPAYMENT_CANCELLATION_EXPIRED`) apply to both Individual and Business accounts. The Lambda routes to the appropriate template variant based on account type and fans out notifications to org members for Business accounts.

#### 1. `cancellationRequested` — "Sorry to See You Go"

**Trigger:** `CANCELLATION_REQUESTED`
**Tone:** Warm, slightly persuasive — this is our best chance to retain the customer
**Key elements:**
- Acknowledge the cancellation
- Remind them Mouse remains fully active until `{accessUntil}`
- CTA: "Changed your mind? Reactivate anytime before your access expires"
- Link to portal/billing
- Soft ask: "If something wasn't working right, we'd love to hear about it"

**Parameters:** `{ email, accessUntil }`

#### 2. `cancellationReversed` — "You're Staying!"

**Trigger:** `CANCELLATION_REVERSED`
**Tone:** Warm, celebratory but understated — no over-the-top excitement
**Key elements:**
- Confirm subscription continues as normal
- Explicitly state: no action needed, Mouse remains fully active
- No mention of reinstatement, restoration, or payment
- CTA: "Go to Portal" (low-key)

**Parameters:** `{ email }`

#### 3. `voluntaryCancellationExpired` — "Your Subscription Has Ended"

**Trigger:** `VOLUNTARY_CANCELLATION_EXPIRED`
**Tone:** Respectful, door-open — this customer chose to leave
**Key elements:**
- Confirm subscription has ended
- License is now inactive
- Account and data preserved
- CTA: "Resubscribe anytime" with link to pricing
- Post-launch: This is where promo codes and win-back offers will go

**Parameters:** `{ email }`

#### 4. `nonpaymentCancellationExpired` — "Subscription Ended Due to Payment Issue"

**Trigger:** `NONPAYMENT_CANCELLATION_EXPIRED`
**Tone:** Neutral, factual, helpful — these customers likely want Mouse but had payment issues
**Key elements:**
- Confirm subscription has ended due to unresolved payment issue
- License is now inactive
- No blame or judgment
- CTA: "Purchase a new license" with link to pricing
- Mention: "If you believe this is an error, contact billing@hic-ai.com"

**Parameters:** `{ email }`

#### 5. `orgCancellationRequested` — "Your Organization's Subscription Is Ending"

**Trigger:** `CANCELLATION_REQUESTED` or `NONPAYMENT_CANCELLATION_EXPIRED` (when `accountType: "business"` — selected by email-sender Lambda routing, not by event type)
**Tone:** Informational — member didn't make this decision
**Key elements:**
- Inform member their organization's Mouse subscription is ending on `{accessUntil}`
- Mouse remains fully active until then
- Suggest contacting their administrator for details
- CTA: "Want to keep using Mouse? Get an Individual license" with link to pricing

**Parameters:** `{ email, accessUntil, organizationName }`

#### 6. `orgCancellationExpired` — "Your Organization's Subscription Has Ended"

**Trigger:** `VOLUNTARY_CANCELLATION_EXPIRED` or `NONPAYMENT_CANCELLATION_EXPIRED` (when `accountType: "business"` — selected by email-sender Lambda routing, not by event type)
**Tone:** Informational, helpful
**Key elements:**
- Confirm organization subscription has ended
- License is now inactive
- Contact administrator or purchase Individual license
- CTA: "Get Individual License" with link to pricing

**Parameters:** `{ email, organizationName }`

### Modified Templates (1)

#### `reactivation` — Scope Narrowing

The existing `reactivation` template is correct for payment recovery (Scenario 6) and should remain unchanged. It should no longer be used for the "Don't Cancel" flow — that's now handled by `cancellationReversed`.

### Template Summary

| # | Template Name | Event Type | Status |
|---|---|---|---|
| 1 | `welcome` | `CUSTOMER_CREATED` | Existing ✅ |
| 2 | `licenseDelivery` | `LICENSE_CREATED` | Existing ✅ |
| 3 | `paymentFailed` | `PAYMENT_FAILED` | Existing ✅ |
| 4 | `trialEnding` | `TRIAL_ENDING` | Existing ✅ |
| 5 | `reactivation` | `SUBSCRIPTION_REACTIVATED` | Existing ✅ (scope narrowed) |
| 6 | `cancellation` | _(deprecated)_ | Remove from mapping |
| 7 | `licenseRevoked` | `LICENSE_REVOKED` | Existing ✅ |
| 8 | `licenseSuspended` | `LICENSE_SUSPENDED` | Existing ✅ |
| 9 | `winBack30` | _(scheduled)_ | Existing ✅ |
| 10 | `winBack90` | _(scheduled)_ | Existing ✅ |
| 11 | `enterpriseInvite` | `TEAM_INVITE_CREATED/RESENT` | Existing ✅ |
| 12 | `disputeAlert` | _(internal)_ | Existing ✅ |
| 13 | `cancellationRequested` | `CANCELLATION_REQUESTED` | **NEW** |
| 14 | `cancellationReversed` | `CANCELLATION_REVERSED` | **NEW** |
| 15 | `voluntaryCancellationExpired` | `VOLUNTARY_CANCELLATION_EXPIRED` | **NEW** |
| 16 | `nonpaymentCancellationExpired` | `NONPAYMENT_CANCELLATION_EXPIRED` | **NEW** |
| 17 | `orgCancellationRequested` | _(routed by Lambda for business accounts)_ | **NEW** |
| 18 | `orgCancellationExpired` | _(routed by Lambda for business accounts)_ | **NEW** |

---

## 7. Implementation Plan

### Phase 1: Core Fixes (Pre-Launch — Required)

These changes fix the two reported bugs and establish the event architecture for all cancellation scenarios.

#### Step 1: Add new subscription statuses

**File:** `plg-website/src/lib/constants.js`

- Add `CANCELLATION_PENDING` to `LICENSE_STATUS` and `LICENSE_STATUS_DISPLAY`
- Verify `EXPIRED` already exists (it does)

#### Step 2: Update webhook handler — `handleSubscriptionUpdated`

**File:** `plg-website/src/app/api/webhooks/stripe/route.js`

- When `cancel_at_period_end: true`:
  - Set `subscriptionStatus: "cancellation_pending"` (not `active`)
  - Set `eventType: "CANCELLATION_REQUESTED"` (not `SUBSCRIPTION_CANCELLED`)
  - Clear `emailsSent.CANCELLATION_REVERSED` (if present)
- When `cancel_at_period_end: false` and `dbCustomer.cancelAtPeriodEnd`:
  - Set `subscriptionStatus: "active"`
  - Set `eventType: "CANCELLATION_REVERSED"` (not `SUBSCRIPTION_REACTIVATED`)
  - Clear `emailsSent.CANCELLATION_REQUESTED` (so future cancellations can send)

#### Step 3: Update webhook handler — `handleSubscriptionDeleted`

**File:** `plg-website/src/app/api/webhooks/stripe/route.js`

- Check `dbCustomer.subscriptionStatus` to determine which expiration event type to use:
  - If `cancellation_pending` → `eventType: "VOLUNTARY_CANCELLATION_EXPIRED"`
  - If `past_due` or `suspended` → `eventType: "NONPAYMENT_CANCELLATION_EXPIRED"`
  - Default fallback → `eventType: "VOLUNTARY_CANCELLATION_EXPIRED"`
- Set `subscriptionStatus: "expired"` (not `canceled`)
- For business accounts: the email-sender Lambda handles org member fan-out based on `accountType` (no separate event records needed)

#### Step 4: Update webhook handler — `handlePaymentSucceeded`

**File:** `plg-website/src/app/api/webhooks/stripe/route.js`

- When clearing `past_due` status, also clear `emailsSent.PAYMENT_FAILED`

#### Step 5: Add `clearEmailsSent` support to `updateCustomerSubscription`

**File:** `plg-website/src/app/api/webhooks/stripe/route.js` (or shared helper)

- Extend the DynamoDB `UpdateExpression` to support `REMOVE emailsSent.KEY` for specified keys
- This enables the dedup clearing described in Section 5

#### Step 6: Add 6 new email templates

**File:** `dm/layers/ses/src/email-templates.js`

- Add `cancellationRequested`, `cancellationReversed`, `voluntaryCancellationExpired`, `nonpaymentCancellationExpired`, `orgCancellationRequested`, `orgCancellationExpired`
- Update `EVENT_TYPE_TO_TEMPLATE` mapping
- Update `TEMPLATE_NAMES` array
- Deprecate `SUBSCRIPTION_CANCELLED` mapping (keep `cancellation` template for backward compat but remove from mapping)

#### Step 7: Update email-sender Lambda Guard 2

**File:** `plg-website/infrastructure/lambda/email-sender/index.js`

- No structural change needed — the dedup guard works correctly as long as `emailsSent` keys are properly cleared by the webhook handler
- Add logging to distinguish "permanently deduped" vs "lifecycle deduped" for debugging

#### Step 8: Fix customer-update Lambda race condition

**File:** `plg-website/infrastructure/lambda/customer-update/index.js`

- In `handleSubscriptionUpdated`: if the incoming record contains `eventType`, preserve it in the update payload
- Alternatively (simpler): skip the subscription status update entirely if the webhook already wrote it — the `customer-update` Lambda's write is redundant for subscription events since the webhook already updates the PROFILE

#### Step 9: Update constants

**File:** `plg-website/src/lib/constants.js`

- Add `CANCELLATION_PENDING: "CANCELLATION_PENDING"` to `LICENSE_STATUS`
- Add display entry: `CANCELLATION_PENDING: { label: "Cancellation Pending", variant: "warning" }`

#### Step 10: Update scheduled-tasks Lambda

**File:** `plg-website/infrastructure/lambda/scheduled-tasks/index.js`

- Win-back queries currently filter on `subscriptionStatus: "canceled"` — update to `"expired"`

#### Step 11: Rebuild and publish SES layer

- Rebuild `hic-ses-layer` with the new templates
- Publish new layer version
- Update all Lambdas that consume `hic-ses-layer` (email-sender, scheduled-tasks)

### Phase 2: Organization Member Notification Routing (Pre-Launch — Recommended)

#### Step 12: Add org member fan-out in email-sender Lambda

**File:** `plg-website/infrastructure/lambda/email-sender/index.js`

- After selecting the template for a cancellation lifecycle event, check `accountType` on the customer record
- If `business`: query org members and send org-variant templates (`orgCancellationRequested` or `orgCancellationExpired`) to each member
- The same 4 cancellation event types drive both Individual and Business flows — no ORG-specific event types needed
- This keeps the event taxonomy clean: events describe what happened, the Lambda routes by who it happened to

This requires:
- Adding `hic-dynamodb-layer` dependency to email-sender Lambda (already present) for org member queries
- Org-variant template selection logic in the email-sender

### Phase 3: Post-Launch Enhancements

- Promo code injection into `cancellationRequested` template
- A/B testing of cancellation email copy
- Cancellation reason survey (Stripe supports this via portal configuration)
- Rich win-back sequences segmented by cancellation reason
- Re-engagement campaigns for `NONPAYMENT_CANCELLATION_EXPIRED` customers

---

## 8. Files Requiring Changes

### Core Changes (Phase 1)

| File | Changes | Risk |
|---|---|---|
| `plg-website/src/app/api/webhooks/stripe/route.js` | New event types, new statuses, emailsSent clearing | HIGH — core billing pipeline |
| `dm/layers/ses/src/email-templates.js` | 4 new event-driven templates + 2 org-variant templates, updated mapping, updated TEMPLATE_NAMES | MEDIUM — additive only |
| `plg-website/infrastructure/lambda/email-sender/index.js` | Logging improvements for dedup debugging + org member fan-out routing for business accounts | MEDIUM — new routing logic |
| `plg-website/infrastructure/lambda/customer-update/index.js` | Preserve eventType or skip redundant writes | MEDIUM — race condition fix |
| `plg-website/infrastructure/lambda/scheduled-tasks/index.js` | Update win-back queries from `canceled` to `expired` | LOW — query filter change |
| `plg-website/src/lib/constants.js` | Add `CANCELLATION_PENDING` status | LOW — additive |

### Layer Rebuild Required

| Layer | Reason |
|---|---|
| `hic-ses-layer` | New templates and mapping |

### Lambdas Requiring Redeployment

| Lambda | Reason |
|---|---|
| `email-sender` | Consumes new event types via updated `hic-ses-layer` |
| `customer-update` | Race condition fix |
| `scheduled-tasks` | Updated win-back query filter |

### Portal UI Considerations

| File | Potential Change |
|---|---|
| `plg-website/src/app/portal/page.js` | May need to display `cancellation_pending` status |
| `plg-website/src/app/portal/billing/page.js` | May need to show "Cancellation pending — access until [date]" |

---

## 9. Open Questions

### Resolved (Per SWR Direction)

1. ✅ **New subscription statuses:** `cancellation_pending` and `expired` approved
2. ✅ **Event type for "user clicked cancel":** `CANCELLATION_REQUESTED` (not `SUBSCRIPTION_CANCELLED`)
3. ✅ **Three distinct expiration templates:** Voluntary, nonpayment, and org cancellation each get their own template and tone. Org templates are selected by Lambda routing based on `accountType`, not by separate event types.
4. ✅ **Thorough audit before deployment:** All changes will go through security audit and code review

### Remaining Questions for SWR

5. **Backward compatibility for `canceled` status:** Existing customer records in DynamoDB have `subscriptionStatus: "canceled"`. Should we run a one-time migration to update these to `expired`, or handle both values in queries? The win-back scheduled task currently queries for `"canceled"` — it would need to query for both during a transition period.

6. **Portal UI for `cancellation_pending`:** Should the portal billing page show a banner like "Your subscription will end on [date]. Changed your mind?" with a CTA to reverse? This is a frontend change that could be deferred post-launch but would be a nice touch.

7. ✅ **Org cancellation event architecture:** No separate ORG-specific event types. The same 4 cancellation lifecycle events apply to both Individual and Business accounts. The email-sender Lambda checks `accountType` and routes to org-variant templates for Business accounts, fanning out notifications to org members. This keeps the event taxonomy clean and avoids duplicating business logic into the event layer.

8. **Test account cleanup:** The test account used for E2E validation likely has `emailsSent.SUBSCRIPTION_CANCELLED` permanently stamped. We should clear this manually in DynamoDB before re-testing. Should we also build a small admin utility to clear `emailsSent` for any customer (useful for support scenarios)?

9. **`SUBSCRIPTION_CANCELLED` backward compatibility:** The old `SUBSCRIPTION_CANCELLED` event type should be removed from `EVENT_TYPE_TO_TEMPLATE` to prevent accidental use. However, if any existing `EVENT#` records in DynamoDB still reference it, the email-sender would log `no-email-action` warnings. Is this acceptable, or should we keep a mapping to a sensible default template during a transition period?

10. **Naming convention audit:** The existing codebase uses a mix of naming styles for event types:
    - `SUBSCRIPTION_CANCELLED` (past tense, passive)
    - `PAYMENT_FAILED` (past tense, passive)
    - `TRIAL_ENDING` (present participle)
    - `TEAM_INVITE_CREATED` (past tense, passive)

    The proposed new types follow a consistent pattern: `{SCOPE}_{ACTION}_{STATE}` (e.g., `VOLUNTARY_CANCELLATION_EXPIRED`, `NONPAYMENT_CANCELLATION_EXPIRED`). Should we also rename existing event types for consistency, or leave them as-is to minimize blast radius?

---

## 10. Post-Launch Roadmap Considerations

The event architecture proposed here is designed to support rich post-launch email engagement without further structural changes. Each cancellation segment can be independently targeted:

### Segment: Voluntary Cancellers (`CANCELLATION_REQUESTED`)

- **Immediate:** "Sorry to see you go" email (pre-launch)
- **Post-launch:** Cancellation reason survey, promo code offers, feature highlight emails during remaining term, "last chance" email 3 days before expiration
- **Win-back:** 30-day and 90-day win-back emails already exist; can be segmented by cancellation reason

### Segment: Nonpayment Cancellers (`NONPAYMENT_CANCELLATION_EXPIRED`)

- **Immediate:** Neutral cancellation notice (pre-launch)
- **Post-launch:** Payment method update reminders, alternative payment options, reduced-price offers

### Segment: Org Members (Business accounts — routed by Lambda, not by event type)

- **Immediate:** "Contact your admin or get Individual license" (pre-launch)
- **Post-launch:** Individual license conversion campaigns, "bring Mouse to your new team" offers

### Infrastructure Ready for Post-Launch

- `emailsSent` clearing enables re-engagement without dedup conflicts
- Distinct event types enable precise segmentation in scheduled-tasks Lambda
- `EVENT#` records provide an audit trail for all email triggers
- Template system supports per-segment customization without code changes to the pipeline

---

## Appendix A: Subscription State Machine (Proposed)

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

---

## Appendix B: Naming Discrepancy Inventory

Per Rule 4 ("Naming discrepancies are high-priority issues"), here is a complete inventory of naming inconsistencies found during this investigation:

| Location | Current Name | Issue | Recommendation |
|---|---|---|---|
| `route.js` statusMap | `canceled` | Stripe maps to `canceled`, but we propose `expired` for end-of-term | Use `expired` for customer-facing, keep `canceled` as internal Stripe mapping |
| `constants.js` | `CANCELLED` (British spelling) | `LICENSE_STATUS.CANCELLED` uses British spelling | Inconsistent with `canceled` (American) used in `subscriptionStatus`. Pick one. |
| `email-templates.js` | `cancellation` template | Named for the action, not the state | Keep as-is (deprecated) — new templates use descriptive names |
| `route.js` | `paymentFailedCount` | Used in `handlePaymentFailed` | `customer-update/index.js` uses `paymentFailureCount` — inconsistent |
| `customer-update/index.js` | `MAX_PAYMENT_FAILURES` | Constant defined but threshold logic is in `route.js` | Consolidate threshold logic to one location |
| `email-sender/index.js` | `EMAIL_ACTIONS` | Alias for `EVENT_TYPE_TO_TEMPLATE` | Rename to `EVENT_TYPE_TO_TEMPLATE` for consistency |

---

_End of report. Awaiting SWR review and direction before implementation._
