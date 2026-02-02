/**
 * Delete Account API Route Tests
 *
 * Tests the account deletion API including:
 * - POST: Request account deletion (soft-delete)
 * - DELETE: Cancel pending deletion
 * - Individual user deletion flow
 * - Business owner deletion with org dissolution
 * - Business member blocked (must leave org first)
 * - Stripe subscription cancellation at period end
 * - Confirmation validation
 */

import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert";

// Constants
const AUTH_NAMESPACE = "https://hic-ai.com";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create mock customer for different scenarios
 */
function createMockCustomer(overrides = {}) {
  return {
    userId: "user_123",
    email: "test@example.com",
    name: "Test User",
    accountType: "individual",
    accountStatus: "active",
    stripeCustomerId: "cus_test123",
    subscriptionStatus: "active",
    orgId: null,
    orgRole: null,
    ...overrides,
  };
}

/**
 * Create mock org member
 */
function createMockOrgMember(overrides = {}) {
  return {
    userId: "member_456",
    email: "member@example.com",
    name: "Team Member",
    orgId: "org_test123",
    orgRole: "member",
    accountStatus: "active",
    ...overrides,
  };
}

// ============================================================================
// Core Logic Functions (extracted from route for testing)
// ============================================================================

/**
 * Validate deletion confirmation
 */
function validateConfirmation(confirmation) {
  if (confirmation !== "DELETE MY ACCOUNT") {
    return {
      valid: false,
      error: "Please type 'DELETE MY ACCOUNT' to confirm",
      status: 400,
    };
  }
  return { valid: true };
}

/**
 * Check if user can delete account
 * - Individual users: can delete
 * - Business owners: can delete (triggers org dissolution)
 * - Business members: must leave org first
 */
function checkDeletionEligibility(customer) {
  // Business members must leave org first
  if (customer.orgId && customer.orgRole !== "owner") {
    return {
      eligible: false,
      error:
        "Please leave your organization before deleting your account. Contact your organization admin.",
      status: 400,
    };
  }

  // Individual users and org owners can proceed
  return {
    eligible: true,
    isOrgOwner: Boolean(customer.orgId && customer.orgRole === "owner"),
  };
}

/**
 * Determine subscription cancellation behavior
 * Returns the Stripe update params
 */
function getSubscriptionCancelParams() {
  // Cancel at period end - user keeps access until billing period ends
  return {
    cancel_at_period_end: true,
  };
}

/**
 * Build deletion response for API
 */
function buildDeletionResponse(isOrgOwner, accessUntil, orgMembersCount = 0) {
  const response = {
    success: true,
    message: isOrgOwner
      ? "Account deletion requested. Your organization has been dissolved."
      : "Account deletion requested",
    accessUntil,
  };

  if (isOrgOwner && orgMembersCount > 1) {
    response.orgDissolved = true;
    response.membersAffected = orgMembersCount - 1; // Exclude owner
  }

  return response;
}

/**
 * Validate pending deletion can be cancelled
 */
function validateCancellationEligibility(customer) {
  if (!customer) {
    return { eligible: false, error: "Customer not found", status: 404 };
  }

  if (customer.accountStatus !== "pending_deletion") {
    return {
      eligible: false,
      error: "No pending deletion request found",
      status: 400,
    };
  }

  return { eligible: true };
}

// ============================================================================
// Tests
// ============================================================================

describe("Delete Account API Logic", () => {
  describe("Confirmation Validation", () => {
    it("should reject missing confirmation", () => {
      const result = validateConfirmation(undefined);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.status, 400);
      assert.match(result.error, /DELETE MY ACCOUNT/);
    });

    it("should reject empty confirmation", () => {
      const result = validateConfirmation("");
      assert.strictEqual(result.valid, false);
    });

    it("should reject wrong confirmation text", () => {
      const result = validateConfirmation("delete my account"); // lowercase
      assert.strictEqual(result.valid, false);
    });

    it("should reject partial confirmation", () => {
      const result = validateConfirmation("DELETE MY");
      assert.strictEqual(result.valid, false);
    });

    it("should accept correct confirmation", () => {
      const result = validateConfirmation("DELETE MY ACCOUNT");
      assert.strictEqual(result.valid, true);
    });
  });

  describe("Deletion Eligibility", () => {
    describe("Individual Users", () => {
      it("should allow individual user to delete", () => {
        const customer = createMockCustomer({
          accountType: "individual",
          orgId: null,
          orgRole: null,
        });
        const result = checkDeletionEligibility(customer);
        assert.strictEqual(result.eligible, true);
        assert.strictEqual(result.isOrgOwner, false);
      });

      it("should allow individual user without subscription to delete", () => {
        const customer = createMockCustomer({
          accountType: "individual",
          stripeCustomerId: null,
          subscriptionStatus: null,
        });
        const result = checkDeletionEligibility(customer);
        assert.strictEqual(result.eligible, true);
      });
    });

    describe("Business Owners", () => {
      it("should allow business owner to delete", () => {
        const customer = createMockCustomer({
          accountType: "business",
          orgId: "org_test123",
          orgRole: "owner",
        });
        const result = checkDeletionEligibility(customer);
        assert.strictEqual(result.eligible, true);
        assert.strictEqual(result.isOrgOwner, true);
      });

      it("should flag org owner status for cascade handling", () => {
        const customer = createMockCustomer({
          orgId: "org_123",
          orgRole: "owner",
        });
        const result = checkDeletionEligibility(customer);
        assert.strictEqual(result.isOrgOwner, true);
      });
    });

    describe("Business Members", () => {
      it("should block business member from deleting", () => {
        const customer = createMockCustomer({
          accountType: "business",
          orgId: "org_test123",
          orgRole: "member",
        });
        const result = checkDeletionEligibility(customer);
        assert.strictEqual(result.eligible, false);
        assert.strictEqual(result.status, 400);
        assert.match(result.error, /leave your organization/);
      });

      it("should block admin (non-owner) from deleting without leaving", () => {
        const customer = createMockCustomer({
          accountType: "business",
          orgId: "org_test123",
          orgRole: "admin",
        });
        const result = checkDeletionEligibility(customer);
        assert.strictEqual(result.eligible, false);
        assert.match(result.error, /leave your organization/);
      });
    });
  });

  describe("Subscription Cancellation", () => {
    it("should cancel at period end (not immediately)", () => {
      const params = getSubscriptionCancelParams();
      assert.strictEqual(params.cancel_at_period_end, true);
    });

    it("should not set immediate cancellation", () => {
      const params = getSubscriptionCancelParams();
      assert.strictEqual(params.prorate, undefined);
      assert.strictEqual(params.invoice_now, undefined);
    });
  });

  describe("Deletion Response Building", () => {
    it("should build response for individual user", () => {
      const accessUntil = "2026-03-01T00:00:00Z";
      const response = buildDeletionResponse(false, accessUntil);

      assert.strictEqual(response.success, true);
      assert.strictEqual(response.message, "Account deletion requested");
      assert.strictEqual(response.accessUntil, accessUntil);
      assert.strictEqual(response.orgDissolved, undefined);
    });

    it("should build response for org owner with dissolution", () => {
      const accessUntil = "2026-03-01T00:00:00Z";
      const response = buildDeletionResponse(true, accessUntil, 5);

      assert.strictEqual(response.success, true);
      assert.match(response.message, /organization has been dissolved/);
      assert.strictEqual(response.accessUntil, accessUntil);
      assert.strictEqual(response.orgDissolved, true);
      assert.strictEqual(response.membersAffected, 4); // 5 - 1 (owner)
    });

    it("should not include dissolution info for solo org owner", () => {
      const accessUntil = "2026-03-01T00:00:00Z";
      const response = buildDeletionResponse(true, accessUntil, 1);

      assert.strictEqual(response.success, true);
      assert.match(response.message, /organization has been dissolved/);
      // Only 1 member (owner) so no members affected
      assert.strictEqual(response.orgDissolved, undefined);
    });

    it("should handle null accessUntil for users without subscription", () => {
      const response = buildDeletionResponse(false, null, 0);
      assert.strictEqual(response.success, true);
      assert.strictEqual(response.accessUntil, null);
    });
  });

  describe("Cancellation Eligibility", () => {
    it("should reject if customer not found", () => {
      const result = validateCancellationEligibility(null);
      assert.strictEqual(result.eligible, false);
      assert.strictEqual(result.status, 404);
      assert.strictEqual(result.error, "Customer not found");
    });

    it("should reject if not pending deletion", () => {
      const customer = createMockCustomer({ accountStatus: "active" });
      const result = validateCancellationEligibility(customer);
      assert.strictEqual(result.eligible, false);
      assert.strictEqual(result.status, 400);
      assert.match(result.error, /No pending deletion/);
    });

    it("should reject if account already deleted", () => {
      const customer = createMockCustomer({ accountStatus: "deleted" });
      const result = validateCancellationEligibility(customer);
      assert.strictEqual(result.eligible, false);
    });

    it("should allow cancellation for pending_deletion status", () => {
      const customer = createMockCustomer({
        accountStatus: "pending_deletion",
      });
      const result = validateCancellationEligibility(customer);
      assert.strictEqual(result.eligible, true);
    });
  });
});

describe("Organization Dissolution Logic", () => {
  /**
   * Get members to remove when dissolving org
   * Returns all members except the owner
   */
  function getMembersToRemove(members, ownerId) {
    return members.filter((m) => m.userId !== ownerId);
  }

  /**
   * Build update params for removed member
   * Clears org association but keeps account active
   */
  function buildMemberRemovalParams(member) {
    return {
      userId: member.userId,
      email: member.email,
      name: member.name,
      orgId: null,
      orgRole: null,
      accountStatus: "active", // They can subscribe individually
    };
  }

  describe("Member Identification", () => {
    it("should identify non-owner members for removal", () => {
      const members = [
        createMockOrgMember({ userId: "owner_123", orgRole: "owner" }),
        createMockOrgMember({ userId: "member_456", orgRole: "member" }),
        createMockOrgMember({ userId: "admin_789", orgRole: "admin" }),
      ];

      const toRemove = getMembersToRemove(members, "owner_123");
      assert.strictEqual(toRemove.length, 2);
      assert.ok(toRemove.every((m) => m.userId !== "owner_123"));
    });

    it("should return empty array for solo owner", () => {
      const members = [
        createMockOrgMember({ userId: "owner_123", orgRole: "owner" }),
      ];

      const toRemove = getMembersToRemove(members, "owner_123");
      assert.strictEqual(toRemove.length, 0);
    });

    it("should handle empty members array", () => {
      const toRemove = getMembersToRemove([], "owner_123");
      assert.strictEqual(toRemove.length, 0);
    });
  });

  describe("Member Removal Params", () => {
    it("should clear org association for removed member", () => {
      const member = createMockOrgMember({
        userId: "member_456",
        orgId: "org_test123",
        orgRole: "member",
      });

      const params = buildMemberRemovalParams(member);
      assert.strictEqual(params.orgId, null);
      assert.strictEqual(params.orgRole, null);
    });

    it("should keep member account active", () => {
      const member = createMockOrgMember();
      const params = buildMemberRemovalParams(member);
      assert.strictEqual(params.accountStatus, "active");
    });

    it("should preserve member identity fields", () => {
      const member = createMockOrgMember({
        userId: "member_456",
        email: "member@example.com",
        name: "Test Member",
      });

      const params = buildMemberRemovalParams(member);
      assert.strictEqual(params.userId, "member_456");
      assert.strictEqual(params.email, "member@example.com");
      assert.strictEqual(params.name, "Test Member");
    });
  });
});

describe("Account Status Transitions", () => {
  /**
   * Valid account status values
   */
  const ACCOUNT_STATUSES = ["active", "pending_deletion", "deleted"];

  /**
   * Validate status transition
   */
  function isValidTransition(from, to) {
    const validTransitions = {
      active: ["pending_deletion"],
      pending_deletion: ["active", "deleted"],
      deleted: ["active"], // Can reinstate by subscribing again
    };

    return validTransitions[from]?.includes(to) ?? false;
  }

  describe("Status Validation", () => {
    it("should allow active → pending_deletion", () => {
      assert.strictEqual(isValidTransition("active", "pending_deletion"), true);
    });

    it("should allow pending_deletion → active (cancel deletion)", () => {
      assert.strictEqual(isValidTransition("pending_deletion", "active"), true);
    });

    it("should allow pending_deletion → deleted (subscription ends)", () => {
      assert.strictEqual(
        isValidTransition("pending_deletion", "deleted"),
        true,
      );
    });

    it("should allow deleted → active (reinstatement)", () => {
      assert.strictEqual(isValidTransition("deleted", "active"), true);
    });

    it("should reject active → deleted (must go through pending)", () => {
      assert.strictEqual(isValidTransition("active", "deleted"), false);
    });

    it("should reject deleted → pending_deletion", () => {
      assert.strictEqual(
        isValidTransition("deleted", "pending_deletion"),
        false,
      );
    });
  });
});

describe("Edge Cases", () => {
  describe("Missing Data Handling", () => {
    it("should handle customer with no Stripe ID", () => {
      const customer = createMockCustomer({
        stripeCustomerId: null,
      });
      // Should still allow deletion
      const result = checkDeletionEligibility(customer);
      assert.strictEqual(result.eligible, true);
    });

    it("should handle customer with empty orgId", () => {
      const customer = createMockCustomer({
        orgId: "",
        orgRole: null,
      });
      const result = checkDeletionEligibility(customer);
      assert.strictEqual(result.eligible, true);
      assert.strictEqual(result.isOrgOwner, false);
    });
  });

  describe("Whitespace and Formatting", () => {
    it("should reject confirmation with extra whitespace", () => {
      const result = validateConfirmation(" DELETE MY ACCOUNT ");
      assert.strictEqual(result.valid, false);
    });

    it("should reject confirmation with tabs/newlines", () => {
      const result = validateConfirmation("DELETE\tMY\nACCOUNT");
      assert.strictEqual(result.valid, false);
    });
  });
});
