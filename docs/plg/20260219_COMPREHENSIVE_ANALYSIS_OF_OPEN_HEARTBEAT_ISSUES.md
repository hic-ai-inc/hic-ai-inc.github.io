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

### 1.2 Scope

### 1.3 Methodology

### 1.4 Relationship to Prior Documents and Their Reliability

---

## 2. Summary of Open Issues

### 2.1 HB-1: `VALID_HEARTBEAT_STATUSES` Allow-List Mismatch

### 2.2 HB-2: `_handleInvalidHeartbeat` Switches on `response.reason` Instead of `response.status`

### 2.3 HB-3: `over_limit` Returns `valid: true` — Never Reaches Invalid Handler

### 2.4 HB-4: `checkForUpdates()` Calls Non-Existent `/api/version` Endpoint

### 2.5 HB-5: Two Divergent `HeartbeatManager` Implementations

### 2.6 HB-6: Two Copies of `VALID_HEARTBEAT_STATUSES` (Shared vs. VS Code)

### 2.7 HB-7: `over_limit` Response Missing Version Fields

### 2.8 HB-8: Dead Code in `LicenseChecker` (`startHeartbeat()` / `sendHeartbeat()`)

### 2.9 HB-9: Phase 3D Machine Recovery Non-Functional (Compound of HB-1 + HB-2)

### 2.10 HB-10: Double-Start `HeartbeatManager` Creates Orphaned Timer

### 2.11 HB-11: `_mapServerStatusToState` Returns `null` for All Non-`active` Valid Statuses

### 2.12 HB-12: SUSPENDED Status Bar Uses Invalid Status Type Key

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
