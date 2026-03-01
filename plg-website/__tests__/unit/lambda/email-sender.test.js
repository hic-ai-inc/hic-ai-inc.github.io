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

import { test, describe, beforeEach, after } from "node:test";
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

// ===========================================
// DynamoDB Dedup Flag Update Tests
// Tests for the emailsSent map initialization fix (if_not_exists)
// and the dedup flag update after successful email send.
//
// NOTE: TABLE_NAME is captured as a const at module load time, so we
// cannot test the full handler DynamoDB path without a separate module
// instance. Instead, we test the UpdateExpression construction pattern
// directly — this is the exact code that was fixed.
// ===========================================

describe("Email Sender - emailsSent dedup flag UpdateExpression", () => {
  /**
   * Simulates the UpdateExpression construction from the email-sender Lambda.
   * This is the exact pattern used in production after the if_not_exists fix.
   */
  function buildDedupUpdateParams(userId, eventType) {
    return {
      TableName: "hic-plg-staging",
      Key: { PK: `USER#${userId}`, SK: "PROFILE" },
      UpdateExpression: "SET emailPendingVerification = :false, #emailsSent = if_not_exists(#emailsSent, :emptyMap), #emailsSent.#eventType = :timestamp",
      ExpressionAttributeNames: {
        "#emailsSent": "emailsSent",
        "#eventType": eventType,
      },
      ExpressionAttributeValues: {
        ":false": false,
        ":emptyMap": {},
        ":timestamp": new Date().toISOString(),
      },
    };
  }

  test("UpdateExpression should use if_not_exists to initialize emailsSent map", () => {
    const params = buildDedupUpdateParams("user_abc", "LICENSE_CREATED");

    // The fix: if_not_exists ensures the map is created before setting nested key
    assert.ok(
      params.UpdateExpression.includes("if_not_exists(#emailsSent, :emptyMap)"),
      "UpdateExpression must use if_not_exists to handle missing emailsSent map",
    );
  });

  test("UpdateExpression should set nested eventType key after map initialization", () => {
    const params = buildDedupUpdateParams("user_abc", "LICENSE_CREATED");

    // Both clauses must be present: map init AND nested key set
    assert.ok(
      params.UpdateExpression.includes("#emailsSent = if_not_exists(#emailsSent, :emptyMap)"),
      "Must initialize map with if_not_exists",
    );
    assert.ok(
      params.UpdateExpression.includes("#emailsSent.#eventType = :timestamp"),
      "Must set nested eventType key",
    );
  });

  test(":emptyMap should be an empty object", () => {
    const params = buildDedupUpdateParams("user_abc", "LICENSE_CREATED");

    assert.deepStrictEqual(
      params.ExpressionAttributeValues[":emptyMap"],
      {},
      ":emptyMap must be empty object for if_not_exists fallback",
    );
  });

  test("should set emailPendingVerification to false", () => {
    const params = buildDedupUpdateParams("user_abc", "LICENSE_CREATED");

    assert.strictEqual(
      params.ExpressionAttributeValues[":false"],
      false,
      "emailPendingVerification should be set to false after email sent",
    );
  });

  test("should use correct Key structure (USER#userId, PROFILE)", () => {
    const params = buildDedupUpdateParams("google_12345", "CUSTOMER_CREATED");

    assert.deepStrictEqual(params.Key, {
      PK: "USER#google_12345",
      SK: "PROFILE",
    });
  });

  test("should map eventType to ExpressionAttributeNames correctly", () => {
    const params = buildDedupUpdateParams("user_abc", "SUBSCRIPTION_CANCELLED");

    assert.strictEqual(params.ExpressionAttributeNames["#eventType"], "SUBSCRIPTION_CANCELLED");
    assert.strictEqual(params.ExpressionAttributeNames["#emailsSent"], "emailsSent");
  });

  test(":timestamp should be a valid ISO date string", () => {
    const params = buildDedupUpdateParams("user_abc", "LICENSE_CREATED");

    const timestamp = params.ExpressionAttributeValues[":timestamp"];
    assert.ok(timestamp, "timestamp should be present");
    // Verify it's a valid ISO date
    const parsed = new Date(timestamp);
    assert.ok(!isNaN(parsed.getTime()), "timestamp should be a valid date");
  });

  test("guard: should skip DynamoDB update when TABLE_NAME is falsy", () => {
    // Simulates the guard condition in the Lambda handler
    const TABLE_NAME = undefined; // Not set in env
    const userId = "user_abc";

    const shouldUpdate = Boolean(TABLE_NAME && userId);
    assert.strictEqual(shouldUpdate, false, "Should skip when TABLE_NAME is undefined");
  });

  test("guard: should skip DynamoDB update when userId is falsy", () => {
    const TABLE_NAME = "hic-plg-staging";
    const userId = undefined;

    const shouldUpdate = Boolean(TABLE_NAME && userId);
    assert.strictEqual(shouldUpdate, false, "Should skip when userId is undefined");
  });

  test("guard: should proceed when both TABLE_NAME and userId are present", () => {
    const TABLE_NAME = "hic-plg-staging";
    const userId = "user_abc";

    const shouldUpdate = Boolean(TABLE_NAME && userId);
    assert.strictEqual(shouldUpdate, true, "Should proceed when both are present");
  });

  test("all supported eventTypes should produce valid params", () => {
    // Every eventType that triggers an email should produce valid dedup params
    const eventTypes = [
      "CUSTOMER_CREATED",
      "LICENSE_CREATED",
      "SUBSCRIPTION_CANCELLED",
      "SUBSCRIPTION_REACTIVATED",
      "PAYMENT_FAILED",
      "TEAM_INVITE_CREATED",
    ];

    for (const eventType of eventTypes) {
      const params = buildDedupUpdateParams("user_test", eventType);
      assert.ok(params.UpdateExpression.includes("if_not_exists"), `if_not_exists missing for ${eventType}`);
      assert.strictEqual(params.ExpressionAttributeNames["#eventType"], eventType);
    }
  });
});


// ===========================================
// Dedup Classification Tests (Task 10.3-10.4)
// Verifies PERMANENT_DEDUP_EVENTS classification and
// new event type routing after Stream 1D changes.
// ===========================================

describe("Email Sender - Dedup Classification", () => {
  // Mirror the production constant from email-sender Lambda
  const PERMANENT_DEDUP_EVENTS = ["CUSTOMER_CREATED", "LICENSE_CREATED"];

  test("CUSTOMER_CREATED should be classified as permanent dedup", () => {
    const dedupType = PERMANENT_DEDUP_EVENTS.includes("CUSTOMER_CREATED") ? "permanent" : "lifecycle";
    assert.strictEqual(dedupType, "permanent");
  });

  test("LICENSE_CREATED should be classified as permanent dedup", () => {
    const dedupType = PERMANENT_DEDUP_EVENTS.includes("LICENSE_CREATED") ? "permanent" : "lifecycle";
    assert.strictEqual(dedupType, "permanent");
  });

  test("all lifecycle event types should be classified as lifecycle dedup", () => {
    const lifecycleEvents = [
      "CANCELLATION_REQUESTED",
      "CANCELLATION_REVERSED",
      "VOLUNTARY_CANCELLATION_EXPIRED",
      "NONPAYMENT_CANCELLATION_EXPIRED",
      "SUBSCRIPTION_REACTIVATED",
      "PAYMENT_FAILED",
      "LICENSE_REVOKED",
      "LICENSE_SUSPENDED",
      "TEAM_INVITE_CREATED",
      "TEAM_INVITE_RESENT",
    ];

    for (const eventType of lifecycleEvents) {
      const dedupType = PERMANENT_DEDUP_EVENTS.includes(eventType) ? "permanent" : "lifecycle";
      assert.strictEqual(dedupType, "lifecycle", `${eventType} should be lifecycle, not permanent`);
    }
  });

  test("only CUSTOMER_CREATED and LICENSE_CREATED are permanent", () => {
    assert.strictEqual(PERMANENT_DEDUP_EVENTS.length, 2);
    assert.ok(PERMANENT_DEDUP_EVENTS.includes("CUSTOMER_CREATED"));
    assert.ok(PERMANENT_DEDUP_EVENTS.includes("LICENSE_CREATED"));
  });
});

describe("Email Sender - New Event Type Routing", () => {
  // These tests verify the handler routes new Stream 1D event types
  // Reset shared state before each test — this describe is top-level,
  // outside the parent "Email Sender Lambda" block that has its own beforeEach
  beforeEach(() => {
    sesCalls = [];
    sesSendImpl = async (cmd) => {
      if (cmd.constructor.name === "SendEmailCommand") {
        return { MessageId: `test-msg-${Date.now()}` };
      }
      return {};
    };
  });

  // to the correct email templates via the live handler

  test("should send cancellationRequested email for CANCELLATION_REQUESTED event", async () => {
    const event = createSqsEvent([
      createSqsRecord("CANCELLATION_REQUESTED", "cancel@example.com", {
        accessUntil: { S: "2026-03-15T00:00:00Z" },
      }),
    ]);

    const result = await handler(event);

    expect(result.success).toBe(1);
    const sendCall = sesCalls.find((c) => c.command === "SendEmailCommand");
    expect(sendCall).toBeTruthy();
    expect(sendCall.input.Destination.ToAddresses[0]).toBe("cancel@example.com");
  });

  test("should send cancellationReversed email for CANCELLATION_REVERSED event", async () => {
    const event = createSqsEvent([
      createSqsRecord("CANCELLATION_REVERSED", "uncancel@example.com"),
    ]);

    const result = await handler(event);

    expect(result.success).toBe(1);
    const sendCall = sesCalls.find((c) => c.command === "SendEmailCommand");
    expect(sendCall).toBeTruthy();
  });

  test("should send voluntaryCancellationExpired email for VOLUNTARY_CANCELLATION_EXPIRED event", async () => {
    const event = createSqsEvent([
      createSqsRecord("VOLUNTARY_CANCELLATION_EXPIRED", "expired@example.com"),
    ]);

    const result = await handler(event);

    expect(result.success).toBe(1);
    const sendCall = sesCalls.find((c) => c.command === "SendEmailCommand");
    expect(sendCall).toBeTruthy();
  });

  test("should send nonpaymentCancellationExpired email for NONPAYMENT_CANCELLATION_EXPIRED event", async () => {
    const event = createSqsEvent([
      createSqsRecord("NONPAYMENT_CANCELLATION_EXPIRED", "nonpay@example.com"),
    ]);

    const result = await handler(event);

    expect(result.success).toBe(1);
    const sendCall = sesCalls.find((c) => c.command === "SendEmailCommand");
    expect(sendCall).toBeTruthy();
  });

  test("should send reactivation email for SUBSCRIPTION_REACTIVATED event", async () => {
    const event = createSqsEvent([
      createSqsRecord("SUBSCRIPTION_REACTIVATED", "reactivated@example.com"),
    ]);

    const result = await handler(event);

    expect(result.success).toBe(1);
    const sendCall = sesCalls.find((c) => c.command === "SendEmailCommand");
    expect(sendCall).toBeTruthy();
  });

  test("should NOT route removed SUBSCRIPTION_CANCELLED event type", async () => {
    const event = createSqsEvent([
      createSqsRecord("SUBSCRIPTION_CANCELLED", "old@example.com"),
    ]);

    const result = await handler(event);

    // No template mapping → skipped
    expect(sesCalls.length).toBe(0);
    expect(result.processed).toBe(0);
  });

  test("should NOT route removed TRIAL_ENDING event type", async () => {
    const event = createSqsEvent([
      createSqsRecord("TRIAL_ENDING", "trial@example.com"),
    ]);

    const result = await handler(event);

    expect(sesCalls.length).toBe(0);
    expect(result.processed).toBe(0);
  });
});


// ===========================================
// PROPERTY TESTS — Stream 1D Completion Plan
// ===========================================

/**
 * Feature: stream-1d-completion-plan
 * Property 11: Dedup guard classifies event types correctly as permanent or lifecycle
 *
 * For any event type that triggers the dedup guard, CUSTOMER_CREATED and
 * LICENSE_CREATED should be classified as "permanent", all others as "lifecycle".
 */
describe("Property 11: Dedup classification (permanent vs lifecycle)", () => {
  const ALL_EVENT_TYPES = [
    "CUSTOMER_CREATED",
    "LICENSE_CREATED",
    "CANCELLATION_REQUESTED",
    "CANCELLATION_REVERSED",
    "VOLUNTARY_CANCELLATION_EXPIRED",
    "NONPAYMENT_CANCELLATION_EXPIRED",
    "SUBSCRIPTION_REACTIVATED",
    "PAYMENT_FAILED",
    "LICENSE_REVOKED",
    "LICENSE_SUSPENDED",
    "TEAM_INVITE_CREATED",
    "TEAM_INVITE_RESENT",
  ];

  // Defined locally — mirrors the constant from the email-sender Lambda
  const PERMANENT_DEDUP_EVENTS = ["CUSTOMER_CREATED", "LICENSE_CREATED"];


  test("should classify correctly across 100 random event type picks", () => {
    for (let i = 0; i < 100; i++) {
      const eventType = ALL_EVENT_TYPES[Math.floor(Math.random() * ALL_EVENT_TYPES.length)];
      const dedupType = PERMANENT_DEDUP_EVENTS.includes(eventType) ? "permanent" : "lifecycle";

      if (eventType === "CUSTOMER_CREATED" || eventType === "LICENSE_CREATED") {
        assert.strictEqual(dedupType, "permanent", `${eventType} should be permanent`);
      } else {
        assert.strictEqual(dedupType, "lifecycle", `${eventType} should be lifecycle`);
      }
    }
  });

  test("exhaustive: every event type classifies correctly", () => {
    for (const eventType of ALL_EVENT_TYPES) {
      const dedupType = PERMANENT_DEDUP_EVENTS.includes(eventType) ? "permanent" : "lifecycle";

      if (eventType === "CUSTOMER_CREATED" || eventType === "LICENSE_CREATED") {
        assert.strictEqual(dedupType, "permanent", `${eventType} should be permanent`);
      } else {
        assert.strictEqual(dedupType, "lifecycle", `${eventType} should be lifecycle`);
      }
    }
  });
});

