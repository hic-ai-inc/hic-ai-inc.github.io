/**
 * Stripe Client Configuration
 *
 * Provides configured Stripe clients for:
 * - Server-side operations (using secret key from AWS Secrets Manager)
 * - Client-side Stripe.js (using publishable key)
 *
 * Security: Stripe secrets are fetched from AWS Secrets Manager at runtime,
 * not stored in environment variables (except for local development).
 *
 * @see Security Considerations for Stripe Payments
 */

import Stripe from "stripe";
import { loadStripe } from "@stripe/stripe-js";
import { HicLog, safeJsonParse } from "../../../dm/layers/base/src/index.js";
import { getStripeSecrets } from "./secrets.js";

// Logger for Stripe operations
const createLogger = (operation) => new HicLog(`plg-stripe-${operation}`);

/**
 * Server-side Stripe client (lazy-initialized)
 * Use getStripeClient() to access - enables testing without API key
 */
let stripeClient = null;

/**
 * Cached secrets from Secrets Manager
 */
let cachedSecrets = null;

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
  cachedSecrets = null;
}

/**
 * Initialize Stripe client with secrets from AWS Secrets Manager
 * This is called automatically by getStripeClient() but can be called
 * explicitly during app startup for faster first request.
 *
 * @returns {Promise<Stripe>} Initialized Stripe client
 */
export async function initializeStripeClient() {
  if (stripeClient) {
    return stripeClient;
  }

  // Fetch secrets from AWS Secrets Manager (cached internally)
  cachedSecrets = await getStripeSecrets();

  stripeClient = new Stripe(cachedSecrets.STRIPE_SECRET_KEY, {
    apiVersion: "2024-12-18.acacia",
    typescript: false,
  });

  return stripeClient;
}

/**
 * Get the current Stripe client (lazy-initialized, respects test injection)
 * IMPORTANT: This is now async - use await getStripeClient()
 *
 * @returns {Promise<Stripe>} Stripe client
 */
export async function getStripeClient() {
  if (!stripeClient) {
    await initializeStripeClient();
  }
  return stripeClient;
}

/**
 * Get cached Stripe webhook secret
 * Must be called after getStripeClient() has been awaited at least once
 *
 * @returns {string} Webhook secret
 */
export function getWebhookSecret() {
  if (!cachedSecrets) {
    // Fallback for local development or if called before init
    return process.env.STRIPE_WEBHOOK_SECRET;
  }
  return cachedSecrets.STRIPE_WEBHOOK_SECRET;
}

// Export async getter for backward compatibility
export const stripe = {
  get: getStripeClient,
  webhooks: {
    constructEvent: async (payload, signature, secret) => {
      const client = await getStripeClient();
      return client.webhooks.constructEvent(
        payload,
        signature,
        secret || getWebhookSecret(),
      );
    },
  },
};

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
 * @returns {Promise<Stripe.Event>} Verified event
 */
export async function verifyWebhookSignature(payload, signature) {
  const client = await getStripeClient();
  return client.webhooks.constructEvent(
    payload,
    signature,
    getWebhookSecret(),
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

    const client = await getStripeClient();
    const session = await client.checkout.sessions.create(sessionParams);
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
    const client = await getStripeClient();
    const session = await client.billingPortal.sessions.create({
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
    const client = await getStripeClient();
    const subscription = await client.subscriptions.retrieve(subscriptionId);
    const subscriptionItem = subscription.items.data[0];

    const updatedSubscription = await client.subscriptions.update(
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
