// dm/layers/auth/src/index.js
// Exports AWS SDK for Cognito Identity Provider to Lambda layer
// Used for server-side Cognito admin operations (group management, user lookup)

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
