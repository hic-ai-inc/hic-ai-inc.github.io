# Consolidated Status Remediation Plan v3

**Date:** March 6, 2026
**Author:** SWR, with research by GitHub Copilot (Claude Opus 4.6) and Kiro (Claude Opus 4.6)
**Status:** Draft — awaiting review and approval
**Supersedes:** `docs/plg/20260306_CONSOLIDATED_STATUS_REMEDIATION_PLAN_V2.md`, `docs/plg/20260305_KEYGEN_WEBHOOK_REMEDIATION_PLAN.md`

---

## 1. What Happened

On March 4, 2026, the Keygen license for `[REDACTED:email]` expired — 30 days after creation — despite an active, paid Stripe subscription. The investigation (`20260305_REPORT_RE_INVESTIGATION_INTO_EXPIRATION_UI_INCONSISTENCIES.md`) found one root cause and three compounding issues:

1. **Missing `renewLicense` call.** The codebase never calls Keygen's `POST /licenses/{id}/actions/renew`. When Stripe confirms payment, DynamoDB is updated but Keygen's expiry clock is never extended. After 30 days, Keygen declares the license expired.

2. **Heartbeat masks expired licenses.** The heartbeat endpoint pings the Keygen machine and returns `valid: true, status: "active"` when the machine is alive — regardless of whether the license is expired or suspended in DynamoDB. Additionally, when `getLicenseByKey` returns `null`, the heartbeat returns `valid: true, status: "active"` — a critical defect allowing indefinite use without a valid license record.

3. **`"suspended"` naming collision.** The string `"suspended"` is used for both payment-failure suspension (LICENSE# and CUSTOMER# records) and admin suspension of team members (MEMBER# records). They share the same event type (`LICENSE_SUSPENDED`) and email template (`licenseSuspended`), causing wrong emails and ambiguous records.

4. **Casing inconsistency.** The `LICENSE_STATUS` enum defines UPPER_CASE values (`"ACTIVE"`, `"PAST_DUE"`) but is never referenced by any writer — all 8 DynamoDB writer files use hardcoded lowercase strings. Keygen returns UPPER_CASE status. Portal pages use `.toUpperCase()` bridges. The billing page has an independent lowercase labels map.

All four issues must be fixed in a single pass because they touch overlapping files.

## 2. Prerequisites

**Completed:** Staging Keygen webhook switched to `*` (all events) on March 5, 2026. Manual license renewal confirmed working.

**Pending:** Keygen policy duration update — must happen AFTER Step 3.3 is deployed and tested. Do NOT change durations before `renewLicense` is live.

| Policy | Current Duration | New Duration | Rationale |
|---|---|---|---|
| Individual/Business Monthly | 30 days (2,592,000s) | 33 days (2,851,200s) | Billing period + 3 days buffer |
| Individual/Business Annual | 30 days (2,592,000s) | 368 days (31,795,200s) | Billing period + 3 days buffer |

#### 2.1 Policy Duration Rationale

The 3-day buffer (33 days for monthly, 368 days for annual) exists solely to cover webhook delivery delays, cold-start timeouts, deployment gaps, and edge cases where a payment succeeds but the `renewLicense` call fails transiently. It is the absolute backstop — it only matters if the `renewLicense` call in `handlePaymentSucceeded` fails AND the failure is never retried or noticed.

The buffer is NOT sized to accommodate Stripe's retry cycle. During Stripe retries, the subscription status is `past_due`, not `canceled`. Each successful retry fires `invoice.payment_succeeded`, which triggers `renewLicense`. If all retries fail, Stripe fires `customer.subscription.deleted` and we suspend the license. The Keygen duration is irrelevant to that flow.

A 45-day buffer on a 30-day subscription means a cancelled customer retains full access for 15 extra days. That is giving away the product. The buffer should be as small as operationally safe.

Trials are purely local to the extension (14-day clock) and have no Keygen policy.

If a new billing period is introduced (e.g., quarterly), create a new Keygen policy with duration = billing period + 3 days. Update the `getKeygenPolicyIds()` SSM parameters to include the new policy ID. The `renewLicense` call is billing-period-agnostic — it extends by the policy's configured duration.

## 3. Implementation Plan

### Checkpoint 1: Foundation (constants, renewLicense, Keygen normalization)

#### 3.1 Remove RETIRED Dead Code

Remove `RETIRED: "RETIRED"` from `LICENSE_STATUS` and `RETIRED: { label: "Retired", variant: "error" }` from `LICENSE_STATUS_DISPLAY` in `src/lib/constants.js`. Remove the corresponding test assertion in `__tests__/unit/lib/constants.test.js`. Dead code from deferred Enterprise tier.

#### 3.2 Normalize Constants to Lowercase + Add New Statuses + Add EVENT_TYPES Enum

**`LICENSE_STATUS` enum:** Change all values from UPPER_CASE to lowercase. Keys stay UPPER_CASE (JS convention). Add:
- `PAYMENT_SUSPENDED: "payment_suspended"`
- `ADMIN_SUSPENDED: "admin_suspended"`
- `ADMIN_REVOKED: "admin_revoked"`
- Stripe-specific statuses needed by the billing page: `TRIALING: "trialing"`, `UNPAID: "unpaid"`, `INCOMPLETE: "incomplete"`, `INCOMPLETE_EXPIRED: "incomplete_expired"`, `PENDING: "pending"`, `PAUSED: "paused"`

**`LICENSE_STATUS_DISPLAY`:** Change all keys to lowercase. Add display entries for all new statuses.

**`EVENT_TYPES` enum (new export):** Create with all event type strings currently hardcoded at call sites:
`LICENSE_CREATED`, `LICENSE_ACTIVATED`, `LICENSE_PAYMENT_SUSPENDED`, `LICENSE_REINSTATED`, `LICENSE_EXPIRED`, `LICENSE_RENEWED`, `LICENSE_CANCELED`, `LICENSE_DISPUTED`, `DISPUTE_RESOLVED`, `MEMBER_SUSPENDED`, `MEMBER_REVOKED`, `MEMBER_REACTIVATED`, `MEMBER_INVITED`, `PAYMENT_FAILED`, `NONPAYMENT_CANCELLATION_EXPIRED`, `VOLUNTARY_CANCELLATION_EXPIRED`, `SUBSCRIPTION_REACTIVATED`, `CUSTOMER_CREATED`, `CANCELLATION_REQUESTED`, `CANCELLATION_REVERSED`.

All downstream writers must reference these enum constants instead of hardcoded strings.

#### 3.3 Add `renewLicense` to `keygen.js`

Add `renewLicense(licenseId)` function to `src/lib/keygen.js`. Calls `POST /licenses/${licenseId}/actions/renew`. Returns `{ id, status, expiresAt }`. Follows the same pattern as `reinstateLicense` and `suspendLicense`.

#### 3.4 Add Keygen `.toLowerCase()` Normalization at API Boundaries

Keygen returns UPPER_CASE status across all endpoints. Add `.toLowerCase()` at every point where Keygen status enters our system:

- `keygen.js` → `validateLicense` return value
- `keygen.js` → `getLicense` return value
- `src/app/api/license/validate/route.js` → normalize Keygen status before returning
- `src/app/api/portal/license/route.js` → normalize `keygenLicense?.status`
- `src/app/api/license/check/route.js` → normalize (currently does ad-hoc `.toLowerCase()`; make consistent)
- `scripts/plg-metrics.js` → add `.toLowerCase()` when comparing Keygen responses against DynamoDB values

#### Checkpoint 1 — Tests

Run all tests. Fix breakage from casing/enum changes. Add tests for `renewLicense` and `.toLowerCase()` normalization. Bring to 100%.

---

### Checkpoint 2: Payment Path Disambiguation + Renewal Integration

#### 3.5 Wire `renewLicense` into `handlePaymentSucceeded` and Disambiguate Payment Suspension

**Files:** `src/app/api/webhooks/stripe/route.js`, `src/app/api/webhooks/keygen/route.js`, `infrastructure/lambda/customer-update/index.js`

**Stripe webhook (`route.js`):** 9 touch points across 5 handler functions.
- `handleSubscriptionUpdated`: `statusMap` entry `unpaid: "suspended"` → `unpaid: LICENSE_STATUS.PAYMENT_SUSPENDED`. All `statusMap` entries reference `LICENSE_STATUS` constants.
- `handleSubscriptionUpdated`: reinstatement check `=== "suspended"` → `=== LICENSE_STATUS.PAYMENT_SUSPENDED`
- `handleSubscriptionDeleted`: `priorStatus === "suspended"` → `=== LICENSE_STATUS.PAYMENT_SUSPENDED`
- `handlePaymentSucceeded`: reinstatement check `=== "suspended"` → `=== LICENSE_STATUS.PAYMENT_SUSPENDED`. Add `renewLicense(dbCustomer.keygenLicenseId)` call AFTER reinstatement. Reinstate-before-renew ordering is required (Keygen may reject renew on a suspended license). Wrap in try/catch — if the Keygen call fails, DynamoDB is already correct and the license will be renewed on the next successful payment.
- `handlePaymentFailed`: `"suspended"` → `LICENSE_STATUS.PAYMENT_SUSPENDED`
- `handleDisputeClosed`: `"suspended"` → `LICENSE_STATUS.PAYMENT_SUSPENDED`

**Also in `handlePaymentSucceeded`:** Add `renewLicense` call for ALL successful payments, not just reinstatements. Every `invoice.payment_succeeded` should extend the Keygen expiry:

```javascript
// After updateLicenseStatus (DynamoDB is correct immediately):
if (dbCustomer.keygenLicenseId) {
  try {
    await renewLicense(dbCustomer.keygenLicenseId);
    log.info("license_renewed", "Keygen license renewed on payment success", {
      licenseId: dbCustomer.keygenLicenseId,
    });
  } catch (e) {
    log.warn("license_renew_failed", "Failed to renew Keygen license", {
      licenseId: dbCustomer.keygenLicenseId,
      errorMessage: e?.message,
    });
    // DynamoDB already updated. Keygen expiry will drift but the 3-day buffer
    // on the policy duration provides a backstop. If this keeps failing,
    // it will show up in logs and the license will eventually expire.
  }
}
```

**Keygen webhook (`route.js`):** `handleLicenseSuspended` — change `"suspended"` → `LICENSE_STATUS.PAYMENT_SUSPENDED`; change `"LICENSE_SUSPENDED"` → `EVENT_TYPES.LICENSE_PAYMENT_SUSPENDED`.

**Customer-update Lambda:** `"suspended"` → `"payment_suspended"` in all 3 locations. Fix `wasSuspended` variable to check `"payment_suspended"` instead of `"suspended"`.

#### Checkpoint 2 — Tests

Run all tests. Fix breakage. Add tests for `renewLicense` call in `handlePaymentSucceeded`, reinstate-before-renew ordering. Bring to 100%.

---

### Checkpoint 3: Admin Path Disambiguation

#### 3.6 Update Admin Suspension and Revocation Path

**Files:** `src/app/api/portal/team/route.js`, `src/app/portal/team/TeamManagement.js`

**`portal/team/route.js` — `update_status` action:**
- Validation array: `["active", "suspended", "revoked"]` → `["active", "admin_suspended", "admin_revoked"]`
- Event type: `"LICENSE_SUSPENDED"` / `"LICENSE_REVOKED"` → `EVENT_TYPES.MEMBER_SUSPENDED` / `EVENT_TYPES.MEMBER_REVOKED`
- Reactivation path (when `status === "active"`): add `writeEventRecord(EVENT_TYPES.MEMBER_REACTIVATED, ...)` — currently writes no event and sends no email.

**`portal/team/route.js` — DELETE handler:**
- `"revoked"` → `"admin_revoked"`
- `"LICENSE_REVOKED"` → `EVENT_TYPES.MEMBER_REVOKED`

**`TeamManagement.js`:** All UI references to `"suspended"` → `"admin_suspended"`, `"revoked"` → `"admin_revoked"`. ~5 touch points (confirm dialog text, badge color conditionals, button handlers).

#### Checkpoint 3 — Tests

Run all tests. Fix breakage. Add test for `MEMBER_REACTIVATED` event. Bring to 100%.

---

### Checkpoint 4: Email Templates

#### 3.7 Split Email Templates

**Files:** `dm/layers/ses/src/email-templates.js`, `dm/layers/ses/generate-email-preview.js`, `src/lib/ses.js`

**4 new templates replacing 1 ambiguous template:**
1. `licensePaymentSuspended` — replaces `licenseSuspended` for payment failures. Subject: "Action Required: Update Your Payment Method". CTA: billing portal link.
2. `memberSuspended` — admin suspends a team member. Subject: "Your access via [OrgName] has been suspended". Receives `organizationName`.
3. `memberRevoked` — admin revokes a team member. Subject: "Your access via [OrgName] has been revoked". Receives `organizationName`.
4. `memberReactivated` — admin reactivates a member. Subject: "Your access via [OrgName] has been restored". Receives `organizationName`.

**`EVENT_TYPE_TO_TEMPLATE` mapping updates:**
- `LICENSE_PAYMENT_SUSPENDED: "licensePaymentSuspended"`
- `MEMBER_SUSPENDED: "memberSuspended"`
- `MEMBER_REVOKED: "memberRevoked"`
- `MEMBER_REACTIVATED: "memberReactivated"`
- Remove `LICENSE_SUSPENDED: "licenseSuspended"` — no backward compat alias.

**`TEMPLATE_NAMES` array:** Add all 4 new template names. Remove `licenseSuspended`.

**`generate-email-preview.js`:** Add preview data for all 4 new templates.

#### Checkpoint 4 — Tests

Run all tests. Fix email pipeline breakage. Add tests for all 4 new templates. Bring to 100%.

---

### Checkpoint 5: Portal and Heartbeat Fixes

#### 3.8 Remove Casing Bridges and Consolidate Billing Labels

**Files:** `src/app/portal/page.js`, `src/app/portal/license/page.js`, `src/app/portal/billing/page.js`

**Remove `.toUpperCase()` bridges (2 files):**

`portal/page.js`: `LICENSE_STATUS_DISPLAY[subscriptionStatus?.toUpperCase()]` → `LICENSE_STATUS_DISPLAY[subscriptionStatus]`

`portal/license/page.js`: `license.status?.toUpperCase() || "ACTIVE"` → `license.status || "active"`

**Consolidate billing labels (1 file):**

`portal/billing/page.js` has independent hardcoded `labels` and `variants` maps. Replace with references to `LICENSE_STATUS_DISPLAY`. Prerequisite: the Stripe-specific statuses (`trialing`, `unpaid`, etc.) must already be in `LICENSE_STATUS_DISPLAY` from Step 3.2.

#### 3.9 Fix Portal Status Route Classification

**File:** `src/app/api/portal/status/route.js`

**Bug:** `past_due` is in `hasExpiredSubscription`, causing the portal to return `status: "expired"` for past-due customers — wrong, because `past_due` is a grace period. The following statuses fall through to `"none"` (redirect to checkout): `payment_suspended`, `admin_suspended`, `admin_revoked`, `expired`, `disputed`.

**Fix:** Exhaustive classification using enum constants:

```javascript
const hasActiveSubscription = [
  LICENSE_STATUS.ACTIVE,
  LICENSE_STATUS.TRIAL,
  LICENSE_STATUS.CANCELLATION_PENDING,
].includes(subscriptionStatus);

const hasPastDueSubscription = [
  LICENSE_STATUS.PAST_DUE,
].includes(subscriptionStatus);

const hasSuspendedSubscription = [
  LICENSE_STATUS.PAYMENT_SUSPENDED,
  LICENSE_STATUS.ADMIN_SUSPENDED,
].includes(subscriptionStatus);

const hasExpiredSubscription = [
  LICENSE_STATUS.CANCELED,
  LICENSE_STATUS.UNPAID,
  LICENSE_STATUS.EXPIRED,
  LICENSE_STATUS.DISPUTED,
  LICENSE_STATUS.ADMIN_REVOKED,
].includes(subscriptionStatus);
```

Response `status` becomes a 5-way branch. The suspended case passes through the actual `subscriptionStatus` value (`"payment_suspended"` or `"admin_suspended"`) to preserve disambiguation. Any unclassified status logs a warning and returns `"none"`.

#### 3.10 Fix Heartbeat: License Status Check + "License Not Found" Defect

**File:** `src/app/api/license/heartbeat/route.js`

**Fix 1 — License status check.** After `getLicenseByKey`, before returning `valid: true`, check:

```javascript
if (
  license.status === LICENSE_STATUS.EXPIRED ||
  license.status === LICENSE_STATUS.PAYMENT_SUSPENDED ||
  license.status === LICENSE_STATUS.ADMIN_SUSPENDED
) {
  return NextResponse.json({
    valid: false,
    status: license.status,
    reason: `License is ${license.status}`,
  });
}
```

This prevents the heartbeat from masking expired/suspended licenses. No `license_` prefix — return the raw status string.

**Fix 2 — "License not found" defect.** The current code returns `{ valid: true, status: "active" }` when `getLicenseByKey` returns `null`. Replace with:

```javascript
if (!license) {
  return NextResponse.json({
    valid: false,
    status: "unknown",
    reason: "License not found. Please re-enter your license key or contact support.",
    retryAfter: 30,
  });
}
```

The `retryAfter: 30` handles the eventual consistency edge case during license provisioning.

#### Checkpoint 5 — Tests

Run all tests. Add tests for exhaustive status classification, heartbeat `valid: false` for expired/suspended, heartbeat `valid: false` for missing license. Bring to 100%.

---

### Checkpoint 6: Eliminate Keygen Read Calls

DynamoDB is the sole source of truth for all read operations. Keygen is write-only (mutations: create license, activate device, renew, reinstate, suspend, revoke, machine heartbeat ping). These three endpoints currently query Keygen at request time. Each must be rewritten to use DynamoDB exclusively.

#### 3.11 `/api/license/validate` — Replace Keygen `validateLicense` with DynamoDB

**File:** `src/app/api/license/validate/route.js`

**Current behavior (Mode 2 — license key provided):** Calls `validateLicense(licenseKey, fingerprint)` which hits the Keygen API. Uses the Keygen response for status, validity, and license metadata. Then does a DynamoDB `getLicenseDevices` lookup for device identity. Has a `HEARTBEAT_NOT_STARTED` self-healing path that calls `machineHeartbeat`.

**New behavior:** Replace the Keygen `validateLicense` call with DynamoDB lookups:

1. `getLicenseByKey(licenseKey)` — returns the LICENSE# record from DynamoDB (status, expiresAt, keygenLicenseId, etc.)
2. `getDeviceByFingerprint(license.keygenLicenseId, fingerprint)` — returns the DEVICE# record (keygenMachineId, lastSeenAt, etc.)

**Status determination:** Use `license.status` from DynamoDB directly. Check expiry: if `license.expiresAt < Date.now()` and status is still `"active"`, treat as expired.

**HEARTBEAT_NOT_STARTED handling:** Instead of relying on Keygen's `HEARTBEAT_NOT_STARTED` code, check the device record's `lastSeenAt`. If `lastSeenAt` is null/missing and the device has a `keygenMachineId`, fire `machineHeartbeat(keygenMachineId)` as before. This preserves the self-healing behavior without querying Keygen for status.

**Keep as Keygen mutations (fire-and-forget):** `machineHeartbeat(machineId)` and `updateDeviceLastSeen` — these are writes, not reads.

**Remove imports:** `validateLicense` from `@/lib/keygen`. Keep `machineHeartbeat`.

**Add imports:** `getLicenseByKey`, `getDeviceByFingerprint` from `@/lib/dynamodb`.

```javascript
// Directional — may contain errors
const license = await getLicenseByKey(licenseKey);
if (!license) {
  return NextResponse.json({ valid: false, code: "NOT_FOUND", detail: "License key not found" });
}

const isExpired = license.status === LICENSE_STATUS.EXPIRED ||
  (license.expiresAt && new Date(license.expiresAt) < new Date());
const isSuspended = [LICENSE_STATUS.PAYMENT_SUSPENDED, LICENSE_STATUS.ADMIN_SUSPENDED].includes(license.status);

if (isExpired || isSuspended) {
  return NextResponse.json({ valid: false, code: license.status.toUpperCase(), detail: `License is ${license.status}` });
}

const device = await getDeviceByFingerprint(license.keygenLicenseId, fingerprint);
// Self-healing: if device exists but never heartbeated, send first heartbeat
if (device?.keygenMachineId && !device.lastSeenAt) {
  machineHeartbeat(device.keygenMachineId).catch(() => {});
}
```

#### 3.12 `/api/portal/license` — Remove Keygen `getLicense` Call

**File:** `src/app/api/portal/license/route.js`

**Current behavior:** `buildLicenseResponse` calls both `getLicense` (DynamoDB) and `getKeygenLicense` (Keygen). Uses Keygen as the preferred source for `status` and `expiresAt`: `status: keygenLicense?.status || localLicense?.status || "unknown"`. This is the exact dual-source pattern that caused the original bug.

**New behavior:** Remove the `getKeygenLicense` call entirely. Use DynamoDB `getLicense` as the sole source:

```javascript
// Directional — may contain errors
async function buildLicenseResponse(customer, orgContext = null, log = null) {
  const license = await getLicense(customer.keygenLicenseId);

  const planName = customer.accountType === "business" ? "Business" : "Individual";
  const maskedKey = license?.licenseKey
    ? `${license.licenseKey.slice(0, 8)}...${license.licenseKey.slice(-4)}`
    : null;

  const response = {
    license: {
      id: customer.keygenLicenseId,
      licenseKey: license?.licenseKey,
      maskedKey,
      status: license?.status || "unknown",
      planType: customer.accountType,
      planName,
      expiresAt: license?.expiresAt,
      maxDevices: license?.maxDevices || 3,
      activatedDevices: license?.activatedDevices || 0,
      createdAt: license?.createdAt,
    },
    subscription: {
      status: customer.subscriptionStatus,
      stripeCustomerId: customer.stripeCustomerId,
    },
  };
  // ... orgContext handling unchanged
}
```

**Remove imports:** `getLicense as getKeygenLicense` from `@/lib/keygen`.

#### 3.13 `/api/license/check` — Remove Keygen `getLicensesByEmail` Fallback

**File:** `src/app/api/license/check/route.js`

**Current behavior:** First checks DynamoDB via `getCustomerByEmail`. If the customer has an active subscription, returns the license. Otherwise, falls back to `getLicensesByEmail(email)` — a Keygen API call that searches by email metadata. This fallback exists for the case where a customer exists in Keygen but not in DynamoDB.

**New behavior:** Remove the Keygen fallback entirely. If the customer doesn't exist in DynamoDB or doesn't have an active subscription, also check DynamoDB for license records via `getCustomerLicensesByEmail(email)` (already exists in `dynamodb.js`). This covers the edge case without hitting Keygen.

```javascript
// Directional — may contain errors
const customer = await getCustomerByEmail(email.toLowerCase());

if (customer && customer.keygenLicenseId) {
  const hasActiveSubscription = ["active", "trialing"].includes(customer.subscriptionStatus);
  if (hasActiveSubscription) {
    return NextResponse.json({ status: "active", licenseKey: customer.keygenLicenseKey || null, ... });
  }
}

// Fallback: check DynamoDB license records by email (replaces Keygen getLicensesByEmail)
const licenses = await getCustomerLicensesByEmail(email.toLowerCase());
const activeLicense = licenses.find(lic => lic.status === LICENSE_STATUS.ACTIVE || lic.status === LICENSE_STATUS.TRIAL);

if (activeLicense) {
  return NextResponse.json({ status: "active", licenseKey: activeLicense.licenseKey, ... });
}

const anyLicense = licenses[0];
if (anyLicense) {
  return NextResponse.json({ status: anyLicense.status || "unknown", ... });
}

return NextResponse.json({ status: "none", licenseKey: null, email: email.toLowerCase() });
```

**Remove imports:** `getLicensesByEmail` from `@/lib/keygen`.

**Add imports:** `getCustomerLicensesByEmail` from `@/lib/dynamodb`.

#### Checkpoint 6 — Keygen Read Elimination Tests

Run all tests. Add tests for DynamoDB-only validate flow (active, expired, suspended, not-found, heartbeat-not-started self-healing). Add tests for portal license without Keygen call. Add tests for check route DynamoDB fallback. Bring to 100%.

---

### Checkpoint 7: Metrics

#### 3.14 Update Metrics and Reporting

**File:** `scripts/plg-metrics.js`

Split `suspended` counter into `payment_suspended` and `admin_suspended`. The metrics script queries the Keygen API which returns UPPER_CASE — those comparisons stay UPPER_CASE. Any DynamoDB-sourced comparisons use the new lowercase values.

#### Checkpoint 7 — Metrics Tests

Run all tests. Bring to 100%.

---

### Checkpoint 8: Extension Updates

#### 3.15 Update Extension

**Repo:** `~/source/repos/hic`

**Files:** `licensing/constants.js`, `licensing/validation.js`, `licensing/state.js`, `licensing/http-client.js`, `licensing/heartbeat.js`, `mouse-vscode/src/licensing/heartbeat.js`, `mouse-vscode/src/licensing/validation.js`, `mouse-vscode/src/extension.js`, `licensing/commands/validate.js`

All changes are to source files in the Extension repo. The `.hic/licensing/` copies in the Website repo are updated by the VSIX install flow.

**Changes:**

**1. Normalize `LICENSE_STATES` to lowercase (`licensing/constants.js`).** Change all values to lowercase. Keys stay UPPER_CASE. Replace `SUSPENDED` with `PAYMENT_SUSPENDED` and `ADMIN_SUSPENDED`.

**2. Update validation allowlists (`licensing/validation.js`, `mouse-vscode/src/licensing/validation.js`).** Add `"payment_suspended"`, `"admin_suspended"`, `"unknown"` to `VALID_HEARTBEAT_STATUSES`. Add `"payment_suspended"`, `"admin_suspended"` to `VALID_LICENSE_STATES`. Remove bare `"suspended"`.

**3. Disambiguate heartbeat switch statement (`mouse-vscode/src/licensing/heartbeat.js`, `licensing/heartbeat.js`).** Replace `case "license_suspended":` / `case "suspended":` with `case "payment_suspended":` and `case "admin_suspended":`. Split `_handleLicenseSuspended` into two handlers:
- `_handleLicensePaymentSuspended`: shows "Payment issue detected. Please update your payment method" with billing link.
- `_handleLicenseAdminSuspended`: shows "Your access has been suspended by your organization administrator" — no billing link.

Add `case "unknown":` handler with retry-once logic: on receiving `status: "unknown"` with `retryAfter`, wait and retry the heartbeat once. If the second attempt also returns `"unknown"`, surface the error.

**4. Update `_mapServerStatusToState` (`mouse-vscode/src/licensing/heartbeat.js`).** Map `payment_suspended` and `admin_suspended` to their respective states. Remove `suspended` mapping.

**5. Update `http-client.js` suspended detection (`licensing/http-client.js`).** Change `response.license?.status === "suspended"` to check both `"payment_suspended"` and `"admin_suspended"`.

**6. Update `extension.js` status bar and notifications (`mouse-vscode/src/extension.js`).** Update `updateStatusBarForState` and `onStateChange` callback to handle `"payment_suspended"` and `"admin_suspended"` separately. All comparisons use lowercase.

**7. State migration (`licensing/state.js`).** In `load()`, normalize any UPPER_CASE status to lowercase. Migrate bare `"suspended"` → `"payment_suspended"` (license-level suspension is always payment-related in the extension context).

**8. Validate command (`licensing/commands/validate.js`).** Update suspended status mapping to use `LICENSE_STATES.PAYMENT_SUSPENDED`.

#### Checkpoint 8 — Extension Tests

Run extension tests. Fix breakage from `LICENSE_STATES` changes. Add tests for new handlers, retry-once logic, state migration. Bring to 100%.

---

### Checkpoint 9: Production Verification

#### 3.16 Verify Production Keygen Webhook Endpoint

The production Keygen webhook (`https://hic-ai.com/api/webhooks/keygen`) currently returns 405. This is a launch blocker.

1. Ensure the production deployment includes the webhook route.
2. Confirm the Keygen dashboard production webhook is set to `*` (all events).
3. Verify with a test event from the Keygen dashboard.
4. Confirm `KEYGEN_WEBHOOK_SECRET` is set in the production environment.

#### 3.17 Update Keygen Policy Durations

After `renewLicense` is deployed and tested on staging:

1. Update monthly policies to 33 days (2,851,200s).
2. Update annual policies to 368 days (31,795,200s).
3. Verify by triggering a test payment and confirming the new expiry date.

#### Checkpoint 9 — Final Verification

Run full test suite across both repos. Manual E2E on staging: trigger payment → verify DynamoDB + Keygen both show active with correct expiry. Grep verification: zero remaining bare `"suspended"` strings in source files.
## 4. Affected File Inventory

### Website Source Files (Modified)

| # | File | Checkpoint |
|---|---|---|
| 1 | `src/lib/constants.js` | 1 |
| 2 | `src/lib/keygen.js` | 1 |
| 3 | `src/app/api/webhooks/stripe/route.js` | 2 |
| 4 | `src/app/api/webhooks/keygen/route.js` | 2 |
| 5 | `infrastructure/lambda/customer-update/index.js` | 2 |
| 6 | `src/app/api/portal/team/route.js` | 3 |
| 7 | `src/app/portal/team/TeamManagement.js` | 3 |
| 8 | `dm/layers/ses/src/email-templates.js` | 4 |
| 9 | `dm/layers/ses/generate-email-preview.js` | 4 |
| 10 | `src/lib/ses.js` | 4 |
| 11 | `src/app/portal/page.js` | 5 |
| 12 | `src/app/portal/license/page.js` | 5 |
| 13 | `src/app/portal/billing/page.js` | 5 |
| 14 | `src/app/api/portal/status/route.js` | 5 |
| 15 | `src/app/api/license/heartbeat/route.js` | 5 |
| 16 | `src/app/api/license/validate/route.js` | 6 |
| 17 | `src/app/api/portal/license/route.js` | 6 |
| 18 | `src/app/api/license/check/route.js` | 6 |
| 19 | `scripts/plg-metrics.js` | 7 |

### Extension Source Files (Modified)

| # | File | Checkpoint |
|---|---|---|
| 20 | `licensing/constants.js` | 8 |
| 21 | `licensing/validation.js` | 8 |
| 22 | `licensing/state.js` | 8 |
| 23 | `licensing/http-client.js` | 8 |
| 24 | `licensing/heartbeat.js` | 8 |
| 25 | `mouse-vscode/src/licensing/heartbeat.js` | 8 |
| 26 | `mouse-vscode/src/licensing/validation.js` | 8 |
| 27 | `mouse-vscode/src/extension.js` | 8 |
| 28 | `licensing/commands/validate.js` | 8 |

### Website Test Files (Modified)

| # | File |
|---|---|
| 29 | `__tests__/unit/lib/constants.test.js` |
| 30 | `__tests__/unit/lib/keygen.test.js` |
| 31 | `__tests__/unit/api/webhooks.test.js` |
| 32 | `__tests__/unit/api/team.test.js` |
| 33 | `__tests__/unit/api/license.test.js` |
| 34 | `__tests__/unit/api/portal.test.js` |
| 35 | `__tests__/unit/lambda/customer-update.test.js` |
| 36 | `__tests__/unit/lambda/email-sender.test.js` |
| 37 | `__tests__/unit/scripts/plg-metrics.test.js` |
| 38 | `__tests__/fixtures/licenses.js` |
| 39 | `__tests__/fixtures/index.js` |
| 40 | `__tests__/e2e/contracts/webhook-api.test.js` |
| 41 | `__tests__/e2e/journeys/j3-license-activation.test.js` |
| 42 | `__tests__/e2e/journeys/j8-subscription-lifecycle.test.js` |
| 43 | `dm/tests/facade/unit/email-templates.test.js` |

---

## 5. What This Plan Does NOT Include

The following items from the V2 plan and the parent `20260305_KEYGEN_WEBHOOK_REMEDIATION_PLAN.md` are explicitly deferred. They are post-launch hardening, not launch blockers:

- SQS queue + DLQ for async Keygen mutation sync
- License reconciliation scheduled task
- Circuit breaker for Keygen mutation calls
- Admin → Keygen device deactivation sync
- Legacy DynamoDB data migration (we are in staging — zero legacy data)
- Transitional guards for old/new status values
- CloudWatch alarms for Keygen sync
- Integration test for full Stripe → DynamoDB → Keygen cycle
