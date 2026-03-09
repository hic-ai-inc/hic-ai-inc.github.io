# Phase 2 Completion & Handoff Memo — Status Remediation Plan

**Date:** 2026-03-09
**Author:** AI Coding Assistant (GitHub Copilot, Claude Opus 4.6)
**Approved by:** SWR
**Repo:** `SimonReiff/hic` (Mouse extension repo)
**Branch:** `development` and `main` at commit `45ed5273`
**Released:** Mouse v0.10.16 (VSIX deployed to `hic-e2e-clean`, DynamoDB staging updated)
**Phase 3 Target:** `hic-ai-inc/hic-ai-inc.github.io` (website repo)

---

## Purpose

This memo provides full context for the AI agent performing Phase 3 of the Status Remediation Plan in the website repo (`hic-ai-inc/hic-ai-inc.github.io`). Phase 2 completed all extension-side work: Fix 3 (casing normalization) and Fix 5 (remove "suspended" from the payment path, introduce a two-dimensional state model). Phase 3 returns to the website repo to run final checkpoints and implement the heartbeat response schema enhancement described in Section 8.

The authoritative spec lives in the website repo at `.kiro/specs/status-remediation-plan/`. The three key files are:

- `requirements.md` — 15 requirements with acceptance criteria
- `tasks.md` — full task list with completion marks
- `design.md` — the consolidated plan (V6)

The extension repo's companion task list is at `plg/status-remediation-plan/tasks.md` in `SimonReiff/hic`.

---

## What Was Done (Phase 2 Summary)

### Scope

29 files changed, +1,970 lines, -226 lines across three packages:

| Package                          | Implementation Files | Test Files         | New Test Files |
| -------------------------------- | -------------------- | ------------------ | -------------- |
| `licensing/` (shared core)       | 7 files              | 5 files (expanded) | 0              |
| `mouse-vscode/` (VSIX extension) | 6 files              | 2 files (expanded) | 0              |
| `mouse/` (MCP tool server)       | 4 files              | 0                  | 3 files (new)  |

### Commits

| Hash       | Description                                                                |
| ---------- | -------------------------------------------------------------------------- |
| `6a44ace0` | Phase 2 + Heartbeat Schema Analysis memos                                  |
| `118082a1` | Phase 2 implementation — two-dimensional state model + comprehensive tests |
| `45ed5273` | v0.10.16 release                                                           |

### Test Results (All Green)

| Suite        | Tests       | Status |
| ------------ | ----------- | ------ |
| licensing    | 221/221     | ✅     |
| mouse-vscode | 235/235     | ✅     |
| mouse        | 1,671/1,671 | ✅     |
| mcp          | 105/105     | ✅     |
| tools        | 16/16       | ✅     |

---

## Architectural Change: Two-Dimensional State Model

The central design decision of Phase 2 was separating license-level state from member-access state. Before Phase 2, "suspended" appeared in the LICENSE_STATES enum alongside license lifecycle states like "licensed" and "expired." This conflated two orthogonal concerns: the state of the subscription and the state of a team member's access.

### LICENSE_STATES — License Lifecycle (7 values, all lowercase)

| Key              | Value              | Semantics                                               | Tools   |
| ---------------- | ------------------ | ------------------------------------------------------- | ------- |
| `FRESH`          | `"fresh"`          | New install, not yet initialized                        | N/A     |
| `TRIAL`          | `"trial"`          | Active 14-day device trial                              | Work    |
| `TRIAL_ENDING`   | `"trial_ending"`   | Days 8–13 of trial                                      | Work    |
| `TRIAL_LAST_DAY` | `"trial_last_day"` | Final day of trial                                      | Work    |
| `LICENSED`       | `"licensed"`       | Active, valid license                                   | Work    |
| `PAST_DUE`       | `"past_due"`       | Stripe dunning window — tools work, UI warns            | Work    |
| `EXPIRED`        | `"expired"`        | Subscription cancelled or payment failed beyond dunning | Blocked |

**Changes from prior state:**

- 6 carried forward, values lowercased (were UPPERCASE)
- 1 removed: `LICENSED_GRACE` → replaced by `PAST_DUE`
- 1 added: `PAST_DUE`
- 2 moved out: `SUSPENDED` and `REVOKED` are no longer license-level states

### MEMBER_STATES — Team Member Access (new enum)

| Key         | Value         | When Populated                                   | Semantics         | Tools                    |
| ----------- | ------------- | ------------------------------------------------ | ----------------- | ------------------------ |
| —           | `null`        | Individual license, or Owner of Business license | No team dimension | N/A (use LICENSE_STATES) |
| `ACTIVE`    | `"active"`    | Non-Owner member, active                         | Full access       | Work                     |
| `SUSPENDED` | `"suspended"` | Non-Owner member, suspended by Owner             | Reversible        | Blocked                  |
| `REVOKED`   | `"revoked"`   | Non-Owner member, revoked by Owner               | Permanent         | Blocked                  |

### Tool Gating Priority

1. `memberStatus` is `"suspended"` or `"revoked"` → **blocked** (regardless of license status)
2. `status` is `"expired"` → **blocked**
3. Otherwise → tools work

The `license_status` tool is always exempt from blocking.

---

## File-by-File Change Inventory

### Shared Core (`licensing/`)

| File                                                         | Key Changes                                                                                                                                                                                                 |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [constants.js](../../licensing/constants.js)                 | LICENSE_STATES values lowercased; `LICENSED_GRACE` removed, `PAST_DUE` added; new `MEMBER_STATES` enum (`active`, `suspended`, `revoked`)                                                                   |
| [state.js](../../licensing/state.js)                         | Migration logic normalizes UPPER_CASE → lowercase on load; migrates `licensed_grace` → `past_due`; migrates `suspended`/`revoked` from `status` to new `memberStatus` field; new `isMemberBlocked()` helper |
| [heartbeat.js](../../licensing/heartbeat.js)                 | Two-dimensional routing: server `suspended`/`revoked` → `memberStatus`, server `expired` → `status`, server `active`/`past_due` → `status: licensed` or `past_due`; removed `_handleLicenseSuspended`       |
| [http-client.js](../../licensing/http-client.js)             | Removed `suspended` boolean from response; returns `licenseStatus` in validate response for two-dimensional routing                                                                                         |
| [validation.js](../../licensing/validation.js)               | Removed `suspended` from `VALID_HEARTBEAT_STATUSES`; added `past_due`, `revoked`, `over_limit`, `machine_not_found`, `cancellation_pending`                                                                 |
| [commands/validate.js](../../licensing/commands/validate.js) | Two-dimensional status routing: `suspended`/`revoked` → `memberStatus`, license-level states → `status`; `MACHINE_RECOVERY_CODES` for transparent re-activation                                             |
| [index.js](../../licensing/index.js)                         | Added `MEMBER_STATES` to barrel export                                                                                                                                                                      |

### VSIX Extension (`mouse-vscode/`)

| File                                                                                    | Key Changes                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [src/licensing/heartbeat.js](../../mouse-vscode/src/licensing/heartbeat.js)             | Member state routing in `_handleHeartbeatResponse`: `suspended`/`revoked` → write `memberStatus`, `expired` → write `status`; reinstatement (suspended → active clears `memberStatus`); `past_due` mapping to `PAST_DUE` state        |
| [src/licensing/messages.js](../../mouse-vscode/src/licensing/messages.js)               | New `memberStatus` parameter in `shouldShowMessage`, `getLicenseMessage`, `createLicenseMeta`; new SUSPENDED and REVOKED message pools with team admin context; member-priority routing (member blocks checked before license status) |
| [src/licensing/license-checker.js](../../mouse-vscode/src/licensing/license-checker.js) | Removed `isSuspended` flag                                                                                                                                                                                                            |
| [src/licensing/validation.js](../../mouse-vscode/src/licensing/validation.js)           | Removed `suspended` from VALID_HEARTBEAT_STATUSES; added post-Phase 1 server statuses                                                                                                                                                 |
| [src/StatusBarManager.js](../../mouse-vscode/src/StatusBarManager.js)                   | Removed suspended-specific status bar icon; added past_due warning icon                                                                                                                                                               |
| [src/extension.js](../../mouse-vscode/src/extension.js)                                 | Replaced `SUSPENDED` notification with member-state-aware messaging; added `PAST_DUE` notification                                                                                                                                    |

### MCP Tool Server (`mouse/`)

| File                                                                             | Key Changes                                                                                                                                                                                        |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [src/licensing/constants.js](../../mouse/src/licensing/constants.js)             | New `MEMBER_STATUS` enum; `PAST_DUE` constant; `LS_STATUS_MAP` with `past_due` mapping; `getFullConfig()` includes `memberStatuses`                                                                |
| [src/licensing/license-checker.js](../../mouse/src/licensing/license-checker.js) | Two-dimensional `checkToolAccess`: Priority 1 = member blocked (`suspended`/`revoked`), Priority 2 = license blocked (`expired`); `_buildStatusResponse` includes `memberStatus` field             |
| [src/licensing/messages.js](../../mouse/src/licensing/messages.js)               | New `pastDueMessage()`, `memberSuspendedMessage()`, `memberRevokedMessage()`; `getMessageForStatus()` checks member priority first; `licenseStatusToolResponse()` includes member-priority routing |
| [src/licensing/index.js](../../mouse/src/licensing/index.js)                     | Updated exports for new constants                                                                                                                                                                  |

---

## Test Coverage Summary

### Expanded Test Files

| Test File                              | Lines Added | Key Coverage                                                                                                             |
| -------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| `licensing/tests/constants.test.js`    | +92         | Property 3: LICENSE_STATES lowercase; MEMBER_STATES enum completeness                                                    |
| `licensing/tests/state.test.js`        | +289        | Property 4: State migration normalizes to lowercase; `isMemberBlocked`; `suspended`/`revoked` → `memberStatus` migration |
| `licensing/tests/heartbeat.test.js`    | +123        | Property 20: Extension maps `past_due` to active; two-dimensional routing                                                |
| `licensing/tests/commands.test.js`     | +93         | Two-dimensional validate command routing                                                                                 |
| `licensing/tests/http-client.test.js`  | +76         | Response shape: no `suspended` boolean, `licenseStatus` present                                                          |
| `mouse-vscode/tests/heartbeat.test.js` | +219        | Member state routing (suspended/revoked → memberStatus); reinstatement; `past_due` mapping                               |
| `mouse-vscode/tests/licensing.test.js` | +101        | `shouldShowMessage` with `memberStatus`; `getLicenseMessage` member priority; `createLicenseMeta` with `memberStatus`    |

### New Test Files

| Test File                                       | Lines | Key Coverage                                                                                                                             |
| ----------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `mouse/tests/licensing/constants.test.js`       | 125   | `MEMBER_STATUS` enum; `PAST_DUE` constant; `LS_STATUS_MAP`; `getFullConfig`                                                              |
| `mouse/tests/licensing/license-checker.test.js` | 229   | Two-dimensional `checkToolAccess` (member priority > license priority); `_buildStatusResponse` with `memberStatus`                       |
| `mouse/tests/licensing/messages.test.js`        | 206   | `pastDueMessage`; `memberSuspendedMessage`; `memberRevokedMessage`; `getMessageForStatus` priority; `licenseStatusToolResponse` priority |

---

## Tasks Checklist Status

All Phase 2 tasks are complete. The extension repo's `tasks.md` shows:

| Task | Description                                              | Status |
| ---- | -------------------------------------------------------- | ------ |
| 3.6  | Extension LICENSE_STATES to lowercase                    | ✅     |
| 3.7  | State migration logic                                    | ✅     |
| 3.8  | Unit tests for casing normalization (extension portions) | ✅     |
| 3.10 | Property 3: Extension LICENSE_STATES lowercase           | ✅     |
| 3.11 | Property 4: Extension state migration normalizes         | ✅     |
| 4    | Checkpoint — Fix 6 + Fix 3 complete                      | ✅     |
| 6.9  | Remove "suspended" from extension heartbeat              | ✅     |
| 6.10 | Remove "suspended" from extension validation             | ✅     |
| 6.11 | Remove "suspended" check from HTTP client                | ✅     |
| 6.12 | Remove suspended handling from VSIX module               | ✅     |
| 6.13 | Remove suspended from validate command                   | ✅     |
| 6.14 | Unit tests for suspended removal (extension)             | ✅     |
| 6.17 | Property 20: Extension maps "past_due" to active         | ✅     |
| 7    | Checkpoint — Fix 8 + Fix 5 complete                      | ✅     |

**Remaining unchecked items** (not Phase 2 scope):

- Task 16: Production configuration (manual Stripe/Keygen dashboard changes)
- Task 16.1: Configure Stripe Smart Retries
- Task 16.2: Configure Keygen policy durations
- Task 17: Final checkpoint — full remediation complete

---

## Key Architectural Decisions Made in Phase 2

### 1. `memberStatus` Is `null` for Individual License Holders

The `memberStatus` field is only populated for non-Owner members of a Business license. For Individual license holders and for the Owner of a Business license, `memberStatus` is `null`. This simplifies the common case — an Individual user never sees member-access messaging.

### 2. `past_due` Maps to Active (Tools Work)

During the 2-week Stripe Smart Retry dunning window, the extension treats `past_due` as a working state. All tools continue functioning. The only difference from `licensed` is UI: the status bar shows a warning icon, and contextual messaging in `license_status` links to the billing portal. This matches the Phase 1 server behavior where heartbeat returns `{ valid: true, status: "past_due" }`.

### 3. Member Priority Over License Priority

When both a member-access block and a license-level block exist simultaneously (e.g., member is suspended AND license is expired), the member-access block takes precedence in messaging. This ensures the user sees the most actionable message — "Contact your team administrator" rather than "Your subscription expired."

### 4. State Migration Handles Legacy Data

The state migration in `licensing/state.js` handles all legacy formats:

- UPPER_CASE values → lowercase (e.g., `"LICENSED"` → `"licensed"`)
- `licensed_grace` → `"past_due"`
- `suspended`/`revoked` in the `status` field → moved to `memberStatus` field
- Legacy field names (`state`, `licenseStatus`) → normalized to `status`

### 5. VSIX Packaging Fix Verified

The `build.js` script already excludes `["tests"]` when copying the `licensing/` directory into the bundle. The `mouse-0.10.16.vsix` tree confirms `bundle/licensing/` contains 16 files with no `tests/` subdirectory. The `.vscodeignore` also excludes `tests/**`.

---

## Heartbeat Contract: What the Extension Now Expects

After Phase 2, the extension's `VALID_HEARTBEAT_STATUSES` accepts these server response statuses:

```
active, trial, past_due, cancellation_pending, expired, suspended, revoked, over_limit, machine_not_found, error
```

The two-dimensional mapping from server response to local state:

| Server `status`        | `valid` | → Extension `status` | → Extension `memberStatus` |
| ---------------------- | ------- | -------------------- | -------------------------- |
| `active`               | `true`  | `licensed`           | unchanged                  |
| `trial`                | `true`  | `trial`              | unchanged                  |
| `past_due`             | `true`  | `past_due`           | unchanged                  |
| `cancellation_pending` | `true`  | `licensed`           | unchanged                  |
| `expired`              | `false` | `expired`            | unchanged                  |
| `suspended`            | `false` | unchanged            | `suspended`                |
| `revoked`              | `false` | unchanged            | `revoked`                  |
| `over_limit`           | `true`  | unchanged            | unchanged                  |
| `machine_not_found`    | `false` | unchanged            | unchanged                  |

---

## Phase 3 — Website Repo Tasks

Phase 3 returns to the website repo (`hic-ai-inc/hic-ai-inc.github.io`). The remaining work falls into two categories.

### A. Final Checkpoints from `tasks.md`

These checkpoints could not be run during Phase 1 because they depended on extension-side tasks being complete:

- **Checkpoint 2 (Task 4):** Fix 6 + Fix 3 complete — run full test suite to confirm no regressions after extension-side casing normalization
- **Checkpoint 4 (Task 7):** Fix 8 + Fix 5 complete — run full test suite to confirm no regressions after extension-side suspended removal
- **Task 16:** Production configuration (manual) — Configure Stripe Smart Retries and Keygen policy durations per tasks 16.1 and 16.2
- **Task 17:** Final checkpoint — run full test suite one final time, verify >80% test coverage

### B. Heartbeat Response Schema Enhancement (NEW — Amplify Phase 3 Scope)

**This is the most important Phase 3 addition.** During Phase 2, we discovered a root-cause failure in the heartbeat lifecycle for licensed users. The full analysis is documented in:

> [`plg/docs/20260309_HEARTBEAT_REQUEST_RESPONSE_SCHEMA_ANALYSIS.md`](20260309_HEARTBEAT_REQUEST_RESPONSE_SCHEMA_ANALYSIS.md)

#### The Problem

After a user completes the `Mouse: Enter License Key` activation flow, the license key is not reliably persisted to local state. When the heartbeat fires 10 minutes later, `licenseKey` is `null` in the request body. The server currently **requires** the license key to perform the DDB license lookup (`LICENSE#{licenseKey}/DETAILS`). With `licenseKey: null`, the lookup fails and the heartbeat silently breaks for all licensed users.

#### The Fix: Fingerprint-Based Device Lookup

The extension already sends `fingerprint` as a compulsory field in every heartbeat request. The device record in DDB (created during the activation flow) contains the `fingerprint`, `licenseKey`, `userId`, and all other fields needed. The fix is a server-side logic change in the heartbeat route:

1. If `licenseKey` is present → use it for DDB lookup (current behavior, unchanged)
2. If `licenseKey` is absent/null AND `fingerprint` is present → look up the device by fingerprint:
   - Query DDB for a device record matching the fingerprint
   - If found → extract the license key from the device record
   - Continue with normal heartbeat processing
3. If no device found → respond with `{ valid: false, status: "machine_not_found" }`

**File to modify:** `plg-website/src/app/api/license/heartbeat/route.js`

#### Why This Is Safe

- The binding already exists in DDB from the activation flow
- Fingerprint is stable (SHA-256 of hardware identifiers)
- No schema change — `licenseKey` is already optional
- Backward compatible — if `licenseKey` IS sent, it's used directly
- No license key exposure — it's never returned in the response
- Requires a prior authenticated activation — a random fingerprint resolves to nothing

#### DDB Query Requirement

The server needs to look up a device record by fingerprint when no license key is provided. This likely requires a Global Secondary Index (GSI) on the `fingerprint` field, or a query pattern that can resolve `fingerprint` → device record → `licenseKey`. The exact DDB schema should be confirmed in the website repo.

#### Phase 3 Task List Addition

The following task should be added to the Phase 3 scope:

> **Task: Implement fingerprint-based device lookup in heartbeat route**
>
> 1. Add fingerprint-based device resolution to `/api/license/heartbeat/route.js`
> 2. When `licenseKey` is null and `fingerprint` is present, query DDB for the device record by fingerprint
> 3. If a paired device exists, extract the license key and continue with normal heartbeat processing
> 4. If no device found, respond with `{ valid: false, status: "machine_not_found" }`
> 5. Add/confirm a DDB GSI on `fingerprint` if one does not already exist
> 6. Write unit tests covering: fingerprint-only lookup success, fingerprint with no matching device, licenseKey+fingerprint (licenseKey takes precedence), and security scenarios (unregistered fingerprint)
> 7. Write integration/property tests confirming heartbeat works end-to-end for both trial users (fingerprint only) and licensed users (fingerprint + optional licenseKey)

---

## Reference Documents

All located in the extension repo at `plg/docs/`:

| Document                                                                                                                                     | Purpose                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [`20260308_PHASE_1_COMPLETION_AND_HANDOFF_MEMO.md`](20260308_PHASE_1_COMPLETION_AND_HANDOFF_MEMO.md)                                         | Phase 1 summary, architectural decisions, extension task specs                    |
| [`20260308_STATUS_REMEDIATION_PROPOSED_PHASE_2_IMPLEMENTATION_PLAN.md`](20260308_STATUS_REMEDIATION_PROPOSED_PHASE_2_IMPLEMENTATION_PLAN.md) | Phase 2 design: two-dimensional state model, heartbeat mapping, file-by-file plan |
| [`20260309_HEARTBEAT_REQUEST_RESPONSE_SCHEMA_ANALYSIS.md`](20260309_HEARTBEAT_REQUEST_RESPONSE_SCHEMA_ANALYSIS.md)                           | Root-cause heartbeat failure analysis, fingerprint-based lookup proposal          |
| This memo                                                                                                                                    | Phase 2 completion summary, handoff to Phase 3                                    |

Website repo spec files (`.kiro/specs/status-remediation-plan/`):

- `requirements.md` — 15 requirements with acceptance criteria
- `tasks.md` — full task list
- `design.md` — consolidated plan (V6)

---

## Deferred Items (Carried Forward from Phase 1)

These items were documented in the Phase 1 memo and remain deferred:

- **D1:** Email templates for member suspension, revocation, and reinstatement
- **D2:** Distinct marketing/communication paths for revoked vs. expired users
- **D3:** Revocation does not expire the org license (documented as final behavior, not deferred)

---

## Summary for Phase 3 Agent

To execute Phase 3, the agent in the website repo should:

1. **Read** the `tasks.md` file in `.kiro/specs/status-remediation-plan/` for the full task list and remaining checkpoints
2. **Read** this memo for complete Phase 2 context and the new heartbeat route task
3. **Run** the final checkpoints (Tasks 4, 7, 17) — execute the full test suite and verify all tests pass
4. **Implement** the fingerprint-based device lookup in `/api/license/heartbeat/route.js` (Section B above)
5. **Verify** the DDB schema supports fingerprint-based queries (add GSI if needed)
6. **Write** comprehensive tests for the new fingerprint-based lookup
7. **Manual** (SWR): Configure Stripe Smart Retries and Keygen policy durations (Task 16)

The extension is fully aligned with the post-Phase 1 server contract. All status values, validation sets, and two-dimensional routing are in place. The only remaining gap is that heartbeats for licensed users silently fail because the license key is not reliably available in local state — the fingerprint-based lookup fix closes this gap entirely on the server side, with zero changes required in the extension.

---

_End of memo._
