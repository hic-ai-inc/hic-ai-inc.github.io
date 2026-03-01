# Requirements Document

## Introduction

Stream 1D is a refinement and extension of the existing, working E2E subscription lifecycle email system for the Mouse VS Code extension's PLG website, adding support for end-of-lifecycle events such as cancellation, reinstatement, and renewal, as well as covering edge cases, standardizing naming conventions, cleaning up dead code, and updating the portal UI. During E2E validation, two bugs were discovered: (1) Cancel Subscription sends zero emails (regression from a duplicate-email fix), and (2) Don't Cancel sends the wrong template (payment recovery copy instead of reversal confirmation). Investigation revealed four root causes: a permanent `emailsSent` dedup guard that blocks repeatable lifecycle emails, overloaded event types (`SUBSCRIPTION_CANCELLED` serves 3 scenarios, `SUBSCRIPTION_REACTIVATED` serves 2), a race condition between the webhook handler and the `customer-update` Lambda, and missing subscription statuses for intermediate lifecycle states.

This feature introduces 4 new event types, 2 new subscription statuses, 4 new email templates, a split dedup strategy (permanent vs. clearable lifecycle events), a 1-hour cooldown guard against email flooding, naming standardization, dead code removal, and portal UI updates. Org (Business) member fan-out is explicitly deferred to post-launch.

No CloudFormation stack changes (`deploy.sh`) are required for this work. The only infrastructure actions are rebuilding and publishing `hic-ses-layer` (new templates and updated event-type mappings) and running `update-lambdas.sh staging` to push new function code and pick up the new layer version for the three affected Lambdas (`email-sender`, `customer-update`, `scheduled-tasks`). Website and webhook handler changes deploy automatically via Amplify on push to the `development` branch.

**Source:** `docs/plg/20260228_STREAM_1D_COMPLETION_PLAN.md`
**Bug Report:** `docs/plg/20260228_CANCELLATION_EMAIL_REPORT_AND_PRE_LAUNCH_RECOMMENDATIONS.md`

## Glossary

- **Webhook_Handler**: The Stripe webhook handler in `route.js` that receives Stripe events and writes event data to DynamoDB PROFILE records
- **Customer_Update_Lambda**: The `customer-update` Lambda triggered by DynamoDB Streams that processes subscription state changes and updates Keygen license status
- **Email_Sender_Lambda**: The `email-sender` Lambda that reads event types from DynamoDB records, selects email templates, sends emails via SES, and writes dedup stamps
- **Scheduled_Tasks_Lambda**: The `scheduled-tasks` Lambda that runs periodic jobs including win-back email campaigns
- **Email_Pipeline**: The end-to-end flow: Stripe Event → Webhook Handler → DynamoDB PROFILE → DynamoDB Stream → StreamProcessor → SNS → SQS → Email_Sender_Lambda → SES
- **PROFILE_Record**: The DynamoDB record (PK: `CUSTOMER#userId`, SK: `PROFILE`) storing customer subscription state, email, and `emailsSent` dedup map
- **emailsSent_Map**: A map attribute on the PROFILE_Record where each key is an event type and each value is a timestamp, used as a dedup guard to prevent duplicate emails
- **Dedup_Guard**: The check in Email_Sender_Lambda that skips sending an email if `emailsSent.<eventType>` already exists on the PROFILE_Record
- **Cooldown_Guard**: A 1-hour (3600-second) time window check that prevents clearing a lifecycle dedup stamp if the same email was sent within the last hour, blocking email flooding from rapid cancel/uncancel toggling
- **Permanent_Dedup_Event**: A one-time event type (e.g., `CUSTOMER_CREATED`, `LICENSE_CREATED`) whose dedup stamp is never cleared
- **Lifecycle_Dedup_Event**: A repeatable event type (e.g., `CANCELLATION_REQUESTED`, `PAYMENT_FAILED`) whose dedup stamp is cleared on the corresponding state transition
- **clearEmailsSent**: An optional array parameter on `updateCustomerSubscription` that generates DynamoDB `REMOVE` expressions to clear specified keys from the `emailsSent` map
- **Subscription_Status**: The `subscriptionStatus` attribute on the PROFILE_Record representing the customer's current subscription state
- **Portal**: The customer-facing web portal at `/portal` and `/portal/billing` displaying subscription status, billing information, and management controls
- **SES_Layer**: The shared AWS Lambda layer (`hic-ses-layer`) containing email template definitions and the `EVENT_TYPE_TO_TEMPLATE` mapping
- **Stripe_Customer_Portal**: The Stripe-hosted portal where customers manage their subscription (cancel, update payment method, etc.)
- **statusMap**: The mapping object in `handleSubscriptionUpdated` that converts Stripe subscription statuses to HIC internal subscription statuses

## Requirements

### Requirement 1: Naming Standardization

**User Story:** As a developer, I want consistent naming conventions across the codebase, so that attribute name mismatches do not cause functional bugs and American English spelling is used uniformly.

#### Acceptance Criteria

1. THE Webhook_Handler SHALL use `CANCELED` (single-L, American English) in place of `CANCELLED` (double-L) for all constant names, status labels, and event type references
2. THE Webhook_Handler SHALL write `paymentFailureCount` (not `paymentFailedCount`) to the PROFILE_Record when recording payment attempt counts, so that the Customer_Update_Lambda reads the correct attribute
3. WHEN the naming standardization is applied, THE constants module SHALL rename `LICENSE_STATUS.CANCELLED` to `LICENSE_STATUS.CANCELED` and update the corresponding `LICENSE_STATUS_DISPLAY` entry label from "Cancelled" to "Canceled"
4. WHEN the naming standardization is applied, THE Portal SHALL display "canceled" (single-L) in all user-facing copy where subscription cancellation is referenced
5. THE test fixtures SHALL rename all `cancelled` exports and references to `canceled`, except where the value mirrors a Stripe-side or third-party string literal (e.g., Keygen `expiry_reason`)
6. THE test files SHALL update all references from `CANCELLED` to `CANCELED` and from `paymentFailedCount` to `paymentFailureCount` in assertions and test descriptions

### Requirement 2: Shared Constants Extraction

**User Story:** As a developer, I want shared constants for cross-cutting values, so that hardcoded magic numbers and missing statuses do not cause inconsistencies between components.

#### Acceptance Criteria

1. THE constants module SHALL export a `MAX_PAYMENT_FAILURES` constant with the value `3`
2. WHEN the Webhook_Handler evaluates payment failure thresholds, THE Webhook_Handler SHALL reference `MAX_PAYMENT_FAILURES` from the constants module instead of a hardcoded literal
3. THE Customer_Update_Lambda SHALL reference a local `MAX_PAYMENT_FAILURES` constant with a comment citing the canonical value in the constants module (Lambda cannot import Next.js modules directly)
4. THE constants module SHALL include `CANCELLATION_PENDING` in `LICENSE_STATUS` with the value `"CANCELLATION_PENDING"`
5. THE constants module SHALL include `CANCELLATION_PENDING` in `LICENSE_STATUS_DISPLAY` with label `"Cancellation Pending"` and variant `"warning"`

### Requirement 3: Clearable Email Dedup with Cooldown Guard

**User Story:** As a customer, I want to receive appropriate lifecycle emails each time my subscription state changes, so that I am informed of cancellations, reversals, and expirations without receiving duplicate emails from rapid toggling.

#### Acceptance Criteria

1. THE `updateCustomerSubscription` function SHALL accept an optional `clearEmailsSent` array parameter specifying keys to remove from the `emailsSent` map on the PROFILE_Record
2. WHEN `clearEmailsSent` contains one or more keys, THE `updateCustomerSubscription` function SHALL generate a DynamoDB `UpdateExpression` combining `SET` expressions (for field updates) and `REMOVE` expressions (for clearing specified `emailsSent` keys) in a single atomic operation
3. WHEN `clearEmailsSent` is empty or not provided, THE `updateCustomerSubscription` function SHALL produce no `REMOVE` clause in the `UpdateExpression`
4. WHEN the Webhook_Handler attempts to clear a lifecycle dedup stamp, THE Webhook_Handler SHALL check the existing `emailsSent` timestamp for that event type on the PROFILE_Record and skip the clear if the timestamp is within 3600 seconds of the current time (Cooldown_Guard)
5. WHEN the Cooldown_Guard blocks a clear, THE Webhook_Handler SHALL skip writing the `eventType` field on the PROFILE_Record update, preventing the Email_Pipeline from sending a duplicate email
6. WHEN no prior `emailsSent` entry exists for the event type being cleared, THE Webhook_Handler SHALL proceed with the clear and write the `eventType` normally

### Requirement 4: Cancellation Request Handling

**User Story:** As a customer, I want to receive a "sorry to see you go" email when I cancel my subscription, so that I know my cancellation was received and I understand my access timeline.

#### Acceptance Criteria

1. WHEN Stripe fires `customer.subscription.updated` with `cancel_at_period_end: true`, THE Webhook_Handler SHALL write `subscriptionStatus: "cancellation_pending"` to the PROFILE_Record
2. WHEN Stripe fires `customer.subscription.updated` with `cancel_at_period_end: true`, THE Webhook_Handler SHALL write `eventType: "CANCELLATION_REQUESTED"` to the PROFILE_Record
3. WHEN writing a `CANCELLATION_REQUESTED` event, THE Webhook_Handler SHALL clear `emailsSent.CANCELLATION_REVERSED` from the PROFILE_Record (via `clearEmailsSent`) so that a future reversal can trigger a fresh email
4. WHEN the Cooldown_Guard determines that `CANCELLATION_REQUESTED` was sent within the last 3600 seconds, THE Webhook_Handler SHALL skip writing `eventType` and `clearEmailsSent` while still updating `subscriptionStatus` to `"cancellation_pending"`
5. WHEN the Email_Sender_Lambda processes a `CANCELLATION_REQUESTED` event, THE Email_Sender_Lambda SHALL select the `cancellationRequested` template and send the email with `email` and `accessUntil` parameters

### Requirement 5: Cancellation Reversal Handling

**User Story:** As a customer, I want to receive a "glad you're staying" email when I reverse my pending cancellation, so that I have confirmation my subscription continues normally.

#### Acceptance Criteria

1. WHEN Stripe fires `customer.subscription.updated` with `cancel_at_period_end: false` and the PROFILE_Record has `cancelAtPeriodEnd: true`, THE Webhook_Handler SHALL write `subscriptionStatus: "active"` to the PROFILE_Record
2. WHEN writing a `CANCELLATION_REVERSED` event, THE Webhook_Handler SHALL write `eventType: "CANCELLATION_REVERSED"` to the PROFILE_Record
3. WHEN writing a `CANCELLATION_REVERSED` event, THE Webhook_Handler SHALL clear `emailsSent.CANCELLATION_REQUESTED` from the PROFILE_Record so that a future cancellation can trigger a fresh email
4. WHEN the Email_Sender_Lambda processes a `CANCELLATION_REVERSED` event, THE Email_Sender_Lambda SHALL select the `cancellationReversed` template and send the email with the `email` parameter
5. THE `cancellationReversed` template SHALL NOT reference payment recovery, license reinstatement, or functionality restoration language

### Requirement 6: Subscription Expiration Handling

**User Story:** As a customer, I want to receive a contextually appropriate email when my subscription ends, so that I understand whether it expired due to my voluntary cancellation or due to a payment issue.

#### Acceptance Criteria

1. WHEN Stripe fires `customer.subscription.deleted` and the PROFILE_Record has `subscriptionStatus: "cancellation_pending"`, THE Webhook_Handler SHALL write `eventType: "VOLUNTARY_CANCELLATION_EXPIRED"` to the PROFILE_Record
2. WHEN Stripe fires `customer.subscription.deleted` and the PROFILE_Record has `subscriptionStatus: "past_due"` or `"suspended"`, THE Webhook_Handler SHALL write `eventType: "NONPAYMENT_CANCELLATION_EXPIRED"` to the PROFILE_Record
3. WHEN Stripe fires `customer.subscription.deleted` and the prior `subscriptionStatus` does not match a known expiration path, THE Webhook_Handler SHALL default to `eventType: "VOLUNTARY_CANCELLATION_EXPIRED"`
4. WHEN processing any `customer.subscription.deleted` event, THE Webhook_Handler SHALL write `subscriptionStatus: "expired"` to the PROFILE_Record (not `"canceled"`)
5. WHEN processing any `customer.subscription.deleted` event, THE Webhook_Handler SHALL write `canceledAt` with the current ISO 8601 timestamp to the PROFILE_Record
6. WHEN processing any `customer.subscription.deleted` event, THE Webhook_Handler SHALL update the Keygen license status to `"expired"` (not `"canceled"`)
7. THE statusMap in `handleSubscriptionUpdated` SHALL map Stripe's `canceled` status to `"expired"`
8. WHEN the Email_Sender_Lambda processes a `VOLUNTARY_CANCELLATION_EXPIRED` event, THE Email_Sender_Lambda SHALL select the `voluntaryCancellationExpired` template with a respectful, door-open tone
9. WHEN the Email_Sender_Lambda processes a `NONPAYMENT_CANCELLATION_EXPIRED` event, THE Email_Sender_Lambda SHALL select the `nonpaymentCancellationExpired` template with a neutral, factual, helpful tone

### Requirement 7: Payment Recovery Reactivation

**User Story:** As a customer whose payment failed, I want to receive a reactivation email when my payment succeeds, so that I know my license is reinstated regardless of whether I was in `past_due` or `expired` status.

#### Acceptance Criteria

1. WHEN `invoice.payment_succeeded` fires and the PROFILE_Record has `subscriptionStatus: "past_due"`, THE Webhook_Handler SHALL write `eventType: "SUBSCRIPTION_REACTIVATED"` and `subscriptionStatus: "active"` to the PROFILE_Record
2. WHEN `invoice.payment_succeeded` fires and the PROFILE_Record has `subscriptionStatus: "expired"`, THE Webhook_Handler SHALL write `eventType: "SUBSCRIPTION_REACTIVATED"` and `subscriptionStatus: "active"` to the PROFILE_Record
3. WHEN writing a `SUBSCRIPTION_REACTIVATED` event after payment recovery, THE Webhook_Handler SHALL clear `emailsSent.PAYMENT_FAILED` from the PROFILE_Record so that future payment failures in subsequent billing cycles can trigger fresh emails
4. THE `SUBSCRIPTION_REACTIVATED` event type SHALL remain unchanged and continue to use the existing `reactivation` template for payment recovery scenarios

### Requirement 8: Customer Update Lambda Race Condition Fix

**User Story:** As a developer, I want the Customer_Update_Lambda to avoid overwriting webhook-handled updates, so that the race condition between the webhook handler and the Lambda does not corrupt event types or cause missed emails.

#### Acceptance Criteria

1. WHEN the Customer_Update_Lambda receives a DynamoDB stream event where the `newImage` contains an `eventType` field, THE Customer_Update_Lambda SHALL skip the redundant PROFILE_Record write (the Webhook_Handler already handled the update)
2. WHEN the Customer_Update_Lambda skips a redundant write, THE Customer_Update_Lambda SHALL still execute Keygen license status updates (license updates are idempotent)
3. WHEN the Customer_Update_Lambda skips a redundant write, THE Customer_Update_Lambda SHALL log the skip with the `eventType` value and reason `"skipping redundant customer-update write"`
4. THE Customer_Update_Lambda `handleSubscriptionDeleted` function SHALL write `subscriptionStatus: "expired"` (not `"canceled"`) to align with the new taxonomy
5. WHEN the Customer_Update_Lambda `handleSubscriptionDeleted` determines the expiration event type, THE Customer_Update_Lambda SHALL use the same prior-status logic as the Webhook_Handler (cancellation_pending → voluntary, past_due/suspended → nonpayment)

### Requirement 9: Email Template Updates

**User Story:** As a customer, I want to receive emails with content that matches my specific subscription lifecycle event, so that I am not confused by irrelevant messaging about payment recovery when I simply reversed a cancellation.

#### Acceptance Criteria

1. THE SES_Layer SHALL define a `cancellationRequested` template with a warm, slightly persuasive tone that acknowledges the cancellation, reminds the customer Mouse remains active until `accessUntil`, includes a CTA to reactivate via `/portal/billing`, and includes a feedback prompt linking to `billing@hic-ai.com`
2. THE SES_Layer SHALL define a `cancellationReversed` template with a warm, understated tone that confirms the subscription continues normally, states no action is needed, and includes a low-key CTA to the portal
3. THE SES_Layer SHALL define a `voluntaryCancellationExpired` template with a respectful, door-open tone that confirms the subscription has ended, states the license is inactive, notes account and data are preserved, and includes a CTA to resubscribe via `/pricing`
4. THE SES_Layer SHALL define a `nonpaymentCancellationExpired` template with a neutral, factual, helpful tone that confirms the subscription ended due to an unresolved payment issue, states the license is inactive, includes a CTA to purchase a new license via `/pricing`, and mentions `billing@hic-ai.com` for error inquiries
5. THE SES_Layer SHALL remove the `TRIAL_ENDING` entry from `EVENT_TYPE_TO_TEMPLATE` and remove the `trialEnding` template from `TEMPLATE_NAMES` and `createTemplates` (confirmed dead code — no code path writes `subscriptionStatus: "trialing"` to PROFILE records)
6. THE SES_Layer SHALL remove `SUBSCRIPTION_CANCELLED` from `EVENT_TYPE_TO_TEMPLATE` and replace it with the four new event type mappings: `CANCELLATION_REQUESTED`, `CANCELLATION_REVERSED`, `VOLUNTARY_CANCELLATION_EXPIRED`, `NONPAYMENT_CANCELLATION_EXPIRED`
7. THE SES_Layer SHALL update `TEMPLATE_NAMES` to include `cancellationRequested`, `cancellationReversed`, `voluntaryCancellationExpired`, `nonpaymentCancellationExpired` and exclude `trialEnding` and `cancellation`
8. THE SES_Layer SHALL NOT include `orgCancellationRequested` or `orgCancellationExpired` templates (deferred to post-launch)

### Requirement 10: Email Sender Lambda Improvements

**User Story:** As a developer, I want the Email_Sender_Lambda to use clear naming and provide diagnostic logging for dedup decisions, so that debugging email delivery issues is straightforward.

#### Acceptance Criteria

1. THE Email_Sender_Lambda SHALL reference the template mapping as `EVENT_TYPE_TO_TEMPLATE` directly, removing the `EMAIL_ACTIONS` alias
2. WHEN the Dedup_Guard blocks an email, THE Email_Sender_Lambda SHALL log the dedup type as `"permanent"` for one-time events (`CUSTOMER_CREATED`, `LICENSE_CREATED`) or `"lifecycle"` for repeatable events, along with the `eventType`
3. THE Email_Sender_Lambda SHALL route all four new event types (`CANCELLATION_REQUESTED`, `CANCELLATION_REVERSED`, `VOLUNTARY_CANCELLATION_EXPIRED`, `NONPAYMENT_CANCELLATION_EXPIRED`) to their corresponding templates via the updated `EVENT_TYPE_TO_TEMPLATE` mapping

### Requirement 11: Scheduled Tasks Updates

**User Story:** As a developer, I want dead code removed and win-back functionality deactivated (but preserved) in the Scheduled_Tasks_Lambda, so that unused code does not accumulate and non-transactional marketing emails are not sent pre-launch.

**Important Clarification:** The `handleWinback30` and `handleWinback90` functions are not wired up and will not be wired up pre-launch. Activating win-back campaigns would require implementing marketing (non-transactional) email infrastructure including CAN-SPAM-compliant unsubscribe functionality. These functions should be deactivated or deprecated but preserved as a starting point for potential post-launch activation.

#### Acceptance Criteria

1. THE Scheduled_Tasks_Lambda SHALL ensure `handleWinback30` and `handleWinback90` are not wired up in the `TASK_HANDLERS` map and SHALL NOT activate them in this release; the function code SHALL be preserved but clearly marked as deactivated for potential post-launch use
2. THE Scheduled_Tasks_Lambda SHALL remove the `handleTrialReminder` function and the `"trial-reminder"` entry from the `TASK_HANDLERS` map (confirmed dead code)
3. THE SES helper module SHALL remove the `sendTrialEndingEmail` function (confirmed dead code)

### Requirement 12: Portal UI Status Display

**User Story:** As a customer, I want the portal to display my current subscription status accurately, so that I can see when my cancellation is pending or my subscription has expired.

#### Acceptance Criteria

1. WHEN the PROFILE_Record has `subscriptionStatus: "cancellation_pending"`, THE Portal main page billing card SHALL display "Cancellation pending" as the status text
2. WHEN the PROFILE_Record has `subscriptionStatus: "cancellation_pending"`, THE Portal billing page `SubscriptionStatusBadge` SHALL render with variant `"warning"` and label `"Cancellation Pending"`
3. WHEN the PROFILE_Record has `subscriptionStatus: "expired"`, THE Portal billing page `SubscriptionStatusBadge` SHALL render with variant `"secondary"` and label `"Expired"`

### Requirement 13: Dedup Strategy Classification

**User Story:** As a developer, I want a clear classification of which event types use permanent dedup versus clearable lifecycle dedup, so that the email system correctly handles both one-time and repeatable emails.

#### Acceptance Criteria

1. THE Email_Sender_Lambda SHALL treat `CUSTOMER_CREATED` and `LICENSE_CREATED` as Permanent_Dedup_Events whose `emailsSent` stamps are never cleared
2. THE Email_Pipeline SHALL treat `CANCELLATION_REQUESTED`, `CANCELLATION_REVERSED`, `PAYMENT_FAILED`, `SUBSCRIPTION_REACTIVATED`, `VOLUNTARY_CANCELLATION_EXPIRED`, and `NONPAYMENT_CANCELLATION_EXPIRED` as Lifecycle_Dedup_Events whose `emailsSent` stamps are cleared on the corresponding state transition
3. WHEN writing `CANCELLATION_REQUESTED`, THE Webhook_Handler SHALL clear `emailsSent.CANCELLATION_REVERSED`
4. WHEN writing `CANCELLATION_REVERSED`, THE Webhook_Handler SHALL clear `emailsSent.CANCELLATION_REQUESTED`
5. WHEN writing `SUBSCRIPTION_REACTIVATED` after payment recovery, THE Webhook_Handler SHALL clear `emailsSent.PAYMENT_FAILED`

### Requirement 14: Org Fan-Out Deferral

**User Story:** As a product owner, I want org (Business) member fan-out notification routing explicitly deferred to post-launch, so that the team focuses on Individual account flows for launch while tracking the gap.

#### Acceptance Criteria

1. THE Email_Sender_Lambda SHALL NOT implement account type detection, org member query, or fan-out routing logic for Business accounts in this release
2. THE SES_Layer SHALL NOT include `orgCancellationRequested` or `orgCancellationExpired` templates in this release
3. THE completion plan SHALL document the deferral with HIGH priority on the post-launch tracking list, noting that org cancellation cannot mathematically trigger until at least one billing cycle (~30 days) post-launch

### Requirement 15: SES Layer Rebuild and Lambda Redeployment

**User Story:** As a developer, I want the SES layer rebuilt and all consuming Lambdas redeployed, so that the new templates and event type mappings are available in the production environment.

#### Acceptance Criteria

1. WHEN all template and mapping changes are complete, THE SES_Layer SHALL be rebuilt using the existing build script at `dm/layers/ses/build.sh`
2. WHEN the SES_Layer is rebuilt, THE deployment process SHALL publish a new Lambda layer version and record the version ARN
3. WHEN the new layer version is published, THE deployment process SHALL update layer references on the Email_Sender_Lambda, Customer_Update_Lambda, and Scheduled_Tasks_Lambda and redeploy each
4. THE Webhook_Handler changes SHALL deploy automatically via Amplify on push to the `development` branch

### Requirement 16: Test Coverage

**User Story:** As a developer, I want comprehensive test coverage for all changed components, so that regressions are caught before deployment and the new lifecycle flows are verified.

#### Acceptance Criteria

1. THE test suite SHALL verify that all instances of `CANCELLED` (double-L) are renamed to `CANCELED` (single-L) and `paymentFailedCount` is renamed to `paymentFailureCount` across all touched files
2. THE test suite SHALL verify that `updateCustomerSubscription` with `clearEmailsSent` generates correct combined `SET` + `REMOVE` UpdateExpressions, handles empty arrays, and respects the Cooldown_Guard
3. THE test suite SHALL verify that `handleSubscriptionUpdated` writes `"cancellation_pending"` + `"CANCELLATION_REQUESTED"` on cancel and `"active"` + `"CANCELLATION_REVERSED"` on uncancel
4. THE test suite SHALL verify that `handleSubscriptionDeleted` determines the correct expiration event type from prior status and writes `subscriptionStatus: "expired"`
5. THE test suite SHALL verify that `handlePaymentSucceeded` triggers reactivation for both `past_due` and `suspended` statuses and clears `emailsSent.PAYMENT_FAILED`
6. THE test suite SHALL verify that the Customer_Update_Lambda skips redundant writes when `eventType` is present in `newImage`
7. THE test suite SHALL verify that all four new templates exist with correct subject lines and body content, and that `EVENT_TYPE_TO_TEMPLATE` maps all new event types correctly
8. THE test suite SHALL verify that `handleTrialReminder` and `TRIAL_ENDING` are removed
9. THE test suite SHALL verify that win-back queries target `subscriptionStatus: "expired"`
10. THE test suite SHALL verify that the Portal renders `cancellation_pending` and `expired` statuses with correct badges and labels
11. THE test suite SHALL maintain greater than 80% code coverage across all changed files
