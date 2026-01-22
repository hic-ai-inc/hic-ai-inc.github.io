# MEMORANDUM

**TO:** Simon Reiff, President & Technical Founder  
**FROM:** GC  
**DATE:** January 22, 2026  
**VERSION:** 2.0  
**RE:** Next.js Frontend Foundation — Project Setup and Design System

**v2.0 Changes:**
- Pricing restructured: Open Source ($0) / Individual ($10/mo) / Enterprise ($25/seat/mo)
- Removed TEAM tier and LAUNCH50 promo code
- Updated trial policies: Individual=14 days no card, Enterprise=30 days with card
- Device limits reconciled: OSS=1, Individual=3, Enterprise=2/seat
- Simplified STRIPE_PRODUCTS to 6 SKUs

---

## Executive Summary

This memo specifies the complete frontend foundation for hic-ai.com using Next.js 14+ (App Router), React, and Tailwind CSS. The design system is derived from your existing investor deck theme (Midnight Navy, Frost White, Cerulean Mist, Manrope/Inter typography).

**Setup Time Estimate:** 4-6 hours for complete foundation

**Deliverables:**

1. Next.js project with App Router
2. Tailwind configuration with your design tokens
3. Component library scaffolding
4. Auth0 integration skeleton
5. Environment configuration
6. Shared utilities and constants

---

## 1. Project Structure

```
hic-ai-web/
├── app/                           # Next.js App Router
│   ├── layout.js                  # Root layout (fonts, metadata)
│   ├── page.js                    # Landing page (/)
│   ├── globals.css                # Global styles + Tailwind imports
│   ├── pricing/
│   │   └── page.js                # Pricing page
│   ├── welcome/
│   │   └── page.js                # Post-checkout account creation
│   ├── login/
│   │   └── page.js                # Auth0 login redirect
│   ├── docs/
│   │   ├── page.js                # Documentation index
│   │   └── [slug]/
│   │       └── page.js            # Individual doc pages
│   ├── portal/
│   │   ├── layout.js              # Authenticated layout
│   │   ├── page.js                # Dashboard
│   │   ├── license/
│   │   │   └── page.js            # License management
│   │   ├── devices/
│   │   │   └── page.js            # Device management
│   │   ├── billing/
│   │   │   └── page.js            # Subscription/billing
│   │   ├── invoices/
│   │   │   └── page.js            # Invoice history
│   │   ├── settings/
│   │   │   └── page.js            # Account settings
│   │   └── team/
│   │       └── page.js            # Team management (enterprise)
│   └── api/
│       ├── auth/
│       │   └── [...auth0]/
│       │       └── route.js       # Auth0 SDK handler
│       ├── checkout/
│       │   └── route.js           # Create Stripe session
│       ├── webhooks/
│       │   ├── stripe/
│       │   │   └── route.js       # Stripe webhook handler
│       │   └── keygen/
│       │       └── route.js       # Keygen webhook handler
│       ├── license/
│       │   ├── validate/
│       │   │   └── route.js       # Phone-home validation
│       │   └── activate/
│       │       └── route.js       # First activation
│       └── portal/
│           └── stripe-session/
│               └── route.js       # Customer Portal redirect
│
├── components/
│   ├── ui/                        # Reusable UI primitives
│   │   ├── Button.js
│   │   ├── Card.js
│   │   ├── Input.js
│   │   ├── Badge.js
│   │   ├── Table.js
│   │   └── Modal.js
│   ├── layout/                    # Layout components
│   │   ├── Header.js
│   │   ├── Footer.js
│   │   ├── PortalSidebar.js
│   │   └── Container.js
│   ├── marketing/                 # Landing page sections
│   │   ├── Hero.js
│   │   ├── ProblemSolution.js
│   │   ├── Evidence.js
│   │   ├── Pricing.js
│   │   ├── FAQ.js
│   │   └── CTA.js
│   ├── checkout/                  # Checkout flow
│   │   ├── PlanSelector.js
│   │   ├── SeatSelector.js
│   │   ├── PromoCodeInput.js
│   │   └── PriceCalculator.js
│   ├── auth/                      # Authentication
│   │   ├── LoginButton.js
│   │   ├── LogoutButton.js
│   │   └── AccountCreationForm.js
│   └── portal/                    # Portal-specific
│       ├── LicenseCard.js
│       ├── DeviceList.js
│       ├── SubscriptionCard.js
│       └── TrialCountdown.js
│
├── lib/                           # Utilities and clients
│   ├── constants.js               # App constants
│   ├── stripe.js                  # Stripe client
│   ├── keygen.js                  # Keygen client
│   ├── dynamodb.js                # DynamoDB client
│   ├── ses.js                     # SES email client
│   ├── cart.js                    # Client-side cart (localStorage)
│   └── utils.js                   # Shared utilities
│
├── styles/
│   └── theme.js                   # Design tokens (from investor deck)
│
├── public/
│   ├── images/
│   │   ├── mouse-logo-white.svg   # Logo for dark backgrounds
│   │   ├── mouse-logo-dark.svg    # Logo for light backgrounds
│   │   └── og-image.png           # Open Graph image
│   └── fonts/                     # Self-hosted fonts (optional)
│
├── .env.local                     # Local environment variables
├── .env.example                   # Template for team
├── next.config.js                 # Next.js configuration
├── tailwind.config.js             # Tailwind with design tokens
├── postcss.config.js              # PostCSS for Tailwind
├── jsconfig.json                  # Path aliases
└── package.json
```

---

## 2. Design System (Tailwind Configuration)

Derived from your investor deck `theme.js`:

```javascript
// tailwind.config.js

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
    "./lib/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      // ===========================================
      // COLORS (from investor deck theme.js)
      // ===========================================
      colors: {
        // Primary palette
        "midnight-navy": "#0B1220",
        "frost-white": "#F6F8FB",
        "cerulean-mist": "#C9DBF0",
        silver: "#B8C4D0",

        // Supporting colors
        "slate-grey": "#6B7C93",

        // Semantic colors
        success: "#4ADE80",
        warning: "#FBBF24",
        error: "#F87171",
        info: "#60A5FA",

        // Card variants (with opacity)
        "card-bg": "rgba(201, 219, 240, 0.08)",
        "card-border": "rgba(201, 219, 240, 0.3)",
        "overlay-dark": "rgba(11, 18, 32, 0.9)",
      },

      // ===========================================
      // TYPOGRAPHY (from investor deck theme.js)
      // ===========================================
      fontFamily: {
        headline: ["Manrope", "Inter", "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
        mono: ["Consolas", "Monaco", "Courier New", "monospace"],
      },

      fontSize: {
        // Headlines (responsive)
        hero: ["6rem", { lineHeight: "1.1", fontWeight: "700" }], // 96px
        h1: ["4.5rem", { lineHeight: "1.1", fontWeight: "700" }], // 72px
        h2: ["3.5rem", { lineHeight: "1.2", fontWeight: "700" }], // 56px
        h3: ["2.625rem", { lineHeight: "1.2", fontWeight: "700" }], // 42px
        h4: ["2rem", { lineHeight: "1.3", fontWeight: "700" }], // 32px

        // Body text
        "body-lg": ["2rem", { lineHeight: "1.6", fontWeight: "400" }], // 32px
        "body-md": ["1.75rem", { lineHeight: "1.6", fontWeight: "400" }], // 28px
        "body-sm": ["1.5rem", { lineHeight: "1.6", fontWeight: "400" }], // 24px
        "body-xs": ["1.25rem", { lineHeight: "1.6", fontWeight: "400" }], // 20px

        // Labels/captions
        label: ["1.125rem", { lineHeight: "1.4", fontWeight: "600" }], // 18px
        caption: ["1rem", { lineHeight: "1.4", fontWeight: "400" }], // 16px
      },

      // ===========================================
      // SPACING (from investor deck dimensions)
      // ===========================================
      spacing: {
        outer: "7.5rem", // 120px - outer margins
        inner: "3.75rem", // 60px - inner margins
        card: "2.5rem", // 40px - card padding
      },

      // ===========================================
      // BORDER RADIUS
      // ===========================================
      borderRadius: {
        card: "1rem", // 16px - card corners
      },

      // ===========================================
      // BOX SHADOW
      // ===========================================
      boxShadow: {
        card: "0 4px 24px rgba(0, 0, 0, 0.1)",
        "card-hover": "0 8px 32px rgba(0, 0, 0, 0.15)",
      },

      // ===========================================
      // ANIMATION
      // ===========================================
      animation: {
        "fade-in": "fadeIn 0.5s ease-out",
        "slide-up": "slideUp 0.5s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
```

---

## 3. Root Layout with Fonts

```javascript
// app/layout.js

import { Inter, Manrope } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
});

export const metadata = {
  metadataBase: new URL("https://hic-ai.com"),
  title: {
    default: "Mouse — Precision Editing Tools for AI Coding Agents",
    template: "%s | Mouse by HIC AI",
  },
  description:
    "The first proven treatment for execution slop. Mouse gives AI coding agents the precision tools they need to edit files reliably.",
  keywords: [
    "AI coding",
    "VS Code extension",
    "code editing",
    "AI tools",
    "developer tools",
  ],
  authors: [{ name: "HIC AI", url: "https://hic-ai.com" }],
  creator: "HIC AI",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://hic-ai.com",
    siteName: "Mouse by HIC AI",
    title: "Mouse — Precision Editing Tools for AI Coding Agents",
    description: "The first proven treatment for execution slop.",
    images: [
      {
        url: "/images/og-image.png",
        width: 1200,
        height: 630,
        alt: "Mouse by HIC AI",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Mouse — Precision Editing Tools for AI Coding Agents",
    description: "The first proven treatment for execution slop.",
    images: ["/images/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${manrope.variable}`}>
      <body className="bg-midnight-navy text-frost-white font-body antialiased">
        {children}
      </body>
    </html>
  );
}
```

---

## 4. Global Styles

```css
/* app/globals.css */

@tailwind base;
@tailwind components;
@tailwind utilities;

/* ===========================================
   BASE STYLES
   =========================================== */

@layer base {
  html {
    scroll-behavior: smooth;
  }

  body {
    @apply min-h-screen;
  }

  /* Headings use Manrope */
  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    @apply font-headline;
  }

  /* Links */
  a {
    @apply text-cerulean-mist hover:text-frost-white transition-colors;
  }

  /* Selection */
  ::selection {
    @apply bg-cerulean-mist/30 text-frost-white;
  }
}

/* ===========================================
   COMPONENT STYLES
   =========================================== */

@layer components {
  /* Card */
  .card {
    @apply bg-card-bg border border-card-border rounded-card p-card;
  }

  .card-hover {
    @apply hover:bg-card-border/20 hover:border-cerulean-mist/50 transition-all duration-200;
  }

  /* Buttons */
  .btn {
    @apply inline-flex items-center justify-center px-6 py-3 rounded-lg font-medium transition-all duration-200;
  }

  .btn-primary {
    @apply bg-cerulean-mist text-midnight-navy hover:bg-frost-white;
  }

  .btn-secondary {
    @apply bg-transparent border-2 border-cerulean-mist text-cerulean-mist hover:bg-cerulean-mist hover:text-midnight-navy;
  }

  .btn-ghost {
    @apply bg-transparent text-frost-white hover:bg-card-bg;
  }

  /* Input */
  .input {
    @apply w-full px-4 py-3 bg-card-bg border border-card-border rounded-lg text-frost-white placeholder-slate-grey focus:outline-none focus:border-cerulean-mist transition-colors;
  }

  /* Badge */
  .badge {
    @apply inline-flex items-center px-3 py-1 rounded-full text-sm font-medium;
  }

  .badge-success {
    @apply bg-success/20 text-success;
  }

  .badge-warning {
    @apply bg-warning/20 text-warning;
  }

  .badge-error {
    @apply bg-error/20 text-error;
  }

  .badge-info {
    @apply bg-info/20 text-info;
  }

  /* Section container */
  .section {
    @apply max-w-7xl mx-auto px-6 lg:px-outer py-16 lg:py-24;
  }
}

/* ===========================================
   UTILITY CLASSES
   =========================================== */

@layer utilities {
  /* Text gradient */
  .text-gradient {
    @apply bg-gradient-to-r from-cerulean-mist to-frost-white bg-clip-text text-transparent;
  }

  /* Glow effect */
  .glow {
    box-shadow: 0 0 40px rgba(201, 219, 240, 0.2);
  }

  /* Hide scrollbar */
  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .no-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
}
```

---

## 5. Constants and Environment

### 5.1 Application Constants

```javascript
// lib/constants.js

// ===========================================
// PRICING
// ===========================================

export const PRICING = {
  individual: {
    id: "individual",
    name: "Individual",
    description: "For solo developers",
    priceMonthly: 10,
    priceAnnual: 100, // 2 months free
    seats: 1,
    maxDevices: 3,
    trialDays: 14,
    requiresCard: false,
    features: [
      "All Mouse tools",
      "Up to 3 devices",
      "Commercial use allowed",
      "Email support",
      "Community access",
    ],
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    description: "For organizations (10+ seats)",
    pricePerSeat: 25, // Annual only: $300/seat/year
    minSeats: 10,
    maxDevicesPerSeat: 2,
    trialDays: 30,
    requiresCard: true,
    features: [
      "Everything in Individual",
      "SSO/SAML integration",
      "Dedicated support",
      "Custom SLA",
      "Invoice billing (NET-30)",
      "Volume discounts (10% at 100, 20% at 500)",
    ],
  },
  oss: {
    id: "oss",
    name: "Open Source",
    description: "For non-commercial OSS development",
    priceMonthly: 0,
    seats: 1,
    maxDevices: 1,
    requiresGitHubVerification: true,
    features: [
      "All Mouse tools",
      "1 device only",
      "Non-commercial use only",
      "Community support",
    ],
  },
};

// ===========================================
// PROMO CODES
// ===========================================

export const PROMO_CODES = {
  EARLYADOPTER20: {
    code: "EARLYADOPTER20",
    discount: 0.2, // 20% off
    description: "Early adopter discount - 20% off first year",
    validUntil: "2026-12-31",
  },
  STUDENT50: {
    code: "STUDENT50",
    discount: 0.5, // 50% off
    description: "Academic discount - 50% off",
    validUntil: null, // No expiry
    requiresVerification: true,
  },
  NONPROFIT40: {
    code: "NONPROFIT40",
    discount: 0.4, // 40% off
    description: "Nonprofit discount - 40% off",
    validUntil: null, // No expiry
    requiresVerification: true,
  },
};

// ===========================================
// TRIAL
// ===========================================

export const TRIAL = {
  individual: {
    durationDays: 14,
    requiresCard: false,
  },
  enterprise: {
    durationDays: 30,
    requiresCard: true,
  },
};

// ===========================================
// LICENSE STATES
// ===========================================

export const LICENSE_STATUS = {
  PENDING_ACCOUNT: "PENDING_ACCOUNT",
  TRIAL: "TRIAL",
  ACTIVE: "ACTIVE",
  PAST_DUE: "PAST_DUE",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
};

// ===========================================
// STRIPE PRODUCT IDS
// ===========================================

export const STRIPE_PRODUCTS = {
  individual: {
    monthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_INDIVIDUAL_MONTHLY,
    annual: process.env.NEXT_PUBLIC_STRIPE_PRICE_INDIVIDUAL_ANNUAL,
  },
  enterprise: {
    // Annual only, tiered pricing
    seats10: process.env.NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE_10,
    seats100: process.env.NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE_100,
    seats500: process.env.NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE_500,
    custom: process.env.NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE_CUSTOM,
  },
  // Note: OSS tier has no Stripe product - licenses issued via Keygen after GitHub verification
};

// ===========================================
// EXTERNAL URLS
// ===========================================

export const EXTERNAL_URLS = {
  docs: "https://docs.hic-ai.com",
  github: "https://github.com/hic-ai/mouse",
  twitter: "https://twitter.com/hic_ai",
  discord: "https://discord.gg/hic-ai",
  support: "mailto:support@hic-ai.com",
};

// ===========================================
// NAVIGATION
// ===========================================

export const NAV_LINKS = [
  { label: "Features", href: "/#features" },
  { label: "Pricing", href: "/pricing" },
  { label: "Docs", href: "/docs" },
];

export const PORTAL_NAV = [
  { label: "Dashboard", href: "/portal", icon: "dashboard" },
  { label: "License", href: "/portal/license", icon: "key" },
  { label: "Devices", href: "/portal/devices", icon: "devices" },
  { label: "Billing", href: "/portal/billing", icon: "credit-card" },
  { label: "Invoices", href: "/portal/invoices", icon: "receipt" },
  { label: "Settings", href: "/portal/settings", icon: "settings" },
];
```

### 5.2 Environment Variables

```bash
# .env.example

# ===========================================
# APPLICATION
# ===========================================
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME="Mouse by HIC AI"

# ===========================================
# AUTH0
# ===========================================
AUTH0_SECRET='use [openssl rand -hex 32] to generate a 32 byte value'
AUTH0_BASE_URL=http://localhost:3000
AUTH0_ISSUER_BASE_URL=https://YOUR_TENANT.auth0.com
AUTH0_CLIENT_ID=
AUTH0_CLIENT_SECRET=

# Management API (for creating users)
AUTH0_MANAGEMENT_CLIENT_ID=
AUTH0_MANAGEMENT_CLIENT_SECRET=

# ===========================================
# STRIPE
# ===========================================
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Stripe Price IDs (6 products, no launch SKUs)
NEXT_PUBLIC_STRIPE_PRICE_INDIVIDUAL_MONTHLY=price_individual_monthly
NEXT_PUBLIC_STRIPE_PRICE_INDIVIDUAL_ANNUAL=price_individual_annual
NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE_10=price_enterprise_10
NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE_100=price_enterprise_100
NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE_500=price_enterprise_500
NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE_CUSTOM=price_enterprise_custom

# ===========================================
# KEYGEN.SH
# ===========================================
KEYGEN_ACCOUNT_ID=
KEYGEN_PRODUCT_ID=
KEYGEN_POLICY_ID_OSS=
KEYGEN_POLICY_ID_INDIVIDUAL=
KEYGEN_POLICY_ID_ENTERPRISE=
KEYGEN_API_KEY=

# ===========================================
# AWS
# ===========================================
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

# DynamoDB
DYNAMODB_TABLE_NAME=hic-plg-production

# SES
SES_FROM_EMAIL=noreply@hic-ai.com

# ===========================================
# FEATURE FLAGS
# ===========================================
NEXT_PUBLIC_ENABLE_ANALYTICS=false
NEXT_PUBLIC_ENABLE_TEAM_FEATURES=false
```

---

## 6. Core Utility Libraries

### 6.1 Stripe Client

```javascript
// lib/stripe.js

import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});

/**
 * Create a Stripe Checkout session
 */
export async function createCheckoutSession({
  priceId,
  quantity = 1,
  customerEmail,
  successUrl,
  cancelUrl,
  trialDays = 14,
  promoCode,
}) {
  const sessionParams = {
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        price: priceId,
        quantity,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    subscription_data: {
      trial_period_days: trialDays,
    },
    allow_promotion_codes: true,
  };

  if (customerEmail) {
    sessionParams.customer_email = customerEmail;
  }

  if (promoCode) {
    // Apply specific promo code
    sessionParams.discounts = [{ promotion_code: promoCode }];
    delete sessionParams.allow_promotion_codes;
  }

  return stripe.checkout.sessions.create(sessionParams);
}

/**
 * Create a Customer Portal session
 */
export async function createPortalSession(customerId, returnUrl) {
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
}
```

### 6.2 DynamoDB Client

```javascript
// lib/dynamodb.js

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
});

export const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "hic-plg-production";

/**
 * Get customer by email
 */
export async function getCustomerByEmail(email) {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `CUST#${email}`,
        SK: "PROFILE",
      },
    }),
  );
  return result.Item || null;
}

/**
 * Get customer by Stripe ID (via GSI1)
 */
export async function getCustomerByStripeId(stripeCustomerId) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk AND GSI1SK = :sk",
      ExpressionAttributeValues: {
        ":pk": `STRIPE#${stripeCustomerId}`,
        ":sk": "PROFILE",
      },
    }),
  );
  return result.Items?.[0] || null;
}

/**
 * Get customer by Auth0 ID (via GSI3)
 */
export async function getCustomerByAuth0Id(auth0UserId) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "GSI3",
      KeyConditionExpression: "GSI3PK = :pk AND GSI3SK = :sk",
      ExpressionAttributeValues: {
        ":pk": `AUTH0#${auth0UserId}`,
        ":sk": "PROFILE",
      },
    }),
  );
  return result.Items?.[0] || null;
}

/**
 * Save customer
 */
export async function saveCustomer(customer) {
  const item = {
    PK: `CUST#${customer.email}`,
    SK: "PROFILE",
    ...customer,
    updatedAt: new Date().toISOString(),
  };

  // Add GSI keys if present
  if (customer.stripeCustomerId) {
    item.GSI1PK = `STRIPE#${customer.stripeCustomerId}`;
    item.GSI1SK = "PROFILE";
  }
  if (customer.auth0UserId) {
    item.GSI3PK = `AUTH0#${customer.auth0UserId}`;
    item.GSI3SK = "PROFILE";
  }

  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
    }),
  );

  return item;
}

/**
 * Update customer fields
 */
export async function updateCustomer(email, updates) {
  const updateExpressions = [];
  const attributeNames = {};
  const attributeValues = {};

  Object.entries(updates).forEach(([key, value], index) => {
    const attrName = `#attr${index}`;
    const attrValue = `:val${index}`;
    updateExpressions.push(`${attrName} = ${attrValue}`);
    attributeNames[attrName] = key;
    attributeValues[attrValue] = value;
  });

  // Always update updatedAt
  updateExpressions.push("#updatedAt = :updatedAt");
  attributeNames["#updatedAt"] = "updatedAt";
  attributeValues[":updatedAt"] = new Date().toISOString();

  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `CUST#${email}`,
        SK: "PROFILE",
      },
      UpdateExpression: `SET ${updateExpressions.join(", ")}`,
      ExpressionAttributeNames: attributeNames,
      ExpressionAttributeValues: attributeValues,
    }),
  );
}
```

### 6.3 Cart (Client-Side)

```javascript
// lib/cart.js

/**
 * Client-side cart using localStorage
 * No server-side guest sessions needed
 */

const CART_KEY = "hic_cart";

export function getCart() {
  if (typeof window === "undefined") return null;

  const stored = localStorage.getItem(CART_KEY);
  if (!stored) return null;

  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export function setCart(cart) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

export function clearCart() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CART_KEY);
}

export function addToCart({ plan, seats = 1, promoCode = null }) {
  setCart({
    plan,
    seats,
    promoCode,
    addedAt: new Date().toISOString(),
  });
}

export function updateSeats(seats) {
  const cart = getCart();
  if (cart) {
    setCart({ ...cart, seats });
  }
}

export function applyPromoCode(promoCode) {
  const cart = getCart();
  if (cart) {
    setCart({ ...cart, promoCode });
  }
}
```

---

## 7. Example Components

### 7.1 Button Component

```javascript
// components/ui/Button.js

import Link from "next/link";

const variants = {
  primary: "btn btn-primary",
  secondary: "btn btn-secondary",
  ghost: "btn btn-ghost",
};

const sizes = {
  sm: "px-4 py-2 text-sm",
  md: "px-6 py-3 text-base",
  lg: "px-8 py-4 text-lg",
};

export default function Button({
  children,
  variant = "primary",
  size = "md",
  href,
  disabled = false,
  loading = false,
  className = "",
  ...props
}) {
  const classes = `${variants[variant]} ${sizes[size]} ${
    disabled || loading ? "opacity-50 cursor-not-allowed" : ""
  } ${className}`;

  if (href) {
    return (
      <Link href={href} className={classes} {...props}>
        {loading ? "Loading..." : children}
      </Link>
    );
  }

  return (
    <button className={classes} disabled={disabled || loading} {...props}>
      {loading ? "Loading..." : children}
    </button>
  );
}
```

### 7.2 Card Component

```javascript
// components/ui/Card.js

export default function Card({
  children,
  hover = false,
  className = "",
  ...props
}) {
  return (
    <div
      className={`card ${hover ? "card-hover" : ""} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = "" }) {
  return <div className={`mb-4 ${className}`}>{children}</div>;
}

export function CardTitle({ children, className = "" }) {
  return (
    <h3 className={`text-h4 font-headline text-frost-white ${className}`}>
      {children}
    </h3>
  );
}

export function CardDescription({ children, className = "" }) {
  return <p className={`text-silver mt-1 ${className}`}>{children}</p>;
}

export function CardContent({ children, className = "" }) {
  return <div className={className}>{children}</div>;
}

export function CardFooter({ children, className = "" }) {
  return (
    <div className={`mt-6 pt-4 border-t border-card-border ${className}`}>
      {children}
    </div>
  );
}
```

### 7.3 Header Component

```javascript
// components/layout/Header.js

"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { NAV_LINKS } from "@/lib/constants";
import Button from "@/components/ui/Button";

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-midnight-navy/90 backdrop-blur-md border-b border-card-border">
      <nav className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/images/mouse-logo-white.svg"
            alt="Mouse"
            width={32}
            height={32}
          />
          <span className="font-headline font-bold text-xl text-frost-white">
            Mouse
          </span>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-silver hover:text-frost-white transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* CTA Buttons */}
        <div className="hidden md:flex items-center gap-4">
          <Button variant="ghost" href="/login">
            Sign In
          </Button>
          <Button variant="primary" href="/pricing">
            Start Free Trial
          </Button>
        </div>

        {/* Mobile Menu Button */}
        <button
          className="md:hidden p-2"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          <span className="sr-only">Toggle menu</span>
          {/* Hamburger icon */}
          <svg
            className="w-6 h-6 text-frost-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            {mobileMenuOpen ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            )}
          </svg>
        </button>
      </nav>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-midnight-navy border-b border-card-border">
          <div className="px-6 py-4 space-y-4">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block text-silver hover:text-frost-white"
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-4 border-t border-card-border space-y-3">
              <Button variant="ghost" href="/login" className="w-full">
                Sign In
              </Button>
              <Button variant="primary" href="/pricing" className="w-full">
                Start Free Trial
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
```

---

## 8. Package Dependencies

```json
{
  "name": "hic-ai-web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "14.2.0",
    "react": "18.3.0",
    "react-dom": "18.3.0",

    "# Authentication": "",
    "@auth0/nextjs-auth0": "^3.5.0",

    "# Payments": "",
    "stripe": "^14.0.0",
    "@stripe/stripe-js": "^2.0.0",

    "# AWS": "",
    "@aws-sdk/client-dynamodb": "^3.500.0",
    "@aws-sdk/lib-dynamodb": "^3.500.0",
    "@aws-sdk/client-ses": "^3.500.0",
    "@aws-sdk/client-sns": "^3.500.0",

    "# Utilities": "",
    "clsx": "^2.1.0",
    "date-fns": "^3.0.0"
  },
  "devDependencies": {
    "autoprefixer": "^10.4.0",
    "eslint": "^8.0.0",
    "eslint-config-next": "14.2.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0"
  }
}
```

---

## 9. Setup Checklist

### Day 1: Project Foundation (2-3 hours)

- [ ] Create Next.js project: `npx create-next-app@latest hic-ai-web`
- [ ] Configure Tailwind with design tokens
- [ ] Set up folder structure
- [ ] Create `.env.local` from template
- [ ] Add Google Fonts (Inter, Manrope)
- [ ] Create `globals.css` with base styles

### Day 1: Core Components (2-3 hours)

- [ ] Button component
- [ ] Card component
- [ ] Input component
- [ ] Header component
- [ ] Footer component
- [ ] Container/Section components

### Day 2: Utility Libraries (2 hours)

- [ ] Constants file
- [ ] Stripe client
- [ ] DynamoDB client
- [ ] Cart utilities
- [ ] Auth0 configuration

### Day 2: Page Skeletons (2 hours)

- [ ] Landing page structure
- [ ] Pricing page structure
- [ ] Welcome page structure
- [ ] Portal layout
- [ ] Portal dashboard skeleton

---

## 10. Path Aliases Configuration

```json
// jsconfig.json (for JavaScript projects)
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"],
      "@/components/*": ["components/*"],
      "@/lib/*": ["lib/*"],
      "@/styles/*": ["styles/*"]
    }
  }
}
```

---

## 11. Next Steps After Foundation

Once the foundation is in place:

1. **Landing Page** — Hero, Problem/Solution, Evidence sections (from deck)
2. **Pricing Page** — Plan cards, seat selector, promo code input
3. **Checkout Flow** — Stripe integration
4. **Welcome Page** — Account creation form
5. **Portal** — Dashboard and sub-pages

---

**Summary:**

| Foundation Element  | Source                   | Time   |
| ------------------- | ------------------------ | ------ |
| Design tokens       | Investor deck `theme.js` | 30 min |
| Tailwind config     | Design tokens → Tailwind | 30 min |
| Root layout + fonts | Manrope + Inter          | 30 min |
| Global styles       | Component classes        | 1 hr   |
| Core UI components  | Button, Card, Input      | 1 hr   |
| Layout components   | Header, Footer           | 1 hr   |
| Utility libraries   | Stripe, DynamoDB, Cart   | 1 hr   |
| Constants           | Pricing, URLs, Nav       | 30 min |

**Total: ~6 hours** to have a complete foundation ready for page development.

---

_This memorandum is for internal planning purposes._
