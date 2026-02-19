# Update to Open Heartbeat Issues & Remediation Plan

**Date:** 2026-02-19  
**Author:** GC (Copilot, Claude Opus 4.6)  
**Owner:** SWR  
**Updates:** [Open Heartbeat Issues & Remediation Plan](20260219_OPEN_HEARTBEAT_ISSUES_REMEDIATION_PLAN.md)

---

## Purpose

This document records four significant findings discovered _after_ the initial remediation plan was written. Three of them change the scope or approach of the proposed fixes. The fourth confirms a decision that was pending.

**Bottom line:** The original Fix 2 ("add `"over_limit"` alias to reason switch") is **insufficient** — the problem is deeper than a missing case label. The VS Code `HeartbeatManager` dispatches invalid-heartbeat handling by switching on `response.reason`, but the server sets `reason` to **human-readable strings** (e.g., `"Machine not found or deactivated"`), not machine-parseable codes. Additionally, the server returns `valid: true` for `"over_limit"`, meaning it never enters the invalid-heartbeat handler at all. Fix 2 must be redesigned.

---

## Finding 1: Two Copies of `VALID_HEARTBEAT_STATUSES`

Fix 1 as described updates `licensing/validation.js`. But the VS Code extension bundles its **own copy** of the validation module:

| File                                                                                               | Style                      | Line |
| -------------------------------------------------------------------------------------------------- | -------------------------- | ---- |
| [licensing/validation.js](../../licensing/validation.js#L18-L26)                                   | ES module (`export const`) | L18  |
| [mouse-vscode/src/licensing/validation.js](../../mouse-vscode/src/licensing/validation.js#L14-L22) | CommonJS-style (`const`)   | L14  |

Both contain the same 7-value allow-list. Both must be updated.

**Impact on Fix 1:** Doubles the file count from one to two, but the change is identical in each. Tests in `mouse-vscode/tests/security.test.js` import from the VS Code copy and must pass with the expanded set.

---

## Finding 2: `over_limit` Never Reaches `_handleInvalidHeartbeat`

The original Fix 2 assumed the handler's `_handleInvalidHeartbeat` switch needed an `"over_limit"` case alias. That assumption was wrong.

### Server response for `over_limit` (back-end heartbeat route, L322):

```json
{
  "valid": true,
  "status": "over_limit",
  "reason": "You're using 3 of 2 allowed devices",
  "concurrentMachines": 3,
  "maxMachines": 2,
  "message": "Consider upgrading your plan for more concurrent devices."
}
```

**Key: `valid: true`.**

### Client-side routing in `_handleHeartbeatResponse` (VS Code heartbeat.js L222–258):

```
if (!response.valid)  →  _handleInvalidHeartbeat(response)
else                  →  success path (update timestamps, check status change)
```

Because `valid` is `true`, the `over_limit` response goes through the **success path**, not `_handleInvalidHeartbeat`. Fix 2's proposed alias (`case "over_limit":`) would never be reached.

### What the success path does with `over_limit`:

1. Calls `onSuccess` callback — **works** (version check runs, heartbeat logged)
2. Compares `response.status` to `currentState.status` — detects a difference
3. Calls `_mapServerStatusToState(response.status)` — this maps `ACTIVE`, `LICENSED`, `SUSPENDED`, `EXPIRED`, `REVOKED` but **NOT** `over_limit`
4. Returns `null` → state change is silently ignored

**Result:** An `over_limit` heartbeat succeeds without error, the version check runs, but the device-limit warning UI never fires. The `_handleConcurrentLimitExceeded` callback is never called even though it's wired up.

### What must change:

**Option 2A — Detect `over_limit` in the success path (extension-only fix):**

Add an explicit check in `_handleHeartbeatResponse` before or after the status mapping:

```js
// After the existing status-change check:
if (response.status === "over_limit") {
  this._handleConcurrentLimitExceeded(response);
}
```

This is the minimal surgical fix. The `over_limit` response still updates timestamps (correct — the heartbeat _was_ accepted by the server), the `onSuccess` callback still fires (version check runs), and the concurrent-limit UI also fires.

**Option 2B — Server returns `valid: false` for `over_limit` (back-end fix):**

Change back-end L322 to `valid: false`. Then the response enters `_handleInvalidHeartbeat`, but the existing `"concurrent_limit"` case would still not match because `response.reason` is `"You're using X of Y..."`. This option alone is incomplete — it requires Fix 3 below as well.

**GC recommendation:** Option 2A. Single file, single function, 3 lines. No back-end change, no cross-repo dependency.

---

## Finding 3: Handler Switches on `response.reason` — Server Sends Human-Readable Reasons

This is the root architectural flaw in the VS Code `HeartbeatManager._handleInvalidHeartbeat()`.

### The switch statement ([mouse-vscode/src/licensing/heartbeat.js](../../mouse-vscode/src/licensing/heartbeat.js#L268)):

```js
switch (response.reason) {
  case "concurrent_limit":    // expects reason === "concurrent_limit"
  case "license_suspended":   // expects reason === "license_suspended"
  case "license_expired":     // expects reason === "license_expired"
  case "license_revoked":     // expects reason === "license_revoked"
  case "machine_not_found":   // expects reason === "machine_not_found"
```

### What the server actually sets for `reason`:

| Server status         | Server `reason` value                                           | Handler expects       | Match?                                                                         |
| --------------------- | --------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------ |
| `"machine_not_found"` | `heartbeatResult.error \|\| "Machine not found or deactivated"` | `"machine_not_found"` | **DEPENDS** — only if `heartbeatResult.error` is exactly `"machine_not_found"` |
| `"over_limit"`        | `"You're using X of Y allowed devices"`                         | `"concurrent_limit"`  | **NO**                                                                         |
| `"invalid"`           | Dynamic from `validateLicenseKeyFormat()`                       | (no case)             | N/A                                                                            |
| `"error"`             | `"Server error during heartbeat"`                               | (no case)             | N/A                                                                            |

The `"machine_not_found"` case is the **critical path** for Phase 3D machine revival. If Keygen's error message is anything other than the exact string `"machine_not_found"`, the `_attemptMachineRevival()` method is never called — even after Fix 1 lets the response through the validation gate.

### What the shared `HeartbeatManager` does (for contrast):

The shared implementation at [licensing/heartbeat.js](../../licensing/heartbeat.js#L195) switches on `result.status`, not `result.reason`. This is **correct** — `status` is the machine-parseable enum field.

### Recommended fix:

**Change the VS Code `_handleInvalidHeartbeat` switch from `response.reason` to `response.status`:**

```js
switch (
  response.status // was: response.reason
) {
  case "concurrent_limit":
  case "over_limit": // new: server emits this status
    this._handleConcurrentLimitExceeded(response);
    break;

  case "license_suspended":
    this._handleLicenseSuspended(response);
    break;

  case "license_expired":
    this._handleLicenseExpired(response);
    break;

  case "license_revoked":
    this._handleLicenseRevoked(response);
    break;

  case "machine_not_found":
    await this._attemptMachineRevival();
    break;

  default:
    console.warn("[Mouse Heartbeat] Unknown invalid status:", response.status);
}
```

This fix:

- Aligns with the server's actual response contract (`status` is the enum, `reason` is the human-readable message)
- Matches the shared `HeartbeatManager`'s approach
- Makes `"machine_not_found"` matching reliable regardless of the `reason` string
- Enables `"over_limit"` handling (for any `over_limit` response that has `valid: false` — or combined with Option 2A for `valid: true` responses)

**However:** This intersects with Finding 2. If we switch on `status`, and `over_limit` comes in with `valid: true`, it still won't reach `_handleInvalidHeartbeat`. The full fix is: **(1) switch on `response.status`, AND (2) add `over_limit` detection in the success path (Finding 2, Option 2A).**

---

## Finding 4: `/api/version` Endpoint Confirmed Non-Existent

The initial memo's HB-3 noted that `checkForUpdates()` calls `https://api.hic-ai.com/version`, a non-existent host. The deeper investigation confirmed:

- **No `/api/version` route exists** in the Website repo. (Searched `plg-website/src/app/api/` recursively — no `version/` directory, no `version/route.js`.)
- The endpoint was **discussed in planning docs** (PLG Launch Decision Summary §3c, Open Decisions Register B-D1) but **never implemented**.
- The `api.hic-ai.com` hostname itself does not resolve — all PLG API routes are served from `staging.hic-ai.com` (and production will use `hic-ai.com`).

**SWR decided B-D1 = Option A** (remove custom version notification layer). This confirms Fix 3 as described in the original memo.

---

## Finding 5: EventBridge Rule Is Still Needed

SWR asked whether the EventBridge rule (`plg-mouse-version-notify-staging`) is still needed after removing the custom `checkForUpdates()` layer.

**Answer: Yes — the EventBridge rule serves the heartbeat-delivered version path, not `checkForUpdates()`.**

The version delivery chain:

```
Admin publishes new version
  → DynamoDB record VERSION#mouse/CURRENT updated with latestVersion
  → EventBridge rule fires daily at 9 AM UTC
  → Lambda copies latestVersion → readyVersion (24-hour delay gate)
  → Heartbeat response includes readyVersion + readyUpdateUrl
  → Extension onSuccess callback compares versions
  → Status bar shows "Update available"
```

The EventBridge rule implements the 24-hour notification delay described in the Auto-Update Report (Feb 5). Removing `checkForUpdates()` (Fix 3) removes a broken code path to a non-existent endpoint. The EventBridge rule is an **independent, working component** of the heartbeat-delivered version notification pipeline.

**Status (confirmed):** Deployed and **ENABLED** on staging. CloudFormation template at `plg-website/infrastructure/cloudformation/plg-scheduled.yaml`. Lambda at `plg-website/infrastructure/lambda/scheduled-tasks/index.js`.

**Recommendation:** Do not remove. No action needed.

---

## Finding 6: Complete Server Response Shape Reference

For precision during implementation, here is every heartbeat response the back-end can return, with `valid`/`status`/`reason` values and how the client currently handles each after the proposed fixes.

### Responses that reach `validateHeartbeatResponse` (HTTP 200):

| Line | `valid` | `status`              | `reason`                                                        | Current gate | After Fix 1 | Handler path                                                                    |
| ---- | ------- | --------------------- | --------------------------------------------------------------- | ------------ | ----------- | ------------------------------------------------------------------------------- |
| L155 | `true`  | `"trial"`             | `"Trial heartbeat recorded"`                                    | **BLOCKED**  | passes      | success path → version check runs                                               |
| L249 | `false` | `"machine_not_found"` | `heartbeatResult.error \|\| "Machine not found or deactivated"` | **BLOCKED**  | passes      | `_handleInvalidHeartbeat` → `"machine_not_found"` case (Finding 3 fix required) |
| L261 | `true`  | `"active"`            | `"Heartbeat successful"`                                        | passes       | passes      | success path (working today)                                                    |
| L322 | `true`  | `"over_limit"`        | `"You're using X of Y..."`                                      | **BLOCKED**  | passes      | success path → needs Finding 2 fix                                              |
| L341 | `true`  | `"active"`            | `"Heartbeat successful"`                                        | passes       | passes      | success path (working today)                                                    |
| L226 | `false` | `"invalid"`           | dynamic                                                         | passes       | passes      | `_handleInvalidHeartbeat` → default (acceptable)                                |
| L371 | `false` | `"error"`             | `"Server error during heartbeat"`                               | **BLOCKED**  | passes      | `_handleInvalidHeartbeat` → default (acceptable)                                |

### Responses that never reach `validateHeartbeatResponse` (HTTP errors):

| Line | HTTP | Body                                                | What happens                                           |
| ---- | ---- | --------------------------------------------------- | ------------------------------------------------------ |
| L103 | 429  | `{ error: "Rate limit exceeded", retryAfter, ... }` | `_post()` throws (`!response.ok`) → retry with backoff |
| L122 | 400  | `{ error: "Device fingerprint is required" }`       | `_post()` throws → retry then fail                     |
| L197 | 401  | `{ error: "Unauthorized", detail: "..." }`          | `_post()` throws → retry then fail                     |
| L213 | 400  | `{ error: "Session ID is required" }`               | `_post()` throws → retry then fail                     |

These HTTP error responses lack `valid`/`status`/`reason` fields but are handled correctly: `HttpClient._post()` throws on non-200 responses before `validateHeartbeatResponse` is called. The heartbeat manager's retry logic catches and retries.

**Note:** The 429 and 401 responses have no `valid` field. If the client ever changes to stop throwing on non-200 responses, these would fail the `validateHeartbeatResponse` check even after Fix 1. This is not an immediate issue but is worth noting for future refactoring.

### Version fields:

Only `"trial"` (L155), `"active"` (L261), and success (L341) responses include version fields (`latestVersion`, `readyVersion`, `readyUpdateUrl`, etc.). The `"over_limit"` response at L322 does **not** include version fields. This means over-limit users would not receive version notifications via heartbeat.

**Potential back-end improvement (not launch-blocking):** Add version fields to the `over_limit` response at L322, similar to the other 200-level responses.

---

## Revised Remediation Plan

### Fix 1: Expand `VALID_HEARTBEAT_STATUSES` — unchanged, but TWO files

**Files:**

- [licensing/validation.js](../../licensing/validation.js#L18-L26) L18–26
- [mouse-vscode/src/licensing/validation.js](../../mouse-vscode/src/licensing/validation.js#L14-L22) L14–22

**Change:** Add `"trial"`, `"machine_not_found"`, `"over_limit"`, `"error"` to both copies.

**From original plan:** Unchanged in substance. Only scope adjustment: two files instead of one.

**Effort:** 10 minutes (5 per file).

---

### Fix 2: Redesigned — switch on `response.status` + detect `over_limit` in success path

**Replaces:** Original Fix 2 ("add `"over_limit"` alias to reason switch")

**File:** [mouse-vscode/src/licensing/heartbeat.js](../../mouse-vscode/src/licensing/heartbeat.js)

**Two changes in `_handleHeartbeatResponse`:**

**Change A — Add `over_limit` detection to success path (L222–258):**

After the existing status-change mapping block, add:

```js
// Detect over_limit with valid: true (server considers session valid but warns)
if (response.status === "over_limit") {
  this._handleConcurrentLimitExceeded(response);
}
```

**Change B — Switch `_handleInvalidHeartbeat` from `response.reason` to `response.status` (L268):**

```js
switch (response.status) {     // was: response.reason
```

And add `"over_limit"` as a case alias for `"concurrent_limit"` for completeness (in case the server ever returns `valid: false` for over-limit in the future):

```js
case "concurrent_limit":
case "over_limit":
  this._handleConcurrentLimitExceeded(response);
  break;
```

**Effect:**

- `"machine_not_found"` (which has `valid: false`) reaches `_handleInvalidHeartbeat` and matches the `"machine_not_found"` case by `status` — machine revival works regardless of the human-readable `reason` string
- `"over_limit"` (which has `valid: true`) is caught in the success path before it silently drops — concurrent-limit UI fires
- All existing cases (`"concurrent_limit"`, `"license_suspended"`, `"license_expired"`, `"license_revoked"`) continue to work because these strings are valid status values regardless of switching on `status` vs `reason`

**Risk:** Low. Status field is the authoritative enum; reason field was always the wrong dispatch key.

**Effort:** 20 minutes (code change + review both changes for correctness).

---

### Fix 3: Remove `checkForUpdates()` — confirmed, unchanged

**Decision:** B-D1 = Option A (remove custom version notification layer).

**From original plan:** Unchanged. Remove `checkForUpdates()` function, `mouse.checkForUpdates` command registration, silent startup call, and command contribution from `package.json`.

**EventBridge rule:** Retain. It serves the heartbeat-delivered version path (see Finding 5).

**Effort:** 30 minutes.

---

### Fix 4: Tests — expanded scope

**From original plan:** Unchanged in spirit, expanded for Findings 1–3:

1. Assert `VALID_HEARTBEAT_STATUSES` contains all server-emitted statuses — **in both copies**
2. Assert `validateHeartbeatResponse()` accepts `"trial"`, `"machine_not_found"`, `"over_limit"`, `"error"` — **in both copies**
3. Assert `_handleHeartbeatResponse` calls `_handleConcurrentLimitExceeded` when `response.status === "over_limit"` AND `response.valid === true` (**new test**)
4. Assert `_handleInvalidHeartbeat` dispatches by `response.status` (not `response.reason`) for `"machine_not_found"` (**new test**)
5. Assert `_handleInvalidHeartbeat` dispatches `"over_limit"` to `_handleConcurrentLimitExceeded` when `response.valid === false` (**new test**)
6. Existing tests for `"concurrent_limit"`, `"license_expired"`, etc. continue to pass (regression)
7. If Fix 3 applied: assert `mouse.checkForUpdates` command no longer exists

**Effort:** 1.5 hours (expanded from 1 hour due to new test cases).

---

### Deferred: Consolidate `HeartbeatManager` implementations (HB-4)

**From original plan:** Unchanged assessment — not launch-blocking. The two implementations don't conflict because the extension uses only the VS Code version.

**Additional context from this investigation:**

| Aspect             | Shared (`licensing/heartbeat.js`) | VS Code (`mouse-vscode/src/licensing/heartbeat.js`)     |
| ------------------ | --------------------------------- | ------------------------------------------------------- |
| Timer              | `setTimeout` chaining             | `setInterval`                                           |
| Constructor        | Options object                    | Positional (stateManager, httpClient)                   |
| Callbacks          | On start via options              | On `start()` parameter                                  |
| Switch target      | `result.status` **(correct)**     | `response.reason` **(wrong — Fix 2 changes to status)** |
| Machine revival    | None                              | `_attemptMachineRevival()`                              |
| Lines              | 314                               | 440                                                     |
| Used by extension? | **No**                            | **Yes**                                                 |

There is also dead code in [mouse-vscode/src/licensing/license-checker.js](../../mouse-vscode/src/licensing/license-checker.js) — the `startHeartbeat()` (L148) and `sendHeartbeat()` methods are unused. The extension bypasses `LicenseChecker` for heartbeat management and uses `HeartbeatManager` directly.

**Post-launch recommendation:** Consolidate into one `HeartbeatManager` based on the VS Code version (which has machine revival). Remove the shared version or adapt it for future CLI use. Remove unused `LicenseChecker.startHeartbeat()` / `sendHeartbeat()`.

---

## Open Items Resolved

| Item                                 | Resolution                                                                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| B-D1 — Custom version layer          | **Decided: Option A (remove).** Fix 3 proceeds.                                                                       |
| `/api/version` endpoint              | **Confirmed non-existent.** Never created. No back-end work needed.                                                   |
| EventBridge rule                     | **Retained.** Serves heartbeat-delivered version path — independent of `checkForUpdates()`.                           |
| Back-end `reason` for `"over_limit"` | **Answered:** `"You're using X of Y allowed devices"` — a human-readable string. Handler must NOT switch on `reason`. |

---

## Open Items Remaining

### 1. Verify `machine_not_found` reason string from Keygen

**What:** Server L249 sets `reason: heartbeatResult.error || "Machine not found or deactivated"`. The value of `heartbeatResult.error` depends on what Keygen returns. If it is the literal string `"machine_not_found"`, the current handler would have worked (coincidentally). After the Fix 2 change to switch on `response.status`, this is moot for correctness — but understanding the actual Keygen error message is useful for logging.

**How:** Check Keygen documentation or server logs on staging for the exact error string returned when a machine has been DEACTIVATE_DEAD'd.

**Impact on implementation:** None — Fix 2 makes this a non-issue by switching to `status`.

**Priority:** Low. Informational only.

### 2. `over_limit` response missing version fields (back-end)

**What:** The `over_limit` early-return at L322 does not include `latestVersion`, `readyVersion`, `readyUpdateUrl`, etc. Over-limit users won't receive version notifications.

**How:** Add version fields to the `over_limit` response in the back-end heartbeat route, matching the shape of the `"active"` response.

**Impact:** Over-limit users still see version-update notifications in the status bar.

**Priority:** Low. Over-limit is an edge case. Not launch-blocking.

**Repo:** Website (`plg-website/src/app/api/license/heartbeat/route.js` L322).

### 3. AP9-SCOPE — Phase 4 hardening scope

**From original plan.** SWR still needs to confirm which items are launch-required vs. post-launch. GC assessment is in the original memo §5, Decision 3. The findings in this update do not change those assessments.

---

## Revised Effort Summary

| Fix       | Description                                  | Original Effort | Revised Effort | Change Reason                                       |
| --------- | -------------------------------------------- | --------------- | -------------- | --------------------------------------------------- |
| Fix 1     | Expand `VALID_HEARTBEAT_STATUSES`            | 5 min           | 10 min         | Two files instead of one                            |
| Fix 2     | Handler dispatch + `over_limit` success path | 5 min           | 20 min         | Redesigned — switch target + success-path detection |
| Fix 3     | Remove `checkForUpdates()`                   | 30 min          | 30 min         | Unchanged                                           |
| Fix 4     | Tests                                        | 1h              | 1.5h           | Three new test cases                                |
| **Total** |                                              | **~1.5–2h**     | **~2.5h**      |                                                     |

The additional ~45 minutes come from the deeper understanding of Fix 2's actual scope. The work remains within a single focused session.

---

## Cross-Repo Handoff: Website Repo Items

For an agent working in the Website repo (`hic-ai-inc.github.io`), two items are identified but **neither is launch-blocking**:

1. **(Low priority)** Add version fields to `over_limit` response at `plg-website/src/app/api/license/heartbeat/route.js` L322 — match the shape of the `"active"` response (L341).

2. **(Informational)** The Execution Tracker items 9.8, 9.9, 9.10 are confirmed ALREADY IMPLEMENTED in the extension. No Website repo work needed for those.

3. **(No action)** EventBridge rule is deployed and functioning correctly. No changes needed.

All critical fixes (1–4) are **extension-repo-only**.

---

_End of update._
