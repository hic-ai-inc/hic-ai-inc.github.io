# Security Considerations for Next.js Project

**Document ID:** 20260122_SECURITY_CONSIDERATIONS_FOR_NEXTJS_PROJECT  
**Date:** January 22, 2026  
**Author:** GitHub Copilot  
**Status:** Reference Guide  
**Classification:** Internal Engineering Reference

---

## 1. Executive Summary

This memo documents security architecture considerations for the HIC AI Next.js web application. The primary concern addressed is the separation of server-side (private) and client-side (public) code within a unified Next.js codebase, ensuring that backend secrets, API keys, and sensitive business logic are never exposed to end users.

---

## 2. Next.js Execution Model

### 2.1 The Fundamental Principle

**File location and directives determine where code executes.**

Next.js applications contain code that runs in three distinct contexts:

| Context               | Location                  | Runs On     | Browser Access              |
| --------------------- | ------------------------- | ----------- | --------------------------- |
| **API Routes**        | `app/api/**/*.js`         | Server only | ❌ Never shipped            |
| **Server Components** | Default for `.jsx` files  | Server only | ❌ Only HTML output shipped |
| **Client Components** | Files with `"use client"` | Browser     | ✅ Fully exposed            |

### 2.2 Why This Matters

When a user visits your Next.js application:

1. **Server Components** execute on the server and send only the resulting HTML/JSON to the browser
2. **Client Components** are bundled as JavaScript and downloaded to the user's browser
3. **API Routes** are never included in any browser bundle — they exist only as HTTP endpoints

This means:

- Code in API routes can safely use database connections, API keys, and secrets
- Client components can only communicate with API routes via HTTP requests (`fetch`)
- Client components cannot import or access server-only code

---

## 3. Environment Variable Security

### 3.1 The `NEXT_PUBLIC_` Convention

Next.js uses a naming convention to determine which environment variables are safe for the browser:

```bash
# .env.local

# ═══════════════════════════════════════════════════════════════════
# 🔒 SERVER-ONLY VARIABLES (No prefix)
# These are NEVER included in browser bundles
# ═══════════════════════════════════════════════════════════════════

AUTH0_SECRET=your-auth0-secret-32-chars-minimum
AUTH0_CLIENT_SECRET=your-auth0-client-secret
STRIPE_SECRET_KEY=sk_live_YOUR_SECRET_KEY_HERE
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET_HERE
KEYGEN_PRODUCT_TOKEN=prod_xxxxxxxxxxxxxxxxxxxxxxxx
DATABASE_URL=postgresql://user:password@host:5432/db

# ═══════════════════════════════════════════════════════════════════
# 🌐 PUBLIC VARIABLES (NEXT_PUBLIC_ prefix)
# These ARE included in browser bundles — use only for non-secrets
# ═══════════════════════════════════════════════════════════════════

NEXT_PUBLIC_AUTH0_DOMAIN=dev-vby1x2u5b7c882n5.us.auth0.com
NEXT_PUBLIC_AUTH0_CLIENT_ID=MMdXibUAwtcM7GeI4eUJRytXqFjhLu20
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_YOUR_PUBLISHABLE_KEY_HERE
NEXT_PUBLIC_APP_URL=https://hic-ai.com
```

### 3.2 How Next.js Enforces This

At **build time**, Next.js performs static replacement:

- Variables without `NEXT_PUBLIC_` prefix are replaced with `undefined` in client bundles
- This is not a runtime check — the actual values are **never included** in client JavaScript
- Attempting to access `process.env.STRIPE_SECRET_KEY` in a client component returns `undefined`

### 3.3 Common Mistakes to Avoid

| ❌ Mistake                              | ✅ Correct Approach                              |
| --------------------------------------- | ------------------------------------------------ |
| Putting secrets in `NEXT_PUBLIC_*` vars | Only use `NEXT_PUBLIC_` for non-sensitive config |
| Logging secrets in client components    | Log only on server, and even then sparingly      |
| Importing server utilities into client  | Keep server code in `/lib` or `/app/api` only    |
| Hardcoding secrets in source files      | Always use environment variables                 |
| Committing `.env.local` to git          | Add to `.gitignore` immediately                  |

---

## 4. Recommended Project Structure

```
hic-ai-web/
├── app/
│   ├── api/                              # 🔒 SERVER ONLY
│   │   ├── auth/
│   │   │   └── [...auth0]/
│   │   │       └── route.js              # Auth0 callback handler
│   │   ├── checkout/
│   │   │   └── route.js                  # Create Stripe checkout sessions
│   │   ├── webhook/
│   │   │   └── stripe/
│   │   │       └── route.js              # Receive Stripe webhook events
│   │   └── licenses/
│   │       ├── route.js                  # List user's licenses
│   │       └── [id]/
│   │           └── route.js              # Get/update specific license
│   │
│   ├── (marketing)/                      # Public pages (no auth required)
│   │   ├── page.jsx                      # Homepage
│   │   ├── pricing/
│   │   │   └── page.jsx                  # Pricing page
│   │   ├── docs/
│   │   │   └── page.jsx                  # Documentation
│   │   └── layout.jsx                    # Marketing layout
│   │
│   ├── (dashboard)/                      # Protected pages (auth required)
│   │   ├── dashboard/
│   │   │   └── page.jsx                  # User dashboard
│   │   ├── licenses/
│   │   │   └── page.jsx                  # License management
│   │   ├── billing/
│   │   │   └── page.jsx                  # Billing history
│   │   └── layout.jsx                    # Dashboard layout with auth check
│   │
│   ├── layout.jsx                        # Root layout
│   └── globals.css                       # Global styles
│
├── lib/                                  # 🔒 SERVER ONLY - Business Logic
│   ├── auth.js                           # Auth0 configuration & helpers
│   ├── stripe.js                         # Stripe SDK initialization
│   ├── keygen.js                         # Keygen API wrapper
│   └── db.js                             # Database client (if applicable)
│
├── components/                           # Shared UI Components
│   ├── ui/                               # Generic UI (buttons, inputs)
│   │   ├── Button.jsx                    # "use client" for interactivity
│   │   └── Input.jsx
│   ├── forms/                            # Form components
│   │   └── CheckoutForm.jsx              # "use client"
│   └── layout/                           # Layout components
│       ├── Header.jsx
│       └── Footer.jsx
│
├── .env.local                            # 🔒 NEVER COMMIT - Local secrets
├── .env.example                          # Template (no real values)
├── .gitignore                            # Must include .env.local
├── next.config.js
├── package.json
└── jsconfig.json
```

### 4.1 Key Structural Rules

1. **`/app/api/`** — All API routes. These are HTTP endpoints only, never bundled for browser.

2. **`/lib/`** — Server-only business logic. Import only into API routes or Server Components.

3. **`/components/`** — UI components. Add `"use client"` directive only when needed for:
   - Event handlers (`onClick`, `onChange`, etc.)
   - React hooks (`useState`, `useEffect`, etc.)
   - Browser APIs (`window`, `document`, etc.)

4. **Route Groups `(name)/`** — Parentheses create logical groupings without affecting URL structure.

---

## 5. OWASP & CWE Alignment

### 5.1 Relevant CWE Entries

| CWE ID      | Name                                         | Next.js Mitigation                               |
| ----------- | -------------------------------------------- | ------------------------------------------------ |
| **CWE-200** | Exposure of Sensitive Information            | Use non-prefixed env vars for secrets            |
| **CWE-522** | Insufficiently Protected Credentials         | Store in `.env.local`, never commit              |
| **CWE-829** | Untrusted Functionality Inclusion            | Validate all API inputs server-side              |
| **CWE-306** | Missing Authentication for Critical Function | Use Auth0 `getSession()` in all protected routes |
| **CWE-862** | Missing Authorization                        | Verify user owns resources before returning      |
| **CWE-20**  | Improper Input Validation                    | Use Zod or similar for request validation        |

### 5.2 OWASP API Security Top 10 (2023)

| OWASP ID      | Risk                                       | Implementation Guidance                           |
| ------------- | ------------------------------------------ | ------------------------------------------------- |
| **API1:2023** | Broken Object Level Authorization          | Always verify `userId` matches resource owner     |
| **API2:2023** | Broken Authentication                      | Use Auth0 SDK properly; validate JWTs server-side |
| **API3:2023** | Broken Object Property Level Authorization | Return only fields the user should see            |
| **API4:2023** | Unrestricted Resource Consumption          | Implement rate limiting (Vercel provides this)    |
| **API5:2023** | Broken Function Level Authorization        | Check user role/permissions in every API route    |
| **API7:2023** | Server Side Request Forgery                | Validate URLs before making external requests     |
| **API8:2023** | Security Misconfiguration                  | Use secure defaults; review CORS settings         |

---

## 6. Authentication & Authorization Patterns

### 6.1 Auth0 Integration Pattern

```javascript
// app/api/licenses/route.js
import { getSession } from "@auth0/nextjs-auth0";
import { NextResponse } from "next/server";

export async function GET() {
  // 🔒 Always verify authentication first
  const session = await getSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.sub;

  // 🔒 Fetch only resources belonging to this user
  const licenses = await getLicensesForUser(userId);

  return NextResponse.json({ licenses });
}
```

### 6.2 Protected Page Pattern

```javascript
// app/(dashboard)/layout.jsx
import { getSession } from "@auth0/nextjs-auth0";
import { redirect } from "next/navigation";

export default async function DashboardLayout({ children }) {
  const session = await getSession();

  if (!session?.user) {
    redirect("/api/auth/login");
  }

  return <div className="dashboard-layout">{children}</div>;
}
```

### 6.3 API Input Validation Pattern

```javascript
// app/api/checkout/route.js
import { z } from "zod";
import { getSession } from "@auth0/nextjs-auth0";
import { NextResponse } from "next/server";

const CheckoutSchema = z.object({
  priceId: z.string().startsWith("price_"),
  quantity: z.number().int().min(1).max(1000),
});

export async function POST(request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 🔒 Validate and sanitize all input
  const body = await request.json();
  const result = CheckoutSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Invalid request", details: result.error.issues },
      { status: 400 },
    );
  }

  const { priceId, quantity } = result.data;

  // Now safe to use priceId and quantity
  // ...
}
```

---

## 7. Webhook Security

### 7.1 Stripe Webhook Verification

```javascript
// app/api/webhook/stripe/route.js
import Stripe from "stripe";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(request) {
  const body = await request.text();
  const signature = headers().get("stripe-signature");

  let event;

  try {
    // 🔒 Verify webhook signature before processing
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error("Webhook signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Now safe to process event
  switch (event.type) {
    case "checkout.session.completed":
      // Handle successful checkout
      break;
    // ... other cases
  }

  return NextResponse.json({ received: true });
}
```

---

## 8. Pre-Deployment Checklist

### 8.1 Environment & Secrets

- [ ] `.env.local` is in `.gitignore`
- [ ] `.env.example` exists with placeholder values (no real secrets)
- [ ] All secrets use non-prefixed variable names
- [ ] Production secrets are set in deployment platform (Vercel/AWS)
- [ ] `AUTH0_SECRET` is at least 32 characters, randomly generated

### 8.2 Authentication

- [ ] All API routes check `getSession()` before processing
- [ ] Protected pages redirect to login if no session
- [ ] User can only access their own resources (BOLA prevention)

### 8.3 Input Validation

- [ ] All API routes validate request bodies with Zod or similar
- [ ] File uploads are validated for type and size
- [ ] Query parameters are sanitized

### 8.4 Webhooks

- [ ] Stripe webhook signature is verified before processing
- [ ] Webhook endpoint is rate-limited
- [ ] Idempotency is handled (duplicate events don't cause issues)

### 8.5 Headers & CORS

- [ ] CORS is configured appropriately in `next.config.js`
- [ ] Security headers are set (CSP, X-Frame-Options, etc.)
- [ ] HTTPS is enforced in production

---

## 9. Additional Resources

### 9.1 Next.js Documentation

- [Server Components vs Client Components](https://nextjs.org/docs/app/building-your-application/rendering/server-components)
- [Environment Variables](https://nextjs.org/docs/app/building-your-application/configuring/environment-variables)
- [Route Handlers (API Routes)](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)

### 9.2 Auth0 Documentation

- [Auth0 Next.js SDK](https://auth0.com/docs/quickstart/webapp/nextjs)
- [Protecting API Routes](https://auth0.com/docs/quickstart/webapp/nextjs/02-user-profile)

### 9.3 Security References

- [OWASP API Security Top 10](https://owasp.org/API-Security/editions/2023/en/0x00-header/)
- [CWE Top 25 Most Dangerous Software Weaknesses](https://cwe.mitre.org/top25/)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)

---

## 10. Document History

| Date       | Author         | Change           |
| ---------- | -------------- | ---------------- |
| 2026-01-22 | GitHub Copilot | Initial creation |

---

_This document should be reviewed and updated as the project architecture evolves._
