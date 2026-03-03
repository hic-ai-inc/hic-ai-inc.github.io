# Stripe Portal flow_data Implementation — Bugfix Design

## Overview

The Stripe Billing Portal Configuration API silently ignores the `features.subscription_update.products` parameter. When `subscription_update` is enabled (required for `flow_data` deep links), the generic portal exposes ALL products to ALL customers. The current `stripe-session/route.js` creates generic portal sessions without `flow_data`, allowing Individual customers to see Business prices and vice versa. A cross-tier switch would corrupt state across Stripe, DynamoDB, and Keygen.

The fix eliminates generic portal sessions entirely. Every portal interaction routes through a `flow_data` deep link that targets exactly one action. The target price is always derived server-side from `accountType` + `STRIPE_PRICES`, making cross-tier switching structurally impossible. The billing page UI is rewritten to present discrete action buttons instead of a single "Manage Subscription" catch-all. Dead code (`createPortalSession()` in `stripe.js`, `scripts/patch-portal-products.js`) is removed.

## Glossary

- **Bug_Condition (C)**: Any portal session created without `flow_data` — the customer reaches the generic Stripe portal UI where all products across all tiers are visible and selectable
- **Property (P)**: Every portal session MUST include a `flow_data` deep link targeting exactly one action, with the target price derived server-side from `accountType` + `STRIPE_PRICES`
- **Preservation**: Cognito JWT auth, 404 on missing Stripe customer, tier-specific portal config IDs, return URL redirect with `?updated=true`, billing data display, 403 for non-owners, `getStripeClient()` lazy init, `STRIPE_PRICES` constants, `createCheckoutSession()`, `updateSubscriptionQuantity()`, `verifyWebhookSignature()`
- **flow_data**: Stripe Billing Portal parameter that deep-links the customer directly to a specific action (subscription update, cancellation, payment method update), bypassing the generic portal sidebar
- **accountType**: DynamoDB field (`"individual"` or `"business"`) that determines which `STRIPE_PRICES` tier to use for server-side price derivation
- **STRIPE_PRICES**: Constant in `src/lib/constants.js` mapping `{individual,business}.{monthly,annual}` to Stripe price IDs from environment variables

## Bug Details

### Fault Condition

The bug manifests when any customer clicks any button on the billing page that opens the Stripe portal. The `POST /api/portal/stripe-session` handler creates a `billingPortal.sessions.create()` call without `flow_data`, producing a generic portal session. The customer lands on the full Stripe portal UI with sidebar navigation, where all products across all tiers are browsable and selectable.

Additionally, `createPortalSession()` in `src/lib/stripe.js` is dead code that creates generic sessions without `flow_data` — if accidentally called in the future, it would bypass all cross-tier protection.

**Formal Specification:**
```
FUNCTION isBugCondition(request)
  INPUT: request of type PortalSessionRequest
  OUTPUT: boolean

  // The bug condition is: a portal session is created without flow_data
  sessionParams := buildSessionParams(request)
  RETURN sessionParams.flow_data IS UNDEFINED OR sessionParams.flow_data IS NULL
END FUNCTION
```

### Examples

- Individual monthly subscriber clicks "Manage Subscription" → generic portal opens → sees Business $35/seat/mo price → can switch to Business tier → Stripe subscription changes but DynamoDB `accountType` stays "individual" and Keygen license stays individual type → **state corruption**
- Business annual subscriber clicks "Switch to Annual" → same generic portal opens (the button calls the same `handleManageSubscription()`) → sees Individual $150/yr price → can switch to Individual tier → **state corruption**
- Any subscriber clicks "View Invoices" → generic portal opens with full sidebar → can navigate to subscription update and switch tiers → **state corruption**
- Any subscriber clicks "Update" on payment method → generic portal opens → can navigate away from payment method to subscription update → **state corruption**

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Cognito JWT authentication required in Authorization header for all portal API routes
- 404 response with "No Stripe customer found" when `stripeCustomerId` is missing
- Tier-specific portal configuration ID (`STRIPE_PORTAL_CONFIG_INDIVIDUAL` or `STRIPE_PORTAL_CONFIG_BUSINESS`) from AWS Secrets Manager applied to every session
- Return URL set to `/portal/billing?updated=true` with success banner on return
- Billing page fetches and displays plan name, billing cycle, amount, currency, subscription status, and payment method from `/api/portal/billing`
- Non-owner org members redirected to `/portal` (403 handling)
- `getStripeClient()` lazy initialization with secrets from AWS Secrets Manager
- `STRIPE_PRICES` constant from `src/lib/constants.js` continues to map tier → price IDs
- `createCheckoutSession()` for new subscriptions works unchanged
- `updateSubscriptionQuantity()` for programmatic Business seat changes works unchanged
- `verifyWebhookSignature()` for webhook processing works unchanged

**Scope:**
All inputs that do NOT involve portal session creation should be completely unaffected by this fix. This includes:
- GET `/api/portal/billing` data fetching
- Stripe webhook processing
- Checkout session creation for new subscriptions
- Cognito authentication flows
- DynamoDB customer lookups
- All other portal pages (license, devices, settings, team)

## Hypothesized Root Cause

Based on the bug description and code analysis, the root cause is confirmed (not hypothesized):

1. **Missing `flow_data` in session creation**: `stripe-session/route.js` line 68-71 calls `stripe.billingPortal.sessions.create()` with only `customer`, `return_url`, and optionally `configuration` — no `flow_data` parameter. This produces a generic portal session where the customer sees the full Stripe portal UI with all products visible.

2. **Single generic handler for all actions**: The billing page (`portal/billing/page.js`) has one function `handleManageSubscription()` that every button calls — "Manage Subscription", "Switch to Annual", "Update" payment method, and "View Invoices" all hit the same endpoint with no differentiation. The API has no way to know what action the customer intended.

3. **No request body parsing**: The `POST` handler never reads the request body. Even if the frontend sent a `flow` parameter, the backend would ignore it.

4. **Stripe silently ignores `products` parameter**: The portal configuration's `features.subscription_update.products` array is silently ignored by Stripe's API. The `patch-portal-products.js` script was an attempt to restrict visible products via configuration, but it has no effect. The only reliable way to restrict portal actions is `flow_data` deep links.

5. **Dead code risk**: `createPortalSession()` in `stripe.js` creates generic sessions without `flow_data`. If any future code path calls it, it bypasses all protection.

## Correctness Properties

Property 1: Fault Condition — Every Portal Session Uses flow_data

_For any_ portal session request with a valid `flow` parameter (`switch_to_annual`, `switch_to_monthly`, `adjust_seats`, `update_payment`, `cancel`), the fixed `POST /api/portal/stripe-session` handler SHALL create a `billingPortal.sessions.create()` call with a `flow_data` object whose `type` matches the requested action (`subscription_update_confirm`, `payment_method_update`, or `subscription_cancel`), and the target price (when applicable) SHALL be derived server-side from the customer's `accountType` in DynamoDB + `STRIPE_PRICES` constant.

**Validates: Requirements 2.1, 2.2, 2.3, 2.5, 2.6, 2.7, 2.10, 2.11**

Property 2: Fault Condition — Generic Sessions Rejected

_For any_ portal session request that is missing the `flow` parameter or provides an invalid `flow` value, the fixed handler SHALL reject the request with an error response, ensuring no generic portal session is ever created.

**Validates: Requirements 2.4, 2.14**

Property 3: Fault Condition — Cross-Tier Price Derivation

_For any_ portal session request for a billing cycle switch (`switch_to_annual` or `switch_to_monthly`), the target price in `flow_data` SHALL be derived from `STRIPE_PRICES[customer.accountType][targetCycle]`, never from user-supplied input, making cross-tier switching structurally impossible regardless of what the frontend sends.

**Validates: Requirements 2.2, 2.3**

Property 4: Fault Condition — Seat Adjustment Guards

_For any_ portal session request with `flow: "adjust_seats"`, the handler SHALL reject the request if `accountType` is `"individual"`, and SHALL validate that `quantity` is a positive integer between 1 and 99 inclusive for Business accounts.

**Validates: Requirements 2.7, 2.8, 2.9**

Property 5: Preservation — Unchanged Auth and Error Handling

_For any_ request to the portal session endpoint, the fixed handler SHALL produce the same authentication behavior (401 for missing/invalid JWT) and customer lookup behavior (404 for missing Stripe customer) as the original handler.

**Validates: Requirements 3.1, 3.2, 3.3, 3.7**

Property 6: Preservation — Unchanged Non-Portal Stripe Functions

_For any_ call to `createCheckoutSession()`, `updateSubscriptionQuantity()`, or `verifyWebhookSignature()`, the fixed codebase SHALL produce exactly the same behavior as the original codebase, since these functions are not modified.

**Validates: Requirements 3.9, 3.10, 3.11**

Property 7: Preservation — Billing Page Data Display

_For any_ billing page load, the fixed page SHALL continue to fetch and display the same subscription data (plan name, billing cycle, amount, currency, status, payment method) from `/api/portal/billing` as the original page.

**Validates: Requirements 3.4, 3.5, 3.6, 3.8**


## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct (and it is — the code confirms it):

**File**: `src/app/api/portal/stripe-session/route.js` — MAJOR REWRITE

**Function**: `POST(request)`

**Specific Changes**:
1. **Parse request body**: Read and parse JSON body to extract `flow` (string) and optional `quantity` (number)
2. **Validate `flow` parameter**: Guard clause rejecting requests without a valid `flow` value. Valid values: `switch_to_annual`, `switch_to_monthly`, `adjust_seats`, `update_payment`, `cancel`
3. **Fetch active subscription from Stripe**: For `switch_to_annual`, `switch_to_monthly`, `adjust_seats`, and `cancel` flows, call `stripe.subscriptions.list({ customer, status: "active", limit: 1 })` to get `subscription.id` and `subscription.items.data[0].id`
4. **Derive target price server-side**: For billing cycle switches, compute `targetCycle` from `flow` and look up `STRIPE_PRICES[customer.accountType][targetCycle]`. Never accept a price ID from the frontend.
5. **Build `flow_data` per flow type**:
   - `switch_to_annual` / `switch_to_monthly`: `{ type: "subscription_update_confirm", subscription_update_confirm: { subscription: subId, items: [{ id: itemId, price: targetPriceId, quantity: currentQuantity }] } }`
   - `adjust_seats`: `{ type: "subscription_update_confirm", subscription_update_confirm: { subscription: subId, items: [{ id: itemId, price: currentPriceId, quantity: validatedQuantity }] } }`
   - `update_payment`: `{ type: "payment_method_update" }`
   - `cancel`: `{ type: "subscription_cancel", subscription_cancel: { subscription: subId } }`
6. **Server-side guard rails**:
   - Reject `adjust_seats` when `accountType === "individual"` (400)
   - Validate `quantity` is integer, 1 ≤ quantity ≤ 99 (400)
   - Reject if no active subscription found (404)
   - Reject if already on target cycle for switch flows (400)
7. **Import `STRIPE_PRICES`**: Add import from `@/lib/constants`

---

**File**: `src/app/portal/billing/page.js` — MAJOR REWRITE

**Function**: Replace `handleManageSubscription()` with `handlePortalAction(flow, options)`

**Specific Changes**:
1. **New `handlePortalAction(flow, options = {})`**: Sends `POST` with JSON body `{ flow, ...options }` to `/api/portal/stripe-session`
2. **Replace "Manage Subscription" button**: Remove generic button. Replace with "Switch to Annual (Save 17%)" for monthly subscribers or "Switch to Monthly" for annual subscribers
3. **Add seat adjustment UI for Business**: Number input (min 1, max 99) with "Update Seats" button. Show "Contact sales for volume discounts" message when input ≥ 100
4. **Update payment method button**: Calls `handlePortalAction("update_payment")`
5. **Cancel subscription button**: Calls `handlePortalAction("cancel")`
6. **Inline invoices**: Fetch from `/api/portal/invoices` on page load, display table with date, amount, status, PDF download link. Remove "View Invoices" button that opened generic portal
7. **Add state for seats and invoices**: `seatCount` state for Business seat input, `invoices` state for inline invoice list
8. **Send JSON body**: All `fetch` calls to stripe-session include `Content-Type: application/json` and `JSON.stringify({ flow, quantity })` body

---

**File**: `src/app/api/portal/invoices/route.js` — NEW FILE (~60 lines)

**Function**: `GET(request)`

**Specific Changes**:
1. **Cognito JWT auth**: Same `verifyAuthToken()` pattern as billing route
2. **Customer lookup**: Same `getCustomerByEmail()` pattern
3. **Fetch invoices**: `stripe.invoices.list({ customer: stripeCustomerId, limit: 12 })`
4. **Format response**: Return array of `{ id, date, amount, currency, status, pdfUrl }` mapped from Stripe invoice objects

---

**File**: `src/lib/stripe.js` — DELETE DEAD CODE

**Function**: `createPortalSession()`

**Specific Changes**:
1. **Remove `createPortalSession()` function entirely**: It creates generic portal sessions without `flow_data`. Dead code that risks accidental future use.
2. **No other changes**: All other exports (`getStripeClient`, `createCheckoutSession`, `updateSubscriptionQuantity`, `verifyWebhookSignature`, etc.) remain unchanged.

---

**File**: `scripts/patch-portal-products.js` — DELETE ENTIRELY

**Specific Changes**:
1. **Delete the file**: The `products` parameter approach is dead — Stripe silently ignores it. This script has no effect and its existence is misleading.

---

**File**: `__tests__/unit/lib/stripe.test.js` — UPDATE

**Specific Changes**:
1. **Remove `createPortalSession` describe block**: The function no longer exists
2. **Remove `createPortalSession` from imports**: Clean up the import statement
3. **All other test blocks unchanged**: `getStripeClient`, `createCheckoutSession`, `updateSubscriptionQuantity`, `verifyWebhookSignature`, `STRIPE_PRODUCTS`, `STRIPE_COUPONS` tests remain

---

**File**: `__tests__/unit/api/portal.test.js` — UPDATE

**Specific Changes**:
1. **Update `portal/stripe-session API logic` describe block**: Replace generic session tests with flow_data-specific tests covering each flow type, validation, guard rails, and error cases

## Testing Strategy

### Implementation-First Workflow

The testing strategy follows an implementation-first approach. No failing tests are written before the fix is implemented. Instead:

1. **Implement all source code fixes** across all affected files
2. **Run all existing tests locally**, find any that broke due to the changes, and fix them to match the new correct behavior — restore to 100% passing
3. **Expand tests** (unit, contract, integration) to provide comprehensive coverage confirming all expectations about the newly-implemented behavior match reality — bring to 100% passing
4. **Commit/push to `development`**, merge `origin development` to run all automated tests in CI/CD and trigger an Amplify build
5. **E2E manual verification** — navigate through all billing page UI components linking to the Stripe customer portal using both an Individual and a Business account, verifying behavior matches expectations. If not, return to prior steps until the fix is complete.
6. **Post-verification cleanup** — update docs, mark the Spec complete, relocate all Spec artifacts to `docs/completed-specs/`
7. **Final commit/push** — push to `development`, merge `origin development`, push to `main`, merge `origin main`, checkout `development`

### What Tests Must Verify (Post-Fix)

#### Correctness Properties (Fix Checking)

- Every flow type (`switch_to_annual`, `switch_to_monthly`, `adjust_seats`, `update_payment`, `cancel`) produces the correct `flow_data` structure with the correct `flow_data.type`
- Target price for billing cycle switches is always derived from `STRIPE_PRICES[customer.accountType][targetCycle]` — never from user input
- Requests without a `flow` parameter are rejected (no generic portal sessions)
- Invalid `flow` values are rejected
- `adjust_seats` is rejected for Individual accounts
- Quantity is validated as a positive integer between 1 and 99 inclusive
- Requests with no active subscription are rejected for subscription-related flows
- Requests to switch to the current billing cycle are rejected
- Invoices API returns correctly formatted invoice data with PDF URLs
- `createPortalSession` is no longer exported from `stripe.js`

#### Preservation Properties (Regression Prevention)

- 401 response for missing/invalid JWT continues to work identically
- 404 response for missing Stripe customer continues to work identically
- Tier-specific portal config ID is still applied to every session
- Return URL is still `/portal/billing?updated=true`
- `createCheckoutSession()`, `updateSubscriptionQuantity()`, `verifyWebhookSignature()` are completely unchanged
- Billing page continues to fetch and display subscription data from `/api/portal/billing`

#### Property-Based Tests

- Generate random `{ accountType, flow, quantity }` tuples and verify: (a) valid combos produce correct `flow_data.type`, (b) target price always matches `STRIPE_PRICES[accountType][cycle]`, (c) invalid combos produce appropriate error responses
- Generate random `quantity` values (integers, floats, negatives, strings, nulls) for `adjust_seats` and verify validation rejects all invalid inputs

#### E2E Manual Verification Checklist

- Individual monthly → "Switch to Annual" → Stripe confirmation shows Individual annual price only
- Individual annual → "Switch to Monthly" → Stripe confirmation shows Individual monthly price only
- Business monthly → "Switch to Annual" → Stripe confirmation shows Business annual price only
- Business annual → "Switch to Monthly" → Stripe confirmation shows Business monthly price only
- Business → "Update Seats" with valid quantity → Stripe confirmation shows seat change and proration
- Individual → no seat adjustment UI visible
- Any customer → "Update" payment method → Stripe payment method page (no sidebar)
- Any customer → "Cancel Subscription" → Stripe cancellation flow (no sidebar)
- Any customer → invoice list displayed inline with PDF download links (no portal redirect)
- Verify no customer can reach the generic Stripe portal UI with sidebar navigation

