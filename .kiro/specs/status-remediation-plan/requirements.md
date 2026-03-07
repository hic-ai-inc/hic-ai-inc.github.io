# Requirements Document

## Introduction

This spec covers the 9-bug remediation of the license status and payment lifecycle system across the HIC platform (PLG website + Mouse extension). The authoritative plan is `docs/plg/20260306_CONSOLIDATED_STATUS_REMEDIATION_PLAN_V6.md`.

The bugs span casing mismatches, missing API calls, incorrect status semantics, dead code, hardcoded strings, and wrong data sources. After remediation, the payment lifecycle becomes `active → past_due → expired`, "suspended" means only admin-suspended team member, DynamoDB is the sole read source, and all status values are lowercase throughout the stack.

## Glossary

- **Heartbeat_Endpoint**: The `/api/license/heartbeat` route that the Mouse extension pings periodically to verify license validity and tool access
- **DDB**: Amazon DynamoDB, the sole source of truth for all license and customer reads
- **Keygen**: Third-party license management service; used for write-side operations (create, renew, suspend licenses) and device tracking
- **Stripe**: Payment processor handling subscriptions, invoices, dunning, and dispute resolution
- **LICENSE_STATUS**: The enum in `src/lib/constants.js` defining all valid license states
- **EVENT_TYPES**: The enum (to be created) in `src/lib/constants.js` defining all event type strings written to DDB
- **Dunning_Window**: Stripe's 2-week Smart Retry period during which payment is retried up to 8 times before subscription cancellation
- **Portal**: The authenticated customer-facing dashboard at `/portal` for managing licenses, devices, billing, and team
- **Extension**: The Mouse VS Code extension distributed as a VSIX, containing licensing client code in `licensing/` and `mouse-vscode/src/licensing/`
- **Payment_Lifecycle**: The sequence of license states driven by Stripe payment events: `active → past_due → expired`
- **Admin_Suspension**: A team management action where a Business account admin suspends a team member's license; the only valid use of "suspended" status
- **Team_Route**: The `/api/portal/team` route handling team member invites, status updates (suspend/revoke/reinstate), and role changes
- **Activation_Route**: The `/api/license/activate` route handling browser-delegated device activation with JWT authentication

## Requirements

### Requirement 1: Remove Dead RETIRED Status

**User Story:** As a developer, I want dead code removed from the LICENSE_STATUS enum, so that the codebase contains only statuses that are actively used and the enum is an accurate contract.

#### Acceptance Criteria

1. THE LICENSE_STATUS enum SHALL NOT contain a RETIRED entry
2. THE LICENSE_STATUS_DISPLAY map SHALL NOT contain a RETIRED entry
3. WHEN the constants test suite runs, THE Test_Suite SHALL pass without any RETIRED assertions

---

### Requirement 2: Normalize Status Casing to Lowercase

**User Story:** As a developer, I want all license status values to be lowercase throughout the stack, so that status comparisons never silently fail due to casing mismatches between DDB, Keygen, and application code.

#### Acceptance Criteria

1. THE LICENSE_STATUS enum SHALL use lowercase string values (e.g., `ACTIVE: "active"`, `PAST_DUE: "past_due"`) while retaining UPPER_CASE keys
2. THE LICENSE_STATUS_DISPLAY map SHALL use lowercase keys matching the enum values (e.g., `"active"`, `"past_due"`)
3. WHEN Keygen returns a license status, THE Keygen_Module SHALL normalize the value to lowercase before returning it to callers
4. WHEN the Portal dashboard page renders subscription status, THE Portal_Dashboard SHALL use the status value directly from DDB without calling `.toUpperCase()`
5. WHEN the Portal license page renders license status, THE Portal_License_Page SHALL use the status value directly from DDB without calling `.toUpperCase()`
6. WHEN the PLG metrics script compares Keygen statuses, THE Metrics_Script SHALL compare against lowercase values
7. THE Extension LICENSE_STATES constants SHALL use lowercase string values
8. WHEN the Extension state module loads persisted state from an existing install, THE State_Module SHALL normalize any UPPER_CASE status values to lowercase

---

### Requirement 3: Centralize Event Type Strings in an Enum

**User Story:** As a developer, I want all event type strings centralized in a single EVENT_TYPES enum, so that typos are caught at definition time and every event write references a single source of truth.

#### Acceptance Criteria

1. THE Constants_Module SHALL export an EVENT_TYPES enum containing all event type strings used across the codebase: CUSTOMER_CREATED, LICENSE_CREATED, PAYMENT_FAILED, SUBSCRIPTION_REACTIVATED, CANCELLATION_REQUESTED, CANCELLATION_REVERSED, VOLUNTARY_CANCELLATION_EXPIRED, NONPAYMENT_CANCELLATION_EXPIRED, TEAM_INVITE_CREATED, TEAM_INVITE_RESENT
2. WHEN an event is written to DDB, THE Writing_Module SHALL reference EVENT_TYPES enum values instead of hardcoded strings
3. WHEN the Stripe webhook handler writes events, THE Stripe_Webhook_Handler SHALL use EVENT_TYPES enum values for all event type strings
4. WHEN the Keygen webhook handler writes events, THE Keygen_Webhook_Handler SHALL use EVENT_TYPES enum values for all event type strings
5. WHEN the Portal team route writes events, THE Portal_Team_Route SHALL use EVENT_TYPES enum values for all event type strings
6. WHEN the email template module maps events to templates, THE Email_Template_Module SHALL use EVENT_TYPES enum values as keys in EVENT_TYPE_TO_TEMPLATE

---

### Requirement 4: Remove "Suspended" from the Payment Path

**User Story:** As a developer, I want "suspended" removed from the payment failure path entirely, so that the payment lifecycle is `active → past_due → expired` and "suspended" means only admin-suspended team member.

#### Acceptance Criteria

1. WHEN a payment fails, THE Stripe_Webhook_Handler SHALL write "past_due" to DDB and SHALL NOT write "suspended" regardless of the payment failure count
2. WHEN a payment fails and the customer's subscription status is already "expired", THE Stripe_Webhook_Handler SHALL skip the "past_due" write to prevent overwriting a terminal state
3. WHEN a payment succeeds after prior failures, THE Stripe_Webhook_Handler SHALL reinstate from "past_due" status (not "suspended")
4. WHEN a Stripe subscription transitions to "unpaid", THE Stripe_Webhook_Handler SHALL map the status to "expired" (not "suspended")
5. WHEN a Stripe subscription is deleted and the prior status is "past_due", THE Stripe_Webhook_Handler SHALL handle the transition correctly and call Keygen's suspendLicense API to deactivate the license
6. WHEN a dispute is lost, THE Stripe_Webhook_Handler SHALL write "expired" to DDB (not "suspended"), with the fraudulent flag preserved
7. WHEN a Keygen license.suspended event is received, THE Keygen_Webhook_Handler SHALL log the event only and SHALL NOT write a LICENSE_SUSPENDED event to DDB or trigger an email
8. THE Constants_Module SHALL NOT export MAX_PAYMENT_FAILURES
9. THE Email_Template_Module SHALL NOT contain a licenseSuspended template
10. THE Email_Template_Module SHALL NOT contain LICENSE_SUSPENDED in EVENT_TYPE_TO_TEMPLATE
11. THE Email_Template_Module SHALL NOT contain licenseSuspended in TEMPLATE_NAMES
12. THE Customer_Update_Lambda SHALL NOT reference "suspended" in the payment path (admin-suspension references are retained)

---

### Requirement 5: Remove "Suspended" from the Extension

**User Story:** As a developer, I want the Mouse extension to have no concept of "suspended" in the payment/heartbeat path, so that the extension's licensing logic matches the simplified payment lifecycle.

#### Acceptance Criteria

1. THE Extension_Heartbeat_Module SHALL NOT contain a `_handleLicenseSuspended` handler or a `case "suspended"` / `case "license_suspended"` branch
2. THE Extension_Validation_Module SHALL NOT include "suspended" in VALID_HEARTBEAT_STATUSES
3. WHEN the heartbeat returns a "past_due" status, THE Extension_Heartbeat_Module SHALL map "past_due" to an active state where tools continue to work
4. THE Extension_HTTP_Client SHALL NOT check for `response.license?.status === "suspended"`
5. THE Extension_VSCode_Module SHALL NOT contain suspended-specific status bar or notification handling
6. THE Extension_Validate_Command SHALL NOT contain a suspended status mapping

---

### Requirement 6: Add License Renewal on Payment Success

**User Story:** As a developer, I want Keygen licenses renewed on every successful Stripe payment, so that Keygen's internal expiration clock resets and licenses do not expire while the customer is paying.

#### Acceptance Criteria

1. THE Keygen_Module SHALL export a `renewLicense(licenseId)` function that calls Keygen's `POST /licenses/{id}/actions/renew` endpoint
2. WHEN an invoice payment succeeds, THE Stripe_Webhook_Handler SHALL call `renewLicense` with the customer's Keygen license ID
3. IF the `renewLicense` call fails, THEN THE Stripe_Webhook_Handler SHALL log a warning and continue processing without blocking the DDB status update to "active"
4. IF the customer has no Keygen license ID, THEN THE Stripe_Webhook_Handler SHALL skip the `renewLicense` call without error

---

### Requirement 7: Fix Heartbeat Null License and Status Checks

**User Story:** As a developer, I want the heartbeat endpoint to reject requests when no license exists and to block access for expired/suspended/revoked licenses, so that the extension cannot gain access without a valid license record.

#### Acceptance Criteria

1. WHEN `getLicenseByKey` returns null, THE Heartbeat_Endpoint SHALL return HTTP 404 with `{ valid: false, error: "License not found" }`
2. WHEN the license status is "expired", "suspended", or "revoked", THE Heartbeat_Endpoint SHALL return `{ valid: false, status: <status>, reason: "License is <status>" }`
3. WHEN the license status is "active", "past_due", "cancellation_pending", or "trial", THE Heartbeat_Endpoint SHALL return `{ valid: true }` with the appropriate status
4. WHEN the license status is "past_due", THE Heartbeat_Endpoint SHALL return `valid: true` because past-due users retain full tool access during the Dunning_Window

---

### Requirement 8: Fix Portal Status for Past-Due Customers

**User Story:** As a developer, I want past-due customers to see their actual "past_due" status in the portal instead of "expired", so that they can access their billing page to fix their payment method.

#### Acceptance Criteria

1. THE Portal_Status_Route SHALL classify "past_due" as its own category, separate from both active and expired subscription arrays
2. THE Portal_Status_Route SHALL classify "active", "trial", and "cancellation_pending" as active subscriptions
3. THE Portal_Status_Route SHALL classify only "expired" as an expired subscription
4. WHEN a past-due customer accesses the portal, THE Portal_Status_Route SHALL return the "past_due" status with full portal access
5. WHEN an expired customer accesses the portal, THE Portal_Status_Route SHALL return the "expired" status with full portal access (portal access is not gated by payment status)

---

### Requirement 9: Replace Keygen Reads with DDB Reads

**User Story:** As a developer, I want the three endpoints that read from Keygen at request time to read from DDB instead, so that DynamoDB is the sole source of truth for reads, reducing latency and eliminating a runtime dependency on Keygen availability.

#### Acceptance Criteria

1. WHEN the `/api/license/validate` endpoint processes a request, THE Validate_Route SHALL read license and device data from DDB (via `getLicenseByKey` and `getDeviceByFingerprint`) instead of calling Keygen's `validateLicense`
2. WHEN the `/api/portal/license` endpoint builds a license response, THE Portal_License_Route SHALL read license data from DDB only and SHALL NOT call Keygen's `getLicense`
3. WHEN the `/api/license/check` endpoint needs to look up licenses by email, THE Check_Route SHALL use DDB's `getCustomerLicensesByEmail` instead of Keygen's `getLicensesByEmail`
4. THE Validate_Route SHALL NOT import `validateLicense` from the Keygen module
5. THE Portal_License_Route SHALL NOT import `getLicense` from the Keygen module for read operations
6. THE Check_Route SHALL NOT import `getLicensesByEmail` from the Keygen module

---

### Requirement 10: Deactivate Member Devices on Admin Suspension/Revocation

**User Story:** As a Business account Owner, I want a suspended or revoked team member's devices immediately deactivated, so that the member cannot continue using Mouse tools indefinitely after I revoke their access.

#### Acceptance Criteria

1. WHEN the Owner sets a member's status to "suspended" via the Team_Route, THE Team_Route SHALL query all of the member's devices under the org license and deactivate each device in both Keygen (DELETE machine) and DDB (remove device record)
2. WHEN the Owner sets a member's status to "revoked" via the Team_Route, THE Team_Route SHALL deactivate all of the member's devices using the same mechanism as suspension
3. WHEN a Keygen device deactivation call fails during member suspension, THE Team_Route SHALL log a warning and continue with the DDB device record removal (Keygen sync failure is non-blocking)
4. WHEN the Owner sets a member's status back to "active" (reinstatement), THE Team_Route SHALL NOT deactivate any devices (the member re-activates through the normal browser-delegated activation flow)
5. WHEN the suspended/revoked member's extension sends its next heartbeat, THE Heartbeat_Endpoint SHALL return `{ valid: false, status: "machine_not_found" }` because the Keygen machine no longer exists
6. THE Team_Route SHALL resolve the org's Keygen license ID by fetching the org record's `ownerId` and then the owner's customer record's `keygenLicenseId`
7. WHEN the member has zero active devices, THE Team_Route SHALL complete the suspension/revocation successfully with a no-op device cleanup

---

### Requirement 11: Block Activation for Suspended/Revoked Org Members

**User Story:** As a Business account Owner, I want a suspended or revoked team member unable to re-activate Mouse on any device, so that the member cannot circumvent admin suspension by re-running the activation flow.

#### Acceptance Criteria

1. WHEN a user attempts to activate a device on a Business plan license, THE Activation_Route SHALL check the user's org membership status before proceeding
2. IF the user's org membership status is "suspended", THEN THE Activation_Route SHALL return HTTP 403 with code `MEMBER_SUSPENDED` and a message directing the user to contact their team administrator
3. IF the user's org membership status is "revoked", THEN THE Activation_Route SHALL return HTTP 403 with code `MEMBER_REVOKED` and a message directing the user to contact their team administrator
4. IF the user's org membership status is "active", THEN THE Activation_Route SHALL proceed with normal activation (no regression)
5. THE Activation_Route SHALL only perform the org membership check for Business plan licenses (Individual plan activations are unaffected)

---

### Requirement 12: Production Configuration

**User Story:** As a platform operator, I want the Stripe and Keygen dashboards configured correctly, so that the dunning window, retry behavior, and license expiration durations align with the remediated payment lifecycle.

#### Acceptance Criteria

1. THE Stripe_Dashboard SHALL have Smart Retries enabled with a maximum of 8 retries over a 2-week maximum duration
2. THE Stripe_Dashboard SHALL cancel the subscription after all retries fail
3. THE Keygen_Dashboard SHALL set the Monthly policy duration to 44 days (3,801,600 seconds) to cover 30 billing days plus 14 dunning days
4. THE Keygen_Dashboard SHALL set the Annual policy duration to 379 days (32,745,600 seconds) to cover 365 billing days plus 14 dunning days

---

### Requirement 13: Test Coverage

**User Story:** As a developer, I want comprehensive test coverage for all remediated code paths, so that regressions are caught immediately and each fix is verified in isolation before proceeding to the next.

#### Acceptance Criteria

1. WHEN a fix is completed, THE Test_Suite SHALL achieve 100% pass rate before the next fix begins (test gate per fix)
2. THE Test_Suite SHALL verify `renewLicense` succeeds, fails gracefully, and retries correctly
3. THE Test_Suite SHALL verify `handlePaymentSucceeded` calls `renewLicense` on every successful payment and writes "active" to DDB even if `renewLicense` fails
4. THE Test_Suite SHALL verify the Heartbeat_Endpoint returns 404 when license is null, returns `valid: false` for expired/suspended/revoked, and returns `valid: true` for active/past_due/cancellation_pending/trial
5. THE Test_Suite SHALL verify all existing tests pass with lowercase status values after the casing migration
6. THE Test_Suite SHALL verify the Extension state module migrates UPPER_CASE status values to lowercase
7. THE Test_Suite SHALL verify `handlePaymentFailed` writes "past_due" only and never "suspended", and skips the write when status is already "expired"
8. THE Test_Suite SHALL verify `handleDisputeClosed` writes "expired" on a lost dispute
9. THE Test_Suite SHALL verify the Portal_Status_Route returns "past_due" status with full portal access
10. THE Test_Suite SHALL verify all three migrated endpoints (validate, portal/license, check) read from DDB only with no Keygen calls
11. THE Test_Suite SHALL verify no hardcoded event strings remain in source files (grep verification)
12. THE Test_Suite SHALL verify the Extension heartbeat has no "suspended" case and maps "past_due" to active
13. THE Test_Suite SHALL verify that suspending a member deactivates all of the member's devices in both Keygen and DDB
14. THE Test_Suite SHALL verify that revoking a member deactivates all of the member's devices in both Keygen and DDB
15. THE Test_Suite SHALL verify that reinstating a member to "active" does not deactivate any devices
16. THE Test_Suite SHALL verify that activation returns 403 MEMBER_SUSPENDED for suspended org members on Business licenses
17. THE Test_Suite SHALL verify that activation returns 403 MEMBER_REVOKED for revoked org members on Business licenses
18. THE Test_Suite SHALL verify that activation succeeds for active org members on Business licenses (no regression)

---

### Requirement 14: Execution Order Enforcement

**User Story:** As a developer, I want the fixes applied in a specific dependency order, so that each fix builds on a stable foundation and no fix depends on uncommitted changes from a later fix.

#### Acceptance Criteria

1. THE Remediation SHALL execute fixes in this order: Fix 6 (RETIRED) → Fix 3 (Casing) → Fix 8 (EVENT_TYPES) → Fix 5 (Suspended cleanup) → Fix 1 (renewLicense) → Fix 2 (Heartbeat) → Fix 4 (Portal status) → Fix 7 (Keygen reads) → Fix 9 (Admin suspension)
2. WHEN a fix is completed, THE Developer SHALL run the full test suite and achieve 100% pass rate before starting the next fix

---

### Requirement 15: Scope Boundary — Excluded Items

**User Story:** As a developer, I want the scope boundary clearly defined, so that this remediation does not expand into deferred infrastructure work.

#### Acceptance Criteria

1. THE Remediation SHALL NOT include SQS queue or DLQ for async Keygen mutation sync
2. THE Remediation SHALL NOT include a license reconciliation scheduled task
3. THE Remediation SHALL NOT include a circuit breaker for Keygen mutation calls
4. ~~THE Remediation SHALL NOT include admin-to-Keygen device deactivation sync~~ (addressed by Requirements 10-11, Fix 9)
5. THE Remediation SHALL NOT include legacy DynamoDB data migration
6. THE Remediation SHALL NOT include CloudWatch alarms for Keygen sync
7. THE Remediation SHALL NOT include new email templates (memberSuspended, memberRevoked, memberReactivated)
