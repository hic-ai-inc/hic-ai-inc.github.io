# Stream 1D Completion Plan — Cancellation Email System & Pre-Launch Fixes

**Date:** February 28, 2026
**Author:** Kiro (AI Agent, supervised by SWR)
**Status:** Skeleton — Pending Expansion
**Source:** `docs/plg/20260228_CANCELLATION_EMAIL_REPORT_AND_PRE_LAUNCH_RECOMMENDATIONS.md`
**Tracker:** `docs/launch/20260218_LAUNCH_EXECUTION_TRACKER.md` — Stream 1D, Phase 1

---

## Table of Contents

1. [Overview & Scope](#1-overview--scope)
2. [Reference Architecture](#2-reference-architecture)
3. [Pre-Implementation Checklist](#3-pre-implementation-checklist)
4. [Implementation Tasks](#4-implementation-tasks)
   - [Task 1: Naming Standardization — `CANCELED` / `paymentFailureCount`](#task-1-naming-standardization)
   - [Task 2: Shared Constants — `MAX_PAYMENT_FAILURES` & `CANCELLATION_PENDING`](#task-2-shared-constants)
   - [Task 3: `updateCustomerSubscription` — `clearEmailsSent` Support & Cooldown Guard](#task-3-updatecustomersubscription)
   - [Task 4: Webhook Handler — `handleSubscriptionUpdated`](#task-4-webhook-handler--handlesubscriptionupdated)
   - [Task 5: Webhook Handler — `handleSubscriptionDeleted`](#task-5-webhook-handler--handlesubscriptiondeleted)
   - [Task 6: Webhook Handler — `handlePaymentSucceeded`](#task-6-webhook-handler--handlepaymentsucceeded)
   - [Task 7: customer-update Lambda — Race Condition Fix & `handleSubscriptionDeleted` Alignment](#task-7-customer-update-lambda)
   - [Task 8: Email Templates — New Templates, Updated Mapping, Dead Code Removal](#task-8-email-templates)
   - [Task 9: email-sender Lambda — Guard 2 Logging & `EMAIL_ACTIONS` Rename](#task-9-email-sender-lambda)
   - [Task 10: email-sender Lambda — Org Member Fan-Out Routing](#task-10-email-sender-lambda--org-fan-out)
   - [Task 11: scheduled-tasks Lambda — Win-Back Query Fix & `TRIAL_ENDING` Dead Code Removal](#task-11-scheduled-tasks-lambda)
   - [Task 12: Portal UI — `cancellation_pending` & `expired` Status Display](#task-12-portal-ui)
   - [Task 13: SES Layer Rebuild & Lambda Redeployment](#task-13-ses-layer-rebuild--lambda-redeployment)
5. [Test Plan](#5-test-plan)
   - [Unit Tests](#unit-tests)
   - [Integration Tests](#integration-tests)
   - [E2E Validation Scenarios](#e2e-validation-scenarios)
6. [Deployment Sequence](#6-deployment-sequence)
7. [Rollback Plan](#7-rollback-plan)
8. [Acceptance Criteria](#8-acceptance-criteria)
9. [Files Changed Summary](#9-files-changed-summary)
10. [Open Items & Decisions](#10-open-items--decisions)

---

## 1. Overview & Scope

---

## 2. Reference Architecture

---

## 3. Pre-Implementation Checklist

---

## 4. Implementation Tasks

### Task 1: Naming Standardization

#### 1a. `CANCELLED` → `CANCELED` (American single-L)

#### 1b. `paymentFailedCount` → `paymentFailureCount` (functional bug fix)

---

### Task 2: Shared Constants

#### 2a. Extract `MAX_PAYMENT_FAILURES` to `constants.js`

#### 2b. Add `CANCELLATION_PENDING` to `LICENSE_STATUS` and `LICENSE_STATUS_DISPLAY`

---

### Task 3: `updateCustomerSubscription`

#### 3a. Add `clearEmailsSent` Array Parameter

#### 3b. Implement 24-Hour Cooldown Guard

---

### Task 4: Webhook Handler — `handleSubscriptionUpdated`

#### 4a. `cancel_at_period_end: true` Path — New Event Type & Status

#### 4b. `cancel_at_period_end: false` Path — New Event Type, Status Revert & Dedup Clear

---

### Task 5: Webhook Handler — `handleSubscriptionDeleted`

#### 5a. Determine Expiration Event Type from Prior Status

#### 5b. Set `expired` Status

#### 5c. `statusMap` — Remap `incomplete_expired` to `pending`

---

### Task 6: Webhook Handler — `handlePaymentSucceeded`

#### 6a. Expand Reactivation Trigger to Include `suspended` Status

#### 6b. Clear `emailsSent.PAYMENT_FAILED` on Recovery

---

### Task 7: customer-update Lambda

#### 7a. `handleSubscriptionUpdated` — Skip Redundant Write When Webhook Handled

#### 7b. `handleSubscriptionDeleted` — Align Status & Event Type with New Taxonomy

---

### Task 8: Email Templates

#### 8a. Confirm `TRIAL_ENDING` Dead Code & Remove

#### 8b. Add `cancellationRequested` Template

#### 8c. Add `cancellationReversed` Template

#### 8d. Add `voluntaryCancellationExpired` Template

#### 8e. Add `nonpaymentCancellationExpired` Template

#### 8f. Add `orgCancellationRequested` Template

#### 8g. Add `orgCancellationExpired` Template

#### 8h. Update `EVENT_TYPE_TO_TEMPLATE` Mapping

#### 8i. Update `TEMPLATE_NAMES` Array & Deprecate `SUBSCRIPTION_CANCELLED`

---

### Task 9: email-sender Lambda

#### 9a. Rename `EMAIL_ACTIONS` to `EVENT_TYPE_TO_TEMPLATE`

#### 9b. Add Dedup Logging (Permanent vs. Lifecycle)

---

### Task 10: email-sender Lambda — Org Fan-Out

#### 10a. Account Type Detection & Template Routing

#### 10b. Org Member Query & Fan-Out Logic

---

### Task 11: scheduled-tasks Lambda

#### 11a. Update Win-Back Queries from `canceled` to `expired`

#### 11b. Remove `handleTrialReminder` & `trial-reminder` Job Registration

---

### Task 12: Portal UI

#### 12a. `portal/page.js` — Billing Card `cancellation_pending` Status Display

#### 12b. `portal/billing/page.js` — Status Badge Mapping for New Statuses

---

### Task 13: SES Layer Rebuild & Lambda Redeployment

#### 13a. Rebuild `hic-ses-layer`

#### 13b. Publish New Layer Version

#### 13c. Update Lambda Layer References & Redeploy

---

## 5. Test Plan

### Unit Tests

#### Tests for Task 1 — Naming Standardization

#### Tests for Task 3 — `updateCustomerSubscription` with `clearEmailsSent`

#### Tests for Task 4 — `handleSubscriptionUpdated`

#### Tests for Task 5 — `handleSubscriptionDeleted`

#### Tests for Task 6 — `handlePaymentSucceeded`

#### Tests for Task 7 — customer-update Lambda

#### Tests for Task 8 — Email Templates

#### Tests for Task 9 — email-sender Lambda

#### Tests for Task 10 — Org Fan-Out

#### Tests for Task 11 — scheduled-tasks Lambda

#### Tests for Task 12 — Portal UI

### Integration Tests

### E2E Validation Scenarios

#### Scenario A: Cancel Subscription → Receive Cancellation Email

#### Scenario B: Don't Cancel → Receive Reversal Confirmation

#### Scenario C: Term Expires After Voluntary Cancel → Receive Expiration Email

#### Scenario D: Nonpayment Expiration → Receive Nonpayment Notice

#### Scenario E: Payment Recovery from `past_due` → Receive Reactivation Email

#### Scenario F: Payment Recovery from `suspended` → Receive Reactivation Email

#### Scenario G: Business Account Cancel → Owner + All Members Notified

#### Scenario H: Dedup Guard — Second Cancel After Reversal Sends Fresh Email

#### Scenario I: Cooldown Guard — Rapid Toggle Does Not Flood Email

---

## 6. Deployment Sequence

---

## 7. Rollback Plan

---

## 8. Acceptance Criteria

---

## 9. Files Changed Summary

---

## 10. Open Items & Decisions

---

_Skeleton complete. Expand each section in the next agent session._
