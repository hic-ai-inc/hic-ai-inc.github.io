/**
 * Tier Change API
 *
 * POST /api/portal/change-tier
 *
 * Allows users to switch between Individual and Business tiers.
 * Handles prorated upgrades/downgrades via Stripe subscription update.
 *
 * IMPORTANT CONSTRAINTS:
 * - Business → Individual: Only allowed if seatsUsed <= 1
 *   (prevents orphaning team members)
 * - Individual → Business: Always allowed
 *
 * @see PLG Roadmap v6 - Tier Switching
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { getStripeClient } from "@/lib/stripe";
import {
  getCustomerByEmail,
  getOrganizationByStripeCustomer,
  getOrgLicenseUsage,
  updateCustomerAccountType,
} from "@/lib/dynamodb";
import { STRIPE_PRICES } from "@/lib/constants";

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
    console.error("[ChangeTier] JWT verification failed:", error.message);
    return null;
  }
}

/**
 * Get the appropriate Stripe price ID for a tier and billing cycle
 */
function getPriceId(tier, billingCycle) {
  const prices = STRIPE_PRICES[tier];
  if (!prices) {
    throw new Error(`Unknown tier: ${tier}`);
  }
  const priceId = prices[billingCycle];
  if (!priceId) {
    throw new Error(`Unknown billing cycle: ${billingCycle}`);
  }
  return priceId;
}

/**
 * POST /api/portal/change-tier
 *
 * Body: {
 *   targetTier: "individual" | "business",
 *   billingCycle: "monthly" | "annual" (optional, keeps current if not specified)
 * }
 *
 * Returns: {
 *   success: boolean,
 *   previousTier: string,
 *   newTier: string,
 *   message: string,
 *   effectiveDate: string
 * }
 */
export async function POST(request) {
  try {
    // Verify JWT from Authorization header
    const tokenPayload = await verifyAuthToken();
    if (!tokenPayload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { targetTier, billingCycle } = body;

    // Validate target tier
    if (!targetTier || !["individual", "business"].includes(targetTier)) {
      return NextResponse.json(
        { error: "Invalid target tier. Must be 'individual' or 'business'." },
        { status: 400 },
      );
    }

    // Get customer from DynamoDB
    const customer = await getCustomerByEmail(tokenPayload.email);
    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 },
      );
    }

    const currentTier = customer.accountType;

    // Check if already on target tier
    if (currentTier === targetTier) {
      return NextResponse.json(
        { error: `Already on ${targetTier} tier` },
        { status: 400 },
      );
    }

    // Get Stripe client
    const stripe = await getStripeClient();

    // Get current subscription
    if (!customer.stripeSubscriptionId) {
      return NextResponse.json(
        { error: "No active subscription found" },
        { status: 404 },
      );
    }

    const subscription = await stripe.subscriptions.retrieve(
      customer.stripeSubscriptionId,
    );

    if (subscription.status !== "active") {
      return NextResponse.json(
        { error: "Subscription is not active" },
        { status: 400 },
      );
    }

    // =========================================================================
    // CRITICAL: Business → Individual downgrade protection
    // =========================================================================
    if (currentTier === "business" && targetTier === "individual") {
      // Check if this is a multi-user Business account
      const org = await getOrganizationByStripeCustomer(
        customer.stripeCustomerId,
      );

      if (org) {
        const usage = await getOrgLicenseUsage(org.orgId);

        // If more than 1 seat is in use, block the downgrade
        if (usage.seatsUsed > 1) {
          return NextResponse.json(
            {
              error: "Cannot downgrade to Individual with active team members",
              details: `You have ${usage.seatsUsed} active members in your organization. Please remove all team members except yourself before downgrading to Individual.`,
              seatsUsed: usage.seatsUsed,
              action:
                "Remove team members from Portal → Team before downgrading",
            },
            { status: 400 },
          );
        }
      }

      console.log(
        `[ChangeTier] Business → Individual downgrade allowed (seatsUsed: ${org ? 1 : 0})`,
      );
    }

    // Determine billing cycle (keep current if not specified)
    const currentItem = subscription.items.data[0];
    const currentBillingCycle =
      currentItem?.price?.recurring?.interval === "year" ? "annual" : "monthly";
    const effectiveBillingCycle = billingCycle || currentBillingCycle;

    // Validate billing cycle
    if (!["monthly", "annual"].includes(effectiveBillingCycle)) {
      return NextResponse.json(
        { error: "Invalid billing cycle. Must be 'monthly' or 'annual'." },
        { status: 400 },
      );
    }

    // Get new price ID
    const newPriceId = getPriceId(targetTier, effectiveBillingCycle);

    // Update subscription to new price (Stripe handles proration)
    const updatedSubscription = await stripe.subscriptions.update(
      customer.stripeSubscriptionId,
      {
        items: [
          {
            id: currentItem.id,
            price: newPriceId,
            // Individual always has quantity 1
            // Business starts with quantity 1 on upgrade
            quantity: 1,
          },
        ],
        proration_behavior: "create_prorations",
        // Add metadata for tracking
        metadata: {
          ...subscription.metadata,
          previous_tier: currentTier,
          tier_change_date: new Date().toISOString(),
        },
      },
    );

    // Update customer's account type in DynamoDB
    await updateCustomerAccountType(customer.userId, targetTier);

    console.log(
      `[ChangeTier] ${tokenPayload.email}: ${currentTier} → ${targetTier} (${effectiveBillingCycle})`,
    );

    // Determine if this was an upgrade or downgrade
    const isUpgrade = targetTier === "business";
    const actionWord = isUpgrade ? "upgraded" : "downgraded";

    return NextResponse.json({
      success: true,
      previousTier: currentTier,
      newTier: targetTier,
      billingCycle: effectiveBillingCycle,
      message: `Successfully ${actionWord} to ${targetTier} tier. Changes are prorated.`,
      effectiveDate: new Date().toISOString(),
      subscriptionId: updatedSubscription.id,
    });
  } catch (error) {
    console.error("[ChangeTier] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to change tier" },
      { status: 500 },
    );
  }
}
