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

/**
 * Server-side Stripe client
 * Use this in API routes and server components only
 */
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-12-18.acacia",
  typescript: false,
});

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
export const STRIPE_PRODUCTS = {
  INDIVIDUAL_MONTHLY: "price_individual_monthly",
  INDIVIDUAL_ANNUAL: "price_individual_annual",
  ENTERPRISE_10: "price_enterprise_10",
  ENTERPRISE_100: "price_enterprise_100",
  ENTERPRISE_500: "price_enterprise_500",
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
  return stripe.webhooks.constructEvent(
    payload,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET,
  );
}
