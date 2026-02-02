/**
 * Seat Management API
 *
 * GET /api/portal/seats - Get current seat usage and limits
 * POST /api/portal/seats - Update seat quantity (Business tier only)
 *
 * Requires Business tier subscription and owner/admin role.
 * Seat changes are prorated by Stripe automatically.
 *
 * @see PLG Roadmap v6 - Business RBAC
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { AUTH_NAMESPACE } from "@/lib/constants";
import {
  getCustomerByUserId,
  getOrganizationByStripeCustomer,
  getOrgLicenseUsage,
} from "@/lib/dynamodb";
import { updateSubscriptionQuantity, getStripeClient } from "@/lib/stripe";

/**
 * GET /api/portal/seats
 *
 * Returns current seat usage for the organization.
 * Requires Business tier subscription.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = session.user;
    const accountType = user[`${AUTH_NAMESPACE}/account_type`];
    const orgId = user[`${AUTH_NAMESPACE}/org_id`];
    const stripeCustomerId = user[`${AUTH_NAMESPACE}/stripe_customer_id`];

    // Only Business tier has seats
    if (accountType !== "business") {
      return NextResponse.json(
        { error: "Seat management is only available for Business tier" },
        { status: 403 },
      );
    }

    // Get org either from token or by stripeCustomerId
    let effectiveOrgId = orgId;
    if (!effectiveOrgId && stripeCustomerId) {
      const org = await getOrganizationByStripeCustomer(stripeCustomerId);
      if (org) {
        effectiveOrgId = org.orgId;
      }
    }

    if (!effectiveOrgId) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    // Get seat usage from DynamoDB
    const usage = await getOrgLicenseUsage(effectiveOrgId);

    // Get current subscription quantity from Stripe for accurate billing info
    let subscriptionQuantity = usage.seatLimit;
    let pricePerSeat = null;

    const customer = await getCustomerByUserId(user.sub);
    if (customer?.stripeSubscriptionId) {
      try {
        const stripe = await getStripeClient();
        const subscription = await stripe.subscriptions.retrieve(
          customer.stripeSubscriptionId,
        );
        const item = subscription.items.data[0];
        subscriptionQuantity = item?.quantity || 1;
        pricePerSeat = item?.price?.unit_amount
          ? item.price.unit_amount / 100
          : null;
      } catch (error) {
        console.error(
          "[Seats] Failed to fetch Stripe subscription:",
          error.message,
        );
      }
    }

    return NextResponse.json({
      orgId: effectiveOrgId,
      seatLimit: usage.seatLimit,
      seatsUsed: usage.seatsUsed,
      seatsAvailable: usage.seatsAvailable,
      utilizationPercent: usage.utilizationPercent,
      subscriptionQuantity,
      pricePerSeat,
      currency: "usd",
    });
  } catch (error) {
    console.error("[Seats] GET error:", error);
    return NextResponse.json(
      { error: "Failed to get seat information" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/portal/seats
 *
 * Update subscription seat quantity.
 * Body: { quantity: number }
 *
 * Requirements:
 * - Business tier subscription
 * - Owner or Admin role
 * - Quantity >= current members (can't go below used seats)
 * - Quantity >= 1
 *
 * Changes are prorated automatically by Stripe.
 */
export async function POST(request) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = session.user;
    const accountType = user[`${AUTH_NAMESPACE}/account_type`];
    const orgRole = user[`${AUTH_NAMESPACE}/org_role`];
    const stripeCustomerId = user[`${AUTH_NAMESPACE}/stripe_customer_id`];

    // Only Business tier has seats
    if (accountType !== "business") {
      return NextResponse.json(
        { error: "Seat management is only available for Business tier" },
        { status: 403 },
      );
    }

    // Only owners and admins can change seats
    if (!["owner", "admin"].includes(orgRole)) {
      return NextResponse.json(
        { error: "Only owners and admins can change seat quantity" },
        { status: 403 },
      );
    }

    // Parse request body
    const body = await request.json();
    const { quantity } = body;

    if (!quantity || typeof quantity !== "number" || quantity < 1) {
      return NextResponse.json(
        { error: "Invalid quantity. Must be a positive number." },
        { status: 400 },
      );
    }

    // Get organization to check current usage
    const org = await getOrganizationByStripeCustomer(stripeCustomerId);
    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    // Get current seat usage
    const usage = await getOrgLicenseUsage(org.orgId);

    // Can't reduce below current members
    if (quantity < usage.seatsUsed) {
      return NextResponse.json(
        {
          error: `Cannot reduce seats below current usage. You have ${usage.seatsUsed} active members. Remove members first.`,
        },
        { status: 400 },
      );
    }

    // Get customer's subscription ID
    const customer = await getCustomerByUserId(user.sub);
    if (!customer?.stripeSubscriptionId) {
      return NextResponse.json(
        { error: "No active subscription found" },
        { status: 404 },
      );
    }

    // Update Stripe subscription quantity (prorated automatically)
    const updatedSubscription = await updateSubscriptionQuantity(
      customer.stripeSubscriptionId,
      quantity,
    );

    // Note: The webhook (customer.subscription.updated) will sync the new quantity
    // to DynamoDB, so we don't need to call updateOrgSeatLimit here directly.

    const newItem = updatedSubscription.items.data[0];

    console.log(
      `[Seats] Updated subscription ${customer.stripeSubscriptionId} from ${usage.seatLimit} to ${quantity} seats`,
    );

    return NextResponse.json({
      success: true,
      previousQuantity: usage.seatLimit,
      newQuantity: quantity,
      message: `Seat quantity updated to ${quantity}. Changes are prorated.`,
      subscriptionId: customer.stripeSubscriptionId,
      effectiveDate: new Date().toISOString(),
      // Include price info for UI confirmation
      pricePerSeat: newItem?.price?.unit_amount
        ? newItem.price.unit_amount / 100
        : null,
    });
  } catch (error) {
    console.error("[Seats] POST error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update seat quantity" },
      { status: 500 },
    );
  }
}
