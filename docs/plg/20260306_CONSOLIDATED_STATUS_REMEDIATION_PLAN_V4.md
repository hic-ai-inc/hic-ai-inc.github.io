# Consolidated Status Remediation Plan v4

**Date:** March 6, 2026
**Author:** SWR, with research by Kiro (Claude Opus 4.6)
**Status:** Draft — awaiting review and approval
**Supersedes:** All prior versions (V1–V3), `20260305_KEYGEN_WEBHOOK_REMEDIATION_PLAN.md`

---

## 1. Problems to Fix

1. **Missing `renewLicense` call.** The codebase never calls Keygen's `POST /licenses/{id}/actions/renew`. Keygen declares licenses expired after the policy duration regardless of Stripe payment status.

2. **Heartbeat returns `valid: true` when license is null.** When `getLicenseByKey` returns `null`, the heartbeat endpoint returns `{ valid: true, status: "active" }` — granting indefinite access with no license record.

3. **Casing inconsistency.** `LICENSE_STATUS` enum uses UPPER_CASE values but all DDB writers use hardcoded lowercase strings. Keygen returns UPPER_CASE. Portal pages use `.toUpperCase()` bridges.

4. **Portal status route bug.** `past_due` is classified in `hasExpiredSubscription`, causing the portal to return `status: "expired"` for past-due customers.

5. **Dead code: `"suspended"` in payment failure path.** `handlePaymentFailed` suspends licenses after `MAX_PAYMENT_FAILURES` attempts. This is unnecessary — Stripe's dunning cycle handles retries, and the subscription goes directly to `expired` when dunning fails. The `"suspended"` status should only exist for admin suspension of team members. All payment-path suspension code, the `licenseSuspended` email template, and the `_handleLicenseSuspended` extension handler must be removed.

6. **Dead code: `RETIRED` status.** Deferred Enterprise tier artifact.

7. **Keygen reads at request time.** Three endpoints query Keygen for status instead of using DynamoDB as the sole source of truth.

8. **Production Keygen webhook returns 405.** Launch blocker.

## 2. Design Decisions

### Stripe Dunning Configuration

Configure in Stripe Dashboard (Billing → Revenue recovery → Retries):
- Smart Retries: ON
- Maximum retries: 8
- Maximum duration: 2 weeks
- After all retries fail: **Cancel the subscription**

This means Stripe fires `customer.subscription.deleted` after the 2-week dunning window. We handle that event by writing `"expired"` to DDB.

### Keygen Policy Durations

| Policy | Current | New | Rationale |
|---|---|---|---|
| Monthly | 30 days (2,592,000s) | 47 days (4,060,800s) | 30-day billing period + 14-day Stripe dunning window + 3-day buffer |
| Annual | 30 days (2,592,000s) | 382 days (33,004,800s) | 365-day billing period + 14-day dunning window + 3-day buffer |

The Keygen policy duration must exceed the billing period PLUS the full Stripe dunning window. If the first payment attempt fails and all 8 retries over 2 weeks also fail, the Keygen license must not expire before Stripe cancels the subscription. The 3-day buffer covers webhook delivery delays and edge cases.

On the happy path, `renewLicense` is called on every successful `invoice.payment_succeeded`, resetting the Keygen expiry clock. The extended policy duration only matters when payment fails for the entire dunning period.

#### Policy Duration Rationale

The buffer is NOT sized to give away free access. A customer whose subscription is canceled by Stripe after dunning has their DDB status set to `"expired"` immediately — the heartbeat returns `valid: false` regardless of the Keygen expiry clock. The Keygen duration is a backstop that prevents Keygen's `license.expired` webhook from overwriting DDB status during the dunning window. DDB governs access; Keygen is a clock.

### License Status Lifecycle (Payment Path)

```
active → past_due → expired
```

No `"suspended"` state in the payment path. `past_due` is a 2-week grace period with full tool access. `expired` is terminal (tools blocked). If the user re-subscribes, they get a new subscription.

### License Status Lifecycle (Admin Path)

```
active → suspended (admin suspends member)
suspended → active (admin reactivates member)
active → revoked (admin revokes member)
```

`"suspended"` means one thing: an admin suspended a team member. No ambiguity.

### Event Timing for Monthly Renewal (Unhappy Path)

Subscription created March 15, 12:00 PM EST.

```
March 15         Subscription created. Keygen expiresAt = May 1 (47 days).
                 DDB: "active". Stripe: active.

April 14 ~2PM    Stripe current_period_end. First charge attempt. DECLINED.
                 Stripe fires invoice.payment_failed (attempt 1).
                 Stripe fires customer.subscription.updated (status: "past_due").
                 DDB: "past_due". Email: PAYMENT_FAILED.
                 Extension: valid: true, status: "past_due". Tools WORK.
                 Keygen: still active (expiresAt May 1, 17 days remaining).

April 14–28      Stripe Smart Retries (up to 7 more attempts over 2 weeks).
                 Each failure: invoice.payment_failed, DDB stays "past_due".
                 Each failure: PAYMENT_FAILED email with retry date.
                 Extension: tools continue to WORK throughout.
                 Keygen: still active (expiresAt May 1).

~April 28        Stripe exhausts all retries. Cancels subscription.
                 Stripe fires customer.subscription.deleted.
                 DDB: "expired". Email: NONPAYMENT_CANCELLATION_EXPIRED.
                 Extension heartbeat: valid: false, status: "expired". Tools BLOCKED.
                 Keygen: still active (expiresAt May 1, 3 days remaining).

May 1            Keygen policy expires. Fires license.expired webhook.
                 DDB: already "expired" — idempotent write.
                 No user-facing impact.
```

No status ping-pong. No race conditions between Keygen and Stripe. DDB is always correct. Keygen expiry is always a no-op confirmation.

### Event Timing for Monthly Renewal (Happy Path)

```
April 14 ~2PM    Stripe charges card. SUCCEEDS.
                 Stripe fires invoice.payment_succeeded.
                 handlePaymentSucceeded:
                   DDB: updateLicenseStatus("active", { expiresAt })
                   Keygen: renewLicense(licenseId) → expiresAt reset to +47 days
                 Extension: valid: true, status: "active". Tools WORK.
```

### Race Condition Analysis

**Stripe events arrive out of order:** `invoice.payment_failed` and `customer.subscription.updated` both write `"past_due"`. Order doesn't matter — both are idempotent.

**Heartbeat during status transition:** If a heartbeat reads DDB between the `"past_due"` write and the `"expired"` write on subscription deletion, the user gets one extra heartbeat cycle (~10 min) of `past_due` access. Benign — they were already in the grace period.

**`renewLicense` fails on happy path:** DDB is updated to `"active"` immediately. Keygen clock drifts but the 17-day buffer (47 - 30) means Keygen won't expire the license before the next billing cycle. The next successful payment retries `renewLicense`.

**Keygen webhook endpoint is down:** Keygen retries with exponential backoff. DDB is already correct from the Stripe webhook path. Keygen webhook is a confirmation, not the source of truth.

## 3. Implementation Plan

### Checkpoint 1: Foundation

#### 3.1 Remove Dead Code

**`src/lib/constants.js`:**
- Remove `RETIRED: "RETIRED"` from `LICENSE_STATUS`
- Remove `RETIRED` entry from `LICENSE_STATUS_DISPLAY`
- Remove `MAX_PAYMENT_FAILURES` constant

**`src/app/api/webhooks/stripe/route.js` — `handlePaymentFailed`:**
- Remove the entire `if (attempt_count >= MAX_PAYMENT_FAILURES)` block (lines ~718-730). This block writes `"suspended"` to DDB and calls `suspendLicense`. With the 2-state payment path, `handlePaymentFailed` only writes `"past_due"` and sends the `PAYMENT_FAILED` email.

**`src/app/api/webhooks/stripe/route.js` — `handleSubscriptionUpdated`:**
- Remove `unpaid: "suspended"` from `statusMap`. Replace with `unpaid: "expired"`.
- Remove the reinstatement check for `"suspended"` (the `else if (status === "active" && dbCustomer.subscriptionStatus === "suspended")` block that calls `reinstateLicense`). Reinstatement from `"past_due"` is handled by `handlePaymentSucceeded`.

**`src/app/api/webhooks/keygen/route.js` — `handleLicenseSuspended`:**
- Remove the `"LICENSE_SUSPENDED"` event write and email trigger. This handler should only log the event, not write to DDB or send email. Keygen suspension is a Keygen-side state; our DDB status is governed by Stripe events and admin actions.

**`dm/layers/ses/src/email-templates.js`:**
- Remove the `licenseSuspended` template entirely.
- Remove `LICENSE_SUSPENDED` from `EVENT_TYPE_TO_TEMPLATE` mapping.
- Remove `licenseSuspended` from `TEMPLATE_NAMES` array.

**`infrastructure/lambda/customer-update/index.js`:**
- Remove all references to `"suspended"` in the payment/subscription context. Keep any admin-suspension references if they exist.

**`src/app/api/webhooks/stripe/route.js` — `handleDisputeClosed`:**
- Change `subscriptionStatus: "suspended"` to `subscriptionStatus: "expired"` in the lost-dispute branch. A customer who wins a chargeback has their subscription terminated — that's `"expired"`, not `"suspended"`. The `fraudulent: true` flag already marks the record for fraud tracking.

**`__tests__/unit/lib/constants.test.js`:**
- Remove `RETIRED` test assertion.

#### 3.2 Normalize Constants to Lowercase

**`LICENSE_STATUS` enum:** Change all values from UPPER_CASE to lowercase. Keys stay UPPER_CASE.

Before: `ACTIVE: "ACTIVE"`, `PAST_DUE: "PAST_DUE"`, etc.
After: `ACTIVE: "active"`, `PAST_DUE: "past_due"`, etc.

**`LICENSE_STATUS_DISPLAY`:** Change all keys to lowercase to match.

#### 3.3 Add `renewLicense` to `keygen.js`

Add `renewLicense(licenseId)` function to `src/lib/keygen.js`. Calls `POST /licenses/${licenseId}/actions/renew`. Returns `{ id, status, expiresAt }`. Follows the same pattern as `reinstateLicense` and `suspendLicense`.

#### 3.4 Add Keygen `.toLowerCase()` Normalization

Add `.toLowerCase()` at every point where Keygen status enters our system:
- `keygen.js` → `validateLicense` return value
- `keygen.js` → `getLicense` return value
- `scripts/plg-metrics.js` → when comparing Keygen responses against DDB values

#### 3.5 Extract `EVENT_TYPES` Enum

**File:** `src/lib/constants.js`

Add a new `EVENT_TYPES` enum centralizing all hardcoded event type strings. Every value already exists as a hardcoded string at one or more call sites — no new event types are being invented.

```javascript
// Directional — may contain errors
export const EVENT_TYPES = {
  CUSTOMER_CREATED: "CUSTOMER_CREATED",
  LICENSE_CREATED: "LICENSE_CREATED",
  LICENSE_SUSPENDED: "LICENSE_SUSPENDED",
  LICENSE_REVOKED: "LICENSE_REVOKED",
  PAYMENT_FAILED: "PAYMENT_FAILED",
  SUBSCRIPTION_REACTIVATED: "SUBSCRIPTION_REACTIVATED",
  CANCELLATION_REQUESTED: "CANCELLATION_REQUESTED",
  CANCELLATION_REVERSED: "CANCELLATION_REVERSED",
  VOLUNTARY_CANCELLATION_EXPIRED: "VOLUNTARY_CANCELLATION_EXPIRED",
  NONPAYMENT_CANCELLATION_EXPIRED: "NONPAYMENT_CANCELLATION_EXPIRED",
  TEAM_INVITE_CREATED: "TEAM_INVITE_CREATED",
  TEAM_INVITE_RESENT: "TEAM_INVITE_RESENT",
};
```

**Refactoring:** Replace all hardcoded event strings with `EVENT_TYPES.X` in:
- `src/lib/dynamodb.js` (2 call sites: `LICENSE_CREATED`, `TEAM_INVITE_CREATED`)
- `src/app/api/webhooks/stripe/route.js` (7 call sites)
- `src/app/api/webhooks/keygen/route.js` (2 call sites: `LICENSE_SUSPENDED`, `LICENSE_REVOKED`)
- `src/app/api/portal/team/route.js` (2 call sites: `LICENSE_SUSPENDED`, `LICENSE_REVOKED`)
- `dm/layers/ses/src/email-templates.js` (`EVENT_TYPE_TO_TEMPLATE` keys)

#### Checkpoint 1 — Tests

Run all tests. Fix breakage from casing changes, dead code removal, and EVENT_TYPES refactoring. Add tests for `renewLicense`. Bring to 100%.

---

### Checkpoint 2: Wire `renewLicense` + Fix Payment Handlers

#### 3.5 Wire `renewLicense` into `handlePaymentSucceeded`

**File:** `src/app/api/webhooks/stripe/route.js`

Add `renewLicense` call for ALL successful payments. Every `invoice.payment_succeeded` extends the Keygen expiry:

```javascript
// Directional — may contain errors
if (dbCustomer.keygenLicenseId) {
  try {
    await renewLicense(dbCustomer.keygenLicenseId);
  } catch (e) {
    log.warn("license_renew_failed", "Failed to renew Keygen license", {
      licenseId: dbCustomer.keygenLicenseId,
      errorMessage: e?.message,
    });
    // DDB already updated. Keygen expiry will drift but the 17-day buffer
    // prevents premature expiration. Next successful payment retries.
  }
}
```

Also in `handlePaymentSucceeded`: the existing reinstatement check (`dbCustomer.subscriptionStatus === "suspended"`) should be changed to check `"past_due"` instead. When a payment succeeds after failures, the prior status is `"past_due"`, not `"suspended"`.

#### 3.6 Fix `handleSubscriptionDeleted` for Clean Expiration

**File:** `src/app/api/webhooks/stripe/route.js`

The existing handler already writes `"expired"`. Verify:
- `priorStatus === "suspended"` check → change to `priorStatus === "past_due"`
- The `suspendLicense` call at the end should remain — when Stripe cancels the subscription, we suspend the Keygen license (Keygen's "suspended" is their equivalent of "access revoked"; it's a Keygen API concept, not our status enum).

#### 3.7 Fix `handlePaymentFailed` — Remove Suspension, Keep Email

**File:** `src/app/api/webhooks/stripe/route.js`

After removing the suspension block in 3.1, verify that `handlePaymentFailed` only:
1. Writes `"past_due"` to DDB
2. Writes `paymentFailureCount`
3. Fires `PAYMENT_FAILED` event (triggers email)
4. Updates LICENSE# status to `"past_due"`

Add a guard: if `dbCustomer.subscriptionStatus` is already `"expired"`, skip the `"past_due"` write. This prevents a late-arriving `invoice.payment_failed` from overwriting `"expired"` after Stripe has already canceled the subscription.

#### Checkpoint 2 — Tests

Run all tests. Add tests for `renewLicense` in `handlePaymentSucceeded`, reinstate-before-renew ordering, `handlePaymentFailed` without suspension. Bring to 100%.

---

### Checkpoint 3: Portal and Heartbeat Fixes

#### 3.8 Remove Casing Bridges

**Files:** `src/app/portal/page.js`, `src/app/portal/license/page.js`, `src/app/portal/billing/page.js`

`portal/page.js`: `LICENSE_STATUS_DISPLAY[subscriptionStatus?.toUpperCase()]` → `LICENSE_STATUS_DISPLAY[subscriptionStatus]`

`portal/license/page.js`: `license.status?.toUpperCase() || "ACTIVE"` → `license.status || "active"`

`portal/billing/page.js`: Leave the independent `labels`/`variants` map as-is. It handles Stripe-specific statuses that don't belong in `LICENSE_STATUS`.

#### 3.9 Fix Portal Status Route

**File:** `src/app/api/portal/status/route.js`

Move `past_due` out of `hasExpiredSubscription` into its own category:

```javascript
// Directional — may contain errors
const hasActiveSubscription = ["active", "trial", "cancellation_pending"].includes(subscriptionStatus);
const hasPastDueSubscription = subscriptionStatus === "past_due";
const hasExpiredSubscription = ["canceled", "expired", "disputed", "revoked"].includes(subscriptionStatus);
const hasSuspendedSubscription = subscriptionStatus === "suspended"; // admin only
```

`past_due` returns portal access (user needs to see their billing page to fix payment). `suspended` (admin) returns a message explaining the admin action.

#### 3.10 Fix Heartbeat Defects

**File:** `src/app/api/license/heartbeat/route.js`

**Fix 1 — License not found.** When `getLicenseByKey` returns `null`, return an error:

```javascript
if (!license) {
  return NextResponse.json(
    { valid: false, error: "License not found" },
    { status: 404 },
  );
}
```

No `"unknown"` status. No retry logic. A missing license is an error.

**Fix 2 — License status check.** After `getLicenseByKey`, before returning `valid: true`:

```javascript
if (license.status === "expired" || license.status === "suspended" || license.status === "revoked") {
  return NextResponse.json({
    valid: false,
    status: license.status,
    reason: `License is ${license.status}`,
  });
}
```

`past_due` is NOT in this list — past-due users retain full tool access during the 2-week dunning window.

#### Checkpoint 3 — Tests

Run all tests. Add tests for heartbeat error on null license, heartbeat `valid: false` for expired/suspended/revoked, heartbeat `valid: true` for past_due. Bring to 100%.

---

### Checkpoint 4: Eliminate Keygen Read Calls

DynamoDB is the sole source of truth for all reads. Keygen is write-only.

#### 3.11 `/api/license/validate` — Replace `validateLicense` with DynamoDB

**File:** `src/app/api/license/validate/route.js`

Replace the Keygen `validateLicense` call with:
1. `getLicenseByKey(licenseKey)` — LICENSE# record from DDB
2. `getDeviceByFingerprint(license.keygenLicenseId, fingerprint)` — DEVICE# record

Use `license.status` from DDB directly. Handle the `HEARTBEAT_NOT_STARTED` equivalent by checking `device.lastSeenAt` — if null and device has a `keygenMachineId`, fire `machineHeartbeat` (write, not read).

Remove import: `validateLicense` from `@/lib/keygen`. Keep `machineHeartbeat`.
Add imports: `getLicenseByKey`, `getDeviceByFingerprint` from `@/lib/dynamodb`.

#### 3.12 `/api/portal/license` — Remove Keygen `getLicense` Call

**File:** `src/app/api/portal/license/route.js`

Remove the `getKeygenLicense` call in `buildLicenseResponse`. Use DDB `getLicense` as the sole source for `status` and `expiresAt`.

Remove import: `getLicense as getKeygenLicense` from `@/lib/keygen`.

#### 3.13 `/api/license/check` — Remove Keygen `getLicensesByEmail` Fallback

**File:** `src/app/api/license/check/route.js`

Replace the Keygen `getLicensesByEmail` fallback with `getCustomerLicensesByEmail` from DDB (already exists in `dynamodb.js`).

Remove import: `getLicensesByEmail` from `@/lib/keygen`.
Add import: `getCustomerLicensesByEmail` from `@/lib/dynamodb`.

#### Checkpoint 4 — Tests

Run all tests. Add tests for DDB-only validate, portal license without Keygen, check route DDB fallback. Bring to 100%.

---

### Checkpoint 5: Extension Updates

#### 3.14 Update Extension

**Repo:** `~/source/repos/hic`

**Files:** `licensing/constants.js`, `licensing/validation.js`, `licensing/state.js`, `licensing/http-client.js`, `licensing/heartbeat.js`, `mouse-vscode/src/licensing/heartbeat.js`, `mouse-vscode/src/licensing/validation.js`, `mouse-vscode/src/extension.js`, `licensing/commands/validate.js`

**1. Normalize `LICENSE_STATES` to lowercase (`licensing/constants.js`).** Change all values to lowercase. Keys stay UPPER_CASE.

**2. Remove `"suspended"` from heartbeat handling.** Remove `case "license_suspended":` / `case "suspended":` and the `_handleLicenseSuspended` handler entirely from `licensing/heartbeat.js` and `mouse-vscode/src/licensing/heartbeat.js`. The extension will never receive `"suspended"` from the heartbeat — admin suspension is a member-level status that the heartbeat already handles via `valid: false`.

**3. Update validation allowlists (`licensing/validation.js`, `mouse-vscode/src/licensing/validation.js`).** Remove bare `"suspended"` from `VALID_HEARTBEAT_STATUSES` and `VALID_LICENSE_STATES`. The heartbeat returns `"expired"`, `"past_due"`, `"active"`, `"revoked"`, or an error. No `"suspended"` in the heartbeat path.

**4. Update `_mapServerStatusToState` (`mouse-vscode/src/licensing/heartbeat.js`).** Remove `"suspended"` mapping. Add `"past_due"` → active state (tools work during grace period).

**5. Update `http-client.js`.** Remove `response.license?.status === "suspended"` check. Replace with `"expired"` or `"revoked"` as appropriate.

**6. Update `extension.js`.** Remove suspended-specific status bar and notification handling. `"expired"` and `"revoked"` are the only tool-blocking states from the server.

**7. State migration (`licensing/state.js`).** In `load()`, normalize UPPER_CASE → lowercase. Migrate bare `"suspended"` → `"expired"` (any extension that had `"suspended"` persisted was in a payment-failure state that is now `"expired"`).

**8. Validate command (`licensing/commands/validate.js`).** Remove suspended status mapping.

#### Checkpoint 5 — Tests

Run extension tests. Fix breakage. Bring to 100%.

---

### Checkpoint 6: Metrics

#### 3.15 Update Metrics Script

**File:** `scripts/plg-metrics.js`

Remove `suspended` counter for payment path. The only `"suspended"` records in DDB going forward are admin suspensions. Keygen API comparisons stay UPPER_CASE; DDB comparisons use lowercase.

#### Checkpoint 6 — Tests

Run all tests. Bring to 100%.

---

### Checkpoint 7: Production Verification

#### 3.16 Verify Production Keygen Webhook

1. Ensure production deployment includes the webhook route.
2. Confirm Keygen dashboard production webhook is set to `*` (all events).
3. Verify with a test event.
4. Confirm `KEYGEN_WEBHOOK_SECRET` is set in production.

#### 3.17 Update Keygen Policy Durations

After `renewLicense` is deployed and tested on staging:
1. Monthly policies → 47 days (4,060,800s).
2. Annual policies → 382 days (33,004,800s).
3. Verify by triggering a test payment and confirming new expiry.

#### 3.18 Configure Stripe Dunning

In Stripe Dashboard (Billing → Revenue recovery → Retries):
1. Enable Smart Retries.
2. Set maximum retries: 8.
3. Set maximum duration: 2 weeks.
4. After all retries fail: Cancel the subscription.

#### Checkpoint 7 — Final Verification

Run full test suite across both repos. Manual E2E on staging: trigger payment → verify DDB + Keygen both show active with correct expiry. Trigger payment failure → verify `past_due` → verify expiration after dunning. Grep: zero remaining UPPER_CASE status values in DDB writer files.

---

## 4. Affected File Inventory

### Website Source Files (Modified)

| # | File | Checkpoint |
|---|---|---|
| 1 | `src/lib/constants.js` | 1 |
| 2 | `src/lib/keygen.js` | 1 |
| 3 | `src/app/api/webhooks/stripe/route.js` | 1, 2 |
| 4 | `src/app/api/webhooks/keygen/route.js` | 1 |
| 5 | `infrastructure/lambda/customer-update/index.js` | 1 |
| 6 | `dm/layers/ses/src/email-templates.js` | 1 |
| 7 | `src/app/portal/page.js` | 3 |
| 8 | `src/app/portal/license/page.js` | 3 |
| 9 | `src/app/api/portal/status/route.js` | 3 |
| 10 | `src/app/api/license/heartbeat/route.js` | 3 |
| 11 | `src/app/api/license/validate/route.js` | 4 |
| 12 | `src/app/api/portal/license/route.js` | 4 |
| 13 | `src/app/api/license/check/route.js` | 4 |
| 14 | `scripts/plg-metrics.js` | 6 |

### Extension Source Files (Modified)

| # | File | Checkpoint |
|---|---|---|
| 15 | `licensing/constants.js` | 5 |
| 16 | `licensing/validation.js` | 5 |
| 17 | `licensing/state.js` | 5 |
| 18 | `licensing/http-client.js` | 5 |
| 19 | `licensing/heartbeat.js` | 5 |
| 20 | `mouse-vscode/src/licensing/heartbeat.js` | 5 |
| 21 | `mouse-vscode/src/licensing/validation.js` | 5 |
| 22 | `mouse-vscode/src/extension.js` | 5 |
| 23 | `licensing/commands/validate.js` | 5 |

### Website Test Files (Modified)

| # | File |
|---|---|
| 24 | `__tests__/unit/lib/constants.test.js` |
| 25 | `__tests__/unit/lib/keygen.test.js` |
| 26 | `__tests__/unit/api/webhooks.test.js` |
| 27 | `__tests__/unit/api/license.test.js` |
| 28 | `__tests__/unit/api/portal.test.js` |
| 29 | `__tests__/unit/lambda/customer-update.test.js` |
| 30 | `__tests__/unit/lambda/email-sender.test.js` |
| 31 | `__tests__/unit/scripts/plg-metrics.test.js` |
| 32 | `__tests__/fixtures/licenses.js` |
| 33 | `__tests__/fixtures/index.js` |
| 34 | `__tests__/e2e/contracts/webhook-api.test.js` |
| 35 | `__tests__/e2e/journeys/j3-license-activation.test.js` |
| 36 | `__tests__/e2e/journeys/j8-subscription-lifecycle.test.js` |

---

## 5. What This Plan Does NOT Include

- SQS queue + DLQ for async Keygen mutation sync
- License reconciliation scheduled task
- Circuit breaker for Keygen mutation calls
- Admin → Keygen device deactivation sync
- Legacy DynamoDB data migration (staging — zero data)
- Transitional guards for old/new status values
- CloudWatch alarms for Keygen sync
- Integration test for full Stripe → DynamoDB → Keygen cycle
- Stripe-specific statuses in LICENSE_STATUS enum (billing page keeps its own map)
