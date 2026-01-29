/**
 * Portal Account Deletion API
 *
 * POST /api/portal/settings/delete-account - Request account deletion
 *
 * Implements soft-delete with grace period for account recovery.
 * Hard deletion happens after 30 days via scheduled job.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCustomerByUserId, upsertCustomer } from "@/lib/dynamodb";
import { stripe } from "@/lib/stripe";

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { confirmation, reason } = body;

    // Require explicit confirmation
    if (confirmation !== "DELETE MY ACCOUNT") {
      return NextResponse.json(
        { error: "Please type 'DELETE MY ACCOUNT' to confirm" },
        { status: 400 },
      );
    }

    const customer = await getCustomerByUserId(session.user.sub);
    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 },
      );
    }

    // Check for active team memberships
    if (customer.orgId && customer.orgRole !== "owner") {
      return NextResponse.json(
        {
          error:
            "Please leave your organization before deleting your account. Contact your organization admin.",
        },
        { status: 400 },
      );
    }

    // If user is org owner, prevent deletion (must transfer ownership or delete org first)
    if (customer.orgId && customer.orgRole === "owner") {
      return NextResponse.json(
        {
          error:
            "As an organization owner, you must transfer ownership or delete the organization before deleting your account.",
        },
        { status: 400 },
      );
    }

    // Cancel any active Stripe subscription
    if (customer.stripeCustomerId) {
      try {
        const subscriptions = await stripe.subscriptions.list({
          customer: customer.stripeCustomerId,
          status: "active",
          limit: 10,
        });

        for (const subscription of subscriptions.data) {
          await stripe.subscriptions.cancel(subscription.id, {
            invoice_now: false,
            prorate: true,
          });
        }
      } catch (stripeError) {
        console.error("Error cancelling subscriptions:", stripeError);
        // Continue with deletion even if Stripe fails
      }
    }

    // Calculate deletion date (30 days from now)
    const deletionDate = new Date();
    deletionDate.setDate(deletionDate.getDate() + 30);

    // Soft-delete: Mark account for deletion
    await upsertCustomer({
      cognitoUserId: session.user.sub,
      email: session.user.email,
      name: customer.name,
      accountStatus: "pending_deletion",
      deletionRequestedAt: new Date().toISOString(),
      scheduledDeletionAt: deletionDate.toISOString(),
      deletionReason: reason || "User requested",
      subscriptionStatus: "cancelled",
    });

    // TODO: In production, queue a job to:
    // 1. Deactivate all devices in KeyGen
    // 2. Delete user from Cognito
    // 3. Hard-delete from DynamoDB after grace period
    // 4. Send confirmation email

    return NextResponse.json({
      success: true,
      message: "Account deletion requested",
      scheduledDeletionAt: deletionDate.toISOString(),
      gracePeriodDays: 30,
    });
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
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const customer = await getCustomerByUserId(session.user.sub);
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
      cognitoUserId: session.user.sub,
      email: session.user.email,
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
