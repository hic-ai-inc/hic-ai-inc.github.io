# MEMORANDUM

**TO:** Simon Reiff, President & Technical Founder  
**FROM:** GC  
**DATE:** January 21, 2026  
**RE:** User Journey Design — Guest Checkout with Account Creation Tie-In

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
    │  │  Individual   │  │     Team      │  │ Enterprise  │ │
    │  │  $20/month    │  │  $25/seat/mo  │  │ Contact Us  │ │
    │  │               │  │               │  │             │ │
    │  │  • 1 user     │  │  • 2-100 seats│  │ • Unlimited │ │
    │  │  • 3 devices  │  │  • 2 dev/seat │  │ • SSO/SAML  │ │
    │  │  • All tools  │  │  • All tools  │  │ • SLA       │ │
    │  │               │  │               │  │             │ │
    │  │ [Start Trial] │  │ Seats: [5 ▼]  │  │ [Contact]   │ │
    │  └───────────────┘  │ [Start Trial] │  └─────────────┘ │
    │                     └───────────────┘                   │
    │                                                         │
    │  Promo code? [LAUNCH50    ] [Apply ✓]                   │
    │  "50% off applied! You'll pay $10/month"                │
    │                                                         │
    └─────────────────────────────────────────────────────────┘
                              │
                              │ User clicks "Start Trial"
                              │
                              │ Client-side: localStorage.setItem('cart', {
                              │   plan: 'individual',
                              │   seats: 1,
                              │   promo: 'LAUNCH50'
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
    │  14-day free trial, then $10.00/month                   │
    │  (50% off with LAUNCH50)                                │
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
        <p>Mouse Individual - $20/month</p>
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
