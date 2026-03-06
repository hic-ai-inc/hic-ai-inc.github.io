# Suspended Status Naming Disambiguation Plan (v2)

**Date:** March 6, 2026
**Author:** SWR, with research by GitHub Copilot (Claude Opus 4.6) and Kiro (Claude Opus 4.6)
**Status:** Draft — awaiting review and approval
**Parent:** `docs/plg/20260305_KEYGEN_WEBHOOK_REMEDIATION_PLAN.md` (Section 1.8)
**Supersedes:** `docs/plg/20260305_SUSPENDED_NAMING_DISAMBIGUATION_PLAN.md` (v1)

---

## 1. Problem Statement

<!-- TODO: Populate -->

---

## 2. Data Model

### 2.1 DynamoDB Record Types

<!-- TODO: Populate -->

### 2.2 Key Insight: The Two Paths Never Cross the Same Record Type

<!-- TODO: Populate -->

### 2.3 Keygen's Relationship to Internal Status Strings

<!-- TODO: Populate -->

### 2.4 Extension Behavior

<!-- TODO: Populate -->

---

## 3. Pre-Existing Casing Inconsistency

### 3.1 The Problem: Eight Layers of Casing Inconsistency

<!-- TODO: Populate -->

### 3.2 Complete Casing Inventory (22 Source Files)

<!-- TODO: Populate -->

### 3.3 Decision: Standardize on Lowercase

<!-- TODO: Populate -->

### 3.4 Interaction with the Disambiguation Work

<!-- TODO: Populate -->

---

## 4. RETIRED Status — Dead Code Removal

### 4.1 Findings

<!-- TODO: Populate -->

### 4.2 Scope of Removal

<!-- TODO: Populate -->

---

## 5. Complete Affected File Inventory

### 5.1 Payment Suspension Path (LICENSE# and CUSTOMER# Records)

<!-- TODO: Populate -->

### 5.2 Admin Suspension Path (MEMBER# and INVITE# Records)

<!-- TODO: Populate -->

### 5.3 Shared / Ambiguous Paths

<!-- TODO: Populate -->

### 5.4 Email Templates

<!-- TODO: Populate -->

### 5.5 Metrics & Reporting

<!-- TODO: Populate -->

### 5.6 Test Files

<!-- TODO: Populate -->

---

## 6. Implementation Plan

### 6.1 Step 1: Remove RETIRED Dead Code

<!-- TODO: Populate -->

### 6.2 Step 2: Update Constants (Lowercase Values + New Statuses)

<!-- TODO: Populate -->

### 6.3 Step 3: Split Email Templates

<!-- TODO: Populate -->

### 6.4 Step 4: Update Payment Suspension Path

<!-- TODO: Populate -->

### 6.5 Step 5: Update Admin Suspension Path

<!-- TODO: Populate -->

### 6.6 Step 6: Remove .toUpperCase() Bridges and Consolidate Billing Labels

<!-- TODO: Populate -->

### 6.7 Step 7: Close Admin → Keygen Sync Gap

<!-- TODO: Populate -->

### 6.8 Step 8: Update Metrics & Reporting

<!-- TODO: Populate -->

### 6.9 Step 9: Update Extension Casing

<!-- TODO: Populate -->

### 6.10 Step 10: Backward Compatibility / Migration

<!-- TODO: Populate -->

### 6.11 Step 11: Update Tests

<!-- TODO: Populate -->

---

## 7. Sequencing Within the Remediation Plan

<!-- TODO: Populate -->

---

## 8. Risk Mitigation

<!-- TODO: Populate -->

---

## 9. Verification Checklist

<!-- TODO: Populate -->
