# Proposed Solution: `flow_data` Deep Links for All Portal Subscription Changes

**Date:** 2026-03-02 (v2, revised)
**Author:** Kiro (AI assistant) for review by Simon (SWR)
**Status:** APPROVED — ready for Spec mode implementation
**Relates to:** `20260302_URGENT_BUG_REPORT_RE_STRIPE_CUSTOMER_PORTAL_MISCONFIGURATION.md`

---

## The Problem

Stripe's `features.subscription_update.products` parameter is silently ignored on the Billing Portal Configuration API. Six attempts across three transport methods and two API versions all failed. Stripe's own support AI confirmed this is a "known limitation." Full details in the bug report.

**Confirmed impact:** Individual customers see Business prices in the portal. Business customers see Individual prices. Cross-tier switching is possible and would corrupt state across Stripe, DynamoDB, and Keygen.

## The Constraint Set

1. `subscription_update` must stay **enabled** — `flow_data.type: "subscription_update_confirm"` requires it
2. `products` cannot be set via API — Stripe silently drops it (confirmed bug)
3. When enabled without `products`, the generic portal shows ALL products to ALL customers (confirmed by testing)
4. The generic portal sidebar always shows subscription update navigation when `subscription_update` is enabled (confirmed by Stripe support AI)
5. Therefore: **no customer can ever reach the generic portal UI — every entry must be a `flow_data` deep link**

## The Solution

Route ALL portal interactions through `flow_data` deep links. Every action — billing cycle switch, seat adjustment, payment method update, cancellation — goes through a specific `flow_data.type` session. The customer is always sent to a targeted Stripe-hosted page for a single action. No portal browsing, no sidebar navigation, no cross-tier risk.

Invoices are handled by a custom UI in our billing page, fetching data from our existing invoices API route — not through the Stripe portal at all.

### Confirmed `flow_data.type` Values (Verified by Stripe Support AI)

| `flow_data.type` | Purpose |
|---|---|
| `subscription_update_confirm` | Confirm a specific subscription change (price switch, quantity change) |
| `subscription_cancel` | Direct to cancellation flow for a specific subscription |
| `payment_method_update` | Direct to adding/updating a payment method |
| `subscription_update` | Shows available subscription update options (NOT used — this is the browsing UI we're avoiding) |

### Confirmed: Compatible with Stripe Managed Payments (MoR)

Stripe support AI confirmed that `flow_data` deep links are fully compatible with Stripe Managed Payments as global Merchant of Record. Deep links customize the user flow within the existing portal infrastructure — they don't change the underlying payment processing or merchant relationship.

### How `flow_data` Works

**Billing cycle switch (Individual — no quantity):**
```js
const portalSession = await stripe.billingPortal.sessions.create({
  customer: stripeCustomerId,
  configuration: portalConfigId,
  flow_data: {
    type: "subscription_update_confirm",
    subscription_update_confirm: {
      subscription: "sub_xxx",
      items: [{
        id: "si_xxx",          // subscription item ID
        price: "price_xxx",    // target price (same tier, different interval)
        // No quantity — keeps existing quantity of 1
      }],
    },
    after_completion: {
      type: "redirect",
      redirect: { return_url: returnUrl },
    },
  },
});
```

**Seat adjustment (Business — with quantity):**
```js
const portalSession = await stripe.billingPortal.sessions.create({
  customer: stripeCustomerId,
  configuration: portalConfigId,
  flow_data: {
    type: "subscription_update_confirm",
    subscription_update_confirm: {
      subscription: "sub_xxx",
      items: [{
        id: "si_xxx",
        price: "price_xxx",    // same price
        quantity: 8,           // new seat count
      }],
    },
    after_completion: {
      type: "redirect",
      redirect: { return_url: returnUrl },
    },
  },
});
```

**Cancellation:**
```js
const portalSession = await stripe.billingPortal.sessions.create({
  customer: stripeCustomerId,
  configuration: portalConfigId,
  flow_data: {
    type: "subscription_cancel",
    subscription_cancel: {
      subscription: "sub_xxx",
    },
    after_completion: {
      type: "redirect",
      redirect: { return_url: returnUrl },
    },
  },
});
```

**Payment method update:**
```js
const portalSession = await stripe.billingPortal.sessions.create({
  customer: stripeCustomerId,
  configuration: portalConfigId,
  flow_data: {
    type: "payment_method_update",
    after_completion: {
      type: "redirect",
      redirect: { return_url: returnUrl },
    },
  },
});
```

The customer sees a Stripe-hosted page for the specific action only. No sidebar navigation, no browsing, no cross-tier exposure.

---

## What Changes and What Doesn't

### UNCHANGED

| File | Why |
|---|---|
| `src/lib/secrets.js` | Already returns tier-specific `bpc_` IDs correctly |
| `src/lib/stripe.js` | Already updated to `apiVersion: "2026-02-25.clover"` |
| `src/lib/constants.js` | Already has `STRIPE_PRICES` mapping tier → monthly/annual price IDs |
| `.env.local` | No changes to `bpc_` IDs or price IDs |
| AWS Secrets Manager | No changes |
| Both `bpc_` portal configs | Stay as-is. All features remain enabled. |

### CHANGED FILES

#### 1. `src/app/api/portal/stripe-session/route.js` — MAJOR

Currently creates a generic portal session with no `flow_data`. Needs to:

- Accept a `flow` parameter (and optional `quantity`) from the frontend request body
- For subscription changes, fetch the customer's current subscription from Stripe to get `subscription.id` and `subscription.items.data[0].id`
- Build the appropriate `flow_data` based on the flow type
- For payment method and cancellation, use their respective `flow_data.type` values
- **Never create a generic portal session** (no `flow_data`) — every call must include `flow_data`

**New request body:**
```json
{ "flow": "switch_to_annual" | "switch_to_monthly" | "adjust_seats" | "update_payment" | "cancel" }
```

For `adjust_seats`, also accepts:
```json
{ "flow": "adjust_seats", "quantity": 8 }
```

**Flow logic:**

| `flow` value | `flow_data.type` | Description |
|---|---|---|
| `"switch_to_annual"` | `subscription_update_confirm` | Target annual price for customer's tier, no quantity |
| `"switch_to_monthly"` | `subscription_update_confirm` | Target monthly price for customer's tier, no quantity |
| `"adjust_seats"` | `subscription_update_confirm` | Same price, new quantity (Business only) |
| `"update_payment"` | `payment_method_update` | Direct to payment method update |
| `"cancel"` | `subscription_cancel` | Direct to cancellation flow with subscription ID |

**No `"invoices"` flow.** Invoices are handled entirely in our own UI (see below).

**Server-side guard rails:**
- `flow` parameter is required — reject requests without it
- Target price determined from `customer.accountType` (DynamoDB) + `STRIPE_PRICES` constant — never from user input
- `adjust_seats` rejected for Individual customers (quantity is always 1)
- If customer has no active subscription → 400 (for subscription-related flows)
- If already on the target billing cycle → 400
- Quantity validated as positive integer, minimum 1, maximum 99 (100+ seats require contacting sales for volume discount)
- Subscription ID and item ID fetched from Stripe server-side — never from frontend

**Cross-tier switching is structurally impossible** because the target price is always derived from the customer's `accountType` in DynamoDB, not from any user-supplied value.

#### 2. `src/app/portal/billing/page.js` — MODERATE

Currently has two buttons that both call the same `handleManageSubscription()`:
- "Manage Subscription" — generic portal
- "Switch to Annual (Save 17%)" — shown for monthly subscribers, but opens the same generic portal

**Changes:**

Replace the generic "Manage Subscription" button with targeted action buttons. Each passes a different `flow` value to the API:

| Button | Shown When | `flow` value |
|---|---|---|
| "Switch to Annual (Save 17%)" | Monthly subscribers | `switch_to_annual` |
| "Switch to Monthly" | Annual subscribers | `switch_to_monthly` |
| "Update Seats" | Business customers | `adjust_seats` (with quantity from input) |
| "Update" (payment method card) | Payment method exists | `update_payment` |
| "Add Payment Method" | No payment method on file | `update_payment` |
| "Cancel Subscription" | Active subscribers | `cancel` |

**Seat adjustment UI (Business only):**
- Show current seat count from `subscription.quantity`
- Input field or +/- controls for new seat count (min 1, max 99)
- For 100+ seats, display message: "For 100+ seats, contact sales for volume discounts"
- "Update Seats" button → calls API with `{ flow: "adjust_seats", quantity: N }`
- Customer redirected to Stripe confirmation showing quantity change and prorated amount

**Invoice display:**
- Replace the "View Invoices" button (which currently opens the generic portal) with an inline invoice list
- Fetch from our existing `/api/portal/invoices` route
- Display invoice date, amount, status, and a "Download" link to the Stripe-hosted invoice PDF URL
- No portal redirect needed — invoices are fully rendered in our billing page

**Removed:** The generic "Manage Subscription" button. No customer ever reaches the generic portal UI.

#### 3. `src/app/api/portal/invoices/route.js` — MINOR (if needed)

An invoices API route already exists (found in `.next/dev/server/`). If it already returns invoice data with PDF URLs, no changes needed. If it needs to be created or extended, it would:
- Fetch invoices from Stripe: `stripe.invoices.list({ customer: stripeCustomerId, limit: 12 })`
- Return invoice date, amount, currency, status, and `invoice_pdf` URL for each
- Same auth pattern as the billing route (Cognito JWT)

#### 4. `plg-website/scripts/patch-portal-products.js` — RETIRE

No longer needed. The `products` approach is dead. Delete or archive after `flow_data` solution is confirmed working.

---

## Portal Configuration Summary (No Changes Needed)

| Feature | Individual Config | Business Config |
|---|---|---|
| `customer_update` | ✅ enabled | ✅ enabled |
| `payment_method_update` | ✅ enabled | ✅ enabled |
| `invoice_history` | ✅ enabled | ✅ enabled |
| `subscription_cancel` | ✅ at period end | ✅ at period end |
| `subscription_update` | ✅ enabled | ✅ enabled |
| `subscription_pause` | ❌ disabled | ❌ disabled |

All features stay enabled. The protection comes from never opening the portal without a targeted `flow_data` — the generic portal UI with its sidebar navigation is never reachable by any customer.

---

## User Journeys

### Individual Monthly → Switch to Annual

1. Customer logs in, navigates to Billing
2. Sees: "Individual — $15/month"
3. Sees button: "Switch to Annual (Save 17%)"
4. Clicks it
5. Frontend: `POST /api/portal/stripe-session` with `{ flow: "switch_to_annual" }`
6. Route: looks up customer (`accountType: "individual"`), fetches subscription from Stripe, builds `flow_data` targeting Individual Annual price ($150/yr), no quantity
7. Customer redirected to Stripe confirmation: "Switch from $15/month to $150/year — prorated credit of $X.XX"
8. Confirms → redirected to `/portal/billing?updated=true`
9. Success banner displayed

### Individual Annual → Switch to Monthly

Same flow, "Switch to Monthly" button, targets Individual Monthly price.

### Business Monthly → Switch to Annual

Same flow, targets Business Annual price.

### Business — Adjust Seats

1. Customer sees current seat count (e.g., 5 seats at $35/seat/month)
2. Changes to 8 in the seat input (max 99; 100+ shows "contact sales" message), clicks "Update Seats"
3. Frontend: `POST /api/portal/stripe-session` with `{ flow: "adjust_seats", quantity: 8 }`
4. Route: validates Business account, fetches subscription, builds `flow_data` with same price + `quantity: 8`
5. Customer sees Stripe confirmation: "Change from 5 seats to 8 seats — prorated charge of $X.XX"
6. Confirms → redirected back

### Update Payment Method

1. Clicks "Update" next to card on file (or "Add Payment Method")
2. Frontend: `POST /api/portal/stripe-session` with `{ flow: "update_payment" }`
3. Route: builds `flow_data` with `type: "payment_method_update"`
4. Customer lands directly on Stripe's payment method update page
5. Updates card → redirected back

### View Invoices

1. Customer sees invoice list directly in the Billing page (no portal redirect)
2. Each invoice shows date, amount, status
3. "Download" link opens the Stripe-hosted invoice PDF in a new tab
4. No portal interaction — zero cross-tier risk

### Cancel Subscription

1. Clicks "Cancel Subscription"
2. Frontend: `POST /api/portal/stripe-session` with `{ flow: "cancel" }`
3. Route: fetches subscription ID, builds `flow_data` with `type: "subscription_cancel"` and `subscription_cancel.subscription`
4. Customer lands on Stripe's cancellation flow (reason selection, confirmation)
5. Cancellation scheduled at period end → redirected back

---

## Files Changed (Final Summary)

| File | Change | Scope |
|---|---|---|
| `src/app/api/portal/stripe-session/route.js` | Accept `flow` param, build `flow_data` for all flows, fetch subscription from Stripe, reject requests without `flow` | Major |
| `src/app/portal/billing/page.js` | Replace generic button with targeted handlers per flow, add seat adjustment UI for Business, add "Switch to Monthly" button, inline invoice list, remove "Manage Subscription" | Major |
| `src/app/api/portal/invoices/route.js` | Verify existing route returns invoice data with PDF URLs; extend if needed | Minor |
| `src/lib/stripe.js` → `createPortalSession()` | Delete dead code — creates generic portal session without `flow_data`, bypassing cross-tier protection if ever called | Minor |
| `plg-website/scripts/patch-portal-products.js` | Retire (delete or archive) | Minor |

---

## Stripe Dashboard / Config Changes

None. Both `bpc_` configs stay exactly as they are.

---

## Codebase Audit: All Stripe Portal Entry Points

A full codebase search confirmed exactly two locations that create `billingPortal.sessions`:

1. **`src/app/api/portal/stripe-session/route.js`** (line 77) — the only runtime path. Modified by this proposal to require `flow_data` on every call. ✅

2. **`src/lib/stripe.js` → `createPortalSession()`** (line 211) — dead code. Not imported or called anywhere in the codebase. Creates a generic portal session with no `flow_data`. Must be deleted to prevent future accidental use that would bypass cross-tier protection. ✅

The frontend calls the stripe-session route from exactly one location: `src/app/portal/billing/page.js` → `handleManageSubscription()`, used by 5 buttons on the billing page. All other links to `/portal/billing` (portal dashboard, team page, nav constants, email templates) point to our billing page, not directly to Stripe.

---

## Security Considerations

- **Cross-tier switching is structurally impossible:** target price derived server-side from `accountType` in DynamoDB + `STRIPE_PRICES` constant
- **No generic portal access:** every portal entry uses `flow_data` — the portal's sidebar navigation (which includes subscription update browsing) is never reachable
- **Subscription ID and item ID fetched server-side** from Stripe — never from frontend
- **`adjust_seats` rejected for Individual accounts** server-side
- **Quantity validated** as positive integer (min 1, max 99) server-side; 100+ seats require contacting sales for volume discount
- **`flow` parameter required** — requests without it are rejected (no accidental generic portal sessions)
- **No new secrets or credentials required**
- **All existing auth (Cognito JWT) remains in place**
- **Invoice PDFs served from Stripe's CDN** — no sensitive data passes through our server beyond what the existing invoices route already handles
- **Compatible with Stripe Managed Payments (MoR)** — confirmed by Stripe support

---

## Resolved Decisions

1. **Seat adjustment bounds:** Min 1, max 99. For 100+ seats, the UI displays a message directing the customer to contact sales for volume discounts. The route rejects quantities outside this range with a 400 error.

2. **Invoices route:** No source file exists at `src/app/api/portal/invoices/route.js` — it must be created. Same auth pattern as the billing route. Calls `stripe.invoices.list()`, returns date, amount, currency, status, and `invoice_pdf` URL. Small file (~60 lines). This is additional scope.

3. **Proration display:** E2E verification task post-implementation. Stripe handles proration calculation and display on the confirmation page. Verify in test mode: monthly→annual credit, annual→monthly charge, seat increase charge, seat decrease credit.

4. **`products` array NOT required for deep links (RISK RESOLVED):** GPT-5.2's analysis flagged that Stripe's SDK docs state the price passed to `subscription_update_confirm` must appear in the configuration's `features.subscription_update.products` list. Stripe's support AI subsequently confirmed this is NOT the case for deep-link flows: `subscription_update_confirm` bypasses the portal configuration's product restrictions entirely. The deep link specifies the exact change — no product browsing occurs, so no product list is consulted. This behavior is consistent between test mode and live mode. The risk GPT-5.2 identified is fully resolved.

5. **Single subscription item limitation (FUTURE CONSIDERATION):** GPT-5.2 noted that `subscription_update_confirm` flows currently support only subscriptions with a single subscription item. If add-on products or multiple prices are added to a subscription in the future, this flow will not support updates. Not a launch blocker — Mouse subscriptions are single-item (one price per subscription). Document for future reference: if multi-item subscriptions are ever introduced, a different update interface will be needed.
