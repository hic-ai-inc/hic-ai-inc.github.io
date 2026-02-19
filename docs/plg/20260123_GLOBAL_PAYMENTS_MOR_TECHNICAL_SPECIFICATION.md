# Global Payments & Merchant of Record Technical Specification

**Date:** January 23, 2026  
**Author:** GitHub Copilot  
**Status:** Ready for Implementation

---

## Executive Summary

This document provides a technical specification for implementing global payment processing using a **Merchant of Record (MoR)** solution instead of Stripe. The recommendation is to use **Lemon Squeezy** or **Paddle** to handle all sales globally, eliminating the need for HIC AI to register for VAT in multiple countries or navigate US state sales tax complexity.

**Key Recommendation:** Use **Lemon Squeezy** as the sole payment processor for all sales worldwide.

**Why:** As a Merchant of Record, Lemon Squeezy becomes the legal seller. They handle VAT collection, US state sales tax, invoicing, refunds, and compliance—HIC AI simply receives net payouts.

---

## Table of Contents

1. [The Problem with Stripe Alone](#1-the-problem-with-stripe-alone)
2. [Merchant of Record Explained](#2-merchant-of-record-explained)
3. [Platform Comparison](#3-platform-comparison)
4. [Recommendation: Lemon Squeezy](#4-recommendation-lemon-squeezy)
5. [Technical Migration from Stripe](#5-technical-migration-from-stripe)
6. [API & SDK Comparison](#6-api--sdk-comparison)
7. [Code Migration Examples](#7-code-migration-examples)
8. [Webhook Implementation](#8-webhook-implementation)
9. [License Key Integration](#9-license-key-integration)
10. [Checkout Flow Implementation](#10-checkout-flow-implementation)
11. [Implementation Checklist](#11-implementation-checklist)
12. [Timeline & Effort Estimate](#12-timeline--effort-estimate)

---

## 1. The Problem with Stripe Alone

### What Stripe Does

- Processes credit card payments
- Handles PCI compliance for card data
- Provides subscription management (Stripe Billing)
- Offers fraud detection

### What Stripe Does NOT Do

- **Collect or remit VAT/GST** - You must register, collect, file, and pay
- **Handle US state sales tax** - You must track nexus, register, collect, file
- **Issue tax-compliant invoices** - You must generate them yourself
- **Act as reseller** - You are the legal seller of record

### The Tax Burden

#### EU VAT

- **27 different VAT rates** (one per EU country)
- Must register for VAT in each country where you exceed threshold (~€10K)
- Or register for **VAT OSS (One-Stop Shop)** and file quarterly
- Must issue VAT-compliant invoices with specific fields
- Must validate customer location (2+ data points)

#### US State Sales Tax (Post-Wayfair)

- **45 states + DC** have sales tax on digital products
- **Economic nexus** thresholds vary by state ($100K revenue or 200 transactions typically)
- Must register in each state where nexus is triggered
- Must collect correct rate (state + county + city + special district)
- Must file returns (monthly, quarterly, or annually depending on state)
- **SaaS taxability varies by state** - some tax it, some don't

#### Other Jurisdictions

- **UK:** 20% VAT, separate from EU post-Brexit
- **Canada:** GST/HST varies by province (5-15%)
- **Australia:** 10% GST
- **India:** 18% GST
- **Japan:** 10% consumption tax
- **Brazil:** Complex multi-layer tax system

### The Nightmare Scenario

If HIC AI uses Stripe alone and sells globally:

1. Customer in Germany buys license → Must charge 19% VAT
2. Customer in France buys license → Must charge 20% VAT
3. Customer in Texas buys license → Must charge ~8.25% sales tax
4. Customer in California buys license → SaaS may be exempt (but must verify)
5. Must register with German, French tax authorities
6. Must register in Texas, potentially California
7. Must file quarterly VAT returns in EU
8. Must file monthly/quarterly sales tax returns per US state
9. Must track nexus thresholds in all 45 US states
10. Must generate compliant invoices for each jurisdiction

**This is operationally untenable for a startup.**

---

## 2. Merchant of Record Explained

### What is a Merchant of Record?

A **Merchant of Record (MoR)** is a legal entity that:

- Acts as the **seller** to the end customer
- Processes payments on their own merchant account
- Handles **all tax compliance** (collection, remittance, reporting)
- Issues invoices in their name
- Handles refunds and chargebacks
- Pays you (the vendor) your share minus fees

### How It Works

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
│  Customer   │────▶│  Lemon Squeezy  │────▶│   HIC AI    │
│  (Buyer)    │     │  (Seller/MoR)   │     │  (Vendor)   │
└─────────────┘     └─────────────────┘     └─────────────┘
      │                     │                      │
      │ Pays $15 + tax      │ Handles VAT/Sales    │ Receives $15
      │                     │ tax, invoicing       │ minus fees
      │                     │                      │
      ▼                     ▼                      ▼
   Invoice from         Files taxes            Delivers
   Lemon Squeezy        in all regions         license key
```

### Legal Relationship

| Aspect                   | With Stripe | With MoR (Lemon Squeezy)  |
| ------------------------ | ----------- | ------------------------- |
| **Seller to customer**   | HIC AI Inc. | Lemon Squeezy Ltd         |
| **Tax liability**        | HIC AI Inc. | Lemon Squeezy Ltd         |
| **Invoice issuer**       | HIC AI Inc. | Lemon Squeezy Ltd         |
| **Chargeback liability** | HIC AI Inc. | Lemon Squeezy Ltd         |
| **Refund processor**     | HIC AI Inc. | Lemon Squeezy Ltd         |
| **Payment received by**  | HIC AI Inc. | Lemon Squeezy Ltd         |
| **Payout to vendor**     | N/A         | HIC AI Inc. (net of fees) |

### Benefits of MoR

1. **Zero tax compliance burden** - MoR handles everything
2. **Global sales from day one** - No need to register anywhere
3. **Automatic tax calculation** - Correct rates applied automatically
4. **Tax-compliant invoices** - Issued by MoR with all required fields
5. **Reduced chargeback risk** - MoR handles disputes
6. **Simplified accounting** - You receive net payouts, record as revenue

---

## 3. Platform Comparison

### Overview

| Feature              | Stripe              | Paddle           | Lemon Squeezy  |
| -------------------- | ------------------- | ---------------- | -------------- |
| **Type**             | Payment Processor   | MoR              | MoR            |
| **You are seller?**  | Yes                 | No               | No             |
| **Tax handling**     | Manual              | Automatic        | Automatic      |
| **VAT compliance**   | Your responsibility | Included         | Included       |
| **US sales tax**     | Your responsibility | Included         | Included       |
| **Base fee**         | 2.9% + $0.30        | 5% + $0.50       | 5% + $0.50     |
| **Subscription fee** | +0.5% for Billing   | Included         | Included       |
| **Effective rate**   | ~3.4% + tax burden  | 5% + $0.50       | 5% + $0.50     |
| **Payout frequency** | 2-day rolling       | Monthly (NET 15) | Weekly/Monthly |
| **Founded**          | 2010                | 2012             | 2021           |
| **Target market**    | General             | SaaS, software   | Creators, SaaS |

### Detailed Comparison: Paddle vs Lemon Squeezy

| Feature                       | Paddle                | Lemon Squeezy              |
| ----------------------------- | --------------------- | -------------------------- |
| **Pricing**                   | 5% + $0.50            | 5% + $0.50                 |
| **License key generation**    | Yes (built-in)        | Yes (built-in)             |
| **Subscription management**   | Yes                   | Yes                        |
| **Dunning (failed payments)** | Yes                   | Yes                        |
| **Checkout customization**    | Overlay or embed      | Overlay or embed           |
| **API quality**               | Mature, comprehensive | Modern, developer-friendly |
| **Webhook reliability**       | Good                  | Good                       |
| **Dashboard UX**              | Functional            | Modern, clean              |
| **Affiliate program**         | Yes                   | Yes                        |
| **Customer portal**           | Yes                   | Yes                        |
| **Approval process**          | Strict (weeks)        | Faster (days)              |
| **Documentation**             | Good                  | Excellent                  |
| **SDK (JavaScript)**          | Paddle.js             | Lemon.js                   |
| **SDK (Node.js)**             | Community             | Official                   |

### Why Lemon Squeezy Over Paddle

1. **Faster approval** - Paddle has stricter vetting (can take weeks)
2. **Better DX** - Modern API design, excellent docs, official SDKs
3. **Simpler dashboard** - More intuitive for solo/small teams
4. **Better for indie/startup** - Paddle historically favors larger vendors
5. **More flexible payouts** - Weekly option available
6. **License key system** - Built specifically for software licensing

### Other Alternatives

| Platform                 | Notes                                        |
| ------------------------ | -------------------------------------------- |
| **Gumroad**              | MoR, but higher fees (10%), less API control |
| **FastSpring**           | MoR, enterprise-focused, complex pricing     |
| **Chargebee**            | Not MoR, but good subscription management    |
| **Recurly**              | Not MoR, subscription-focused                |
| **2Checkout (Verifone)** | MoR option, but dated UX                     |

---

## 4. Recommendation: Lemon Squeezy

### Why Lemon Squeezy

1. **Modern, developer-friendly platform** built for software products
2. **Built-in license key system** - perfect for VS Code extension licensing
3. **5% + $0.50 fee** includes all tax handling (effective cost similar to Stripe + tax compliance)
4. **Fast approval process** - can be selling within days
5. **Excellent documentation** and official SDKs
6. **Weekly payouts available** - better cash flow than Paddle's monthly
7. **Growing platform** with active development

### Fee Comparison (Real Cost)

#### Stripe (False Economy)

| Item                                      | Cost                           |
| ----------------------------------------- | ------------------------------ |
| Stripe fee                                | 2.9% + $0.30                   |
| Stripe Billing                            | +0.5%                          |
| Tax compliance software (TaxJar, Avalara) | $50-200/mo                     |
| VAT registration & filing (accountant)    | $100-500/mo                    |
| US sales tax filing (accountant)          | $50-200/mo                     |
| Time spent on compliance                  | Priceless (bad)                |
| **Effective cost**                        | **~10-15% + significant time** |

#### Lemon Squeezy (True Cost)

| Item               | Cost           |
| ------------------ | -------------- |
| Lemon Squeezy fee  | 5% + $0.50     |
| Tax compliance     | Included       |
| Invoicing          | Included       |
| License keys       | Included       |
| **Effective cost** | **5% + $0.50** |

### Account Setup

1. Go to https://lemonsqueezy.com
2. Sign up with email
3. Complete business verification (EIN, address)
4. Connect payout method (bank account or PayPal)
5. Create your Store
6. Create Products (Individual, Enterprise plans)
7. Set up webhooks for license delivery
8. Integrate checkout

---

## 5. Technical Migration from Stripe

### Current Stripe Integration Points

Based on typical Stripe integration patterns, you likely have:

| Component           | Stripe Implementation      | Needs Migration   |
| ------------------- | -------------------------- | ----------------- |
| **Checkout**        | Stripe Checkout / Elements | Yes               |
| **Subscriptions**   | Stripe Billing             | Yes               |
| **Customer portal** | Stripe Customer Portal     | Yes               |
| **Webhooks**        | Stripe webhook events      | Yes               |
| **API calls**       | `stripe` npm package       | Yes               |
| **License keys**    | Custom implementation      | Integrate with LS |
| **Pricing display** | Hardcoded or Stripe Prices | Update            |

### Migration Strategy

#### Phase 1: Account Setup (Day 1)

- Create Lemon Squeezy account
- Complete business verification
- Create store and products

#### Phase 2: Product Configuration (Day 1-2)

- Create Individual Monthly product ($15/mo)
- Create Individual Annual product ($150/yr)
- Create Enterprise product ($25/seat/mo)
- Configure license key generation
- Set up webhooks

#### Phase 3: Code Migration (Day 2-5)

- Remove Stripe SDK
- Add Lemon Squeezy SDK
- Update checkout flow
- Update webhook handlers
- Update license validation
- Update customer portal links

#### Phase 4: Testing (Day 5-7)

- Test checkout flow
- Test subscription lifecycle
- Test webhook handling
- Test license key delivery
- Test customer portal

#### Phase 5: Go Live (Day 7)

- Update production environment variables
- Deploy changes
- Monitor for issues

---

## 6. API & SDK Comparison

### Stripe SDK

```bash
npm install stripe
```

```javascript
// Stripe initialization
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Create checkout session
const session = await stripe.checkout.sessions.create({
  mode: "subscription",
  line_items: [
    {
      price: "price_xxxxx",
      quantity: 1,
    },
  ],
  success_url: "https://hic-ai.com/success",
  cancel_url: "https://hic-ai.com/cancel",
});
```

### Lemon Squeezy SDK

```bash
npm install @lemonsqueezy/lemonsqueezy.js
```

```javascript
// Lemon Squeezy initialization
import {
  lemonSqueezySetup,
  createCheckout,
} from "@lemonsqueezy/lemonsqueezy.js";

lemonSqueezySetup({ apiKey: process.env.LEMONSQUEEZY_API_KEY });

// Create checkout session
const checkout = await createCheckout(storeId, variantId, {
  checkoutData: {
    email: customer.email,
    custom: {
      user_id: customer.id,
    },
  },
  productOptions: {
    redirectUrl: "https://hic-ai.com/success",
  },
});
```

### Key API Differences

| Operation                | Stripe                              | Lemon Squeezy          |
| ------------------------ | ----------------------------------- | ---------------------- |
| **Create checkout**      | `stripe.checkout.sessions.create()` | `createCheckout()`     |
| **Get subscription**     | `stripe.subscriptions.retrieve()`   | `getSubscription()`    |
| **Cancel subscription**  | `stripe.subscriptions.cancel()`     | `cancelSubscription()` |
| **Get customer**         | `stripe.customers.retrieve()`       | `getCustomer()`        |
| **List invoices**        | `stripe.invoices.list()`            | N/A (MoR handles)      |
| **Create price**         | `stripe.prices.create()`            | Dashboard only         |
| **Webhook verification** | `stripe.webhooks.constructEvent()`  | Manual signature check |

### Webhook Events Comparison

| Stripe Event                    | Lemon Squeezy Event            |
| ------------------------------- | ------------------------------ |
| `checkout.session.completed`    | `order_created`                |
| `customer.subscription.created` | `subscription_created`         |
| `customer.subscription.updated` | `subscription_updated`         |
| `customer.subscription.deleted` | `subscription_cancelled`       |
| `invoice.paid`                  | `subscription_payment_success` |
| `invoice.payment_failed`        | `subscription_payment_failed`  |
| `customer.created`              | (included in order_created)    |

---

## 7. Code Migration Examples

### 7.1 Environment Variables

#### Before (Stripe)

```env
STRIPE_SECRET_KEY=sk_live_xxxxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
STRIPE_PRICE_INDIVIDUAL_MONTHLY=price_xxxxx
STRIPE_PRICE_INDIVIDUAL_ANNUAL=price_xxxxx
STRIPE_PRICE_ENTERPRISE=price_xxxxx
```

#### After (Lemon Squeezy)

```env
LEMONSQUEEZY_API_KEY=xxxxx
LEMONSQUEEZY_STORE_ID=xxxxx
LEMONSQUEEZY_WEBHOOK_SECRET=xxxxx
LEMONSQUEEZY_VARIANT_INDIVIDUAL_MONTHLY=xxxxx
LEMONSQUEEZY_VARIANT_INDIVIDUAL_ANNUAL=xxxxx
LEMONSQUEEZY_VARIANT_ENTERPRISE=xxxxx
```

### 7.2 Checkout Button Component

#### Before (Stripe)

```javascript
// components/CheckoutButton.js (Stripe)
"use client";

import { useState } from "react";

export default function CheckoutButton({ priceId, children }) {
  const [loading, setLoading] = useState(false);

  const handleCheckout = async () => {
    setLoading(true);

    const response = await fetch("/api/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priceId }),
    });

    const { url } = await response.json();
    window.location.href = url;
  };

  return (
    <button onClick={handleCheckout} disabled={loading}>
      {loading ? "Loading..." : children}
    </button>
  );
}
```

#### After (Lemon Squeezy)

```javascript
// components/CheckoutButton.js (Lemon Squeezy)
"use client";

import { useState } from "react";

export default function CheckoutButton({ variantId, children }) {
  const [loading, setLoading] = useState(false);

  const handleCheckout = async () => {
    setLoading(true);

    const response = await fetch("/api/create-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variantId }),
    });

    const { url } = await response.json();
    window.location.href = url;
  };

  return (
    <button onClick={handleCheckout} disabled={loading}>
      {loading ? "Loading..." : children}
    </button>
  );
}
```

### 7.3 Checkout API Route

#### Before (Stripe)

```javascript
// app/api/create-checkout-session/route.js (Stripe)
import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(request) {
  const { priceId, customerEmail } = await request.json();

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: customerEmail,
      success_url: `${process.env.NEXT_PUBLIC_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_URL}/pricing`,
      metadata: {
        source: "plg_website",
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

#### After (Lemon Squeezy)

```javascript
// app/api/create-checkout/route.js (Lemon Squeezy)
import { NextResponse } from "next/server";
import {
  lemonSqueezySetup,
  createCheckout,
} from "@lemonsqueezy/lemonsqueezy.js";

lemonSqueezySetup({ apiKey: process.env.LEMONSQUEEZY_API_KEY });

const storeId = process.env.LEMONSQUEEZY_STORE_ID;

export async function POST(request) {
  const { variantId, customerEmail } = await request.json();

  try {
    const checkout = await createCheckout(storeId, variantId, {
      checkoutData: {
        email: customerEmail || undefined,
        custom: {
          source: "plg_website",
        },
      },
      checkoutOptions: {
        embed: false,
        media: true,
        logo: true,
      },
      productOptions: {
        enabledVariants: [variantId],
        redirectUrl: `${process.env.NEXT_PUBLIC_URL}/success`,
        receiptButtonText: "Go to Dashboard",
        receiptLinkUrl: `${process.env.NEXT_PUBLIC_URL}/dashboard`,
        receiptThankYouNote: "Thank you for purchasing Mouse!",
      },
    });

    return NextResponse.json({ url: checkout.data.attributes.url });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

### 7.4 Webhook Handler

#### Before (Stripe)

```javascript
// app/api/webhooks/stripe/route.js
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { headers } from "next/headers";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(request) {
  const body = await request.text();
  const signature = headers().get("stripe-signature");

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
      const session = event.data.object;
      await handleCheckoutComplete(session);
      break;

    case "customer.subscription.created":
      const subscription = event.data.object;
      await handleSubscriptionCreated(subscription);
      break;

    case "customer.subscription.deleted":
      const cancelledSub = event.data.object;
      await handleSubscriptionCancelled(cancelledSub);
      break;

    case "invoice.payment_failed":
      const invoice = event.data.object;
      await handlePaymentFailed(invoice);
      break;
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutComplete(session) {
  // Generate license key
  // Send welcome email
  // Update database
}

async function handleSubscriptionCreated(subscription) {
  // Record subscription in database
}

async function handleSubscriptionCancelled(subscription) {
  // Revoke license key
  // Update database
}

async function handlePaymentFailed(invoice) {
  // Send dunning email
  // Grace period logic
}
```

#### After (Lemon Squeezy)

```javascript
// app/api/webhooks/lemonsqueezy/route.js
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import crypto from "crypto";

export async function POST(request) {
  const body = await request.text();
  const signature = headers().get("x-signature");

  // Verify webhook signature
  const hmac = crypto.createHmac(
    "sha256",
    process.env.LEMONSQUEEZY_WEBHOOK_SECRET,
  );
  const digest = hmac.update(body).digest("hex");

  if (signature !== digest) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(body);
  const eventName = event.meta.event_name;
  const data = event.data;

  switch (eventName) {
    case "order_created":
      await handleOrderCreated(data, event.meta.custom_data);
      break;

    case "subscription_created":
      await handleSubscriptionCreated(data);
      break;

    case "subscription_updated":
      await handleSubscriptionUpdated(data);
      break;

    case "subscription_cancelled":
      await handleSubscriptionCancelled(data);
      break;

    case "subscription_payment_failed":
      await handlePaymentFailed(data);
      break;

    case "license_key_created":
      await handleLicenseKeyCreated(data);
      break;
  }

  return NextResponse.json({ received: true });
}

async function handleOrderCreated(data, customData) {
  const order = data.attributes;

  // Order includes:
  // - order.customer_id
  // - order.user_email
  // - order.user_name
  // - order.total (in cents)
  // - order.currency
  // - order.status
  // - order.first_order_item (with product/variant info)

  // License key is automatically generated by Lemon Squeezy
  // and sent to customer. We receive it via license_key_created event.

  console.log(`New order: ${order.identifier} for ${order.user_email}`);
}

async function handleSubscriptionCreated(data) {
  const subscription = data.attributes;

  // subscription.user_email
  // subscription.status ('on_trial', 'active', 'paused', 'cancelled', 'expired')
  // subscription.renews_at
  // subscription.ends_at
  // subscription.trial_ends_at

  // Store subscription info in your database
}

async function handleSubscriptionUpdated(data) {
  const subscription = data.attributes;
  // Handle plan changes, status changes, etc.
}

async function handleSubscriptionCancelled(data) {
  const subscription = data.attributes;
  // subscription.ends_at tells you when access should be revoked
  // Don't revoke immediately - they've paid through the period
}

async function handlePaymentFailed(data) {
  const subscription = data.attributes;
  // Lemon Squeezy handles dunning automatically
  // You can send additional notifications if desired
}

async function handleLicenseKeyCreated(data) {
  const licenseKey = data.attributes;

  // licenseKey.key - the actual license key string
  // licenseKey.activation_limit
  // licenseKey.activations_count
  // licenseKey.disabled
  // licenseKey.expires_at

  // Store license key in your database for validation
  await storeLicenseKey({
    key: licenseKey.key,
    customerId: licenseKey.customer_id,
    orderId: licenseKey.order_id,
    productId: licenseKey.product_id,
    expiresAt: licenseKey.expires_at,
    activationLimit: licenseKey.activation_limit,
  });
}
```

### 7.5 Customer Portal Link

#### Before (Stripe)

```javascript
// app/api/create-portal-session/route.js (Stripe)
import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(request) {
  const { customerId } = await request.json();

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${process.env.NEXT_PUBLIC_URL}/dashboard`,
  });

  return NextResponse.json({ url: session.url });
}
```

#### After (Lemon Squeezy)

```javascript
// app/api/customer-portal/route.js (Lemon Squeezy)
import { NextResponse } from "next/server";
import { lemonSqueezySetup, getCustomer } from "@lemonsqueezy/lemonsqueezy.js";

lemonSqueezySetup({ apiKey: process.env.LEMONSQUEEZY_API_KEY });

export async function POST(request) {
  const { customerId } = await request.json();

  // Get customer's portal URL from their record
  const customer = await getCustomer(customerId);
  const portalUrl = customer.data.attributes.urls.customer_portal;

  return NextResponse.json({ url: portalUrl });
}
```

**Note:** Lemon Squeezy provides a customer portal URL for each customer. The customer can:

- View and download invoices
- Update payment method
- Cancel subscription
- View order history

---

## 8. Webhook Implementation

### Setting Up Webhooks in Lemon Squeezy

1. Go to **Settings → Webhooks** in Lemon Squeezy dashboard
2. Click **Add Webhook**
3. Enter URL: `https://hic-ai.com/api/webhooks/lemonsqueezy`
4. Select events to receive:
   - `order_created`
   - `order_refunded`
   - `subscription_created`
   - `subscription_updated`
   - `subscription_cancelled`
   - `subscription_resumed`
   - `subscription_expired`
   - `subscription_paused`
   - `subscription_unpaused`
   - `subscription_payment_success`
   - `subscription_payment_failed`
   - `subscription_payment_recovered`
   - `license_key_created`
   - `license_key_updated`
5. Copy the **Signing Secret** → save as `LEMONSQUEEZY_WEBHOOK_SECRET`

### Webhook Payload Structure

```json
{
  "meta": {
    "event_name": "order_created",
    "custom_data": {
      "source": "plg_website"
    },
    "webhook_id": "wh_xxxxx"
  },
  "data": {
    "type": "orders",
    "id": "1234567",
    "attributes": {
      "store_id": 12345,
      "customer_id": 67890,
      "identifier": "ABCD-1234",
      "order_number": 1001,
      "user_name": "John Doe",
      "user_email": "john@example.com",
      "currency": "USD",
      "currency_rate": "1.00000000",
      "subtotal": 1500,
      "discount_total": 0,
      "tax": 0,
      "total": 1500,
      "subtotal_usd": 1500,
      "discount_total_usd": 0,
      "tax_usd": 0,
      "total_usd": 1500,
      "tax_name": null,
      "tax_rate": "0.00",
      "status": "paid",
      "status_formatted": "Paid",
      "refunded": false,
      "refunded_at": null,
      "first_order_item": {
        "id": 11111,
        "order_id": 1234567,
        "product_id": 22222,
        "variant_id": 33333,
        "product_name": "Mouse - Individual",
        "variant_name": "Monthly"
      },
      "urls": {
        "receipt": "https://app.lemonsqueezy.com/my-orders/..."
      },
      "created_at": "2026-01-23T10:00:00.000000Z",
      "updated_at": "2026-01-23T10:00:00.000000Z"
    },
    "relationships": {
      "store": { "data": { "type": "stores", "id": "12345" } },
      "customer": { "data": { "type": "customers", "id": "67890" } },
      "order-items": { "data": [{ "type": "order-items", "id": "11111" }] },
      "subscriptions": { "data": [{ "type": "subscriptions", "id": "44444" }] },
      "license-keys": { "data": [{ "type": "license-keys", "id": "55555" }] }
    }
  }
}
```

---

## 9. License Key Integration

### Lemon Squeezy License Keys

Lemon Squeezy has **built-in license key generation** perfect for software licensing:

#### Product Configuration

1. Go to **Products** → Edit your product
2. Under **License Keys**, enable license key generation
3. Configure:
   - **Activation Limit:** 3 (devices per license)
   - **Key Format:** `XXXX-XXXX-XXXX-XXXX` or custom
   - **Expiration:** Matches subscription (auto-extends on renewal)

#### License Validation API

Lemon Squeezy provides a license validation endpoint:

```javascript
// Validate license key (server-side)
async function validateLicenseKey(licenseKey, instanceId) {
  const response = await fetch(
    "https://api.lemonsqueezy.com/v1/licenses/validate",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        license_key: licenseKey,
        instance_id: instanceId, // Device identifier
      }),
    },
  );

  const data = await response.json();

  return {
    valid: data.valid,
    error: data.error,
    license_key: data.license_key,
    meta: data.meta, // Product info, customer info
  };
}
```

#### License Activation (VS Code Extension)

```javascript
// In VS Code extension - license.js
const LICENSE_API_URL = "https://api.lemonsqueezy.com/v1/licenses";

export class LicenseManager {
  async activateLicense(licenseKey) {
    const instanceId = this.getOrCreateInstanceId();

    const response = await fetch(`${LICENSE_API_URL}/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        license_key: licenseKey,
        instance_name: `VS Code - ${vscode.env.machineId}`,
        instance_id: instanceId,
      }),
    });

    const data = await response.json();

    if (data.activated) {
      // Store license info locally
      await this.storeLicenseLocally(data);
      return { success: true, message: "License activated!" };
    } else {
      return { success: false, message: data.error };
    }
  }

  async validateLicense(licenseKey) {
    const instanceId = this.getOrCreateInstanceId();

    const response = await fetch(`${LICENSE_API_URL}/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        license_key: licenseKey,
        instance_id: instanceId,
      }),
    });

    const data = await response.json();

    return {
      valid: data.valid,
      expiresAt: data.license_key?.expires_at,
      activationsUsed: data.license_key?.activation_usage,
      activationLimit: data.license_key?.activation_limit,
    };
  }

  async deactivateLicense(licenseKey) {
    const instanceId = this.getOrCreateInstanceId();

    const response = await fetch(`${LICENSE_API_URL}/deactivate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        license_key: licenseKey,
        instance_id: instanceId,
      }),
    });

    return await response.json();
  }
}
```

### Comparison: Custom License Server vs Lemon Squeezy

| Aspect                 | Custom License Server | Lemon Squeezy Licenses |
| ---------------------- | --------------------- | ---------------------- |
| **Setup effort**       | High (build & deploy) | Zero                   |
| **Maintenance**        | Ongoing               | None                   |
| **Uptime**             | Your responsibility   | 99.9% SLA              |
| **Device limiting**    | Custom implementation | Built-in               |
| **Offline validation** | Custom implementation | Grace period support   |
| **Analytics**          | Custom implementation | Dashboard included     |
| **Cost**               | Server costs          | Included in 5% fee     |

**Recommendation:** Use Lemon Squeezy's built-in license system. It's simpler and eliminates the need for a separate license server.

---

## 10. Checkout Flow Implementation

### Option A: Redirect to Hosted Checkout (Recommended)

```javascript
// Simple redirect - best for getting started
const handleCheckout = async (variantId) => {
  const response = await fetch("/api/create-checkout", {
    method: "POST",
    body: JSON.stringify({ variantId }),
  });
  const { url } = await response.json();
  window.location.href = url;
};
```

### Option B: Overlay Checkout

```html
<!-- Add Lemon.js script -->
<script src="https://app.lemonsqueezy.com/js/lemon.js" defer></script>
```

```javascript
// Open checkout in overlay
window.createLemonSqueezy();
window.LemonSqueezy.Url.Open(checkoutUrl);
```

### Option C: Embed Checkout

```javascript
// Create checkout with embed mode
const checkout = await createCheckout(storeId, variantId, {
  checkoutOptions: {
    embed: true,
  },
});

// Embed in iframe
<iframe src={checkout.data.attributes.url} />;
```

### Recommended Flow for PLG Website

```
User clicks "Start Free Trial" or "Subscribe"
         │
         ▼
    API creates Lemon Squeezy checkout
    (with customer email if known)
         │
         ▼
    User redirected to LS hosted checkout
    - LS calculates & displays tax
    - LS handles payment
    - LS generates license key
         │
         ▼
    User redirected to success page
    - Webhook fires in background
    - License key emailed to user
         │
         ▼
    User enters license key in VS Code
    - Extension validates with LS API
    - Mouse activated!
```

---

## 11. Implementation Checklist

### Account Setup

- [ ] Create Lemon Squeezy account
- [ ] Complete business verification (submit EIN/business docs)
- [ ] Connect payout method (bank account)
- [ ] Create store with branding

### Product Configuration

- [ ] Create "Mouse - Individual Monthly" product ($15/mo)
- [ ] Create "Mouse - Individual Annual" product ($150/yr)
- [ ] Create "Mouse - Enterprise" product ($25/seat/mo)
- [ ] Enable license key generation on each product
- [ ] Configure activation limits (3 devices recommended)
- [ ] Set up trial period (14 days) on products

### Webhook Setup

- [ ] Create webhook endpoint in your app
- [ ] Register webhook URL in Lemon Squeezy dashboard
- [ ] Select relevant events
- [ ] Store webhook secret in environment variables
- [ ] Test webhook with Lemon Squeezy's test feature

### Code Migration

- [ ] Remove `stripe` package from dependencies
- [ ] Add `@lemonsqueezy/lemonsqueezy.js` package
- [ ] Update environment variables
- [ ] Migrate checkout API route
- [ ] Migrate webhook handler
- [ ] Update checkout button components
- [ ] Update pricing page with new checkout links
- [ ] Update success page to handle LS redirects
- [ ] Update customer portal links

### VS Code Extension Updates

- [ ] Update license validation to use LS API
- [ ] Update license activation flow
- [ ] Test license activation/deactivation
- [ ] Test license validation (online/offline)

### Testing

- [ ] Test checkout flow (test mode)
- [ ] Test subscription creation
- [ ] Test license key generation
- [ ] Test license validation in extension
- [ ] Test subscription cancellation
- [ ] Test subscription renewal
- [ ] Test webhook handling
- [ ] Test customer portal access

### Go Live

- [ ] Switch from test mode to live mode
- [ ] Update environment variables for production
- [ ] Deploy changes
- [ ] Monitor first real transactions
- [ ] Verify payouts are configured correctly

---

## 12. Timeline & Effort Estimate

### Estimated Timeline: 5-7 Days

| Phase     | Duration | Tasks                                   |
| --------- | -------- | --------------------------------------- |
| **Day 1** | 4 hours  | Account setup, product configuration    |
| **Day 2** | 8 hours  | Checkout API migration, webhook setup   |
| **Day 3** | 8 hours  | Webhook handler implementation, testing |
| **Day 4** | 6 hours  | License validation updates in extension |
| **Day 5** | 4 hours  | End-to-end testing                      |
| **Day 6** | 2 hours  | Bug fixes, edge cases                   |
| **Day 7** | 2 hours  | Go live, monitoring                     |

**Total Effort:** ~34 hours

### Files to Modify

| File                                         | Changes                         |
| -------------------------------------------- | ------------------------------- |
| `package.json`                               | Remove stripe, add lemonsqueezy |
| `.env` / `.env.local`                        | Update environment variables    |
| `src/app/api/create-checkout/route.js`       | New checkout implementation     |
| `src/app/api/webhooks/lemonsqueezy/route.js` | New webhook handler             |
| `src/app/api/customer-portal/route.js`       | New portal link generator       |
| `src/components/CheckoutButton.js`           | Update checkout flow            |
| `src/app/pricing/page.js`                    | Update pricing integration      |
| `src/app/success/page.js`                    | Update success handling         |
| `src/lib/payments.js`                        | Payment utility functions       |
| VS Code extension `license.js`               | Update license validation       |

### Files to Delete

| File                                           | Reason                  |
| ---------------------------------------------- | ----------------------- |
| `src/app/api/create-checkout-session/route.js` | Replaced by LS checkout |
| `src/app/api/webhooks/stripe/route.js`         | Replaced by LS webhooks |
| `src/app/api/create-portal-session/route.js`   | Replaced by LS portal   |

---

## Appendix A: Lemon Squeezy API Reference

### Base URL

```
https://api.lemonsqueezy.com/v1
```

### Authentication

```javascript
headers: {
  'Authorization': `Bearer ${LEMONSQUEEZY_API_KEY}`,
  'Accept': 'application/vnd.api+json',
  'Content-Type': 'application/vnd.api+json',
}
```

### Key Endpoints

| Endpoint               | Method | Description           |
| ---------------------- | ------ | --------------------- |
| `/stores`              | GET    | List your stores      |
| `/products`            | GET    | List products         |
| `/variants`            | GET    | List product variants |
| `/checkouts`           | POST   | Create checkout       |
| `/customers`           | GET    | List customers        |
| `/customers/{id}`      | GET    | Get customer          |
| `/orders`              | GET    | List orders           |
| `/subscriptions`       | GET    | List subscriptions    |
| `/subscriptions/{id}`  | PATCH  | Update subscription   |
| `/subscriptions/{id}`  | DELETE | Cancel subscription   |
| `/license-keys`        | GET    | List license keys     |
| `/license-keys/{id}`   | PATCH  | Update license key    |
| `/licenses/validate`   | POST   | Validate license      |
| `/licenses/activate`   | POST   | Activate license      |
| `/licenses/deactivate` | POST   | Deactivate license    |

### SDK Installation

```bash
npm install @lemonsqueezy/lemonsqueezy.js
```

### SDK Usage

```javascript
import {
  lemonSqueezySetup,
  getAuthenticatedUser,
  listStores,
  listProducts,
  listVariants,
  createCheckout,
  getCustomer,
  listSubscriptions,
  cancelSubscription,
  listLicenseKeys,
} from "@lemonsqueezy/lemonsqueezy.js";

// Initialize
lemonSqueezySetup({ apiKey: process.env.LEMONSQUEEZY_API_KEY });

// Get authenticated user (verify API key)
const user = await getAuthenticatedUser();

// List stores
const stores = await listStores();

// List products
const products = await listProducts({ filter: { storeId: "12345" } });

// Create checkout
const checkout = await createCheckout("12345", "67890", {
  checkoutData: { email: "customer@example.com" },
});
```

---

## Appendix B: Paddle Alternative Reference

If Paddle is preferred over Lemon Squeezy, here are the key differences:

### Paddle.js Integration

```html
<script src="https://cdn.paddle.com/paddle/paddle.js"></script>
<script>
  Paddle.Setup({ vendor: 12345 });
</script>
```

```javascript
// Open checkout
Paddle.Checkout.open({
  product: 12345, // Product ID
  email: "customer@example.com",
  successCallback: (data) => {
    console.log("Purchase complete:", data);
  },
});
```

### Paddle API (Server-side)

```javascript
// Using paddle-sdk package (community maintained)
import Paddle from "paddle-sdk";

const paddle = new Paddle(vendorId, apiKey);

// List transactions
const transactions = await paddle.getTransactions();

// Cancel subscription
await paddle.cancelSubscription(subscriptionId);
```

### Key Differences from Lemon Squeezy

| Aspect         | Lemon Squeezy    | Paddle               |
| -------------- | ---------------- | -------------------- |
| Approval time  | Days             | Weeks                |
| License keys   | Built-in         | Requires integration |
| SDK            | Official Node.js | Community maintained |
| Webhook format | JSON API spec    | Custom format        |
| Dashboard      | Modern           | Functional           |
| Documentation  | Excellent        | Good                 |

---

## Document History

| Date       | Author         | Changes          |
| ---------- | -------------- | ---------------- |
| 2026-01-23 | GitHub Copilot | Initial document |

---

_This document provides technical guidance for payment integration. For specific legal or tax advice, consult with qualified professionals in your jurisdiction._
