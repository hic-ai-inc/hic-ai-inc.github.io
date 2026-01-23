# Back-End Review & Testing Plan

**Document ID:** 20260122_BACK_END_REVIEW_PLAN  
**Author:** GitHub Copilot (Claude Opus 4.5)  
**Date:** January 22, 2026  
**Status:** Active  
**Version:** 1.0

---

## Executive Summary

This document outlines a comprehensive multi-phase plan for reviewing and testing the PLG website back-end infrastructure. The goal is to validate that all server-side components—database schema, API endpoints, external service integrations, and deployment infrastructure—function correctly and align with specification documents before committing resources to front-end development.

### Strategic Rationale

**Backend-first development** provides significant advantages:

1. **Contract Stability** — Front-end development can proceed against stable, tested APIs with confidence
2. **Early Integration Validation** — External service webhooks (Stripe, Keygen, Auth0) are notoriously complex; catching integration issues early prevents costly rework
3. **Refactoring Confidence** — Once back-end tests pass, front-end can be refactored freely without risk of breaking API contracts
4. **Clear Bug Attribution** — UI bugs vs. business logic bugs become immediately distinguishable
5. **Parallel Development** — Multiple contributors can work on front-end once APIs are frozen

### Success Criteria

Before transitioning to front-end focus, the following must be achieved:

- [ ] All unit tests passing (target: 50+ tests, 80%+ coverage on core libs)
- [ ] Integration tests passing for Auth0, Stripe, and Keygen
- [ ] Webhook reliability verified (retry handling, idempotency)
- [ ] Error scenarios documented and tested
- [ ] API documentation matches implementation exactly

---

## Phase 1: Infrastructure & Deployment Review

### 1.1 Current State Assessment

| Component                   | Location                            | Current Status        |
| --------------------------- | ----------------------------------- | --------------------- |
| Next.js deployment config   | `plg-website/next.config.mjs`       | ✅ Exists             |
| Environment variables       | `.env.local` / `.env.local.example` | ⚠️ Needs verification |
| AWS DynamoDB infrastructure | Not yet created                     | ❌ Gap                |
| AWS SES configuration       | Not yet created                     | ❌ Gap                |
| CI/CD pipeline              | Not yet created                     | ❌ Gap                |
| IaC (CloudFormation)        | Not yet created                     | ❌ Gap                |

### 1.2 Required Infrastructure Artifacts

```
infrastructure/
├── cloudformation/                   # Infrastructure as Code
│   ├── template.yaml                # Main CloudFormation template
│   ├── dynamodb.yaml                # Table definitions + GSIs
│   ├── ses.yaml                     # Email domain verification
│   ├── iam.yaml                     # Service roles and policies
│   └── parameters/
│       ├── dev.json                 # Development environment params
│       ├── staging.json             # Staging environment params
│       └── prod.json                # Production environment params
├── amplify.yml                       # Amplify build specification
└── .github/workflows/
    ├── test.yml                     # Run tests on PR
    ├── deploy-staging.yml           # Deploy to staging
    └── deploy-production.yml        # Deploy to production
```

### 1.3 Infrastructure Review Checklist

#### Environment Configuration

- [ ] All required environment variables documented in `.env.local.example`
- [ ] Secrets management strategy defined:
  - Sensitive secrets (API keys, tokens) → AWS Secrets Manager
  - Configuration values → AWS Systems Manager Parameter Store
  - Amplify environment variables for build-time config
- [ ] Environment-specific configs separated (development, staging, production)
- [ ] No hardcoded secrets in codebase

#### AWS Resources

- [ ] DynamoDB table creation scripts/IaC complete
- [ ] DynamoDB GSI definitions match access patterns
- [ ] SES domain verification complete
- [ ] SES production access requested (sandbox limits removed)
- [ ] IAM roles follow principle of least privilege
- [ ] CloudWatch logging configured

#### External Services

- [ ] Auth0 tenant configuration documented and exportable
- [ ] Auth0 custom claims (namespace) configured
- [ ] Stripe webhook endpoints registered for all environments
- [ ] Stripe test mode vs. production mode clearly separated
- [ ] Keygen account and policy setup documented
- [ ] Keygen webhook endpoints registered

#### Deployment

- [ ] AWS Amplify application configured
- [ ] `amplify.yml` build specification complete
- [ ] Build command and output directory correct
- [ ] Environment variables configured in Amplify Console
- [ ] Secrets Manager integration configured for sensitive values
- [ ] Preview deployments enabled for PRs (Amplify Previews)
- [ ] Production deployment requires manual approval

### 1.4 Deliverables

1. Infrastructure gap analysis document
2. CloudFormation templates for AWS resources
3. Amplify build specification (`amplify.yml`)
4. CI/CD workflow files (GitHub Actions)
5. Secrets Manager / Parameter Store configuration guide
6. Environment variable reference guide

---

## Phase 2: Database Schema Review

### 2.1 Reference Documents

| Document            | Location                                                              | Key Sections                              |
| ------------------- | --------------------------------------------------------------------- | ----------------------------------------- |
| DDB Schema Addendum | `docs/plg/20260121_GC_DDB_SCHEMA_ADDENDUM.md`                         | Entity definitions, GSIs, access patterns |
| Q Schema Analysis   | `docs/plg/20260121_Q_SCHEMA_AND_DATA_STRUCTURE_FOR_PLG_WEB_DESIGN.md` | Data flow, relationships                  |

### 2.2 Entity Definitions

#### Customer Entity

```
PK: CUSTOMER#{auth0Id}
SK: PROFILE

Attributes:
- auth0Id (S)           # Primary identifier
- email (S)             # For lookups, guest linking
- stripeCustomerId (S)  # Stripe reference
- keygenLicenseId (S)   # Primary license
- accountType (S)       # 'individual' | 'enterprise' | 'oss'
- subscriptionStatus (S)# 'active' | 'past_due' | 'canceled'
- createdAt (S)         # ISO timestamp
- updatedAt (S)         # ISO timestamp
- metadata (M)          # Flexible additional data

GSIs:
- GSI1: email → auth0Id (for guest checkout linking)
- GSI2: stripeCustomerId → auth0Id (for webhook processing)
```

#### License Entity

```
PK: LICENSE#{keygenLicenseId}
SK: METADATA

Attributes:
- keygenLicenseId (S)   # Keygen reference
- auth0Id (S)           # Owner
- licenseKey (S)        # The actual key (encrypted at rest)
- policyId (S)          # 'individual' | 'enterprise' | 'oss'
- status (S)            # 'active' | 'suspended' | 'expired'
- expiresAt (S)         # ISO timestamp or null
- maxDevices (N)        # Limit from policy
- activatedDevices (N)  # Current count
- createdAt (S)
- updatedAt (S)

GSIs:
- GSI3: auth0Id → keygenLicenseId (for portal queries)
```

#### Device Entity

```
PK: LICENSE#{keygenLicenseId}
SK: DEVICE#{keygenMachineId}

Attributes:
- keygenMachineId (S)   # Keygen machine ID
- fingerprint (S)       # Device fingerprint
- name (S)              # User-provided name
- platform (S)          # 'darwin' | 'win32' | 'linux'
- vsCodeVersion (S)     # Optional
- lastSeen (S)          # ISO timestamp (heartbeat)
- activatedAt (S)       # ISO timestamp
- metadata (M)
```

### 2.3 Schema Validation Checklist

#### Entity Completeness

- [ ] Customer entity has all attributes from spec
- [ ] License entity has all attributes from spec
- [ ] Device entity has all attributes from spec
- [ ] All timestamps use ISO 8601 format

#### Access Pattern Coverage

- [ ] Get customer by Auth0 ID (PK lookup)
- [ ] Get customer by email (GSI1 query)
- [ ] Get customer by Stripe ID (GSI2 query)
- [ ] Get all licenses for customer (GSI3 query)
- [ ] Get all devices for license (PK + SK prefix query)
- [ ] Update device last seen (single item update)

#### Data Integrity

- [ ] No orphaned licenses (customer deleted but license remains)
- [ ] Device count matches actual device records
- [ ] Subscription status synced with Stripe
- [ ] License status synced with Keygen

### 2.4 DynamoDB Operations Audit

Review `plg-website/src/lib/dynamodb.js` for:

| Function                       | Access Pattern             | Validation            |
| ------------------------------ | -------------------------- | --------------------- |
| `getCustomerByAuth0Id()`       | PK lookup                  | [ ] Correct           |
| `getCustomerByStripeId()`      | GSI2 query                 | [ ] Correct           |
| `getCustomerByEmail()`         | GSI1 query                 | [ ] Correct           |
| `upsertCustomer()`             | Conditional put            | [ ] Handles conflicts |
| `updateCustomerSubscription()` | Update item                | [ ] Partial update    |
| `getLicense()`                 | PK lookup                  | [ ] Correct           |
| `getCustomerLicenses()`        | GSI3 query                 | [ ] Pagination?       |
| `createLicense()`              | Put item                   | [ ] Idempotent?       |
| `updateLicenseStatus()`        | Update item                | [ ] Audit trail?      |
| `getLicenseDevices()`          | Query with SK prefix       | [ ] Correct           |
| `addDeviceActivation()`        | Put item + update count    | [ ] Transactional?    |
| `removeDeviceActivation()`     | Delete item + update count | [ ] Transactional?    |
| `updateDeviceLastSeen()`       | Update item                | [ ] Efficient         |

### 2.5 Deliverables

1. Schema validation report
2. Missing GSI identification (if any)
3. Transaction requirements documentation
4. Data migration strategy (if schema changes needed)

---

## Phase 3: API Schema Review

### 3.1 Reference Document

| Document   | Location                                                | Key Sections                            |
| ---------- | ------------------------------------------------------- | --------------------------------------- |
| API Map v2 | `docs/plg/20260122_GC_API_MAP_FOR_HIC_AI_WEBSITE_v2.md` | All endpoints, request/response schemas |

### 3.2 API Endpoint Inventory

#### Checkout APIs

| Endpoint               | Method | Auth     | Implementation                         |
| ---------------------- | ------ | -------- | -------------------------------------- |
| `/api/checkout`        | POST   | Optional | `src/app/api/checkout/route.js`        |
| `/api/checkout/verify` | GET    | No       | `src/app/api/checkout/verify/route.js` |

#### License APIs

| Endpoint                  | Method | Auth        | Implementation                            |
| ------------------------- | ------ | ----------- | ----------------------------------------- |
| `/api/license/validate`   | POST   | License Key | `src/app/api/license/validate/route.js`   |
| `/api/license/activate`   | POST   | License Key | `src/app/api/license/activate/route.js`   |
| `/api/license/deactivate` | DELETE | Optional    | `src/app/api/license/deactivate/route.js` |

#### Portal APIs

| Endpoint                     | Method | Auth    | Implementation                               |
| ---------------------------- | ------ | ------- | -------------------------------------------- |
| `/api/portal/license`        | GET    | Session | `src/app/api/portal/license/route.js`        |
| `/api/portal/devices`        | GET    | Session | `src/app/api/portal/devices/route.js`        |
| `/api/portal/devices`        | DELETE | Session | `src/app/api/portal/devices/route.js`        |
| `/api/portal/invoices`       | GET    | Session | `src/app/api/portal/invoices/route.js`       |
| `/api/portal/stripe-session` | POST   | Session | `src/app/api/portal/stripe-session/route.js` |

#### Webhook APIs

| Endpoint               | Method | Auth      | Implementation                         |
| ---------------------- | ------ | --------- | -------------------------------------- |
| `/api/webhooks/stripe` | POST   | Signature | `src/app/api/webhooks/stripe/route.js` |
| `/api/webhooks/keygen` | POST   | Signature | `src/app/api/webhooks/keygen/route.js` |

#### Authentication APIs (Auth0 v4 Middleware)

| Endpoint             | Method | Auth    | Implementation                                      |
| -------------------- | ------ | ------- | --------------------------------------------------- |
| `/auth/login`        | GET    | No      | Auth0 middleware (redirect to Universal Login)      |
| `/auth/signup`       | GET    | No      | Auth0 middleware (redirect with screen_hint=signup) |
| `/auth/logout`       | GET    | Session | Auth0 middleware (clears session, redirects)        |
| `/auth/callback`     | GET    | No      | Auth0 middleware (handles OAuth callback)           |
| `/auth/profile`      | GET    | Session | Auth0 middleware (returns user profile)             |
| `/auth/access-token` | GET    | Session | Auth0 middleware (returns access token)             |

> **Note:** Auth0 v4 SDK handles these routes via middleware; no explicit route handlers required.
> Password reset is handled via Auth0 Universal Login ("Forgot password?" link).

#### Application APIs

| Endpoint               | Method | Auth | Implementation                         |
| ---------------------- | ------ | ---- | -------------------------------------- |
| `/api/oss-application` | POST   | No   | `src/app/api/oss-application/route.js` |

### 3.3 Per-Endpoint Review Checklist

For each API endpoint, verify:

#### Request Handling

- [ ] Required fields validated
- [ ] Field types validated (string, number, enum)
- [ ] Field bounds validated (min/max length, range)
- [ ] Unknown fields rejected or ignored consistently

#### Authentication & Authorization

- [ ] Auth check present where required
- [ ] Auth check uses `getSession()` from `@/lib/auth`
- [ ] Authorization verifies user owns resource
- [ ] Appropriate error code returned (401 vs 403)

#### Response Format

- [ ] Success response matches spec schema
- [ ] Error response includes `error` field
- [ ] HTTP status codes are appropriate
- [ ] No sensitive data leaked in errors

#### Operational Concerns

- [ ] HicLog used for request tracing
- [ ] Errors logged with context
- [ ] Rate limiting considered (if applicable)
- [ ] Idempotency handled (for webhooks, mutations)

### 3.4 Detailed Endpoint Specifications

#### POST /api/checkout

**Request:**

```json
{
  "plan": "individual" | "enterprise",
  "billingCycle": "monthly" | "annual",
  "seats": number,          // Enterprise only, min 5
  "promoCode": string,      // Optional
  "email": string           // Required if not authenticated
}
```

**Success Response (200):**

```json
{
  "sessionId": "cs_...",
  "url": "https://checkout.stripe.com/..."
}
```

**Error Responses:**

- 400: Invalid plan, invalid seat count, missing email
- 500: Stripe API failure

---

#### POST /api/license/validate

**Request:**

```json
{
  "licenseKey": "XXXX-XXXX-XXXX-XXXX",
  "fingerprint": "device-fingerprint-hash"
}
```

**Success Response (200):**

```json
{
  "valid": true,
  "status": "ACTIVE",
  "expiresAt": "2027-01-22T00:00:00Z" | null,
  "maxDevices": 3,
  "activatedDevices": 1,
  "features": ["slop-detection", "analytics"]
}
```

**Error Responses:**

- 400: Missing license key
- 401: Invalid license key
- 403: License suspended/expired

---

#### POST /api/webhooks/stripe

**Request:** Raw body with Stripe event payload

**Headers Required:**

- `stripe-signature`: Webhook signature

**Events Handled:**

- `checkout.session.completed` → Create customer, license
- `customer.subscription.updated` → Update status
- `customer.subscription.deleted` → Suspend license
- `invoice.payment_failed` → Send alert email

**Response:** 200 with `{ received: true }` or appropriate error

---

### 3.5 Deliverables

1. API compliance matrix (spec vs. implementation)
2. Missing validation identification
3. Error handling consistency report
4. API documentation updates (if discrepancies found)

---

## Phase 4: Customer Journey Alignment

### 4.1 Reference Documents

| Document        | Location                                                                  | Key Sections            |
| --------------- | ------------------------------------------------------------------------- | ----------------------- |
| User Journey v2 | `docs/plg/20260122_GC_USER_JOURNEY_AND_GUEST_CHECKOUT_v2.md`              | All user flows          |
| PLG Strategy    | `docs/plg/20260121_GC_PRODUCT_LED_GROWTH_STRATEGY_FOR_HIC_AI.md`          | Business logic, pricing |
| Pricing Changes | `docs/plg/20260122_GC_PROPOSED_PRICING_CHANGES_FOR_PLG_IMPLEMENTATION.md` | Tier definitions        |

### 4.2 Individual User Journey

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  1. Pricing │────▶│ 2. Checkout │────▶│  3. Payment │
│    Page     │     │   Session   │     │   (Stripe)  │
└─────────────┘     └─────────────┘     └─────────────┘
                          │                    │
                          │ POST /api/checkout │
                          │                    │
                                               ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  6. Portal  │◀────│  5. Welcome │◀────│ 4. Callback │
│  Dashboard  │     │   Complete  │     │   (/welcome)│
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                    │
       │            License created      Auth0 login
       │            via Stripe webhook
       ▼
┌─────────────┐     ┌─────────────┐
│ 7. Download │────▶│ 8. Activate │
│  Extension  │     │   Device    │
└─────────────┘     └─────────────┘
                          │
                    POST /api/license/activate
```

#### Validation Points

| Step | API/Service                          | Expected Outcome                    | Verified |
| ---- | ------------------------------------ | ----------------------------------- | -------- |
| 2    | `POST /api/checkout`                 | Stripe session with 14-day trial    | [ ]      |
| 3    | Stripe Checkout                      | Payment or trial started            | [ ]      |
| 4    | `checkout.session.completed` webhook | Fires within 5s                     | [ ]      |
| 5    | Keygen API                           | License created with correct policy | [ ]      |
| 5    | DynamoDB                             | Customer + License records created  | [ ]      |
| 5    | SES                                  | License email sent                  | [ ]      |
| 8    | `POST /api/license/activate`         | Device registered, count = 1        | [ ]      |

### 4.3 Guest Checkout Journey

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  1. Pricing │────▶│ 2. Checkout │────▶│  3. Payment │
│    Page     │     │  (no auth)  │     │   (Stripe)  │
└─────────────┘     └─────────────┘     └─────────────┘
                          │                    │
                    email captured       session_id in URL
                                               ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  6. License │◀────│  5. Account │◀────│ 4. Welcome  │
│  Delivered  │     │   Created   │     │   (prompt)  │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                    │
       │            Stripe ↔ Auth0 linked  Sign up / Log in
       │            via session_id
       ▼
┌─────────────┐
│ 7. Portal   │
│  Access     │
└─────────────┘
```

#### Validation Points

| Step | API/Service          | Expected Outcome                      | Verified |
| ---- | -------------------- | ------------------------------------- | -------- |
| 2    | `POST /api/checkout` | Session created with guest email      | [ ]      |
| 3    | Stripe               | `session_id` in success URL           | [ ]      |
| 4    | Welcome page         | Detects unauthenticated, shows prompt | [ ]      |
| 5    | `/welcome/complete`  | Links Stripe customer to Auth0 user   | [ ]      |
| 5    | DynamoDB             | `getCustomerByEmail()` finds pending  | [ ]      |
| 6    | SES                  | License email to verified address     | [ ]      |

### 4.4 Enterprise Journey

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  1. Pricing │────▶│ 2. Seat     │────▶│ 3. Checkout │
│  Enterprise │     │  Selection  │     │   (seats)   │
└─────────────┘     └─────────────┘     └─────────────┘
                          │                    │
                    Validate >= 5        Volume discount
                                               ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  6. Team    │◀────│  5. Admin   │◀────│ 4. Payment  │
│   Setup     │     │   Portal    │     │  Complete   │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │
       │            Auth0 Org created
       │            (future: Phase 2)
       ▼
┌─────────────┐
│ 7. Invite   │
│  Members    │
└─────────────┘
```

#### Validation Points

| Step | API/Service          | Expected Outcome                      | Verified |
| ---- | -------------------- | ------------------------------------- | -------- |
| 2    | UI validation        | Rejects seats < 5                     | [ ]      |
| 3    | `POST /api/checkout` | Volume pricing tier applied           | [ ]      |
| 3    | Stripe               | Line item quantity = seats            | [ ]      |
| 4    | Webhook              | License with `maxDevices = seats * 2` | [ ]      |
| 5    | Auth0                | Organization context (future)         | [ ]      |

### 4.5 Subscription Lifecycle

```
Active ──────▶ Past Due ──────▶ Canceled
   │              │                │
   │              │                │
   ▼              ▼                ▼
License       License          License
ACTIVE        ACTIVE           SUSPENDED
              (grace period)
```

#### Webhook Event Mapping

| Stripe Event                    | DynamoDB Update                  | Keygen Action      |
| ------------------------------- | -------------------------------- | ------------------ |
| `invoice.paid`                  | `subscriptionStatus: 'active'`   | None               |
| `invoice.payment_failed`        | `subscriptionStatus: 'past_due'` | None (grace)       |
| `customer.subscription.deleted` | `subscriptionStatus: 'canceled'` | `suspendLicense()` |

### 4.6 Deliverables

1. Journey validation test results
2. Gap analysis (spec vs. implementation)
3. Edge case documentation
4. Recommended fixes (if any)

---

## Phase 5: Unit Test Implementation

### 5.1 Test Infrastructure Setup

We use the `/dm/facade/test-helpers/` library, a Jest-like ES6-compliant testing framework that includes:

- **`expect.js`** — Assertion library with familiar Jest-like matchers
- **`spy.js`** — Function mocking and spying utilities
- **`describe.js`** — Test suite organization (describe/it blocks)
- **`runner.js`** — Test execution and reporting

```javascript
// Import test utilities from /dm
import {
  describe,
  it,
  beforeEach,
  afterEach,
} from "dm/facade/test-helpers/describe.js";
import { expect } from "dm/facade/test-helpers/expect.js";
import { spy, stub, restore } from "dm/facade/test-helpers/spy.js";
import { runTests } from "dm/facade/test-helpers/runner.js";
```

> **Note:** No npm install required for test dependencies — `/dm` layers are available via workspace symlink.

### 5.2 Test Directory Structure

```
plg-website/
├── tests/
│   ├── lib/
│   │   ├── auth.test.js           # Authentication helpers
│   │   ├── dynamodb.test.js       # Database operations
│   │   ├── keygen.test.js         # License management
│   │   ├── ses.test.js            # Email sending
│   │   └── stripe.test.js         # Payment processing
│   ├── api/
│   │   ├── checkout.test.js       # Checkout flow
│   │   ├── license.test.js        # License endpoints
│   │   ├── portal.test.js         # Portal endpoints
│   │   └── webhooks/
│   │       ├── stripe.test.js     # Stripe webhooks
│   │       └── keygen.test.js     # Keygen webhooks
│   ├── mocks/
│   │   ├── auth0.js               # Auth0 session mocks
│   │   ├── stripe.js              # Stripe API mocks
│   │   ├── keygen.js              # Keygen API mocks
│   │   └── dynamodb.js            # DynamoDB client mocks
│   ├── fixtures/
│   │   ├── customers.js           # Sample customer data
│   │   ├── licenses.js            # Sample license data
│   │   └── webhooks.js            # Sample webhook payloads
│   ├── setup.js                   # Test environment setup
│   └── run-all.js                 # Test runner entry point
└── package.json                   # "test": "node tests/run-all.js"
```

### 5.3 Library Test Specifications

#### lib/auth.test.js

```javascript
describe("Authentication Utilities", () => {
  describe("getSession()", () => {
    it("returns null when no session cookie present");
    it("returns session object when valid cookie present");
    it("returns null when session expired");
  });

  describe("requireAuth()", () => {
    it("returns session when authenticated");
    it("throws AuthError(401) when no session");
  });

  describe("requireOrgRole()", () => {
    it("returns session when user has required role");
    it("throws AuthError(403) when user lacks role");
    it("handles multiple allowed roles");
  });

  describe("validateReturnTo()", () => {
    it("allows whitelisted paths");
    it("rejects external URLs");
    it("rejects javascript: URLs");
    it("defaults to /portal for invalid paths");
  });
});
```

#### lib/dynamodb.test.js

```javascript
describe("DynamoDB Operations", () => {
  describe("Customer Operations", () => {
    it("getCustomerByAuth0Id returns customer for valid ID");
    it("getCustomerByAuth0Id returns null for unknown ID");
    it("getCustomerByEmail queries GSI correctly");
    it("upsertCustomer creates new customer");
    it("upsertCustomer updates existing customer");
    it("updateCustomerSubscription performs partial update");
  });

  describe("License Operations", () => {
    it("getLicense returns license for valid ID");
    it("getCustomerLicenses returns all licenses for auth0Id");
    it("createLicense stores all required attributes");
    it("updateLicenseStatus updates status and timestamp");
  });

  describe("Device Operations", () => {
    it("getLicenseDevices returns all devices for license");
    it("addDeviceActivation creates device and increments count");
    it("removeDeviceActivation deletes device and decrements count");
    it("updateDeviceLastSeen updates timestamp only");
  });
});
```

#### lib/stripe.test.js

```javascript
describe("Stripe Utilities", () => {
  describe("verifyWebhookSignature()", () => {
    it("accepts valid signature");
    it("rejects invalid signature");
    it("rejects expired timestamp");
    it("rejects missing signature header");
  });

  describe("Stripe client configuration", () => {
    it("uses correct API version");
    it("uses secret key from environment");
  });
});
```

### 5.4 API Route Test Specifications

#### api/checkout.test.js

```javascript
describe("POST /api/checkout", () => {
  describe("Request Validation", () => {
    it("returns 400 for missing plan");
    it("returns 400 for invalid plan value");
    it("returns 400 for enterprise with seats < 5");
    it("returns 400 for missing email when unauthenticated");
  });

  describe("Individual Plan", () => {
    it("creates Stripe session with monthly price");
    it("creates Stripe session with annual price");
    it("applies 14-day trial period");
    it("includes customer email in session");
  });

  describe("Enterprise Plan", () => {
    it("creates session with correct seat quantity");
    it("applies tier 1 pricing for 10-99 seats");
    it("applies tier 2 pricing for 100-499 seats");
    it("applies tier 3 pricing for 500+ seats");
  });

  describe("Promo Codes", () => {
    it("enables promotion codes when none specified");
    it("applies specific promo code when provided");
  });
});
```

#### api/webhooks/stripe.test.js

```javascript
describe("POST /api/webhooks/stripe", () => {
  describe("Signature Verification", () => {
    it("returns 400 for missing signature");
    it("returns 400 for invalid signature");
    it("processes valid signature");
  });

  describe("checkout.session.completed", () => {
    it("creates customer in DynamoDB");
    it("creates license in Keygen");
    it("stores license in DynamoDB");
    it("sends license email");
    it("handles duplicate events idempotently");
  });

  describe("customer.subscription.updated", () => {
    it("updates subscription status in DynamoDB");
    it("handles status change to past_due");
    it("handles status change to active");
  });

  describe("customer.subscription.deleted", () => {
    it("updates subscription status to canceled");
    it("suspends license in Keygen");
    it("sends cancellation email");
  });
});
```

### 5.5 Test Coverage Targets

| Module            | Target Coverage |
| ----------------- | --------------- |
| `lib/auth.js`     | 90%             |
| `lib/dynamodb.js` | 85%             |
| `lib/keygen.js`   | 85%             |
| `lib/ses.js`      | 80%             |
| `lib/stripe.js`   | 90%             |
| `api/checkout/`   | 85%             |
| `api/license/`    | 85%             |
| `api/portal/`     | 80%             |
| `api/webhooks/`   | 90%             |

### 5.6 Deliverables

1. Test runner configuration (`tests/run-all.js`, `tests/setup.js`)
2. Mock implementations for all external services (using `spy.js`)
3. Test fixtures for common data
4. All test files with passing tests
5. Coverage tracking via custom reporter or manual verification

---

## Phase 6: Integration Test Implementation

### 6.1 Test Environment Configuration

```bash
# .env.test.local
AUTH0_DOMAIN=test-tenant.auth0.com
AUTH0_CLIENT_ID=test_client_id
AUTH0_CLIENT_SECRET=test_client_secret
AUTH0_SECRET=test_session_secret

STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_test_...

KEYGEN_ACCOUNT_ID=sandbox_account
KEYGEN_PRODUCT_TOKEN=test_token

DYNAMODB_TABLE_NAME=hic-plg-test
AWS_REGION=us-east-1
```

### 6.2 Auth0 Integration Tests

```javascript
describe("Auth0 Integration", () => {
  describe("Login Flow", () => {
    it("redirects to Auth0 login page");
    it("handles callback with valid code");
    it("creates session cookie on success");
    it("includes custom claims in session");
  });

  describe("Session Management", () => {
    it("session persists across requests");
    it("session refreshes before expiry");
    it("logout clears session");
  });

  describe("Protected Routes", () => {
    it("middleware redirects unauthenticated to login");
    it("middleware allows authenticated access");
    it("admin routes require org context");
  });
});
```

### 6.3 Stripe Integration Tests

```javascript
describe("Stripe Integration", () => {
  describe("Checkout Session", () => {
    it("creates valid checkout session");
    it("session URL is accessible");
    it("session contains correct line items");
    it("session has correct success/cancel URLs");
  });

  describe("Webhook Processing", () => {
    it("receives checkout.session.completed");
    it("receives customer.subscription.updated");
    it("receives customer.subscription.deleted");
    it("handles webhook retries correctly");
  });

  describe("Customer Portal", () => {
    it("creates portal session for valid customer");
    it("portal session URL is accessible");
  });
});
```

### 6.4 Keygen Integration Tests

```javascript
describe("Keygen Integration", () => {
  describe("License Management", () => {
    it("creates license with correct policy");
    it("license key is valid format");
    it("validates active license");
    it("rejects invalid license key");
    it("suspends license correctly");
  });

  describe("Machine Management", () => {
    it("activates device successfully");
    it("respects max device limit");
    it("deactivates device successfully");
    it("heartbeat updates lastSeen");
  });

  describe("Webhook Processing", () => {
    it("receives license.created");
    it("receives license.suspended");
    it("receives machine.created");
  });
});
```

### 6.5 End-to-End Data Flow Tests

```javascript
describe("E2E: Individual Purchase Flow", () => {
  it("complete flow from checkout to activation", async () => {
    // 1. Create checkout session
    const checkout = await createCheckoutSession({
      plan: "individual",
      email: "test@example.com",
    });
    expect(checkout.sessionId).toBeDefined();

    // 2. Simulate successful payment (webhook)
    await simulateStripeWebhook("checkout.session.completed", {
      id: checkout.sessionId,
      customer: "cus_test",
      subscription: "sub_test",
    });

    // 3. Verify customer created
    const customer = await getCustomerByEmail("test@example.com");
    expect(customer).toBeDefined();
    expect(customer.stripeCustomerId).toBe("cus_test");

    // 4. Verify license created
    const license = await getLicense(customer.keygenLicenseId);
    expect(license.status).toBe("active");
    expect(license.maxDevices).toBe(3);

    // 5. Activate device
    const activation = await activateDevice({
      licenseKey: license.licenseKey,
      fingerprint: "test-device-001",
      name: "Test MacBook",
      platform: "darwin",
    });
    expect(activation.success).toBe(true);

    // 6. Verify device count
    const updatedLicense = await getLicense(customer.keygenLicenseId);
    expect(updatedLicense.activatedDevices).toBe(1);
  });
});
```

### 6.6 Webhook Reliability Tests

```javascript
describe("Webhook Reliability", () => {
  describe("Idempotency", () => {
    it("processes same event only once");
    it("returns 200 for duplicate events");
    it("does not create duplicate records");
  });

  describe("Error Handling", () => {
    it("returns 500 for transient errors");
    it("Stripe retries on 500");
    it("succeeds on retry after transient failure");
  });

  describe("Ordering", () => {
    it("handles out-of-order events");
    it("subscription.updated before checkout.completed");
  });
});
```

### 6.7 Deliverables

1. Test environment setup scripts
2. Integration test suite (all passing)
3. Webhook simulation utilities
4. Test data cleanup scripts
5. CI/CD integration for integration tests

---

## Execution Timeline

| Week  | Phase | Focus                     | Deliverables                          |
| ----- | ----- | ------------------------- | ------------------------------------- |
| **1** | 1 & 2 | Infrastructure + Database | Gap analysis, schema validation       |
| **2** | 3 & 4 | API + Journey             | Compliance matrix, journey validation |
| **3** | 5     | Unit Tests                | 50+ tests, 80% coverage               |
| **4** | 6     | Integration Tests         | External service validation           |

---

## Risk Mitigation

### Identified Risks

| Risk                     | Impact | Mitigation                                 |
| ------------------------ | ------ | ------------------------------------------ |
| Auth0 v4 API instability | High   | Pin dependency version, monitor changelogs |
| Stripe webhook ordering  | Medium | Implement idempotency, handle out-of-order |
| Keygen rate limits       | Low    | Implement exponential backoff              |
| DynamoDB throughput      | Low    | Use on-demand capacity mode                |

### Contingency Plans

1. **Auth0 issues**: Fall back to session-only auth, defer SSO
2. **Stripe issues**: Manual license provisioning workflow
3. **Keygen issues**: Direct DynamoDB license storage (bypass Keygen)

---

## Appendix A: Reference Documents

| Document                       | Path                                                                 |
| ------------------------------ | -------------------------------------------------------------------- |
| PLG Technical Specification v2 | `docs/plg/20260122_GC_PLG_TECHNICAL_SPECIFICATION_v2.md`             |
| API Map v2                     | `docs/plg/20260122_GC_API_MAP_FOR_HIC_AI_WEBSITE_v2.md`              |
| User Journey v2                | `docs/plg/20260122_GC_USER_JOURNEY_AND_GUEST_CHECKOUT_v2.md`         |
| DDB Schema Addendum            | `docs/plg/20260121_GC_DDB_SCHEMA_ADDENDUM.md`                        |
| Security: Auth0                | `docs/plg/20260122_SECURITY_CONSIDERATIONS_FOR_AUTH0_INTEGRATION.md` |
| Security: Stripe               | `docs/plg/20260122_SECURITY_CONSIDERATIONS_FOR_STRIPE_PAYMENTS.md`   |
| Security: Keygen               | `docs/plg/20260122_SECURITY_CONSIDERATIONS_FOR_KEYGEN_LICENSING.md`  |
| Security: Next.js              | `docs/plg/20260122_SECURITY_CONSIDERATIONS_FOR_NEXTJS_PROJECT.md`    |

---

## Appendix B: Test Commands

```bash
# Run all unit tests
npm test
# or directly:
node tests/run-all.js

# Run specific test file
node tests/lib/auth.test.js

# Run integration tests (requires test env)
npm run test:integration
# or:
node tests/run-all.js --integration

# Run tests with verbose output
node tests/run-all.js --verbose

# Run tests matching a pattern
node tests/run-all.js --grep "DynamoDB"
```

---

## Document History

| Version | Date       | Author         | Changes         |
| ------- | ---------- | -------------- | --------------- |
| 1.0     | 2026-01-22 | GitHub Copilot | Initial version |
