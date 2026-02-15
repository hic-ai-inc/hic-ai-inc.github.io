/**
 * Checkout API Route
 *
 * Creates a Stripe Checkout session for subscription purchases.
 *
 * @see PLG User Journey - Section 2.3
 * @see API Map for HIC AI Website v2
 */

import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth-verify";
import { getStripeClient } from "@/lib/stripe";
import { PRICING, STRIPE_PRICES } from "@/lib/constants";
import { getCustomerByEmail } from "@/lib/dynamodb";
import { createApiLogger } from "@/lib/api-log";

/**
 * Extract user email from Cognito ID token
 */
async function getUserEmailFromRequest() {
  const payload = await verifyAuthToken();
  return payload?.email || null;
}

export async function POST(request) {
  const log = createApiLogger({
    service: "plg-api-checkout",
    request,
    operation: "checkout_create",
  });

  log.requestReceived({
    nodeEnv: process.env.NODE_ENV,
    hasAppUrl: Boolean(process.env.NEXT_PUBLIC_APP_URL),
    hasStripeKey: Boolean(process.env.STRIPE_SECRET_KEY),
  });

  try {
    // Step 1: Parse request body
    let body;
    try {
      body = await request.json();
      log.info("body_parsed", "Request body parsed", { plan: body.plan, hasEmail: Boolean(body.email) });
    } catch (parseErr) {
      log.decision("body_parse_failed", "Could not parse request body", { reason: "invalid_json", errorMessage: parseErr.message });
      log.response(400, "Checkout rejected", { reason: "invalid_json" });
      return NextResponse.json(
        { error: "[SRV-001] Invalid request body" },
        { status: 400 },
      );
    }

    const { plan, billingCycle = "monthly", seats = 1, promoCode } = body;

    // Step 2: Validate plan
    if (!plan || !["individual", "business"].includes(plan)) {
      log.decision("invalid_plan", "Invalid plan specified", { reason: "invalid_plan", plan });
      log.response(400, "Checkout rejected", { reason: "invalid_plan" });
      return NextResponse.json(
        { error: "[SRV-002] Invalid plan specified" },
        { status: 400 },
      );
    }
    log.info("plan_validated", "Plan validated", { plan, billingCycle, seats });

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
      log.error("price_id_missing", "No price ID configured", null, { reason: "price_id_missing", plan, billingCycle });
      log.response(500, "Checkout failed", { reason: "price_id_missing" });
      return NextResponse.json(
        { error: "[SRV-004] Price ID not configured for selected plan" },
        { status: 500 },
      );
    }
    log.info("price_resolved", "Price ID resolved", { plan, billingCycle, quantity });

    // Step 4: Get customer email from JWT or body
    let jwtEmail;
    try {
      jwtEmail = await getUserEmailFromRequest();
      log.debug("jwt_email_extraction", "JWT email extraction", { found: Boolean(jwtEmail) });
    } catch (jwtErr) {
      log.warn("jwt_extraction_failed", "JWT extraction failed (non-fatal)", { errorMessage: jwtErr.message });
      // Non-fatal - we can use body.email
    }

    const customerEmail = body.email || jwtEmail;

    if (!customerEmail) {
      log.decision("email_missing", "No email available", { reason: "email_missing", hasBodyEmail: Boolean(body.email), hasJwtEmail: Boolean(jwtEmail) });
      log.response(400, "Checkout rejected", { reason: "email_missing" });
      return NextResponse.json(
        { error: "[SRV-005] Email is required" },
        { status: 400 },
      );
    }
    log.info("email_resolved", "Customer email available", { source: body.email ? "body" : "jwt" });

    // Step 4b: Check for existing active license (prevent duplicates)
    const existingCustomer = await getCustomerByEmail(customerEmail);
    if (existingCustomer?.keygenLicenseId && existingCustomer?.subscriptionStatus === "active") {
      log.decision("active_license_exists", "User already has active license", {
        reason: "duplicate_purchase_blocked",
        hasLicenseId: Boolean(existingCustomer.keygenLicenseId),
      });
      log.response(409, "Checkout rejected", { reason: "duplicate_purchase_blocked" });
      return NextResponse.json(
        { 
          error: "You already have an active license. Visit your portal to manage your subscription.",
          existingLicense: true,
          portalUrl: "/portal/license"
        },
        { status: 409 }, // Conflict
      );
    }
    log.info("no_existing_license", "No existing active license");

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
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/welcome/complete?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?cancelled=true`,
      customer_email: customerEmail,
      allow_promotion_codes: !promoCode,
      metadata: {
        plan,
        seats: String(seats),
        billingCycle,
      },
    };

    // NOTE: No trial period in Stripe - trials happen via VS Code Marketplace
    // Users try free via Marketplace, then purchase here to activate paid license
    log.debug("checkout_params_built", "Checkout params built", { hasPromoCode: Boolean(promoCode) });

    // Step 6: Initialize Stripe client (this fetches secrets)
    let stripeClient;
    try {
      log.debug("stripe_init_start", "Initializing Stripe client");
      stripeClient = await getStripeClient();
      log.info("stripe_init_ok", "Stripe client initialized");
    } catch (stripeInitErr) {
      log.error("stripe_init_failed", "Stripe client init failed", stripeInitErr, { errorName: stripeInitErr.name });

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
        log.debug("promo_lookup_start", "Looking up promo code");
        const promotionCodes = await stripeClient.promotionCodes.list({
          code: promoCode,
          active: true,
          limit: 1,
        });

        if (promotionCodes.data.length > 0) {
          checkoutParams.discounts = [
            { promotion_code: promotionCodes.data[0].id },
          ];
          log.info("promo_applied", "Promo code applied");
        } else {
          log.info("promo_not_found", "Promo code not found or inactive");
        }
      } catch (promoErr) {
        log.warn("promo_lookup_failed", "Promo lookup failed (non-fatal)", { errorMessage: promoErr.message });
        // Non-fatal - continue without promo
      }
    }

    // Step 8: Create Stripe checkout session
    let checkoutSession;
    try {
      log.debug("session_create_start", "Creating Stripe checkout session");
      checkoutSession = await stripeClient.checkout.sessions.create(checkoutParams);
      log.info("session_created", "Checkout session created", { sessionId: checkoutSession.id });
    } catch (sessionErr) {
      log.error("session_create_failed", "Checkout session creation failed", sessionErr, {
        stripeErrorType: sessionErr.type,
        stripeErrorCode: sessionErr.code,
      });

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
    log.response(200, "Checkout session created", {
      sessionId: checkoutSession.id,
      plan,
      billingCycle,
      seats,
    });
    return NextResponse.json({
      sessionId: checkoutSession.id,
      url: checkoutSession.url,
    });

  } catch (error) {
    // Catch-all for unexpected errors
    log.exception(error, "checkout_unexpected_error", "Checkout unexpected error");
    log.response(500, "Checkout unexpected failure", { reason: "unhandled_error" });

    return NextResponse.json(
      { error: `[SRV-999] Unexpected error: ${error.message}` },
      { status: 500 },
    );
  }
}

