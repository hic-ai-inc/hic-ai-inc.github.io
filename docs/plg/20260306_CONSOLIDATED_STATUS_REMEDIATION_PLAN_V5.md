# Consolidated Status Remediation Plan v5

**Date:** March 6, 2026
**Author:** SWR, with research by Kiro (Claude Opus 4.6)
**Status:** Draft — awaiting review and approval
**Supersedes:** All prior versions (V1–V4), `20260305_KEYGEN_WEBHOOK_REMEDIATION_PLAN.md`

---

## 8 Bugs, 8 Fixes

### Fix 1: Keygen Licenses Expire Even When Stripe Is Paid

**Problem:** The codebase never calls Keygen's `POST /licenses/{id}/actions/renew`. Keygen declares licenses expired after the policy duration (currently 30 days) regardless of whether Stripe collected payment.

**Fix:**

Add `renewLicense(licenseId)` to `src/lib/keygen.js`. Same pattern as `reinstateLicense` and `suspendLicense`.

Call it on every `invoice.payment_succeeded` in `handlePaymentSucceeded` (`src/app/api/webhooks/stripe/route.js`). Wrap in try/catch — if the Keygen call fails, DDB is already correct and the 17-day buffer prevents premature expiration. The next successful payment retries.

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
  }
}
```

Update Keygen policy durations so the license can't expire during Stripe's dunning window:

| Policy | Current | New | Rationale |
|---|---|---|---|
| Monthly | 30 days (2,592,000s) | 47 days (4,060,800s) | 30 billing + 14 dunning + 3 buffer |
| Annual | 30 days (2,592,000s) | 382 days (33,004,800s) | 365 billing + 14 dunning + 3 buffer |

On the happy path, `renewLicense` resets the clock every billing cycle. The extended duration only matters when payment fails for the entire dunning period. DDB governs access; Keygen is a clock.

Configure Stripe Dashboard (Billing → Revenue recovery → Retries):
- Smart Retries: ON
- Maximum retries: 8
- Maximum duration: 2 weeks
- After all retries fail: Cancel the subscription

**Files:**
- `src/lib/keygen.js` — add `renewLicense`
- `src/app/api/webhooks/stripe/route.js` — call it in `handlePaymentSucceeded`
- Keygen Dashboard — update policy durations
- Stripe Dashboard — configure dunning

**Tests:**
- `renewLicense` unit test (success, failure, retry)
- `handlePaymentSucceeded` calls `renewLicense` on every successful payment
- `handlePaymentSucceeded` still writes "active" to DDB even if `renewLicense` fails

---

### Fix 2: Heartbeat Grants Access When No License Exists

**Problem:** When `getLicenseByKey` returns `null`, the heartbeat endpoint returns `{ valid: true, status: "active" }` — granting indefinite access with no license record.

**Fix:**

In `src/app/api/license/heartbeat/route.js`, when `getLicenseByKey` returns null, return a 404 error:

```javascript
if (!license) {
  return NextResponse.json(
    { valid: false, error: "License not found" },
    { status: 404 },
  );
}
```

Also add a status check before returning `valid: true`:

```javascript
if (["expired", "suspended", "revoked"].includes(license.status)) {
  return NextResponse.json({
    valid: false,
    status: license.status,
    reason: `License is ${license.status}`,
  });
}
```

`"past_due"` is NOT in this list — past-due users retain full tool access during the 2-week dunning window.

**Files:**
- `src/app/api/license/heartbeat/route.js`

**Tests:**
- Heartbeat returns 404 when license is null
- Heartbeat returns `valid: false` for expired, suspended, revoked
- Heartbeat returns `valid: true` for active, past_due, cancellation_pending, trial

---

### Fix 3: Casing Mismatch Everywhere

**Problem:** `LICENSE_STATUS` enum uses UPPER_CASE values (`"ACTIVE"`), DDB stores lowercase (`"active"`), Keygen returns UPPER_CASE (`"ACTIVE"`). Portal pages bridge with `.toUpperCase()`. This causes silent comparison failures.

**Fix:**

Change `LICENSE_STATUS` enum values to lowercase in `src/lib/constants.js`. Keys stay UPPER_CASE:

Before: `ACTIVE: "ACTIVE"`, `PAST_DUE: "PAST_DUE"`, etc.
After: `ACTIVE: "active"`, `PAST_DUE: "past_due"`, etc.

Change `LICENSE_STATUS_DISPLAY` keys to lowercase to match:

Before: `"ACTIVE": "Active"`, `"PAST_DUE": "Past Due"`, etc.
After: `"active": "Active"`, `"past_due": "Past Due"`, etc.

Add `.toLowerCase()` at every point where Keygen status enters our system:
- `keygen.js` → `validateLicense` return value
- `keygen.js` → `getLicense` return value
- `scripts/plg-metrics.js` → Keygen response comparisons

Remove `.toUpperCase()` bridges in portal pages:
- `src/app/portal/page.js`: `LICENSE_STATUS_DISPLAY[subscriptionStatus?.toUpperCase()]` → `LICENSE_STATUS_DISPLAY[subscriptionStatus]`
- `src/app/portal/license/page.js`: `license.status?.toUpperCase() || "ACTIVE"` → `license.status || "active"`
- `src/app/portal/billing/page.js`: Leave the independent `labels`/`variants` map as-is (it handles Stripe-specific statuses)

Normalize extension constants to lowercase:
- `licensing/constants.js` → change `LICENSE_STATES` values to lowercase
- `licensing/state.js` → in `load()`, normalize UPPER_CASE → lowercase for existing installs. Migrate persisted `"suspended"` → `"expired"`.

**Files:**
- `src/lib/constants.js`
- `src/lib/keygen.js`
- `src/app/portal/page.js`
- `src/app/portal/license/page.js`
- `scripts/plg-metrics.js`
- Extension: `licensing/constants.js`, `licensing/state.js`

**Tests:**
- All existing tests updated for lowercase values
- State migration test: UPPER_CASE → lowercase
- State migration test: `"suspended"` → `"expired"`

---

### Fix 4: Portal Says "Expired" for Past-Due Customers

**Problem:** In `src/app/api/portal/status/route.js`, `past_due` is in the `hasExpiredSubscription` array. Past-due customers see "expired" in the portal and can't access their billing page to fix their payment.

**Fix:**

Move `past_due` to its own category:

```javascript
const hasActiveSubscription = ["active", "trial", "cancellation_pending"].includes(subscriptionStatus);
const hasPastDueSubscription = subscriptionStatus === "past_due";
const hasExpiredSubscription = ["canceled", "expired", "disputed", "revoked"].includes(subscriptionStatus);
const hasSuspendedSubscription = subscriptionStatus === "suspended"; // admin only
```

Past-due users get portal access so they can update their payment method.

**Files:**
- `src/app/api/portal/status/route.js`

**Tests:**
- Portal returns active-like response for `past_due`
- Portal returns expired response for `expired`, `canceled`, `revoked`
- Portal returns suspended response for `suspended`

---

### Fix 5: "Suspended" Used for Payment Failures

**Problem:** `"suspended"` is used in two unrelated contexts:
- `handlePaymentFailed` writes `"suspended"` to DDB after `MAX_PAYMENT_FAILURES` (3) attempts
- `handleDisputeClosed` writes `"suspended"` to DDB on a lost dispute
- `"suspended"` should only mean: admin suspended a team member

**Fix:**

The payment lifecycle becomes `active → past_due → expired`. No intermediate suspension. Stripe's 2-week dunning handles retries. When dunning fails, Stripe cancels the subscription, and we write `"expired"`.

**In `src/app/api/webhooks/stripe/route.js`:**

`handlePaymentFailed`:
- Remove the entire `if (attempt_count >= MAX_PAYMENT_FAILURES)` block that writes `"suspended"` and calls `suspendLicense`
- After removal, this handler only writes `"past_due"`, increments `paymentFailureCount`, and fires the `PAYMENT_FAILED` email
- Add a guard: if `dbCustomer.subscriptionStatus` is already `"expired"`, skip the `"past_due"` write (prevents a late-arriving payment failure from overwriting `"expired"` after Stripe already canceled)

`handlePaymentSucceeded`:
- Change the reinstatement check from `dbCustomer.subscriptionStatus === "suspended"` to `"past_due"` (when payment succeeds after failures, prior status is `"past_due"`, not `"suspended"`)

`handleSubscriptionUpdated`:
- Remove `unpaid: "suspended"` from `statusMap`. Replace with `unpaid: "expired"`
- Remove the reinstatement block for `"suspended"` (`else if (status === "active" && dbCustomer.subscriptionStatus === "suspended")` that calls `reinstateLicense`). Reinstatement from `"past_due"` is handled by `handlePaymentSucceeded`

`handleSubscriptionDeleted`:
- Change `priorStatus === "suspended"` check to `priorStatus === "past_due"`
- Keep the `suspendLicense` Keygen API call (that's Keygen's concept for "revoke access", not our status enum)

`handleDisputeClosed`:
- Change `subscriptionStatus: "suspended"` to `subscriptionStatus: "expired"` in the lost-dispute branch. The `fraudulent: true` flag already marks the record

**In `src/app/api/webhooks/keygen/route.js`:**

`handleLicenseSuspended`:
- Remove the `"LICENSE_SUSPENDED"` event write and email trigger. This handler should only log. Keygen suspension is a Keygen-side state; our DDB status is governed by Stripe events and admin actions.

**In `src/lib/constants.js`:**
- Remove `MAX_PAYMENT_FAILURES`

**In `dm/layers/ses/src/email-templates.js`:**
- Remove the `licenseSuspended` template entirely
- Remove `LICENSE_SUSPENDED` from `EVENT_TYPE_TO_TEMPLATE`
- Remove `licenseSuspended` from `TEMPLATE_NAMES`

**In `infrastructure/lambda/customer-update/index.js`:**
- Remove payment-path `"suspended"` references. Keep admin-suspension references.

**In the extension (`~/source/repos/hic`):**
- Remove `_handleLicenseSuspended` handler from `licensing/heartbeat.js` and `mouse-vscode/src/licensing/heartbeat.js`
- Remove `case "suspended":` / `case "license_suspended":` from heartbeat switch
- Remove `"suspended"` from `VALID_HEARTBEAT_STATUSES` in `licensing/validation.js` and `mouse-vscode/src/licensing/validation.js`
- Remove `"suspended"` mapping from `_mapServerStatusToState` in `mouse-vscode/src/licensing/heartbeat.js`. Add `"past_due"` → active state (tools work during grace period)
- Remove `response.license?.status === "suspended"` check in `licensing/http-client.js`
- Remove suspended-specific status bar and notification handling in `mouse-vscode/src/extension.js`
- Remove suspended status mapping in `licensing/commands/validate.js`

**Files:**
- `src/app/api/webhooks/stripe/route.js` (4 handlers)
- `src/app/api/webhooks/keygen/route.js`
- `src/lib/constants.js`
- `dm/layers/ses/src/email-templates.js`
- `infrastructure/lambda/customer-update/index.js`
- Extension: `licensing/heartbeat.js`, `licensing/validation.js`, `licensing/http-client.js`, `licensing/commands/validate.js`, `mouse-vscode/src/licensing/heartbeat.js`, `mouse-vscode/src/licensing/validation.js`, `mouse-vscode/src/extension.js`

**Tests:**
- `handlePaymentFailed` writes `"past_due"` only, never `"suspended"`
- `handlePaymentFailed` skips write if already `"expired"`
- `handlePaymentSucceeded` reinstates from `"past_due"` (not `"suspended"`)
- `handleDisputeClosed` writes `"expired"` on lost dispute
- `handleSubscriptionDeleted` handles `priorStatus === "past_due"`
- Extension heartbeat has no `"suspended"` case
- Extension maps `"past_due"` to active (tools work)

---

### Fix 6: Dead `RETIRED` Status

**Problem:** `RETIRED: "RETIRED"` exists in `LICENSE_STATUS` and `LICENSE_STATUS_DISPLAY`. It's a deferred Enterprise tier artifact. Dead code.

**Fix:**

Remove from `src/lib/constants.js`:
- `RETIRED` from `LICENSE_STATUS`
- `RETIRED` entry from `LICENSE_STATUS_DISPLAY`

**Files:**
- `src/lib/constants.js`
- `__tests__/unit/lib/constants.test.js` (remove assertion)

**Tests:**
- `RETIRED` no longer in enum

---

### Fix 7: Three Endpoints Read from Keygen Instead of DDB

**Problem:** DynamoDB is the sole source of truth for reads. Keygen is write-only. But three endpoints query Keygen at request time, adding latency and a failure dependency.

**Fix:**

`/api/license/validate` (`src/app/api/license/validate/route.js`):
- Replace `validateLicense` (Keygen call) with `getLicenseByKey` + `getDeviceByFingerprint` (DDB reads)
- Use `license.status` from DDB directly
- Keep `machineHeartbeat` (write, not read)
- Remove import: `validateLicense` from `@/lib/keygen`
- Add imports: `getLicenseByKey`, `getDeviceByFingerprint` from `@/lib/dynamodb`

`/api/portal/license` (`src/app/api/portal/license/route.js`):
- Remove `getKeygenLicense` call in `buildLicenseResponse`
- Use DDB `getLicense` as sole source for status and expiresAt
- Remove import: `getLicense as getKeygenLicense` from `@/lib/keygen`

`/api/license/check` (`src/app/api/license/check/route.js`):
- Replace `getLicensesByEmail` (Keygen fallback) with `getCustomerLicensesByEmail` (DDB, already exists)
- Remove import: `getLicensesByEmail` from `@/lib/keygen`
- Add import: `getCustomerLicensesByEmail` from `@/lib/dynamodb`

**Files:**
- `src/app/api/license/validate/route.js`
- `src/app/api/portal/license/route.js`
- `src/app/api/license/check/route.js`

**Tests:**
- Validate uses DDB only, no Keygen call
- Portal license uses DDB only
- Check route falls back to DDB, not Keygen

---

### Fix 8: Hardcoded Event Strings Everywhere

**Problem:** 12 event type strings like `"PAYMENT_FAILED"` and `"CANCELLATION_REQUESTED"` are scattered as raw strings across 5 files. Typo risk, no single source of truth.

**Fix:**

Add `EVENT_TYPES` enum to `src/lib/constants.js`:

```javascript
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

Every value already exists as a hardcoded string. No new events. Replace all hardcoded strings with `EVENT_TYPES.X` in:
- `src/lib/dynamodb.js` (2 sites: `LICENSE_CREATED`, `TEAM_INVITE_CREATED`)
- `src/app/api/webhooks/stripe/route.js` (7 sites)
- `src/app/api/webhooks/keygen/route.js` (2 sites: `LICENSE_SUSPENDED`, `LICENSE_REVOKED`)
- `src/app/api/portal/team/route.js` (2 sites: `LICENSE_SUSPENDED`, `LICENSE_REVOKED`)
- `dm/layers/ses/src/email-templates.js` (`EVENT_TYPE_TO_TEMPLATE` keys)

**Files:**
- `src/lib/constants.js`
- `src/lib/dynamodb.js`
- `src/app/api/webhooks/stripe/route.js`
- `src/app/api/webhooks/keygen/route.js`
- `src/app/api/portal/team/route.js`
- `dm/layers/ses/src/email-templates.js`

**Tests:**
- All event writes use `EVENT_TYPES.X`
- No hardcoded event strings remain in source files (grep verification)

---

## Production Config (Not Code)

1. **Stripe Dashboard:** Smart Retries ON, 8 retries, 2-week max, cancel subscription after failure
2. **Keygen Dashboard:** Monthly policy → 47 days, Annual policy → 382 days
3. **Keygen Webhook:** Deferred. Verification of the production Keygen webhook endpoint at `https://hic-ai.com/api/webhooks/keygen` (currently returns 405) is deferred until the production stack deployment phase of the launch plan (see `docs/launch/`). Staging verification is sufficient for this remediation.

---

## Payment Lifecycle After Fixes

```
active → past_due (2-week Stripe dunning, tools WORK) → expired (tools BLOCKED)
```

`"suspended"` means one thing: admin suspended a team member. Never appears in the payment path.

---

## Execution Order

| Order | Fix | Why This Order |
|---|---|---|
| 1 | Fix 6 (RETIRED) | Trivial. Clears dead code first. |
| 2 | Fix 3 (Casing) | Foundation. Every subsequent fix writes lowercase. |
| 3 | Fix 8 (EVENT_TYPES) | Foundation. Every subsequent fix uses the enum. |
| 4 | Fix 5 (Suspended cleanup) | Largest change. Removes dead code, fixes payment path. |
| 5 | Fix 1 (renewLicense) | Root cause fix. Depends on casing being correct. |
| 6 | Fix 2 (Heartbeat) | Depends on Fix 5 (status list) and Fix 3 (casing). |
| 7 | Fix 4 (Portal status) | Depends on Fix 3 (casing). |
| 8 | Fix 7 (Keygen reads) | Last. Removes Keygen dependency from hot path. |

Test gate after each fix. 100% before moving to the next.

---

## File Inventory (36 files)

### Website Source (14)

| # | File | Fixes |
|---|---|---|
| 1 | `src/lib/constants.js` | 3, 5, 6, 8 |
| 2 | `src/lib/keygen.js` | 1, 3 |
| 3 | `src/app/api/webhooks/stripe/route.js` | 1, 5, 8 |
| 4 | `src/app/api/webhooks/keygen/route.js` | 5, 8 |
| 5 | `src/app/api/license/heartbeat/route.js` | 2 |
| 6 | `src/app/api/portal/status/route.js` | 4 |
| 7 | `src/app/portal/page.js` | 3 |
| 8 | `src/app/portal/license/page.js` | 3 |
| 9 | `src/app/api/license/validate/route.js` | 7 |
| 10 | `src/app/api/portal/license/route.js` | 7 |
| 11 | `src/app/api/license/check/route.js` | 7 |
| 12 | `dm/layers/ses/src/email-templates.js` | 5, 8 |
| 13 | `infrastructure/lambda/customer-update/index.js` | 5 |
| 14 | `scripts/plg-metrics.js` | 3 |

### Extension Source (9)

| # | File | Fixes |
|---|---|---|
| 15 | `licensing/constants.js` | 3 |
| 16 | `licensing/validation.js` | 5 |
| 17 | `licensing/state.js` | 3 |
| 18 | `licensing/http-client.js` | 5 |
| 19 | `licensing/heartbeat.js` | 5 |
| 20 | `licensing/commands/validate.js` | 5 |
| 21 | `mouse-vscode/src/licensing/heartbeat.js` | 5 |
| 22 | `mouse-vscode/src/licensing/validation.js` | 5 |
| 23 | `mouse-vscode/src/extension.js` | 5 |

### Test Files (13)

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

## What This Plan Does NOT Include

- SQS queue + DLQ for async Keygen mutation sync
- License reconciliation scheduled task
- Circuit breaker for Keygen mutation calls
- Admin → Keygen device deactivation sync
- Legacy DynamoDB data migration (staging has zero data)
- CloudWatch alarms for Keygen sync
- New email templates (memberSuspended, memberRevoked, memberReactivated — deferred, can be added as SNS topic consumers later)
- Stripe-specific statuses in LICENSE_STATUS enum (billing page keeps its own map)
