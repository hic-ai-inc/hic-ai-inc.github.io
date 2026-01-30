/**
 * Portal Billing Info API
 *
 * GET /api/portal/billing
 *
 * Fetches subscription and payment method information from Stripe.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getStripeClient } from "@/lib/stripe";
import { getCustomerByEmail } from "@/lib/dynamodb";
import { PRICING } from "@/lib/constants";

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get customer by email (more reliable than userId across auth systems)
    const customer = await getCustomerByEmail(session.user.email);
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
