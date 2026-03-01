/**
 * Scheduled Tasks Lambda Unit Tests
 *
 * Tests the scheduled-tasks Lambda handlers for:
 * - Pending email retry (direct send, no verification gate)
 * - Mouse version notify job
 * - Email sending and deduplication
 * - Handler routing and unknown task types
 *
 * @see scheduled-tasks Lambda
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import { expect } from "../../lib/test-kit.js";

// Mutable implementations for mock functions
let dynamoSendImpl = async () => ({});
let sesSendImpl = async () => ({ MessageId: "ses-msg-123" });

// Track calls manually
let dynamoCalls = [];
let sesCalls = [];

// Mock clients with swappable implementations
const mockDynamoClient = {
  send: async (cmd) => {
    dynamoCalls.push({ arguments: [cmd] });
    return dynamoSendImpl(cmd);
  },
};

const mockSesClient = {
  send: async (cmd) => {
    sesCalls.push({ arguments: [cmd] });
    return sesSendImpl(cmd);
  },
};

// Import the Lambda handler after setting up mocks
let handler, __setDynamoClientForTests, __setSesClientForTests;

async function setupModule() {
  const lambdaModule =
    await import("../../../infrastructure/lambda/scheduled-tasks/index.js");
  handler = lambdaModule.handler;
  __setDynamoClientForTests = lambdaModule.__setDynamoClientForTests;
  __setSesClientForTests = lambdaModule.__setSesClientForTests;

  // Inject mock clients
  __setDynamoClientForTests(mockDynamoClient);
  __setSesClientForTests(mockSesClient);
}

// Helper to create EventBridge event
function createEventBridgeEvent(taskType) {
  return {
    taskType,
    "detail-type": taskType,
    source: "aws.events",
    time: new Date().toISOString(),
    detail: {},
  };
}

// Helper to create mock customer
function createMockCustomer(overrides = {}) {
  return {
    userId: "user-123",
    email: "test@example.com",
    subscriptionStatus: "active",
    currentPeriodEnd: new Date(
      Date.now() + 3 * 24 * 60 * 60 * 1000,
    ).toISOString(),
    ...overrides,
  };
}

describe("Scheduled Tasks Lambda", () => {
  beforeEach(async () => {
    // Reset call tracking
    dynamoCalls = [];
    sesCalls = [];

    // Reset to default implementations
    dynamoSendImpl = async () => ({});
    sesSendImpl = async () => ({ MessageId: "ses-msg-123" });

    // Set up module
    await setupModule();
  });

  describe("Handler Basic Functionality", () => {
    test("skips unknown task types", async () => {
      const event = createEventBridgeEvent("unknown-task");

      const result = await handler(event);

      expect(result.status).toBe("skipped");
      expect(result.taskType).toBe("unknown-task");
    });

    test("extracts taskType from detail-type if taskType missing", async () => {
      const event = {
        "detail-type": "pending-email-retry",
        source: "aws.events",
      };

      // Mock empty scan result
      dynamoSendImpl = async () => ({
        Items: [],
      });

      const result = await handler(event);

      expect(result.status).toBe("success");
      expect(result.taskType).toBe("pending-email-retry");
    });
  });

  describe("pending-email-retry Job", () => {
    test("should send email directly for pending users", async () => {
      let updateCalled = false;

      dynamoSendImpl = async (cmd) => {
        if (cmd.constructor.name === "ScanCommand") {
          return {
            Items: [
              {
                PK: "USER#google_12345",
                SK: "PROFILE",
                userId: "google_12345",
                email: "newuser@example.com",
                eventType: "CUSTOMER_CREATED",
                emailPendingVerification: true,
                emailsSent: {},
              },
            ],
          };
        }
        if (cmd.constructor.name === "UpdateCommand") {
          updateCalled = true;
        }
        return {};
      };

      const event = createEventBridgeEvent("pending-email-retry");
      const result = await handler(event);

      expect(result.sent).toBe(1);
      expect(result.failed).toBe(0);
      expect(updateCalled).toBe(true);

      // Should have sent email directly (no verification check)
      const sendCalls = sesCalls.filter(c =>
        c.arguments[0]?.constructor?.name === "SendEmailCommand"
      );
      expect(sendCalls.length).toBe(1);
    });

    test("should skip users who already had their email sent (wasEmailSent guard)", async () => {
      // This test verifies the new dedup guard added to handlePendingEmailRetry:
      // if emailsSent[eventType] already exists, skip sending and just clear the flag
      let updateKeys = [];

      dynamoSendImpl = async (cmd) => {
        if (cmd.constructor.name === "ScanCommand") {
          return {
            Items: [
              {
                PK: "USER#google_already",
                SK: "PROFILE",
                userId: "google_already",
                email: "already-sent@example.com",
                eventType: "CUSTOMER_CREATED",
                emailPendingVerification: true,
                emailsSent: { CUSTOMER_CREATED: "2026-02-09T01:00:00Z" },
              },
            ],
          };
        }
        if (cmd.constructor.name === "UpdateCommand") {
          updateKeys.push(cmd.input?.Key);
        }
        return {};
      };

      const event = createEventBridgeEvent("pending-email-retry");
      const result = await handler(event);

      // Should count as "sent" (flag cleared) but no actual SES email send
      expect(result.sent).toBe(1);

      // Should have called UpdateCommand to clear the pending flag
      expect(updateKeys.length).toBe(1);
      expect(updateKeys[0].PK).toBe("USER#google_already");

      // No SES SendEmailCommand should have been called
      const sendEmailCalls = sesCalls.filter(c =>
        c.arguments[0]?.constructor?.name === "SendEmailCommand"
      );
      expect(sendEmailCalls.length).toBe(0);
    });

    test("should handle mix of already-sent and fresh pending users", async () => {
      let updateCount = 0;
      let sesEmailCount = 0;

      dynamoSendImpl = async (cmd) => {
        if (cmd.constructor.name === "ScanCommand") {
          return {
            Items: [
              // User 1: already sent (dedup guard should catch)
              {
                PK: "USER#user_dup",
                SK: "PROFILE",
                userId: "user_dup",
                email: "dup@example.com",
                eventType: "CUSTOMER_CREATED",
                emailPendingVerification: true,
                emailsSent: { CUSTOMER_CREATED: "2026-02-08T12:00:00Z" },
              },
              // User 2: fresh, needs to be sent
              {
                PK: "USER#user_fresh",
                SK: "PROFILE",
                userId: "user_fresh",
                email: "fresh@example.com",
                eventType: "CUSTOMER_CREATED",
                emailPendingVerification: true,
                emailsSent: {},
              },
            ],
          };
        }
        if (cmd.constructor.name === "UpdateCommand") {
          updateCount++;
        }
        return {};
      };

      sesSendImpl = async (cmd) => {
        if (cmd.constructor.name === "SendEmailCommand") {
          sesEmailCount++;
          return { MessageId: `msg-${sesEmailCount}` };
        }
        return {};
      };

      const event = createEventBridgeEvent("pending-email-retry");
      const result = await handler(event);

      // Both should count as "sent" (one via dedup guard, one via actual send)
      expect(result.sent).toBe(2);

      // Only 1 actual SES email should be sent (for fresh user)
      expect(sesEmailCount).toBe(1);

      // Both should have UpdateCommand calls (dedup clears flag, fresh updates emailsSent)
      expect(updateCount).toBe(2);
    });

    test("should return zeros when no pending users found", async () => {
      dynamoSendImpl = async (cmd) => {
        if (cmd.constructor.name === "ScanCommand") {
          return { Items: [] };
        }
        return {};
      };

      const event = createEventBridgeEvent("pending-email-retry");
      const result = await handler(event);

      expect(result.sent).toBe(0);
      expect(result.failed).toBe(0);
    });
  });

  describe("mouse-version-notify Job", () => {
    test("updates readyVersion from latestVersion", async () => {
      let sawUpdate = false;

      dynamoSendImpl = async (cmd) => {
        if (cmd.constructor.name === "QueryCommand") {
          return {
            Items: [
              {
                PK: "VERSION#mouse",
                SK: "CURRENT",
                latestVersion: "1.2.3",
                releaseNotesUrl: "https://example.com/release-notes",
              },
            ],
          };
        }
        if (cmd.constructor.name === "UpdateCommand") {
          sawUpdate = true;
        }
        return {};
      };

      const event = createEventBridgeEvent("mouse-version-notify");
      const result = await handler(event);

      expect(result.status).toBe("success");
      expect(result.updated).toBe(true);
      expect(result.readyVersion).toBe("1.2.3");
      expect(sawUpdate).toBe(true);
    });


  // ===========================================
  // Win-back Deactivation Verification (Task 8.9/8.12)
  // Verifies that win-back handlers are NOT wired up in TASK_HANDLERS
  // and that the handler correctly skips them.
  // ===========================================

  describe("Win-back Deactivation", () => {
    test("winback-30 should be treated as unknown task (not wired up)", async () => {
      const event = createEventBridgeEvent("winback-30");
      const result = await handler(event);

      expect(result.status).toBe("skipped");
      expect(result.taskType).toBe("winback-30");
    });

    test("winback-90 should be treated as unknown task (not wired up)", async () => {
      const event = createEventBridgeEvent("winback-90");
      const result = await handler(event);

      expect(result.status).toBe("skipped");
      expect(result.taskType).toBe("winback-90");
    });

    test("trial-reminder should be treated as unknown task (removed)", async () => {
      const event = createEventBridgeEvent("trial-reminder");
      const result = await handler(event);

      expect(result.status).toBe("skipped");
      expect(result.taskType).toBe("trial-reminder");
    });
  });

    test("skips when latestVersion is missing", async () => {
      dynamoSendImpl = async (cmd) => {
        if (cmd.constructor.name === "QueryCommand") {
          return { Items: [{}] };
        }
        if (cmd.constructor.name === "UpdateCommand") {
          assert.fail("UpdateCommand should not be called");
        }
        return {};
      };

      const event = createEventBridgeEvent("mouse-version-notify");
      const result = await handler(event);

      expect(result.status).toBe("success");
      expect(result.updated).toBe(false);
      expect(result.reason).toBe("missing-latestVersion");
    });
  });

});
