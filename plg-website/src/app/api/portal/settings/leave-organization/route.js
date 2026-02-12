/**
 * Portal Leave Organization API
 *
 * POST /api/portal/settings/leave-organization - Leave current organization
 *
 * Allows members (non-owners) to remove themselves from an organization.
 * Owners must transfer ownership before leaving.
 * Requires Authorization header with Cognito ID token.
 */

import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth-verify";
import {
  getCustomerByUserId,
  removeOrgMember,
  upsertCustomer,
} from "@/lib/dynamodb";
import { removeUserFromGroup, getUserRole } from "@/lib/cognito-admin";

export async function POST(request) {
  try {
    const tokenPayload = await verifyAuthToken();
    if (!tokenPayload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = tokenPayload.sub;
    const body = await request.json();
    const { confirmation } = body;

    // Require explicit confirmation
    if (confirmation !== "LEAVE ORGANIZATION") {
      return NextResponse.json(
        { error: "Please type 'LEAVE ORGANIZATION' to confirm" },
        { status: 400 },
      );
    }

    const customer = await getCustomerByUserId(userId);
    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 },
      );
    }

    // Must be in an organization
    if (!customer.orgId) {
      return NextResponse.json(
        { error: "You are not a member of any organization" },
        { status: 400 },
      );
    }

    // Owners cannot leave - must transfer ownership first
    if (customer.orgRole === "owner") {
      return NextResponse.json(
        {
          error:
            "As the organization owner, you must transfer ownership to another member before leaving, or delete the organization.",
        },
        { status: 400 },
      );
    }

    const orgId = customer.orgId;
    const previousRole = customer.orgRole;

    // Remove from organization (DynamoDB)
    await removeOrgMember(orgId, userId);

    // Remove from Cognito group
    try {
      const currentRole = await getUserRole(userId);
      if (currentRole) {
        const groupName = `mouse-${currentRole}`;
        await removeUserFromGroup(userId, groupName);
        console.log(`Removed ${userId} from Cognito group ${groupName}`);
      }
    } catch (cognitoError) {
      // Log but don't fail - DynamoDB is source of truth
      console.error(
        `Failed to remove Cognito group for ${userId}:`,
        cognitoError.message,
      );
    }

    // Update customer record to clear org association
    await upsertCustomer({
      ...customer,
      orgId: null,
      orgRole: null,
    });

    console.log(
      `User ${userId} left organization ${orgId} (was: ${previousRole})`,
    );

    return NextResponse.json({
      success: true,
      message: "You have left the organization",
      redirectTo: "/portal",
    });
  } catch (error) {
    console.error("Leave organization error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to leave organization" },
      { status: 500 },
    );
  }
}
