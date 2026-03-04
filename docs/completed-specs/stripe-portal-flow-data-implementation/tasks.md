# Implementation Plan

- [x] 1. Rewrite `src/app/api/portal/stripe-session/route.js` with flow_data deep links
  - Parse JSON request body to extract `flow` (string) and optional `quantity` (number)
  - Validate `flow` parameter — valid values: `switch_to_annual`, `switch_to_monthly`, `adjust_seats`, `update_payment`, `cancel`
  - Reject requests without a valid `flow` (400) — no generic portal sessions allowed
  - Import `STRIPE_PRICES` from `@/lib/constants`
  - For subscription flows (`switch_to_annual`, `switch_to_monthly`, `adjust_seats`, `cancel`): fetch active subscription via `stripe.subscriptions.list({ customer, status: "active", limit: 1 })`
  - Reject if no active subscription found (404)
  - For billing cycle switches: derive target price server-side from `STRIPE_PRICES[customer.accountType][targetCycle]` — never from user input
  - Reject if already on target cycle (400)
  - For `adjust_seats`: reject if `accountType === "individual"` (400); validate `quantity` is integer 1–99 (400)
  - Build `flow_data` per flow type:
    - `switch_to_annual` / `switch_to_monthly`: `{ type: "subscription_update_confirm", subscription_update_confirm: { subscription, items: [{ id, price: targetPriceId, quantity: currentQuantity }] } }`
    - `adjust_seats`: `{ type: "subscription_update_confirm", subscription_update_confirm: { subscription, items: [{ id, price: currentPriceId, quantity: validatedQuantity }] } }`
    - `update_payment`: `{ type: "payment_method_update" }`
    - `cancel`: `{ type: "subscription_cancel", subscription_cancel: { subscription } }`
  - _Bug_Condition: isBugCondition(request) where sessionParams.flow_data IS UNDEFINED — eliminated by requiring flow param and always building flow_data_
  - _Expected_Behavior: Every session includes flow_data with correct type and server-derived price_
  - _Preservation: Cognito JWT auth, 404 on missing customer, tier-specific portal config ID, return URL /portal/billing?updated=true_
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11_

- [x] 2. Rewrite `src/app/portal/billing/page.js` with targeted action buttons and inline invoices
  - Replace `handleManageSubscription()` with `handlePortalAction(flow, options = {})`
  - All fetch calls to stripe-session include `Content-Type: application/json` and `JSON.stringify({ flow, ...options })` body
  - Replace generic "Manage Subscription" button with:
    - "Switch to Annual (Save 17%)" for monthly subscribers / "Switch to Monthly" for annual subscribers
    - Seat adjustment UI for Business: number input (min 1, max 99), "Update Seats" button, "Contact sales" message at 100+
    - "Update Payment Method" button → `handlePortalAction("update_payment")`
    - "Cancel Subscription" button → `handlePortalAction("cancel")`
  - Hide seat adjustment UI entirely for Individual accounts
  - Remove "View Invoices" button that opened generic portal
  - Fetch invoices from `/api/portal/invoices` on page load, display inline table with date, amount, status, PDF download link
  - Add `seatCount` state for Business seat input, `invoices` state for inline invoice list
  - _Requirements: 2.5, 2.6, 2.7, 2.8, 2.10, 2.11, 2.12, 3.4, 3.5, 3.6_

- [x] 3. Create `src/app/api/portal/invoices/route.js` — new invoices API
  - GET handler with Cognito JWT auth (same `verifyAuthToken()` pattern as billing route)
  - Customer lookup via `getCustomerByEmail()` (same pattern)
  - Fetch invoices: `stripe.invoices.list({ customer: stripeCustomerId, limit: 12 })`
  - Return formatted array: `{ id, date, amount, currency, status, pdfUrl }` mapped from Stripe invoice objects
  - 401 for missing/invalid JWT, 404 for missing Stripe customer
  - _Requirements: 2.12, 2.13_

- [x] 4. Remove dead code from `src/lib/stripe.js`
  - Delete `createPortalSession()` function entirely — dead code that creates generic sessions without flow_data
  - All other exports unchanged: `getStripeClient`, `createCheckoutSession`, `updateSubscriptionQuantity`, `verifyWebhookSignature`, etc.
  - _Requirements: 2.14, 3.9, 3.10, 3.11_

- [x] 5. Delete `scripts/patch-portal-products.js`
  - Remove entirely — the `products` parameter approach is dead (Stripe silently ignores it)
  - _Requirements: 2.15_

- [x] 6. Run all existing tests, fix any that broke due to changes — restore to 100% passing

  - [x] 6.1 Update `__tests__/unit/lib/stripe.test.js`
    - Remove `createPortalSession` describe block and import
    - All other test blocks unchanged: `getStripeClient`, `createCheckoutSession`, `updateSubscriptionQuantity`, `verifyWebhookSignature`, `STRIPE_PRODUCTS`, `STRIPE_COUPONS`
    - _Requirements: 3.9, 3.10, 3.11_

  - [x] 6.2 Update `__tests__/unit/api/portal.test.js`
    - Update `portal/stripe-session API logic` describe block to match new request/response contract
    - Remove tests for generic session creation (no longer valid)
    - Ensure existing auth and customer-lookup tests still pass
    - _Requirements: 3.1, 3.2, 3.3, 3.7_

  - [x] 6.3 Run full test suite, confirm 100% passing
    - Run all unit tests locally
    - Fix any remaining failures caused by the source code changes
    - Do not proceed until all tests pass

- [x] 7. Expand tests to cover all new behavior — bring to 100% passing

  - [x] 7.1 Test each flow type produces correct flow_data structure
    - **Property 1: Fault Condition** — Every Portal Session Uses flow_data
    - Test `switch_to_annual` → `flow_data.type === "subscription_update_confirm"` with annual price from `STRIPE_PRICES`
    - Test `switch_to_monthly` → `flow_data.type === "subscription_update_confirm"` with monthly price from `STRIPE_PRICES`
    - Test `adjust_seats` → `flow_data.type === "subscription_update_confirm"` with current price and validated quantity
    - Test `update_payment` → `flow_data.type === "payment_method_update"`
    - Test `cancel` → `flow_data.type === "subscription_cancel"` with subscription ID
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 2.7, 2.10, 2.11_

  - [x] 7.2 Test server-side price derivation
    - Verify target price for Individual annual switch = `STRIPE_PRICES.individual.annual`
    - Verify target price for Individual monthly switch = `STRIPE_PRICES.individual.monthly`
    - Verify target price for Business annual switch = `STRIPE_PRICES.business.annual`
    - Verify target price for Business monthly switch = `STRIPE_PRICES.business.monthly`
    - Verify no user-supplied price ID is ever used
    - _Requirements: 2.2, 2.3_

  - [x] 7.3 Test all guard rails
    - Missing `flow` → 400
    - Invalid `flow` value → 400
    - `adjust_seats` with `accountType === "individual"` → 400
    - `quantity` < 1, > 99, non-integer, null, string → 400
    - No active subscription → 404
    - Already on target billing cycle → 400
    - _Requirements: 2.4, 2.7, 2.8, 2.9_

  - [x] 7.4 Test invoices API
    - Valid request returns formatted invoice array with `{ id, date, amount, currency, status, pdfUrl }`
    - 401 for missing/invalid JWT
    - 404 for missing Stripe customer
    - _Requirements: 2.12, 2.13_

  - [x] 7.5 Test preservation properties
    - **Property 2: Preservation** — Unchanged Auth, Error Handling, and Non-Portal Functions
    - 401 for missing/invalid JWT on stripe-session endpoint (unchanged)
    - 404 for missing Stripe customer on stripe-session endpoint (unchanged)
    - Tier-specific portal config ID applied to every session (unchanged)
    - Return URL is `/portal/billing?updated=true` (unchanged)
    - `createCheckoutSession()`, `updateSubscriptionQuantity()`, `verifyWebhookSignature()` unchanged
    - `createPortalSession` no longer exported from `stripe.js`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.7, 3.9, 3.10, 3.11_

  - [x] 7.6 Property-based tests for random input validation
    - Generate random `{ accountType, flow, quantity }` tuples: valid combos → correct `flow_data.type`; target price always matches `STRIPE_PRICES[accountType][cycle]`; invalid combos → appropriate error
    - Generate random `quantity` values (integers, floats, negatives, strings, nulls) for `adjust_seats` → validation rejects all invalid inputs
    - _Requirements: 2.4, 2.7, 2.8, 2.9_

  - [x] 7.7 Run full test suite, confirm 100% passing
    - Run all unit tests locally
    - Fix any failures
    - Do not proceed until all tests pass

- [x] 8. Commit and push to development, CI/CD pipeline
  - `git add -A && git commit` with descriptive message
  - `git push origin development`
  - Merge `origin development` to trigger Amplify build and automated tests
  - Verify CI/CD pipeline passes

- [ ] 9. E2E manual verification
  - Individual monthly → "Switch to Annual" → Stripe shows Individual annual price only (no sidebar)
  - Individual annual → "Switch to Monthly" → Stripe shows Individual monthly price only (no sidebar)
  - Business monthly → "Switch to Annual" → Stripe shows Business annual price only (no sidebar)
  - Business annual → "Switch to Monthly" → Stripe shows Business monthly price only (no sidebar)
  - Business → "Update Seats" with valid quantity → Stripe shows seat change with proration (no sidebar)
  - Individual → no seat adjustment UI visible
  - Any customer → "Update Payment Method" → Stripe payment method page (no sidebar)
  - Any customer → "Cancel Subscription" → Stripe cancellation flow (no sidebar)
  - Any customer → invoice list displayed inline with PDF download links (no portal redirect)
  - Verify no customer can reach the generic Stripe portal UI with sidebar navigation

- [ ] 10. Post-verification cleanup
  - Update any relevant docs
  - Mark spec complete
  - Relocate spec artifacts to `docs/completed-specs/stripe-portal-flow-data-implementation/`

- [ ] 11. Final commit/push workflow
  - Push to `development`, merge `origin development`
  - Push to `main`, merge `origin main`
  - Checkout `development`
