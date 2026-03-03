# Bugfix Requirements Document

## Introduction

Stripe's `features.subscription_update.products` parameter is silently ignored on the Billing Portal Configuration API. When `subscription_update` is enabled (required for `flow_data` deep links), the generic portal exposes ALL products to ALL customers. Individual customers see Business prices and vice versa. Cross-tier switching (Individual ↔ Business) is possible and would corrupt state across Stripe, DynamoDB, and Keygen.

The current `src/app/api/portal/stripe-session/route.js` creates generic portal sessions without `flow_data`. Every button on the billing page opens the same unrestricted Stripe portal with full sidebar navigation, allowing customers to browse and switch to any product/price including cross-tier switches.

Additionally, `src/lib/stripe.js` contains a dead `createPortalSession()` function that creates generic portal sessions without `flow_data` — if ever accidentally called, it would bypass all cross-tier protection.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a customer opens the Stripe portal via any button on the billing page THEN the system creates a generic portal session without `flow_data`, exposing the full portal UI with sidebar navigation where all products across all tiers are visible and selectable

1.2 WHEN an Individual customer opens the Stripe portal THEN the system shows Business prices ($35/seat/mo, $350/seat/yr) alongside Individual prices, allowing the customer to switch to a Business plan

1.3 WHEN a Business customer opens the Stripe portal THEN the system shows Individual prices ($15/mo, $150/yr) alongside Business prices, allowing the customer to switch to an Individual plan

1.4 WHEN a customer completes a cross-tier switch through the generic portal THEN the system corrupts state across Stripe (wrong product), DynamoDB (accountType mismatch), and Keygen (license type mismatch)

1.5 WHEN the billing page renders for any customer THEN the system shows a single generic "Manage Subscription" button and a "Switch to Annual" button that both open the same unrestricted generic portal session

1.6 WHEN a customer clicks "View Invoices" on the billing page THEN the system redirects to the generic Stripe portal (with full sidebar navigation and cross-tier exposure) instead of displaying invoices inline

1.7 WHEN the `createPortalSession()` function in `src/lib/stripe.js` exists as dead code THEN the system retains a code path that creates generic portal sessions without `flow_data`, risking accidental future use that bypasses cross-tier protection

1.8 WHEN the `scripts/patch-portal-products.js` script exists THEN the system retains dead code based on the `products` parameter approach that Stripe silently ignores

### Expected Behavior (Correct)

2.1 WHEN a customer initiates any portal action THEN the system SHALL create a portal session with a specific `flow_data` deep link targeting only the requested action, never a generic portal session

2.2 WHEN an Individual customer requests a billing cycle switch THEN the system SHALL derive the target price server-side from `accountType: "individual"` in DynamoDB + `STRIPE_PRICES` constant, making cross-tier switching structurally impossible

2.3 WHEN a Business customer requests a billing cycle switch THEN the system SHALL derive the target price server-side from `accountType: "business"` in DynamoDB + `STRIPE_PRICES` constant, making cross-tier switching structurally impossible

2.4 WHEN the API receives a portal session request without a `flow` parameter THEN the system SHALL reject the request with an error (no generic portal sessions allowed)

2.5 WHEN the billing page renders for a monthly subscriber THEN the system SHALL show a "Switch to Annual" button that sends `{ flow: "switch_to_annual" }` to the API

2.6 WHEN the billing page renders for an annual subscriber THEN the system SHALL show a "Switch to Monthly" button that sends `{ flow: "switch_to_monthly" }` to the API

2.7 WHEN the billing page renders for a Business customer THEN the system SHALL show a seat adjustment UI (input field, min 1, max 99) with an "Update Seats" button that sends `{ flow: "adjust_seats", quantity: N }` to the API

2.8 WHEN a Business customer requests 100+ seats THEN the system SHALL display a "contact sales for volume discounts" message instead of allowing the adjustment

2.9 WHEN an Individual customer attempts to adjust seats THEN the system SHALL reject the request server-side (Individual quantity is fixed at 1)

2.10 WHEN a customer clicks "Update" on their payment method or "Add Payment Method" THEN the system SHALL create a portal session with `flow_data.type: "payment_method_update"`

2.11 WHEN a customer clicks "Cancel Subscription" THEN the system SHALL create a portal session with `flow_data.type: "subscription_cancel"` including the subscription ID

2.12 WHEN the billing page renders the invoices section THEN the system SHALL fetch invoices from `/api/portal/invoices` and display them inline with date, amount, status, and a download link to the Stripe-hosted PDF — no portal redirect

2.13 WHEN the invoices API is called THEN the system SHALL fetch invoices from Stripe via `stripe.invoices.list()` and return date, amount, currency, status, and `invoice_pdf` URL, using the same Cognito JWT auth pattern as other portal routes

2.14 WHEN the `createPortalSession()` dead code in `src/lib/stripe.js` is removed THEN the system SHALL have no code path capable of creating a generic portal session without `flow_data`

2.15 WHEN the `scripts/patch-portal-products.js` script is removed THEN the system SHALL have no dead code based on the defunct `products` parameter approach

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a customer authenticates to the billing page THEN the system SHALL CONTINUE TO require a valid Cognito JWT in the Authorization header

3.2 WHEN a customer without a Stripe customer ID attempts to access portal features THEN the system SHALL CONTINUE TO return a 404 error with "No Stripe customer found"

3.3 WHEN the system creates a portal session THEN the system SHALL CONTINUE TO use the tier-specific portal configuration ID (`STRIPE_PORTAL_CONFIG_INDIVIDUAL` or `STRIPE_PORTAL_CONFIG_BUSINESS`) from AWS Secrets Manager

3.4 WHEN a customer completes a portal action and returns THEN the system SHALL CONTINUE TO redirect to `/portal/billing?updated=true` and display a success banner

3.5 WHEN the billing page loads THEN the system SHALL CONTINUE TO fetch and display current plan name, billing cycle, amount, currency, subscription status, and payment method details from `/api/portal/billing`

3.6 WHEN a non-owner user attempts to access the billing page THEN the system SHALL CONTINUE TO redirect them to `/portal` (403 handling)

3.7 WHEN the Stripe client is initialized THEN the system SHALL CONTINUE TO use secrets from AWS Secrets Manager via `getStripeSecrets()` and the `getStripeClient()` lazy initialization pattern

3.8 WHEN `STRIPE_PRICES` is referenced THEN the system SHALL CONTINUE TO use the existing constant from `src/lib/constants.js` mapping tier → monthly/annual price IDs from environment variables

3.9 WHEN the `createCheckoutSession()` function is called for new subscriptions THEN the system SHALL CONTINUE TO work unchanged

3.10 WHEN the `updateSubscriptionQuantity()` function is called THEN the system SHALL CONTINUE TO work unchanged

3.11 WHEN the `verifyWebhookSignature()` function is called THEN the system SHALL CONTINUE TO work unchanged
