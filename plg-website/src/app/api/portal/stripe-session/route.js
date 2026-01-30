/**
 * Stripe Customer Portal Session API
 *
 * Creates a Stripe Customer Portal session for managing subscriptions.
 * Users can update payment methods, view invoices, and cancel subscription.
 *
 * @see PLG User Journey - Section 2.6
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getStripeClient } from "@/lib/stripe";
import { getCustomerByEmail } from "@/lib/dynamodb";

export async function POST() {
  try {
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    // Get customer by email (more reliable than userId across auth systems)
    const customer = await getCustomerByEmail(session.user.email);

    if (!customer?.stripeCustomerId) {
      return NextResponse.json(
        { error: "No Stripe customer found. Please purchase a license first." },
        { status: 404 },
      );
    }

    // Get Stripe client (handles secrets properly)
    const stripe = await getStripeClient();

    // Create portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customer.stripeCustomerId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/portal/billing`,
    });

    // Redirect to Stripe Customer Portal
    return NextResponse.redirect(portalSession.url, 303);
  } catch (error) {
    console.error("Portal session error:", error);
    return NextResponse.json(
      { error: "Failed to create portal session" },
      { status: 500 },
    );
  }
}
