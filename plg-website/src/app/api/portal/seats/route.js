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
import { verifyAuthToken } from "@/lib/auth-verify";
import {
  getCustomerByUserId,
  getCustomerByEmail,
  getUserOrgMembership,
  getOrganizationByStripeCustomer,
  getOrgLicenseUsage,
} from "@/lib/dynamodb";
import { updateSubscriptionQuantity, getStripeClient } from "@/lib/stripe";
import { createApiLogger } from "@/lib/api-log";

/**
 * GET /api/portal/seats
 *
 * Returns current seat usage for the organization.
 * Requires Business tier subscription.
 */
export async function GET(request) {
  const log = createApiLogger({
    service: "plg-api-portal-seats",
    request,
    operation: "portal_seats_list",
  });

  log.requestReceived();

  try {
    // Verify JWT from Authorization header
    const tokenPayload = await verifyAuthToken();
    if (!tokenPayload) {
      log.decision("auth_failed", "Seat list rejected", { reason: "unauthorized" });
      log.response(401, "Seat list rejected", { reason: "unauthorized" });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Look up account type from DynamoDB (not JWT claims)
    let customer = await getCustomerByUserId(tokenPayload.sub);
    if (!customer && tokenPayload.email) {
      customer = await getCustomerByEmail(tokenPayload.email);
    }

    // Check for org membership (Business tier members)
    let orgMembership = null;
    if (!customer) {
      orgMembership = await getUserOrgMembership(tokenPayload.sub);
    }

    // Determine account type from DynamoDB
    const accountType = orgMembership ? "business" : (customer?.accountType || "individual");

    // Only Business tier has seats
    if (accountType !== "business") {
      log.decision("business_tier_required", "Seat list rejected", {
        reason: "business_tier_required",
      });
      log.response(403, "Seat list rejected", { reason: "business_tier_required" });
      return NextResponse.json(
        { error: "Seat management is only available for Business tier" },
        { status: 403 },
      );
    }

    // Get orgId from membership or customer record
    let effectiveOrgId = orgMembership?.orgId || customer?.orgId;
    const stripeCustomerId = customer?.stripeCustomerId;

    if (!effectiveOrgId && stripeCustomerId) {
      const org = await getOrganizationByStripeCustomer(stripeCustomerId);
      if (org) {
        effectiveOrgId = org.orgId;
      }
    }

    if (!effectiveOrgId) {
      log.decision("organization_not_found", "Seat list rejected", {
        reason: "organization_not_found",
      });
      log.response(404, "Seat list rejected", { reason: "organization_not_found" });
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
        log.warn("stripe_subscription_fetch_failed", "Failed to fetch Stripe subscription", {
          errorMessage: error.message,
        });
      }
    }

    log.response(200, "Seat list returned", {
      seatLimit: usage.seatLimit,
      seatsUsed: usage.seatsUsed,
      hasPricePerSeat: Boolean(pricePerSeat),
    });
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
    log.exception(error, "portal_seats_list_failed", "Seat list failed");
    log.response(500, "Seat list failed", { reason: "unhandled_error" });
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
  const log = createApiLogger({
    service: "plg-api-portal-seats",
    request,
    operation: "portal_seats_update",
  });

  log.requestReceived();

  try {
    // Verify JWT from Authorization header
    const tokenPayload = await verifyAuthToken();
    if (!tokenPayload) {
      log.decision("auth_failed", "Seat update rejected", { reason: "unauthorized" });
      log.response(401, "Seat update rejected", { reason: "unauthorized" });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Look up account type from DynamoDB (not JWT claims)
    let customer = await getCustomerByUserId(tokenPayload.sub);
    if (!customer && tokenPayload.email) {
      customer = await getCustomerByEmail(tokenPayload.email);
    }

    // Check for org membership (Business tier members)
    let orgMembership = null;
    if (!customer) {
      orgMembership = await getUserOrgMembership(tokenPayload.sub);
    }

    // Determine account type and org role from DynamoDB
    const accountType = orgMembership ? "business" : (customer?.accountType || "individual");
    const orgRole = orgMembership?.role || customer?.orgRole || "member";
    const stripeCustomerId = customer?.stripeCustomerId;

    // Only Business tier has seats
    if (accountType !== "business") {
      log.decision("business_tier_required", "Seat update rejected", {
        reason: "business_tier_required",
      });
      log.response(403, "Seat update rejected", { reason: "business_tier_required" });
      return NextResponse.json(
        { error: "Seat management is only available for Business tier" },
        { status: 403 },
      );
    }

    // Only owners and admins can change seats
    if (!["owner", "admin"].includes(orgRole)) {
      log.decision("insufficient_role", "Seat update rejected", {
        reason: "insufficient_role",
        role: orgRole,
      });
      log.response(403, "Seat update rejected", { reason: "insufficient_role" });
      return NextResponse.json(
        { error: "Only owners and admins can change seat quantity" },
        { status: 403 },
      );
    }

    // Parse request body
    const body = await request.json();
    const { quantity } = body;

    if (!quantity || typeof quantity !== "number" || quantity < 1) {
      log.decision("invalid_quantity", "Seat update rejected", {
        reason: "invalid_quantity",
      });
      log.response(400, "Seat update rejected", { reason: "invalid_quantity" });
      return NextResponse.json(
        { error: "Invalid quantity. Must be a positive number." },
        { status: 400 },
      );
    }

    // Get organization to check current usage
    const org = await getOrganizationByStripeCustomer(stripeCustomerId);
    if (!org) {
      log.decision("organization_not_found", "Seat update rejected", {
        reason: "organization_not_found",
      });
      log.response(404, "Seat update rejected", { reason: "organization_not_found" });
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    // Get current seat usage
    const usage = await getOrgLicenseUsage(org.orgId);

    // Can't reduce below current members
    if (quantity < usage.seatsUsed) {
      log.decision("quantity_below_usage", "Seat update rejected", {
        reason: "quantity_below_usage",
        seatsUsed: usage.seatsUsed,
      });
      log.response(400, "Seat update rejected", { reason: "quantity_below_usage" });
      return NextResponse.json(
        {
          error: `Cannot reduce seats below current usage. You have ${usage.seatsUsed} active members. Remove members first.`,
        },
        { status: 400 },
      );
    }

    // Check customer's subscription ID (customer already fetched above)
    if (!customer?.stripeSubscriptionId) {
      log.decision("subscription_not_found", "Seat update rejected", {
        reason: "subscription_not_found",
      });
      log.response(404, "Seat update rejected", { reason: "subscription_not_found" });
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

    log.info("seat_quantity_updated", "Seat quantity updated", {
      previousQuantity: usage.seatLimit,
      newQuantity: quantity,
      hasSubscriptionId: Boolean(customer.stripeSubscriptionId),
    });
    log.response(200, "Seat update succeeded", { success: true });

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
    log.exception(error, "portal_seats_update_failed", "Seat update failed");
    log.response(500, "Seat update failed", { reason: "unhandled_error" });
    return NextResponse.json(
      { error: error.message || "Failed to update seat quantity" },
      { status: 500 },
    );
  }
}
