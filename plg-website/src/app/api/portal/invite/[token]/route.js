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

/**
 * GET - Retrieve invite details for the acceptance page
 */
export async function GET(request, { params }) {
  try {
    const { token } = await params;

    if (!token) {
      return NextResponse.json(
        { error: "Invalid invite link" },
        { status: 400 },
      );
    }

    const invite = await getInviteByToken(token);

    if (!invite) {
      return NextResponse.json(
        { error: "Invite not found or has expired" },
        { status: 404 },
      );
    }

    // Check if invite is still pending
    if (invite.status !== "pending") {
      return NextResponse.json(
        { error: "This invite has already been used or cancelled" },
        { status: 400 },
      );
    }

    // Check if invite has expired
    if (new Date(invite.expiresAt) < new Date()) {
      return NextResponse.json(
        { error: "This invite has expired. Please request a new one." },
        { status: 400 },
      );
    }

    // Return safe invite details (don't expose internal IDs)
    return NextResponse.json({
      email: invite.email,
      role: invite.role,
      orgId: invite.orgId,
      expiresAt: invite.expiresAt,
    });
  } catch (error) {
    console.error("Get invite error:", error);
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
  try {
    // Verify JWT from Authorization header (client-side auth, same pattern as portal APIs)
    const tokenPayload = await verifyAuthToken();
    if (!tokenPayload) {
      return NextResponse.json(
        { error: "Please sign in to accept this invite" },
        { status: 401 },
      );
    }

    const { token } = await params;

    if (!token) {
      return NextResponse.json(
        { error: "Invalid invite link" },
        { status: 400 },
      );
    }

    const invite = await getInviteByToken(token);

    if (!invite) {
      return NextResponse.json(
        { error: "Invite not found or has expired" },
        { status: 404 },
      );
    }

    // Verify invite status
    if (invite.status !== "pending") {
      return NextResponse.json(
        { error: "This invite has already been used or cancelled" },
        { status: 400 },
      );
    }

    // Check expiration
    if (new Date(invite.expiresAt) < new Date()) {
      return NextResponse.json(
        { error: "This invite has expired. Please request a new one." },
        { status: 400 },
      );
    }

    // Verify email matches (case-insensitive)
    const userEmail = tokenPayload.email?.toLowerCase();
    const inviteEmail = invite.email?.toLowerCase();

    if (userEmail !== inviteEmail) {
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
      console.log(`Assigned ${invite.role} role to ${tokenPayload.sub} via Cognito group`);
    } catch (error) {
      // Log but don't fail the invite accept - DynamoDB membership is the source of truth
      // User might need to re-login to get updated token claims
      console.error(`Failed to assign Cognito group for ${tokenPayload.sub}:`, error.message);
    }

    return NextResponse.json({
      success: true,
      message: "You have successfully joined the organization",
      redirectTo: "/portal/team",
    });
  } catch (error) {
    console.error("Accept invite error:", error);
    return NextResponse.json(
      { error: "Failed to accept invite" },
      { status: 500 },
    );
  }
}
