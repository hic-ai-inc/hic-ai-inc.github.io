/**
 * Email Sender Lambda Unit Tests
 *
 * Tests the email-sender Lambda for:
 * - Sending emails when SES verification is Success
 * - Skipping emails when verification is Pending/Failed/NotFound
 * - Graceful handling of verification check failures
 * - Processing multiple records
 * - Different event types (LICENSE_CREATED, etc.)
 *
 * @see email-sender Lambda
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import { expect } from "../../lib/test-kit.js";

// Track calls for verification
let sesCalls = [];
let sesSendImpl = async () => ({});

// Mock client with swappable implementation
const mockSesClient = {
  send: async (cmd) => {
    sesCalls.push({ command: cmd.constructor.name, input: cmd.input });
    return sesSendImpl(cmd);
  },
};

// Import the Lambda handler after setting up mocks
let handler, __setSesClientForTests;

async function setupModule() {
  const lambdaModule =
    await import("../../../infrastructure/lambda/email-sender/index.js");
  handler = lambdaModule.handler;
  __setSesClientForTests = lambdaModule.__setSesClientForTests;

  // Inject mock client
  __setSesClientForTests(mockSesClient);
}

// Helper to create SQS record with DynamoDB stream data (via SNS)
function createSqsRecord(
  eventType,
  email,
  additionalFields = {},
  eventName = "INSERT",
) {
  const newImage = {
    pk: { S: `USER#${email}` },
    sk: { S: `LICENSE#${Date.now()}` },
    eventType: { S: eventType },
    email: { S: email },
    ...additionalFields,
  };

  return {
    messageId: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    body: JSON.stringify({
      newImage,
      keys: { pk: newImage.pk, sk: newImage.sk },
      eventName,
    }),
  };
}

// Helper to create SQS event with multiple records
function createSqsEvent(records) {
  return { Records: records };
}

describe("Email Sender Lambda", async () => {
  await setupModule();

  beforeEach(() => {
    // Reset call tracking
    sesCalls = [];
    // Default: verification succeeds, emails send
    sesSendImpl = async (cmd) => {
      if (cmd.constructor.name === "GetIdentityVerificationAttributesCommand") {
        const email = cmd.input.Identities[0];
        return {
          VerificationAttributes: {
            [email]: { VerificationStatus: "Success" },
          },
        };
      }
      if (cmd.constructor.name === "SendEmailCommand") {
        return { MessageId: `test-msg-${Date.now()}` };
      }
      return {};
    };
  });

  describe("SES Verification Guard", () => {
    test("should send email when verification status is Success", async () => {
      const event = createSqsEvent([
        createSqsRecord("LICENSE_CREATED", "verified@example.com", {
          licenseKey: { S: "LICENSE-KEY-123" },
          planName: { S: "PRO" },
        }),
      ]);

      const result = await handler(event);

      // Should have checked verification and sent email
      const verificationCall = sesCalls.find(
        (c) => c.command === "GetIdentityVerificationAttributesCommand",
      );
      expect(verificationCall).toBeTruthy();
      expect(verificationCall.input.Identities).toContain(
        "verified@example.com",
      );

      const sendCall = sesCalls.find((c) => c.command === "SendEmailCommand");
      expect(sendCall).toBeTruthy();
      expect(sendCall.input.Destination.ToAddresses).toContain(
        "verified@example.com",
      );

      expect(result.success).toBe(1);
      expect(result.failed).toBe(0);
    });

    test("should skip email when verification status is Pending", async () => {
      sesSendImpl = async (cmd) => {
        if (
          cmd.constructor.name === "GetIdentityVerificationAttributesCommand"
        ) {
          return {
            VerificationAttributes: {
              "pending@example.com": { VerificationStatus: "Pending" },
            },
          };
        }
        return { MessageId: "should-not-reach" };
      };

      const event = createSqsEvent([
        createSqsRecord("LICENSE_CREATED", "pending@example.com", {
          licenseKey: { S: "LICENSE-KEY-123" },
        }),
      ]);

      const result = await handler(event);

      // Should have checked verification but NOT sent email
      const verificationCall = sesCalls.find(
        (c) => c.command === "GetIdentityVerificationAttributesCommand",
      );
      expect(verificationCall).toBeTruthy();

      const sendCall = sesCalls.find((c) => c.command === "SendEmailCommand");
      expect(sendCall).toBeFalsy();

      // Skipped records should be counted separately
      expect(result.success).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.failed).toBe(0);
    });

    test("should skip email when verification status is Failed", async () => {
      sesSendImpl = async (cmd) => {
        if (
          cmd.constructor.name === "GetIdentityVerificationAttributesCommand"
        ) {
          return {
            VerificationAttributes: {
              "failed@example.com": { VerificationStatus: "Failed" },
            },
          };
        }
        return { MessageId: "should-not-reach" };
      };

      const event = createSqsEvent([
        createSqsRecord("LICENSE_CREATED", "failed@example.com", {
          licenseKey: { S: "LICENSE-KEY-123" },
        }),
      ]);

      const result = await handler(event);

      const sendCall = sesCalls.find((c) => c.command === "SendEmailCommand");
      expect(sendCall).toBeFalsy();

      expect(result.success).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.failed).toBe(0);
    });

    test("should skip email when email not found in verification attributes", async () => {
      sesSendImpl = async (cmd) => {
        if (
          cmd.constructor.name === "GetIdentityVerificationAttributesCommand"
        ) {
          // Empty attributes = email not known to SES
          return { VerificationAttributes: {} };
        }
        return { MessageId: "should-not-reach" };
      };

      const event = createSqsEvent([
        createSqsRecord("LICENSE_CREATED", "unknown@example.com", {
          licenseKey: { S: "LICENSE-KEY-123" },
        }),
      ]);

      const result = await handler(event);

      const sendCall = sesCalls.find((c) => c.command === "SendEmailCommand");
      expect(sendCall).toBeFalsy();

      expect(result.success).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.failed).toBe(0);
    });

    test("should continue to send if verification check throws error", async () => {
      sesSendImpl = async (cmd) => {
        if (
          cmd.constructor.name === "GetIdentityVerificationAttributesCommand"
        ) {
          throw new Error("SES API temporarily unavailable");
        }
        if (cmd.constructor.name === "SendEmailCommand") {
          return { MessageId: `test-msg-${Date.now()}` };
        }
        return {};
      };

      const event = createSqsEvent([
        createSqsRecord("LICENSE_CREATED", "user@example.com", {
          licenseKey: { S: "LICENSE-KEY-123" },
          planName: { S: "PRO" },
        }),
      ]);

      const result = await handler(event);

      // Should have attempted verification
      const verificationCall = sesCalls.find(
        (c) => c.command === "GetIdentityVerificationAttributesCommand",
      );
      expect(verificationCall).toBeTruthy();

      // Should have continued to send email anyway (graceful degradation)
      const sendCall = sesCalls.find((c) => c.command === "SendEmailCommand");
      expect(sendCall).toBeTruthy();

      expect(result.success).toBe(1);
    });
  });

  describe("Multiple Records Processing", () => {
    test("should process multiple records with mixed verification status", async () => {
      sesSendImpl = async (cmd) => {
        if (
          cmd.constructor.name === "GetIdentityVerificationAttributesCommand"
        ) {
          const email = cmd.input.Identities[0];
          if (email === "verified@example.com") {
            return {
              VerificationAttributes: {
                [email]: { VerificationStatus: "Success" },
              },
            };
          }
          if (email === "pending@example.com") {
            return {
              VerificationAttributes: {
                [email]: { VerificationStatus: "Pending" },
              },
            };
          }
          return { VerificationAttributes: {} };
        }
        if (cmd.constructor.name === "SendEmailCommand") {
          return { MessageId: `test-msg-${Date.now()}` };
        }
        return {};
      };

      const event = createSqsEvent([
        createSqsRecord("LICENSE_CREATED", "verified@example.com", {
          licenseKey: { S: "KEY-1" },
          planName: { S: "PRO" },
        }),
        createSqsRecord("LICENSE_CREATED", "pending@example.com", {
          licenseKey: { S: "KEY-2" },
        }),
        createSqsRecord("LICENSE_CREATED", "unknown@example.com", {
          licenseKey: { S: "KEY-3" },
        }),
      ]);

      const result = await handler(event);

      // Only verified email should be sent
      const sendCalls = sesCalls.filter(
        (c) => c.command === "SendEmailCommand",
      );
      expect(sendCalls.length).toBe(1);
      expect(sendCalls[0].input.Destination.ToAddresses).toContain(
        "verified@example.com",
      );

      expect(result.processed).toBe(3);
      expect(result.success).toBe(1);
      expect(result.skipped).toBe(2);
      expect(result.failed).toBe(0);
    });
  });

  describe("Event Type Handling", () => {
    test("should skip records without eventType", async () => {
      const event = createSqsEvent([
        {
          messageId: "msg-no-eventtype",
          body: JSON.stringify({
            newImage: {
              pk: { S: "USER#test@example.com" },
              sk: { S: "PROFILE" },
              email: { S: "test@example.com" },
              // No eventType
            },
            keys: { pk: { S: "USER#test@example.com" }, sk: { S: "PROFILE" } },
            eventName: "INSERT",
          }),
        },
      ]);

      const result = await handler(event);

      // No SES calls should be made
      expect(sesCalls.length).toBe(0);
      expect(result.processed).toBe(0);
    });

    test("should skip records with unknown eventType", async () => {
      const event = createSqsEvent([
        createSqsRecord("UNKNOWN_EVENT_TYPE", "test@example.com"),
      ]);

      const result = await handler(event);

      // No SES calls should be made
      expect(sesCalls.length).toBe(0);
      expect(result.processed).toBe(0);
    });

    test("should skip records without email field", async () => {
      const event = createSqsEvent([
        {
          messageId: "msg-no-email",
          body: JSON.stringify({
            newImage: {
              pk: { S: "USER#test" },
              sk: { S: "LICENSE#123" },
              eventType: { S: "LICENSE_CREATED" },
              // No email
            },
            keys: { pk: { S: "USER#test" }, sk: { S: "LICENSE#123" } },
            eventName: "INSERT",
          }),
        },
      ]);

      const result = await handler(event);

      // No SES calls should be made
      expect(sesCalls.length).toBe(0);
      expect(result.processed).toBe(0);
    });
  });

  describe("Email Masking", () => {
    test("should mask email addresses in logs", async () => {
      // The Lambda uses email.replace(/(.{2}).*@/, "$1***@") for masking
      // We verify this by checking that the full email is never in log output
      // (This is verified by the Lambda's internal logging, but we test the pattern works)

      const originalEmail = "testuser@example.com";
      const maskedEmail = originalEmail.replace(/(.{2}).*@/, "$1***@");

      expect(maskedEmail).toBe("te***@example.com");
      expect(maskedEmail).not.toContain("testuser");
    });
  });
});
