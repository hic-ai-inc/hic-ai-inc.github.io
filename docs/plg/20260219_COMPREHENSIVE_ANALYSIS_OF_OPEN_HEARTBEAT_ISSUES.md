# Comprehensive Analysis of Open Heartbeat Issues

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

#### 3.1.2 Heartbeat Tests (Unit, Contract, Integration, E2E)

#### 3.1.3 EventBridge Scheduled Tasks and Version Delivery Pipeline

#### 3.1.4 DynamoDB Schema — Heartbeat and Version Records

### 3.2 Extension Repo (`hic`)

#### 3.2.1 VS Code HeartbeatManager (`mouse-vscode/src/licensing/heartbeat.js`)

#### 3.2.2 Shared HeartbeatManager (`licensing/heartbeat.js`)

#### 3.2.3 VS Code Validation Module (`mouse-vscode/src/licensing/validation.js`)

#### 3.2.4 Shared Validation Module (`licensing/validation.js`)

#### 3.2.5 HTTP Client and Validation Gate (`mouse-vscode/src/licensing/http-client.js`)

#### 3.2.6 LicenseChecker (`mouse-vscode/src/licensing/license-checker.js`)

#### 3.2.7 Extension Activation and Command Registration (`extension.js`)

#### 3.2.8 StatusBarManager and Version Notification UI

#### 3.2.9 Extension Test Coverage — `security.test.js` and Related Suites

#### 3.2.10 Configuration and API Base URL Divergence

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
