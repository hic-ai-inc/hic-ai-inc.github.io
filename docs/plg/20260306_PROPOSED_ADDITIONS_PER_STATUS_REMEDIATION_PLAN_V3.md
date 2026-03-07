# Appendix A: Proposed New Items in Status Remediation Plan V3

**Date:** March 6, 2026
**Parent Document:** `docs/plg/20260306_CONSOLIDATED_STATUS_REMEDIATION_PLAN_V3.md`
**Purpose:** Comprehensive inventory of every new value, function, file, enum, handler, field, and logic path proposed by V3 that does not exist in the codebase today. Provided for review and approval before implementation.

---

## Proposed New Items (24)

### New LICENSE_STATUS Enum Values (Website `src/lib/constants.js`)

| # | Item | Value | Reason |
|---|---|---|---|
| 1 | `PAYMENT_SUSPENDED` | `"payment_suspended"` | Replaces bare `"suspended"` for payment-failure suspension (LICENSE# and CUSTOMER# records). Core disambiguation — this is half of the naming collision fix. |
| 2 | `ADMIN_SUSPENDED` | `"admin_suspended"` | Replaces bare `"suspended"` for admin-suspends-team-member (MEMBER# records). The other half of the naming collision fix. |
| 3 | `ADMIN_REVOKED` | `"admin_revoked"` | Replaces bare `"revoked"` (`REVOKED: "REVOKED"` exists today). Adds specificity that revocation is admin-initiated. See Debatable Item A below. |
| 4 | `TRIALING` | `"trialing"` | Stripe subscription status. Currently hardcoded in the billing page's independent `labels` map. Proposed to centralize into `LICENSE_STATUS` so the billing page can reference `LICENSE_STATUS_DISPLAY` instead of maintaining its own map. See Debatable Item B below. |
| 5 | `UNPAID` | `"unpaid"` | Same rationale as #4. Stripe status currently hardcoded in billing page. |
| 6 | `INCOMPLETE` | `"incomplete"` | Same rationale as #4. Stripe status currently hardcoded in billing page. |
| 7 | `INCOMPLETE_EXPIRED` | `"incomplete_expired"` | Same rationale as #4. Stripe status currently hardcoded in billing page. |
| 8 | `PENDING` | `"pending"` | Same rationale as #4. Stripe status currently hardcoded in billing page. |
| 9 | `PAUSED` | `"paused"` | Same rationale as #4. Stripe status currently hardcoded in billing page. |

### New EVENT_TYPES Enum (Website `src/lib/constants.js` — entirely new export)

| # | Item | Reason |
|---|---|---|
| 10 | `EVENT_TYPES` enum with ~20 values: `LICENSE_CREATED`, `LICENSE_ACTIVATED`, `LICENSE_PAYMENT_SUSPENDED`, `LICENSE_REINSTATED`, `LICENSE_EXPIRED`, `LICENSE_RENEWED`, `LICENSE_CANCELED`, `LICENSE_DISPUTED`, `DISPUTE_RESOLVED`, `MEMBER_SUSPENDED`, `MEMBER_REVOKED`, `MEMBER_REACTIVATED`, `MEMBER_INVITED`, `PAYMENT_FAILED`, `NONPAYMENT_CANCELLATION_EXPIRED`, `VOLUNTARY_CANCELLATION_EXPIRED`, `SUBSCRIPTION_REACTIVATED`, `CUSTOMER_CREATED`, `CANCELLATION_REQUESTED`, `CANCELLATION_REVERSED` | Every value already exists as a hardcoded string at one or more call sites. The proposal extracts them into a central enum for consistency and to prevent future typos. See Debatable Item C below. |

### New Function (Website `src/lib/keygen.js`)

| # | Item | Reason |
|---|---|---|
| 11 | `renewLicense(licenseId)` | Calls Keygen `POST /licenses/{id}/actions/renew`. This is the root-cause fix for the original bug — the codebase never renews licenses, so Keygen declares them expired after 30 days despite active Stripe subscriptions. |

### New Email Templates (Website `dm/layers/ses/src/email-templates.js`)

| # | Item | Reason |
|---|---|---|
| 12 | `licensePaymentSuspended` template | Replaces `licenseSuspended` for payment failures. Different subject ("Action Required: Update Your Payment Method") and CTA (billing portal link). Currently `licenseSuspended` is sent for both payment and admin suspension — wrong email content for admin case. |
| 13 | `memberSuspended` template | Admin suspends a team member. Subject: "Your access via [OrgName] has been suspended". Currently the same `licenseSuspended` template fires, which tells the member to update their payment method — incorrect for an admin action. |
| 14 | `memberRevoked` template | Admin revokes a team member. Subject: "Your access via [OrgName] has been revoked". Currently no email is sent for revocation. |
| 15 | `memberReactivated` template | Admin reactivates a member. Subject: "Your access via [OrgName] has been restored". Currently no event is written and no email is sent for reactivation. |

### New Event Write (Website `src/app/api/portal/team/route.js`)

| # | Item | Reason |
|---|---|---|
| 16 | `writeEventRecord(EVENT_TYPES.MEMBER_REACTIVATED, ...)` call in the reactivation path | Currently when an admin reactivates a suspended/revoked member, no event record is written and no email is sent. This adds the event write so the `memberReactivated` email template (#15) fires. |

### New Heartbeat Response Field

| # | Item | Reason |
|---|---|---|
| 17 | `retryAfter: 30` field in heartbeat JSON response | Returned when `getLicenseByKey` returns `null` (license not found in DynamoDB). Tells the extension to wait 30 seconds and retry once, covering the eventual consistency edge case during initial license provisioning. See Debatable Item D below. |

### New Heartbeat Status Value

| # | Item | Reason |
|---|---|---|
| 18 | `"unknown"` status string | Returned by heartbeat when `getLicenseByKey` returns `null`. Currently the heartbeat returns `valid: true, status: "active"` in this case — a critical defect allowing indefinite use without a valid license record. See Debatable Item D below. |

### New Extension Handlers (Extension repo `~/source/repos/hic`)

| # | Item | Reason |
|---|---|---|
| 19 | `_handleLicensePaymentSuspended` handler | Replaces `_handleLicenseSuspended`. Shows payment-specific message ("Payment issue detected. Please update your payment method") with billing portal link. |
| 20 | `_handleLicenseAdminSuspended` handler | New handler for admin suspension. Shows "Your access has been suspended by your organization administrator" — no billing link, because the member can't fix this themselves. |
| 21 | `case "unknown":` handler with retry-once logic | Handles the `"unknown"` status + `retryAfter` from #17/#18. Waits, retries once, surfaces error if still unknown. See Debatable Item D below. |

### New Extension Validation Allowlist Entries (Extension `licensing/validation.js`)

| # | Item | Reason |
|---|---|---|
| 22 | `"unknown"` added to `VALID_HEARTBEAT_STATUSES` | So the extension accepts the new `"unknown"` status from the heartbeat endpoint without rejecting it as invalid. See Debatable Item D below. |
| 23 | `"payment_suspended"` and `"admin_suspended"` added to `VALID_HEARTBEAT_STATUSES` and `VALID_LICENSE_STATES` | Replacing bare `"suspended"` in both sets. Direct consequence of the disambiguation (#1, #2). |

### New Extension State Migration Logic (Extension `licensing/state.js`)

| # | Item | Reason |
|---|---|---|
| 24 | In `load()`: normalize UPPER_CASE → lowercase, migrate bare `"suspended"` → `"payment_suspended"` | Handles existing extension installs that have `"suspended"` or `"ACTIVE"` persisted in local state files. Without this, existing installs would have unrecognized status values after the update. |

---

## Debatable Items

### A. `ADMIN_REVOKED` (Item #3)

`REVOKED: "REVOKED"` already exists in the enum. The plan renames it to `ADMIN_REVOKED: "admin_revoked"`. The question is whether revocation is ever initiated by anything other than an admin. If revocation is always admin-initiated, the `ADMIN_` prefix adds specificity but isn't strictly necessary — you could keep `REVOKED` and just lowercase the value to `"revoked"`. The rename would matter if a future non-admin revocation path is introduced (e.g., automated fraud revocation), but that's speculative.

### B. Stripe Statuses in LICENSE_STATUS (Items #4–9)

Six Stripe subscription statuses (`trialing`, `unpaid`, `incomplete`, `incomplete_expired`, `pending`, `paused`) are proposed for addition to the central `LICENSE_STATUS` enum. Today they exist only as hardcoded strings in the billing page's independent `labels` and `variants` maps. The rationale is to eliminate the billing page's independent map and use `LICENSE_STATUS_DISPLAY` everywhere. However, these are Stripe-specific statuses that only appear on the billing page — they are never written to DynamoDB as license statuses. Adding them to `LICENSE_STATUS` conflates "license status" with "Stripe subscription status." The alternative is to leave the billing page's independent map alone and skip these 6 additions entirely.

### C. EVENT_TYPES Enum (Item #10)

A large new enum (~20 values) extracting hardcoded event type strings from across the codebase. Every value already exists as a hardcoded string at one or more call sites. The benefit is consistency and typo prevention. The cost is a large new export that every writer file must import, and the refactoring work to replace all hardcoded strings. This could be deferred to a later cleanup pass without blocking the core fixes. The disambiguation-specific event types (`LICENSE_PAYMENT_SUSPENDED`, `MEMBER_SUSPENDED`, `MEMBER_REVOKED`, `MEMBER_REACTIVATED`) are needed regardless — the question is whether to extract ALL event types now or only the ones that are changing.

### D. `"unknown"` Status + Retry Logic (Items #17, #18, #21, #22)

Four items stem from the proposed `"unknown"` heartbeat status. The current defect: when `getLicenseByKey` returns `null`, the heartbeat returns `valid: true, status: "active"` — granting full access with no license record. This must be fixed. The question is HOW:

- **Option 1 (V3 proposal):** Return `valid: false, status: "unknown", retryAfter: 30`. Extension handles `"unknown"` with retry-once logic. Graceful degradation during provisioning.
- **Option 2 (Simon's suggestion):** Throw an exception / return a hard error. Simpler — no new status value, no retry logic, no new allowlist entry, no new handler. The extension already handles error responses. If the license genuinely doesn't exist, an error is the correct response. The provisioning edge case (license created in Keygen but not yet in DynamoDB) could be handled by ensuring the DynamoDB write completes before the extension's first heartbeat, rather than building retry logic into the heartbeat path.

Option 2 eliminates items #17, #18, #21, and #22 from the plan.
