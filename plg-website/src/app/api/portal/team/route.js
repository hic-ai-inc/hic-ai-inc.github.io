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
import { headers } from "next/headers";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { AUTH_NAMESPACE } from "@/lib/constants";

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
    console.error("[Team] JWT verification failed:", error.message);
    return null;
  }
}
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

/**
 * GET /api/portal/team
 *
 * Get team members, pending invites, and seat usage.
 * Requires business subscription.
 */
export async function GET() {
  try {
    // Verify JWT from Authorization header
    const tokenPayload = await verifyAuthToken();
    if (!tokenPayload) {
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
    console.error("Team API GET error:", error);
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
  try {
    // Verify JWT from Authorization header
    const tokenPayload = await verifyAuthToken();
    if (!tokenPayload) {
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
      return NextResponse.json(
        { error: "Team management requires a team subscription" },
        { status: 403 },
      );
    }

    if (!orgId) {
      return NextResponse.json(
        { error: "Organization not configured" },
        { status: 400 },
      );
    }

    // Check admin permissions
    if (userRole !== "owner" && userRole !== "admin") {
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
    console.error("Team API POST error:", error);
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
  try {
    // Verify JWT from Authorization header
    const tokenPayload = await verifyAuthToken();
    if (!tokenPayload) {
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
      return NextResponse.json(
        { error: "Team management requires a team subscription" },
        { status: 403 },
      );
    }

    if (!orgId) {
      return NextResponse.json(
        { error: "Organization not configured" },
        { status: 400 },
      );
    }

    // Check admin permissions
    if (userRole !== "owner" && userRole !== "admin") {
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
    console.error("Team API DELETE error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process request" },
      { status: 500 },
    );
  }
}
