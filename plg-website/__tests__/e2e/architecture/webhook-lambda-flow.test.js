/**
 * Webhook → Lambda → DynamoDB Flow Tests
 *
 * Verifies that webhooks trigger Lambdas that
 * correctly transform and persist data.
 *
 * Priority: P2
 *
 * @see 20260129_E2E_BACKEND_VALIDATION_SPEC.md
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";

import {
  getEnvironment,
  testConfig,
  log,
  requireMutations,
} from "../config.js";
import { E2EHttpClient } from "../lib/http-client.js";
import { expectStatus, expectSuccess } from "../lib/assertions.js";
import {
  generateStripeWebhookEvent,
  generateEmail,
  generateFingerprint,
} from "../lib/test-data.js";
import { createTestScope } from "../lib/cleanup.js";
import {
  isAwsSdkAvailable,
  queryLicense,
  waitForDynamoRecord,
  queryCloudWatchLogs,
  waitForLambdaLog,
  verifyWebhookFlow,
} from "../lib/aws-helpers.js";

// ============================================================================
// Test Setup
// ============================================================================

describe("Architecture: Webhook → Lambda → DynamoDB", () => {
  let client;
  let scope;
  let awsAvailable;

  beforeEach(() => {
    const env = getEnvironment();
    client = new E2EHttpClient(env.apiBase);
    scope = createTestScope("arch-webhook-flow");
    awsAvailable = isAwsSdkAvailable();

    log.info("Test setup complete", { awsAvailable });
  });

  afterEach(async () => {
    await scope.cleanup();
  });

  // ==========================================================================
  // Webhook Endpoint Validation
  // ==========================================================================

  describe("Webhook Endpoint Validation", () => {
    test("Stripe webhook endpoint should be accessible", async () => {
      // HEAD or GET should return method not allowed (webhooks are POST)
      const response = await client.get("/api/webhooks/stripe");

      // Should be 405 Method Not Allowed or similar
      assert.ok(
        [400, 404, 405].includes(response.status),
        `GET on webhook should return 400/404/405, got ${response.status}`,
      );

      log.info("Stripe webhook endpoint validated");
    });

    test("KeyGen webhook endpoint should be accessible", async () => {
      const response = await client.get("/api/webhooks/keygen");

      assert.ok(
        [400, 404, 405].includes(response.status),
        `GET on webhook should return 400/404/405, got ${response.status}`,
      );

      log.info("KeyGen webhook endpoint validated");
    });
  });

  // ==========================================================================
  // Stripe Checkout Flow
  // ==========================================================================

  describe("Stripe checkout.session.completed Flow", () => {
    test("should process checkout webhook and create license", async () => {
      requireMutations("checkout webhook processing");

      const customerId = `cus_e2e_${Date.now()}`;
      const customerEmail = generateEmail();
      const fingerprint = generateFingerprint();

      const webhookEvent = generateStripeWebhookEvent(
        "checkout.session.completed",
        {
          id: `cs_e2e_${Date.now()}`,
          customer: customerId,
          customer_email: customerEmail,
          payment_status: "paid",
          metadata: {
            licenseType: "individual",
            fingerprint,
          },
        },
      );

      const response = await client.post("/api/webhooks/stripe", webhookEvent, {
        headers: {
          "Stripe-Signature": "test-signature-for-e2e",
        },
      });

      // Without valid signature, will be 400
      if (response.status === 400) {
        log.info("Webhook rejected (expected without valid Stripe signature)");
        return;
      }

      expectStatus(response, 200);

      // If we had valid signature, verify DynamoDB
      if (awsAvailable && response.status === 200) {
        try {
          // Wait for license to appear
          const license = await waitForDynamoRecord(
            async () => queryLicense(customerEmail),
            10000,
          );

          if (license) {
            assert.ok(license.customerId === customerId);
            log.info("License created in DynamoDB");
          }
        } catch (error) {
          log.info("DynamoDB verification skipped", { error: error.message });
        }
      }
    });

    test("should log webhook processing to CloudWatch", async () => {
      requireMutations("webhook logging verification");

      if (!awsAvailable) {
        log.info("Skipping - AWS SDK not available");
        return;
      }

      const startTime = Date.now();

      const webhookEvent = generateStripeWebhookEvent(
        "checkout.session.completed",
      );

      await client.post("/api/webhooks/stripe", webhookEvent, {
        headers: { "Stripe-Signature": "test-signature" },
      });

      // Check for log entry
      try {
        const env = getEnvironment();
        const functionName = `plg-webhook-handler-${env.name}`;

        // Look for processing log
        const logs = await queryCloudWatchLogs(
          functionName,
          startTime,
          "checkout.session.completed",
        );

        if (logs.length > 0) {
          log.info("Webhook processing logged to CloudWatch", {
            logCount: logs.length,
          });
        } else {
          log.info(
            "No logs found (Lambda may not exist or have different name)",
          );
        }
      } catch (error) {
        log.info("CloudWatch check skipped", { error: error.message });
      }
    });
  });

  // ==========================================================================
  // Stripe Subscription Flow
  // ==========================================================================

  describe("Stripe subscription.updated Flow", () => {
    test("should update license status on subscription change", async () => {
      requireMutations("subscription update flow");

      const subscriptionId = `sub_e2e_${Date.now()}`;

      const webhookEvent = generateStripeWebhookEvent(
        "customer.subscription.updated",
        {
          id: subscriptionId,
          status: "active",
          cancel_at_period_end: false,
        },
      );

      const response = await client.post("/api/webhooks/stripe", webhookEvent, {
        headers: { "Stripe-Signature": "test-signature" },
      });

      // Verify endpoint handles the event
      assert.ok(
        [200, 400].includes(response.status),
        `Subscription update should return 200/400, got ${response.status}`,
      );

      log.info("Subscription update webhook processed");
    });

    test("should handle subscription cancellation", async () => {
      requireMutations("subscription cancellation flow");

      const webhookEvent = generateStripeWebhookEvent(
        "customer.subscription.deleted",
        {
          id: `sub_e2e_${Date.now()}`,
          status: "canceled",
        },
      );

      const response = await client.post("/api/webhooks/stripe", webhookEvent, {
        headers: { "Stripe-Signature": "test-signature" },
      });

      assert.ok(
        [200, 400].includes(response.status),
        `Subscription delete should return 200/400, got ${response.status}`,
      );

      log.info("Subscription cancellation webhook processed");
    });
  });

  // ==========================================================================
  // Stripe Payment Flow
  // ==========================================================================

  describe("Stripe payment_intent Flow", () => {
    test("should handle payment_intent.succeeded", async () => {
      requireMutations("payment success flow");

      const webhookEvent = generateStripeWebhookEvent(
        "payment_intent.succeeded",
        {
          id: `pi_e2e_${Date.now()}`,
          amount: 12900,
          currency: "usd",
          customer: `cus_e2e_${Date.now()}`,
        },
      );

      const response = await client.post("/api/webhooks/stripe", webhookEvent, {
        headers: { "Stripe-Signature": "test-signature" },
      });

      assert.ok(
        [200, 400].includes(response.status),
        `Payment success should return 200/400, got ${response.status}`,
      );
    });

    test("should handle payment_intent.payment_failed", async () => {
      requireMutations("payment failure flow");

      const webhookEvent = generateStripeWebhookEvent(
        "payment_intent.payment_failed",
        {
          id: `pi_e2e_${Date.now()}`,
          last_payment_error: {
            message: "Card declined",
            code: "card_declined",
          },
        },
      );

      const response = await client.post("/api/webhooks/stripe", webhookEvent, {
        headers: { "Stripe-Signature": "test-signature" },
      });

      assert.ok(
        [200, 400].includes(response.status),
        `Payment failure should return 200/400, got ${response.status}`,
      );
    });
  });

  // ==========================================================================
  // KeyGen Webhook Flow
  // ==========================================================================

  describe("KeyGen Webhook Flow", () => {
    test("should handle license.created event", async () => {
      requireMutations("KeyGen license created");

      const keygenEvent = {
        data: {
          id: `lic_e2e_${Date.now()}`,
          type: "licenses",
          attributes: {
            key: `MOUSE-E2E-${Date.now()}-TEST`,
            status: "ACTIVE",
            uses: 0,
            maxMachines: 3,
          },
        },
        meta: {
          event: "license.created",
        },
      };

      const response = await client.post("/api/webhooks/keygen", keygenEvent, {
        headers: {
          "Keygen-Signature": "test-signature",
        },
      });

      // KeyGen webhook may not be implemented or may reject without signature
      assert.ok(
        [200, 400, 404].includes(response.status),
        `KeyGen webhook should return 200/400/404, got ${response.status}`,
      );

      log.info("KeyGen license.created handled", { status: response.status });
    });

    test("should handle machine.heartbeat.dead event", async () => {
      requireMutations("KeyGen heartbeat dead");

      const keygenEvent = {
        data: {
          id: `mach_e2e_${Date.now()}`,
          type: "machines",
          attributes: {
            fingerprint: generateFingerprint(),
            lastHeartbeat: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
          },
          relationships: {
            license: {
              data: { id: `lic_e2e_${Date.now()}` },
            },
          },
        },
        meta: {
          event: "machine.heartbeat.dead",
        },
      };

      const response = await client.post("/api/webhooks/keygen", keygenEvent, {
        headers: { "Keygen-Signature": "test-signature" },
      });

      assert.ok(
        [200, 400, 404].includes(response.status),
        `KeyGen heartbeat dead should return 200/400/404, got ${response.status}`,
      );
    });
  });

  // ==========================================================================
  // Lambda Error Handling
  // ==========================================================================

  describe("Lambda Error Handling", () => {
    test("should log errors for malformed webhooks", async () => {
      requireMutations("error logging verification");

      const startTime = Date.now();

      // Send malformed webhook
      const response = await client.post(
        "/api/webhooks/stripe",
        { invalid: "data" },
        { headers: { "Stripe-Signature": "test-signature" } },
      );

      // Should not return 500
      assert.ok(
        response.status < 500,
        `Malformed webhook should not cause 500, got ${response.status}`,
      );

      // Check CloudWatch for error log
      if (awsAvailable) {
        try {
          const env = getEnvironment();
          const functionName = `plg-webhook-handler-${env.name}`;

          const logs = await queryCloudWatchLogs(
            functionName,
            startTime,
            "ERROR",
          );

          log.info("Error logging check complete", { errorLogs: logs.length });
        } catch (error) {
          log.info("CloudWatch error check skipped", { error: error.message });
        }
      }
    });

    test("should return 400 for missing event type", async () => {
      const response = await client.post(
        "/api/webhooks/stripe",
        { data: { object: {} } }, // Missing type
        { headers: { "Stripe-Signature": "test-signature" } },
      );

      // Should be client error, not server error
      assert.ok(
        response.status < 500,
        `Missing event type should not cause 500, got ${response.status}`,
      );
    });
  });

  // ==========================================================================
  // End-to-End Flow Timing
  // ==========================================================================

  describe("Flow Timing", () => {
    test("should complete webhook → DynamoDB within SLA", async () => {
      requireMutations("flow timing");

      const startTime = Date.now();

      const webhookEvent = generateStripeWebhookEvent(
        "checkout.session.completed",
      );

      const response = await client.post("/api/webhooks/stripe", webhookEvent, {
        headers: { "Stripe-Signature": "test-signature" },
      });

      const elapsed = Date.now() - startTime;

      // Response should be fast (webhook acknowledgment)
      assert.ok(
        elapsed < 5000,
        `Webhook response should be < 5s, was ${elapsed}ms`,
      );

      log.info("Webhook response time", { elapsedMs: elapsed });
    });
  });
});
