/**
 * Portal Billing Info API
 *
 * GET /api/portal/billing
 *
 * Fetches subscription and payment method information from Stripe.
 * Requires Authorization header with Cognito ID token.
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { getStripeClient } from "@/lib/stripe";
import { getCustomerByEmail } from "@/lib/dynamodb";
import { PRICING } from "@/lib/constants";

// Cognito JWT verifier for ID tokens
const idVerifier = CognitoJwtVerifier.create({
  userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID,
  tokenUse: "id",
  clientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID,
});

/**
 * Verify Cognito ID token from Authorization header
 */
async function verifyAuthToken() {
  const headersList = await headers();
  const authHeader = headersList.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7);
  try {
    return await idVerifier.verify(token);
  } catch (error) {
    console.error("[Billing] JWT verification failed:", error.message);
    return null;
  }
}

export async function GET() {
  try {
    // Verify JWT from Authorization header
    const tokenPayload = await verifyAuthToken();
    if (!tokenPayload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get customer by email from verified token
    const customer = await getCustomerByEmail(tokenPayload.email);
    if (!customer?.stripeCustomerId) {
      return NextResponse.json({
        subscription: null,
        paymentMethod: null,
        message: "No billing information found",
      });
    }

    // Get Stripe client
    const stripe = await getStripeClient();

    // Fetch Stripe customer with default payment method
    const stripeCustomer = await stripe.customers.retrieve(
      customer.stripeCustomerId,
      {
        expand: ["default_source", "invoice_settings.default_payment_method"],
      },
    );

    // Fetch active subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.stripeCustomerId,
      status: "all",
      limit: 1,
    });

    const activeSubscription = subscriptions.data[0];

    // Get payment method details
    let paymentMethod = null;
    const defaultPm =
      stripeCustomer.invoice_settings?.default_payment_method ||
      activeSubscription?.default_payment_method;

    if (defaultPm) {
      const pm =
        typeof defaultPm === "string"
          ? await stripe.paymentMethods.retrieve(defaultPm)
          : defaultPm;

      if (pm.card) {
        paymentMethod = {
          id: pm.id,
          type: "card",
          brand: pm.card.brand,
          last4: pm.card.last4,
          expMonth: pm.card.exp_month,
          expYear: pm.card.exp_year,
        };
      }
    }

    // Format subscription info
    let subscriptionInfo = null;
    if (activeSubscription) {
      const priceItem = activeSubscription.items.data[0];
      const billingCycle =
        priceItem?.price?.recurring?.interval === "year" ? "annual" : "monthly";

      subscriptionInfo = {
        id: activeSubscription.id,
        status: activeSubscription.status,
        currentPeriodStart: new Date(
          activeSubscription.current_period_start * 1000,
        ).toISOString(),
        currentPeriodEnd: new Date(
          activeSubscription.current_period_end * 1000,
        ).toISOString(),
        cancelAtPeriodEnd: activeSubscription.cancel_at_period_end,
        cancelAt: activeSubscription.cancel_at
          ? new Date(activeSubscription.cancel_at * 1000).toISOString()
          : null,
        billingCycle,
        priceId: priceItem?.price?.id,
        amount: priceItem?.price?.unit_amount,
        currency: priceItem?.price?.currency,
        quantity: priceItem?.quantity || 1,
      };
    }

    // Get plan info from our pricing config
    const planConfig = PRICING[customer.accountType];

    return NextResponse.json({
      accountType: customer.accountType,
      planName: planConfig?.name || customer.accountType,
      subscription: subscriptionInfo,
      paymentMethod,
      stripeCustomerId: customer.stripeCustomerId,
    });
  } catch (error) {
    console.error("Portal billing error:", error);
    return NextResponse.json(
      { error: "Failed to fetch billing information" },
      { status: 500 },
    );
  }
}
