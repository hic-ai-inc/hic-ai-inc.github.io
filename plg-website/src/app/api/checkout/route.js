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
  // Diagnostic: Log environment state at request time
  console.log("[Checkout] === REQUEST START ===");
  console.log("[Checkout] NODE_ENV:", process.env.NODE_ENV);
  console.log("[Checkout] NEXT_PUBLIC_APP_URL:", process.env.NEXT_PUBLIC_APP_URL);
  console.log("[Checkout] STRIPE_SECRET_KEY exists:", !!process.env.STRIPE_SECRET_KEY);
  console.log("[Checkout] STRIPE_SECRET_KEY length:", process.env.STRIPE_SECRET_KEY?.length || 0);

  try {
    // Step 1: Parse request body
    let body;
    try {
      body = await request.json();
      console.log("[Checkout] Step 1 OK: Request body parsed", { plan: body.plan, email: body.email ? "[REDACTED]" : "missing" });
    } catch (parseErr) {
      console.error("[Checkout] Step 1 FAIL: Could not parse request body:", parseErr.message);
      return NextResponse.json(
        { error: "[SRV-001] Invalid request body" },
        { status: 400 },
      );
    }

    const { plan, billingCycle = "monthly", seats = 1, promoCode } = body;

    // Step 2: Validate plan
    if (!plan || !["individual", "business"].includes(plan)) {
      console.error("[Checkout] Step 2 FAIL: Invalid plan:", plan);
      return NextResponse.json(
        { error: "[SRV-002] Invalid plan specified" },
        { status: 400 },
      );
    }
    console.log("[Checkout] Step 2 OK: Plan validated:", plan);

    // Business requires minimum seats
    if (plan === "business" && seats < PRICING.business.minSeats) {
      return NextResponse.json(
        {
          error: `[SRV-003] Business plan requires minimum ${PRICING.business.minSeats} seats`,
        },
        { status: 400 },
      );
    }

    // Step 3: Get price ID
    let priceId;
    let quantity = 1;

    if (plan === "individual") {
      priceId =
        billingCycle === "annual"
          ? STRIPE_PRICES.individual.annual
          : STRIPE_PRICES.individual.monthly;
    } else {
      priceId =
        billingCycle === "annual"
          ? STRIPE_PRICES.business.annual
          : STRIPE_PRICES.business.monthly;
      quantity = seats;
    }

    if (!priceId) {
      console.error("[Checkout] Step 3 FAIL: No price ID for", plan, billingCycle);
      return NextResponse.json(
        { error: "[SRV-004] Price ID not configured for selected plan" },
        { status: 500 },
      );
    }
    console.log("[Checkout] Step 3 OK: Price ID resolved:", priceId);

    // Step 4: Get customer email from JWT or body
    let jwtEmail;
    try {
      jwtEmail = await getUserEmailFromRequest(request);
      console.log("[Checkout] Step 4a: JWT email extraction:", jwtEmail ? "found" : "not found");
    } catch (jwtErr) {
      console.error("[Checkout] Step 4a WARN: JWT extraction failed:", jwtErr.message);
      // Non-fatal - we can use body.email
    }

    const customerEmail = body.email || jwtEmail;

    if (!customerEmail) {
      console.error("[Checkout] Step 4 FAIL: No email available (body.email:", !!body.email, ", jwtEmail:", !!jwtEmail, ")");
      return NextResponse.json(
        { error: "[SRV-005] Email is required" },
        { status: 400 },
      );
    }
    console.log("[Checkout] Step 4 OK: Customer email available");

    // Step 5: Build checkout params
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
      allow_promotion_codes: !promoCode,
      metadata: {
        plan,
        seats: String(seats),
        billingCycle,
      },
    };

    if (plan === "individual" && !promoCode) {
      checkoutParams.subscription_data = {
        trial_period_days: PRICING.individual.trialDays,
      };
    }
    console.log("[Checkout] Step 5 OK: Checkout params built");

    // Step 6: Initialize Stripe client (this fetches secrets)
    let stripeClient;
    try {
      console.log("[Checkout] Step 6: Initializing Stripe client...");
      stripeClient = await getStripeClient();
      console.log("[Checkout] Step 6 OK: Stripe client initialized");
    } catch (stripeInitErr) {
      console.error("[Checkout] Step 6 FAIL: Stripe client init failed:", stripeInitErr.name, stripeInitErr.message);

      // Categorize the error
      if (stripeInitErr.message?.includes("Unable to retrieve secret")) {
        return NextResponse.json(
          { error: "[SEC-001] Failed to retrieve Stripe secrets from Secrets Manager" },
          { status: 500 },
        );
      }
      if (stripeInitErr.name === "CredentialsProviderError") {
        return NextResponse.json(
          { error: "[SEC-002] AWS credentials not available for Secrets Manager" },
          { status: 500 },
        );
      }
      if (stripeInitErr.message?.includes("Invalid API Key")) {
        return NextResponse.json(
          { error: "[SEC-003] Invalid Stripe API key" },
          { status: 500 },
        );
      }

      return NextResponse.json(
        { error: `[SEC-999] Stripe init failed: ${stripeInitErr.message}` },
        { status: 500 },
      );
    }

    // Step 7: Handle promo code if provided
    if (promoCode) {
      try {
        console.log("[Checkout] Step 7: Looking up promo code:", promoCode);
        const promotionCodes = await stripeClient.promotionCodes.list({
          code: promoCode,
          active: true,
          limit: 1,
        });

        if (promotionCodes.data.length > 0) {
          checkoutParams.discounts = [
            { promotion_code: promotionCodes.data[0].id },
          ];
          console.log("[Checkout] Step 7 OK: Promo code applied");
        } else {
          console.log("[Checkout] Step 7: Promo code not found or inactive");
        }
      } catch (promoErr) {
        console.error("[Checkout] Step 7 WARN: Promo lookup failed:", promoErr.message);
        // Non-fatal - continue without promo
      }
    }

    // Step 8: Create Stripe checkout session
    let checkoutSession;
    try {
      console.log("[Checkout] Step 8: Creating Stripe checkout session...");
      checkoutSession = await stripeClient.checkout.sessions.create(checkoutParams);
      console.log("[Checkout] Step 8 OK: Session created:", checkoutSession.id);
    } catch (sessionErr) {
      console.error("[Checkout] Step 8 FAIL: Checkout session creation failed");
      console.error("[Checkout] Error type:", sessionErr.type);
      console.error("[Checkout] Error code:", sessionErr.code);
      console.error("[Checkout] Error message:", sessionErr.message);

      if (sessionErr.type === "StripeInvalidRequestError") {
        if (sessionErr.message?.includes("price")) {
          return NextResponse.json(
            { error: `[STRIPE-001] Invalid price ID: ${priceId}` },
            { status: 500 },
          );
        }
        if (sessionErr.message?.includes("api_key")) {
          return NextResponse.json(
            { error: "[STRIPE-002] Invalid Stripe API key" },
            { status: 500 },
          );
        }
        return NextResponse.json(
          { error: `[STRIPE-003] Stripe request error: ${sessionErr.message}` },
          { status: 500 },
        );
      }

      if (sessionErr.type === "StripeAuthenticationError") {
        return NextResponse.json(
          { error: "[STRIPE-004] Stripe authentication failed - check API key" },
          { status: 500 },
        );
      }

      return NextResponse.json(
        { error: `[STRIPE-999] Checkout session failed: ${sessionErr.message}` },
        { status: 500 },
      );
    }

    // Step 9: Return success
    console.log("[Checkout] === REQUEST SUCCESS ===");
    return NextResponse.json({
      sessionId: checkoutSession.id,
      url: checkoutSession.url,
    });

  } catch (error) {
    // Catch-all for unexpected errors
    console.error("[Checkout] === UNEXPECTED ERROR ===");
    console.error("[Checkout] Error name:", error.name);
    console.error("[Checkout] Error message:", error.message);
    console.error("[Checkout] Error stack:", error.stack);

    return NextResponse.json(
      { error: `[SRV-999] Unexpected error: ${error.message}` },
      { status: 500 },
    );
  }
}

