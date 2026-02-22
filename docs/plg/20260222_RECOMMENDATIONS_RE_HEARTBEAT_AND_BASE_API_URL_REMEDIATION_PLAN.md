# Recommendations: Heartbeat and API Base URL Remediation Plan
**Date:** 2026-02-22  
**Author:** Kiro (Qwen3 Coder Next / Opus 4.6)  
**Owner:** SWR  
**Status:** DRAFT — pending SWR review
**Context:** Synthesizes findings from three investigative reports: (1) `20260222_EXTENSION_REPO_API_BASE_URL_INVESTIGATION.md` (Extension repo, `hic`), (2) `20260222_API_BASE_URL_AND_PROD_NAMING_INVESTIGATION.md` (Website repo, `hic-ai-inc.github.io`), and (3) `20260219_COMPREHENSIVE_ANALYSIS_OF_OPEN_HEARTBEAT_ISSUES.md` (both repos). All findings are source-code-verified per the methodology described in each companion report.
**Purpose:** Provide a unified remediation plan that sequences the heartbeat fixes and API_BASE_URL changes into the existing Launch Day plan structure, resolving Phase 0 item 0.4 and informing Stream 1A scope for Phase 1.

---

## 1. Synthesis of Prior Investigative Work

### 1.1 API_BASE_URL Investigation (Extension Repo)

**Source:** `20260222_EXTENSION_REPO_API_BASE_URL_INVESTIGATION.md` (verified against source code in `~/source/repos/hic`)

The extension repo investigation answered the four open questions (H-1 through H-4) from the companion website repo report. Key findings:

1. **No build-time URL switching mechanism exists.** `release-mouse.sh` is a well-structured 6-step pipeline, but no step modifies `API_BASE_URL` or any other URL constant. The esbuild config (`mouse-vscode/scripts/build.js`) has no `define` block, no `replace` plugin, and no environment-variable-driven substitution. The `bundle/` directory is copied verbatim with no transformation.

2. **One line controls all runtime API routing.** `licensing/constants.js` L13 (`export const API_BASE_URL = "https://staging.hic-ai.com"`) is the single source of truth for every licensing API call — heartbeats, validation, activation, deactivation, trial init — via the shared `HttpClient`. The browser-delegated activation URL (`ACTIVATION.ACTIVATE_URL`) is derived from this same value.

3. **Three dead-code references to `api.hic-ai.com` remain.** These were documented as Known Issues #5 and #10 in `licensing/README.md` but never remediated during Stream 1A:
   - `mouse-vscode/src/licensing/config.js` L10 — legacy config, not imported by runtime code
   - `mouse/src/licensing/constants.js` L205 — MCP-side `HttpLicenseProvider`, points to non-existent host
   - `mouse-vscode/src/extension.js` L829 — hardcoded `fetch()` in `checkForUpdates()`, always fails silently

4. **Recommended remediation: Option A (point to production, env var override for staging).** Change the single `API_BASE_URL` to `https://hic-ai.com` with a `process.env.HIC_API_BASE_URL` override. Clean up the three dead references. ~30 minutes, ~8 files. No build pipeline changes required.

5. **User-facing URLs (Category C) already point to production.** `URLS.PRICING`, `URLS.ACTIVATE`, `URLS.PORTAL` in `mouse/src/licensing/constants.js` L236–238 all reference `https://hic-ai.com`. No changes needed.

This investigation resolves decision B-D8: the production API base URL is `https://hic-ai.com`.

### 1.2 API_BASE_URL Investigation (Website Repo)

**Source:** `20260222_API_BASE_URL_AND_PROD_NAMING_INVESTIGATION.md` (verified against source code in this repo)

The website repo investigation identified two distinct issues that had been conflated under "API_BASE_URL investigation" in the planning documents:

1. **`prod` vs. `production` naming split.** CloudFormation templates and infrastructure scripts use `prod` (9 YAML files, 2 shell scripts, parameter files). The Next.js app, Cognito setup script, and Secrets Manager paths use `production`. The split is currently functional because the two naming conventions operate in isolated contexts — CF passes `prod` to Lambda env vars, while the Next.js app detects its environment from `NEXT_PUBLIC_APP_URL` and resolves to `production` for Secrets Manager paths like `plg/production/stripe`. The fragility: if someone renames `prod` → `production` in CF without updating every `IsProduction` condition (`!Equals [!Ref Environment, prod]`) and every Lambda ternary (`ENVIRONMENT === "prod"`), the system breaks silently — SES would create an identity for `production.hic-ai.com` instead of `hic-ai.com`.

2. **Extension API_BASE_URL for production VSIX.** The extension hardcodes `https://staging.hic-ai.com` as its API endpoint. The production VSIX needs `https://hic-ai.com`. The mechanism for switching this was unknown and required the companion Extension repo investigation (§1.1 above).

The two issues intersect at one point: the production URL. CF's `IsProduction` condition ensures `https://hic-ai.com` (not `https://prod.hic-ai.com`) is the production domain. The extension must point to that same domain. The issues can be worked independently.

**Scope of the `prod` → `production` rename (if undertaken):** ~20 files, 1.5–2.5 hours. The S3 bucket references in `parameters/prod.json` (`hic-plg-templates-prod`, `hic-plg-lambda-prod`) refer to production buckets that have not yet been created — the production CloudFormation stack has not been deployed. This means the rename can be done cleanly during the initial production stack deployment (Phase 4 Step 4A) with no migration overhead.

### 1.3 Heartbeat Issues Investigation

**Source:** `20260219_COMPREHENSIVE_ANALYSIS_OF_OPEN_HEARTBEAT_ISSUES.md` (1,251 lines, verified against source code in both repos via 14-step character-by-character investigation)

The heartbeat investigation identified 12 open issues (HB-1 through HB-12), 11 distinct bugs, and proposed 9 active fixes plus 4 deferred improvements. Two root-cause defects cascade into most of the remaining bugs:

1. **HB-1 (CRITICAL): `VALID_HEARTBEAT_STATUSES` allow-list mismatch.** The allow-list was created 34 minutes before the server route existed and has never been updated. It contains 7 speculative values; only 2 (`active`, `invalid`) match actual server-emitted statuses. Four legitimate server statuses — `trial`, `over_limit`, `machine_not_found`, `error` — are rejected at the validation gate in `http-client.js` L195, causing the entire server response to be discarded and replaced with a synthetic fallback.

2. **HB-2 (CRITICAL): `_handleInvalidHeartbeat` dispatches on `response.reason` instead of `response.status`.** The server puts machine-readable tokens in `response.status` and human-readable descriptions in `response.reason`. Every case label in the switch is unreachable. This bug has existed since the first commit (Jan 26) and was not corrected even by a commit titled "fix: update heartbeat.js to use canonical status field" (Feb 1).

**Net effect:** Only the `active` happy-path heartbeat works end-to-end. Trial users, over-limit users, and deactivated-device users all experience silent failure. Phase 3D machine recovery (`_attemptMachineRevival`) is dead on arrival — doubly unreachable due to both root-cause defects. The `_mapServerStatusToState` function returns `null` even for `active` due to a case mismatch (UPPERCASE keys vs. lowercase server values).

**Proposed fix sequence (9 active fixes):** Fix 1 (expand allow-list) → Fix 7 (fix status mapping) → Fix 2 (switch dispatch field) → Fix 3 (add `over_limit` success-path detection) → Fix 9 (reorder `onSuccess` timing) → Fix 5 (update tests) → Fix 6 (double-start guard) → Fix 4 (remove `checkForUpdates()` per B-D1) → Fix 8 (StatusBarManager cosmetic fix). Fix 1 is the gate — all other fixes are ineffective without it.

**SWR decisions already locked:** B-D1 (remove `checkForUpdates()` entirely), ENFORCE-1 (soft enforcement for over-limit: never block, never degrade), SES-SNS-2 (over-limit email pipeline deferred to post-launch), TRIAL-1 (heartbeat to include `trialDaysRemaining`; nag-banner deferred if non-trivial), REVIVAL-1 (machine revival to show toast notification).

---

## 2. Interplay Between API_BASE_URL and Heartbeat Remediation

### 2.1 Shared Dead Code (`api.hic-ai.com` references)

The `api.hic-ai.com` host appears in three files in the Extension repo (§1.1, Category B) and is also the target of the `checkForUpdates()` function identified as HB-4/Bug 4 in the heartbeat investigation. These are the same cleanup targets:

| File | Heartbeat Issue | API_BASE_URL Category | What It Does |
|---|---|---|---|
| `mouse-vscode/src/licensing/config.js` L10 | HB-4 (contributes) | Category B (dead code) | Legacy config with `API_BASE_URL: "https://api.hic-ai.com"`. Not imported by runtime code. Imported only by `licensing.test.js`. |
| `mouse/src/licensing/constants.js` L205 | — | Category B (dead code) | MCP-side `HttpLicenseProvider` base URL. Points to non-existent host. Env var override exists but defaults to dead URL. |
| `mouse-vscode/src/extension.js` L829 | HB-4 (primary) | Category B (dead code) | Hardcoded `fetch("https://api.hic-ai.com/version")` in `checkForUpdates()`. Bypasses shared `HttpClient`. Always fails silently. |

The heartbeat Fix 4 (remove `checkForUpdates()` per B-D1) and the API_BASE_URL Category B cleanup are the same work. Performing them together in Stream 1A eliminates redundancy and ensures no dead `api.hic-ai.com` references survive into the production VSIX.

### 2.2 Convergence at Production VSIX Build

Both the heartbeat fixes and the API_BASE_URL remediation must land before the production VSIX is built (Phase 4 Step 4D). The dependency chain is:

1. **Stream 1A** (Phase 1): Apply all 9 heartbeat fixes + API_BASE_URL Option A remediation (change `licensing/constants.js` L13 to `https://hic-ai.com` with env var override, clean up 3 dead references, update tests, rebuild and verify).
2. **Phase 4 Step 4D**: Build production VSIX. At this point, `licensing/constants.js` already targets `https://hic-ai.com`, all dead `api.hic-ai.com` references are gone, and the heartbeat system handles all 6 server statuses correctly. The VSIX build is a simple `scripts/build.sh --vsix` with no URL substitution needed.

This sequencing means Phase 4 Step 4D becomes trivial — just build and verify. No build pipeline modifications, no sed replacements, no manual edit-build-revert cycles. The production URL is baked into the source code from the moment Stream 1A completes.

### 2.3 Website Repo Back-End Improvements

The heartbeat investigation identified several back-end improvements in the Website repo that are recommended but do not block the Extension repo fixes or the production VSIX build:

1. **Add version fields to `over_limit` response** (route.js L320–329): Currently omits `getVersionConfig()` and all 7 version fields. Over-limit users receive zero version notification data via heartbeat. Non-blocking — over-limit users will receive version notifications on their next successful heartbeat when they drop below the device limit.

2. **Add contract tests for 4 missing server statuses** (`over_limit`, `machine_not_found`, `error`, `invalid`): The contract test only pins `trial` and `active` response shapes. Four of 6 server statuses have zero contract-level coverage.

3. **Clean up dead-code ternaries in success response** (route.js L342, L348–351): `overLimit ? "over_limit" : "active"` is unreachable because L319 returns early for over-limit. Always evaluates to `"active"`, `false`, and `null` respectively.

4. **Reconcile integration test contradiction**: Integration test (L279) asserts `valid: false` for device-limit-exceeded, contradicting both the unit test (`valid: true`) and the actual server (`valid: true`).

These items can be addressed as a preliminary phase of work in this repo before switching to the Extension repo for Stream 1A, or deferred to post-launch. See §3 and §4 for sequencing recommendation.

---

## 3. Recommended Task Sequencing

### 3.1 Phase 0 Completion (Website Repo)

Phase 0 item 0.4 ("Production `API_BASE_URL` investigation — examine `release-mouse.sh`, esbuild config, document mechanism") is complete. The three investigative reports collectively answer every question posed in item 0.4:

- The build mechanism is documented: no build-time URL switching exists; one line in `licensing/constants.js` controls all API routing.
- The simplest path to a production VSIX is Option A: change the hardcoded URL to `https://hic-ai.com` with an env var override for staging testing.
- The `prod` vs. `production` naming split is documented with full scope and effort estimates.
- Decision B-D8 is resolved: the production API base URL is `https://hic-ai.com`.

Item 0.4 should be marked complete in the Execution Tracker. The remaining Phase 0 items (0.1, 0.2, 0.5, 0.6, 0.8–0.11) are unaffected by these findings and can proceed as planned.

**Website repo preliminary work (optional, recommended):** Before switching to the Extension repo for Stream 1A, address the 4 back-end improvements identified in §2.3 as a quick preliminary pass in this repo. These are mechanical fixes (add `getVersionConfig()` to the `over_limit` response path, add contract tests for 4 missing statuses, clean up dead ternaries, fix the integration test contradiction). Estimated effort: 1–2 hours. This ensures the server-side heartbeat route is clean before the client-side fixes land, and provides contract-level test coverage for the response shapes that the Extension repo fixes will depend on.

### 3.2 Stream 1A: Combined Extension Fixes + API_BASE_URL Remediation

Stream 1A combines the 9 heartbeat fixes from the comprehensive analysis with the API_BASE_URL Option A remediation from the extension investigation. The overlap is significant — heartbeat Fix 4 (remove `checkForUpdates()`) and the API_BASE_URL Category B cleanup target the same dead-code files.

**Combined scope:**

| Work Item | Files | Source | Effort |
|---|---|---|---|
| Fix 1: Expand `VALID_HEARTBEAT_STATUSES` allow-list | `licensing/validation.js`, `mouse-vscode/src/licensing/validation.js` | Heartbeat §5.1 | 10 min |
| Fix 7: Fix `_mapServerStatusToState` mapping (lowercase keys + 4 new statuses) | `mouse-vscode/src/licensing/heartbeat.js` | Heartbeat §5.7 | 15 min |
| Fix 2: Switch `_handleInvalidHeartbeat` dispatch from `response.reason` to `response.status` | `mouse-vscode/src/licensing/heartbeat.js` | Heartbeat §5.2 | 5 min |
| Fix 3: Add `over_limit` detection in success path | `mouse-vscode/src/licensing/heartbeat.js` | Heartbeat §5.3 | 15 min |
| Fix 9: Move `onSuccess` below validity check | `mouse-vscode/src/licensing/heartbeat.js` | Heartbeat §5.9 | 5 min |
| Fix 6: Guard against double-start HeartbeatManager | `mouse-vscode/src/extension.js` | Heartbeat §5.6 | 10 min |
| Fix 4 + API_BASE_URL cleanup (combined): Remove `checkForUpdates()`, delete `config.js`, clean up 3 dead `api.hic-ai.com` refs | `mouse-vscode/src/extension.js`, `mouse-vscode/src/licensing/config.js`, `mouse/src/licensing/constants.js` | Heartbeat §5.4 + Extension §7 Steps 2–3 | 20 min |
| API_BASE_URL Option A: Change production URL + add env var override | `licensing/constants.js` | Extension §7 Step 1 | 5 min |
| Fix 8: StatusBarManager SUSPENDED background type | StatusBarManager | Heartbeat §5.8 | 5 min |
| Fix 5: Update tests for new behavior | `mouse-vscode/tests/heartbeat.test.js`, `security.test.js`, `licensing/tests/heartbeat.test.js` | Heartbeat §5.5 | 30 min |
| Fix comments (Category F): Update inaccurate JSDoc references to `api.hic-ai.com` | `mouse-vscode/src/licensing/heartbeat.js`, `mouse/src/licensing/providers/http-provider.js`, `licensing/http-client.js` | Extension §7 Step 4 | 10 min |
| Rebuild and verify compiled output | `mouse-vscode/out/extension.js`, `mouse-vscode/bundle/` | Extension §7 Step 5 | 10 min |
| **Total** | **~15 files** | | **~2.5 hours** |

**Implementation order:** Fix 1 must be first (gates all other fixes). Then Fix 7 (so newly-admitted statuses are mapped). Then Fixes 2, 3, 9 (HeartbeatManager logic). Then Fix 6 (double-start guard). Then the combined Fix 4 + API_BASE_URL cleanup. Then the API_BASE_URL Option A change. Then Fix 8 (cosmetic). Then Fix 5 (tests — written after all code fixes so they validate corrected behavior). Finally, rebuild and verify.

**Env var alignment decision (D-3 from extension investigation):** The MCP-side constants use `HIC_LICENSE_API_BASE_URL` while the proposed shared constants override uses `HIC_API_BASE_URL`. Recommend aligning both to `HIC_API_BASE_URL` during this work.

### 3.3 Phase 4 Step 4A: `prod` → `production` Rename (Website Repo)

**Recommendation: Rename `prod` → `production` during Phase 4 Step 4A (initial production stack deployment).**

The primary justification for deferring this rename was the S3 bucket migration overhead (30–45 minutes to create new buckets, copy content, update references, delete old buckets). However, the production S3 buckets (`hic-plg-templates-prod`, `hic-plg-lambda-prod`) referenced in `parameters/prod.json` do not yet exist — the production CloudFormation stack has never been deployed. This eliminates the migration concern entirely. The rename can be executed cleanly as part of the initial production deployment:

1. Rename `parameters/prod.json` → `parameters/production.json`, update `ParameterValue` to `production`, update S3 bucket names to `hic-plg-templates-production` and `hic-plg-lambda-production`.
2. Update `AllowedValues` in all 9 CF templates: `[dev, staging, production]`.
3. Update `IsProduction` conditions in 4 CF templates: `!Equals [!Ref Environment, production]`.
4. Update `deploy.sh` and `update-lambdas.sh` regex validation.
5. Update Lambda ternaries in `email-sender/index.js` and `scheduled-tasks/index.js`: `=== "production"`.
6. Update infrastructure tests.
7. Deploy the production stack with `./deploy.sh production` — S3 buckets are created fresh with the `production` naming convention.

Estimated effort: 1.5–2 hours, performed atomically during Phase 4 Step 4A. No migration, no risk of breaking the staging stack, and the naming inconsistency is eliminated before launch day. The Cognito setup script fix (Phase 0 item 0.5, changing `ENVIRONMENT="staging"` to `ENVIRONMENT="${1:-staging}"`) is a natural companion — both ensure the production deployment scripts accept `production` as the environment parameter.

This resolves the original concern SWR flagged: `https://${ENVIRONMENT}.hic-ai.com` will never produce `https://production.hic-ai.com` because the `IsProduction` condition (now checking `!Equals [!Ref Environment, production]`) correctly branches to `hic-ai.com` for production and `${Environment}.hic-ai.com` for non-production environments.

### 3.4 Phase 4 Step 4D: Production VSIX Build

Once Stream 1A completes, the production VSIX build is straightforward:

1. Verify `licensing/constants.js` L13 targets `https://hic-ai.com` (confirmed by Stream 1A).
2. Verify no `staging.hic-ai.com` or `api.hic-ai.com` references remain in source (confirmed by Stream 1A rebuild verification).
3. Run `scripts/build.sh --vsix`.
4. Inspect compiled output: `mouse-vscode/out/extension.js` should contain `"https://hic-ai.com"` (not `staging` or `api`). `mouse-vscode/bundle/licensing/constants.js` and `mouse-vscode/bundle/mouse/src/licensing/constants.js` should likewise contain `"https://hic-ai.com"`.
5. E2E verify the production VSIX before Marketplace submission (GC-GAP-2).

No build pipeline modifications are required. No environment flags, no sed replacements, no manual edit-build-revert. The production URL is already in the source code from Stream 1A.

---

## 4. Post-Launch Deferrals

### 4.1 Back-End Improvements

The following Website repo back-end items are recommended but non-blocking for launch. They can be addressed either as a preliminary phase before Stream 1A (recommended — see §3.1) or deferred to post-launch:

1. **Add version fields to `over_limit` response** (route.js L320–329): Add `getVersionConfig()` call and include all 7 version fields (`latestVersion`, `readyVersion`, `readyReleaseNotesUrl`, `readyUpdateUrl`, `readyUpdatedAt`, `releaseNotesUrl`, `updateUrl`) to match the `trial` and `active` response shapes. Over-limit users would then receive version notifications even during over-limit heartbeat cycles.

2. **Add contract tests for `over_limit`, `machine_not_found`, `error`, `invalid`**: Pin the response shapes for all 6 server statuses in `heartbeat-route.contract.test.js`. Currently only `trial` and `active` have contract coverage.

3. **Clean up dead-code ternaries** in the success response path (route.js L342, L348–351): Remove unreachable `overLimit ?` branches that always evaluate to their `false` arm due to the early return at L319.

4. **Reconcile integration test contradiction**: Fix `heartbeat.test.js` (integration) L279 to assert `valid: true` for over-limit, matching both the unit test and the actual server behavior.

5. **Verify SES/SNS downstream pipeline** for `over_limit` events: Per SES-SNS-2 decision, the full pipeline (DDB stream → Lambda → SNS → SES email + analytics) is deferred to post-launch. However, verifying that the DynamoDB stream and Lambda stream-processor infrastructure exists and is correctly configured is low-effort and reduces post-launch implementation risk.

### 4.2 Enhanced Functionality

The following Extension repo items are recommended for post-launch refinement. They do not affect launch-blocking functionality:

1. **Consolidate two HeartbeatManager implementations** (HB-5): The VS Code copy (`mouse-vscode/src/licensing/heartbeat.js`, 440 lines) and the shared copy (`licensing/heartbeat.js`, 314 lines) should be unified. The shared copy's architecture is superior (`setTimeout` chaining, correct dispatch field, options-object constructor). Retrofit VS Code-specific features (machine revival, 4-callback pattern) into the shared implementation and have the extension import from it. This eliminates the maintenance burden of two divergent implementations.

2. **Fix `lastHeartbeat` type inconsistency**: Standardize on ISO 8601 strings (`new Date().toISOString()`) across both HeartbeatManagers for consistency with the server's `lastSeenAt` format and DynamoDB's `readyUpdatedAt` format. Only relevant after consolidation (item 1).

3. **Redirect `security.test.js` imports**: Change the import in `security.test.js` from the dead-code VS Code validation copy (`mouse-vscode/src/licensing/validation.js`) to the shared runtime copy (`licensing/validation.js`). The two copies have identical allow-lists today, but testing the dead-code copy provides zero runtime assurance.

4. **Implement SES/SNS over-limit email notification pipeline** (SES-SNS-1, deferred per SES-SNS-2): DDB stream → Lambda stream-processor → SNS topic → SES subscriber for over-limit notification emails + analytics consumer for persistent-overage user flagging and targeted outreach.

5. **Nag-banner system verification and wire-up** (TRIAL-1): Verify the nag-banner escalation system is functional end-to-end. If non-trivial to wire up, defer further. The heartbeat-delivered `trialDaysRemaining` value (added in Stream 1A) enables the client to calibrate escalation without a separate API call.

---

## 5. Quality Assurance and Code Review Considerations

After Stream 1A fixes land in the Extension repo, the following E2E validation should be performed before the production VSIX build (Phase 4 Step 4D):

1. **Journey A (Happy-path active user):** Verify heartbeat completes, `_mapServerStatusToState("active")` returns `"LICENSED"`, version fields delivered, status bar updated.
2. **Journey B (Over-limit user, e.g., 4 devices on 3-device plan):** Verify `over_limit` passes validation gate, success-path detection routes to `onConcurrentLimitExceeded`, user sees soft-warning notification. All devices continue operating (ENFORCE-1).
3. **Journey C (Machine not found / deactivated device):** Verify `machine_not_found` passes gate, `_handleInvalidHeartbeat` dispatches on `response.status`, `_attemptMachineRevival()` executes, toast notification on success/failure (REVIVAL-1).
4. **Journey D (Trial user):** Verify `trial` passes gate, `_mapServerStatusToState("trial")` returns `"TRIAL"`, version fields delivered, `trialDaysRemaining` available for nag-banner calibration (TRIAL-1).
5. **Journey E (Server error):** Verify `error` passes gate, `onError` callback fires, retry logic continues.
6. **Journey F (Version update notification):** Verify version fields in heartbeat response trigger `showUpdateAvailable()` when `readyVersion` > installed version.
7. **Journey G (Business license, 6th device on 5-device plan):** Same as Journey B with Business parameters. Verify `concurrentMachines: 6, maxMachines: 5` in notification.
8. **Journey H (Double-start guard):** Verify calling `startHeartbeatWithCallbacks` while a HeartbeatManager is running does not create an orphaned timer.

These journeys are defined in detail in the comprehensive heartbeat analysis (§6.1–6.8), including code path traces and specific assertions for both "before fixes" and "after fixes" states. The "before fixes" E2E validation should be performed first to confirm the current broken behavior matches the analysis, then again after fixes to confirm remediation.

**Code review consideration:** The heartbeat fixes touch the licensing enforcement layer — the mechanism that validates whether users are authorized to use Mouse. Given the severity of the root-cause defects (2 CRITICAL, 2 HIGH) and the fact that the existing test suite validates behavior now known to be incorrect, a careful review of the fix implementation against the comprehensive analysis is warranted. The analysis provides exact file paths, line numbers, and reproduction paths for each bug, which can serve as a review checklist.

---

## Appendix: File-by-File Change Summary

### 5.1 Extension Repo Files

**Combined Stream 1A file inventory (Extension repo, `~/source/repos/hic`):**

| # | File | Changes | Source |
|---|---|---|---|
| 1 | `licensing/constants.js` L13 | Change `API_BASE_URL` from `"https://staging.hic-ai.com"` to `"https://hic-ai.com"` with `process.env.HIC_API_BASE_URL` override | Extension §7 Step 1 |
| 2 | `licensing/validation.js` | Add `trial`, `over_limit`, `machine_not_found`, `error` to `VALID_HEARTBEAT_STATUSES` | Heartbeat Fix 1 |
| 3 | `mouse-vscode/src/licensing/validation.js` | Same allow-list update (dead-code copy, for consistency) | Heartbeat Fix 1 |
| 4 | `mouse-vscode/src/licensing/heartbeat.js` L266 | Change `switch (response.reason)` → `switch (response.status)` | Heartbeat Fix 2 |
| 5 | `mouse-vscode/src/licensing/heartbeat.js` (success path) | Add `over_limit` detection → route to `onConcurrentLimitExceeded` | Heartbeat Fix 3 |
| 6 | `mouse-vscode/src/licensing/heartbeat.js` L390–415 | Fix `_mapServerStatusToState` — lowercase keys, add `trial`, `over_limit`, `machine_not_found`, `error` | Heartbeat Fix 7 |
| 7 | `mouse-vscode/src/licensing/heartbeat.js` L228 | Move `onSuccess` below validity check | Heartbeat Fix 9 |
| 8 | `mouse-vscode/src/extension.js` | Remove `checkForUpdates()` function + command registration; add double-start guard for HeartbeatManager | Heartbeat Fixes 4 + 6 |
| 9 | `mouse-vscode/src/licensing/config.js` | Delete file entirely (dead code, not imported at runtime) | Extension §7 Step 2 + Heartbeat Fix 4 |
| 10 | `mouse/src/licensing/constants.js` L205 | Change `BASE_URL` fallback from `"https://api.hic-ai.com"` to `"https://hic-ai.com"`; align env var to `HIC_API_BASE_URL` | Extension §7 Step 2 |
| 11 | StatusBarManager (SUSPENDED state) | Change `"warning"` → valid VS Code `StatusBarItemBackgroundColor` | Heartbeat Fix 8 |
| 12 | `mouse-vscode/src/licensing/heartbeat.js` L4 | Fix JSDoc: `api.hic-ai.com` → `hic-ai.com` | Extension §7 Step 4 |
| 13 | `mouse/src/licensing/providers/http-provider.js` L6, L9 | Fix JSDoc: `api.hic-ai.com` → `hic-ai.com` | Extension §7 Step 4 |
| 14 | `licensing/http-client.js` L31 | Fix JSDoc: `api.hic-ai.com` → `hic-ai.com` | Extension §7 Step 4 |
| 15 | `mouse-vscode/tests/licensing.test.js` L392–393 | Update URL assertion from `api.hic-ai.com` to `hic-ai.com` (or remove if `config.js` is deleted) | Extension §7 Step 3 + Heartbeat Fix 5 |
| 16 | `mouse-vscode/tests/heartbeat.test.js` | Update tests for new dispatch field, new statuses, validation gate integration | Heartbeat Fix 5 |
| 17 | `mouse-vscode/tests/security.test.js` | Update allow-list iteration tests for expanded set | Heartbeat Fix 5 |
| 18 | `licensing/tests/heartbeat.test.js` | Update `device_limit_exceeded` → `over_limit`; add validation gate tests | Heartbeat Fix 5 |

### 5.2 Website Repo Files

**Phase 4 Step 4A file inventory (Website repo, `~/source/repos/hic-ai-inc.github.io`):**

| # | File | Changes | Source |
|---|---|---|---|
| 1 | `plg-website/infrastructure/parameters/prod.json` | Rename to `production.json`; update `ParameterValue` to `production`; update S3 bucket names to `hic-plg-templates-production`, `hic-plg-lambda-production` | Website §2.4 |
| 2–10 | 9 CF templates (`plg-main-stack.yaml`, `plg-iam.yaml`, `plg-ses.yaml`, `plg-compute.yaml`, `plg-dynamodb.yaml`, `plg-messaging.yaml`, `plg-scheduled.yaml`, `plg-monitoring.yaml`, `plg-cognito.yaml`) | Change `AllowedValues: [dev, staging, prod]` → `[dev, staging, production]`; update `IsProduction` condition in 4 templates | Website §2.4 |
| 11 | `plg-website/infrastructure/deploy.sh` | Update regex validation and confirmation check | Website §2.4 |
| 12 | `plg-website/infrastructure/update-lambdas.sh` | Update regex validation | Website §2.4 |
| 13 | `plg-website/infrastructure/lambda/email-sender/index.js` | Change `=== "prod"` → `=== "production"` | Website §2.4 |
| 14 | `plg-website/infrastructure/lambda/scheduled-tasks/index.js` | Change `=== "prod"` → `=== "production"` | Website §2.4 |
| 15–17 | Infrastructure tests (`cloudformation.test.js`, `parameters.test.js`, `deploy.test.js`) | Update all `prod` references to `production` | Website §2.4 |

**Website repo preliminary work (optional, §3.1):**

| # | File | Changes | Source |
|---|---|---|---|
| 1 | `plg-website/src/app/api/license/heartbeat/route.js` L320–329 | Add `getVersionConfig()` and 7 version fields to `over_limit` response | Heartbeat §7.2 item 1 |
| 2 | `plg-website/src/app/api/license/heartbeat/route.js` L342, L348–351 | Remove dead-code ternaries | Heartbeat §7.2 item 3 |
| 3 | `plg-website/__tests__/contract/heartbeat-route.contract.test.js` | Add contract tests for `over_limit`, `machine_not_found`, `error`, `invalid` response shapes | Heartbeat §7.2 item 2 |
| 4 | `plg-website/__tests__/integration/heartbeat.test.js` L279 | Fix `valid: false` → `valid: true` for over-limit assertion | Heartbeat §7.2 item 4 |
