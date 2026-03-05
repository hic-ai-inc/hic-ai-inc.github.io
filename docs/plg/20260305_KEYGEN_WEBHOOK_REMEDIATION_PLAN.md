# Keygen Webhook Remediation Plan

**Date:** March 5, 2026
**Author:** GitHub Copilot (Claude Opus 4.6), Chief Reviewer
**Approved by:** SWR (pending)
**Status:** Draft — awaiting review and approval
**References:**
- `docs/plg/20260305_REPORT_RE_INVESTIGATION_INTO_EXPIRATION_UI_INCONSISTENCIES.md` (Sections 1–13)
- `docs/plg/20260305_SUSPENDED_NAMING_DISAMBIGUATION_PLAN.md` (Section 1.8 detail)

---

## Executive Summary

An investigation into license expiration UI inconsistencies revealed two root causes and one systemic architectural weakness:

1. **Missing `renewLicense` API call** — When Stripe confirms payment, the code updates DynamoDB but never tells Keygen to extend the license expiry. Keygen's 30-day clock ticks independently and expires the license.
2. **Incomplete Keygen webhook subscription** — Staging webhook was not subscribed to `license.renewed`, `license.suspended`, `license.reinstated`, or `license.revoked` events. Fixed during investigation (switched to `*`).
3. **Keygen treated as runtime read dependency** — Six API routes make live Keygen calls at request time. If Keygen is unavailable for 30 seconds, paying customers lose access. DynamoDB should be the sole source of truth for all reads.
4. **`suspended` status naming ambiguity** — The string `"suspended"` is used for both payment-failure suspension (license-level, automated) and admin-initiated suspension (member-level, manual), causing incorrect emails, ambiguous support investigations, and an unresolved Keygen sync gap for admin actions.

This memo details the complete remediation plan across two phases. Section 1.8 (naming disambiguation) is summarized here; full implementation detail is in the companion memo `docs/plg/20260305_SUSPENDED_NAMING_DISAMBIGUATION_PLAN.md`.

---

## Phase 0: Immediate Fixes (P0 — Blocks Launch)

### 0.1 Add `renewLicense` Function

**File:** `plg-website/src/lib/keygen.js`
**Change:** Add new exported function

```javascript
/**
 * Renew a license, extending its expiry by the policy's duration.
 * Called when Stripe confirms a successful subscription payment.
 *
 * @param {string} licenseId - Keygen license UUID
 * @returns {Promise<Object>} - Renewed license data
 */
export async function renewLicense(licenseId) {
  const response = await keygenRequest(`/licenses/${licenseId}/actions/renew`, {
    method: "POST",
  });

  return {
    id: response.data.id,
    status: response.data.attributes.status,
    expiresAt: response.data.attributes.expiry,
  };
}
```

### 0.2 Call `renewLicense` from `handlePaymentSucceeded`

**File:** `plg-website/src/app/api/webhooks/stripe/route.js`
**Change:** After the existing `reinstateLicense` call, add `renewLicense`. Reinstatement must precede renewal — calling `actions/renew` on a suspended license may fail depending on Keygen's state machine.

**Current flow:**

```
invoice.payment_succeeded →
  1. resolveCustomer(stripeCustomerId) → dbCustomer
  2. updateLicenseStatus(licenseId, "active", { expiresAt })     ← DynamoDB only
  3. if suspended → reinstateLicense(licenseId)                   ← Keygen API
```

**New flow:**

```
invoice.payment_succeeded →
  1. resolveCustomer(stripeCustomerId) → dbCustomer
  2. updateLicenseStatus(licenseId, "active", { expiresAt })     ← DynamoDB (immediate)
  3. if suspended → reinstateLicense(licenseId)                   ← Keygen API
  4. renewLicense(licenseId)                                      ← Keygen API (NEW)
```

**Implementation:**

```javascript
// After the existing reinstateLicense block, add:
if (dbCustomer.keygenLicenseId) {
  try {
    const renewed = await renewLicense(dbCustomer.keygenLicenseId);
    log.info("license_renewed", "Keygen license renewed on payment success", {
      licenseId: dbCustomer.keygenLicenseId,
      newExpiry: renewed.expiresAt,
    });
  } catch (e) {
    log.warn(
      "license_renew_failed",
      "Failed to renew Keygen license on payment success",
      {
        licenseId: dbCustomer.keygenLicenseId,
        errorMessage: e?.message,
      },
    );
    // DynamoDB was already updated in step 2. The reconciliation job (Phase 1)
    // will catch and correct this drift. For now, the customer is unaffected
    // because the extension reads from DynamoDB after Phase 1 refactor.
  }
}
```

**Import:** Add `renewLicense` to the existing Keygen import at the top of the file.

### 0.3 Correct Keygen Policy Durations

**Where:** Keygen dashboard (not code — policy duration is a dashboard setting)

| Policy             | Current Duration     | New Duration               | Rationale                     |
| ------------------ | -------------------- | -------------------------- | ----------------------------- |
| Individual Monthly | 30 days (2,592,000s) | **33 days (2,851,200s)**   | Billing period + 3-day margin |
| Business Monthly   | 30 days (2,592,000s) | **33 days (2,851,200s)**   | Billing period + 3-day margin |
| Individual Annual  | 30 days (2,592,000s) | **368 days (31,795,200s)** | Billing period + 3-day margin |
| Business Annual    | 30 days (2,592,000s) | **368 days (31,795,200s)** | Billing period + 3-day margin |

**Why 3 days and not 15 or 45:** The buffer exists solely to cover webhook delivery delays, cold-start timeouts, and the reconciliation job's execution interval. If our system needs more than 3 days of slack, the reconciliation job is failing and we need to fix that — not pad the duration. A 45-day buffer on a 30-day subscription means a cancelled customer gets 15 days of free access. That is giving away the product.

**Note:** Verify whether annual plans currently use separate Keygen policies or share the monthly policy. The `getKeygenPolicyIds()` function fetches IDs from SSM — check SSM for the actual policy configuration. If annual plans share the same 30-day policy, new annual-specific policies must be created in Keygen.

### 0.4 Verify Production Keygen Webhook Endpoint

**Finding:** The production Keygen webhook (`https://hic-ai.com/api/webhooks/keygen`) currently returns 405. This is a **launch blocker** — production Keygen events (license.expired, license.renewed, machine.deleted, etc.) have nowhere to deliver.

**Action:** Ensure the production deployment includes the Keygen webhook route and that the Keygen dashboard's production webhook URL resolves to a functioning handler. Verify with a test event.

## Phase 1: Pre-Launch Architectural Fixes (P1)

### 1.1 Eliminate Keygen Read Calls from Request Paths

**Principle:** DynamoDB is the sole source of truth for all reads. Keygen pushes state to us via webhooks. We write it to DynamoDB. We read from DynamoDB. We never ask Keygen "what's the status?" at request time.

#### 1.1.1 `/api/license/validate` — Stop calling Keygen

**File:** `plg-website/src/app/api/license/validate/route.js`
**Current:** Calls `validateLicense(licenseKey, fingerprint)` → Keygen API at line 217. Hard fails if Keygen is down.
**Change:** Look up the license in DynamoDB by key. Return status from DynamoDB. The extension heartbeats every 10 minutes — that's the freshness window. DynamoDB status is updated within seconds of any Keygen webhook.

**New flow:**

```
POST /api/license/validate
  → getLicenseByKey(licenseKey) from DynamoDB
  → Verify fingerprint matches an active DEVICE# record
  → Return { valid, status, expiresAt } from DynamoDB
```

**Keygen validation can run asynchronously** (fire-and-forget or queue-backed) to detect drift, but the response to the extension must not depend on it.

**Risk mitigation:** If DynamoDB has stale data due to a missed webhook, the reconciliation job (1.3) corrects it. The 3-day buffer on the Keygen policy provides the absolute backstop.

#### 1.1.2 `/api/portal/license` — Stop calling Keygen

**File:** `plg-website/src/app/api/portal/license/route.js`
**Current:** Line 145: `status: keygenLicense?.status || localLicense?.status || "unknown"`
**Change:** Remove the `getKeygenLicense()` call entirely. Use DynamoDB status only:

```javascript
status: localLicense?.status || "unknown",
```

The portal shows what our system knows. If there's drift, the reconciliation job fixes DynamoDB — we don't paper over it by calling Keygen at read time.

#### 1.1.3 `/api/license/check` — Stop calling Keygen

**File:** `plg-website/src/app/api/license/check/route.js`
**Current:** Lines 115–144: if DynamoDB lookup fails, falls back to `getLicensesByEmail()` → Keygen API.
**Change:** If the customer doesn't exist in DynamoDB, they don't have a license. Return `{ status: "none" }`. Don't ask Keygen — we created every license via our own `provision-license` endpoint, so if it's not in DynamoDB, it doesn't exist in our system.

**Edge case:** Licenses created directly in the Keygen dashboard (manual ops) won't be in DynamoDB. The reconciliation job should detect and import these.

#### 1.1.4 `/api/license/heartbeat` — Consider async machine ping

**File:** `plg-website/src/app/api/license/heartbeat/route.js`
**Current:** Calls `machineHeartbeat(fingerprint)` → Keygen API. Hard fails if Keygen is down.
**Assessment:** Machine heartbeats serve two purposes: (a) keeping the Keygen machine alive (Keygen decommissions dead machines), and (b) tracking concurrent device count. Purpose (a) is a Keygen mutation and must reach Keygen eventually. Purpose (b) can be tracked in DynamoDB.

**Options:**

- **Option A:** Keep the synchronous Keygen call but add a DynamoDB fallback — if Keygen is down, return success based on DynamoDB device records and queue the machine ping for retry.
- **Option B:** Make the Keygen machine ping fully async (enqueue to SQS), return the heartbeat response from DynamoDB immediately.

**Recommendation:** Option A for now. The heartbeat is high-frequency (every 10 minutes per device) and the Keygen machine liveness model depends on timely pings. Option A preserves behavior when Keygen is up and degrades gracefully when it's not.

Additionally, add the license status check to the heartbeat response (from DynamoDB, not Keygen) to fix the race condition identified in the report:

```javascript
// After machine ping and license lookup from DynamoDB:
if (["expired", "payment_suspended", "revoked"].includes(license.status)) {
  return NextResponse.json({
    valid: false,
    status: `license_${license.status}`,
    reason: `License is ${license.status}`,
  });
}
```

### 1.2 Add SQS Queue + DLQ for Keygen Mutation Sync

**Principle:** When a Stripe webhook triggers a Keygen mutation (renew, reinstate, suspend, revoke), the DynamoDB update happens synchronously in the webhook handler, and the Keygen API call is enqueued for async processing with retries.

#### 1.2.1 New Queue Definition

**File:** `plg-website/infrastructure/cloudformation/plg-messaging.yaml`
**Add:**

```yaml
# Keygen Sync DLQ
KeygenSyncDLQ:
  Type: AWS::SQS::Queue
  Properties:
    QueueName: !Sub "plg-keygen-sync-dlq-${Environment}"
    MessageRetentionPeriod: 1209600 # 14 days

# Keygen Sync Queue
KeygenSyncQueue:
  Type: AWS::SQS::Queue
  Properties:
    QueueName: !Sub "plg-keygen-sync-queue-${Environment}"
    VisibilityTimeout: 300 # 5 minutes
    MessageRetentionPeriod: 345600 # 4 days
    RedrivePolicy:
      deadLetterTargetArn: !GetAtt KeygenSyncDLQ.Arn
      maxReceiveCount: 3 # 3 attempts before DLQ
```

#### 1.2.2 Queue Message Schema

```json
{
  "action": "renew | reinstate | suspend | revoke",
  "licenseId": "fab54aac-ea94-4d55-a2be-3e7c1ffe2cbd",
  "triggeredBy": "stripe_webhook | reconciliation | manual",
  "correlationId": "stripe-evt-xxx or reconciliation-run-xxx",
  "enqueuedAt": "2026-03-05T12:00:00.000Z",
  "retryCount": 0
}
```

#### 1.2.3 Worker Lambda

A new Lambda (or an additional handler in the existing infrastructure) consumes from `plg-keygen-sync-queue` and calls the appropriate Keygen API:

```javascript
const KEYGEN_ACTIONS = {
  renew: renewLicense,
  reinstate: reinstateLicense,
  suspend: suspendLicense,
  revoke: revokeLicense,
};

async function handleKeygenSync(record) {
  const message = JSON.parse(record.body);
  const handler = KEYGEN_ACTIONS[message.action];
  if (!handler) throw new Error(`Unknown action: ${message.action}`);
  await handler(message.licenseId);
}
```

#### 1.2.4 Updated Webhook Handler Pattern

**Before (current — fire-and-forget):**

```javascript
// In handlePaymentSucceeded:
try {
  await renewLicense(dbCustomer.keygenLicenseId);
} catch (e) {
  log.warn("license_renew_failed", ...);  // Silent failure, state diverges
}
```

**After (queue-backed):**

```javascript
// In handlePaymentSucceeded:
await updateLicenseStatus(licenseId, "active", { expiresAt }); // DynamoDB — immediate
await enqueueKeygenSync({
  // SQS — async with retry
  action: "renew",
  licenseId: dbCustomer.keygenLicenseId,
  triggeredBy: "stripe_webhook",
  correlationId: invoice.id,
});
```

DynamoDB is correct immediately. Keygen sync happens with retry guarantees. If all 3 retries fail, the message lands in the DLQ for operational review, and the reconciliation job catches the drift on its next run.

### 1.3 Add License Reconciliation Scheduled Task

**File:** `plg-website/infrastructure/lambda/scheduled-tasks/index.js`
**Change:** Add new task handler to `TASK_HANDLERS` registry.

#### 1.3.1 Purpose

Detect and correct drift between DynamoDB license records and Keygen license state. This is the safety net that replaces oversized duration buffers.

#### 1.3.2 Schedule

Run every **6 hours** via EventBridge rule. This is frequent enough to catch drift within a single business day, infrequent enough to stay well within Keygen API rate limits.

#### 1.3.3 Logic

```
license-reconciliation:
  1. Query DynamoDB for all LICENSE# records where:
     - status = "active" AND expiresAt is within 72 hours, OR
     - status = "expired" AND updatedAt is within 7 days (recent expirations)
  2. For each license:
     a. Call Keygen GET /licenses/{id} to fetch current state
     b. Compare DynamoDB status vs. Keygen status
     c. If diverged:
        - If DynamoDB = "active" but Keygen = "expired":
            → Check Stripe subscription status
            → If Stripe is active/paid: enqueue renewLicense to SQS
            → If Stripe is cancelled/past_due: update DynamoDB to "expired"
        - If DynamoDB = "expired" but Keygen = "active":
            → Update DynamoDB to "active" with Keygen's expiry
        - Log all corrections with correlation IDs
  3. Emit CloudWatch metric: reconciliation_corrections_count
  4. If corrections > threshold: fire SNS alert
```

#### 1.3.4 Registration

```javascript
const TASK_HANDLERS = {
  "pending-email-retry": handlePendingEmailRetry,
  "mouse-version-notify": handleMouseVersionNotify,
  "license-reconciliation": handleLicenseReconciliation, // NEW
};
```

---

## Phase 1 (continued): Testing, Observability & Documentation

### 1.4 Integration Test: Stripe → DynamoDB → Keygen Sync

Write an automated test that:

1. Constructs a mock `invoice.payment_succeeded` Stripe event
2. Calls `handlePaymentSucceeded`
3. Asserts DynamoDB `LICENSE#` record updated to `status: "active"` with correct `expiresAt`
4. Asserts SQS message enqueued with `action: "renew"` and correct `licenseId`
5. Processes the SQS message through the Keygen sync worker
6. Asserts Keygen `renewLicense` was called with correct ID

This prevents regression — if someone refactors the webhook handler, the test catches a missing renewal call.

### 1.5 Circuit Breaker for Keygen Mutations

For the mutation paths that must call Keygen at request time (create license, activate device), add a circuit breaker that:

- Tracks Keygen API failure rate over a sliding window
- Opens after N consecutive failures (stops calling Keygen, returns graceful error)
- Half-opens periodically to test if Keygen has recovered
- Closes when Keygen responds successfully

This prevents cascading failures during a Keygen outage — device activation returns "try again in a few minutes" instead of hanging for 30 seconds and timing out.

### 1.6 CloudWatch Alarms

| Alarm                        | Trigger                            | Action           |
| ---------------------------- | ---------------------------------- | ---------------- |
| `keygen-sync-dlq-depth`      | DLQ messages > 0                   | SNS alert to ops |
| `license-renew-failures`     | `license_renew_failed` log pattern | SNS alert to ops |
| `reconciliation-corrections` | Corrections > 5 in single run      | SNS alert to ops |
| `keygen-api-errors`          | Keygen 5xx rate > 10% over 5 min   | SNS alert to ops |

### 1.7 Document Keygen Policy Duration Rationale

Add a section to the PLG operational docs explaining:

- Why durations are billing period + 3 days (not billing period + 50%)
- The relationship between Stripe retry cycles, Keygen expiry, and the reconciliation job
- How to change durations if billing periods change
- The reconciliation job as the safety net, not the duration buffer

---

### 1.8 Resolve `suspended` Status Naming Ambiguity

> **Full detail:** `docs/plg/20260305_SUSPENDED_NAMING_DISAMBIGUATION_PLAN.md`

#### 1.8.1 Problem

The string `"suspended"` is used for two unrelated business concepts:

| Concept | Trigger | Scope | New Status | New Event Type | New Email Template |
|---|---|---|---|---|---|
| **Payment suspension** | Stripe payment fails 3x, `unpaid`, or dispute lost | Entire license (all seats) | `"payment_suspended"` | `LICENSE_PAYMENT_SUSPENDED` | `licensePaymentSuspended` |
| **Admin suspension** | Owner/Admin suspends a team member | Single MEMBER# record | `"admin_suspended"` | `MEMBER_SUSPENDED` | `memberSuspended` |

They share the same status string, event type (`LICENSE_SUSPENDED`), and email template (`licenseSuspended`), causing: incorrect emails, ambiguous support investigations, unbranched code paths, and a Keygen sync gap (admin suspension never reaches Keygen).

#### 1.8.2 Safety Basis

The two paths **never write to the same DynamoDB record type** — payment suspension writes to `LICENSE#` and `CUSTOMER#` records; admin suspension writes to `MEMBER#` and `INVITE#` records. No data collision risk. Keygen doesn't use our internal status strings. The rename is structurally safe.

#### 1.8.3 Affected Files (14 source + 12 test files, ~60+ test touch points)

**Payment suspension path** (change `"suspended"` → `"payment_suspended"`):
- `webhooks/stripe/route.js` — 6 locations: status map, reinstatement check, max failures, dispute handling
- `webhooks/keygen/route.js` — 2 locations: `handleLicenseSuspended` status write + event type
- `infrastructure/lambda/customer-update/index.js` — 3 locations: failure handler, recovery check, expiration routing

**Admin suspension path** (change `"suspended"` → `"admin_suspended"`):
- `app/api/portal/team/route.js` — 4 locations: validation, status write, event type
- `app/portal/team/TeamManagement.js` — 5+ locations: buttons, badges, confirmation dialogs

**Shared / ambiguous paths:**
- `lib/constants.js` — add `PAYMENT_SUSPENDED`, `ADMIN_SUSPENDED`, `ADMIN_REVOKED` to enums
- `lib/dynamodb.js` — no change needed (generic functions, callers pass correct status)
- `dm/layers/ses/src/email-templates.js` — split `licenseSuspended` into `licensePaymentSuspended` + `memberSuspended`; update event type mapping
- `dm/layers/ses/generate-email-preview.js` — update template metadata
- `scripts/plg-metrics.js` — split `suspended` counter into `payment_suspended` + `admin_suspended`

**Test files:** 12 files, ~60+ individual changes (mechanical find-and-replace)

#### 1.8.4 Implementation Steps

| Step | Task | Depends On |
|---|---|---|
| 1.8.1 | Update `LICENSE_STATUS` and `EVENT_TYPES` constants | — |
| 1.8.2 | Split email templates (`licensePaymentSuspended` + `memberSuspended`) + dm layer tests | — |
| 1.8.3 | Update payment suspension path (Stripe webhook + Keygen webhook + customer-update Lambda) | 1.8.1 |
| 1.8.4 | Update admin suspension path (portal/team API + TeamManagement UI) | 1.8.1 |
| 1.8.5 | Close admin → Keygen sync gap (enqueue device deactivation via SQS) | 1.2, 1.8.4 |
| 1.8.6 | Update heartbeat + validate endpoints (check both `payment_suspended` and `admin_suspended`) | 1.1, 1.8.3, 1.8.4 |
| 1.8.7 | Update metrics/reporting scripts | 1.8.3, 1.8.4 |
| 1.8.8 | Update all test files (~60 touch points) | 1.8.1–1.8.7 |
| 1.8.9 | Add legacy record migration to reconciliation job (Section 1.3) | 1.3, 1.8.3 |

**Backward compatibility:** During rollout, status checks accept both old (`"suspended"`) and new (`"payment_suspended"`) values via transitional helpers. The reconciliation job (1.3) migrates legacy records using `suspendReason` metadata or Stripe subscription status as discriminator. Legacy `LICENSE_SUSPENDED` events in flight map to `licensePaymentSuspended` template.

**Pre-existing issue flagged (not fixed here):** The `LICENSE_STATUS` enum uses UPPER_CASE values but webhook handlers write lowercase to DynamoDB. Tracked separately.

## Implementation Sequence

**Critical ordering note:** Section 1.8 (naming disambiguation) must execute **before** Section 1.1 (eliminating Keygen read calls). The validate and heartbeat endpoints being rewritten in 1.1 must reference the new `"payment_suspended"` / `"admin_suspended"` status strings from the start, avoiding a double-rewrite.

```
Phase 0 (Immediate — this week)
  ├── 0.1  Add renewLicense to keygen.js
  ├── 0.2  Call renewLicense from handlePaymentSucceeded
  ├── 0.3  Update Keygen policy durations in dashboard
  └── 0.4  Verify production webhook endpoint

Phase 1 (Pre-launch — all items required before launch)
  │
  │  ── Naming disambiguation (must precede 1.1) ──
  │
  ├── 1.8.1  Update LICENSE_STATUS and EVENT_TYPES constants
  ├── 1.8.2  Split email templates (licensePaymentSuspended + memberSuspended) + dm tests
  ├── 1.8.3  Update payment suspension path (Stripe webhook + Keygen webhook + customer-update)
  ├── 1.8.4  Update admin suspension path (portal/team API + TeamManagement UI)
  │
  │  ── Core architecture ──
  │
  ├── 1.1  Eliminate Keygen read calls from request paths (uses new status strings)
  │    ├── 1.1.1  /api/license/validate → DynamoDB only
  │    ├── 1.1.2  /api/portal/license → DynamoDB only
  │    ├── 1.1.3  /api/license/check → DynamoDB only
  │    └── 1.1.4  /api/license/heartbeat → DynamoDB fallback + license status check
  ├── 1.2  Add Keygen sync SQS queue + DLQ + worker
  ├── 1.3  Add license reconciliation scheduled task
  │
  │  ── Disambiguation (depends on 1.1, 1.2, 1.3) ──
  │
  ├── 1.8.5  Close admin → Keygen sync gap (enqueue device deactivation via 1.2)
  ├── 1.8.6  Update heartbeat + validate endpoints (check both suspension types)
  ├── 1.8.7  Update metrics/reporting scripts
  ├── 1.8.8  Update all test files (~60 touch points)
  ├── 1.8.9  Add legacy "suspended" record migration to reconciliation job (1.3)
  │
  │  ── Resilience & observability ──
  │
  ├── 1.4  Integration test for full Stripe → Keygen cycle
  ├── 1.5  Circuit breaker for Keygen mutation calls
  ├── 1.6  CloudWatch alarms for DLQ, failures, drift
  └── 1.7  Document policy duration rationale
```

---

## Risk Assessment

| Risk                                                                  | Likelihood | Impact   | Mitigation                                                            |
| --------------------------------------------------------------------- | ---------- | -------- | --------------------------------------------------------------------- |
| Phase 0 fix doesn't work (Keygen API rejects renew on certain states) | Low        | High     | Test against Keygen sandbox first; reinstate before renew             |
| Phase 1 refactor breaks extension validation                          | Medium     | Critical | Feature-flag the DynamoDB-only path; canary with internal users first |
| Integration test gaps delay launch | Low | Medium | Prioritize Stripe→Keygen cycle test first; expand coverage iteratively |
| Reconciliation job false-corrects a legitimately expired license      | Low        | Medium   | Always check Stripe subscription status before correcting             |
| Keygen rate limits on reconciliation queries                          | Low        | Low      | Batch queries; respect rate limit headers; exponential backoff        |
| DynamoDB eventually-consistent reads return stale data                | Very Low   | Low      | Use consistent reads for license status queries                       |
| Naming refactor breaks existing suspended-status checks               | Medium     | High     | Search-and-replace with tests; reconciliation job migrates old records |
| Admin portal suspension doesn't sync to Keygen                        | Confirmed  | High     | Route through Keygen sync queue (1.2) after naming fix                |

---

## Success Criteria

- [ ] No customer sees "Expired" in any surface while their Stripe subscription is active
- [ ] A 30-minute Keygen outage causes zero impact to paying customers
- [ ] Failed Keygen API calls retry automatically and land in DLQ if exhausted
- [ ] Drift between DynamoDB and Keygen is detected and corrected within 6 hours
- [ ] Extension validation responds from DynamoDB in < 100ms (no external API call)
- [ ] All Keygen lifecycle events (`renewed`, `suspended`, `reinstated`, `revoked`) are received by both staging and production webhook endpoints
- [ ] No code path uses the bare string `"suspended"` — all references are `"payment_suspended"` or `"admin_suspended"`
- [ ] Payment-suspended users receive email with billing update link; admin-suspended members receive email naming their organization
- [ ] Admin portal suspension syncs to Keygen (device entitlements revoked)
