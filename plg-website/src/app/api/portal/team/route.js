/**
 * Team Management API
 *
 * Endpoints for managing team members and invites.
 * Requires team/enterprise subscription with org admin permissions.
 *
 * @see PLG Technical Specification v2 - Section 4.5
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { AUTH0_NAMESPACE } from "@/lib/constants";
import {
  getOrgMembers,
  getOrgInvites,
  getOrgLicenseUsage,
  createOrgInvite,
  deleteOrgInvite,
  updateOrgMemberStatus,
  removeOrgMember,
} from "@/lib/dynamodb";

/**
 * GET /api/portal/team
 *
 * Get team members, pending invites, and seat usage.
 * Requires team/enterprise subscription.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = session.user;
    const accountType = user[`${AUTH0_NAMESPACE}/account_type`];
    const orgId = user[`${AUTH0_NAMESPACE}/org_id`];

    // Check for team/enterprise account
    if (accountType !== "team" && accountType !== "enterprise") {
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
      status: "pending",
      invitedAt: i.createdAt,
      expiresAt: i.expiresAt,
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
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = session.user;
    const accountType = user[`${AUTH0_NAMESPACE}/account_type`];
    const orgId = user[`${AUTH0_NAMESPACE}/org_id`];
    const userRole = user[`${AUTH0_NAMESPACE}/org_role`];

    // Check for team/enterprise account
    if (accountType !== "team" && accountType !== "enterprise") {
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

        // Create invite
        const invite = await createOrgInvite(orgId, email, role, user.sub);

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

      default:
        return NextResponse.json(
          { error: "Invalid action. Use invite or update_status" },
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
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = session.user;
    const accountType = user[`${AUTH0_NAMESPACE}/account_type`];
    const orgId = user[`${AUTH0_NAMESPACE}/org_id`];
    const userRole = user[`${AUTH0_NAMESPACE}/org_role`];

    // Check for team/enterprise account
    if (accountType !== "team" && accountType !== "enterprise") {
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
        if (memberId === user.sub) {
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
