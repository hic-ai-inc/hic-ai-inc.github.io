/**
 * Checkout API Route
 *
 * Creates a Stripe Checkout session for subscription purchases.
 *
 * @see PLG User Journey - Section 2.3
 * @see API Map for HIC AI Website v2
 */

import { NextResponse } from "next/server";
import { getSession } from "@auth0/nextjs-auth0";
import { stripe } from "@/lib/stripe";
import { PRICING, STRIPE_PRICES } from "@/lib/constants";

export async function POST(request) {
  try {
    const body = await request.json();
    const { plan, billingCycle = "monthly", seats = 1, promoCode } = body;

    // Validate plan
    if (!plan || !["individual", "enterprise"].includes(plan)) {
      return NextResponse.json(
        { error: "Invalid plan specified" },
        { status: 400 },
      );
    }

    // Enterprise requires minimum seats
    if (plan === "enterprise" && seats < PRICING.enterprise.minSeats) {
      return NextResponse.json(
        {
          error: `Enterprise plan requires minimum ${PRICING.enterprise.minSeats} seats`,
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
      // Enterprise - select tier based on seat count
      if (seats >= 500) {
        priceId = STRIPE_PRICES.enterprise.seats500;
      } else if (seats >= 100) {
        priceId = STRIPE_PRICES.enterprise.seats100;
      } else {
        priceId = STRIPE_PRICES.enterprise.seats10;
      }
      quantity = seats;
    }

    // Check if user is authenticated
    const session = await getSession();
    const customerEmail = session?.user?.email || body.email;

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
    if (promoCode) {
      // Look up promotion code in Stripe
      const promotionCodes = await stripe.promotionCodes.list({
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
      await stripe.checkout.sessions.create(checkoutParams);

    return NextResponse.json({
      sessionId: checkoutSession.id,
      url: checkoutSession.url,
    });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 },
    );
  }
}
