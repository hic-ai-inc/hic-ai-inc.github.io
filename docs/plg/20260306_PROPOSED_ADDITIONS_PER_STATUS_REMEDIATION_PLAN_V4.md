# Appendix A: Proposed New Items in Status Remediation Plan V4

**Date:** March 6, 2026
**Parent Document:** `docs/plg/20260306_CONSOLIDATED_STATUS_REMEDIATION_PLAN_V4.md`
**Supersedes:** `docs/plg/20260306_PROPOSED_ADDITIONS_PER_STATUS_REMEDIATION_PLAN_V3.md`
**Purpose:** Comprehensive inventory of every new value, function, behavior change, and logic path proposed by V4 that does not exist in the codebase today. Provided for review and approval before implementation.

---

## ⚠️ Issue Found During Appendix A Preparation

**`handleDisputeClosed` writes `"suspended"` to DDB on a lost dispute** (line ~824 of `stripe/route.js`):

```javascript
await updateCustomerSubscription(dbCustomer.userId, {
  subscriptionStatus: "suspended",
  fraudulent: true,
});
```

This is a payment-path use of `"suspended"` in DDB — it contradicts V4's design that `"suspended"` means admin-only. V4 Step 3.1 must also fix this handler: change `"suspended"` to `"expired"` for lost disputes. A customer who wins a chargeback against us has their subscription terminated — that's `"expired"`, not `"suspended"`. The `fraudulent: true` flag already marks the record for fraud tracking.

This fix must be added to V4 Checkpoint 1 (dead code removal / status cleanup).

---

## Context: What V4 Eliminated vs V3

V3 proposed 24 new items plus 4 debatable categories. V4 eliminates the majority by removing the `payment_suspended` / `admin_suspended` disambiguation entirely. The payment path is `active → past_due → expired`. `"suspended"` means one thing: admin suspended a team member.

### Items Eliminated from V3

| V3 # | Item | Why Eliminated |
|---|---|---|
| 1 | `PAYMENT_SUSPENDED` enum value | No payment-suspension state. Payment path is `past_due → expired`. |
| 2 | `ADMIN_SUSPENDED` enum value | `"suspended"` is unambiguous — admin suspension only. No rename needed. |
| 3 | `ADMIN_REVOKED` enum value | `"revoked"` is unambiguous. No rename needed. |
| 4–9 | Stripe statuses in `LICENSE_STATUS` | Billing page keeps its own map. These are Stripe concepts, not license statuses. |
| 12 | `licensePaymentSuspended` email template | No payment-suspension state → no email for it. |
| 13 | `memberSuspended` email template | Deferred. Can be added as SNS topic consumer later. |
| 14 | `memberRevoked` email template | Deferred. Same rationale. |
| 15 | `memberReactivated` email template | Deferred. Same rationale. |
| 16 | `MEMBER_REACTIVATED` event write | Deferred. Same rationale. |
| 17 | `retryAfter: 30` heartbeat field | No retry logic. Missing license returns 404 error. |
| 18 | `"unknown"` heartbeat status | No new status. Missing license returns 404 error. |
| 19 | `_handleLicensePaymentSuspended` handler | No payment-suspension state. |
| 20 | `_handleLicenseAdminSuspended` handler | Existing handler removed; heartbeat never returns `"suspended"`. |
| 21 | `case "unknown":` handler | No `"unknown"` status. |
| 22 | `"unknown"` in `VALID_HEARTBEAT_STATUSES` | No `"unknown"` status. |
| 23 | `"payment_suspended"` / `"admin_suspended"` in validation allowlists | No disambiguation needed. |

---

## Proposed New Items (V4): 9 Items

### 1. `renewLicense(licenseId)` Function

**File:** `src/lib/keygen.js`
**Type:** New exported function
**Reason:** Root-cause fix. The codebase never calls Keygen's `POST /licenses/{id}/actions/renew`. Without this, Keygen declares licenses expired after the policy duration regardless of Stripe payment status. Called on every `invoice.payment_succeeded`.

### 2. Lowercase `LICENSE_STATUS` Enum Values

**File:** `src/lib/constants.js`
**Type:** Value change (keys unchanged)
**Before:** `ACTIVE: "ACTIVE"`, `PAST_DUE: "PAST_DUE"`, `EXPIRED: "EXPIRED"`, etc.
**After:** `ACTIVE: "active"`, `PAST_DUE: "past_due"`, `EXPIRED: "expired"`, etc.
**Reason:** All DDB writers already use lowercase strings. The enum values should match what's actually stored. Eliminates `.toUpperCase()` / `.toLowerCase()` bridges throughout the portal.

### 3. Lowercase `LICENSE_STATUS_DISPLAY` Keys

**File:** `src/lib/constants.js`
**Type:** Key change (display strings unchanged)
**Before:** `"ACTIVE": "Active"`, `"PAST_DUE": "Past Due"`, etc.
**After:** `"active": "Active"`, `"past_due": "Past Due"`, etc.
**Reason:** Direct consequence of #2. Display map keys must match enum values.

### 4. `.toLowerCase()` on Keygen Status Responses

**Files:** `src/lib/keygen.js` (at `validateLicense` and `getLicense` return points), `scripts/plg-metrics.js` (at Keygen comparison points)
**Type:** Normalization guard
**Reason:** Keygen returns UPPER_CASE status strings. Adding `.toLowerCase()` at the boundary prevents casing mismatches. Defense-in-depth for the metrics script and any future Keygen interactions.

### 5. `EVENT_TYPES` Enum

**File:** `src/lib/constants.js`
**Type:** New exported enum

Centralizes all hardcoded event type strings. Every value below already exists as a hardcoded string at one or more call sites. The enum prevents typos and provides a single source of truth.

**Values (derived from codebase audit):**

| Enum Key | String Value | Current Location(s) |
|---|---|---|
| `CUSTOMER_CREATED` | `"CUSTOMER_CREATED"` | `stripe/route.js` → `handleCheckoutCompleted` |
| `LICENSE_CREATED` | `"LICENSE_CREATED"` | `dynamodb.js` → license record creation |
| `LICENSE_SUSPENDED` | `"LICENSE_SUSPENDED"` | `keygen/route.js` → `handleLicenseSuspended`; `portal/team/route.js` |
| `LICENSE_REVOKED` | `"LICENSE_REVOKED"` | `keygen/route.js` → `handleLicenseRevoked`; `portal/team/route.js` |
| `PAYMENT_FAILED` | `"PAYMENT_FAILED"` | `stripe/route.js` → `handlePaymentFailed` |
| `SUBSCRIPTION_REACTIVATED` | `"SUBSCRIPTION_REACTIVATED"` | `stripe/route.js` → `handlePaymentSucceeded` |
| `CANCELLATION_REQUESTED` | `"CANCELLATION_REQUESTED"` | `stripe/route.js` → `handleSubscriptionUpdated` |
| `CANCELLATION_REVERSED` | `"CANCELLATION_REVERSED"` | `stripe/route.js` → `handleSubscriptionUpdated` |
| `VOLUNTARY_CANCELLATION_EXPIRED` | `"VOLUNTARY_CANCELLATION_EXPIRED"` | `stripe/route.js` → `handleSubscriptionDeleted` |
| `NONPAYMENT_CANCELLATION_EXPIRED` | `"NONPAYMENT_CANCELLATION_EXPIRED"` | `stripe/route.js` → `handleSubscriptionDeleted` |
| `TEAM_INVITE_CREATED` | `"TEAM_INVITE_CREATED"` | `dynamodb.js` → invite creation |
| `TEAM_INVITE_RESENT` | `"TEAM_INVITE_RESENT"` | `dynamodb.js` (referenced in `EVENT_TYPE_TO_TEMPLATE`) |

**12 values.** All already exist as hardcoded strings. No new event types are being invented — this is purely extraction into a central enum.

**Refactoring scope:** Every file that writes one of these strings must import `EVENT_TYPES` and replace the hardcoded string. Files affected:
- `src/lib/dynamodb.js` (2 call sites)
- `src/app/api/webhooks/stripe/route.js` (7 call sites)
- `src/app/api/webhooks/keygen/route.js` (2 call sites)
- `src/app/api/portal/team/route.js` (2 call sites)
- `dm/layers/ses/src/email-templates.js` (`EVENT_TYPE_TO_TEMPLATE` keys)

### 6. `handlePaymentFailed` Guard: Skip `past_due` Write if Already `expired`

**File:** `src/app/api/webhooks/stripe/route.js`
**Type:** New guard clause
**Reason:** Prevents a late-arriving `invoice.payment_failed` webhook from overwriting `"expired"` with `"past_due"` after Stripe has already canceled the subscription. Without this guard, a race condition exists where the final payment failure event arrives after the subscription deletion event.

### 7. Heartbeat 404 Response for Missing License

**File:** `src/app/api/license/heartbeat/route.js`
**Type:** New error response (replaces defective `valid: true` response)
**Before:** `getLicenseByKey` returns `null` → `{ valid: true, status: "active" }` (DEFECTIVE)
**After:** `getLicenseByKey` returns `null` → `{ valid: false, error: "License not found" }` with HTTP 404
**Reason:** Current behavior grants indefinite access to users with no license record.

### 8. Heartbeat `valid: false` Check for Blocked Statuses

**File:** `src/app/api/license/heartbeat/route.js`
**Type:** New status check before returning `valid: true`
**Logic:** If `license.status` is `"expired"`, `"suspended"`, or `"revoked"`, return `{ valid: false, status, reason }`. `"past_due"` is NOT in this list — past-due users retain full tool access.
**Reason:** Ensures heartbeat correctly blocks access for terminal/blocked statuses.

### 9. Extension State Migration: UPPER_CASE → Lowercase + `"suspended"` → `"expired"`

**File:** Extension repo `licensing/state.js`, in `load()` function
**Type:** Migration logic in existing function
**Logic:** On load, if persisted status is UPPER_CASE, lowercase it. If persisted status is `"suspended"`, migrate to `"expired"` (any extension that had `"suspended"` persisted was in a payment-failure state that V4 now treats as `"expired"`).
**Reason:** Handles existing extension installs with stale status values in local state files.

---

## Removals (Existing Items Being Deleted)

Not new additions — listed for completeness.

| Item | File | Reason |
|---|---|---|
| `RETIRED: "RETIRED"` enum value | `src/lib/constants.js` | Dead code. Deferred Enterprise tier artifact. |
| `RETIRED` display entry | `src/lib/constants.js` | Companion to above. |
| `MAX_PAYMENT_FAILURES` constant | `src/lib/constants.js` | Payment-suspension logic removed. Stripe dunning handles retries. |
| `licenseSuspended` email template | `dm/layers/ses/src/email-templates.js` | No payment-suspension email. Template removed entirely. |
| `LICENSE_SUSPENDED` in `EVENT_TYPE_TO_TEMPLATE` | `dm/layers/ses/src/email-templates.js` | Companion to above. |
| `licenseSuspended` in `TEMPLATE_NAMES` | `dm/layers/ses/src/email-templates.js` | Companion to above. |
| `_handleLicenseSuspended` handler | Extension `licensing/heartbeat.js` | Heartbeat never returns `"suspended"`. Dead code. |
| `"suspended"` case in heartbeat switch | Extension `licensing/heartbeat.js` | Same reason. |
| `"suspended"` in `VALID_HEARTBEAT_STATUSES` | Extension `licensing/validation.js` | Heartbeat never returns `"suspended"`. |
| `unpaid: "suspended"` in `statusMap` | `stripe/route.js` | Changed to `unpaid: "expired"`. |
| Reinstatement block for `"suspended"` in `handleSubscriptionUpdated` | `stripe/route.js` | Reinstatement from `"past_due"` handled by `handlePaymentSucceeded`. |
| Suspension block in `handlePaymentFailed` | `stripe/route.js` | Entire `if (attempt_count >= MAX_PAYMENT_FAILURES)` block removed. |
| `"suspended"` in `handleDisputeClosed` (lost dispute) | `stripe/route.js` | Changed to `"expired"`. See issue note at top of document. |

---

## Comparison: V3 → V4

| Metric | V3 | V4 |
|---|---|---|
| New items | 24 + 4 debatable | 9, 0 debatable |
| New enum values | 9 | 0 (casing change only) |
| New email templates | 4 | 0 |
| New extension handlers | 3 | 0 |
| New enums | 1 (`EVENT_TYPES`) | 1 (`EVENT_TYPES`) |
| New functions | 1 (`renewLicense`) | 1 (`renewLicense`) |
