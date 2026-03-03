# Proposed Solution: `flow_data` Deep Links for All Portal Subscription Changes

**Date:** 2026-03-02 (revised)
**Author:** Kiro (AI assistant) for review by Simon (SWR)
**Status:** PROPOSAL v2 — awaiting review before implementation
**Relates to:** `20260302_URGENT_BUG_REPORT_RE_STRIPE_CUSTOMER_PORTAL_MISCONFIGURATION.md`

---

## The Problem

Stripe's `features.subscription_update.products` parameter is silently ignored on the Billing Portal Configuration API. Six attempts across three transport methods and two API versions all failed. Stripe's own support AI confirmed this is a "known limitation." Full details in the bug report.

**Confirmed impact:** Individual customers see Business prices in the portal. Business customers see Individual prices. Cross-tier switching is possible and would corrupt state across Stripe, DynamoDB, and Keygen.

## The Constraint Set

1. `subscription_update` must stay **enabled** — Business customers need seat adjustment
ps it (confirmed bug)
3. When enabled without `products`, the portal shows ALL products to ALL customers (confirmed by testing)
4. Therefore: **no customer can ever reach the generic subscription update browsing UI**

## The Solution

onfirmation screen — no browsing, no product selection.

The portal's generic subscription update UI is never shown to any customer. The portal is still used for payment methods, invoice history, and cancellation — none of which expose cross-tier products.

### How `flow_data` Works

```js
const portalSession = await stripe.billingPortal.sessions.create({
  customer: stripeCustomerId,
  configuration: portalConfigId,
  return_url: returnUrl,
  flow_data: {
    type: "subscription_update_confirm",
    subsc_update_confirm: {
      subscription: "sub_xxx",
      items: [{
        id: "si_xxx",          // subscription item ID
        price: "price_xxx",    // target price (same tier, different interval)
        quantity: 5,           // optional — for seat adjustment
      }],
    },
    after_completion: {
      type: "redirect",
      redirect: { return_url: returnUrl },
    },
  },
});
```

The customer sees a  a Confirm button. Nothing else.

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

### Portal Configurations (Both `bpc_` Configs)

**No changes needed.** `subscription_update` stays enabled (required for `flow_data` to work). Payment methods, invoices, and cancellation remain enabled. The configs are fine as-is — we're just never opening the portal in a way that lets the customer browse subscription updates.

### CHANGED FILES

#### 1. `src/app/api/portal/stripe-session/route.js` — MAJOR

Currently creates a generic portal session with no `flow_data`. Needs to:

- Accept a `flow` parameter from the frontend request body
tch the customer's current subscription from Stripe to get `subscription.id` and `subscription.items.data[0].id`
- Build the appropriate `flow_data` based on the flow type
- For non-subscription actions (payment methods, invoices, cancellation), open the portal without `flow_data` — the customer lands on the portal home page where only payment/invoice/cancel options are available

**New request body:**
```json
{ "flow": "switch_to_annual" | "switch_to_monthly" | "adjust_seats" | "manage" }
```

Falso accepts:
```json
{ "flow": "adjust_seats", "quantity": 8 }
```

**Flow logic:**

| `flow` value | Action |
|---|---|
| `"switch_to_annual"` | `flow_data` targeting the annual price for the customer's current tier |
| `"switch_to_monthly"` | `flow_data` targeting the monthly price for the customer's current tier |
| `"adjust_seats"` | `flow_data` with same price, new quantity (Business only) |
| `"manage"` or omitted | Generic portal session (no `flow_data`) — payment methods, invoices, cancellation |

**Server-side guard rails:**
- Target price determined from `customer.accountType` (DynamoDB) + `STRIPE_PRICES` constant — never from user input
- `adjust_seats` rejected for Individual customers (quantity is always 1)
- If customer has no active subscription → 400
- If already on the target billing cycle → 400
- Subscription ID and item ID fetched from Stripe server-side — never from frontend

ccountType` in DynamoDB, not from any user-supplied value.

#### 2. `src/app/portal/billing/page.js` — MODERATE

Currently has two buttons that both call the same `handleManageSubscription()`:
- "Manage Subscription" — generic portal
- "Switch to Annual (Save 17%)" — shown for monthly subscribers, but opens the same generic portal

**Changes:**

- `handleManageSubscription()` → split into multiple handlers, each passing a different `flow` value to the API
- "Switch to Annual (Save 17%)" → calls API with `{ f: "switch_to_annual" }`
- New "Switch to Monthly" button → shown for annual subscribers, calls API with `{ flow: "switch_to_monthly" }`
- "Manage Subscription" → calls API with `{ flow: "manage" }` — opens portal for payment/invoice/cancel only
- "Update" (payment method) → calls API with `{ flow: "manage" }` — same generic portal
- "View Invoices" → calls API with `{ flow: "manage" }` — same generic portal
y: N }`

**Seat adjustment UI (Business only):**
- Show current seat count
- Input field or +/- controls for new seat count
- "Update Seats" button → calls API with `{ flow: "adjust_seats", quantity: N }`
- Customer is redirected to Stripe confirmation page showing the quantity change and prorated amount

#### 3. `plg-website/scripts/patch-portal-products.js` — RETIRE

No longer needed. The `products` approach is dead

---

## Portal Configuration Summary (No Changes)

| Feature | Individual Config | Business Config |
|---|---|---|
| `customer_update` | ✅ enabled | ✅ enabled |
| `payment_method_update` | ✅ enabled | ✅ enabled |
| `invoice_history` | ✅ enabled | ✅ enabled |
| `subscription_cancel` | ✅ at period end | ✅ at period end |
| `subscription_update` | ✅ enabled | ✅ enabled |
| `subscription_pause` | ❌ disabled | ❌ disabled |

end never opens the portal without `flow_data` for subscription-related actions.

---

## User Journeys

### Individual Monthly → Switch to Annual

1. Customer logs in, navigates to Billing
2. Sees: "Individual — $15/month" with buttons "Manage Subscription" | "Switch to Annual (Save 17%)"
3. Clicks "Switch to Annual (Save 17%)"
4. Frontend: `POST /api/portal/stripe-session` with `{ flow: "switch_to_annual" }`
5. w_data` targeting `price_1SuhAfA4W8nJ0u4T6u53DVXa` (Individual Annual $150)
6. Customer redirected to Stripe confirmation: "Switch from $15/month to $150/year — prorated credit of $X.XX"
7. Confirms → redirected to `/portal/billing?updated=true`
8. Success banner displayed

### Individual Annual → Switch to Monthly

Same flow, "Switch to Monthly" button, targets Individual Monthly price.

### Business Monthly → Switch to Annual

Same flow, targets Business Annual price.

### Business — Adjust Seats

 sees current seat count (e.g., 5 seats)
2. Changes to 8 in the seat input, clicks "Update Seats"
3. Frontend: `POST /api/portal/stripe-session` with `{ flow: "adjust_seats", quantity: 8 }`
4. Route: validates Business account, builds `flow_data` with same price + `quantity: 8`
5. Customer sees Stripe confirmation: "Change from 5 seats to 8 seats — prorated charge of $X.XX/month"
6. Confirms → done

### Any Customer — Payment Method / Invoices / Cancellation

1. Clicks "Manage Subscription", "Updatnt), or "View Invoices"
2. Frontend: `POST /api/portal/stripe-session` with `{ flow: "manage" }`
3. Opens generic portal — shows payment methods, invoice history, cancellation
4. **Subscription update browsing is technically available in the portal UI** but the customer was not directed there. See Risk Mitigation below.

---

## Risk Mitigation: Generic Portal Still Has Subscription Update

l), the portal's sidebar/navigation still includes a "Update subscription" or "Change plan" link because `subscription_update` is enabled. If the customer clicks it, they'd see cross-tier products.

**Mitigation options (in order of preference):**

**A. Use `flow_data` for ALL portal entries.** Instead of a generic "Manage Subscription" button, provide separate buttons:
- "Update Payment Method" → `flow_data.type: "payment_method_update"`
- "View Invoices" → generic portal nges)
- "Cancel Subscription" → `flow_data.type: "subscription_cancel"`

This eliminates the generic portal entry entirely. The customer only ever sees targeted flows. The portal's subscription update browsing UI is never reachable.

**B. Accept the residual risk.** The customer would have to actively navigate away from their intended action (payment/invoices/cancel) and click into subscription updates. This is unlikely but not impossible.

**Recommendat the route (supporting `flow_data.type` values for `payment_method_update` and `subscription_cancel`) and completely eliminates the risk. Every portal entry is a targeted deep link.

---

## Files Changed (Final Summary)

| File | Change | Scope |
|---|---|---|
| `src/app/api/portal/stripe-session/route.js` | Accept `flow` param, build `flow_data` for all flows, fetch subscription from Stripe | Major |
s, add "Switch to Monthly" button | Moderate |
| `plg-website/scripts/patch-portal-products.js` | Retire (delete or archive) | Minor |

---

## Stripe Dashboard / Config Changes

None. Both `bpc_` configs stay exactly as they are.

---

## Security Considerations

- Cross-tier switching is structurally impossible: target price derived server-side from `accountType` in DynamoDB
- Subscription ID and item ID fetched server-side from Stripe — never from frontend
server-side
- Quantity validated as positive integer server-side
- No new secrets or credentials required
- All existing auth (Cognito JWT) remains in place

---

## Open Questions
?** Same question. Need to verify.

3. **Proration display accuracy.** Stripe handles proration on the confirmation page. Should be verified in test mode before launch.

4. **Seat adjustment minimum/maximum.** Should we enforce min 1 / max N seats in our route, or let Stripe handle validation?

1. **Does `flow_data.type: "payment_method_update"` exist?** Need to verify this is a valid flow type in the Stripe API. If not, we may need to use the generic portal for payment method updates and accept the residual risk for that one entry point, or find another approach.

2. **Does `flow_data.type: "subscription_cancel"` exist