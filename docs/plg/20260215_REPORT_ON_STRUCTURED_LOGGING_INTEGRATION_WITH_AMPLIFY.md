# Report: Structured Logging Integration with AWS Amplify Gen 2

**Date:** 2026-02-15
**Author:** GitHub Copilot (GC) with SWR
**Status:** Phase 0 Complete — Pattern Validated, Rollout Pending
**Branch:** `development`
**Commit Range:** `094edf8..f1d949e`

---

## 1. Executive Summary

This report documents the end-to-end investigation, root cause analysis, and resolution of the structured logging integration for the HIC PLG website running on AWS Amplify Gen 2 (WEB_COMPUTE). What began as a diagnostic session — "I wired `api-log` but can't find logs in CloudWatch" — uncovered multiple infrastructure gaps, culminated in a manually created log group, and validated the structured logging pattern across two endpoints. The platform is now ready for systematic rollout to all 24 API route files (33 handler functions).

---

## 2. Problem Statement

SWR had wired the `api-log` structured logging adapter (which wraps `HicLog`) to the `GET /api/checkout/verify` endpoint. The code was correct, the deployment succeeded, but **no CloudWatch log group existed** and **no logs appeared anywhere**. The question: why?

---

## 3. Root Cause Analysis

### 3.1 Missing IAM Permissions on Compute Role

Amplify Gen 2 WEB_COMPUTE uses **two IAM roles**:

| Role | Purpose | CloudWatch Logs Permissions |
|------|---------|-----------------------------|
| `plg-amplify-role-staging` | Service/build role (CI/CD) | ✅ Full CW Logs access |
| `plg-amplify-compute-role-staging` | SSR runtime (Lambda@Edge) | ❌ **Zero CW Logs permissions** |

The compute role — the one that actually executes API route code at runtime — had been manually created in the AWS Console with four inline policies for DynamoDB, SecretsManager, SES, and SSM. **None included CloudWatch Logs permissions.** Without `logs:PutLogEvents` and `logs:CreateLogStream`, the runtime could not write logs even if the log group existed.

**Resolution:** Migrated the compute role into CloudFormation (`plg-iam.yaml`) with all existing policies plus CloudWatch Logs. Deleted the manual IAM role and its four inline policies. Two deploy iterations were needed:
- First fix: `DomainName` parameter reference → changed to `${Environment}.hic-ai.com`
- Second fix: DynamoDB policy glob `table/plg-*` didn't match actual table `hic-plg-staging` → changed to `!Ref DynamoDBTableArn`; SecretsManager scope tightened from `plg/*` to `plg/${Environment}/*`

### 3.2 Missing CloudWatch Log Group

Even after fixing IAM permissions, **no log group existed**. CloudTrail showed zero `CreateLogGroup` API calls — Amplify's infrastructure never attempted to provision the log group. AWS Console Q Developer confirmed this is a **service-side responsibility**: the Amplify Hosting service is supposed to create `/aws/amplify/{appId}` automatically, but for this app, it never did.

This appears to be a service-side gap in Amplify Gen 2 WEB_COMPUTE. The compute role needs `PutLogEvents` and `CreateLogStream`, but `CreateLogGroup` is the service's job.

**Resolution:** Manual log group creation:

```bash
MSYS_NO_PATHCONV=1 aws logs create-log-group \
  --log-group-name "/aws/amplify/d2yhz9h4xdd5rb"
```

**This immediately unblocked logging.** Structured JSON logs appeared within seconds of the next API request. The log group does not need to be recreated — it persists indefinitely.

### 3.3 Key Architectural Insight

All SSR routes within a single Amplify app share **one log group** with the naming pattern:

```
/aws/amplify/{appId}
```

Log streams are organized by branch, date, and instance:

```
development/2026/02/15/{instance-id}
```

There is no need for per-endpoint log groups. The `service` field in the structured JSON payload (e.g., `plg-api-checkout`, `plg-api-checkout-verify`) provides the endpoint-level discrimination within the shared log group.

---

## 4. The Structured Logging Pattern

### 4.1 Architecture

```
API Route Handler
    └── createApiLogger({ service, request, operation })
            └── api-log adapter (plg-website/src/lib/api-log.js)
                    └── HicLog (dm/layers/base/src/hic-log.js)
                            └── console.log(JSON.stringify(entry))
                                    └── Amplify SSR Runtime captures stdout
                                            └── CloudWatch Logs
```

### 4.2 Logger API

```javascript
import { createApiLogger } from "@/lib/api-log";

const log = createApiLogger({
  service: "plg-api-{endpoint}",   // Unique service name per route
  request,                          // Next.js Request object
  operation: "{operation_name}",    // Logical operation (e.g., "checkout_create")
});

// Available methods:
log.requestReceived(extra)           // Log incoming request with context
log.decision(event, message, extra)  // Log business logic decisions
log.info(event, message, extra)      // General informational events
log.warn(event, message, extra)      // Warnings (non-fatal issues)
log.debug(event, message, extra)     // Debug-level detail
log.error(event, message, err, extra)// Error events with stack traces
log.response(statusCode, msg, extra) // Auto-routes: 2xx→info, 4xx→warn, 5xx→error
log.exception(err, event, msg, extra)// Catch-all error logging
```

### 4.3 Automatic Context

Every log entry automatically includes:
- `correlationId` — from `x-correlation-id`, `x-request-id`, or `x-hic-probe-id` headers
- `method`, `path` — HTTP method and route path
- `probeId` — for diagnostic probe requests
- `hasAuthorizationHeader`, `hasCookieHeader`, `hasUserAgent` — presence flags (never log values)
- `service`, `operation` — endpoint identification
- Sensitive fields are automatically sanitized (authorization, password, secret, api_key, cookie, token, session)

### 4.4 Validated Output

Probe request:
```bash
curl -s -X POST -H "Content-Type: application/json" \
  -H "x-hic-probe-id: probe-checkout-logging" \
  -d '{}' "https://staging.hic-ai.com/api/checkout"
```

CloudWatch output (4 structured JSON entries):
```json
{"timestamp":"2026-02-15T14:53:05.333Z","level":"INFO","service":"plg-api-checkout","correlationId":"probe-checkout-logging","event":"request_received","message":"API request received","method":"POST","path":"/api/checkout","operation":"checkout_create","nodeEnv":"production","hasAppUrl":true,"hasStripeKey":false}
{"timestamp":"2026-02-15T14:53:05.334Z","level":"INFO","service":"plg-api-checkout","correlationId":"probe-checkout-logging","event":"body_parsed","message":"Request body parsed","operation":"checkout_create","hasEmail":false}
{"timestamp":"2026-02-15T14:53:05.334Z","level":"INFO","service":"plg-api-checkout","correlationId":"probe-checkout-logging","event":"invalid_plan","message":"Invalid plan specified","operation":"checkout_create","reason":"invalid_plan"}
{"timestamp":"2026-02-15T14:53:05.335Z","level":"WARN","service":"plg-api-checkout","correlationId":"probe-checkout-logging","event":"warning","message":"Checkout rejected","operation":"checkout_create","statusCode":400,"reason":"invalid_plan"}
```

---

## 5. Infrastructure Changes (Committed)

### 5.1 CloudFormation: AmplifyComputeRole

**File:** `plg-website/infrastructure/cloudformation/plg-iam.yaml`

Added `AmplifyComputeRole` resource with five policies:
1. **CloudWatch Logs** — `CreateLogGroup`, `CreateLogStream`, `PutLogEvents` scoped to `/aws/amplify/*`
2. **DynamoDB** — Full table access scoped to `!Ref DynamoDBTableArn` (resolves to `hic-plg-staging`)
3. **Secrets Manager** — Read access scoped to `plg/${Environment}/*`
4. **SES** — `SendEmail`, `SendRawEmail` for transactional emails
5. **SSM Parameter Store** — Read access scoped to `/plg/${Environment}/*`

Output `AmplifyComputeRoleArn` passed through `plg-main-stack.yaml`.

### 5.2 Manual IAM Cleanup

Deleted from AWS Console:
- Role: `plg-amplify-compute-role-staging` (manually created)
- 4 inline policies attached to that role

### 5.3 Manual Log Group Creation

```bash
aws logs create-log-group --log-group-name /aws/amplify/d2yhz9h4xdd5rb
```

**Note:** This log group must be preserved. If deleted, it will need to be recreated manually (Amplify does not auto-provision it). Consider adding this to CloudFormation in the future, though it is outside the IAM stack's scope.

---

## 6. Endpoint Wiring Checklist

### Legend
- ✅ Wired and validated in CloudWatch
- ⬜ Not yet wired (uses ad-hoc `console.log`)

### 6.1 Checkout Domain (2 files, 2 handlers)

| # | Endpoint | Method | Lines | Status |
|---|----------|--------|-------|--------|
| 1 | `/api/checkout` | POST | 295 | ✅ Wired and validated |
| 2 | `/api/checkout/verify` | GET | 98 | ✅ Wired and validated |

### 6.2 License Domain (6 files, 7 handlers)

| # | Endpoint | Method | Lines | Status |
|---|----------|--------|-------|--------|
| 3 | `/api/license/activate` | POST | 229 | ⬜ |
| 4 | `/api/license/check` | GET | 140 | ⬜ |
| 5 | `/api/license/deactivate` | DELETE | 100 | ⬜ |
| 6 | `/api/license/deactivate` | POST | 100 | ⬜ |
| 7 | `/api/license/heartbeat` | POST | 343 | ⬜ |
| 8 | `/api/license/validate` | POST | 275 | ⬜ |
| 9 | `/api/license/trial/init` | POST | 326 | ⬜ |
| 10 | `/api/license/trial/init` | GET | 326 | ⬜ |

### 6.3 Portal Domain (9 files, 13 handlers)

| # | Endpoint | Method | Lines | Status |
|---|----------|--------|-------|--------|
| 11 | `/api/portal/billing` | GET | 141 | ⬜ |
| 12 | `/api/portal/devices` | GET | 151 | ⬜ |
| 13 | `/api/portal/invite/[token]` | GET | 159 | ⬜ |
| 14 | `/api/portal/invite/[token]` | POST | 159 | ⬜ |
| 15 | `/api/portal/license` | GET | 138 | ⬜ |
| 16 | `/api/portal/seats` | GET | 253 | ⬜ |
| 17 | `/api/portal/seats` | POST | 253 | ⬜ |
| 18 | `/api/portal/settings` | GET | 178 | ⬜ |
| 19 | `/api/portal/settings` | PATCH | 178 | ⬜ |
| 20 | `/api/portal/settings/delete-account` | POST | 214 | ⬜ |
| 21 | `/api/portal/settings/delete-account` | DELETE | 214 | ⬜ |
| 22 | `/api/portal/settings/export` | POST | 164 | ⬜ |
| 23 | `/api/portal/settings/leave-organization` | POST | 111 | ⬜ |
| 24 | `/api/portal/status` | GET | 166 | ⬜ |
| 25 | `/api/portal/stripe-session` | POST | 55 | ⬜ |
| 26 | `/api/portal/team` | GET | 585 | ⬜ |
| 27 | `/api/portal/team` | POST | 585 | ⬜ |
| 28 | `/api/portal/team` | DELETE | 585 | ⬜ |

### 6.4 Webhooks Domain (2 files, 2 handlers)

| # | Endpoint | Method | Lines | Status |
|---|----------|--------|-------|--------|
| 29 | `/api/webhooks/stripe` | POST | 718 | ⬜ |
| 30 | `/api/webhooks/keygen` | POST | 315 | ⬜ |

### 6.5 Provisioning / Admin (2 files, 3 handlers)

| # | Endpoint | Method | Lines | Status |
|---|----------|--------|-------|--------|
| 31 | `/api/provision-license` | POST | 278 | ⬜ |
| 32 | `/api/admin/provision-test-license` | POST | 247 | ⬜ |
| 33 | `/api/admin/provision-test-license` | GET | 247 | ⬜ |

### 6.6 Summary

| Metric | Count |
|--------|-------|
| Total route files | 24 |
| Total handler functions | 33 |
| Total lines of code | 5,679 |
| Wired and validated | 2 (handlers #1, #2) |
| Remaining to wire | 31 |

---

## 7. Wiring Workflow

For each remaining endpoint, the mechanical process is:

### Step 1: Add Import
```javascript
import { createApiLogger } from "@/lib/api-log";
```

### Step 2: Create Logger at Handler Top
```javascript
const log = createApiLogger({
  service: "plg-api-{domain}-{action}",  // e.g., "plg-api-license-activate"
  request,
  operation: "{operation_name}",          // e.g., "license_activate"
});
log.requestReceived();
```

### Step 3: Replace Console Calls
| Old Pattern | New Pattern |
|-------------|-------------|
| `console.log("[Tag] message", data)` | `log.info("event_name", "message", { data })` |
| `console.error("[Tag] message", err)` | `log.error("event_name", "message", err)` |
| `console.log("[Tag] decision:", x)` | `log.decision("event_name", "message", { x })` |
| `console.log("[Tag] returning 200")` | `log.response(200, "message", { extra })` |
| `console.error("[Tag] catch:", err)` | `log.exception(err, "event_name", "message")` |

### Step 4: Run Tests
```bash
cd plg-website && npm run test
```

### Step 5: Commit and Push
```bash
git add <file> && git commit -m "feat(logging): wire <endpoint> to api-log" && git push origin development
```

### Batching Strategy — Detailed Implementation Plan

The 31 remaining handlers (22 files, ~134 console calls) are organized into **6 commits** across 3 tiers of complexity. Each commit is independently testable and deployable.

#### Complexity Tiers

| Tier | Description | Files | Handlers | Console Calls | Effort |
|------|-------------|-------|----------|---------------|--------|
| **Tier 1** | Mechanical — 0–4 console calls, single try/catch | 14 | 20 | ~30 | Low |
| **Tier 2** | Moderate — multiple exports or deep nesting | 6 | 9 | ~28 | Medium |
| **Tier 3** | Complex — webhook handlers with sub-functions | 2 | 2 | ~76 | High |

---

### Commit 1: Portal — Simple Endpoints (7 files, 8 handlers, ~11 console calls)

All single-export, single-try/catch files with 1–3 console calls. Pure mechanical replacement.

| # | File | Handlers | Console Calls | Service Name | Operation(s) |
|---|------|----------|---------------|--------------|---------------|
| 11 | `portal/billing/route.js` | GET | 1 | `plg-api-portal-billing` | `portal_billing` |
| 12 | `portal/devices/route.js` | GET | 1 | `plg-api-portal-devices` | `portal_devices` |
| 15 | `portal/license/route.js` | GET | 2 | `plg-api-portal-license` | `portal_license` |
| 24 | `portal/status/route.js` | GET | 3 | `plg-api-portal-status` | `portal_status` |
| 25 | `portal/stripe-session/route.js` | POST | 1 | `plg-api-portal-stripe-session` | `portal_stripe_session` |
| 22 | `portal/settings/export/route.js` | POST | 3 | `plg-api-portal-settings-export` | `portal_settings_export` |
| 23 | `portal/settings/leave-organization/route.js` | POST | 4 (1 warn) | `plg-api-portal-settings-leave-org` | `portal_settings_leave_org` |

**Commit message:** `feat(logging): wire 7 simple portal endpoints to api-log`

---

### Commit 2: Portal — Multi-Handler Endpoints (4 files, 10 handlers, ~16 console calls)

Files with 2–3 exported handlers. Each handler needs its own `createApiLogger()` call.

| # | File | Handlers | Console Calls | Service Name | Operation(s) |
|---|------|----------|---------------|--------------|---------------|
| 13–14 | `portal/invite/[token]/route.js` | GET, POST | 4 | `plg-api-portal-invite` | `portal_invite_check`, `portal_invite_accept` |
| 16–17 | `portal/seats/route.js` | GET, POST | 4 | `plg-api-portal-seats` | `portal_seats_list`, `portal_seats_update` |
| 18–19 | `portal/settings/route.js` | GET, PATCH | 2 | `plg-api-portal-settings` | `portal_settings_get`, `portal_settings_update` |
| 20–21 | `portal/settings/delete-account/route.js` | POST, DELETE | 6 | `plg-api-portal-settings-delete` | `portal_settings_delete_request`, `portal_settings_delete_confirm` |

**Note on multi-handler files:** Each exported function (GET, POST, DELETE, PATCH) gets its own `const log = createApiLogger(...)` with a unique `operation` value. The `service` name stays the same across all handlers in the same file.

**Commit message:** `feat(logging): wire 4 multi-handler portal endpoints to api-log`

---

### Commit 3: Portal — Team Endpoint + License Simple (4 files, 6 handlers, ~7 console calls)

The team endpoint (3 exports, 585 lines) is the largest portal file. Bundle with the simpler license endpoints.

| # | File | Handlers | Console Calls | Service Name | Operation(s) |
|---|------|----------|---------------|--------------|---------------|
| 26–28 | `portal/team/route.js` | GET, POST, DELETE | 3 | `plg-api-portal-team` | `portal_team_list`, `portal_team_invite`, `portal_team_remove` |
| 4 | `license/check/route.js` | GET | 1 | `plg-api-license-check` | `license_check` |
| 5–6 | `license/deactivate/route.js` | DELETE, POST | 1 | `plg-api-license-deactivate` | `license_deactivate` |

**Commit message:** `feat(logging): wire portal/team and license/check,deactivate to api-log`

---

### Commit 4: License Domain — Complex Endpoints (4 files, 5 handlers, ~13 console calls)

Higher-traffic endpoints with nested try/catch, helper functions, and business-critical logging.

| # | File | Handlers | Console Calls | Service Name | Operation(s) |
|---|------|----------|---------------|--------------|---------------|
| 3 | `license/activate/route.js` | POST | 2 | `plg-api-license-activate` | `license_activate` |
| 7 | `license/heartbeat/route.js` | POST | 5 (1 warn) | `plg-api-license-heartbeat` | `license_heartbeat` |
| 8 | `license/validate/route.js` | POST | 4 | `plg-api-license-validate` | `license_validate` |
| 9–10 | `license/trial/init/route.js` | POST, GET | 2 | `plg-api-license-trial-init` | `license_trial_init`, `license_trial_check` |

**Special attention:**
- `heartbeat` has 2 helper functions (`processHeartbeat`, `calculateActiveDevices`) — `log` should be passed as a parameter or closured
- `validate` has a nested try/catch for self-healing heartbeat — inner catch should use `log.warn()` not `log.exception()`
- `trial/init` has 2 exports sharing helper functions — each export gets its own logger

**Commit message:** `feat(logging): wire license domain (activate, heartbeat, validate, trial) to api-log`

---

### Commit 5: Provisioning & Admin (2 files, 3 handlers, ~19 console calls)

| # | File | Handlers | Console Calls | Service Name | Operation(s) |
|---|------|----------|---------------|--------------|---------------|
| 31 | `provision-license/route.js` | POST | 11 (2 warn) | `plg-api-provision-license` | `provision_license` |
| 32–33 | `admin/provision-test-license/route.js` | POST, GET | 8 | `plg-api-admin-provision-test` | `admin_provision_test`, `admin_provision_test_check` |

**Special attention:**
- `provision-license` has deeply nested multi-step flow (Stripe verify → Keygen create → DynamoDB write → SES email). Each step should get a distinct `log.info()` event name: `stripe_session_verified`, `keygen_license_created`, `dynamodb_record_written`, `welcome_email_sent`
- Inline `console.log` progress messages map to `log.info()` with meaningful event names
- `console.warn` calls map to `log.warn()`

**Commit message:** `feat(logging): wire provision-license and admin/provision-test-license to api-log`

---

### Commit 6: Webhooks — Stripe + Keygen (2 files, 2 handlers, ~76 console calls)

The most complex commit. These two files account for 57% of all remaining console calls.

| # | File | Handlers | Console Calls | Service Name | Operation(s) |
|---|------|----------|---------------|--------------|---------------|
| 29 | `webhooks/stripe/route.js` | POST | 53 | `plg-api-webhooks-stripe` | `webhook_stripe` |
| 30 | `webhooks/keygen/route.js` | POST | 23 | `plg-api-webhooks-keygen` | `webhook_keygen` |

**Design decision for Stripe webhook (718 lines, 8 private sub-handlers):**

The `POST` function is the only export. It dispatches to 8 private async handler functions based on the Stripe event type. The `request` object is only available in `POST` — the sub-handlers receive domain objects (`session`, `subscription`, `invoice`, `dispute`).

**Recommended pattern — create logger in POST, pass to sub-handlers:**

```javascript
export async function POST(request) {
  const log = createApiLogger({
    service: "plg-api-webhooks-stripe",
    request,
    operation: "webhook_stripe",
  });

  log.requestReceived({ eventType: event.type });

  // Dispatch to sub-handler with logger
  await handleCheckoutCompleted(session, log);
}

async function handleCheckoutCompleted(session, log) {
  log.info("checkout_completed", "Processing checkout.session.completed", {
    sessionId: session.id,
    customerEmail: session.customer_details?.email,
  });
  // ... existing logic with console.log → log.info/warn/error ...
}
```

Each sub-handler's `console.log` calls get domain-specific event names:
- `handleCheckoutCompleted` → `checkout_completed`, `license_created`, `dynamodb_updated`
- `handleSubscriptionUpdated` → `subscription_updated`, `status_change`
- `handleInvoicePaymentFailed` → `invoice_payment_failed`, `suspension_applied`
- etc.

**Keygen webhook (315 lines)** follows the same pattern but is simpler — single POST handler with event-type dispatch, no sub-functions.

**Commit message:** `feat(logging): wire Stripe and Keygen webhook handlers to api-log`

---

### Implementation Checklist (Per File)

For each file, the implementing agent must:

- [ ] Add `import { createApiLogger } from "@/lib/api-log";`
- [ ] Create `const log = createApiLogger({...})` at the top of each exported handler
- [ ] Add `log.requestReceived({...})` with safe metadata (booleans, counts — no secrets)
- [ ] Replace every `console.log(...)` with `log.info(eventName, message, { metadata })`
- [ ] Replace every `console.error(...)` with `log.error(eventName, message, error, { metadata })` or `log.exception(error, eventName, message)` in catch blocks
- [ ] Replace every `console.warn(...)` with `log.warn(eventName, message, { metadata })`
- [ ] Add `log.response(statusCode, message)` before every `return NextResponse.json(...)`
- [ ] Add `log.decision(eventName, message, { reason })` at key branching points
- [ ] Verify **zero** `console.log|error|warn` calls remain in the file
- [ ] Run `npm run test` from `plg-website/` and confirm all tests pass

### Event Naming Convention

Event names use `snake_case` and follow `{domain}_{action}` pattern:
- `request_received` (automatic via `log.requestReceived()`)
- `body_parsed`, `body_parse_failed`
- `auth_verified`, `auth_failed`
- `validation_failed`, `validation_passed`
- `{resource}_created`, `{resource}_updated`, `{resource}_deleted`, `{resource}_found`, `{resource}_not_found`
- `response` (automatic via `log.response()`)
- `exception` (automatic via `log.exception()`)

### Metadata Guidelines

Safe to log (include in metadata):
- Boolean presence: `hasEmail: Boolean(email)`, `hasLicenseKey: Boolean(key)`
- Counts: `deviceCount: devices.length`, `seatCount`
- IDs: `licenseId`, `sessionId`, `subscriptionId` (non-secret identifiers)
- Status values: `paymentStatus`, `licenseStatus`, `planType`
- Error types: `error.name`, `error.message`

**Never log directly** (the sanitizer will catch these, but don't rely on it):
- Secret keys, tokens, passwords
- Full email addresses (use `hasEmail: Boolean(email)` instead)
- Authorization headers
- Request/response bodies containing PII

### Validation Gate

After all 6 commits, run the console call elimination gate:

```bash
# Must return zero matches
grep -r "console\.\(log\|error\|warn\)" plg-website/src/app/api/**/route.js
```

Any remaining `console.*` calls indicate an incomplete wiring.

---

## 8. Post-Wiring: Testing and Validation

### 8.1 E2E Logging Validation Script

Build an automated script that probes every wired endpoint and verifies structured logs appear in CloudWatch:

```bash
# Conceptual flow:
for endpoint in endpoints:
    probe_id="probe-e2e-${endpoint}-$(date +%s)"
    curl -H "x-hic-probe-id: $probe_id" $endpoint
    sleep 5
    aws logs filter-log-events \
      --log-group-name "/aws/amplify/d2yhz9h4xdd5rb" \
      --filter-pattern "$probe_id"
    # Assert: at least 1 log entry with matching probe_id
```

This script should:
- Run against all wired endpoints
- Report pass/fail per endpoint
- Output a summary table
- Be idempotent and safe to run in CI/CD

### 8.2 Unit Test Coverage

Each wired route should have companion tests verifying:
- Logger is created with correct service name and operation
- `requestReceived()` is called on entry
- `response()` is called with correct status codes on each exit path
- `exception()` is called in catch blocks
- No residual `console.log` or `console.error` calls remain

A grep gate can enforce this:
```bash
# Fail if any route.js still uses console.log/console.error
grep -r "console\.\(log\|error\)" plg-website/src/app/api/**/route.js && exit 1
```

---

## 9. Monitoring, Visualization, and Operational Value

This is where structured logging becomes a force multiplier. Once all 33 handlers are wired, the platform gains capabilities that ad-hoc `console.log` could never provide.

### 9.1 CloudWatch Insights Queries

With structured JSON in CloudWatch, Insights queries become trivially powerful:

**Error rate by endpoint (last 24h):**
```sql
filter level = "ERROR"
| stats count(*) as errors by service
| sort errors desc
```

**P95 request flow duration by operation:**
```sql
filter event = "request_received" or event = "response"
| stats earliest(timestamp) as start, latest(timestamp) as end by correlationId, service
| fields (end - start) as duration_ms, service
| stats pct(duration_ms, 95) as p95 by service
```

**All events for a specific user session:**
```sql
filter correlationId = "specific-correlation-id"
| sort @timestamp asc
```

**Stripe failure analysis:**
```sql
filter service = "plg-api-checkout" and level = "ERROR"
| stats count(*) as failures by event
| sort failures desc
```

**4xx/5xx breakdown by endpoint:**
```sql
filter event = "warning" or level = "ERROR"
| parse message "* rejected" as rejection_type
| stats count(*) by service, statusCode
| sort count(*) desc
```

### 9.2 CloudWatch Alarms and Dashboards

**Metric Filters → Alarms:**

| Metric | Filter Pattern | Alarm Threshold |
|--------|---------------|-----------------|
| 5xx Error Rate | `{ $.level = "ERROR" && $.statusCode >= 500 }` | > 5 in 5 min |
| Webhook Failures | `{ $.service = "plg-api-webhooks-stripe" && $.level = "ERROR" }` | > 1 in 15 min |
| Auth Failures | `{ $.event = "auth_failed" }` | > 10 in 5 min |
| Checkout Failures | `{ $.service = "plg-api-checkout" && $.level = "ERROR" }` | > 3 in 5 min |
| License Heartbeat Errors | `{ $.service = "plg-api-license-heartbeat" && $.level = "ERROR" }` | > 10 in 5 min |

**Dashboard Widgets:**
- Real-time request volume by service (bar chart)
- Error rate over time (line chart)
- Status code distribution (pie chart)
- Top 10 error events (table)
- Correlation ID drill-down (search widget)

### 9.3 Automated Monitoring Scripts

**Daily Health Report (cron or Lambda):**
```bash
#!/bin/bash
# Query last 24h, summarize by service
MSYS_NO_PATHCONV=1 aws logs start-query \
  --log-group-name "/aws/amplify/d2yhz9h4xdd5rb" \
  --start-time $(date -d '24 hours ago' +%s) \
  --end-time $(date +%s) \
  --query-string '
    stats count(*) as total,
          sum(level="ERROR") as errors,
          sum(level="WARN") as warnings
    by service
    | sort total desc'
```

**Anomaly Detection:**
- Compare hourly request volumes to 7-day rolling average
- Alert if any endpoint drops to zero requests (possible outage)
- Alert if error rate exceeds 2x baseline

**Probe-Based Synthetic Monitoring:**
- Schedule the E2E validation script on a 15-minute cron
- Each probe uses `x-hic-probe-id: synthetic-{timestamp}`
- Verify both HTTP response AND CloudWatch log presence
- Alert on either failure mode independently

### 9.4 High-Impact Use Cases

**1. Incident Triage (Minutes → Seconds)**
Before: Grep through unstructured console.log output hoping to find relevant entries.
After: `filter correlationId = "x" | sort @timestamp` — instant end-to-end request trace.

**2. Stripe Webhook Debugging**
The Stripe webhook handler (718 lines, most complex endpoint) processes subscription lifecycle events. Structured logging with correlation IDs will enable tracing a webhook from Stripe → our handler → DynamoDB write → license provisioning, all in one query.

**3. License Heartbeat Health**
The heartbeat endpoint (343 lines) is called by every active VS Code extension instance. Structured logging enables:
- Active device count estimation (unique correlation IDs per hour)
- Geographic distribution (if we add region metadata)
- Failure pattern detection (specific error events over time)

**4. Business Intelligence**
- Checkout conversion funnel: `request_received` → `plan_validated` → `session_created` — measure drop-off at each step
- Trial-to-paid conversion: correlate `trial_init` events with subsequent `checkout_create` events
- Seat utilization: `portal/seats` GET frequency vs POST frequency

**5. Security Monitoring**
- Detect brute-force patterns: repeated `auth_failed` events from same source
- Track admin endpoint access: `provision-test-license` usage patterns
- Audit trail: every state-changing operation logged with correlation ID

**6. Cost Optimization**
- Identify endpoints with disproportionate invocation counts
- Track cold start patterns via request timing gaps
- Measure actual usage to right-size DynamoDB capacity

---

## 10. Known Issues and Future Work

### 10.1 Log Group Auto-Provisioning Bug

Amplify Gen 2 WEB_COMPUTE did not auto-create the log group `/aws/amplify/{appId}`. This appears to be a service-side issue. If the log group is ever deleted, it must be manually recreated. Consider:
- Adding a CloudFormation `AWS::Logs::LogGroup` resource (separate from the IAM stack)
- Setting a retention policy (currently unlimited; recommend 90 days for staging, 365 for production)
- Filing an AWS support case to confirm whether this is expected behavior

### 10.2 Log Retention

The manually created log group has no retention policy set. Recommend:
```bash
MSYS_NO_PATHCONV=1 aws logs put-retention-policy \
  --log-group-name "/aws/amplify/d2yhz9h4xdd5rb" \
  --retention-in-days 90
```

### 10.3 Access Logs vs Application Logs

Amplify access logs (CSV format, available via Console) only capture traffic to `.amplifyapp.com` domains. Real traffic via custom domain (`staging.hic-ai.com`) does **not** appear in access logs. Our structured application logging via `api-log` is the only reliable observability source for custom domain traffic.

### 10.4 Production Readiness

Before promoting to `main`:
- Complete wiring of all 33 handlers
- Run E2E logging validation
- Set log retention policy
- Create at least one CloudWatch alarm (5xx error rate)
- Create a basic CloudWatch dashboard

---

## 11. Reference

### AWS Resources

| Resource | Value |
|----------|-------|
| Amplify App ID | `d2yhz9h4xdd5rb` |
| AWS Account | `496998973008` |
| Region | `us-east-1` |
| Log Group | `/aws/amplify/d2yhz9h4xdd5rb` |
| Compute Role | `plg-amplify-compute-role-staging` (CloudFormation) |
| Service Role | `plg-amplify-role-staging` |
| Custom Domain | `staging.hic-ai.com` |
| Branch | `development` (PRODUCTION stage) |

### Key Files

| File | Purpose |
|------|---------|
| `plg-website/src/lib/api-log.js` | Structured logging adapter (242 lines) |
| `dm/layers/base/src/hic-log.js` | Core structured logger |
| `plg-website/infrastructure/cloudformation/plg-iam.yaml` | IAM roles incl. compute role |
| `plg-website/infrastructure/cloudformation/plg-main-stack.yaml` | Nested stack orchestrator |

### Commits

| Hash | Description |
|------|-------------|
| `094edf8` | Add AmplifyComputeRole to CloudFormation |
| `0583672` | Fix DynamoDB ARN and SecretsManager scope |
| `f1d949e` | Wire POST /api/checkout to api-log |
