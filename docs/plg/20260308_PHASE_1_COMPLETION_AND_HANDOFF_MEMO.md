# Phase 1 Completion & Handoff Memo — Status Remediation Plan

**Date:** 2026-03-08
**Author:** AI Coding Assistant (GitHub Copilot, Claude Opus 4.6)
**Approved by:** SWR
**Repo:** `hic-ai-inc/hic-ai-inc.github.io` (website repo)
**Branch:** `main` and `development` at commit `e2f5147`
**Phase 2 Target:** `~/source/repos/hic` (Mouse extension repo)

---

## Purpose

This memo provides full context for the AI agent performing Phase 2 of the Status Remediation Plan in the extension repo (`~/source/repos/hic`). Phase 1 completed all 9 fixes on the website side. Phase 2 completes the extension-side work: Fix 3 (casing normalization) and Fix 5 (suspended removal from payment path).

The authoritative spec lives in the website repo at `.kiro/specs/status-remediation-plan/`. The three key files are:

- `requirements.md` — 15 requirements with acceptance criteria
- `tasks.md` — full task list with completion marks, deferred decisions
- `design.md` — the consolidated plan (V6)

---

## What Was Done (Phase 1 Summary)

### Nine Fixes, Strict Dependency Order

| Fix   | Task    | Description                                             | Status                         |
| ----- | ------- | ------------------------------------------------------- | ------------------------------ |
| Fix 6 | Task 1  | Remove dead RETIRED status from LICENSE_STATUS          | ✅                             |
| Fix 3 | Task 3  | Normalize status casing to lowercase (website portions) | ✅ website, Extension deferred |
| Fix 8 | Task 5  | Centralize event type strings in EVENT_TYPES enum       | ✅                             |
| Fix 5 | Task 6  | Remove "suspended" from payment path (website portions) | ✅ website, Extension deferred |
| Fix 1 | Task 8  | Add license renewal on payment success (renewLicense)   | ✅                             |
| Fix 2 | Task 9  | Fix heartbeat null license and status checks            | ✅                             |
| Fix 4 | Task 11 | Fix portal status for past-due customers                | ✅                             |
| Fix 7 | Task 12 | Replace Keygen reads with DDB reads                     | ✅                             |
| Fix 9 | Task 14 | Admin suspension: deactivate devices + block activation | ✅                             |

**Test results:** 1910/1910 PLG tests passing, 808/808 DM tests passing.

---

## Key Architectural Decisions

### 1. DDB Is the Sole Source of Truth for Reads

All API endpoints read license, customer, and device data from DynamoDB. Keygen is used **only** for write-side operations:

- `createLicense` / `renewLicense` / `suspendLicense` — Keygen writes
- `deactivateDevice` — Keygen DELETE machine
- `createMachine` — Keygen device activation

The extension heartbeat and validate endpoints read from DDB, not Keygen. This was enforced by Fix 7 (Task 12) which migrated the last three Keygen-reading endpoints to DDB.

### 2. "Suspended" Means Only Admin-Suspended Team Member

Before remediation, "suspended" appeared in both the payment path and the admin team management path. After remediation:

- **Payment lifecycle:** `active → past_due → expired` (no "suspended" anywhere)
- **Admin action:** Owner suspends a team member → status = "suspended" (only context where "suspended" is valid)
- **Revoked:** Owner permanently removes a team member → status = "revoked" (seat freed)

The payment-path `licenseSuspended` email template was removed. The `MAX_PAYMENT_FAILURES` constant was removed. Keygen's `license.suspended` webhook now logs only (no DDB write, no email).

### 3. All Status Values Are Lowercase

The LICENSE_STATUS enum uses UPPER_CASE keys with lowercase string values:

```javascript
export const LICENSE_STATUS = {
  PENDING_ACCOUNT: "pending_account",
  ACTIVE: "active",
  PAST_DUE: "past_due",
  CANCELLATION_PENDING: "cancellation_pending",
  CANCELED: "canceled",
  EXPIRED: "expired",
  DISPUTED: "disputed",
  REVOKED: "revoked",
  SUSPENDED: "suspended",
};
```

All comparisons throughout the website stack use lowercase. The Keygen module normalizes any status returned by the Keygen API to lowercase before returning it to callers.

**The extension must match this convention.** Extension `LICENSE_STATES` values must be lowercase, and persisted state from prior installs (which may have UPPER_CASE values) must be migrated on load.

### 4. past_due = Tools Work (Dunning Window)

During the 2-week Stripe Smart Retry dunning window:

- Heartbeat returns `{ valid: true, status: "past_due" }` — tools continue working
- Portal returns `past_due` as its own category with full access
- **Extension must map "past_due" to an active state** where all tools continue working
- After dunning fails → subscription cancelled → status becomes "expired" → tools blocked

### 5. EVENT_TYPES Enum (12 entries, UPPER_CASE values)

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
  LICENSE_REVOKED: "LICENSE_REVOKED",
  LICENSE_SUSPENDED: "LICENSE_SUSPENDED",
};
```

These are DDB event identifiers written by `writeEventRecord()`. The extension does not write events directly — it only consumes heartbeat/validate API responses.

### 6. Admin Suspension/Revocation (Fix 9)

When an Owner suspends or revokes a member:

1. All member's devices are deactivated via Keygen (`DELETE /machines/{id}`) and DDB (`removeDeviceActivation`)
2. Keygen failures are non-blocking (DDB cleanup always completes)
3. Activation is blocked: returns 403 `MEMBER_SUSPENDED` or `MEMBER_REVOKED` for Business plan users
4. Individual plan activations bypass the membership check entirely
5. No email notifications (deferred — see D1 below)
6. Reinstatement to "active" does NOT deactivate devices — member re-activates normally

---

## Phase 2 — Extension Repo Tasks

### Overview

Phase 2 executes in `~/source/repos/hic`. All tasks come from Fix 3 and Fix 5 in `tasks.md`. The extension must be updated so that:

1. All status constants use lowercase values
2. Persisted state is migrated from UPPER_CASE to lowercase
3. "suspended" is removed from the heartbeat/payment path entirely
4. "past_due" is mapped to an active state (tools work)

### Fix 3 Extension Tasks — Casing Normalization

#### Task 3.6: Update extension LICENSE_STATES to lowercase

- **File:** `licensing/constants.js`
- Change all values in the LICENSE_STATES object to lowercase strings
- Keys can remain UPPER_CASE; values must be lowercase (matching website convention)
- **Requirement:** 2.7

#### Task 3.7: Add state migration logic in extension state module

- **File:** `licensing/state.js`
- When loading persisted state from an existing install, normalize any UPPER_CASE status values to lowercase
- This handles upgrades from prior versions where status was stored as "ACTIVE", "EXPIRED", etc.
- **Requirement:** 2.8

#### Task 3.8 (extension portions): Unit tests for casing normalization

- Assert extension LICENSE_STATES values are lowercase
- Assert extension state migration converts UPPER_CASE to lowercase
- **Requirement:** 13.5, 13.6

#### Task 3.10: Property test — Property 3: Extension LICENSE_STATES lowercase

- For any value in the extension's LICENSE_STATES constants object, the value must be a lowercase string
- Tag: `// Feature: status-remediation-plan, Property 3`
- **Requirement:** 2.7

#### Task 3.11: Property test — Property 4: Extension state migration normalizes to lowercase

- For any persisted status string (including UPPER_CASE values from prior installs), loading it through the state module must produce a lowercase result
- Tag: `// Feature: status-remediation-plan, Property 4`
- **Requirement:** 2.8

### Fix 5 Extension Tasks — Remove "Suspended" from Payment Path

#### Task 6.9: Remove "suspended" from extension heartbeat module

- **File:** `licensing/heartbeat.js` (and/or `mouse-vscode/src/licensing/heartbeat.js`)
- Remove `_handleLicenseSuspended` handler
- Remove `case "suspended"` / `case "license_suspended"` branches
- Map "past_due" to active state (tools continue working during dunning window)
- **Requirements:** 5.1, 5.3

#### Task 6.10: Remove "suspended" from extension validation module

- **File:** `licensing/validation.js` (and/or `mouse-vscode/src/licensing/validation.js`)
- Remove "suspended" from `VALID_HEARTBEAT_STATUSES`
- **Requirement:** 5.2

#### Task 6.11: Remove "suspended" check from extension HTTP client

- **File:** `licensing/http-client.js`
- Remove `response.license?.status === "suspended"` check
- **Requirement:** 5.4

#### Task 6.12: Remove suspended-specific handling from extension VSCode module

- **File:** `mouse-vscode/src/extension.js` (or similar)
- Remove suspended-specific status bar and notification handling
- **Requirement:** 5.5

#### Task 6.13: Remove suspended status mapping from extension validate command

- **File:** `licensing/commands/validate.js`
- Remove suspended status mapping
- **Requirement:** 5.6

#### Task 6.14 (extension portions): Unit tests for suspended removal

- Assert extension heartbeat has no "suspended" case
- Assert extension maps "past_due" to active
- **Requirement:** 13.7, 13.8, 13.12

#### Task 6.17: Property test — Property 20: Extension maps "past_due" to active

- For any heartbeat response with status "past_due", the extension heartbeat module must map it to an active state where all tools continue to work
- Tag: `// Feature: status-remediation-plan, Property 20`
- **Requirement:** 5.3

### VSIX Packaging Fix

- Exclude `**/tests/**` from `.vscodeignore` to reduce package size
- This is a housekeeping task bundled with Phase 2

---

## Heartbeat Response Contract

The website heartbeat endpoint (`/api/license/heartbeat`) returns these responses. The extension must handle all of them:

| Status                 | valid   | Action                                         |
| ---------------------- | ------- | ---------------------------------------------- |
| `active`               | `true`  | Tools work normally                            |
| `past_due`             | `true`  | Tools work (dunning window)                    |
| `cancellation_pending` | `true`  | Tools work (subscription ending at period end) |
| `trial`                | `true`  | Tools work (device-level trial)                |
| `expired`              | `false` | Tools blocked                                  |
| `suspended`            | `false` | Tools blocked (admin-suspended member)         |
| `revoked`              | `false` | Tools blocked (admin-revoked member)           |
| null license           | 404     | License not found                              |

**Critical:** The extension must NOT have any special "suspended" handler in the heartbeat path. When `valid: false` is returned with status "suspended" or "revoked", the extension should treat it the same as any `valid: false` response — block tools, show appropriate message. The specific "suspended" → special handler pattern from the old code was part of the payment path confusion and must be removed.

---

## Validate Response Contract

The website validate endpoint (`/api/license/validate`) reads from DDB only (no Keygen calls). It validates the license key + device fingerprint and returns license status. The extension should treat the validate response identically to heartbeat for status classification.

---

## Test Patterns Used in Phase 1

### Unit Tests

- Framework: `dm/facade/test-helpers/index.js` (`expect`, `createSpy`, `spyOn`)
- Pattern: Extract route handler logic into pure functions with dependency injection — no module mocking
- Test files mirror source structure: `__tests__/unit/api/`, `__tests__/unit/lib/`, `__tests__/unit/webhooks/`

### Property Tests

- Framework: `dm/facade/test-helpers/index.js` (`expect`, `createSpy`, `spyOn`)
- Pattern: 100-iteration randomized testing per property with random generators
- Each property tagged with `// Feature: status-remediation-plan, Property N`
- Test files: `__tests__/property/api/`, `__tests__/property/webhooks/`, `__tests__/property/lib/`

The extension repo's test framework may differ. Adapt patterns to the extension's testing infrastructure while maintaining equivalent coverage.

---

## Deferred Decisions (Post-Launch Technical Debt)

These are documented in `tasks.md` under "Deferred Decisions — Post-Launch Technical Debt":

### D1. Email Templates for Member Suspension/Revocation/Reinstatement

No email templates exist for admin suspension/revocation/reinstatement actions. Events are written to DDB (`LICENSE_SUSPENDED`, `LICENSE_REVOKED`) as an audit trail, but no downstream email delivery pipeline consumes them yet. Post-launch work: create `memberSuspended`, `memberRevoked`, `memberReinstated` templates and wire SNS.

### D2. Revoked vs. Expired: Distinct Communication Paths

Both "revoked" and "expired" block tools, but represent different situations:

- **Revoked:** Admin reclaimed a seat — member should be invited to purchase Individual plan
- **Expired:** Payment lapsed — user needs to update payment method

Post-launch: design distinct email copy and portal messaging for each.

### D3. Revocation Does Not Expire the Org License

Revoking a member updates only the member's org membership status. It does NOT modify the org's Keygen license or license record. The seat is freed, the license continues serving remaining members. This is the correct final behavior — documented for clarity.

---

## Phase 3 — Return to Website Repo

After Phase 2 extension work is complete, return to the website repo for:

- **Task 4:** Checkpoint — Fix 6 + Fix 3 complete (depends on extension Fix 3 tasks)
- **Task 7:** Checkpoint — Fix 8 + Fix 5 complete (depends on extension Fix 5 tasks)
- **Task 16:** Production configuration (manual Stripe/Keygen dashboard changes)
- **Task 17:** Final checkpoint — Full remediation complete (run full test suite)

---

## Files Modified in Phase 1

For reference, these website files were modified during the 9-fix remediation:

| File                                                 | Fixes Applied              |
| ---------------------------------------------------- | -------------------------- |
| `plg-website/src/lib/constants.js`                   | Fix 6, Fix 3, Fix 8, Fix 5 |
| `plg-website/src/lib/keygen.js`                      | Fix 3, Fix 1, Fix 9        |
| `plg-website/src/lib/dynamodb.js`                    | Fix 8, Fix 9               |
| `plg-website/src/app/api/webhooks/stripe/route.js`   | Fix 3, Fix 5, Fix 1        |
| `plg-website/src/app/api/webhooks/keygen/route.js`   | Fix 5, Fix 8               |
| `plg-website/src/app/api/license/heartbeat/route.js` | Fix 2                      |
| `plg-website/src/app/api/license/validate/route.js`  | Fix 7                      |
| `plg-website/src/app/api/license/activate/route.js`  | Fix 9                      |
| `plg-website/src/app/api/license/check/route.js`     | Fix 3, Fix 7               |
| `plg-website/src/app/api/portal/status/route.js`     | Fix 3, Fix 4               |
| `plg-website/src/app/api/portal/license/route.js`    | Fix 7                      |
| `plg-website/src/app/api/portal/team/route.js`       | Fix 8, Fix 9               |
| `plg-website/src/app/portal/page.js`                 | Fix 4                      |
| `plg-website/src/app/portal/billing/page.js`         | Fix 4                      |
| `dm/layers/ses/src/email-templates.js`               | Fix 5, Fix 8               |

---

## Extension Files to Modify in Phase 2

Based on the task descriptions in `tasks.md`, the expected target files in `~/source/repos/hic` are:

| File                                       | Tasks                                                 |
| ------------------------------------------ | ----------------------------------------------------- |
| `licensing/constants.js`                   | 3.6 (lowercase LICENSE_STATES)                        |
| `licensing/state.js`                       | 3.7 (state migration)                                 |
| `licensing/heartbeat.js`                   | 6.9 (remove suspended, map past_due)                  |
| `licensing/validation.js`                  | 6.10 (remove suspended from VALID_HEARTBEAT_STATUSES) |
| `licensing/http-client.js`                 | 6.11 (remove suspended check)                         |
| `licensing/commands/validate.js`           | 6.13 (remove suspended mapping)                       |
| `mouse-vscode/src/extension.js`            | 6.12 (remove suspended UI handling)                   |
| `mouse-vscode/src/licensing/heartbeat.js`  | 6.9 (if separate from licensing/)                     |
| `mouse-vscode/src/licensing/validation.js` | 6.10 (if separate from licensing/)                    |
| `.vscodeignore`                            | VSIX packaging fix                                    |

**Note:** The exact file paths should be verified by exploring the extension repo. The task descriptions reference these paths but the extension repo structure may have evolved.

---

## Execution Guidance for Phase 2 Agent

1. **Read the spec first.** The files in `.kiro/specs/status-remediation-plan/` (in the website repo) are the canonical reference. Copy them into the extension repo's context or read them from the website workspace.

2. **Explore before editing.** Read each target file to understand its current structure before making changes. The task descriptions were written based on a point-in-time snapshot of the code.

3. **Fix 3 before Fix 5.** The dependency order matters: lowercase all constants first (Fix 3), then remove suspended (Fix 5). This ensures Fix 5 string comparisons use the correct lowercase values.

4. **Test after each fix.** Run the extension's test suite after Fix 3 tasks and again after Fix 5 tasks. Achieve 100% pass rate before proceeding.

5. **Property test tags.** All property tests must be tagged per the format in `tasks.md`: `// Feature: status-remediation-plan, Property N`.

6. **"past_due" mapping is critical.** Task 6.9 requires that "past_due" maps to an active state. This is the single most important behavioral change — users in the dunning window must retain full tool access.

7. **Don't add "suspended" back.** The entire point of Fix 5 is that "suspended" does not exist in the payment/heartbeat path. The extension should handle `valid: false` generically for all blocking statuses (expired, suspended, revoked). No special "suspended" handler.

8. **VSIX packaging.** The `.vscodeignore` fix is a small housekeeping task — just add `**/tests/**` to the ignore list.

---

_End of memo._
