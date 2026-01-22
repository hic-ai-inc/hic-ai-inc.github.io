/**
 * Checkout Session Verification API
 *
 * GET /api/checkout/verify
 *
 * Verifies a Stripe checkout session for the welcome flow.
 */

import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("session_id");

    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 },
      );
    }

    // Retrieve the checkout session
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "line_items"],
    });

    // Check payment status
    if (session.payment_status !== "paid") {
      return NextResponse.json(
        { error: "Payment not completed" },
        { status: 400 },
      );
    }

    // Get plan name from line items or metadata
    const planType = session.metadata?.planType || "individual";
    const planName =
      planType === "individual"
        ? "Individual"
        : planType === "enterprise"
          ? "Enterprise"
          : "Open Source";

    return NextResponse.json({
      valid: true,
      email: session.customer_email || session.customer_details?.email,
      planType,
      planName,
      subscriptionId: session.subscription?.id,
      customerId: session.customer,
    });
  } catch (error) {
    console.error("Session verification error:", error);

    if (error.type === "StripeInvalidRequestError") {
      return NextResponse.json(
        { error: "Invalid session ID" },
        { status: 400 },
      );
    }

    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
