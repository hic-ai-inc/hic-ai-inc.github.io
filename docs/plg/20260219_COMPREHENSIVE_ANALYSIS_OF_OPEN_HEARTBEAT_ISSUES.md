# Comprehensive Analysis of Open Heartbeat Issues

**Date:** 2026-02-19  
**Author:** GC (GitHub Copilot, Claude Opus 4.6)  
**Owner:** SWR  
**Status:** SKELETON — Awaiting population through systematic investigation  
**Companion documents:**

- [Heartbeat Status Alignment Memo (Feb 14)](20260214_HEARTBEAT_STATUS_ALIGNMENT_MEMO.md)
- [Open Heartbeat Issues Remediation Plan (Feb 19, Extension repo)](../../plg/docs/20260219_OPEN_HEARTBEAT_ISSUES_REMEDIATION_PLAN.md)
- [Update to Open Heartbeat Issues Remediation Plan (Feb 19, Launch)](../launch/20260219_UPDATE_TO_OPEN_HEARTBEAT_ISSUES_REMEDIATION_PLAN.md)
- [Daily Plan (Feb 19)](../launch/20260219_DAILY_PLAN.md)

---

## 1. Introduction

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

---

## 3. Description of Current Condition of Both Repos

### 3.1 Website Repo (`hic-ai-inc.github.io`)

#### 3.1.1 Back-End Heartbeat Route (`plg-website/src/app/api/license/heartbeat/route.js`)

#### 3.1.2 Heartbeat Tests

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

---

## 4. Explanation of Identified Bugs

### 4.1 Bug 1: Status Allow-List Blocks Legitimate Server Responses

### 4.2 Bug 2: Handler Dispatch Uses Wrong Field (`reason` vs. `status`)

### 4.3 Bug 3: `over_limit` Silently Swallowed in Success Path

### 4.4 Bug 4: `checkForUpdates()` References Non-Existent Endpoint and Host

### 4.5 Bug 5: `machine_not_found` Revival Path Unreliable Due to `reason` String Matching

---

## 5. Proposed Fixes

### 5.1 Fix 1: Expand `VALID_HEARTBEAT_STATUSES` in Both Copies

### 5.2 Fix 2: Switch `_handleInvalidHeartbeat` Dispatch from `response.reason` to `response.status`

### 5.3 Fix 3: Add `over_limit` Detection in Success Path

### 5.4 Fix 4: Remove `checkForUpdates()` and Custom Version Notification Layer

### 5.5 Fix 5: Update Tests for New Behavior

### 5.6 Deferred: Consolidate Two HeartbeatManager Implementations

### 5.7 Deferred: Add Version Fields to `over_limit` Back-End Response

---

## 6. User Journeys Before and After Completion of Proposed Fixes

### 6.1 Journey A: Happy-Path Active User Heartbeat

#### Before Fixes

#### After Fixes

### 6.2 Journey B: Over-Limit User (e.g., 3 Devices on 2-Device Plan)

#### Before Fixes

#### After Fixes

### 6.3 Journey C: Machine Not Found / Deactivated Device

#### Before Fixes

#### After Fixes

### 6.4 Journey D: Trial User Heartbeat

#### Before Fixes

#### After Fixes

### 6.5 Journey E: Server Error During Heartbeat

#### Before Fixes

#### After Fixes

### 6.6 Journey F: Version Update Notification via Heartbeat

#### Before Fixes

#### After Fixes

### 6.7 Journey G: Business License — 6th Device on 5-Device Plan

#### Before Fixes

#### After Fixes

---

## 7. Cross-Repo Dependency Analysis

### 7.1 Extension-Only Fixes (No Back-End Changes Required)

### 7.2 Back-End Improvements (Non-Blocking, Recommended)

### 7.3 Implementation Ordering Constraints

---

## 8. Validation Strategy

### 8.1 Automated Test Requirements

### 8.2 Manual Smoke Test Plan

### 8.3 Staging Verification Procedure

---

## 9. Risk Assessment

### 9.1 Risk of Proposed Changes to Happy-Path

### 9.2 Risk of Deferred Items

### 9.3 Rollback Plan

---

## 10. Conclusion

---

## Appendix A: Complete Server Response Shape Reference

---

## Appendix B: Git History of Relevant Files

---

## Appendix C: DynamoDB Heartbeat Record Schema

---

## Document History

| Date       | Author | Changes                                                  |
| ---------- | ------ | -------------------------------------------------------- |
| 2026-02-19 | GC     | Skeleton created — awaiting population via investigation |
