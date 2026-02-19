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
