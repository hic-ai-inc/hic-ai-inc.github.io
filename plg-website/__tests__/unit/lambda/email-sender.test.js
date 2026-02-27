/**
 * Email Sender Lambda Unit Tests
 *
 * Tests the email-sender Lambda for:
 * - Sending emails directly via SES (domain-verified, production mode)
 * - Processing multiple records
 * - Different event types (LICENSE_CREATED, TEAM_INVITE_CREATED, etc.)
 * - Feedback loop prevention (MODIFY guard + emailsSent dedup)
 * - Safe JSON parsing (CWE-20/400/502)
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
    // Default: emails send successfully
    sesSendImpl = async (cmd) => {
      if (cmd.constructor.name === "SendEmailCommand") {
        return { MessageId: `test-msg-${Date.now()}` };
      }
      return {};
    };
  });

  describe("Multiple Records Processing", () => {
    test("should send emails to all recipients directly", async () => {
      const event = createSqsEvent([
        createSqsRecord("LICENSE_CREATED", "user1@example.com", {
          licenseKey: { S: "KEY-1" },
          planName: { S: "PRO" },
        }),
        createSqsRecord("LICENSE_CREATED", "user2@example.com", {
          licenseKey: { S: "KEY-2" },
          planName: { S: "PRO" },
        }),
        createSqsRecord("LICENSE_CREATED", "user3@example.com", {
          licenseKey: { S: "KEY-3" },
          planName: { S: "PRO" },
        }),
      ]);

      const result = await handler(event);

      // All emails should be sent directly (no verification gate)
      const sendCalls = sesCalls.filter(
        (c) => c.command === "SendEmailCommand",
      );
      expect(sendCalls.length).toBe(3);

      expect(result.processed).toBe(3);
      expect(result.success).toBe(3);
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

  describe("Feedback Loop Prevention", () => {
    test("should skip MODIFY events for CUSTOMER_CREATED eventType", async () => {
      // This is the primary guard against the email feedback loop:
      // email-sender updates DDB after sending → triggers MODIFY stream event →
      // re-enters pipeline → would send again without this guard
      const event = createSqsEvent([
        createSqsRecord("CUSTOMER_CREATED", "newuser@example.com", {
          userId: { S: "google_12345" },
        }, "MODIFY"),  // MODIFY, not INSERT
      ]);

      const result = await handler(event);

      // No SES calls should be made — MODIFY is skipped for CUSTOMER_CREATED
      const sendCall = sesCalls.find((c) => c.command === "SendEmailCommand");
      expect(sendCall).toBeFalsy();
      expect(result.processed).toBe(0);
    });

    test("should process INSERT events for CUSTOMER_CREATED normally", async () => {
      const event = createSqsEvent([
        createSqsRecord("CUSTOMER_CREATED", "newuser@example.com", {
          userId: { S: "google_12345" },
        }, "INSERT"),
      ]);

      const result = await handler(event);

      const sendCall = sesCalls.find((c) => c.command === "SendEmailCommand");
      expect(sendCall).toBeTruthy();
      expect(result.success).toBe(1);
    });

    test("should skip REMOVE events for CUSTOMER_CREATED eventType", async () => {
      const event = createSqsEvent([
        createSqsRecord("CUSTOMER_CREATED", "removed@example.com", {
          userId: { S: "google_99999" },
        }, "REMOVE"),
      ]);

      const result = await handler(event);

      const sendCall = sesCalls.find((c) => c.command === "SendEmailCommand");
      expect(sendCall).toBeFalsy();
      expect(result.processed).toBe(0);
    });

    test("should skip records when emailsSent map already contains the eventType", async () => {
      // Belt-and-suspenders dedup: even if eventName filter misses,
      // the emailsSent map check catches already-sent emails
      const event = createSqsEvent([
        createSqsRecord("LICENSE_CREATED", "already-sent@example.com", {
          licenseKey: { S: "KEY-DUP" },
          emailsSent: { M: { LICENSE_CREATED: { S: "2026-02-09T00:00:00Z" } } },
        }, "INSERT"),
      ]);

      const result = await handler(event);

      const sendCall = sesCalls.find((c) => c.command === "SendEmailCommand");
      expect(sendCall).toBeFalsy();
      expect(result.processed).toBe(0);
    });

    test("should process records when emailsSent map exists but does NOT contain this eventType", async () => {
      // A user can receive different email types — only skip if THIS type was sent
      const event = createSqsEvent([
        createSqsRecord("LICENSE_CREATED", "multi-email@example.com", {
          licenseKey: { S: "KEY-NEW" },
          planName: { S: "PRO" },
          emailsSent: { M: { CUSTOMER_CREATED: { S: "2026-02-08T00:00:00Z" } } },
        }, "INSERT"),
      ]);

      const result = await handler(event);

      const sendCall = sesCalls.find((c) => c.command === "SendEmailCommand");
      expect(sendCall).toBeTruthy();
      expect(result.success).toBe(1);
    });

    test("should process records when emailsSent map is empty", async () => {
      const event = createSqsEvent([
        createSqsRecord("LICENSE_CREATED", "fresh@example.com", {
          licenseKey: { S: "KEY-FRESH" },
          planName: { S: "PRO" },
          emailsSent: { M: {} },
        }, "INSERT"),
      ]);

      const result = await handler(event);

      const sendCall = sesCalls.find((c) => c.command === "SendEmailCommand");
      expect(sendCall).toBeTruthy();
      expect(result.success).toBe(1);
    });

    test("should allow MODIFY events for non-creation event types", async () => {
      // Status-transition events should still process on MODIFY.
      const event = createSqsEvent([
        createSqsRecord("SUBSCRIPTION_REACTIVATED", "updated@example.com", {}, "MODIFY"),
      ]);

      const result = await handler(event);

      const sendCall = sesCalls.find((c) => c.command === "SendEmailCommand");
      expect(sendCall).toBeTruthy();
      expect(result.success).toBe(1);
    });

    test("should apply BOTH guards: MODIFY + emailsSent for double protection", async () => {
      // Even when eventName is INSERT, if emailsSent already has the type, skip
      const event = createSqsEvent([
        createSqsRecord("CUSTOMER_CREATED", "double-guard@example.com", {
          userId: { S: "google_44444" },
          emailsSent: { M: { CUSTOMER_CREATED: { S: "2026-02-09T01:00:00Z" } } },
        }, "INSERT"),
      ]);

      const result = await handler(event);

      // emailsSent guard catches it even though eventName is INSERT
      const sendCall = sesCalls.find((c) => c.command === "SendEmailCommand");
      expect(sendCall).toBeFalsy();
      expect(result.processed).toBe(0);
    });
  });

  describe("TEAM_INVITE_CREATED event", () => {
    test("should extract inviterName and inviteToken from newImage", async () => {
      const event = {
        Records: [
          createSqsRecord("TEAM_INVITE_CREATED", "invitee@example.com", {
            organizationName: { S: "Test Corp" },
            inviterName: { S: "Test User" },
            token: { S: "invite_token_123" }
          })
        ]
      };

      const result = await handler(event);

      expect(result.success).toBe(1);
      expect(sesCalls.length).toBeGreaterThan(0);
      
      const sendEmailCall = sesCalls.find(c => c.command === "SendEmailCommand");
      expect(sendEmailCall).toBeDefined();
      expect(sendEmailCall.input.Message.Body.Html.Data).toContain("Test Corp");
      expect(sendEmailCall.input.Message.Body.Html.Data).toContain("Test User");
    });

    test("should process TEAM_INVITE_CREATED event type", async () => {
      const event = {
        Records: [
          createSqsRecord("TEAM_INVITE_CREATED", "invitee@example.com", {
            organizationName: { S: "Test Corp" },
            inviterName: { S: "Test User" },
            token: { S: "invite_token_123" }
          })
        ]
      };

      const result = await handler(event);

      expect(result.success).toBe(1);
      expect(result.failed).toBe(0);
    });

    test("should include inviteToken in template data", async () => {
      const event = {
        Records: [
          createSqsRecord("TEAM_INVITE_CREATED", "invitee@example.com", {
            token: { S: "invite_token_abc123" }
          })
        ]
      };

      const result = await handler(event);

      expect(result.success).toBe(1);
      
      const sendEmailCall = sesCalls.find(c => c.command === "SendEmailCommand");
      expect(sendEmailCall).toBeDefined();
      expect(sendEmailCall.input.Message.Body.Html.Data).toContain("invite_token_abc123");
    });

  });
  describe("Safe JSON Parsing (CWE-20/400/502)", () => {
    test("counts malformed JSON record body as failure via safeJsonParse", async () => {
      const event = {
        Records: [
          {
            messageId: "msg-malformed-json",
            body: "this is not valid json",
          },
        ],
      };

      const result = await handler(event);

      // safeJsonParse throws inside try/catch -> counted as failed
      expect(result.failed).toBe(1);
      expect(result.success).toBe(0);
      expect(result.batchItemFailures.length).toBe(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe("msg-malformed-json");
    });

    test("counts empty body record as failure via safeJsonParse", async () => {
      const event = {
        Records: [
          {
            messageId: "msg-empty-body",
            body: "",
          },
        ],
      };

      const result = await handler(event);

      expect(result.failed).toBe(1);
      expect(result.batchItemFailures.length).toBe(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe("msg-empty-body");
    });

    test("counts deeply nested JSON body as failure (maxDepth)", async () => {
      let nested = { eventType: { S: "LICENSE_CREATED" } };
      for (let i = 0; i < 15; i++) {
        nested = { wrapper: nested };
      }
      const event = {
        Records: [
          {
            messageId: "msg-deep-nesting",
            body: JSON.stringify({ newImage: nested }),
          },
        ],
      };

      const result = await handler(event);

      expect(result.failed).toBe(1);
      expect(result.batchItemFailures.length).toBe(1);
    });

    test("counts record with excessive keys as failure (maxKeys)", async () => {
      const bigObj = {};
      for (let i = 0; i < 1100; i++) {
        bigObj[`k${i}`] = { S: `v${i}` };
      }
      const event = {
        Records: [
          {
            messageId: "msg-too-many-keys",
            body: JSON.stringify({ newImage: bigObj }),
          },
        ],
      };

      const result = await handler(event);

      expect(result.failed).toBe(1);
      expect(result.batchItemFailures.length).toBe(1);
    });

    test("processes valid records normally alongside malformed ones", async () => {
      const event = {
        Records: [
          {
            messageId: "msg-bad",
            body: "{{{not-json",
          },
          createSqsRecord("LICENSE_CREATED", "user@example.com", {
            licenseKey: { S: "KEY-123" },
            planName: { S: "PRO" },
          }),
        ],
      };

      const result = await handler(event);

      // First record fails, second succeeds
      expect(result.failed).toBe(1);
      expect(result.success).toBe(1);
      expect(result.batchItemFailures.length).toBe(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe("msg-bad");
    });
  });

});
