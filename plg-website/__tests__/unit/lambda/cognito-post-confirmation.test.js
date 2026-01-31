/**
 * Cognito Post-Confirmation Lambda Unit Tests
 *
 * Tests the cognito-post-confirmation Lambda for:
 * - SES email verification request on user signup
 * - USER_CREATED event written to DynamoDB
 * - Graceful handling of SES errors (doesn't block signup)
 * - Skipping existing users (idempotency)
 *
 * @see cognito-post-confirmation Lambda
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import { expect } from "../../lib/test-kit.js";

// Track calls for verification
let sesCalls = [];
let dynamoCalls = [];
let sesSendImpl = async () => ({});
let dynamoSendImpl = async () => ({});

// Mock clients with swappable implementations
const mockSesClient = {
  send: async (cmd) => {
    sesCalls.push({ command: cmd.constructor.name, input: cmd.input });
    return sesSendImpl(cmd);
  },
};

const mockDynamoClient = {
  send: async (cmd) => {
    dynamoCalls.push({ command: cmd.constructor.name, input: cmd.input });
    return dynamoSendImpl(cmd);
  },
};

// Import the Lambda handler after setting up mocks
let handler, __setSesClientForTests, __setDynamoClientForTests;

async function setupModule() {
  const lambdaModule =
    await import("../../../infrastructure/lambda/cognito-post-confirmation/index.js");
  handler = lambdaModule.handler;
  __setSesClientForTests = lambdaModule.__setSesClientForTests;
  __setDynamoClientForTests = lambdaModule.__setDynamoClientForTests;

  // Inject mock clients
  __setSesClientForTests(mockSesClient);
  __setDynamoClientForTests(mockDynamoClient);
}

// Helper to create Cognito PostConfirmation event
function createCognitoEvent(userAttributes, userName = "test-user-123") {
  return {
    version: "1",
    region: "us-east-1",
    userPoolId: "us-east-1_CntYimcMm",
    userName,
    callerContext: {
      awsSdkVersion: "aws-sdk-js-3.0.0",
      clientId: "test-client-id",
    },
    triggerSource: "PostConfirmation_ConfirmSignUp",
    request: {
      userAttributes: {
        sub: userName,
        email_verified: "true",
        ...userAttributes,
      },
    },
    response: {},
  };
}

describe("Cognito Post-Confirmation Lambda", async () => {
  await setupModule();

  beforeEach(() => {
    // Reset call tracking
    sesCalls = [];
    dynamoCalls = [];
    // Reset implementations to defaults
    sesSendImpl = async () => ({});
    dynamoSendImpl = async () => ({});
  });

  describe("handler", () => {
    test("should request SES verification for new user email", async () => {
      const event = createCognitoEvent({
        email: "newuser@example.com",
        name: "Test User",
      });

      await handler(event);

      // Verify SES was called with correct email
      const sesCall = sesCalls.find(
        (c) => c.command === "VerifyEmailIdentityCommand",
      );
      expect(sesCall).toBeDefined();
      expect(sesCall.input.EmailAddress).toBe("newuser@example.com");
    });

    test("should write USER_CREATED event to DynamoDB for new user", async () => {
      const event = createCognitoEvent(
        {
          email: "newuser@example.com",
          name: "Test User",
        },
        "user-abc-123",
      );

      await handler(event);

      // Find the PutItem call (not GetItem)
      const putCall = dynamoCalls.find((c) => c.command === "PutItemCommand");
      expect(putCall).toBeDefined();

      // Verify the item structure
      const item = putCall.input.Item;
      expect(item.PK.S).toBe("USER#user-abc-123");
      expect(item.SK.S).toBe("PROFILE");
      expect(item.email.S).toBe("newuser@example.com");
      expect(item.name.S).toBe("Test User");
      expect(item.eventType.S).toBe("USER_CREATED");
      expect(item.sesVerificationStatus.S).toBe("pending");
    });

    test("should return event unchanged (required by Cognito)", async () => {
      const event = createCognitoEvent({
        email: "newuser@example.com",
        name: "Test User",
      });

      const result = await handler(event);

      expect(result).toBe(event);
    });

    test("should skip DynamoDB write if user already exists", async () => {
      // Mock GetItem to return existing user
      dynamoSendImpl = async (cmd) => {
        if (cmd.constructor.name === "GetItemCommand") {
          return {
            Item: {
              PK: { S: "USER#existing-user" },
              SK: { S: "PROFILE" },
            },
          };
        }
        return {};
      };

      const event = createCognitoEvent(
        {
          email: "existing@example.com",
          name: "Existing User",
        },
        "existing-user",
      );

      await handler(event);

      // SES should still be called (verification might have expired)
      const sesCall = sesCalls.find(
        (c) => c.command === "VerifyEmailIdentityCommand",
      );
      expect(sesCall).toBeDefined();

      // But PutItem should NOT be called
      const putCall = dynamoCalls.find((c) => c.command === "PutItemCommand");
      expect(putCall).toBeUndefined();
    });

    test("should not throw if SES verification fails (graceful degradation)", async () => {
      // Mock SES to fail
      sesSendImpl = async () => {
        throw new Error("SES service unavailable");
      };

      const event = createCognitoEvent({
        email: "newuser@example.com",
        name: "Test User",
      });

      // Should not throw
      const result = await handler(event);

      // Should still return event (don't block user signup)
      expect(result).toBe(event);
    });

    test("should extract name from given_name if name not provided", async () => {
      const event = createCognitoEvent({
        email: "newuser@example.com",
        given_name: "John",
      });

      await handler(event);

      const putCall = dynamoCalls.find((c) => c.command === "PutItemCommand");
      expect(putCall).toBeDefined();
      expect(putCall.input.Item.name.S).toBe("John");
    });

    test("should use email prefix as name if no name attributes provided", async () => {
      const event = createCognitoEvent({
        email: "johndoe@example.com",
      });

      await handler(event);

      const putCall = dynamoCalls.find((c) => c.command === "PutItemCommand");
      expect(putCall).toBeDefined();
      expect(putCall.input.Item.name.S).toBe("johndoe");
    });

    test("should use correct DynamoDB table from environment", async () => {
      const event = createCognitoEvent({
        email: "newuser@example.com",
        name: "Test User",
      });

      await handler(event);

      const putCall = dynamoCalls.find((c) => c.command === "PutItemCommand");
      expect(putCall).toBeDefined();
      // Default table name from Lambda
      expect(putCall.input.TableName).toBe("hic-plg-staging");
    });
  });

  describe("email masking", () => {
    test("should mask emails in logs (verified through successful execution)", async () => {
      // This test verifies the Lambda runs without exposing full emails
      // The actual masking logic is internal - we just verify it doesn't throw
      const event = createCognitoEvent({
        email: "sensitive-email@example.com",
        name: "Test User",
      });

      // Should complete without error
      const result = await handler(event);
      expect(result).toBe(event);
    });
  });

  describe("idempotency", () => {
    test("should handle duplicate Cognito events gracefully", async () => {
      // First call - user doesn't exist
      dynamoSendImpl = async (cmd) => {
        if (cmd.constructor.name === "GetItemCommand") {
          return {}; // No item
        }
        return {};
      };

      const event = createCognitoEvent({
        email: "newuser@example.com",
        name: "Test User",
      });

      await handler(event);

      // Verify first call created user
      const firstPutCall = dynamoCalls.find(
        (c) => c.command === "PutItemCommand",
      );
      expect(firstPutCall).toBeDefined();

      // Reset calls
      dynamoCalls = [];

      // Second call - user now exists
      dynamoSendImpl = async (cmd) => {
        if (cmd.constructor.name === "GetItemCommand") {
          return {
            Item: { PK: { S: "USER#test-user-123" }, SK: { S: "PROFILE" } },
          };
        }
        return {};
      };

      await handler(event);

      // Verify second call did NOT create user
      const secondPutCall = dynamoCalls.find(
        (c) => c.command === "PutItemCommand",
      );
      expect(secondPutCall).toBeUndefined();
    });
  });
});
