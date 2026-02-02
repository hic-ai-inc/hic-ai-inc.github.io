/**
 * Auth Facade - Clean API for Cognito Identity Provider mocking
 *
 * Provides simple methods for mocking Cognito admin operations without complex AWS SDK setup.
 * Handles group management, user lookup, and attribute updates.
 */

import { mockClient } from "aws-sdk-client-mock";
import {
  CognitoIdentityProviderClient,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  AdminListGroupsForUserCommand,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminDeleteUserCommand,
  ListUsersInGroupCommand,
  GetGroupCommand,
  CreateGroupCommand,
  DeleteGroupCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { deepEqual } from "../utils/deepEqual.js";
import { registerMock } from "../utils/registry.js";

function createCognitoMock() {
  const cognitoMock = mockClient(CognitoIdentityProviderClient);

  const api = {
    /**
     * Mock AdminAddUserToGroup - adding a user to a Cognito group
     * @param {object} params - Match criteria
     * @param {string} params.userPoolId - User Pool ID to match
     * @param {string} params.username - Username (sub) to match
     * @param {string} params.groupName - Group name to match
     */
    whenAddUserToGroup({ userPoolId, username, groupName }) {
      if (!userPoolId || !username || !groupName) {
        throw new Error("userPoolId, username, and groupName are required");
      }

      // Use object matching (aws-sdk-client-mock 2.x+ API)
      cognitoMock
        .on(AdminAddUserToGroupCommand, {
          UserPoolId: userPoolId,
          Username: username,
          GroupName: groupName,
        })
        .resolves({});
    },

    /**
     * Mock all AdminAddUserToGroup commands with success
     */
    whenAddUserToGroupAny() {
      cognitoMock.on(AdminAddUserToGroupCommand).resolves({});
    },

    /**
     * Mock AdminAddUserToGroup to fail
     * @param {object} params - Error config
     * @param {string} [params.errorCode] - AWS error code
     * @param {string} [params.errorMessage] - Error message
     */
    whenAddUserToGroupFails({
      errorCode = "UserNotFoundException",
      errorMessage = "User not found",
    } = {}) {
      const error = new Error(errorMessage);
      error.name = errorCode;
      error.code = errorCode;
      cognitoMock.on(AdminAddUserToGroupCommand).rejects(error);
    },

    /**
     * Mock AdminRemoveUserFromGroup
     * @param {object} params - Match criteria
     * @param {string} params.userPoolId - User Pool ID
     * @param {string} params.username - Username (sub)
     * @param {string} params.groupName - Group name
     */
    whenRemoveUserFromGroup({ userPoolId, username, groupName }) {
      if (!userPoolId || !username || !groupName) {
        throw new Error("userPoolId, username, and groupName are required");
      }

      // Use object matching (aws-sdk-client-mock 2.x+ API)
      cognitoMock
        .on(AdminRemoveUserFromGroupCommand, {
          UserPoolId: userPoolId,
          Username: username,
          GroupName: groupName,
        })
        .resolves({});
    },

    /**
     * Mock all AdminRemoveUserFromGroup commands with success
     */
    whenRemoveUserFromGroupAny() {
      cognitoMock.on(AdminRemoveUserFromGroupCommand).resolves({});
    },

    /**
     * Mock AdminRemoveUserFromGroup to fail
     * @param {object} params - Error config
     * @param {string} [params.errorCode] - AWS error code
     * @param {string} [params.errorMessage] - Error message
     */
    whenRemoveUserFromGroupFails({
      errorCode = "UserNotFoundException",
      errorMessage = "User not found",
    } = {}) {
      const error = new Error(errorMessage);
      error.name = errorCode;
      error.code = errorCode;
      cognitoMock.on(AdminRemoveUserFromGroupCommand).rejects(error);
    },

    /**
     * Mock AdminListGroupsForUser - returns groups a user belongs to
     * @param {object} params - Match criteria
     * @param {string} params.userPoolId - User Pool ID
     * @param {string} params.username - Username (sub)
     * @param {object} response - Response config
     * @param {string[]} response.groups - Array of group names
     */
    whenListUserGroups({ userPoolId, username }, { groups = [] } = {}) {
      if (!userPoolId || !username) {
        throw new Error("userPoolId and username are required");
      }

      const groupsResponse = groups.map((name) => ({
        GroupName: name,
        UserPoolId: userPoolId,
      }));

      // Use object matching (aws-sdk-client-mock 2.x+ API)
      cognitoMock
        .on(AdminListGroupsForUserCommand, {
          UserPoolId: userPoolId,
          Username: username,
        })
        .resolves({ Groups: groupsResponse });
    },

    /**
     * Mock AdminListGroupsForUser for any user
     * @param {object} response - Response config
     * @param {string[]} response.groups - Array of group names
     */
    whenListUserGroupsAny({ groups = [] } = {}) {
      const groupsResponse = groups.map((name) => ({
        GroupName: name,
        UserPoolId: "mock-pool",
      }));

      cognitoMock
        .on(AdminListGroupsForUserCommand)
        .resolves({ Groups: groupsResponse });
    },

    /**
     * Mock AdminListGroupsForUser to fail (user not found)
     * @param {object} params - Error config
     * @param {string} [params.errorCode] - AWS error code
     * @param {string} [params.errorMessage] - Error message
     */
    whenListUserGroupsFails({
      errorCode = "UserNotFoundException",
      errorMessage = "User not found",
    } = {}) {
      const error = new Error(errorMessage);
      error.name = errorCode;
      error.code = errorCode;
      cognitoMock.on(AdminListGroupsForUserCommand).rejects(error);
    },

    /**
     * Mock AdminGetUser - returns user details
     * @param {object} params - Match criteria
     * @param {string} params.userPoolId - User Pool ID
     * @param {string} params.username - Username (sub)
     * @param {object} response - Response config
     * @param {object[]} [response.attributes] - User attributes array
     */
    whenGetUser(
      { userPoolId, username },
      { attributes = [], enabled = true } = {},
    ) {
      if (!userPoolId || !username) {
        throw new Error("userPoolId and username are required");
      }

      // Use object matching (aws-sdk-client-mock 2.x+ API)
      cognitoMock
        .on(AdminGetUserCommand, {
          UserPoolId: userPoolId,
          Username: username,
        })
        .resolves({
          Username: username,
          Enabled: enabled,
          UserAttributes: attributes,
          UserStatus: "CONFIRMED",
        });
    },

    /**
     * Mock AdminGetUser for any user
     */
    whenGetUserAny({ attributes = [], enabled = true } = {}) {
      cognitoMock.on(AdminGetUserCommand).resolves({
        Username: "mock-user",
        Enabled: enabled,
        UserAttributes: attributes,
        UserStatus: "CONFIRMED",
      });
    },

    /**
     * Mock AdminGetUser to fail (user not found)
     * @param {object} params - Error config
     * @param {string} [params.errorCode] - AWS error code
     * @param {string} [params.errorMessage] - Error message
     */
    whenGetUserFails({
      errorCode = "UserNotFoundException",
      errorMessage = "User not found",
    } = {}) {
      const error = new Error(errorMessage);
      error.name = errorCode;
      error.code = errorCode;
      cognitoMock.on(AdminGetUserCommand).rejects(error);
    },

    /**
     * Reset all mocks
     */
    reset() {
      cognitoMock.reset();
    },

    /**
     * Get all calls made to the mock
     * @returns {Array} Array of call objects
     */
    calls() {
      return cognitoMock.calls();
    },

    /**
     * Get the underlying mock for advanced assertions
     * @returns {object} The aws-sdk-client-mock instance
     */
    getMock() {
      return cognitoMock;
    },
  };

  // Register for automatic reset
  registerMock(api);

  return api;
}

// Export the SDK classes for direct use in tests
export {
  CognitoIdentityProviderClient,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  AdminListGroupsForUserCommand,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminDeleteUserCommand,
  ListUsersInGroupCommand,
  GetGroupCommand,
  CreateGroupCommand,
  DeleteGroupCommand,
} from "@aws-sdk/client-cognito-identity-provider";

// Export factory function
export { createCognitoMock };
