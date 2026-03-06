# Consolidated License Status Remediation Plan

**Date:** March 6, 2026
**Author:** SWR, with research by GitHub Copilot (Claude Opus 4.6) and Kiro (Claude Opus 4.6)
**Status:** Draft — awaiting review and approval
**Parent:** `docs/plg/20260305_KEYGEN_WEBHOOK_REMEDIATION_PLAN.md`
**Source Documents:**
- `docs/plg/20260305_SUSPENDED_NAMING_DISAMBIGUATION_PLAN.md` (v1 — disambiguation + casing + RETIRED dead code)
- `docs/plg/20260305_REPORT_RE_INVESTIGATION_INTO_EXPIRATION_UI_INCONSISTENCIES.md` (expiration root cause + heartbeat race condition)

---

## 1. Executive Summary

### 1.1 Three Tightly-Coupled Workstreams

This plan consolidates three tightly-coupled workstreams that touch overlapping files and must be executed together:

1. **Naming disambiguation.** The string `"suspended"` is used for two unrelated concepts — payment failure (license-level) and admin action (member-level). This causes incorrect emails, ambiguous support investigations, and a Keygen sync gap. Fix: split into `"payment_suspended"` and `"admin_suspended"` with distinct event types and email templates.

2. **Casing normalization.** The `LICENSE_STATUS` enum uses UPPER_CASE values (`"ACTIVE"`) but every DynamoDB writer uses lowercase (`"active"`). The enum is defined but never referenced — 8 files write hardcoded lowercase strings instead. Portal pages use `.toUpperCase()` bridges to compensate. Fix: standardize enum values to lowercase, eliminate bridges, have writers reference the enum.

3. **Expiration lifecycle fixes.** The codebase never calls Keygen's `POST /licenses/{id}/actions/renew`, causing Keygen license expiry to drift from Stripe payment status. The heartbeat endpoint masks this by returning `valid: true` based on machine liveness alone. Fix: add `renewLicense` to the Stripe payment success handler, add license status checks to the heartbeat endpoint.

These three workstreams must be done in a single pass because they modify the same files — particularly `constants.js`, the Stripe webhook handler, and the portal pages. Doing them separately would require rewriting the same code paths multiple times.

### 1.2 Scope Boundary

**In scope (this plan):**
- Status string disambiguation (`"suspended"` → `"payment_suspended"` / `"admin_suspended"`)
- Casing normalization (UPPER_CASE enum values → lowercase)
- `RETIRED` dead code removal
- `renewLicense` function and Stripe webhook integration
- Heartbeat race condition fix
- Email template split
- Admin → Keygen sync gap closure
- Backward compatibility / migration for legacy records
- All associated test updates

**Out of scope (remains in parent plan `20260305_KEYGEN_WEBHOOK_REMEDIATION_PLAN.md`):**
- Eliminating Keygen read calls from validate, check, and portal endpoints (parent §1.1)
- SQS queue + DLQ for Keygen mutation sync (parent §1.2)
- Reconciliation scheduled task infrastructure (parent §1.3) — though this plan defines the reconciliation *logic* for status migration
- Circuit breaker for Keygen mutation calls
- Production Keygen webhook endpoint deployment (launch blocker)
- CloudWatch alarms for DLQ, failures, and drift
- Integration test for Stripe → Keygen → DynamoDB cycle

---

## 2. Prerequisites (Completed and Pending)

### 2.1 Completed: Staging Webhook Subscription

On March 5, 2026, the staging Keygen webhook (`https://staging.hic-ai.com/api/webhooks/keygen`) was switched from a specific event list to `*` (all events), matching the production endpoint configuration. Prior to this change, the staging webhook was not subscribed to `license.renewed`, `license.suspended`, `license.reinstated`, or `license.revoked` — meaning code handlers for these events existed but never fired on staging.

### 2.2 Completed: Manual License Renewal

On March 5, 2026, the license for `sreiff@hic-ai.com` was manually renewed from the Keygen dashboard after the webhook subscription fix. The staging endpoint received the `license.renewed` event and `handleLicenseRenewed` executed successfully. The license key was re-entered in the extension to clear the stale local state.

### 2.3 Pending: Keygen Policy Duration Update

The Keygen policy durations must be updated in the Keygen dashboard **after** the `renewLicense` code (Step 3-4) is deployed and tested:

| Policy | Current Duration | New Duration | Rationale |
|---|---|---|---|
| Individual/Business Monthly | 30 days (2,592,000s) | 33 days (2,851,200s) | Billing period + 3 days buffer for webhook delivery delays, cold start timeouts, deployment gaps, and reconciliation job execution interval |
| Individual/Business Annual | 30 days (2,592,000s) | 368 days (31,795,200s) | Billing period + 3 days buffer |

The extra 2–3 days is the absolute backstop — it only matters if every webhook, every retry, and the reconciliation job all fail simultaneously. Trials are purely local to the extension (14-day clock) and have no Keygen policy.

**Important:** Do NOT change durations before the `renewLicense` code is live. The current 30-day duration with no renewal call causes expiry after exactly 30 days. Extending to 33 days without the renewal call just delays the same problem by 3 days.

---

## 3. Problem Statement

### 3.1 Naming Collision: `"suspended"` Used for Two Unrelated Concepts

The string `"suspended"` is used as a status value for **two fundamentally different business concepts** that share no causal relationship:

| Concept                       | Trigger                                                                                                      | Scope                                                        | Who acts                                              | User action                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | ----------------------------------------------------- | -------------------------------- |
| **Payment suspension**        | Stripe payment fails `MAX_PAYMENT_FAILURES` times, subscription reaches `unpaid`, or chargeback dispute lost | Entire license (Individual or Business) — all seats affected | Automated (Stripe → webhook → system)                 | Update payment method            |
| **Administrative suspension** | Organization Owner/Admin suspends a team member from the portal                                              | Single `MEMBER#` record within a Business license            | Manual (human clicks "Suspend" in team management UI) | Contact their organization admin |

These share:

- The same status string `"suspended"`
- The same event type `LICENSE_SUSPENDED`
- The same email template `licenseSuspended`
- The same DynamoDB update functions (no discriminator parameter)

The result: **incorrect emails**, **ambiguous support investigations**, **unbranched code paths**, and a **Keygen sync gap** (admin suspension doesn't reach Keygen at all).

### 3.2 Missing `renewLicense` Call: Keygen Expiry Drifts from Stripe

**The codebase never calls Keygen's `POST /licenses/{id}/actions/renew` endpoint.** A comprehensive search of both repos confirms: `actions/renew` — zero occurrences; `renewLicense` — zero occurrences as a function name.

Stripe controls payment. Keygen controls license status. When Stripe successfully charges a subscription renewal (`invoice.payment_succeeded`), the `handlePaymentSucceeded` handler:

1. ✅ Updates DynamoDB license status to `"active"` with new `expiresAt`
2. ✅ Reinstates the Keygen license if it was suspended (calls `reinstateLicense`)
3. ❌ **Does NOT renew the Keygen license expiry** (never calls `renewLicense`)

So DynamoDB thinks the license is active. Stripe thinks the subscription is active. But Keygen's internal expiry clock keeps ticking independently, and when it hits zero, Keygen declares the license expired.

The DynamoDB state confirms the conflict:

| Record | Field | Value | Source |
|---|---|---|---|
| CUSTOMER# | `subscriptionStatus` | `"active"` ✅ | Stripe webhook |
| LICENSE# | `status` | `"expired"` ❌ | Keygen webhook |

Both are technically correct from their respective sources. The missing bridge: nobody called `POST /licenses/{id}/actions/renew` to extend the Keygen expiry when Stripe confirmed payment.

### 3.3 Heartbeat / Validate Race Condition

The heartbeat endpoint (`/api/license/heartbeat`) pings the Keygen machine (`POST /machines/{fingerprint}/actions/ping`) and returns `{ valid: true, status: "active" }` when the machine is alive — regardless of whether the Keygen license is expired. Machine heartbeats and license expiry are independent concepts in Keygen.

The validate endpoint (`/api/license/validate`) calls Keygen's `validate-key` action, which checks the actual license status and returns `valid: false` with `status: "EXPIRED"` when the license has expired.

This creates a race condition:
- After `_doRefresh` runs (calls validate) → local state = `EXPIRED`
- After next heartbeat (every 10 minutes) → local state = `LICENSED`
- The status bar shows whichever ran last

The result: Mouse showed "Licensed" for ~21 hours after the Keygen license had actually expired, because the heartbeat kept overwriting the expired state.

### 3.4 Pre-Existing Casing Inconsistency Compounds All Three

The casing inconsistency (Section 5) compounds all three problems. When the disambiguation introduces new status strings like `"payment_suspended"`, those strings must follow a consistent convention from the start. If the enum retains UPPER_CASE values while DynamoDB writers use lowercase, the new statuses would inherit the same split — `LICENSE_STATUS.PAYMENT_SUSPENDED` would equal `"PAYMENT_SUSPENDED"` but the Stripe webhook would write `"payment_suspended"`. Normalizing casing in the same pass ensures the new statuses are born consistent and eliminates the need to touch these files again later.

---

## 4. Data Model

### 4.1 DynamoDB Record Types

Understanding the data model is critical. These are the DynamoDB records involved:

| Record Type | PK                          | SK                  | Uses `"suspended"` for                   | Should use            |
| ----------- | --------------------------- | ------------------- | ---------------------------------------- | --------------------- |
| `LICENSE#`  | `LICENSE#{keygenLicenseId}` | `DETAILS`           | Payment suspension (license-level)       | `"payment_suspended"` |
| `CUSTOMER#` | `USER#{userId}`             | `CUSTOMER`          | `subscriptionStatus` on payment failure  | `"payment_suspended"` |
| `MEMBER#`   | `ORG#{orgId}`               | `MEMBER#{memberId}` | Admin suspends a team member             | `"admin_suspended"`   |
| `INVITE#`   | `ORG#{orgId}`               | `INVITE#{inviteId}` | Admin suspends member with active invite | `"admin_suspended"`   |

### 4.2 Key Insight: Payment and Admin Paths Never Cross the Same Record Type

| Operation          | DynamoDB Record                                                   | Called by                                              |
| ------------------ | ----------------------------------------------------------------- | ------------------------------------------------------ |
| Payment suspension | `LICENSE#{keygenLicenseId}` + `CUSTOMER#{userId}`                 | Stripe webhook, customer-update Lambda, Keygen webhook |
| Admin suspension   | `ORG#{orgId}/MEMBER#{memberId}` + `ORG#{orgId}/INVITE#{inviteId}` | Portal team API                                        |

There is **no shared DynamoDB record** that both paths write `"suspended"` to. Payment suspension writes to LICENSE# and CUSTOMER# records. Admin suspension writes to MEMBER# records. This means:

1. **No data collision** — Changing the string values won't cause one path to incorrectly read another path's data
2. **No transactional coupling** — The changes can be applied to each path independently
3. **Backward-compatible reads** — A simple OR check (`status === "payment_suspended" || status === "suspended"`) can be used during migration to handle old records

### 4.3 Keygen's Relationship to Internal Status Strings

Keygen has its own status model (`active`, `suspended`, `expired`, `banned`). Our status strings are internal to DynamoDB. Keygen's `license.suspended` webhook always means payment-level suspension. Renaming our internal status from `"suspended"` to `"payment_suspended"` has zero impact on Keygen API interactions.

### 4.4 Extension Behavior

The VS Code extension receives `status` from the validate/heartbeat APIs and compares against known failure states. As long as the API response format doesn't change (it returns `valid: false` for both suspension types), the extension doesn't need to change. The extension can optionally display a more specific message by checking the new status values.

### 4.5 How Each Surface Derives Its Status

Each user-facing surface derives its status from a different source, which is why they can show contradictory values:

| Surface | Source of Truth | Read Path | Knows About Keygen Expiry? |
|---|---|---|---|
| Mouse Status Bar | Local `.hic-state.json` | Last heartbeat or validate result → `LicenseStateManager` | Only after `_doRefresh` (validate), not after heartbeat |
| `Mouse: Show Status` command | Keygen validate-key API | `_doRefresh` → `HttpLicenseProvider.validate()` → `POST /api/license/validate` → Keygen | Yes — but overwritten by next heartbeat |
| `license_status` MCP tool | Local `.hic-state.json` | Same as Status Bar | Same as Status Bar |
| Portal `/portal` | DynamoDB CUSTOMER# record | `customer.subscriptionStatus` | No — reads Stripe-derived status only |
| Portal `/portal/billing` | DynamoDB + Stripe Customer Portal | `customer.subscriptionStatus` + Stripe link | No — reads Stripe-derived status only |
| Portal `/portal/license` | Keygen API with DynamoDB fallback | `keygenLicense?.status \|\| localLicense?.status` | Yes — prefers Keygen's answer |
| Keygen dashboard | Keygen internal state | Authoritative for license status | Yes — this IS the source |
| Stripe dashboard | Stripe internal state | Authoritative for payment status | No — Stripe has no concept of license expiry |

The fundamental issue: the heartbeat endpoint returns `valid: true` based on machine liveness alone, while the validate endpoint returns `valid: false` based on Keygen license status. These two endpoints answer different questions but the extension treats both answers as authoritative for the same state.

---

## 5. Casing Inconsistency: Full Scope

### 5.1 The Eight Layers

#### Layer 1: The `LICENSE_STATUS` Enum — UPPER_CASE, Unused by Writers

`src/lib/constants.js` defines:

```javascript
export const LICENSE_STATUS = {
  ACTIVE: "ACTIVE",
  PAST_DUE: "PAST_DUE",
  CANCELED: "CANCELED",
  EXPIRED: "EXPIRED",
  RETIRED: "RETIRED",
  DISPUTED: "DISPUTED",
  REVOKED: "REVOKED",
  // ...
};
```

`LICENSE_STATUS.` appears **zero times** in source code outside of `constants.js` itself. The enum exists but no writer references it. Every file that writes status values uses hardcoded lowercase strings instead.

#### Layer 2: DynamoDB Writes — All Lowercase (8 Files, Not 3)

Every file that writes `subscriptionStatus` or calls `updateLicenseStatus()` uses hardcoded lowercase strings:

| File | Status Values Written |
|---|---|
| `src/app/api/webhooks/stripe/route.js` | `"active"`, `"past_due"`, `"suspended"`, `"expired"`, `"disputed"`, `"cancellation_pending"` |
| `src/app/api/webhooks/keygen/route.js` | `"active"`, `"suspended"`, `"expired"`, `"revoked"` |
| `infrastructure/lambda/customer-update/index.js` | `"active"`, `"past_due"`, `"suspended"`, `"expired"` |
| `src/app/api/provision-license/route.js` | `"active"` |
| `src/app/api/portal/team/route.js` | `"active"`, `"suspended"`, `"revoked"` (MEMBER# records) |
| `src/app/api/portal/settings/route.js` | `"none"` |
| `src/app/api/admin/provision-test-license/route.js` | `"active"` |
| `src/lib/dynamodb.js` | `"active"`, `"pending"` (org member/invite functions) |

#### Layer 3: Keygen API — UPPER_CASE Status and UPPER_CASE Codes

**⚠️ CORRECTION (investigated 2026-03-06):** Keygen returns `license.attributes.status` as UPPER_CASE (`"ACTIVE"`, `"SUSPENDED"`, `"EXPIRED"`) across ALL endpoints — list, retrieve, create, and validate. The original memo incorrectly stated lowercase. The `keygen.js` library (`validateLicense`) passes `response.data.attributes.status` through directly without normalization, meaning UPPER_CASE values propagate into our system wherever `validateLicense` is called.

Keygen validation *codes* (the `code` field, distinct from `status`) are also UPPER_CASE: `"SUSPENDED"`, `"EXPIRED"`, `"HEARTBEAT_NOT_STARTED"`. Both `status` and `code` use the same casing convention.

**Action required:** `.toLowerCase()` normalization must be added at all API boundaries where Keygen status is received — specifically in `keygen.js` (`validateLicense` return), the portal license route, and the validate endpoint. This is a prerequisite for the lowercase standardization in Step 2.

#### Layer 4: Portal UI — Ad-Hoc `.toUpperCase()` Bridges

Two portal pages bridge the gap with runtime casing conversion:

- `portal/page.js` ~line 264: `LICENSE_STATUS_DISPLAY[subscriptionStatus?.toUpperCase()]`
- `portal/license/page.js` ~line 111: `license.status?.toUpperCase() || "ACTIVE"`

These `.toUpperCase()` calls are the duct tape holding the display layer together. They convert lowercase DynamoDB/Keygen values to match the UPPER_CASE `LICENSE_STATUS_DISPLAY` keys. Without them, the portal would show the fallback "Active" badge for every status.

#### Layer 5: Billing Page — Separate Lowercase Labels Map

`portal/billing/page.js` ~lines 355-365 has a completely independent hardcoded lowercase labels map:

```javascript
const labels = {
  active: "Active",
  trialing: "Trial",
  past_due: "Past Due",
  cancellation_pending: "Cancellation Pending",
  canceled: "Canceled",
  expired: "Expired",
  unpaid: "Unpaid",
  incomplete: "Incomplete",
  incomplete_expired: "Expired",
};
```

This map does not reference `LICENSE_STATUS_DISPLAY` at all. It doesn't include `"suspended"` as a key. It's a third source of truth for status display labels.

#### Layer 6: plg-metrics.js — Compares Against UPPER_CASE

`scripts/plg-metrics.js` ~line 293 compares `license.attributes.status` from the Keygen API against UPPER_CASE strings:

```javascript
if (status === "ACTIVE") metrics.licenses.active++;
else if (status === "INACTIVE") metrics.licenses.inactive++;
else if (status === "SUSPENDED") metrics.licenses.suspended++;
else if (status === "EXPIRED") metrics.licenses.expired++;
```

This is correct for Keygen's API response format (Keygen returns UPPER_CASE status in list responses), but it's a third casing convention in the system — distinct from both the enum values and the DynamoDB values.

**✅ CONFIRMED (investigated 2026-03-06):** Keygen returns UPPER_CASE status (`"ACTIVE"`, `"SUSPENDED"`, `"EXPIRED"`) consistently across ALL endpoints — list, retrieve, create, and validate. There is no casing inconsistency between list and single-license endpoints. The metrics script's UPPER_CASE comparisons are correct for Keygen's native response format. No changes needed to the metrics script's Keygen status comparisons; however, if DynamoDB values are normalized to lowercase (Step 2), the metrics script's DynamoDB-sourced comparisons must be updated accordingly.

#### Layer 7: Test Fixtures — Contradictory Casing

`__tests__/fixtures/licenses.js` ~line 96 has:

```javascript
export const suspendedLicense = {
  status: "SUSPENDED",  // UPPER_CASE
  // ...
};
```

But `__tests__/unit/api/portal.test.js` ~line 202 mocks the same Keygen response as:

```javascript
const keygenLicense = { status: "suspended" };  // lowercase
```

These fixtures contradict each other. One simulates Keygen returning UPPER_CASE, the other lowercase. Both pass their respective tests because the code under test handles both (or only one is actually exercised).

#### Layer 8: Extension (`.hic/licensing/`) — Lowercase with UPPER_CASE Internal States

The extension has its own casing split:

| Component | Convention | Values |
|---|---|---|
| `VALID_LICENSE_STATES` (validation.js) | lowercase | `"active"`, `"suspended"`, `"expired"`, `"revoked"`, `"inactive"` |
| `LICENSE_STATES` (constants.js) | UPPER_CASE | `SUSPENDED: "SUSPENDED"`, `EXPIRED: "EXPIRED"` |
| `state.js` `getStatus()` | normalizes to lowercase | `return rawStatus.toLowerCase()` |
| `http-client.js` | compares lowercase | `response.license?.status === "suspended"` |
| `heartbeat.js` | converts to lowercase | `config.LICENSE_STATES.SUSPENDED.toLowerCase()` |

The extension works because `state.js` normalizes everything to lowercase via `.toLowerCase()`. But the internal `LICENSE_STATES` enum stores UPPER_CASE values that are immediately lowercased on read — unnecessary indirection.

### 5.2 Complete Casing Inventory (22 Source Files)

| # | File | Casing Used | Issue |
|---|---|---|---|
| 1 | `src/lib/constants.js` | UPPER_CASE (enum values) | Enum defined but never referenced by writers |
| 2 | `src/app/api/webhooks/stripe/route.js` | lowercase | Writes hardcoded lowercase, never references enum |
| 3 | `src/app/api/webhooks/keygen/route.js` | lowercase | Writes hardcoded lowercase, never references enum |
| 4 | `infrastructure/lambda/customer-update/index.js` | lowercase | Writes hardcoded lowercase, never references enum |
| 5 | `src/app/api/provision-license/route.js` | lowercase | Writes hardcoded lowercase |
| 6 | `src/app/api/portal/team/route.js` | lowercase | Writes hardcoded lowercase |
| 7 | `src/app/api/portal/settings/route.js` | lowercase | Writes hardcoded lowercase |
| 8 | `src/app/api/admin/provision-test-license/route.js` | lowercase | Writes hardcoded lowercase |
| 9 | `src/lib/dynamodb.js` | lowercase | Writes lowercase in org member/invite functions |
| 10 | `src/app/portal/page.js` | `.toUpperCase()` bridge | Runtime conversion to match UPPER_CASE enum |
| 11 | `src/app/portal/license/page.js` | `.toUpperCase()` bridge | Runtime conversion to match UPPER_CASE enum |
| 12 | `src/app/portal/billing/page.js` | lowercase (separate map) | Independent labels map, doesn't use enum |
| 13 | `src/app/portal/team/TeamManagement.js` | lowercase | Compares against lowercase |
| 14 | `src/app/api/portal/status/route.js` | lowercase | Compares against lowercase |
| 15 | `scripts/plg-metrics.js` | UPPER_CASE | Compares Keygen API responses (UPPER_CASE) |
| 16 | `src/app/api/license/validate/route.js` | passthrough | Returns Keygen status as-is (lowercase) |
| 17 | `src/app/api/portal/license/route.js` | passthrough | Prefers Keygen status over DynamoDB (`keygenLicense?.status \|\| localLicense?.status`) |
| 18 | `.hic/licensing/validation.js` | lowercase | `VALID_LICENSE_STATES` uses lowercase |
| 19 | `.hic/licensing/constants.js` | UPPER_CASE | `LICENSE_STATES` uses UPPER_CASE values |
| 20 | `.hic/licensing/state.js` | normalizes to lowercase | `getStatus()` calls `.toLowerCase()` |
| 21 | `.hic/licensing/http-client.js` | lowercase | Compares `=== "suspended"` |
| 22 | `.hic/licensing/heartbeat.js` | converts to lowercase | `LICENSE_STATES.SUSPENDED.toLowerCase()` |

Plus test files: `__tests__/fixtures/licenses.js` (UPPER_CASE), `__tests__/unit/api/portal.test.js` (lowercase), and all other test files that use hardcoded status strings.

### 5.3 Decision: Standardize on Lowercase

**Lowercase wins decisively:**

- 8 out of 8 DynamoDB writer files use lowercase
- Keygen API returns UPPER_CASE natively, but `.toLowerCase()` normalization will be added at API boundaries (see Layer 3 correction)
- The extension normalizes to lowercase
- The portal status API compares against lowercase
- The team management UI compares against lowercase

**Proposed normalization:**

1. Change `LICENSE_STATUS` enum values to lowercase: `ACTIVE: "active"`, `PAST_DUE: "past_due"`, etc.
2. Change `LICENSE_STATUS_DISPLAY` keys to lowercase: `active: { label: "Active", variant: "success" }`, etc.
3. Remove `.toUpperCase()` bridges in `portal/page.js` and `portal/license/page.js`
4. Consolidate `portal/billing/page.js` labels map into `LICENSE_STATUS_DISPLAY`
5. Have all writer files reference the enum constants instead of hardcoded strings (e.g., `LICENSE_STATUS.ACTIVE` instead of `"active"`)
6. Update `plg-metrics.js` to handle Keygen list API casing (verify actual Keygen response format first)
7. In the extension: change `LICENSE_STATES` values to lowercase, remove `.toLowerCase()` normalization calls
8. Fix contradictory test fixtures to use consistent lowercase

**This normalization should be done as part of the disambiguation work, not separately.** The disambiguation plan already touches most of these files. Doing casing normalization in the same pass avoids rewriting the same files twice and ensures the new `"payment_suspended"` / `"admin_suspended"` values are introduced with consistent casing from the start.

### 5.4 Interaction with Disambiguation and Expiration Fixes

If casing normalization is integrated into the disambiguation:

- Section 8.2 (Update Constants): Change enum values to lowercase at the same time as adding `PAYMENT_SUSPENDED` and `ADMIN_SUSPENDED`
- Section 8.4 (Update Payment Path): Replace hardcoded strings with enum references
- Section 8.5 (Split Email Templates): Use lowercase event type values consistently
- Section 8.6 (Update Admin Path): Replace hardcoded strings with enum references
- Section 8.12 (Migration): The reconciliation job normalizes casing for all existing records, not just `"suspended"` → `"payment_suspended"`

Additionally, the expiration-related fixes benefit from casing normalization:

- Section 8.3 (Add `renewLicense`): The renewed status from Keygen (`"active"`) is already lowercase, consistent with the normalized convention
- Section 8.8 (Heartbeat fix): Status checks use the new disambiguated lowercase strings directly, no casing conversion needed

This increases the scope of the work but eliminates the need for a separate casing normalization pass later.

---

## 6. RETIRED Status — Dead Code Removal

### 6.1 Findings

`RETIRED: "RETIRED"` in the `LICENSE_STATUS` enum (line ~131 of `constants.js`) is confirmed dead code. It exists in exactly 3 locations in the codebase, all definitional — no business logic references it.

| # | File | Line | Context | Type |
|---|---|---|---|---|
| 1 | `src/lib/constants.js` | ~131 | `RETIRED: "RETIRED", // A.5.3 - Enterprise seat retired by admin` | Enum definition |
| 2 | `src/lib/constants.js` | ~144 | `RETIRED: { label: "Retired", variant: "error" }` | Display config |
| 3 | `__tests__/unit/lib/constants.test.js` | ~216 | `expect(LICENSE_STATUS.RETIRED).toBe("RETIRED")` | Test asserting enum exists |

**Not referenced by:** any webhook handler, Lambda function, API route, UI component, DynamoDB write path, the extension, the email template system, or the metrics script.

The comment `// A.5.3 - Enterprise seat retired by admin` references the Phase 2 user journey document, which describes an Enterprise tier seat reduction feature. The Enterprise tier was explicitly deferred to post-launch per the v4 pricing addendum. The `constants.js` file header confirms: `"v4.2: Individual ($15/mo) / Business ($35/seat/mo) — Note: Enterprise tier deferred to post-launch per v4 addendum"`.

Keeping dead enum values in a codebase where naming consistency is a stated high-priority concern (Core Rule #4) creates unnecessary noise and risks future confusion — particularly given that AI-generated code may reference the enum value assuming it has meaning.

### 6.2 Scope of Removal

| File | Change |
|---|---|
| `src/lib/constants.js` | Remove `RETIRED: "RETIRED"` from `LICENSE_STATUS` |
| `src/lib/constants.js` | Remove `RETIRED: { label: "Retired", variant: "error" }` from `LICENSE_STATUS_DISPLAY` |
| `__tests__/unit/lib/constants.test.js` | Remove `it("should have RETIRED status (A.5.3)")` test |

No other files are affected. This is a 3-line removal with zero risk of runtime impact.

---

## 7. Complete Affected File Inventory

### 7.1 Payment Suspension Path (LICENSE# and CUSTOMER# Records)

These files write or read `"suspended"` to mean **payment failure**:

#### [plg-website/src/app/api/webhooks/stripe/route.js](plg-website/src/app/api/webhooks/stripe/route.js)

| Line(s)  | Current Code                                                          | Change To                                                     |
| -------- | --------------------------------------------------------------------- | ------------------------------------------------------------- |
| ~457     | `unpaid: "suspended"` (status map in `handleSubscriptionUpdated`)     | `unpaid: "payment_suspended"`                                 |
| ~529     | `dbCustomer.subscriptionStatus === "suspended"` (reinstatement check in `handleSubscriptionUpdated`) | `=== "payment_suspended"`                                     |
| ~588     | `priorStatus === "suspended"` (expiration event type in `handleSubscriptionDeleted`) | `priorStatus === "payment_suspended"`                         |
| ~646     | `dbCustomer.subscriptionStatus === "suspended"` (reinstatement check in `handlePaymentSucceeded`) | `=== "payment_suspended"`                                     |
| ~717-718 | `subscriptionStatus: "suspended"` (max payment failures in `handlePaymentFailed`) | `subscriptionStatus: "payment_suspended"`                     |
| ~721     | `updateLicenseStatus(id, "suspended")` (max payment failures in `handlePaymentFailed`) | `updateLicenseStatus(id, "payment_suspended")`                |
| ~774     | Log: `"License suspended for disputed customer"` (`handleDisputeCreated`) | Log: `"License disputed for disputed customer"` |

> **⚠️ CORRECTION (investigated 2026-03-06):** The `handleDisputeCreated` function writes `subscriptionStatus: "disputed"` (not `"suspended"`) to DynamoDB. The status string is already correct and does NOT need disambiguation — only the log message is misleading (says "suspended" when the status written is `"disputed"`). The table row above corrects the log message only. No status string change is needed for this handler. The `"disputed"` status is handled by its own separate path and is not part of the `"suspended"` → `"payment_suspended"` disambiguation.
| ~821     | `subscriptionStatus: "suspended"` (dispute lost in `handleDisputeClosed`) | `subscriptionStatus: "payment_suspended"`                     |
| ~825     | Log: `"License remains suspended after lost dispute"` (`handleDisputeClosed`) | Log: `"License remains payment_suspended after lost dispute"` |

**⚠️ Implementation note — indirect write path via `statusMap`:** The `handleSubscriptionUpdated` function maps Stripe subscription statuses to internal status strings via a `statusMap` object, then passes the mapped value to `updateLicenseStatus(licenseId, newStatus)`. When `unpaid: "suspended"` is changed to `unpaid: "payment_suspended"`, the mapped value flows indirectly into the `updateLicenseStatus` call. Implementers must verify that the `statusMap` change propagates correctly through the `newStatus` variable to all downstream calls in this function. The `statusMap` should reference `LICENSE_STATUS` enum constants rather than hardcoded strings (per coding standard: "Extract hardcoded values to enums").
#### [plg-website/src/app/api/webhooks/keygen/route.js](plg-website/src/app/api/webhooks/keygen/route.js)

| Line(s) | Current Code                                         | Change To                                                    |
| ------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| ~305    | `updateLicenseStatus(licenseId, "suspended", {...})` | `updateLicenseStatus(licenseId, "payment_suspended", {...})` |
| ~306    | `eventType: "LICENSE_SUSPENDED"`                     | `eventType: "LICENSE_PAYMENT_SUSPENDED"`                     |

**Rationale:** Keygen's `license.suspended` event fires when Keygen suspends a license at the policy level (e.g., overdue). This is always payment-related in our system — admin suspension doesn't go through Keygen.

#### [plg-website/infrastructure/lambda/customer-update/index.js](plg-website/infrastructure/lambda/customer-update/index.js)

| Line(s)  | Current Code                                                                             | Change To                                                                                        |
| -------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| ~322-325 | `priorStatus === "suspended"` → `NONPAYMENT_CANCELLATION_EXPIRED`                        | `priorStatus === "payment_suspended"`                                                            |
| ~375     | `wasSuspended = customer.subscriptionStatus === "past_due" \|\| customer.paymentFailureCount > 0` | See ⚠️ note below                                                                               |
| ~443-447 | `updateLicenseStatus(id, "suspended", { suspendedAt, suspendReason: "payment_failed" })` | `updateLicenseStatus(id, "payment_suspended", { suspendedAt, suspendReason: "payment_failed" })` |

**⚠️ INVESTIGATED — MUST FIX — `wasSuspended` logic in `handlePaymentSucceeded` (line ~375):**

The current code is:

```javascript
const wasSuspended = customer.subscriptionStatus === "past_due" ||
                     customer.paymentFailureCount > 0;
```

This variable name is misleading — it does not check for `"suspended"` (or `"payment_suspended"`) status at all. It checks `"past_due"` and `paymentFailureCount`. The variable must be renamed to `wasSuspendedForNonpayment` and the condition must be expanded to also check for `"payment_suspended"` status, since a customer whose license has been fully suspended (not just past_due) should also be reactivated on successful payment:

```javascript
const wasSuspendedForNonpayment = customer.subscriptionStatus === "past_due" ||
                                  customer.subscriptionStatus === "payment_suspended" ||
                                  customer.paymentFailureCount > 0;
```

**Note (investigated 2026-03-06):** The `"disputed"` status is NOT checked here because disputed customers are handled by the separate `handleDisputeClosed` path — a successful payment alone does not resolve a chargeback dispute. This is correct behavior.

This must be carefully validated to ensure all possible prior states that should trigger reactivation are covered: `"active"` (no-op), `"past_due"` (reactivate), `"payment_suspended"` (reactivate), `"expired"` (reactivate — payment succeeded implies Stripe subscription is live). The `paymentFailureCount > 0` check is a belt-and-suspenders guard that catches edge cases where the status was already updated but the failure count wasn't reset.

**Note:** The `handleSubscriptionUpdated` function in this same Lambda (line ~233) passes `subscriptionStatus` through to `updateLicenseStatus` as a passthrough from the DynamoDB stream's new image. No code change is needed there — it will automatically propagate whatever status the Stripe webhook wrote. However, this implicit dependency should be documented: the Lambda trusts the webhook's status value without its own validation or mapping.

### 7.2 Admin Suspension Path (MEMBER# and INVITE# Records)

These files write or read `"suspended"` to mean **admin action on a team member**:

**⚠️ INVESTIGATED — CONFIRMED — `"revoked"` disambiguation and the DELETE handler:**

The `"revoked"` string has the same ambiguity as `"suspended"`. Three uses confirmed:

1. **Admin revokes member via POST `update_status`** (line ~393): writes `"revoked"` to MEMBER# record → must become `"admin_revoked"`
2. **DELETE handler removes member** (line ~665): writes `updateOrgInviteStatus(orgId, targetMember.inviteId, "revoked")` to INVITE# record → must become `"admin_revoked"`
3. **Keygen webhook `handleLicenseRevoked`**: writes `"revoked"` to LICENSE# record → stays `"revoked"` (license-level revocation)

**Additional finding (investigated 2026-03-06):** The DELETE handler also calls `writeEventRecord("LICENSE_REVOKED", ...)` — this event type must become `"MEMBER_REVOKED"` since this is an admin action on a member, not a license-level revocation. The `memberRevoked` email template is confirmed as a NEW required template (see Step 5).

**Technical Debt (post-launch):** The naming conventions adopted here (`payment_suspended`, `admin_suspended`, `admin_revoked`) are designed to be extensible. Future iterations may require `hic_suspended` or `hic_revoked` states for platform-level administrative actions (e.g., ToS violations). Any ambiguous `"revoked"` or `"REVOKED"` values found across the codebase during implementation should be classified as either `admin_revoked` (implemented — org owner/admin action on a member) or `revoked` (license-level — Keygen webhook or future HIC admin action), and disambiguated accordingly. Add to Technical Debt Log for post-launch implementation.

#### [plg-website/src/app/api/portal/team/route.js](plg-website/src/app/api/portal/team/route.js)

| Line(s) | Current Code                                                       | Change To                                                              |
| ------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| ~365    | `["active", "suspended", "revoked"]` (validation)                  | `["active", "admin_suspended", "admin_revoked"]`                       |
| ~367    | Error: `"Must be active, suspended, or revoked"`                   | `"Must be active, admin_suspended, or admin_revoked"`                  |
| ~393    | `status === "suspended" ? "LICENSE_SUSPENDED" : "LICENSE_REVOKED"` | `status === "admin_suspended" ? "MEMBER_SUSPENDED" : "MEMBER_REVOKED"` |
| ~394    | `writeEventRecord("LICENSE_SUSPENDED", {...})`                     | `writeEventRecord("MEMBER_SUSPENDED", {...})`                          |

#### [plg-website/src/app/portal/team/TeamManagement.js](plg-website/src/app/portal/team/TeamManagement.js)

| Line(s)  | Current Code                                          | Change To                                          |
| -------- | ----------------------------------------------------- | -------------------------------------------------- |
| ~129     | `status === "suspended" ? "suspend" : ...`            | `status === "admin_suspended" ? "suspend" : ...`   |
| ~501-502 | `member.status === "suspended"` (badge)               | `member.status === "admin_suspended"`              |
| ~522-523 | `handleUpdateStatus(member.id, "suspended")`          | `handleUpdateStatus(member.id, "admin_suspended")` |
| ~602     | `member.status === "suspended"` (mobile)              | `member.status === "admin_suspended"`              |
| ~623     | `handleUpdateStatus(member.id, "suspended")` (mobile) | `handleUpdateStatus(member.id, "admin_suspended")` |

### 7.3 Shared / Ambiguous Paths

These files are called from **both** paths and cannot distinguish the caller:

#### [plg-website/src/lib/dynamodb.js](plg-website/src/lib/dynamodb.js)

| Function                  | Line(s)    | Issue                                                                                  | Change                                                                                                                           |
| ------------------------- | ---------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `updateLicenseStatus()`   | ~570-603   | Accepts any status string — no validation or discriminator                             | **No change needed** — the function is generic, callers are responsible for passing `"payment_suspended"` or `"admin_suspended"` |
| `updateOrgMemberStatus()` | ~1649-1680 | Generic member status updater                                                          | **No change needed** — callers must pass `"admin_suspended"` or `"admin_revoked"`                                                |
| `writeEventRecord()`      | ~2100-2180 | Takes `eventType` parameter — currently receives `"LICENSE_SUSPENDED"` from both paths | Callers updated: payment path sends `"LICENSE_PAYMENT_SUSPENDED"`, admin path sends `"MEMBER_SUSPENDED"`                         |
| `updateOrgInviteStatus()` | ~2115-2170 | Receives `"suspended"` from admin path                                                 | Callers must pass `"admin_suspended"`                                                                                            |

#### [plg-website/src/lib/keygen.js](plg-website/src/lib/keygen.js)

| Function             | Line(s)  | Issue                                                                                                  |
| -------------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `reinstateLicense()` | ~246-250 | Called on payment recovery; no ambiguity (always payment-related)                                      |
| `suspendLicense()`   | (exists) | Called from Stripe webhook only (payment); **NOT called from admin suspension** — this is the sync gap |

#### [plg-website/src/lib/constants.js](plg-website/src/lib/constants.js)

| Line(s)  | Current                                         | Change To                                                                             |
| -------- | ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| ~123-133 | `LICENSE_STATUS` enum — no `SUSPENDED` entry    | Add `PAYMENT_SUSPENDED: "payment_suspended"` and `ADMIN_SUSPENDED: "admin_suspended"` |
| ~136-146 | `LICENSE_STATUS_DISPLAY` — no suspended display | Add display entries for both new statuses                                             |

### 7.4 Keygen API Library (`keygen.js`)

The Keygen API calls that exist in `plg-website/src/lib/keygen.js`:

| Function | Keygen Endpoint | Present? |
|---|---|---|
| `createLicense` | `POST /licenses` | ✅ |
| `getLicense` | `GET /licenses/{id}` | ✅ |
| `getLicensesByEmail` | `GET /licenses?metadata[email]=...` | ✅ |
| `validateLicense` | `POST /licenses/actions/validate-key` | ✅ |
| `suspendLicense` | `POST /licenses/{id}/actions/suspend` | ✅ |
| `reinstateLicense` | `POST /licenses/{id}/actions/reinstate` | ✅ |
| `revokeLicense` | `POST /licenses/{id}/actions/revoke` | ✅ |
| `checkoutLicense` | `POST /licenses/{id}/actions/check-out` | ✅ |
| `renewLicense` | `POST /licenses/{id}/actions/renew` | ❌ **MISSING** |

The missing `renewLicense` function is the root cause of the expiration drift documented in Section 3.2.

### 7.5 Stripe Webhook Handler (All Payment-Path Functions)

**File:** `plg-website/src/app/api/webhooks/stripe/route.js`

The `"suspended"` string appears across five handler functions in this file, not just `handlePaymentSucceeded`. The `handlePaymentSucceeded` function is the primary merge point where disambiguation and expiration fixes converge, but `handleSubscriptionUpdated`, `handleSubscriptionDeleted`, `handlePaymentFailed`, `handleDisputeCreated`, and `handleDisputeClosed` all have touch points (see expanded Section 7.1 table — 9 total touch points).

**Current flow (`handlePaymentSucceeded`):**

```
invoice.payment_succeeded →
  1. resolveCustomer(stripeCustomerId) → dbCustomer
  2. updateLicenseStatus(licenseId, "active", { expiresAt })     ← DynamoDB only
  3. if "suspended" → reinstateLicense(licenseId)                 ← Keygen API
```

**Proposed flow (after both workstreams applied):**

```
invoice.payment_succeeded →
  1. resolveCustomer(stripeCustomerId) → dbCustomer
  2. updateLicenseStatus(licenseId, "active", { expiresAt })     ← DynamoDB
  3. if "payment_suspended" → reinstateLicense(licenseId)         ← Keygen API (disambiguated)
  4. renewLicense(licenseId)                                      ← Keygen API (NEW)
```

**Key changes across all handler functions:**

| Change | Workstream | Details |
|---|---|---|
| `"suspended"` → `"payment_suspended"` across all 5 handler functions | Disambiguation | 9 touch points (Section 7.1) |
| Add `renewLicense(licenseId)` call in `handlePaymentSucceeded` | Expiration fix | New call site (~5 lines with error handling) |
| Reinstate-before-renew ordering in `handlePaymentSucceeded` | Expiration fix | If a Keygen license is in `SUSPENDED` state, calling `actions/renew` may fail; reinstatement must precede renewal |

**Note on ordering:** The reinstate check uses the disambiguated status string (`"payment_suspended"` instead of `"suspended"`). The `renewLicense` call happens unconditionally after reinstatement (if needed), because every successful payment should extend the Keygen expiry regardless of prior status.

### 7.6 Heartbeat Endpoint

**File:** `plg-website/src/app/api/license/heartbeat/route.js`

The heartbeat endpoint currently only pings the Keygen machine (`POST /machines/{fingerprint}/actions/ping`). It has no awareness of Keygen license expiry or DynamoDB license status. When the machine ping succeeds and the license is found in DynamoDB, it returns `{ valid: true, status: "active" }` regardless of whether the license is actually expired or suspended.

This creates a race condition with the validate endpoint:
- After `_doRefresh` runs (calls validate) → state = `EXPIRED`
- After next heartbeat (every 10 minutes) → state = `LICENSED`
- The status bar shows whichever ran last

The fix (Section 8.8) adds a DynamoDB license status check to the heartbeat endpoint so the extension learns about expiration/suspension promptly.

**⚠️ DEFECT — "license not found" fallback returns `valid: true` (lines ~244-256):**

When the Keygen machine ping succeeds but the license is not found in DynamoDB (`getLicenseByKey` returns null), the heartbeat returns `{ valid: true, status: "active" }`. This is incorrect — a missing DynamoDB license record should not be treated as an active license. If a license was deleted from DynamoDB, revoked, or never synced, the heartbeat should return `{ valid: false, status: "unknown" }` and the extension should prompt the user to re-enter their license key or contact support. This defect must be fixed as part of Step 8.8. The current behavior allows a user with no valid license record to continue using Mouse indefinitely as long as their Keygen machine heartbeat succeeds.

### 7.7 Email Templates

#### [dm/layers/ses/src/email-templates.js](dm/layers/ses/src/email-templates.js)

| Line(s)   | Current                                               | Issue                                                                     | Change                                                                  |
| --------- | ----------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| ~547-598  | `licenseSuspended` template                           | Body says "may be due to a billing issue or policy violation" — ambiguous | **Split into two templates** (see Section 8.5)                          |
| ~838, 859 | "License suspended immediately" in dispute email      | Payment-specific; keep wording but change template ref                    | Wording is fine (it IS about billing), just ensure template name aligns |
| ~889      | `"licenseSuspended"` in template names array          |                                                                           | Replace with `"licensePaymentSuspended"` + add `"memberSuspended"`      |
| ~903      | `LICENSE_SUSPENDED: "licenseSuspended"` event mapping |                                                                           | Replace with two mappings (see Section 8.5)                             |

#### [dm/layers/ses/generate-email-preview.js](dm/layers/ses/generate-email-preview.js)

| Line(s) | Current                     | Change                                                   |
| ------- | --------------------------- | -------------------------------------------------------- |
| ~59, 94 | `licenseSuspended` metadata | Split into `licensePaymentSuspended` + `memberSuspended` |

### 7.8 Metrics & Reporting

| File                                      | Line(s)                    | Change                                                 |
| ----------------------------------------- | -------------------------- | ------------------------------------------------------ |
| `plg-website/scripts/plg-metrics.js` ~273 | `suspended: 0` counter     | Split: `payment_suspended: 0, admin_suspended: 0`      |
| `plg-website/scripts/plg-metrics.js` ~294 | `=== "SUSPENDED"` counting | Branch on `"PAYMENT_SUSPENDED"` vs `"ADMIN_SUSPENDED"` |
| `plg-website/scripts/plg-metrics.js` ~487 | Report output              | Display both counts separately                         |

### 7.9 Test Files

Every test file that references `"suspended"` or `"LICENSE_SUSPENDED"` must be updated. These changes are mechanical but voluminous:

| File                                                       | Approximate Touch Points                                  |
| ---------------------------------------------------------- | --------------------------------------------------------- |
| `__tests__/unit/api/webhooks.test.js`                      | ~15 references to `"suspended"` and `"LICENSE_SUSPENDED"` |
| `__tests__/unit/lib/dynamodb.test.js`                      | ~5 references in `updateLicenseStatus` tests              |
| `__tests__/unit/lib/keygen.test.js`                        | ~2 references in reinstate tests                          |
| `__tests__/unit/api/team.test.js`                          | ~4 references to member status validation                 |
| `__tests__/unit/lambda/customer-update.test.js`            | ~6 references in payment failure/recovery tests           |
| `__tests__/unit/lambda/email-sender.test.js`               | ~4 references to `LICENSE_SUSPENDED` event type           |
| `__tests__/unit/api/license.test.js`                       | ~3 references to `SUSPENDED` code                         |
| `__tests__/e2e/contracts/webhook-api.test.js`              | ~4 references in contract tests                           |
| `__tests__/e2e/journeys/j3-license-activation.test.js`     | ~2 suspended fixture references                           |
| `__tests__/e2e/journeys/j8-subscription-lifecycle.test.js` | ~8 suspended lifecycle tests                              |
| `__tests__/fixtures/licenses.js`                           | ~2 `suspendedLicense` fixture                             |
| `dm/tests/facade/unit/email-templates.test.js`             | ~6 template mapping tests                                 |

**Total estimated test changes: ~60+**

---

## 8. Implementation Plan

### 8.1 Step 1: Remove RETIRED Dead Code

Remove `RETIRED` from `LICENSE_STATUS`, `LICENSE_STATUS_DISPLAY`, and the corresponding test assertion (see Section 6.2 for the 3-file scope). This is a trivial first step that reduces noise before the substantive changes begin.

### 8.2 Step 2: Update Constants (Lowercase Values + New Statuses)

**File:** `plg-website/src/lib/constants.js`

This step combines two changes in one pass: (1) normalize all enum values to lowercase, and (2) add the new disambiguated statuses.

```javascript
export const LICENSE_STATUS = {
  PENDING_ACCOUNT: "pending_account",
  TRIAL: "trial",
  ACTIVE: "active",
  PAST_DUE: "past_due",
  PAYMENT_SUSPENDED: "payment_suspended",   // NEW — payment failure suspension
  ADMIN_SUSPENDED: "admin_suspended",       // NEW — owner/admin suspends member
  CANCELLATION_PENDING: "cancellation_pending",
  CANCELED: "canceled",
  EXPIRED: "expired",
  DISPUTED: "disputed",
  REVOKED: "revoked",
  ADMIN_REVOKED: "admin_revoked",           // NEW — owner/admin revokes member
};

export const LICENSE_STATUS_DISPLAY = {
  active: { label: "Active", variant: "success" },
  trial: { label: "Trial", variant: "info" },
  past_due: { label: "Past Due", variant: "warning" },
  payment_suspended: { label: "Suspended (Payment)", variant: "error" },
  admin_suspended: { label: "Suspended (Admin)", variant: "warning" },
  cancellation_pending: { label: "Cancellation Pending", variant: "warning" },
  canceled: { label: "Canceled", variant: "neutral" },
  expired: { label: "Expired", variant: "error" },
  disputed: { label: "Disputed", variant: "error" },
  revoked: { label: "Revoked", variant: "error" },
  admin_revoked: { label: "Revoked (Admin)", variant: "error" },
};
```

**⚠️ INVESTIGATED — CONFIRMED ABSENT — `EVENT_TYPES` constant:**

**Confirmed (investigated 2026-03-06):** `export const EVENT_TYPES` returns zero matches across the entire codebase. All event type strings are hardcoded at each call site. A new `EVENT_TYPES` export must be created in `constants.js` as a prerequisite for the disambiguation work.

**Complete event type enum** (all 15 event types identified from `EVENT_TYPE_TO_TEMPLATE` mapping in `dm/layers/ses/src/email-templates.js` plus new disambiguated types):

```javascript
export const EVENT_TYPES = {
  // Payment lifecycle
  LICENSE_PAYMENT_SUSPENDED: "LICENSE_PAYMENT_SUSPENDED",
  LICENSE_REINSTATED: "LICENSE_REINSTATED",
  LICENSE_EXPIRED: "LICENSE_EXPIRED",
  LICENSE_RENEWED: "LICENSE_RENEWED",
  PAYMENT_FAILED: "PAYMENT_FAILED",
  NONPAYMENT_CANCELLATION_EXPIRED: "NONPAYMENT_CANCELLATION_EXPIRED",
  // Admin actions on members
  MEMBER_SUSPENDED: "MEMBER_SUSPENDED",
  MEMBER_REVOKED: "MEMBER_REVOKED",
  MEMBER_REACTIVATED: "MEMBER_REACTIVATED",
  // License lifecycle
  LICENSE_CREATED: "LICENSE_CREATED",
  LICENSE_ACTIVATED: "LICENSE_ACTIVATED",
  LICENSE_CANCELED: "LICENSE_CANCELED",
  // Dispute
  LICENSE_DISPUTED: "LICENSE_DISPUTED",
  DISPUTE_RESOLVED: "DISPUTE_RESOLVED",
  // Org/team
  MEMBER_INVITED: "MEMBER_INVITED",
};
```

**Note:** The Lambda at `infrastructure/lambda/customer-update/index.js` can import `constants.js` (and any other pure-logic shared modules) at runtime, provided those files are bundled into the Lambda's zip at build time. `constants.js` is pure JavaScript — zero AWS SDK dependencies, zero Node.js built-in dependencies, zero environment-specific code — just `export const` declarations. The `deploy.sh` build step (line ~413) copies shared files into the Lambda source directory before zipping, making them available via relative import. See Section 8.4.3 for the build-time bundling approach. The Lambda should import `EVENT_TYPES` and `LICENSE_STATUS` directly from the copied `constants.js` rather than hardcoding enum values.
```

**What changed from v1 of this plan:**

- Enum keys remain UPPER_CASE (they are JavaScript constant names)
- Enum *values* are now lowercase (`"active"` not `"ACTIVE"`) — matching the dominant convention across all 8 DynamoDB writer files
- `LICENSE_STATUS_DISPLAY` keys are now lowercase — eliminating the need for `.toUpperCase()` bridges in portal pages
- `RETIRED` has been removed (Step 1)

All subsequent steps reference these enum constants instead of hardcoded strings where possible.

### 8.3 Step 3: Add `renewLicense` to `keygen.js`

**File:** `plg-website/src/lib/keygen.js`

```javascript
/**
 * Renew a license, extending its expiry by the policy's duration.
 * Called when Stripe confirms a successful subscription payment.
 *
 * @param {string} licenseId - Keygen license UUID
 * @returns {Promise<Object>} - Renewed license data
 */
export async function renewLicense(licenseId) {
  const response = await keygenRequest(
    `/licenses/${licenseId}/actions/renew`,
    { method: "POST" },
  );

  return {
    id: response.data.id,
    status: response.data.attributes.status,
    expiresAt: response.data.attributes.expiry,
  };
}
```

This must be added before Step 4 (updating the Stripe webhook), since Step 4 calls this function.

### 8.4 Step 4: Update Stripe Webhook (Disambiguation + `renewLicense` Call)

This step applies all payment-path changes in a single pass across three files.

**All changes use lowercase status strings in DynamoDB** (consistent with the convention decided in Section 5.3). Writer files should reference `LICENSE_STATUS` enum constants where practical.

#### 8.4.1 Stripe Webhook — `handlePaymentSucceeded`

**File:** `plg-website/src/app/api/webhooks/stripe/route.js`

Disambiguation changes (9 touch points from Section 7.1 across all handler functions) plus the `renewLicense` integration.

**Note:** The `handleSubscriptionUpdated` function's `statusMap` object should reference `LICENSE_STATUS` enum constants rather than hardcoded strings (e.g., `unpaid: LICENSE_STATUS.PAYMENT_SUSPENDED` instead of `unpaid: "payment_suspended"`). This applies to all entries in the map, not just the `unpaid` entry.

Code for `handlePaymentSucceeded`:

```javascript
// After updateLicenseStatus call:

// Reinstate FIRST if license was payment-suspended (Keygen state machine
// may reject renew on a suspended license)
if (priorStatus === "payment_suspended") {
  try {
    await reinstateLicense(dbCustomer.keygenLicenseId);
    log.info("license_reinstated", "Keygen license reinstated on payment success", {
      licenseId: dbCustomer.keygenLicenseId,
    });
  } catch (e) {
    log.warn("license_reinstate_failed", "Failed to reinstate Keygen license", {
      licenseId: dbCustomer.keygenLicenseId,
      errorMessage: e?.message,
    });
  }
}

// THEN renew expiry (unconditional — every successful payment extends the clock)
if (dbCustomer.keygenLicenseId) {
  try {
    const renewed = await renewLicense(dbCustomer.keygenLicenseId);
    log.info("license_renewed", "Keygen license renewed on payment success", {
      licenseId: dbCustomer.keygenLicenseId,
      newExpiry: renewed.expiresAt,
    });
  } catch (e) {
    log.warn("license_renew_failed", "Failed to renew Keygen license on payment success", {
      licenseId: dbCustomer.keygenLicenseId,
      errorMessage: e?.message,
    });
  }
}
```

**Critical ordering note:** Reinstate before renew. If a Keygen license is in `SUSPENDED` state, calling `actions/renew` may fail or produce unexpected behavior depending on Keygen's state machine.

#### 8.4.2 Keygen Webhook

**File:** `plg-website/src/app/api/webhooks/keygen/route.js`

2 touch points from Section 7.1:
- `updateLicenseStatus(licenseId, "payment_suspended", {...})`
- `eventType: "LICENSE_PAYMENT_SUSPENDED"`

#### 8.4.3 Customer-Update Lambda

**File:** `plg-website/infrastructure/lambda/customer-update/index.js`

2 direct touch points from Section 7.1, plus the `wasSuspended` logic fix:
- `priorStatus === "payment_suspended"` (line ~322, in `handleSubscriptionDeleted`)
- `updateLicenseStatus(id, "payment_suspended", { suspendedAt, suspendReason: "payment_failed" })` (line ~443, in `handlePaymentFailed`)
- `wasSuspendedForNonpayment` logic expansion (line ~375, in `handlePaymentSucceeded` — see ⚠️ investigation note in Section 7.1)

**⚠️ RESOLVED — DRY violation: Build-time bundling of shared pure-logic modules (decided 2026-03-06, corrected 2026-03-06):**

The customer-update Lambda at `infrastructure/lambda/customer-update/index.js` has its own implementations of three functions that duplicate canonical versions in `src/lib/dynamodb.js`:

1. `updateLicenseStatus` (Lambda line ~110) — parallel to `dynamodb.js` line ~570
2. `updateCustomerSubscription` (Lambda line ~148) — parallel to `dynamodb.js`
3. `writeEventRecord` (Lambda line ~176) — parallel to `dynamodb.js` line ~2121

**Architectural context:** The Lambda imports AWS SDK clients from Lambda layers (`hic-dynamodb-layer`, `hic-base-layer`, `hic-config-layer`). `src/lib/dynamodb.js` imports from `@aws-sdk/lib-dynamodb` (Next.js `node_modules`). These are separate execution environments — the Lambda cannot import `dynamodb.js` directly because it depends on the Next.js module system and `@aws-sdk` from `node_modules`. However, **pure-logic files with zero dependencies** (like `constants.js` and a new `license-helpers.js`) CAN be shared: they just need to be present in the Lambda's zip at runtime. The `/dm/layers` directory is not involved.

**Decision:** Extract shared pure-logic into files that live in one canonical location (`src/lib/`), get copied into each Lambda's source directory at build time by `deploy.sh`, and are imported via relative path by the Lambda. Both environments import the same file — no duplication, no drift. See Addendum A.1 for implementation steps.

**What can be shared (pure logic, zero SDK dependencies):**

1. `constants.js` — `LICENSE_STATUS`, `EVENT_TYPES`, `MAX_PAYMENT_FAILURES` enums (already exists, pure JS)
2. `license-helpers.js` — NEW: DynamoDB key construction (`LICENSE#${id}`), UpdateExpression builders, event record construction (pure logic extracted from the three duplicated functions)

**What cannot be shared (SDK-dependent):**

The actual `dynamoClient.send(new UpdateCommand(...))` / `dynamoClient.send(new PutCommand(...))` calls — these depend on the DynamoDB client, which comes from different sources in each environment. The Lambda keeps thin wrapper functions that call the shared helpers for key/expression construction, then execute the SDK call with their own client.

### 8.5 Step 5: Split Email Templates

**File:** `dm/layers/ses/src/email-templates.js`

Replace the single `licenseSuspended` template with two:

**`licensePaymentSuspended`** — for payment failures:

- Subject: `"Action Required: Update Your Payment Method for ${PRODUCT_NAME}"`
- Body: Clear explanation that payment failed, link to billing portal
- CTA button: "Update Payment Method" → `${APP_URL}/portal/billing`
- No mention of "policy violation"

**`memberSuspended`** — for admin action:

- Subject: `"Your access to ${PRODUCT_NAME} via [OrgName] has been suspended"`
- Body: "Your organization's administrator has suspended your access."
- CTA button: "Contact Your Admin" (or just informational, no CTA)
- Receives `organizationName` parameter

**Event type mapping update:**

```javascript
const EVENT_TYPE_TO_TEMPLATE = {
  // ... existing mappings ...
  LICENSE_PAYMENT_SUSPENDED: "licensePaymentSuspended", // was: LICENSE_SUSPENDED → licenseSuspended
  MEMBER_SUSPENDED: "memberSuspended", // NEW
  MEMBER_REVOKED: "memberRevoked", // NEW — required (confirmed 2026-03-06); admin revokes member, distinct from license-level revocation
  // Keep legacy mapping during transition:
  LICENSE_SUSPENDED: "licensePaymentSuspended", // Backward compat for unprocessed events
};
```

### 8.6 Step 6: Update Admin Suspension Path

**Files to update:**

1. `portal/team/route.js` — 4 changes (Section 7.2)
2. `portal/team/TeamManagement.js` — 5+ changes (Section 7.2)

### 8.7 Step 7: Remove `.toUpperCase()` Bridges and Consolidate Billing Labels

Now that `LICENSE_STATUS_DISPLAY` uses lowercase keys (Step 2), the runtime casing bridges are unnecessary.

#### 8.7.1 Remove `.toUpperCase()` Bridges

**File:** `plg-website/src/app/portal/page.js` (~line 264)

```javascript
// Before:
LICENSE_STATUS_DISPLAY[subscriptionStatus?.toUpperCase()]
// After:
LICENSE_STATUS_DISPLAY[subscriptionStatus]
```

**File:** `plg-website/src/app/portal/license/page.js` (~line 111)

```javascript
// Before:
license.status?.toUpperCase() || "ACTIVE"
// After:
license.status || "active"
```

The `.toUpperCase()` calls were duct tape bridging lowercase DynamoDB/Keygen values to UPPER_CASE `LICENSE_STATUS_DISPLAY` keys. With lowercase keys, the bridge is eliminated.

#### 8.7.2 Consolidate Billing Labels Map

**File:** `plg-website/src/app/portal/billing/page.js` (~lines 355-365)

The billing page has an independent hardcoded labels map that duplicates `LICENSE_STATUS_DISPLAY`. Replace it with a reference to the shared constant:

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
```

**⚠️ MUST FIX (confirmed 2026-03-06):** The billing page labels map includes Stripe-specific statuses (`trialing`, `unpaid`, `incomplete`, `incomplete_expired`, `pending`, `paused`) that do not exist in `LICENSE_STATUS_DISPLAY`. These must be added to `LICENSE_STATUS_DISPLAY` in Step 2 to ensure complete coverage. The billing page should then use a merge approach: `const displayConfig = { ...LICENSE_STATUS_DISPLAY, ...billingSpecificOverrides }` where `billingSpecificOverrides` contains only billing-page-specific label/variant customizations. This eliminates the independent labels map while preserving billing-specific display needs.

#### 8.7.3 Fix Portal Status Route — Exhaustive Status Classification

**File:** `plg-website/src/app/api/portal/status/route.js`

**⚠️ PRE-EXISTING BUG — incomplete status classification (line ~123):**

The portal status route classifies subscription statuses into two arrays:

```javascript
const hasActiveSubscription = ["active", "trialing", "cancellation_pending"].includes(subscriptionStatus);
const hasExpiredSubscription = ["canceled", "past_due", "unpaid"].includes(subscriptionStatus);
```

This classification is incomplete. The following statuses are not covered by either array and will fall through to `status: "none"`, causing the portal to redirect the user to checkout as if they have no subscription:

| Missing Status | Should Classify As | Rationale |
|---|---|---|
| `"payment_suspended"` | `hasExpiredSubscription` (or new `hasSuspendedSubscription`) | License suspended for nonpayment — user needs to update payment method, not re-checkout |
| `"admin_suspended"` | `hasSuspendedSubscription` (new) | Member suspended by org admin — user should see a message, not checkout |
| `"admin_revoked"` | `hasExpiredSubscription` | Member permanently removed by org admin |
| `"expired"` | `hasExpiredSubscription` | License expired — already handled by `"unpaid"` proxy but should be explicit |
| `"disputed"` | `hasExpiredSubscription` | Chargeback dispute — license suspended pending resolution |

**Proposed fix — exhaustive classification with explicit handling of all known statuses:**

```javascript
const hasActiveSubscription = [
  "active",
  "trialing",
  "cancellation_pending",
].includes(subscriptionStatus);

const hasSuspendedSubscription = [
  "payment_suspended",
  "admin_suspended",
].includes(subscriptionStatus);

const hasPastDueSubscription = [
  "past_due",
].includes(subscriptionStatus);

const hasExpiredSubscription = [
  "canceled",
  "unpaid",
  "expired",
  "disputed",
  "admin_revoked",
].includes(subscriptionStatus);

// ⚠️ CORRECTION (investigated 2026-03-06): "past_due" was previously in hasExpiredSubscription,
// which caused the portal to return status: "expired" for past_due customers. This is WRONG.
// past_due is a grace period with active retry logic — the customer's subscription is still
// alive and Stripe is retrying payment. Returning "expired" would redirect them to checkout
// instead of showing a "please update your payment method" message.
```

The response `status` field should then be extended:

```javascript
const response = {
  status: hasActiveSubscription
    ? "active"
    : hasPastDueSubscription
      ? "past_due"
      : hasSuspendedSubscription
        ? "suspended"
        : hasExpiredSubscription
          ? "expired"
          : "none",
  // ...
};
```

The portal UI must handle the new `"suspended"` status value to show an appropriate message (e.g., "Your license has been suspended. Please update your payment method." for payment suspension, or "Your access has been suspended by your organization administrator." for admin suspension). The `subscriptionStatus` field in the response already carries the specific status string for the UI to differentiate.

**All possible `subscriptionStatus` values must be explicitly classified.** Any value not in one of the three arrays should be logged as a warning and treated as `"none"` (redirect to checkout) as a safe default — but this should never happen if the enum is kept in sync with all writers.

**Note:** These arrays should reference `LICENSE_STATUS` enum constants rather than hardcoded strings, consistent with the casing normalization in Step 2.
### 8.8 Step 8: Fix Heartbeat Race Condition

**File:** `plg-website/src/app/api/license/heartbeat/route.js`

After the machine ping succeeds and the license is found in DynamoDB, add a license status check:

```javascript
// Check if license is expired/suspended in DynamoDB
if (
  license.status === "expired" ||
  license.status === "payment_suspended" ||
  license.status === "admin_suspended"
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

This prevents the heartbeat from masking an expired or suspended license. The extension will learn about the status change within one heartbeat cycle (10 minutes) instead of waiting for the next `_doRefresh` validate call.

**Note:** Uses the new disambiguated status strings from Step 2. Must be implemented after the constants update.

**⚠️ MUST FIX — "license not found" fallback returns `valid: true` (lines ~244-256):**

In addition to the status check above, the heartbeat endpoint has a critical defect: when the Keygen machine ping succeeds but `getLicenseByKey(licenseKey)` returns `null` (license not in DynamoDB), the current code returns `{ valid: true, status: "active" }`. This is completely wrong — a missing license record should never be treated as active. This allows a user with no valid license record to continue using Mouse indefinitely.

**This must be fixed in the same step.** Replace the "license not found" fallback (lines ~244-256) with:

```javascript
if (!license) {
  // License not in our database — do NOT assume active.
  // The user must re-enter their license key or contact support.
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

**⚠️ ADDITION (confirmed 2026-03-06):** The `retryAfter: 30` field handles the eventual consistency edge case where a newly provisioned license has not yet propagated to DynamoDB (e.g., Stripe webhook → Lambda → DynamoDB write is still in flight). The extension should implement retry-once behavior: on receiving `status: "unknown"` with `retryAfter`, wait the specified seconds and retry the heartbeat once. If the second attempt also returns `"unknown"`, then surface the error to the user. This prevents false-positive "license not found" errors during the payment/licensing relay window.

The extension should handle `valid: false, status: "unknown"` (after retry exhaustion) by toggling to an expired/unlicensed state and preventing the user from proceeding with Mouse usage until a valid license key is furnished. This is not a graceful degradation scenario — it is an error state that must be surfaced to the user.

### 8.9 Step 9: Close Admin → Keygen Sync Gap

Currently, when an admin suspends a member:

1. `updateOrgMemberStatus(orgId, memberId, "admin_suspended")` → DynamoDB ✓
2. Email pipeline triggered → ✓
3. **Keygen: nothing happens** → ✗

For Business licenses with multiple seats, the member's device entitlements in Keygen should be deactivated. After the SQS queue (parent remediation plan Section 1.2) is in place:

```javascript
// In portal/team/route.js, after updateOrgMemberStatus:
if (status === "admin_suspended" || status === "admin_revoked") {
  // Deactivate member's machines in Keygen via sync queue
  const memberDevices = await getMemberDevices(orgId, memberId);
  for (const device of memberDevices) {
    await enqueueKeygenSync({
      action: "deactivate_machine",
      machineId: device.keygenMachineId,
      triggeredBy: "admin_action",
      correlationId: `admin-${status}-${memberId}`,
    });
  }
}
```

This depends on Section 1.2 of the parent plan (SQS queue). Sequence accordingly.

### 8.10 Step 10: Update Metrics & Reporting

**File:** `plg-website/scripts/plg-metrics.js`

- Split `suspended` counter into `payment_suspended` and `admin_suspended`
- Update report output format
- **✅ Keygen casing confirmed (investigated 2026-03-06):** Keygen returns UPPER_CASE status consistently across ALL endpoints (list, retrieve, create, validate). The metrics script's UPPER_CASE comparisons against Keygen responses are correct. No casing changes needed for Keygen-sourced comparisons. Only DynamoDB-sourced status comparisons need updating if enum values change to lowercase (Step 2).

### 8.11 Step 11: Update Extension Casing

**Repo:** Extension (`~/source/repos/hic`)

The extension has its own casing split (see Section 5.1, Layer 8). Changes:

1. Change `LICENSE_STATES` values in `.hic/licensing/constants.js` to lowercase: `SUSPENDED: "suspended"`, `EXPIRED: "expired"`, etc.
2. Remove `.toLowerCase()` normalization calls in `state.js` `getStatus()` and `heartbeat.js`
3. Update `http-client.js` comparisons (already lowercase, but verify consistency)
4. Update `VALID_LICENSE_STATES` in `validation.js` to include `"payment_suspended"` and `"admin_suspended"` if the heartbeat/validate APIs will return these new status strings

This is a separate repo and can be done independently of the website changes, but should be coordinated to ensure the extension recognizes the new status strings.

**⚠️ INVESTIGATED — MUST FIX — `heartbeat.js` status string matching (line ~213):**

The extension's `heartbeat.js` `_handleHeartbeatResponse` method uses a `switch` statement to map server status strings to local states. The current case:

```javascript
case "license_suspended":
  newStatus = config.LICENSE_STATES.SUSPENDED.toLowerCase();
  break;
```

After the heartbeat endpoint fix (Step 8.8), the server will return `status: "license_payment_suspended"` or `status: "license_admin_suspended"` (via the `license_${license.status}` template). The current `case "license_suspended":` will **not match** either of these new strings. This must be updated to:

```javascript
case "license_payment_suspended":
case "license_admin_suspended":
  newStatus = config.LICENSE_STATES.SUSPENDED.toLowerCase();
  break;
case "unknown":
  // License not found in DynamoDB — treat as expired/unlicensed.
  // If retryAfter is present, the heartbeat layer should retry once before reaching this case.
  newStatus = config.LICENSE_STATES.EXPIRED.toLowerCase();
  break;
```

**⚠️ ADDITIONAL NOTE (investigated 2026-03-06):** After the casing normalization in Step 11 (changing `LICENSE_STATES` values to lowercase), the `.toLowerCase()` calls in this switch statement become pointless — `config.LICENSE_STATES.SUSPENDED` will already be `"suspended"`. The `.toLowerCase()` calls should be removed as part of Step 11 to avoid the misleading `.toLowerCase()` → `.toUpperCase()` round-trip pattern.

Alternatively, if the extension should differentiate between payment and admin suspension (e.g., to show different messages), separate handling can be added. At minimum, both new strings plus `"unknown"` must be matched to prevent the extension from silently ignoring status changes from the server.

### 8.12 Step 12: Backward Compatibility / Migration

#### 8.12.1 Legacy record handling

Existing DynamoDB records with `status: "suspended"` need migration. The reconciliation job (parent plan Section 1.3) should include:

```javascript
// In reconciliation handler:
if (license.status === "suspended") {
  // Determine which type based on available metadata
  const newStatus =
    license.suspendReason === "payment_failed" ||
    license.suspendedReason === "payment_failed"
      ? "payment_suspended"
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
  await updateOrgMemberStatus(orgId, member.memberId, "admin_suspended");
  // MEMBER# suspensions are always admin-initiated
}
```

#### 8.12.2 Transitional guard in status-checking code

During the rollout period, any status check should accept both old and new values:

```javascript
// Transitional helper — remove after migration confirmed complete
function isPaymentSuspended(status) {
  return status === "payment_suspended" || status === "suspended";
}

function isAdminSuspended(status) {
  return status === "admin_suspended";
}
```

This ensures no customer loses access during the transition window.

#### 8.12.3 Unprocessed event records

Event records already in the DynamoDB stream or SQS queues may still carry `"LICENSE_SUSPENDED"`. The email sender Lambda should map this to `licensePaymentSuspended` (Section 8.5's backward compat mapping).

#### 8.12.4 Expanded scope: Casing normalization + Keygen/DynamoDB drift correction

The reconciliation job should also:

- Normalize casing for all existing records (not just `"suspended"` records) to match the lowercase convention decided in Section 5.3
- Detect and correct Keygen/DynamoDB drift: query DynamoDB for licenses with `status: "active"` approaching expiry (within 48 hours), call Keygen to verify the license state matches, and correct any divergence (renew Keygen if DynamoDB says active but Keygen says expired; expire DynamoDB if Keygen says expired and Stripe confirms no active subscription)

### 8.13 Step 13: Update Tests

Mechanical find-and-replace across ~60 test touch points, plus new tests for the expiration fixes. Group by test file:

| Test File                 | Strategy                                                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `webhooks.test.js`        | `"suspended"` → `"payment_suspended"` in all Stripe/Keygen contexts; `"LICENSE_SUSPENDED"` → `"LICENSE_PAYMENT_SUSPENDED"`; add tests for `renewLicense` call in `handlePaymentSucceeded` |
| `team.test.js`            | `"suspended"` → `"admin_suspended"`, `"LICENSE_SUSPENDED"` → `"MEMBER_SUSPENDED"`                                          |
| `customer-update.test.js` | `"suspended"` → `"payment_suspended"`                                                                                      |
| `dynamodb.test.js`        | Split into payment vs admin test cases                                                                                     |
| `email-sender.test.js`    | Update event type mappings; add tests for new templates                                                                    |
| `email-templates.test.js` | Replace `licenseSuspended` tests with `licensePaymentSuspended` + `memberSuspended`                                        |
| `license.test.js`         | `"SUSPENDED"` → `"PAYMENT_SUSPENDED"` response codes                                                                       |
| `keygen.test.js`          | Add tests for `renewLicense` function                                                                                      |
| `heartbeat.test.js`       | Add tests for license status check returning `valid: false` for expired/suspended                                          |
| E2E journey tests         | Update fixtures and expected values                                                                                        |
| `fixtures/licenses.js`    | Rename `suspendedLicense` → `paymentSuspendedLicense`; add `adminSuspendedMember` fixture; fix contradictory casing (use lowercase consistently) |

**Total estimated test changes: ~70+** (original ~60 from disambiguation + ~10 for expiration fixes)

---

## 9. Sequencing Within the Parent Remediation Plan

This work **must be integrated into Phase 1** of the parent remediation plan, not done separately. The reason: Phase 1.1 (eliminating Keygen read calls) will rewrite the validate and heartbeat endpoints to read from DynamoDB. If we do the naming change or heartbeat fix after that, we'd have to rewrite those endpoints twice.

**Recommended order within Phase 1:**

```
Prereq   Keygen policy durations updated in dashboard (Section 2.3)     ← After Step 4 is deployed

8.1      Remove RETIRED dead code                                       ← Trivial cleanup
8.2      Update constants (lowercase values + new statuses)              ← Foundation for everything
8.3      Add renewLicense to keygen.js                                   ← Must exist before Step 4
8.4      Update payment suspension path + renewLicense call              ← Stripe webhook + Keygen webhook + Lambda
8.5      Split email templates                                          ← Independent of app code
8.6      Update admin suspension path                                    ← Portal team API + UI
8.7      Remove .toUpperCase() bridges + consolidate billing labels      ← After constants are lowercase
8.8      Fix heartbeat race condition                                    ← Uses new status strings

─── Parent plan §1.1: Eliminate Keygen read calls ───                    ← References new status strings from the start

8.9      Close admin → Keygen sync gap                                   ← Depends on parent §1.2 (SQS queue)
8.10     Update metrics/reporting                                        ← Can happen anytime after 8.2
8.11     Update extension casing                                         ← Separate repo, independent
8.12     Backward compatibility / migration                              ← After all code changes
8.13     Update tests                                                    ← Always last

─── Parent plan §1.2+: SQS queue work ───                               ← References correct status names from the start
```

**Key sequencing constraints:**

- Steps 8.1–8.8 must complete before parent §1.1 (Keygen read elimination), so the rewritten endpoints use the final status strings
- Step 8.3 must precede Step 8.4 (the Stripe webhook calls `renewLicense`)
- Step 8.7 must follow Step 8.2 (bridges are only safe to remove after `LICENSE_STATUS_DISPLAY` keys are lowercase)
- Step 8.8 must follow Step 8.2 (heartbeat checks reference the new disambiguated status strings)
- Step 8.9 depends on parent §1.2 (SQS queue infrastructure)
- The Keygen dashboard duration change (Section 2.3) should happen only after Step 8.4 is deployed and tested — changing durations before `renewLicense` is live just delays the same expiry problem by 3 days

---

## 10. Risk Mitigation

| Risk                                                  | Likelihood | Impact | Mitigation                                                                                    |
| ----------------------------------------------------- | ---------- | ------ | --------------------------------------------------------------------------------------------- |
| Missed `"suspended"` reference causes silent breakage | Medium     | High   | Run `grep -rn '"suspended"' plg-website/src/` after all changes; no matches should remain     |
| Legacy DynamoDB records not migrated                  | Low        | Medium | Reconciliation job handles migration; transitional guards accept both values                  |
| Email template split breaks email pipeline            | Low        | High   | Keep `LICENSE_SUSPENDED` → `licensePaymentSuspended` backward mapping; deploy templates first |
| Extension breaks on new status strings                | Very Low   | Medium | Extension receives `valid: true/false` and optional status; new strings degrade gracefully    |
| Test suite overwhelm                                  | Medium     | Low    | Batch test updates by file; run tests after each file                                         |
| `renewLicense` call fails during Stripe webhook       | Low        | Medium | DynamoDB update happens first (belt-and-suspenders); failure logged as warning; reconciliation job catches drift |
| Heartbeat returns stale status during rollout          | Low        | Low    | Transitional guards accept both old and new status strings; heartbeat fix deployed after constants update |
| Casing normalization breaks portal display             | Low        | Medium | Remove `.toUpperCase()` bridges only after `LICENSE_STATUS_DISPLAY` keys are lowercased; test portal pages manually |
| Keygen policy duration change causes premature expiry  | Very Low   | High   | Change durations in Keygen dashboard only after `renewLicense` code is deployed and tested     |

---

## 11. Verification Checklist

After all changes:

- [ ] `grep -rn '"suspended"' plg-website/src/` returns **zero** matches (excluding comments)
- [ ] `grep -rn 'LICENSE_SUSPENDED' plg-website/src/` returns **zero** matches (replaced by `LICENSE_PAYMENT_SUSPENDED` or `MEMBER_SUSPENDED`)
- [ ] `grep -rn 'licenseSuspended' dm/layers/ses/` returns **zero** matches (replaced by `licensePaymentSuspended`)
- [ ] `grep -rn '\.toUpperCase()' plg-website/src/app/portal/` returns **zero** matches for status-related bridges
- [ ] `grep -rn '"ACTIVE"\|"EXPIRED"\|"REVOKED"' plg-website/src/lib/constants.js` confirms enum values are lowercase
- [ ] Payment failure → `"payment_suspended"` in LICENSE# and CUSTOMER# records
- [ ] Admin suspend member → `"admin_suspended"` in MEMBER# record
- [ ] Admin revoke member → `"admin_revoked"` in MEMBER# record
- [ ] Payment-suspended user receives email with "Update Payment Method" CTA
- [ ] Admin-suspended member receives email naming their organization
- [ ] `renewLicense` called on `invoice.payment_succeeded` → Keygen license expiry extends
- [ ] `license.renewed` webhook received by staging → DynamoDB LICENSE# updated
- [ ] Heartbeat returns `valid: false` for expired, payment_suspended, and admin_suspended licenses
- [ ] No heartbeat/validate race condition: status bar shows consistent state
- [ ] Keygen policy durations updated: 33 days (monthly), 368 days (annual)
- [ ] Reconciliation job migrates legacy `"suspended"` records and normalizes casing
- [ ] All tests pass
- [ ] Extension validate/heartbeat APIs return correct `valid: false` for both suspension types
- [ ] Portal status route (`/api/portal/status/route.js`) exhaustively classifies all status values: `"payment_suspended"`, `"admin_suspended"`, `"admin_revoked"`, `"expired"`, `"disputed"` in the correct subscription status arrays
- [ ] Heartbeat returns `valid: false, status: "unknown"` for "license not found" case (not `valid: true, status: "active"`)
- [ ] Extension `heartbeat.js` `_handleHeartbeatResponse` switch statement matches `"license_payment_suspended"`, `"license_admin_suspended"`, and `"unknown"` strings from updated heartbeat API
- [ ] Extension `heartbeat.js` implements retry-once behavior for `retryAfter` field on `status: "unknown"` responses
- [ ] `past_due` is NOT in `hasExpiredSubscription` — reclassified to `hasPastDueSubscription` returning `status: "past_due"` (not `"expired"`)
- [ ] `.toLowerCase()` normalization added at Keygen API boundaries: `keygen.js` (`validateLicense`), portal license route, validate endpoint
- [ ] `memberRevoked` email template created in `dm/layers/ses/src/email-templates.js`
- [ ] DELETE handler in `portal/team/route.js` writes `"admin_revoked"` (not `"revoked"`) and `"MEMBER_REVOKED"` event type (not `"LICENSE_REVOKED"`)
- [ ] `EVENT_TYPES` enum exported from `constants.js` with all 15 event types
- [ ] Billing page `LICENSE_STATUS_DISPLAY` includes Stripe-specific statuses: `trialing`, `unpaid`, `incomplete`, `incomplete_expired`, `pending`, `paused`
- [ ] `wasSuspendedForNonpayment` variable renamed and condition expanded to include `"payment_suspended"` check
- [ ] `license-helpers.js` created in `src/lib/` with shared pure-logic helpers (key builders, UpdateExpression builders, event record construction) — zero SDK dependencies
- [ ] `deploy.sh` copies `constants.js` and `license-helpers.js` into each Lambda source directory before the zip step (line ~413)
- [ ] Lambda `customer-update/index.js` imports `LICENSE_STATUS`, `EVENT_TYPES` from copied `./constants.js` and shared helpers from copied `./license-helpers.js`
- [ ] Lambda uses zero hardcoded status strings or event type strings — all values come from shared enums
- [ ] `dynamodb.js` imports and uses the same shared helpers from `@/lib/license-helpers.js`
- [ ] Both environments produce identical DynamoDB keys, UpdateExpressions, and event records (verified by unit tests against shared helpers)

---

## Addendum A: Investigation Findings Summary (2026-03-06)

All ⚠️ flagged items in this memo have been investigated. Findings and resolutions are inserted inline at each flag location. This addendum provides a consolidated summary.

### Resolved Items

| # | Item | Flag | Resolution |
|---|------|------|------------|
| 1 | `wasSuspended` logic (Section 7.1, line ~375) | INVESTIGATED — MUST FIX | Variable misleadingly named; does not check for `"suspended"`. Must rename to `wasSuspendedForNonpayment` and add `"payment_suspended"` check. `"disputed"` correctly handled by separate `handleDisputeClosed` path. |
| 3 | `"revoked"` disambiguation (Section 7.2) | INVESTIGATED — CONFIRMED | Three uses found: (a) POST `update_status` → `"admin_revoked"`, (b) DELETE handler → `"admin_revoked"`, (c) Keygen webhook → stays `"revoked"`. DELETE handler's `writeEventRecord("LICENSE_REVOKED",...)` must become `"MEMBER_REVOKED"`. `memberRevoked` confirmed as new required email template. |
| 4 | `EVENT_TYPES` constant (Section 8.2) | INVESTIGATED — CONFIRMED ABSENT | Zero matches for `export const EVENT_TYPES` across codebase. Full 15-type enum specified inline. Lambda imports via build-time bundling (Section 8.4.3). |
| 5 | Heartbeat "license not found" (Section 8.8) | INVESTIGATED — MUST FIX | Returns `valid: true, status: "active"` when license not in DynamoDB. Critical defect. Fix includes `retryAfter: 30` for eventual consistency edge case. Extension must implement retry-once behavior. |
| 6 | Portal status route (Section 8.7.3) | INVESTIGATED — MUST FIX | `past_due` incorrectly in `hasExpiredSubscription` returning `status: "expired"`. Reclassified to new `hasPastDueSubscription` array returning `status: "past_due"`. Portal UI must show "update payment method" message, not redirect to checkout. |
| 7 | Keygen API casing (Section 5.1, Layer 3) | INVESTIGATED — CRITICAL CORRECTION | Keygen returns UPPER_CASE status across ALL endpoints (list, retrieve, create, validate). Original memo incorrectly stated lowercase. `.toLowerCase()` normalization must be added at all API boundaries. |
| 8 | `plg-metrics.js` casing (Section 5.1, Layer 6) | INVESTIGATED — CONFIRMED CORRECT | Keygen returns UPPER_CASE consistently. Metrics script's UPPER_CASE comparisons are correct. No Keygen API inconsistency exists. |
| 9 | Extension `heartbeat.js` switch (Section 8.11) | INVESTIGATED — MUST FIX | Must add cases for `"license_payment_suspended"`, `"license_admin_suspended"`, and `"unknown"`. Pointless `.toLowerCase()` round-trip should be removed after Step 11 normalization. |
| 10 | Billing page Stripe statuses (Section 8.7.2) | INVESTIGATED — MUST FIX | Must add `trialing`, `unpaid`, `incomplete`, `incomplete_expired`, `pending`, `paused` to `LICENSE_STATUS_DISPLAY`. Billing page should use merge approach with shared constant. |
| 11 | `memberRevoked` template (Section 8.5) | CONFIRMED — NEW REQUIRED | Must be its own distinct email template for admin-revokes-member action. |
| 12 | `handleDisputeCreated` log (Section 7.1) | INVESTIGATED — CORRECTED | Actual code writes `"disputed"` not `"suspended"` to status. Only the log message is misleading. Table entry corrected inline. |

### Resolved Item (previously open)

| # | Item | Flag | Status |
|---|------|------|--------|
| 2 | Lambda DRY violation (Section 8.4.3) | RESOLVED — build-time bundling of shared pure-logic modules | Shared pure-logic files (`constants.js`, new `license-helpers.js`) copied into Lambda zip at build time by `deploy.sh`. Both environments import the same file. No duplication, no `/dm/layers` changes. See Addendum A.1. |

### Addendum A.1: Lambda DRY Violation — Resolution Plan

**Decision (2026-03-06, corrected 2026-03-06):** Extract shared pure-logic into files that both environments import identically. Shared files are copied into Lambda source directories at build time by `deploy.sh`. No changes to `/dm/layers` or the layer build pipeline.

#### A.1.1 The Problem

The customer-update Lambda (`infrastructure/lambda/customer-update/index.js`) has three functions that duplicate canonical versions in `src/lib/dynamodb.js`:

| Function | Lambda Location | `dynamodb.js` Location | What It Does |
|---|---|---|---|
| `updateLicenseStatus` | line ~110 | line ~570 | Updates LICENSE# record status, timestamps, metadata |
| `updateCustomerSubscription` | line ~148 | — | Updates CUSTOMER# record subscription fields |
| `writeEventRecord` | line ~176 | line ~2121 | Writes EVENT# audit records |

Both implementations are functionally near-identical. The divergence risk: any change to status validation rules, event type strings, metadata conventions, or DynamoDB key patterns in one location will not automatically propagate to the other.

#### A.1.2 The Solution — Build-Time Bundling of Shared Pure-Logic Modules

The constraint is delivery, not capability. The Lambda CAN import any JavaScript file — it just needs to be present in the Lambda's zip at runtime. `constants.js` is pure JavaScript: zero AWS SDK dependencies, zero Node.js built-in dependencies, zero environment-specific code. The same applies to any shared helper module that contains only pure logic (key construction, UpdateExpression building, event record construction).

The `deploy.sh` build step (line ~413) already zips the Lambda source directory:

```bash
(cd "$lambda_src" && zip -rq "$zip_file" .)
```

By adding a copy step immediately before the zip, shared files from `src/lib/` are placed into the Lambda source directory and become available via relative import at runtime. Both environments import the exact same file — one canonical source, zero duplication, zero drift.

#### A.1.3 What Gets Shared

**Shared files (pure logic, zero SDK dependencies):**

| File | Contents | Status |
|---|---|---|
| `src/lib/constants.js` | `LICENSE_STATUS`, `EVENT_TYPES`, `MAX_PAYMENT_FAILURES`, `LICENSE_STATUS_DISPLAY` | Already exists; add `EVENT_TYPES` enum (Section 8.2) |
| `src/lib/license-helpers.js` | DynamoDB key builders, UpdateExpression builders, event record construction | NEW — extract from duplicated functions |

**`license-helpers.js` extracts the following pure logic from the three duplicated functions:**

```javascript
// license-helpers.js — shared pure-logic helpers for DynamoDB license operations
// Zero SDK dependencies. Imported by both src/lib/dynamodb.js and Lambda functions.

import { LICENSE_STATUS, EVENT_TYPES } from "./constants.js";

/**
 * Build DynamoDB key for a LICENSE# record.
 */
export function buildLicenseKey(keygenLicenseId) {
  return { PK: `LICENSE#${keygenLicenseId}`, SK: "DETAILS" };
}

/**
 * Build DynamoDB key for a USER# PROFILE record.
 */
export function buildUserProfileKey(userId) {
  return { PK: `USER#${userId}`, SK: "PROFILE" };
}

/**
 * Build DynamoDB key for an EVENT# record.
 */
export function buildEventKey() {
  const eventId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  return { PK: `EVENT#${eventId}`, SK: "DETAILS" };
}

/**
 * Build UpdateExpression, ExpressionAttributeValues, and ExpressionAttributeNames
 * for a license status update.
 */
export function buildStatusUpdateExpression(status, metadata = {}) {
  const now = new Date().toISOString();
  const updateExpressions = ["#status = :status", "#updatedAt = :updatedAt"];
  const expressionValues = { ":status": status, ":updatedAt": now };
  const expressionNames = { "#status": "status", "#updatedAt": "updatedAt" };

  Object.entries(metadata).forEach(([key, value]) => {
    updateExpressions.push(`#${key} = :${key}`);
    expressionValues[`:${key}`] = value;
    expressionNames[`#${key}`] = key;
  });

  return {
    UpdateExpression: `SET ${updateExpressions.join(", ")}`,
    ExpressionAttributeValues: expressionValues,
    ExpressionAttributeNames: expressionNames,
  };
}

/**
 * Build an event record item for DynamoDB.
 */
export function buildEventRecord(eventType, data) {
  const now = new Date().toISOString();
  const key = buildEventKey();
  return {
    ...key,
    eventType,
    ...data,
    createdAt: now,
  };
}
```

**What stays in each environment (SDK-dependent):**

The actual `dynamoClient.send(new UpdateCommand(...))` / `dynamoClient.send(new PutCommand(...))` calls. Each environment has its own thin wrapper that calls the shared helpers for key/expression construction, then executes the SDK call with its own client:

- `dynamodb.js`: `import { UpdateCommand } from "@aws-sdk/lib-dynamodb"` + shared helpers
- Lambda: `import { UpdateCommand } from "hic-dynamodb-layer"` + shared helpers (from copied files)

#### A.1.4 Build Step — `deploy.sh` Changes

Add a copy step before the zip command at line ~413 of `infrastructure/deploy.sh`:

```bash
# Copy shared pure-logic modules into Lambda source directory
# These files have zero SDK dependencies and are imported via relative path
SHARED_FILES=("constants.js" "license-helpers.js")
SHARED_SRC="${SCRIPT_DIR}/../src/lib"

for lambda_name in $MISSING_PACKAGES; do
    lambda_src="${LAMBDA_SOURCE_DIR}/${lambda_name}"
    # ... existing directory check ...

    # Copy shared modules into Lambda source dir before zipping
    for shared_file in "${SHARED_FILES[@]}"; do
        if [[ -f "${SHARED_SRC}/${shared_file}" ]]; then
            cp "${SHARED_SRC}/${shared_file}" "${lambda_src}/${shared_file}"
        fi
    done

    print_step "Building ${lambda_name}..."
    (cd "$lambda_src" && zip -rq "$zip_file" .)
    # ... existing upload logic ...
done
```

The copied files are ephemeral build artifacts — they exist in the Lambda source directory only during the build. They should be added to `.gitignore` for the Lambda directories:

```gitignore
# Shared modules copied at build time by deploy.sh
infrastructure/lambda/*/constants.js
infrastructure/lambda/*/license-helpers.js
```

#### A.1.5 Lambda Import Changes

The Lambda's imports change from hardcoded values to shared module imports:

```javascript
// Before (hardcoded):
const MAX_PAYMENT_FAILURES = 3;
writeEventRecord("LICENSE_PAYMENT_SUSPENDED", { ... });
updateLicenseStatus(id, "payment_suspended", { ... });

// After (shared imports):
import { LICENSE_STATUS, EVENT_TYPES, MAX_PAYMENT_FAILURES } from "./constants.js";
import {
  buildLicenseKey,
  buildStatusUpdateExpression,
  buildEventRecord,
} from "./license-helpers.js";

writeEventRecord(EVENT_TYPES.LICENSE_PAYMENT_SUSPENDED, { ... });
updateLicenseStatus(id, LICENSE_STATUS.PAYMENT_SUSPENDED, { ... });
```

The Lambda's `updateLicenseStatus`, `updateCustomerSubscription`, and `writeEventRecord` functions become thin SDK wrappers:

```javascript
async function updateLicenseStatus(keygenLicenseId, status, metadata = {}) {
  const key = buildLicenseKey(keygenLicenseId);
  const expression = buildStatusUpdateExpression(status, metadata);
  await dynamoClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: key,
      ...expression,
    }),
  );
}

async function writeEventRecord(eventType, data) {
  const item = buildEventRecord(eventType, data);
  await dynamoClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
    }),
  );
}
```

#### A.1.6 `dynamodb.js` Changes

`src/lib/dynamodb.js` imports and uses the same shared helpers:

```javascript
import {
  buildLicenseKey,
  buildStatusUpdateExpression,
  buildEventRecord,
} from "@/lib/license-helpers.js";
```

The `updateLicenseStatus` and `writeEventRecord` functions in `dynamodb.js` are refactored to use the shared helpers for key/expression construction, keeping only the SDK call and logging as environment-specific code.

#### A.1.7 Implementation Order

1. Create `src/lib/license-helpers.js` with shared pure-logic helpers
2. Add `EVENT_TYPES` enum to `constants.js` (Section 8.2)
3. Refactor `dynamodb.js` to import and use shared helpers
4. Refactor Lambda to import and use shared helpers (thin SDK wrappers)
5. Update `deploy.sh` to copy shared files before zipping
6. Add `.gitignore` entries for copied build artifacts
7. Run unit tests for both environments to confirm identical DynamoDB operations
8. Verify Lambda zip contains `constants.js` and `license-helpers.js`

---

*Addendum prepared by Kiro, 2026-03-06. All inline edits are marked with investigation dates for traceability. Updated 2026-03-06 to reflect Item 2 resolution: build-time bundling of shared pure-logic modules.*
