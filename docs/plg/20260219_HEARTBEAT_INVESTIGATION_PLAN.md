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
