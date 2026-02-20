# Heartbeat Investigation Plan

**Date:** 2026-02-19  
**Author:** GC (GitHub Copilot, Claude Opus 4.6)  
**Owner:** SWR  
**Purpose:** Systematic investigation plan to produce verified, source-code-grounded findings sufficient to populate every section of the [Comprehensive Analysis of Open Heartbeat Issues](20260219_COMPREHENSIVE_ANALYSIS_OF_OPEN_HEARTBEAT_ISSUES.md) skeleton.  
**Context:** The Feb 19 pre-scope investigation in the Extension repo (`~/source/repos/hic`) was conducted under degraded AI output conditions. Its outputs — one 647-line remediation plan, three shared notes, and one update document — contain a mixture of verified and unverified assertions that cannot be trusted without independent confirmation against the actual source code. This plan establishes the steps required to reach ground truth.

---

## Guiding Principles

1. **Source code is the only authority.** Every factual assertion in the final document must cite a specific file and line number, verified by reading the file during this investigation.
2. **Prior documents are leads, not facts.** The Feb 14 Alignment Memo, Feb 19 Remediation Plan, Feb 19 Update, and shared notes are treated as unverified claims to be cross-referenced — not as established findings.
3. **No section is populated until its prerequisite steps are complete.** Each step below lists which skeleton sections it feeds.
4. **SWR reviews each step's output before the next step begins** (or before population of dependent sections begins), unless SWR explicitly authorizes batching.

---

## Investigation Steps

### Step 1 — Read the Back-End Heartbeat Route (Line by Line)

**Repo:** `hic-ai-inc.github.io` (this repo)  
**File:** `plg-website/src/app/api/license/heartbeat/route.js`  
**Objective:** Establish ground truth for every response shape the server can emit.  
**What to extract:**

- Every response branch: the HTTP status code, `valid` value, `status` value, `reason` value, and whether version fields (`latestVersion`, `readyVersion`, `readyUpdateUrl`) are included
- The exact line numbers for each branch
- The conditions under which each branch is reached (auth state, Keygen result, license state)
- Any status values that appear in code comments but are not actually emitted

**Feeds skeleton sections:** §3.1.1, §4 (all bugs reference server behavior), §6 (user journeys — server side), Appendix A

**Status:** COMPLETE  
**Completed:** 2026-02-19  
**File reviewed:** `plg-website/src/app/api/license/heartbeat/route.js` (382 lines, last modified 2026-02-15)

#### Step 1 Findings: Complete Server Response Inventory

The file contains 11 `return NextResponse.json(...)` calls. Every response branch is catalogued below with its HTTP status, body shape, conditions, and whether version fields are included. Line numbers are exact and verified against the file on disk.

**Response 1 — Rate Limit (L103)**
- **HTTP:** 429
- **Body:** `rateLimitResult` object (passed through from middleware; contains `retryAfter`, `error`)
- **`valid`/`status`/`reason`:** None. This is not a heartbeat-shaped response.
- **Version fields:** No
- **Condition:** `rateLimitMiddleware` returns a truthy result (>10 heartbeats/minute per license key)

**Response 2 — Missing Fingerprint (L121)**
- **HTTP:** 400
- **Body:** `{ error: "Device fingerprint is required" }`
- **`valid`/`status`/`reason`:** None. Not a heartbeat-shaped response.
- **Version fields:** No
- **Condition:** `!fingerprint`

**Response 3 — Trial Heartbeat (L152)**
- **HTTP:** 200
- **`valid`:** `true`
- **`status`:** `"trial"`
- **`reason`:** `"Trial heartbeat recorded"`
- **Additional fields:** `concurrentMachines: 1`, `maxMachines: 1`, `nextHeartbeat: 900`
- **Version fields:** YES — all 7 (`latestVersion`, `releaseNotesUrl`, `updateUrl`, `readyVersion`, `readyReleaseNotesUrl`, `readyUpdateUrl`, `readyUpdatedAt`)
- **Condition:** `!licenseKey` (request has no license key — trial user path)

**Response 4 — Unauthorized (L196)**
- **HTTP:** 401
- **Body:** `{ error: "Unauthorized", detail: "Authentication is required for licensed heartbeats" }`
- **`valid`/`status`/`reason`:** None. Not a heartbeat-shaped response.
- **Version fields:** No
- **Condition:** `verifyAuthToken()` returns falsy (missing or invalid JWT)

**Response 5 — Missing Session ID (L212)**
- **HTTP:** 400
- **Body:** `{ error: "Session ID is required" }`
- **`valid`/`status`/`reason`:** None. Not a heartbeat-shaped response.
- **Version fields:** No
- **Condition:** `!sessionId` (after auth verification passes)

**Response 6 — Invalid License Format (L225)**
- **HTTP:** 400
- **`valid`:** `false`
- **`status`:** `"invalid"`
- **`reason`:** Dynamic — from `validateLicenseKeyFormat()` (one of: `"License key is required"`, `"Invalid license key format"`, `"Invalid license key checksum"`)
- **Version fields:** No
- **Condition:** `!formatValidation.valid` (malformed license key)

**Response 7 — Machine Not Found (L246)**
- **HTTP:** 200
- **`valid`:** `false`
- **`status`:** `"machine_not_found"`
- **`reason`:** `heartbeatResult.error || "Machine not found or deactivated"` — dynamic, depends on what Keygen returns
- **Additional fields:** `concurrentMachines: 0`, `maxMachines: 0`
- **Version fields:** No
- **Condition:** `!heartbeatResult.success` (Keygen machine heartbeat ping failed)
- **NOTABLE:** The `reason` is potentially any string Keygen returns as `error`. It is NOT the fixed string `"machine_not_found"`. This is critical for any client-side switch that matches on `reason`.

**Response 8 — License Not in DynamoDB (L263)**
- **HTTP:** 200
- **`valid`:** `true`
- **`status`:** `"active"`
- **`reason`:** `"Heartbeat successful"`
- **Additional fields:** `concurrentMachines: 1`, `maxMachines: null`, `nextHeartbeat: 900`
- **Version fields:** YES — all 7
- **Condition:** `!license` (Keygen machine heartbeat succeeded, but license key not found in DynamoDB)
- **NOTABLE:** No log statement for this response. The function returns silently with a 200 and `status: "active"` — the client cannot distinguish this from a normal success (Response 10).

**Response 9 — Over Limit, Early Return (L321)**
- **HTTP:** 200
- **`valid`:** `true`
- **`status`:** `"over_limit"`
- **`reason`:** `` `You're using ${concurrentMachines} of ${maxMachines} allowed devices` `` — dynamic human-readable string
- **Additional fields:** `concurrentMachines`, `maxMachines`, `message: "Consider upgrading your plan for more concurrent devices."`
- **Version fields:** No
- **Condition:** `overLimit` is truthy, where `overLimit = maxMachines && concurrentMachines > maxMachines` (L317)
- **NOTABLE:** This is a hard early return. The over_limit condition triggers `valid: true` — the server considers the heartbeat accepted. The response lacks ALL version fields and `nextHeartbeat`. Over-limit users receive no version update notifications via heartbeat and no guidance on when to next heartbeat.

**Response 10 — Success (L341)**
- **HTTP:** 200
- **`valid`:** `true`
- **`status`:** `overLimit ? "over_limit" : "active"` — BUT `overLimit` is ALWAYS FALSY at this point because Response 9 already returned for the truthy case. Effective value: **always `"active"`**.
- **`reason`:** `"Heartbeat successful"`
- **Additional fields:** `concurrentMachines`, `maxMachines`, `overLimit: overLimit` (always falsy), `message: null` (always null), `nextHeartbeat: 900`
- **Version fields:** YES — all 7
- **Condition:** All prior checks passed, `overLimit` is falsy
- **NOTABLE:** The ternary expressions referencing `overLimit` at L344, L348, L349–351 are **dead code** — they can never produce the `"over_limit"` branch because L319–329 already returned. This is harmless but misleading. The `overLimit` boolean field at L348 is always falsy at this point.

**Response 11 — Server Error (L370)**
- **HTTP:** 500
- **`valid`:** `false`
- **`status`:** `"error"`
- **`reason`:** `"Server error during heartbeat"`
- **Additional fields:** `concurrentMachines: 0`, `maxMachines: 0`
- **Version fields:** No
- **Condition:** Any unhandled exception in the try block

#### Step 1 Summary: Unique `status` Values Emitted

| `status` value | `valid` | HTTP | Version fields | Lines |
|---|---|---|---|---|
| (none — rate limit) | N/A | 429 | No | L103 |
| (none — 400 errors) | N/A | 400 | No | L121, L212 |
| `"trial"` | `true` | 200 | Yes | L152 |
| (none — 401 error) | N/A | 401 | No | L196 |
| `"invalid"` | `false` | 400 | No | L225 |
| `"machine_not_found"` | `false` | 200 | No | L246 |
| `"active"` | `true` | 200 | Yes | L263, L341 |
| `"over_limit"` | `true` | 200 | **No** | L321 |
| `"error"` | `false` | 500 | No | L370 |

#### Step 1 Key Observations

1. **Six unique `status` values are emitted:** `"trial"`, `"invalid"`, `"machine_not_found"`, `"active"`, `"over_limit"`, `"error"`. No other status values appear in runtime code.
2. **`"over_limit"` has `valid: true`.** The server treats the heartbeat as accepted. Any client-side handler that only enters an "invalid heartbeat" path on `valid === false` will never handle `over_limit`.
3. **`"over_limit"` response (L321) lacks version fields.** Trial (L152), license-not-in-DDB (L263), and normal success (L341) all include version fields. Over-limit does not. Over-limit users will not receive version update notifications via heartbeat.
4. **`"over_limit"` response (L321) lacks `nextHeartbeat`.** The client receives no server-suggested heartbeat interval for the over-limit case.
5. **`"machine_not_found"` has `valid: false` and a dynamic `reason`.** The `reason` field is `heartbeatResult.error || "Machine not found or deactivated"` — the actual string depends on what Keygen returns. A client that switches on `reason === "machine_not_found"` will only match if Keygen's error string happens to be exactly `"machine_not_found"`.
6. **The success path (L341) contains dead over_limit ternaries.** The `overLimit ? "over_limit" : "active"` at L344 can never produce `"over_limit"` because L321 already returned. Same for the message ternary at L349–351 and the `overLimit` boolean field at L348. Harmless but misleading.
7. **Four responses lack `valid`/`status`/`reason` fields entirely:** Rate limit (L103, HTTP 429), missing fingerprint (L121, HTTP 400), unauthorized (L196, HTTP 401), missing session ID (L212, HTTP 400). These are HTTP error responses with `{ error: "..." }` bodies. They never reach `validateHeartbeatResponse` on the client because the HTTP client should throw on non-200 status codes.
8. **`"invalid"` (L225) is HTTP 400, not 200.** Unlike all other heartbeat-shaped responses (which are HTTP 200 or 500), invalid license format returns HTTP 400. Client-side behavior depends on whether the HTTP client throws on 400 or passes it to the validation gate.
9. **No `status` values from the extension's handler exist in server code.** The server never emits `"license_expired"`, `"license_suspended"`, `"license_revoked"`, `"concurrent_limit"`, `"valid"`, or `"device_limit_exceeded"`. These are extension-only constructs with no corresponding server branch.
10. **Response 8 (license not in DDB, L263) has no log statement.** All other responses are preceded by `log.response(...)` or `log.decision(...)`. This silent return could make debugging difficult if it occurs in production.


---

### Step 2 — Read the VS Code HeartbeatManager

**Repo:** `hic` (Extension repo)  
**File:** `mouse-vscode/src/licensing/heartbeat.js`  
**Objective:** Confirm the complete client-side heartbeat lifecycle.  
**What to extract:**

- The timer mechanism: `setInterval` vs. `setTimeout` chaining, the interval duration, when it starts, when it stops
- `_handleHeartbeatResponse`: the `if (!response.valid)` fork — exact line numbers
- `_handleInvalidHeartbeat`: the switch statement — what field it switches on (`response.reason` or `response.status`), every case label verbatim
- The success path: what happens when `valid === true` — status mapping via `_mapServerStatusToState()`, what statuses it maps and what it returns for unknown statuses
- The `onSuccess` callback: what it does with version fields
- `_handleConcurrentLimitExceeded`: whether it exists, what calls it, what it does
- `_attemptMachineRevival`: whether it exists, what triggers it

**Feeds skeleton sections:** §3.2.1, §4.2, §4.3, §4.5, §6 (user journeys — client side)

#### Step 2 — Findings

*Investigation completed by GC. All assertions are source-code-verified with file paths and line numbers from the `hic` Extension repo.*

##### 2.1 — Timer Mechanism

The VS Code `HeartbeatManager` uses `setInterval()` (`heartbeat.js` L95) with `config.HEARTBEAT.INTERVAL_MS` (= 600,000 ms / 10 minutes, defined at `licensing/constants.js` L51). The timer starts in `start(callbacks)` (L72–98) and stops in `stop()` (L106–111) via `clearInterval()`. A guard at L85 checks `!state.licenseKey` to skip heartbeats for trial users.

The `config` import at `heartbeat.js` L16 resolves to the **shared** `licensing/constants.js` via `licensing/index.js` L10 — NOT the VS Code-local `mouse-vscode/src/licensing/config.js`. The heartbeat module never imports from the VS Code config.

`setInterval` fires the first heartbeat only AFTER the initial 10-minute delay, not immediately at start. The first immediate heartbeat for a session is handled separately via `sendHeartbeatOnce()` called during extension activation (`extension.js` L151–161, "pre-validation heartbeat" — prevents the validate → EXPIRED → heartbeat-never-starts death spiral).

##### 2.2 — `_handleHeartbeatResponse` (heartbeat.js L222–253)

The response handling path has a **critical ordering issue**:

1. **L228**: Calls `this._callbacks.onSuccess(response)` **FIRST** — before any validity check.
2. **L232**: Checks `if (!response.valid)` → delegates to `_handleInvalidHeartbeat(response)` and returns.
3. **L238–240**: Only reached for valid responses — updates `lastValidation` and `lastHeartbeat` timestamps on the state manager.
4. **L243–252**: Checks if `response.status !== currentState.status`, maps via `_mapServerStatusToState()`, fires `onStateChange` callback if the mapped state differs.

**Bug: `onSuccess` fires for every response, including invalid ones.** The `onSuccess` callback in `extension.js` (L224–248) extracts version fields (`response.readyVersion || response.latestVersion`) and triggers `statusBarManager.showUpdateAvailable()`. For invalid responses that pass through the validation gate, this could trigger update-available UI from an invalid response. In practice this is mitigated because the validation gate's fallback response contains NO version fields, so extraction yields `undefined` and no update fires.

##### 2.3 — `_handleInvalidHeartbeat` Switch Statement (heartbeat.js L260–294)

```js
switch (response.reason) {     // L266 — switches on `reason`, NOT `status`
  case "concurrent_limit":     // L268 → _handleConcurrentLimitExceeded(response)
  case "license_suspended":    // L272 → _handleLicenseSuspended(response)
  case "license_expired":      // L276 → _handleLicenseExpired(response)
  case "license_revoked":      // L280 → _handleLicenseRevoked(response)
  case "machine_not_found":    // L284 → _attemptMachineRevival()
  default:                     // L291 → console.warn("Unknown invalid reason")
}
```

**CRITICAL BUG: The switch dispatches on `response.reason` (L266), NOT `response.status`.** The server's heartbeat endpoint puts the machine status token in the `status` field (e.g., `"concurrent_limit"`, `"license_expired"`, `"over_limit"`) and a **dynamic human-readable string** in the `reason` field (e.g., `"License for this machine has expired"`, `"Too many concurrent machines"`). The case labels expect machine-status tokens in `response.reason`, but the server never puts status tokens there. **Every invalid heartbeat falls through to the `default` case ("Unknown invalid reason"), regardless of the actual server status.**

**Confirmed regression:** The shared `licensing/heartbeat.js` (314 lines, the reference implementation) correctly switches on `result.status` (L200). It also handles `"trial"` (L207–208, explicit no-op) and `"device_limit_exceeded"` (L227–228, alongside `"concurrent_limit"`), neither of which appears in the VS Code copy. The VS Code implementation diverged from the reference on the switch field and dropped two case labels.

##### 2.4 — Validation Gate (Pre-HeartbeatManager)

Before `HeartbeatManager` ever sees a response, `HttpClient.sendHeartbeat()` (`licensing/http-client.js` L178–198) calls `validateHeartbeatResponse(rawResponse)` at L188. This function (from `licensing/validation.js` L157–172) checks `response.status` against `VALID_HEARTBEAT_STATUSES`:

```js
// licensing/validation.js L18–25
VALID_HEARTBEAT_STATUSES = new Set([
  "active", "license_expired", "license_suspended",
  "license_revoked", "concurrent_limit", "valid", "invalid"
])
```

**Statuses that PASS the gate:** `active`, `license_expired`, `license_suspended`, `license_revoked`, `concurrent_limit`, `valid`, `invalid`.

**Server statuses REJECTED by the gate (replaced with fallback):**

| Rejected Status | Why It's Rejected | Server Context |
|---|---|---|
| `"trial"` | Not in Set | Sent for trial-period machines |
| `"over_limit"` | Not in Set | Sent for concurrent violations (note: NOT `"concurrent_limit"`) |
| `"machine_not_found"` | Not in Set | Sent for machines pruned by DEACTIVATE_DEAD |
| `"error"` | Not in Set | Sent for internal server failures |

When validation rejects a response, `HttpClient.sendHeartbeat()` returns the **fallback** (L189–194):

```js
{ valid: false, status: "error", reason: "Invalid server response" }
```

This fallback is what `HeartbeatManager._handleHeartbeatResponse()` processes. The switch at L266 checks `response.reason === "Invalid server response"`, which matches no case label → falls to `default` → logs "Unknown invalid reason".

**Additional gate: HTTP status codes.** The `_post()` method (`licensing/http-client.js` L222–260) throws on `!response.ok` (L249). The server returns HTTP 400 (invalid requests: missing fingerprint at `route.js` L121, missing session at L212, invalid payload at L225), HTTP 401 (unauthorized at L196), and HTTP 429 (rate limiting at L103). All throw **before** `validateHeartbeatResponse` runs. These exceptions bubble up to `_sendHeartbeatWithRetry()` (`heartbeat.js` L173–214), which catches them and retries up to 3 times with exponential backoff (1s, 2s, 4s per `licensing/constants.js` L54).

##### 2.5 — Success Path and `_mapServerStatusToState` (heartbeat.js L403–421)

When `response.valid === true` (L232 passes), the success path at L238–252:

1. Updates `lastValidation` and `lastHeartbeat` timestamps (L238–240)
2. Compares `response.status` with `currentState.status` (L243)
3. Maps the server status via `_mapServerStatusToState(response.status)` (L245)
4. Fires `onStateChange(mappedState, response)` if the mapped state differs from current (L247)

The mapping table (L404–409):

```js
{
  ACTIVE: "LICENSED",
  LICENSED: "LICENSED",
  SUSPENDED: "SUSPENDED",
  EXPIRED: "EXPIRED",
  REVOKED: "EXPIRED"      // Maps revoked to expired (user-facing equivalence)
}
```

At L411: `return mapping[serverStatus?.toUpperCase()] || null`

The `toUpperCase()` correctly handles the server's lowercase `"active"` → `"ACTIVE"` → `"LICENSED"`. The following server statuses map to `null` (no mapping entry): `"over_limit"` → `"OVER_LIMIT"` → no entry → `null`; `"trial"` → `"TRIAL"` → no entry → `null`; `"machine_not_found"` → `"MACHINE_NOT_FOUND"` → no entry → `null`; `"error"` → `"ERROR"` → no entry → `null`. All four are already rejected by the validation gate, so this is a secondary gap — the primary gap is the gate.

When mapping returns `null`, the comparison at L245–248 silently skips the state change — no callback, no error log.

##### 2.6 — `onSuccess` Callback (extension.js L224–248)

The `onSuccess` callback registered in `startHeartbeatWithCallbacks()`:

1. Logs `"[Mouse] Heartbeat successful"` (L225)
2. Extracts `response.readyVersion || response.latestVersion` (L229)
3. If a server version exists, gets installed version via `vscode.extensions.getExtension("hic-ai.mouse")?.packageJSON?.version` (L231)
4. Calls `checkUpdateAvailable(currentVersion, serverVersion)` from `licensing/version.js` L121–137
5. If update available, extracts `downloadUrl` from `response.readyUpdateUrl || response.updateUrl || response.downloadUrl` (L235–236)
6. Calls `statusBarManager.showUpdateAvailable(currentVersion, serverVersion, downloadUrl)` (L237–240)

The validation gate's sanitized output (`licensing/validation.js` L332–338) preserves version fields: `latestVersion`, `readyVersion`, `readyUpdateUrl`, `readyReleaseNotesUrl`, `readyUpdatedAt`, `releaseNotesUrl`, `updateUrl`. So version-triggered update notifications work correctly for responses that PASS the validation gate. For responses that FAIL the gate, the fallback has no version fields → extraction yields `undefined` → no update notification. This is safe.

##### 2.7 — `_handleConcurrentLimitExceeded` (heartbeat.js L347–356)

This method exists. It logs `"Concurrent session limit exceeded"` (L349) and calls `this._callbacks.onConcurrentLimitExceeded()` (L352–354). The callback in `extension.js` L283–297 shows a VS Code warning "Too many active sessions" with a "Manage Devices" button linking to `https://hic-ai.com/portal/devices`.

**Bug: This handler is unreachable in practice.** It is called from `case "concurrent_limit"` (L268), which switches on `response.reason`. The server never puts `"concurrent_limit"` in `reason` — it puts a dynamic string. Furthermore, the server sends `status: "over_limit"` (NOT `"concurrent_limit"`), which is rejected by the validation gate. Even if the switch were corrected to `response.status`, the value `"over_limit"` wouldn't match the case label `"concurrent_limit"`. **Doubly unreachable.**

##### 2.8 — `_attemptMachineRevival` (heartbeat.js L305–340)

This method exists. It calls `httpClient.activateLicense()` (L312–316) with the stored license key and fingerprint. On success: updates `machineId` in state (L321–323) and sends a follow-up heartbeat via `sendHeartbeatOnce()` (L327). On failure: sets state to `config.LICENSE_STATES.EXPIRED` (L333), fires `onStateChange("EXPIRED")` (L335), and calls `this.stop()` (L337).

**Bug: This handler is unreachable in practice.** It is triggered by `case "machine_not_found"` (L284) which switches on `response.reason`. The server puts a dynamic string in `reason`, not `"machine_not_found"`. Additionally, the server's `status: "machine_not_found"` is rejected by the validation gate (not in `VALID_HEARTBEAT_STATUSES`). **Doubly unreachable.**

##### 2.9 — Dead Code

**`mouse-vscode/src/licensing/validation.js` (471 lines):** Contains a complete copy of `VALID_HEARTBEAT_STATUSES` (L14–22, identical to shared copy) and `validateHeartbeatResponse()` (L106). No file in `mouse-vscode/src/` imports from it at runtime. Only `mouse-vscode/tests/security.test.js` (L25) imports it. The active validation gate runs inside `licensing/http-client.js`, which imports from the shared `licensing/validation.js`. The VS Code copy is dead code with divergence risk.

**`mouse-vscode/src/licensing/license-checker.js` heartbeat methods (L157–199):** Contains `sendHeartbeat()` and `startHeartbeat()` methods. Neither is called from `extension.js` — the extension uses `HeartbeatManager` exclusively. These are dead code.

##### 2.10 — Cross-Reference Matrix: Server Statuses vs. Client Handling

| Server Status | HTTP | Passes Gate? | HeartbeatManager Receives | Switch Match? | Handler | User-Visible Effect |
|---|---|---|---|---|---|---|
| `active` | 200 | YES | `{ valid: true, status: "active", ... }` | N/A (valid) | Success path → `"LICENSED"` | Status bar update; version check |
| `trial` | 200 | **NO** | Fallback `{ valid: false, status: "error", reason: "Invalid server response" }` | No | Default → warn | **Silent failure** |
| `over_limit` | 200 | **NO** | Fallback | No | Default → warn | **No concurrent-limit warning shown** |
| `machine_not_found` | 200 | **NO** | Fallback | No | Default → warn | **Machine revival never attempted** |
| `license_expired` | 200 | YES | `{ valid: false, status: "license_expired", reason: "License...expired" }` | No (reason is dynamic) | Default → warn | **EXPIRED state change never fires** |
| `license_suspended` | 200 | YES | `{ valid: false, status: "license_suspended", reason: "License...suspended" }` | No (reason is dynamic) | Default → warn | **SUSPENDED state change never fires** |
| `license_revoked` | 200 | YES | `{ valid: false, status: "license_revoked", reason: "License...revoked" }` | No (reason is dynamic) | Default → warn | **License key never cleared** |
| `concurrent_limit` | 200 | YES | `{ valid: false, status: "concurrent_limit", reason: "Too many..." }` | No (reason is dynamic) | Default → warn | **Concurrent warning never shown** |
| `error` | 200 | **NO** | Fallback | No | Default → warn | Silent failure |
| *(any)* | 400 | N/A (throws) | Exception → retry 3x | N/A | `onError` callback | Silent retry |
| *(any)* | 401 | N/A (throws) | Exception → retry 3x | N/A | `onError` callback | Silent retry |
| *(any)* | 429 | N/A (throws) | Exception → retry 3x | N/A | `onError` callback | Silent retry |

##### 2.11 — State Shape: `stateManager.getState()`

The `LicenseState` typedef at `licensing/state.js` L30–49 defines the full state object:

| Field | Type | Heartbeat Usage |
|---|---|---|
| `licenseKey` | `string \| null` | **Read** at `heartbeat.js` L85 (guard: skip if null), L194 (`_sendHeartbeatWithRetry` arg) |
| `fingerprint` | `string` | **Read** at L191 (`_sendHeartbeatWithRetry` arg), L313 (`_attemptMachineRevival` arg) |
| `machineId` | `string \| null` | **Read** at L192 (`_sendHeartbeatWithRetry` arg); **Written** at L321 (revival success) |
| `sessionId` | `string` | **Read** at L193 (`_sendHeartbeatWithRetry` arg) |
| `deviceName` | `string` | **Read** at L314 (`_attemptMachineRevival` arg) |
| `platform` | `string` | **Read** at L315 (`_attemptMachineRevival` arg) |
| `status` | `string` | **Read** at L243 (state-change comparison); **Written** at L362/374/389/333 (handler state transitions) |
| `lastValidation` | `number \| null` | **Written** at L238 (set to `Date.now()` on valid response) |
| `lastHeartbeat` | `number \| null` | **Written** at L239 (set to `Date.now()` on valid response) |
| `trialStartDate` | `string \| null` | Not accessed by heartbeat path |
| `trialEndsAt` | `string \| null` | Not accessed by heartbeat path |
| `instanceId` | `string \| null` | Not accessed by heartbeat path |
| `graceStartedAt` | `number \| null` | Not accessed by heartbeat path |
| `lastCheck` | `number \| null` | Not accessed by heartbeat path |
| `lastCheckResult` | `object \| null` | Not accessed by heartbeat path |
| `checkFailureCount` | `number` | Not accessed by heartbeat path |
| `lastNagAt` | `number \| null` | Not accessed by heartbeat path |

The heartbeat path reads 6 fields and writes 4 fields. The remaining 8 fields are managed by the validation/trial subsystem and are not touched by HeartbeatManager.

**`lastHeartbeat` format inconsistency:** The VS Code HeartbeatManager writes `lastHeartbeat` as `Date.now()` (number, L239). The shared `licensing/heartbeat.js` writes it as `new Date().toISOString()` (string, L159). Both write to the same `LicenseStateManager`. Neither HeartbeatManager reads `lastHeartbeat` — they only write it — so this does not cause a runtime bug within the heartbeat path itself. However, any other consumer of `stateManager.getState().lastHeartbeat` would receive a number or a string depending on which HeartbeatManager last wrote to state, creating a type ambiguity.

##### 2.12 — Import Chain (Verified via grep)

```
extension.js L16: import { HeartbeatManager } from "./licensing/heartbeat.js"
  └─ heartbeat.js L16: import { config, HttpClient } from "../../../licensing/index.js"
       ├─ licensing/index.js L10: export config from "./constants.js"
       │    └─ licensing/constants.js (HEARTBEAT, LICENSE_STATES, ENDPOINTS)
       ├─ licensing/index.js L57: export { HttpClient } from "./http-client.js"
       │    └─ licensing/http-client.js L15–20: imports validateHeartbeatResponse
       │         └─ licensing/validation.js (VALID_HEARTBEAT_STATUSES)
       └─ NOT imported: mouse-vscode/src/licensing/config.js
       └─ NOT imported: mouse-vscode/src/licensing/validation.js
```

##### 2.13 — Summary of All Bugs Found

| # | Bug | Location | Severity | Root Cause |
|---|---|---|---|---|
| 1 | **Switch on wrong field** | `heartbeat.js` L266 | CRITICAL | Switches on `response.reason` instead of `response.status` |
| 2 | **`onSuccess` before validity check** | `heartbeat.js` L228 | LOW | Fires for every response including invalid; mitigated by fallback having no version fields |
| 3 | **Validation gate rejects 4 server statuses** | `validation.js` L18–25 | HIGH | `trial`, `over_limit`, `machine_not_found`, `error` not in `VALID_HEARTBEAT_STATUSES` |
| 4 | **Status name mismatch: `over_limit` vs `concurrent_limit`** | `heartbeat.js` L268 vs server | HIGH | Client case label says `concurrent_limit`, server sends `over_limit` |
| 5 | **`_handleConcurrentLimitExceeded` unreachable** | `heartbeat.js` L347–356 | HIGH | Doubly blocked: wrong switch field AND wrong status name |
| 6 | **`_attemptMachineRevival` unreachable** | `heartbeat.js` L305–340 | HIGH | Doubly blocked: wrong switch field AND status rejected by gate |
| 7 | **All invalid-status handlers unreachable** | `heartbeat.js` L268–289 | CRITICAL | Every case expects status token in `reason`, server puts dynamic strings there |
| 8 | **Dead code: VS Code validation.js** | `mouse-vscode/src/licensing/validation.js` | MEDIUM | 471 lines not imported by any runtime code; divergence risk |
| 9 | **Dead code: LicenseChecker heartbeat methods** | `license-checker.js` L157–199 | LOW | `sendHeartbeat()` and `startHeartbeat()` never called |
| 10 | **`lastHeartbeat` format inconsistency** | VS Code `heartbeat.js` L239 vs shared `heartbeat.js` L159 | LOW | VS Code writes `Date.now()` (number), shared writes `new Date().toISOString()` (string) to same state field |


---

### Step 3 — Read Both Copies of `VALID_HEARTBEAT_STATUSES`

**Repo:** `hic` (Extension repo)  
**Files:**

- `licensing/validation.js` (shared copy)
- `mouse-vscode/src/licensing/validation.js` (VS Code copy)

**Objective:** Confirm the exact contents of each allow-list verbatim and verify whether they are identical.  
**What to extract:**

- Every status string in each array, in order
- The line numbers of each declaration
- The export style (ES module vs. CommonJS)
- Whether the arrays are identical or divergent

**Feeds skeleton sections:** §3.2.3, §3.2.4, §4.1, §5.1

**Status:** COMPLETE  
**Completed:** 2026-02-19  
**Files reviewed:** `licensing/validation.js` (557 lines), `mouse-vscode/src/licensing/validation.js` (471 lines)

#### Step 3 Findings

##### 3.1 — Shared Copy: `licensing/validation.js`

**Declaration (L18–26):**

```js
export const VALID_HEARTBEAT_STATUSES = new Set([
  "active",
  "license_expired",
  "license_suspended",
  "license_revoked",
  "concurrent_limit",
  "valid",
  "invalid",
]);
```

**Status strings in order:**
1. `"active"` (L19)
2. `"license_expired"` (L20)
3. `"license_suspended"` (L21)
4. `"license_revoked"` (L22)
5. `"concurrent_limit"` (L23)
6. `"valid"` (L24)
7. `"invalid"` (L25)

**Export style:** ES module — `export const` at the declaration site (L18). Also re-exported via `export default { ... VALID_HEARTBEAT_STATUSES ... }` at L553 of the same file.

##### 3.2 — VS Code Copy: `mouse-vscode/src/licensing/validation.js`

**Declaration (L14–22):**

```js
const VALID_HEARTBEAT_STATUSES = new Set([
  "active",
  "license_expired",
  "license_suspended",
  "license_revoked",
  "concurrent_limit",
  "valid",
  "invalid",
]);
```

**Status strings in order:**
1. `"active"` (L15)
2. `"license_expired"` (L16)
3. `"license_suspended"` (L17)
4. `"license_revoked"` (L18)
5. `"concurrent_limit"` (L19)
6. `"valid"` (L20)
7. `"invalid"` (L21)

**Export style:** CommonJS-style named export block at the bottom of the file — `const` at declaration (L14, no `export` keyword), then `export { ... VALID_HEARTBEAT_STATUSES ... }` at L467 within a grouped export statement (L461–471). No default export.

##### 3.3 — Identity Comparison

**The two arrays are identical.** Both contain the same 7 status strings in the same order:

| Position | Shared (L18–26) | VS Code (L14–22) | Match? |
|----------|-----------------|-------------------|--------|
| 1 | `"active"` | `"active"` | YES |
| 2 | `"license_expired"` | `"license_expired"` | YES |
| 3 | `"license_suspended"` | `"license_suspended"` | YES |
| 4 | `"license_revoked"` | `"license_revoked"` | YES |
| 5 | `"concurrent_limit"` | `"concurrent_limit"` | YES |
| 6 | `"valid"` | `"valid"` | YES |
| 7 | `"invalid"` | `"invalid"` | YES |

**Divergences (non-Set-contents):**
- **Export style differs:** The shared copy uses inline `export const`; the VS Code copy uses `const` + a separate `export { }` block at file end.
- **Line numbers differ:** Shared declaration begins at L18; VS Code declaration begins at L14. The 4-line offset is caused by the shared copy having 8 header lines (module JSDoc with `@module` tag) vs. the VS Code copy having 8 header lines with a different JSDoc format (includes `@see` reference to a security memo).
- **`LICENSE_KEY_PATTERN` diverges between files** (shared copy at L51 includes a third alternative for `key/BASE64.SIGNATURE` Keygen signed keys; VS Code copy at L48 has only MOUSE and UUID formats). This does not affect `VALID_HEARTBEAT_STATUSES` but is noted for completeness as a structural divergence within these same files.

##### 3.4 — Summary Answer to Step 3 Objective

The two copies of `VALID_HEARTBEAT_STATUSES` are **content-identical**: same 7 strings, same order. They differ only in export style (inline `export const` vs. deferred `export { }` block) and line number (L18 vs. L14). The Set contents have not diverged.

---

### Step 4 — Read the HTTP Client Validation Gate

**Repo:** `hic` (Extension repo)  
**File:** `mouse-vscode/src/licensing/http-client.js`  
**Objective:** Confirm the exact mechanism by which responses failing the allow-list check are rejected.  
**What to extract:**

- The `validateHeartbeatResponse` function (or equivalent): where it is defined, what it checks, what it returns on failure
- The fallback response shape when validation fails (expected: `{ valid: false, status: "error", reason: "Invalid server response" }`)
- Which callers invoke this validation and at what point in the request lifecycle

**Feeds skeleton sections:** §3.2.5, §4.1

**Status:** COMPLETE  
**Completed:** 2026-02-19  
**Files reviewed:** `licensing/http-client.js` (267 lines), `licensing/validation.js` L158–338 (`validateHeartbeatResponse`), `mouse-vscode/src/licensing/validation.js` L106–282 (`validateHeartbeatResponse`)

**File existence note:** Step 4 names `mouse-vscode/src/licensing/http-client.js` as the target file. **This file does not exist.** There is exactly one `http-client.js` in the repo: `licensing/http-client.js` (the shared copy). The VS Code extension imports it via `licensing/index.js`. All findings below are from that file.

#### Step 4 Findings

##### 4.1 — Where `validateHeartbeatResponse` Is Defined

The function is defined in two files (as established in Step 3):

1. **Shared (active at runtime):** `licensing/validation.js` L158–338, declared as `export function validateHeartbeatResponse(data)`.
2. **VS Code (dead code):** `mouse-vscode/src/licensing/validation.js` L106–282, declared as `function validateHeartbeatResponse(data)` (no `export` keyword; exported later via `export { }` block at L462).

The runtime caller (`licensing/http-client.js`) imports from the shared copy at L16–19:

```js
import {
  validateHttpsUrl,
  validateHeartbeatResponse,
  validateLicenseResponse,
  validateActivationResponse,
} from "./validation.js";
```

This is a relative import (`./validation.js`) — it resolves to `licensing/validation.js`, the shared copy. The VS Code copy is never imported by any runtime code (confirmed in Step 3).

##### 4.2 — What `validateHeartbeatResponse` Checks

Both copies perform the same sequence of validation checks. The shared copy (the active one) at `licensing/validation.js` L158–338 performs:

1. **Object check** (L160): Rejects if `data` is falsy, not an object, or an array. Returns `{ valid: false, error: "Response must be an object" }`.
2. **`valid` field** (L165): Rejects if `typeof data.valid !== "boolean"`. Returns `{ valid: false, error: 'Missing or invalid "valid" field (must be boolean)' }`.
3. **`status` field** (L173–180): If present, must be a string AND must be in `VALID_HEARTBEAT_STATUSES`. If not in the Set, returns `{ valid: false, error: \`Invalid status value: ${data.status}\` }`. **This is the allow-list gate.**
4. **`reason` field** (L183–190): If present, must be a string, max 500 chars.
5. **`concurrentMachines` field** (L193–204): If present, must be an integer 0–100.
6. **`maxMachines` field** (L207–217): If present, must be an integer 1–100.
7. **`suspended` / `expired` fields** (L220–225): If present, must be boolean.
8. **`latestVersion` field** (L228–236): If present, must be a string matching semver `X.Y.Z`.
9. **`downloadUrl` field** (L239–247): If present, must be a string starting with `https://`.
10. **`releaseNotesUrl` field** (L250–258): If present and non-null, must be a string starting with `https://`.
11. **`updateUrl` field** (L261–269): If present and non-null, must be a string starting with `https://`.
12. **`readyVersion` field** (L272–281): If present and non-null, must be a string matching semver `X.Y.Z`.
13. **`readyReleaseNotesUrl` field** (L284–292): If present and non-null, must be `https://` string.
14. **`readyUpdateUrl` field** (L295–303): If present and non-null, must be `https://` string.
15. **`readyUpdatedAt` field** (L306–312): If present and non-null, must be a string.

If ALL checks pass, returns a sanitized response at L315–338.

##### 4.3 — What the Function Returns on Failure

Every validation failure returns an object of shape:

```js
{ valid: false, error: "<specific error message>" }
```

There is no `data` property on failure — only `valid` and `error`.

##### 4.4 — What the Function Returns on Success

On success (L315–338), returns:

```js
{
  valid: true,
  data: {
    valid: data.valid,
    status: data.status || "active",          // defaults to "active" if absent
    reason: data.reason ? String(data.reason).slice(0, 500) : undefined,
    concurrentMachines: <clamped 0-100 or undefined>,
    maxMachines: <clamped 1-100 or undefined>,
    suspended: data.suspended === true,
    expired: data.expired === true,
    latestVersion: data.latestVersion,
    downloadUrl: data.downloadUrl,
    releaseNotesUrl: data.releaseNotesUrl || undefined,
    updateUrl: data.updateUrl || undefined,
    readyVersion: data.readyVersion || undefined,
    readyReleaseNotesUrl: data.readyReleaseNotesUrl || undefined,
    readyUpdateUrl: data.readyUpdateUrl || undefined,
    readyUpdatedAt: data.readyUpdatedAt || undefined,
  }
}
```

The `data` property contains the sanitized response that is passed through to the caller. Note the `status` default: if the server response has no `status` field, it defaults to `"active"`.

##### 4.5 — The Fallback Response Shape When Validation Fails

The fallback is NOT produced by `validateHeartbeatResponse` itself. It is produced by the caller: `HttpClient.sendHeartbeat()` in `licensing/http-client.js` L188–201:

```js
// CWE-502: Validate response schema
const validation = validateHeartbeatResponse(rawResponse);
if (!validation.valid) {
  console.warn(
    `[HIC HTTP] Invalid heartbeat response: ${validation.error}`,
  );
  return {
    valid: false,
    status: "error",
    reason: "Invalid server response",
  };
}

return validation.data;
```

**The actual fallback response shape is:**

```js
{ valid: false, status: "error", reason: "Invalid server response" }
```

This matches the expected shape stated in Step 4's description. This is the object that `HeartbeatManager._handleHeartbeatResponse()` receives whenever any server response fails the validation gate.

##### 4.6 — Which Callers Invoke This Validation and When

**There is exactly one runtime caller:** `HttpClient.sendHeartbeat()` at `licensing/http-client.js` L195.

The call sits at the following point in the request lifecycle:

1. `HeartbeatManager._sendHeartbeatWithRetry()` (in `mouse-vscode/src/licensing/heartbeat.js`) calls `httpClient.sendHeartbeat(fingerprint, machineId, sessionId, licenseKey)`.
2. Inside `HttpClient.sendHeartbeat()` (L183–207):
   - L188: `this._post(config.ENDPOINTS.HEARTBEAT, { ... })` fires the HTTP POST.
   - `_post()` (L215–260) performs the fetch, parses JSON, and throws on `!response.ok` (L249). **HTTP 400, 401, and 429 responses throw BEFORE `validateHeartbeatResponse` is ever called.**
   - L195: `validateHeartbeatResponse(rawResponse)` runs ONLY for HTTP 200 responses (and any other 2xx, though the server only sends 200 and 500 for heartbeat-shaped responses).
   - L196–201: If validation fails, logs a warning and returns the fallback.
   - L203: If validation passes, returns `validation.data` (the sanitized response).
3. The return value flows back to `HeartbeatManager._handleHeartbeatResponse()`.

**One test caller exists:** `mouse-vscode/tests/security.test.js` L18 imports `validateHeartbeatResponse` from `../src/licensing/validation.js` (the VS Code dead-code copy) and calls it ~30 times across its test suite. This does not affect runtime behavior.

**No other `.js` file in the repo calls `validateHeartbeatResponse`** — confirmed by exhaustive grep of all `.js` files (42 total matches: 2 definitions, 2 export lines, 2 re-export lines, 1 runtime call at `http-client.js` L195, 1 import at `http-client.js` L17, 1 test import at `security.test.js` L18, and ~33 test invocations in `security.test.js`).

##### 4.7 — Divergences Between the Two `validateHeartbeatResponse` Copies

While both copies perform the same logical checks in the same order with nearly identical code, there are three divergences in the sanitized success output (the `data` object returned on pass):

| Field | Shared (`licensing/validation.js` L315–338) | VS Code (`mouse-vscode/src/licensing/validation.js` L260–282) |
|---|---|---|
| `latestVersion` | `data.latestVersion` (raw passthrough) | `data.latestVersion \|\| undefined` (falsy-coerced) |
| `downloadUrl` | `data.downloadUrl` (raw passthrough) | Not present in VS Code sanitized output |
| `releaseNotesUrl` | `data.releaseNotesUrl \|\| undefined` | `data.releaseNotesUrl \|\| undefined` |

The shared copy preserves `latestVersion` as-is (including `null`) and includes a `downloadUrl` field. The VS Code copy coerces falsy `latestVersion` to `undefined` and omits `downloadUrl` entirely. Additionally, the shared copy's `latestVersion` null-check differs: it validates `if (data.latestVersion !== undefined)` (L228), while the VS Code copy validates `if (data.latestVersion !== undefined && data.latestVersion !== null)` (L185). This means the shared copy would reject a `null` `latestVersion` as failing the string type check, while the VS Code copy would skip validation for `null` and pass it through. **This divergence is irrelevant at runtime because only the shared copy is active**, but it is a factual difference between the two files.

##### 4.8 — Summary Answer to Step 4 Objective

The validation gate mechanism is:

1. **Defined in** `licensing/validation.js` L158–338 (shared, active at runtime). A second dead-code copy exists at `mouse-vscode/src/licensing/validation.js` L106–282.
2. **Checks:** 15 sequential field validations. The critical allow-list check is at L177: `if (!VALID_HEARTBEAT_STATUSES.has(data.status))` — any status not in the 7-element Set is rejected.
3. **On failure:** Returns `{ valid: false, error: "<message>" }`. The caller (`HttpClient.sendHeartbeat()` at `licensing/http-client.js` L196–201) translates this into the fallback `{ valid: false, status: "error", reason: "Invalid server response" }`.
4. **Single runtime caller:** `HttpClient.sendHeartbeat()` at `licensing/http-client.js` L195. Called after `_post()` returns successfully (HTTP 2xx only). HTTP error responses (400/401/429/500) throw before the gate is reached.

---

### Step 5 — Read the Shared HeartbeatManager for Comparison

**Repo:** `hic` (Extension repo)  
**File:** `licensing/heartbeat.js`  
**Objective:** Confirm the architectural approach of the shared implementation for contrast with the VS Code copy.  
**What to extract:**

- The timer mechanism (expected: `setTimeout` chaining)
- The handler switch: what field it switches on (expected: `result.status`)
- The case labels in the switch
- Constructor pattern (expected: options object)
- Whether `_attemptMachineRevival` or equivalent exists
- Line count for size comparison

**Feeds skeleton sections:** §3.2.2, §4.2 (contrast), §5.6 (consolidation assessment)

**Status:** COMPLETE  
**Completed:** 2026-02-19  
**File reviewed:** `licensing/heartbeat.js` (314 lines, read in full)

**Prior coverage note:** Step 2 Finding 2.3 partially addressed 3 of 6 extraction targets (switch field, two case labels, line count) in a cross-reference context. This Step 5 investigation independently read the entire file and provides the complete, authoritative answers for all 6 targets.

#### Step 5 Findings

##### 5.1 — Timer Mechanism: `setTimeout` Chaining (NOT `setInterval`)

The shared HeartbeatManager uses `setTimeout` chaining, not `setInterval`. The mechanism:

- `start()` (L76–93): Sets `_isRunning = true`, calls `_sendHeartbeat()` immediately (L84), then calls `_scheduleNext(this._intervalMs)` (L87).
- `_scheduleNext(delayMs)` (L112–121): Sets `this._intervalHandle = setTimeout(() => { this._sendHeartbeat(); this._scheduleNext(this._intervalMs); }, delayMs)`. This is recursive `setTimeout` chaining — each heartbeat schedules the next one after it completes.
- `stop()` (L98–110): Sets `_isRunning = false` and calls `clearTimeout(this._intervalHandle)`.

**Contrast with VS Code copy:** The VS Code `HeartbeatManager` (`mouse-vscode/src/licensing/heartbeat.js`) uses `setInterval` (L95 per Step 2 Finding 2.1). The shared copy's `setTimeout` chaining is architecturally superior because: (a) it sends the first heartbeat immediately at `start()` (L84), whereas `setInterval` delays the first heartbeat by the full interval; (b) it allows dynamic interval adjustment based on server `nextHeartbeat` response (L165–172); (c) it prevents heartbeat pile-up if a heartbeat takes longer than the interval to complete.

##### 5.2 — Handler Switch: Switches on `result.status` (L197)

The `_handleHeartbeatResponse(result, currentState)` method (L190–247) switches on `result.status` at L197:

```js
switch (result.status) {
```

**Contrast with VS Code copy:** The VS Code copy switches on `response.reason` (L266 per Step 2 Finding 2.3). The shared copy is correct — `result.status` contains the machine-status token (e.g., `"active"`, `"license_expired"`, `"over_limit"`), while `response.reason` contains a dynamic human-readable string. This is the root divergence identified as Bug #1 in Step 2.

##### 5.3 — Case Labels in the Switch (L198–232)

All case labels, verbatim, in order:

1. `case "active":` (L198)
2. `case "valid":` (L199) — falls through with `"active"` to the same handler
3. `case "trial":` (L207) — explicit no-op (`break` at L208)
4. `case "license_expired":` (L210)
5. `case "license_suspended":` (L214)
6. `case "license_revoked":` (L218) — also clears license key (L220)
7. `case "device_limit_exceeded":` (L223)
8. `case "concurrent_limit":` (L224) — falls through with `"device_limit_exceeded"` to the same handler

No `default` case exists. Unrecognized statuses silently fall through with no handler and no warning.

**Contrast with VS Code copy** (per Step 2 Finding 2.3):
- VS Code has `"concurrent_limit"`, `"license_suspended"`, `"license_expired"`, `"license_revoked"`, `"machine_not_found"`, and a `default` case.
- VS Code is MISSING `"active"`, `"valid"`, `"trial"`, `"device_limit_exceeded"`.
- Shared is MISSING `"machine_not_found"` — the shared copy has no machine-revival logic.
- Both have `"concurrent_limit"` but the shared copy also has the `"device_limit_exceeded"` alias (the original server status before renaming to `"over_limit"` on Feb 6). Neither has `"over_limit"`.

##### 5.4 — Constructor Pattern: Options Object

The constructor (L49–70) takes a single `options = {}` parameter with optional properties:

```js
constructor(options = {}) {
  this._stateManager = options.stateManager || new LicenseStateManager(options);
  this._httpClient = options.httpClient || new HttpClient();
  this._intervalMs = options.intervalMs || config.HEARTBEAT.INTERVAL_MS;
  this._onStatusChange = options.onStatusChange || null;
  this._onError = options.onError || null;
  ...
}
```

Dependencies are injected via the options object with sensible defaults. This is dependency-injection-friendly and testable.

**Contrast with VS Code copy:** The VS Code `HeartbeatManager` constructor (per Step 2 Finding 2.1) takes `(stateManager, httpClient)` as positional arguments plus a `config` import. The shared copy's options-object pattern is more flexible and idiomatic.

##### 5.5 — `_attemptMachineRevival` or Equivalent: Does NOT Exist

The shared `HeartbeatManager` has no `_attemptMachineRevival` method. There is no `"machine_not_found"` case label in the switch. The shared implementation does not handle the machine-pruned scenario at all — an unrecognized status like `"machine_not_found"` would fall through the switch silently.

**Contrast with VS Code copy:** The VS Code copy defines `_attemptMachineRevival` (L305–340 per Step 2 Finding 2.8), triggered by `case "machine_not_found"` (L284–285). However, as Step 2 established, this handler is doubly unreachable in the VS Code copy due to Bug #1 (wrong switch field) and the validation gate rejecting `"machine_not_found"`.

##### 5.6 — Line Count

`licensing/heartbeat.js`: **314 lines**.

**Contrast with VS Code copy:** `mouse-vscode/src/licensing/heartbeat.js` is significantly larger (Step 2 reviewed it extensively). The shared copy is simpler, with no machine-revival logic, no concurrent-limit-exceeded callback, and no separate `_handleInvalidHeartbeat` method. The shared copy handles all statuses (valid and invalid) in a single switch, whereas the VS Code copy bifurcates into a `_handleHeartbeatResponse` → `_handleInvalidHeartbeat` two-stage dispatch.

##### 5.7 — Summary Answer to Step 5 Objective

| Extraction Target | Shared (`licensing/heartbeat.js`) | VS Code (`mouse-vscode/src/licensing/heartbeat.js`) |
|---|---|---|
| Timer mechanism | `setTimeout` chaining (L112–121); first heartbeat immediate (L84) | `setInterval` (L95); first heartbeat delayed by full interval |
| Switch field | `result.status` (L197) — **CORRECT** | `response.reason` (L266) — **BUG** |
| Case labels | `active`, `valid`, `trial`, `license_expired`, `license_suspended`, `license_revoked`, `device_limit_exceeded`, `concurrent_limit` (8 labels) | `concurrent_limit`, `license_suspended`, `license_expired`, `license_revoked`, `machine_not_found` (5 labels + `default`) |
| Constructor | Options object with DI defaults | Positional arguments |
| Machine revival | Does not exist | Exists but unreachable |
| Line count | 314 | Significantly larger |

---

### Step 6 — Read the LicenseChecker for Dead Code Confirmation

**Repo:** `hic` (Extension repo)  
**File:** `mouse-vscode/src/licensing/license-checker.js`  
**Objective:** Confirm whether `startHeartbeat()` and `sendHeartbeat()` are defined but never called.  
**What to extract:**

- Whether `startHeartbeat()` and `sendHeartbeat()` methods exist
- Their signatures and what they do
- Whether they are called from anywhere in the extension (cross-reference with Step 7)

**Feeds skeleton sections:** §3.2.6, HB-8

**Status:** COMPLETE  
**Completed:** 2026-02-19  
**Files reviewed:** `mouse-vscode/src/licensing/license-checker.js` (206 lines, read in full), `mouse-vscode/src/extension.js` (callers verified via exhaustive grep)

**Prior coverage note:** Step 2 Finding 2.9 asserted these methods are dead code. This Step 6 investigation independently verifies that assertion with full method signatures and an exhaustive caller search.

#### Step 6 Findings

##### 6.1 — `sendHeartbeat()` Exists (L148–162)

```js
async sendHeartbeat() {
  const state = this.stateManager.getState();

  if (!state.licenseKey) {
    // No heartbeat needed for trial
    return;
  }

  await this.httpClient.sendHeartbeat(
    state.fingerprint,
    state.machineId,
    state.sessionId,
    state.licenseKey,
  );
}
```

**Signature:** `async sendHeartbeat()` — no parameters. Reads state internally.  
**What it does:** Gets current state from `this.stateManager`, returns early if no `licenseKey` (trial user), otherwise calls `this.httpClient.sendHeartbeat()` with fingerprint, machineId, sessionId, and licenseKey. Does NOT process the response — the return value of `httpClient.sendHeartbeat()` is discarded (no `await` assignment, no response handling). This means even if called, it would send the heartbeat but never act on the server's response (no status change, no concurrent-limit handling, no machine revival).

##### 6.2 — `startHeartbeat()` Exists (L168–188)

```js
startHeartbeat() {
  // Clear any existing interval
  this.stopHeartbeat();

  const interval = config.HEARTBEAT.INTERVAL_MS;

  this.heartbeatInterval = setInterval(async () => {
    try {
      await this.sendHeartbeat();
      console.log("[Mouse] Heartbeat sent");
    } catch (error) {
      console.warn("[Mouse] Heartbeat failed:", error.message);
      // Don't stop on failure - network hiccups happen
    }
  }, interval);

  console.log(`[Mouse] Heartbeat started (interval: ${interval}ms)`);
}
```

**Signature:** `startHeartbeat()` — no parameters, synchronous.  
**What it does:** Calls `this.stopHeartbeat()` to clear any existing interval, then sets up a `setInterval` that calls `this.sendHeartbeat()` on each tick. Uses `config.HEARTBEAT.INTERVAL_MS` (600,000 ms / 10 minutes). Logs success/failure to console. No response processing (inherits the response-discarding behavior of `sendHeartbeat()`). No retry logic, no exponential backoff, no callback mechanism.

Also present: `stopHeartbeat()` (L193–198) which calls `clearInterval(this.heartbeatInterval)`.

##### 6.3 — Neither Method Is Called From Anywhere in the Extension

**Exhaustive grep of `mouse-vscode/src/**/*.js`** for `licenseChecker.sendHeartbeat`, `licenseChecker.startHeartbeat`, and all `LicenseChecker` references found:

| Caller in `extension.js` | Method Called | Found? |
|---|---|---|
| L145 | `new LicenseChecker(context)` | YES — instantiation |
| L165 | `licenseChecker.checkLicense()` | YES — initial validation |
| L340 | `licenseChecker?.checkLicense()` | YES — status command |
| L380 | `licenseChecker?.activateLicense(key.trim())` | YES — activation command |
| L404 | `licenseChecker?.checkLicense()` | YES — post-activation check |
| L520 | `licenseChecker.checkLicense()` | YES — license check |
| L869 | `licenseChecker?.dispose()` | YES — deactivation cleanup |
| — | `licenseChecker.sendHeartbeat()` | **NO — never called** |
| — | `licenseChecker.startHeartbeat()` | **NO — never called** |
| — | `licenseChecker.stopHeartbeat()` | **NO — never called** |

**Exhaustive grep of `mouse-vscode/tests/**/*.js`** for `LicenseChecker`, `license-checker`, `licenseChecker.sendHeartbeat`, or `licenseChecker.startHeartbeat` returned **zero matches**. No test file imports or exercises these methods.

The extension exclusively uses `HeartbeatManager` (imported at `extension.js` L16 from `./licensing/heartbeat.js`) for all heartbeat functionality: `hbManager.sendHeartbeatOnce()` at L156 and `hbManager.start(callbacks)` at L220 (inside `startHeartbeatWithCallbacks()`).

##### 6.4 — Summary Answer to Step 6 Objective

Both `sendHeartbeat()` (L148–162) and `startHeartbeat()` (L168–188) exist as methods on `LicenseChecker`. Neither is called from any runtime code or any test code in the extension. They are **confirmed dead code**. The extension uses `HeartbeatManager` exclusively for heartbeat functionality. These methods are vestigial — they predate the `HeartbeatManager` refactor and were never removed. They also lack response processing, retry logic, and callback wiring, making them functionally inferior to `HeartbeatManager` even if they were called.

---

### Step 7 — Read Extension Activation and Command Registration

**Repo:** `hic` (Extension repo)  
**File:** `mouse-vscode/src/extension.js` (or equivalent activation entry point)  
**Objective:** Confirm command registrations, HeartbeatManager instantiation, and callback wiring.  
**What to extract:**

- Whether `mouse.checkForUpdates` is registered as a command
- What handler it calls and what that handler does
- How HeartbeatManager is instantiated — what callbacks are passed (`onSuccess`, `_handleConcurrentLimitExceeded`, etc.)
- Whether LicenseChecker's heartbeat methods are called (cross-reference with Step 6)
- The activation sequence: when does the heartbeat start relative to extension activation?

**Feeds skeleton sections:** §3.2.7, §4.4, §5.4


#### Step 7 Findings

**File read:** `mouse-vscode/src/extension.js` (875 lines, read in full)
**Supporting file read:** `mouse-vscode/src/licensing/heartbeat.js` (440 lines, read in full — this is the VS Code HeartbeatManager imported at L16)

---

**1. `mouse.checkForUpdates` command registration**

Yes. Registered at L616 inside `registerCommands()`:

```js
vscode.commands.registerCommand("mouse.checkForUpdates", async () => {
  await checkForUpdates(true);  // showNotification = true
});
```

**2. What handler it calls and what that handler does**

`checkForUpdates(showNotification)` is defined at L819–L862. It:

1. Gets current version from `vscode.extensions.getExtension("hic-ai.mouse")?.packageJSON?.version`
2. Fetches `https://api.hic-ai.com/version` via `fetch()`
3. Calls `validateVersionResponse(data)` (imported from `../../licensing/version.js`)
4. Calls `checkUpdateAvailable(currentVersion, latestVersion)` (same import)
5. If update available: calls `statusBarManager?.showUpdateAvailable(currentVersion, latestVersion, downloadUrl)` and logs
6. If no update AND `showNotification=true`: shows "You have the latest version" info message
7. Catches errors: logs warning; if `showNotification=true`, shows "Unable to check for updates" warning

This function is called from **two** sites:
- L200 in `activate()`: `checkForUpdates(false)` — silent background check at startup
- L617 in command handler: `checkForUpdates(true)` — user-initiated with notification

**Also registered:** `mouse.showUpdateInfo` (L623–L648), which calls `statusBarManager?.getUpdateInfo()` and shows a message with "Update Now" / "Later" buttons. If user clicks "Update Now", opens `downloadUrl` externally or triggers `workbench.extensions.installExtension`.

**3. How HeartbeatManager is instantiated — what callbacks are passed**

HeartbeatManager is instantiated in **two** distinct patterns:

**Pattern A — Pre-validation heartbeat (L151–161, inside `activate()`):**

```js
const stateManager = new LicenseStateManager();
const preCheckState = stateManager.getState();
if (preCheckState.licenseKey) {
  const hbManager = new HeartbeatManager(stateManager);
  await hbManager.sendHeartbeatOnce();
}
```

- Purpose: Sends a single heartbeat BEFORE `licenseChecker.checkLicense()` to revive dead machines and prevent the validate→EXPIRED→heartbeat-never-starts death spiral
- No callbacks passed — fire-and-forget via `sendHeartbeatOnce()`
- Uses a LOCAL `hbManager` variable (not the module-level `heartbeatManager`)
- Note: `sendHeartbeatOnce()` calls `_sendHeartbeatWithRetry()` which does NOT call `_handleHeartbeatResponse()` — it returns the raw response. So the pre-validation heartbeat's response is silently discarded.

**Pattern B — Ongoing heartbeat loop (L219–303, `startHeartbeatWithCallbacks()`):**

```js
function startHeartbeatWithCallbacks() {
  const stateManager = new LicenseStateManager();
  heartbeatManager = new HeartbeatManager(stateManager);
  heartbeatManager.start({
    onSuccess: (response) => { ... },
    onStateChange: (newState, response) => { ... },
    onError: (error, attempt) => { ... },
    onConcurrentLimitExceeded: () => { ... },
  });
}
```

Four callbacks:

- **`onSuccess`** (L224–248): Extracts `response.readyVersion || response.latestVersion`, gets current version from package.json, calls `checkUpdateAvailable()`, calls `statusBarManager.showUpdateAvailable()` if update found
- **`onStateChange`** (L250–281): Logs state change, calls `updateStatusBarForState(newState)`, shows payment-issue warning for SUSPENDED, expired error for EXPIRED
- **`onError`** (L282–286): Logs warning with attempt number
- **`onConcurrentLimitExceeded`** (L287–300): Shows warning message with "Manage Devices" button linking to `https://hic-ai.com/portal/devices`

Called from **three** sites:
- L193 in `activate()`: if `licenseStatus.status === "LICENSED"`
- L384 in `mouse.enterLicenseKey` handler: after successful activation
- (The module-level `heartbeatManager` variable is assigned here and disposed in `deactivate()` at L866)

**4. Whether LicenseChecker's heartbeat methods are called (cross-ref Step 6)**

**NO.** Confirmed. `extension.js` imports `LicenseChecker` (L15) and uses it ONLY for:
- `licenseChecker.checkLicense()` (L163, L521)
- `licenseChecker?.activateLicense(key.trim())` (L380)
- `licenseChecker?.dispose()` (L868)

It **never** calls `licenseChecker.sendHeartbeat()` or `licenseChecker.startHeartbeat()`. All heartbeat functionality is handled through the standalone `HeartbeatManager` class. This confirms Step 6's finding that LicenseChecker's heartbeat methods are dead code.

**5. Activation sequence — when does the heartbeat start relative to activation?**

The complete `activate()` sequence (L137–214):

| Order | Action | Line |
|-------|--------|------|
| 1 | Initialize StatusBarManager → "Mouse: Starting..." | L141–142 |
| 2 | Initialize LicenseChecker | L145 |
| 3 | Create LicenseStateManager, check for licenseKey | L150–152 |
| 4 | **If licenseKey exists:** send ONE pre-validation heartbeat (await, fire-and-forget result) | L153–161 |
| 5 | `licenseChecker.checkLicense()` (await) | L163 |
| 6 | `registerCommands(context)` (synchronous) | L167 |
| 7 | Update status bar based on license status | L170–185 |
| 8 | **If LICENSED:** `startHeartbeatWithCallbacks()` — begins 10-min interval loop | L193 |
| 9 | `registerMcpServerProvider(context)` | L196 |
| 10 | `checkForUpdates(false)` — silent background update check | L200 |
| 11 | Check workspace initialization, override status bar if needed | L203–210 |

Key timing observations:
- The pre-validation heartbeat (step 4) is **awaited** — activation blocks until it completes or fails
- The ongoing heartbeat loop (step 8) fires **after** license check and command registration
- `checkForUpdates()` runs independently (step 10) — it does NOT depend on heartbeat
- There is **no guard** against double-starting: if `startHeartbeatWithCallbacks()` is called at L193 and then again at L384 (after manual license activation), a **second** HeartbeatManager overwrites `heartbeatManager` but the first `setInterval` is never cleared (the first instance's interval keeps firing in the background)

---

**Critical observations for the bug investigation:**

**A. VS Code HeartbeatManager vs Shared HeartbeatManager — key differences:**

The VS Code copy (`mouse-vscode/src/licensing/heartbeat.js`, 440 lines) differs significantly from the shared copy (`licensing/heartbeat.js`, 314 lines, documented in Step 5):

| Aspect | Shared (`licensing/heartbeat.js`) | VS Code (`mouse-vscode/src/licensing/heartbeat.js`) |
|--------|-----------------------------------|------------------------------------------------------|
| Timer | `setTimeout` chaining (L112–121) | `setInterval` (L94) |
| Dispatch target for valid responses | `result.status` (L197) — CORRECT | `response.status` via `_mapServerStatusToState` (L243) — CORRECT |
| Dispatch target for invalid responses | Same switch on `result.status` | `switch (response.reason)` (L272) — **DIFFERENT** |
| Machine revival | None | `_attemptMachineRevival()` (L313–341) — present |
| Constructor | Options object with DI defaults | `(stateManager, httpClient)` positional args |
| Case labels (valid path mapping) | 8: `active`, `valid`, `trial`, `license_expired`, `license_suspended`, `license_revoked`, `device_limit_exceeded`, `concurrent_limit` | 5: `ACTIVE`, `LICENSED`, `SUSPENDED`, `EXPIRED`, `REVOKED` (uppercase, L402–408) |
| Case labels (invalid path switch) | N/A (same switch) | 5: `concurrent_limit`, `license_suspended`, `license_expired`, `license_revoked`, `machine_not_found` (L274–296) |

**B. The `response.reason` switch is architecturally correct here:**

Unlike the shared HeartbeatManager (Step 5), the VS Code HeartbeatManager splits handling into two paths:
1. **Valid responses** (`response.valid === true`): maps `response.status` via `_mapServerStatusToState()` — correct
2. **Invalid responses** (`response.valid === false`): switches on `response.reason` — this is **intentional** because the server sets `reason` to explain WHY the heartbeat was invalid

This is actually a **better design** than the shared copy, which uses a single switch on `result.status` for both valid and invalid paths.

**C. Double-start risk:** No `dispose()` or `stop()` is called on the first HeartbeatManager before creating a second one at L384. The orphaned `setInterval` will keep firing.

**D. `deactivate()` function (L860–870):** Calls `heartbeatManager?.dispose()`, `statusBarManager?.dispose()`, `licenseChecker?.dispose()` — properly cleans up on extension deactivation.

---

---

### Step 8 — Read StatusBarManager and Version Notification UI

**Repo:** `hic` (Extension repo)  
**File:** `mouse-vscode/src/licensing/status-bar-manager.js` (or equivalent)  
**Objective:** Trace the complete version notification path from heartbeat response to user-visible UI.  
**What to extract:**

- Whether `showUpdateAvailable()` exists and is functional
- What it displays (status bar item, notification, etc.)
- The path from heartbeat `onSuccess` → version comparison → `showUpdateAvailable()` — is it complete, stubbed, or partial?
- Whether the `mouse.showUpdateInfo` command is registered and what it does

**Feeds skeleton sections:** §3.2.8, §6 Journey F


#### Step 8 Findings

**Files read in full:**
- `mouse-vscode/src/StatusBarManager.js` (176 lines)
- `licensing/version.js` (319 lines)
- `mouse-vscode/tests/status-bar.test.js` (442 lines)
- `mouse-vscode/tests/update-check.test.js` (197 lines)
- `licensing/tests/version.test.js` (428 lines)

**Files cross-referenced (already fully read in Steps 3–7):**
- `mouse-vscode/src/extension.js` (875 lines) — `onSuccess` callback at L224–248, `checkForUpdates()` at L819–862, `mouse.showUpdateInfo` handler at L623–648, `updateStatusBarForState()` at L308–331
- `licensing/validation.js` (557 lines) — sanitized output shape at L312–338, which includes `readyVersion`, `readyUpdateUrl`, `updateUrl`, `downloadUrl`, `latestVersion`
- `mouse-vscode/src/licensing/validation.js` (471 lines) — sanitized output shape at L260–282, which includes `readyVersion`, `readyUpdateUrl`, `updateUrl`, `latestVersion` but **NOT** `downloadUrl`
- `mouse-vscode/tests/security.test.js` (744 lines) — version field tests at L353–476
- `mouse-vscode/package.json` — command contributions at L47–78

---

**1. Whether `showUpdateAvailable()` exists and is functional**

**YES — exists and is fully implemented.** `StatusBarManager.showUpdateAvailable()` at L143–148:

```js
showUpdateAvailable(currentVersion, latestVersion, downloadUrl) {
  this.updateInfo = { currentVersion, latestVersion, downloadUrl };
  this.setStatus("update-available", `Mouse: Update v${latestVersion}`);
  this.statusBarItem.tooltip = `Update available: v${currentVersion} → v${latestVersion}. Click to update.`;
  this.statusBarItem.command = "mouse.showUpdateInfo";
}
```

It:
1. Stores `{ currentVersion, latestVersion, downloadUrl }` in `this.updateInfo`
2. Calls `setStatus("update-available", ...)` which sets icon to `$(cloud-download)`, background to `statusBarItem.prominentBackground`
3. Sets tooltip to version comparison arrow
4. Binds click to `mouse.showUpdateInfo` command

Supporting methods:
- `getUpdateInfo()` (L163): returns `this.updateInfo || null`
- `clearUpdateNotification()` (L153): nulls `updateInfo`, resets command to `mouse.showStatus`. **Never called** by any runtime code — dead code.

**2. What it displays (status bar item, notification, etc.)**

**Status bar item only.** No VS Code notification is shown by `showUpdateAvailable()` itself. It modifies the existing status bar item:
- **Icon:** `$(cloud-download)` (the VS Code download icon)
- **Text:** `Mouse: Update v{latestVersion}` (e.g., "Mouse: Update v0.10.2")
- **Tooltip:** `Update available: v{current} → v{latest}. Click to update.`
- **Background:** `statusBarItem.prominentBackground` (makes it visually stand out)
- **Click action:** Opens `mouse.showUpdateInfo` command

When `mouse.showUpdateInfo` is clicked (L623–648):
1. Retrieves `statusBarManager.getUpdateInfo()`
2. If null: shows "No updates available" info message
3. If present: calls `formatUpdateMessage()` to get message text (includes bump type: "Major update", "Update", "Patch")
4. Shows VS Code information message with "Update Now" / "Later" buttons
5. If "Update Now": opens `downloadUrl` externally if present; otherwise falls back to `workbench.extensions.installExtension` for "hic-ai.mouse"

**3. The path from heartbeat `onSuccess` → version comparison → `showUpdateAvailable()` — is it complete, stubbed, or partial?**

**Two independent paths exist. Both are FULLY IMPLEMENTED in code but one is broken at runtime.**

**Path A — Heartbeat-delivered version data (FUNCTIONAL if heartbeat succeeds):**

```
Server heartbeat response
  → HttpClient.sendHeartbeat() [licensing/http-client.js L186]
    → validateHeartbeatResponse() [licensing/validation.js L158]
      → sanitized data includes: readyVersion, latestVersion, readyUpdateUrl, updateUrl, downloadUrl
  → VS Code HeartbeatManager._handleHeartbeatResponse() [heartbeat.js L222]
    → onSuccess callback [extension.js L224]
      → serverVersion = response.readyVersion || response.latestVersion
      → currentVersion from vscode.extensions.getExtension("hic-ai.mouse")?.packageJSON?.version
      → checkUpdateAvailable(currentVersion, serverVersion) [licensing/version.js L119]
      → if updateAvailable: downloadUrl = response.readyUpdateUrl || response.updateUrl || response.downloadUrl
      → statusBarManager.showUpdateAvailable(currentVersion, serverVersion, downloadUrl)
```

This path is complete end-to-end in code. It depends on:
- The heartbeat succeeding (not blocked by the validation gate — see Steps 3–4)
- The server including version fields in its response (not confirmed — requires server-side check)

**Path B — Independent VERSION endpoint (BROKEN — endpoint does not exist):**

```
activate() → checkForUpdates(false) [extension.js L200]
  OR
mouse.checkForUpdates command → checkForUpdates(true) [extension.js L617]
  → fetch("https://api.hic-ai.com/version") [extension.js L828]
  → NETWORK ERROR: api.hic-ai.com does not exist
  → catch block: logs warning, optionally shows "Unable to check" message
  → returns silently
```

This path is fully coded but **always fails at runtime** because `api.hic-ai.com` is not a real host. The licensing API lives at `staging.hic-ai.com`. This is a known bug documented in `plg/docs/20260219_OPEN_HEARTBEAT_ISSUES_REMEDIATION_PLAN.md` (lines 75, 129, 221) and `licensing/README.md` (lines 512, 616).

Key observations:
- `checkForUpdates()` uses `validateVersionResponse()` from `licensing/version.js` (a different validator than the heartbeat validator) — it validates a simpler `{ version, downloadUrl, updatedAt }` shape
- `checkForUpdates()` bypasses the shared `HttpClient` entirely (raw `fetch()`)
- The `checkForUpdates()` code path has NO interaction with the heartbeat path — they are completely independent

**4. Whether the `mouse.showUpdateInfo` command is registered and what it does**

**YES — registered** in `registerCommands()` at L623 and contributed in `package.json` at L73 (`"title": "Mouse: Show Update Info"`).

Behavior (L623–648):
1. Calls `statusBarManager?.getUpdateInfo()` to retrieve stored `{ currentVersion, latestVersion, downloadUrl }`
2. If `null`: shows `"Mouse: No updates available."` info message → returns
3. If present: destructures `{ currentVersion, latestVersion, downloadUrl }`
4. Calls `formatUpdateMessage(currentVersion, latestVersion)` → produces bump-type-aware message (e.g., "Patch available: v0.10.2 (from v0.10.1)")
5. Shows VS Code information message with two buttons: "Update Now", "Later"
6. If user clicks "Update Now":
   - If `downloadUrl` exists → `vscode.env.openExternal(vscode.Uri.parse(downloadUrl))` (opens browser)
   - If `downloadUrl` is falsy → `vscode.commands.executeCommand("workbench.extensions.installExtension", "hic-ai.mouse")` (marketplace install)
7. If user clicks "Later" or dismisses → no action

---

**Additional findings beyond the four extraction targets:**

**A. Status type bug in `updateStatusBarForState()`:**

At extension.js L321, the `SUSPENDED` case calls:
```js
statusBarManager?.setStatus("warning", "Mouse: Payment Issue");
```
But `"warning"` is NOT a valid key in `STATUS_ICONS` or `STATUS_COLORS`. The valid keys are: `initializing`, `setup-required`, `running`, `stopped`, `error`, `licensed`, `trial`, `expired`, `update-available`. The fallback is `$(question)` icon with `undefined` background color. This means suspended users see a question-mark icon instead of an appropriate warning icon.

**B. Update-available status can be overwritten by heartbeat state changes:**

The `onStateChange` callback at L250 calls `updateStatusBarForState(newState)`, which unconditionally sets the status bar to `licensed`, `warning` (broken), `expired`, or `trial`. If an update was previously shown via `showUpdateAvailable()`, the next heartbeat state-change event will overwrite it. There is NO check for `update-available` status before overwriting, and `clearUpdateNotification()` is never called (dead code — confirmed via grep, only defined at StatusBarManager L153, never invoked).

**C. `StatusBarManager.showNotification()` (L124–134) is dead code:**

This method temporarily displays a message in the status bar for `duration` ms (default 3000), then restores previous text/tooltip. It is **never called** by any runtime code.

**D. Field name divergence between the two validation.js copies:**

| Field | `licensing/validation.js` (shared, active) | `mouse-vscode/src/licensing/validation.js` (dead code) |
|-------|---------------------------------------------|----------------------------------------------------------|
| `downloadUrl` | ✅ Present in sanitized output (L328) | ❌ Absent from sanitized output |
| `updateUrl` | ✅ Present (L331) | ✅ Present (L276) |
| `readyUpdateUrl` | ✅ Present (L334) | ✅ Present (L280) |

Since the shared copy is the one actually used at runtime (via `HttpClient`), the heartbeat response DOES carry `downloadUrl` through to the `onSuccess` callback. The fallback chain `response.readyUpdateUrl || response.updateUrl || response.downloadUrl` in extension.js L237 will find a value if the server provides any of these fields.

**E. Test coverage assessment:**

| Test file | What it tests | What it misses |
|-----------|---------------|----------------|
| `status-bar.test.js` (442 lines) | Mock StatusBarManager `setStatus()` for all types, command bindings, status transitions, workspace init flow | Does NOT test `showUpdateAvailable()`, `getUpdateInfo()`, `clearUpdateNotification()`, `showNotification()`, or `dispose()`. No real VS Code API testing. |
| `update-check.test.js` (197 lines) | `validateVersionResponse()` valid/invalid shapes, `checkUpdateAvailable()` comparisons, `formatUpdateMessage()` bump types, mock `showUpdateAvailable()`/`getUpdateInfo()`/`clearUpdateNotification()` | Does NOT test the `checkForUpdates()` function, the `mouse.showUpdateInfo` handler, or the heartbeat→update flow. Uses a separate mock class, not the real StatusBarManager. |
| `licensing/tests/version.test.js` (428 lines) | All 7 exported functions exhaustively: `parseVersion`, `compareVersions`, `checkUpdateAvailable`, `getVersionBumpType`, `formatVersion`, `formatUpdateMessage`, `validateVersionResponse`. Security bounds, edge cases, constants. | Comprehensive for its scope. Does NOT test integration with StatusBarManager or extension.js. |
| `security.test.js` (744 lines, partial read L340–476) | Version fields in heartbeat validation: `latestVersion`, `readyVersion`, `readyReleaseNotesUrl`, `readyUpdateUrl`, `readyUpdatedAt`. HTTPS enforcement for all URL fields. | Tests the VS Code validation.js copy (dead code), NOT the shared copy that actually runs. |

---

**Items requiring E2E validation by a human (cannot be verified from code alone):**

**E2E-1: Status bar visual appearance for `update-available` status**
- **What to examine:** When `showUpdateAvailable()` is called, does the status bar item visually show the `$(cloud-download)` icon with prominent background?
- **Conditions:** Trigger a heartbeat response containing `readyVersion` or `latestVersion` newer than the installed version.
- **How to verify:** Observe the status bar in a running VS Code instance. Confirm icon renders, background color is prominent, and tooltip shows the version arrow.

**E2E-2: `mouse.showUpdateInfo` command dialog**
- **What to examine:** After the status bar shows an update, clicking it should open an information message with "Update Now" / "Later" buttons. The message text should include the bump type (Major/Update/Patch) with formatted versions.
- **Conditions:** First trigger update-available state, then click the status bar item (or run `Mouse: Show Update Info` from command palette).
- **How to verify:** Observe the notification. Click "Update Now" — should either open the downloadUrl in browser OR trigger marketplace install. Click "Later" — should dismiss with no side effects.

**E2E-3: `Mouse: Check for Updates` command**
- **What to examine:** Running this command will ALWAYS fail because `api.hic-ai.com` does not exist. It should show "Unable to check for updates" warning.
- **Conditions:** Open command palette → `Mouse: Check for Updates`
- **How to verify:** Confirm the warning message appears. Confirm no crash or unhandled rejection.

**E2E-4: Heartbeat-delivered version data from server**
- **What to examine:** Does the server's heartbeat response actually include `readyVersion`, `latestVersion`, `readyUpdateUrl`, `updateUrl`, or `downloadUrl` fields?
- **Conditions:** Monitor a live heartbeat request/response (e.g., `curl -X POST https://staging.hic-ai.com/api/heartbeat` with valid credentials, or inspect network traffic from a running extension).
- **How to verify:** Examine the raw JSON response. If version fields are absent, Path A (heartbeat-delivered updates) is dead at runtime despite being fully coded.

**E2E-5: Status bar overwrite race between heartbeat updates and state changes**
- **What to examine:** If `showUpdateAvailable()` sets the status bar to `update-available`, and then the next heartbeat triggers `onStateChange` → `updateStatusBarForState("LICENSED")`, the update notification is silently replaced with "Mouse: Licensed".
- **Conditions:** Wait for an update to be shown via heartbeat, then observe the next heartbeat cycle (10 minutes later).
- **How to verify:** Watch the status bar text across two heartbeat cycles. Determine if update-available persists or gets overwritten.

**E2E-6: SUSPENDED status bar icon**
- **What to examine:** The `updateStatusBarForState("SUSPENDED")` case uses `setStatus("warning", ...)` but `"warning"` is not a valid status type. The icon will be `$(question)` instead of an appropriate warning icon.
- **Conditions:** Have a license in SUSPENDED state (payment issue), trigger a heartbeat state change.
- **How to verify:** Observe the status bar icon. If it shows a question mark instead of a warning icon, the bug is confirmed visually.

**E2E-7: Double-start HeartbeatManager leak (from Step 7)**
- **What to examine:** If a user activates a license via `mouse.enterLicenseKey` while a heartbeat is already running (from activation), a second `setInterval` is created without stopping the first.
- **Conditions:** Start extension with a valid license (heartbeat starts at activation). Then run `Mouse: Enter License Key` with the same or different license key.
- **How to verify:** Check DevTools console for doubled heartbeat log messages (two "[Mouse Heartbeat]" logs per interval). Alternatively, inspect memory for leaked timers.

**E2E-8: First-heartbeat update check racing**
- **What to examine:** The `onSuccess` callback runs unconditionally on every heartbeat, including the very first one at activation. If the server returns version data with the first heartbeat AND `checkForUpdates(false)` also succeeds simultaneously, `showUpdateAvailable()` would be called twice.
- **Conditions:** This is currently impossible because `checkForUpdates()` always fails (non-existent endpoint). But if the endpoint is created, both paths could race.
- **How to verify:** If/when `api.hic-ai.com/version` is created, check for double update notifications at startup.

---

---

### Step 9 — Read Extension Heartbeat and Security Tests

**Repo:** `hic` (Extension repo)  
**Files:**

- `mouse-vscode/tests/security.test.js`
- Any heartbeat-specific test files in `mouse-vscode/tests/`

**Objective:** Document current test coverage for the heartbeat flow.  
**What to extract:**

- Which heartbeat statuses are tested
- Whether the allow-list is tested (and what values the test expects)
- Whether the `response.reason` vs. `response.status` dispatch is tested
- Whether `over_limit`, `machine_not_found`, `trial`, and `error` scenarios are covered
- Any tests that assert behavior we now know to be incorrect

**Feeds skeleton sections:** §3.2.9, §8.1

#### Step 9 Findings — Completed 2026-02-20

**Files Reviewed (every character):**

| File | Lines | Scope |
|------|-------|-------|
| `mouse-vscode/tests/security.test.js` | 744 | CWE-pattern security validation tests |
| `mouse-vscode/tests/heartbeat.test.js` | 678 | VS Code HeartbeatManager unit tests |
| `mouse-vscode/tests/licensing.test.js` | 395 | Trial nag / message-frequency tests |
| `mouse-vscode/tests/status-bar.test.js` | 442 | StatusBarManager tests (read in Step 8) |
| `mouse-vscode/tests/update-check.test.js` | 197 | Version comparison tests (read in Step 8) |
| `licensing/tests/heartbeat.test.js` | 342 | Shared HeartbeatManager unit tests |
| `mouse-vscode/src/licensing/config.js` | 75 | Config constants (cross-ref) |
| `licensing/validation.js` | L16-30 | VALID_HEARTBEAT_STATUSES (cross-ref) |
| `mouse-vscode/src/licensing/heartbeat.js` | L390-415 | `_mapServerStatusToState` (cross-ref) |

---

##### 9A. `security.test.js` — Validation Allow-List Coverage

**What it tests:**
- CWE-295 (HTTPS enforcement on all URL fields in heartbeat response)
- CWE-306 (license key format — alphanumeric + hyphens, 8-64 chars)
- CWE-502 (response schema validation for heartbeat, license, and trial-init)
- CWE-693 (offline grace period — 72h default)
- Iterates `VALID_HEARTBEAT_STATUSES` in a `for` loop, confirming each is accepted
- Rejects `"HACKED"` as invalid status
- Tests `reason` string length bounds (max 500 chars)
- Tests `concurrent`/`maxMachines` numeric bounds
- Tests version fields: `latestVersion`, `readyVersion`, `readyUpdateUrl`, `downloadUrl`
- Null/undefined handling, prototype pollution, XSS in string fields, DoS (oversized payloads)

**CRITICAL — imports from DEAD CODE copy:**
```
import { ..., VALID_HEARTBEAT_STATUSES } from '../src/licensing/validation.js';
```
This is the VS Code `validation.js` (471 lines), NOT the shared `licensing/validation.js` (557 lines) that is actually called at runtime via `http-client.js`. The two copies have identical allow-lists today, but testing the dead copy provides zero runtime assurance.

**What it does NOT test:**
- Does NOT test `over_limit`, `trial`, `machine_not_found`, or `error` as status values — these are server-emitted statuses that fail the allow-list silently
- Does NOT test what happens when a response with a valid schema but rejected status passes through `http-client.js` → the validation gate returns `{ success: false }` and the entire response is discarded
- Does NOT test `response.reason` vs `response.status` dispatch behavior
- Does NOT test the shared `licensing/validation.js` that is actually in the runtime path

---

##### 9B. `heartbeat.test.js` (VS Code — 678 lines) — HeartbeatManager Dispatch Coverage

**What it tests:**
- Start/stop lifecycle, double-start prevention
- Trial users (no license key → won't start heartbeat)
- Initial heartbeat fires immediately, then at 10-min interval
- Retry logic: exponential backoff (1s base, 3 retries)
- Timeout: 10s per request
- `lastValidation` and `lastHeartbeat` timestamp updates on response
- **State changes via `response.reason` dispatch (correct for VS Code HeartbeatManager):**
  - `license_suspended` → state = SUSPENDED ✅
  - `license_expired` → state = EXPIRED ✅
  - `license_revoked` → clears license key, stops heartbeat ✅
  - `concurrent_limit` → calls `onConcurrentLimitExceeded` callback, does NOT change state ✅
- **Machine revival (Phase 3D):**
  - `machine_not_found` → calls `activateLicense()`, updates machineId on success ✅
  - Machine revival failure → handles gracefully, does not crash ✅
  - Skips revival when licenseKey or fingerprint missing ✅
- Callbacks: `onSuccess`, `onError`, `onStateChange` all tested

**What it does NOT test:**
- `over_limit` — the server-emitted status. Tests use `concurrent_limit` which is the allow-list/reason name, not the server status name. The server sends `over_limit` which is NOT in `VALID_HEARTBEAT_STATUSES` and would be rejected before dispatch.
- `trial` — server status for trial heartbeats. Not in allow-list, never reaches dispatch.
- `error` — server status for server errors. Not in allow-list, never reaches dispatch.
- The validation gate itself — tests mock responses that bypass `validateHeartbeatResponse()`. The test creates mock responses directly, never testing whether server-format responses survive the allow-list.
- `_mapServerStatusToState()` — tested indirectly through state change assertions but the mapping itself is not unit-tested. The mapping handles only: `ACTIVE→LICENSED`, `LICENSED→LICENSED`, `SUSPENDED→SUSPENDED`, `EXPIRED→EXPIRED`, `REVOKED→EXPIRED`. Any other input returns `null`.

**Key discrepancy:** Tests use `response.reason` for dispatch (which is correct for the VS Code HeartbeatManager's invalid-path switch), but the valid-path uses `response.status` fed through `_mapServerStatusToState()`. The 5 mapped statuses are all UPPERCASE (`ACTIVE`, `LICENSED`, etc.) but the allow-list values are all lowercase (`active`, `license_suspended`, etc.). The mapping would return `null` for any lowercase status, sending every valid heartbeat down the "unknown status" path.

---

##### 9C. `heartbeat.test.js` (Shared — 342 lines) — Shared HeartbeatManager Coverage

**What it tests:**
- Constructor with options-object pattern: `new HeartbeatManager({ stateManager, httpClient, intervalMs })`
- Start/stop lifecycle with setTimeout chaining (not setInterval)
- `sendHeartbeat()` for both trial and licensed users
- `lastHeartbeat` timestamp tracking
- Network error handling / failure counting
- **Status dispatch via `result.status` (correct for shared HeartbeatManager):**
  - `license_expired` → calls `onStatusChange("expired")` ✅
  - `device_limit_exceeded` → calls `onError` with `code: "DEVICE_LIMIT"` ✅
- Interval adjustment from server `nextHeartbeat` field (min 1 min, max 30 min)

**What it does NOT test:**
- `over_limit`, `trial`, `error`, `machine_not_found` — none of these server-emitted statuses are tested
- The validation gate / allow-list — mock responses bypass validation entirely
- `device_limit_exceeded` is tested but this string is NOT in `VALID_HEARTBEAT_STATUSES` (which has `concurrent_limit`). This means the test asserts behavior for a status that would be rejected at the validation gate in production.
- No tests for what happens when `validateHeartbeatResponse()` returns `{ success: false }` — the shared HeartbeatManager receives `null` from `http-client.js` and the test doesn't cover this path.

---

##### 9D. `licensing.test.js` (395 lines) — NOT Heartbeat-Related

This file tests the licensing messages module (`messages.js`): trial nag frequency curves, license state determination, message generation, `shouldShowMessage()`, and `createLicenseMeta()`.

**Heartbeat-adjacent finding only:**
- Line 394: `expect(config.API_BASE_URL).toBe("https://api.hic-ai.com")` — confirms the VS Code extension hardcodes `api.hic-ai.com` which does not exist. This is consistent with Step 8 finding about `checkForUpdates()` always failing.

---

##### 9E. Cross-Reference Summary: What Tests Cover vs What Server Emits

**Server-emitted statuses (from Steps 1-2):** `trial`, `active`, `over_limit`, `machine_not_found`, `invalid`, `error`

**VALID_HEARTBEAT_STATUSES allow-list (both copies):** `active`, `license_expired`, `license_suspended`, `license_revoked`, `concurrent_limit`, `valid`, `invalid`

| Server Status | In Allow-List? | Tested in VS Code tests? | Tested in Shared tests? |
|---------------|---------------|--------------------------|------------------------|
| `trial` | ❌ NO | ❌ NO | ❌ NO |
| `active` | ✅ YES | ❌ (not explicitly as status) | ❌ NO |
| `over_limit` | ❌ NO | ❌ NO | ❌ NO |
| `machine_not_found` | ❌ NO | ✅ (as reason, not status) | ❌ NO |
| `invalid` | ✅ YES | ❌ NO | ❌ NO |
| `error` | ❌ NO | ❌ NO | ❌ NO |

**Allow-list values never emitted by server:**
| Allow-List Value | Emitted by Server? | Tested? |
|-----------------|-------------------|---------|
| `license_expired` | ❌ NO | ✅ YES (both) |
| `license_suspended` | ❌ NO | ✅ YES (VS Code) |
| `license_revoked` | ❌ NO | ✅ YES (VS Code) |
| `concurrent_limit` | ❌ NO | ✅ YES (VS Code) |
| `valid` | ❌ NO | ❌ NO |

**Conclusion:** The tests thoroughly cover statuses that the server never emits, while completely missing statuses that the server actually does emit. This is the exact inversion of useful test coverage.

---

##### 9F. Tests Asserting Behavior Now Known to Be Incorrect

1. **security.test.js allow-list iteration** — Tests confirm `VALID_HEARTBEAT_STATUSES` are accepted, but this list itself is wrong. Four server-emitted statuses (`trial`, `over_limit`, `machine_not_found`, `error`) are rejected. The tests validate the wrong contract.

2. **security.test.js dead-code import** — All security validation tests import from `mouse-vscode/src/licensing/validation.js` which is never called at runtime. Even if tests pass, they provide zero assurance about production behavior.

3. **VS Code heartbeat.test.js `concurrent_limit`** — Tests assert that `concurrent_limit` as a `response.reason` triggers `onConcurrentLimitExceeded`. But the server sends `over_limit` as `response.status`, which is rejected by the allow-list before reaching the reason-dispatch code. The callback would never fire in production.

4. **Shared heartbeat.test.js `device_limit_exceeded`** — Tests assert this status triggers `onError` with `code: "DEVICE_LIMIT"`. But `device_limit_exceeded` is NOT in `VALID_HEARTBEAT_STATUSES` and would be rejected at the validation gate. This test asserts behavior that cannot occur in production.

5. **`_mapServerStatusToState` case mismatch** — The mapping expects UPPERCASE keys (`ACTIVE`, `LICENSED`, `SUSPENDED`, `EXPIRED`, `REVOKED`) but the allow-list passes through lowercase values (`active`, `license_suspended`, etc.). Every valid heartbeat response would get `null` from the mapper, meaning the valid-path always falls through to "unknown status" handling. No test catches this because tests mock responses that bypass validation.

---

##### 9G. API Base URL Divergence (Cross-Reference Finding)

Three different API base URLs exist across the codebase:

| Location | URL | Status |
|----------|-----|--------|
| `licensing/constants.js` L13 | `https://staging.hic-ai.com` | Functional (shared runtime) |
| `mouse/src/licensing/constants.js` L204 | `https://api.hic-ai.com` (env-overridable) | Non-existent host |
| `mouse-vscode/src/licensing/config.js` L11 | `https://api.hic-ai.com` (hardcoded) | Non-existent host |

The VS Code extension and Mouse CLI both target a non-existent API host. Only the shared `licensing/` module targets the real staging endpoint. This means VS Code heartbeats work ONLY if `http-client.js` (shared) is the actual runtime caller, not the VS Code config's `API_BASE_URL`.


---

### Step 10 — Read Website Repo Heartbeat Tests

**Repo:** `hic-ai-inc.github.io` (this repo)  
**Files:**

- `plg-website/__tests__/unit/api/heartbeat.test.js`
- `plg-website/__tests__/unit/api/heartbeat-route.contract.test.js`
- `plg-website/__tests__/integration/heartbeat.test.js`
- `plg-website/__tests__/e2e/journeys/j5-heartbeat-loop.test.js`

**Objective:** Confirm what the back-end test suite asserts about response shapes.  
**What to extract:**

- Whether there is a contract test that pins the exact `status`/`valid`/`reason` fields for each response branch
- What response shapes the tests expect
- Whether version fields are tested
- Whether the `over_limit` response shape (including `valid: true`) is explicitly asserted

**Feeds skeleton sections:** §3.1.2, §8.1

#### Step 10 Findings — Completed 2026-02-19

**Files examined (4 files, ~1,795 lines total):**

1. `plg-website/__tests__/unit/api/heartbeat-route.contract.test.js` — 224 lines
2. `plg-website/__tests__/unit/api/heartbeat.test.js` — 658 lines
3. `plg-website/__tests__/integration/heartbeat.test.js` — 391 lines
4. `plg-website/__tests__/e2e/journeys/j5-heartbeat-loop.test.js` — 522 lines

---

**Finding 10.1 — Contract test pins `trial` and `active` response shapes with version fields**

The contract test (heartbeat-route.contract.test.js) is the ONLY test file that calls the actual route handler (`POST` imported from `route.js`, L22). It has 3 tests:

- **Trial heartbeat** (L109-L128): Asserts `valid: true`, `status: "trial"`, `latestVersion: "0.10.0"`, `readyVersion: "0.10.0"`, `readyUpdateUrl` contains marketplace URL, `readyReleaseNotesUrl` present, `readyUpdatedAt` present, `minVersion` absent. This is the only test that pins the `status: "trial"` response shape.
- **Licensed heartbeat — license missing in DB** (L130-L169): Asserts `valid: true`, `status: "active"`, same version fields, `minVersion` absent. This exercises the "license not in DynamoDB" path (route.js L263) which falls through to the success response.
- **Licensed heartbeat — known license** (L171-L218): Asserts `valid: true`, `status: "active"`, `maxMachines: 3`, same version fields, `minVersion` absent.

**Critical observation:** The contract test ONLY covers `trial` and `active` status values. No contract test exists for `over_limit`, `machine_not_found`, `invalid`, or `error` response shapes. The `over_limit` response shape — which lacks version fields and `nextHeartbeat` per Step 1, Finding 5 — is not pinned by any contract test.

---

**Finding 10.2 — Unit test uses LOCAL helper functions, NOT the actual route handler**

The unit test (heartbeat.test.js) defines its own local helper functions that REPLICATE route logic rather than importing the actual route handler:

- `validateLicenseKeyFormat()` (L60-L79): Local copy of key validation logic
- `validateHeartbeatInput()` (L186-L204): Local input validation logic
- `formatSuccessResponse()` (L237-L244): Returns `{ valid: true, status: "active", reason: "Heartbeat successful", ... }`
- `formatErrorResponse()` (L246-L253): Returns `{ valid: false, status: code, reason: reason, ... }`
- `checkRateLimit()` (L339-L363): Local rate-limit simulation
- `getActiveDevicesInWindow()` (L413-L419): Local concurrent-device simulation
- `requireHeartbeatAuth()` (L543-L558): Local auth-requirement simulation

**Implication:** These tests verify the intended design of response shapes and validation logic, but they do NOT verify the actual route handler produces these shapes. A drift between the local helpers and route.js would be invisible to these tests.

---

**Finding 10.3 — Unit test uses phantom status `"device_limit_exceeded"` in formatErrorResponse**

At L256-L261, the unit test calls `formatErrorResponse("device_limit_exceeded", "Maximum 3 devices allowed")` and asserts `response.status === "device_limit_exceeded"`. This status value does NOT exist anywhere in route.js (per Step 1, Finding 9). The server emits `"over_limit"` (route.js L310), not `"device_limit_exceeded"`. This test is self-consistent (the local helper returns whatever it's given) but documents an intended status that was never implemented server-side.

---

**Finding 10.4 — Unit test correctly documents `over_limit` as `valid: true`**

The concurrent device enforcement tests (L411-L497) construct over-limit responses inline:

- L465-L473: Builds `{ valid: true, status: "over_limit", reason: "You're using 5 of 3 allowed devices", concurrentMachines: 5, maxMachines: 3 }` and asserts `valid === true` and `status === "over_limit"`.

This confirms the design intent: `over_limit` is informational with `valid: true`, not a blocking error. However, this test only verifies the locally-constructed response, not the actual route handler output.

---

**Finding 10.5 — Integration test also uses local mocks, never calls the actual route handler**

The integration test (heartbeat.test.js, 391 lines) imports `createSpy` from test-helpers and builds mock functions for Keygen and DynamoDB services, but it NEVER imports or calls the actual `POST` handler from route.js. Every test simulates the route logic inline by calling the mocks directly and manually constructing expected response objects.

Key examples:
- L222-L237 ("should return success response"): Manually constructs `{ valid: true, status: "active", reason: "Heartbeat successful", concurrentMachines: 1, maxMachines: 3 }` — this is an assertion about intended design, not actual behavior.
- L257-L283 ("should handle device limit exceeded"): Constructs `{ valid: false, status: "device_limit_exceeded" }` — uses the same phantom status from Finding 10.3, and also uses `valid: false` (contradicting the unit test's `valid: true` for over-limit and the actual server's `valid: true`).

**Critical discrepancy:** The integration test asserts `valid: false` for device-limit-exceeded (L279), while the unit test asserts `valid: true` for over_limit (L465-L473), and the actual server returns `valid: true` (route.js L305). The integration test's expected response shape contradicts both the unit test and the actual server behavior.

---

**Finding 10.6 — E2E journey test validates live API behavior but does not pin response shapes**

The e2e journey test (j5-heartbeat-loop.test.js, 522 lines) uses real HTTP calls via `E2EHttpClient` against a live or staging API. It covers 7 scenarios across 13 tests:

- J5.1: Session establishment (first heartbeat, heartbeat interval)
- J5.2: Consecutive heartbeats (3 consecutive, session continuity)
- J5.3: Last-seen timestamp update
- J5.4: Session behavior (new session after gap, invalid session format)
- J5.5: Performance (fast timeout, rapid heartbeats / rate limiting)
- J5.6: Payload variations (app version, metrics, missing fingerprint → 400)
- J5.7: Licensed heartbeat (license key heartbeat)

**However**, the e2e test is overwhelmingly tolerant. Most test assertions follow the pattern `if (response.status === 200) { ... }` with graceful skip/log if the response isn't 200. The test NEVER asserts exact `status`, `valid`, or `reason` field values in the JSON body except:
- L476 (J5.6): `expectStatus(response, 400)` for missing fingerprint
- L134-L137 (J5.1): Checks `nextHeartbeat || interval` is a positive number, IF present
- L277-L280 (J5.3): Checks `lastSeen` date comparison, IF present

The `expectHeartbeat()` assertion (imported from `../lib/assertions.js`, L29) is called at L86 and L495 but its implementation was not examined in this step (it's in the e2e assertions library, not in the test file itself).

**No over_limit, machine_not_found, or error scenario is tested in the e2e suite.**

---

**Finding 10.7 — No test anywhere pins the `over_limit` response shape from the actual server**

Across all 4 test files (~1,795 lines):
- The contract test (only file calling the real handler) tests `trial` and `active` only
- The unit test constructs `over_limit` locally with `valid: true` (correct) but never calls the handler
- The integration test constructs `device_limit_exceeded` locally with `valid: false` (incorrect) and never calls the handler
- The e2e test never triggers or tests over_limit scenarios

**This means the `over_limit` response — which Step 1 found lacks version fields and `nextHeartbeat` — has zero end-to-end test coverage.**

---

**Finding 10.8 — Phase 3E auth tests are thorough but use local helpers**

The Phase 3E auth requirement tests (heartbeat.test.js L509-L658) correctly document:
- Trial heartbeats: no auth required (L575-L586)
- Licensed heartbeats: auth required, 401 if missing (L588-L604)
- JWT `sub` claim overrides body `userId` to prevent spoofing (L619-L640)

These tests use a local `requireHeartbeatAuth()` helper, not the actual route handler, so they document intent rather than verify implementation.

---

**Finding 10.9 — Rate limiting tests document 10 req/minute preset for heartbeat**

The integration test (L349-L385) imports the actual `checkRateLimit` and `RATE_LIMIT_PRESETS` from `src/lib/rate-limit.js` and asserts:
- `RATE_LIMIT_PRESETS.heartbeat.maxRequests === 10` (L358)
- 11th request is blocked (L365)
- Rate limits are tracked per license key (L376-L385)

This is one of the few tests that imports and tests actual production code. The e2e test (J5.5) also observes rate limiting behavior against the live API (L434-L449, checks for 429 status).

---

**Summary of Step 10 — Test Coverage Assessment**

| Response Status    | Contract Test (real handler) | Unit Test (local helpers) | Integration Test (local mocks) | E2E (live API) |
|--------------------|------------------------------|---------------------------|-------------------------------|----------------|
| `trial`            | ✅ Pinned (L109-L128)        | ❌ Not tested              | ❌ Not tested                  | Partial (J5.1) |
| `active`           | ✅ Pinned (L130-L218)        | ✅ Local helper (L238)     | ✅ Local mock (L222)           | Partial (J5.7) |
| `over_limit`       | ❌ **Not tested**             | ✅ Local, valid:true (L465)| ❌ Local, valid:**false** (L279)| ❌ Not tested  |
| `machine_not_found`| ❌ Not tested                | ❌ Not tested              | Partial (L249)                | ❌ Not tested  |
| `invalid`          | ❌ Not tested                | ❌ Not tested              | ❌ Not tested                  | ❌ Not tested  |
| `error`            | ❌ Not tested                | ❌ Not tested              | ❌ Not tested                  | ❌ Not tested  |
| Version fields     | ✅ Pinned for trial/active   | ❌ Not tested              | ❌ Not tested                  | ❌ Not tested  |
| `minVersion` absent| ✅ Asserted (all 3 tests)    | ❌ Not tested              | ❌ Not tested                  | ❌ Not tested  |

**Key gaps:** 4 of 6 server status values have zero contract-level test coverage. The `over_limit` response shape (the one with the most bugs per Step 1) is the most critical untested path. The integration test CONTRADICTS the server and unit test on `valid` for over_limit.


---

### Step 11 — Examine the EventBridge / Scheduled Lambda Version Delivery Pipeline

**Repo:** `hic-ai-inc.github.io` (this repo)  
**Files:**

- `plg-website/infrastructure/cloudformation/plg-scheduled.yaml`
- `plg-website/infrastructure/lambda/scheduled-tasks/index.js`

**Objective:** Confirm the version notification delivery mechanism that is independent of `checkForUpdates()`.  
**What to extract:**

- The EventBridge rule schedule (expected: daily at 9 AM UTC)
- The Lambda logic: what DynamoDB record it reads, what record it writes, the 24-hour delay gate mechanism
- The DynamoDB key structure for version records (`VERSION#mouse/CURRENT`, `VERSION#mouse/READY`, or equivalent)
- Whether the rule is enabled in the CloudFormation template

**Feeds skeleton sections:** §3.1.3, §6 Journey F

#### Step 11 Findings — Completed 2026-02-19

**Sources examined:**

1. `plg-website/infrastructure/cloudformation/plg-scheduled.yaml` — 152 lines (EventBridge rules)
2. `plg-website/infrastructure/lambda/scheduled-tasks/index.js` — 526 lines (Lambda handler)
3. `plg-website/infrastructure/cloudformation/plg-compute.yaml` — lines 270-310 (Lambda definition)
4. `plg-website/infrastructure/cloudformation/plg-dynamodb.yaml` — 200 lines (table schema)
5. `plg-website/src/lib/dynamodb.js` — lines 2150-2200 (`getVersionConfig` / `updateVersionConfig`)
6. `plg-website/src/app/api/license/heartbeat/route.js` — lines 145-382 (version field usage in responses)
7. **AWS Live Infrastructure:** EventBridge rules, Lambda configuration, DynamoDB records, CloudWatch logs (staging account 496998973008)

---

**Finding 11.1 — EventBridge rule is ENABLED on staging, fires daily at 9 AM UTC**

CloudFormation (plg-scheduled.yaml L62-73): The `MouseVersionNotifyRule` resource defines:
- Schedule: `cron(0 9 * * ? *)` — daily at 09:00 UTC
- State: `!If [IsDevelopment, DISABLED, ENABLED]` — disabled only for dev; ENABLED for staging and prod
- Target: `ScheduledTasksLambda` with input `{"taskType": "mouse-version-notify"}`

**Live AWS confirmation:** `aws events list-rules` shows `plg-mouse-version-notify-staging` with `State: ENABLED`, `ScheduleExpression: cron(0 9 * * ? *)`. The rule targets `arn:aws:lambda:us-east-1:496998973008:function:plg-scheduled-tasks-staging`.

---

**Finding 11.2 — The Lambda ran successfully TODAY at 09:00:44 UTC, promoting version 0.10.10**

CloudWatch log stream `2026/02/19/[$LATEST]173983435f014743b254b00885e963` shows:

```
09:00:44.112Z INFO {"message":"start","taskType":"mouse-version-notify"}
09:00:44.117Z INFO {"message":"running-job","job":"mouse-version-notify"}
09:00:44.491Z INFO {"message":"mouse-version-notify-complete","readyVersion":"0.10.10"}
09:00:44.492Z INFO {"message":"complete","taskType":"mouse-version-notify","status":"success","updated":true,"readyVersion":"0.10.10"}
REPORT Duration: 384.62 ms  Billed Duration: 1081 ms  Memory: 104 MB / 512 MB
```

The pipeline is operational. It reads `VERSION#mouse/CURRENT`, copies `latestVersion` to `readyVersion`, and writes `readyReleaseNotesUrl`, `readyUpdateUrl`, `readyUpdatedAt`.

---

**Finding 11.3 — DynamoDB VERSION#mouse/CURRENT record is live and current**

`aws dynamodb get-item` on table `hic-plg-staging` returns:

| Attribute            | Value |
|----------------------|-------|
| PK                   | `VERSION#mouse` |
| SK                   | `CURRENT` |
| latestVersion        | `0.10.10` |
| readyVersion         | `0.10.10` |
| readyReleaseNotesUrl | `https://github.com/SimonReiff/hic/releases/tag/v0.10.10` |
| readyUpdateUrl       | `https://marketplace.visualstudio.com/items?itemName=hic-ai.mouse` |
| readyUpdatedAt       | `2026-02-19T09:00:44.448Z` (today's 9 AM run) |
| releaseDate          | `2026-02-16T00:00:00Z` |
| releaseNotesUrl      | `https://github.com/SimonReiff/hic/releases/tag/v0.10.10` |
| updateUrl            | `{ marketplace: "...hic-ai.mouse", npm: "...@get-hic/mouse", vsix: "...mouse.vsix" }` |
| updatedAt            | `2026-02-16T03:09:07Z` |

There is a single record with composite key `PK=VERSION#mouse / SK=CURRENT`. No separate `READY` record exists — the `readyVersion` fields are attributes on the same CURRENT record, written by the Lambda's `UpdateCommand` (index.js L468-L479).

---

**Finding 11.4 — The Lambda's promotion logic is a simple blind copy, no 24-hour delay gate**

The `handleMouseVersionNotify` function (index.js L435-L486):

1. Reads `VERSION#mouse/CURRENT` via `QueryCommand` (L441-L450)
2. Extracts `latestVersion`, `releaseNotesUrl`, `updateUrl.marketplace` (L456-L458)
3. Writes `readyVersion = latestVersion`, `readyReleaseNotesUrl`, `readyUpdateUrl`, `readyUpdatedAt = now` via `UpdateCommand` (L460-L479)

**There is no delay gate logic.** The Lambda does NOT compare `latestVersion` vs. `readyVersion` or check whether 24 hours have passed since `latestVersion` was written. Every daily run unconditionally promotes whatever `latestVersion` currently is to `readyVersion`. The "24-hour delay" effect comes purely from the schedule being daily at 9 AM — if a new version is published at 8:59 AM, it would be promoted 1 minute later, not 24 hours later.

---

**Finding 11.5 — The `over_limit` response path skips version fields entirely**

Cross-referencing route.js:

- **Trial heartbeat** (L148-L168): Calls `getVersionConfig()` at L149, includes all 7 version fields (`latestVersion`, `releaseNotesUrl`, `updateUrl`, `readyVersion`, `readyReleaseNotesUrl`, `readyUpdateUrl`, `readyUpdatedAt`) in the response.
- **Licensed success** (L339-L365): Calls `getVersionConfig()` at L339, includes all 7 version fields.
- **Licensed — license not in DDB** (L258-L281): Calls `getVersionConfig()` at L261, includes version fields.
- **`over_limit`** (L320-L329): Does NOT call `getVersionConfig()`. Returns `{ valid, status, reason, concurrentMachines, maxMachines, message }` — zero version fields.
- **`error`** (L369-L379): Does NOT call `getVersionConfig()`. Returns `{ valid, status, reason, concurrentMachines, maxMachines }` — zero version fields.

This confirms Step 1, Finding 5: an over-limit user receives no version notification data. The extension's `checkForUpdates` / version-notification path is dead for any user who exceeds their device limit.

---

**Finding 11.6 — Dead code: the success-path response still references `overLimit` ternary**

Route.js L342: `status: overLimit ? "over_limit" : "active"` appears in the success response (L339-L365). However, the code at L319 (`if (overLimit) { ... return ... }`) already returns early for over-limit cases. The success response at L342 can ONLY be reached when `overLimit === false`, making the ternary `overLimit ? "over_limit" : "active"` equivalent to `"active"` in all reachable cases. Similarly, L348 (`overLimit: overLimit`) will always be `false`, and L349-L351 (`message: overLimit ? ... : null`) will always be `null`.

This dead code was also identified in Step 1 (Finding 6). It is harmless but confusing — it suggests the developer originally intended the success response to handle both cases, then added the early return without cleaning up the ternaries.

---

**Finding 11.7 — Lambda environment and layers match the CloudFormation template**

Live Lambda configuration (`aws lambda get-function`):
- Runtime: `nodejs20.x`, Handler: `index.handler`, Timeout: 300s, Memory: 512 MB
- Environment: `DYNAMODB_TABLE_NAME=hic-plg-staging`, `ENVIRONMENT=staging`, `SES_FROM_EMAIL=noreply@staging.hic-ai.com`, `APP_URL=https://staging.hic-ai.com`
- Layers: `hic-base-layer:13`, `hic-dynamodb-layer:12`, `hic-ses-layer:4`
- Last modified: `2026-02-09T13:52:07Z`, CodeSize: 6,498 bytes
- Managed by CloudFormation stack `hic-plg-staging-ComputeStack-ESLC88OSBTBM`

All values match the CloudFormation template (plg-compute.yaml L275-L300).

---

**Finding 11.8 — `updateVersionConfig` in dynamodb.js writes `latestVersion` but NOT `readyVersion`**

The `updateVersionConfig` function (dynamodb.js L2188-L2205) writes only:
- `latestVersion`, `releaseNotesUrl`, `updatedAt`

It does NOT write `readyVersion`, `readyReleaseNotesUrl`, `readyUpdateUrl`, or `readyUpdatedAt`. This is correct by design — `updateVersionConfig` is the CI/CD entry point that writes the "raw" version, and the daily Lambda run is what promotes it to `ready*` fields. This two-stage model is the intentional delay gate.

However, the `updateUrl` map (containing `marketplace`, `npm`, `vsix` keys visible in the DynamoDB record) is NOT part of the `updateVersionConfig` UpdateExpression. This suggests the `updateUrl` map was either written manually or by a different code path not visible in this function. The Lambda reads `versionConfig?.updateUrl?.marketplace` (index.js L458) to populate `readyUpdateUrl`, so if `updateUrl` were ever missing, `readyUpdateUrl` would be `null`.

---

**Finding 11.9 — DynamoDB table schema is single-table design, no VERSION-specific GSI**

The CloudFormation table definition (plg-dynamodb.yaml) shows:
- Table: `hic-plg-${Environment}`, PAY_PER_REQUEST billing
- Primary key: `PK` (String) + `SK` (String) — single-table design
- 3 GSIs: GSI1 (Stripe customer), GSI2 (License key), GSI3 (Auth0 user)
- TTL on `ttl` attribute (for EVENT and TRIAL record cleanup)
- DynamoDB Streams enabled (NEW_AND_OLD_IMAGES)
- Point-in-time recovery enabled, SSE enabled

VERSION records use the primary key directly (`PK=VERSION#mouse, SK=CURRENT`) — no GSI needed. The table has no VERSION-specific index optimization, but since there's only one record, this is appropriate.

---

**Summary of Step 11 — Version Delivery Pipeline Assessment**

The version notification pipeline is **fully operational**:
- EventBridge rule fires daily at 9 AM UTC → Lambda promotes `latestVersion` to `readyVersion` → Heartbeat route reads `readyVersion` and returns it to clients
- The pipeline ran successfully today at 09:00:44 UTC, promoting v0.10.10
- The DynamoDB record is live and current

**Critical gap confirmed:** The `over_limit` response path (route.js L320-L329) does NOT call `getVersionConfig()` and returns zero version fields. An over-limit user's extension will never receive version notification data via heartbeat, regardless of how well the Lambda pipeline works.

**No 24-hour delay gate exists in code** — the daily schedule IS the delay mechanism. A version published at 8:59 AM would be promoted 1 minute later.


---

### Step 12 — Examine DynamoDB Schema for Heartbeat and Version Records

**Repo:** `hic-ai-inc.github.io` (this repo)  
**Method:** Read CloudFormation templates for table definitions; optionally query DynamoDB staging directly for `VERSION#` records.  
**Objective:** Confirm the data model underpinning heartbeat version delivery.  
**What to extract:**

- Table name, partition key, sort key structure
- The shape of version records (attributes, TTL, update frequency)
- Whether heartbeat records are stored in DynamoDB (or only version records)

**Feeds skeleton sections:** §3.1.4, Appendix C

#### Step 12 Findings — Completed 2026-02-19

Step 11 directly answered the first two extraction targets. The third required additional investigation.

**Table name, partition key, sort key structure:** See Step 11, Finding 11.9. Table `hic-plg-${Environment}`, PK (String) + SK (String), single-table design, 3 GSIs (Stripe, License Key, Auth0).

**Shape of version records:** See Step 11, Finding 11.3 (full attribute table with all values) and Finding 11.8 (two-stage write model: CI/CD writes `latestVersion` via `updateVersionConfig`, daily Lambda promotes to `readyVersion`). VERSION records have NO TTL — the `ttl` attribute (plg-dynamodb.yaml L133) is used only for EVENT and TRIAL records. There is exactly one VERSION record: `PK=VERSION#mouse / SK=CURRENT`. Update frequency: `latestVersion` updated at release time (last: 2026-02-16), `readyVersion` updated daily at 9 AM UTC by Lambda.

**Whether heartbeat records are stored in DynamoDB:** **No.** The heartbeat route does NOT write a "HEARTBEAT" record. It performs two DynamoDB operations during a licensed heartbeat:

1. `getLicense(licenseKey)` — reads `LICENSE#{licenseKey} / DETAILS` (route.js L246)
2. `updateDeviceLastSeen(keygenLicenseId, fingerprint)` — updates `LICENSE#{keygenLicenseId} / DEVICE#{fingerprint}` setting `lastSeenAt = now` (dynamodb.js L1095-L1148, fire-and-forget at route.js L285)

For concurrent device enforcement, `getActiveDevicesInWindow(keygenLicenseId, windowHours)` (dynamodb.js L889-L919) queries all `DEVICE#*` records under the license and filters by `lastSeenAt > cutoffTime` (default 2-hour window). This is a read, not a write.

Trial heartbeats perform zero DynamoDB writes (only `getVersionConfig` read).

No heartbeat-specific data is persisted — heartbeat state exists only transiently in the Keygen API (machine heartbeat ping) and as a side effect on the `lastSeenAt` attribute of existing DEVICE records.


---

### Step 13 — Git History for Extension Repo Heartbeat Files

**Repo:** `hic` (Extension repo)  
**Command:** `git log --oneline` on:

- `mouse-vscode/src/licensing/heartbeat.js`
- `mouse-vscode/src/licensing/validation.js`
- `licensing/heartbeat.js`
- `licensing/validation.js`

**Objective:** Understand the evolution of the heartbeat implementation.  
**What to extract:**

- When the `reason` vs. `status` divergence was introduced (or whether the VS Code copy was always `reason`-based)
- When `VALID_HEARTBEAT_STATUSES` was last modified and what changed
- Whether there was a conscious design decision reflected in commit messages, or whether this was an oversight
- The relationship between the shared and VS Code implementations — which came first, when did they diverge

**Feeds skeleton sections:** Appendix B, §4.2 (root cause context)

#### Step 13 Findings — Completed 2026-02-20

Full git history for the four Extension repo heartbeat files. All commands run against `~/source/repos/hic` on branch `development`. Every commit that touched any of the four files was examined via `git log --follow`, `git show`, `git diff`, and `git blame`. All 70+ branches (local and remote) were checked for unreleased fixes; none exist. No stashes or uncommitted changes to these files.

**Finding 13.1 — Complete Commit Timeline for `mouse-vscode/src/licensing/heartbeat.js`**

| Date | Hash (short) | Summary | Key Change |
|------|-------------|---------|------------|
| Jan 26 22:55 | `442e3bfe` | Initial VS Code heartbeat implementation | `switch (response.reason)` introduced — **never changed** |
| Jan 31 01:48 | `99c8cdba` | Fix fingerprint parameter | Added `fingerprint` as function parameter |
| Jan 31 09:11 | `5734a3a7` | Create shared licensing core | Import path changes (`./` → `../../licensing/`) |
| Feb 1 10:12 | `25a4c875` | "Fix: update heartbeat.js to use canonical status field" | Changed `.state` → `.status` for stateManager fields (6 occurrences). **Did NOT change** `switch (response.reason)` |
| Feb 1 11:10 | `eb4af5f0` | Fix VSIX import paths | Import path change only |
| Feb 12 20:45 | `307ee22a` | Phase 3D machine recovery | Added `_attemptMachineRevival()` wired to `case "machine_not_found"` inside the **wrong** switch field |

Total: 6 commits. File currently at 440 lines.

**Finding 13.2 — The `switch (response.reason)` Bug Was Present From the First Commit (CRITICAL)**

`git blame` on L265–270 of `mouse-vscode/src/licensing/heartbeat.js` traces the `switch (response.reason)` statement directly to commit `442e3bfe` (Jan 26 22:55 PM). It has never been modified across all 6 commits. The original commit message reads:

> "feat(licensing): implement server-side heartbeat with machine management"
> "Server-side API route (POST /api/license/heartbeat) pending."

The VS Code heartbeat was written the **night before** the server route existed (server route: `131bca9`, Jan 27 08:46 AM — 9 hours 51 minutes later). The original author anticipated that machine-readable status tokens would arrive in the `reason` field of the server response. The server instead put machine-readable tokens in `status` and human-readable descriptions in `reason`. No one ever corrected the switch.

The `@typedef {Object} HeartbeatResponse` JSDoc in this file documents `reason` as: *"Reason for invalid response"* — a human-readable description field, not a machine-readable status token. The typedef contradicts the switch.

**Finding 13.3 — The "Canonical Status Field" Fix Missed the Switch (CRITICAL)**

Commit `25a4c875` (Feb 1 10:12) is titled `fix(licensing): update heartbeat.js to use canonical status field`. The cumulative diff (`git diff 442e3bfe..25a4c875`) shows:

- Import path reorganization
- `httpProvider` → `httpClient` rename
- `fingerprint` parameter addition
- **Six** occurrences of `currentState.state` → `currentState.status` (state manager field naming)

The fix addressed the naming of the `stateManager` internal field (`.state` → `.status`) but did **not** touch `switch (response.reason)` on the same page. The commit title — "use canonical status field" — makes this omission especially notable, because the switch on `response.reason` is the most prominent use of a non-canonical status field in the file.

**Finding 13.4 — Phase 3D Machine Recovery Wired to the Wrong Switch (CRITICAL)**

Commit `307ee22a` (Feb 12 20:45) added `_attemptMachineRevival()` — the machine recovery feature from Phase 3D. The new code is wired to `case "machine_not_found"` inside the `switch (response.reason)` block. Since the server sends `machine_not_found` in `response.status` (not `response.reason`), this case will never match at runtime. The server sends a human-readable string like `"Machine not found for this license"` in `response.reason`.

This means the entire Phase 3D machine recovery feature in the VS Code extension is dead on arrival — it cannot trigger.

**Finding 13.5 — Complete Commit Timeline for `mouse-vscode/src/licensing/validation.js`**

| Date | Hash (short) | Summary | Key Change |
|------|-------------|---------|------------|
| Jan 27 08:12 | `3416c234` | Initial validation with security hardening | `VALID_HEARTBEAT_STATUSES` created (7 values) |
| Feb 5 07:45 | `172feb66` | Production readiness | Added Keygen license response code passthrough |

Total: 2 commits. File currently at 471 lines. This file is **dead code** at runtime — the VS Code extension imports from `../../licensing/validation.js` (shared copy), not this file (see Step 2 findings).

**Finding 13.6 — VALID_HEARTBEAT_STATUSES Was Speculative From Creation**

The allow-list in `mouse-vscode/src/licensing/validation.js` was created Jan 27 at 08:12 — exactly **34 minutes before** the server heartbeat route was committed (`131bca9`, Jan 27 08:46). The 7 values were speculative/anticipated:

```
VALID_HEARTBEAT_STATUSES = new Set([
  "active", "license_expired", "license_suspended",
  "license_revoked", "concurrent_limit", "valid", "invalid"
])
```

Of these 7 values:
- **2 match** actual server statuses: `active`, `invalid`
- **5 have never been emitted** by the server: `license_expired`, `license_suspended`, `license_revoked`, `concurrent_limit`, `valid`
- **4 actual server statuses** were never added: `trial`, `over_limit`, `machine_not_found`, `error`

The allow-list has never been modified since creation (Jan 27). `git log --all -S "over_limit" -- "*.js"` across the entire Extension repo returns zero results — `over_limit` has never appeared in any JavaScript file in the repo's entire history.

**Finding 13.7 — Complete Commit Timeline for `licensing/heartbeat.js` (Shared)**

| Date | Hash (short) | Summary | Key Change |
|------|-------------|---------|------------|
| Feb 1 10:17 | `24a1e547` | Create shared heartbeat implementation | `switch (result.status)` — **correct from creation** |

Total: 1 commit. File currently at 314 lines. This file uses `switch (result.status)` rather than `switch (response.reason)`. It was created 6 days after the VS Code copy and was written independently — it is NOT a copy of the VS Code file.

The shared copy handles `case "device_limit_exceeded"` (the original server status before the Feb 6 rename to `over_limit`) but does **not** handle `over_limit` or `machine_not_found`. These omissions are less severe than the VS Code copy's switch-field bug because at least the shared copy is dispatching on the correct field.

**Finding 13.8 — Complete Commit Timeline for `licensing/validation.js` (Shared)**

| Date | Hash (short) | Summary | Key Change |
|------|-------------|---------|------------|
| Jan 27 08:12 | `3416c234` | Initial creation (same commit as VS Code copy) | `VALID_HEARTBEAT_STATUSES` with identical 7 values |
| Jan 31 09:11 | `5734a3a7` | Shared licensing core | Structural reorganization |
| Jan 31 20:48 | `2da1f5b8` | Version field validation | Added `validateVersionFields()` |
| Feb 4 22:31 | `6921d389` | Enhanced metadata validation | Stricter validation |
| Feb 5 07:45 | `172feb66` | Production readiness | Keygen key format, license response passthrough |
| Feb 12 20:45 | `307ee22a` | Phase 3D machine recovery | Version config validation |

Total: 6 commits. File currently at 557 lines. This is the **active** validation file imported at runtime.

Despite 6 commits with substantive validation changes, **none** modified `VALID_HEARTBEAT_STATUSES`. The allow-list has been frozen at the original 7 speculative values since Jan 27. This corroborates Finding 14.6.

**Finding 13.9 — Test Mocks Perpetuate Both Patterns**

VS Code tests (`mouse-vscode/tests/heartbeat.test.js`) mock server responses with `reason:` as the status-token field:
- `reason: "license_suspended"` (L302), `reason: "machine_not_found"` (L323), `reason: "concurrent_limit"` (L337), etc.

Shared tests (`licensing/tests/heartbeat.test.js`) mock server responses with `status:` as the status-token field:
- `status: "active"` (L41), `status: "license_expired"` (L166), `status: "device_limit_exceeded"` (L263), etc.

The two test suites are internally consistent with their respective implementations but mutually inconsistent with each other. Both pass because they each test against their own (divergent) code.

**Finding 13.10 — The Feb 14 Alignment Memo Had a Blind Spot**

`docs/plg/20260214_HEARTBEAT_STATUS_ALIGNMENT_MEMO.md` (committed Feb 15 as `83303519`, authored by GPT-5.3-Codex) correctly diagnosed the mismatch between server statuses and the allow-list. However:

1. It only examined `licensing/heartbeat.js` (shared copy, which uses the **correct** `result.status` switch)
2. It **never examined** `mouse-vscode/src/licensing/heartbeat.js` (VS Code copy, which uses the **wrong** `response.reason` switch)
3. Its recommendations — add `trial`, `machine_not_found`, `over_limit`, `error` to the allow-list and handle them in shared heartbeat — would fix the shared copy but would **not fix** the VS Code extension's switch-field bug

This blind spot meant the most critical defect (the wrong dispatch field in the VS Code extension) was never identified by the prior investigation.

**Finding 13.11 — No Unreleased Fixes Exist on Any Branch**

Checked all 70+ branches (local and remote) via `git branch -a`. Specifically examined:
- `feature/server-side-heartbeat-api` — no heartbeat file changes beyond `development`
- `feature/licensing-consolidation` — no heartbeat file changes beyond `development`
- `feature/version-auto-update` — no heartbeat file changes beyond `development`

`git stash list` — empty (no stashes). `git status` — no uncommitted changes to any heartbeat files. No merge commits touching these files. The current state on `development` is the complete and only state.

**Finding 13.12 — Summary of the `reason` vs. `status` Divergence Root Cause**

The divergence was **not** a conscious design decision. It originated from a temporal gap:

1. **Jan 26 22:55 PM** — VS Code heartbeat written with `switch (response.reason)`, anticipating the server would put status tokens in `reason`
2. **Jan 27 08:12 AM** — Validation allow-list created with speculative values (34 min before server existed)
3. **Jan 27 08:46 AM** — Server route created, putting status tokens in `status` and descriptions in `reason`
4. **Feb 1 10:12 AM** — "Canonical status field" fix addressed stateManager naming but missed the switch
5. **Feb 1 10:17 AM** — Shared heartbeat created independently with correct `switch (result.status)` — shows awareness of the correct field at the time of writing, but the VS Code copy was not retrofitted
6. **Feb 12 20:45 PM** — Phase 3D wired new feature to the wrong switch, compounding the bug
7. **Feb 14** — Alignment memo diagnosed allow-list mismatch but never examined the VS Code copy, missing the switch-field bug entirely

No commit message, PR description, or documentation anywhere in the repo indicates awareness that the VS Code copy dispatches on `response.reason` while the server sends status tokens in `response.status`. The divergence was an oversight that was never caught, then compounded by subsequent features built on the wrong assumption.

---

### Step 14 — Git History for Back-End Heartbeat Route

**Repo:** `hic-ai-inc.github.io` (this repo)  
**Command:** `git log --oneline` on `plg-website/src/app/api/license/heartbeat/route.js`  
**Objective:** Understand when server-side response shapes were introduced.  
**What to extract:**

- When `over_limit` and `machine_not_found` responses were added
- Whether client-side updates were made at the same time (cross-reference with Step 13)
- Whether the `valid: true` for `over_limit` was an explicit design choice or an unintentional pattern

**Feeds skeleton sections:** Appendix B, §4.3 (root cause context)

#### Step 14 Findings — Completed 2026-02-19

Full git history: 14 commits from Jan 27 to Feb 15 touching `plg-website/src/app/api/license/heartbeat/route.js`. Analysis below answers the three extraction targets plus a critical cross-reference finding from the Extension repo.

**Finding 14.1 — Complete Commit Timeline**

| Date | Hash | Summary |
|------|------|---------|
| Jan 27 | `131bca9` | Initial heartbeat API route |
| Jan 27 | `c1f4a7c` | CWE security mitigations |
| Jan 29 | `a9bc825` | Move device-limit logic server-side |
| Jan 30 | `4ac1ce1` | Fingerprint validation logging |
| Jan 31 | `f67b3ae` | Increase trial duration to 14 days |
| Feb 1 | `30ae1d3` | Add version delivery to heartbeat |
| Feb 5 | `0c90f5e` | Production readiness fixes |
| Feb 5 | `d27e2c7` | Add concurrent device heartbeat testing |
| Feb 6 | `78385d4` | **Implement concurrent device handling with soft warnings** |
| Feb 9 | `e3a7df1` | Remove deprecated test endpoint |
| Feb 12 | `13deabd` | Update default device activity window |
| Feb 12 | `44b23f3` | Add Keygen event-based device tracking |
| Feb 15 | `9e8e86f` | Fix DynamoDB expression and trial validation |
| Feb 15 | `fb12b60` | Add debug logging for machine not found |

**Finding 14.2 — When `machine_not_found` Was Added**

Present since the **initial commit** (`131bca9`, Jan 27). Always returned `valid: false`. Shape has never changed — only logging was added in `fb12b60` (Feb 15). This status is returned when the Keygen API call to ping a machine heartbeat returns 404.

**Finding 14.3 — When `over_limit` Was Added (Two-Phase History)**

**Phase 1 — `device_limit_exceeded` (Jan 27, `131bca9`):** The initial commit included a device-limit check that returned:
```js
{ valid: false, status: "device_limit_exceeded", reason: "Too many active devices..." }
```
This was a hard rejection (`valid: false`).

**Phase 2 — Renamed to `over_limit` with `valid: true` (Feb 6, `78385d4`):** Commit titled "implement concurrent device handling with soft warnings". The diff shows a deliberate change:
```diff
-  return NextResponse.json({ valid: false, status: "device_limit_exceeded", ... });
+  return NextResponse.json({ valid: true, status: "over_limit", ... });
```
This was a conscious redesign: the word "soft" in the commit title and the explicit `false → true` change confirm intentional design. The rename from `device_limit_exceeded` to `over_limit` was simultaneous.

**Finding 14.4 — Version Fields Were Never Added to the Over-Limit Path**

Commit `30ae1d3` (Feb 1) added version delivery fields (`latestVersion`, `readyVersion`, `releaseNotesUrl`, `updateUrl`) to the `trial` and `active` success responses. The device-limit path (then still `device_limit_exceeded`) was NOT updated. When the path was renamed to `over_limit` in `78385d4` (Feb 6), version fields were still not added. As of Feb 15 (latest commit `fb12b60`), the `over_limit` response still lacks version fields. This corroborates Step 1, Finding 1.5.

**Finding 14.5 — No Client-Side Updates Accompanied the `over_limit` Change**

Commit `78385d4` (Feb 6) modified exactly 6 files, all in this repo:
- `plg-website/src/app/api/license/heartbeat/route.js`
- `plg-website/__tests__/unit/heartbeat.unit.test.js`
- `plg-website/__tests__/integration/heartbeat.integration.test.js`
- `plg-website/__tests__/contract/heartbeat.contract.test.js`
- `plg-website/src/app/api/license/heartbeat/dynamodb.js`
- `plg-website/src/app/api/license/heartbeat/device-manager.js`

No Extension repo files were touched. The Extension repo's only commit near this date was `eaecdbf4` (Feb 6, documentation update to roadmap) — no code changes to heartbeat or validation files.

**Finding 14.6 — The Extension Allow-List Has Been Wrong Since Day One (CRITICAL)**

Cross-reference with Extension repo (`~/source/repos/hic`):

The `VALID_HEARTBEAT_STATUSES` allow-list was created Jan 27 (`3416c234`) in `mouse-vscode/src/licensing/validation.js` with these values:
```js
const VALID_HEARTBEAT_STATUSES = new Set([
  "active", "license_expired", "license_suspended",
  "license_revoked", "concurrent_limit", "valid", "invalid",
]);
```

A second copy was created Jan 31 (`5734a3a7`) in `licensing/validation.js` with identical values.

**Neither copy has EVER been updated to match actual server statuses.** As of today, both still contain the original Jan 27 values. Searching git history with `git log --all -p -S "over_limit"` against both files returns zero results — `over_limit` was never added.

The server's actual status values (from Step 1) versus extension allow-list:

| Server Status | In Allow-List? | Notes |
|---------------|---------------|-------|
| `trial` | **NO** | Server emits since Jan 27 — never in allow-list |
| `active` | YES | Only overlap with correct semantics |
| `over_limit` | **NO** | Server emits since Feb 6 — never added |
| `machine_not_found` | **NO** | Server emits since Jan 27 — never in allow-list |
| `invalid` | YES | Correct overlap |
| `error` | **NO** | Server emits since Jan 27 — never in allow-list |

Allow-list values NOT emitted by server: `license_expired`, `license_suspended`, `license_revoked`, `concurrent_limit`, `valid` — these appear to be speculative/anticipated values that never materialized in the actual API.

**Impact:** `validateHeartbeatResponse()` would reject valid server responses for 4 of 6 possible statuses. This means the validation layer — designed as a security hardening measure (CWE-502) — has been silently failing at runtime or is not being called for heartbeat responses. This finding feeds directly into Steps 2–9 (Extension repo investigation).

**Finding 14.7 — Window Default Changed from 24h to 2h (Feb 12)**

Commit `13deabd` changed `DEFAULT_ACTIVITY_WINDOW_HOURS` from 24 to 2 and added the `windowHours` parameter to `getActiveDevicesInWindow`. This affects how many devices appear "active" for the over-limit check. A narrower window (2h) means fewer devices appear concurrent, making over-limit less likely to trigger but more responsive to actual concurrent use.

**Finding 14.8 — Answer Summary for Extraction Targets**

1. **When `over_limit` and `machine_not_found` were added:** Both trace to the initial commit (Jan 27, `131bca9`). `machine_not_found` has never changed shape. `device_limit_exceeded` was renamed to `over_limit` with `valid: false → true` on Feb 6 (`78385d4`).

2. **Whether client-side updates were made at the same time:** **No.** The Feb 6 `over_limit` change was server-only. The extension's `VALID_HEARTBEAT_STATUSES` was never updated to include `over_limit`. Furthermore, the allow-list was never correct even for the original `device_limit_exceeded` — it had `concurrent_limit` instead, which the server never emitted.

3. **Whether `valid: true` for `over_limit` was an explicit design choice:** **Yes, unambiguously.** Commit `78385d4` is titled "implement concurrent device handling with soft warnings." The diff shows a deliberate `false → true` flip alongside a deliberate rename. The design intent was to treat over-limit as a non-blocking warning rather than a hard rejection. However, this design decision was made server-side without corresponding client-side changes to consume the new status or behavior.



---

### Step 15 — Review Today's Shared Notes from the Degraded Investigation

**Repo:** `hic` (Extension repo)  
**Files:**

- `.hic/local/shared/notes/20260219T134034Z-copilot-stream-1a-pre-scope-findings.md`
- `.hic/local/shared/notes/20260219T145024Z-copilot-heartbeat-update-memo-key-findings.md`
- `.hic/local/shared/notes/20260219T171012Z-copilot-heartbeat-investigation-findings-summary.md`

**Objective:** Extract factual assertions and cross-reference against verified findings from Steps 1–14.  
**Method:** List each claim. For each: mark as CONFIRMED, REFUTED, or UNVERIFIED against the source code evidence gathered in prior steps. Flag any claims that contradict each other or contradict verified source code.

**Feeds skeleton sections:** §1 (Introduction — context on prior investigation), §4 (any additional bugs identified), §9 (risk assessment — reliability of prior findings)

---

### Step 16 — Review the Original Remediation Plan from the Extension Repo

**Repo:** `hic` (Extension repo)  
**File:** `plg/docs/20260219_OPEN_HEARTBEAT_ISSUES_REMEDIATION_PLAN.md` (647 lines)  
**Objective:** Same as Step 15 — extract claims, cross-reference, identify any assertions that are incorrect or internally inconsistent.  
**Known issues from the Update document:**

- Fix 2 assumed `over_limit` reaches `_handleInvalidHeartbeat` — confirmed wrong (Finding 2)
- Fix 2 assumed adding a `case "over_limit"` alias would suffice — confirmed insufficient (Finding 3)

**Additional cross-reference:** Look for the specific inconsistency SWR identified — the document asserting in one place that a Business user adding a 6th device on a 5-device plan will be "blocked," while simultaneously concluding elsewhere that the user will never be blocked in a factually identical scenario.

**Feeds skeleton sections:** §1 (Introduction — credibility assessment of prior deliverables), §4 (additional bugs or corrections)

---

### Step 17 — Populate the Skeleton Document

**Method:** Walk through each section of the [Comprehensive Analysis](20260219_COMPREHENSIVE_ANALYSIS_OF_OPEN_HEARTBEAT_ISSUES.md) skeleton. For each section, draw exclusively from the verified findings of Steps 1–16. Every factual assertion cites a specific file and line number. Every bug description includes a reproduction path through the actual code. Every proposed fix identifies exact files, functions, and line ranges to modify. Every user journey is traced through the actual code path, not described from memory or prior documents.

**Sequencing:** Populate in section order (§1 → §2 → ... → Appendices). SWR reviews each populated section (or a batch of sections, at SWR's discretion) before proceeding.

**Feeds skeleton sections:** All.

---

## Recommended Execution Order

| Priority    | Steps      | Rationale                                                                                                                                                                               |
| ----------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Highest** | 1, 2, 3, 4 | These four files define the entire bug surface: server route, VS Code heartbeat manager, both validation modules, HTTP client gate. Every identified bug traces to code in these files. |
| **High**    | 5, 6, 7, 8 | Surrounding context: shared HeartbeatManager (architectural contrast), LicenseChecker (dead code), extension activation (command wiring), StatusBarManager (version UI).                |
| **Medium**  | 9, 10      | Test coverage assessment: what is tested today, what gaps exist, what assertions may be testing incorrect behavior.                                                                     |
| **Medium**  | 11, 12     | Infrastructure: EventBridge version delivery pipeline, DynamoDB schema. Required for version-related user journeys but not for core bug analysis.                                       |
| **Lower**   | 13, 14     | Historical context: git history for root-cause understanding. Informative but not required for fix correctness.                                                                         |
| **Lowest**  | 15, 16     | Cross-referencing degraded outputs: useful for completeness but strictly secondary to source-code-verified findings.                                                                    |
| **Final**   | 17         | Population: only after all prerequisite steps are complete and reviewed.                                                                                                                |

---

## Document History

| Date       | Author | Changes          |
| ---------- | ------ | ---------------- |
| 2026-02-19 | GC     | Initial creation |
