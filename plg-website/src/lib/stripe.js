/**
 * Stripe Client Configuration
 *
 * Provides configured Stripe clients for:
 * - Server-side operations (using secret key)
 * - Client-side Stripe.js (using publishable key)
 *
 * @see Security Considerations for Stripe Payments
 */

import Stripe from "stripe";
import { loadStripe } from "@stripe/stripe-js";
import { HicLog, safeJsonParse } from "../../../dm/layers/base/src/index.js";

// Logger for Stripe operations
const createLogger = (operation) => new HicLog(`plg-stripe-${operation}`);

/**
 * Server-side Stripe client (lazy-initialized)
 * Use getStripeClient() to access - enables testing without API key
 */
let stripeClient = null;

/**
 * Injectable seam for testing - allows replacing the Stripe client
 * @param {Object} mockClient - Mock Stripe client (from createStripeMock())
 */
export function __setStripeClientForTests(mockClient) {
  stripeClient = mockClient;
}

/**
 * Reset the Stripe client (for test cleanup)
 */
export function __resetStripeClientForTests() {
  stripeClient = null;
}

/**
 * Get the current Stripe client (lazy-initialized, respects test injection)
 * Use this in functions that need the client
 */
export function getStripeClient() {
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2024-12-18.acacia",
      typescript: false,
    });
  }
  return stripeClient;
}

// Export getter for backward compatibility - prefer getStripeClient()
export const stripe = { get: getStripeClient };

/**
 * Client-side Stripe.js promise
 * Use this in client components for Stripe Elements, Checkout, etc.
 */
let stripePromise = null;

export function getStripe() {
  if (!stripePromise) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  }
  return stripePromise;
}

/**
 * Stripe product IDs (configured in Stripe Dashboard)
 * Update these after creating products in Stripe
 */
// v4.2: Individual + Business tiers (monthly/annual)
export const STRIPE_PRODUCTS = {
  INDIVIDUAL_MONTHLY: "price_individual_monthly",
  INDIVIDUAL_ANNUAL: "price_individual_annual",
  BUSINESS_MONTHLY: "price_business_monthly",
  BUSINESS_ANNUAL: "price_business_annual",
};
/**
 * Stripe coupon codes
 */
export const STRIPE_COUPONS = {
  EARLY_ADOPTER: "EARLYADOPTER20",
};

/**
 * Verify Stripe webhook signature
 * @param {string} payload - Raw request body
 * @param {string} signature - Stripe signature header
 * @returns {Stripe.Event} Verified event
 */
export function verifyWebhookSignature(payload, signature) {
  return getStripeClient().webhooks.constructEvent(
    payload,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET,
  );
}

/**
 * Create a Stripe Checkout Session for new subscriptions
 * @param {Object} params - Session parameters
 * @param {string} params.priceId - Stripe price ID
 * @param {string} [params.customerId] - Existing Stripe customer ID (optional)
 * @param {string} params.successUrl - Redirect URL on success
 * @param {string} params.cancelUrl - Redirect URL on cancel
 * @param {Object} [params.metadata] - Additional metadata to attach
 * @returns {Promise<Stripe.Checkout.Session>} Checkout session
 */
export async function createCheckoutSession({
  priceId,
  customerId,
  successUrl,
  cancelUrl,
  metadata = {},
}) {
  const logger = createLogger("createCheckoutSession");
  try {
    const sessionParams = {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
    };

    // Attach to existing customer if provided
    if (customerId) {
      sessionParams.customer = customerId;
    } else {
      sessionParams.customer_creation = "always";
    }

    const session =
      await getStripeClient().checkout.sessions.create(sessionParams);
    logger.info("Checkout session created", { sessionId: session.id });
    return session;
  } catch (error) {
    logger.error("Failed to create checkout session", { error: error.message });
    throw error;
  }
}

/**
 * Create a Stripe Customer Portal session for subscription management
 * @param {string} customerId - Stripe customer ID
 * @param {string} returnUrl - URL to redirect after portal session
 * @returns {Promise<Stripe.BillingPortal.Session>} Portal session
 */
export async function createPortalSession(customerId, returnUrl) {
  const logger = createLogger("createPortalSession");
  try {
    const session = await getStripeClient().billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    logger.info("Portal session created", { customerId });
    return session;
  } catch (error) {
    logger.error("Failed to create portal session", { error: error.message });
    throw error;
  }
}

/**
 * Update subscription seat quantity (for Enterprise seat changes per Addendum A.5.4)
 * Prorates charges automatically
 * @param {string} subscriptionId - Stripe subscription ID
 * @param {number} quantity - New seat quantity
 * @returns {Promise<Stripe.Subscription>} Updated subscription
 */
export async function updateSubscriptionQuantity(subscriptionId, quantity) {
  const logger = createLogger("updateSubscriptionQuantity");
  try {
    // Get current subscription to find the item
    const subscription =
      await getStripeClient().subscriptions.retrieve(subscriptionId);
    const subscriptionItem = subscription.items.data[0];

    const updatedSubscription = await getStripeClient().subscriptions.update(
      subscriptionId,
      {
        items: [
          {
            id: subscriptionItem.id,
            quantity,
          },
        ],
        proration_behavior: "create_prorations",
      },
    );
    logger.info("Subscription quantity updated", {
      subscriptionId,
      quantity,
      previousQuantity: subscriptionItem.quantity,
    });
    return updatedSubscription;
  } catch (error) {
    logger.error("Failed to update subscription quantity", {
      error: error.message,
    });
    throw error;
  }
}
