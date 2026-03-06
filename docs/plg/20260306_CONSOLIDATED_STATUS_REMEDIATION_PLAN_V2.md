# Consolidated Status Remediation Plan v2

**Date:** March 6, 2026
**Author:** SWR, with research by GitHub Copilot (Claude Opus 4.6) and Kiro (Claude Opus 4.6)
**Status:** Draft — awaiting review and approval
**Parent:** `docs/plg/20260305_KEYGEN_WEBHOOK_REMEDIATION_PLAN.md`

---

## 1. Background and Scope

### 1.1 Problems

**Naming collision: `"suspended"` used for two unrelated concepts.** The string `"suspended"` is written to DynamoDB by both the payment failure path (Stripe webhook → LICENSE# and CUSTOMER# records) and the admin action path (portal team management → MEMBER# records). These two paths share the same status string, the same event type (`LICENSE_SUSPENDED`), and the same email template (`licenseSuspended`). The result: a payment-suspended customer and an admin-suspended team member receive identical emails, support investigations cannot distinguish the two causes from DynamoDB records alone, and the admin suspension path never syncs to Keygen (creating a sync gap where a suspended member's devices remain active in Keygen). The same ambiguity applies to `"revoked"` — used for both admin revocation of a member and referenced in the Keygen webhook's `handleLicenseRevoked` handler, despite these being unrelated operations.

**Missing `renewLicense` call: Keygen expiry drifts from Stripe.** The codebase never calls Keygen's `POST /licenses/{id}/actions/renew`. When Stripe confirms a successful subscription payment, the handler updates DynamoDB and reinstates the Keygen license if it was suspended — but does not extend the Keygen license expiry. Keygen's internal expiry clock ticks independently, and when it hits zero, Keygen declares the license expired even though Stripe and DynamoDB both show an active subscription. The `renewLicense` function does not exist in `keygen.js`.

**Heartbeat masks expired/suspended licenses.** The heartbeat endpoint (`/api/license/heartbeat`) pings the Keygen machine and returns `{ valid: true, status: "active" }` when the machine is alive — regardless of whether the Keygen license is expired or the DynamoDB license is suspended. The validate endpoint checks actual license status and returns `valid: false` when appropriate. The extension treats both responses as authoritative for the same state, so the status bar shows whichever ran last — creating a race condition where the heartbeat overwrites an expired state every 10 minutes. Additionally, when the license is not found in DynamoDB at all, the heartbeat returns `valid: true, status: "active"`, which is a critical defect allowing indefinite use without a valid license record.

**Casing inconsistency compounds all three problems.** The `LICENSE_STATUS` enum in `constants.js` defines UPPER_CASE values (`"ACTIVE"`, `"PAST_DUE"`) but is never referenced by any writer — all 8 DynamoDB writer files use hardcoded lowercase strings. Keygen returns UPPER_CASE status across all endpoints. Portal pages use `.toUpperCase()` bridges to convert lowercase DynamoDB values to match the UPPER_CASE display map keys. The billing page has an entirely independent lowercase labels map. Test fixtures contradict each other (some UPPER_CASE, some lowercase). The extension stores UPPER_CASE constants but normalizes to lowercase on read. Introducing new status strings like `"payment_suspended"` into this environment without first normalizing casing would perpetuate the split. All casing is standardized to lowercase in this plan.

### 1.2 Scope

This plan consolidates and supersedes the parent plan (`20260305_KEYGEN_WEBHOOK_REMEDIATION_PLAN.md`). All items are pre-launch requirements.

- Status string disambiguation: `"suspended"` → `"payment_suspended"` / `"admin_suspended"`; `"revoked"` → `"admin_revoked"` / `"license_revoked_unclassified"`
- Casing normalization: UPPER_CASE enum values → lowercase; all writers reference enum constants
- `RETIRED` dead code removal
- `EVENT_TYPES` enum creation (all event type strings currently hardcoded at each call site)
- `renewLicense` function and Stripe webhook integration
- Keygen `.toLowerCase()` normalization at all API boundaries
- Heartbeat race condition fix (license status check) and "license not found" defect fix
- Portal status route exhaustive status classification fix
- `.toUpperCase()` bridge removal and billing labels consolidation
- Email template split: 5 new templates replacing 1 ambiguous template
- Admin → Keygen sync gap closure (member device deactivation)
- `MEMBER_REACTIVATED` event and email for the reactivation path (currently has no audit trail)
- Eliminate Keygen read calls from validate, check, heartbeat, and portal endpoints (DynamoDB becomes source of truth for request paths)
- SQS queue + DLQ for async Keygen mutation sync (renew, reinstate, suspend, revoke)
- License reconciliation scheduled task (drift detection and correction)
- Circuit breaker for Keygen mutation calls on request-time paths (create license, activate device)
- Production Keygen webhook endpoint deployment and verification
- CloudWatch alarms for DLQ depth, renewal failures, reconciliation corrections, Keygen API error rate
- Integration test for full Stripe → DynamoDB → Keygen sync cycle
- Policy duration rationale documentation
- Extension updates: casing normalization, heartbeat switch statement, retry-once logic for `"unknown"` status
- Backward compatibility / migration for legacy DynamoDB records
- All associated test updates

## 2. Prerequisites

**Completed: Staging webhook subscription.** On March 5, 2026, the staging Keygen webhook was switched from a specific event list to `*` (all events), matching production. Prior to this, the staging webhook was not subscribed to `license.renewed`, `license.suspended`, `license.reinstated`, or `license.revoked` — handlers for these events existed but never fired on staging.

**Completed: Manual license renewal.** On March 5, 2026, the license for `[REDACTED:email]` was manually renewed from the Keygen dashboard after the webhook subscription fix. The staging endpoint received the `license.renewed` event and `handleLicenseRenewed` executed successfully.

**Pending: Keygen policy duration update.** The Keygen policy durations must be updated in the Keygen dashboard **after** Step 3.5 (`renewLicense` integration) is deployed and tested:

| Policy | Current Duration | New Duration | Rationale |
|---|---|---|---|
| Individual/Business Monthly | 30 days (2,592,000s) | 33 days (2,851,200s) | Billing period + 3 days buffer for webhook delivery delays, cold start timeouts, deployment gaps, and reconciliation job execution interval |
| Individual/Business Annual | 30 days (2,592,000s) | 368 days (31,795,200s) | Billing period + 3 days buffer |

Do NOT change durations before `renewLicense` is live. The current 30-day duration with no renewal call causes expiry after exactly 30 days. Extending without the renewal call just delays the same problem.

## 3. Implementation Plan

### Checkpoint 1: Foundation

#### 3.1 Remove RETIRED Dead Code

Remove `RETIRED: "RETIRED"` from `LICENSE_STATUS` and `RETIRED: { label: "Retired", variant: "error" }` from `LICENSE_STATUS_DISPLAY` in `src/lib/constants.js`. Remove the corresponding test assertion in `__tests__/unit/lib/constants.test.js`. 3 lines across 2 files. Dead code from deferred Enterprise tier.

#### 3.2 Update Constants (Lowercase Values + New Statuses + EVENT_TYPES Enum)

**`LICENSE_STATUS` enum:** Change all values from UPPER_CASE to lowercase. Keys stay UPPER_CASE (JS constants). Remove `RETIRED`. Add:
- `PAYMENT_SUSPENDED: "payment_suspended"`
- `ADMIN_SUSPENDED: "admin_suspended"`
- `ADMIN_REVOKED: "admin_revoked"`
- `LICENSE_REVOKED_UNCLASSIFIED: "license_revoked_unclassified"`
- Stripe-specific statuses: `TRIALING: "trialing"`, `UNPAID: "unpaid"`, `INCOMPLETE: "incomplete"`, `INCOMPLETE_EXPIRED: "incomplete_expired"`, `PENDING: "pending"`, `PAUSED: "paused"`

**`LICENSE_STATUS_DISPLAY`:** Change all keys to lowercase. Add display entries for all new statuses. Remove `RETIRED`.

**`EVENT_TYPES` enum (new export):** Create with all event type strings currently hardcoded at call sites:
`LICENSE_CREATED`, `LICENSE_ACTIVATED`, `LICENSE_PAYMENT_SUSPENDED`, `LICENSE_REINSTATED`, `LICENSE_EXPIRED`, `LICENSE_RENEWED`, `LICENSE_CANCELED`, `LICENSE_DISPUTED`, `LICENSE_REVOKED_UNCLASSIFIED`, `DISPUTE_RESOLVED`, `MEMBER_SUSPENDED`, `MEMBER_REVOKED`, `MEMBER_REACTIVATED`, `MEMBER_INVITED`, `PAYMENT_FAILED`, `NONPAYMENT_CANCELLATION_EXPIRED`, `VOLUNTARY_CANCELLATION_EXPIRED`, `SUBSCRIPTION_REACTIVATED`, `CUSTOMER_CREATED`, `CANCELLATION_REQUESTED`, `CANCELLATION_REVERSED`.

All downstream writers must reference these enum constants instead of hardcoded strings.

#### 3.3 Add Keygen `.toLowerCase()` Normalization at API Boundaries

Keygen returns UPPER_CASE status (`"ACTIVE"`, `"SUSPENDED"`, `"EXPIRED"`) across all endpoints. Add `.toLowerCase()` normalization at every point where Keygen status enters our system:

- `keygen.js` → `validateLicense` return value: `status: response.data.attributes.status.toLowerCase()`
- `keygen.js` → `getLicense` return value: same treatment
- `src/app/api/license/validate/route.js` → normalize Keygen status before returning to extension
- `src/app/api/portal/license/route.js` → normalize `keygenLicense?.status` before use
- `src/app/api/license/check/route.js` → normalize `activeLicense.status` (currently does ad-hoc `.toLowerCase()`; replace with consistent normalization)
- `scripts/plg-metrics.js` → add `.toLowerCase()` when comparing Keygen list API responses (currently compares against UPPER_CASE; must compare against lowercase after normalization)

#### 3.4 Add `renewLicense` to `keygen.js`

Add `renewLicense(licenseId)` function to `src/lib/keygen.js`. Calls `POST /licenses/${licenseId}/actions/renew`. Returns `{ id, status, expiresAt }` from response. Follows the same pattern as `reinstateLicense` and `suspendLicense`.

#### 3.1C Checkpoint 1 — Tests

Run all tests. Fix breakage from casing/enum changes. Bring to 100%. Add tests for `renewLicense` and `.toLowerCase()` normalization. Bring to 100%.

### Checkpoint 2: Payment Path Disambiguation + Expiration Fix

#### 3.5 Update Payment Suspension Path

**Files:** `src/app/api/webhooks/stripe/route.js`, `src/app/api/webhooks/keygen/route.js`, `infrastructure/lambda/customer-update/index.js`

**Stripe webhook (`route.js`):** 9 touch points across 5 handler functions.
- `handleSubscriptionUpdated`: `statusMap` entry `unpaid: "suspended"` → `unpaid: LICENSE_STATUS.PAYMENT_SUSPENDED`. All `statusMap` entries should reference `LICENSE_STATUS` constants.
- `handleSubscriptionUpdated`: reinstatement check `dbCustomer.subscriptionStatus === "suspended"` → `=== LICENSE_STATUS.PAYMENT_SUSPENDED`
- `handleSubscriptionDeleted`: `priorStatus === "suspended"` → `=== LICENSE_STATUS.PAYMENT_SUSPENDED`
- `handlePaymentSucceeded`: reinstatement check `dbCustomer.subscriptionStatus === "suspended"` → `=== LICENSE_STATUS.PAYMENT_SUSPENDED`. Add `renewLicense(dbCustomer.keygenLicenseId)` call AFTER reinstatement. Reinstate-before-renew ordering is critical (Keygen may reject renew on a suspended license).
- `handlePaymentFailed`: `subscriptionStatus: "suspended"` → `LICENSE_STATUS.PAYMENT_SUSPENDED`; `updateLicenseStatus(id, "suspended")` → `LICENSE_STATUS.PAYMENT_SUSPENDED`
- `handleDisputeClosed`: `subscriptionStatus: "suspended"` → `LICENSE_STATUS.PAYMENT_SUSPENDED`

**Keygen webhook (`route.js`):** `handleLicenseSuspended` — change `updateLicenseStatus(licenseId, "suspended", ...)` → `LICENSE_STATUS.PAYMENT_SUSPENDED`; change `eventType: "LICENSE_SUSPENDED"` → `EVENT_TYPES.LICENSE_PAYMENT_SUSPENDED`.

**Customer-update Lambda:** `priorStatus === "suspended"` → `"payment_suspended"`; `updateLicenseStatus(id, "suspended", ...)` → `"payment_suspended"`. Fix `wasSuspended` variable: rename to `wasSuspendedForNonpayment`, expand condition to include `customer.subscriptionStatus === "payment_suspended"` (currently only checks `"past_due"` and `paymentFailureCount`).

#### 3.2C Checkpoint 2 — Tests

Run all tests. Fix breakage from `"suspended"` → `"payment_suspended"` across payment path. Add tests for `renewLicense` call in `handlePaymentSucceeded`, `wasSuspendedForNonpayment` fix, reinstate-before-renew ordering. Bring to 100%.

### Checkpoint 3: Admin Path Disambiguation

#### 3.6 Update Admin Suspension and Revocation Path

**Files:** `src/app/api/portal/team/route.js`, `src/app/portal/team/TeamManagement.js`

**`portal/team/route.js` — `update_status` action:**
- Validation array: `["active", "suspended", "revoked"]` → `["active", "admin_suspended", "admin_revoked"]`
- Error message: update to match new values
- Event type: `status === "suspended" ? "LICENSE_SUSPENDED" : "LICENSE_REVOKED"` → `status === "admin_suspended" ? EVENT_TYPES.MEMBER_SUSPENDED : EVENT_TYPES.MEMBER_REVOKED`
- Invite status update: `updateOrgInviteStatus(orgId, targetMember.inviteId, status)` — passes through the new status strings, no additional change needed

**`portal/team/route.js` — `update_status` action — reactivation path:**
When `status === "active"` is passed (reactivating a suspended/revoked member), the handler currently writes no event record and sends no email. Add: `writeEventRecord(EVENT_TYPES.MEMBER_REACTIVATED, { email, userId, organizationName })` after `updateOrgMemberStatus`.

**`portal/team/route.js` — DELETE handler:**
- `updateOrgInviteStatus(orgId, targetMember.inviteId, "revoked")` → `"admin_revoked"`
- `writeEventRecord("LICENSE_REVOKED", ...)` → `EVENT_TYPES.MEMBER_REVOKED`

**`TeamManagement.js`:** All UI references to `"suspended"` → `"admin_suspended"`, all `"revoked"` comparisons implicit via status values passed to `handleUpdateStatus`. ~5 touch points (confirm dialog text, badge color conditionals, button onClick handlers for desktop and mobile views).

#### 3.7 Update `handleLicenseRevoked` in Keygen Webhook

**File:** `src/app/api/webhooks/keygen/route.js`

`handleLicenseRevoked` currently writes `"revoked"` status and `"LICENSE_REVOKED"` event type to DynamoDB. No automated code path calls `revokeLicense()` today — this handler only fires if a license is manually revoked from the Keygen dashboard.

Change: `updateLicenseStatus(licenseId, "revoked", { eventType: "LICENSE_REVOKED" })` → `updateLicenseStatus(licenseId, "license_revoked_unclassified", { eventType: EVENT_TYPES.LICENSE_REVOKED_UNCLASSIFIED })`. Add `log.warn` noting that license-level revocation business logic is not yet implemented. This is a catch-all — specific revocation types (ToS violations, disputes, etc.) will get their own status strings post-launch.

#### 3.3C Checkpoint 3 — Tests

Run all tests. Fix breakage from `"suspended"` → `"admin_suspended"`, `"revoked"` → `"admin_revoked"`, `"LICENSE_SUSPENDED"` → `"MEMBER_SUSPENDED"` / `"MEMBER_REVOKED"`. Add tests for `MEMBER_REACTIVATED` event. Bring to 100%.

---

### Checkpoint 4: Email Templates

#### 3.8 Create Email Templates

**File:** `dm/layers/ses/src/email-templates.js`, `dm/layers/ses/generate-email-preview.js`, `src/lib/ses.js`

**5 new templates:**
1. `licensePaymentSuspended` — replaces `licenseSuspended` for payment failures. Subject: "Action Required: Update Your Payment Method". CTA: link to `/portal/billing`.
2. `memberSuspended` — admin suspends a team member. Subject: "Your access via [OrgName] has been suspended". Receives `organizationName` parameter.
3. `memberRevoked` — admin revokes a team member. Subject: "Your access via [OrgName] has been revoked". Receives `organizationName` parameter.
4. `memberReactivated` — admin reactivates a suspended/revoked member. Subject: "Your access via [OrgName] has been restored". Receives `organizationName` parameter.
5. `licenseRevokedUnclassified` — Keygen license-level revocation (catch-all). Subject: "Your license has been revoked". Generic message directing user to contact support.

**`EVENT_TYPE_TO_TEMPLATE` mapping updates:**
- `LICENSE_SUSPENDED: "licenseSuspended"` → `LICENSE_PAYMENT_SUSPENDED: "licensePaymentSuspended"`
- Add `MEMBER_SUSPENDED: "memberSuspended"`
- Add `MEMBER_REVOKED: "memberRevoked"`
- Add `MEMBER_REACTIVATED: "memberReactivated"`
- Add `LICENSE_REVOKED_UNCLASSIFIED: "licenseRevokedUnclassified"`
- Keep `LICENSE_SUSPENDED: "licensePaymentSuspended"` as backward-compat mapping for unprocessed events in flight
- `LICENSE_REVOKED: "licenseRevoked"` — keep existing template for backward compat; existing `licenseRevoked` template remains for legacy events

**`TEMPLATE_NAMES` array:** Add all 5 new template names.

**`generate-email-preview.js`:** Add preview data and metadata entries for all 5 new templates.

**`ses.js`:** Rename `sendLicenseRevokedEmail` or add new wrapper functions as needed to match new template names.

#### 3.4C Checkpoint 4 — Tests

Run all tests. Fix email pipeline breakage. Add tests for all 5 new templates and backward-compat mapping for `LICENSE_SUSPENDED` → `licensePaymentSuspended`. Bring to 100%.

---

### Checkpoint 5: Portal and Heartbeat Fixes

#### 3.9 Remove Casing Bridges and Consolidate Billing Labels

**Files:** `src/app/portal/page.js`, `src/app/portal/license/page.js`, `src/app/portal/billing/page.js`

**Remove `.toUpperCase()` bridges (2 files):**

`portal/page.js` (~line 265):

```javascript
// Before:
LICENSE_STATUS_DISPLAY[subscriptionStatus?.toUpperCase()]
// After:
LICENSE_STATUS_DISPLAY[subscriptionStatus]
```

The fallback also changes: `LICENSE_STATUS_DISPLAY.ACTIVE` → `LICENSE_STATUS_DISPLAY.active`.

`portal/license/page.js` (~line 111):

```javascript
// Before:
const licenseStatus = license.status?.toUpperCase() || "ACTIVE";
const statusDisplay = LICENSE_STATUS_DISPLAY[licenseStatus] || LICENSE_STATUS_DISPLAY.ACTIVE;
// After:
const licenseStatus = license.status || "active";
const statusDisplay = LICENSE_STATUS_DISPLAY[licenseStatus] || LICENSE_STATUS_DISPLAY.active;
```

These `.toUpperCase()` calls were duct tape bridging lowercase DynamoDB/Keygen values to UPPER_CASE `LICENSE_STATUS_DISPLAY` keys. With lowercase keys (Step 3.2), the bridge is eliminated.

**Consolidate billing labels map (1 file):**

`portal/billing/page.js` (~lines 338-365) has two independent hardcoded maps (`variants` and `labels`) that duplicate `LICENSE_STATUS_DISPLAY`. Replace with a reference to the shared constant:

```javascript
// Before: independent hardcoded map
const labels = {
  active: "Active",
  trialing: "Trial",
  past_due: "Past Due",
  // ... 9 entries
};

// After: use shared constant
import { LICENSE_STATUS_DISPLAY } from "@/lib/constants";
const getStatusLabel = (status) =>
  LICENSE_STATUS_DISPLAY[status]?.label || status;
const getStatusVariant = (status) =>
  LICENSE_STATUS_DISPLAY[status]?.variant || "secondary";
```

**Prerequisite:** The billing page includes Stripe-specific statuses (`trialing`, `unpaid`, `incomplete`, `incomplete_expired`, `pending`, `paused`) that do not exist in `LICENSE_STATUS_DISPLAY`. These must be added to `LICENSE_STATUS_DISPLAY` in Step 3.2 to ensure complete coverage before this step executes.

#### 3.10 Fix Portal Status Route Classification

**File:** `src/app/api/portal/status/route.js`

**Pre-existing bug:** The current code classifies subscription statuses into two arrays:

```javascript
const hasActiveSubscription = ["active", "trialing", "cancellation_pending"].includes(subscriptionStatus);
const hasExpiredSubscription = ["canceled", "past_due", "unpaid"].includes(subscriptionStatus);
```

This is incomplete. `past_due` is in `hasExpiredSubscription`, which causes the portal to return `status: "expired"` — wrong, because `past_due` is a grace period where Stripe is actively retrying payment. Returning `"expired"` redirects the user to checkout instead of showing an "update your payment method" message.

The following statuses are not covered by either array and fall through to `status: "none"`, causing the portal to redirect the user to checkout as if they have no subscription: `payment_suspended`, `admin_suspended`, `admin_revoked`, `expired`, `disputed`.

**Fix — exhaustive classification with all known statuses:**

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

The response `status` field becomes a 5-way branch. The `"suspended"` case passes through the actual `subscriptionStatus` value (e.g., `"payment_suspended"` or `"admin_suspended"`) rather than returning the bare string `"suspended"` — which would reintroduce the exact naming ambiguity this plan eliminates:

```javascript
function resolvePortalStatus(subscriptionStatus) {
  if (hasActiveSubscription) return "active";
  if (hasPastDueSubscription) return "past_due";
  if (hasSuspendedSubscription) return subscriptionStatus; // "payment_suspended" or "admin_suspended"
  if (hasExpiredSubscription) return "expired";

  log.warn("unclassified_subscription_status", "Subscription status not in any known category", {
    subscriptionStatus,
  });
  return "none";
}

const response = {
  status: resolvePortalStatus(subscriptionStatus),
  // ...
};
```

The portal UI receives the disambiguated status string directly and can show the appropriate message without inspecting a secondary field: `"payment_suspended"` → "Please update your payment method"; `"admin_suspended"` → "Your access has been suspended by your organization administrator." Any `subscriptionStatus` value not in one of the four arrays should be logged as a warning and treated as `"none"` (redirect to checkout) as a safe default — but this should never happen if the enum is kept in sync with all writers.

#### 3.11 Fix Heartbeat Race Condition and "License Not Found" Defect

**File:** `src/app/api/license/heartbeat/route.js`

**Two fixes:**

**Fix 1 — License status check (race condition).** After the license is found in DynamoDB via `getLicenseByKey`, add a status check before returning `valid: true`:

```javascript
// Check if license is expired/suspended in DynamoDB
if (
  license.status === LICENSE_STATUS.EXPIRED ||
  license.status === LICENSE_STATUS.PAYMENT_SUSPENDED ||
  license.status === LICENSE_STATUS.ADMIN_SUSPENDED
) {
  return NextResponse.json({
    valid: false,
    status: `license_${license.status}`,
    reason: `License is ${license.status}`,
    concurrentMachines: 0,
    maxMachines: 0,
  });
}
```

This prevents the heartbeat from masking an expired or suspended license. The extension will learn about the status change within one heartbeat cycle (10 minutes) instead of waiting for the next `_doRefresh` validate call. Uses the new disambiguated status strings from Step 3.2.

**Fix 2 — "License not found" defect (critical).** The current code (~lines 270-290) returns `{ valid: true, status: "active" }` when `getLicenseByKey(licenseKey)` returns `null`. This is a critical defect — a missing DynamoDB license record should never be treated as active. This allows a user with no valid license record to continue using Mouse indefinitely as long as their Keygen machine heartbeat succeeds.

Replace the "license not found" fallback with:

```javascript
if (!license) {
  log.warn("license_not_found_in_db", "License key not found in DynamoDB", {
    hasLicenseKey: true,
    machinePingSucceeded: true,
  });

  return NextResponse.json({
    valid: false,
    status: "unknown",
    reason: "License not found. Please re-enter your license key or contact support.",
    retryAfter: 30,
    concurrentMachines: 0,
    maxMachines: 0,
  });
}
```

The `retryAfter: 30` field handles the eventual consistency edge case where a newly provisioned license has not yet propagated to DynamoDB (e.g., Stripe webhook → Lambda → DynamoDB write is still in flight). The extension should implement retry-once behavior: on receiving `status: "unknown"` with `retryAfter`, wait the specified seconds and retry the heartbeat once. If the second attempt also returns `"unknown"`, surface the error to the user. This prevents false-positive "license not found" errors during the payment/licensing relay window.

#### 3.5C Checkpoint 5 — Tests

Run all tests. Add tests for exhaustive status classification, heartbeat `valid: false` for expired/suspended, heartbeat `valid: false` for missing license. Bring to 100%.

---

### Checkpoint 6: Infrastructure

#### 3.12 Add SQS Queue + DLQ for Keygen Mutation Sync

**Files:** `infrastructure/cloudformation/plg-messaging.yaml`, `infrastructure/cloudformation/plg-compute.yaml`, `infrastructure/cloudformation/plg-iam.yaml`, `infrastructure/cloudformation/plg-main-stack.yaml`, `infrastructure/lambda/keygen-sync/index.js` (new)

**Queue definition** in `plg-messaging.yaml` — follows the exact pattern of the existing `EmailQueue`/`EmailDLQ` and `CustomerUpdateQueue`/`CustomerUpdateDLQ`:

```yaml
KeygenSyncDLQ:
  Type: AWS::SQS::Queue
  DeletionPolicy: Delete
  UpdateReplacePolicy: Delete
  Properties:
    QueueName: !Sub "plg-keygen-sync-dlq-${Environment}"
    MessageRetentionPeriod: 1209600 # 14 days
    Tags:
      - Key: Environment
        Value: !Ref Environment
      - Key: Application
        Value: plg-website

KeygenSyncQueue:
  Type: AWS::SQS::Queue
  DeletionPolicy: Delete
  UpdateReplacePolicy: Delete
  Properties:
    QueueName: !Sub "plg-keygen-sync-queue-${Environment}"
    VisibilityTimeout: 300 # 5 minutes (must be > Lambda timeout)
    MessageRetentionPeriod: 345600 # 4 days
    RedrivePolicy:
      deadLetterTargetArn: !GetAtt KeygenSyncDLQ.Arn
      maxReceiveCount: 3 # 3 attempts before DLQ
    Tags:
      - Key: Environment
        Value: !Ref Environment
      - Key: Application
        Value: plg-website
```

Add queue policy allowing the `LicenseEventsTopic` SNS topic to send messages. Add outputs for `KeygenSyncQueueUrl`, `KeygenSyncQueueArn`, `KeygenSyncDLQUrl`, `KeygenSyncDLQArn`.

**Queue message schema:**

```json
{
  "action": "renew | reinstate | suspend | revoke | deactivate_machine",
  "licenseId": "fab54aac-ea94-4d55-a2be-3e7c1ffe2cbd",
  "machineId": "optional — required for deactivate_machine",
  "triggeredBy": "stripe_webhook | admin_action | reconciliation | manual",
  "correlationId": "stripe-evt-xxx or reconciliation-run-xxx",
  "enqueuedAt": "2026-03-05T12:00:00.000Z",
  "retryCount": 0
}
```

**Worker Lambda** (`infrastructure/lambda/keygen-sync/index.js` — file #33, new):

```javascript
import { renewLicense, reinstateLicense, suspendLicense, revokeLicense } from "./keygen.js";
// keygen.js copied into Lambda source directory by deploy.sh at build time

const KEYGEN_ACTIONS = {
  renew: (msg) => renewLicense(msg.licenseId),
  reinstate: (msg) => reinstateLicense(msg.licenseId),
  suspend: (msg) => suspendLicense(msg.licenseId),
  revoke: (msg) => revokeLicense(msg.licenseId),
  deactivate_machine: (msg) => deactivateMachine(msg.machineId),
};

async function handleKeygenSync(record) {
  const message = JSON.parse(record.body);
  const handler = KEYGEN_ACTIONS[message.action];
  if (!handler) throw new Error(`Unknown Keygen sync action: ${message.action}`);
  await handler(message);
}
```

Register the Lambda in `plg-compute.yaml` with SQS event source mapping to `KeygenSyncQueue`. Wire IAM permissions in `plg-iam.yaml` (SQS consume + Keygen API secrets access). Add log group in `plg-monitoring.yaml`.

**Updated webhook handler pattern** — DynamoDB update happens synchronously in the webhook handler; Keygen API call is enqueued for async processing with retries:

```javascript
// In handlePaymentSucceeded (replaces direct renewLicense call from Step 3.5):
await updateLicenseStatus(licenseId, LICENSE_STATUS.ACTIVE, { expiresAt }); // DynamoDB — immediate
await enqueueKeygenSync({
  action: "renew",
  licenseId: dbCustomer.keygenLicenseId,
  triggeredBy: "stripe_webhook",
  correlationId: invoice.id,
});
```

DynamoDB is correct immediately. Keygen sync happens with retry guarantees. If all 3 retries fail, the message lands in the DLQ for operational review, and the reconciliation job (3.14) catches the drift on its next run.

#### 3.13 Close Admin → Keygen Sync Gap

**File:** `src/app/api/portal/team/route.js`, `src/lib/dynamodb.js`

Currently, when an admin suspends or revokes a member:

1. `updateOrgMemberStatus(orgId, memberId, "admin_suspended")` → DynamoDB ✓
2. Email pipeline triggered → ✓
3. **Keygen: nothing happens** → ✗

For Business licenses with multiple seats, the member's device entitlements in Keygen should be deactivated when the member is suspended or revoked.

**New function required in `dynamodb.js`:** `getMemberDevices(orgId, memberId)` — queries DEVICE# records filtered by `userId` matching the member's `userId`. This function does not exist today and must be created. It queries the DynamoDB table for all DEVICE# records associated with the member's license, filtered to the specific member's userId.

**Implementation** in `portal/team/route.js`, after `updateOrgMemberStatus`:

```javascript
if (status === LICENSE_STATUS.ADMIN_SUSPENDED || status === LICENSE_STATUS.ADMIN_REVOKED) {
  // Deactivate member's machines in Keygen via sync queue
  try {
    const memberDevices = await getMemberDevices(orgId, targetMember.userId);
    for (const device of memberDevices) {
      await enqueueKeygenSync({
        action: "deactivate_machine",
        machineId: device.keygenMachineId,
        licenseId: orgOwnerCustomer.keygenLicenseId,
        triggeredBy: "admin_action",
        correlationId: `admin-${status}-${targetMember.userId}`,
      });
    }
  } catch (e) {
    log.warn("member_device_deactivation_enqueue_failed",
      "Failed to enqueue device deactivation for suspended/revoked member", {
        memberId: targetMember.userId,
        errorMessage: e?.message,
      });
    // Non-fatal — reconciliation job will catch the drift
  }
}
```

Depends on 3.12 (the Keygen sync queue must exist). The keygen-sync worker (3.12) needs a `deactivate_machine` handler that calls Keygen's `DELETE /machines/{id}` endpoint.

#### 3.14 Add License Reconciliation Scheduled Task

**File:** `infrastructure/lambda/scheduled-tasks/index.js`

Add `handleLicenseReconciliation` to the `TASK_HANDLERS` registry (currently has `handlePendingEmailRetry`, `handleWinback30`, `handleWinback90`, `handleMouseVersionNotify`). Runs every 6 hours via EventBridge rule — frequent enough to catch drift within a single business day, infrequent enough to stay within Keygen API rate limits.

**Registration:**

```javascript
const TASK_HANDLERS = {
  "pending-email-retry": handlePendingEmailRetry,
  "winback-30": handleWinback30,
  "winback-90": handleWinback90,
  "mouse-version-notify": handleMouseVersionNotify,
  "license-reconciliation": handleLicenseReconciliation, // NEW
};
```

**Logic:**

```
license-reconciliation:
  1. Query DynamoDB for all LICENSE# records where:
     - status = "active" AND expiresAt is within 72 hours, OR
     - status = "expired" AND updatedAt is within 7 days (recent expirations)
  2. For each license:
     a. Call Keygen GET /licenses/{id} to fetch current state
     b. Compare DynamoDB status vs. Keygen status (.toLowerCase())
     c. If diverged:
        - If DynamoDB = "active" but Keygen = "expired":
            → Check Stripe subscription status
            → If Stripe is active/paid: enqueue renewLicense to SQS
            → If Stripe is cancelled/past_due: update DynamoDB to "expired"
        - If DynamoDB = "expired" but Keygen = "active":
            → Update DynamoDB to "active" with Keygen's expiry
        - Log all corrections with correlation IDs
  3. Migrate legacy records:
     - LICENSE# with status = "suspended" → "payment_suspended"
       (use suspendReason metadata as discriminator)
     - MEMBER# with status = "suspended" → "admin_suspended"
       (MEMBER# suspensions are always admin-initiated)
     - Normalize any UPPER_CASE status values to lowercase
  4. Emit CloudWatch metric: reconciliation_corrections_count
  5. If corrections > threshold (5): fire SNS alert
```

**Rate limiting:** Batch Keygen queries; respect rate limit headers; exponential backoff. The 6-hour interval means each run processes at most a few dozen licenses (those approaching expiry), well within Keygen's rate limits.

**EventBridge rule** — add to `plg-compute.yaml`:

```yaml
LicenseReconciliationRule:
  Type: AWS::Events::Rule
  Properties:
    Name: !Sub "plg-license-reconciliation-${Environment}"
    ScheduleExpression: "rate(6 hours)"
    State: ENABLED
    Targets:
      - Arn: !GetAtt ScheduledTasksFunction.Arn
        Id: LicenseReconciliation
        Input: '{"taskName": "license-reconciliation"}'
```

#### 3.15 Add Circuit Breaker for Keygen Mutations

**Files:** `src/lib/keygen.js` (or new `src/lib/circuit-breaker.js`)

For request-time Keygen mutation paths that cannot be deferred to the SQS queue — specifically `createLicense` in `provision-license/route.js` and device activation — add a circuit breaker that prevents cascading failures during a Keygen outage.

The queue-backed paths (renew, reinstate, suspend, revoke) do NOT need a circuit breaker because SQS retries handle transient failures automatically.

**Behavior:**

| State | Behavior |
|---|---|
| Closed (normal) | All Keygen calls proceed normally. Track failure count in sliding window. |
| Open (tripped) | All Keygen calls immediately return a graceful error ("try again in a few minutes") without calling the API. |
| Half-open (probing) | Allow one test call through. If it succeeds → close. If it fails → re-open. |

**Defaults:**

- Failure threshold: 5 consecutive failures to open the circuit
- Half-open probe interval: 30 seconds
- Sliding window: 60 seconds
- Graceful error response: `{ error: "License service temporarily unavailable. Please try again in a few minutes.", retryAfter: 60 }`

**Implementation pattern:**

```javascript
const circuitBreaker = createCircuitBreaker({
  name: "keygen-mutations",
  failureThreshold: 5,
  halfOpenIntervalMs: 30_000,
  windowMs: 60_000,
});

// Usage in provision-license/route.js:
const result = await circuitBreaker.call(() => createLicense(policyId, email, metadata));
```

The circuit breaker should be a lightweight in-memory implementation (no external dependencies). State resets on Lambda cold start, which is acceptable — cold starts are infrequent and a fresh circuit is the safe default.

#### 3.6C Checkpoint 6 — Tests

Run all tests. Add tests for queue enqueue/dequeue, reconciliation logic, circuit breaker behavior. Bring to 100%.

---

### Checkpoint 7: Keygen Read Elimination

#### 3.16 Eliminate Keygen Read Calls from Request Paths

**Principle:** DynamoDB is the sole source of truth for all reads. Keygen pushes state to us via webhooks. We write it to DynamoDB. We read from DynamoDB. We never ask Keygen "what's the status?" at request time.

**Four endpoints currently make live Keygen API calls at request time:**

**1. `/api/license/validate` — Stop calling Keygen for license validation.**

**File:** `src/app/api/license/validate/route.js`

Currently calls `validateLicense(licenseKey, fingerprint)` → Keygen API. Hard fails if Keygen is down.

Change to: look up the license in DynamoDB by key via `getLicenseByKey(licenseKey)`. Verify fingerprint matches an active DEVICE# record via `getDeviceByFingerprint(licenseId, fingerprint)`. Return `{ valid, status, expiresAt }` from DynamoDB. The trial flow (fingerprint-only, no licenseKey) is already DynamoDB-only and unchanged.

The `machineHeartbeat` fire-and-forget call stays (it's a mutation, not a read).

**`HEARTBEAT_NOT_STARTED` self-healing:** The current code depends on Keygen's validation response `code` field to detect machines that are activated but haven't sent their first heartbeat. After eliminating the Keygen read, replace with a DynamoDB-based equivalent: if a DEVICE# record exists for the fingerprint but `lastSeenAt` is null or older than 24 hours, treat it as a heartbeat-not-started case and fire the machine heartbeat as a mutation (fire-and-forget). Return `valid: true` based on the DynamoDB device record's existence.

**Keygen validation can run asynchronously** (fire-and-forget or queue-backed) to detect drift, but the response to the extension must not depend on it.

**2. `/api/portal/license` — Stop calling Keygen for license display.**

**File:** `src/app/api/portal/license/route.js`

Currently calls `getKeygenLicense(customer.keygenLicenseId)` in `buildLicenseResponse` and prefers Keygen status over DynamoDB: `status: keygenLicense?.status || localLicense?.status || "unknown"`.

Remove the `getKeygenLicense()` call entirely. Remove the `import { getLicense as getKeygenLicense } from "@/lib/keygen"` import. Use DynamoDB status only:

```javascript
status: localLicense?.status || "unknown",
expiresAt: localLicense?.expiresAt,
```

The portal shows what our system knows. If there's drift, the reconciliation job (3.14) fixes DynamoDB — we don't paper over it by calling Keygen at read time.

**3. `/api/license/check` — Stop falling back to Keygen.**

**File:** `src/app/api/license/check/route.js`

Currently falls back to `getLicensesByEmail(email)` → Keygen API when DynamoDB lookup fails (~line 115). Remove the Keygen fallback entirely. If the customer doesn't exist in DynamoDB, they don't have a license — return `{ status: "none" }`. Every license was created via our `provision-license` endpoint, so if it's not in DynamoDB, it doesn't exist in our system.

Remove the `import { getLicensesByEmail } from "@/lib/keygen"` import.

**Edge case:** Licenses created directly in the Keygen dashboard (manual ops) won't be in DynamoDB. The reconciliation job (3.14) should detect and import these.

**4. `/api/license/heartbeat` — Keep synchronous machine ping with DynamoDB fallback.**

**File:** `src/app/api/license/heartbeat/route.js`

Currently calls `machineHeartbeat(fingerprint)` → Keygen API synchronously. This is a mutation (keeps the Keygen machine alive), not a read. Machine heartbeats serve two purposes: (a) keeping the Keygen machine alive (Keygen decommissions dead machines), and (b) tracking concurrent device count.

Keep the synchronous Keygen call but add a DynamoDB fallback: if Keygen is down, return success based on DynamoDB device records and queue the machine ping for retry via the Keygen sync queue (3.12). This preserves behavior when Keygen is up and degrades gracefully when it's not.

The license status check added in Step 3.11 already reads from DynamoDB, not Keygen.

#### 3.7C Checkpoint 7 — Tests

Run all tests. Verify all endpoints return correct data from DynamoDB. Bring to 100%.

---

### Checkpoint 8: Observability and Production Deployment

#### 3.17 Deploy Production Keygen Webhook Endpoint

The production Keygen webhook (`https://hic-ai.com/api/webhooks/keygen`) currently returns 405. This is a **launch blocker** — production Keygen events (`license.expired`, `license.renewed`, `machine.deleted`, etc.) have nowhere to deliver.

**Actions:**

1. Ensure the production deployment includes the Keygen webhook route (`src/app/api/webhooks/keygen/route.js`). Verify the route is not excluded by any build/deploy configuration.
2. Update the Keygen dashboard's production webhook URL to point to the correct endpoint. Confirm subscription is set to `*` (all events), matching staging.
3. Verify with a test event — send a manual webhook from the Keygen dashboard and confirm the production endpoint receives and processes it.
4. Confirm the webhook signature verification secret (`KEYGEN_WEBHOOK_SECRET`) is set in the production environment's SSM Parameter Store / Secrets Manager.

#### 3.18 Add CloudWatch Alarms

**File:** `infrastructure/cloudformation/plg-monitoring.yaml`

Add four new alarms following the pattern of the existing `EmailDLQDepthAlarm`, `PaymentFailureAlarm`, etc.:

| Alarm | Metric Source | Trigger | Action |
|---|---|---|---|
| `keygen-sync-dlq-depth` | `AWS/SQS` `ApproximateNumberOfMessages` on `plg-keygen-sync-dlq-${Environment}` | Messages ≥ 1 | SNS alert to `AlertTopic` |
| `license-renew-failures` | Custom metric filter on keygen-sync Lambda log group: `{ $.event = "LICENSE_RENEW_FAILED" }` | Count > 3 in 1 hour | SNS alert to `AlertTopic` |
| `reconciliation-corrections` | Custom metric filter on scheduled-tasks log group: `{ $.event = "RECONCILIATION_CORRECTION" }` | Count > 5 in single run (6-hour period) | SNS alert to `AlertTopic` |
| `keygen-api-errors` | Custom metric filter on keygen-sync Lambda log group: `{ $.statusCode >= 500 }` | Error rate > 10% over 5 minutes | SNS alert to `AlertTopic` |

**Additional resources:**

- Add `KeygenSyncLogGroup` log group for the new keygen-sync Lambda (30-day retention, matching existing log groups).
- Add metric filters for `LICENSE_RENEW_FAILED`, `RECONCILIATION_CORRECTION`, and Keygen 5xx responses.
- Update the CloudWatch dashboard (`PLGDashboard`) to include:
  - Keygen sync queue depth widget (timeSeries)
  - Keygen sync DLQ depth widget (singleValue, red if > 0)
  - Reconciliation corrections widget (timeSeries)
  - Keygen API error rate widget (timeSeries)

#### 3.19 Update Metrics and Reporting

**File:** `scripts/plg-metrics.js`

**Split `suspended` counter** into `payment_suspended` and `admin_suspended`:

```javascript
// Before:
suspended: 0,
// ...
if (status === "SUSPENDED") metrics.licenses.suspended++;

// After:
payment_suspended: 0,
admin_suspended: 0,
// ...
// Keygen API returns UPPER_CASE — these comparisons are correct for Keygen-sourced data
if (status === "SUSPENDED") metrics.licenses.payment_suspended++;
// Note: Keygen has no concept of admin_suspended — that status only exists in DynamoDB MEMBER# records
```

**Keygen casing confirmed:** Keygen returns UPPER_CASE status consistently across ALL endpoints (list, retrieve, create, validate). The metrics script's UPPER_CASE comparisons against Keygen responses are correct. No casing changes needed for Keygen-sourced comparisons.

**DynamoDB-sourced comparisons** must use the new lowercase enum values after Step 3.2. If the metrics script queries DynamoDB directly for any status counts, those comparisons must be updated from `"SUSPENDED"` to `"payment_suspended"` / `"admin_suspended"`.

**Report output:** Update the report format to display both suspension counts separately:

```
Licenses:
  Active: 42
  Payment Suspended: 1
  Admin Suspended: 0
  Expired: 3
```

Add `.toLowerCase()` normalization when comparing Keygen list API responses against DynamoDB values, per Step 3.3.

#### 3.8C Checkpoint 8 — Tests

Run all tests. Verify alarms fire correctly. Bring to 100%.

---

### Checkpoint 9: Extension

#### 3.20 Update Extension (Separate Repo)

**Repo:** `~/source/repos/hic`

**Files:** `licensing/constants.js` (#28), `licensing/validation.js` (#29), `licensing/state.js` (#30), `licensing/http-client.js` (#31), `licensing/heartbeat.js` (#32), `mouse-vscode/src/licensing/heartbeat.js` (#33a), `mouse-vscode/src/licensing/validation.js` (#33b), `mouse-vscode/src/extension.js` (#33c), `licensing/commands/validate.js` (#33d)

All paths below are relative to the extension repo root. Changes are made to source files, built into the VSIX, and released through the normal distribution pipeline (VS Code Marketplace / Open VSX). The `.hic/licensing/` copies in the website repo are updated by the VSIX install flow — they are never edited directly.

**8 changes across 9 source files:**

**1. Normalize `LICENSE_STATES` to lowercase and disambiguate (`licensing/constants.js`).**

Change all values from UPPER_CASE to lowercase. Keys stay UPPER_CASE (JS constants). Remove `SUSPENDED` entirely. Add disambiguated states:

```javascript
// WARNING: AI-GENERATED SAMPLE CODE. DO **NOT** TAKE THIS AS THE LITERAL
// APPROACH TO BE COPIED. MAY CONTAIN SERIOUS ERRORS.
export const LICENSE_STATES = {
  FRESH: "fresh",
  TRIAL: "trial",
  TRIAL_ENDING: "trial_ending",
  TRIAL_LAST_DAY: "trial_last_day",
  LICENSED: "licensed",
  LICENSED_GRACE: "licensed_grace",
  PAYMENT_SUSPENDED: "payment_suspended",
  ADMIN_SUSPENDED: "admin_suspended",
  EXPIRED: "expired",
};
```

No bare `"suspended"` string exists anywhere after this change.

**2. Update validation allowlists (`licensing/validation.js`, `mouse-vscode/src/licensing/validation.js`).**

Both files maintain independent copies of the allowlists. Update both identically:

`VALID_HEARTBEAT_STATUSES` — add `"license_payment_suspended"`, `"license_admin_suspended"`, `"unknown"`. Remove `"license_suspended"`.

`VALID_LICENSE_STATES` — add `"payment_suspended"`, `"admin_suspended"`. Remove `"suspended"`.

**3. Disambiguate heartbeat switch statement (`mouse-vscode/src/licensing/heartbeat.js`).**

Update `_handleInvalidHeartbeat` switch:

```javascript
// WARNING: AI-GENERATED SAMPLE CODE. DO **NOT** TAKE THIS AS THE LITERAL
// APPROACH TO BE COPIED. MAY CONTAIN SERIOUS ERRORS.
case "license_payment_suspended":
  this._handleLicensePaymentSuspended(response);
  break;

case "license_admin_suspended":
  this._handleLicenseAdminSuspended(response);
  break;

case "unknown":
  this._handleUnknownStatus(response);
  break;
```

Remove `case "license_suspended":` and `case "suspended":` — no fallback to bare `"suspended"`.

Rename `_handleLicenseSuspended` → split into two handlers:
- `_handleLicensePaymentSuspended`: writes `config.LICENSE_STATES.PAYMENT_SUSPENDED` to state, fires `onStateChange` callback. The `extension.js` callback shows "Payment issue detected. Please update your payment method" with billing link.
- `_handleLicenseAdminSuspended`: writes `config.LICENSE_STATES.ADMIN_SUSPENDED` to state, fires `onStateChange` callback. The `extension.js` callback shows "Your access has been suspended by your organization administrator" — no billing link.

Update `_mapServerStatusToState`:

```javascript
// WARNING: AI-GENERATED SAMPLE CODE. DO **NOT** TAKE THIS AS THE LITERAL
// APPROACH TO BE COPIED. MAY CONTAIN SERIOUS ERRORS.
const mapping = {
  active: config.LICENSE_STATES.LICENSED,
  licensed: config.LICENSE_STATES.LICENSED,
  payment_suspended: config.LICENSE_STATES.PAYMENT_SUSPENDED,
  admin_suspended: config.LICENSE_STATES.ADMIN_SUSPENDED,
  expired: config.LICENSE_STATES.EXPIRED,
  revoked: config.LICENSE_STATES.EXPIRED,
  trial: config.LICENSE_STATES.TRIAL,
  over_limit: "over_limit",
  machine_not_found: "machine_not_found",
  error: "error",
};
```

**4. Disambiguate shared core heartbeat (`licensing/heartbeat.js`).**

Same switch statement changes as #3. Update `_handleHeartbeatResponse`:

```javascript
// WARNING: AI-GENERATED SAMPLE CODE. DO **NOT** TAKE THIS AS THE LITERAL
// APPROACH TO BE COPIED. MAY CONTAIN SERIOUS ERRORS.
case "license_payment_suspended":
  newStatus = config.LICENSE_STATES.PAYMENT_SUSPENDED;
  break;

case "license_admin_suspended":
  newStatus = config.LICENSE_STATES.ADMIN_SUSPENDED;
  break;
```

Remove `case "license_suspended":` — the server will never send this string after the website changes deploy.

**5. Implement retry-once for `"unknown"` heartbeat status (`mouse-vscode/src/licensing/heartbeat.js`).**

Add `_unknownRetried = false` instance field. New handler:

```javascript
// WARNING: AI-GENERATED SAMPLE CODE. DO **NOT** TAKE THIS AS THE LITERAL
// APPROACH TO BE COPIED. MAY CONTAIN SERIOUS ERRORS.
_handleUnknownStatus(response) {
  if (response.retryAfter && !this._unknownRetried) {
    this._unknownRetried = true;
    console.log(
      `[Mouse Heartbeat] Unknown status — retrying in ${response.retryAfter}s`,
    );
    setTimeout(() => {
      this._sendHeartbeat();
      this._unknownRetried = false;
    }, response.retryAfter * 1000);
  } else {
    this._unknownRetried = false;
    if (this._callbacks.onError) {
      this._callbacks.onError({
        code: "LICENSE_NOT_FOUND",
        message:
          response.reason ||
          "License not found. Please re-enter your license key or contact support.",
      });
    }
  }
}
```

This handles the Step 3.11 "license not found" defect fix. The server returns `{ valid: false, status: "unknown", retryAfter: 30 }` when `getLicenseByKey` returns null. The extension waits 30 seconds and retries once to cover the eventual consistency window during license provisioning. If the second attempt also returns `"unknown"`, the error surfaces to the user.

**6. Update `http-client.js` suspended detection (`licensing/http-client.js`).**

In `validateLicense` return:

```javascript
// WARNING: AI-GENERATED SAMPLE CODE. DO **NOT** TAKE THIS AS THE LITERAL
// APPROACH TO BE COPIED. MAY CONTAIN SERIOUS ERRORS.
// Before:
suspended: response.license?.status === "suspended",
// After:
suspended:
  response.license?.status === "payment_suspended" ||
  response.license?.status === "admin_suspended",
```

**7. Update `extension.js` status bar and notifications (`mouse-vscode/src/extension.js`).**

Update `updateStatusBarForState` — all comparisons use lowercase values:

```javascript
// WARNING: AI-GENERATED SAMPLE CODE. DO **NOT** TAKE THIS AS THE LITERAL
// APPROACH TO BE COPIED. MAY CONTAIN SERIOUS ERRORS.
function updateStatusBarForState(state) {
  if (workspaceNeedsSetup) return;

  switch (state) {
    case "licensed":
      statusBarManager?.setStatus("licensed", "Mouse: Licensed");
      break;
    case "payment_suspended":
      statusBarManager?.setStatus("warning", "Mouse: Payment Issue");
      break;
    case "admin_suspended":
      statusBarManager?.setStatus("warning", "Mouse: Access Suspended");
      break;
    case "expired":
      statusBarManager?.setStatus("expired", "Mouse: Expired");
      break;
    default:
      statusBarManager?.setStatus("trial", "Mouse: Trial");
  }
}
```

Update `startHeartbeatWithCallbacks` `onStateChange` callback:

```javascript
// WARNING: AI-GENERATED SAMPLE CODE. DO **NOT** TAKE THIS AS THE LITERAL
// APPROACH TO BE COPIED. MAY CONTAIN SERIOUS ERRORS.
onStateChange: (newState, response) => {
  updateStatusBarForState(newState);

  if (newState === "payment_suspended") {
    vscode.window.showWarningMessage(
      "Mouse: Payment issue detected. Please update your payment method.",
      "Update Payment",
    ).then((selection) => {
      if (selection === "Update Payment") {
        vscode.env.openExternal(
          vscode.Uri.parse("https://hic-ai.com/portal/billing"),
        );
      }
    });
  } else if (newState === "admin_suspended") {
    vscode.window.showWarningMessage(
      "Mouse: Your access has been suspended by your organization administrator.",
    );
  } else if (newState === "expired") {
    // ... existing expired handling
  }
},
```

Update `activate` function's initial status check: `"LICENSED"` → `"licensed"`, `"EXPIRED"` → `"expired"`, etc.

**8. State migration and validate command (`licensing/state.js`, `licensing/commands/validate.js`).**

`state.js` — add migration in `load()` after existing migrations:

```javascript
// WARNING: AI-GENERATED SAMPLE CODE. DO **NOT** TAKE THIS AS THE LITERAL
// APPROACH TO BE COPIED. MAY CONTAIN SERIOUS ERRORS.
// Migrate: normalize UPPER_CASE status to lowercase
if (this._state.status && this._state.status !== this._state.status.toLowerCase()) {
  this._state.status = this._state.status.toLowerCase();
  this.save();
}

// Migrate: disambiguate bare "suspended" → "payment_suspended"
// License-level suspension is always payment-related;
// admin suspension only exists in MEMBER# records (website DynamoDB)
if (this._state.status === "suspended") {
  this._state.status = "payment_suspended";
  this.save();
}
```

`validate.js` — update suspended status mapping:

```javascript
// WARNING: AI-GENERATED SAMPLE CODE. DO **NOT** TAKE THIS AS THE LITERAL
// APPROACH TO BE COPIED. MAY CONTAIN SERIOUS ERRORS.
// Before:
const newStatus = result.suspended
  ? config.LICENSE_STATES.SUSPENDED
  : config.LICENSE_STATES.EXPIRED;
// After:
const newStatus = result.suspended
  ? config.LICENSE_STATES.PAYMENT_SUSPENDED
  : config.LICENSE_STATES.EXPIRED;
```

License-level suspension from the validate endpoint is always payment-related. Admin suspension is a MEMBER# concept surfaced only via the heartbeat path.

#### 3.9C Checkpoint 9 — Tests

Run extension tests in `~/source/repos/hic`. Fix breakage from `LICENSE_STATES` casing change and `SUSPENDED` removal. Add tests for:
- `_handleLicensePaymentSuspended` and `_handleLicenseAdminSuspended` handlers
- `_handleUnknownStatus` retry-once logic (retry succeeds, retry also returns unknown)
- `_mapServerStatusToState` with new status strings
- `VALID_HEARTBEAT_STATUSES` and `VALID_LICENSE_STATES` accept new values, reject bare `"suspended"`
- `http-client.js` `validateLicense` returns `suspended: true` for both `"payment_suspended"` and `"admin_suspended"`
- `state.js` migration: UPPER_CASE → lowercase, bare `"suspended"` → `"payment_suspended"`
- `validate.js` maps suspended result to `PAYMENT_SUSPENDED`

Bring to 100%.

---

### Checkpoint 10: Migration and Final Verification

#### 3.21 Backward Compatibility and Migration

**Three concerns:**

**1. Legacy DynamoDB records with `status: "suspended"`.** The reconciliation job (3.14) migrates these using `suspendReason` metadata as discriminator:

```javascript
// In reconciliation handler:
if (license.status === "suspended") {
  const newStatus =
    license.suspendReason === "payment_failed" ||
    license.suspendedReason === "payment_failed"
      ? LICENSE_STATUS.PAYMENT_SUSPENDED
      : await determineFromStripe(license);

  await updateLicenseStatus(license.keygenLicenseId, newStatus, {
    migratedFrom: "suspended",
    migratedAt: new Date().toISOString(),
  });
  corrections++;
}
```

For MEMBER# records with `status: "suspended"`:

```javascript
if (member.status === "suspended") {
  await updateOrgMemberStatus(orgId, member.memberId, LICENSE_STATUS.ADMIN_SUSPENDED);
  // MEMBER# suspensions are always admin-initiated
}
```

The reconciliation job also normalizes any UPPER_CASE status values to lowercase for legacy records written before the casing normalization in Step 3.2.

**2. Transitional guards.** During the rollout period, any status check should accept both old and new values:

```javascript
// Transitional helper — remove after migration confirmed complete
function isPaymentSuspended(status) {
  return status === "payment_suspended" || status === "suspended";
}

function isAdminSuspended(status) {
  return status === "admin_suspended";
  // No backward compat needed — "admin_suspended" is a new value,
  // old MEMBER# records with "suspended" are migrated by reconciliation
}
```

These guards ensure no customer loses access during the transition window. Remove after migration is confirmed complete (verified by grep: zero remaining `"suspended"` status values in DynamoDB).

**3. Unprocessed event records in flight.** Event records already in the DynamoDB stream or SQS queues may still carry `"LICENSE_SUSPENDED"`. The email sender Lambda's `EVENT_TYPE_TO_TEMPLATE` mapping keeps `LICENSE_SUSPENDED: "licensePaymentSuspended"` as a backward-compat entry (added in Step 3.8). This ensures in-flight events are routed to the correct template without requiring reprocessing.

#### 3.22 Add Integration Test for Stripe → DynamoDB → Keygen Cycle

**File:** `__tests__/e2e/journeys/j8-subscription-lifecycle.test.js` (or new dedicated integration test file)

An automated test that exercises the full Stripe → DynamoDB → Keygen sync cycle:

1. Construct a mock `invoice.payment_succeeded` Stripe event with a valid customer and license ID
2. Call `handlePaymentSucceeded` with the mock event
3. Assert DynamoDB `LICENSE#` record updated to `status: "active"` with correct `expiresAt`
4. Assert DynamoDB `CUSTOMER#` record updated with `subscriptionStatus: "active"`
5. Assert SQS message enqueued to `KeygenSyncQueue` with `action: "renew"` and correct `licenseId`
6. Process the SQS message through the keygen-sync worker Lambda handler
7. Assert `renewLicense` was called with the correct license ID
8. Assert no DLQ messages (clean processing)

This is the regression test that catches a missing renewal call if someone refactors the webhook handler. It validates the complete chain from Stripe event to Keygen mutation.

**Additional integration test scenarios:**

- Payment failure → `payment_suspended` status → Keygen suspend enqueued
- Payment recovery → reinstate-before-renew ordering verified
- Admin suspend member → device deactivation enqueued to Keygen sync queue

#### 3.23 Document Policy Duration Rationale

**Location:** PLG operational docs (e.g., `docs/plg/KEYGEN_POLICY_DURATION_RATIONALE.md` or inline in this plan's Prerequisites section)

Document the following for operational reference:

1. **Why durations are billing period + 3 days, not billing period + 50%.** The 3-day buffer exists solely to cover webhook delivery delays, cold-start timeouts, deployment gaps, and the reconciliation job's execution interval (6 hours). If the system needs more than 3 days of slack, the reconciliation job is failing and that needs to be fixed — not the duration buffer. A 45-day buffer on a 30-day subscription means a cancelled customer gets 15 days of free access.

2. **The relationship between Stripe retry cycles, Keygen expiry, and the reconciliation job.** Stripe retries failed payments on a configurable schedule (typically 3 attempts over ~7 days). During this period, the subscription is `past_due`. If all retries fail, the subscription moves to `unpaid` and our webhook writes `payment_suspended`. The Keygen license expiry is extended by `renewLicense` on each successful payment. The reconciliation job (every 6 hours) catches any drift where the renewal call failed.

3. **How to change durations if billing periods change.** If a new billing period is introduced (e.g., quarterly), create a new Keygen policy with duration = billing period + 3 days. Update the `getKeygenPolicyIds()` SSM parameters to include the new policy ID. The `renewLicense` call is billing-period-agnostic — it extends by the policy's configured duration.

4. **The reconciliation job as the safety net, not the duration buffer.** The 3-day buffer is the absolute backstop — it only matters if every webhook, every retry, and the reconciliation job all fail simultaneously. The reconciliation job is the primary safety net. The duration buffer is the secondary safety net. Neither should be relied upon in normal operation.

5. **Trials are purely local.** The extension manages a 14-day trial clock locally. Trials have no Keygen policy and no server-side expiry. The trial record in DynamoDB tracks device fingerprint to prevent re-trials, but the trial duration is enforced client-side.

#### 3.10C Checkpoint 10 — Final Verification

Run full test suite across both repos. Manual E2E validation on staging. Grep verification. Final sign-off.

---

## 4. Verification Checklists

### 4.1 Scripted Grep Checks

### 4.2 Manual QA Checklist

## Appendix A: Complete Affected File Inventory

All paths are relative to the repo root. Website = `plg-website/` in `~/source/repos/hic-ai-inc.github.io`. Extension = `~/source/repos/hic`.

### Source Files (Existing — Modified)

| # | File | Repo |
|---|---|---|
| 1 | `src/lib/constants.js` | Website |
| 2 | `src/lib/keygen.js` | Website |
| 3 | `src/lib/dynamodb.js` | Website |
| 4 | `src/lib/ses.js` | Website |
| 5 | `src/app/api/webhooks/stripe/route.js` | Website |
| 6 | `src/app/api/webhooks/keygen/route.js` | Website |
| 7 | `src/app/api/portal/team/route.js` | Website |
| 8 | `src/app/api/portal/status/route.js` | Website |
| 9 | `src/app/api/portal/license/route.js` | Website |
| 10 | `src/app/api/portal/settings/route.js` | Website |
| 11 | `src/app/api/provision-license/route.js` | Website |
| 12 | `src/app/api/admin/provision-test-license/route.js` | Website |
| 13 | `src/app/api/license/validate/route.js` | Website |
| 14 | `src/app/api/license/heartbeat/route.js` | Website |
| 15 | `src/app/api/license/check/route.js` | Website |
| 16 | `src/app/portal/page.js` | Website |
| 17 | `src/app/portal/license/page.js` | Website |
| 18 | `src/app/portal/billing/page.js` | Website |
| 19 | `src/app/portal/team/TeamManagement.js` | Website |
| 20 | `infrastructure/lambda/customer-update/index.js` | Website |
| 21 | `infrastructure/lambda/email-sender/index.js` | Website |
| 22 | `infrastructure/lambda/stream-processor/index.js` | Website |
| 23 | `infrastructure/lambda/scheduled-tasks/index.js` | Website |
| 24 | `dm/layers/ses/src/email-templates.js` | Website |
| 25 | `dm/layers/ses/src/index.js` | Website |
| 26 | `dm/layers/ses/generate-email-preview.js` | Website |
| 27 | `scripts/plg-metrics.js` | Website |
| 28 | `.hic/licensing/constants.js` | Extension |
| 29 | `.hic/licensing/validation.js` | Extension |
| 30 | `.hic/licensing/state.js` | Extension |
| 31 | `.hic/licensing/http-client.js` | Extension |
| 32 | `.hic/licensing/heartbeat.js` | Extension |
| 33a | `mouse-vscode/src/licensing/heartbeat.js` | Extension |
| 33b | `mouse-vscode/src/licensing/validation.js` | Extension |
| 33c | `mouse-vscode/src/extension.js` | Extension |
| 33d | `licensing/commands/validate.js` | Extension |

### Source Files (New — Created)

| # | File | Repo |
|---|---|---|
| 33 | `infrastructure/lambda/keygen-sync/index.js` | Website |

### Infrastructure Files (Modified)

| # | File | Repo |
|---|---|---|
| 34 | `infrastructure/cloudformation/plg-messaging.yaml` | Website |
| 35 | `infrastructure/cloudformation/plg-compute.yaml` | Website |
| 36 | `infrastructure/cloudformation/plg-iam.yaml` | Website |
| 37 | `infrastructure/cloudformation/plg-monitoring.yaml` | Website |
| 38 | `infrastructure/cloudformation/plg-main-stack.yaml` | Website |

### Test Files (Modified)

| # | File | Repo |
|---|---|---|
| 39 | `__tests__/fixtures/licenses.js` | Website |
| 40 | `__tests__/fixtures/index.js` | Website |
| 41 | `__tests__/unit/api/webhooks.test.js` | Website |
| 42 | `__tests__/unit/api/team.test.js` | Website |
| 43 | `__tests__/unit/api/license.test.js` | Website |
| 44 | `__tests__/unit/api/portal.test.js` | Website |
| 45 | `__tests__/unit/lib/constants.test.js` | Website |
| 46 | `__tests__/unit/lib/dynamodb.test.js` | Website |
| 47 | `__tests__/unit/lib/keygen.test.js` | Website |
| 48 | `__tests__/unit/lib/ses.test.js` | Website |
| 49 | `__tests__/unit/lambda/customer-update.test.js` | Website |
| 50 | `__tests__/unit/lambda/email-sender.test.js` | Website |
| 51 | `__tests__/unit/lambda/scheduled-tasks.test.js` | Website |
| 52 | `__tests__/unit/scripts/plg-metrics.test.js` | Website |
| 53 | `__tests__/infrastructure/lambda.test.js` | Website |
| 54 | `__tests__/e2e/contracts/webhook-api.test.js` | Website |
| 55 | `__tests__/e2e/journeys/j3-license-activation.test.js` | Website |
| 56 | `__tests__/e2e/journeys/j8-subscription-lifecycle.test.js` | Website |
| 57 | `dm/tests/facade/unit/email-templates.test.js` | Website |
