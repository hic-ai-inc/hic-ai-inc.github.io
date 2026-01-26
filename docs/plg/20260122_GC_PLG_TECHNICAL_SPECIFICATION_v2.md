# HIC AI — PLG Technical Specification

**Document Type:** Technical Specification
**Author:** GC (General Counsel AI)
**Date:** January 22, 2026
**Version:** 2.0
**Status:** Draft for Review

> ⚠️ **PARTIAL SUPERSESSION NOTICE (January 25, 2026)**
>
> The **pricing and licensing architecture sections** of this document have been superseded by:
>
> - [20260125_ADDENDUM_PRICING_MODEL_v3_CONCURRENT_SESSIONS.md](./20260125_ADDENDUM_PRICING_MODEL_v3_CONCURRENT_SESSIONS.md)
>
> Key changes:
>
> - **New tiers:** Individual ($15) / Team ($35) / Enterprise ($49) / Automation (Contact Sales)
> - **Session-based licensing:** Concurrent heartbeat model replaces device-count model
> - **Removed tiers:** Power User, Enterprise Standard, Enterprise Premiere, OSS (deferred)
>
> The system architecture, database design, and API structure sections remain valid.

**v2.0 Changes:**

- Pricing restructured: Open Source ($0) / Individual ($10/mo) / Enterprise ($25/seat/mo)
- Simplified to 6 Stripe products (removed launch SKUs)
- Device limits reconciled: Individual = 3, Enterprise = 2/seat
- Trial policy: Individual = 14 days no card, Enterprise = 30 days with card
- Added OSS tier with GitHub verification

---

## Executive Summary

This document specifies the complete technical architecture for HIC AI's Product-Led Growth (PLG) system. The system enables self-service purchase, license management, and enterprise administration for the Mouse VS Code extension.

**Design Principles:**

1. **Build it right, build it once** — Production-quality from day one
2. **Enterprise-ready** — First-class support for team/enterprise accounts
3. **Graceful degradation** — Never hard-lock users; always provide path to payment
4. **Minimal operations** — Fully automated, no manual intervention required

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Database Design](#2-database-design)
3. [API Specification](#3-api-specification)
4. [Stripe Configuration](#4-stripe-configuration)
5. [Keygen.sh Configuration](#5-keygensh-configuration)
6. [Authentication & Authorization](#6-authentication--authorization)
7. [License Validation & Phone-Home](#7-license-validation--phone-home)
8. [Graceful Degradation](#8-graceful-degradation)
9. [Enterprise Administration](#9-enterprise-administration)
10. [Email Templates](#10-email-templates)
11. [Build Sequence](#11-build-sequence)
12. [Security Considerations](#12-security-considerations)

---

## 1. System Architecture

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CUSTOMER TOUCHPOINTS                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   Website    │  │   Customer   │  │   Admin      │  │    Mouse     │    │
│  │  (Public)    │  │   Portal     │  │   Portal     │  │  Extension   │    │
│  │              │  │  (Licensed)  │  │ (Enterprise) │  │  (VS Code)   │    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │
│         │                 │                 │                 │            │
└─────────┼─────────────────┼─────────────────┼─────────────────┼────────────┘
          │                 │                 │                 │
          ▼                 ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AWS AMPLIFY                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        Next.js Application                          │   │
│  │                                                                     │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │   │
│  │  │   Public    │  │  Customer   │  │   Admin     │  │  License   │ │   │
│  │  │   Routes    │  │   Routes    │  │   Routes    │  │ Validation │ │   │
│  │  │             │  │             │  │             │  │    API     │ │   │
│  │  │ /           │  │ /portal/*   │  │ /admin/*    │  │ /api/v1/*  │ │   │
│  │  │ /pricing    │  │             │  │             │  │            │ │   │
│  │  │ /checkout   │  │             │  │             │  │            │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘ │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└───────────────┬─────────────────┬─────────────────┬─────────────────────────┘
                │                 │                 │
                ▼                 ▼                 ▼
┌───────────────────────┐ ┌───────────────┐ ┌───────────────┐
│       Auth0           │ │    Stripe     │ │   Keygen.sh   │
│                       │ │               │ │               │
│ • Authentication      │ │ • Payments    │ │ • Licenses    │
│ • User Management     │ │ • Subscriptions│ │ • Validation │
│ • SSO (Enterprise)    │ │ • Invoices    │ │ • Entitlements│
└───────────┬───────────┘ └───────┬───────┘ └───────┬───────┘
            │                     │                 │
            │                     │                 │
            └──────────┬──────────┴────────┬────────┘
                       │                   │
                       ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AWS INFRASTRUCTURE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐ │
│  │      DynamoDB       │  │        SES          │  │     CloudWatch      │ │
│  │                     │  │                     │  │                     │ │
│  │ • Customer Data     │  │ • Transactional     │  │ • Logging           │ │
│  │ • License Records   │  │   Email             │  │ • Metrics           │ │
│  │ • Subscription State│  │ • Notifications     │  │ • Alerts            │ │
│  │ • Audit Events      │  │                     │  │                     │ │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Technology Stack

| Component          | Technology               | Rationale                                         |
| ------------------ | ------------------------ | ------------------------------------------------- |
| **Frontend**       | Next.js 14+ (App Router) | SSR, API routes, Amplify deployment               |
| **Hosting**        | AWS Amplify              | SSR/Lambda@Edge, auto-scaling, pay-as-you-go      |
| **Database**       | AWS DynamoDB             | Serverless, pay-per-use, Q's approved schema      |
| **Authentication** | Auth0                    | Enterprise SSO, MFA, user management              |
| **Payments**       | Stripe                   | Industry standard, promotion codes, subscriptions |
| **Licensing**      | Keygen.sh                | Purpose-built, validation API, $99/mo             |
| **Email**          | AWS SES or Resend        | Transactional email, low cost                     |
| **Monitoring**     | CloudWatch + Sentry      | Error tracking, metrics                           |

### 1.3 Domain Structure

```
hic-ai.com
├── /                     # Public landing page
├── /pricing              # Pricing page with tier comparison
├── /checkout             # Stripe Checkout flow
├── /research             # Mouse Paper synopsis (SEO)
├── /docs                 # Documentation
├── /portal               # Customer portal (authenticated)
│   ├── /portal/dashboard # License overview, quick actions
│   ├── /portal/licenses  # License details, copy key
│   ├── /portal/billing   # Subscription, invoices
│   └── /portal/download  # Download Mouse
├── /admin                # Enterprise admin (authenticated)
│   ├── /admin/users      # Manage team members
│   ├── /admin/licenses   # Assign/revoke licenses
│   └── /admin/billing    # Organization billing
└── /api                  # API routes
    └── /api/v1           # Versioned API
```

---

## 2. Database Design

### 2.1 DynamoDB Single-Table Design

Following Q's approved schema, the system uses a single DynamoDB table with carefully designed access patterns.

#### 2.1.1 Table Configuration

```
Table Name: hic-plg-prod
Partition Key: PK (String)
Sort Key: SK (String)

Global Secondary Index 1: GSI1
  - GSI1PK (String)
  - GSI1SK (String)
  Purpose: Stripe customer lookup, subscription queries

Global Secondary Index 2: GSI2
  - GSI2PK (String)
  - GSI2SK (String)
  Purpose: License key lookup, validation queries
```

#### 2.1.2 Entity Schemas

**CUSTOMER Entity**

```json
{
  "PK": "CUST#cust_abc123",
  "SK": "PROFILE",
  "GSI1PK": "STRIPE#cus_xyz789",
  "GSI1SK": "CUSTOMER",
  "entityType": "CUSTOMER",
  "customerId": "cust_abc123",
  "email": "user@example.com",
  "name": "Jane Developer",
  "companyName": "Acme Corp",
  "stripeCustomerId": "cus_xyz789",
  "auth0UserId": "auth0|abc123",
  "accountType": "INDIVIDUAL | TEAM | ENTERPRISE",
  "status": "ACTIVE | SUSPENDED | CANCELLED",
  "createdAt": "2026-01-21T10:00:00Z",
  "updatedAt": "2026-01-21T10:00:00Z",
  "metadata": {
    "source": "website",
    "campaign": "launch2026"
  }
}
```

**ORGANIZATION Entity** (for Team/Enterprise accounts)

```json
{
  "PK": "ORG#org_def456",
  "SK": "PROFILE",
  "GSI1PK": "STRIPE#cus_enterprise789",
  "GSI1SK": "ORGANIZATION",
  "entityType": "ORGANIZATION",
  "organizationId": "org_def456",
  "name": "Acme Corporation",
  "domain": "acme.com",
  "stripeCustomerId": "cus_enterprise789",
  "adminCustomerId": "cust_abc123",
  "seatCount": 50,
  "seatLimit": 100,
  "accountType": "TEAM | ENTERPRISE",
  "status": "ACTIVE | SUSPENDED",
  "settings": {
    "ssoEnabled": true,
    "ssoProvider": "okta",
    "autoProvision": true,
    "domainVerified": true
  },
  "createdAt": "2026-01-21T10:00:00Z",
  "updatedAt": "2026-01-21T10:00:00Z"
}
```

**ORGANIZATION_MEMBER Entity**

```json
{
  "PK": "ORG#org_def456",
  "SK": "MEMBER#cust_abc123",
  "GSI1PK": "CUST#cust_abc123",
  "GSI1SK": "ORG_MEMBERSHIP",
  "entityType": "ORG_MEMBER",
  "organizationId": "org_def456",
  "customerId": "cust_abc123",
  "role": "ADMIN | MEMBER",
  "licenseId": "lic_ghi789",
  "invitedAt": "2026-01-21T10:00:00Z",
  "joinedAt": "2026-01-21T12:00:00Z",
  "status": "INVITED | ACTIVE | REVOKED"
}
```

**SUBSCRIPTION Entity**

```json
{
  "PK": "CUST#cust_abc123",
  "SK": "SUB#sub_monthly123",
  "GSI1PK": "STRIPE_SUB#sub_xyz789",
  "GSI1SK": "SUBSCRIPTION",
  "entityType": "SUBSCRIPTION",
  "subscriptionId": "sub_monthly123",
  "customerId": "cust_abc123",
  "stripeSubscriptionId": "sub_xyz789",
  "plan": "OSS | INDIVIDUAL_MONTHLY | INDIVIDUAL_ANNUAL | ENTERPRISE_ANNUAL",
  "status": "ACTIVE | PAST_DUE | CANCELLED | TRIALING",
  "currentPeriodStart": "2026-01-21T00:00:00Z",
  "currentPeriodEnd": "2026-02-21T00:00:00Z",
  "cancelAtPeriodEnd": false,
  "trialEnd": "2026-02-21T00:00:00Z",
  "quantity": 1,
  "priceId": "price_individual_monthly",
  "couponApplied": null,
  "createdAt": "2026-01-21T10:00:00Z",
  "updatedAt": "2026-01-21T10:00:00Z"
}
```

**LICENSE Entity**

```json
{
  "PK": "CUST#cust_abc123",
  "SK": "LIC#lic_ghi789",
  "GSI1PK": "SUB#sub_monthly123",
  "GSI1SK": "LICENSE",
  "GSI2PK": "LICENSE_KEY#MOUSE-XXXX-XXXX-XXXX",
  "GSI2SK": "LICENSE",
  "entityType": "LICENSE",
  "licenseId": "lic_ghi789",
  "keygenLicenseId": "keygen_lic_abc",
  "licenseKey": "MOUSE-XXXX-XXXX-XXXX",
  "customerId": "cust_abc123",
  "subscriptionId": "sub_monthly123",
  "assignedTo": "user@example.com",
  "product": "mouse",
  "tier": "OSS | INDIVIDUAL | ENTERPRISE",
  "status": "ACTIVE | SUSPENDED | REVOKED | EXPIRED",
  "activations": 2,
  "maxActivations": 3,
  "features": ["batch_edit", "for_lines", "adjust"],
  "validFrom": "2026-01-21T00:00:00Z",
  "validUntil": "2026-02-21T00:00:00Z",
  "lastValidatedAt": "2026-01-21T15:30:00Z",
  "lastPhoneHomeAt": "2026-01-21T15:30:00Z",
  "createdAt": "2026-01-21T10:00:00Z"
}
```

**LICENSE_ACTIVATION Entity**

```json
{
  "PK": "LIC#lic_ghi789",
  "SK": "ACTIVATION#act_123",
  "entityType": "LICENSE_ACTIVATION",
  "licenseId": "lic_ghi789",
  "activationId": "act_123",
  "machineFingerprint": "fp_abc123xyz",
  "machineName": "MacBook Pro (Work)",
  "vsCodeVersion": "1.85.0",
  "mouseVersion": "0.9.7",
  "platform": "darwin",
  "activatedAt": "2026-01-21T10:00:00Z",
  "lastSeenAt": "2026-01-21T15:30:00Z",
  "status": "ACTIVE | DEACTIVATED"
}
```

**EVENT Entity** (Audit Trail)

```json
{
  "PK": "CUST#cust_abc123",
  "SK": "EVENT#2026-01-21T10:00:00Z#evt_123",
  "GSI1PK": "EVENT_TYPE#LICENSE_VALIDATED",
  "GSI1SK": "2026-01-21T10:00:00Z",
  "entityType": "EVENT",
  "eventId": "evt_123",
  "eventType": "LICENSE_VALIDATED | PAYMENT_SUCCEEDED | SUBSCRIPTION_CANCELLED | ...",
  "customerId": "cust_abc123",
  "resourceType": "LICENSE | SUBSCRIPTION | CUSTOMER",
  "resourceId": "lic_ghi789",
  "data": {
    "previousStatus": "ACTIVE",
    "newStatus": "ACTIVE",
    "source": "phone_home"
  },
  "timestamp": "2026-01-21T10:00:00Z"
}
```

**INVOICE Entity**

```json
{
  "PK": "CUST#cust_abc123",
  "SK": "INV#inv_456",
  "GSI1PK": "STRIPE_INV#in_xyz789",
  "GSI1SK": "INVOICE",
  "entityType": "INVOICE",
  "invoiceId": "inv_456",
  "stripeInvoiceId": "in_xyz789",
  "customerId": "cust_abc123",
  "subscriptionId": "sub_monthly123",
  "amount": 4000,
  "currency": "usd",
  "status": "PAID | OPEN | VOID | UNCOLLECTIBLE",
  "paidAt": "2026-01-21T10:05:00Z",
  "invoiceUrl": "https://invoice.stripe.com/...",
  "invoicePdf": "https://invoice.stripe.com/pdf/...",
  "createdAt": "2026-01-21T10:00:00Z"
}
```

#### 2.1.3 Access Patterns

| Access Pattern                 | Key Condition                                               | Index |
| ------------------------------ | ----------------------------------------------------------- | ----- |
| Get customer by ID             | PK = CUST#id, SK = PROFILE                                  | Table |
| Get customer by Stripe ID      | GSI1PK = STRIPE#id                                          | GSI1  |
| Get all customer subscriptions | PK = CUST#id, SK begins_with SUB#                           | Table |
| Get all customer licenses      | PK = CUST#id, SK begins_with LIC#                           | Table |
| Get license by key             | GSI2PK = LICENSE_KEY#key                                    | GSI2  |
| Get organization members       | PK = ORG#id, SK begins_with MEMBER#                         | Table |
| Get customer's org memberships | GSI1PK = CUST#id, GSI1SK = ORG_MEMBERSHIP                   | GSI1  |
| Get subscription by Stripe ID  | GSI1PK = STRIPE_SUB#id                                      | GSI1  |
| Get customer events (recent)   | PK = CUST#id, SK begins_with EVENT#, ScanIndexForward=false | Table |
| Get license activations        | PK = LIC#id, SK begins_with ACTIVATION#                     | Table |

---

## 3. API Specification

### 3.1 Public API Routes (No Auth Required)

#### `POST /api/v1/checkout/session`

Creates a Stripe Checkout Session for new purchases.

**Request:**

```json
{
  "priceId": "price_individual_monthly",
  "quantity": 1,
  "promotionCode": null,
  "email": "user@example.com",
  "successUrl": "https://hic-ai.com/portal/welcome",
  "cancelUrl": "https://hic-ai.com/pricing"
}
```

**Response:**

```json
{
  "sessionId": "cs_live_abc123",
  "url": "https://checkout.stripe.com/..."
}
```

#### `POST /api/v1/webhooks/stripe`

Handles incoming Stripe webhooks.

**Events Handled:**

- `checkout.session.completed` → Create customer, subscription, license
- `customer.subscription.updated` → Update subscription status
- `customer.subscription.deleted` → Mark subscription cancelled
- `invoice.paid` → Record invoice, extend license validity
- `invoice.payment_failed` → Update subscription status, trigger dunning
- `customer.updated` → Sync customer data

**Webhook Processing Flow:**

```
Stripe Event → Verify Signature → Parse Event Type →
  → Update DynamoDB → Sync Keygen.sh → Send Email → Log Event
```

#### `POST /api/v1/webhooks/keygen`

Handles incoming Keygen.sh webhooks (optional, for additional validation).

#### `POST /api/v1/license/validate`

Validates a license key (called by Mouse extension).

**Request:**

```json
{
  "licenseKey": "MOUSE-XXXX-XXXX-XXXX",
  "machineFingerprint": "fp_abc123xyz",
  "machineName": "MacBook Pro",
  "mouseVersion": "0.9.7",
  "vsCodeVersion": "1.85.0",
  "platform": "darwin"
}
```

**Response (Success):**

```json
{
  "valid": true,
  "status": "ACTIVE",
  "tier": "INDIVIDUAL",
  "features": ["batch_edit", "for_lines", "adjust"],
  "expiresAt": "2026-02-21T00:00:00Z",
  "gracePeriodEndsAt": null,
  "nextValidationIn": 86400,
  "message": null
}
```

**Response (Grace Period):**

```json
{
  "valid": true,
  "status": "GRACE_PERIOD",
  "tier": "INDIVIDUAL",
  "features": ["batch_edit", "for_lines", "adjust"],
  "expiresAt": "2026-02-21T00:00:00Z",
  "gracePeriodEndsAt": "2026-02-28T00:00:00Z",
  "nextValidationIn": 3600,
  "message": "Your subscription payment failed. Please update your payment method to continue using Mouse."
}
```

**Response (Degraded):**

```json
{
  "valid": true,
  "status": "DEGRADED",
  "tier": "INDIVIDUAL",
  "features": ["batch_edit"],
  "expiresAt": "2026-02-21T00:00:00Z",
  "gracePeriodEndsAt": "2026-02-28T00:00:00Z",
  "nextValidationIn": 3600,
  "message": "Your subscription has expired. Some features are disabled. Renew now to restore full access."
}
```

**Response (Invalid):**

```json
{
  "valid": false,
  "status": "INVALID",
  "tier": null,
  "features": [],
  "expiresAt": null,
  "gracePeriodEndsAt": null,
  "nextValidationIn": 3600,
  "message": "This license key is not valid. Please check your key or purchase a license."
}
```

#### `POST /api/v1/license/phone-home`

Periodic check-in from active Mouse installations.

**Request:**

```json
{
  "licenseKey": "MOUSE-XXXX-XXXX-XXXX",
  "machineFingerprint": "fp_abc123xyz",
  "mouseVersion": "0.9.7",
  "sessionDuration": 3600,
  "operationsPerformed": {
    "batch_edit": 15,
    "quick_edit": 42,
    "find_in_file": 8
  }
}
```

**Response:**

```json
{
  "status": "ACTIVE",
  "features": ["batch_edit", "for_lines", "adjust"],
  "nextPhoneHomeIn": 86400,
  "updateAvailable": {
    "version": "0.9.8",
    "releaseNotes": "https://hic-ai.com/changelog#0.9.8"
  }
}
```

### 3.2 Customer Portal Routes (Auth Required)

All routes require Auth0 JWT authentication.

#### `GET /api/v1/portal/me`

Get current user's profile and subscription summary.

**Response:**

```json
{
  "customer": {
    "customerId": "cust_abc123",
    "email": "user@example.com",
    "name": "Jane Developer",
    "accountType": "INDIVIDUAL"
  },
  "subscription": {
    "status": "ACTIVE",
    "plan": "INDIVIDUAL_MONTHLY",
    "currentPeriodEnd": "2026-02-21T00:00:00Z",
    "cancelAtPeriodEnd": false
  },
  "licenses": [
    {
      "licenseId": "lic_ghi789",
      "licenseKey": "MOUSE-XXXX-XXXX-XXXX",
      "status": "ACTIVE",
      "activations": 2,
      "maxActivations": 3
    }
  ]
}
```

#### `GET /api/v1/portal/licenses`

Get all licenses for the current user.

#### `POST /api/v1/portal/licenses/:licenseId/reset`

Reset activation count for a license (e.g., when switching machines).

#### `GET /api/v1/portal/invoices`

Get invoice history.

#### `POST /api/v1/portal/billing/portal-session`

Create Stripe Customer Portal session for self-service billing management.

**Response:**

```json
{
  "url": "https://billing.stripe.com/session/..."
}
```

### 3.3 Enterprise Admin Routes (Admin Auth Required)

#### `GET /api/v1/admin/organization`

Get organization details.

**Response:**

```json
{
  "organization": {
    "organizationId": "org_def456",
    "name": "Acme Corporation",
    "domain": "acme.com",
    "seatCount": 42,
    "seatLimit": 50,
    "accountType": "ENTERPRISE"
  },
  "subscription": {
    "status": "ACTIVE",
    "plan": "ENTERPRISE_ANNUAL",
    "currentPeriodEnd": "2027-01-21T00:00:00Z"
  },
  "admins": [
    {
      "customerId": "cust_abc123",
      "email": "admin@acme.com",
      "name": "Jane Admin"
    }
  ]
}
```

#### `GET /api/v1/admin/members`

Get all organization members.

**Response:**

```json
{
  "members": [
    {
      "customerId": "cust_abc123",
      "email": "user1@acme.com",
      "name": "Alice Developer",
      "role": "MEMBER",
      "licenseId": "lic_111",
      "status": "ACTIVE",
      "lastActiveAt": "2026-01-21T15:30:00Z"
    },
    {
      "customerId": null,
      "email": "user2@acme.com",
      "name": null,
      "role": "MEMBER",
      "licenseId": "lic_222",
      "status": "INVITED",
      "invitedAt": "2026-01-20T10:00:00Z"
    }
  ],
  "pagination": {
    "total": 42,
    "page": 1,
    "pageSize": 20
  }
}
```

#### `POST /api/v1/admin/members/invite`

Invite new member by email.

**Request:**

```json
{
  "email": "newuser@acme.com",
  "role": "MEMBER"
}
```

**Response:**

```json
{
  "memberId": "cust_new123",
  "email": "newuser@acme.com",
  "status": "INVITED",
  "licenseId": "lic_333",
  "inviteUrl": "https://hic-ai.com/invite/abc123"
}
```

#### `POST /api/v1/admin/members/:memberId/revoke`

Revoke a member's license.

#### `POST /api/v1/admin/members/:memberId/role`

Change a member's role (MEMBER ↔ ADMIN).

#### `POST /api/v1/admin/seats/add`

Add seats to the subscription.

**Request:**

```json
{
  "additionalSeats": 10
}
```

#### `GET /api/v1/admin/usage`

Get usage analytics for the organization.

**Response:**

```json
{
  "period": {
    "start": "2026-01-01T00:00:00Z",
    "end": "2026-01-31T23:59:59Z"
  },
  "summary": {
    "activeUsers": 38,
    "totalSeats": 50,
    "utilizationRate": 0.76,
    "totalOperations": 12450
  },
  "byUser": [
    {
      "email": "alice@acme.com",
      "lastActive": "2026-01-21T15:30:00Z",
      "operations": 523
    }
  ]
}
```

---

## 4. Stripe Configuration

### 4.1 Products

Create one Product per offering:

| Product ID              | Name             | Description                   |
| ----------------------- | ---------------- | ----------------------------- |
| `prod_mouse_individual` | Mouse Individual | For solo developers           |
| `prod_mouse_enterprise` | Mouse Enterprise | For organizations (10+ seats) |

**Note:** Open Source tier has no Stripe product—licenses issued manually via Keygen.sh after GitHub verification.

### 4.2 Prices

Multiple Prices per Product for billing flexibility:

| Price ID                   | Product    | Interval | Amount   | Notes                      |
| -------------------------- | ---------- | -------- | -------- | -------------------------- |
| `price_individual_monthly` | Individual | Monthly  | $10.00   | 14-day trial, no card      |
| `price_individual_annual`  | Individual | Annual   | $100.00  | 2 months free              |
| `price_enterprise_10`      | Enterprise | Annual   | $3,000   | 10 seats @ $300/seat       |
| `price_enterprise_100`     | Enterprise | Annual   | $27,000  | 100 seats @ $270 (10% off) |
| `price_enterprise_500`     | Enterprise | Annual   | $120,000 | 500 seats @ $240 (20% off) |
| `price_enterprise_custom`  | Enterprise | Annual   | Custom   | 1000+ seats                |

### 4.3 Coupons & Promotions

| Coupon ID        | Type        | Value | Duration   | Use Case                |
| ---------------- | ----------- | ----- | ---------- | ----------------------- |
| `EARLYADOPTER20` | Percent Off | 20%   | First year | Time-boxed launch promo |
| `STUDENT50`      | Percent Off | 50%   | Forever    | Academic discount       |
| `NONPROFIT40`    | Percent Off | 40%   | Forever    | Nonprofit discount      |
| `CONF2026`       | Percent Off | 25%   | Once       | Conference promo code   |

**Note:** No "LAUNCH50" or permanent discount SKUs. Use time-boxed coupons instead.

### 4.4 Subscription Settings

```javascript
// Stripe Subscription Configuration
{
  payment_behavior: 'default_incomplete',
  proration_behavior: 'create_prorations',

  // Grace period via dunning
  collection_method: 'charge_automatically',

  // Retry failed payments
  payment_settings: {
    payment_method_options: {
      card: {
        request_three_d_secure: 'automatic'
      }
    },
    save_default_payment_method: 'on_subscription'
  }
}
```

### 4.5 Customer Portal Configuration

Enable Stripe Customer Portal with:

- ✅ Update payment method
- ✅ View invoices and receipts
- ✅ Update billing information
- ✅ Cancel subscription (with confirmation)
- ✅ Reactivate cancelled subscription
- ⬜ Switch plans (handled in our UI for seat management)

---

## 5. Keygen.sh Configuration

### 5.1 Account Setup

| Setting         | Value                         |
| --------------- | ----------------------------- |
| Account ID      | `hic-ai`                      |
| API Mode        | `Production`                  |
| Licensing Model | `FLOATING` (for multi-device) |

### 5.2 Products

| Product ID | Name  | Platforms             |
| ---------- | ----- | --------------------- |
| `mouse`    | Mouse | macOS, Windows, Linux |

### 5.3 Policies

| Policy ID        | Name            | Max Machines | Duration            | Features                     |
| ---------------- | --------------- | ------------ | ------------------- | ---------------------------- |
| `pol_oss`        | Open Source     | 1            | Annual (reverify)   | All features, non-commercial |
| `pol_individual` | Individual      | 3            | Subscription-linked | All features                 |
| `pol_enterprise` | Enterprise Seat | 2            | Subscription-linked | All features + SSO           |

### 5.4 License Key Format

```
MOUSE-XXXX-XXXX-XXXX-XXXX

Where X = Alphanumeric (A-Z, 0-9, excluding confusables: 0/O, 1/I/L)
```

### 5.5 Validation Rules

1. **Online validation required** — Must validate at least once every 7 days
2. **Machine fingerprinting** — Based on hardware ID (not strictly tied to one machine)
3. **Activation limit** — Per-license limit (3 for individual, 2 for team seats)
4. **Deactivation** — Users can release activations via portal

### 5.6 Keygen API Integration

```javascript
// Create license on subscription start
const license = await keygen.licenses.create({
  policy: "pol_individual",
  user: customerEmail,
  metadata: {
    customerId: customer.id,
    subscriptionId: subscription.id,
    tier: "INDIVIDUAL",
  },
});

// Validate license (called from Mouse extension)
const validation = await keygen.licenses.validate(licenseKey, {
  fingerprint: machineFingerprint,
});

// Suspend license on payment failure
await keygen.licenses.suspend(licenseId);

// Reinstate license on successful payment
await keygen.licenses.reinstate(licenseId);
```

---

## 6. Authentication & Authorization

### 6.1 Auth0 Configuration

**Applications:**

| Application     | Type   | Purpose                         |
| --------------- | ------ | ------------------------------- |
| HIC AI Website  | SPA    | Customer-facing website         |
| Mouse Extension | Native | VS Code extension (device flow) |
| HIC API         | M2M    | Backend service                 |

**Connections:**

| Connection        | Type       | Purpose                    |
| ----------------- | ---------- | -------------------------- |
| Username-Password | Database   | Default signup/login       |
| Google            | Social     | Google OAuth               |
| GitHub            | Social     | GitHub OAuth (developers!) |
| SAML              | Enterprise | Enterprise SSO             |
| Okta              | Enterprise | Enterprise SSO             |

### 6.2 Roles & Permissions

| Role         | Permissions                             | Scope                  |
| ------------ | --------------------------------------- | ---------------------- |
| `user`       | Read own data, manage own licenses      | Customer Portal        |
| `org_admin`  | Manage org members, view usage, billing | Admin Portal           |
| `org_member` | Read org data, access assigned license  | Admin Portal (limited) |

### 6.3 JWT Claims

```json
{
  "sub": "auth0|abc123",
  "email": "user@example.com",
  "https://hic-ai.com/customer_id": "cust_abc123",
  "https://hic-ai.com/org_id": "org_def456",
  "https://hic-ai.com/roles": ["user", "org_admin"],
  "https://hic-ai.com/account_type": "ENTERPRISE"
}
```

### 6.4 Auth Flow for Mouse Extension

Since VS Code extensions can't do traditional OAuth redirect:

1. **Device Authorization Flow:**
   - Extension requests device code from Auth0
   - User visits verification URL and enters code
   - Extension polls for token
   - Token stored securely in VS Code secrets API

2. **Simplified Flow (License-Only):**
   - User enters license key directly
   - Extension validates against our API
   - No Auth0 required for basic usage

Recommendation: Start with license-only flow; add Auth0 later for enterprise SSO.

---

## 7. License Validation & Phone-Home

### 7.1 Validation Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                    MOUSE EXTENSION STARTUP                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────────┐                                          │
│   │ Load cached     │                                          │
│   │ license state   │                                          │
│   └────────┬────────┘                                          │
│            │                                                    │
│            ▼                                                    │
│   ┌─────────────────┐     Yes    ┌─────────────────┐           │
│   │ Cache valid?    │───────────▶│ Use cached      │           │
│   │ (< 24 hrs old)  │            │ entitlements    │           │
│   └────────┬────────┘            └─────────────────┘           │
│            │ No                                                 │
│            ▼                                                    │
│   ┌─────────────────┐                                          │
│   │ Online validate │◀──────────────────┐                      │
│   │ /api/v1/license │                   │                      │
│   │   /validate     │                   │                      │
│   └────────┬────────┘                   │                      │
│            │                            │                      │
│       ┌────┴────┐                       │                      │
│       ▼         ▼                       │                      │
│   Success    Network                    │                      │
│      │       Error                      │                      │
│      │         │                        │                      │
│      │         ▼                        │                      │
│      │   ┌─────────────────┐            │                      │
│      │   │ Cache < 7 days? │            │                      │
│      │   └────────┬────────┘            │                      │
│      │       Yes  │  No                 │                      │
│      │         │  │                     │                      │
│      │         ▼  ▼                     │                      │
│      │   ┌──────────┐ ┌──────────┐      │                      │
│      │   │Use cached│ │ Degraded │      │                      │
│      │   │ state    │ │  mode    │      │                      │
│      │   └──────────┘ └──────────┘      │                      │
│      │                                  │                      │
│      ▼                                  │                      │
│   ┌─────────────────┐                   │                      │
│   │ Update cache    │                   │                      │
│   │ Schedule next   │───────────────────┘                      │
│   │ validation      │  (24 hrs or as specified)                │
│   └─────────────────┘                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Phone-Home Schedule

| Scenario               | Phone-Home Interval | Validation Interval |
| ---------------------- | ------------------- | ------------------- |
| Active & healthy       | 24 hours            | 24 hours            |
| Payment failed (grace) | 1 hour              | 1 hour              |
| Approaching expiry     | 6 hours             | 6 hours             |
| Degraded mode          | 1 hour              | 1 hour              |

### 7.3 Offline Tolerance

| License Status | Max Offline Duration | Behavior After        |
| -------------- | -------------------- | --------------------- |
| ACTIVE         | 7 days               | Degraded features     |
| GRACE_PERIOD   | 24 hours             | Degraded immediately  |
| DEGRADED       | 0 (must reconnect)   | Minimal features only |

### 7.4 Machine Fingerprinting

Generate stable machine fingerprint from:

- CPU ID (partial)
- OS installation ID
- VS Code machine ID

Hash combination to create `fp_XXXX` fingerprint. Not perfect, but good enough to:

- Prevent casual key sharing
- Allow legitimate reinstalls
- Support multiple machines (up to activation limit)

---

## 8. Graceful Degradation

### 8.1 Feature Tiers by Status

| License Status   | Available Features           | Restricted Features                       |
| ---------------- | ---------------------------- | ----------------------------------------- |
| **ACTIVE**       | All                          | None                                      |
| **TRIALING**     | All                          | None                                      |
| **GRACE_PERIOD** | All (with warning)           | None                                      |
| **DEGRADED**     | `quick_edit`, `find_in_file` | `batch_quick_edit`, `for_lines`, `adjust` |
| **EXPIRED**      | `find_in_file` (read-only)   | All editing tools                         |
| **INVALID**      | None                         | All tools                                 |

### 8.2 User Notifications

**In-Extension Notifications:**

| Status       | Notification                                                  | Frequency           |
| ------------ | ------------------------------------------------------------- | ------------------- |
| GRACE_PERIOD | "Payment failed. Update payment method → [Link]"              | Every session start |
| DEGRADED     | "License expired. Advanced features disabled. Renew → [Link]" | Every session start |
| EXPIRED      | "License expired. Renew to continue editing → [Link]"         | On tool use attempt |

**Email Notifications:**

| Trigger             | Email                       | Timing      |
| ------------------- | --------------------------- | ----------- |
| Payment failed      | "Payment failed"            | Immediately |
| 3 days into grace   | "Reminder: Update payment"  | Day 3       |
| 5 days into grace   | "Final reminder"            | Day 5       |
| Grace period ending | "Access suspended tomorrow" | Day 6       |
| License expired     | "Your license has expired"  | Immediately |

### 8.3 Recovery Path

Always provide clear path back to full access:

```
┌─────────────────────────────────────────────────────────────────┐
│                      DEGRADED STATE UI                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ⚠️  Your Mouse license has expired                            │
│                                                                 │
│  Some features are temporarily disabled. To restore full        │
│  access, please update your payment method or renew your        │
│  subscription.                                                  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  [Update Payment Method]  [Renew Subscription]          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Currently available: quick_edit, find_in_file                  │
│  Temporarily disabled: batch_quick_edit, for_lines, adjust      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. Enterprise Administration

### 9.1 Enterprise Features

| Feature                      | Description                         |
| ---------------------------- | ----------------------------------- |
| **Centralized billing**      | Single invoice for all seats        |
| **User management**          | Add/remove users, assign licenses   |
| **Domain auto-provisioning** | Auto-add users from verified domain |
| **SSO integration**          | SAML/Okta/Azure AD                  |
| **Usage analytics**          | See adoption and usage by user      |
| **Audit log**                | Track admin actions                 |
| **Custom contract**          | Enterprise agreement terms          |

### 9.2 License Assignment Flow

```
Admin invites user@acme.com
         │
         ▼
┌─────────────────────────────────────────┐
│ System creates:                         │
│ • ORG_MEMBER record (status: INVITED)   │
│ • LICENSE record (assigned to email)    │
│ • Sends invitation email                │
└────────────────────┬────────────────────┘
                     │
                     ▼
User clicks invite link, creates account
         │
         ▼
┌─────────────────────────────────────────┐
│ System:                                 │
│ • Creates CUSTOMER record               │
│ • Links to ORG_MEMBER                   │
│ • Activates LICENSE                     │
│ • User can download & activate Mouse    │
└─────────────────────────────────────────┘
```

### 9.3 Admin Portal Pages

**Dashboard (`/admin`)**

- Seat utilization (42/50 seats used)
- Active users this week
- Quick actions: Invite user, Add seats

**Team Members (`/admin/users`)**

- Table: Name, Email, Role, Status, Last Active
- Actions: Invite, Change Role, Revoke
- Bulk invite via CSV upload

**Licenses (`/admin/licenses`)**

- Table: License Key (masked), Assigned To, Status, Activations
- Actions: Reset activations, Revoke, Reassign

**Billing (`/admin/billing`)**

- Current plan and seat count
- Next invoice preview
- Payment method (last 4 digits)
- Invoice history
- Links to Stripe Customer Portal

**Settings (`/admin/settings`)**

- Organization name
- Domain verification
- SSO configuration
- Auto-provisioning toggle

---

## 10. Email Templates

### 10.1 Transactional Emails

| Email                      | Trigger                | Key Content                                 |
| -------------------------- | ---------------------- | ------------------------------------------- |
| **Welcome**                | First purchase         | Download link, license key, getting started |
| **Invoice**                | Payment processed      | Invoice PDF, receipt                        |
| **Payment Failed**         | Charge declined        | Update payment CTA, grace period notice     |
| **Dunning Day 3**          | 3 days after failure   | Reminder, consequences explained            |
| **Dunning Day 6**          | 6 days after failure   | Final warning, suspension tomorrow          |
| **Subscription Cancelled** | Cancellation confirmed | Reactivation option, feedback request       |
| **License Expired**        | Grace period ended     | Features disabled, reactivate CTA           |
| **Invite (Enterprise)**    | Admin invites user     | Accept invite link, what is Mouse           |
| **Renewal Reminder**       | 7 days before renewal  | Upcoming charge notice                      |

### 10.2 Email Design Principles

- Clean, minimal design
- Clear single CTA
- Mobile-responsive
- Plain text alternative
- Unsubscribe link (where applicable)

---

## 11. Build Sequence

### Phase 0: Prerequisites (Days 1-2)

| #   | Task                                                  | Dependency | Hours |
| --- | ----------------------------------------------------- | ---------- | ----- |
| 0.1 | Create AWS account (if needed), configure credentials | None       | 1     |
| 0.2 | Create Stripe account, complete verification          | None       | 2     |
| 0.3 | Create Keygen.sh account                              | None       | 1     |
| 0.4 | Create Auth0 tenant                                   | None       | 1     |
| 0.5 | Register domain, configure DNS                        | None       | 2     |
| 0.6 | Create Amplify app, configure custom domain           | 0.5        | 1     |
|     | **Subtotal**                                          |            | **8** |

### Phase 1: Core Infrastructure (Days 3-7)

| #   | Task                                      | Dependency | Hours  |
| --- | ----------------------------------------- | ---------- | ------ |
| 1.1 | Create DynamoDB table with GSIs           | 0.1        | 2      |
| 1.2 | Set up Next.js project scaffold           | 0.6        | 2      |
| 1.3 | Configure Stripe Products, Prices         | 0.2        | 3      |
| 1.4 | Configure Stripe Coupons, Promotion Codes | 1.3        | 2      |
| 1.5 | Configure Keygen.sh Products, Policies    | 0.3        | 2      |
| 1.6 | Create DynamoDB access layer (TypeScript) | 1.1, 1.2   | 6      |
| 1.7 | Create Stripe integration module          | 1.2, 1.3   | 4      |
| 1.8 | Create Keygen.sh integration module       | 1.2, 1.5   | 4      |
|     | **Subtotal**                              |            | **25** |

### Phase 2: Payment & Webhook Processing (Days 8-12)

| #   | Task                                   | Dependency | Hours  |
| --- | -------------------------------------- | ---------- | ------ |
| 2.1 | Implement Stripe Checkout flow         | 1.7        | 6      |
| 2.2 | Implement Stripe webhook handler       | 1.6, 1.7   | 8      |
| 2.3 | Implement license creation on payment  | 1.8, 2.2   | 4      |
| 2.4 | Configure email sending (SES/Resend)   | 1.2        | 3      |
| 2.5 | Implement welcome email flow           | 2.3, 2.4   | 3      |
| 2.6 | Test complete purchase flow end-to-end | 2.1-2.5    | 4      |
|     | **Subtotal**                           |            | **28** |

### Phase 3: License Validation API (Days 13-16)

| #   | Task                                           | Dependency | Hours  |
| --- | ---------------------------------------------- | ---------- | ------ |
| 3.1 | Implement /api/v1/license/validate             | 1.6, 1.8   | 6      |
| 3.2 | Implement /api/v1/license/phone-home           | 1.6, 1.8   | 4      |
| 3.3 | Implement graceful degradation logic           | 3.1        | 4      |
| 3.4 | Add license validation to Mouse extension      | 3.1        | 8      |
| 3.5 | Add phone-home to Mouse extension              | 3.2        | 4      |
| 3.6 | Test license scenarios (valid, expired, grace) | 3.1-3.5    | 4      |
|     | **Subtotal**                                   |            | **30** |

### Phase 4: Public Website (Days 17-21)

| #   | Task                                       | Dependency | Hours  |
| --- | ------------------------------------------ | ---------- | ------ |
| 4.1 | Design system setup (Tailwind, components) | 1.2        | 4      |
| 4.2 | Landing page (Hero, Problem, Solution)     | 4.1        | 8      |
| 4.3 | Pricing page with tier comparison          | 4.1, 2.1   | 6      |
| 4.4 | Checkout success/cancel pages              | 2.1        | 2      |
| 4.5 | Research page (Mouse Paper synopsis)       | 4.1        | 4      |
| 4.6 | About/Company page                         | 4.1        | 2      |
| 4.7 | Documentation pages (basic)                | 4.1        | 4      |
| 4.8 | Mobile responsiveness, polish              | 4.2-4.7    | 4      |
|     | **Subtotal**                               |            | **34** |

### Phase 5: Customer Portal (Days 22-26)

| #   | Task                                  | Dependency | Hours  |
| --- | ------------------------------------- | ---------- | ------ |
| 5.1 | Auth0 integration (login/signup)      | 0.4, 1.2   | 6      |
| 5.2 | Portal dashboard page                 | 5.1, 1.6   | 6      |
| 5.3 | License management page               | 5.2        | 4      |
| 5.4 | Stripe Customer Portal integration    | 5.1, 1.7   | 3      |
| 5.5 | Download page with platform detection | 5.1        | 3      |
| 5.6 | Invoice history page                  | 5.1, 1.6   | 3      |
|     | **Subtotal**                          |            | **25** |

### Phase 6: Enterprise Admin (Days 27-32)

| #   | Task                                     | Dependency | Hours  |
| --- | ---------------------------------------- | ---------- | ------ |
| 6.1 | Organization data model implementation   | 1.6        | 4      |
| 6.2 | Admin authentication/authorization       | 5.1, 6.1   | 4      |
| 6.3 | Admin dashboard page                     | 6.2        | 4      |
| 6.4 | Team members page (list, invite, revoke) | 6.2, 6.1   | 8      |
| 6.5 | Member invitation flow & email           | 6.4, 2.4   | 4      |
| 6.6 | Seat management (add seats)              | 6.2, 1.7   | 4      |
| 6.7 | Usage analytics page                     | 6.2, 1.6   | 6      |
| 6.8 | Admin settings page                      | 6.2        | 3      |
|     | **Subtotal**                             |            | **37** |

### Phase 7: Dunning & Edge Cases (Days 33-36)

| #   | Task                               | Dependency | Hours  |
| --- | ---------------------------------- | ---------- | ------ |
| 7.1 | Payment failure handling           | 2.2        | 4      |
| 7.2 | Dunning email sequence             | 7.1, 2.4   | 4      |
| 7.3 | Grace period logic                 | 7.1, 3.3   | 3      |
| 7.4 | Subscription cancellation handling | 2.2        | 3      |
| 7.5 | Renewal reminder emails            | 2.4        | 2      |
| 7.6 | Reactivation flow                  | 7.4        | 3      |
|     | **Subtotal**                       |            | **19** |

### Phase 8: Testing & Launch (Days 37-42)

| #   | Task                                    | Dependency | Hours  |
| --- | --------------------------------------- | ---------- | ------ |
| 8.1 | End-to-end testing: Individual purchase | All        | 4      |
| 8.2 | End-to-end testing: Enterprise flow     | All        | 4      |
| 8.3 | End-to-end testing: Dunning/recovery    | All        | 3      |
| 8.4 | Security review, rate limiting          | All        | 4      |
| 8.5 | Performance testing                     | All        | 2      |
| 8.6 | Accessibility audit                     | 4.\*       | 3      |
| 8.7 | Soft launch to beta users               | All        | 2      |
| 8.8 | Bug fixes and iteration                 | 8.7        | 8      |
| 8.9 | Production deployment                   | 8.8        | 2      |
|     | **Subtotal**                            |            | **32** |

### Total Estimated Hours

| Phase                         | Hours         |
| ----------------------------- | ------------- |
| Phase 0: Prerequisites        | 8             |
| Phase 1: Core Infrastructure  | 25            |
| Phase 2: Payment & Webhooks   | 28            |
| Phase 3: License Validation   | 30            |
| Phase 4: Public Website       | 34            |
| Phase 5: Customer Portal      | 25            |
| Phase 6: Enterprise Admin     | 37            |
| Phase 7: Dunning & Edge Cases | 19            |
| Phase 8: Testing & Launch     | 32            |
| **Total**                     | **238 hours** |

### Timeline Options

| Pace               | Hours/Week | Calendar Weeks |
| ------------------ | ---------- | -------------- |
| **Focused sprint** | 40 hrs/wk  | 6 weeks        |
| **Balanced**       | 30 hrs/wk  | 8 weeks        |
| **Part-time**      | 20 hrs/wk  | 12 weeks       |

---

## 12. Security Considerations

### 12.1 API Security

| Measure                  | Implementation                            |
| ------------------------ | ----------------------------------------- |
| **HTTPS only**           | Amplify/CloudFront enforces               |
| **Rate limiting**        | API Gateway + Lambda (100 req/min per IP) |
| **Webhook verification** | Stripe signature verification             |
| **JWT validation**       | Auth0 RS256 verification                  |
| **Input validation**     | Zod schemas on all endpoints              |
| **SQL/NoSQL injection**  | Parameterized DynamoDB operations         |

### 12.2 License Security

| Measure                    | Implementation                 |
| -------------------------- | ------------------------------ |
| **License key entropy**    | 128-bit keys from Keygen.sh    |
| **Machine fingerprinting** | Prevents casual sharing        |
| **Activation limits**      | Hard limit per license         |
| **Server-side validation** | Cannot bypass with local hacks |
| **Periodic phone-home**    | Detect revoked licenses        |

### 12.3 Data Protection

| Measure                   | Implementation                  |
| ------------------------- | ------------------------------- |
| **Encryption at rest**    | DynamoDB default encryption     |
| **Encryption in transit** | TLS 1.3                         |
| **PII minimization**      | Store only necessary data       |
| **Payment data**          | Never stored; Stripe handles    |
| **Audit logging**         | All sensitive operations logged |

### 12.4 Compliance Considerations

| Requirement | Approach                            |
| ----------- | ----------------------------------- |
| **GDPR**    | Data export/deletion on request     |
| **CCPA**    | Privacy policy, opt-out mechanism   |
| **SOC 2**   | Future consideration for enterprise |

---

## Appendix A: API Error Codes

| Code                | HTTP Status | Description                        |
| ------------------- | ----------- | ---------------------------------- |
| `INVALID_LICENSE`   | 401         | License key not found or malformed |
| `LICENSE_EXPIRED`   | 402         | License has expired                |
| `LICENSE_SUSPENDED` | 402         | License suspended (payment issue)  |
| `ACTIVATION_LIMIT`  | 403         | Max activations reached            |
| `UNAUTHORIZED`      | 401         | Missing or invalid auth token      |
| `FORBIDDEN`         | 403         | Insufficient permissions           |
| `NOT_FOUND`         | 404         | Resource not found                 |
| `RATE_LIMITED`      | 429         | Too many requests                  |
| `SERVER_ERROR`      | 500         | Internal server error              |

---

## Appendix B: Environment Variables

```bash
# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_live_...

# Keygen.sh
KEYGEN_ACCOUNT_ID=...
KEYGEN_PRODUCT_TOKEN=...
KEYGEN_WEBHOOK_SECRET=...

# Auth0
AUTH0_SECRET=...
AUTH0_BASE_URL=https://hic-ai.com
AUTH0_ISSUER_BASE_URL=https://hic-ai.auth0.com
AUTH0_CLIENT_ID=...
AUTH0_CLIENT_SECRET=...

# AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
DYNAMODB_TABLE_NAME=hic-plg-prod

# Email
SES_REGION=us-east-1
# or
RESEND_API_KEY=...

# App
NEXT_PUBLIC_APP_URL=https://hic-ai.com
NODE_ENV=production
```

---

## Appendix C: Glossary

| Term             | Definition                                         |
| ---------------- | -------------------------------------------------- |
| **PLG**          | Product-Led Growth                                 |
| **Seat**         | One license for one user                           |
| **Grace Period** | Time after payment failure before features degrade |
| **Dunning**      | Process of collecting failed payments              |
| **Phone-Home**   | Periodic check-in from extension to server         |
| **Fingerprint**  | Machine identifier for activation tracking         |
| **Entitlement**  | Features granted by a license                      |

---

_End of Technical Specification_
