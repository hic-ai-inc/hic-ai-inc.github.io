/**
 * Team Management API
 *
 * Endpoints for managing team members and invites.
 * Requires business subscription with org admin permissions.
 * Requires Authorization header with Cognito ID token.
 *
 * @see PLG Technical Specification v2 - Section 4.5
 */

import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth-verify";

import {
  getOrgMembers,
  getOrgInvites,
  getOrgLicenseUsage,
  createOrgInvite,
  deleteOrgInvite,
  updateOrgMemberStatus,
  updateOrgMemberRole,
  removeOrgMember,
  getCustomerByUserId,
  getCustomerByEmail,
  getUserOrgMembership,
  resendOrgInvite,
  getOrganizationByStripeCustomer,
  getOrganization,
} from "@/lib/dynamodb";
import { createApiLogger } from "@/lib/api-log";

/**
 * GET /api/portal/team
 *
 * Get team members, pending invites, and seat usage.
 * Requires business subscription.
 */
export async function GET(request) {
  const log = createApiLogger({
    service: "plg-api-portal-team",
    request,
    operation: "portal_team_list",
  });

  log.requestReceived();

  try {
    // Verify JWT from Authorization header
    const tokenPayload = await verifyAuthToken();
    if (!tokenPayload) {
      log.decision("auth_failed", "Team list rejected", { reason: "unauthorized" });
      log.response(401, "Team list rejected", { reason: "unauthorized" });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Look up account type from DynamoDB (not JWT claims)
    // This handles cases where JWT custom attributes aren't set
    let customer = await getCustomerByUserId(tokenPayload.sub);
    if (!customer && tokenPayload.email) {
      customer = await getCustomerByEmail(tokenPayload.email);
    }

    // Check for org membership (Business tier members)
    let orgMembership = null;
    if (!customer?.subscriptionStatus) {
      orgMembership = await getUserOrgMembership(tokenPayload.sub);
    }

    // Determine account type from DynamoDB
    const accountType = orgMembership
      ? "business"
      : customer?.accountType || "individual";

    // Check for business account
    if (accountType !== "business") {
      log.decision("business_tier_required", "Team list rejected", {
        reason: "business_tier_required",
      });
      log.response(403, "Team list rejected", {
        reason: "business_tier_required",
      });
      return NextResponse.json(
        { error: "Team management requires a business subscription" },
        { status: 403 },
      );
    }

    // Get orgId from membership or customer record
    let orgId = orgMembership?.orgId || customer?.orgId;

    // Fallback: If no org_id, try to find org by stripeCustomerId
    const stripeCustomerId =
      customer?.stripeCustomerId || tokenPayload["custom:stripe_customer_id"];
    if (!orgId && stripeCustomerId) {
      const org = await getOrganizationByStripeCustomer(stripeCustomerId);
      if (org) {
        orgId = org.orgId;
      }
    }

    if (!orgId) {
      log.decision("organization_not_configured", "Team list rejected", {
        reason: "organization_not_configured",
      });
      log.response(400, "Team list rejected", {
        reason: "organization_not_configured",
      });
      return NextResponse.json(
        { error: "Organization not configured. Please contact support." },
        { status: 400 },
      );
    }

    // Fetch team data in parallel
    const [members, invites, usage] = await Promise.all([
      getOrgMembers(orgId),
      getOrgInvites(orgId),
      getOrgLicenseUsage(orgId),
    ]);

    // Format members for response
    const formattedMembers = members.map((m) => ({
      id: m.memberId,
      name: m.name || "Unknown",
      email: m.email,
      role: m.role,
      status: m.status,
      joinedAt: m.joinedAt,
    }));

    // Format invites for response
    const formattedInvites = invites.map((i) => ({
      id: i.inviteId,
      email: i.email,
      role: i.role,
      status: i.status,
      invitedAt: i.createdAt,
      expiresAt: i.expiresAt,
      ...(i.acceptedAt && { acceptedAt: i.acceptedAt }),
    }));

    log.response(200, "Team list returned", {
      membersCount: formattedMembers.length,
      invitesCount: formattedInvites.length,
      seatLimit: usage.seatLimit,
      seatsUsed: usage.seatsUsed,
    });
    return NextResponse.json({
      members: formattedMembers,
      invites: formattedInvites,
      usage: {
        totalSeats: usage.seatLimit,
        usedSeats: usage.seatsUsed,
        availableSeats: usage.seatsAvailable,
        utilizationPercent: usage.utilizationPercent,
      },
    });
  } catch (error) {
    log.exception(error, "portal_team_list_failed", "Team list failed");
    log.response(500, "Team list failed", { reason: "unhandled_error" });
    return NextResponse.json(
      { error: "Failed to fetch team data" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/portal/team
 *
 * Create a new team invite or add a member.
 * Body: { action: "invite", email, role } or { action: "update_status", memberId, status }
 */
export async function POST(request) {
  const log = createApiLogger({
    service: "plg-api-portal-team",
    request,
    operation: "portal_team_invite",
  });

  log.requestReceived();

  try {
    // Verify JWT from Authorization header
    const tokenPayload = await verifyAuthToken();
    if (!tokenPayload) {
      log.decision("auth_failed", "Team update rejected", { reason: "unauthorized" });
      log.response(401, "Team update rejected", { reason: "unauthorized" });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Look up account type from DynamoDB (not JWT claims)
    let customer = await getCustomerByUserId(tokenPayload.sub);
    if (!customer && tokenPayload.email) {
      customer = await getCustomerByEmail(tokenPayload.email);
    }

    // Check for org membership (Business tier members)
    let orgMembership = null;
    if (!customer?.subscriptionStatus) {
      orgMembership = await getUserOrgMembership(tokenPayload.sub);
    }

    // Determine account type and org role from DynamoDB
    const accountType = orgMembership
      ? "business"
      : customer?.accountType || "individual";
    const orgId = orgMembership?.orgId || customer?.orgId;
    const userRole = orgMembership?.role || customer?.orgRole || "member";

    // Check for business account
    if (accountType !== "business") {
      log.decision("business_tier_required", "Team remove rejected", {
        reason: "business_tier_required",
      });
      log.response(403, "Team remove rejected", {
        reason: "business_tier_required",
      });
      return NextResponse.json(
        { error: "Team management requires a team subscription" },
        { status: 403 },
      );
    }

    if (!orgId) {
      log.decision("organization_not_configured", "Team remove rejected", {
        reason: "organization_not_configured",
      });
      log.response(400, "Team remove rejected", {
        reason: "organization_not_configured",
      });
      return NextResponse.json(
        { error: "Organization not configured" },
        { status: 400 },
      );
    }

    // Check admin permissions
    if (userRole !== "owner" && userRole !== "admin") {
      log.decision("admin_permissions_required", "Team remove rejected", {
        reason: "admin_permissions_required",
      });
      log.response(403, "Team remove rejected", {
        reason: "admin_permissions_required",
      });
      return NextResponse.json(
        { error: "Admin permissions required" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { action } = body;

    switch (action) {
      case "invite": {
        const { email, role = "member" } = body;

        if (!email) {
          return NextResponse.json(
            { error: "Email is required" },
            { status: 400 },
          );
        }

        // Validate role
        if (!["admin", "member"].includes(role)) {
          return NextResponse.json(
            { error: "Invalid role. Must be admin or member" },
            { status: 400 },
          );
        }

        // Check seat availability
        const usage = await getOrgLicenseUsage(orgId);
        const invites = await getOrgInvites(orgId);

        // Count pending invites against seats
        const pendingInviteCount = invites.length;
        const effectiveUsed = usage.seatsUsed + pendingInviteCount;

        if (effectiveUsed >= usage.seatLimit) {
          return NextResponse.json(
            {
              error:
                "No seats available. Upgrade your plan to add more members.",
            },
            { status: 400 },
          );
        }

        // Check if already invited
        const existingInvite = invites.find(
          (i) => i.email.toLowerCase() === email.toLowerCase(),
        );
        if (existingInvite) {
          return NextResponse.json(
            { error: "This email already has a pending invite" },
            { status: 400 },
          );
        }

        // Check if invitee already has a Mouse account with an active license
        const existingCustomer = await getCustomerByEmail(email);
        if (
          existingCustomer?.keygenLicenseId ||
          existingCustomer?.subscriptionStatus === "active"
        ) {
          return NextResponse.json(
            {
              error:
                "This individual already has a Mouse account. Please contact support for account merging.",
            },
            { status: 400 },
          );
        }

        // Get org and inviter info for email metadata
        const org = await getOrganization(orgId);
        const inviter = await getCustomerByUserId(tokenPayload.sub);
        const inviterName =
          inviter?.name ||
          tokenPayload.name ||
          tokenPayload.email ||
          "Your team";
        const organizationName =
          org?.name || inviter?.organizationName || "Your organization";

        // Create invite with email metadata (event-driven flow handles email)
        const invite = await createOrgInvite(
          orgId,
          email,
          role,
          tokenPayload.sub,
          {
            organizationName,
            inviterName,
          },
        );

        return NextResponse.json({
          success: true,
          invite: {
            id: invite.inviteId,
            email: invite.email,
            role: invite.role,
            token: invite.token,
            expiresAt: invite.expiresAt,
          },
        });
      }

      case "update_status": {
        const { memberId, status } = body;

        if (!memberId || !status) {
          return NextResponse.json(
            { error: "memberId and status are required" },
            { status: 400 },
          );
        }

        if (!["active", "suspended", "revoked"].includes(status)) {
          return NextResponse.json(
            { error: "Invalid status. Must be active, suspended, or revoked" },
            { status: 400 },
          );
        }

        // Cannot modify owner
        const members = await getOrgMembers(orgId);
        const targetMember = members.find((m) => m.memberId === memberId);

        if (!targetMember) {
          return NextResponse.json(
            { error: "Member not found" },
            { status: 404 },
          );
        }

        if (targetMember.role === "owner") {
          return NextResponse.json(
            { error: "Cannot modify owner status" },
            { status: 403 },
          );
        }

        const updated = await updateOrgMemberStatus(orgId, memberId, status);

        return NextResponse.json({
          success: true,
          member: {
            id: updated.memberId,
            status: updated.status,
          },
        });
      }

      case "update_role": {
        const { memberId, role } = body;

        if (!memberId || !role) {
          return NextResponse.json(
            { error: "memberId and role are required" },
            { status: 400 },
          );
        }

        if (!["admin", "member"].includes(role)) {
          return NextResponse.json(
            { error: "Invalid role. Must be admin or member" },
            { status: 400 },
          );
        }

        // Get all members to check constraints
        const members = await getOrgMembers(orgId);
        const targetMember = members.find((m) => m.memberId === memberId);

        if (!targetMember) {
          return NextResponse.json(
            { error: "Member not found" },
            { status: 404 },
          );
        }

        // Cannot change owner's role
        if (targetMember.role === "owner") {
          return NextResponse.json(
            { error: "Cannot modify owner role" },
            { status: 403 },
          );
        }

        // Cannot change your own role (use another admin)
        if (memberId === tokenPayload.sub) {
          return NextResponse.json(
            { error: "Cannot change your own role. Contact another admin." },
            { status: 400 },
          );
        }

        const updated = await updateOrgMemberRole(orgId, memberId, role);

        return NextResponse.json({
          success: true,
          member: {
            id: updated.memberId,
            role: updated.role,
          },
        });
      }

      case "resend_invite": {
        const { inviteId } = body;

        if (!inviteId) {
          return NextResponse.json(
            { error: "inviteId is required" },
            { status: 400 },
          );
        }

        // Get the invite to resend
        const invites = await getOrgInvites(orgId);
        const invite = invites.find((i) => i.inviteId === inviteId);

        if (!invite) {
          return NextResponse.json(
            { error: "Invite not found" },
            { status: 404 },
          );
        }

        // Refresh the invite expiration
        const updatedInvite = await resendOrgInvite(orgId, inviteId);

        // Email sent via event-driven pipeline (DDB Stream → SNS → SQS → EmailSender)

        return NextResponse.json({
          success: true,
          invite: {
            id: updatedInvite.inviteId,
            email: updatedInvite.email,
            expiresAt: updatedInvite.expiresAt,
          },
        });
      }

      default:
        return NextResponse.json(
          {
            error:
              "Invalid action. Use invite, update_status, update_role, or resend_invite",
          },
          { status: 400 },
        );
    }
  } catch (error) {
    log.exception(error, "portal_team_update_failed", "Team update failed");
    log.response(500, "Team update failed", { reason: "unhandled_error" });
    return NextResponse.json(
      { error: error.message || "Failed to process request" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/portal/team
 *
 * Remove a team member or cancel an invite.
 * Body: { type: "member", memberId } or { type: "invite", inviteId }
 */
export async function DELETE(request) {
  const log = createApiLogger({
    service: "plg-api-portal-team",
    request,
    operation: "portal_team_remove",
  });

  log.requestReceived();

  try {
    // Verify JWT from Authorization header
    const tokenPayload = await verifyAuthToken();
    if (!tokenPayload) {
      log.decision("auth_failed", "Team remove rejected", { reason: "unauthorized" });
      log.response(401, "Team remove rejected", { reason: "unauthorized" });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Look up account type from DynamoDB (not JWT claims)
    let customer = await getCustomerByUserId(tokenPayload.sub);
    if (!customer && tokenPayload.email) {
      customer = await getCustomerByEmail(tokenPayload.email);
    }

    // Check for org membership (Business tier members)
    let orgMembership = null;
    if (!customer?.subscriptionStatus) {
      orgMembership = await getUserOrgMembership(tokenPayload.sub);
    }

    // Determine account type and org role from DynamoDB
    const accountType = orgMembership
      ? "business"
      : customer?.accountType || "individual";
    const orgId = orgMembership?.orgId || customer?.orgId;
    const userRole = orgMembership?.role || customer?.orgRole || "member";

    // Check for business account
    if (accountType !== "business") {
      log.decision("business_tier_required", "Team update rejected", {
        reason: "business_tier_required",
      });
      log.response(403, "Team update rejected", {
        reason: "business_tier_required",
      });
      return NextResponse.json(
        { error: "Team management requires a team subscription" },
        { status: 403 },
      );
    }

    if (!orgId) {
      log.decision("organization_not_configured", "Team update rejected", {
        reason: "organization_not_configured",
      });
      log.response(400, "Team update rejected", {
        reason: "organization_not_configured",
      });
      return NextResponse.json(
        { error: "Organization not configured" },
        { status: 400 },
      );
    }

    // Check admin permissions
    if (userRole !== "owner" && userRole !== "admin") {
      log.decision("admin_permissions_required", "Team update rejected", {
        reason: "admin_permissions_required",
      });
      log.response(403, "Team update rejected", {
        reason: "admin_permissions_required",
      });
      return NextResponse.json(
        { error: "Admin permissions required" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { type } = body;

    switch (type) {
      case "member": {
        const { memberId } = body;

        if (!memberId) {
          return NextResponse.json(
            { error: "memberId is required" },
            { status: 400 },
          );
        }

        // Cannot remove owner
        const members = await getOrgMembers(orgId);
        const targetMember = members.find((m) => m.memberId === memberId);

        if (!targetMember) {
          return NextResponse.json(
            { error: "Member not found" },
            { status: 404 },
          );
        }

        if (targetMember.role === "owner") {
          return NextResponse.json(
            { error: "Cannot remove organization owner" },
            { status: 403 },
          );
        }

        // Cannot remove self
        if (memberId === tokenPayload.sub) {
          return NextResponse.json(
            { error: "Cannot remove yourself. Contact another admin." },
            { status: 400 },
          );
        }

        await removeOrgMember(orgId, memberId);

        return NextResponse.json({
          success: true,
          message: "Member removed",
        });
      }

      case "invite": {
        const { inviteId } = body;

        if (!inviteId) {
          return NextResponse.json(
            { error: "inviteId is required" },
            { status: 400 },
          );
        }

        await deleteOrgInvite(orgId, inviteId);

        return NextResponse.json({
          success: true,
          message: "Invite cancelled",
        });
      }

      default:
        return NextResponse.json(
          { error: "Invalid type. Use member or invite" },
          { status: 400 },
        );
    }
  } catch (error) {
    log.exception(error, "portal_team_remove_failed", "Team remove failed");
    log.response(500, "Team remove failed", { reason: "unhandled_error" });
    return NextResponse.json(
      { error: error.message || "Failed to process request" },
      { status: 500 },
    );
  }
}
