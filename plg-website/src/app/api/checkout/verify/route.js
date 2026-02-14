/**
 * Checkout Session Verification API
 *
 * GET /api/checkout/verify
 *
 * Verifies a Stripe checkout session for the welcome flow.
 */

import { NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe";
import { createApiLogger } from "@/lib/api-log";

export async function GET(request) {
  const log = createApiLogger({
    service: "plg-api-checkout-verify",
    request,
    operation: "checkout_verify",
  });

  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("session_id");

    log.requestReceived({ hasSessionId: Boolean(sessionId) });

    if (!sessionId) {
      log.decision("validation_failed", "Missing required session_id", {
        reason: "session_id_missing",
      });
      log.response(400, "Checkout verify rejected", {
        reason: "session_id_missing",
      });
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 },
      );
    }

    const stripe = await getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "line_items"],
    });

    if (session.payment_status !== "paid") {
      log.decision("payment_not_completed", "Checkout session is not paid", {
        paymentStatus: session.payment_status,
      });
      log.response(400, "Checkout verify rejected", {
        reason: "payment_not_completed",
        paymentStatus: session.payment_status,
      });
      return NextResponse.json(
        { error: "Payment not completed" },
        { status: 400 },
      );
    }

    const planType = session.metadata?.planType || "individual";
    const planName =
      planType === "individual"
        ? "Individual"
        : planType === "enterprise"
          ? "Enterprise"
          : "Open Source";

    log.response(200, "Checkout verify succeeded", {
      planType,
      hasSubscriptionId: Boolean(session.subscription?.id),
      hasCustomerId: Boolean(session.customer),
    });

    return NextResponse.json({
      valid: true,
      email: session.customer_email || session.customer_details?.email,
      planType,
      planName,
      subscriptionId: session.subscription?.id,
      customerId: session.customer,
    });
  } catch (error) {
    log.exception(error, "checkout_verify_failed", "Checkout verify failed");

    if (error.type === "StripeInvalidRequestError") {
      log.response(400, "Checkout verify invalid session", {
        reason: "stripe_invalid_request",
      });
      return NextResponse.json(
        { error: "Invalid session ID" },
        { status: 400 },
      );
    }

    log.response(500, "Checkout verify unexpected failure", {
      reason: "unhandled_error",
    });
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
