/**
 * Cognito Admin Operations Tests
 *
 * Tests for server-side Cognito admin functions using HIC test-helpers:
 * - Group management (add/remove/list)
 * - Role assignment
 * - User existence checks
 *
 * Uses the auth facade for mocking AWS Cognito operations.
 *
 * @see src/lib/cognito-admin.js
 */

import {
  test,
  describe,
  beforeEach,
  afterEach,
  expect,
} from "../../../../dm/facade/test-helpers/index.js";
// Import from layer alias - test-loader redirects to facade helper
// CRITICAL: Both test and source MUST import via the same alias for mocking to work
import {
  createCognitoMock,
  CognitoIdentityProviderClient,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  AdminListGroupsForUserCommand,
  AdminGetUserCommand,
} from "hic-auth-layer";

// CRITICAL: Create mock at module level BEFORE importing source code
// The source creates its CognitoIdentityProviderClient at import time
const cognitoMock = createCognitoMock();

// Import the functions under test
import {
  addUserToGroup,
  removeUserFromGroup,
  getUserGroups,
  setUserRole,
  getUserRole,
  userExists,
  assignOwnerRole,
  assignInvitedRole,
  COGNITO_GROUPS,
} from "../../../src/lib/cognito-admin.js";

// ===========================================
// TEST SETUP
// ===========================================
const TEST_USER_POOL_ID = "us-east-1_TestPool";
const TEST_USER_ID = "test-user-sub-123";

describe("Cognito Admin Operations", () => {
  beforeEach(() => {
    cognitoMock.reset();
    process.env.COGNITO_USER_POOL_ID = TEST_USER_POOL_ID;
  });

  afterEach(() => {
    cognitoMock.reset();
    delete process.env.COGNITO_USER_POOL_ID;
  });

  // ===========================================
  // COGNITO_GROUPS Constants
  // ===========================================
  describe("COGNITO_GROUPS constants", () => {
    test("should have correct group names", () => {
      expect(COGNITO_GROUPS.OWNER).toBe("mouse-owner");
      expect(COGNITO_GROUPS.ADMIN).toBe("mouse-admin");
      expect(COGNITO_GROUPS.MEMBER).toBe("mouse-member");
    });
  });

  // ===========================================
  // addUserToGroup
  // ===========================================
  describe("addUserToGroup", () => {
    test("should add user to group successfully", async () => {
      cognitoMock.whenAddUserToGroup({
        userPoolId: TEST_USER_POOL_ID,
        username: TEST_USER_ID,
        groupName: "mouse-owner",
      });

      const result = await addUserToGroup(TEST_USER_ID, "mouse-owner");

      expect(result).toBe(true);
    });

    test("should return false if user not found", async () => {
      cognitoMock.whenAddUserToGroupFails({
        errorCode: "UserNotFoundException",
        errorMessage: "User not found",
      });

      const result = await addUserToGroup("nonexistent-user", "mouse-owner");

      expect(result).toBe(false);
    });

    test("should throw on other errors", async () => {
      cognitoMock.whenAddUserToGroupFails({
        errorCode: "InternalErrorException",
        errorMessage: "Network error",
      });

      try {
        await addUserToGroup(TEST_USER_ID, "mouse-owner");
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error.message).toContain("Network error");
      }
    });
  });

  // ===========================================
  // removeUserFromGroup
  // ===========================================
  describe("removeUserFromGroup", () => {
    test("should remove user from group successfully", async () => {
      cognitoMock.whenRemoveUserFromGroup({
        userPoolId: TEST_USER_POOL_ID,
        username: TEST_USER_ID,
        groupName: "mouse-owner",
      });

      const result = await removeUserFromGroup(TEST_USER_ID, "mouse-owner");

      expect(result).toBe(true);
    });

    test("should return false if user not found", async () => {
      cognitoMock.whenRemoveUserFromGroupFails({
        errorCode: "UserNotFoundException",
        errorMessage: "User not found",
      });

      // The function handles user not found gracefully
      const result = await removeUserFromGroup("nonexistent", "mouse-owner");

      expect(result).toBe(false);
    });
  });

  // ===========================================
  // getUserGroups
  // ===========================================
  describe("getUserGroups", () => {
    test("should return array of group names", async () => {
      cognitoMock.whenListUserGroupsAny({
        groups: ["mouse-owner", "other-group"],
      });

      const groups = await getUserGroups(TEST_USER_ID);

      expect(groups).toEqual(["mouse-owner", "other-group"]);
    });

    test("should return empty array if no groups", async () => {
      cognitoMock.whenListUserGroupsAny({ groups: [] });

      const groups = await getUserGroups(TEST_USER_ID);

      expect(groups).toEqual([]);
    });

    test("should return empty array if user not found", async () => {
      cognitoMock.whenListUserGroupsFails({
        errorCode: "UserNotFoundException",
        errorMessage: "User not found",
      });

      const groups = await getUserGroups("nonexistent");

      expect(groups).toEqual([]);
    });
  });

  // ===========================================
  // setUserRole
  // ===========================================
  describe("setUserRole", () => {
    test("should set user to owner role", async () => {
      // Mock getUserGroups returning empty (user has no existing RBAC groups)
      cognitoMock.whenListUserGroupsAny({ groups: [] });
      // Mock addUserToGroup
      cognitoMock.whenAddUserToGroupAny();

      const result = await setUserRole(TEST_USER_ID, "owner");

      expect(result).toBe(true);
    });

    test("should remove from other RBAC groups when setting role", async () => {
      // User is already admin
      cognitoMock.whenListUserGroupsAny({ groups: ["mouse-admin"] });
      // Remove from admin group
      cognitoMock.whenRemoveUserFromGroupAny();
      // Add to owner group
      cognitoMock.whenAddUserToGroupAny();

      const result = await setUserRole(TEST_USER_ID, "owner");

      expect(result).toBe(true);
    });

    test("should reject invalid role", async () => {
      try {
        await setUserRole(TEST_USER_ID, "superadmin");
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error.message).toContain("Invalid role: superadmin");
      }
    });
  });

  // ===========================================
  // getUserRole
  // ===========================================
  describe("getUserRole", () => {
    test("should return owner for mouse-owner group", async () => {
      cognitoMock.whenListUserGroupsAny({ groups: ["mouse-owner"] });

      const role = await getUserRole(TEST_USER_ID);

      expect(role).toBe("owner");
    });

    test("should return admin for mouse-admin group", async () => {
      cognitoMock.whenListUserGroupsAny({ groups: ["mouse-admin"] });

      const role = await getUserRole(TEST_USER_ID);

      expect(role).toBe("admin");
    });

    test("should return member for mouse-member group", async () => {
      cognitoMock.whenListUserGroupsAny({ groups: ["mouse-member"] });

      const role = await getUserRole(TEST_USER_ID);

      expect(role).toBe("member");
    });

    test("should return null for individual user (no RBAC group)", async () => {
      cognitoMock.whenListUserGroupsAny({ groups: [] });

      const role = await getUserRole(TEST_USER_ID);

      expect(role).toBe(null);
    });

    test("should prioritize owner over admin in group list", async () => {
      cognitoMock.whenListUserGroupsAny({
        groups: ["mouse-admin", "mouse-owner"],
      });

      const role = await getUserRole(TEST_USER_ID);

      expect(role).toBe("owner");
    });
  });

  // ===========================================
  // userExists
  // ===========================================
  describe("userExists", () => {
    test("should return true if user exists", async () => {
      cognitoMock.whenGetUser(
        { userPoolId: TEST_USER_POOL_ID, username: TEST_USER_ID },
        { attributes: [{ Name: "sub", Value: TEST_USER_ID }] },
      );

      const exists = await userExists(TEST_USER_ID);

      expect(exists).toBe(true);
    });

    test("should return false if user not found", async () => {
      cognitoMock.whenGetUserFails({
        errorCode: "UserNotFoundException",
        errorMessage: "User not found",
      });

      const exists = await userExists("nonexistent");

      expect(exists).toBe(false);
    });
  });

  // ===========================================
  // assignOwnerRole
  // ===========================================
  describe("assignOwnerRole", () => {
    test("should assign owner role to existing user", async () => {
      // userExists check
      cognitoMock.whenGetUserAny({ attributes: [] });
      // getUserGroups (for setUserRole)
      cognitoMock.whenListUserGroupsAny({ groups: [] });
      // addUserToGroup
      cognitoMock.whenAddUserToGroupAny();

      const result = await assignOwnerRole(TEST_USER_ID);

      expect(result).toBe(true);
    });

    test("should return false if user not in Cognito yet", async () => {
      cognitoMock.whenGetUserFails({
        errorCode: "UserNotFoundException",
        errorMessage: "User not found",
      });

      const result = await assignOwnerRole("email:test@example.com");

      expect(result).toBe(false);
    });
  });

  // ===========================================
  // assignInvitedRole
  // ===========================================
  describe("assignInvitedRole", () => {
    test("should assign admin role", async () => {
      // getUserGroups (for setUserRole)
      cognitoMock.whenListUserGroupsAny({ groups: [] });
      // addUserToGroup
      cognitoMock.whenAddUserToGroupAny();

      const result = await assignInvitedRole(TEST_USER_ID, "admin");

      expect(result).toBe(true);
    });

    test("should assign member role", async () => {
      // getUserGroups (for setUserRole)
      cognitoMock.whenListUserGroupsAny({ groups: [] });
      // addUserToGroup
      cognitoMock.whenAddUserToGroupAny();

      const result = await assignInvitedRole(TEST_USER_ID, "member");

      expect(result).toBe(true);
    });

    test("should reject owner role (only owner can be purchaser)", async () => {
      try {
        await assignInvitedRole(TEST_USER_ID, "owner");
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error.message).toContain("Invalid invited role: owner");
      }
    });

    test("should reject invalid role", async () => {
      try {
        await assignInvitedRole(TEST_USER_ID, "superuser");
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error.message).toContain("Invalid invited role: superuser");
      }
    });
  });
});
