# Commit 2 Execution Checklist — Structured Logging (Portal Multi-Handler Endpoints)

**Date:** 2026-02-15  
**Scope:** Commit 2 from structured logging rollout memo  
**Status:** Ready for implementation

---

## 1) Target Files and Handlers

### File A: `plg-website/src/app/api/portal/invite/[token]/route.js`

- `GET` → operation: `portal_invite_check`
- `POST` → operation: `portal_invite_accept`
- service: `plg-api-portal-invite`
- Current `console.*` gaps: 4

### File B: `plg-website/src/app/api/portal/seats/route.js`

- `GET` → operation: `portal_seats_list`
- `POST` → operation: `portal_seats_update`
- service: `plg-api-portal-seats`
- Current `console.*` gaps: 4

### File C: `plg-website/src/app/api/portal/settings/route.js`

- `GET` → operation: `portal_settings_get`
- `PATCH` → operation: `portal_settings_update`
- service: `plg-api-portal-settings`
- Current `console.*` gaps: 2

### File D: `plg-website/src/app/api/portal/settings/delete-account/route.js`

- `POST` → operation: `portal_settings_delete_request`
- `DELETE` → operation: `portal_settings_delete_confirm`
- service: `plg-api-portal-settings-delete`
- Current `console.*` gaps: 6

---

## 2) Required Mechanical Changes Per Handler

For each exported handler (`GET`, `POST`, `PATCH`, `DELETE`) in the above files:

1. Add import:
   - `import { createApiLogger } from "@/lib/api-log";`
2. Create logger at handler top:
   - `const log = createApiLogger({ service: "...", request, operation: "..." });`
3. Call `log.requestReceived()` at entry.
4. Add `log.response(statusCode, "...")` immediately before every return response.
5. Replace `console.log/error/warn` with `log.info/error/warn/exception`.
6. Add `log.decision(...)` on branch gates (auth, validation, role/ownership checks).

---

## 3) Event Name Map (Suggested)

## 3.1 `portal/invite/[token]`

### `GET`

- `token_missing` (400)
- `invite_not_found` (404)
- `invite_not_pending` (400)
- `invite_expired` (400)
- `invite_details_returned` (200)
- catch: `portal_invite_check_failed` (500 via `log.exception`)

### `POST`

- `auth_failed` (401)
- `token_missing` (400)
- `invite_not_found` (404)
- `invite_not_pending` (400)
- `invite_expired` (400)
- `invite_email_mismatch` (403)
- `invite_accepted` (200)
- Cognito role assignment success: `invite_role_assigned`
- Cognito role assignment non-fatal failure: `invite_role_assignment_failed` (warn)
- catch: `portal_invite_accept_failed` (500 via `log.exception`)

## 3.2 `portal/seats`

### `GET`

- `auth_failed` (401)
- `business_tier_required` (403)
- `organization_not_found` (404)
- Stripe subscription fetch non-fatal failure: `stripe_subscription_fetch_failed` (warn)
- `seat_usage_returned` (200)
- catch: `portal_seats_list_failed` (500)

### `POST`

- `auth_failed` (401)
- `business_tier_required` (403)
- `insufficient_role` (403)
- `invalid_quantity` (400)
- `organization_not_found` (404)
- `quantity_below_usage` (400)
- `subscription_not_found` (404)
- `seat_quantity_updated` (200)
- catch: `portal_seats_update_failed` (500)

## 3.3 `portal/settings`

### `GET`

- `auth_failed` (401)
- `settings_returned` (200)
- catch: `portal_settings_get_failed` (500)

### `PATCH`

- `auth_failed` (401)
- validation branches:
  - `invalid_given_name` (400)
  - `invalid_middle_name` (400)
  - `invalid_family_name` (400)
  - `invalid_notification_preferences` (400)
- optional upsert branch: `customer_profile_created`
- update branch: `settings_updated`
- success: `settings_patch_succeeded` (200)
- catch: `portal_settings_update_failed` (500)

## 3.4 `portal/settings/delete-account`

### `POST`

- `auth_failed` (401)
- `confirmation_invalid` (400)
- `customer_not_found` (404)
- `org_member_must_leave_first` (400)
- Stripe cancellation non-fatal failure: `subscription_cancel_failed` (warn)
- Org dissolution member removal progress: `org_member_removed`
- Org dissolved progress: `organization_dissolved`
- Org dissolution non-fatal failure: `organization_dissolve_failed` (warn)
- success: `account_deletion_requested` (200)
- catch: `portal_settings_delete_request_failed` (500)

### `DELETE`

- `auth_failed` (401)
- `customer_not_found` (404)
- `no_pending_deletion` (400)
- success: `account_deletion_cancelled` (200)
- catch: `portal_settings_delete_confirm_failed` (500)

---

## 4) Existing `console.*` Replacement Map

### `portal/invite/[token]/route.js`

- line 64: `console.error("Get invite error:", error);` → `log.exception(error, "portal_invite_check_failed", ... )`
- line 140: role-assigned `console.log(...)` → `log.info("invite_role_assigned", ... )`
- line 144: role assignment `console.error(...)` → `log.warn("invite_role_assignment_failed", ... )`
- line 153: `console.error("Accept invite error:", error);` → `log.exception(error, "portal_invite_accept_failed", ... )`

### `portal/seats/route.js`

- line 97: stripe fetch `console.error(...)` → `log.warn("stripe_subscription_fetch_failed", ... )`
- line 115: GET catch `console.error(...)` → `log.exception(error, "portal_seats_list_failed", ... )`
- line 230: update success `console.log(...)` → `log.info("seat_quantity_updated", ... )`
- line 247: POST catch `console.error(...)` → `log.exception(error, "portal_seats_update_failed", ... )`

### `portal/settings/route.js`

- line 64: GET catch `console.error(...)` → `log.exception(error, "portal_settings_get_failed", ... )`
- line 172: PATCH catch `console.error(...)` → `log.exception(error, "portal_settings_update_failed", ... )`

### `portal/settings/delete-account/route.js`

- line 93: stripe cancellation `console.error(...)` → `log.warn("subscription_cancel_failed", ... )`
- line 114: member removal `console.log(...)` → `log.info("org_member_removed", ... )`
- line 117: org dissolved `console.log(...)` → `log.info("organization_dissolved", ... )`
- line 119: org dissolve fail `console.error(...)` → `log.warn("organization_dissolve_failed", ... )`
- line 154: POST catch `console.error(...)` → `log.exception(error, "portal_settings_delete_request_failed", ... )`
- line 208: DELETE catch `console.error(...)` → `log.exception(error, "portal_settings_delete_confirm_failed", ... )`

---

## 5) Validation Gates (Post-Implementation)

1. **Targeted grep gate (Commit 2 files only)**
   - Zero matches for `console.log|console.warn|console.error` in the 4 files above.
2. **Targeted tests**
   - Add/extend route contract tests asserting:
     - `request_received` emitted
     - key branch decision events emitted
     - `response`/`warning` status logging emitted
3. **Project test run**
   - `cd plg-website && npm run test`

---

## 6) Commit Message (Suggested)

`feat(logging): wire 4 multi-handler portal endpoints to api-log`
