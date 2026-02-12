/**
 * Portal Account Deletion API
 *
 * POST /api/portal/settings/delete-account - Request account deletion
 *
 * Implements soft-delete with grace period for account recovery.
 * Subscription is cancelled at period end (user keeps access until then).
 * Account transitions to "deleted" when subscription actually ends.
 * User can reinstate by subscribing again later.
 *
 * For Business owners: Also dissolves the organization and removes all members.
 *
 * Requires Authorization header with Cognito ID token.
 */

import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth-verify";
import {
  getCustomerByUserId,
  upsertCustomer,
  getOrgMembers,
} from "@/lib/dynamodb";
import { getStripeClient } from "@/lib/stripe";

export async function POST(request) {
  try {
    const tokenPayload = await verifyAuthToken();
    if (!tokenPayload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = {
      sub: tokenPayload.sub,
      email: tokenPayload.email,
    };

    const body = await request.json();
    const { confirmation, reason } = body;

    // Require explicit confirmation
    if (confirmation !== "DELETE MY ACCOUNT") {
      return NextResponse.json(
        { error: "Please type 'DELETE MY ACCOUNT' to confirm" },
        { status: 400 },
      );
    }

    const customer = await getCustomerByUserId(user.sub);
    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 },
      );
    }

    // Check for active team memberships (non-owners must leave first)
    if (customer.orgId && customer.orgRole !== "owner") {
      return NextResponse.json(
        {
          error:
            "Please leave your organization before deleting your account. Contact your organization admin.",
        },
        { status: 400 },
      );
    }

    // Track if this is an org owner deletion (requires org dissolution)
    const isOrgOwner = customer.orgId && customer.orgRole === "owner";
    let orgMembers = [];
    let accessUntil = null;

    // Cancel subscription at period end (user keeps access until then)
    if (customer.stripeCustomerId) {
      try {
        const stripe = await getStripeClient();
        const subscriptions = await stripe.subscriptions.list({
          customer: customer.stripeCustomerId,
          status: "active",
          limit: 10,
        });

        for (const subscription of subscriptions.data) {
          // Cancel at period end - user keeps access until billing period ends
          await stripe.subscriptions.update(subscription.id, {
            cancel_at_period_end: true,
          });
          // Track when access ends for the response
          if (subscription.current_period_end) {
            accessUntil = new Date(subscription.current_period_end * 1000).toISOString();
          }
        }
      } catch (stripeError) {
        console.error("Error cancelling subscriptions:", stripeError);
        // Continue with deletion even if Stripe fails
      }
    }

    // If org owner, dissolve the organization
    if (isOrgOwner) {
      try {
        orgMembers = await getOrgMembers(customer.orgId);
        
        // Remove all non-owner members from the org
        for (const member of orgMembers) {
          if (member.userId !== user.sub) {
            await upsertCustomer({
              userId: member.userId,
              email: member.email,
              name: member.name,
              orgId: null,
              orgRole: null,
              accountStatus: "active", // They can still use Mouse if they subscribe individually
            });
            console.log(`[DeleteAccount] Removed member ${member.userId} from org ${customer.orgId}`);
          }
        }
        console.log(`[DeleteAccount] Dissolved org ${customer.orgId} with ${orgMembers.length} members`);
      } catch (orgError) {
        console.error("Error dissolving organization:", orgError);
        // Continue - org dissolution failure shouldn't block account deletion
      }
    }

    // Soft-delete: Mark account for deletion
    // Account stays in "pending_deletion" until subscription actually ends
    await upsertCustomer({
      userId: user.sub,
      email: user.email,
      name: customer.name,
      accountStatus: "pending_deletion",
      deletionRequestedAt: new Date().toISOString(),
      accessUntil: accessUntil || new Date().toISOString(),
      deletionReason: reason || "User requested",
      // Clear org membership for owner (org is dissolved)
      ...(isOrgOwner && { orgId: null, orgRole: null }),
    });

    // Build response with org dissolution info if applicable
    const response = {
      success: true,
      message: isOrgOwner
        ? "Account deletion requested. Your organization has been dissolved."
        : "Account deletion requested",
      accessUntil,
    };

    if (isOrgOwner && orgMembers.length > 1) {
      response.orgDissolved = true;
      response.membersAffected = orgMembers.length - 1; // Exclude owner
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("Account deletion error:", error);
    return NextResponse.json(
      { error: "Failed to process deletion request" },
      { status: 500 },
    );
  }
}

/**
 * Cancel a pending account deletion
 */
export async function DELETE(request) {
  try {
    const tokenPayload = await verifyAuthToken();
    if (!tokenPayload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = {
      sub: tokenPayload.sub,
      email: tokenPayload.email,
    };

    const customer = await getCustomerByUserId(user.sub);
    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 },
      );
    }

    if (customer.accountStatus !== "pending_deletion") {
      return NextResponse.json(
        { error: "No pending deletion request found" },
        { status: 400 },
      );
    }

    // Cancel the deletion
    await upsertCustomer({
      userId: user.sub,
      email: user.email,
      name: customer.name,
      accountStatus: "active",
      deletionRequestedAt: null,
      scheduledDeletionAt: null,
      deletionReason: null,
    });

    return NextResponse.json({
      success: true,
      message: "Account deletion cancelled",
    });
  } catch (error) {
    console.error("Cancel deletion error:", error);
    return NextResponse.json(
      { error: "Failed to cancel deletion request" },
      { status: 500 },
    );
  }
}
