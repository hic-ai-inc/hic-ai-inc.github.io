/**
 * Team API Route Tests
 *
 * Tests the team management API including:
 * - GET: Fetching team members and invites
 * - POST: Creating invites and updating member status
 * - DELETE: Removing members and canceling invites
 * - Authorization checks (team/enterprise subscription, admin role)
 */

import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert";
import { AUTH_NAMESPACE } from "../../../src/lib/constants.js";

// Helper to create mock Auth0 session for team scenarios
function createMockSession(overrides = {}) {
  return {
    user: {
      sub: "auth0|owner123",
      email: "owner@company.com",
      email_verified: true,
      [`${AUTH_NAMESPACE}/account_type`]: "team",
      [`${AUTH_NAMESPACE}/org_id`]: "org_test123",
      [`${AUTH_NAMESPACE}/org_role`]: "owner",
      ...overrides,
    },
  };
}

// Helper to create mock team member
function createMockMember(overrides = {}) {
  return {
    memberId: "auth0|member123",
    name: "Test Member",
    email: "member@company.com",
    role: "member",
    status: "active",
    joinedAt: "2025-01-15T00:00:00.000Z",
    ...overrides,
  };
}

// Helper to create mock invite
function createMockInvite(overrides = {}) {
  return {
    inviteId: "inv_12345_abc123",
    orgId: "org_test123",
    email: "invited@example.com",
    role: "member",
    status: "pending",
    token: "test-invite-token-12345",
    createdAt: "2025-01-20T00:00:00.000Z",
    expiresAt: "2025-01-27T00:00:00.000Z",
    ...overrides,
  };
}

describe("Team API Logic", () => {
  // Authorization logic tests
  describe("Authorization", () => {
    function checkTeamAuth(session) {
      if (!session?.user) {
        return { authorized: false, error: "Unauthorized", status: 401 };
      }

      const user = session.user;
      const accountType = user[`${AUTH_NAMESPACE}/account_type`];
      const orgId = user[`${AUTH_NAMESPACE}/org_id`];

      if (accountType !== "team" && accountType !== "enterprise") {
        return {
          authorized: false,
          error: "Team management requires a team subscription",
          status: 403,
        };
      }

      if (!orgId) {
        return {
          authorized: false,
          error: "Organization not configured",
          status: 400,
        };
      }

      return { authorized: true, orgId, accountType };
    }

    function checkAdminRole(session) {
      const userRole = session.user[`${AUTH_NAMESPACE}/org_role`];
      if (userRole !== "owner" && userRole !== "admin") {
        return {
          authorized: false,
          error: "Admin permissions required",
          status: 403,
        };
      }
      return { authorized: true, role: userRole };
    }

    it("should reject unauthenticated requests", () => {
      const result = checkTeamAuth(null);
      assert.strictEqual(result.authorized, false);
      assert.strictEqual(result.status, 401);
    });

    it("should reject individual account type", () => {
      const session = createMockSession({
        [`${AUTH_NAMESPACE}/account_type`]: "individual",
      });
      const result = checkTeamAuth(session);
      assert.strictEqual(result.authorized, false);
      assert.strictEqual(result.status, 403);
      assert.match(result.error, /team subscription/);
    });

    it("should allow team account type", () => {
      const session = createMockSession({
        [`${AUTH_NAMESPACE}/account_type`]: "team",
      });
      const result = checkTeamAuth(session);
      assert.strictEqual(result.authorized, true);
      assert.strictEqual(result.accountType, "team");
    });

    it("should allow enterprise account type", () => {
      const session = createMockSession({
        [`${AUTH_NAMESPACE}/account_type`]: "enterprise",
      });
      const result = checkTeamAuth(session);
      assert.strictEqual(result.authorized, true);
      assert.strictEqual(result.accountType, "enterprise");
    });

    it("should reject missing org_id", () => {
      const session = createMockSession({
        [`${AUTH_NAMESPACE}/org_id`]: undefined,
      });
      const result = checkTeamAuth(session);
      assert.strictEqual(result.authorized, false);
      assert.strictEqual(result.status, 400);
      assert.match(result.error, /Organization not configured/);
    });

    it("should reject non-admin role for mutations", () => {
      const session = createMockSession({
        [`${AUTH_NAMESPACE}/org_role`]: "member",
      });
      const result = checkAdminRole(session);
      assert.strictEqual(result.authorized, false);
      assert.strictEqual(result.status, 403);
    });

    it("should allow owner role", () => {
      const session = createMockSession({
        [`${AUTH_NAMESPACE}/org_role`]: "owner",
      });
      const result = checkAdminRole(session);
      assert.strictEqual(result.authorized, true);
      assert.strictEqual(result.role, "owner");
    });

    it("should allow admin role", () => {
      const session = createMockSession({
        [`${AUTH_NAMESPACE}/org_role`]: "admin",
      });
      const result = checkAdminRole(session);
      assert.strictEqual(result.authorized, true);
      assert.strictEqual(result.role, "admin");
    });
  });

  // GET endpoint logic tests
  describe("GET /api/portal/team", () => {
    function formatMembersResponse(members) {
      return members.map((m) => ({
        id: m.memberId,
        name: m.name || "Unknown",
        email: m.email,
        role: m.role,
        status: m.status,
        joinedAt: m.joinedAt,
      }));
    }

    function formatInvitesResponse(invites) {
      return invites.map((i) => ({
        id: i.inviteId,
        email: i.email,
        role: i.role,
        status: "pending",
        invitedAt: i.createdAt,
        expiresAt: i.expiresAt,
      }));
    }

    function formatUsageResponse(usage) {
      return {
        totalSeats: usage.seatLimit,
        usedSeats: usage.seatsUsed,
        availableSeats: usage.seatsAvailable,
        utilizationPercent: usage.utilizationPercent,
      };
    }

    it("should format members correctly", () => {
      const members = [
        createMockMember({ memberId: "user1", name: "Alice", role: "owner" }),
        createMockMember({ memberId: "user2", name: "Bob", role: "member" }),
      ];

      const formatted = formatMembersResponse(members);

      assert.strictEqual(formatted.length, 2);
      assert.strictEqual(formatted[0].id, "user1");
      assert.strictEqual(formatted[0].name, "Alice");
      assert.strictEqual(formatted[0].role, "owner");
      assert.strictEqual(formatted[1].id, "user2");
      assert.strictEqual(formatted[1].role, "member");
    });

    it("should handle missing name with Unknown fallback", () => {
      const members = [createMockMember({ name: undefined })];
      const formatted = formatMembersResponse(members);
      assert.strictEqual(formatted[0].name, "Unknown");
    });

    it("should format invites correctly", () => {
      const invites = [
        createMockInvite({ inviteId: "inv_1", email: "a@test.com" }),
        createMockInvite({ inviteId: "inv_2", email: "b@test.com" }),
      ];

      const formatted = formatInvitesResponse(invites);

      assert.strictEqual(formatted.length, 2);
      assert.strictEqual(formatted[0].id, "inv_1");
      assert.strictEqual(formatted[0].status, "pending");
      assert.strictEqual(formatted[1].email, "b@test.com");
    });

    it("should format usage correctly", () => {
      const usage = {
        seatLimit: 10,
        seatsUsed: 3,
        seatsAvailable: 7,
        utilizationPercent: 30,
      };

      const formatted = formatUsageResponse(usage);

      assert.strictEqual(formatted.totalSeats, 10);
      assert.strictEqual(formatted.usedSeats, 3);
      assert.strictEqual(formatted.availableSeats, 7);
      assert.strictEqual(formatted.utilizationPercent, 30);
    });
  });

  // POST endpoint logic tests
  describe("POST /api/portal/team - Invite", () => {
    function validateInviteInput(email, role) {
      const errors = [];

      if (!email) {
        errors.push("Email is required");
      }

      if (role && !["admin", "member"].includes(role)) {
        errors.push("Invalid role. Must be admin or member");
      }

      return { valid: errors.length === 0, errors };
    }

    function checkSeatAvailability(usage, pendingInvites) {
      const effectiveUsed = usage.seatsUsed + pendingInvites.length;
      const available = usage.seatLimit - effectiveUsed;
      return {
        hasSeats: available > 0,
        effectiveUsed,
        seatLimit: usage.seatLimit,
        available,
      };
    }

    function checkDuplicateInvite(invites, email) {
      return invites.some((i) => i.email.toLowerCase() === email.toLowerCase());
    }

    it("should require email for invite", () => {
      const result = validateInviteInput(undefined, "member");
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.includes("Email is required"));
    });

    it("should validate role values", () => {
      const validMember = validateInviteInput("test@test.com", "member");
      const validAdmin = validateInviteInput("test@test.com", "admin");
      const invalidRole = validateInviteInput("test@test.com", "superadmin");

      assert.strictEqual(validMember.valid, true);
      assert.strictEqual(validAdmin.valid, true);
      assert.strictEqual(invalidRole.valid, false);
      assert.ok(invalidRole.errors.some((e) => e.includes("Invalid role")));
    });

    it("should default role to member when not specified", () => {
      const result = validateInviteInput("test@test.com", undefined);
      // undefined role is valid, defaults handled elsewhere
      assert.strictEqual(result.valid, true);
    });

    it("should check seat availability including pending invites", () => {
      const usage = { seatsUsed: 3, seatLimit: 5 };
      const pendingInvites = [createMockInvite(), createMockInvite()];

      const result = checkSeatAvailability(usage, pendingInvites);

      assert.strictEqual(result.effectiveUsed, 5); // 3 + 2
      assert.strictEqual(result.hasSeats, false); // 5 >= 5
    });

    it("should allow invite when seats available", () => {
      const usage = { seatsUsed: 2, seatLimit: 5 };
      const pendingInvites = [createMockInvite()];

      const result = checkSeatAvailability(usage, pendingInvites);

      assert.strictEqual(result.effectiveUsed, 3); // 2 + 1
      assert.strictEqual(result.hasSeats, true); // 3 < 5
      assert.strictEqual(result.available, 2);
    });

    it("should detect duplicate invites (case insensitive)", () => {
      const invites = [createMockInvite({ email: "Test@Example.com" })];

      assert.strictEqual(
        checkDuplicateInvite(invites, "test@example.com"),
        true,
      );
      assert.strictEqual(
        checkDuplicateInvite(invites, "TEST@EXAMPLE.COM"),
        true,
      );
      assert.strictEqual(
        checkDuplicateInvite(invites, "other@example.com"),
        false,
      );
    });
  });

  // POST endpoint logic tests - License Holder Guard
  describe("POST /api/portal/team - License Holder Guard", () => {
    /**
     * Extracted from route.js invite case.
     * Checks if the invitee already has a Mouse account with an active license.
     * If so, the invite must be rejected to prevent inconsistent license state.
     */
    function checkExistingLicense(customer) {
      if (!customer) return { hasLicense: false };
      if (customer.keygenLicenseId || customer.subscriptionStatus === "active") {
        return {
          hasLicense: true,
          error: "This individual already has a Mouse account. Please contact support for account merging.",
        };
      }
      return { hasLicense: false };
    }

    it("allows invite when no customer record exists", () => {
      const result = checkExistingLicense(null);
      assert.strictEqual(result.hasLicense, false);
    });

    it("allows invite when customer has no license", () => {
      const result = checkExistingLicense({ email: "user@example.com" });
      assert.strictEqual(result.hasLicense, false);
    });

    it("allows invite when customer has no active subscription", () => {
      const result = checkExistingLicense({
        email: "user@example.com",
        subscriptionStatus: "cancelled",
      });
      assert.strictEqual(result.hasLicense, false);
    });

    it("rejects invite when customer has a Keygen license ID", () => {
      const result = checkExistingLicense({
        email: "user@example.com",
        keygenLicenseId: "lic_abc123",
      });
      assert.strictEqual(result.hasLicense, true);
      assert.match(result.error, /already has a Mouse account/i);
    });

    it("rejects invite when customer has active subscription", () => {
      const result = checkExistingLicense({
        email: "user@example.com",
        subscriptionStatus: "active",
      });
      assert.strictEqual(result.hasLicense, true);
      assert.match(result.error, /already has a Mouse account/i);
    });

    it("rejects invite when customer has both license and active subscription", () => {
      const result = checkExistingLicense({
        email: "user@example.com",
        keygenLicenseId: "lic_abc123",
        subscriptionStatus: "active",
      });
      assert.strictEqual(result.hasLicense, true);
    });

    it("includes support contact guidance in error message", () => {
      const result = checkExistingLicense({
        keygenLicenseId: "lic_abc123",
      });
      assert.match(result.error, /contact support/i);
    });

    it("allows invite when subscription is past_due (not active)", () => {
      const result = checkExistingLicense({
        email: "user@example.com",
        subscriptionStatus: "past_due",
      });
      assert.strictEqual(result.hasLicense, false);
    });

    it("allows invite when subscription is trialing (not active)", () => {
      const result = checkExistingLicense({
        email: "user@example.com",
        subscriptionStatus: "trialing",
      });
      assert.strictEqual(result.hasLicense, false);
    });
  });



  // POST endpoint logic tests - Update Status
  describe("POST /api/portal/team - Update Status", () => {
    function validateStatusUpdate(memberId, status) {
      if (!memberId || !status) {
        return { valid: false, error: "memberId and status are required" };
      }

      if (!["active", "suspended", "revoked"].includes(status)) {
        return {
          valid: false,
          error: "Invalid status. Must be active, suspended, or revoked",
        };
      }

      return { valid: true };
    }

    function canModifyMember(targetMember) {
      if (!targetMember) {
        return { allowed: false, error: "Member not found", status: 404 };
      }
      if (targetMember.role === "owner") {
        return {
          allowed: false,
          error: "Cannot modify owner status",
          status: 403,
        };
      }
      return { allowed: true };
    }

    it("should require memberId and status", () => {
      assert.strictEqual(
        validateStatusUpdate(undefined, "active").valid,
        false,
      );
      assert.strictEqual(validateStatusUpdate("user1", undefined).valid, false);
      assert.strictEqual(validateStatusUpdate("user1", "active").valid, true);
    });

    it("should validate status values", () => {
      assert.strictEqual(validateStatusUpdate("u1", "active").valid, true);
      assert.strictEqual(validateStatusUpdate("u1", "suspended").valid, true);
      assert.strictEqual(validateStatusUpdate("u1", "revoked").valid, true);
      assert.strictEqual(validateStatusUpdate("u1", "deleted").valid, false);
    });

    it("should protect owner from status changes", () => {
      const owner = createMockMember({ role: "owner" });
      const member = createMockMember({ role: "member" });

      assert.strictEqual(canModifyMember(owner).allowed, false);
      assert.strictEqual(canModifyMember(owner).status, 403);
      assert.strictEqual(canModifyMember(member).allowed, true);
    });

    it("should handle non-existent member", () => {
      const result = canModifyMember(null);
      assert.strictEqual(result.allowed, false);
      assert.strictEqual(result.status, 404);
    });
  });

  // DELETE endpoint logic tests
  describe("DELETE /api/portal/team", () => {
    function validateDeleteRequest(type, id) {
      if (type === "member") {
        if (!id) {
          return { valid: false, error: "memberId is required" };
        }
        return { valid: true, resourceType: "member" };
      }

      if (type === "invite") {
        if (!id) {
          return { valid: false, error: "inviteId is required" };
        }
        return { valid: true, resourceType: "invite" };
      }

      return { valid: false, error: "Invalid type. Use member or invite" };
    }

    function canRemoveMember(targetMember, currentUserId) {
      if (!targetMember) {
        return { allowed: false, error: "Member not found", status: 404 };
      }
      if (targetMember.role === "owner") {
        return {
          allowed: false,
          error: "Cannot remove organization owner",
          status: 403,
        };
      }
      if (targetMember.memberId === currentUserId) {
        return {
          allowed: false,
          error: "Cannot remove yourself. Contact another admin.",
          status: 400,
        };
      }
      return { allowed: true };
    }

    it("should validate delete type", () => {
      assert.strictEqual(validateDeleteRequest("member", "u1").valid, true);
      assert.strictEqual(validateDeleteRequest("invite", "i1").valid, true);
      assert.strictEqual(validateDeleteRequest("user", "x1").valid, false);
    });

    it("should require id for each type", () => {
      assert.strictEqual(
        validateDeleteRequest("member", undefined).valid,
        false,
      );
      assert.strictEqual(
        validateDeleteRequest("invite", undefined).valid,
        false,
      );
    });

    it("should prevent owner removal", () => {
      const owner = createMockMember({ role: "owner" });
      const result = canRemoveMember(owner, "other_user");
      assert.strictEqual(result.allowed, false);
      assert.match(result.error, /Cannot remove organization owner/);
    });

    it("should prevent self-removal", () => {
      const admin = createMockMember({ memberId: "admin1", role: "admin" });
      const result = canRemoveMember(admin, "admin1");
      assert.strictEqual(result.allowed, false);
      assert.match(result.error, /Cannot remove yourself/);
    });

    it("should allow removing other members", () => {
      const member = createMockMember({ memberId: "member1", role: "member" });
      const result = canRemoveMember(member, "admin1");
      assert.strictEqual(result.allowed, true);
    });
  });
});

describe("DynamoDB Invite Operations Logic", () => {
  describe("Invite Token Generation", () => {
    function generateInviteToken() {
      const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      let token = "";
      for (let i = 0; i < 32; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return token;
    }

    it("should generate 32 character token", () => {
      const token = generateInviteToken();
      assert.strictEqual(token.length, 32);
    });

    it("should only contain alphanumeric characters", () => {
      const token = generateInviteToken();
      assert.match(token, /^[A-Za-z0-9]+$/);
    });

    it("should generate unique tokens", () => {
      const tokens = new Set();
      for (let i = 0; i < 100; i++) {
        tokens.add(generateInviteToken());
      }
      assert.strictEqual(tokens.size, 100);
    });
  });

  describe("Invite Expiration", () => {
    function createInviteExpiration(daysFromNow = 7) {
      return new Date(
        Date.now() + daysFromNow * 24 * 60 * 60 * 1000,
      ).toISOString();
    }

    function isInviteExpired(expiresAt) {
      return new Date(expiresAt) < new Date();
    }

    it("should set expiration 7 days in future by default", () => {
      const expiresAt = createInviteExpiration();
      const expires = new Date(expiresAt);
      const now = new Date();
      const daysDiff = (expires - now) / (1000 * 60 * 60 * 24);

      assert.ok(daysDiff >= 6.9 && daysDiff <= 7.1);
    });

    it("should correctly identify expired invites", () => {
      const pastDate = new Date(Date.now() - 1000).toISOString();
      const futureDate = new Date(Date.now() + 86400000).toISOString();

      assert.strictEqual(isInviteExpired(pastDate), true);
      assert.strictEqual(isInviteExpired(futureDate), false);
    });
  });

  describe("Invite Status Validation", () => {
    function canAcceptInvite(invite) {
      if (!invite) {
        return { valid: false, error: "Invite not found" };
      }
      if (invite.status !== "pending") {
        return { valid: false, error: "Invite is no longer valid" };
      }
      if (new Date(invite.expiresAt) < new Date()) {
        return { valid: false, error: "Invite has expired" };
      }
      return { valid: true };
    }

    it("should reject null invite", () => {
      const result = canAcceptInvite(null);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, "Invite not found");
    });

    it("should reject non-pending invite", () => {
      const invite = createMockInvite({ status: "accepted" });
      const result = canAcceptInvite(invite);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, "Invite is no longer valid");
    });

    it("should reject expired invite", () => {
      const invite = createMockInvite({
        status: "pending",
        expiresAt: new Date(Date.now() - 86400000).toISOString(),
      });
      const result = canAcceptInvite(invite);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, "Invite has expired");
    });

    it("should accept valid pending invite", () => {
      const invite = createMockInvite({
        status: "pending",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });
      const result = canAcceptInvite(invite);
      assert.strictEqual(result.valid, true);
    });
  });
});

describe("Team Page Integration Logic", () => {
  describe("Account Type Validation", () => {
    function shouldShowTeamPage(accountType) {
      // Per v4 pricing: team and enterprise (legacy) have team features
      return accountType === "team" || accountType === "enterprise";
    }

    it("should show team page for team accounts", () => {
      assert.strictEqual(shouldShowTeamPage("team"), true);
    });

    it("should show team page for enterprise accounts (legacy)", () => {
      assert.strictEqual(shouldShowTeamPage("enterprise"), true);
    });

    it("should not show team page for individual accounts", () => {
      assert.strictEqual(shouldShowTeamPage("individual"), false);
    });

    it("should not show team page for undefined accounts", () => {
      assert.strictEqual(shouldShowTeamPage(undefined), false);
    });
  });

  describe("Seat Calculation", () => {
    function calculateSeatUsage(members, invites, seatLimit) {
      const activeMembers = members.filter((m) => m.status === "active").length;
      const pendingInvites = invites.filter(
        (i) => i.status === "pending",
      ).length;
      const usedSeats = activeMembers;
      const pendingSeats = pendingInvites;
      const totalCommitted = usedSeats + pendingSeats;
      const availableSeats = Math.max(0, seatLimit - totalCommitted);

      return {
        usedSeats,
        pendingSeats,
        totalCommitted,
        availableSeats,
        seatLimit,
        utilizationPercent: Math.round((usedSeats / seatLimit) * 100),
      };
    }

    it("should calculate used seats from active members", () => {
      const members = [
        createMockMember({ status: "active" }),
        createMockMember({ status: "active" }),
        createMockMember({ status: "suspended" }),
      ];
      const invites = [];

      const result = calculateSeatUsage(members, invites, 5);
      assert.strictEqual(result.usedSeats, 2);
    });

    it("should count pending invites separately", () => {
      const members = [createMockMember({ status: "active" })];
      const invites = [
        createMockInvite({ status: "pending" }),
        createMockInvite({ status: "pending" }),
      ];

      const result = calculateSeatUsage(members, invites, 5);
      assert.strictEqual(result.usedSeats, 1);
      assert.strictEqual(result.pendingSeats, 2);
      assert.strictEqual(result.totalCommitted, 3);
    });

    it("should calculate available seats correctly", () => {
      const members = [
        createMockMember({ status: "active" }),
        createMockMember({ status: "active" }),
      ];
      const invites = [createMockInvite({ status: "pending" })];

      const result = calculateSeatUsage(members, invites, 5);
      assert.strictEqual(result.availableSeats, 2); // 5 - 3
    });

    it("should not go negative on available seats", () => {
      const members = Array(6)
        .fill(null)
        .map(() => createMockMember({ status: "active" }));
      const invites = [];

      const result = calculateSeatUsage(members, invites, 5);
      assert.strictEqual(result.availableSeats, 0);
    });
  });

describe("POST /api/portal/team - Update Role (Phase 4)", () => {
  function validateRoleUpdate(memberId, role) {
    if (!memberId || !role) {
      return { valid: false, error: "memberId and role are required" };
    }

    if (!["admin", "member"].includes(role)) {
      return { valid: false, error: "Invalid role. Must be admin or member" };
    }

    return { valid: true };
  }

  function canChangeRole(targetMember, currentUserId) {
    if (!targetMember) {
      return { allowed: false, error: "Member not found", status: 404 };
    }
    if (targetMember.role === "owner") {
      return { allowed: false, error: "Cannot modify owner role", status: 403 };
    }
    if (targetMember.memberId === currentUserId) {
      return {
        allowed: false,
        error: "Cannot change your own role. Contact another admin.",
        status: 400,
      };
    }
    return { allowed: true };
  }

  function checkLastAdminProtection(members, targetMember, newRole) {
    // Only applies when demoting admin to member
    if (targetMember.role !== "admin" || newRole !== "member") {
      return { allowed: true };
    }

    // Count admins and owners (both have admin privileges)
    const adminCount = members.filter(
      (m) => m.role === "admin" || m.role === "owner",
    ).length;

    if (adminCount <= 1) {
      return {
        allowed: false,
        error: "Cannot demote the last admin. Promote another member first.",
      };
    }

    return { allowed: true };
  }

  describe("Input Validation", () => {
    it("should require memberId", () => {
      const result = validateRoleUpdate(undefined, "admin");
      assert.strictEqual(result.valid, false);
      assert.match(result.error, /memberId and role are required/);
    });

    it("should require role", () => {
      const result = validateRoleUpdate("user123", undefined);
      assert.strictEqual(result.valid, false);
      assert.match(result.error, /memberId and role are required/);
    });

    it("should accept admin role", () => {
      const result = validateRoleUpdate("user123", "admin");
      assert.strictEqual(result.valid, true);
    });

    it("should accept member role", () => {
      const result = validateRoleUpdate("user123", "member");
      assert.strictEqual(result.valid, true);
    });

    it("should reject owner role (cannot be assigned)", () => {
      const result = validateRoleUpdate("user123", "owner");
      assert.strictEqual(result.valid, false);
      assert.match(result.error, /Invalid role/);
    });

    it("should reject invalid role values", () => {
      const result = validateRoleUpdate("user123", "superadmin");
      assert.strictEqual(result.valid, false);
      assert.match(result.error, /Invalid role/);
    });
  });

  describe("Owner Protection", () => {
    it("should not allow changing owner role", () => {
      const owner = createMockMember({ role: "owner" });
      const result = canChangeRole(owner, "other-user");
      assert.strictEqual(result.allowed, false);
      assert.strictEqual(result.status, 403);
      assert.match(result.error, /Cannot modify owner/);
    });

    it("should allow changing admin role", () => {
      const admin = createMockMember({ memberId: "admin1", role: "admin" });
      const result = canChangeRole(admin, "other-user");
      assert.strictEqual(result.allowed, true);
    });

    it("should allow changing member role", () => {
      const member = createMockMember({ memberId: "member1", role: "member" });
      const result = canChangeRole(member, "other-user");
      assert.strictEqual(result.allowed, true);
    });
  });

  describe("Self-Change Prevention", () => {
    it("should not allow users to change their own role", () => {
      const admin = createMockMember({ memberId: "auth0|self123", role: "admin" });
      const result = canChangeRole(admin, "auth0|self123");
      assert.strictEqual(result.allowed, false);
      assert.strictEqual(result.status, 400);
      assert.match(result.error, /Cannot change your own role/);
    });

    it("should allow changing other users roles", () => {
      const admin = createMockMember({ memberId: "auth0|other123", role: "admin" });
      const result = canChangeRole(admin, "auth0|self123");
      assert.strictEqual(result.allowed, true);
    });
  });

  describe("Last Admin Protection", () => {
    it("should prevent demoting the only admin to member", () => {
      const members = [
        createMockMember({ memberId: "admin1", role: "admin" }),
        createMockMember({ memberId: "member1", role: "member" }),
        createMockMember({ memberId: "member2", role: "member" }),
      ];
      const targetAdmin = members[0];

      const result = checkLastAdminProtection(members, targetAdmin, "member");
      assert.strictEqual(result.allowed, false);
      assert.match(result.error, /Cannot demote the last admin/);
    });

    it("should allow demoting admin when owner exists", () => {
      const members = [
        createMockMember({ memberId: "owner1", role: "owner" }),
        createMockMember({ memberId: "admin1", role: "admin" }),
        createMockMember({ memberId: "member1", role: "member" }),
      ];
      const targetAdmin = members[1];

      const result = checkLastAdminProtection(members, targetAdmin, "member");
      assert.strictEqual(result.allowed, true);
    });

    it("should allow demoting admin when multiple admins exist", () => {
      const members = [
        createMockMember({ memberId: "admin1", role: "admin" }),
        createMockMember({ memberId: "admin2", role: "admin" }),
        createMockMember({ memberId: "member1", role: "member" }),
      ];
      const targetAdmin = members[0];

      const result = checkLastAdminProtection(members, targetAdmin, "member");
      assert.strictEqual(result.allowed, true);
    });

    it("should not apply protection when promoting member to admin", () => {
      const members = [
        createMockMember({ memberId: "admin1", role: "admin" }),
        createMockMember({ memberId: "member1", role: "member" }),
      ];
      const targetMember = members[1];

      const result = checkLastAdminProtection(members, targetMember, "admin");
      assert.strictEqual(result.allowed, true);
    });

    it("should count owner as admin for protection check", () => {
      // Owner + admin = 2 admins, so demoting admin is allowed
      const members = [
        createMockMember({ memberId: "owner1", role: "owner" }),
        createMockMember({ memberId: "admin1", role: "admin" }),
      ];
      const targetAdmin = members[1];

      const result = checkLastAdminProtection(members, targetAdmin, "member");
      assert.strictEqual(result.allowed, true);
    });
  });
});

describe("POST /api/portal/team - Resend Invite (Phase 5)", () => {
  function validateResendInvite(inviteId) {
    if (!inviteId) {
      return { valid: false, error: "inviteId is required" };
    }
    return { valid: true };
  }

  function canResendInvite(invite, invites) {
    if (!invite) {
      return { allowed: false, error: "Invite not found", status: 404 };
    }
    // Check invite exists in org's invites
    const found = invites.find((i) => i.inviteId === invite.inviteId);
    if (!found) {
      return { allowed: false, error: "Invite not found", status: 404 };
    }
    return { allowed: true };
  }

  function calculateNewExpiration() {
    // Fresh 7 days from now
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }

  describe("Input Validation", () => {
    it("should require inviteId", () => {
      const result = validateResendInvite(undefined);
      assert.strictEqual(result.valid, false);
      assert.match(result.error, /inviteId is required/);
    });

    it("should accept valid inviteId", () => {
      const result = validateResendInvite("inv_12345_abc123");
      assert.strictEqual(result.valid, true);
    });
  });

  describe("Invite Lookup", () => {
    it("should return error when invite not found", () => {
      const invites = [createMockInvite({ inviteId: "inv_1" })];
      const result = canResendInvite({ inviteId: "inv_nonexistent" }, invites);
      assert.strictEqual(result.allowed, false);
      assert.strictEqual(result.status, 404);
    });

    it("should allow resend for existing invite", () => {
      const invites = [
        createMockInvite({ inviteId: "inv_1" }),
        createMockInvite({ inviteId: "inv_2" }),
      ];
      const result = canResendInvite(invites[1], invites);
      assert.strictEqual(result.allowed, true);
    });
  });

  describe("Expiration Refresh", () => {
    it("should calculate new expiration 7 days from now", () => {
      const now = Date.now();
      const newExpiration = calculateNewExpiration();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

      // Should be approximately 7 days from now (within 1 second tolerance)
      const diff = Math.abs(newExpiration.getTime() - (now + sevenDaysMs));
      assert.ok(diff < 1000, "Expiration should be 7 days from now");
    });

    it("should extend expired invite with fresh 7 days", () => {
      const expiredInvite = createMockInvite({
        expiresAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
      });

      const newExpiration = calculateNewExpiration();

      // New expiration should be in the future
      assert.ok(newExpiration > new Date(), "New expiration should be in the future");
      assert.ok(
        newExpiration > new Date(expiredInvite.expiresAt),
        "New expiration should be after old expiration",
      );
    });
  });
});

describe("Role-Based Access Control (RBAC) Logic", () => {
  describe("Role Hierarchy", () => {
    function hasAdminPrivileges(role) {
      return role === "owner" || role === "admin";
    }

    function canManageTeam(role) {
      return hasAdminPrivileges(role);
    }

    function canViewBilling(role) {
      return hasAdminPrivileges(role);
    }

    function canInviteMembers(role) {
      return hasAdminPrivileges(role);
    }

    it("owner should have admin privileges", () => {
      assert.strictEqual(hasAdminPrivileges("owner"), true);
    });

    it("admin should have admin privileges", () => {
      assert.strictEqual(hasAdminPrivileges("admin"), true);
    });

    it("member should not have admin privileges", () => {
      assert.strictEqual(hasAdminPrivileges("member"), false);
    });

    it("owner can manage team", () => {
      assert.strictEqual(canManageTeam("owner"), true);
    });

    it("admin can manage team", () => {
      assert.strictEqual(canManageTeam("admin"), true);
    });

    it("member cannot manage team", () => {
      assert.strictEqual(canManageTeam("member"), false);
    });

    it("owner can view billing", () => {
      assert.strictEqual(canViewBilling("owner"), true);
    });

    it("admin can view billing", () => {
      assert.strictEqual(canViewBilling("admin"), true);
    });

    it("member cannot view billing", () => {
      assert.strictEqual(canViewBilling("member"), false);
    });

    it("owner can invite members", () => {
      assert.strictEqual(canInviteMembers("owner"), true);
    });

    it("admin can invite members", () => {
      assert.strictEqual(canInviteMembers("admin"), true);
    });

    it("member cannot invite members", () => {
      assert.strictEqual(canInviteMembers("member"), false);
    });
  });

  describe("Navigation Filtering", () => {
    const ADMIN_ONLY_PATHS = ["/portal/billing", "/portal/team"];

    function filterNavForRole(navItems, accountType, orgRole) {
      // Only filter for enterprise accounts
      if (accountType !== "enterprise") {
        return navItems;
      }

      // Members don't see admin-only items
      if (orgRole === "member") {
        return navItems.filter((item) => !ADMIN_ONLY_PATHS.includes(item.href));
      }

      return navItems;
    }

    const enterpriseNav = [
      { label: "Dashboard", href: "/portal" },
      { label: "License", href: "/portal/license" },
      { label: "Billing", href: "/portal/billing" },
      { label: "Team", href: "/portal/team" },
      { label: "Settings", href: "/portal/settings" },
    ];

    it("should show all nav items for owner", () => {
      const filtered = filterNavForRole(enterpriseNav, "enterprise", "owner");
      assert.strictEqual(filtered.length, 5);
      assert.ok(filtered.some((i) => i.href === "/portal/billing"));
      assert.ok(filtered.some((i) => i.href === "/portal/team"));
    });

    it("should show all nav items for admin", () => {
      const filtered = filterNavForRole(enterpriseNav, "enterprise", "admin");
      assert.strictEqual(filtered.length, 5);
      assert.ok(filtered.some((i) => i.href === "/portal/billing"));
      assert.ok(filtered.some((i) => i.href === "/portal/team"));
    });

    it("should hide billing and team for member", () => {
      const filtered = filterNavForRole(enterpriseNav, "enterprise", "member");
      assert.strictEqual(filtered.length, 3);
      assert.ok(!filtered.some((i) => i.href === "/portal/billing"));
      assert.ok(!filtered.some((i) => i.href === "/portal/team"));
    });

    it("should show dashboard, license, settings for member", () => {
      const filtered = filterNavForRole(enterpriseNav, "enterprise", "member");
      assert.ok(filtered.some((i) => i.href === "/portal"));
      assert.ok(filtered.some((i) => i.href === "/portal/license"));
      assert.ok(filtered.some((i) => i.href === "/portal/settings"));
    });

    it("should not filter for individual accounts", () => {
      const individualNav = [
        { label: "Dashboard", href: "/portal" },
        { label: "Billing", href: "/portal/billing" },
      ];
      const filtered = filterNavForRole(individualNav, "individual", "member");
      assert.strictEqual(filtered.length, 2);
    });

    it("should not filter for team accounts (non-enterprise)", () => {
      const teamNav = [
        { label: "Dashboard", href: "/portal" },
        { label: "Team", href: "/portal/team" },
      ];
      const filtered = filterNavForRole(teamNav, "team", "member");
      assert.strictEqual(filtered.length, 2);
    });
  });
});

// ===========================================
// ORGANIZATION FALLBACK LOOKUP (Phase 1)
// Tests for team API org_id fallback to stripeCustomerId
// ===========================================

describe("Organization Lookup Fallback", () => {
  /**
   * Simulates the org lookup strategy:
   * 1. First try to get org_id from session token (fast path)
   * 2. If missing, fallback to lookup by stripeCustomerId
   */
  function resolveOrgId(session) {
    // Fast path: org_id in token
    const namespace = "https://hic-ai.com/";
    const orgIdFromToken = session?.user?.[`${namespace}org_id`];
    if (orgIdFromToken) {
      return {
        orgId: orgIdFromToken,
        source: "token",
      };
    }

    // Fallback: use stripeCustomerId (available in session from customer lookup)
    const stripeCustomerId = session?.user?.[`${namespace}stripeCustomerId`];
    if (stripeCustomerId) {
      return {
        orgId: stripeCustomerId, // orgId = stripeCustomerId by design
        source: "stripe_customer",
      };
    }

    // No org resolution possible
    return null;
  }

  /**
   * Determines if org fallback lookup is needed
   */
  function needsOrgFallback(session) {
    const namespace = "https://hic-ai.com/";
    const hasOrgId = !!session?.user?.[`${namespace}org_id`];
    const hasStripeCustomerId = !!session?.user?.[`${namespace}stripeCustomerId`];
    const isBusinessAccount =
      session?.user?.[`${namespace}account_type`] === "business";

    return isBusinessAccount && !hasOrgId && hasStripeCustomerId;
  }

  describe("resolveOrgId", () => {
    it("should use org_id from token when present", () => {
      const session = {
        user: {
          "https://hic-ai.com/org_id": "org_from_token",
          "https://hic-ai.com/stripeCustomerId": "cus_stripe123",
        },
      };

      const result = resolveOrgId(session);

      assert.strictEqual(result.orgId, "org_from_token");
      assert.strictEqual(result.source, "token");
    });

    it("should fallback to stripeCustomerId when org_id missing", () => {
      const session = {
        user: {
          // No org_id in token
          "https://hic-ai.com/stripeCustomerId": "cus_business456",
        },
      };

      const result = resolveOrgId(session);

      assert.strictEqual(result.orgId, "cus_business456");
      assert.strictEqual(result.source, "stripe_customer");
    });

    it("should return null when neither org_id nor stripeCustomerId available", () => {
      const session = {
        user: {
          email: "user@example.com",
          // No org_id, no stripeCustomerId
        },
      };

      const result = resolveOrgId(session);

      assert.strictEqual(result, null);
    });

    it("should prefer org_id over stripeCustomerId", () => {
      const session = {
        user: {
          "https://hic-ai.com/org_id": "org_explicit",
          "https://hic-ai.com/stripeCustomerId": "cus_different",
        },
      };

      const result = resolveOrgId(session);

      assert.strictEqual(result.orgId, "org_explicit");
      assert.strictEqual(result.source, "token");
    });

    it("should handle null session", () => {
      const result = resolveOrgId(null);
      assert.strictEqual(result, null);
    });

    it("should handle session without user", () => {
      const result = resolveOrgId({ user: null });
      assert.strictEqual(result, null);
    });
  });

  describe("needsOrgFallback", () => {
    it("should return true for business account without org_id but with stripeCustomerId", () => {
      const session = {
        user: {
          "https://hic-ai.com/account_type": "business",
          "https://hic-ai.com/stripeCustomerId": "cus_business789",
          // No org_id
        },
      };

      const result = needsOrgFallback(session);

      assert.strictEqual(result, true);
    });

    it("should return false when org_id already present", () => {
      const session = {
        user: {
          "https://hic-ai.com/account_type": "business",
          "https://hic-ai.com/org_id": "org_exists",
          "https://hic-ai.com/stripeCustomerId": "cus_business",
        },
      };

      const result = needsOrgFallback(session);

      assert.strictEqual(result, false);
    });

    it("should return false for individual accounts", () => {
      const session = {
        user: {
          "https://hic-ai.com/account_type": "individual",
          "https://hic-ai.com/stripeCustomerId": "cus_individual",
        },
      };

      const result = needsOrgFallback(session);

      assert.strictEqual(result, false);
    });

    it("should return false when stripeCustomerId missing", () => {
      const session = {
        user: {
          "https://hic-ai.com/account_type": "business",
          // No stripeCustomerId
        },
      };

      const result = needsOrgFallback(session);

      assert.strictEqual(result, false);
    });
  });

  describe("org lookup workflow", () => {
    it("should resolve org for new Business customer who purchased before Cognito account", () => {
      // Scenario: User purchases Business plan via Stripe checkout
      // They don't have a Cognito account yet, so org_id won't be in token
      // But stripeCustomerId will be available after customer sync
      const session = {
        user: {
          email: "new.business@company.com",
          "https://hic-ai.com/account_type": "business",
          "https://hic-ai.com/stripeCustomerId": "cus_newBusiness123",
          // org_id not yet available - will be synced later
        },
      };

      const needsFallback = needsOrgFallback(session);
      assert.strictEqual(needsFallback, true, "Should need fallback");

      const resolved = resolveOrgId(session);
      assert.strictEqual(resolved.orgId, "cus_newBusiness123");
      assert.strictEqual(resolved.source, "stripe_customer");
    });

    it("should resolve org immediately for existing Business customer with org_id", () => {
      // Scenario: Existing Business customer who already has org_id in token
      const session = {
        user: {
          email: "existing.owner@company.com",
          "https://hic-ai.com/account_type": "business",
          "https://hic-ai.com/org_id": "cus_existingBusiness456",
          "https://hic-ai.com/stripeCustomerId": "cus_existingBusiness456",
        },
      };

      const needsFallback = needsOrgFallback(session);
      assert.strictEqual(needsFallback, false, "Should not need fallback");

      const resolved = resolveOrgId(session);
      assert.strictEqual(resolved.orgId, "cus_existingBusiness456");
      assert.strictEqual(resolved.source, "token");
    });
  });
});

});
