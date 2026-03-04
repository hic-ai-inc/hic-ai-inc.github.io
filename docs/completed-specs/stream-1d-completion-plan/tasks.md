# Implementation Plan: Stream 1D Completion Plan

## Overview

Implement the cancellation email system fixes and pre-launch refinements for the subscription lifecycle email pipeline. This covers 4 new event types, 2 new subscription statuses, 4 new email templates, split dedup strategy with cooldown guard, naming standardization, dead code removal, race condition fix, and portal UI updates. All code is JavaScript (ES6+), tested with `dm/facade/test-helpers/index.js` (no external deps). Property-based tests use native Node.js randomized loops (no PBT libraries).

## Tasks

- [-] 1. Naming standardization and shared constants
  - [x] 1.1 Rename `CANCELLED` → `CANCELED` in constants module
    - In `plg-website/src/lib/constants.js`: rename `LICENSE_STATUS.CANCELLED` to `LICENSE_STATUS.CANCELED`, update `LICENSE_STATUS_DISPLAY` label from "Cancelled" to "Canceled"
    - _Requirements: 1.1, 1.3_

  - [x] 1.2 Add `CANCELLATION_PENDING` to `LICENSE_STATUS` and `LICENSE_STATUS_DISPLAY`
    - Add `CANCELLATION_PENDING: "CANCELLATION_PENDING"` to `LICENSE_STATUS`
    - Add `CANCELLATION_PENDING: { label: "Cancellation Pending", variant: "warning" }` to `LICENSE_STATUS_DISPLAY`
    - _Requirements: 2.4, 2.5_

  - [x] 1.3 Extract `MAX_PAYMENT_FAILURES` constant
    - Export `MAX_PAYMENT_FAILURES = 3` from `plg-website/src/lib/constants.js`
    - In `route.js`: import and use `MAX_PAYMENT_FAILURES` instead of hardcoded `3`
    - In `customer-update/index.js`: keep local constant with comment citing canonical value in constants module (Lambda cannot import Next.js modules)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 1.4 Fix `paymentFailedCount` → `paymentFailureCount` in webhook handler
    - In `route.js` line ~636: change `paymentFailedCount: attempt_count` to `paymentFailureCount: attempt_count`
    - _Requirements: 1.2_

  - [x] 1.5 Update test fixtures for naming standardization
    - Rename `cancelledUser` → `canceledUser` in `plg-website/__tests__/fixtures/users.js`
    - Rename `cancelled` → `canceled` in `plg-website/__tests__/fixtures/subscriptions.js`
    - Update re-exports in `plg-website/__tests__/fixtures/index.js`
    - Update references in `team.test.js`, `billing.test.js`, `delete-account.test.js`
    - Leave Stripe-side/Keygen-side string literals unchanged (e.g., `expiry_reason: "subscription_cancelled"`)
    - Leave user-facing URL parameters unchanged (e.g., `cancelled=true` in checkout URLs)
    - _Requirements: 1.5, 1.6_

  - [x] 1.6 Update user-facing copy in portal settings
    - In `portal/settings/page.js` line ~585: change "Your subscription will be cancelled" to "Your subscription will be canceled"
    - _Requirements: 1.4_

  - [x] 1.7 Write unit tests for naming standardization and constants
    - Verify `LICENSE_STATUS.CANCELED` exists, `CANCELLED` does not
    - Verify `MAX_PAYMENT_FAILURES === 3`
    - Verify `CANCELLATION_PENDING` in both `LICENSE_STATUS` and `LICENSE_STATUS_DISPLAY`
    - Verify `paymentFailureCount` attribute name in webhook handler assertions
    - _Requirements: 16.1_

- [-] 2. Implement `updateCustomerSubscription` clearEmailsSent support
  - [x] 2.1 Add `clearEmailsSent` array parameter to `updateCustomerSubscription`
    - In `plg-website/src/lib/dynamodb.js`: extend function signature to accept optional `{ clearEmailsSent = [] }` options object
    - Build combined `SET` + `REMOVE` UpdateExpression: `SET` clause from `updates` object (existing), `REMOVE` clause for each `emailsSent.<key>` in `clearEmailsSent` (new)
    - When `clearEmailsSent` is empty or absent, produce no `REMOVE` clause (backward compatible)
    - Use `ExpressionAttributeNames` for all `clearEmailsSent` keys (safe parameterization, no injection risk)
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 2.2 Write property test for UpdateExpression generation (Property 1)
    - **Property 1: UpdateExpression generation preserves SET and REMOVE clauses**
    - Generate random `updates` objects (1-10 key-value pairs) and random `clearEmailsSent` arrays (0-5 string keys) using `Math.random()` and loops (100 iterations)
    - Verify: every key in `updates` appears in SET clause, every key in `clearEmailsSent` appears in REMOVE clause, empty `clearEmailsSent` produces no REMOVE
    - **Validates: Requirements 3.1, 3.2, 3.3**

  - [x] 2.3 Write unit tests for `updateCustomerSubscription` clearEmailsSent
    - Test empty `clearEmailsSent` → no REMOVE clause
    - Test single key → correct REMOVE expression
    - Test multiple keys → correct REMOVE expression
    - Test backward compat: no options arg at all
    - _Requirements: 16.2_

- [x] 3. Checkpoint — Constants, naming, and DynamoDB helper
  - Ensure all tests pass, ask the user if questions arise.

- [-] 4. Implement webhook handler cancel/uncancel paths with cooldown guard
  - [x] 4.1 Implement cooldown guard logic in webhook handler
    - In `route.js`: add `COOLDOWN_SECONDS = 3600` constant
    - Before writing lifecycle `eventType`, check `dbCustomer.emailsSent?.[eventTypeToWrite]` timestamp
    - If timestamp within 3600s of `Date.now()`: skip `eventType` and `clearEmailsSent` writes, still update `subscriptionStatus`
    - If timestamp absent or older than 3600s: proceed normally
    - Log cooldown guard activation with `eventType` and `priorTimestamp`
    - _Requirements: 3.4, 3.5, 3.6_

  - [x] 4.2 Implement cancel path (`cancel_at_period_end: true`)
    - In `handleSubscriptionUpdated`: set `subscriptionStatus: "cancellation_pending"` (overrides `statusMap` result)
    - Set `eventType: "CANCELLATION_REQUESTED"`
    - Set `clearEmailsSent: ["CANCELLATION_REVERSED"]`
    - Apply cooldown guard before writing `eventType`
    - Pass `clearEmailsSent` to `updateCustomerSubscription` as third argument options object
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 13.3_

  - [x] 4.3 Implement uncancel path (`cancel_at_period_end: false`)
    - In `handleSubscriptionUpdated`: when `!cancel_at_period_end && dbCustomer.cancelAtPeriodEnd`, set `subscriptionStatus: "active"`
    - Set `eventType: "CANCELLATION_REVERSED"`
    - Set `clearEmailsSent: ["CANCELLATION_REQUESTED"]`
    - Apply cooldown guard before writing `eventType`
    - Pass `clearEmailsSent` to `updateCustomerSubscription`
    - _Requirements: 5.1, 5.2, 5.3, 13.4_

  - [x] 4.4 Update `statusMap` to map Stripe `canceled` → `"expired"`
    - In `handleSubscriptionUpdated` `statusMap` object: change `canceled: "canceled"` to `canceled: "expired"`
    - _Requirements: 6.7_

  - [x] 4.5 Write property test for cooldown guard (Property 2)
    - **Property 2: Cooldown guard blocks lifecycle email re-sends within 1 hour**
    - Generate random timestamps (0–7200s offsets from `Date.now()`) using `Math.random()` (100 iterations)
    - Verify: timestamps within 3600s → eventType and clearEmailsSent skipped, subscriptionStatus still updated; timestamps older than 3600s or absent → proceed normally
    - **Validates: Requirements 3.4, 3.5, 3.6, 4.4**

  - [x] 4.6 Write property test for cancel path (Property 3)
    - **Property 3: Cancel path writes cancellation_pending status and CANCELLATION_REQUESTED event**
    - Generate random customer records with varying `emailsSent` maps, fixed `cancel_at_period_end: true` (100 iterations)
    - Verify: `subscriptionStatus: "cancellation_pending"`, `eventType: "CANCELLATION_REQUESTED"`, `clearEmailsSent` includes `"CANCELLATION_REVERSED"`
    - **Validates: Requirements 4.1, 4.2, 4.3, 13.3**

  - [x] 4.7 Write property test for uncancel path (Property 4)
    - **Property 4: Uncancel path reverts to active status and writes CANCELLATION_REVERSED event**
    - Generate random customer records with `cancelAtPeriodEnd: true`, fixed `cancel_at_period_end: false` (100 iterations)
    - Verify: `subscriptionStatus: "active"`, `eventType: "CANCELLATION_REVERSED"`, `clearEmailsSent` includes `"CANCELLATION_REQUESTED"`
    - **Validates: Requirements 5.1, 5.2, 5.3, 13.4**

  - [x] 4.8 Write unit tests for cancel/uncancel paths and cooldown guard
    - Test cancel path writes `cancellation_pending` + `CANCELLATION_REQUESTED` + clears `CANCELLATION_REVERSED`
    - Test uncancel path writes `active` + `CANCELLATION_REVERSED` + clears `CANCELLATION_REQUESTED`
    - Test cooldown blocks eventType write when timestamp < 1hr ago
    - Test cooldown allows eventType write when timestamp > 1hr ago
    - Test cooldown allows eventType write when no prior timestamp
    - Test neither path fires when `cancel_at_period_end` unchanged
    - _Requirements: 16.3_

- [-] 5. Implement webhook handler expiration and payment recovery paths
  - [x] 5.1 Implement `handleSubscriptionDeleted` expiration event type routing
    - Read `dbCustomer.subscriptionStatus` to determine prior status
    - If `"cancellation_pending"` → `eventType: "VOLUNTARY_CANCELLATION_EXPIRED"`
    - If `"past_due"` or `"suspended"` → `eventType: "NONPAYMENT_CANCELLATION_EXPIRED"`
    - Else → default to `"VOLUNTARY_CANCELLATION_EXPIRED"`
    - Write `subscriptionStatus: "expired"` (not `"canceled"`)
    - Write `canceledAt: new Date().toISOString()`
    - Update Keygen license status to `"expired"` (not `"canceled"`)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 5.2 Expand `handlePaymentSucceeded` reactivation trigger
    - Expand status check: `dbCustomer.subscriptionStatus === "past_due" || dbCustomer.subscriptionStatus === "suspended"`
    - Write `subscriptionStatus: "active"`, `eventType: "SUBSCRIPTION_REACTIVATED"`
    - Pass `clearEmailsSent: ["PAYMENT_FAILED"]` to `updateCustomerSubscription`
    - _Requirements: 7.1, 7.2, 7.3, 13.5_

  - [x] 5.3 Write property test for expiration routing (Property 5)
    - **Property 5: Subscription deletion routes to correct expiration event type based on prior status**
    - Generate random prior `subscriptionStatus` values from full status set (100 iterations)
    - Verify: `cancellation_pending` → `VOLUNTARY_CANCELLATION_EXPIRED`, `past_due`/`suspended` → `NONPAYMENT_CANCELLATION_EXPIRED`, all others → `VOLUNTARY_CANCELLATION_EXPIRED`; all write `subscriptionStatus: "expired"` and `canceledAt` timestamp
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6**

  - [x] 5.4 Write property test for payment recovery (Property 6)
    - **Property 6: Payment recovery triggers reactivation for both past_due and suspended statuses**
    - Generate random customer records with `subscriptionStatus` from all valid values (100 iterations)
    - Verify: reactivation triggers only for `past_due`/`suspended`, writes `active` + `SUBSCRIPTION_REACTIVATED` + clears `PAYMENT_FAILED`; no reactivation for other statuses
    - **Validates: Requirements 7.1, 7.2, 7.3, 13.5**

  - [x] 5.5 Write unit tests for expiration and payment recovery
    - Test prior status `cancellation_pending` → `VOLUNTARY_CANCELLATION_EXPIRED`
    - Test prior status `past_due` → `NONPAYMENT_CANCELLATION_EXPIRED`
    - Test prior status `suspended` → `NONPAYMENT_CANCELLATION_EXPIRED`
    - Test fallback (unknown status) → `VOLUNTARY_CANCELLATION_EXPIRED`
    - Test all paths write `subscriptionStatus: "expired"`
    - Test reactivation triggers on `past_due` (regression guard)
    - Test reactivation triggers on `suspended` (new behavior)
    - Test reactivation does NOT trigger on `active`
    - Test `emailsSent.PAYMENT_FAILED` cleared on recovery
    - _Requirements: 16.4, 16.5_

- [x] 6. Checkpoint — Webhook handler complete
  - Ensure all tests pass, ask the user if questions arise.

- [-] 7. Implement customer-update Lambda race condition fix
  - [x] 7.1 ~~Add webhook-handled guard to `handleSubscriptionUpdated`~~ Guard removed — routing layer filters lifecycle event types
    - The `EVENT_HANDLERS` map in the customer-update Lambda only routes Stripe event types (e.g., `customer.subscription.updated`). Lifecycle event types (e.g., `CANCELLATION_REQUESTED`) written by the webhook handler are not in `EVENT_HANDLERS`, so the record is skipped at the routing level. No guard clause needed.
    - Original guard was removed because it checked `getField(newImage, "eventType")` which was always the Stripe event type (always truthy), incorrectly blocking every PROFILE write.
    - _Requirements: 8.1, 8.2, 8.3 — satisfied by routing-layer filtering_

  - [x] 7.2 Align `handleSubscriptionDeleted` with new taxonomy
    - Change `subscriptionStatus: "canceled"` → `subscriptionStatus: "expired"`
    - Guard removed (same routing-layer reasoning as 7.1) — PROFILE write always executes
    - Update `updateLicenseStatus` call to use `"expired"` instead of `"canceled"`
    - Implement same prior-status expiration routing logic as webhook handler
    - _Requirements: 8.4, 8.5_

  - [x] 7.3 ~~Write property test for webhook-handled guard (Property 8)~~ N/A — guard removed
    - Guard was removed; routing layer provides the protection. No property test needed.
    - **Property 8 is satisfied by architecture: lifecycle event types never reach handler functions.**

  - [x] 7.4 Write property test for Lambda expiration routing (Property 9)
    - **Property 9: Customer-update Lambda expiration routing matches webhook handler routing**
    - Generate random prior status values (100 iterations)
    - Run both webhook and Lambda routing logic, verify identical output
    - **Validates: Requirements 8.4, 8.5**

  - [x] 7.5 Write unit tests for customer-update Lambda changes
    - ~~Test skip write when `eventType` present in `newImage`~~ — removed (guard removed)
    - ~~Test proceed with write when `eventType` absent~~ — renamed to "should write PROFILE update for subscription.updated events"
    - ~~Test license updates still execute on skip~~ — removed (guard removed)
    - Test `handleSubscriptionDeleted` writes `subscriptionStatus: "expired"` ✓
    - Test `handleSubscriptionDeleted` determines correct event type from prior status — covered by Expiration Routing describe block
    - _Requirements: 16.6_

- [-] 8. Implement email templates and SES layer updates
  - [x] 8.1 Remove dead code: `TRIAL_ENDING` mapping, `trialEnding` template, `sendTrialEndingEmail`
    - In `dm/layers/ses/src/email-templates.js`: remove `TRIAL_ENDING: "trialEnding"` from `EVENT_TYPE_TO_TEMPLATE`, remove `"trialEnding"` from `TEMPLATE_NAMES`, remove `trialEnding` template from `createTemplates`
    - In `plg-website/src/lib/ses.js`: remove `sendTrialEndingEmail` function
    - In `dm/layers/ses/generate-email-preview.js`: remove `trialEnding` preview data and metadata entry
    - _Requirements: 9.5, 11.2, 11.3_

  - [x] 8.2 Remove dead code: `handleTrialReminder` from scheduled-tasks Lambda
    - In `plg-website/infrastructure/lambda/scheduled-tasks/index.js`: remove `handleTrialReminder` function, remove `"trial-reminder": handleTrialReminder` from `TASK_HANDLERS` map
    - _Requirements: 11.2_

  - [x] 8.3 Add `cancellationRequested` email template
    - In `dm/layers/ses/src/email-templates.js`: add template in `createTemplates` with warm, slightly persuasive tone
    - Parameters: `{ email, accessUntil }`
    - Content: acknowledge cancellation, remind Mouse active until `accessUntil`, CTA to reactivate via `/portal/billing`, feedback prompt to `billing@hic-ai.com`
    - _Requirements: 9.1_

  - [x] 8.4 Add `cancellationReversed` email template
    - Warm, understated tone confirming subscription continues normally
    - Parameters: `{ email }`
    - Content: confirm subscription continues, state no action needed, NO mention of reinstatement/restoration/payment, low-key CTA to `/portal`
    - _Requirements: 9.2, 5.5_

  - [x] 8.5 Add `voluntaryCancellationExpired` email template
    - Respectful, door-open tone
    - Parameters: `{ email }`
    - Content: confirm subscription ended, license inactive, account/data preserved, CTA to resubscribe via `/pricing`
    - _Requirements: 9.3_

  - [x] 8.6 Add `nonpaymentCancellationExpired` email template
    - Neutral, factual, helpful tone
    - Parameters: `{ email }`
    - Content: confirm subscription ended due to unresolved payment, license inactive, CTA to `/pricing`, mention `billing@hic-ai.com` for error inquiries
    - _Requirements: 9.4_

  - [x] 8.7 Update `EVENT_TYPE_TO_TEMPLATE` mapping
    - Remove `SUBSCRIPTION_CANCELLED` and `TRIAL_ENDING` entries
    - Add `CANCELLATION_REQUESTED`, `CANCELLATION_REVERSED`, `VOLUNTARY_CANCELLATION_EXPIRED`, `NONPAYMENT_CANCELLATION_EXPIRED` mappings
    - _Requirements: 9.6_

  - [x] 8.8 Update `TEMPLATE_NAMES` array
    - Remove `"trialEnding"` and `"cancellation"`
    - Add `"cancellationRequested"`, `"cancellationReversed"`, `"voluntaryCancellationExpired"`, `"nonpaymentCancellationExpired"`
    - _Requirements: 9.7_

  - [x] 8.9 Deactivate win-back queries and update to `expired` status
    - In `scheduled-tasks/index.js`: update `handleWinback30` and `handleWinback90` query filters from `":status": "canceled"` to `":status": "expired"`
    - Ensure win-back functions are NOT wired up in `TASK_HANDLERS` (preserve code, mark as deactivated for post-launch)
    - _Requirements: 11.1_

  - [x] 8.10 Write property test for EVENT_TYPE_TO_TEMPLATE mapping (Property 7)
    - **Property 7: EVENT_TYPE_TO_TEMPLATE maps every event type to its correct template**
    - Exhaustive enumeration of all 12 event types — verify each maps to a template that exists in `createTemplates` output
    - **Validates: Requirements 4.5, 5.4, 6.8, 6.9, 10.3**

  - [x] 8.11 Write property test for template content (Property 10)
    - **Property 10: New email templates contain required content elements and exclude forbidden phrases**
    - Generate random `email` strings and `accessUntil` ISO date strings (100 iterations)
    - Verify: `cancellationRequested` includes `accessUntil` and `/portal/billing` link; `cancellationReversed` does NOT contain "reinstat", "restor", or "payment"; `voluntaryCancellationExpired` includes `/pricing` link; `nonpaymentCancellationExpired` includes `/pricing` link and `billing@hic-ai.com`
    - **Validates: Requirements 5.5, 9.1, 9.2, 9.3, 9.4**

  - [x] 8.12 Write unit tests for email templates and scheduled tasks
    - Test 4 new templates exist with correct subject lines and body content
    - Test `TRIAL_ENDING` and `SUBSCRIPTION_CANCELLED` removed from `EVENT_TYPE_TO_TEMPLATE`
    - Test `TEMPLATE_NAMES` includes new names, excludes `trialEnding` and `cancellation`
    - Test `handleTrialReminder` removed, `trial-reminder` not in handlers
    - Test win-back queries target `subscriptionStatus: "expired"`
    - Test deferred templates (`orgCancellationRequested`, `orgCancellationExpired`) are NOT present
    - _Requirements: 16.7, 16.8, 16.9_

- [x] 9. Checkpoint — Email templates and scheduled tasks complete
  - Ensure all tests pass, ask the user if questions arise.

- [-] 10. Implement email-sender Lambda improvements
  - [x] 10.1 Remove `EMAIL_ACTIONS` alias, use `EVENT_TYPE_TO_TEMPLATE` directly
    - In `plg-website/infrastructure/lambda/email-sender/index.js`: remove `const EMAIL_ACTIONS = EVENT_TYPE_TO_TEMPLATE;` alias
    - Replace all `EMAIL_ACTIONS` references with `EVENT_TYPE_TO_TEMPLATE`
    - _Requirements: 10.1_

  - [x] 10.2 Add dedup type classification logging in Guard 2
    - Define `PERMANENT_DEDUP_EVENTS = ["CUSTOMER_CREATED", "LICENSE_CREATED"]`
    - In Guard 2 dedup check: log `dedupType` as `"permanent"` for one-time events, `"lifecycle"` for all others, along with `eventType`
    - _Requirements: 10.2_

  - [x] 10.3 Write property test for dedup classification (Property 11)
    - **Property 11: Dedup guard classifies event types correctly as permanent or lifecycle**
    - Generate random event types from the full set (100 iterations)
    - Verify: `CUSTOMER_CREATED` and `LICENSE_CREATED` classified as `"permanent"`, all others as `"lifecycle"`
    - **Validates: Requirements 10.2, 13.1, 13.2**

  - [x] 10.4 Write unit tests for email-sender Lambda changes
    - Test `EMAIL_ACTIONS` alias removed, `EVENT_TYPE_TO_TEMPLATE` used directly — verified by handler using `EVENT_TYPE_TO_TEMPLATE` directly
    - Test dedup guard classifies `CUSTOMER_CREATED`/`LICENSE_CREATED` as permanent ✓
    - Test dedup guard classifies all lifecycle event types as lifecycle ✓
    - Test all 4 new event types route to correct templates ✓ (New Event Type Routing describe block)
    - Test removed event types (`SUBSCRIPTION_CANCELLED`, `TRIAL_ENDING`) are NOT routed ✓
    - _Requirements: 16.7_

- [-] 11. Implement portal UI status display updates
  - [x] 11.1 Update billing card on `portal/page.js` for `cancellation_pending`
    - Update billing card status text to handle `cancellation_pending`: display "Cancellation pending" instead of "No active subscription"
    - The `LICENSE_STATUS_DISPLAY` badge already works via Task 1.2 (`CANCELLATION_PENDING` added to display map)
    - _Requirements: 12.1_

  - [x] 11.2 Update `SubscriptionStatusBadge` on `portal/billing/page.js`
    - Add `cancellation_pending: "warning"` and `expired: "secondary"` to `variants` map
    - Add `cancellation_pending: "Cancellation Pending"` and `expired: "Expired"` to `labels` map
    - _Requirements: 12.2, 12.3_

  - [x] 11.3 Write unit tests for portal UI changes
    - Test `SubscriptionStatusBadge` renders `cancellation_pending` with warning variant and "Cancellation Pending" label
    - Test `SubscriptionStatusBadge` renders `expired` with secondary variant and "Expired" label
    - Test billing card displays "Cancellation pending" for `cancellation_pending` status
    - _Requirements: 16.10_

- [-] 12. Update test fixtures and remaining test files
  - [x] 12.1 Update test fixture files for naming changes
    - Update `plg-website/__tests__/unit/lib/constants.test.js`: `LICENSE_STATUS.CANCELLED` → `LICENSE_STATUS.CANCELED`
    - Update `plg-website/__tests__/unit/api/team.test.js`: `cancelled` → `canceled` in test descriptions and fixture references
    - Update `plg-website/__tests__/unit/api/billing.test.js`: update test description and fixture reference
    - Update `plg-website/__tests__/unit/api/delete-account.test.js`: `cancelled` → `canceled` in comment
    - Update `plg-website/__tests__/unit/api/webhooks.test.js`: `paymentFailedCount` → `paymentFailureCount` in assertions
    - Remove `sendTrialEndingEmail` tests from `plg-website/__tests__/unit/lib/ses.test.js`
    - Remove `trial-reminder Job` describe block from `plg-website/__tests__/unit/lambda/scheduled-tasks.test.js`
    - Remove `TRIAL_ENDING` mapping test, `trialEnding` template test, and update `TEMPLATE_NAMES` assertion in `dm/tests/facade/unit/email-templates.test.js`
    - _Requirements: 1.5, 1.6, 16.1, 16.8_

  - [x] 12.2 Run full test suite and fix any regressions
    - Run all existing tests to verify zero regressions from naming changes and refactoring
    - Fix any failing tests before proceeding
    - _Requirements: 16.11_

- [x] 13. Final checkpoint — All code changes complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify no orphaned references to `CANCELLED` (double-L), `paymentFailedCount`, `SUBSCRIPTION_CANCELLED`, or `TRIAL_ENDING` in any touched file
  - Verify all 16 requirements are covered by implementation tasks
  - Verify test coverage >80% across all changed files

- [ ] 14. SES layer rebuild and Lambda redeployment
  - [ ] 14.1 Rebuild `hic-ses-layer`
    - Run `dm/layers/ses/build.sh` to rebuild the SES layer with updated `email-templates.js`
    - Verify the layer contains new templates, updated `EVENT_TYPE_TO_TEMPLATE`, and updated `TEMPLATE_NAMES`
    - _Requirements: 15.1_

  - [ ] 14.2 Publish new layer version and update Lambda references
    - Publish rebuilt layer as new Lambda layer version, record version ARN
    - Run `update-lambdas.sh staging` to update layer references and redeploy `email-sender`, `customer-update`, and `scheduled-tasks` Lambdas
    - Website/webhook changes deploy automatically via Amplify on push to `development`
    - _Requirements: 15.2, 15.3, 15.4_

## Notes

- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using native Node.js randomized loops (no external PBT libraries)
- Unit tests validate specific examples and edge cases using `dm/facade/test-helpers/index.js`
- Org (Business) member fan-out (Requirement 14) is explicitly deferred to post-launch — no tasks included
- Win-back functions (winback30/winback90) are preserved but NOT wired up — only query filter updated to `expired`
- No CloudFormation stack changes needed — only SES layer rebuild and Lambda redeployment
- All existing `canceled` records belong to throwaway test accounts — no migration needed
