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
import { createApiLogger } from "@/lib/api-log";

export async function POST(request) {
  const log = createApiLogger({
    service: "plg-api-portal-settings-leave-org",
    request,
    operation: "portal_settings_leave_org",
  });

  log.requestReceived();

  try {
    const tokenPayload = await verifyAuthToken();
    if (!tokenPayload) {
      log.decision("auth_failed", "Leave organization rejected", {
        reason: "unauthorized",
      });
      log.response(401, "Leave organization rejected", { reason: "unauthorized" });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = tokenPayload.sub;
    const body = await request.json();
    const { confirmation } = body;

    // Require explicit confirmation
    if (confirmation !== "LEAVE ORGANIZATION") {
      log.decision("confirmation_invalid", "Leave organization rejected", {
        reason: "confirmation_mismatch",
      });
      log.response(400, "Leave organization rejected", {
        reason: "confirmation_mismatch",
      });
      return NextResponse.json(
        { error: "Please type 'LEAVE ORGANIZATION' to confirm" },
        { status: 400 },
      );
    }

    const customer = await getCustomerByUserId(userId);
    if (!customer) {
      log.decision("customer_not_found", "Leave organization rejected", {
        reason: "customer_not_found",
      });
      log.response(404, "Leave organization rejected", {
        reason: "customer_not_found",
      });
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 },
      );
    }

    // Must be in an organization
    if (!customer.orgId) {
      log.decision("not_org_member", "Leave organization rejected", {
        reason: "not_org_member",
      });
      log.response(400, "Leave organization rejected", { reason: "not_org_member" });
      return NextResponse.json(
        { error: "You are not a member of any organization" },
        { status: 400 },
      );
    }

    // Owners cannot leave - must transfer ownership first
    if (customer.orgRole === "owner") {
      log.decision("owner_cannot_leave", "Leave organization rejected", {
        reason: "owner_must_transfer",
      });
      log.response(400, "Leave organization rejected", {
        reason: "owner_must_transfer",
      });
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
        log.info("cognito_group_removed", "User removed from Cognito group", {
          groupName,
        });
      }
    } catch (cognitoError) {
      // Log but don't fail - DynamoDB is source of truth
      log.warn("cognito_group_remove_failed", "Failed to remove Cognito group", {
        errorMessage: cognitoError.message,
      });
    }

    // Update customer record to clear org association
    await upsertCustomer({
      ...customer,
      orgId: null,
      orgRole: null,
    });

    log.info("organization_left", "User left organization", {
      hasOrgId: Boolean(orgId),
      previousRole,
    });

    log.response(200, "Leave organization succeeded", {
      success: true,
    });
    return NextResponse.json({
      success: true,
      message: "You have left the organization",
      redirectTo: "/portal",
    });
  } catch (error) {
    log.exception(error, "portal_settings_leave_org_failed", "Leave organization failed");
    log.response(500, "Leave organization failed", { reason: "unhandled_error" });
    return NextResponse.json(
      { error: error.message || "Failed to leave organization" },
      { status: 500 },
    );
  }
}
