/**
 * Portal Status API
 *
 * Returns the user's subscription status for smart routing.
 * Used by the portal to determine where to send the user:
 * - No subscription → redirect to checkout
 * - Active subscription → show dashboard
 * - Expired → show reactivation prompt
 *
 * @see PLG User Journey
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { getCustomerByUserId, getCustomerByEmail, getLicenseDevices } from "@/lib/dynamodb";
import { PRICING } from "@/lib/constants";

// Cognito JWT verifier
const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID,
  tokenUse: "id", // Use ID token to get email
  clientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID,
});

/**
 * Extract user info from Cognito ID token
 */
async function getUserFromRequest() {
  try {
    const headersList = await headers();
    const authHeader = headersList.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return null;
    }

    const token = authHeader.slice(7);
    const payload = await verifier.verify(token);

    return {
      userId: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified,
    };
  } catch (error) {
    console.error("[Portal Status] JWT verification failed:", error.message);
    return null;
  }
}

export async function GET(request) {
  try {
    const user = await getUserFromRequest();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Look up customer by Cognito user ID first
    let customer = await getCustomerByUserId(user.userId);

    // If not found by userId, try by email (handles migration cases)
    if (!customer && user.email) {
      customer = await getCustomerByEmail(user.email);
    }

    // No customer record - new user, needs to checkout
    if (!customer) {
      return NextResponse.json({
        status: "new",
        subscriptionStatus: "none",
        hasSubscription: false,
        shouldRedirectToCheckout: true,
        user: {
          email: user.email,
          userId: user.userId,
        },
      });
    }

    // Determine subscription state
    const subscriptionStatus = customer.subscriptionStatus || "none";
    const hasActiveSubscription = ["active", "trialing"].includes(
      subscriptionStatus,
    );
    const hasExpiredSubscription = ["canceled", "past_due", "unpaid"].includes(
      subscriptionStatus,
    );

    // Get device count for dashboard display
    const accountType = customer.accountType || "individual";
    const planConfig = PRICING[accountType];
    const maxDevices = planConfig?.maxConcurrentMachinesPerSeat || planConfig?.maxConcurrentMachines || 3;
    
    let activatedDevices = 0;
    if (customer.keygenLicenseId) {
      try {
        const devices = await getLicenseDevices(customer.keygenLicenseId);
        activatedDevices = devices.length;
      } catch (error) {
        console.error("[Portal Status] Failed to get device count:", error.message);
      }
    }

    return NextResponse.json({
      status: hasActiveSubscription
        ? "active"
        : hasExpiredSubscription
          ? "expired"
          : "none",
      subscriptionStatus,
      hasSubscription: hasActiveSubscription,
      shouldRedirectToCheckout:
        !hasActiveSubscription && !hasExpiredSubscription,
      accountType,
      keygenLicenseId: customer.keygenLicenseId || null,
      stripeCustomerId: customer.stripeCustomerId || null,
      activatedDevices,
      maxDevices,
      user: {
        email: user.email,
        userId: user.userId,
      },
    });
  } catch (error) {
    console.error("[Portal Status] Error:", error);
    return NextResponse.json(
      { error: "Failed to get portal status" },
      { status: 500 },
    );
  }
}
