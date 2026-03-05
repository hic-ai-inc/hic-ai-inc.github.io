# Suspended Status Naming Disambiguation Plan

**Date:** March 5, 2026
**Author:** GitHub Copilot (Claude Opus 4.6), Chief Reviewer
**Approved by:** SWR (pending)
**Status:** Draft — awaiting review and approval
**Parent:** `docs/plg/20260305_KEYGEN_WEBHOOK_REMEDIATION_PLAN.md` (Section 1.8)

---

## 1. Problem Statement

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

---

## 2. Complete Affected File Inventory

### 2.1 DynamoDB Record Types

Understanding the data model is critical. These are the DynamoDB records involved:

| Record Type | PK                          | SK                  | Uses `"suspended"` for                   | Should use            |
| ----------- | --------------------------- | ------------------- | ---------------------------------------- | --------------------- |
| `LICENSE#`  | `LICENSE#{keygenLicenseId}` | `DETAILS`           | Payment suspension (license-level)       | `"payment_suspended"` |
| `CUSTOMER#` | `USER#{userId}`             | `CUSTOMER`          | `subscriptionStatus` on payment failure  | `"payment_suspended"` |
| `MEMBER#`   | `ORG#{orgId}`               | `MEMBER#{memberId}` | Admin suspends a team member             | `"admin_suspended"`   |
| `INVITE#`   | `ORG#{orgId}`               | `INVITE#{inviteId}` | Admin suspends member with active invite | `"admin_suspended"`   |

Key insight: **Payment suspension operates on LICENSE# and CUSTOMER# records. Admin suspension operates on MEMBER# (and INVITE#) records.** They never write the same record type, which makes disambiguation safe.

### 2.2 Source Files — Payment Suspension Path

These files write or read `"suspended"` to mean **payment failure**:

#### [plg-website/src/app/api/webhooks/stripe/route.js](plg-website/src/app/api/webhooks/stripe/route.js)

| Line(s)  | Current Code                                                          | Change To                                                     |
| -------- | --------------------------------------------------------------------- | ------------------------------------------------------------- |
| ~457     | `unpaid: "suspended"` (status map)                                    | `unpaid: "payment_suspended"`                                 |
| ~529     | `dbCustomer.subscriptionStatus === "suspended"` (reinstatement check) | `=== "payment_suspended"`                                     |
| ~717-718 | `subscriptionStatus: "suspended"` (max payment failures)              | `subscriptionStatus: "payment_suspended"`                     |
| ~721     | `updateLicenseStatus(id, "suspended")` (max payment failures)         | `updateLicenseStatus(id, "payment_suspended")`                |
| ~774     | Log: `"License suspended for disputed customer"`                      | Log: `"License payment_suspended for disputed customer"`      |
| ~825     | Log: `"License remains suspended after lost dispute"`                 | Log: `"License remains payment_suspended after lost dispute"` |

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
| ~354-394 | `wasSuspended = customer.subscriptionStatus === "suspended"`                             | `=== "payment_suspended"`                                                                        |
| ~443-447 | `updateLicenseStatus(id, "suspended", { suspendedAt, suspendReason: "payment_failed" })` | `updateLicenseStatus(id, "payment_suspended", { suspendedAt, suspendReason: "payment_failed" })` |

### 2.3 Source Files — Admin Suspension Path

These files write or read `"suspended"` to mean **admin action on a team member**:

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

### 2.4 Source Files — Ambiguous / Shared Paths

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
| ~123-133 | `LICENSE_STATUS` enum — no `SUSPENDED` entry    | Add `PAYMENT_SUSPENDED: "PAYMENT_SUSPENDED"` and `ADMIN_SUSPENDED: "ADMIN_SUSPENDED"` |
| ~136-146 | `LICENSE_STATUS_DISPLAY` — no suspended display | Add display entries for both new statuses                                             |

### 2.5 Email Templates

#### [dm/layers/ses/src/email-templates.js](dm/layers/ses/src/email-templates.js)

| Line(s)   | Current                                               | Issue                                                                     | Change                                                                  |
| --------- | ----------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| ~547-598  | `licenseSuspended` template                           | Body says "may be due to a billing issue or policy violation" — ambiguous | **Split into two templates** (see Section 4.4)                          |
| ~838, 859 | "License suspended immediately" in dispute email      | Payment-specific; keep wording but change template ref                    | Wording is fine (it IS about billing), just ensure template name aligns |
| ~889      | `"licenseSuspended"` in template names array          |                                                                           | Replace with `"licensePaymentSuspended"` + add `"memberSuspended"`      |
| ~903      | `LICENSE_SUSPENDED: "licenseSuspended"` event mapping |                                                                           | Replace with two mappings (see Section 4.4)                             |

#### [dm/layers/ses/generate-email-preview.js](dm/layers/ses/generate-email-preview.js)

| Line(s) | Current                     | Change                                                   |
| ------- | --------------------------- | -------------------------------------------------------- |
| ~59, 94 | `licenseSuspended` metadata | Split into `licensePaymentSuspended` + `memberSuspended` |

### 2.6 Test Files

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

### 2.7 Metrics & Reporting

| File                                      | Line(s)                    | Change                                                 |
| ----------------------------------------- | -------------------------- | ------------------------------------------------------ |
| `plg-website/scripts/plg-metrics.js` ~273 | `suspended: 0` counter     | Split: `payment_suspended: 0, admin_suspended: 0`      |
| `plg-website/scripts/plg-metrics.js` ~294 | `=== "SUSPENDED"` counting | Branch on `"PAYMENT_SUSPENDED"` vs `"ADMIN_SUSPENDED"` |
| `plg-website/scripts/plg-metrics.js` ~487 | Report output              | Display both counts separately                         |

---

## 3. Impact Analysis: Why This Is Safe

### 3.1 The two paths never cross the same record type

| Operation          | DynamoDB Record                                                   | Called by                                              |
| ------------------ | ----------------------------------------------------------------- | ------------------------------------------------------ |
| Payment suspension | `LICENSE#{keygenLicenseId}` + `CUSTOMER#{userId}`                 | Stripe webhook, customer-update Lambda, Keygen webhook |
| Admin suspension   | `ORG#{orgId}/MEMBER#{memberId}` + `ORG#{orgId}/INVITE#{inviteId}` | Portal team API                                        |

There is **no shared DynamoDB record** that both paths write `"suspended"` to. Payment suspension writes to LICENSE# and CUSTOMER# records. Admin suspension writes to MEMBER# records. This means:

1. **No data collision** — Changing the string values won't cause one path to incorrectly read another path's data
2. **No transactional coupling** — The changes can be applied to each path independently
3. **Backward-compatible reads** — A simple OR check (`status === "payment_suspended" || status === "suspended"`) can be used during migration to handle old records

### 3.2 Keygen doesn't use our internal status strings

Keygen has its own status model (`active`, `suspended`, `expired`, `banned`). Our status strings are internal to DynamoDB. Keygen's `license.suspended` webhook always means payment-level suspension. Renaming our internal status from `"suspended"` to `"payment_suspended"` has zero impact on Keygen API interactions.

### 3.3 The extension reads `status` generically

The VS Code extension receives `status` from the validate/heartbeat APIs and compares against known failure states. As long as the API response format doesn't change (it returns `valid: false` for both suspension types), the extension doesn't need to change. The extension can optionally display a more specific message by checking the new status values.

---

## 4. Implementation Plan

### 4.1 Sequencing Within the Remediation Plan

This work **must be integrated into Phase 1** of the parent remediation plan, not done separately. The reason: Phase 1.1 (eliminating Keygen read calls) will rewrite the validate and heartbeat endpoints to read from DynamoDB. If we do the naming change after that, we'd have to rewrite those endpoints twice.

**Recommended order within Phase 1:**

```
1.8.1  Update constants (LICENSE_STATUS, EVENT_TYPES)           ← Foundation
1.8.2  Update email templates (dm layer) + template tests       ← Independent of app code
1.8.3  Update payment suspension path (Stripe webhook + Keygen webhook + customer-update Lambda)
1.8.4  Update admin suspension path (portal/team + TeamManagement UI)
1.1.x  Eliminate Keygen read calls (references new status strings from the start)
1.8.5  Update metrics/reporting scripts
1.8.6  Update all remaining tests
1.8.7  Migration: reconciliation job handles legacy "suspended" records
1.2+   SQS queue work (can reference correct status names from the start)
```

### 4.2 Step 1: Update Constants

**File:** `plg-website/src/lib/constants.js`

```javascript
export const LICENSE_STATUS = {
  PENDING_ACCOUNT: "PENDING_ACCOUNT",
  TRIAL: "TRIAL",
  ACTIVE: "ACTIVE",
  PAST_DUE: "PAST_DUE",
  PAYMENT_SUSPENDED: "PAYMENT_SUSPENDED", // NEW — payment failure suspension
  ADMIN_SUSPENDED: "ADMIN_SUSPENDED", // NEW — owner/admin suspends member
  CANCELLATION_PENDING: "CANCELLATION_PENDING",
  CANCELED: "CANCELED",
  EXPIRED: "EXPIRED",
  RETIRED: "RETIRED",
  DISPUTED: "DISPUTED",
  REVOKED: "REVOKED", // Keep for license-level revocation
  ADMIN_REVOKED: "ADMIN_REVOKED", // NEW — owner/admin revokes member
};

export const LICENSE_STATUS_DISPLAY = {
  // ... existing entries ...
  PAYMENT_SUSPENDED: { label: "Suspended (Payment)", variant: "error" },
  ADMIN_SUSPENDED: { label: "Suspended (Admin)", variant: "warning" },
  ADMIN_REVOKED: { label: "Revoked (Admin)", variant: "error" },
};
```

**New event type constants** (add to existing EVENT_TYPES or as a new export):

```javascript
export const EVENT_TYPES = {
  // Payment lifecycle
  LICENSE_PAYMENT_SUSPENDED: "LICENSE_PAYMENT_SUSPENDED",
  LICENSE_REINSTATED: "LICENSE_REINSTATED",
  // Admin actions on members
  MEMBER_SUSPENDED: "MEMBER_SUSPENDED",
  MEMBER_REVOKED: "MEMBER_REVOKED",
  MEMBER_REACTIVATED: "MEMBER_REACTIVATED",
  // ... existing event types preserved
};
```

### 4.3 Step 2: Update Payment Suspension Path

**All changes use lowercase status strings in DynamoDB** (consistent with existing `"active"`, `"expired"`, `"past_due"` patterns):

| DynamoDB value        | Constant reference                 |
| --------------------- | ---------------------------------- |
| `"payment_suspended"` | `LICENSE_STATUS.PAYMENT_SUSPENDED` |
| `"admin_suspended"`   | `LICENSE_STATUS.ADMIN_SUSPENDED`   |
| `"admin_revoked"`     | `LICENSE_STATUS.ADMIN_REVOKED`     |

**Note on casing:** The `LICENSE_STATUS` enum currently uses UPPER_CASE values (`"ACTIVE"`, `"EXPIRED"`, etc.), but the Stripe webhook and Keygen webhook write **lowercase** strings (`"active"`, `"expired"`, `"suspended"`). This is a pre-existing inconsistency. The disambiguation should use whichever casing is already dominant in each file's context. The reconciliation job should normalize casing as part of the migration.

**Files to update:**

1. `webhooks/stripe/route.js` — 6 changes (Section 2.2)
2. `webhooks/keygen/route.js` — 2 changes (Section 2.2)
3. `customer-update/index.js` — 3 changes (Section 2.2)

### 4.4 Step 3: Split Email Templates

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
  MEMBER_REVOKED: "memberRevoked", // Consider creating; currently uses licenseRevoked
  // Keep legacy mapping during transition:
  LICENSE_SUSPENDED: "licensePaymentSuspended", // Backward compat for unprocessed events
};
```

### 4.5 Step 4: Update Admin Suspension Path

**Files to update:**

1. `portal/team/route.js` — 4 changes (Section 2.3)
2. `portal/team/TeamManagement.js` — 5+ changes (Section 2.3)

### 4.6 Step 5: Close the Admin → Keygen Sync Gap

Currently, when an admin suspends a member:

1. `updateOrgMemberStatus(orgId, memberId, "admin_suspended")` → DynamoDB ✓
2. Email pipeline triggered → ✓
3. **Keygen: nothing happens** → ✗

For Business licenses with multiple seats, the member's device entitlements in Keygen should be deactivated. After the SQS queue (remediation plan Section 1.2) is in place:

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

### 4.7 Step 6: Backward Compatibility / Migration

#### 4.7.1 Legacy record handling

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

#### 4.7.2 Transitional guard in status-checking code

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

#### 4.7.3 Unprocessed event records

Event records already in the DynamoDB stream or SQS queues may still carry `"LICENSE_SUSPENDED"`. The email sender Lambda should map this to `licensePaymentSuspended` (Section 4.4's backward compat mapping).

### 4.8 Step 7: Update Tests

Mechanical find-and-replace across ~60 test touch points. Group by test file:

| Test File                 | Strategy                                                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `webhooks.test.js`        | `"suspended"` → `"payment_suspended"` in all Stripe/Keygen contexts; `"LICENSE_SUSPENDED"` → `"LICENSE_PAYMENT_SUSPENDED"` |
| `team.test.js`            | `"suspended"` → `"admin_suspended"`, `"LICENSE_SUSPENDED"` → `"MEMBER_SUSPENDED"`                                          |
| `customer-update.test.js` | `"suspended"` → `"payment_suspended"`                                                                                      |
| `dynamodb.test.js`        | Split into payment vs admin test cases                                                                                     |
| `email-sender.test.js`    | Update event type mappings; add tests for new templates                                                                    |
| `email-templates.test.js` | Replace `licenseSuspended` tests with `licensePaymentSuspended` + `memberSuspended`                                        |
| `license.test.js`         | `"SUSPENDED"` → `"PAYMENT_SUSPENDED"` response codes                                                                       |
| E2E journey tests         | Update fixtures and expected values                                                                                        |
| `fixtures/licenses.js`    | Rename `suspendedLicense` → `paymentSuspendedLicense`; add `adminSuspendedMember` fixture                                  |

### 4.9 Step 8: Update Metrics

**File:** `plg-website/scripts/plg-metrics.js`

- Split `suspended` counter into `payment_suspended` and `admin_suspended`
- Update report output format

---

## 5. Risk Mitigation

| Risk                                                  | Likelihood | Impact | Mitigation                                                                                    |
| ----------------------------------------------------- | ---------- | ------ | --------------------------------------------------------------------------------------------- |
| Missed `"suspended"` reference causes silent breakage | Medium     | High   | Run `grep -rn '"suspended"' plg-website/src/` after all changes; no matches should remain     |
| Legacy DynamoDB records not migrated                  | Low        | Medium | Reconciliation job handles migration; transitional guards accept both values                  |
| Email template split breaks email pipeline            | Low        | High   | Keep `LICENSE_SUSPENDED` → `licensePaymentSuspended` backward mapping; deploy templates first |
| Extension breaks on new status strings                | Very Low   | Medium | Extension receives `valid: true/false` and optional status; new strings degrade gracefully    |
| Test suite overwhelm                                  | Medium     | Low    | Batch test updates by file; run tests after each file                                         |

---

## 6. Verification Checklist

After all changes:

- [ ] `grep -rn '"suspended"' plg-website/src/` returns **zero** matches (excluding comments)
- [ ] `grep -rn 'LICENSE_SUSPENDED' plg-website/src/` returns **zero** matches (replaced by `LICENSE_PAYMENT_SUSPENDED` or `MEMBER_SUSPENDED`)
- [ ] `grep -rn 'licenseSuspended' dm/layers/ses/` returns **zero** matches (replaced by `licensePaymentSuspended`)
- [ ] Payment failure → `"payment_suspended"` in LICENSE# and CUSTOMER# records
- [ ] Admin suspend member → `"admin_suspended"` in MEMBER# record
- [ ] Admin revoke member → `"admin_revoked"` in MEMBER# record
- [ ] Payment-suspended user receives email with "Update Payment Method" CTA
- [ ] Admin-suspended member receives email naming their organization
- [ ] Reconciliation job migrates any legacy `"suspended"` records
- [ ] All tests pass
- [ ] Extension validate/heartbeat APIs return correct `valid: false` for both suspension types

---

## 7. Casing Inconsistency (Pre-Existing)

**Flagging but not fixing in this plan:** The `LICENSE_STATUS` enum uses UPPER_CASE values (`"ACTIVE"`, `"REVOKED"`), but Stripe/Keygen webhooks write lowercase to DynamoDB (`"active"`, `"expired"`, `"suspended"`). Some code paths compare against the enum; others compare against raw lowercase strings. This is a separate normalization task that should be tracked independently. For this plan, we use lowercase in DynamoDB (`"payment_suspended"`, `"admin_suspended"`) to match the dominant convention in webhook handlers, and UPPER_CASE in the enum for consistency with existing enum entries.
