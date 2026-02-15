/**
 * Invite Acceptance API
 *
 * GET /api/portal/invite/[token] - Get invite details
 * POST /api/portal/invite/[token] - Accept the invite
 */

import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth-verify";
import {
  getInviteByToken,
  acceptOrgInvite,
} from "@/lib/dynamodb";
// Cognito admin operations for RBAC group assignment
import { assignInvitedRole } from "@/lib/cognito-admin";
import { createApiLogger } from "@/lib/api-log";

/**
 * GET - Retrieve invite details for the acceptance page
 */
export async function GET(request, { params }) {
  const log = createApiLogger({
    service: "plg-api-portal-invite",
    request,
    operation: "portal_invite_check",
  });

  log.requestReceived();

  try {
    const { token } = await params;

    if (!token) {
      log.decision("token_missing", "Invite check rejected", {
        reason: "token_missing",
      });
      log.response(400, "Invite check rejected", { reason: "token_missing" });
      return NextResponse.json(
        { error: "Invalid invite link" },
        { status: 400 },
      );
    }

    const invite = await getInviteByToken(token);

    if (!invite) {
      log.decision("invite_not_found", "Invite check rejected", {
        reason: "invite_not_found",
      });
      log.response(404, "Invite check rejected", { reason: "invite_not_found" });
      return NextResponse.json(
        { error: "Invite not found or has expired" },
        { status: 404 },
      );
    }

    // Check if invite is still pending
    if (invite.status !== "pending") {
      log.decision("invite_not_pending", "Invite check rejected", {
        reason: "invite_not_pending",
        status: invite.status,
      });
      log.response(400, "Invite check rejected", {
        reason: "invite_not_pending",
      });
      return NextResponse.json(
        { error: "This invite has already been used or cancelled" },
        { status: 400 },
      );
    }

    // Check if invite has expired
    if (new Date(invite.expiresAt) < new Date()) {
      log.decision("invite_expired", "Invite check rejected", {
        reason: "invite_expired",
      });
      log.response(400, "Invite check rejected", { reason: "invite_expired" });
      return NextResponse.json(
        { error: "This invite has expired. Please request a new one." },
        { status: 400 },
      );
    }

    // Return safe invite details (don't expose internal IDs)
    log.info("invite_details_returned", "Invite details returned", {
      role: invite.role,
      hasOrgId: Boolean(invite.orgId),
    });
    log.response(200, "Invite details returned", { success: true });
    return NextResponse.json({
      email: invite.email,
      role: invite.role,
      orgId: invite.orgId,
      expiresAt: invite.expiresAt,
    });
  } catch (error) {
    log.exception(error, "portal_invite_check_failed", "Invite check failed");
    log.response(500, "Invite check failed", { reason: "unhandled_error" });
    return NextResponse.json(
      { error: "Failed to retrieve invite" },
      { status: 500 },
    );
  }
}

/**
 * POST - Accept the invite and join the organization
 */
export async function POST(request, { params }) {
  const log = createApiLogger({
    service: "plg-api-portal-invite",
    request,
    operation: "portal_invite_accept",
  });

  log.requestReceived();

  try {
    // Verify JWT from Authorization header (client-side auth, same pattern as portal APIs)
    const tokenPayload = await verifyAuthToken();
    if (!tokenPayload) {
      log.decision("auth_failed", "Invite accept rejected", {
        reason: "unauthorized",
      });
      log.response(401, "Invite accept rejected", { reason: "unauthorized" });
      return NextResponse.json(
        { error: "Please sign in to accept this invite" },
        { status: 401 },
      );
    }

    const { token } = await params;

    if (!token) {
      log.decision("token_missing", "Invite accept rejected", {
        reason: "token_missing",
      });
      log.response(400, "Invite accept rejected", { reason: "token_missing" });
      return NextResponse.json(
        { error: "Invalid invite link" },
        { status: 400 },
      );
    }

    const invite = await getInviteByToken(token);

    if (!invite) {
      log.decision("invite_not_found", "Invite accept rejected", {
        reason: "invite_not_found",
      });
      log.response(404, "Invite accept rejected", { reason: "invite_not_found" });
      return NextResponse.json(
        { error: "Invite not found or has expired" },
        { status: 404 },
      );
    }

    // Verify invite status
    if (invite.status !== "pending") {
      log.decision("invite_not_pending", "Invite accept rejected", {
        reason: "invite_not_pending",
        status: invite.status,
      });
      log.response(400, "Invite accept rejected", {
        reason: "invite_not_pending",
      });
      return NextResponse.json(
        { error: "This invite has already been used or cancelled" },
        { status: 400 },
      );
    }

    // Check expiration
    if (new Date(invite.expiresAt) < new Date()) {
      log.decision("invite_expired", "Invite accept rejected", {
        reason: "invite_expired",
      });
      log.response(400, "Invite accept rejected", { reason: "invite_expired" });
      return NextResponse.json(
        { error: "This invite has expired. Please request a new one." },
        { status: 400 },
      );
    }

    // Verify email matches (case-insensitive)
    const userEmail = tokenPayload.email?.toLowerCase();
    const inviteEmail = invite.email?.toLowerCase();

    if (userEmail !== inviteEmail) {
      log.decision("invite_email_mismatch", "Invite accept rejected", {
        reason: "invite_email_mismatch",
      });
      log.response(403, "Invite accept rejected", {
        reason: "invite_email_mismatch",
      });
      return NextResponse.json(
        {
          error: `This invite was sent to ${invite.email}. Please sign in with that email address.`,
        },
        { status: 403 },
      );
    }

    // Accept the invite (updates DynamoDB org membership)
    await acceptOrgInvite(token, tokenPayload.sub);

    // RBAC: Assign Cognito group based on invited role (admin or member)
    // This ensures the user's ID token includes the correct custom:role claim
    try {
      await assignInvitedRole(tokenPayload.sub, invite.role);
      log.info("invite_role_assigned", "Invited role assigned in Cognito", {
        role: invite.role,
      });
    } catch (error) {
      // Log but don't fail the invite accept - DynamoDB membership is the source of truth
      // User might need to re-login to get updated token claims
      log.warn("invite_role_assignment_failed", "Failed to assign invited role in Cognito", {
        errorMessage: error.message,
      });
    }

    log.info("invite_accepted", "Invite accepted successfully");
    log.response(200, "Invite accepted", { success: true });
    return NextResponse.json({
      success: true,
      message: "You have successfully joined the organization",
      redirectTo: "/portal/team",
    });
  } catch (error) {
    log.exception(error, "portal_invite_accept_failed", "Invite accept failed");
    log.response(500, "Invite accept failed", { reason: "unhandled_error" });
    return NextResponse.json(
      { error: "Failed to accept invite" },
      { status: 500 },
    );
  }
}
