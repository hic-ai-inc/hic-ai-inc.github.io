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
