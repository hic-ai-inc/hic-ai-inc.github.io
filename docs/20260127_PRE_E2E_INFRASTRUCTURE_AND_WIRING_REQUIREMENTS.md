# Pre-E2E Infrastructure and Wiring Requirements

**Document ID:** 20260127_PRE_E2E_INFRASTRUCTURE_AND_WIRING_REQUIREMENTS  
**Date:** January 27, 2026  
**Author:** General Counsel  
**Status:** 🚀 ACTIVE — IMPLEMENTATION READY  
**Estimated Total Effort:** 20-30 hours

---

## Executive Summary

This memo outlines **all remaining infrastructure, wiring, and integration work** required before we can perform comprehensive end-to-end (E2E) validation testing of the Mouse PLG system.

### Current State

| Component                                          | Status                           | Tests       |
| -------------------------------------------------- | -------------------------------- | ----------- |
| VSIX Extension (v0.9.9)                            | ✅ 85% Complete                  | 139 passing |
| npx CLI Installer                                  | ✅ Complete                      | 75 passing  |
| Server-side APIs (Heartbeat, Trial, Rate Limiting) | ✅ Complete                      | 91 passing  |
| Admin Portal (Phases 1-5)                          | ✅ Complete                      | 550 passing |
| Stripe Integration                                 | ✅ Dashboard configured          | —           |
| KeyGen Integration                                 | ✅ Dashboard configured          | —           |
| Auth0 Integration                                  | ✅ Dashboard configured          | —           |
| AWS Infrastructure                                 | ⬜ Templates exist, not deployed | —           |

### What This Memo Covers

1. **AWS Infrastructure Deployment** — CloudFormation stacks, DynamoDB, SES, Lambda
2. **Webhook Wiring** — Stripe and KeyGen webhooks to live endpoints
3. **Auth0 Environment Configuration** — Portal authentication
4. **Licensing System Unification** — MCP ↔ VSIX state sharing
5. **HTTP Provider → Live API** — Connect clients to `api.hic-ai.com`
6. **E2E Test Plan** — Comprehensive validation scenarios

### Success Criteria

After completing this work, we will have:

- ✅ **Production-ready back-end** — All APIs, webhooks, and infrastructure functioning
- ✅ **Working payment flow** — Stripe checkout → license provisioning
- ✅ **Working auth flow** — Auth0 login → portal access
- ✅ **Working licensing** — Trial → purchase → activation → heartbeat
- ✅ **Comprehensive E2E coverage** — All critical paths validated

Only cosmetic/content work on the public website, documentation, and admin portal polish will remain after E2E validation.

---

## Table of Contents

1. [AWS Infrastructure Deployment](#1-aws-infrastructure-deployment)
2. [Webhook Wiring](#2-webhook-wiring)
3. [Auth0 Environment Configuration](#3-auth0-environment-configuration)
4. [Licensing System Unification](#4-licensing-system-unification)
5. [HTTP Provider Live API Connection](#5-http-provider-live-api-connection)
6. [E2E Test Plan](#6-e2e-test-plan)
7. [Execution Timeline](#7-execution-timeline)
8. [Risk Register](#8-risk-register)
9. [Definition of Done](#9-definition-of-done)

---

## 1. AWS Infrastructure Deployment

**Estimated Effort:** 4-6 hours  
**Owner:** GC  
**Blocks:** Everything else (webhooks, auth, licensing)

### 1.1 Current State

All CloudFormation templates exist in `plg-website/infrastructure/cloudformation/`:

| Template              | Size | Purpose                      |
| --------------------- | ---- | ---------------------------- |
| `plg-main-stack.yaml` | 13KB | Orchestrator (nested stacks) |
| `plg-dynamodb.yaml`   | 5KB  | Table + GSIs + Stream        |
| `plg-iam.yaml`        | 13KB | Roles for Amplify/Lambda     |
| `plg-ses.yaml`        | 7KB  | Email domain verification    |
| `plg-messaging.yaml`  | 11KB | SNS + SQS                    |
| `plg-monitoring.yaml` | 15KB | CloudWatch dashboard         |
| `plg-compute.yaml`    | 12KB | Lambda functions             |
| `plg-scheduled.yaml`  | 4KB  | Scheduled tasks              |

**Deployment script:** `plg-website/infrastructure/deploy.sh` (24KB)  
**Parameter files:** `parameters/dev.json`, `parameters/staging.json`, `parameters/prod.json`

### 1.2 Deployment Checklist

| Task                                        | Status | Command/Notes                                |
| ------------------------------------------- | ------ | -------------------------------------------- |
| **Pre-flight Checks**                       |        |                                              |
| Review `deploy.sh` for correctness          | ⬜     | Verify AWS CLI commands                      |
| Verify AWS credentials configured           | ⬜     | `aws sts get-caller-identity`                |
| Verify target region                        | ⬜     | `us-east-1` (Amplify)                        |
| **Staging Deployment**                      |        |                                              |
| Dry-run deploy to staging                   | ⬜     | `./deploy.sh --dry-run staging`              |
| Deploy to staging                           | ⬜     | `./deploy.sh staging`                        |
| Verify DynamoDB table created               | ⬜     | Check AWS Console → DynamoDB                 |
| Verify GSIs created (5 expected)            | ⬜     | `email-index`, `org-index`, etc.             |
| Verify SES domain pending                   | ⬜     | Check AWS Console → SES                      |
| Verify IAM roles created                    | ⬜     | `plg-amplify-role`, `plg-lambda-role`        |
| Verify Lambda functions deployed            | ⬜     | Check AWS Console → Lambda                   |
| Verify CloudWatch dashboard                 | ⬜     | Check AWS Console → CloudWatch               |
| **SES Domain Verification**                 |        |                                              |
| Add DKIM records to DNS                     | ⬜     | 3 CNAME records from SES                     |
| Add MX record for receiving                 | ⬜     | If using SES for inbound                     |
| Verify domain in SES console                | ⬜     | Status: "Verified"                           |
| Request production access                   | ⬜     | Move out of sandbox                          |
| **Secrets Configuration**                   |        |                                              |
| Add to Parameter Store:                     |        |                                              |
| └─ `/plg/staging/stripe-secret-key`         | ⬜     | Stripe test mode key                         |
| └─ `/plg/staging/stripe-webhook-secret`     | ⬜     | Webhook signing secret                       |
| └─ `/plg/staging/keygen-product-token`      | ⬜     | KeyGen API token                             |
| └─ `/plg/staging/keygen-webhook-public-key` | ⬜     | Ed25519 public key                           |
| └─ `/plg/staging/auth0-client-secret`       | ⬜     | Auth0 secret                                 |
| └─ `/plg/staging/trial-token-secret`        | ⬜     | HMAC signing secret                          |
| **Production Deployment**                   |        |                                              |
| Deploy to production                        | ⬜     | `./deploy.sh prod` (after staging validated) |
| Repeat all verification steps               | ⬜     | Same as staging                              |
| Add production secrets                      | ⬜     | `/plg/prod/*` in Parameter Store             |

### 1.3 Expected Resources After Deployment

```
DynamoDB:
├── Table: plg-main (or per environment)
├── GSI: email-index
├── GSI: org-index
├── GSI: license-index
├── GSI: invite-token-index
└── GSI: stripe-customer-index

IAM:
├── Role: plg-amplify-service-role
├── Role: plg-lambda-execution-role
└── Policy: plg-dynamodb-access

Lambda:
├── plg-webhook-processor
├── plg-email-sender
└── plg-scheduled-tasks

SES:
├── Domain: hic-ai.com (verified)
├── Email: noreply@hic-ai.com
├── Email: support@hic-ai.com
└── Email: billing@hic-ai.com

CloudWatch:
├── Dashboard: plg-metrics
├── Alarm: high-error-rate
└── Alarm: webhook-failures
```

### 1.4 Verification Commands

```bash
# Verify DynamoDB table exists
aws dynamodb describe-table --table-name plg-staging

# Verify Lambda functions
aws lambda list-functions --query "Functions[?starts_with(FunctionName, 'plg-')]"

# Verify SES domain
aws ses get-identity-verification-attributes --identities hic-ai.com

# Verify Parameter Store secrets
aws ssm get-parameters-by-path --path /plg/staging/ --query "Parameters[].Name"
```

---

## 2. Webhook Wiring

**Estimated Effort:** 2-4 hours  
**Owner:** Simon + GC  
**Blocks:** Payment flows, license provisioning  
**Prerequisites:** AWS Infrastructure deployed

### 2.1 Current State

Both Stripe and KeyGen webhooks are configured in their respective dashboards, but pointing to placeholder URLs. We need to update them to point to the deployed API endpoints.

| Service | Current Webhook URL                       | Target URL                                   |
| ------- | ----------------------------------------- | -------------------------------------------- |
| Stripe  | `https://placeholder/api/webhooks/stripe` | `https://api.hic-ai.com/api/webhooks/stripe` |
| KeyGen  | `https://placeholder/api/webhooks/keygen` | `https://api.hic-ai.com/api/webhooks/keygen` |

### 2.2 Stripe Webhook Configuration

#### Dashboard Tasks (Simon)

| Task                              | Status | Notes                                        |
| --------------------------------- | ------ | -------------------------------------------- |
| Log into Stripe Dashboard         | ⬜     | dashboard.stripe.com                         |
| Navigate to Developers → Webhooks | ⬜     |                                              |
| Edit "PLG Website" destination    | ⬜     |                                              |
| Update URL to production          | ⬜     | `https://api.hic-ai.com/api/webhooks/stripe` |
| Note new webhook signing secret   | ⬜     | Save to Parameter Store                      |
| Test with CLI (optional)          | ⬜     | `stripe trigger checkout.session.completed`  |

#### Events Subscribed (Already Configured)

```
checkout.session.completed
checkout.session.expired
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
customer.subscription.paused
customer.subscription.resumed
invoice.paid
invoice.payment_failed
invoice.payment_action_required
customer.updated
payment_method.attached
payment_method.detached
charge.dispute.created
charge.dispute.closed
```

#### Code Location

- **Webhook handler:** `plg-website/src/app/api/webhooks/stripe/route.js`
- **Signature verification:** Uses `stripe.webhooks.constructEvent()`
- **Tests:** `plg-website/__tests__/unit/webhooks/stripe-webhook.test.js`

### 2.3 KeyGen Webhook Configuration

#### Dashboard Tasks (Simon)

| Task                            | Status | Notes                                        |
| ------------------------------- | ------ | -------------------------------------------- |
| Log into KeyGen.sh Dashboard    | ⬜     | app.keygen.sh                                |
| Navigate to Settings → Webhooks | ⬜     |                                              |
| Edit existing webhook endpoint  | ⬜     |                                              |
| Update URL to production        | ⬜     | `https://api.hic-ai.com/api/webhooks/keygen` |
| Verify Ed25519 public key       | ⬜     | Should already be in .env.local              |

#### Events Subscribed (Already Configured)

```
license.created
license.updated
license.deleted
license.expiring-soon
license.expired
license.renewed
license.suspended
license.reinstated
license.revoked
machine.created
machine.updated
machine.deleted
machine.heartbeat.ping
machine.heartbeat.dead
machine.heartbeat.resurrected
```

#### Code Location

- **Webhook handler:** `plg-website/src/app/api/webhooks/keygen/route.js`
- **Signature verification:** Uses Ed25519 (`@noble/ed25519`)
- **Tests:** `plg-website/__tests__/unit/webhooks/keygen-webhook.test.js`

### 2.4 Webhook Testing Checklist

| Test                               | Method                      | Expected Result           |
| ---------------------------------- | --------------------------- | ------------------------- |
| **Stripe: Signature Verification** |                             |                           |
| Valid signature                    | Send real webhook           | 200 OK                    |
| Invalid signature                  | Tamper with body            | 401 Unauthorized          |
| Missing signature                  | Omit header                 | 401 Unauthorized          |
| **Stripe: Event Handling**         |                             |                           |
| `checkout.session.completed`       | Complete test checkout      | License created in KeyGen |
| `customer.subscription.deleted`    | Cancel subscription         | License revoked           |
| `invoice.payment_failed`           | Use declining card          | Grace period email sent   |
| **KeyGen: Signature Verification** |                             |                           |
| Valid Ed25519 signature            | Send real webhook           | 200 OK                    |
| Invalid signature                  | Tamper with body            | 401 Unauthorized          |
| **KeyGen: Event Handling**         |                             |                           |
| `license.created`                  | Create license in dashboard | DynamoDB record created   |
| `machine.heartbeat.dead`           | Let heartbeat expire        | Session marked inactive   |
| `license.expired`                  | Let trial expire            | User notified             |

### 2.5 Webhook Flow Diagrams

```
PURCHASE FLOW:
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│  User   │───►│ Stripe  │───►│ Webhook │───►│ KeyGen  │
│ Checkout│    │ Payment │    │ Handler │    │ License │
└─────────┘    └─────────┘    └─────────┘    └─────────┘
                                   │
                                   ▼
                              ┌─────────┐
                              │DynamoDB │
                              │ Record  │
                              └─────────┘

HEARTBEAT FLOW:
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│  Mouse  │───►│ KeyGen  │───►│ Webhook │───►│DynamoDB │
│Extension│    │Heartbeat│    │ Handler │    │  Update │
└─────────┘    └─────────┘    └─────────┘    └─────────┘
```

---

## 3. Auth0 Environment Configuration

**Estimated Effort:** 1-2 hours  
**Owner:** GC  
**Blocks:** Portal authentication, team management  
**Prerequisites:** None (can be done in parallel)

### 3.1 Current State

Auth0 dashboard is fully configured:

- ✅ Application created ("Mouse" - Regular Web App)
- ✅ Callback URLs configured (localhost, staging, production)
- ✅ Logout URLs configured
- ✅ Google + GitHub social connections enabled
- ✅ Refresh token rotation enabled

**Missing:** Environment variables not set in deployment environment.

### 3.2 Environment Variables Checklist

| Variable                | Status | Source          | Notes                                                       |
| ----------------------- | ------ | --------------- | ----------------------------------------------------------- |
| `AUTH0_SECRET`          | ⬜     | Generate        | `openssl rand -hex 32`                                      |
| `AUTH0_BASE_URL`        | ⬜     | Set             | `https://hic-ai.com` (prod) or `https://staging.hic-ai.com` |
| `AUTH0_ISSUER_BASE_URL` | ✅     | Auth0           | `https://dev-vby1x2u5b7c882n5.us.auth0.com`                 |
| `AUTH0_CLIENT_ID`       | ⬜     | Auth0 Dashboard | Copy from Application Settings                              |
| `AUTH0_CLIENT_SECRET`   | ⬜     | Auth0 Dashboard | Copy from Application Settings                              |

### 3.3 Configuration Steps

```bash
# 1. Generate AUTH0_SECRET (one-time)
openssl rand -hex 32
# Output: <64-character hex string>

# 2. Get Client ID and Secret from Auth0 Dashboard
# Navigate to: Applications → Mouse → Settings
# Copy: Client ID, Client Secret

# 3. Add to AWS Parameter Store (or Amplify env vars)
aws ssm put-parameter \
  --name "/plg/staging/auth0-secret" \
  --value "<generated-secret>" \
  --type SecureString

aws ssm put-parameter \
  --name "/plg/staging/auth0-client-id" \
  --value "<client-id>" \
  --type SecureString

aws ssm put-parameter \
  --name "/plg/staging/auth0-client-secret" \
  --value "<client-secret>" \
  --type SecureString
```

### 3.4 Code Locations

| File                                            | Purpose                                      |
| ----------------------------------------------- | -------------------------------------------- |
| `plg-website/src/lib/auth.js`                   | Auth helpers (`requireAuth`, `requireAdmin`) |
| `plg-website/src/middleware.js`                 | Route protection                             |
| `plg-website/src/app/api/auth/[auth0]/route.js` | Login/logout routes                          |
| `plg-website/src/app/portal/layout.js`          | Portal layout with session                   |

### 3.5 Auth Testing Checklist

| Test                         | Method                         | Expected Result      |
| ---------------------------- | ------------------------------ | -------------------- |
| Login with Google            | Click "Sign in with Google"    | Redirects to portal  |
| Login with GitHub            | Click "Sign in with GitHub"    | Redirects to portal  |
| Login with email             | Enter email/password           | Redirects to portal  |
| Logout                       | Click "Sign out"               | Returns to home page |
| Protected route (logged out) | Visit `/portal/dashboard`      | Redirects to login   |
| Protected route (logged in)  | Visit `/portal/dashboard`      | Shows dashboard      |
| Admin route (non-admin)      | Visit `/portal/team` as member | 403 Forbidden        |
| Admin route (admin)          | Visit `/portal/team` as admin  | Shows team page      |
| Session expiry               | Wait 30 days                   | Requires re-login    |
| Refresh token                | Use app after 15 days          | Seamless refresh     |

---

## 4. Licensing System Unification

**Estimated Effort:** 4-8 hours  
**Owner:** GC  
**Blocks:** Accurate license status display, tool blocking  
**Prerequisites:** HTTP Provider working (Section 5)

### 4.1 Problem Statement

Currently, there are **two separate licensing implementations** that don't share state:

| System         | Location                      | State Storage         | Used By                     |
| -------------- | ----------------------------- | --------------------- | --------------------------- |
| MCP Server     | `mouse/src/licensing/`        | `~/.hic/license.json` | MCP tools, `license_status` |
| VSIX Extension | `mouse-vscode/src/licensing/` | VS Code globalState   | Status bar, commands        |

**Symptom:** Status bar shows "Trial (14d)" even when MCP `license_status` tool would show "Licensed".

### 4.2 Recommended Solution: Extension Drives MCP

The VSIX extension should be the **single source of truth** for license state. It passes state to the MCP server via environment variable.

```
┌─────────────────────────────────────────────────────────────┐
│                     VSIX Extension                          │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │ LicenseChecker  │───►│ StatusBarManager│                │
│  │ (owns state)    │    │ (displays state)│                │
│  └────────┬────────┘    └─────────────────┘                │
│           │                                                 │
│           │ Spawns with env vars                           │
│           ▼                                                 │
│  ┌─────────────────────────────────────────┐               │
│  │ MCP Server Process                      │               │
│  │ HIC_LICENSE_STATUS=licensed             │               │
│  │ HIC_LICENSE_KEY=MOUSE-XXXX-XXXX-XXXX    │               │
│  │ HIC_MACHINE_ID=abc123                   │               │
│  └─────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Implementation Tasks

| Task                               | Status | Location                                        | Notes                                                     |
| ---------------------------------- | ------ | ----------------------------------------------- | --------------------------------------------------------- |
| **Phase 1: State Passing**         |        |                                                 |                                                           |
| Define env vars for license state  | ⬜     | `mouse/src/licensing/constants.js`              | `HIC_LICENSE_STATUS`, `HIC_LICENSE_KEY`, `HIC_MACHINE_ID` |
| Read env vars in MCP licensing     | ⬜     | `mouse/src/licensing/license-checker.js`        | Override local state if env vars present                  |
| Pass env vars when spawning MCP    | ⬜     | `mouse-vscode/src/extension.js`                 | In `registerMcpServerProvider()`                          |
| **Phase 2: State Synchronization** |        |                                                 |                                                           |
| VSIX updates state on activation   | ⬜     | `mouse-vscode/src/licensing/license-checker.js` | After `activateLicense()`                                 |
| VSIX updates state on heartbeat    | ⬜     | `mouse-vscode/src/licensing/heartbeat.js`       | On state change callback                                  |
| MCP respects passed state          | ⬜     | `mouse/src/licensing/license-checker.js`        | No local state writes if env passed                       |
| **Phase 3: Testing**               |        |                                                 |                                                           |
| Unit test: env var override        | ⬜     | `mouse/src/licensing/license-checker.test.js`   | Verify env vars take precedence                           |
| Integration test: VSIX → MCP       | ⬜     | Manual                                          | Activate license, verify MCP sees it                      |
| E2E test: status bar + tool        | ⬜     | Manual                                          | Both show same state                                      |

### 4.4 Environment Variables Specification

```javascript
// Environment variables passed from VSIX to MCP:

// License status (required if licensed)
// Values: 'trial' | 'licensed' | 'expired' | 'suspended' | 'grace'
HIC_LICENSE_STATUS = "licensed";

// License key (required if licensed)
HIC_LICENSE_KEY = "MOUSE-ACME-1234-5678-ABCD";

// Machine ID (always passed)
HIC_MACHINE_ID = "550e8400-e29b-41d4-a716-446655440000";

// Session ID (for concurrent tracking)
HIC_SESSION_ID = "sess_abc123xyz";

// Trial days remaining (if in trial)
HIC_TRIAL_DAYS_REMAINING = "7";
```

### 4.5 Code Changes Required

**`mouse/src/licensing/constants.js`** — Add env var names:

```javascript
export const ENV_VARS = {
  LICENSE_STATUS: "HIC_LICENSE_STATUS",
  LICENSE_KEY: "HIC_LICENSE_KEY",
  MACHINE_ID: "HIC_MACHINE_ID",
  SESSION_ID: "HIC_SESSION_ID",
  TRIAL_DAYS_REMAINING: "HIC_TRIAL_DAYS_REMAINING",
};
```

**`mouse/src/licensing/license-checker.js`** — Read env vars:

```javascript
getStatus() {
  // Check for passed-in state from VSIX extension
  const envStatus = process.env.HIC_LICENSE_STATUS;
  if (envStatus) {
    return this._buildStatusFromEnv();
  }

  // Fall back to local state
  // ... existing logic ...
}
```

**`mouse-vscode/src/extension.js`** — Pass env vars to MCP:

```javascript
function registerMcpServerProvider(context) {
  const licenseState = licenseChecker.getState();

  const env = {
    ...process.env,
    HIC_LICENSE_STATUS: licenseState.state,
    HIC_LICENSE_KEY: licenseState.licenseKey || "",
    HIC_MACHINE_ID: licenseState.machineId,
    HIC_SESSION_ID: licenseState.sessionId,
  };

  // Pass to MCP server spawn
  // ...
}
```

---

## 5. HTTP Provider Live API Connection

**Estimated Effort:** 2-4 hours  
**Owner:** GC  
**Blocks:** License validation, heartbeat, trial initialization  
**Prerequisites:** AWS Infrastructure deployed

### 5.1 Current State

Both the VSIX and MCP have HTTP providers configured to call `api.hic-ai.com`, but they haven't been tested against live infrastructure.

| File                                             | Base URL                 | Status             |
| ------------------------------------------------ | ------------------------ | ------------------ |
| `mouse-vscode/src/licensing/http-provider.js`    | `https://api.hic-ai.com` | ⬜ Not tested live |
| `mouse-vscode/src/licensing/config.js`           | `https://api.hic-ai.com` | ⬜ Configured      |
| `mouse/src/licensing/constants.js`               | `https://api.hic-ai.com` | ⬜ Configured      |
| `mouse/src/licensing/providers/http-provider.js` | `https://api.hic-ai.com` | ⬜ Not tested live |

### 5.2 API Endpoints

| Endpoint                  | Method | Purpose                     | Request                                  | Response                        |
| ------------------------- | ------ | --------------------------- | ---------------------------------------- | ------------------------------- |
| `/api/license/validate`   | POST   | Validate license key        | `{ licenseKey, machineId }`              | `{ valid, status, expiresAt }`  |
| `/api/license/activate`   | POST   | Activate license on machine | `{ licenseKey, machineId, machineName }` | `{ success, error }`            |
| `/api/license/deactivate` | POST   | Deactivate license          | `{ licenseKey, machineId }`              | `{ success }`                   |
| `/api/license/heartbeat`  | POST   | Machine heartbeat           | `{ licenseKey, machineId, sessionId }`   | `{ valid, status, concurrent }` |
| `/api/license/trial/init` | POST   | Initialize trial            | `{ fingerprint }`                        | `{ token, expiresAt }`          |
| `/api/license/trial/init` | GET    | Check trial status          | `?fingerprint=xxx`                       | `{ status, daysRemaining }`     |

### 5.3 Testing Checklist

| Test                    | Endpoint                       | Expected Result                                      |
| ----------------------- | ------------------------------ | ---------------------------------------------------- |
| **Validation**          |                                |                                                      |
| Valid license key       | `/api/license/validate`        | `{ valid: true, status: 'active' }`                  |
| Invalid license key     | `/api/license/validate`        | `{ valid: false, error: 'Invalid license key' }`     |
| Malformed key (CWE-306) | `/api/license/validate`        | 400 Bad Request (no server call)                     |
| **Activation**          |                                |                                                      |
| New machine             | `/api/license/activate`        | `{ success: true }`                                  |
| Machine limit exceeded  | `/api/license/activate`        | `{ success: false, error: 'Machine limit reached' }` |
| **Heartbeat**           |                                |                                                      |
| Valid session           | `/api/license/heartbeat`       | `{ valid: true, status: 'valid' }`                   |
| Concurrent limit        | `/api/license/heartbeat`       | `{ valid: false, status: 'concurrent_limit' }`       |
| Rate limited            | Send 11 in 1 minute            | 429 Too Many Requests                                |
| **Trial**               |                                |                                                      |
| New trial               | POST `/api/license/trial/init` | `{ token: 'xxx', expiresAt: '...' }`                 |
| Existing trial          | GET `/api/license/trial/init`  | `{ status: 'active', daysRemaining: 14 }`            |
| Rate limited            | 6 requests in 1 hour           | 429 Too Many Requests                                |

### 5.4 HTTPS Security (CWE-295)

All HTTP providers enforce HTTPS:

```javascript
// From mouse-vscode/src/licensing/validation.js
export function validateHttpsUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      return { valid: false, error: "URL must use HTTPS" };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid URL" };
  }
}
```

### 5.5 Network Error Handling

| Scenario         | Behavior                                     |
| ---------------- | -------------------------------------------- |
| Network timeout  | Retry up to 3 times with exponential backoff |
| DNS failure      | Return cached state, log warning             |
| 5xx server error | Retry up to 3 times                          |
| 4xx client error | Do not retry, return error                   |
| Offline mode     | Use cached state within grace period         |

---

## 6. E2E Test Plan

**Estimated Effort:** 8-12 hours  
**Owner:** GC + Simon  
**Prerequisites:** Sections 1-5 complete

### 6.1 Test Environments

| Environment | URL                  | Purpose                        |
| ----------- | -------------------- | ------------------------------ |
| Local       | `localhost:3000`     | Development                    |
| Staging     | `staging.hic-ai.com` | Pre-production testing         |
| Production  | `hic-ai.com`         | Live (after staging validated) |

### 6.2 Test Categories

#### Category A: Purchase Flows (8 scenarios)

| #   | Scenario                  | Steps                                                                                                                                      | Expected Result                           |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| A1  | Individual Monthly        | 1. Visit /pricing<br>2. Click "Get Started" on Individual<br>3. Complete Stripe checkout (test card)<br>4. Verify redirect to success page | License key displayed, email sent         |
| A2  | Individual Annual         | Same as A1 with annual toggle                                                                                                              | 17% discount applied                      |
| A3  | Business Monthly (1 seat) | 1. Select Business tier<br>2. Set seats=1<br>3. Complete checkout                                                                          | Team license created, admin role assigned |
| A4  | Business Annual (5 seats) | Same as A3 with 5 seats, annual                                                                                                            | Volume discount, 5 licenses created       |
| A5  | Checkout Abandonment      | 1. Start checkout<br>2. Close browser<br>3. Check Stripe dashboard                                                                         | Session marked "expired" after 24h        |
| A6  | Payment Failure           | 1. Complete checkout with declining card                                                                                                   | Error displayed, no license created       |
| A7  | Existing Customer Upgrade | 1. Log into portal<br>2. Upgrade Individual → Business                                                                                     | Prorated charge, new license              |
| A8  | Coupon Code               | 1. Apply `EARLYADOPTER20` at checkout                                                                                                      | 20% discount applied                      |

#### Category B: Authentication Flows (6 scenarios)

| #   | Scenario              | Steps                                                                                         | Expected Result                |
| --- | --------------------- | --------------------------------------------------------------------------------------------- | ------------------------------ |
| B1  | Google SSO Login      | 1. Click "Sign in with Google"<br>2. Select Google account                                    | Redirected to portal dashboard |
| B2  | GitHub SSO Login      | 1. Click "Sign in with GitHub"<br>2. Authorize app                                            | Redirected to portal dashboard |
| B3  | Email/Password Login  | 1. Click "Sign in"<br>2. Enter email/password                                                 | Redirected to portal dashboard |
| B4  | New User Registration | 1. Click "Sign up"<br>2. Enter email/password<br>3. Verify email                              | Account created, can log in    |
| B5  | Password Reset        | 1. Click "Forgot password"<br>2. Enter email<br>3. Click link in email<br>4. Set new password | Can log in with new password   |
| B6  | Session Expiry        | 1. Log in<br>2. Wait 30+ days<br>3. Visit portal                                              | Redirected to login            |

#### Category C: Portal Flows (10 scenarios)

| #   | Scenario            | Steps                                                        | Expected Result                         |
| --- | ------------------- | ------------------------------------------------------------ | --------------------------------------- |
| C1  | View Dashboard      | 1. Log in<br>2. Visit /portal/dashboard                      | License status, devices shown           |
| C2  | View License Key    | 1. Visit /portal/license                                     | License key visible (masked by default) |
| C3  | Copy License Key    | 1. Click "Copy" button                                       | Key copied to clipboard                 |
| C4  | View Devices        | 1. Visit /portal/devices                                     | List of activated machines              |
| C5  | Deactivate Device   | 1. Click "Deactivate" on device                              | Device removed, slot freed              |
| C6  | Update Payment      | 1. Click "Manage Billing"<br>2. Stripe portal opens          | Can update card                         |
| C7  | View Invoices       | 1. Click "Billing History"                                   | List of invoices/receipts               |
| C8  | Cancel Subscription | 1. Click "Cancel" in Stripe portal                           | Cancellation scheduled at period end    |
| C9  | Team: Invite Member | 1. Visit /portal/team<br>2. Enter email<br>3. Click "Invite" | Invite email sent                       |
| C10 | Team: Revoke Member | 1. Click "Revoke" on member                                  | License deactivated, removed from team  |

#### Category D: Licensing Flows (12 scenarios)

| #   | Scenario                          | Steps                                                                    | Expected Result                    |
| --- | --------------------------------- | ------------------------------------------------------------------------ | ---------------------------------- |
| D1  | Fresh Install (Trial)             | 1. Install VSIX<br>2. Open workspace<br>3. Check status bar              | "Mouse: Trial (14d)"               |
| D2  | Trial Day 7                       | 1. Mock time to day 7<br>2. Use tool                                     | Tool works, occasional nag         |
| D3  | Trial Day 13                      | 1. Mock time to day 13<br>2. Use tool                                    | Tool works, frequent nags          |
| D4  | Trial Day 14 (Last Day)           | 1. Mock time to day 14<br>2. Use tool                                    | Tool works, every-call nag         |
| D5  | Trial Expired                     | 1. Mock time to day 15<br>2. Use tool                                    | Tool BLOCKED, purchase prompt      |
| D6  | Activate License                  | 1. Enter license key via command<br>2. Check status bar                  | "Mouse: Licensed" ✓                |
| D7  | Invalid License Key               | 1. Enter malformed key                                                   | "Invalid license key format" error |
| D8  | Revoked License                   | 1. Revoke license in KeyGen dashboard<br>2. Wait for heartbeat           | Status changes to "Expired"        |
| D9  | Concurrent Session (within limit) | 1. Activate on Machine A<br>2. Activate on Machine B                     | Both work (3 machines allowed)     |
| D10 | Concurrent Session (exceed limit) | 1. Activate on Machine D (4th)                                           | "Machine limit reached" error      |
| D11 | Heartbeat Timeout                 | 1. Activate license<br>2. Block network for 20 min<br>3. Restore network | Heartbeat resumes, no interruption |
| D12 | Offline Mode                      | 1. Activate license<br>2. Go offline<br>3. Use tools for 24h             | Tools work (grace period)          |

#### Category E: Webhook Flows (6 scenarios)

| #   | Scenario                       | Steps                         | Expected Result                             |
| --- | ------------------------------ | ----------------------------- | ------------------------------------------- |
| E1  | Stripe: Checkout Complete      | 1. Complete checkout          | Webhook received, license created           |
| E2  | Stripe: Payment Failed         | 1. Subscription renewal fails | Webhook received, grace period starts       |
| E3  | Stripe: Subscription Canceled  | 1. Cancel subscription        | Webhook received, license marked for expiry |
| E4  | KeyGen: License Created        | 1. Create license via API     | Webhook received, DynamoDB updated          |
| E5  | KeyGen: Machine Heartbeat Dead | 1. Machine stops heartbeat    | Webhook received, session marked inactive   |
| E6  | KeyGen: License Expired        | 1. License expires            | Webhook received, user notified             |

#### Category F: Edge Cases & Security (8 scenarios)

| #   | Scenario                     | Steps                                              | Expected Result                 |
| --- | ---------------------------- | -------------------------------------------------- | ------------------------------- |
| F1  | SQL Injection in License Key | 1. Enter `'; DROP TABLE users;--`                  | Rejected by format validation   |
| F2  | XSS in Invite Email          | 1. Invite `<script>alert('xss')</script>@evil.com` | Email sanitized or rejected     |
| F3  | Webhook Replay Attack        | 1. Replay old webhook with same ID                 | Rejected (idempotency check)    |
| F4  | Webhook Signature Tamper     | 1. Modify webhook body                             | 401 Unauthorized                |
| F5  | Rate Limit: Heartbeat        | 1. Send 100 heartbeats in 1 minute                 | 429 after 10                    |
| F6  | Rate Limit: Trial Init       | 1. Send 10 trial inits in 1 hour                   | 429 after 5                     |
| F7  | CORS: Invalid Origin         | 1. Call API from unauthorized domain               | Rejected                        |
| F8  | HTTP Downgrade               | 1. Call API via HTTP                               | Redirected to HTTPS or rejected |

### 6.3 Test Data Requirements

```yaml
# Test Stripe Cards (from Stripe docs)
success: "4242424242424242"
decline: "4000000000000002"
insufficient_funds: "4000000000009995"
requires_auth: "4000002500003155"

# Test License Keys (generate in KeyGen sandbox)
valid_individual: "MOUSE-TEST-INDI-0001-XXXX"
valid_business: "MOUSE-TEST-BUSI-0001-XXXX"
expired: "MOUSE-TEST-EXPR-0001-XXXX"
revoked: "MOUSE-TEST-REVK-0001-XXXX"

# Test Users (create in Auth0)
admin@test.hic-ai.com (password: TestAdmin123!)
member@test.hic-ai.com (password: TestMember123!)
newuser@test.hic-ai.com (not registered)
```

### 6.4 Test Execution Tracking

| Category     | Total  | Pass | Fail | Skip | Notes |
| ------------ | ------ | ---- | ---- | ---- | ----- |
| A: Purchase  | 8      | —    | —    | —    |       |
| B: Auth      | 6      | —    | —    | —    |       |
| C: Portal    | 10     | —    | —    | —    |       |
| D: Licensing | 12     | —    | —    | —    |       |
| E: Webhooks  | 6      | —    | —    | —    |       |
| F: Security  | 8      | —    | —    | —    |       |
| **TOTAL**    | **50** | —    | —    | —    |       |

---

## 7. Execution Timeline

### Week 1: Infrastructure & Wiring (Days 1-5)

| Day       | Focus          | Tasks                                              | Owner      |
| --------- | -------------- | -------------------------------------------------- | ---------- |
| **Day 1** | AWS Deploy     | Deploy CloudFormation to staging, verify resources | GC         |
| **Day 2** | Secrets & SES  | Add secrets to Parameter Store, verify SES domain  | GC         |
| **Day 3** | Auth0          | Set env vars, test login flows                     | GC         |
| **Day 4** | Webhooks       | Update Stripe/KeyGen URLs, test signatures         | Simon + GC |
| **Day 5** | HTTP Providers | Test live API calls, fix any issues                | GC         |

### Week 2: Integration & E2E (Days 6-10)

| Day        | Focus                  | Tasks                                 | Owner      |
| ---------- | ---------------------- | ------------------------------------- | ---------- |
| **Day 6**  | Licensing Unification  | Implement env var passing VSIX→MCP    | GC         |
| **Day 7**  | Integration Testing    | Test purchase→license flow end-to-end | Simon + GC |
| **Day 8**  | E2E Categories A-C     | Purchase, Auth, Portal flows          | GC         |
| **Day 9**  | E2E Categories D-E     | Licensing, Webhook flows              | Simon      |
| **Day 10** | E2E Category F + Fixes | Security tests, bug fixes             | GC + Simon |

### Week 3: Polish & Launch Prep (Days 11-14)

| Day        | Focus             | Tasks                               | Owner      |
| ---------- | ----------------- | ----------------------------------- | ---------- |
| **Day 11** | Production Deploy | Deploy to production, verify        | GC         |
| **Day 12** | Production E2E    | Smoke test critical paths           | Simon + GC |
| **Day 13** | VSIX Marketplace  | Submit extension for review         | Simon      |
| **Day 14** | Documentation     | Final docs review, launch checklist | GC         |

---

## 8. Risk Register

| Risk                                 | Impact    | Probability | Mitigation                                  |
| ------------------------------------ | --------- | ----------- | ------------------------------------------- |
| CloudFormation deployment fails      | 🔴 High   | Low         | Test with `--dry-run`, have manual fallback |
| SES sandbox limits                   | 🟡 Medium | Medium      | Request production access early             |
| Webhook signature verification fails | 🔴 High   | Low         | Test with Stripe CLI first                  |
| Auth0 callback URL mismatch          | 🟡 Medium | Medium      | Triple-check URLs in dashboard              |
| License state sync issues            | 🟡 Medium | Medium      | Extensive logging, manual override          |
| Rate limiting too aggressive         | 🟡 Medium | Low         | Start with generous limits, tune            |
| Heartbeat timeout too short          | 🟡 Medium | Low         | 10-minute interval is conservative          |
| VSIX marketplace rejection           | 🟡 Medium | Low         | Follow all guidelines, have GitHub backup   |

---

## 9. Definition of Done

### Infrastructure DOD

- [ ] All CloudFormation stacks deployed to staging
- [ ] All CloudFormation stacks deployed to production
- [ ] DynamoDB table with 5 GSIs verified
- [ ] SES domain verified, out of sandbox
- [ ] All secrets in Parameter Store
- [ ] CloudWatch dashboard showing metrics

### Webhook DOD

- [ ] Stripe webhook URL updated and verified
- [ ] KeyGen webhook URL updated and verified
- [ ] Signature verification passing for both
- [ ] All subscribed events handled correctly
- [ ] Idempotency working (no duplicate processing)

### Auth DOD

- [ ] All env vars set in Amplify
- [ ] Login with Google working
- [ ] Login with GitHub working
- [ ] Login with email/password working
- [ ] Protected routes enforced
- [ ] Session refresh working

### Licensing DOD

- [ ] VSIX→MCP state passing implemented
- [ ] Status bar matches MCP tool output
- [ ] HTTP providers tested against live API
- [ ] Trial flow working end-to-end
- [ ] License activation working end-to-end
- [ ] Heartbeat working end-to-end

### E2E DOD

- [ ] All 50 test scenarios executed
- [ ] Pass rate ≥ 95%
- [ ] All critical path scenarios passing
- [ ] All security scenarios passing
- [ ] No P0/P1 bugs remaining

---

## Appendix A: File Reference

### Infrastructure

| Path                                               | Purpose                  |
| -------------------------------------------------- | ------------------------ |
| `plg-website/infrastructure/cloudformation/*.yaml` | CloudFormation templates |
| `plg-website/infrastructure/deploy.sh`             | Deployment script        |
| `plg-website/infrastructure/parameters/*.json`     | Environment parameters   |
| `plg-website/infrastructure/lambda/`               | Lambda function code     |

### Webhooks

| Path                                               | Purpose                |
| -------------------------------------------------- | ---------------------- |
| `plg-website/src/app/api/webhooks/stripe/route.js` | Stripe webhook handler |
| `plg-website/src/app/api/webhooks/keygen/route.js` | KeyGen webhook handler |
| `plg-website/src/lib/stripe.js`                    | Stripe client          |
| `plg-website/src/lib/keygen.js`                    | KeyGen client          |

### Auth

| Path                                            | Purpose          |
| ----------------------------------------------- | ---------------- |
| `plg-website/src/lib/auth.js`                   | Auth helpers     |
| `plg-website/src/middleware.js`                 | Route protection |
| `plg-website/src/app/api/auth/[auth0]/route.js` | Auth0 routes     |

### Licensing (MCP)

| Path                                     | Purpose             |
| ---------------------------------------- | ------------------- |
| `mouse/src/licensing/index.js`           | Public API          |
| `mouse/src/licensing/license-checker.js` | Main checker class  |
| `mouse/src/licensing/license-state.js`   | State persistence   |
| `mouse/src/licensing/constants.js`       | Configuration       |
| `mouse/src/licensing/providers/`         | HTTP/Mock providers |

### Licensing (VSIX)

| Path                                            | Purpose            |
| ----------------------------------------------- | ------------------ |
| `mouse-vscode/src/licensing/config.js`          | Configuration      |
| `mouse-vscode/src/licensing/license-checker.js` | Main checker class |
| `mouse-vscode/src/licensing/license-state.js`   | State persistence  |
| `mouse-vscode/src/licensing/http-provider.js`   | HTTP provider      |
| `mouse-vscode/src/licensing/heartbeat.js`       | Heartbeat manager  |

### Server-Side APIs

| Path                                                  | Purpose             |
| ----------------------------------------------------- | ------------------- |
| `plg-website/src/app/api/license/heartbeat/route.js`  | Heartbeat endpoint  |
| `plg-website/src/app/api/license/trial/init/route.js` | Trial init endpoint |
| `plg-website/src/lib/rate-limit.js`                   | Rate limiting       |

---

## Appendix B: Environment Variables Summary

### Production Environment

```bash
# Auth0
AUTH0_SECRET=<generated-64-char-hex>
AUTH0_BASE_URL=https://hic-ai.com
AUTH0_ISSUER_BASE_URL=https://dev-vby1x2u5b7c882n5.us.auth0.com
AUTH0_CLIENT_ID=<from-auth0-dashboard>
AUTH0_CLIENT_SECRET=<from-auth0-dashboard>

# Stripe
STRIPE_SECRET_KEY=sk_live_xxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# KeyGen
KEYGEN_ACCOUNT_ID=868fccd3-676d-4b9d-90ab-c86ae54419f6
KEYGEN_PRODUCT_ID=4abf1f35-fc54-45ab-8499-10012073ac2d
KEYGEN_PRODUCT_TOKEN=prod_xxx
KEYGEN_POLICY_ID_INDIVIDUAL=91f1947e-0730-48f9-b19a-eb8016ae2f84
KEYGEN_POLICY_ID_BUSINESS=b0bcab98-6693-4c44-ad0d-ee3dbb069aea
KEYGEN_WEBHOOK_PUBLIC_KEY=<ed25519-public-key>

# Licensing
TRIAL_TOKEN_SECRET=<generated-32-char-hex>
HIC_LICENSING_ENABLED=true

# AWS
AWS_REGION=us-east-1
DYNAMODB_TABLE_NAME=plg-prod
```

---

## Document History

| Version | Date         | Author | Changes         |
| ------- | ------------ | ------ | --------------- |
| 1.0     | Jan 27, 2026 | GC     | Initial version |

---

**Next Steps:**

1. Review this memo with Simon
2. Begin Day 1: AWS Infrastructure Deployment
3. Track progress against checklists
4. Update this document as work progresses

**Let's ship this! 🚀**
