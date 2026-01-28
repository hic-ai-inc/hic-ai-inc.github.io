/**
 * Checkout API Route
 *
 * Creates a Stripe Checkout session for subscription purchases.
 *
 * @see PLG User Journey - Section 2.3
 * @see API Map for HIC AI Website v2
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { getStripeClient } from "@/lib/stripe";
import { PRICING, STRIPE_PRICES } from "@/lib/constants";

// Cognito JWT verifier for ID tokens (contains user email)
// Note: We use ID tokens because they contain the email claim
const idVerifier = CognitoJwtVerifier.create({
  userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID,
  tokenUse: "id",
  clientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID,
});

/**
 * Extract user email from Cognito ID token
 * ID tokens contain the email claim, unlike access tokens
 */
async function getUserEmailFromRequest(request) {
  try {
    const headersList = await headers();
    const authHeader = headersList.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return null;
    }

    const token = authHeader.slice(7);
    const payload = await idVerifier.verify(token);

    // ID token contains email directly
    return payload.email || null;
  } catch (error) {
    console.error("[Checkout] JWT verification failed:", error.message);
    return null;
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { plan, billingCycle = "monthly", seats = 1, promoCode } = body;

    // Validate plan
    if (!plan || !["individual", "business"].includes(plan)) {
      return NextResponse.json(
        { error: "Invalid plan specified" },
        { status: 400 },
      );
    }

    // Business requires minimum seats
    if (plan === "business" && seats < PRICING.business.minSeats) {
      return NextResponse.json(
        {
          error: `Business plan requires minimum ${PRICING.business.minSeats} seats`,
        },
        { status: 400 },
      );
    }

    // Get price ID
    let priceId;
    let quantity = 1;

    if (plan === "individual") {
      priceId =
        billingCycle === "annual"
          ? STRIPE_PRICES.individual.annual
          : STRIPE_PRICES.individual.monthly;
    } else {
      // Business - per-seat pricing
      priceId =
        billingCycle === "annual"
          ? STRIPE_PRICES.business.annual
          : STRIPE_PRICES.business.monthly;
      quantity = seats;
    }

    // Get customer email from request body or JWT token
    // Checkout pages pass email in body; authenticated users may also have JWT
    const jwtEmail = await getUserEmailFromRequest(request);
    const customerEmail = body.email || jwtEmail;

    if (!customerEmail) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Build checkout session params
    const checkoutParams = {
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/welcome?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?cancelled=true`,
      customer_email: customerEmail,
      allow_promotion_codes: !promoCode, // Allow codes if none specified
      metadata: {
        plan,
        seats: String(seats),
        billingCycle,
      },
    };

    // Add trial period for individual plan
    if (plan === "individual" && !promoCode) {
      checkoutParams.subscription_data = {
        trial_period_days: PRICING.individual.trialDays,
      };
    }

    // Add specific promo code if provided
    const stripeClient = getStripeClient();
    if (promoCode) {
      // Look up promotion code in Stripe
      const promotionCodes = await stripeClient.promotionCodes.list({
        code: promoCode,
        active: true,
        limit: 1,
      });

      if (promotionCodes.data.length > 0) {
        checkoutParams.discounts = [
          { promotion_code: promotionCodes.data[0].id },
        ];
      }
    }

    // Create checkout session
    const checkoutSession =
      await stripeClient.checkout.sessions.create(checkoutParams);

    return NextResponse.json({
      sessionId: checkoutSession.id,
      url: checkoutSession.url,
    });
  } catch (error) {
    console.error("Checkout error:", error);

    // Provide more specific error messages where safe
    if (error.type === "StripeInvalidRequestError") {
      // Missing or invalid Stripe configuration
      console.error("[Checkout] Stripe config error - check price IDs and API key");
      return NextResponse.json(
        { error: "Payment system configuration error. Please contact support." },
        { status: 500 },
      );
    }

    if (error.message?.includes("email")) {
      return NextResponse.json(
        { error: "Email is required to create checkout session" },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 },
    );
  }
}

