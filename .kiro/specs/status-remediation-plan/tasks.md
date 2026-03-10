# Implementation Plan: Status Remediation Plan

## Overview

Remediate the license status and payment lifecycle system across the HIC platform (PLG website + Mouse extension). Nine fixes applied in strict dependency order per Requirement 14: Fix 6 → Fix 3 → Fix 8 → Fix 5 → Fix 1 → Fix 2 → Fix 4 → Fix 7 → Fix 9. Each fix includes implementation, unit tests, property-based tests, and a test gate checkpoint before proceeding.

## ⚠️ Cross-Repo Execution Plan

This remediation spans two repos. To minimize context switches, execute in this order:

### Phase 1 — Website repo (`plg-website/`, this workspace)
Complete ALL website-side tasks first:
- Fix 6 (Task 1): RETIRED removal — ✅ website-only
- Fix 3 (Task 3): Casing normalization — tasks 3.1–3.5, 3.8 (website portions), 3.9 only
- Fix 8 (Task 5): EVENT_TYPES enum — ✅ website-only
- Fix 5 (Task 6): Suspended removal — tasks 6.1–6.8, 6.14 (website portions), 6.15, 6.16, 6.18 only
- Fix 1 (Task 8): renewLicense — ✅ website-only
- Fix 2 (Task 9): Heartbeat — ✅ website-only
- Fix 4 (Task 11): Portal status — ✅ website-only
- Fix 7 (Task 12): Keygen→DDB reads — ✅ website-only
- Fix 9 (Task 14): Admin suspension — ✅ website-only

### Phase 2 — Extension repo (`~/source/repos/hic`), ONE context switch
All extension tasks batched together:
- Fix 3 extension tasks: 3.6, 3.7, 3.10, 3.11, extension portions of 3.8
- Fix 5 extension tasks: 6.9, 6.10, 6.11, 6.12, 6.13, 6.17, extension portions of 6.14
- Also fix VSIX packaging: exclude `**/tests/**` from `.vscodeignore`

### Phase 3 — Return to website repo for final checkpoints
- Run checkpoints 2, 4, 7 (which depend on extension tasks being done)
- Run final checkpoint (Task 17)

**Total context switches: 2** (website → extension → website)
**Nothing in the extension blocks website Fixes 1, 2, 4, 7, or 9.**


## Tasks

- [x] 1. Fix 6 — Remove dead RETIRED status
  - [x] 1.1 Remove RETIRED from LICENSE_STATUS and LICENSE_STATUS_DISPLAY in `plg-website/src/lib/constants.js`
    - Delete the `RETIRED: "RETIRED"` entry from `LICENSE_STATUS`
    - Delete the `RETIRED` entry from `LICENSE_STATUS_DISPLAY`
    - _Requirements: 1.1, 1.2_
  - [x] 1.2 Write unit tests for RETIRED removal
    - Assert `LICENSE_STATUS.RETIRED` is `undefined`
    - Assert `LICENSE_STATUS_DISPLAY` has no RETIRED key
    - Test file: `tests/lib/constants.test.js`
    - _Requirements: 1.3, 13.1_
  - [x] 1.3 Write property test — Property 1: LICENSE_STATUS values are lowercase and DISPLAY keys match
    - **Property 1: LICENSE_STATUS values are lowercase and DISPLAY keys match**
    - For any key-value pair in LICENSE_STATUS, the value must be a lowercase string; for any key in LICENSE_STATUS_DISPLAY, that key must exist as a value in LICENSE_STATUS
    - Tag: `// Feature: status-remediation-plan, Property 1`
    - **Validates: Requirements 2.1, 2.2**

- [x] 2. Checkpoint — Fix 6 complete
  - Run the full test suite to verify no regressions from RETIRED removal (Requirement 14.2 compliance)

- [x] 3. Fix 3 — Normalize status casing to lowercase
  - [x] 3.1 Update LICENSE_STATUS enum values to lowercase in `plg-website/src/lib/constants.js`
    - Change all values to lowercase strings (e.g., `ACTIVE: "active"`, `PAST_DUE: "past_due"`)
    - Add `SUSPENDED: "suspended"` entry (not currently in enum, needed by Fixes 2 and 9)
    - Keys remain UPPER_CASE
    - Also verify whether `LICENSE_STATUS_DISPLAY` needs a corresponding "suspended" entry
    - _Requirements: 2.1_
  - [x] 3.2 Update LICENSE_STATUS_DISPLAY keys to lowercase in `plg-website/src/lib/constants.js`
    - Change all keys to match the new lowercase enum values
    - _Requirements: 2.2_
  - [x] 3.3 Add status normalization in `plg-website/src/lib/keygen.js`
    - Add a helper that lowercases any status string returned by Keygen API calls
    - Apply the helper to all functions that return license status from Keygen
    - _Requirements: 2.3_
  - [x] 3.4 Remove `.toUpperCase()` calls from portal pages
    - `plg-website/src/app/api/portal/status/route.js` — use status directly from DDB
    - Portal dashboard and license pages — remove any `.toUpperCase()` on status values
    - _Requirements: 2.4, 2.5_
  - [x] 3.5 Update PLG metrics script to compare against lowercase values
    - Find and update any Keygen status comparisons in the metrics script
    - _Requirements: 2.6_
  - [x] 3.6 Update extension LICENSE_STATES to lowercase in `hic/` repo
  > **🔀 EXTENSION REPO** — Tasks 3.6, 3.7, 3.10, 3.11 target `~/source/repos/hic`. Defer to Phase 2.
    - Change all values in `~/source/repos/hic/licensing/constants.js` to lowercase
    - _Requirements: 2.7_
  - [x] 3.7 Add state migration logic in extension state module
    - When loading persisted state, normalize any UPPER_CASE status values to lowercase
    - File: `~/source/repos/hic/licensing/state.js`
    - _Requirements: 2.8_
  - [x] 3.8 Write unit tests for casing normalization
    - Assert all LICENSE_STATUS values are lowercase
    - Assert all LICENSE_STATUS_DISPLAY keys are lowercase and match enum values
    - Assert Keygen module normalizes mixed-case status to lowercase
    - Assert extension LICENSE_STATES values are lowercase
    - Assert extension state migration converts UPPER_CASE to lowercase
    - Test files: `tests/lib/constants.test.js`, `tests/lib/keygen.test.js`
    - _Requirements: 13.5, 13.6_
  - [x] 3.9 Write property test — Property 2: Keygen status normalization
    - **Property 2: Keygen status normalization**
    - For any status string returned by the Keygen module (regardless of original casing), the returned value must be strictly lowercase
    - Tag: `// Feature: status-remediation-plan, Property 2`
    - **Validates: Requirements 2.3**
  - [x] 3.10 Write property test — Property 3: Extension LICENSE_STATES lowercase
    - **Property 3: Extension LICENSE_STATES lowercase**
    - For any value in the extension's LICENSE_STATES constants object, the value must be a lowercase string
    - Tag: `// Feature: status-remediation-plan, Property 3`
    - **Validates: Requirements 2.7**
  - [x] 3.11 Write property test — Property 4: Extension state migration normalizes to lowercase
    - **Property 4: Extension state migration normalizes to lowercase**
    - For any persisted status string (including UPPER_CASE values from prior installs), loading it through the state module must produce a lowercase result
    - Tag: `// Feature: status-remediation-plan, Property 4`
    - **Validates: Requirements 2.8**

- [x] 4. Checkpoint — Fix 6 + Fix 3 complete
  - Ensure all tests pass, ask the user if questions arise.
  - Run the full test suite to verify no regressions from RETIRED removal and casing normalization

- [x] 5. Fix 8 — Centralize event type strings in EVENT_TYPES enum
  - [x] 5.1 Add EVENT_TYPES enum to `plg-website/src/lib/constants.js`
    - Added all 12 event type strings: CUSTOMER_CREATED, LICENSE_CREATED, PAYMENT_FAILED, SUBSCRIPTION_REACTIVATED, CANCELLATION_REQUESTED, CANCELLATION_REVERSED, VOLUNTARY_CANCELLATION_EXPIRED, NONPAYMENT_CANCELLATION_EXPIRED, TEAM_INVITE_CREATED, TEAM_INVITE_RESENT, LICENSE_REVOKED, LICENSE_SUSPENDED
    - LICENSE_REVOKED and LICENSE_SUSPENDED added to complete centralization of all event strings
    - _Requirements: 3.1_
  - [x] 5.2 Replace hardcoded event strings in Stripe webhook handler
    - File: `plg-website/src/app/api/webhooks/stripe/route.js`
    - Import EVENT_TYPES and replace all remaining hardcoded event type strings
    - _Requirements: 3.2, 3.3_
  - [x] 5.3 Replace hardcoded event strings in Keygen webhook handler
    - File: `plg-website/src/app/api/webhooks/keygen/route.js`
    - Imported EVENT_TYPES; replaced `"LICENSE_REVOKED"` with `EVENT_TYPES.LICENSE_REVOKED`
    - _Requirements: 3.4_
  - [x] 5.4 Replace hardcoded event strings in portal team route
    - File: `plg-website/src/app/api/portal/team/route.js`
    - Imported EVENT_TYPES; replaced `"LICENSE_SUSPENDED"`, `"LICENSE_REVOKED"` (×2) with enum references
    - _Requirements: 3.5_
  - [x] 5.5 Replace hardcoded event strings in DynamoDB module and email templates
    - File: `plg-website/src/lib/dynamodb.js` — imported EVENT_TYPES; replaced `"LICENSE_CREATED"`, `"TEAM_INVITE_CREATED"`, `"TEAM_INVITE_RESENT"` with enum references
    - File: `dm/layers/ses/src/email-templates.js` — EVENT_TYPE_TO_TEMPLATE keys already use string literals that match EVENT_TYPES values; no direct import needed (avoids circular dependency between DM and PLG modules)
    - _Requirements: 3.6_
  - [x] 5.6 Write unit tests for EVENT_TYPES enum
    - Assert EVENT_TYPES contains all 12 expected keys
    - Assert no hardcoded event strings remain in source files (grep verification for stripe, keygen, team, dynamodb)
    - Assert EMAIL_TYPE_TO_TEMPLATE keys are all valid EVENT_TYPES keys
    - Test file: `__tests__/unit/lib/constants.test.js`
    - _Requirements: 13.11_

- [x] 6. Fix 5 — Remove "suspended" from the payment path
  - [x] 6.1 Update `handlePaymentFailed` in Stripe webhook handler
    - Remove `MAX_PAYMENT_FAILURES` import and the `>= MAX_PAYMENT_FAILURES` branch that writes "suspended"
    - Always write "past_due" to DDB on payment failure
    - Add guard: skip write if current status is already "expired"
    - File: `plg-website/src/app/api/webhooks/stripe/route.js`
    - _Requirements: 4.1, 4.2_
  - [x] 6.2 Update `handlePaymentSucceeded` in Stripe webhook handler
    - Remove "suspended" from the reinstatement condition (only reinstate from "past_due")
    - File: `plg-website/src/app/api/webhooks/stripe/route.js`
    - _Requirements: 4.3_
  - [x] 6.3 Update `handleSubscriptionUpdated` in Stripe webhook handler
    - Replace `unpaid: "suspended"` with `unpaid: "expired"` in statusMap
    - Remove reinstatement block for "suspended" status
    - File: `plg-website/src/app/api/webhooks/stripe/route.js`
    - _Requirements: 4.4_
  - [x] 6.4 Update `handleSubscriptionDeleted` in Stripe webhook handler
    - Remove "suspended" from the `priorStatus` check for NONPAYMENT_CANCELLATION_EXPIRED
    - File: `plg-website/src/app/api/webhooks/stripe/route.js`
    - _Requirements: 4.5_
  - [x] 6.5 Update `handleDisputeClosed` in Stripe webhook handler
    - Write "expired" (not "suspended") on lost dispute, preserving `fraudulent: true`
    - File: `plg-website/src/app/api/webhooks/stripe/route.js`
    - _Requirements: 4.6_
  - [x] 6.6 Update Keygen webhook handler — `handleLicenseSuspended` to log-only
    - Remove DDB write (`updateLicenseStatus`) and email trigger
    - Log the event only
    - File: `plg-website/src/app/api/webhooks/keygen/route.js`
    - _Requirements: 4.7_
  - [x] 6.7 Remove MAX_PAYMENT_FAILURES from constants
    - File: `plg-website/src/lib/constants.js`
    - _Requirements: 4.8_
  - [x] 6.8 Remove licenseSuspended from email templates
    - Remove `licenseSuspended` template, `LICENSE_SUSPENDED` from `EVENT_TYPE_TO_TEMPLATE`, `licenseSuspended` from `TEMPLATE_NAMES`
    - File: `dm/layers/ses/src/email-templates.js`
    - _Requirements: 4.9, 4.10, 4.11_
  - [x] 6.9 Remove "suspended" from extension heartbeat module
  > **🔀 EXTENSION REPO** — Tasks 6.9–6.13, 6.17 target `~/source/repos/hic`. Defer to Phase 2.
    - Remove `_handleLicenseSuspended` handler and `case "suspended"` / `case "license_suspended"` branches
    - Map "past_due" to active state (tools continue working)
    - File: extension `licensing/heartbeat.js`
    - _Requirements: 5.1, 5.3_
  - [x] 6.10 Remove "suspended" from extension validation module
    - Remove "suspended" from `VALID_HEARTBEAT_STATUSES`
    - File: extension `licensing/validation.js`
    - _Requirements: 5.2_
  - [x] 6.11 Remove "suspended" check from extension HTTP client
    - Remove `response.license?.status === "suspended"` check
    - File: extension `licensing/http-client.js`
    - _Requirements: 5.4_
  - [x] 6.12 Remove suspended-specific handling from extension VSCode module
    - Remove suspended-specific status bar and notification handling
    - _Requirements: 5.5_
  - [x] 6.13 Remove suspended status mapping from extension validate command
    - File: extension `licensing/commands/validate.js`
    - _Requirements: 5.6_
  - [x] 6.14 Write unit tests for suspended removal from payment path [EXTENSION ONLY REMAINING]
    - Assert `handlePaymentFailed` writes "past_due" only and never "suspended"
    - Assert `handlePaymentFailed` skips write when status is already "expired"
    - Assert `handleDisputeClosed` writes "expired" on lost dispute
    - Assert Keygen `handleLicenseSuspended` logs only, no DDB write or email
    - Assert extension heartbeat has no "suspended" case
    - Assert extension maps "past_due" to active
    - Test files: `tests/webhooks/stripe.test.js`, `tests/webhooks/keygen.test.js`
    - _Requirements: 13.7, 13.8, 13.12_
  - [x] 6.15 Write property test — Property 5: Payment failure always writes "past_due"
    - **Property 5: Payment failure always writes "past_due"**
    - For any `invoice.payment_failed` event with any `attempt_count`, `handlePaymentFailed` must write "past_due" and never "suspended", unless current status is "expired" (skip)
    - Tag: `// Feature: status-remediation-plan, Property 5`
    - **Validates: Requirements 4.1, 4.2**
  - [x] 6.16 Write property test — Property 6: Lost dispute writes "expired" with fraudulent flag
    - **Property 6: Lost dispute writes "expired" with fraudulent flag**
    - For any lost dispute event, `handleDisputeClosed` must write "expired" with `fraudulent: true` and never "suspended"
    - Tag: `// Feature: status-remediation-plan, Property 6`
    - **Validates: Requirements 4.6**
  - [x] 6.17 Write property test — Property 20: Extension maps "past_due" to active
    - **Property 20: Extension maps "past_due" to active**
    - For any heartbeat response with status "past_due", the extension heartbeat module must map it to an active state where all tools continue to work
    - Tag: `// Feature: status-remediation-plan, Property 20`
    - **Validates: Requirements 5.3**
  - [x] 6.18 Write property test — Property 22: Payment success reinstates from past_due only
    - **Property 22: Payment success reinstates from past_due only**
    - For any payment success where prior status is "past_due", must write "active" and call reinstateLicense; must not check for or reinstate from "suspended"
    - Tag: `// Feature: status-remediation-plan, Property 22`
    - **Validates: Requirements 4.3**

- [x] 7. Checkpoint — Fix 8 + Fix 5 complete
  - Ensure all tests pass, ask the user if questions arise.
  - Run the full test suite to verify no regressions from EVENT_TYPES centralization and suspended removal

- [x] 8. Fix 1 — Add license renewal on payment success
  - [x] 8.1 Implement `renewLicense(licenseId)` in Keygen module
    - Add function calling `POST /licenses/{id}/actions/renew`
    - File: `plg-website/src/lib/keygen.js`
    - _Requirements: 6.1_
  - [x] 8.2 Call `renewLicense` in `handlePaymentSucceeded`
    - Call `renewLicense(keygenLicenseId)` after successful payment
    - Log warning and continue if `renewLicense` fails (non-blocking)
    - Skip `renewLicense` if customer has no `keygenLicenseId`
    - File: `plg-website/src/app/api/webhooks/stripe/route.js`
    - _Requirements: 6.2, 6.3, 6.4_
  - [x] 8.3 Write unit tests for renewLicense
    - Assert `renewLicense` calls correct Keygen endpoint
    - Assert `handlePaymentSucceeded` calls `renewLicense` on every successful payment
    - Assert `handlePaymentSucceeded` writes "active" to DDB even if `renewLicense` fails
    - Assert `renewLicense` is skipped when customer has no `keygenLicenseId`
    - Test files: `__tests__/unit/lib/keygen.test.js`, `__tests__/unit/webhooks/stripe.test.js`
    - _Requirements: 13.2, 13.3_
  - [x] 8.4 Write property test — Property 7: Payment success calls renewLicense
    - **Property 7: Payment success calls renewLicense**
    - For any payment success where customer has a keygenLicenseId, `handlePaymentSucceeded` must call `renewLicense(keygenLicenseId)`
    - 3 sub-tests: with licenseId (100 iter), without licenseId (100 iter), across all statuses (100 iter)
    - File: `__tests__/property/webhooks/stripe.property.test.js`
    - Tag: `// Feature: status-remediation-plan, Property 7`
    - **Validates: Requirements 6.2**
  - [x] 8.5 Write property test — Property 8: renewLicense failure does not block DDB active write
    - **Property 8: renewLicense failure does not block DDB active write**
    - For any payment success where `renewLicense` throws, `handlePaymentSucceeded` must still write "active" to DDB
    - 4 sub-tests: DDB writes "active" (100 iter), handler doesn't throw (100 iter), logs warning (100 iter), past_due reinstatement unblocked (100 iter)
    - File: `__tests__/property/webhooks/stripe.property.test.js`
    - Tag: `// Feature: status-remediation-plan, Property 8`
    - **Validates: Requirements 6.3**
  - [x] 8.6 Write property test — Property 21: renewLicense calls correct endpoint
    - **Property 21: renewLicense calls correct endpoint**
    - For any licenseId, `renewLicense(licenseId)` must issue a POST to `/licenses/{licenseId}/actions/renew`
    - 2 sub-tests: random string IDs (100 iter), UUID-format IDs (100 iter)
    - File: `__tests__/unit/lib/keygen.test.js`
    - Tag: `// Feature: status-remediation-plan, Property 21`
    - **Validates: Requirements 6.1**

- [x] 9. Fix 2 — Fix heartbeat null license and status checks
  - [x] 9.1 Add null license guard to heartbeat endpoint
    - When `getLicenseByKey` returns null, return HTTP 404 with `{ valid: false, error: "License not found" }`
    - File: `plg-website/src/app/api/license/heartbeat/route.js`
    - _Requirements: 7.1_
  - [x] 9.2 Add status classification to heartbeat endpoint
    - If status is "expired", "suspended", or "revoked": return `{ valid: false, status, reason: "License is <status>" }`
    - If status is "active", "past_due", "cancellation_pending", or "trial": return `{ valid: true }` with status
    - "past_due" returns `valid: true` (tools work during dunning window)
    - File: `plg-website/src/app/api/license/heartbeat/route.js`
    - _Requirements: 7.2, 7.3, 7.4_
  - [x] 9.3 Write unit tests for heartbeat endpoint
    - Assert 404 when license is null
    - Assert `valid: false` for expired, suspended, revoked
    - Assert `valid: true` for active, past_due, cancellation_pending, trial
    - Assert "past_due" returns `valid: true` with status
    - Test file: `tests/license/heartbeat.test.js`
    - _Requirements: 13.4_
  - [x] 9.4 Write property test — Property 9: Heartbeat status classification
    - **Property 9: Heartbeat status classification**
    - For any license record, heartbeat returns `valid: true` iff status is in {active, past_due, cancellation_pending, trial}; `valid: false` for {expired, suspended, revoked}; HTTP 404 for null
    - Tag: `// Feature: status-remediation-plan, Property 9`
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**

- [x] 10. Checkpoint — Fix 1 + Fix 2 complete
  - Ensure all tests pass, ask the user if questions arise.
  - Run the full test suite to verify renewLicense and heartbeat fixes

- [x] 11. Fix 4 — Fix portal status for past-due customers
  - [x] 11.0 Remove dead "trialing" and unused LICENSE_STATUS.TRIAL from source
    - `"trialing"` is Stripe's trial subscription status, but Mouse has no Stripe trial — the 14-day trial is extension-side, device-bound, and never touches Stripe
    - `LICENSE_STATUS.TRIAL` ("trial") is NOT used as a subscriptionStatus anywhere — it's only a heartbeat/validate API response status for device-level trials
    - No authenticated user ever receives "trial" or "trialing" as a subscriptionStatus; users without subscriptions get "none"
    - Remove `trialing: "trialing"` from `statusMap` in `src/app/api/webhooks/stripe/route.js`
    - Remove `"trialing"` from `hasActiveSubscription` array in `src/app/api/portal/status/route.js`
    - Remove `"trialing"` from `hasActiveSubscription` array in `src/app/api/license/check/route.js`
    - Remove `subscriptionStatus === "trialing"` branch in `src/app/portal/page.js`
    - Remove `trialing` entries from `SubscriptionStatusBadge` in `src/app/portal/billing/page.js`
    - Remove `TRIAL: "trial"` from `LICENSE_STATUS` and `trial: { ... }` from `LICENSE_STATUS_DISPLAY` in constants.js — the enum entry is never imported or referenced; heartbeat/validate use the string literal `"trial"` directly
    - Preserve all heartbeat/validate `status: "trial"` response literals — those are live device-trial API responses, not subscription statuses
    - Update affected tests (fixtures, cognito tests, plg-metrics tests)
    - _Discovered during Fix 4 implementation — "trialing" is dead code per business logic_
  - [x] 11.1 Reclassify status categories in portal status route
    - Active: `["active", "trial", "cancellation_pending"]`
    - Past Due: `["past_due"]` (new category, separate from expired)
    - Expired: `["expired"]` (remove "past_due" from expired array)
    - Add `hasPastDueSubscription` check
    - Return "past_due" as its own status with full portal access
    - All statuses receive full portal access (portal access is not gated by payment status)
    - File: `plg-website/src/app/api/portal/status/route.js`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  - [x] 11.2 Write unit tests for portal status classification
    - Assert "past_due" is its own category, not lumped with expired
    - Assert active/trial/cancellation_pending classified as active
    - Assert "expired" classified as expired
    - Assert past-due customer gets full portal access
    - Assert expired customer gets full portal access
    - Test file: `tests/portal/status.test.js`
    - _Requirements: 13.9_
  - [x] 11.3 Write property test — Property 10: Portal status classification
    - **Property 10: Portal status classification**
    - For any subscription status, portal classifies: active if in {active, trial, cancellation_pending}; past_due if "past_due"; expired if "expired"; all get full portal access
    - Tag: `// Feature: status-remediation-plan, Property 10`
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**

- [x] 12. Fix 7 — Replace Keygen reads with DDB reads
  - [x] 12.1 Migrate validate route to DDB reads
    - Replace `validateLicense(licenseKey, fingerprint)` Keygen call with `getLicenseByKey(licenseKey)` + `getDeviceByFingerprint(licenseId, fingerprint)` from DDB
    - Remove `validateLicense` import from keygen module
    - Preserve trial flow (fingerprint-only path) unchanged
    - File: `plg-website/src/app/api/license/validate/route.js`
    - _Requirements: 9.1, 9.4_
  - [x] 12.2 Migrate portal license route to DDB reads
    - Remove `getKeygenLicense` call in `buildLicenseResponse`
    - Use DDB `getLicense` data only for status, expiresAt, etc.
    - Remove `import { getLicense as getKeygenLicense } from "@/lib/keygen"`
    - File: `plg-website/src/app/api/portal/license/route.js`
    - _Requirements: 9.2, 9.5_
  - [x] 12.3 Migrate check route to DDB reads
    - Replace `getLicensesByEmail(email)` Keygen call with `getCustomerLicensesByEmail(email)` DDB call
    - Remove `import { getLicensesByEmail } from "@/lib/keygen"`
    - Adapt response mapping to use DDB license record shape
    - File: `plg-website/src/app/api/license/check/route.js`
    - _Requirements: 9.3, 9.6_
  - [x] 12.4 Write unit tests for DDB migration
    - Assert validate route calls DDB functions, not Keygen
    - Assert portal license route uses DDB only, no Keygen import
    - Assert check route calls DDB function, not Keygen
    - Assert no Keygen read imports remain in migrated routes
    - Test files: `tests/license/validate.test.js`, `tests/portal/license.test.js`, `tests/license/check.test.js`
    - _Requirements: 13.10_
  - [x] 12.5 Write property test — Property 11: Validate route reads from DDB only
    - **Property 11: Validate route reads from DDB only**
    - For any validation request, must call getLicenseByKey and getDeviceByFingerprint from DDB, must not call validateLicense from Keygen
    - Tag: `// Feature: status-remediation-plan, Property 11`
    - **Validates: Requirements 9.1, 9.4**
  - [x] 12.6 Write property test — Property 12: Portal license route reads from DDB only
    - **Property 12: Portal license route reads from DDB only**
    - For any portal license request, buildLicenseResponse must use DDB data only, must not call getKeygenLicense
    - Tag: `// Feature: status-remediation-plan, Property 12`
    - **Validates: Requirements 9.2, 9.5**
  - [x] 12.7 Write property test — Property 13: Check route reads from DDB only
    - **Property 13: Check route reads from DDB only**
    - For any check request by email, must call getCustomerLicensesByEmail from DDB, must not call getLicensesByEmail from Keygen
    - Tag: `// Feature: status-remediation-plan, Property 13`
    - **Validates: Requirements 9.3, 9.6**

- [x] 13. Checkpoint — Fix 4 + Fix 7 complete
  - Ensure all tests pass, ask the user if questions arise.
  - Run the full test suite to verify portal status and DDB migration fixes

- [x] 14. Fix 9 — Admin suspension: deactivate devices and block activation
  - [x] 14.1 Implement device deactivation on suspend/revoke in team route
    - When status is "suspended" or "revoked": query member's devices via `getUserDevices(keygenLicenseId, memberId)`, then for each device call `deactivateDevice(keygenMachineId)` (Keygen) and `removeDeviceActivation(keygenLicenseId, keygenMachineId, fingerprint)` (DDB)
    - Resolve org's Keygen license ID: fetch org → get `ownerId` → get owner's customer record → `keygenLicenseId`
    - Log warning and continue if individual Keygen deactivation fails (non-blocking)
    - No-op device cleanup if member has zero devices
    - When status is "active" (reinstatement): do NOT deactivate any devices
    - File: `plg-website/src/app/api/portal/team/route.js`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.6, 10.7_
  - [x] 14.2 Block activation for suspended/revoked org members
    - After license validation, check if Business plan license
    - If Business: look up user's org membership via `getUserOrgMembership(userId)`
    - If membership status is "suspended": return HTTP 403 with `{ code: "MEMBER_SUSPENDED", message: "Your team membership has been suspended. Contact your team administrator." }`
    - If membership status is "revoked": return HTTP 403 with `{ code: "MEMBER_REVOKED", message: "Your team membership has been revoked. Contact your team administrator." }`
    - Individual plan activations bypass this check entirely
    - File: `plg-website/src/app/api/license/activate/route.js`
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_
  - [x] 14.3 Write unit tests for device deactivation on suspend/revoke
    - Assert suspending a member deactivates all devices in both Keygen and DDB
    - Assert revoking a member deactivates all devices in both Keygen and DDB
    - Assert reinstating a member to "active" does not deactivate any devices
    - Assert zero-device member completes successfully as no-op
    - Assert Keygen deactivation failure is non-blocking (DDB cleanup still happens)
    - Test file: `tests/portal/team.test.js`
    - _Requirements: 13.13, 13.14, 13.15_
  - [x] 14.4 Write unit tests for activation blocking
    - Assert activation returns 403 MEMBER_SUSPENDED for suspended org members on Business licenses
    - Assert activation returns 403 MEMBER_REVOKED for revoked org members on Business licenses
    - Assert activation succeeds for active org members on Business licenses (no regression)
    - Assert Individual plan activations skip membership check entirely
    - Test file: `tests/license/activate.test.js`
    - _Requirements: 13.16, 13.17, 13.18_
  - [x] 14.5 Write property test — Property 14: Suspend/revoke deactivates all member devices
    - **Property 14: Suspend/revoke deactivates all member devices**
    - For any member with N devices (N ≥ 0), setting status to "suspended" or "revoked" must call deactivateDevice (Keygen) and removeDeviceActivation (DDB) for each device; N=0 completes as no-op
    - Tag: `// Feature: status-remediation-plan, Property 14`
    - **Validates: Requirements 10.1, 10.2, 10.7**
  - [x] 14.6 Write property test — Property 15: Keygen device deactivation failure is non-blocking
    - **Property 15: Keygen device deactivation failure is non-blocking**
    - For any device where Keygen deactivateDevice fails, DDB removeDeviceActivation must still be called and the overall operation must complete
    - Tag: `// Feature: status-remediation-plan, Property 15`
    - **Validates: Requirements 10.3**
  - [x] 14.7 Write property test — Property 16: Reinstatement does not deactivate devices
    - **Property 16: Reinstatement does not deactivate devices**
    - For any member status change to "active", zero calls to deactivateDevice or removeDeviceActivation must be made
    - Tag: `// Feature: status-remediation-plan, Property 16`
    - **Validates: Requirements 10.4**
  - [x] 14.8 Write property test — Property 17: Business activation blocked for suspended/revoked members
    - **Property 17: Business activation blocked for suspended/revoked members**
    - For any activation on a Business plan where membership is "suspended" or "revoked", must return HTTP 403 with appropriate code
    - Tag: `// Feature: status-remediation-plan, Property 17`
    - **Validates: Requirements 11.1, 11.2, 11.3**
  - [x] 14.9 Write property test — Property 18: Active Business members proceed with activation
    - **Property 18: Active Business members proceed with activation**
    - For any activation on a Business plan where membership is "active", must proceed with normal activation (no 403)
    - Tag: `// Feature: status-remediation-plan, Property 18`
    - **Validates: Requirements 11.4**
  - [x] 14.10 Write property test — Property 19: Individual plan activations skip membership check
    - **Property 19: Individual plan activations skip membership check**
    - For any activation on an Individual plan, must not call getUserOrgMembership and must proceed directly
    - Tag: `// Feature: status-remediation-plan, Property 19`
    - **Validates: Requirements 11.5**

- [x] 15. Checkpoint — Fix 9 complete
  - Ensure all tests pass, ask the user if questions arise.
  - Run the full test suite to verify admin suspension and activation blocking

- [x] P3.1. Fix heartbeat status passthrough (Phase 1 Req 7.3/7.4 completion)
  - [x] P3.1.1 Change success response from status: "active" to status: license.status
  - [x] P3.1.2 Update log line to reflect actual status
  - [x] P3.1.3 Add status passthrough unit tests (active, past_due, cancellation_pending)
  - [x] P3.1.4 Property 24: Heartbeat status passthrough

- [x] P3.2. Implement fingerprint-based device resolution in heartbeat route
  - [x] P3.2.1 Add putDevicePointer and getDevicePointer to dynamodb.js
  - [x] P3.2.2 Replace trial heartbeat branch with fingerprint resolution
  - [x] P3.2.3 Add opportunistic pointer write (fire-and-forget, original-key-only)
  - [x] P3.2.4 Update rate limiter to fall back to fingerprint identifier
  - [x] P3.2.5 Update getRateLimitHeaders to fall back to fingerprint
  - [x] P3.2.6 Change const → let for destructured body fields
  - [x] P3.2.7 Update JSDoc header
  - [x] P3.2.8 Unit tests for pointer record CRUD
  - [x] P3.2.9 Unit tests for fingerprint-based heartbeat resolution
  - [x] P3.2.10 Unit tests for opportunistic pointer write
  - [x] P3.2.11 Property 23: Fingerprint-based heartbeat equivalence
  - [x] P3.2.12 Property 25: Opportunistic pointer write consistency

- [x] P3.3. Remove dead trial heartbeat code and tests
  - [x] P3.3.1 Remove recordTrialHeartbeat from dynamodb.js
  - [x] P3.3.2 Remove recordTrialHeartbeat import from heartbeat route
  - [x] P3.3.3 Remove/update trial heartbeat test cases in heartbeat.test.js
  - [x] P3.3.4 Remove trial heartbeat contract test in heartbeat-route.contract.test.js
  - [x] P3.3.5 Remove recordTrialHeartbeat tests from dynamodb.test.js

- [x] P3.4. Checkpoint — Phase 3 implementation complete
  - Run full test suite, verify no regressions

- [x] P3.5. Staging deployment
  - [x] P3.5.1 Build and publish hic-ses-layer (version bump 0.2.8 → 0.2.9)
  - [x] P3.5.2 Run update-lambdas.sh staging
  - [x] P3.5.3 Push to development (triggers Amplify staging deploy)


- [ ] 16. Production configuration (manual)
  - [ ] 16.1 Configure Stripe dashboard
    - Enable Smart Retries with maximum 8 retries over 2-week maximum duration
    - Set subscription cancellation after all retries fail
    - _Requirements: 12.1, 12.2_
  - [ ] 16.2 Configure Keygen dashboard
    - Set Monthly policy duration to 44 days (3,801,600 seconds)
    - Set Annual policy duration to 379 days (32,745,600 seconds)
    - _Requirements: 12.3, 12.4_

- [ ] 17. Final checkpoint — Full remediation complete
  - Ensure all tests pass, ask the user if questions arise.
  - Run the full test suite one final time to verify all 9 fixes are integrated and no regressions exist
  - Verify test coverage meets >80% threshold

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP (property-based tests and production config only; unit tests are required per Requirement 14.2)
- Each task references specific requirements for traceability
- Checkpoints enforce the test gate per fix (Requirement 14.2)
- Property tests validate the 22 correctness properties from the design document
- Execution order follows Requirement 14: Fix 6 → Fix 3 → Fix 8 → Fix 5 → Fix 1 → Fix 2 → Fix 4 → Fix 7 → Fix 9
- Scope boundary (Requirement 15): No SQS/DLQ, reconciliation, circuit breaker, legacy migration, CloudWatch alarms, or new email templates
- Production configuration (Requirement 12) is marked optional — requires manual Stripe/Keygen dashboard changes
- Extension repo is at `~/source/repos/hic` (separate repo, separate git history). Extension changes (Fix 3 casing, Fix 5 suspended removal) target that repo; all other changes target `plg-website/`
- Target LICENSE_STATUS enum scope: ACTIVE, EXPIRED, PAST_DUE (new), SUSPENDED (new, admin-only). PENDING_ACCOUNT, CANCELED, DISPUTED from the design's "After" block are not implemented in this remediation — CANCELED maps to EXPIRED from the Extension's perspective, DISPUTED remains ACTIVE until resolved, PENDING_ACCOUNT does not exist as a status

## Deferred Decisions — Post-Launch Technical Debt

The following items are explicitly deferred from the Phase 1 Status Remediation to post-launch. They are documented here for traceability and must be logged in the Technical Debt Log.

### D1. Email Templates for Member Suspension, Revocation, and Reinstatement

**Decision:** Defer creation of `memberSuspended`, `memberRevoked`, and `memberReinstated` email templates until post-launch.

**Current state:** The team route writes `EVENT_TYPES.LICENSE_SUSPENDED` and `EVENT_TYPES.LICENSE_REVOKED` events to DDB via `writeEventRecord()` when a member is suspended or revoked. These events are persisted in DDB as an audit trail. However, the downstream email delivery pipeline (SES templates + Lambda email generator) does not yet have templates for these events — the `licenseSuspended` template was removed in Fix 5 (it was a payment-path template, not an admin-action template), and new admin-action templates were never created.

**What needs to happen post-launch:**
1. Create new SES email templates: `memberSuspended`, `memberRevoked`, `memberReinstated`
2. Wire the SNS topic to publish event notifications for these event types
3. Update the Lambda email generator to consume these events and transmit the new templates
4. **Admin/Owner notification:** Notify the account Owner (and Admins) when a member's access is suspended or revoked
5. **Affected user notification:** Notify the suspended/revoked user with an invitation to purchase an Individual account
6. **Reinstatement notification:** Notify the user when their access is reinstated to active

**Risk:** Until implemented, Owners/Admins and affected users receive no email communication about suspension/revocation actions. The action itself is fully functional — devices are deactivated, activation is blocked, heartbeat returns `valid: false` — but the communication gap means affected users may not understand why their access stopped working until they check the portal or contact support.

### D2. Revoked vs. Expired: Distinct Marketing and Communication Paths

**Decision:** Defer the distinct marketing/communication treatment of "revoked" vs. "expired" members until post-launch.

**Current state:** Both "revoked" and "expired" result in the user being blocked from using Mouse tools (heartbeat returns `valid: false`, activation returns 403 for revoked Business members). However, they represent fundamentally different situations:
- **Revoked:** An admin action on a multi-seat Business license. The member's seat is freed. The member did nothing wrong — the Owner simply reclaimed the seat. The member should be invited to purchase their own Individual account.
- **Expired:** A payment lifecycle terminal state. The subscription lapsed after the 2-week dunning window. The user needs to update their payment method or resubscribe.

**What needs to happen post-launch:**
1. Design distinct email copy and communication flows for revoked vs. expired users
2. Revoked users: send a warm message explaining the seat was reclaimed, with a CTA to purchase an Individual plan
3. Expired users: send a re-engagement message with a CTA to update payment method
4. Ensure portal UI surfaces appropriate messaging for each status
5. Consider a grace period or trial offer for revoked users transitioning to Individual plans

**Risk:** Until implemented, revoked and expired users see similar generic messaging. This is a marketing/UX gap, not a functional gap — the underlying enforcement is correct.

### D3. Revocation Does Not Expire the Org License

**Decision:** Revoking a member updates only the member's org membership status to "revoked" in DDB. It does NOT modify the org's Keygen license status or the license record itself.

**Rationale:** A Business license is a multi-seat license owned by the organization. Revoking one member simply frees one seat — the license itself remains active for the Owner and other members. The revoked member's devices are deactivated and re-activation is blocked, but the license continues serving the organization.

This is the correct and final behavior — not deferred, but documented here for clarity since it was discussed during implementation.
