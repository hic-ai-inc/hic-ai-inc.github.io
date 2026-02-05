/**
 * Scheduled Tasks Lambda Unit Tests
 *
 * Tests the scheduled-tasks Lambda handlers for:
 * - Trial reminder job (3 days before expiration)
 * - Win-back 30-day job
 * - Win-back 90-day job
 * - Email sending and deduplication
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
        "detail-type": "trial-reminder",
        source: "aws.events",
      };

      // Mock empty scan result
      dynamoSendImpl = async () => ({
        Items: [],
      });

      const result = await handler(event);

      expect(result.status).toBe("success");
      expect(result.taskType).toBe("trial-reminder");
    });
  });

  describe("trial-reminder Job", () => {
    test("sends reminder emails to trialing customers", async () => {
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

      dynamoSendImpl = async (cmd) => {
        if (cmd.constructor.name === "ScanCommand") {
          return {
            Items: [
              createMockCustomer({
                userId: "user-1",
                email: "trial1@example.com",
                subscriptionStatus: "trialing",
                currentPeriodEnd: threeDaysFromNow.toISOString(),
              }),
            ],
          };
        }
        return {};
      };

      const event = createEventBridgeEvent("trial-reminder");
      const result = await handler(event);

      expect(result.status).toBe("success");
      expect(result.sent).toBe(1);
      expect(sesCalls.length).toBe(1);
    });

    test("skips customers who already received reminder", async () => {
      dynamoSendImpl = async (cmd) => {
        if (cmd.constructor.name === "ScanCommand") {
          return {
            Items: [
              createMockCustomer({
                userId: "user-1",
                email: "trial1@example.com",
                subscriptionStatus: "trialing",
                emailsSent: { "trial-reminder": "2026-01-28T00:00:00Z" },
              }),
            ],
          };
        }
        return {};
      };

      const event = createEventBridgeEvent("trial-reminder");
      const result = await handler(event);

      expect(result.status).toBe("success");
      expect(result.skipped).toBe(1);
      expect(result.sent).toBe(0);
      expect(sesCalls.length).toBe(0);
    });

    test("handles no matching customers gracefully", async () => {
      dynamoSendImpl = async () => ({
        Items: [],
      });

      const event = createEventBridgeEvent("trial-reminder");
      const result = await handler(event);

      expect(result.status).toBe("success");
      expect(result.sent).toBe(0);
    });

    test("marks email as sent after successful send", async () => {
      let updateCalled = false;

      dynamoSendImpl = async (cmd) => {
        if (cmd.constructor.name === "ScanCommand") {
          return {
            Items: [
              createMockCustomer({
                userId: "user-1",
                email: "trial1@example.com",
                subscriptionStatus: "trialing",
              }),
            ],
          };
        }
        if (cmd.constructor.name === "UpdateCommand") {
          updateCalled = true;
        }
        return {};
      };

      const event = createEventBridgeEvent("trial-reminder");
      await handler(event);

      expect(updateCalled).toBe(true);
    });
  });

  describe("winback-30 Job", () => {
    test("sends win-back emails to 30-day canceled customers", async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      dynamoSendImpl = async (cmd) => {
        if (cmd.constructor.name === "ScanCommand") {
          return {
            Items: [
              createMockCustomer({
                userId: "user-1",
                email: "canceled1@example.com",
                subscriptionStatus: "canceled",
                canceledAt: thirtyDaysAgo.toISOString(),
              }),
            ],
          };
        }
        return {};
      };

      const event = createEventBridgeEvent("winback-30");
      const result = await handler(event);

      expect(result.status).toBe("success");
      expect(result.sent).toBe(1);
    });

    test("skips customers who already received winback-30", async () => {
      dynamoSendImpl = async (cmd) => {
        if (cmd.constructor.name === "ScanCommand") {
          return {
            Items: [
              createMockCustomer({
                userId: "user-1",
                subscriptionStatus: "canceled",
                emailsSent: { "winback-30": "2026-01-28T00:00:00Z" },
              }),
            ],
          };
        }
        return {};
      };

      const event = createEventBridgeEvent("winback-30");
      const result = await handler(event);

      expect(result.skipped).toBe(1);
      expect(result.sent).toBe(0);
    });
  });

  describe("winback-90 Job", () => {
    test("sends win-back emails to 90-day canceled customers", async () => {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      dynamoSendImpl = async (cmd) => {
        if (cmd.constructor.name === "ScanCommand") {
          return {
            Items: [
              createMockCustomer({
                userId: "user-1",
                email: "canceled1@example.com",
                subscriptionStatus: "canceled",
                canceledAt: ninetyDaysAgo.toISOString(),
              }),
            ],
          };
        }
        return {};
      };

      const event = createEventBridgeEvent("winback-90");
      const result = await handler(event);

      expect(result.status).toBe("success");
      expect(result.sent).toBe(1);
    });
  });

  describe("Email Sending", () => {
    test("handles SES errors gracefully", async () => {
      dynamoSendImpl = async (cmd) => {
        if (cmd.constructor.name === "ScanCommand") {
          return {
            Items: [
              createMockCustomer({
                userId: "user-1",
                email: "fail@example.com",
                subscriptionStatus: "trialing",
              }),
            ],
          };
        }
        return {};
      };

      sesSendImpl = async () => {
        throw new Error("SES rate limit exceeded");
      };

      const event = createEventBridgeEvent("trial-reminder");
      const result = await handler(event);

      expect(result.status).toBe("success");
      expect(result.failed).toBe(1);
      expect(result.sent).toBe(0);
    });

    test("sends correct email template for each job type", async () => {
      dynamoSendImpl = async (cmd) => {
        if (cmd.constructor.name === "ScanCommand") {
          return {
            Items: [
              createMockCustomer({
                userId: "user-1",
                email: "test@example.com",
                subscriptionStatus: "trialing",
              }),
            ],
          };
        }
        return {};
      };

      const event = createEventBridgeEvent("trial-reminder");
      await handler(event);

      const sesCall = sesCalls[0];
      const command = sesCall.arguments[0];

      // Should be SendEmailCommand with trial ending subject
      // Template uses: "Your Mouse trial ends in X days"
      expect(command.input.Message.Subject.Data.toLowerCase()).toContain("trial ends");
    });
  });

  describe("Error Handling", () => {
    test("throws error on DynamoDB scan failure", async () => {
      dynamoSendImpl = async () => {
        throw new Error("DynamoDB connection failed");
      };

      const event = createEventBridgeEvent("trial-reminder");

      await assert.rejects(
        async () => handler(event),
        { message: /DynamoDB connection failed/ },
      );
    });
  });

  describe("Multiple Customers", () => {
    test("processes multiple customers in batch", async () => {
      dynamoSendImpl = async (cmd) => {
        if (cmd.constructor.name === "ScanCommand") {
          return {
            Items: [
              createMockCustomer({
                userId: "user-1",
                email: "trial1@example.com",
                subscriptionStatus: "trialing",
              }),
              createMockCustomer({
                userId: "user-2",
                email: "trial2@example.com",
                subscriptionStatus: "trialing",
              }),
              createMockCustomer({
                userId: "user-3",
                email: "trial3@example.com",
                subscriptionStatus: "trialing",
              }),
            ],
          };
        }
        return {};
      };

      const event = createEventBridgeEvent("trial-reminder");
      const result = await handler(event);

      expect(result.sent).toBe(3);
      expect(sesCalls.length).toBe(3);
    });

    test("continues processing after individual email failure", async () => {
      let callCount = 0;
      dynamoSendImpl = async (cmd) => {
        if (cmd.constructor.name === "ScanCommand") {
          return {
            Items: [
              createMockCustomer({
                userId: "user-1",
                email: "email1@example.com",
                subscriptionStatus: "trialing",
              }),
              createMockCustomer({
                userId: "user-2",
                email: "email2@example.com",
                subscriptionStatus: "trialing",
              }),
              createMockCustomer({
                userId: "user-3",
                email: "email3@example.com",
                subscriptionStatus: "trialing",
              }),
            ],
          };
        }
        return {};
      };

      sesSendImpl = async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error("SES error");
        }
        return { MessageId: `msg-${callCount}` };
      };

      const event = createEventBridgeEvent("trial-reminder");
      const result = await handler(event);

      expect(result.sent).toBe(2);
      expect(result.failed).toBe(1);
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
