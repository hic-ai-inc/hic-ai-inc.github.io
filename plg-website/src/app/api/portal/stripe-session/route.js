/**
 * Stripe Customer Portal Session API
 *
 * Creates a Stripe Customer Portal session for managing subscriptions.
 *
 * @see PLG User Journey - Section 2.6
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { AUTH_NAMESPACE } from "@/lib/constants";

export async function POST() {
  try {
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const customerId = session.user[`${AUTH_NAMESPACE}/customer_id`];

    if (!customerId) {
      return NextResponse.json(
        { error: "No Stripe customer found" },
        { status: 404 },
      );
    }

    // Create portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
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
