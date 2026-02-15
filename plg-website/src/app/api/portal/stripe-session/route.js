/**
 * Stripe Customer Portal Session API
 *
 * Creates a Stripe Customer Portal session for managing subscriptions.
 * Users can update payment methods, view invoices, and cancel subscription.
 * Requires Authorization header with Cognito ID token.
 *
 * @see PLG User Journey - Section 2.6
 */

import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth-verify";
import { getStripeClient } from "@/lib/stripe";
import { getCustomerByEmail } from "@/lib/dynamodb";
import { createApiLogger } from "@/lib/api-log";

export async function POST(request) {
  const log = createApiLogger({
    service: "plg-api-portal-stripe-session",
    request,
    operation: "portal_stripe_session",
  });

  log.requestReceived();

  try {
    const tokenPayload = await verifyAuthToken();
    if (!tokenPayload) {
      log.decision("auth_failed", "Portal stripe session rejected", {
        reason: "unauthorized",
      });
      log.response(401, "Portal stripe session rejected", {
        reason: "unauthorized",
      });
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const customer = await getCustomerByEmail(tokenPayload.email);

    if (!customer?.stripeCustomerId) {
      log.decision("customer_not_found", "Portal stripe session rejected", {
        reason: "missing_stripe_customer",
      });
      log.response(404, "Portal stripe session rejected", {
        reason: "missing_stripe_customer",
      });
      return NextResponse.json(
        { error: "No Stripe customer found. Please purchase a license first." },
        { status: 404 },
      );
    }

    const stripe = await getStripeClient();

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customer.stripeCustomerId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/portal/billing?updated=true`,
    });

    log.response(200, "Portal stripe session created", {
      hasPortalUrl: Boolean(portalSession.url),
    });
    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    log.exception(error, "portal_stripe_session_failed", "Portal stripe session failed");
    log.response(500, "Portal stripe session failed", {
      reason: "unhandled_error",
    });
    return NextResponse.json(
      { error: "Failed to create portal session" },
      { status: 500 },
    );
  }
}
