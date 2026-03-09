# Status Remediation — Proposed Phase 2 Implementation Plan

**Date:** 2026-03-08
**Author:** AI Coding Assistant (GitHub Copilot, Claude Opus 4.6)
**Status:** PROPOSED — Awaiting SWR approval
**Repo:** `SimonReiff/hic` (Mouse extension repo)
**Branch:** `development`
**Prerequisite:** Phase 1 complete (all 9 website-side fixes landed at commit `e2f5147`)

---

## Purpose

This memo describes the proposed implementation plan for Phase 2 of the Status Remediation Plan. Phase 2 completes the extension-side work: Fix 3 (casing normalization), Fix 5 (remove "suspended" from the payment path and introduce proper member-access handling via a **two-dimensional state model**: `LICENSE_STATES` for license-level events + `MEMBER_STATES` for member-access events), plus contextual UX enhancements for `past_due`, `suspended`, `revoked`, and `expired` states, and a VSIX packaging fix.

All work targets the `hic` extension repo (`~/source/repos/hic`). No changes to the website repo are included here.

---

## 1. LICENSE_STATES — Complete Post-Remediation Enumeration

After Phase 2, `LICENSE_STATES` in `licensing/constants.js` will contain exactly **7 license-level states**, all with lowercase string values. Member-access states (`suspended`, `revoked`) are tracked separately in a new `MEMBER_STATES` enum — see Section 1.1.

| Key | Value | Semantics | Tools |
|-----|-------|-----------|-------|
| `FRESH` | `"fresh"` | New install, not yet initialized | N/A |
| `TRIAL` | `"trial"` | Active 14-day device trial | Work |
| `TRIAL_ENDING` | `"trial_ending"` | Days 8-13 of trial | Work |
| `TRIAL_LAST_DAY` | `"trial_last_day"` | Final day of trial | Work |
| `LICENSED` | `"licensed"` | Active, valid license | Work |
| `PAST_DUE` | `"past_due"` | Stripe dunning window — tools work, UI warns | Work |
| `EXPIRED` | `"expired"` | Subscription cancelled or payment failed beyond dunning | Blocked |

### Changes from current state

- **6 carried forward, values lowercased:** `FRESH`, `TRIAL`, `TRIAL_ENDING`, `TRIAL_LAST_DAY`, `LICENSED`, `EXPIRED`
- **1 removed:** `LICENSED_GRACE` — replaced by `PAST_DUE`
- **1 added:** `PAST_DUE`
- **2 moved out:** `SUSPENDED` and `REVOKED` are _not_ license-level states — they are tracked in the new `MEMBER_STATES` enum (Section 1.1)

### Semantic clarifications

- **`LICENSE_STATES` tracks license-level events only.** Every value in the enum describes the state of the _license/subscription_, never the state of a member's access within a team.
- **`expired`** is the only subscription-level blocking state. It occurs after voluntary cancellation or when the Stripe dunning period exhausts without successful payment.
- **`past_due`** is a subscription-level state during Stripe Smart Retry dunning. The license and all tools remain fully operational for the entire team. The only difference from `licensed` is UI: the status bar warns about the billing issue, and contextual messaging in `license_status` links to the billing portal.

### 1.1 MEMBER_STATES — New Parallel Dimension

A new `MEMBER_STATES` enum in `licensing/constants.js` tracks a user's membership status on a multi-seat Business license. This is orthogonal to `LICENSE_STATES` — the license can be `licensed` while the member is `suspended`.

| Key | Value | When populated | Semantics | Tools |
|-----|-------|----------------|-----------|-------|
| — | `null` | Individual license, or Owner of Business license | Not applicable — no team membership dimension | N/A (use LICENSE_STATES) |
| `ACTIVE` | `"active"` | Non-Owner member on Business license, active | Member has full access | Work |
| `SUSPENDED` | `"suspended"` | Non-Owner member, suspended by Owner | Reversible — Owner can restore | Blocked |
| `REVOKED` | `"revoked"` | Non-Owner member, revoked by Owner | Permanent for this team license | Blocked |

**Key design rule:** `memberStatus` is `null` for Individual license holders and for the Owner of a Business license. It is only populated when the heartbeat/validate API returns a member-access status for a non-Owner user on a team.

**State persistence:** The `memberStatus` field is stored alongside `status` in `~/.hic/license.json`.

**Tool gating priority:**
1. `memberStatus` is `"suspended"` or `"revoked"` → **blocked** (regardless of license status)
2. `status` is `"expired"` → **blocked**
3. Otherwise → tools work

`license_status` tool is always exempt from blocking.

---

## 2. Heartbeat Flow — Current State vs. End State

### What the extension sends (unchanged by this work)

```
POST /api/license/heartbeat
{ fingerprint, machineId, sessionId, licenseKey }
```

### What the server returns after Phase 1

| Server `status` | `valid` | Meaning |
|---|---|---|
| `active` | `true` | License active, tools work |
| `past_due` | `true` | Dunning window, tools work |
| `cancellation_pending` | `true` | Subscription ending at period end, tools work |
| `trial` | `true` | Device trial, tools work |
| `expired` | `false` | Subscription cancelled/lapsed |
| `suspended` | `false` | Member access suspended by Owner |
| `revoked` | `false` | Member access revoked by Owner |

### Current extension handling has two problems

**Problem A — Stale validation set.** `VALID_HEARTBEAT_STATUSES` in both `licensing/validation.js` and `mouse-vscode/src/licensing/validation.js` still contains the old `"license_suspended"`, `"license_expired"`, `"license_revoked"` strings. The Phase 1 server now sends `"suspended"`, `"expired"`, `"revoked"`, `"past_due"`. Any heartbeat returning one of the new status values would **fail schema validation** and be treated as an error response — the extension would never see the actual status.

**Problem B — Payment-path confusion.** The `_handleLicenseSuspended` method in the VSIX heartbeat and the `"SUSPENDED"` notification in `extension.js` say "Payment issue detected. Update your payment method." This message is wrong for admin-suspended members, and the concept of payment-triggered license suspension no longer exists after Phase 1.

### End-state mapping (two-dimensional)

| Server `status` | `valid` | → `status` (LICENSE_STATES) | → `memberStatus` (MEMBER_STATES) | Tools | Status Bar |
|---|---|---|---|---|---|
| `active` | `true` | `licensed` | `null` | Work | `$(verified)` Mouse: Licensed |
| `active` | `true` | `licensed` | `"active"` | Work | `$(verified)` Mouse: Licensed |
| `past_due` | `true` | `past_due` | **Unchanged** | Work | `$(warning)` Mouse: Past Due |
| `cancellation_pending` | `true` | `licensed` | **Unchanged** | Work | `$(verified)` Mouse: Licensed |
| `trial` | `true` | *(stay in current trial state)* | `null` | Work | `$(clock)` Mouse: Trial (Xd) |
| `expired` | `false` | `expired` | **Unchanged** | Blocked | `$(warning)` Mouse: Expired |
| `suspended` | `false` | **Unchanged** | `"suspended"` | Blocked | `$(lock)` Mouse: Suspended |
| `revoked` | `false` | **Unchanged** | `"revoked"` | Blocked | `$(circle-slash)` Mouse: Revoked |

**Key insight:** When the server returns `"suspended"` or `"revoked"`, the extension writes to `memberStatus` only — the `status` field (LICENSE_STATES) is left unchanged. The license status (e.g. `licensed`, `past_due`) remains accurate for the subscription itself. This eliminates the conflation that previously caused "Payment issue detected" messages for admin-suspended members.

---

## 3. UX Design per Blocking/Warning State

> **Two-dimensional note:** `past_due` and `expired` are detected via `status` (LICENSE_STATES). `suspended` and `revoked` are detected via `memberStatus` (MEMBER_STATES). The status bar displays whichever dimension has priority — `memberStatus` wins when non-null and blocking.

### 3.1 `past_due` — Tools work, UI warns (LICENSE_STATES)

**Status bar:** `$(warning) Mouse: Past Due` with `warningBackground`

**`license_status` tool response:**
> "Your subscription payment is past due. Mouse tools remain fully available during the payment retry period. Please update your payment method at https://hic-ai.com/portal/billing to avoid service interruption."

**`messages.js` nag (injected in `_meta.license`):** Billing-focused messaging with portal/billing link. Similar in structure to trial nags but with contextually appropriate copy about the past-due status. Frequency: always show when state is `PAST_DUE` (the user needs to know).

**Tool access:** All tools execute normally, identical to `licensed`.

### 3.2 `suspended` — Tools blocked, member-level, reversible (MEMBER_STATES)

**Status bar:** `$(lock) Mouse: Suspended` with `errorBackground`

**Notification on state change:**
> "Your team membership has been suspended by your team administrator. Contact them to restore your access, or get your own Individual license at https://hic-ai.com/pricing"

**`license_status` tool response:**
> "Your team membership has been suspended by your team administrator. Please contact them to have your access restored. If you've enjoyed using Mouse, you can get your own Individual license at https://hic-ai.com/pricing — we'd love to have you stay!"

**Tool access:** All tools blocked except `license_status`.

### 3.3 `revoked` — Tools blocked, member-level, permanent (MEMBER_STATES)

**Status bar:** `$(circle-slash) Mouse: Revoked` with `errorBackground`

**Notification on state change:**
> "Your team membership has been revoked by your team administrator. You can get your own Individual license at https://hic-ai.com/pricing"

**`license_status` tool response:**
> "Your team membership has been revoked by your team administrator. This action is permanent for this team license. Please contact your team administrator for more information. If you've enjoyed using Mouse, you can get your own Individual license at https://hic-ai.com/pricing — we'd love to have you!"

**Tool access:** All tools blocked except `license_status`.

### 3.4 `expired` — Tools blocked, subscription-level (LICENSE_STATES)

**Status bar:** `$(warning) Mouse: Expired` with `errorBackground`

**Notification on state change:**
> "Your Mouse license has expired. Restore access at https://hic-ai.com/pricing"

**`license_status` tool response:**
> "Your Mouse license has expired. This can happen when a subscription is cancelled or a payment issue isn't resolved during the retry period. You can restore access by purchasing a new subscription at https://hic-ai.com/pricing, or update your payment method at https://hic-ai.com/portal/billing if you believe this is an error. We'd love to have you back!"

**Tool access:** All tools blocked except `license_status`.

---

## 4. File-by-File Implementation Plan

### 4.1 Fix 3 — Casing Normalization + State Additions

#### File 1: `licensing/constants.js`

- Lowercase all `LICENSE_STATES` values
- Remove `LICENSED_GRACE: "LICENSED_GRACE"`
- Add `PAST_DUE: "past_due"`
- Do NOT add `SUSPENDED` or `REVOKED` to `LICENSE_STATES` — they are member-access states
- Add new `MEMBER_STATES` enum:
  ```js
  const MEMBER_STATES = {
    ACTIVE: "active",
    SUSPENDED: "suspended",
    REVOKED: "revoked",
  };
  ```

#### File 2: `licensing/state.js`

- Add `memberStatus: null` to `_createInitialState()` return object
- In `load()`, add status value migration: if persisted status is UPPER_CASE, lowercase it and persist
- In `load()`, migrate legacy `"SUSPENDED"` / `"suspended"` and `"REVOKED"` / `"revoked"` out of `status` into `memberStatus`
- Map legacy `"LICENSED_GRACE"` / `"licensed_grace"` → `"past_due"` during migration
- Update `isLicensed()` to accept `PAST_DUE` as a valid licensed state (tools work):
  ```js
  state.status === config.LICENSE_STATES.LICENSED ||
  state.status === config.LICENSE_STATES.PAST_DUE
  ```
- Add `isMemberBlocked()` method:
  ```js
  isMemberBlocked() {
    const ms = this.state.memberStatus;
    return ms === config.MEMBER_STATES.SUSPENDED || ms === config.MEMBER_STATES.REVOKED;
  }
  ```

#### File 3: `licensing/heartbeat.js` (shared core)

- Remove `.toLowerCase()` calls on `config.LICENSE_STATES.*` values — they are already lowercase after Fix 3
- Remove `.toUpperCase()` on the status value written to state
- Update case labels in `_handleHeartbeatResponse`:
  - `"license_expired"` → `"expired"`
  - Remove `"license_suspended"` case entirely
  - Add `"past_due"` case → set status to `config.LICENSE_STATES.PAST_DUE` (see File 9 for VSIX-specific mapping)
  - `"suspended"` from server → write `memberStatus = config.MEMBER_STATES.SUSPENDED` (do NOT change `status`)
  - `"revoked"` from server → write `memberStatus = config.MEMBER_STATES.REVOKED` (do NOT change `status`)

#### File 4: `licensing/commands/validate.js`

- Remove `result.suspended` boolean check and `SUSPENDED` mapping
- When `result.valid === false`, use the server-provided `licenseStatus` to determine the state:
  - `"suspended"` → set `memberStatus = config.MEMBER_STATES.SUSPENDED`, leave `status` unchanged
  - `"revoked"` → set `memberStatus = config.MEMBER_STATES.REVOKED`, leave `status` unchanged
  - Otherwise → `status = config.LICENSE_STATES.EXPIRED`
- Remove the `isSuspended` variable and the suspended-specific grace period logic (`valid: isSuspended`)
- A `valid: false` with `"suspended"` or `"revoked"` is member-level blocking, not license blocking
- A `valid: false` with any other status is license-level blocking (`expired`)
- Remove `.toUpperCase()`/`.toLowerCase()` redundancy

#### File 5: `licensing/http-client.js`

- Remove `suspended: response.license?.status === "suspended"` from `validateLicense()` return object
- The caller (`validate.js`) no longer needs this flag; it reads `licenseStatus` directly

#### File 6: `mouse-vscode/src/licensing/license-checker.js`

- Remove `.toUpperCase()` from `checkLicense()` return value (`status: result.status.toUpperCase()` → `status: result.status`)
- Statuses are now canonical lowercase throughout

### 4.2 Fix 5 — Remove Suspended from Payment Path + Member Access Handling

#### File 7: `licensing/validation.js` (shared core)

- Remove from `VALID_HEARTBEAT_STATUSES`: `"license_suspended"`, `"license_expired"`, `"license_revoked"`
- Add to `VALID_HEARTBEAT_STATUSES`: `"past_due"`, `"suspended"`, `"revoked"`, `"expired"`, `"cancellation_pending"`
- Keep `"suspended"` in `VALID_LICENSE_STATES` (it is a valid member-access state returned in license response objects)
- Add `"past_due"` to `VALID_LICENSE_STATES`

#### File 8: `mouse-vscode/src/licensing/validation.js` (VSIX copy)

- Same changes as File 7 — this is the VSIX's own copy of the validation module

#### File 9: `mouse-vscode/src/licensing/heartbeat.js` (VSIX heartbeat)

**`_handleInvalidHeartbeat`:**
- Remove cases: `"license_suspended"`, `"license_expired"`, `"license_revoked"`
- Route `"suspended"` → `_handleMemberSuspended` (renamed from `_handleLicenseSuspended`)
- Route `"revoked"` → `_handleMemberRevoked` (new method)
- Route `"expired"` → `_handleLicenseExpired` (unchanged)

**`_handleLicenseSuspended` → renamed to `_handleMemberSuspended`:**
- Write `memberStatus = config.MEMBER_STATES.SUSPENDED` (do NOT change `status` — the license is still active)
- Fire `onStateChange` callback with `{ memberStatus: "suspended" }`
- Do NOT clear license key — the license is still active for the team

**New `_handleMemberRevoked`:**
- Write `memberStatus = config.MEMBER_STATES.REVOKED` (do NOT change `status`)
- Fire `onStateChange` callback with `{ memberStatus: "revoked" }`
- Do NOT clear license key — the license is still active for the team
- Do NOT stop heartbeat — the Owner may reinstate the member

**`_handleLicenseRevoked` (existing):**
- Retain for the case where the entire license is revoked (not just member access)
- This clears the license key and stops heartbeat — correct behavior for license-level revocation

**`_mapServerStatusToState` — license-level only:**
- Add `past_due: config.LICENSE_STATES.PAST_DUE`
- Keep `expired: config.LICENSE_STATES.EXPIRED`
- **Remove** `suspended` and `revoked` from this map — they are routed to `memberStatus` via dedicated handlers, not through `_mapServerStatusToState`

**`_handleHeartbeatResponse` (for `valid: true` responses):**
- `past_due` with `valid: true`: triggers `_mapServerStatusToState` → writes `PAST_DUE` to `status`, triggers `onStateChange` for status bar update. Tools remain available via `isLicensed()`.
- `active` with `valid: true`: if `memberStatus` was previously `"suspended"`, reset `memberStatus` to `"active"` (Owner reinstated the member).

#### File 10: `mouse-vscode/src/extension.js`

**`activate()` function:**
- Update status comparisons from UPPER_CASE to lowercase: `"LICENSED"` → `"licensed"`, `"EXPIRED"` → `"expired"`, etc.

**`updateStatusBarForState()` — two-dimensional priority display:**
- Check `memberStatus` first:
  - `"suspended"` → `statusBarManager.setStatus("suspended", "Mouse: Suspended")` — takes priority over any license status
  - `"revoked"` → `statusBarManager.setStatus("revoked", "Mouse: Revoked")` — takes priority over any license status
- Then fall through to `status` (LICENSE_STATES):
  - `"past_due"` → `statusBarManager.setStatus("past-due", "Mouse: Past Due")`
  - Update `"LICENSED"` → `"licensed"`, `"EXPIRED"` → `"expired"`

**`startHeartbeatWithCallbacks()` — `onStateChange` callback:**
- The callback receives the full state object (with both `status` and `memberStatus`)
- Remove the old `"SUSPENDED"` case with "Payment issue detected" messaging
- Check `memberStatus` changes first:
  - `"suspended"` → show warning with admin contact message + Individual license offer
  - `"revoked"` → show warning with admin contact message + Individual license offer
- Then check `status` changes:
  - `"past_due"` → show info message with billing link
  - `"expired"` → subscription/payment-focused messaging with pricing link

#### File 11: `mouse-vscode/src/StatusBarManager.js`

- Add to `STATUS_ICONS`:
  - `"past-due": "$(warning)"`
  - `"suspended": "$(lock)"`
  - `"revoked": "$(circle-slash)"`
- Add to `STATUS_COLORS`:
  - `"past-due": warningBackground`
  - `"suspended": errorBackground`
  - `"revoked": errorBackground`
- Add tooltip text in `setStatus()` switch for `past-due`, `suspended`, `revoked`

#### File 12: `mouse-vscode/src/licensing/messages.js`

**Replace `SUSPENDED` message pool:**
- Remove all billing/payment language
- New copy focuses on: member access suspended by team administrator, contact admin to restore, Individual license offer

**Add `REVOKED` message pool:**
- Permanent team revocation messaging, contact admin for info, Individual license offer

**Add `PAST_DUE` message pool:**
- Payment past due, tools still available, link to portal/billing to update payment method

**Update `getLicenseMessage()` — two-dimensional lookup:**
- Check `memberStatus` first:
  - `config.MEMBER_STATES.SUSPENDED` → return member-suspended message from SUSPENDED pool
  - `config.MEMBER_STATES.REVOKED` → return revoked message from REVOKED pool
- Then check `status` (LICENSE_STATES):
  - `config.LICENSE_STATES.PAST_DUE` → return past-due message with portal/billing URL

**Update `shouldShowMessage()` — two-dimensional check:**
- Always show when `memberStatus` is `"suspended"` or `"revoked"`
- Always show when `status` is `PAST_DUE` or `EXPIRED`

### 4.3 `license_status` Tool Enhancement

#### File 13: `mouse/src/licensing/tool.js` + `mouse/src/licensing/messages.js` + `mouse/src/licensing/license-checker.js`

> **✔️ Location resolved:** The `license_status` MCP tool is in `mouse/src/licensing/tool.js`, which calls `getLicenseChecker().getStatus()` then `licenseStatusToolResponse(status)` from `mouse/src/licensing/messages.js`. Tool gating is in `mouse/src/licensing/license-checker.js` via `checkToolAccess()`.

**`license-checker.js` — `checkToolAccess()` — two-dimensional gating:**
- Check `memberStatus` first: if `"suspended"` or `"revoked"` → blocked (except `license_status`)
- Then check `status`: if `"expired"` → blocked (except `license_status`)
- Otherwise → tools work

**`license-checker.js` — `_buildStatusResponse()`:**
- Include `memberStatus` in status response object
- Add `PAST_DUE` case (blocked: false, includeMetadata: true)

**`messages.js` — `licenseStatusToolResponse()` — two-dimensional response:**
- Check `memberStatus` first:
  - `"suspended"` → "Member access suspended. Contact admin. Individual license at pricing."
  - `"revoked"` → "Member access revoked. Contact admin. Individual license at pricing."
- Then check `status`:
  - `past_due` → "Payment past due. Tools available. Update payment at portal/billing."
  - `expired` → "License expired. Restore at pricing or update payment at portal/billing."

**`tool.js`:** No structural changes — all changes flow through `getStatus()` and `licenseStatusToolResponse()`.

### 4.4 VSIX Packaging Fix

#### File 14: `mouse-vscode/scripts/build.js`

In the `buildBundle()` function, where `licensing/` is copied to `bundle/licensing/`, exclude the `tests/` subdirectory.

Currently the code is:
```js
copyDir(path.join(REPO_ROOT, "licensing"), path.join(BUNDLE_DIR, "licensing"));
```

This copies the entire `licensing/` directory, including `licensing/tests/` (6 test files: `commands.test.js`, `constants.test.js`, `heartbeat.test.js`, `http-client.test.js`, `state.test.js`, `version.test.js`).

The fix: modify `copyDir` to accept an exclusion list, or add a post-copy cleanup step that removes `bundle/licensing/tests/`. The test files carry `node:test` imports and `dm/facade/test-helpers` references that have no place in a production VSIX bundle.

---

## 5. Tests

### 5.1 Unit Tests (Tasks 3.8, 6.14)

| File | Assertions |
|------|------------|
| `licensing/tests/constants.test.js` | All `LICENSE_STATES` values are lowercase. `PAST_DUE` exists. `LICENSED_GRACE` absent. `SUSPENDED`/`REVOKED` absent from `LICENSE_STATES`. New `MEMBER_STATES` enum has `ACTIVE`, `SUSPENDED`, `REVOKED`. |
| `licensing/tests/heartbeat.test.js` | `past_due` maps to `PAST_DUE` in `status`. `suspended` writes to `memberStatus` (not `status`). `revoked` writes to `memberStatus` (not `status`). No `"license_suspended"` handling exists. |
| `licensing/tests/state.test.js` | Migration lowercases UPPER_CASE persisted values. `"LICENSED_GRACE"` migrates to `"past_due"`. Legacy `"SUSPENDED"`/`"REVOKED"` in `status` migrates to `memberStatus`. `isMemberBlocked()` returns true for suspended/revoked. |
| `mouse-vscode/tests/heartbeat.test.js` | VSIX heartbeat routes `suspended` to `_handleMemberSuspended` (writes `memberStatus`). Routes `revoked` to `_handleMemberRevoked` (writes `memberStatus`). Routes `expired` to `_handleLicenseExpired` (writes `status`). Maps `past_due` to `PAST_DUE` in `status`. `_mapServerStatusToState` does NOT contain suspended/revoked. |

### 5.2 Property Tests (Tasks 3.10, 3.11, 6.17)

| Property | Tag | Assertion |
|----------|-----|-----------|
| Property 3 | `// Feature: status-remediation-plan, Property 3` | For any value in `LICENSE_STATES`, the value must be a lowercase string |
| Property 4 | `// Feature: status-remediation-plan, Property 4` | For any persisted status string (including UPPER_CASE from prior installs), loading through `state.js` produces a lowercase result |
| Property 20 | `// Feature: status-remediation-plan, Property 20` | For any heartbeat response with status `"past_due"`, the extension maps it to `PAST_DUE` in `status` where all tools continue to work |
| Property 21 | `// Feature: status-remediation-plan, Property 21` | For any heartbeat response with status `"suspended"` or `"revoked"`, the extension writes to `memberStatus` only — `status` (LICENSE_STATES) is unchanged |
| Property 22 | `// Feature: status-remediation-plan, Property 22` | `MEMBER_STATES` values (`"active"`, `"suspended"`, `"revoked"`) never appear in the `status` field; `LICENSE_STATES` values never appear in `memberStatus` |

---

## 6. Execution Order

The dependency order mandated by the overall remediation plan (Fix 3 before Fix 5) is preserved:

1. **Fix 3 constants + state migration** (Files 1-2) — establish the lowercase foundation
2. **Fix 3 downstream propagation** (Files 3-6) — remove casing gymnastics from heartbeat, validate, http-client, license-checker
3. **Fix 5 validation sets** (Files 7-8) — align allowed status strings with Phase 1 server responses
4. **Fix 5 heartbeat + extension UI** (Files 9-12) — implement member-access handling, status bar, notifications, messages
5. **`license_status` tool enhancement** (File 13) — contextual per-state responses
6. **VSIX packaging fix** (File 14) — exclude tests from bundle
7. **Tests** — unit tests and property tests per section 5

---

## 7. Design Decisions

### D1. `past_due` maps to `config.LICENSE_STATES.PAST_DUE`

Not to `LICENSED`. This is necessary so that:
- The status bar displays "Mouse: Past Due" (not "Mouse: Licensed")
- The `messages.js` module returns billing-focused nag messages
- The `license_status` tool returns contextual past-due information
- `isLicensed()` in `state.js` accepts `PAST_DUE` as a valid licensed state, so tools remain unblocked

### D2. Two-dimensional model: LICENSE_STATES + MEMBER_STATES

`suspended` and `revoked` are **not license states** — they describe a member’s access on a team license, not the state of the license itself. Putting them in `LICENSE_STATES` would create endless confusion because the license can simultaneously be `licensed` (active, paid, tools working for the Owner) while a member is `suspended`. The two-dimensional model cleanly separates these orthogonal concerns:

- `status` (LICENSE_STATES) → subscription-level: fresh, trial, licensed, past_due, expired, etc.
- `memberStatus` (MEMBER_STATES) → member-level: null, active, suspended, revoked

Neither `suspended` nor `revoked` clears the license key. The license itself remains active for the team Owner and other members.

### D3. `_handleMemberRevoked` does NOT stop heartbeat

Unlike the existing `_handleLicenseRevoked` (which stops heartbeat and clears the key because the entire license is gone), member-level revocation writes to `memberStatus` only and keeps the heartbeat running. This allows the extension to detect if the Owner reinstates the member (even though `revoked` is described as "permanent," the heartbeat should not assume the backend will never transition `memberStatus`).

### D4. Build-time exclusion of tests (not `.vscodeignore`)

The 6 test files in `licensing/tests/` should be excluded at build time in `build.js`, not via `.vscodeignore`. The test files carry `node:test` and `dm/facade/test-helpers` imports that don't belong in the production bundle directory at all, and relying on `.vscodeignore` patterns is fragile when nested paths are involved.

### D5. `LICENSED_GRACE` → `PAST_DUE` migration

Any existing installs with persisted `"LICENSED_GRACE"` state will be migrated to `"past_due"` when the extension loads. This is a one-time migration that happens in `state.js load()`.

### D6. `memberStatus` is `null` for Individual license holders and Owners

The `MEMBER_STATES` dimension is only relevant for non-Owner members on multi-seat Business licenses. For Individual license holders and for the Owner of a Business license, `memberStatus` remains `null`. This means:
- Tool gating skips the `memberStatus` check entirely when it's `null`
- Status bar display falls through to `status` (LICENSE_STATES) when `memberStatus` is `null`
- No migration is needed for existing Individual license installs — `memberStatus: null` is the default

---

## 8. Open Items

### ~~O1. `license_status` tool location~~ — RESOLVED

> Resolved during code exploration. The tool chain is: `mouse/src/licensing/tool.js` → `mouse/src/licensing/license-checker.js` (`getStatus()`, `checkToolAccess()`) → `mouse/src/licensing/messages.js` (`licenseStatusToolResponse()`). See File 13 in Section 4.3.

### O2. Property test framework in extension repo

The Phase 1 property tests used `dm/facade/test-helpers`. The extension repo's tests use `node:test` with the same helpers. Property tests for Phase 2 will follow the established pattern in `licensing/tests/`.

### O3. `mouse/src/licensing/constants.js` — parallel constants file

`mouse/src/licensing/constants.js` has its own `LICENSE_STATUS` enum (already lowercase) that duplicates `licensing/constants.js`. Phase 2 must add `MEMBER_STATUS` to this file as well. The `LS_STATUS_MAP` in this file needs updating to remove `LICENSED_GRACE` and add `PAST_DUE`.

---

## 9. Traceability to `tasks.md`

| `tasks.md` Task | This Memo Section |
|---|---|
| 3.6 — LICENSE_STATES to lowercase | File 1 |
| 3.7 — State migration logic | File 2 |
| 3.8 — Unit tests for casing | Section 5.1 |
| 3.10 — Property 3: LICENSE_STATES lowercase | Section 5.2 |
| 3.11 — Property 4: State migration | Section 5.2 |
| 6.9 — Remove suspended from heartbeat | Files 3, 9 |
| 6.10 — Remove suspended from validation | Files 7, 8 |
| 6.11 — Remove suspended check from HTTP client | File 5 |
| 6.12 — Remove suspended handling from extension | Files 10, 11, 12 |
| 6.13 — Remove suspended from validate command | File 4 |
| 6.14 — Unit tests for suspended removal | Section 5.1 |
| 6.17 — Property 20: past_due maps to active | Section 5.2 |
| VSIX packaging fix | File 14 |

### Additional work beyond `tasks.md`

The following items extend beyond the original `tasks.md` scope to fulfill SWR's design direction:

- **Two-dimensional state model:** New `MEMBER_STATES` enum separating member-access states from license states (Files 1, 2, 3, 4, 9, 10, 12, 13)
- `PAST_DUE` state addition with distinct UI treatment (Files 1, 9, 10, 11, 12)
- `license_status` tool contextual messaging per state (File 13)
- Positive, encouraging UX copy for blocked states (Files 10, 12)
- `LICENSED_GRACE` removal and migration (Files 1, 2)
- `mouse/src/licensing/constants.js` parallel constants update (O3)

---

_End of memo._
