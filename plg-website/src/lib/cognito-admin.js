/**
 * Cognito Admin Operations (Server-Side)
 *
 * Server-side Cognito admin functions for:
 * - Adding users to groups (RBAC)
 * - Removing users from groups
 * - Listing user groups
 *
 * These operations require AWS credentials and should only be used
 * in API routes and Lambda functions, NOT in client-side code.
 *
 * @see PLG Roadmap v6 - Phase 2: Business RBAC
 */

// HIC DM Layer imports - centralized dependency management
import { HicLog } from "../../../dm/layers/base/src/index.js";

// AWS Cognito SDK
// In tests: test-loader redirects hic-auth-layer to facade mock helper
// In production: Next.js bundler resolves via package.json alias OR we'll need to revisit
import {
  CognitoIdentityProviderClient,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  AdminListGroupsForUserCommand,
  AdminGetUserCommand,
} from "hic-auth-layer";

// Lazy-initialized Cognito client (created on first use for test mock support)
let cognitoClient = null;

/**
 * Get Cognito client (lazy initialization for test mock support)
 * @returns {CognitoIdentityProviderClient}
 */
function getCognitoClient() {
  if (!cognitoClient) {
    cognitoClient = new CognitoIdentityProviderClient({
      region: process.env.AWS_REGION || "us-east-1",
    });
  }
  return cognitoClient;
}

/**
 * Get User Pool ID from environment (read at runtime for test support)
 * @returns {string|undefined} User Pool ID
 */
function getUserPoolId() {
  return (
    process.env.COGNITO_USER_POOL_ID ||
    process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID
  );
}

// RBAC Group names
export const COGNITO_GROUPS = {
  OWNER: "mouse-owner",
  ADMIN: "mouse-admin",
  MEMBER: "mouse-member",
};

// Service logger
const createLogger = (operation) =>
  new HicLog(`plg-cognito-admin-${operation}`);

/**
 * Add a user to a Cognito group
 * @param {string} userId - Cognito username (sub)
 * @param {string} groupName - Group name (mouse-owner, mouse-admin, mouse-member)
 * @returns {Promise<boolean>} True if successful
 */
export async function addUserToGroup(userId, groupName) {
  const log = createLogger("addUserToGroup");
  const userPoolId = getUserPoolId();

  if (!userPoolId) {
    log.error("Missing USER_POOL_ID", { userId, groupName });
    throw new Error("Cognito User Pool ID not configured");
  }

  try {
    await getCognitoClient().send(
      new AdminAddUserToGroupCommand({
        UserPoolId: userPoolId,
        Username: userId,
        GroupName: groupName,
      }),
    );

    log.info("User added to group", { userId, groupName });
    return true;
  } catch (error) {
    // User might already be in group - that's OK
    if (error.name === "UserNotFoundException") {
      log.warn("User not found in Cognito", { userId, groupName });
      return false;
    }

    log.error("Failed to add user to group", {
      userId,
      groupName,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Remove a user from a Cognito group
 * @param {string} userId - Cognito username (sub)
 * @param {string} groupName - Group name
 * @returns {Promise<boolean>} True if successful
 */
export async function removeUserFromGroup(userId, groupName) {
  const log = createLogger("removeUserFromGroup");
  const userPoolId = getUserPoolId();

  if (!userPoolId) {
    log.error("Missing USER_POOL_ID", { userId, groupName });
    throw new Error("Cognito User Pool ID not configured");
  }

  try {
    await getCognitoClient().send(
      new AdminRemoveUserFromGroupCommand({
        UserPoolId: userPoolId,
        Username: userId,
        GroupName: groupName,
      }),
    );

    log.info("User removed from group", { userId, groupName });
    return true;
  } catch (error) {
    if (error.name === "UserNotFoundException") {
      log.warn("User not found in Cognito", { userId, groupName });
      return false;
    }

    log.error("Failed to remove user from group", {
      userId,
      groupName,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get all groups a user belongs to
 * @param {string} userId - Cognito username (sub)
 * @returns {Promise<string[]>} Array of group names
 */
export async function getUserGroups(userId) {
  const log = createLogger("getUserGroups");
  const userPoolId = getUserPoolId();

  if (!userPoolId) {
    log.error("Missing USER_POOL_ID", { userId });
    throw new Error("Cognito User Pool ID not configured");
  }

  try {
    const response = await getCognitoClient().send(
      new AdminListGroupsForUserCommand({
        UserPoolId: userPoolId,
        Username: userId,
      }),
    );

    const groups = (response.Groups || []).map((g) => g.GroupName);
    log.info("User groups retrieved", { userId, groups });
    return groups;
  } catch (error) {
    if (error.name === "UserNotFoundException") {
      log.warn("User not found in Cognito", { userId });
      return [];
    }

    log.error("Failed to get user groups", {
      userId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Set user's RBAC role by managing group membership
 * Removes user from other RBAC groups and adds to the specified one
 * @param {string} userId - Cognito username (sub)
 * @param {string} role - Role (owner, admin, member)
 * @returns {Promise<boolean>} True if successful
 */
export async function setUserRole(userId, role) {
  const log = createLogger("setUserRole");

  // Map role to group name
  const roleToGroup = {
    owner: COGNITO_GROUPS.OWNER,
    admin: COGNITO_GROUPS.ADMIN,
    member: COGNITO_GROUPS.MEMBER,
  };

  const targetGroup = roleToGroup[role];
  if (!targetGroup) {
    log.error("Invalid role", { userId, role });
    throw new Error(`Invalid role: ${role}. Must be owner, admin, or member.`);
  }

  try {
    // Get current groups
    const currentGroups = await getUserGroups(userId);

    // Remove from other RBAC groups
    const rbacGroups = Object.values(COGNITO_GROUPS);
    for (const group of currentGroups) {
      if (rbacGroups.includes(group) && group !== targetGroup) {
        await removeUserFromGroup(userId, group);
      }
    }

    // Add to target group
    await addUserToGroup(userId, targetGroup);

    log.info("User role set", { userId, role, group: targetGroup });
    return true;
  } catch (error) {
    log.error("Failed to set user role", {
      userId,
      role,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get a user's current RBAC role from their group membership
 * @param {string} userId - Cognito username (sub)
 * @returns {Promise<string|null>} Role (owner, admin, member) or null if no RBAC group
 */
export async function getUserRole(userId) {
  const log = createLogger("getUserRole");

  try {
    const groups = await getUserGroups(userId);

    // Check groups in priority order (owner > admin > member)
    if (groups.includes(COGNITO_GROUPS.OWNER)) return "owner";
    if (groups.includes(COGNITO_GROUPS.ADMIN)) return "admin";
    if (groups.includes(COGNITO_GROUPS.MEMBER)) return "member";

    return null; // No RBAC group = individual user
  } catch (error) {
    log.error("Failed to get user role", {
      userId,
      error: error.message,
    });
    return null;
  }
}

/**
 * Check if a Cognito user exists
 * @param {string} userId - Cognito username (sub)
 * @returns {Promise<boolean>} True if user exists
 */
export async function userExists(userId) {
  const log = createLogger("userExists");
  const userPoolId = getUserPoolId();

  if (!userPoolId) {
    return false;
  }

  try {
    await getCognitoClient().send(
      new AdminGetUserCommand({
        UserPoolId: userPoolId,
        Username: userId,
      }),
    );
    return true;
  } catch (error) {
    if (error.name === "UserNotFoundException") {
      return false;
    }
    log.error("Failed to check user existence", {
      userId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Assign owner role to a user after Business purchase
 * Call this from Stripe webhook when a Business subscription is created
 * @param {string} userId - Cognito username (sub)
 * @returns {Promise<boolean>} True if successful, false if user not in Cognito
 */
export async function assignOwnerRole(userId) {
  const log = createLogger("assignOwnerRole");

  try {
    // Check if user exists in Cognito
    const exists = await userExists(userId);
    if (!exists) {
      log.warn("User not found in Cognito, cannot assign owner role", {
        userId,
      });
      // User might have purchased before signing up - role will be assigned on first login
      return false;
    }

    await setUserRole(userId, "owner");
    log.info("Owner role assigned", { userId });
    return true;
  } catch (error) {
    log.error("Failed to assign owner role", {
      userId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Assign member role to a user after accepting invite
 * Call this from invite accept flow
 * @param {string} userId - Cognito username (sub)
 * @param {string} invitedRole - Role from invite (admin or member)
 * @returns {Promise<boolean>} True if successful
 */
export async function assignInvitedRole(userId, invitedRole) {
  const log = createLogger("assignInvitedRole");

  // Only allow admin or member for invited users
  const allowedRoles = ["admin", "member"];
  if (!allowedRoles.includes(invitedRole)) {
    log.error("Invalid invited role", { userId, invitedRole });
    throw new Error(
      `Invalid invited role: ${invitedRole}. Must be admin or member.`,
    );
  }

  try {
    await setUserRole(userId, invitedRole);
    log.info("Invited role assigned", { userId, role: invitedRole });
    return true;
  } catch (error) {
    log.error("Failed to assign invited role", {
      userId,
      invitedRole,
      error: error.message,
    });
    throw error;
  }
}
