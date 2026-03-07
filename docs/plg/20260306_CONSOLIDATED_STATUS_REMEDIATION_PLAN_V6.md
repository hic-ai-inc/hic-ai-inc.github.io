# Consolidated Status Remediation Plan v6

**Date:** March 6, 2026
**Author:** SWR, with research by Kiro (Claude Opus 4.6)
**Status:** Draft — awaiting review and approval
**Supersedes:** All prior versions (V1–V5), `20260305_KEYGEN_WEBHOOK_REMEDIATION_PLAN.md`

---

## 9 Bugs, 9 Fixes

### Fix 1: Keygen Licenses Expire Even When Stripe Is Paid

**Problem:** The codebase never calls Keygen's `POST /licenses/{id}/actions/renew`. Keygen declares licenses expired after the policy duration (currently 30 days) regardless of whether Stripe collected payment.

**Fix:**

Add `renewLicense(licenseId)` to `src/lib/keygen.js`. Same pattern as `reinstateLicense` and `suspendLicense`.

Call it on every `invoice.payment_succeeded` in `handlePaymentSucceeded` (`src/app/api/webhooks/stripe/route.js`). Wrap in try/catch — if the Keygen call fails, DDB is already correct and the 14-day dunning window prevents premature expiration. The next successful payment retries.

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
| Monthly | 30 days (2,592,000s) | 44 days (3,801,600s) | 30 billing + 14 dunning |
| Annual | 365 days (31,536,000s) | 379 days (32,745,600s) | 365 billing + 14 dunning |

On the happy path, `renewLicense` resets the clock every billing cycle. The extended duration only matters when payment fails for the entire dunning period. There is no buffer beyond the dunning window — the user is active, then past_due, then expired. DDB governs access; Keygen is a clock.

Verify the following Smart Retries configuration in the Stripe Dashboard (Billing → Revenue recovery → Smart Retries):
- Smart Retries: ON
- Maximum retries: 8
- Maximum duration: 2 weeks
- After all retries fail: Cancel the subscription

**Files:**
- `src/lib/keygen.js` — add `renewLicense`
- `src/app/api/webhooks/stripe/route.js` — call it in `handlePaymentSucceeded`
- Keygen Dashboard — update policy durations
- Stripe Dashboard — verify Smart Retries configuration

**Tests:**
- `renewLicense` unit test (success, failure, retry)
- `handlePaymentSucceeded` calls `renewLicense` on every successful payment
- `handlePaymentSucceeded` writes "active" to DDB even if `renewLicense` fails — Stripe confirmed payment, so DDB reflects that; the Keygen sync is secondary and wrapped in try/catch, so a Keygen outage never blocks the customer's status update

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
- `licensing/state.js` → in `load()`, normalize UPPER_CASE → lowercase for existing installs.

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

---

### Fix 4: Portal Says "Expired" for Past-Due Customers

**Problem:** In `src/app/api/portal/status/route.js`, `past_due` is in the `hasExpiredSubscription` array. Past-due customers see "expired" in the portal and can't access their billing page to fix their payment.

**Fix:**

Move `past_due` to its own category:

```javascript
const hasActiveSubscription = ["active", "trial", "cancellation_pending"].includes(subscriptionStatus);
const hasPastDueSubscription = subscriptionStatus === "past_due";
const hasExpiredSubscription = ["expired"].includes(subscriptionStatus);
```

Portal access is not gated by payment status. Past-due users retain access to update their payment method. Expired users retain access to view their status and resubscribe.

**Files:**
- `src/app/api/portal/status/route.js`

**Tests:**
- Portal returns `past_due` status with full portal access
- Portal returns `expired` status with full portal access

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
- Call Keygen's `suspendLicense` API to deactivate the license on their side — this is a Keygen API action to revoke tool access, it does not write "suspended" to our DDB

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

**In the Extension repo (`~/source/repos/hic`) — `.hic/` in this workspace is the installed extension and is NOT edited directly:**
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
- Extension repo (`~/source/repos/hic`): `licensing/heartbeat.js`, `licensing/validation.js`, `licensing/http-client.js`, `licensing/commands/validate.js`, `mouse-vscode/src/licensing/heartbeat.js`, `mouse-vscode/src/licensing/validation.js`, `mouse-vscode/src/extension.js`

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
- `src/app/api/webhooks/keygen/route.js`
- `src/app/api/portal/team/route.js`
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

### Fix 9: Admin Suspension/Revocation Does Not Deactivate Member Devices

**Problem:** When a Business account Owner suspends or revokes a team Member via `POST /api/portal/team` (`update_status` action), the code updates `ORG#{orgId}/MEMBER#{memberId}` status and fires an email event — but never deactivates the Member's devices in Keygen or DynamoDB. The heartbeat endpoint reads the `LICENSE#` record (which stays "active" since the Owner is paying) and the `DEVICE#` record (which has no status field). The suspended/revoked Member's extension continues to heartbeat successfully and retains indefinite free tool access.

**Fix:**

Two changes: (A) deactivate devices at suspension/revocation time, and (B) block re-activation of suspended/revoked members.

**Part A — Deactivate Member Devices on Suspension/Revocation:**

In `src/app/api/portal/team/route.js`, within the `update_status` case, after `updateOrgMemberStatus` and before the email event, deactivate all of the member's devices:

```javascript
// Deactivate suspended/revoked member's devices
if (status === "suspended" || status === "revoked") {
  // Get org's license via the owner's customer record
  const org = await getOrganization(orgId);
  const ownerCustomer = await getCustomerByUserId(org.ownerId);
  const keygenLicenseId = ownerCustomer?.keygenLicenseId;

  if (keygenLicenseId) {
    const memberDevices = await getUserDevices(keygenLicenseId, memberId);
    for (const device of memberDevices) {
      try {
        await deactivateDevice(device.keygenMachineId);  // Keygen DELETE
      } catch (e) {
        log.warn("device_keygen_deactivation_failed", "Keygen device deactivation failed", {
          machineId: device.keygenMachineId,
          errorMessage: e?.message,
        });
        // Continue — DDB cleanup is more important than Keygen sync
      }
      await removeDeviceActivation(keygenLicenseId, device.keygenMachineId, device.fingerprint);
    }
    log.info("member_devices_deactivated", "Member devices deactivated", {
      memberId,
      deviceCount: memberDevices.length,
    });
  }
}
```

The `org` variable is already fetched later in the existing code (for the email event). Move or merge the `getOrganization` call to avoid a duplicate fetch.

New imports required in `src/app/api/portal/team/route.js`:
- `getUserDevices`, `removeDeviceActivation` from `@/lib/dynamodb`
- `deactivateDevice` from `@/lib/keygen`

**Part B — Block Re-Activation of Suspended/Revoked Members:**

In `src/app/api/license/activate/route.js`, after JWT authentication and before the Keygen `validateLicense` call, check org membership status for Business plan activations:

```javascript
// Block activation for suspended/revoked org members
const ddbLicense = await getDynamoLicense(validation.license.id);
if (ddbLicense?.planName === "Business") {
  const orgMembership = await getUserOrgMembership(userId);
  if (orgMembership && ["suspended", "revoked"].includes(orgMembership.status)) {
    return NextResponse.json(
      {
        error: "Your team access has been " + orgMembership.status,
        code: "MEMBER_" + orgMembership.status.toUpperCase(),
        detail: "Contact your team administrator to restore access",
      },
      { status: 403 },
    );
  }
}
```

Note: This check must happen after `validateLicense` returns the `license.id` (since we need it to look up `planName`), so it goes in the activation path between validation and device limit enforcement. The `getUserOrgMembership` function already exists in `dynamodb.js` and is already imported in the team route; add the import to the activation route.

New import required in `src/app/api/license/activate/route.js`:
- `getUserOrgMembership` from `@/lib/dynamodb`

**Enforcement Timing:**

- Suspension takes effect within 10 minutes (next heartbeat returns `machine_not_found` since devices are deleted)
- A malicious member who tries to re-activate before the heartbeat fires is blocked by the Part B guard
- Reinstatement: Owner sets member status back to "active" via `update_status`. Member re-activates through the normal browser-delegated activation flow. This is the correct UX for a rare admin action.

**Files:**
- `src/app/api/portal/team/route.js` — deactivate member devices on suspension/revocation
- `src/app/api/license/activate/route.js` — block re-activation of suspended/revoked members
- `src/lib/dynamodb.js` — no new functions needed (`getUserDevices`, `removeDeviceActivation`, `getUserOrgMembership` already exist)
- `src/lib/keygen.js` — no new functions needed (`deactivateDevice` already exists)

**Tests:**
- `update_status` to "suspended" deactivates all member devices (Keygen + DDB)
- `update_status` to "revoked" deactivates all member devices (Keygen + DDB)
- `update_status` to "active" does NOT deactivate devices (reinstatement)
- Activation returns 403 `MEMBER_SUSPENDED` for suspended org members
- Activation returns 403 `MEMBER_REVOKED` for revoked org members
- Activation succeeds for active org members (no regression)
- Keygen deactivation failure is non-blocking (DDB cleanup still happens)
- Member with zero devices — suspension succeeds with no-op device cleanup

---

## Production Config (Not Code)

1. **Stripe Dashboard:** Smart Retries ON, 8 retries, 2-week max, cancel subscription after failure
2. **Keygen Dashboard:** Monthly policy → 44 days, Annual policy → 379 days
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
| 9 | Fix 9 (Admin suspension) | After Fix 5 (suspended cleanup). Ensures admin suspension works correctly now that "suspended" is reserved for this purpose. |

Test gate after each fix. 100% before moving to the next.

---

## File Inventory (39 files)

### Website Source (16)

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
| 15 | `src/app/api/portal/team/route.js` | 9 |
| 16 | `src/app/api/license/activate/route.js` | 9 |

### Extension Source (9) — in Extension repo (`~/source/repos/hic`), NOT `.hic/` in this workspace

| # | File | Fixes |
|---|---|---|
| 17 | `licensing/constants.js` | 3 |
| 18 | `licensing/validation.js` | 5 |
| 19 | `licensing/state.js` | 3 |
| 20 | `licensing/http-client.js` | 5 |
| 21 | `licensing/heartbeat.js` | 5 |
| 22 | `licensing/commands/validate.js` | 5 |
| 23 | `mouse-vscode/src/licensing/heartbeat.js` | 5 |
| 24 | `mouse-vscode/src/licensing/validation.js` | 5 |
| 25 | `mouse-vscode/src/extension.js` | 5 |

### Test Files (14)

| # | File |
|---|---|
| 26 | `__tests__/unit/lib/constants.test.js` |
| 27 | `__tests__/unit/lib/keygen.test.js` |
| 28 | `__tests__/unit/api/webhooks.test.js` |
| 29 | `__tests__/unit/api/license.test.js` |
| 30 | `__tests__/unit/api/portal.test.js` |
| 31 | `__tests__/unit/lambda/customer-update.test.js` |
| 32 | `__tests__/unit/lambda/email-sender.test.js` |
| 33 | `__tests__/unit/scripts/plg-metrics.test.js` |
| 34 | `__tests__/fixtures/licenses.js` |
| 35 | `__tests__/fixtures/index.js` |
| 36 | `__tests__/e2e/contracts/webhook-api.test.js` |
| 37 | `__tests__/e2e/journeys/j3-license-activation.test.js` |
| 38 | `__tests__/e2e/journeys/j8-subscription-lifecycle.test.js` |
| 39 | `__tests__/unit/api/team.test.js` |

---

## What This Plan Does NOT Include

- SQS queue + DLQ for async Keygen mutation sync
- License reconciliation scheduled task
- Circuit breaker for Keygen mutation calls
- ~~Admin → Keygen device deactivation sync~~ (addressed by Fix 9)
- Legacy DynamoDB data migration (staging has zero data)
- CloudWatch alarms for Keygen sync
- New email templates (memberSuspended, memberRevoked, memberReactivated — deferred, can be added as SNS topic consumers later) — **Technical Debt: events are wired to DDB but downstream SES templates and Lambda triggers are not yet implemented**
- Stripe-specific statuses in LICENSE_STATUS enum (billing page keeps its own map)

---

## Addendum: Extension VSIX Packaging Issue (Discovered 2026-03-07)

During Fix 3 implementation, test files were found shipping inside the installed `.hic/` extension directory:

- `.hic/licensing/tests/commands.test.js`
- `.hic/licensing/tests/heartbeat.test.js`
- `.hic/licensing/tests/http-client.test.js`
- `.hic/licensing/tests/state.test.js`
- `.hic/licensing/tests/version.test.js`

These test files should not be included in the VSIX package distributed to end users. The extension repo's `.vscodeignore` (or equivalent build pipeline config) at `~/source/repos/hic` needs a `**/tests/**` exclusion added before the next VSIX publish. This is a packaging hygiene issue, not a functional bug — but it increases the extension's install size and exposes internal test infrastructure to users.

## Addendum: paymentFailed Email Template Copy Issue (Discovered 2026-03-07)

During Fix 5 implementation (Task 6.8), the `licenseSuspended` template was removed from `dm/layers/ses/src/email-templates.js`. However, the `paymentFailed` template still contains user-facing copy referencing suspension:

- Line ~186: "Your subscription has been suspended"
- Line ~216: Similar suspension language

With the new `active → past_due → expired` lifecycle, this copy is inaccurate — payment failure no longer leads to suspension. The template text should be updated to reflect the actual lifecycle (e.g., "Your payment failed and your subscription is now past due" or similar).

This is a cosmetic/UX issue, not a functional bug. The template is triggered correctly by `PAYMENT_FAILED` events; only the body copy is stale. Recommend addressing in a follow-up pass after the core remediation is complete.


## Addendum: handlePaymentFailed Allowlist Guard Tightened (2026-03-07)

During Task 6.14/6.15 implementation review, the `PAYMENT_FAILURE_ELIGIBLE_STATUSES` allowlist in `handlePaymentFailed` was tightened from `["active", "past_due", "trial", "cancellation_pending"]` to `["active", "past_due"]` only.

Rationale: Only customers with active renewal subscriptions should transition to "past_due" (which grants a full 2-week dunning period of continued usage). Trial users have no renewal invoice — Stripe won't fire `invoice.payment_failed` for them. Cancellation-pending users have an already-paid term that expires into cancellation with no renewal attempt. Allowing either status to resolve to "past_due" would be a privilege escalation vector (CWE-367).

Changes applied to:
- `plg-website/src/app/api/webhooks/stripe/route.js` (source)
- `plg-website/__tests__/unit/webhooks/stripe.test.js` (unit tests — added trial and cancellation_pending ineligible tests)
- `plg-website/__tests__/property/webhooks/stripe.property.test.js` (Property 5 — updated generators)

All 1787 tests pass after this change.
