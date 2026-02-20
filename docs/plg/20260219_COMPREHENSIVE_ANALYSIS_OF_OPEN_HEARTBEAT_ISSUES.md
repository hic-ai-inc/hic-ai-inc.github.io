# Comprehensive Analysis of Open Heartbeat Issues

> **⚠️ DISCLAIMER:** Best efforts have been made to generate this document in alignment with the underlying Findings in the companion [Heartbeat Investigation Plan](20260219_HEARTBEAT_INVESTIGATION_PLAN.md). However, in the event of any conflict between this document and the actual source code or Git history, readers should always rely upon the source code and Git history as the sole source of truth for the actual state of the codebase at any given point in time. This document is a synthesis and analysis — not a substitute for direct examination of the code it describes.


**Date:** 2026-02-19  
**Author:** GC (GitHub Copilot, Claude Opus 4.6)  
**Owner:** SWR  
**Status:** SKELETON — Awaiting population through systematic investigation  
**Companion documents:**

- [Heartbeat Status Alignment Memo (Feb 14)](20260214_HEARTBEAT_STATUS_ALIGNMENT_MEMO.md)
- [Open Heartbeat Issues Remediation Plan (Feb 19, Extension repo)](../../plg/docs/20260219_OPEN_HEARTBEAT_ISSUES_REMEDIATION_PLAN.md)
- [Update to Open Heartbeat Issues Remediation Plan (Feb 19, Launch)](../launch/20260219_UPDATE_TO_OPEN_HEARTBEAT_ISSUES_REMEDIATION_PLAN.md)
- [Heartbeat Investigation Plan (Feb 19)](20260219_HEARTBEAT_INVESTIGATION_PLAN.md)
- [Daily Plan (Feb 19)](../launch/20260219_DAILY_PLAN.md)

---

## 1. Introduction

### 1.1 Background and Purpose

The HIC heartbeat system is the licensing enforcement and version notification mechanism connecting the Mouse VS Code extension to the HIC back-end. It serves three purposes: (1) validating that a user's license is active and within device limits, (2) delivering version update notifications to the extension, and (3) maintaining device activity records for concurrent-use enforcement.

This document presents a comprehensive, source-code-verified analysis of all open issues in the heartbeat implementation across both the Website repo (`hic-ai-inc.github.io`, back-end route and infrastructure) and the Extension repo (`hic`, client-side HeartbeatManagers, validation, and UI). It was produced as Step 17 of the [Heartbeat Investigation Plan](20260219_HEARTBEAT_INVESTIGATION_PLAN.md), which conducted a 14-step, character-by-character examination of every file in the heartbeat code path across both repos, including git history, live AWS infrastructure, and DynamoDB records.

The investigation identified 12 open issues (HB-1 through HB-12), 11 distinct bugs, and proposed 9 active fixes plus 4 deferred improvements. Two root-cause defects — a speculative validation allow-list that rejects 4 of 6 server statuses, and a dispatch switch on the wrong response field — cascade into most of the remaining bugs. The critical finding is that only the `active` happy-path heartbeat works end-to-end; every other server status (`trial`, `over_limit`, `machine_not_found`, `error`) is silently swallowed by the extension's validation gate.

### 1.2 Scope

This analysis covers the complete heartbeat code path:

- **Website repo (back-end):** The heartbeat API route (`plg-website/src/app/api/license/heartbeat/route.js`, 382 lines), its test suites (contract, unit, integration, E2E — ~1,795 lines total), the EventBridge/Lambda version delivery pipeline (`plg-scheduled.yaml`, `scheduled-tasks/index.js`), and the DynamoDB schema for version and device records.
- **Extension repo (client-side):** The VS Code HeartbeatManager (`mouse-vscode/src/licensing/heartbeat.js`, 440 lines), the shared HeartbeatManager (`licensing/heartbeat.js`, 314 lines), both copies of `VALID_HEARTBEAT_STATUSES` (`mouse-vscode/src/licensing/validation.js`, 471 lines; `licensing/validation.js`, 557 lines), the HTTP client validation gate (`mouse-vscode/src/licensing/http-client.js`), the LicenseChecker (`license-checker.js`), extension activation (`extension.js`), StatusBarManager, and all related test suites (~2,859 lines).
- **Infrastructure:** Live AWS staging environment (EventBridge rules, Lambda execution logs, DynamoDB records) verified on 2026-02-19.
- **Git history:** Complete commit timelines for all heartbeat files in both repos, covering Jan 26 – Feb 15, 2026.

### 1.3 Methodology

Every factual assertion in this document is derived from the verified source-code findings of Steps 1–14 of the [Heartbeat Investigation Plan](20260219_HEARTBEAT_INVESTIGATION_PLAN.md). Each step involved reading every character of the specified files, with findings recorded immediately after examination. Cross-references between steps were verified against the actual code, not against prior documentation.

The methodology was:
1. **Steps 1–8 (Highest/High priority):** Read every line of the 8 core files defining the bug surface — server route, VS Code HeartbeatManager, both validation modules, HTTP client, shared HeartbeatManager, LicenseChecker, extension activation, and StatusBarManager.
2. **Steps 9–10 (Medium priority):** Read every line of all test suites (~4,654 lines) to assess what is tested, what is not, and what tests assert behavior now known to be incorrect.
3. **Steps 11–12 (Medium priority):** Examined the EventBridge/Lambda version delivery pipeline and DynamoDB schema, including live AWS infrastructure queries.
4. **Steps 13–14 (Lower priority):** Full git history (`git log`, `git show`, `git diff`, `git blame`) for all heartbeat files in both repos to establish root-cause timelines.
5. **Steps 15–16 (Waived):** Review of prior AI-generated documentation was waived by SWR; those documents are flagged as corrupted (see §1.4).
6. **Step 17 (This document):** Synthesis of all verified findings into this comprehensive analysis.

### 1.4 Relationship to Prior Documents and Their Reliability

This analysis supersedes all prior heartbeat documentation. Specifically:

- **[Heartbeat Status Alignment Memo (Feb 14)](20260214_HEARTBEAT_STATUS_ALIGNMENT_MEMO.md):** Authored by GPT-5.3-Codex. Correctly diagnosed the allow-list mismatch (HB-1) for the shared HeartbeatManager but never examined the VS Code HeartbeatManager, missing the most critical defect (HB-2: wrong dispatch field). Its recommendations would fix the shared copy but leave the VS Code extension broken. Partially reliable — use only for the specific findings it documents, not its conclusions. (Investigation Plan, Finding 13.10)
- **[Open Heartbeat Issues Remediation Plan (Feb 19)](~/source/repos/hic/plg/docs/20260219_OPEN_HEARTBEAT_ISSUES_REMEDIATION_PLAN.md):** Located in the Extension repo. Contains AI-degraded output — a mixture of true, untrue, and unverified findings. **⚠️ CORRUPTED — do not trust.**
- **[Update to Open Heartbeat Issues Remediation Plan (Feb 19)](../issues/20260219_UPDATE_TO_OPEN_HEARTBEAT_ISSUES_REMEDIATION_PLAN.md):** Relocated from `docs/launch/` to `docs/issues/` on 2026-02-20. Contains AI-degraded output with internal contradictions (e.g., asserting in one place that a Business user adding a 6th device will be "blocked" while concluding elsewhere that the same user will never be blocked). **⚠️ CORRUPTED — do not trust.**

The [Heartbeat Investigation Plan](20260219_HEARTBEAT_INVESTIGATION_PLAN.md) is the sole authoritative source of verified findings. This document synthesizes those findings into a structured analysis but adds no new claims beyond what the Investigation Plan established through direct source-code examination.

---

## 2. Summary of Open Issues

### 2.1 HB-1: `VALID_HEARTBEAT_STATUSES` Allow-List Mismatch

**Severity:** CRITICAL | **Repo:** Extension | **Root cause:** Speculative allow-list created before server existed

The `VALID_HEARTBEAT_STATUSES` allow-list (both copies: `licensing/validation.js` and `mouse-vscode/src/licensing/validation.js`) contains 7 values, only 2 of which (`active`, `invalid`) match actual server-emitted statuses. Four legitimate server statuses — `trial`, `over_limit`, `machine_not_found`, `error` — are rejected by the validation gate in `http-client.js` L195, causing the entire server response to be discarded and replaced with `{ valid: false, status: "error", reason: "Invalid server response" }`. The allow-list was created Jan 27 at 08:12, exactly 34 minutes before the server route was first committed, and has never been updated. (Investigation Plan, Steps 3, 4, 13 Finding 13.6, 14 Finding 14.6)

### 2.2 HB-2: `_handleInvalidHeartbeat` Switches on `response.reason` Instead of `response.status`

**Severity:** CRITICAL | **Repo:** Extension | **Root cause:** Client written before server; wrong field assumption never corrected

The VS Code HeartbeatManager (`mouse-vscode/src/licensing/heartbeat.js` L266) dispatches invalid-heartbeat handling via `switch (response.reason)`. The server puts machine-readable status tokens in `response.status` and human-readable descriptions in `response.reason`. Every `case` label in the switch (`license_suspended`, `license_expired`, `license_revoked`, `concurrent_limit`, `machine_not_found`) matches a status token that will never appear in `response.reason`. All invalid-status handlers are unreachable. This bug has existed since the first commit (`442e3bfe`, Jan 26) and was not corrected even by commit `25a4c875` (Feb 1), titled "fix: update heartbeat.js to use canonical status field," which fixed 6 occurrences of a different naming issue on the same page but missed the switch. (Investigation Plan, Steps 2 Bug 1, 13 Findings 13.1–13.3)

### 2.3 HB-3: `over_limit` Returns `valid: true` — Never Reaches Invalid Handler

**Severity:** HIGH | **Repo:** Extension + Website | **Root cause:** Server design decision not propagated to client

The server returns `over_limit` with `valid: true` (route.js L305, commit `78385d4` Feb 6 — deliberate redesign from `valid: false` to soft warning). Because `valid` is `true`, the VS Code HeartbeatManager's success path executes (`_handleValidHeartbeat`), which calls `onSuccess` and `_mapServerStatusToState`. The `over_limit` status is not handled in the success path — it falls through to "unknown status" handling. Meanwhile, the invalid path (where `_handleConcurrentLimitExceeded` lives) is never reached because `valid: true` bypasses it. The `over_limit` status is also blocked by HB-1 (not in allow-list), making this a compound failure: even if the allow-list were fixed, the success path still wouldn't handle it correctly. (Investigation Plan, Steps 1 Finding 1.5, 2 Bugs 3–5, 14 Finding 14.3)

### 2.4 HB-4: `checkForUpdates()` Calls Non-Existent `/api/version` Endpoint

**Severity:** MEDIUM | **Repo:** Extension | **Root cause:** Non-existent API host

The `mouse.checkForUpdates` command (registered in `extension.js`) calls `https://api.hic-ai.com/api/version`, a host that does not exist. The VS Code extension config (`mouse-vscode/src/licensing/config.js` L11) hardcodes `API_BASE_URL` as `https://api.hic-ai.com`. The shared licensing module (`licensing/constants.js` L13) correctly uses `https://staging.hic-ai.com`. This means the independent version-check path always fails silently. Version notifications work only via the heartbeat-delivered path (when the validation gate passes). (Investigation Plan, Steps 7, 8 Finding 8, 9 Finding 9D L394, 9G)

### 2.5 HB-5: Two Divergent `HeartbeatManager` Implementations

**Severity:** MEDIUM | **Repo:** Extension | **Root cause:** Independent implementations with different dispatch patterns

Two HeartbeatManager implementations exist: the VS Code copy (`mouse-vscode/src/licensing/heartbeat.js`, 440 lines) and the shared copy (`licensing/heartbeat.js`, 314 lines). They differ in dispatch field (`response.reason` vs `result.status`), timer mechanism (`setInterval` vs `setTimeout` chaining), status case labels (`concurrent_limit` vs `device_limit_exceeded`), and feature set (VS Code has machine revival; shared does not). The shared copy was written Feb 1, six days after the VS Code copy, and is architecturally superior (correct dispatch field, `setTimeout` chaining). The VS Code copy is the one loaded by the extension at runtime. (Investigation Plan, Steps 2, 5, 13 Findings 13.1, 13.7)

### 2.6 HB-6: Two Copies of `VALID_HEARTBEAT_STATUSES` (Shared vs. VS Code)

**Severity:** LOW | **Repo:** Extension | **Root cause:** Shared module creation duplicated rather than consolidated

Both `mouse-vscode/src/licensing/validation.js` (471 lines) and `licensing/validation.js` (557 lines) export `VALID_HEARTBEAT_STATUSES` with identical content (7 values). The VS Code copy is dead code at runtime — the extension imports from the shared copy via `http-client.js`. However, `security.test.js` imports from the VS Code copy, meaning security tests validate the dead-code copy rather than the runtime copy. The two copies have identical allow-lists today but different export styles and divergent `LICENSE_KEY_PATTERN` definitions. (Investigation Plan, Steps 3, 4, 9 Finding 9A)

### 2.7 HB-7: `over_limit` Response Missing Version Fields

**Severity:** MEDIUM | **Repo:** Website | **Root cause:** Version fields omitted from over-limit response path

The `over_limit` response (route.js L320–329) does not call `getVersionConfig()` and returns zero version fields (`latestVersion`, `readyVersion`, `readyReleaseNotesUrl`, `readyUpdateUrl`, `readyUpdatedAt` are all absent). The `trial` response (L148–168) and `active` response (L339–365) both include all 7 version fields. An over-limit user's extension will never receive version notification data via heartbeat, regardless of the EventBridge pipeline's operational status. (Investigation Plan, Steps 1 Finding 1.5, 11 Finding 11.5)

### 2.8 HB-8: Dead Code in `LicenseChecker` (`startHeartbeat()` / `sendHeartbeat()`)

**Severity:** LOW | **Repo:** Extension | **Root cause:** Superseded implementation not removed

The `LicenseChecker` class (`mouse-vscode/src/licensing/license-checker.js`) contains `sendHeartbeat()` and `startHeartbeat()` methods that are never called from any runtime or test code. The extension uses `HeartbeatManager` exclusively for heartbeat functionality. These methods represent an earlier implementation that was superseded but not cleaned up. (Investigation Plan, Step 6)

### 2.9 HB-9: Phase 3D Machine Recovery Non-Functional (Compound of HB-1 + HB-2)

**Severity:** CRITICAL | **Repo:** Extension | **Root cause:** Compound of HB-1 + HB-2

Phase 3D machine recovery (`_attemptMachineRevival`, added in commit `307ee22a` Feb 12) is wired to `case "machine_not_found"` inside the `switch (response.reason)` block. This feature is doubly unreachable: (1) `machine_not_found` is not in `VALID_HEARTBEAT_STATUSES`, so the server response is rejected at the validation gate before reaching the HeartbeatManager (HB-1), and (2) even if it survived the gate, the switch dispatches on `response.reason` which contains a human-readable string like `"Machine not found for this license"`, not the token `"machine_not_found"` (HB-2). The entire Phase 3D machine recovery feature in the VS Code extension is dead on arrival. (Investigation Plan, Steps 2 Bugs 5–6, 13 Finding 13.4)

### 2.10 HB-10: Double-Start `HeartbeatManager` Creates Orphaned Timer

**Severity:** MEDIUM | **Repo:** Extension | **Root cause:** No guard against re-entry

The extension activation sequence (`extension.js`) can create a HeartbeatManager in two patterns: a pre-validation single heartbeat (fire-and-forget) and an ongoing loop with 4 callbacks. If `startHeartbeatWithCallbacks` is called while a HeartbeatManager is already running, a second timer is created with no reference to the first, orphaning the original interval. The orphaned timer continues firing heartbeats indefinitely with no way to stop it. (Investigation Plan, Step 7)

### 2.11 HB-11: `_mapServerStatusToState` Returns `null` for All Non-`active` Valid Statuses

**Severity:** HIGH | **Repo:** Extension | **Root cause:** Case-sensitive mapping with mismatched casing

The `_mapServerStatusToState` function in the VS Code HeartbeatManager maps UPPERCASE keys (`ACTIVE`, `LICENSED`, `SUSPENDED`, `EXPIRED`, `REVOKED`) but the validation allow-list passes through lowercase values (`active`, `license_suspended`, etc.). Every valid heartbeat response gets `null` from the mapper, sending all responses down the "unknown status" path. No test catches this because tests mock responses that bypass the validation gate. (Investigation Plan, Steps 2, 9 Finding 9B key discrepancy)

### 2.12 HB-12: SUSPENDED Status Bar Uses Invalid Status Type Key

**Severity:** LOW | **Repo:** Extension | **Root cause:** Invalid VS Code API parameter

The StatusBarManager's SUSPENDED state display uses a `"warning"` type key that is not a valid VS Code `StatusBarItem` background type. Valid values are `"error"` or `undefined`. The invalid type is silently ignored by VS Code, resulting in no visual distinction for the SUSPENDED state. (Investigation Plan, Step 8)

---

## 3. Description of Current Condition of Both Repos

### 3.1 Website Repo (`hic-ai-inc.github.io`)

#### 3.1.1 Back-End Heartbeat Route (`plg-website/src/app/api/license/heartbeat/route.js`)

The heartbeat API route (`plg-website/src/app/api/license/heartbeat/route.js`, 382 lines) is a Next.js API route handler that processes `POST` requests. It handles two distinct flows:

**Trial heartbeat** (no license key): Validates the fingerprint, calls `getVersionConfig()` (L149), and returns `{ valid: true, status: "trial", ... }` with all 7 version fields (L148–168). No DynamoDB writes; no Keygen interaction.

**Licensed heartbeat** (license key present): Validates the license key format, calls Keygen's machine heartbeat ping API, then branches:

- **License not in DynamoDB** (L258–281): Falls through to the success response with `status: "active"` and version fields. This path calls `getVersionConfig()` at L261.
- **Over-limit** (L320–329): Returns `{ valid: true, status: "over_limit", reason: "...", concurrentMachines, maxMachines, message }`. Does NOT call `getVersionConfig()` — zero version fields in this response. The `valid: true` was a deliberate design choice (commit `78385d4`, Feb 6: "implement concurrent device handling with soft warnings").
- **Success** (L339–365): Returns `{ valid: true, status: "active", ... }` with all 7 version fields. Contains dead ternaries at L342 (`overLimit ? "over_limit" : "active"`) and L348–351 that always evaluate to `"active"`, `false`, and `null` respectively, because the over-limit early return at L319 ensures `overLimit === false` at this point.
- **Machine not found** (L285–295): Returns `{ valid: false, status: "machine_not_found", reason: "Machine not found for this license" }`. Present since the initial commit.
- **Error** (L369–379): Returns `{ valid: false, status: "error", reason: "...", concurrentMachines, maxMachines }`. No version fields.

The route also performs a fire-and-forget `updateDeviceLastSeen()` call (L285) to update the `lastSeenAt` attribute on the device's DynamoDB record.

**Server-emitted statuses (6 total):** `trial`, `active`, `over_limit`, `machine_not_found`, `invalid`, `error`. (Investigation Plan, Step 1)

#### 3.1.2 Heartbeat Tests (Unit, Contract, Integration, E2E)

Four test files exist (~1,795 lines total):

**Contract test** (`heartbeat-route.contract.test.js`, 224 lines): The ONLY test file that calls the actual route handler. Pins `trial` and `active` response shapes with version fields. Does NOT test `over_limit`, `machine_not_found`, `invalid`, or `error`. (Investigation Plan, Step 10 Finding 10.1)

**Unit test** (`heartbeat.test.js`, 658 lines): Defines local helper functions that replicate route logic rather than importing the actual handler. Tests `over_limit` locally with `valid: true` (correct), but uses phantom status `"device_limit_exceeded"` (never emitted by server). (Investigation Plan, Step 10 Findings 10.2–10.4)

**Integration test** (`heartbeat.test.js`, 391 lines): Also uses local mocks, never calls the actual handler. Critically, asserts `valid: false` for device-limit-exceeded (L279), contradicting both the unit test (`valid: true`) and the actual server (`valid: true`). (Investigation Plan, Step 10 Finding 10.5)

**E2E journey test** (`j5-heartbeat-loop.test.js`, 522 lines): Uses real HTTP calls against staging API. Covers 7 scenarios but is overwhelmingly tolerant — most assertions follow `if (response.status === 200)` with graceful skip. Never asserts exact `status`, `valid`, or `reason` field values. No over-limit, machine-not-found, or error scenarios tested. (Investigation Plan, Step 10 Finding 10.6)

**Key gap:** 4 of 6 server status values have zero contract-level test coverage. The `over_limit` response shape (the one with the most bugs) has zero end-to-end test coverage. The integration test contradicts the server on `valid` for over-limit. (Investigation Plan, Step 10 Finding 10.7)

#### 3.1.3 EventBridge Scheduled Tasks and Version Delivery Pipeline

The version notification pipeline operates independently of `checkForUpdates()`:

**EventBridge rule** (`plg-scheduled.yaml` L62–73): `MouseVersionNotifyRule` fires daily at `cron(0 9 * * ? *)` (9 AM UTC). State is `ENABLED` for staging/prod, `DISABLED` for dev. Confirmed live on AWS: `plg-mouse-version-notify-staging` with `State: ENABLED`. (Investigation Plan, Step 11 Finding 11.1)

**Lambda handler** (`scheduled-tasks/index.js` L435–486, `handleMouseVersionNotify`): Reads `VERSION#mouse/CURRENT` from DynamoDB, copies `latestVersion` to `readyVersion`, writes `readyReleaseNotesUrl`, `readyUpdateUrl`, `readyUpdatedAt`. The promotion is a simple blind copy — no 24-hour delay gate exists in code. The daily schedule IS the delay mechanism. (Investigation Plan, Step 11 Finding 11.4)

**Operational status:** The Lambda ran successfully on 2026-02-19 at 09:00:44 UTC, promoting v0.10.10. CloudWatch logs confirm `{"readyVersion":"0.10.10"}` with 384.62ms duration. (Investigation Plan, Step 11 Finding 11.2)

**Lambda environment:** Runtime `nodejs20.x`, 512 MB memory, 300s timeout. Layers: `hic-base-layer:13`, `hic-dynamodb-layer:12`, `hic-ses-layer:4`. Managed by CloudFormation stack. All values match the template. (Investigation Plan, Step 11 Finding 11.7)

#### 3.1.4 DynamoDB Schema — Heartbeat and Version Records

**Table:** `hic-plg-${Environment}`, single-table design with `PK` (String) + `SK` (String) composite key. PAY_PER_REQUEST billing. 3 GSIs (Stripe customer, License key, Auth0 user). TTL on `ttl` attribute for EVENT and TRIAL records. DynamoDB Streams enabled (NEW_AND_OLD_IMAGES). Point-in-time recovery and SSE enabled. (Investigation Plan, Step 11 Finding 11.9)

**Version record:** Single record at `PK=VERSION#mouse / SK=CURRENT`. No separate READY record — `readyVersion` fields are attributes on the same CURRENT record. Key attributes: `latestVersion` ("0.10.10"), `readyVersion` ("0.10.10"), `readyReleaseNotesUrl`, `readyUpdateUrl`, `readyUpdatedAt` ("2026-02-19T09:00:44.448Z"), `releaseDate`, `releaseNotesUrl`, `updateUrl` (map with `marketplace`, `npm`, `vsix` keys). (Investigation Plan, Step 11 Finding 11.3)

**Two-stage write model:** CI/CD writes `latestVersion` via `updateVersionConfig()` (dynamodb.js L2188–2205) which writes only `latestVersion`, `releaseNotesUrl`, `updatedAt`. The daily Lambda promotes to `readyVersion` fields. The `updateUrl` map is not part of `updateVersionConfig` — it was written by a different code path or manually. (Investigation Plan, Step 11 Finding 11.8)

**Heartbeat records:** The heartbeat route does NOT write heartbeat-specific records. It performs two DynamoDB operations during licensed heartbeats: (1) `getLicense(licenseKey)` reads `LICENSE#{licenseKey}/DETAILS`, and (2) `updateDeviceLastSeen()` updates `LICENSE#{keygenLicenseId}/DEVICE#{fingerprint}` setting `lastSeenAt = now` (fire-and-forget). Concurrent device enforcement uses `getActiveDevicesInWindow()` which queries all `DEVICE#*` records under the license and filters by `lastSeenAt > cutoffTime` (default 2-hour window). Trial heartbeats perform zero DynamoDB writes. (Investigation Plan, Step 12)

### 3.2 Extension Repo (`hic`)

#### 3.2.1 VS Code HeartbeatManager (`mouse-vscode/src/licensing/heartbeat.js`)

The VS Code HeartbeatManager (`mouse-vscode/src/licensing/heartbeat.js`, 440 lines, 6 commits from Jan 26 – Feb 12) is the primary heartbeat client loaded by the extension at runtime.

**Timer mechanism:** Uses `setInterval` with a 10-minute default interval. Retry logic: exponential backoff (1s base, 3 retries). Timeout: 10s per request.

**Response handling:** Splits on `response.valid` (L227):
- **Valid path** (`_handleValidHeartbeat`): Calls `onSuccess` callback (L228), then feeds `response.status` through `_mapServerStatusToState()` (L390–415). The mapper expects UPPERCASE keys (`ACTIVE`, `LICENSED`, `SUSPENDED`, `EXPIRED`, `REVOKED`) but receives lowercase values from the server, returning `null` for every status. All valid heartbeats fall through to "unknown status" handling.
- **Invalid path** (`_handleInvalidHeartbeat`): Dispatches via `switch (response.reason)` at L266. This is the critical bug — the server puts status tokens in `response.status`, not `response.reason`. Every case label (`license_suspended`, `license_expired`, `license_revoked`, `concurrent_limit`, `machine_not_found`) is unreachable.

**Machine recovery** (Phase 3D, commit `307ee22a` Feb 12): `_attemptMachineRevival()` is wired to `case "machine_not_found"` inside the wrong switch. Dead on arrival.

**`onSuccess` timing:** Fires at L228 before the validity/status check, meaning it fires even for responses that will later be identified as problematic. Mitigated by the fact that fallback responses (from validation gate rejection) lack version fields.

**JSDoc `@typedef HeartbeatResponse`:** Documents `reason` as "Reason for invalid response" — a human-readable description, contradicting the switch that treats it as a machine-readable token. (Investigation Plan, Steps 2, 13 Findings 13.1–13.4)

#### 3.2.2 Shared HeartbeatManager (`licensing/heartbeat.js`)

The shared HeartbeatManager (`licensing/heartbeat.js`, 314 lines, 1 commit from Feb 1) is an independent implementation that is NOT loaded by the VS Code extension at runtime. It was written 6 days after the VS Code copy.

**Architecturally superior design:**
- Uses `setTimeout` chaining (not `setInterval`) — avoids timer drift and overlapping requests
- Correctly dispatches on `result.status` (not `response.reason`)
- Constructor uses options-object pattern: `new HeartbeatManager({ stateManager, httpClient, intervalMs })`
- 314 lines vs VS Code's 440 lines

**Status handling:** Has 8 case labels including `trial` and `device_limit_exceeded`. However, `device_limit_exceeded` was the original server status name before the Feb 6 rename to `over_limit` — the shared copy was never updated to match. Does not handle `over_limit` or `machine_not_found`. No machine revival feature.

**Interval adjustment:** Supports server-directed interval via `nextHeartbeat` field (min 1 min, max 30 min).

Despite being the better implementation, this file is not used by the VS Code extension. It exists in the shared `licensing/` directory and may be intended for other clients (CLI, future IDE integrations). (Investigation Plan, Step 5)

#### 3.2.3 VS Code Validation Module (`mouse-vscode/src/licensing/validation.js`)

The VS Code validation module (`mouse-vscode/src/licensing/validation.js`, 471 lines, 2 commits) is **dead code at runtime**. The extension imports validation functions from the shared copy (`licensing/validation.js`) via `http-client.js`, not from this file.

Exports `VALID_HEARTBEAT_STATUSES` as a `Set` with 7 values: `active`, `license_expired`, `license_suspended`, `license_revoked`, `concurrent_limit`, `valid`, `invalid`. Created Jan 27 at 08:12 — 34 minutes before the server route existed. Never updated.

Also exports `validateHeartbeatResponse()`, `LICENSE_KEY_PATTERN`, and other validation functions. The `LICENSE_KEY_PATTERN` diverges from the shared copy.

**Impact:** `security.test.js` imports from this dead-code copy, meaning all security validation tests validate code that never runs in production. (Investigation Plan, Steps 3, 4, 9 Finding 9A, 13 Finding 13.5)

#### 3.2.4 Shared Validation Module (`licensing/validation.js`)

The shared validation module (`licensing/validation.js`, 557 lines, 6 commits from Jan 27 – Feb 12) is the **active runtime copy** imported by `http-client.js`.

Exports `VALID_HEARTBEAT_STATUSES` with identical content to the VS Code copy (same 7 values). Despite 6 commits with substantive validation changes (version field validation, enhanced metadata validation, Keygen key format, Phase 3D version config validation), none modified `VALID_HEARTBEAT_STATUSES`. The allow-list has been frozen at the original 7 speculative values since Jan 27.

`git log --all -S "over_limit"` across the entire Extension repo returns zero results — `over_limit` has never appeared in any JavaScript file in the repo's history. (Investigation Plan, Steps 3, 13 Findings 13.6, 13.8)

#### 3.2.5 HTTP Client and Validation Gate (`mouse-vscode/src/licensing/http-client.js`)

The HTTP client (`mouse-vscode/src/licensing/http-client.js`) contains the validation gate — the single runtime chokepoint where server responses are validated before reaching the HeartbeatManager.

At L195, `validateHeartbeatResponse()` (imported from the shared `licensing/validation.js`) checks the response. If the response's `status` field is not in `VALID_HEARTBEAT_STATUSES`, the function returns `{ success: false }`. The HTTP client then discards the entire server response and substitutes `{ valid: false, status: "error", reason: "Invalid server response" }`.

This gate is the mechanism by which 4 of 6 server statuses (`trial`, `over_limit`, `machine_not_found`, `error`) are silently rejected. The HeartbeatManager never sees the original server response — it receives only the synthetic fallback.

HTTP 400/401/429 responses throw before the gate is reached, so those error codes are handled separately (not affected by the allow-list bug). (Investigation Plan, Step 4)

#### 3.2.6 LicenseChecker (`mouse-vscode/src/licensing/license-checker.js`)

The LicenseChecker (`mouse-vscode/src/licensing/license-checker.js`) contains `sendHeartbeat()` and `startHeartbeat()` methods that are never called from any runtime or test code. The extension uses `HeartbeatManager` exclusively.

These methods represent an earlier heartbeat implementation that was superseded when `HeartbeatManager` was introduced (Jan 26, commit `442e3bfe`). The LicenseChecker remains in use for other licensing functions (key validation, activation, deactivation) but its heartbeat methods are dead code. (Investigation Plan, Step 6)

#### 3.2.7 Extension Activation and Command Registration (`extension.js`)

The extension activation sequence (`extension.js`) registers the `mouse.checkForUpdates` command and instantiates the HeartbeatManager.

**`mouse.checkForUpdates`:** Calls `https://api.hic-ai.com/api/version` — a host that does not exist. This command always fails silently. (Investigation Plan, Step 7)

**HeartbeatManager instantiation:** Two patterns exist:
1. **Pre-validation single heartbeat:** Fire-and-forget, no callbacks. Used for initial license validation.
2. **Ongoing loop with 4 callbacks:** `onSuccess`, `onError`, `onStateChange`, `onConcurrentLimitExceeded`. This is the primary heartbeat loop.

**Double-start risk:** No guard prevents `startHeartbeatWithCallbacks` from being called while a HeartbeatManager is already running. A second call creates a new timer with no reference to the first, orphaning the original interval. The orphaned timer fires heartbeats indefinitely. (Investigation Plan, Step 7)

#### 3.2.8 StatusBarManager and Version Notification UI

The StatusBarManager handles the VS Code status bar UI for license state and version notifications.

**`showUpdateAvailable()`:** Functional — displays a status bar item with the new version number and a click action to open the update URL. Works correctly when version data is delivered via heartbeat (provided the response survives the validation gate).

**Two version notification paths:**
1. **Heartbeat-delivered** (functional if gate passes): Version fields in the heartbeat response are passed to `showUpdateAvailable()`. This works for `active` status responses.
2. **Independent `/api/version` endpoint** (broken): `checkForUpdates()` targets `api.hic-ai.com` which doesn't exist.

**SUSPENDED display bug:** Uses `"warning"` as the status bar background type. Valid VS Code `StatusBarItem` background types are `"error"` or `undefined`. The `"warning"` value is silently ignored, resulting in no visual distinction.

**Dead code:** `clearUpdateNotification()` and `showNotification()` methods exist but are never called from any runtime code. (Investigation Plan, Step 8)

#### 3.2.9 Extension Test Coverage — `security.test.js` and Related Suites

**`security.test.js`** (744 lines): Tests CWE-295 (HTTPS enforcement), CWE-306 (license key format), CWE-502 (response schema validation), CWE-693 (offline grace period). Iterates `VALID_HEARTBEAT_STATUSES` confirming each is accepted. However, imports from the dead-code VS Code `validation.js` copy, not the shared runtime copy. Does NOT test `over_limit`, `trial`, `machine_not_found`, or `error` as status values. Does NOT test what happens when a valid-schema but rejected-status response passes through the validation gate. (Investigation Plan, Step 9 Finding 9A)

**`heartbeat.test.js` (VS Code, 678 lines):** Tests start/stop lifecycle, retry logic, state changes via `response.reason` dispatch (correct for the VS Code implementation's actual code, but the code itself is wrong). Tests `machine_not_found` as a reason value and `concurrent_limit` as a reason value — both would never appear in `response.reason` in production. Does NOT test the validation gate. Mock responses bypass `validateHeartbeatResponse()`. (Investigation Plan, Step 9 Finding 9B)

**`heartbeat.test.js` (Shared, 342 lines):** Tests `result.status` dispatch (correct for shared implementation). Tests `device_limit_exceeded` which is NOT in `VALID_HEARTBEAT_STATUSES` and would be rejected at the gate. Does NOT test what happens when the gate returns `{ success: false }`. (Investigation Plan, Step 9 Finding 9C)

**Cross-reference summary:** Tests thoroughly cover statuses the server never emits (`license_expired`, `license_suspended`, `license_revoked`, `concurrent_limit`) while completely missing statuses the server actually emits (`trial`, `over_limit`, `machine_not_found`, `error`). This is the exact inversion of useful test coverage. Five tests assert behavior now known to be incorrect. (Investigation Plan, Step 9 Findings 9E–9F)

#### 3.2.10 Configuration and API Base URL Divergence

Three different API base URLs exist across the codebase:

| Location | URL | Status |
|----------|-----|--------|
| `licensing/constants.js` L13 | `https://staging.hic-ai.com` | Functional (shared runtime) |
| `mouse/src/licensing/constants.js` L204 | `https://api.hic-ai.com` (env-overridable) | Non-existent host |
| `mouse-vscode/src/licensing/config.js` L11 | `https://api.hic-ai.com` (hardcoded) | Non-existent host |

The VS Code extension and Mouse CLI both target a non-existent API host. Only the shared `licensing/` module targets the real staging endpoint. VS Code heartbeats work ONLY because `http-client.js` (shared) is the actual runtime caller — it uses the shared `licensing/constants.js` URL, not the VS Code config's `API_BASE_URL`. The `checkForUpdates()` command, which uses the VS Code config directly, always fails. (Investigation Plan, Step 9 Finding 9G)

---

## 4. Explanation of Identified Bugs

### HB-Issue to Bug Cross-Reference

| HB Issue | Bug(s) | Primary Root Cause |
|----------|--------|--------------------|
| HB-1: Allow-List Mismatch | Bug 1 | Speculative allow-list, never updated |
| HB-2: Wrong Dispatch Field | Bug 2 | Client written before server; `response.reason` vs `response.status` |
| HB-3: `over_limit` Never Reaches Invalid Handler | Bug 3 | `valid: true` bypasses invalid path; not in allow-list |
| HB-4: Non-Existent `/api/version` | Bug 4 | `api.hic-ai.com` does not exist |
| HB-5: Two Divergent HeartbeatManagers | — | Architectural debt (no direct bug; contributes to confusion) |
| HB-6: Two Copies of Allow-List | — | Dead-code copy tested instead of runtime copy |
| HB-7: `over_limit` Missing Version Fields | — | Server-side omission (deferred fix) |
| HB-8: Dead Code in LicenseChecker | — | Superseded implementation not removed |
| HB-9: Phase 3D Non-Functional | Bugs 5, 6 | Compound of HB-1 + HB-2 |
| HB-10: Double-Start Orphaned Timer | Bug 7 | No re-entry guard |
| HB-11: `_mapServerStatusToState` Returns `null` | Bug 8 | UPPERCASE keys vs lowercase values |
| HB-12: SUSPENDED Invalid Status Type | Bug 9 | Invalid VS Code API parameter |

### 4.1 Bug 1: Status Allow-List Blocks Legitimate Server Responses

**Relates to:** HB-1 | **Severity:** CRITICAL | **Repo:** Extension | **Files:** `licensing/validation.js`, `mouse-vscode/src/licensing/validation.js`

**Root cause:** `VALID_HEARTBEAT_STATUSES` was created Jan 27 at 08:12 (`3416c234`), 34 minutes before the server heartbeat route was first committed (`131bca9`, Jan 27 08:46). The 7 values were speculative. The allow-list has never been modified across 6 commits to the shared copy and 2 commits to the VS Code copy. (Investigation Plan, Step 13 Findings 13.6, 13.8)

**Reproduction path:**
1. Server returns `{ valid: true, status: "trial", ... }` for a trial user
2. `http-client.js` L195 calls `validateHeartbeatResponse()` from shared `licensing/validation.js`
3. `validateHeartbeatResponse()` checks `VALID_HEARTBEAT_STATUSES.has("trial")` → `false`
4. Returns `{ success: false }`
5. `http-client.js` discards the entire server response, substitutes `{ valid: false, status: "error", reason: "Invalid server response" }`
6. HeartbeatManager receives the synthetic fallback instead of the real server response

**Affected statuses:** `trial`, `over_limit`, `machine_not_found`, `error` (4 of 6 server-emitted statuses). Only `active` and `invalid` survive the gate. (Investigation Plan, Steps 3, 4, 14 Finding 14.6)

### 4.2 Bug 2: Handler Dispatch Uses Wrong Field (`reason` vs. `status`)

**Relates to:** HB-2 | **Severity:** CRITICAL | **Repo:** Extension | **File:** `mouse-vscode/src/licensing/heartbeat.js` L266

**Root cause:** The VS Code HeartbeatManager was written Jan 26 at 22:55 (`442e3bfe`), approximately 10 hours before the server route existed. The original author anticipated status tokens in `response.reason`. The server instead put tokens in `response.status` and human-readable descriptions in `response.reason`. The switch was never corrected — not even by commit `25a4c875` (Feb 1, "fix: update heartbeat.js to use canonical status field"), which fixed 6 occurrences of a different naming issue in the same file. (Investigation Plan, Step 13 Findings 13.1–13.3)

**Reproduction path:**
1. Server returns `{ valid: false, status: "machine_not_found", reason: "Machine not found for this license" }`
2. Response survives the validation gate (hypothetically, if Bug 1 were fixed)
3. `_handleInvalidHeartbeat` executes `switch (response.reason)` at L266
4. `response.reason` is `"Machine not found for this license"` — a human-readable string
5. No case label matches; falls through to default (silent failure)
6. The `case "machine_not_found"` at L270 would only match if `response.reason` literally equaled the string `"machine_not_found"`, which the server never sends

**The JSDoc `@typedef HeartbeatResponse`** in this file documents `reason` as "Reason for invalid response" — acknowledging it as a description field, yet the switch treats it as a token field. (Investigation Plan, Step 2 Bug 1)

### 4.3 Bug 3: `over_limit` Silently Swallowed in Success Path

**Relates to:** HB-3 | **Severity:** HIGH | **Repo:** Extension + Website | **Files:** `mouse-vscode/src/licensing/heartbeat.js` (success path), `route.js` L305

**Root cause:** The server deliberately returns `over_limit` with `valid: true` (commit `78385d4`, Feb 6: "implement concurrent device handling with soft warnings"). This was a conscious redesign from `valid: false` to a soft warning. However, the client was never updated to handle this.

**Reproduction path (compound — requires Bug 1 to be fixed first):**
1. Server returns `{ valid: true, status: "over_limit", reason: "You're using 4 of 3 allowed devices", concurrentMachines: 4, maxMachines: 3 }`
2. Because `valid === true`, the HeartbeatManager takes the success path (`_handleValidHeartbeat`)
3. `onSuccess` fires (L228) — no version fields in this response (HB-7)
4. `_mapServerStatusToState("over_limit")` returns `null` (not in the mapping table)
5. Falls through to "unknown status" handling — silent failure
6. Meanwhile, `_handleConcurrentLimitExceeded` (the intended handler) lives in the invalid path and is never reached because `valid === true`

**Note:** Even before Bug 1 is fixed, `over_limit` is blocked by the allow-list. This bug becomes visible only after Bug 1 is resolved. (Investigation Plan, Steps 1 Finding 1.5, 2 Bugs 3–5, 14 Finding 14.3)

### 4.4 Bug 4: `checkForUpdates()` References Non-Existent Endpoint and Host

**Relates to:** HB-4 | **Severity:** MEDIUM | **Repo:** Extension | **Files:** `mouse-vscode/src/licensing/config.js` L11, `extension.js`

**Root cause:** The VS Code extension hardcodes `API_BASE_URL` as `https://api.hic-ai.com` (config.js L11). This host does not exist. The `mouse.checkForUpdates` command (registered in `extension.js`) calls `${API_BASE_URL}/api/version`, which always fails silently.

**Three API base URLs exist:**
- `licensing/constants.js` L13: `https://staging.hic-ai.com` (functional, used by shared runtime)
- `mouse/src/licensing/constants.js` L204: `https://api.hic-ai.com` (env-overridable, non-existent)
- `mouse-vscode/src/licensing/config.js` L11: `https://api.hic-ai.com` (hardcoded, non-existent)

Heartbeats work despite this because `http-client.js` uses the shared `licensing/constants.js` URL. Only `checkForUpdates()` uses the VS Code config directly. The `licensing.test.js` L394 confirms: `expect(config.API_BASE_URL).toBe("https://api.hic-ai.com")`. (Investigation Plan, Steps 7, 8, 9 Findings 9D, 9G)

### 4.5 Bug 5: `machine_not_found` Revival Path Unreachable (Compound Failure)

**Relates to:** HB-9 (partial) | **Severity:** CRITICAL | **Repo:** Extension | **File:** `mouse-vscode/src/licensing/heartbeat.js`

**Root cause:** Compound failure of Bug 1 + Bug 2. The `machine_not_found` status is (1) not in `VALID_HEARTBEAT_STATUSES` so it's rejected at the validation gate, and (2) even if it survived, the switch dispatches on `response.reason` which contains a human-readable string, not the token `"machine_not_found"`.

**Reproduction path:**
1. User's machine is deactivated in Keygen (e.g., admin removes a device)
2. Server returns `{ valid: false, status: "machine_not_found", reason: "Machine not found for this license" }`
3. Validation gate rejects `"machine_not_found"` (not in allow-list) → synthetic fallback
4. HeartbeatManager receives `{ valid: false, status: "error", reason: "Invalid server response" }`
5. `_handleInvalidHeartbeat` executes `switch ("Invalid server response")` → no match → silent failure
6. User's extension continues running with stale license state; no recovery attempted

(Investigation Plan, Steps 2 Bug 5, 4)

### 4.6 Bug 6: Phase 3D Machine Recovery Dead on Arrival

**Relates to:** HB-9 (full) | **Severity:** CRITICAL | **Repo:** Extension | **File:** `mouse-vscode/src/licensing/heartbeat.js`, commit `307ee22a`

**Root cause:** Phase 3D machine recovery (`_attemptMachineRevival`) was added Feb 12 and wired to `case "machine_not_found"` inside the `switch (response.reason)` block. The developer who added this feature built on top of the existing (broken) switch without realizing the switch field was wrong.

**Why it's dead on arrival:**
1. `machine_not_found` fails the allow-list (Bug 1) → never reaches HeartbeatManager
2. Even if it did, `switch (response.reason)` would receive `"Machine not found for this license"`, not `"machine_not_found"` (Bug 2)
3. `_attemptMachineRevival()` calls `activateLicense()` and updates `machineId` on success — the logic itself appears correct, but it can never execute

The VS Code heartbeat tests DO test machine revival (L323: `reason: "machine_not_found"`) and it passes — because the test mocks bypass the validation gate and feed `reason: "machine_not_found"` directly, which is exactly what the switch expects but the server never sends. (Investigation Plan, Steps 2 Bug 6, 9 Finding 9B, 13 Finding 13.4)

### 4.7 Bug 7: Double-Start `HeartbeatManager` Orphaned Timer

**Relates to:** HB-10 | **Severity:** MEDIUM | **Repo:** Extension | **File:** `extension.js`

**Root cause:** The extension activation sequence can instantiate a HeartbeatManager in two patterns (pre-validation single heartbeat and ongoing loop with callbacks). No guard prevents `startHeartbeatWithCallbacks` from being called while a HeartbeatManager is already running.

**Reproduction path:**
1. Extension activates, creates HeartbeatManager #1 with `setInterval` (10-min cycle)
2. User triggers license re-entry or re-activation flow
3. `startHeartbeatWithCallbacks` is called again, creating HeartbeatManager #2 with a new `setInterval`
4. No reference to HeartbeatManager #1's interval ID is retained
5. HeartbeatManager #1's timer continues firing heartbeats indefinitely — orphaned
6. Two parallel heartbeat loops now run, doubling API calls and potentially causing race conditions

(Investigation Plan, Step 7)

### 4.8 Bug 8: `_mapServerStatusToState` Incomplete Mapping Table

**Relates to:** HB-11 | **Severity:** HIGH | **Repo:** Extension | **File:** `mouse-vscode/src/licensing/heartbeat.js` L390–415

**Root cause:** `_mapServerStatusToState()` uses a mapping object with UPPERCASE keys: `ACTIVE`, `LICENSED`, `SUSPENDED`, `EXPIRED`, `REVOKED`. The validation allow-list passes through lowercase values from the server: `active`, `license_suspended`, etc. The lookup `mapping[status]` returns `undefined` for every lowercase key.

**Reproduction path (for `active` status — the only one that survives the gate):**
1. Server returns `{ valid: true, status: "active" }`
2. Passes validation gate (`"active"` is in allow-list)
3. `_handleValidHeartbeat` calls `_mapServerStatusToState("active")`
4. Mapping object has key `"ACTIVE"` but not `"active"` → returns `null`
5. Falls through to "unknown status" handling
6. The heartbeat is effectively treated as unrecognized despite being the happy path

No test catches this because tests mock responses that bypass the validation gate and feed pre-constructed state values. (Investigation Plan, Steps 2, 9 Finding 9B key discrepancy)

### 4.9 Bug 9: SUSPENDED Status Bar Invalid Status Type

**Relates to:** HB-12 | **Severity:** LOW | **Repo:** Extension | **File:** StatusBarManager

**Root cause:** The SUSPENDED state display sets the status bar background type to `"warning"`. Valid VS Code `StatusBarItem` background types are `StatusBarItemBackgroundColor` instances created from `"error"` or left `undefined`. The string `"warning"` is silently ignored by the VS Code API.

**Impact:** When a license is suspended, the status bar item appears with default styling instead of a visually distinct warning appearance. The text content is correct; only the visual emphasis is missing. (Investigation Plan, Step 8)

### 4.10 Bug 10: `lastHeartbeat` Type Inconsistency Between HeartbeatManagers

**Relates to:** (no HB issue — minor inconsistency) | **Severity:** LOW | **Repo:** Extension

**Root cause:** The VS Code HeartbeatManager stores `lastHeartbeat` as a Unix timestamp (number via `Date.now()`), while the shared HeartbeatManager stores it as an ISO 8601 string (via `new Date().toISOString()`). Any code that reads `lastHeartbeat` from one implementation and passes it to the other would encounter a type mismatch.

**Current impact:** Minimal — the two HeartbeatManagers are not used interchangeably at runtime. This becomes relevant only if the implementations are consolidated (deferred fix). (Investigation Plan, Step 2 Bug 10)

### 4.11 Bug 11: `onSuccess` Fires Before Validity Check

**Relates to:** (no HB issue — minor ordering concern) | **Severity:** LOW | **Repo:** Extension | **File:** `mouse-vscode/src/licensing/heartbeat.js` L228

**Root cause:** In `_handleValidHeartbeat`, the `onSuccess` callback fires at L228 before the status mapping and validity checks that follow. This means `onSuccess` is called even for responses that will subsequently be identified as problematic (e.g., unknown status after `_mapServerStatusToState` returns `null`).

**Current impact:** Low — mitigated by the fact that the validation gate's fallback response (`{ valid: false, status: "error", reason: "Invalid server response" }`) lacks version fields, so `onSuccess` receiving it does not trigger version notification UI. However, if Bug 1 is fixed and more statuses survive the gate, `onSuccess` would fire for `over_limit` responses before the success path determines it doesn't know how to handle them. (Investigation Plan, Step 2 Bug 2)

---

## 5. Proposed Fixes

### 5.1 Fix 1: Expand `VALID_HEARTBEAT_STATUSES` in Both Copies

**Fixes:** Bug 1 (HB-1) | **Repo:** Extension | **Priority:** Highest (unblocks all other fixes)
**Files:** `licensing/validation.js` (runtime copy), `mouse-vscode/src/licensing/validation.js` (dead-code copy)

Add `trial`, `over_limit`, `machine_not_found`, `error` to `VALID_HEARTBEAT_STATUSES` in both copies. The runtime copy is the critical change; the dead-code copy should be updated for consistency and to prevent test confusion.

**Before (both copies):**
```js
const VALID_HEARTBEAT_STATUSES = new Set([
  "active", "license_expired", "license_suspended",
  "license_revoked", "concurrent_limit", "valid", "invalid",
]);
```

**After (both copies):**
```js
const VALID_HEARTBEAT_STATUSES = new Set([
  "active", "license_expired", "license_suspended",
  "license_revoked", "concurrent_limit", "valid", "invalid",
  "trial", "over_limit", "machine_not_found", "error",
]);
```

**Risk:** Low. Adding values to an allow-list is additive — no existing behavior changes. Responses that previously passed the gate (`active`, `invalid`) continue to pass. Responses that were previously rejected now pass through to the HeartbeatManager, where they must be handled (Fixes 2, 3, 7).

**Dependency:** None. This fix can be applied first and independently. However, it should be deployed alongside Fixes 2 and 7 to ensure newly-admitted statuses are handled correctly.

### 5.2 Fix 2: Switch `_handleInvalidHeartbeat` Dispatch from `response.reason` to `response.status`

**Fixes:** Bug 2 (HB-2) | **Repo:** Extension | **Priority:** Highest (unblocks invalid-path handlers)
**File:** `mouse-vscode/src/licensing/heartbeat.js` L266

Change `switch (response.reason)` to `switch (response.status)` in `_handleInvalidHeartbeat`.

**Before:**
```js
switch (response.reason) {
```

**After:**
```js
switch (response.status) {
```

**Impact:** All case labels (`license_suspended`, `license_expired`, `license_revoked`, `concurrent_limit`, `machine_not_found`) become reachable. The `machine_not_found` case activates Phase 3D machine recovery. The `concurrent_limit` case activates `_handleConcurrentLimitExceeded`.

**Risk:** Low. The switch was previously unreachable (every case was dead code). Enabling it introduces new behavior for invalid responses, but that behavior was the original design intent. The case labels must be verified against actual server statuses — note that the server sends `over_limit` (not `concurrent_limit`) for device-limit scenarios, so the `concurrent_limit` case may still not match. See Fix 3 for the `over_limit` handling.

**Dependency:** Should be deployed with Fix 1 (allow-list expansion) so that `machine_not_found` and other statuses actually reach this switch.

### 5.3 Fix 3: Add `over_limit` Detection in Success Path

**Fixes:** Bug 3 (HB-3) | **Repo:** Extension | **Priority:** High
**File:** `mouse-vscode/src/licensing/heartbeat.js` (success path in `_handleValidHeartbeat`)

The `over_limit` status arrives with `valid: true`, so it takes the success path. The success path must detect `over_limit` and route it to the appropriate handler (`onConcurrentLimitExceeded` callback).

**Proposed approach:** After the `_mapServerStatusToState` call in the success path, add an explicit check:
```js
if (response.status === "over_limit") {
  this._handleConcurrentLimitExceeded(response);
  return;
}
```

Alternatively, add `over_limit` to `_mapServerStatusToState` with a dedicated state value and handle it in the state-change logic.

**Risk:** Medium. This introduces new runtime behavior for over-limit users who previously experienced silent failure. The `onConcurrentLimitExceeded` callback must be verified to handle the response shape correctly (it receives `concurrentMachines` and `maxMachines` from the server response).

**Dependency:** Requires Fix 1 (allow-list) so `over_limit` reaches the HeartbeatManager.

### 5.4 Fix 4: Remove `checkForUpdates()` and Custom Version Notification Layer

**Fixes:** Bug 4 (HB-4) | **Repo:** Extension | **Priority:** Medium
**Files:** `extension.js` (command registration), `mouse-vscode/src/licensing/config.js` L11

Two options:

**Option A (Recommended): Remove `checkForUpdates()` entirely.** Version notifications are already delivered via the heartbeat response (when the validation gate passes). The independent `/api/version` endpoint adds complexity, targets a non-existent host, and duplicates functionality. Remove the `mouse.checkForUpdates` command registration and the associated code.

**Option B: Fix the URL.** Change `API_BASE_URL` in `config.js` from `https://api.hic-ai.com` to `https://staging.hic-ai.com` (or the production URL when ready). This requires also implementing the `/api/version` endpoint on the website, which does not currently exist.

**Risk:** Low for Option A (removing dead code). Medium for Option B (requires new endpoint implementation).

**Dependency:** None. Independent of other fixes.

### 5.5 Fix 5: Update Tests for New Behavior

**Fixes:** Test coverage gaps identified in Steps 9–10 | **Repo:** Extension | **Priority:** High
**Files:** `mouse-vscode/tests/heartbeat.test.js`, `mouse-vscode/tests/security.test.js`, `licensing/tests/heartbeat.test.js`

Required test changes:

1. **Add tests for actual server statuses:** `trial`, `over_limit`, `machine_not_found`, `error` must be tested through the validation gate (not bypassing it with mocks)
2. **Fix `concurrent_limit` test:** Update to use `over_limit` (the actual server status) or add `over_limit` as an additional test case
3. **Fix `device_limit_exceeded` test (shared):** Update to use `over_limit` (the current server status after the Feb 6 rename)
4. **Add validation gate integration tests:** Test what happens when `validateHeartbeatResponse()` receives each of the 6 server statuses, verifying which pass and which are rejected
5. **Fix 5 tests asserting incorrect behavior** (identified in Step 9 Finding 9F): security.test.js allow-list iteration, security.test.js dead-code import, VS Code heartbeat.test.js `concurrent_limit`, shared heartbeat.test.js `device_limit_exceeded`, `_mapServerStatusToState` case mismatch

**Risk:** Medium. Test changes must accurately reflect the new behavior after Fixes 1–3 are applied. Tests should be written to match the fixed behavior, not the current broken behavior.

**Dependency:** Should be written after Fixes 1–3 are implemented so tests validate the corrected code.

### 5.6 Fix 6: Guard Against Double-Start in `startHeartbeatWithCallbacks`

**Fixes:** Bug 7 (HB-10) | **Repo:** Extension | **Priority:** Medium
**File:** `extension.js`

Add a guard to prevent creating a second HeartbeatManager when one is already running. Options:

1. **Module-level singleton:** Store the HeartbeatManager instance in a module-scoped variable. Before creating a new one, check if one exists and call `stop()` on it first.
2. **Guard flag:** Add an `isRunning` check before `startHeartbeatWithCallbacks` that returns early if a heartbeat loop is already active.

**Risk:** Low. Preventing double-start is strictly defensive. The only consideration is ensuring the guard doesn't prevent legitimate restart scenarios (e.g., after license re-activation).

**Dependency:** None. Independent of other fixes.

### 5.7 Fix 7: Add `over_limit`, `trial`, `machine_not_found`, `error` to `_mapServerStatusToState`

**Fixes:** Bug 8 (HB-11) | **Repo:** Extension | **Priority:** High
**File:** `mouse-vscode/src/licensing/heartbeat.js` L390–415

Update the mapping object to handle lowercase server statuses and add the 4 missing statuses:

**Before:**
```js
const mapping = {
  ACTIVE: "LICENSED",
  LICENSED: "LICENSED",
  SUSPENDED: "SUSPENDED",
  EXPIRED: "EXPIRED",
  REVOKED: "EXPIRED",
};
```

**After:**
```js
const mapping = {
  active: "LICENSED",
  licensed: "LICENSED",
  suspended: "SUSPENDED",
  expired: "EXPIRED",
  revoked: "EXPIRED",
  trial: "TRIAL",
  over_limit: "OVER_LIMIT",
  machine_not_found: "MACHINE_NOT_FOUND",
  error: "ERROR",
};
```

The state manager and any downstream consumers must also handle the new state values (`TRIAL`, `OVER_LIMIT`, `MACHINE_NOT_FOUND`, `ERROR`). The exact state values should be aligned with the extension's existing state enum.

**Risk:** Medium. This changes the mapping for the `active` happy path (previously returned `null` due to case mismatch, now returns `"LICENSED"`). Verify that downstream code handles `"LICENSED"` correctly — it likely does, since this was the original design intent.

**Dependency:** Should be deployed with Fix 1 (allow-list) so newly-admitted statuses are mapped correctly.

### 5.8 Fix 8: Add Valid SUSPENDED Status Type to StatusBarManager

**Fixes:** Bug 9 (HB-12) | **Repo:** Extension | **Priority:** Low
**File:** StatusBarManager (SUSPENDED state handler)

Change the status bar background type from `"warning"` to a valid VS Code `StatusBarItemBackgroundColor`. Use `new vscode.ThemeColor("statusBarItem.warningBackground")` or `new vscode.ThemeColor("statusBarItem.errorBackground")` depending on the desired visual emphasis.

**Risk:** Very low. Cosmetic change only.

**Dependency:** None. Independent of other fixes.

### 5.9 Fix 9: Move `onSuccess` Below Validity Check

**Fixes:** Bug 11 (minor) | **Repo:** Extension | **Priority:** Low
**File:** `mouse-vscode/src/licensing/heartbeat.js` L228

Move the `onSuccess(response)` call below the status mapping and validity checks in `_handleValidHeartbeat`. The callback should fire only after the response has been fully processed and determined to be a genuinely successful heartbeat.

**Risk:** Low. Changes the timing of the `onSuccess` callback. Any code that depends on `onSuccess` firing before status processing would need adjustment, but this is unlikely given the callback's purpose.

**Dependency:** None, but best applied after Fix 7 (mapping fix) so the validity check is meaningful.

### 5.10 Deferred: Consolidate Two HeartbeatManager Implementations

**Relates to:** HB-5 | **Repo:** Extension | **Rationale for deferral:** The two implementations serve different architectural roles (VS Code extension vs shared library). Consolidation requires deciding which patterns to keep (e.g., `setTimeout` chaining vs `setInterval`, options-object vs positional parameters) and updating all consumers. This is a refactoring effort that does not fix any user-facing bug — the active fixes (1–9) address all identified bugs without requiring consolidation.

**Recommended approach when undertaken:** Adopt the shared HeartbeatManager's architecture (`setTimeout` chaining, `result.status` dispatch, options-object constructor) and retrofit the VS Code-specific features (machine revival, 4-callback pattern) into it.

### 5.11 Deferred: Add Version Fields to `over_limit` Back-End Response

**Relates to:** HB-7 | **Repo:** Website | **Rationale for deferral:** The `over_limit` response path (route.js L320–329) omits version fields. Adding `getVersionConfig()` and version fields to this path is a non-blocking improvement — over-limit users will still receive version notifications on their next successful heartbeat (when they drop below the device limit). The extension-side fixes (1–9) are higher priority because they affect all non-`active` statuses.

**Recommended approach when undertaken:** Add `const versionConfig = await getVersionConfig();` before the over-limit return statement and include the 7 version fields in the response, matching the `trial` and `active` response shapes.

### 5.12 Deferred: Fix `lastHeartbeat` Type Inconsistency

**Relates to:** Bug 10 | **Repo:** Extension | **Rationale for deferral:** The two HeartbeatManagers are not used interchangeably at runtime. The type inconsistency (`Date.now()` vs `new Date().toISOString()`) only matters if the implementations are consolidated (see §5.10). No user-facing impact.

**Recommended approach when undertaken:** Standardize on ISO 8601 strings (`new Date().toISOString()`) for consistency with the server's `lastSeenAt` format and DynamoDB's `readyUpdatedAt` format.

### 5.13 Deferred: Redirect `security.test.js` Imports to Shared Validation Module

**Relates to:** HB-6 (partial) | **Repo:** Extension | **Rationale for deferral:** `security.test.js` imports `VALID_HEARTBEAT_STATUSES` from the dead-code VS Code copy (`mouse-vscode/src/licensing/validation.js`) instead of the shared runtime copy (`licensing/validation.js`). The two copies have identical allow-lists today, so test results are currently correct. However, if the copies ever diverge, the security tests would validate the wrong contract.

**Recommended approach when undertaken:** Change the import in `security.test.js` from `'../src/licensing/validation.js'` to `'../../licensing/validation.js'` (the shared runtime copy). Verify all test assertions still pass.

---

## 6. User Journeys Before and After Completion of Proposed Fixes

> **⚠️ E2E VALIDATION REQUIRED:** The "Before Fixes" paths below are derived from source-code analysis (Steps 1–14) and have NOT been validated via live end-to-end testing. Before any fixes are implemented, SWR must perform the E2E validation workflow specified for each journey to confirm the current behavior matches the analysis. If any discrepancy is found, the investigation must be reassessed and findings updated before proceeding. The "After Fixes" paths describe expected behavior contingent on the proposed fixes being correctly implemented.

### 6.1 Journey A: Happy-Path Active User Heartbeat

#### Code Path Trace

`extension.js` → `HeartbeatManager.start()` → `http-client.js` sends POST to `https://staging.hic-ai.com/api/license/heartbeat` with `{ licenseKey, fingerprint, machineId }` → `route.js` validates key, pings Keygen, queries DynamoDB for active devices → returns `{ valid: true, status: "active", reason: "Heartbeat successful", latestVersion, readyVersion, ... }` → `http-client.js` L195 calls `validateHeartbeatResponse()` → `"active"` is in allow-list → passes gate → HeartbeatManager receives full response → `_handleValidHeartbeat` → `onSuccess(response)` fires → `_mapServerStatusToState("active")` → returns `null` (UPPERCASE key mismatch) → falls to unknown status handling.

#### Before Fixes

The happy path works partially. The heartbeat completes, `onSuccess` fires (delivering version fields to the StatusBarManager for update notification), and the server records the device's `lastSeenAt`. However, `_mapServerStatusToState` returns `null` for `"active"` due to the case mismatch (Bug 8/HB-11), so the license state is never formally updated to `LICENSED` via the state manager. The extension continues operating because the `onSuccess` callback handles version notification independently of the state mapping.

**E2E validation:** Install Mouse on a device with an active license. Observe heartbeat network traffic (DevTools or proxy). Confirm response contains `status: "active"` and version fields. Confirm status bar shows active license. Confirm version notification appears if a newer version exists.

#### After Fixes

Identical to Before, except `_mapServerStatusToState("active")` now returns `"LICENSED"` (Fix 7 — lowercase keys). The state manager is formally updated. `onSuccess` fires after the validity check (Fix 9). No functional change to the user experience, but the internal state is now correct.

### 6.2 Journey B: Over-Limit User (e.g., 4 Devices on 3-Device Plan)

#### Code Path Trace

`route.js` receives heartbeat → queries `getActiveDevicesInWindow()` → finds 4 active devices, `maxMachines: 3` → `overLimit = true` → early return at L319 → returns `{ valid: true, status: "over_limit", reason: "You're using 4 of 3 allowed devices", concurrentMachines: 4, maxMachines: 3, message: "..." }` (no version fields) → `http-client.js` L195 calls `validateHeartbeatResponse()` → `"over_limit"` is NOT in allow-list → gate rejects → substitutes `{ valid: false, status: "error", reason: "Invalid server response" }` → HeartbeatManager receives synthetic fallback → `_handleInvalidHeartbeat` → `switch ("Invalid server response")` → no match → silent failure.

#### Before Fixes

The over-limit user experiences complete silent failure. The extension receives no indication that the user has exceeded their device limit. No UI notification, no callback to `onConcurrentLimitExceeded`, no state change. The user continues using Mouse normally on all 4 devices with no awareness of the policy violation. The server correctly detects the over-limit condition but the client silently discards the information.

**E2E validation:** Activate a license on 4 devices where `maxMachines: 3`. Trigger a heartbeat from the 4th device. Observe network traffic to confirm server returns `over_limit` with `valid: true`. Confirm the extension shows no over-limit warning or notification.

#### After Fixes

After Fixes 1 (allow-list) + 3 (success-path detection) + 7 (mapping): `"over_limit"` passes the gate → HeartbeatManager success path detects `over_limit` → routes to `onConcurrentLimitExceeded` callback → user sees a notification that they are using 4 of 3 allowed devices. The heartbeat continues (soft warning, not blocking). No version fields in this response (HB-7, deferred), so no version notification for this heartbeat cycle.

### 6.3 Journey C: Machine Not Found / Deactivated Device

#### Code Path Trace

`route.js` receives heartbeat → calls Keygen machine heartbeat ping → Keygen returns 404 (machine deactivated) → `route.js` returns `{ valid: false, status: "machine_not_found", reason: "Machine not found for this license" }` → `http-client.js` gate rejects `"machine_not_found"` (not in allow-list) → substitutes synthetic fallback → HeartbeatManager receives `{ valid: false, status: "error", reason: "Invalid server response" }` → `_handleInvalidHeartbeat` → `switch ("Invalid server response")` → no match → silent failure. Phase 3D `_attemptMachineRevival` never triggers.

#### Before Fixes

The user whose device was deactivated (e.g., by an admin removing it from the license) experiences silent failure. The extension continues running with stale license state. No machine revival is attempted. No notification that the device is no longer authorized. The user discovers the problem only when they encounter a different licensing check or when the extension is restarted.

**E2E validation:** Activate a license on a device, then deactivate the machine via Keygen admin or the HIC admin portal. Trigger a heartbeat from the deactivated device. Observe network traffic to confirm server returns `machine_not_found`. Confirm the extension shows no error or recovery prompt.

#### After Fixes

After Fixes 1 (allow-list) + 2 (dispatch field): `"machine_not_found"` passes the gate → `_handleInvalidHeartbeat` → `switch (response.status)` → `case "machine_not_found"` matches → `_attemptMachineRevival()` executes → calls `activateLicense()` to re-register the machine → if successful, updates `machineId` and continues heartbeat loop. If revival fails, the error is handled gracefully (no crash). User may see a brief interruption followed by automatic recovery.

### 6.4 Journey D: Trial User Heartbeat

#### Code Path Trace

`extension.js` → HeartbeatManager sends POST with fingerprint only (no license key) → `route.js` detects trial flow → calls `getVersionConfig()` → returns `{ valid: true, status: "trial", latestVersion: "0.10.10", readyVersion: "0.10.10", ... }` with all 7 version fields → `http-client.js` gate checks `"trial"` → NOT in allow-list → gate rejects → substitutes `{ valid: false, status: "error", reason: "Invalid server response" }` → HeartbeatManager receives synthetic fallback → `_handleInvalidHeartbeat` → silent failure.

#### Before Fixes

Trial users experience silent heartbeat failure. The server correctly returns trial status with version information, but the client discards it. Trial users receive no version notifications via heartbeat. The trial itself still functions (the extension checks trial status via other mechanisms), but the heartbeat loop provides no value to trial users.

**E2E validation:** Install Mouse without activating a license (trial mode). Trigger a heartbeat. Observe network traffic to confirm server returns `status: "trial"` with version fields. Confirm the extension does not display version update notifications received via heartbeat.

#### After Fixes

After Fix 1 (allow-list) + Fix 7 (mapping with `trial` → `TRIAL`): `"trial"` passes the gate → HeartbeatManager success path (since trial heartbeats have `valid: true`) → `_mapServerStatusToState("trial")` returns `"TRIAL"` → state manager updated → `onSuccess` fires with version fields → StatusBarManager can display version notification. Trial users now receive version update notifications via heartbeat.

### 6.5 Journey E: Server Error During Heartbeat

#### Code Path Trace

`route.js` encounters an internal error (e.g., DynamoDB timeout, Keygen API failure) → returns `{ valid: false, status: "error", reason: "Internal server error", concurrentMachines, maxMachines }` → `http-client.js` gate checks `"error"` → NOT in allow-list → gate rejects → substitutes `{ valid: false, status: "error", reason: "Invalid server response" }` → HeartbeatManager receives synthetic fallback (which happens to have the same `status: "error"` as the original, but a different `reason`) → `_handleInvalidHeartbeat` → `switch ("Invalid server response")` → no match → silent failure.

#### Before Fixes

Server errors are silently swallowed. The extension's retry logic (exponential backoff, 3 retries) will attempt the heartbeat again, but if the server continues returning `error` status, each attempt is silently discarded. The `onError` callback is never called because the synthetic fallback takes the invalid path, not the error path.

**E2E validation:** This is difficult to trigger intentionally without server-side manipulation. One approach: temporarily misconfigure the DynamoDB table name in the Lambda environment to force an internal error. Alternatively, observe behavior during a known AWS outage or by throttling the DynamoDB table.

#### After Fixes

After Fix 1 (allow-list): `"error"` passes the gate → HeartbeatManager receives the actual server error response → `_handleInvalidHeartbeat` → `switch (response.status)` (Fix 2) → `case "error"` (if added) or default handling → `onError` callback fires → extension can log the error and inform the user if appropriate. Retry logic continues as before.

### 6.6 Journey F: Version Update Notification via Heartbeat

#### Code Path Trace

`route.js` returns `{ valid: true, status: "active", ..., latestVersion: "0.10.10", readyVersion: "0.10.10", readyUpdateUrl: "https://marketplace.visualstudio.com/items?itemName=hic-ai.mouse", readyReleaseNotesUrl: "...", readyUpdatedAt: "2026-02-19T09:00:44.448Z" }` → passes validation gate (`"active"` in allow-list) → HeartbeatManager `_handleValidHeartbeat` → `onSuccess(response)` fires → StatusBarManager receives version fields → compares `readyVersion` against current extension version → if newer, calls `showUpdateAvailable()` → status bar item appears with update prompt.

The version data originates from the EventBridge/Lambda pipeline: daily at 9 AM UTC, the Lambda reads `VERSION#mouse/CURRENT` from DynamoDB and promotes `latestVersion` to `readyVersion`. The heartbeat route reads these fields via `getVersionConfig()` and includes them in the response.

#### Before Fixes

Version notification via heartbeat works for `active` users — this is the one fully functional path. The `onSuccess` callback receives version fields, and `showUpdateAvailable()` displays the update prompt. However, `_mapServerStatusToState` returns `null` (Bug 8), so the state manager is not updated despite the heartbeat succeeding.

The independent `checkForUpdates()` path (via `mouse.checkForUpdates` command) always fails because it targets `api.hic-ai.com` which doesn't exist (Bug 4). Version notification relies entirely on the heartbeat-delivered path.

Trial users and over-limit users receive NO version notifications because their responses are blocked by the validation gate (Bug 1).

**E2E validation:** With an active license, trigger a heartbeat. Confirm version fields are present in the response. If a newer version exists in DynamoDB (`readyVersion` > installed version), confirm the status bar shows an update notification. Also test `mouse.checkForUpdates` command and confirm it fails silently.

#### After Fixes

After Fixes 1 + 7: Version notification now works for `active`, `trial`, and (once deferred Fix 5.11 is applied) `over_limit` users. The `_mapServerStatusToState` case mismatch is resolved (Fix 7), so the state manager is correctly updated. If Fix 4 (Option A) is applied, `checkForUpdates()` is removed entirely, simplifying the version notification to a single heartbeat-delivered path.

### 6.7 Journey G: Business License — 6th Device on 5-Device Plan

#### Code Path Trace

Identical to Journey B but with Business license parameters. `route.js` receives heartbeat → `getActiveDevicesInWindow()` finds 6 active devices, `maxMachines: 5` → `overLimit = true` → early return → `{ valid: true, status: "over_limit", reason: "You're using 6 of 5 allowed devices", concurrentMachines: 6, maxMachines: 5 }` → validation gate rejects `"over_limit"` → synthetic fallback → silent failure.

This journey is specifically called out because the corrupted remediation documents contained an internal contradiction: asserting in one place that a Business user adding a 6th device would be "blocked" while concluding elsewhere that the user would never be blocked. The source code confirms: `over_limit` returns `valid: true` (soft warning, not blocking). The user is NOT blocked — they can continue using all 6 devices. The server merely reports the over-limit condition, which the client currently discards.

#### Before Fixes

Identical to Journey B Before Fixes. The Business user on 6 devices experiences complete silent failure. No notification of the policy violation. All 6 devices continue operating normally. The server's soft warning is silently discarded by the client.

**E2E validation:** Activate a Business license (`maxMachines: 5`) on 6 devices. Trigger a heartbeat from the 6th device. Observe network traffic to confirm `over_limit` with `valid: true`, `concurrentMachines: 6`, `maxMachines: 5`. Confirm no UI notification on the extension.

#### After Fixes

Identical to Journey B After Fixes. The `onConcurrentLimitExceeded` callback fires with `concurrentMachines: 6, maxMachines: 5`. The user sees a notification. All 6 devices continue operating (soft warning, not blocking).

### 6.8 Journey H: License Re-Entry While Heartbeat Running (Double-Start)

#### Code Path Trace

`extension.js` → user triggers license activation or re-entry → `startHeartbeatWithCallbacks` is called → creates new `HeartbeatManager` with `setInterval` → if a previous HeartbeatManager was already running, its interval ID is not stored or cleared → two parallel heartbeat loops now exist.

#### Before Fixes

Two heartbeat timers fire independently at 10-minute intervals. This doubles the API call volume and can cause race conditions if both timers fire simultaneously (e.g., two concurrent `updateDeviceLastSeen` calls, two concurrent state updates). The orphaned timer cannot be stopped because no reference to it is retained.

**E2E validation:** Activate a license, wait for the heartbeat loop to start, then trigger license re-entry (e.g., via the command palette). Monitor network traffic to confirm whether two heartbeat requests fire at the next interval. This may require waiting up to 10 minutes to observe.

#### After Fixes

After Fix 6 (double-start guard): The second call to `startHeartbeatWithCallbacks` either (a) stops the existing HeartbeatManager before creating a new one, or (b) returns early if one is already running. Only one heartbeat loop exists at any time.

---

## 7. Cross-Repo Dependency Analysis

### 7.1 Extension-Only Fixes (No Back-End Changes Required)

### 7.2 Back-End Improvements (Non-Blocking, Recommended)

### 7.3 Implementation Ordering Constraints

### 7.4 Test Infrastructure Corrections

---

## 8. Validation Strategy

### 8.1 Automated Test Requirements

### 8.2 Manual Smoke Test Plan

### 8.3 Staging Verification Procedure

### 8.4 E2E Validation Items Requiring Human Verification

---

## 9. Risk Assessment

### 9.1 Risk of Proposed Changes to Happy-Path

### 9.2 Risk of Deferred Items

### 9.3 Rollback Plan

### 9.4 Reliability of Prior AI-Generated Documentation

---

## 10. Conclusion

---

## Appendix A: Complete Server Response Shape Reference

---

## Appendix B: Git History of Relevant Files

---

## Appendix C: DynamoDB Heartbeat Record Schema

---

## Appendix D: Test Coverage Matrix

---

## Appendix E: Import Chain and Dead Code Map

---

## Document History

| Date       | Author | Changes                                                  |
| ---------- | ------ | -------------------------------------------------------- |
| 2026-02-19 | GC     | Skeleton created — awaiting population via investigation |
| 2026-02-20 | GC     | Structural expansion: +4 HB issues, +6 bugs, +6 fixes, +1 journey, +8 subsections, +2 appendices |
