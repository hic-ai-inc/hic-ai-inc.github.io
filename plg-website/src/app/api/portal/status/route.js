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
import {
  getCustomerByUserId,
  getCustomerByEmail,
  getLicenseDevices,
  getUserOrgMembership,
  getOrganization,
  getCustomerByStripeId,
} from "@/lib/dynamodb";
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

    // If no customer with a subscription, check if user is a Business tier member
    // Members may have a bare profile (from PostConfirmation) but no subscription -
    // they share the org's license via their membership record
    let orgMembership = null;
    let orgOwnerCustomer = null;
    
    if (!customer?.subscriptionStatus) {
      orgMembership = await getUserOrgMembership(user.userId);
      
      if (orgMembership) {
        // User is an org member - get the org's license info via the owner
        const org = await getOrganization(orgMembership.orgId);
        if (org?.stripeCustomerId) {
          // Get the org owner's customer record for license info
          orgOwnerCustomer = await getCustomerByStripeId(org.stripeCustomerId);
        }
        
        console.log(`[Portal Status] User ${user.userId} is org member (role: ${orgMembership.role})`);
      }
    }

    // No customer record AND not an org member - new user, needs to checkout
    if (!customer && !orgMembership) {
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
    // For org members, use the org owner's subscription status
    const effectiveCustomer = customer || orgOwnerCustomer;
    const subscriptionStatus = effectiveCustomer?.subscriptionStatus || "none";
    const hasActiveSubscription = ["active", "trialing"].includes(
      subscriptionStatus,
    );
    const hasExpiredSubscription = ["canceled", "past_due", "unpaid"].includes(
      subscriptionStatus,
    );

    // Get device count and account type for dashboard display
    // For org members, use the org's license info (business plan)
    const accountType = orgMembership ? "business" : (effectiveCustomer?.accountType || "individual");
    const planConfig = PRICING[accountType];
    const maxDevices = planConfig?.maxConcurrentMachinesPerSeat || planConfig?.maxConcurrentMachines || 3;
    
    // Get device count - for org members, count their personal devices
    // (In future: could track member devices separately)
    let activatedDevices = 0;
    const licenseId = effectiveCustomer?.keygenLicenseId;
    if (licenseId) {
      try {
        const devices = await getLicenseDevices(licenseId);
        activatedDevices = devices.length;
      } catch (error) {
        console.error("[Portal Status] Failed to get device count:", error.message);
      }
    }

    // Build response with org info for members
    const response = {
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
      keygenLicenseId: licenseId || null,
      stripeCustomerId: effectiveCustomer?.stripeCustomerId || null,
      activatedDevices,
      maxDevices,
      user: {
        email: user.email,
        userId: user.userId,
      },
    };

    // Add org context for Business tier members
    if (orgMembership) {
      response.orgMembership = {
        orgId: orgMembership.orgId,
        role: orgMembership.role,
        joinedAt: orgMembership.joinedAt,
      };
      // Members don't control billing - they share the org's subscription
      response.isOrgMember = true;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("[Portal Status] Error:", error);
    return NextResponse.json(
      { error: "Failed to get portal status" },
      { status: 500 },
    );
  }
}
