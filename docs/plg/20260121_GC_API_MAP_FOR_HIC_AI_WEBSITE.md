# HIC AI Website — API Route Map

**Date:** January 21, 2026  
**Author:** GC  
**Status:** Planning  
**Related:** [PLG Technical Specification](./20260121_GC_PLG_TECHNICAL_SPECIFICATION.md)

---

## Overview

This document maps all API routes for the hic-ai.com Next.js application, covering:

1. **Authentication** — Auth0 integration (OAuth 2.1 with PKCE)
2. **Checkout** — Stripe payment flows
3. **Webhooks** — Stripe and Keygen.sh event handlers
4. **License Management** — Validation, activation, recovery
5. **Customer Portal** — Self-service subscription management

---

## 1. Authentication (Auth0)

Auth0 handles all authentication complexity. We use the `@auth0/nextjs-auth0` SDK which provides automatic route handlers.

### 1.1 Auth Routes (SDK-Provided)

The SDK creates these routes automatically when you configure it:

| Route                | Method | Purpose                                     |
| -------------------- | ------ | ------------------------------------------- |
| `/api/auth/login`    | GET    | Redirects to Auth0 Universal Login          |
| `/api/auth/logout`   | GET    | Clears session, redirects to Auth0 logout   |
| `/api/auth/callback` | GET    | Handles OAuth callback, establishes session |
| `/api/auth/me`       | GET    | Returns current user profile (if logged in) |

### 1.2 Auth0 SDK Setup

```javascript
// app/api/auth/[auth0]/route.js

import { handleAuth } from "@auth0/nextjs-auth0";

export const GET = handleAuth();
```

That's it. The SDK handles:

- Authorization Code Flow with PKCE
- Token refresh
- Session management (httpOnly cookies)
- CSRF protection

### 1.3 OAuth 2.1 Flow (Automatic)

```
User clicks "Sign In"
        │
        ▼
GET /api/auth/login
        │
        ▼
Redirect to Auth0:
  https://hic-ai.auth0.com/authorize?
    response_type=code&
    client_id=xxx&
    redirect_uri=https://hic-ai.com/api/auth/callback&
    scope=openid profile email&
    code_challenge=xxx&        ← PKCE
    code_challenge_method=S256
        │
        ▼
User authenticates (password, Google, GitHub, SAML SSO)
        │
        ▼
Auth0 redirects back:
  https://hic-ai.com/api/auth/callback?code=xxx
        │
        ▼
SDK exchanges code for tokens (server-side, with code_verifier)
        │
        ▼
Session cookie set, user redirected to /portal
```

### 1.4 SSO / Social Login

Configured in Auth0 Dashboard (no code changes needed):

| Provider     | Use Case             | Setup                    |
| ------------ | -------------------- | ------------------------ |
| **Google**   | Consumer convenience | Enable in Auth0 → Social |
| **GitHub**   | Developer preference | Enable in Auth0 → Social |
| **SAML**     | Enterprise SSO       | Configure per customer   |
| **Okta**     | Enterprise SSO       | Via SAML or OIDC         |
| **Azure AD** | Enterprise SSO       | Via SAML or OIDC         |

All providers use the same `/api/auth/login` endpoint—Auth0 presents options on its Universal Login page.

### 1.5 Protected Routes (Middleware)

```javascript
// middleware.js

import { withMiddlewareAuthRequired } from "@auth0/nextjs-auth0/edge";

export default withMiddlewareAuthRequired();

export const config = {
  matcher: ["/portal/:path*", "/admin/:path*"],
};
```

This automatically redirects unauthenticated users to login for `/portal/*` and `/admin/*` routes.

### 1.6 Getting User in API Routes

```javascript
// app/api/some-protected-route/route.js

import { getSession } from "@auth0/nextjs-auth0";

export async function GET(request) {
  const session = await getSession();

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { user } = session;
  // user.sub = Auth0 user ID
  // user.email = Email address
  // user.name = Display name

  return Response.json({ user });
}
```

### 1.7 Getting User in React Components

```javascript
// app/portal/page.js

"use client";

import { useUser } from "@auth0/nextjs-auth0/client";

export default function PortalPage() {
  const { user, isLoading, error } = useUser();

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!user) return <div>Please log in</div>;

  return (
    <div>
      <h1>Welcome, {user.name}</h1>
      <p>Email: {user.email}</p>
    </div>
  );
}
```

### 1.8 Custom Claims (Linking to Stripe/Keygen)

Auth0 can include custom data in the JWT via Rules or Actions:

```javascript
// Auth0 Action: "Add custom claims"

exports.onExecutePostLogin = async (event, api) => {
  const namespace = "https://hic-ai.com";

  // Look up customer in your database (via Auth0 Action API call)
  // or store these when customer is created

  api.idToken.setCustomClaim(
    `${namespace}/customer_id`,
    event.user.app_metadata.stripe_customer_id,
  );
  api.idToken.setCustomClaim(
    `${namespace}/license_tier`,
    event.user.app_metadata.license_tier,
  );
};
```

Then in your app:

```javascript
const session = await getSession();
const customerId = session.user["https://hic-ai.com/customer_id"];
const tier = session.user["https://hic-ai.com/license_tier"];
```

---

## 2. Checkout Routes

### 2.1 Create Checkout Session

```
POST /api/checkout
```

Creates a Stripe Checkout session and returns the URL.

**Request:**

```json
{
  "priceId": "price_individual_monthly",
  "email": "user@example.com" // Optional, pre-fills checkout
}
```

**Response:**

```json
{
  "url": "https://checkout.stripe.com/c/pay/cs_xxx"
}
```

**Implementation:**

```javascript
// app/api/checkout/route.js

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(request) {
  const { priceId, email } = await request.json();

  const sessionParams = {
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: 14,
    },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/welcome?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing`,
    allow_promotion_codes: true, // Enable coupon codes
  };

  // Pre-fill email if provided
  if (email) {
    sessionParams.customer_email = email;
  }

  const session = await stripe.checkout.sessions.create(sessionParams);

  return Response.json({ url: session.url });
}
```

### 2.2 Create Customer Portal Session

```
POST /api/portal
```

Creates a Stripe Customer Portal session for self-service subscription management.

**Request:**

```json
{
  "customerId": "cus_xxx" // Or derive from session
}
```

**Response:**

```json
{
  "url": "https://billing.stripe.com/p/session/xxx"
}
```

**Implementation:**

```javascript
// app/api/portal/route.js

import Stripe from "stripe";
import { getSession } from "@auth0/nextjs-auth0";
import { getCustomerByEmail } from "@/lib/dynamodb";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Look up Stripe customer ID from our database
  const customer = await getCustomerByEmail(session.user.email);

  if (!customer?.stripeCustomerId) {
    return Response.json({ error: "No subscription found" }, { status: 404 });
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customer.stripeCustomerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/portal`,
  });

  return Response.json({ url: portalSession.url });
}
```

---

## 3. Webhook Routes

### 3.1 Stripe Webhook Handler

```
POST /api/webhooks/stripe
```

Handles all Stripe events. Must verify webhook signature.

**Events Handled:**

| Event                           | Action                              |
| ------------------------------- | ----------------------------------- |
| `checkout.session.completed`    | Create license, send welcome email  |
| `invoice.paid`                  | Reinstate license if suspended      |
| `invoice.payment_failed`        | Suspend license, send warning email |
| `customer.subscription.updated` | Update license tier if plan changed |
| `customer.subscription.deleted` | Revoke license                      |

**Implementation:**

```javascript
// app/api/webhooks/stripe/route.js

import Stripe from "stripe";
import {
  createLicense,
  suspendLicense,
  reinstateLicense,
  revokeLicense,
} from "@/lib/keygen";
import {
  saveCustomer,
  updateCustomer,
  getCustomerByStripeId,
} from "@/lib/dynamodb";
import { sendWelcomeEmail, sendPaymentFailedEmail } from "@/lib/email";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;

      // Determine tier from price
      const lineItems = await stripe.checkout.sessions.listLineItems(
        session.id,
      );
      const priceId = lineItems.data[0]?.price?.id;
      const tier = priceId?.includes("individual") ? "INDIVIDUAL" : "TEAM";

      // Create license in Keygen.sh
      const license = await createLicense({
        email: session.customer_email,
        stripeCustomerId: session.customer,
        tier,
      });

      // Save to DynamoDB
      await saveCustomer({
        email: session.customer_email,
        stripeCustomerId: session.customer,
        stripeSubscriptionId: session.subscription,
        licenseId: license.id,
        licenseKey: license.key,
        tier,
        status: "TRIAL",
      });

      // Send welcome email with license key
      await sendWelcomeEmail({
        to: session.customer_email,
        licenseKey: license.key,
        tier,
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      });

      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object;

      // Skip if this is the first invoice (trial start)
      if (invoice.billing_reason === "subscription_create") {
        break;
      }

      const customer = await getCustomerByStripeId(invoice.customer);
      if (customer?.licenseId) {
        await reinstateLicense(customer.licenseId);
        await updateCustomer(customer.email, { status: "ACTIVE" });
      }

      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const customer = await getCustomerByStripeId(invoice.customer);

      if (customer) {
        // Don't suspend immediately—give grace period
        // Stripe will retry 3 times over ~2 weeks
        await updateCustomer(customer.email, {
          status: "PAST_DUE",
          paymentFailedAt: new Date().toISOString(),
        });

        await sendPaymentFailedEmail({
          to: customer.email,
          updatePaymentUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/portal`,
        });
      }

      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const customer = await getCustomerByStripeId(subscription.customer);

      if (customer?.licenseId) {
        await revokeLicense(customer.licenseId);
        await updateCustomer(customer.email, { status: "CANCELLED" });
      }

      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object;

      // Check if plan changed
      const priceId = subscription.items.data[0]?.price?.id;
      const newTier = priceId?.includes("individual") ? "INDIVIDUAL" : "TEAM";

      const customer = await getCustomerByStripeId(subscription.customer);
      if (customer && customer.tier !== newTier) {
        // Update license tier in Keygen
        await updateLicenseTier(customer.licenseId, newTier);
        await updateCustomer(customer.email, { tier: newTier });
      }

      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return Response.json({ received: true });
}
```

### 3.2 Keygen Webhook Handler (Optional)

```
POST /api/webhooks/keygen
```

Handle Keygen.sh events (useful for audit logging, analytics).

**Events:**

- `license.created`
- `license.suspended`
- `license.revoked`
- `machine.created` (new activation)

```javascript
// app/api/webhooks/keygen/route.js

import crypto from "crypto";

export async function POST(request) {
  const body = await request.text();
  const signature = request.headers.get("keygen-signature");

  // Verify signature
  const expectedSig = crypto
    .createHmac("sha256", process.env.KEYGEN_WEBHOOK_SECRET)
    .update(body)
    .digest("hex");

  if (signature !== expectedSig) {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(body);

  switch (event.data.type) {
    case "machines":
      // New machine activated—could log for analytics
      console.log(`Machine activated: ${event.data.attributes.fingerprint}`);
      break;

    default:
      console.log(`Keygen event: ${event.data.type}`);
  }

  return Response.json({ received: true });
}
```

---

## 4. License Management Routes

### 4.1 Activate License

```
POST /api/license/activate
```

Called by VS Code extension on first use. Records machine and validates license.

**Request:**

```json
{
  "licenseKey": "XXXX-XXXX-XXXX-XXXX",
  "machineFingerprint": "sha256-hash-of-machine-ids",
  "machineName": "Simon's MacBook Pro",
  "extensionVersion": "0.9.8"
}
```

**Response (Success):**

```json
{
  "success": true,
  "license": {
    "id": "lic_xxx",
    "tier": "INDIVIDUAL",
    "status": "ACTIVE",
    "expiresAt": null,
    "activationsUsed": 1,
    "activationsLimit": 3
  }
}
```

**Response (Limit Reached):**

```json
{
  "success": false,
  "error": "ACTIVATION_LIMIT",
  "message": "Maximum machines (3) reached. Deactivate another machine first.",
  "activationsUsed": 3,
  "activationsLimit": 3,
  "portalUrl": "https://hic-ai.com/portal/machines"
}
```

**Implementation:**

```javascript
// app/api/license/activate/route.js

import {
  validateLicenseKey,
  createMachine,
  getMachineCount,
} from "@/lib/keygen";

export async function POST(request) {
  const { licenseKey, machineFingerprint, machineName, extensionVersion } =
    await request.json();

  // Validate the license key
  const validation = await validateLicenseKey(licenseKey);

  if (!validation.valid) {
    return Response.json(
      {
        success: false,
        error: "INVALID_LICENSE",
        message: "License key not found or invalid",
      },
      { status: 401 },
    );
  }

  if (validation.status === "SUSPENDED") {
    return Response.json(
      {
        success: false,
        error: "LICENSE_SUSPENDED",
        message:
          "License suspended due to payment issue. Please update payment method.",
        portalUrl: `${process.env.NEXT_PUBLIC_APP_URL}/portal`,
      },
      { status: 402 },
    );
  }

  // Try to activate machine
  const activation = await createMachine({
    licenseId: validation.licenseId,
    fingerprint: machineFingerprint,
    name: machineName,
    metadata: { extensionVersion },
  });

  if (activation.error === "LIMIT_REACHED") {
    return Response.json(
      {
        success: false,
        error: "ACTIVATION_LIMIT",
        message: `Maximum machines (${activation.limit}) reached.`,
        activationsUsed: activation.count,
        activationsLimit: activation.limit,
        portalUrl: `${process.env.NEXT_PUBLIC_APP_URL}/portal/machines`,
      },
      { status: 403 },
    );
  }

  return Response.json({
    success: true,
    license: {
      id: validation.licenseId,
      tier: validation.tier,
      status: validation.status,
      expiresAt: validation.expiresAt,
      activationsUsed: activation.count,
      activationsLimit: activation.limit,
    },
  });
}
```

### 4.2 Validate License (Heartbeat)

```
POST /api/license/validate
```

Called periodically by extension to verify license is still valid.

**Request:**

```json
{
  "licenseKey": "XXXX-XXXX-XXXX-XXXX",
  "machineFingerprint": "sha256-hash"
}
```

**Response:**

```json
{
  "valid": true,
  "status": "ACTIVE",
  "tier": "INDIVIDUAL",
  "expiresAt": null,
  "features": {
    "batchQuickEdit": true,
    "staging": true,
    "adjust": true,
    "forLines": true
  },
  "cacheUntil": "2026-01-28T00:00:00Z"
}
```

**Implementation:**

```javascript
// app/api/license/validate/route.js

import { validateLicenseKey, validateMachine } from "@/lib/keygen";

const FEATURES_BY_TIER = {
  INDIVIDUAL: {
    batchQuickEdit: true,
    staging: true,
    adjust: true,
    forLines: true,
    maxOperations: 500,
  },
  TEAM: {
    batchQuickEdit: true,
    staging: true,
    adjust: true,
    forLines: true,
    maxOperations: 1000,
    sharedNotes: true,
  },
};

export async function POST(request) {
  const { licenseKey, machineFingerprint } = await request.json();

  const validation = await validateLicenseKey(licenseKey, machineFingerprint);

  if (!validation.valid) {
    return Response.json({
      valid: false,
      status: validation.status || "INVALID",
      error: validation.error,
    });
  }

  // 7-day cache for offline support
  const cacheUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  return Response.json({
    valid: true,
    status: validation.status,
    tier: validation.tier,
    expiresAt: validation.expiresAt,
    features: FEATURES_BY_TIER[validation.tier] || FEATURES_BY_TIER.INDIVIDUAL,
    cacheUntil: cacheUntil.toISOString(),
  });
}
```

### 4.3 Recover License

```
POST /api/license/recover
```

"Forgot my license key" — looks up by email and resends.

**Request:**

```json
{
  "email": "user@example.com"
}
```

**Response:**

```json
{
  "success": true,
  "message": "License key sent to user@example.com"
}
```

**Implementation:**

```javascript
// app/api/license/recover/route.js

import { getCustomerByEmail } from "@/lib/dynamodb";
import { sendLicenseRecoveryEmail } from "@/lib/email";

export async function POST(request) {
  const { email } = await request.json();

  const customer = await getCustomerByEmail(email);

  // Always return success to prevent email enumeration
  if (customer?.licenseKey) {
    await sendLicenseRecoveryEmail({
      to: email,
      licenseKey: customer.licenseKey,
    });
  }

  return Response.json({
    success: true,
    message: `If an account exists for ${email}, the license key has been sent.`,
  });
}
```

### 4.4 Deactivate Machine

```
POST /api/license/deactivate
```

Remove a machine to free up an activation slot.

**Request:**

```json
{
  "licenseKey": "XXXX-XXXX-XXXX-XXXX",
  "machineFingerprint": "sha256-hash"
}
```

**Response:**

```json
{
  "success": true,
  "activationsUsed": 2,
  "activationsLimit": 3
}
```

---

## 5. Customer Portal Routes

These are authenticated routes (require Auth0 session).

### 5.1 Get License Info

```
GET /api/portal/license
```

Returns current user's license details.

**Response:**

```json
{
  "license": {
    "key": "XXXX-XXXX-XXXX-XXXX",
    "tier": "INDIVIDUAL",
    "status": "ACTIVE",
    "createdAt": "2026-01-15T00:00:00Z"
  },
  "subscription": {
    "status": "active",
    "currentPeriodEnd": "2026-02-15T00:00:00Z",
    "cancelAtPeriodEnd": false
  },
  "machines": [
    { "name": "MacBook Pro", "lastSeenAt": "2026-01-21T10:00:00Z" },
    { "name": "Desktop PC", "lastSeenAt": "2026-01-20T15:00:00Z" }
  ]
}
```

### 5.2 List Machines

```
GET /api/portal/machines
```

Returns all activated machines for deactivation UI.

### 5.3 Deactivate Machine (Portal)

```
DELETE /api/portal/machines/:fingerprint
```

Deactivate a specific machine from the portal.

---

## 6. Complete Route Map

```
app/api/
│
├── auth/
│   └── [auth0]/
│       └── route.js              # Auth0 SDK handler (login, logout, callback, me)
│
├── checkout/
│   └── route.js                  # POST: Create Stripe Checkout session
│
├── portal/
│   ├── route.js                  # POST: Create Stripe Customer Portal session
│   ├── license/
│   │   └── route.js              # GET: Get current user's license info
│   └── machines/
│       ├── route.js              # GET: List activated machines
│       └── [fingerprint]/
│           └── route.js          # DELETE: Deactivate a machine
│
├── webhooks/
│   ├── stripe/
│   │   └── route.js              # POST: Handle Stripe events
│   └── keygen/
│       └── route.js              # POST: Handle Keygen events (optional)
│
└── license/
    ├── activate/
    │   └── route.js              # POST: Activate license on machine
    ├── validate/
    │   └── route.js              # POST: Heartbeat validation
    ├── recover/
    │   └── route.js              # POST: "Forgot my license key"
    └── deactivate/
        └── route.js              # POST: Deactivate machine
```

---

## 7. Environment Variables

```bash
# Auth0
AUTH0_SECRET='use-openssl-rand-base64-32'
AUTH0_BASE_URL='https://hic-ai.com'
AUTH0_ISSUER_BASE_URL='https://hic-ai.auth0.com'
AUTH0_CLIENT_ID='xxx'
AUTH0_CLIENT_SECRET='xxx'

# Stripe
STRIPE_SECRET_KEY='sk_live_xxx'
STRIPE_PUBLISHABLE_KEY='pk_live_xxx'
STRIPE_WEBHOOK_SECRET='whsec_xxx'

# Keygen.sh
KEYGEN_ACCOUNT_ID='xxx'
KEYGEN_PRODUCT_TOKEN='xxx'
KEYGEN_WEBHOOK_SECRET='xxx'

# AWS
AWS_REGION='us-east-1'
AWS_ACCESS_KEY_ID='xxx'
AWS_SECRET_ACCESS_KEY='xxx'
DYNAMODB_TABLE_NAME='hic-plg-prod'

# App
NEXT_PUBLIC_APP_URL='https://hic-ai.com'
NODE_ENV='production'
```

---

## 8. Auth Flow Summary

### 8.1 New Customer (No Account)

```
1. Lands on /pricing
2. Clicks "Start Free Trial"
3. Redirected to Stripe Checkout (no auth required)
4. Enters email + card
5. Checkout completes → webhook fires
6. License created, email sent
7. User can now:
   a. Enter license in VS Code (no portal login needed)
   b. Log into portal to manage subscription (creates Auth0 account)
```

### 8.2 Existing Customer (Portal Access)

```
1. Goes to /portal
2. Middleware redirects to /api/auth/login
3. Auth0 Universal Login (email/password, Google, etc.)
4. Callback establishes session
5. Portal loads, fetches /api/portal/license
6. User can view license, manage machines, access Stripe portal
```

### 8.3 Enterprise SSO

```
1. Enterprise admin configures SAML in Auth0
2. Users go to /portal
3. Auth0 detects email domain, redirects to corporate IdP
4. User authenticates via Okta/Azure AD/etc.
5. Auth0 callback, session established
6. User sees enterprise portal view
```

---

## 9. Security Notes

| Concern                  | Mitigation                                                   |
| ------------------------ | ------------------------------------------------------------ |
| **Webhook authenticity** | Verify signatures (Stripe, Keygen)                           |
| **License key exposure** | Only show full key in initial email; mask in portal          |
| **Session security**     | httpOnly cookies, short expiry, refresh tokens               |
| **CSRF**                 | Auth0 SDK handles automatically                              |
| **Rate limiting**        | Apply to `/api/license/*` routes (Amplify WAF or middleware) |
| **Email enumeration**    | `/api/license/recover` always returns success                |

---

## 10. Dependencies

```json
{
  "dependencies": {
    "@auth0/nextjs-auth0": "^3.5.0",
    "stripe": "^14.0.0",
    "@aws-sdk/client-dynamodb": "^3.0.0",
    "@aws-sdk/lib-dynamodb": "^3.0.0",
    "next": "^14.0.0",
    "react": "^18.0.0"
  }
}
```

---

_End of API Map_
