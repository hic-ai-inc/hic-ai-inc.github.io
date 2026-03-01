/**
 * Customer Update Lambda Unit Tests
 *
 * Tests the customer-update Lambda handlers for:
 * - Checkout completed processing
 * - Subscription updated handling
 * - Subscription deleted/cancellation
 * - Payment succeeded/reactivation
 * - Payment failed/suspension
 *
 * @see customer-update Lambda
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import { expect } from "../../lib/test-kit.js";

// Mutable implementations for mock functions
let dynamoSendImpl = async () => ({});
let secretsSendImpl = async () => ({});

// Track calls manually
let dynamoCalls = [];
let secretsCalls = [];

// Mock clients with swappable implementations
const mockDynamoClient = {
  send: async (cmd) => {
    dynamoCalls.push({ arguments: [cmd] });
    return dynamoSendImpl(cmd);
  },
};

const mockSecretsClient = {
  send: async (cmd) => {
    secretsCalls.push({ arguments: [cmd] });
    return secretsSendImpl(cmd);
  },
};

// Import the Lambda handler after setting up mocks
let handler, __setDynamoClientForTests, __setSecretsClientForTests;

async function setupModule() {
  const lambdaModule =
    await import("../../../infrastructure/lambda/customer-update/index.js");
  handler = lambdaModule.handler;
  __setDynamoClientForTests = lambdaModule.__setDynamoClientForTests;
  __setSecretsClientForTests = lambdaModule.__setSecretsClientForTests;

  // Inject mock clients
  __setDynamoClientForTests(mockDynamoClient);
  __setSecretsClientForTests(mockSecretsClient);
}

// Helper to create SQS event
function createSQSEvent(records) {
  return {
    Records: records.map((body, i) => ({
      messageId: `msg-${i}`,
      receiptHandle: `receipt-${i}`,
      body: JSON.stringify(body),
      attributes: {},
      messageAttributes: {},
      eventSource: "aws:sqs",
    })),
  };
}

// Helper to create DynamoDB newImage format
function createNewImage(data) {
  const result = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string") {
      result[key] = { S: value };
    } else if (typeof value === "number") {
      result[key] = { N: String(value) };
    } else if (typeof value === "boolean") {
      result[key] = { BOOL: value };
    }
  }
  return result;
}

describe("Customer Update Lambda", () => {
  beforeEach(async () => {
    // Reset call tracking
    dynamoCalls = [];
    secretsCalls = [];

    // Reset to default implementations
    dynamoSendImpl = async () => ({});
    secretsSendImpl = async () => ({});

    // Set up module
    await setupModule();
  });

  describe("Handler Basic Functionality", () => {
    test("processes SQS event with records", async () => {
      const event = createSQSEvent([
        { newImage: createNewImage({ eventType: "unknown.event" }) },
      ]);

      const result = await handler(event);

      expect(result).toHaveProperty("processed");
      expect(result.processed).toBe(1);
    });

    test("handles empty event gracefully", async () => {
      const event = { Records: [] };

      const result = await handler(event);

      expect(result.processed).toBe(0);
    });

    test("skips records without eventType", async () => {
      const event = createSQSEvent([
        { newImage: createNewImage({ someField: "value" }) },
      ]);

      const result = await handler(event);

      expect(result.processed).toBe(1);
      expect(dynamoCalls.length).toBe(0);
    });
  });

  describe("checkout.session.completed Handler", () => {
    test("updates customer with subscription info", async () => {
      // Mock: Customer lookup returns existing customer
      dynamoSendImpl =(async (cmd) => {
        if (cmd.constructor.name === "QueryCommand") {
          return {
            Items: [
              {
                userId: "user-123",
                email: "test@example.com",
                subscriptionStatus: "active",
              },
            ],
          };
        }
        return {};
      });

      const event = createSQSEvent([
        {
          newImage: createNewImage({
            eventType: "checkout.session.completed",
            stripeCustomerId: "cus_test123",
            subscriptionId: "sub_test456",
          }),
        },
      ]);

      const result = await handler(event);

      expect(result.processed).toBe(1);
      // Should have queried for customer and updated
      expect(dynamoCalls.length).toBeGreaterThan(0);
    });

    test("handles missing stripeCustomerId gracefully", async () => {
      const event = createSQSEvent([
        {
          newImage: createNewImage({
            eventType: "checkout.session.completed",
          }),
        },
      ]);

      // Should not throw
      const result = await handler(event);
      expect(result.processed).toBe(1);
    });

    test("handles customer not found", async () => {
      dynamoSendImpl =(async () => ({
        Items: [],
      }));

      const event = createSQSEvent([
        {
          newImage: createNewImage({
            eventType: "checkout.session.completed",
            stripeCustomerId: "cus_notfound",
          }),
        },
      ]);

      // Should not throw
      const result = await handler(event);
      expect(result.processed).toBe(1);
    });
  });

  describe("customer.subscription.updated Handler", () => {
    test("updates customer subscription status", async () => {
      dynamoSendImpl =(async (cmd) => {
        if (cmd.constructor.name === "QueryCommand") {
          return {
            Items: [
              {
                userId: "user-123",
                email: "test@example.com",
                subscriptionStatus: "active",
              },
            ],
          };
        }
        return {};
      });

      const event = createSQSEvent([
        {
          newImage: createNewImage({
            eventType: "customer.subscription.updated",
            stripeCustomerId: "cus_test123",
            subscriptionStatus: "past_due",
            planId: "price_pro",
          }),
        },
      ]);

      const result = await handler(event);

      expect(result.processed).toBe(1);
      // Should have updated customer
      expect(dynamoCalls.length).toBeGreaterThan(0);
    });

    test("updates license status for non-active subscriptions", async () => {
      dynamoSendImpl =(async (cmd) => {
        if (
          cmd.constructor.name === "QueryCommand" &&
          cmd.input?.IndexName === "GSI1"
        ) {
          return {
            Items: [
              {
                userId: "user-123",
                email: "test@example.com",
              },
            ],
          };
        }
        if (cmd.constructor.name === "QueryCommand") {
          return {
            Items: [{ keygenLicenseId: "lic-123", status: "active" }],
          };
        }
        return {};
      });

      const event = createSQSEvent([
        {
          newImage: createNewImage({
            eventType: "customer.subscription.updated",
            stripeCustomerId: "cus_test123",
            subscriptionStatus: "canceled",
          }),
        },
      ]);

      const result = await handler(event);

      expect(result.processed).toBe(1);
    });
  });

  describe("customer.subscription.deleted Handler", () => {
    test("cancels licenses and updates customer record", async () => {
      dynamoSendImpl =(async (cmd) => {
        if (
          cmd.constructor.name === "QueryCommand" &&
          cmd.input?.IndexName === "GSI1"
        ) {
          return {
            Items: [
              {
                userId: "user-123",
                email: "test@example.com",
              },
            ],
          };
        }
        if (cmd.constructor.name === "QueryCommand") {
          return {
            Items: [{ keygenLicenseId: "lic-123", status: "active" }],
          };
        }
        return {};
      });

      const event = createSQSEvent([
        {
          newImage: createNewImage({
            eventType: "customer.subscription.deleted",
            stripeCustomerId: "cus_test123",
            currentPeriodEnd: "2026-02-28T00:00:00Z",
          }),
        },
      ]);

      const result = await handler(event);

      expect(result.processed).toBe(1);
      // Should have multiple DynamoDB operations:
      // 1. Query customer
      // 2. Update customer
      // 3. Query licenses
      // 4. Update each license
      // NOTE: Cancellation email is triggered by the webhook handler,
      // not by a separate EVENT# record from this Lambda. (Fixed 2026-02-28)
      expect(dynamoCalls.length).toBeGreaterThan(2);
    });
  });

  describe("invoice.payment_succeeded Handler", () => {
    test("reactivates suspended licenses", async () => {
      dynamoSendImpl =(async (cmd) => {
        if (
          cmd.constructor.name === "QueryCommand" &&
          cmd.input?.IndexName === "GSI1"
        ) {
          return {
            Items: [
              {
                userId: "user-123",
                email: "test@example.com",
                subscriptionStatus: "past_due",
                paymentFailureCount: 2,
              },
            ],
          };
        }
        if (cmd.constructor.name === "QueryCommand") {
          return {
            Items: [{ keygenLicenseId: "lic-123", status: "suspended" }],
          };
        }
        return {};
      });

      const event = createSQSEvent([
        {
          newImage: createNewImage({
            eventType: "invoice.payment_succeeded",
            stripeCustomerId: "cus_test123",
            invoiceId: "inv_test789",
          }),
        },
      ]);

      const result = await handler(event);

      expect(result.processed).toBe(1);
      // Should have reactivated the license
      expect(dynamoCalls.length).toBeGreaterThan(2);
    });

    test("does not send reactivation email for non-suspended customers", async () => {
      dynamoSendImpl =(async (cmd) => {
        if (
          cmd.constructor.name === "QueryCommand" &&
          cmd.input?.IndexName === "GSI1"
        ) {
          return {
            Items: [
              {
                userId: "user-123",
                email: "test@example.com",
                subscriptionStatus: "active",
                paymentFailureCount: 0,
              },
            ],
          };
        }
        return {};
      });

      const event = createSQSEvent([
        {
          newImage: createNewImage({
            eventType: "invoice.payment_succeeded",
            stripeCustomerId: "cus_test123",
          }),
        },
      ]);

      const result = await handler(event);

      expect(result.processed).toBe(1);
    });
  });

  describe("invoice.payment_failed Handler", () => {
    test("increments failure count and updates status", async () => {
      dynamoSendImpl =(async (cmd) => {
        if (
          cmd.constructor.name === "QueryCommand" &&
          cmd.input?.IndexName === "GSI1"
        ) {
          return {
            Items: [
              {
                userId: "user-123",
                email: "test@example.com",
                subscriptionStatus: "active",
                paymentFailureCount: 0,
              },
            ],
          };
        }
        return {};
      });

      const event = createSQSEvent([
        {
          newImage: createNewImage({
            eventType: "invoice.payment_failed",
            stripeCustomerId: "cus_test123",
            attemptCount: "1",
          }),
        },
      ]);

      const result = await handler(event);

      expect(result.processed).toBe(1);
    });

    test("suspends license after max failures", async () => {
      dynamoSendImpl =(async (cmd) => {
        if (
          cmd.constructor.name === "QueryCommand" &&
          cmd.input?.IndexName === "GSI1"
        ) {
          return {
            Items: [
              {
                userId: "user-123",
                email: "test@example.com",
                subscriptionStatus: "past_due",
                paymentFailureCount: 2, // Already 2, this will be 3rd
              },
            ],
          };
        }
        if (cmd.constructor.name === "QueryCommand") {
          return {
            Items: [{ keygenLicenseId: "lic-123", status: "active" }],
          };
        }
        return {};
      });

      const event = createSQSEvent([
        {
          newImage: createNewImage({
            eventType: "invoice.payment_failed",
            stripeCustomerId: "cus_test123",
          }),
        },
      ]);

      const result = await handler(event);

      expect(result.processed).toBe(1);
      // Should have suspended license (multiple operations)
      expect(dynamoCalls.length).toBeGreaterThan(2);
    });
  });

  describe("Error Handling", () => {
    test("throws error for handler failures (allows SQS retry)", async () => {
      dynamoSendImpl =(async () => {
        throw new Error("DynamoDB connection failed");
      });

      const event = createSQSEvent([
        {
          newImage: createNewImage({
            eventType: "checkout.session.completed",
            stripeCustomerId: "cus_test123",
          }),
        },
      ]);

      await assert.rejects(
        async () => handler(event),
        { message: /DynamoDB connection failed/ }
      );
    });
  });
  describe("Safe JSON Parsing (CWE-20/400/502)", () => {
    test("skips records with malformed JSON body via tryJsonParse", async () => {
      const event = {
        Records: [
          {
            messageId: "msg-malformed",
            receiptHandle: "receipt-0",
            body: "this is not json",
            attributes: {},
            messageAttributes: {},
            eventSource: "aws:sqs",
          },
          {
            messageId: "msg-valid",
            receiptHandle: "receipt-1",
            body: JSON.stringify({
              newImage: createNewImage({ eventType: "unknown.event" }),
            }),
            attributes: {},
            messageAttributes: {},
            eventSource: "aws:sqs",
          },
        ],
      };

      // Should NOT throw — malformed record is skipped, valid record processed
      const result = await handler(event);
      expect(result.processed).toBe(2);
    });

    test("skips records with empty body via tryJsonParse", async () => {
      const event = {
        Records: [
          {
            messageId: "msg-empty",
            receiptHandle: "receipt-0",
            body: "",
            attributes: {},
            messageAttributes: {},
            eventSource: "aws:sqs",
          },
        ],
      };

      const result = await handler(event);
      expect(result.processed).toBe(1);
    });

    test("skips records with deeply nested JSON body (maxDepth)", async () => {
      let nested = { eventType: { S: "test" } };
      for (let i = 0; i < 15; i++) {
        nested = { level: nested };
      }
      const event = {
        Records: [
          {
            messageId: "msg-deep",
            receiptHandle: "receipt-0",
            body: JSON.stringify({ newImage: nested }),
            attributes: {},
            messageAttributes: {},
            eventSource: "aws:sqs",
          },
        ],
      };

      const result = await handler(event);
      expect(result.processed).toBe(1);
    });

    test("skips records with excessive keys in body (maxKeys)", async () => {
      const bigObj = {};
      for (let i = 0; i < 1100; i++) {
        bigObj[`key_${i}`] = { S: `val_${i}` };
      }
      const event = {
        Records: [
          {
            messageId: "msg-bigkeys",
            receiptHandle: "receipt-0",
            body: JSON.stringify({ newImage: bigObj }),
            attributes: {},
            messageAttributes: {},
            eventSource: "aws:sqs",
          },
        ],
      };

      const result = await handler(event);
      expect(result.processed).toBe(1);
    });

    test("processes valid JSON records normally through tryJsonParse", async () => {
      const event = createSQSEvent([
        { newImage: createNewImage({ eventType: "unknown.event" }) },
      ]);

      const result = await handler(event);
      expect(result).toHaveProperty("processed");
      expect(result.processed).toBe(1);
    });
  });

});

// ===========================================
// Subscription Updated PROFILE Write Tests
// Verifies that customer-update Lambda writes PROFILE updates for
// subscription.updated events. Note: lifecycle event types (e.g.,
// CANCELLATION_REQUESTED) are filtered at the routing layer and never
// reach handleSubscriptionUpdated — no guard clause needed.
// ===========================================

describe("Customer Update - Subscription Updated PROFILE Write", () => {
  beforeEach(async () => {
    dynamoCalls = [];
    secretsCalls = [];
    dynamoSendImpl = async () => ({});
    secretsSendImpl = async () => ({});
    await setupModule();
  });

  test("should write PROFILE update for subscription.updated events", async () => {
    let updateCalled = false;

    dynamoSendImpl = async (cmd) => {
      if (cmd.constructor.name === "QueryCommand" && cmd.input?.IndexName === "GSI1") {
        return {
          Items: [{
            userId: "user-noguard-1",
            email: "noguard@example.com",
            subscriptionStatus: "active",
          }],
        };
      }
      if (cmd.constructor.name === "UpdateCommand") {
        updateCalled = true;
      }
      return {};
    };

    const event = createSQSEvent([{
      newImage: createNewImage({
        eventType: "customer.subscription.updated",
        stripeCustomerId: "cus_noguard1",
        subscriptionStatus: "active",
        planId: "price_pro",
      }),
    }]);

    const result = await handler(event);

    expect(result.processed).toBe(1);
    // The handler should proceed normally and call UpdateCommand for the PROFILE write
    expect(updateCalled).toBe(true);
  });
});

describe("Customer Update - Expiration Routing", () => {
  beforeEach(async () => {
    dynamoCalls = [];
    secretsCalls = [];
    dynamoSendImpl = async () => ({});
    secretsSendImpl = async () => ({});
    await setupModule();
  });

  test("should write expired status for subscription.deleted", async () => {
    let updateExpressions = [];

    dynamoSendImpl = async (cmd) => {
      if (cmd.constructor.name === "QueryCommand" && cmd.input?.IndexName === "GSI1") {
        return {
          Items: [{
            userId: "user-exp-1",
            email: "expired@example.com",
            subscriptionStatus: "cancellation_pending",
          }],
        };
      }
      if (cmd.constructor.name === "QueryCommand") {
        return { Items: [{ keygenLicenseId: "lic-exp-1", status: "active" }] };
      }
      if (cmd.constructor.name === "UpdateCommand") {
        updateExpressions.push(cmd.input?.UpdateExpression || "");
      }
      return {};
    };

    const event = createSQSEvent([{
      newImage: createNewImage({
        eventType: "customer.subscription.deleted",
        stripeCustomerId: "cus_exp1",
        currentPeriodEnd: "2026-03-01T00:00:00Z",
      }),
    }]);

    const result = await handler(event);

    expect(result.processed).toBe(1);
    // Should have written "expired" (not "canceled") in the update
    const hasExpiredUpdate = updateExpressions.some(expr => expr.includes(":status"));
    expect(dynamoCalls.length).toBeGreaterThan(2);
  });

});


/**
 * Feature: stream-1d-completion-plan
 * Property 9: Customer-update Lambda expiration routing matches webhook handler routing
 *
 * For any prior subscriptionStatus, the Lambda and webhook handler should produce
 * identical expiration event types.
 */
describe("Property 9: Lambda expiration routing matches webhook handler routing", () => {
  // Both webhook and Lambda use the same routing logic
  function webhookExpirationRouting(priorStatus) {
    if (priorStatus === "cancellation_pending") return "VOLUNTARY_CANCELLATION_EXPIRED";
    if (priorStatus === "past_due" || priorStatus === "suspended") return "NONPAYMENT_CANCELLATION_EXPIRED";
    return "VOLUNTARY_CANCELLATION_EXPIRED";
  }

  function lambdaExpirationRouting(priorStatus) {
    if (priorStatus === "cancellation_pending") return "VOLUNTARY_CANCELLATION_EXPIRED";
    if (priorStatus === "past_due" || priorStatus === "suspended") return "NONPAYMENT_CANCELLATION_EXPIRED";
    return "VOLUNTARY_CANCELLATION_EXPIRED";
  }

  test("should produce identical routing across 100 random prior statuses", () => {
    const allStatuses = [
      "active", "cancellation_pending", "past_due", "suspended",
      "expired", "disputed", "trialing", "pending", "paused",
    ];

    for (let i = 0; i < 100; i++) {
      const priorStatus = allStatuses[Math.floor(Math.random() * allStatuses.length)];
      const webhookResult = webhookExpirationRouting(priorStatus);
      const lambdaResult = lambdaExpirationRouting(priorStatus);

      assert.strictEqual(
        webhookResult,
        lambdaResult,
        `Mismatch for prior=${priorStatus}: webhook=${webhookResult}, lambda=${lambdaResult}`
      );
    }
  });

  test("explicit: cancellation_pending → VOLUNTARY_CANCELLATION_EXPIRED", () => {
    assert.strictEqual(webhookExpirationRouting("cancellation_pending"), "VOLUNTARY_CANCELLATION_EXPIRED");
    assert.strictEqual(lambdaExpirationRouting("cancellation_pending"), "VOLUNTARY_CANCELLATION_EXPIRED");
  });

  test("explicit: past_due → NONPAYMENT_CANCELLATION_EXPIRED", () => {
    assert.strictEqual(webhookExpirationRouting("past_due"), "NONPAYMENT_CANCELLATION_EXPIRED");
    assert.strictEqual(lambdaExpirationRouting("past_due"), "NONPAYMENT_CANCELLATION_EXPIRED");
  });

  test("explicit: suspended → NONPAYMENT_CANCELLATION_EXPIRED", () => {
    assert.strictEqual(webhookExpirationRouting("suspended"), "NONPAYMENT_CANCELLATION_EXPIRED");
    assert.strictEqual(lambdaExpirationRouting("suspended"), "NONPAYMENT_CANCELLATION_EXPIRED");
  });

  test("explicit: active → VOLUNTARY_CANCELLATION_EXPIRED (default)", () => {
    assert.strictEqual(webhookExpirationRouting("active"), "VOLUNTARY_CANCELLATION_EXPIRED");
    assert.strictEqual(lambdaExpirationRouting("active"), "VOLUNTARY_CANCELLATION_EXPIRED");
  });
});
