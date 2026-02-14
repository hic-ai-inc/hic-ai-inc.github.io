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
import { verifyAuthToken } from "@/lib/auth-verify";
import {
  getCustomerByUserId,
  getCustomerByEmail,
  getActiveUserDevicesInWindow,
  getUserOrgMembership,
  getOrganization,
  getCustomerByStripeId,
} from "@/lib/dynamodb";
import { PRICING } from "@/lib/constants";

/**
 * Extract user info from Cognito ID token
 */
async function getUserFromRequest() {
  const payload = await verifyAuthToken();
  if (!payload) return null;

  return {
    userId: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified,
  };
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
    // When org membership is found, prefer orgOwnerCustomer (bare profile has no subscription)
    const effectiveCustomer = orgMembership ? (orgOwnerCustomer || customer) : customer;
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
    
    // licenseId at function scope — used in device count AND response body
    const licenseId = effectiveCustomer?.keygenLicenseId;

    // Get active device count in heartbeat window (current user only)
    let activatedDevices = 0;
    if (!orgMembership && licenseId) {
      try {
        const activeDevices = await getActiveUserDevicesInWindow(
          licenseId,
          user.userId,
        );
        activatedDevices = activeDevices.length;
      } catch (error) {
        console.error("[Portal Status] Failed to get active device count:", error.message);
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
