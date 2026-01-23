# MEMORANDUM

**TO:** Simon Reiff, President & Technical Founder  
**FROM:** GC  
**DATE:** January 22, 2026  
**VERSION:** 2.0  
**RE:** User Journey Design — Guest Checkout with Account Creation Tie-In

**v2.0 Changes:**
- Pricing restructured: Open Source ($0) / Individual ($10/mo) / Enterprise ($25/seat/mo)
- Removed TEAM tier and LAUNCH50 promo code
- Updated trial policies: Individual=14 days no card, Enterprise=30 days with card
- Device limits reconciled: OSS=1, Individual=3, Enterprise=2/seat

---

## Executive Summary

This memo details the user journey from first visit through purchase completion, addressing:

1. **Guest browsing** — No account needed to explore pricing
2. **Client-side cart** — localStorage persistence, no server-side guest sessions
3. **Stripe Checkout** — Hosted payment page collects email + card
4. **Account creation tie-in** — Where and how to require Auth0 account
5. **Post-purchase portal access** — Settings, payments, license management

**Key Design Decision:** Require account creation **after payment, before license delivery**. This balances frictionless checkout with ensuring every paying customer has portal access.

---

## 1. The Frictionless Checkout Principle

Modern SaaS best practice: **remove barriers until the moment of commitment**.

| Stage           | Friction Level | What We Ask For                |
| --------------- | -------------- | ------------------------------ |
| Landing page    | Zero           | Nothing                        |
| Pricing page    | Zero           | Nothing                        |
| Plan selection  | Zero           | Just clicks                    |
| Stripe Checkout | Medium         | Email + Card                   |
| Post-payment    | Low            | Password (to complete account) |

The user gives us their credit card before their password. By that point, they're committed—setting a password feels like a small final step, not a barrier.

---

## 2. User Journey: Visual Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 1: DISCOVERY (No Account, No Data Collected)                         │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────┐
    │  hic-ai.com                                             │
    │  ───────────────────────────────────────────────────    │
    │                                                         │
    │  🐭 Mouse                                               │
    │  Precision editing tools for AI coding agents           │
    │                                                         │
    │  [Watch Demo]  [View Pricing]  [Start Free Trial →]     │
    │                                                         │
    └─────────────────────────────────────────────────────────┘
                              │
                              ▼
    ┌─────────────────────────────────────────────────────────┐
    │  hic-ai.com/pricing                                     │
    │  ───────────────────────────────────────────────────    │
    │                                                         │
    │  ┌───────────────┐  ┌───────────────┐  ┌─────────────┐ │
    │  │ Open Source   │  │  Individual   │  │ Enterprise  │ │
    │  │  $0/month     │  │  $10/month    │  │ $25/seat/mo │ │
    │  │               │  │               │  │ (annual)    │ │
    │  │  • Non-comm.  │  │  • 1 user     │  │ • 10+ seats │ │
    │  │  • 1 device   │  │  • 3 devices  │  │ • 2 dev/seat│ │
    │  │  • GitHub req │  │  • All tools  │  │ • SSO/SAML  │ │
    │  │               │  │               │  │             │ │
    │  │ [Get License] │  │ [Start Trial] │  │ [Contact]   │ │
    │  └───────────────┘  └───────────────┘  └─────────────┘ │
    │                                                         │
    │                                                         │
    │  Promo code? [EARLYADOPTER20] [Apply ✓]                 │
    │  "20% off applied! You'll pay $8/month"                 │
    │                                                         │
    └─────────────────────────────────────────────────────────┘
                              │
                              │ User clicks "Start Trial"
                              │
                              │ Client-side: localStorage.setItem('cart', {
                              │   plan: 'individual',
                              │   seats: 1,
                              │   promo: 'EARLYADOPTER20'
                              │ })
                              │
                              ▼

┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 2: PAYMENT (Stripe Hosted Checkout)                                  │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────┐
    │  checkout.stripe.com                                    │
    │  ───────────────────────────────────────────────────    │
    │                                                         │
    │  HIC AI                                                 │
    │                                                         │
    │  Mouse Individual                                       │
    │  14-day free trial (no card required), then $10/month   │
    │  (20% off with EARLYADOPTER20 = $8/month)               │
    │                                                         │
    │  ───────────────────────────────────────────────────    │
    │                                                         │
    │  Email                                                  │
    │  ┌─────────────────────────────────────────────────┐   │
    │  │ simon@example.com                               │   │
    │  └─────────────────────────────────────────────────┘   │
    │                                                         │
    │  Card information                                       │
    │  ┌─────────────────────────────────────────────────┐   │
    │  │ 4242 4242 4242 4242       12/28    123         │   │
    │  └─────────────────────────────────────────────────┘   │
    │                                                         │
    │  ┌─────────────────────────────────────────────────┐   │
    │  │           Start free trial                      │   │
    │  └─────────────────────────────────────────────────┘   │
    │                                                         │
    │  By confirming, you allow HIC AI to charge your card   │
    │  $10.00/month after your trial ends.                   │
    │                                                         │
    └─────────────────────────────────────────────────────────┘
                              │
                              │ User clicks "Start free trial"
                              │
                              │ Stripe:
                              │   1. Creates customer (cus_xxx)
                              │   2. Creates subscription (sub_xxx, trialing)
                              │   3. Fires webhook: checkout.session.completed
                              │   4. Redirects to success_url with session_id
                              │
                              ▼

┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 3: ACCOUNT CREATION TIE-IN (Required)                                │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────┐
    │  hic-ai.com/welcome?session_id=cs_xxx                   │
    │  ───────────────────────────────────────────────────    │
    │                                                         │
    │  🎉 Payment Successful!                                 │
    │                                                         │
    │  One more step: Create your account to receive          │
    │  your license key and access your portal.               │
    │                                                         │
    │  ───────────────────────────────────────────────────    │
    │                                                         │
    │  Email (from checkout)                                  │
    │  ┌─────────────────────────────────────────────────┐   │
    │  │ simon@example.com                          🔒   │   │  ← Pre-filled, readonly
    │  └─────────────────────────────────────────────────┘   │
    │                                                         │
    │  Create a password                                      │
    │  ┌─────────────────────────────────────────────────┐   │
    │  │ ••••••••••••                                    │   │
    │  └─────────────────────────────────────────────────┘   │
    │                                                         │
    │  Confirm password                                       │
    │  ┌─────────────────────────────────────────────────┐   │
    │  │ ••••••••••••                                    │   │
    │  └─────────────────────────────────────────────────┘   │
    │                                                         │
    │            ─── OR ───                                   │
    │                                                         │
    │  ┌─────────────────────────────────────────────────┐   │
    │  │  🔵 Continue with Google                        │   │
    │  └─────────────────────────────────────────────────┘   │
    │  ┌─────────────────────────────────────────────────┐   │
    │  │  ⬛ Continue with GitHub                        │   │
    │  └─────────────────────────────────────────────────┘   │
    │                                                         │
    │  ┌─────────────────────────────────────────────────┐   │
    │  │         Complete Setup & Get License            │   │
    │  └─────────────────────────────────────────────────┘   │
    │                                                         │
    └─────────────────────────────────────────────────────────┘
                              │
                              │ User creates password (or uses SSO)
                              │
                              │ Backend:
                              │   1. Creates Auth0 user (email pre-verified)
                              │   2. Links Auth0 user to Customer record
                              │   3. Generates/retrieves license key
                              │   4. Logs user in automatically
                              │
                              ▼

┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 4: LICENSE DELIVERY (Logged In)                                      │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────┐
    │  hic-ai.com/portal/welcome                              │
    │  ───────────────────────────────────────────────────    │
    │                                                         │
    │  👤 simon@example.com              [Settings] [Logout]  │
    │                                                         │
    │  ───────────────────────────────────────────────────    │
    │                                                         │
    │  🎉 Welcome to Mouse, Simon!                            │
    │                                                         │
    │  Your license key:                                      │
    │  ┌─────────────────────────────────────────────────┐   │
    │  │  MOUSE-A3F9-B2E1-C7D4-8F6A         [Copy 📋]   │   │
    │  └─────────────────────────────────────────────────┘   │
    │                                                         │
    │  We've also emailed this to simon@example.com           │
    │                                                         │
    │  ───────────────────────────────────────────────────    │
    │                                                         │
    │  🚀 Get Started                                         │
    │                                                         │
    │  1. Open VS Code                                        │
    │  2. Go to Extensions (Ctrl+Shift+X)                     │
    │  3. Search "Mouse" and click Install                    │
    │  4. When prompted, enter your license key above         │
    │                                                         │
    │  [Open VS Code]  [Watch Setup Video]  [Read Docs]       │
    │                                                         │
    └─────────────────────────────────────────────────────────┘
```

---

## 3. Account Creation Tie-In Options

Three viable approaches for when to require account creation:

### Option A: After Payment, Before License (Recommended)

```
Stripe Checkout → Welcome Page (create account) → License Delivered
```

**Pros:**

- User already committed (paid)
- Single password field feels trivial after entering credit card
- Guarantees every customer has portal access
- License never delivered to non-account holder

**Cons:**

- One extra step before they can use the product

**Implementation:**

- `success_url` points to `/welcome?session_id={CHECKOUT_SESSION_ID}`
- Welcome page retrieves session, shows account creation form
- License key only revealed after account created

### Option B: During Stripe Checkout (Stripe Limitation)

```
Stripe Checkout (with custom fields) → License Delivered
```

**Pros:**

- Single page for everything

**Cons:**

- Stripe Checkout doesn't support password fields
- Would require Stripe Elements (custom UI) instead of hosted Checkout
- Significantly more development work
- PCI compliance concerns

**Verdict:** Not recommended.

### Option C: After License Delivery (Risky)

```
Stripe Checkout → License Delivered → Optional Account Creation
```

**Pros:**

- Absolute minimum friction

**Cons:**

- User may never create account
- Can't access portal to update payment method
- When card expires, no way to self-service
- Support burden increases

**Verdict:** Avoid.

---

## 4. Recommended Flow: Option A Implementation

### 4.1 Webhook Creates "Pending" Customer

```javascript
// app/api/webhooks/stripe/route.js

case 'checkout.session.completed': {
  const session = event.data.object;

  // Create customer record with PENDING_ACCOUNT status
  await saveCustomer({
    email: session.customer_email,
    stripeCustomerId: session.customer,
    stripeSubscriptionId: session.subscription,
    status: 'PENDING_ACCOUNT',  // Not TRIAL yet
    auth0UserId: null,          // Not created yet
    // License created but key not exposed until account setup
    licenseKey: await createLicense(session.customer_email),
    pendingSessionId: session.id,
    createdAt: new Date().toISOString()
  });

  // DON'T send welcome email yet - wait for account creation
  break;
}
```

### 4.2 Welcome Page Checks Session

```javascript
// app/welcome/page.js

import { redirect } from "next/navigation";

export default async function WelcomePage({ searchParams }) {
  const sessionId = searchParams.session_id;

  if (!sessionId) {
    redirect("/pricing");
  }

  // Verify session and get customer email
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (!session || session.payment_status !== "paid") {
    redirect("/pricing?error=invalid_session");
  }

  // Check if account already created (user refreshed page)
  const customer = await getCustomerByEmail(session.customer_email);
  if (customer?.auth0UserId) {
    redirect("/portal/welcome");
  }

  // Render account creation form with email pre-filled
  return (
    <AccountCreationForm email={session.customer_email} sessionId={sessionId} />
  );
}
```

### 4.3 Account Creation Form

```javascript
// components/AccountCreationForm.js

"use client";

import { useState } from "react";

export default function AccountCreationForm({ email, sessionId }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);

    const res = await fetch("/api/auth/complete-signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, sessionId }),
    });

    if (res.ok) {
      // Redirect to Auth0 login to establish session
      window.location.href = `/api/auth/login?returnTo=/portal/welcome`;
    } else {
      const data = await res.json();
      setError(data.error || "Failed to create account");
      setLoading(false);
    }
  }

  async function handleSocialSignup(provider) {
    // Auth0 social connection with state parameter
    const state = encodeURIComponent(JSON.stringify({ sessionId, email }));
    window.location.href = `/api/auth/login?connection=${provider}&login_hint=${email}&state=${state}`;
  }

  return (
    <div className="max-w-md mx-auto p-8">
      <h1 className="text-2xl font-bold mb-4">🎉 Payment Successful!</h1>
      <p className="mb-6 text-gray-600">
        Create your account to receive your license key and access your portal.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            value={email}
            disabled
            className="w-full p-2 border rounded bg-gray-100"
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">
            Create Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-2 border rounded"
            placeholder="At least 8 characters"
            required
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium mb-1">
            Confirm Password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full p-2 border rounded"
            required
          />
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white p-3 rounded font-medium"
        >
          {loading ? "Creating Account..." : "Complete Setup & Get License"}
        </button>
      </form>

      <div className="my-6 flex items-center">
        <div className="flex-1 border-t"></div>
        <span className="px-4 text-gray-500">OR</span>
        <div className="flex-1 border-t"></div>
      </div>

      <button
        onClick={() => handleSocialSignup("google-oauth2")}
        className="w-full mb-3 p-3 border rounded flex items-center justify-center"
      >
        <img src="/google-icon.svg" className="w-5 h-5 mr-2" />
        Continue with Google
      </button>

      <button
        onClick={() => handleSocialSignup("github")}
        className="w-full p-3 border rounded flex items-center justify-center"
      >
        <img src="/github-icon.svg" className="w-5 h-5 mr-2" />
        Continue with GitHub
      </button>
    </div>
  );
}
```

### 4.4 Complete Signup API

```javascript
// app/api/auth/complete-signup/route.js

import { ManagementClient } from "auth0";

const auth0 = new ManagementClient({
  domain: process.env.AUTH0_ISSUER_BASE_URL.replace("https://", ""),
  clientId: process.env.AUTH0_MANAGEMENT_CLIENT_ID,
  clientSecret: process.env.AUTH0_MANAGEMENT_CLIENT_SECRET,
});

export async function POST(request) {
  const { email, password, sessionId } = await request.json();

  // Verify the session belongs to this email
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (session.customer_email !== email) {
    return Response.json({ error: "Email mismatch" }, { status: 400 });
  }

  // Check customer exists and needs account
  const customer = await getCustomerByEmail(email);
  if (!customer) {
    return Response.json({ error: "Customer not found" }, { status: 404 });
  }
  if (customer.auth0UserId) {
    return Response.json({ error: "Account already exists" }, { status: 400 });
  }

  try {
    // Create Auth0 user
    const auth0User = await auth0.users.create({
      connection: "Username-Password-Authentication",
      email: email,
      password: password,
      email_verified: true, // We trust Stripe verified the email
      app_metadata: {
        stripe_customer_id: customer.stripeCustomerId,
        license_tier: customer.tier || "INDIVIDUAL",
      },
    });

    // Update customer record
    await updateCustomer(email, {
      auth0UserId: auth0User.user_id,
      status: "TRIAL", // Now officially in trial
      accountCreatedAt: new Date().toISOString(),
    });

    // NOW send the welcome email with license key
    await sendWelcomeEmail({
      to: email,
      licenseKey: customer.licenseKey,
      trialEndsAt: customer.trialEndsAt,
    });

    return Response.json({ success: true });
  } catch (err) {
    console.error("Auth0 user creation failed:", err);
    return Response.json(
      { error: "Failed to create account" },
      { status: 500 },
    );
  }
}
```

---

## 5. Portal Navigation (Post-Account)

Once logged in, the portal provides full self-service:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  hic-ai.com/portal                                                          │
│  ───────────────────────────────────────────────────────────────────────    │
│                                                                             │
│  👤 simon@example.com                                    [Settings] [Logout]│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  SIDEBAR                 │  MAIN CONTENT                            │   │
│  │  ───────                 │  ────────────                            │   │
│  │                          │                                          │   │
│  │  📊 Dashboard            │  (varies by section)                     │   │
│  │  🔑 License              │                                          │   │
│  │  💻 Devices              │                                          │   │
│  │  💳 Billing              │                                          │   │
│  │  📄 Invoices             │                                          │   │
│  │  ⚙️  Settings            │                                          │   │
│  │                          │                                          │   │
│  │  ───────                 │                                          │   │
│  │  📚 Documentation        │                                          │   │
│  │  💬 Support              │                                          │   │
│  │                          │                                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.1 Portal Pages

| Route              | Purpose            | Key Actions                               |
| ------------------ | ------------------ | ----------------------------------------- |
| `/portal`          | Dashboard          | Overview, quick stats, trial countdown    |
| `/portal/license`  | License key        | View key, copy, regenerate if compromised |
| `/portal/devices`  | Machine management | View activations, deactivate old devices  |
| `/portal/billing`  | Subscription       | Change plan, update card → Stripe Portal  |
| `/portal/invoices` | Invoice history    | View, download PDF                        |
| `/portal/settings` | Account settings   | Change password, email preferences        |

### 5.2 Billing → Stripe Customer Portal

For payment updates, we redirect to Stripe's hosted Customer Portal:

```javascript
// app/portal/billing/page.js

"use client";

import { useState } from "react";

export default function BillingPage() {
  const [loading, setLoading] = useState(false);

  async function openStripePortal() {
    setLoading(true);
    const res = await fetch("/api/portal/stripe-session", { method: "POST" });
    const { url } = await res.json();
    window.location.href = url;
  }

  return (
    <div>
      <h1>Billing</h1>

      <div className="border p-4 rounded mb-4">
        <h2>Current Plan</h2>
        <p>Mouse Individual - $10/month</p>
        <p>Next billing date: February 21, 2026</p>
      </div>

      <button
        onClick={openStripePortal}
        disabled={loading}
        className="bg-blue-600 text-white px-4 py-2 rounded"
      >
        {loading ? "Loading..." : "Manage Subscription & Payment Method"}
      </button>

      <p className="text-sm text-gray-500 mt-2">
        You'll be redirected to our secure payment portal to update your card,
        change plans, or cancel your subscription.
      </p>
    </div>
  );
}
```

---

## 6. Edge Cases & Recovery Flows

### 6.1 User Abandons Account Creation

**Scenario:** User pays, but closes browser before creating account.

**Solution:**

- Customer record exists with `status: PENDING_ACCOUNT`
- License key stored but not emailed
- Send reminder email after 1 hour: "Complete your setup to get your license"
- Include magic link: `/welcome?session_id=xxx&token=yyy`

```javascript
// Scheduled job (runs every hour)
async function sendAccountCreationReminders() {
  const pendingCustomers = await getPendingAccountCustomers();

  for (const customer of pendingCustomers) {
    const hoursSincePurchase =
      (Date.now() - new Date(customer.createdAt)) / (1000 * 60 * 60);

    if (hoursSincePurchase >= 1 && !customer.reminderSentAt) {
      await sendAccountReminderEmail({
        to: customer.email,
        setupUrl: generateSecureSetupLink(customer),
      });

      await updateCustomer(customer.email, {
        reminderSentAt: new Date().toISOString(),
      });
    }
  }
}
```

### 6.2 User Forgets Password

**Scenario:** User created account, later forgets password.

**Solution:** Standard Auth0 password reset flow.

```
hic-ai.com/login → "Forgot password?" → Auth0 sends reset email
```

### 6.3 User Forgets License Key

**Scenario:** User has account but lost their license key.

**Solution:** Log into portal → License page shows key.

### 6.4 Credit Card Expires

**Scenario:** User's card expires, renewal fails.

**Solution:**

1. Stripe sends `invoice.payment_failed` webhook
2. We set customer `status: PAST_DUE`
3. We send email: "Update your payment method to continue using Mouse"
4. Email links to `/portal/billing` (requires login)
5. User logs in, clicks "Manage Subscription", updates card in Stripe Portal

---

## 7. Page Inventory

Complete list of pages to build:

### Public Pages (No Auth)

| Route          | Purpose                              |
| -------------- | ------------------------------------ |
| `/`            | Landing page                         |
| `/pricing`     | Plan comparison, checkout initiation |
| `/welcome`     | Post-payment account creation        |
| `/login`       | Auth0 login redirect                 |
| `/docs`        | Documentation                        |
| `/docs/[slug]` | Individual doc pages                 |

### Protected Pages (Auth Required)

| Route              | Purpose                         |
| ------------------ | ------------------------------- |
| `/portal`          | Dashboard                       |
| `/portal/welcome`  | First-time welcome with license |
| `/portal/license`  | View/copy license key           |
| `/portal/devices`  | Manage activated machines       |
| `/portal/billing`  | Subscription management         |
| `/portal/invoices` | Invoice history                 |
| `/portal/settings` | Account settings                |

### API Routes

| Route                        | Method | Purpose                               |
| ---------------------------- | ------ | ------------------------------------- |
| `/api/auth/[auth0]`          | GET    | Auth0 SDK handler                     |
| `/api/auth/complete-signup`  | POST   | Create Auth0 user post-payment        |
| `/api/checkout`              | POST   | Create Stripe Checkout session        |
| `/api/webhooks/stripe`       | POST   | Stripe event handler                  |
| `/api/webhooks/keygen`       | POST   | Keygen event handler                  |
| `/api/portal/stripe-session` | POST   | Create Stripe Customer Portal session |
| `/api/license/validate`      | POST   | Extension phone-home                  |
| `/api/license/activate`      | POST   | Extension first activation            |
| `/api/license/recover`       | POST   | "Forgot license key" email            |

---

## 8. Summary

### The Flow

1. **Browse freely** — No account, no tracking
2. **Select plan** — Stored in localStorage
3. **Pay via Stripe** — Email + card collected
4. **Create account** — Password only (email pre-filled)
5. **Receive license** — Immediately displayed + emailed
6. **Self-service forever** — Portal for all management

### Why This Works

| Aspect                         | Benefit                                       |
| ------------------------------ | --------------------------------------------- |
| **No guest sessions**          | Simpler architecture, no server-side tracking |
| **Stripe handles payment UX**  | PCI compliant, trusted, optimized             |
| **Account after payment**      | High completion rate (user already committed) |
| **Every customer has account** | Self-service reduces support burden           |
| **License tied to account**    | Secure delivery, easy recovery                |

### Key Metrics to Track

| Metric                      | Target | Red Flag |
| --------------------------- | ------ | -------- |
| Pricing → Checkout click    | >15%   | <5%      |
| Checkout → Payment complete | >50%   | <30%     |
| Payment → Account created   | >95%   | <80%     |
| Trial → Paid conversion     | >50%   | <30%     |

---

**Recommended Next Action:** Create wireframes for each page in Section 7, then proceed to implementation starting with `/pricing` and `/welcome`.

---

_This memorandum is for internal planning purposes._

## Addendum A: Supplemental User Journeys

**Added:** January 23, 2026  
**Author:** GC  
**Purpose:** Address edge cases and lifecycle events not covered in the main User Journey flows

---

### A.1 Open Source Tier — DEFERRED

**Decision:** The Open Source (free) tier is **removed from MVP scope**.

**Rationale:**

- The Individual tier at $10/month is affordable for OSS contributors
- OSS verification workflow adds significant friction and development complexity
- Better to prove product-market fit with paying customers first
- If demand materializes from students/OSS maintainers, we can add the tier later

**Action Items:**

- Remove OSS tier from pricing page
- Remove `/api/oss-application` endpoint
- Remove OSS-related Keygen.sh policy
- Update documentation to reflect 2-tier structure (Individual / Enterprise)

**Future Consideration:** If Mouse gains traction and we receive significant requests for a free tier, we'll design a streamlined OSS application process at that time.

---

### A.2 Payment Reactivation Journey

**Scenario:** User's payment method fails, they receive dunning emails, and want to restore full access.

**Goal:** User clicks link in dunning email → updates payment → returns to VS Code → Mouse works immediately.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  REACTIVATION FLOW                                                          │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────┐
    │  VS Code: Mouse shows "Payment failed" banner                   │
    │                                                                 │
    │  ⚠️ Your subscription payment failed.                          │
    │  Some features are limited until payment is updated.            │
    │                                                                 │
    │  [Update Payment Method →]                                      │
    │                                                                 │
    └─────────────────────────────────────────────────────────────────┘
                              │
                              │ User clicks link (opens browser)
                              ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │  hic-ai.com/portal/billing?reactivate=true                      │
    │                                                                 │
    │  (If not logged in, redirects to /api/auth/login?returnTo=...)  │
    │                                                                 │
    │  ───────────────────────────────────────────────────────────    │
    │                                                                 │
    │  ⚠️ Payment Issue                                               │
    │                                                                 │
    │  Your last payment on January 15, 2026 failed.                  │
    │  Update your payment method to restore full access.             │
    │                                                                 │
    │  ┌─────────────────────────────────────────────────────────┐   │
    │  │         Update Payment Method                           │   │
    │  └─────────────────────────────────────────────────────────┘   │
    │                                                                 │
    └─────────────────────────────────────────────────────────────────┘
                              │
                              │ Opens Stripe Customer Portal
                              ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │  billing.stripe.com (Customer Portal)                           │
    │                                                                 │
    │  Update your payment method:                                    │
    │  ┌─────────────────────────────────────────────────────────┐   │
    │  │ 4242 4242 4242 4242       12/28    123                  │   │
    │  └─────────────────────────────────────────────────────────┘   │
    │                                                                 │
    │  [Save]                                                         │
    │                                                                 │
    └─────────────────────────────────────────────────────────────────┘
                              │
                              │ Stripe retries failed invoice automatically
                              ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │  BACKEND PROCESSING (Automatic)                                 │
    │                                                                 │
    │  1. Stripe fires `invoice.paid` webhook                         │
    │  2. Our webhook handler:                                        │
    │     • Updates DynamoDB: subscriptionStatus = 'active'           │
    │     • Calls Keygen: keygen.licenses.reinstate(licenseId)        │
    │     • Logs event for audit trail                                │
    │  3. License status now ACTIVE in both systems                   │
    │                                                                 │
    └─────────────────────────────────────────────────────────────────┘
                              │
                              │ User returns to VS Code
                              ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │  VS Code: Mouse Extension                                       │
    │                                                                 │
    │  Next phone-home validation (within 1 hour during grace):       │
    │                                                                 │
    │  1. Extension calls POST /api/license/validate                  │
    │  2. Server returns { valid: true, status: 'ACTIVE', ... }       │
    │  3. Extension updates local cache                               │
    │  4. All features restored, banner disappears                    │
    │                                                                 │
    │  ✅ "Payment successful! Full access restored."                 │
    │                                                                 │
    └─────────────────────────────────────────────────────────────────┘
```

**Key Implementation Details:**

1. **Immediate restoration:** The `invoice.paid` webhook triggers license reinstatement in real-time
2. **Fast phone-home:** During grace period, extension validates every 1 hour (not 24 hours)
3. **Manual refresh option:** Extension should have "Check License Status" command for impatient users
4. **Deep link:** Dunning emails include direct link to `/portal/billing?reactivate=true`

**Webhook Handler Logic:**

```javascript
// When invoice.paid fires after a previous failure
case 'invoice.paid': {
  const invoice = event.data.object;
  const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
  
  // Only process if this was a recovery from past_due
  const customer = await getCustomerByStripeId(invoice.customer);
  if (customer.subscriptionStatus === 'past_due') {
    // Reinstate in Keygen
    await keygen.licenses.reinstate(customer.keygenLicenseId);
    
    // Update DynamoDB
    await updateCustomerSubscription(customer.customerId, {
      subscriptionStatus: 'active',
      graceEndsAt: null,
      reinstatedAt: new Date().toISOString()
    });
    
    // Send confirmation email
    await sendReinstatedEmail({
      to: customer.email,
      nextBillingDate: subscription.current_period_end
    });
  }
  break;
}
```

---

### A.3 License Key Management

**Principle:** License keys are **not stored locally** on the user's machine beyond initial entry. The extension validates against our server on each startup.

#### A.3.1 Where License Keys Are Stored

| Location | What's Stored | Purpose |
|----------|---------------|---------|
| **DynamoDB** | Full license key, status, metadata | Source of truth |
| **Keygen.sh** | License key, validation state | Validation authority |
| **VS Code Settings** | License key (user enters once) | User convenience |
| **VS Code Secrets API** | (Optional) Encrypted key storage | Secure local cache |

#### A.3.2 License Key Entry Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FIRST-TIME LICENSE ACTIVATION                                              │
└─────────────────────────────────────────────────────────────────────────────┘

    User installs Mouse extension
                │
                ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │  VS Code: Mouse Extension (First Run)                           │
    │                                                                 │
    │  🐭 Welcome to Mouse!                                           │
    │                                                                 │
    │  Enter your license key to activate:                            │
    │  ┌─────────────────────────────────────────────────────────┐   │
    │  │ MOUSE-XXXX-XXXX-XXXX-XXXX                               │   │
    │  └─────────────────────────────────────────────────────────┘   │
    │                                                                 │
    │  [Activate]    [Get a License →]                                │
    │                                                                 │
    └─────────────────────────────────────────────────────────────────┘
                │
                │ User enters key, clicks Activate
                ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │  Extension calls POST /api/license/activate                     │
    │                                                                 │
    │  Request:                                                       │
    │  {                                                              │
    │    "licenseKey": "MOUSE-XXXX-XXXX-XXXX-XXXX",                   │
    │    "fingerprint": "fp_abc123",                                  │
    │    "machineName": "MacBook Pro (Work)",                         │
    │    "platform": "darwin",                                        │
    │    "vsCodeVersion": "1.85.0"                                    │
    │  }                                                              │
    │                                                                 │
    └─────────────────────────────────────────────────────────────────┘
                │
                │ Server validates key against DynamoDB + Keygen
                ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │  Validation Logic                                               │
    │                                                                 │
    │  1. Look up LICENSE_KEY#MOUSE-XXXX-... in GSI2                  │
    │  2. Verify status = ACTIVE                                      │
    │  3. Check activations < maxActivations                          │
    │  4. Register machine with Keygen.sh                             │
    │  5. Increment activation count in DynamoDB                      │
    │  6. Return success with feature entitlements                    │
    │                                                                 │
    └─────────────────────────────────────────────────────────────────┘
                │
                ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │  VS Code: Activation Complete                                   │
    │                                                                 │
    │  ✅ License activated successfully!                             │
    │                                                                 │
    │  Device: MacBook Pro (Work)                                     │
    │  Tier: Individual                                               │
    │  Devices: 1 of 3 used                                           │
    │                                                                 │
    │  [Get Started with Mouse →]                                     │
    │                                                                 │
    └─────────────────────────────────────────────────────────────────┘
```

#### A.3.3 License Key Delivery

When a user completes purchase, the license key is delivered via:

1. **On-screen display** (immediate):
   ```
   ┌─────────────────────────────────────────────────────────────────┐
   │  🎉 Your License Key                                            │
   │                                                                 │
   │  ┌───────────────────────────────────────────────────────────┐ │
   │  │  MOUSE-A3F9-B2E1-C7D4-8F6A                    [Copy 📋]   │ │
   │  └───────────────────────────────────────────────────────────┘ │
   │                                                                 │
   │  Quick Activation (paste in terminal):                          │
   │  ┌───────────────────────────────────────────────────────────┐ │
   │  │  npx @hic-ai/mouse activate MOUSE-A3F9-B2E1-C7D4-8F6A    │ │
   │  │                                               [Copy 📋]   │ │
   │  └───────────────────────────────────────────────────────────┘ │
   │                                                                 │
   └─────────────────────────────────────────────────────────────────┘
   ```

2. **Welcome email** (backup):
   - Subject: "Your Mouse License Key"
   - Contains license key in plain text
   - Includes same quick-activation shell command
   - Links to portal for future reference

3. **Portal access** (permanent):
   - `/portal/license` always shows the user's active license key
   - "Forgot your license key?" → just log into the portal

#### A.3.4 Machine Fingerprinting

**Refer to:** [Security Considerations for Keygen Licensing](./20260122_SECURITY_CONSIDERATIONS_FOR_KEYGEN_LICENSING.md)

The fingerprint is generated from:
- VS Code machine ID (`vscode.env.machineId`)
- OS-level identifiers (hashed)
- Designed to be stable across VS Code reinstalls but unique per machine

**Note:** Detailed fingerprinting algorithm is specified in the Keygen security document. If not present, we should research Keygen.sh best practices for machine identification.

---

### A.4 Password Reset Journey

**Flow:** Auth0 handles password reset entirely via Universal Login.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PASSWORD RESET FLOW                                                        │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────┐
    │  hic-ai.com/login                                               │
    │                                                                 │
    │  Redirects to → Auth0 Universal Login                           │
    │                                                                 │
    │  ───────────────────────────────────────────────────────────    │
    │                                                                 │
    │  Log in to HIC AI                                               │
    │                                                                 │
    │  Email                                                          │
    │  ┌─────────────────────────────────────────────────────────┐   │
    │  │ simon@example.com                                       │   │
    │  └─────────────────────────────────────────────────────────┘   │
    │                                                                 │
    │  Password                                                       │
    │  ┌─────────────────────────────────────────────────────────┐   │
    │  │ ••••••••                                                │   │
    │  └─────────────────────────────────────────────────────────┘   │
    │                                                                 │
    │  [Log In]                                                       │
    │                                                                 │
    │  [Forgot password?] ← User clicks this                          │
    │                                                                 │
    └─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │  Auth0: Password Reset Request                                  │
    │                                                                 │
    │  Enter your email to receive a password reset link:             │
    │                                                                 │
    │  Email                                                          │
    │  ┌─────────────────────────────────────────────────────────┐   │
    │  │ simon@example.com                                       │   │
    │  └─────────────────────────────────────────────────────────┘   │
    │                                                                 │
    │  [Send Reset Link]                                              │
    │                                                                 │
    └─────────────────────────────────────────────────────────────────┘
                              │
                              │ Auth0 sends email
                              ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │  Email: "Reset your HIC AI password"                            │
    │                                                                 │
    │  Click the link below to reset your password:                   │
    │                                                                 │
    │  [Reset Password →]                                             │
    │                                                                 │
    │  This link expires in 24 hours.                                 │
    │                                                                 │
    └─────────────────────────────────────────────────────────────────┘
                              │
                              │ User clicks link
                              ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │  Auth0: Set New Password                                        │
    │                                                                 │
    │  Enter your new password:                                       │
    │                                                                 │
    │  New Password                                                   │
    │  ┌─────────────────────────────────────────────────────────┐   │
    │  │ ••••••••••••                                            │   │
    │  └─────────────────────────────────────────────────────────┘   │
    │                                                                 │
    │  Confirm Password                                               │
    │  ┌─────────────────────────────────────────────────────────┐   │
    │  │ ••••••••••••                                            │   │
    │  └─────────────────────────────────────────────────────────┘   │
    │                                                                 │
    │  [Save New Password]                                            │
    │                                                                 │
    └─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │  Success → Redirect to hic-ai.com/portal                        │
    │                                                                 │
    │  ✅ Password updated successfully!                              │
    │                                                                 │
    └─────────────────────────────────────────────────────────────────┘
```

**Implementation:** No custom code required. Auth0 Universal Login handles:
- "Forgot password?" link display
- Reset email sending
- Token validation
- Password update
- Session establishment after reset

**Configuration:** In Auth0 Dashboard → Branding → Email Templates → customize "Change Password" email with HIC AI branding.

---

### A.5 Upgrade / Downgrade Journeys

**Core Principle:** Individual and Enterprise licenses are **separate products**. You cannot upgrade an Individual license to Enterprise or vice versa.

#### A.5.1 Individual → Enterprise (New Purchase)

**Scenario:** Solo developer joins a team and needs an Enterprise license.

**Flow:**
1. User purchases new Enterprise license (or receives invite from Enterprise admin)
2. User's old Individual license continues until it expires or is cancelled
3. User cancels Individual subscription via Stripe Customer Portal
4. User now has only Enterprise license

**No automatic migration.** User manages two subscriptions briefly, then cancels one.

#### A.5.2 Enterprise → Individual (New Purchase)

**Scenario:** User leaves company, wants personal license.

**Flow:**
1. Enterprise admin revokes user's Enterprise license (see A.7)
2. User purchases new Individual license at hic-ai.com
3. User enters new license key in Mouse extension

#### A.5.3 Enterprise Seat Reduction (Downgrade)

**Scenario:** Enterprise reduces team size, needs fewer seats.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ENTERPRISE SEAT REDUCTION                                                  │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────┐
    │  hic-ai.com/admin/team                                          │
    │                                                                 │
    │  Team Members (10 seats)                                        │
    │                                                                 │
    │  ┌─────────────────────────────────────────────────────────┐   │
    │  │ ☑️ alice@acme.com      Active    [Revoke]               │   │
    │  │ ☑️ bob@acme.com        Active    [Revoke]               │   │
    │  │ ☑️ carol@acme.com      Active    [Revoke]               │   │
    │  │ ☑️ dave@acme.com       Active    [Revoke]               │   │
    │  │ ☐ eve@acme.com         Active    [Revoke] ← To remove   │   │
    │  │ ☐ frank@acme.com       Active    [Revoke] ← To remove   │   │
    │  │ ... 4 more                                               │   │
    │  └─────────────────────────────────────────────────────────┘   │
    │                                                                 │
    │  ───────────────────────────────────────────────────────────    │
    │                                                                 │
    │  Seat Adjustment                                                │
    │                                                                 │
    │  Current seats: 10                                              │
    │  New seat count: [8 ▼]                                          │
    │                                                                 │
    │  ⚠️ You must revoke 2 licenses before reducing seats.           │
    │     Selected for revocation: eve@acme.com, frank@acme.com       │
    │                                                                 │
    │  Effective: Next billing cycle (March 31, 2026)                 │
    │  New monthly charge: $200.00 (was $250.00)                      │
    │                                                                 │
    │  [Save Changes]                                                 │
    │                                                                 │
    └─────────────────────────────────────────────────────────────────┘
```

**Business Rules:**

1. **Admin selects licenses to retire** before reducing seats
2. **Takes effect next billing cycle** — users keep access until then
3. **Minimum 5 seats** for Enterprise tier
4. **No proration for reduction** — pay full month, reduce next month

**Timeline Example:**
- Jan 31: Enterprise buys 10 seats ($250/month)
- Feb 28: Charged $250 for February
- Mar 1: Admin reduces to 5 seats, selects 5 licenses to retire
- Mar 31: Charged $125 for March (5 seats)
- Mar 31: Retired licenses become EXPIRED status

**Retired License Behavior:**

```javascript
// When user with retired license tries to use Mouse
{
  "valid": false,
  "status": "RETIRED",
  "message": "Your license has been retired by your organization's administrator. Please contact your Enterprise admin or purchase an Individual license.",
  "features": [],
  "purchaseUrl": "https://hic-ai.com/pricing"
}
```

#### A.5.4 Enterprise Seat Addition (Upgrade)

**Scenario:** Enterprise needs more seats mid-cycle.

**Flow:**
1. Admin goes to `/admin/billing`
2. Clicks "Add Seats"
3. Stripe prorates charge for remainder of billing period
4. New seats immediately available for assignment

```javascript
// POST /api/admin/seats
{
  "additionalSeats": 5
}

// Response
{
  "success": true,
  "newSeatCount": 15,
  "proratedCharge": 62.50,  // 5 seats × $12.50 (half month remaining)
  "nextFullCharge": 375.00  // 15 × $25
}
```

---

### A.6 Refund & Dispute Handling

**Policy:** No refunds except in cases of verified credit card fraud.

#### A.6.1 Refund Policy

| Scenario | Refund? | Action |
|----------|---------|--------|
| "Changed my mind" | ❌ No | Offer to cancel (access until period end) |
| "Didn't work for me" | ❌ No | Offer support, troubleshooting |
| "Charged by mistake" | ❌ No | Verify usage; if truly unused, consider |
| "Credit card stolen" | ✅ Yes | Full refund, revoke license immediately |
| Duplicate charge (our error) | ✅ Yes | Refund duplicate |

**Rationale:** Digital goods cannot be returned. User downloaded and potentially used the software.

#### A.6.2 Dispute (Chargeback) Handling

**Stripe handles disputes automatically.** Our responsibilities:

1. **Receive webhook:** `charge.dispute.created`
2. **Gather evidence:** 
   - Customer email verification
   - Activation/usage logs from DynamoDB
   - Terms of Service acceptance
3. **Submit via Stripe Dashboard** (or API)
4. **Suspend license** during dispute

```javascript
// Webhook handler
case 'charge.dispute.created': {
  const dispute = event.data.object;
  
  // Suspend the license immediately
  const customer = await getCustomerByStripeId(dispute.customer);
  await keygen.licenses.suspend(customer.keygenLicenseId);
  
  await updateCustomerStatus(customer.customerId, {
    status: 'DISPUTED',
    disputeId: dispute.id,
    suspendedAt: new Date().toISOString()
  });
  
  // Alert support team
  await sendInternalAlert({
    type: 'DISPUTE',
    customer: customer.email,
    amount: dispute.amount,
    reason: dispute.reason
  });
  
  break;
}

case 'charge.dispute.closed': {
  const dispute = event.data.object;
  const customer = await getCustomerByStripeId(dispute.customer);
  
  if (dispute.status === 'won') {
    // We won - reinstate license
    await keygen.licenses.reinstate(customer.keygenLicenseId);
    await updateCustomerStatus(customer.customerId, { status: 'active' });
  } else {
    // We lost - keep license suspended, mark as churned
    await updateCustomerStatus(customer.customerId, { 
      status: 'CHARGEBACK_LOST',
      churnedAt: new Date().toISOString()
    });
  }
  break;
}
```

#### A.6.3 Fraud Refund Process

If support verifies credit card fraud:

1. Process full refund via Stripe Dashboard
2. Revoke license immediately
3. Document in customer record
4. No further action (victim isn't our customer)

---

### A.7 License Transfer Journey (Enterprise)

**Scenario:** Enterprise admin reassigns a license from one user to another.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  LICENSE TRANSFER FLOW                                                      │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────┐
    │  hic-ai.com/admin/team                                          │
    │                                                                 │
    │  Team Members                                                   │
    │                                                                 │
    │  ┌─────────────────────────────────────────────────────────┐   │
    │  │ alice@acme.com      License: MOUSE-A1B2...    [Revoke]  │   │
    │  │ bob@acme.com        License: MOUSE-C3D4...    [Revoke]  │   │
    │  │ eve@acme.com        License: MOUSE-E5F6...    [Revoke] ←│   │
    │  └─────────────────────────────────────────────────────────┘   │
    │                                                                 │
    │  Admin clicks [Revoke] on Eve's license                         │
    │                                                                 │
    └─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │  Confirmation Modal                                             │
    │                                                                 │
    │  Revoke license for eve@acme.com?                               │
    │                                                                 │
    │  • Eve will lose access to Mouse immediately                    │
    │  • Her device activations will be deactivated                   │
    │  • This seat can be reassigned to another user                  │
    │                                                                 │
    │  [Cancel]  [Revoke License]                                     │
    │                                                                 │
    └─────────────────────────────────────────────────────────────────┘
                              │
                              │ Admin confirms
                              ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │  Backend Processing                                             │
    │                                                                 │
    │  1. Update LICENSE record: status = 'REVOKED'                   │
    │  2. Update ORG_MEMBER record: status = 'REVOKED'                │
    │  3. Call Keygen: keygen.licenses.revoke(licenseId)              │
    │  4. Send email to Eve: "Your Mouse license has been revoked"    │
    │  5. Seat now available for reassignment                         │
    │                                                                 │
    └─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │  Eve's Next Mouse Session                                       │
    │                                                                 │
    │  ⛔ License Revoked                                             │
    │                                                                 │
    │  Your organization has revoked your Mouse license.              │
    │  Contact your administrator or purchase an Individual license.  │
    │                                                                 │
    │  [Contact Admin]  [Get Individual License →]                    │
    │                                                                 │
    └─────────────────────────────────────────────────────────────────┘
                              │
                              │ Meanwhile, Admin invites new user
                              ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │  Admin: Invite New Member                                       │
    │                                                                 │
    │  Email: [frank@acme.com                              ]          │
    │                                                                 │
    │  [Send Invite]                                                  │
    │                                                                 │
    └─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │  Frank receives invite email                                    │
    │                                                                 │
    │  "You've been invited to use Mouse at Acme Corp"                │
    │                                                                 │
    │  [Accept Invitation →]                                          │
    │                                                                 │
    └─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │  Frank creates account, receives license key                    │
    │  (Same flow as Enterprise member onboarding)                    │
    └─────────────────────────────────────────────────────────────────┘
```

**Key Points:**

- **Immediate revocation:** Eve loses access on next validation (within 1 hour)
- **No transition period:** Transfer is atomic — revoke then invite
- **Device cleanup:** Eve's machine activations are invalidated
- **Clear messaging:** Eve knows it was an admin action, not a bug

---

### A.8 Multi-License Users

**Policy:** One email address = one license. No unified login across personal/work accounts.

#### A.8.1 Supported Scenario

| Personal Email | Work Email | Licenses |
|----------------|------------|----------|
| simon@gmail.com | simon@acme.com | 2 separate accounts |

- **simon@gmail.com:** Individual license, personal portal
- **simon@acme.com:** Enterprise license (via Acme), Acme's admin portal

#### A.8.2 User Experience

- User logs in with personal email → sees Individual license
- User logs in with work email → sees Enterprise license
- Different sessions, different cookies, different everything

#### A.8.3 In VS Code

User can only have ONE license active per VS Code installation:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Mouse Settings (VS Code)                                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  License Key: [MOUSE-XXXX-XXXX-XXXX-XXXX                          ]        │
│                                                                             │
│  Status: ✅ Active (Individual)                                             │
│  Email: simon@gmail.com                                                     │
│                                                                             │
│  To switch licenses, enter a different key above.                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

To use work license instead, user simply enters their work license key. The extension validates the new key and switches.

#### A.8.4 Future Consideration

If users frequently request unified login:
- Implement Auth0 account linking
- Allow multiple licenses per Auth0 identity
- Add license selector in extension

**For MVP:** Separate accounts. Simplicity wins.

---

### A.9 Cancellation Journey

**Flow:** User cancels subscription → confirmation → access until period end → win-back attempts

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CANCELLATION FLOW                                                          │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────┐
    │  hic-ai.com/portal/billing                                      │
    │                                                                 │
    │  [Manage Subscription →] (Opens Stripe Customer Portal)         │
    │                                                                 │
    └─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │  Stripe Customer Portal                                         │
    │                                                                 │
    │  Mouse Individual - $10/month                                   │
    │  Next billing: February 21, 2026                                │
    │                                                                 │
    │  [Update payment method]                                        │
    │  [Cancel subscription] ← User clicks                            │
    │                                                                 │
    └─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │  Stripe: Cancellation Confirmation                              │
    │                                                                 │
    │  Are you sure you want to cancel?                               │
    │                                                                 │
    │  • You'll retain access until February 21, 2026                 │
    │  • After that, your license will expire                         │
    │  • You can resubscribe anytime                                  │
    │                                                                 │
    │  [Keep Subscription]  [Cancel Subscription]                     │
    │                                                                 │
    └─────────────────────────────────────────────────────────────────┘
                              │
                              │ User confirms cancellation
                              ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │  Webhook: customer.subscription.updated                         │
    │  (cancel_at_period_end = true)                                  │
    │                                                                 │
    │  1. Update DynamoDB: cancelAtPeriodEnd = true                   │
    │  2. Send cancellation confirmation email                        │
    │  3. Schedule win-back emails                                    │
    │                                                                 │
    └─────────────────────────────────────────────────────────────────┘
```

#### A.9.1 Cancellation Confirmation Email

**Sent immediately after cancellation:**

```
Subject: We're sorry to see you go

Hi Simon,

Your Mouse subscription has been cancelled.

What happens next:
• You'll have full access until February 21, 2026
• After that, your license will expire
• Your account and data will be preserved

Changed your mind? You can reactivate anytime:
[Reactivate Subscription →]

If something wasn't working right, we'd love to hear about it:
[Share Feedback →]

Thanks for trying Mouse.

—The HIC AI Team
```

#### A.9.2 Win-Back Email Sequence

| Day | Email | Content |
|-----|-------|---------|
| 30 | "We miss you" | Feature highlights, "What's new" |
| 90 | "Special offer" | 20% off if they return (optional coupon) |

**Win-back emails are optional for MVP** but good to have scheduled.

#### A.9.3 Data Retention

**Policy:** Customer data is retained indefinitely.

| Data | Retention | Purpose |
|------|-----------|---------|
| Customer record | Forever | Re-subscription, support history |
| Subscription history | Forever | Billing records, audit |
| License records | Forever | Audit trail |
| Usage telemetry | 2 years | Analytics, then aggregate |
| Device activations | Until cancelled + 90 days | Then purge |

**If user returns in 10 years:**
- Same email → same customer record
- Previous purchase history visible
- New subscription created, new license issued
- "Welcome back!" instead of "Welcome!"

#### A.9.4 Reactivation After Cancellation

User can reactivate before period ends:

```javascript
// Stripe Customer Portal handles this
// User clicks "Reactivate" → Stripe sets cancel_at_period_end = false

// Webhook: customer.subscription.updated
if (subscription.cancel_at_period_end === false && customer.cancelAtPeriodEnd === true) {
  // User reactivated!
  await updateCustomerSubscription(customerId, {
    cancelAtPeriodEnd: false,
    reactivatedAt: new Date().toISOString()
  });
  
  await sendReactivationEmail(customer.email);
}
```

User can also resubscribe after expiration:
1. Go to hic-ai.com/pricing
2. Purchase new subscription
3. Same customer record, new subscription + license

---

### A.10 Page Inventory Update

Based on the supplemental journeys, update the page inventory:

#### Removed Pages (OSS Deferred)

| Route | Status |
|-------|--------|
| `/oss-apply` | ❌ Removed |
| `/api/oss-application` | ❌ Removed |

#### Updated Pages

| Route | Updates |
|-------|---------|
| `/pricing` | Remove OSS tier, show only Individual + Enterprise |
| `/portal/billing` | Add `?reactivate=true` handling for payment recovery |
| `/admin/team` | Add seat reduction workflow, license revocation |
| `/admin/billing` | Add seat addition (proration display) |

---

### A.11 Summary of Decisions

| Topic | Decision |
|-------|----------|
| **OSS Tier** | Deferred to post-MVP |
| **Reactivation** | Via Stripe Portal, instant on `invoice.paid` webhook |
| **License Storage** | Server-side validation, key entered once in VS Code |
| **Password Reset** | Auth0 handles entirely |
| **Upgrade/Downgrade** | Separate products; cancel old, buy new |
| **Enterprise Seat Reduction** | Admin selects licenses to retire, effective next billing cycle |
| **Refunds** | No refunds except fraud; minimal dispute handling |
| **Multi-License Users** | Separate accounts per email |
| **License Transfer** | Immediate revocation, new user invited |
| **Cancellation** | Access until period end, data retained forever, win-back at 30/90 days |

---

_End of Addendum A_

