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

### 4.1 Bug 1: Status Allow-List Blocks Legitimate Server Responses

### 4.2 Bug 2: Handler Dispatch Uses Wrong Field (`reason` vs. `status`)

### 4.3 Bug 3: `over_limit` Silently Swallowed in Success Path

### 4.4 Bug 4: `checkForUpdates()` References Non-Existent Endpoint and Host

### 4.5 Bug 5: `machine_not_found` Revival Path Unreachable (Compound Failure)

### 4.6 Bug 6: Phase 3D Machine Recovery Dead on Arrival

### 4.7 Bug 7: Double-Start `HeartbeatManager` Orphaned Timer

### 4.8 Bug 8: `_mapServerStatusToState` Incomplete Mapping Table

### 4.9 Bug 9: SUSPENDED Status Bar Invalid Status Type

### 4.10 Bug 10: `lastHeartbeat` Type Inconsistency Between HeartbeatManagers

### 4.11 Bug 11: `onSuccess` Fires Before Validity Check

---

## 5. Proposed Fixes

### 5.1 Fix 1: Expand `VALID_HEARTBEAT_STATUSES` in Both Copies

### 5.2 Fix 2: Switch `_handleInvalidHeartbeat` Dispatch from `response.reason` to `response.status`

### 5.3 Fix 3: Add `over_limit` Detection in Success Path

### 5.4 Fix 4: Remove `checkForUpdates()` and Custom Version Notification Layer

### 5.5 Fix 5: Update Tests for New Behavior

### 5.6 Fix 6: Guard Against Double-Start in `startHeartbeatWithCallbacks`

### 5.7 Fix 7: Add `over_limit`, `trial`, `machine_not_found`, `error` to `_mapServerStatusToState`

### 5.8 Fix 8: Add Valid SUSPENDED Status Type to StatusBarManager

### 5.9 Fix 9: Move `onSuccess` Below Validity Check

### 5.10 Deferred: Consolidate Two HeartbeatManager Implementations

### 5.11 Deferred: Add Version Fields to `over_limit` Back-End Response

### 5.12 Deferred: Fix `lastHeartbeat` Type Inconsistency

### 5.13 Deferred: Redirect `security.test.js` Imports to Shared Validation Module

---

## 6. User Journeys Before and After Completion of Proposed Fixes

### 6.1 Journey A: Happy-Path Active User Heartbeat

#### Code Path Trace

#### Before Fixes

#### After Fixes

### 6.2 Journey B: Over-Limit User (e.g., 3 Devices on 2-Device Plan)

#### Code Path Trace

#### Before Fixes

#### After Fixes

### 6.3 Journey C: Machine Not Found / Deactivated Device

#### Code Path Trace

#### Before Fixes

#### After Fixes

### 6.4 Journey D: Trial User Heartbeat

#### Code Path Trace

#### Before Fixes

#### After Fixes

### 6.5 Journey E: Server Error During Heartbeat

#### Code Path Trace

#### Before Fixes

#### After Fixes

### 6.6 Journey F: Version Update Notification via Heartbeat

#### Code Path Trace

#### Before Fixes

#### After Fixes

### 6.7 Journey G: Business License — 6th Device on 5-Device Plan

#### Code Path Trace

#### Before Fixes

#### After Fixes

### 6.8 Journey H: License Re-Entry While Heartbeat Running (Double-Start)

#### Code Path Trace

#### Before Fixes

#### After Fixes

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
