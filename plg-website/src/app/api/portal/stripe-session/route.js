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

export async function POST() {
  try {
    // Verify JWT from Authorization header
    const tokenPayload = await verifyAuthToken();
    if (!tokenPayload) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    // Get customer by email from verified token
    const customer = await getCustomerByEmail(tokenPayload.email);

    if (!customer?.stripeCustomerId) {
      return NextResponse.json(
        { error: "No Stripe customer found. Please purchase a license first." },
        { status: 404 },
      );
    }

    // Get Stripe client (handles secrets properly)
    const stripe = await getStripeClient();

    // Create portal session with success indicator in return URL
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customer.stripeCustomerId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/portal/billing?updated=true`,
    });

    // Return URL for client-side redirect (not server redirect which loses auth)
    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    console.error("Portal session error:", error);
    return NextResponse.json(
      { error: "Failed to create portal session" },
      { status: 500 },
    );
  }
}
