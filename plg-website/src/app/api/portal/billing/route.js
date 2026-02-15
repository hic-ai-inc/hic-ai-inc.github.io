/**
 * Portal Billing Info API
 *
 * GET /api/portal/billing
 *
 * Fetches subscription and payment method information from Stripe.
 * Requires Authorization header with Cognito ID token.
 */

import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth-verify";
import { getStripeClient } from "@/lib/stripe";
import { getCustomerByEmail, getCustomerByUserId, getUserOrgMembership } from "@/lib/dynamodb";
import { PRICING } from "@/lib/constants";
import { createApiLogger } from "@/lib/api-log";

export async function GET(request) {
  const log = createApiLogger({
    service: "plg-api-portal-billing",
    request,
    operation: "portal_billing",
  });

  log.requestReceived();

  try {
    const tokenPayload = await verifyAuthToken();
    if (!tokenPayload) {
      log.decision("auth_failed", "Portal billing rejected", {
        reason: "unauthorized",
      });
      log.response(401, "Portal billing rejected", { reason: "unauthorized" });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let customer = await getCustomerByUserId(tokenPayload.sub);
    if (!customer && tokenPayload.email) {
      customer = await getCustomerByEmail(tokenPayload.email);
    }

    let orgMembership = null;
    if (!customer?.subscriptionStatus) {
      orgMembership = await getUserOrgMembership(tokenPayload.sub);
    }

    if (orgMembership && orgMembership.role !== "owner") {
      log.decision("org_member_forbidden", "Portal billing rejected", {
        reason: "owner_required",
        role: orgMembership.role,
      });
      log.response(403, "Portal billing rejected", { reason: "owner_required" });
      return NextResponse.json(
        { error: "Only the subscription owner can access billing information" },
        { status: 403 },
      );
    }

    if (!customer?.stripeCustomerId) {
      log.info("billing_not_found", "No billing information found");
      log.response(200, "Portal billing empty result", { hasBilling: false });
      return NextResponse.json({
        subscription: null,
        paymentMethod: null,
        message: "No billing information found",
      });
    }

    const stripe = await getStripeClient();
    const stripeCustomer = await stripe.customers.retrieve(
      customer.stripeCustomerId,
      {
        expand: ["default_source", "invoice_settings.default_payment_method"],
      },
    );

    const subscriptions = await stripe.subscriptions.list({
      customer: customer.stripeCustomerId,
      status: "all",
      limit: 1,
    });

    const activeSubscription = subscriptions.data[0];

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

    const planConfig = PRICING[customer.accountType];

    log.response(200, "Portal billing fetched", {
      hasSubscription: Boolean(subscriptionInfo),
      hasPaymentMethod: Boolean(paymentMethod),
      accountType: customer.accountType,
    });

    return NextResponse.json({
      accountType: customer.accountType,
      planName: planConfig?.name || customer.accountType,
      subscription: subscriptionInfo,
      paymentMethod,
      stripeCustomerId: customer.stripeCustomerId,
    });
  } catch (error) {
    log.exception(error, "portal_billing_failed", "Portal billing failed");
    log.response(500, "Portal billing failed", { reason: "unhandled_error" });
    return NextResponse.json(
      { error: "Failed to fetch billing information" },
      { status: 500 },
    );
  }
}
