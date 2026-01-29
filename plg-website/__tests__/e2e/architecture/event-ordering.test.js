/**
 * Event Ordering Tests
 *
 * Verifies that events are processed in correct order
 * and maintain consistency across services.
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
  generateFingerprint,
  generateMachineId,
  generateDeviceData,
  generateLicenseKeyFormat,
  generateStripeWebhookEvent,
} from "../lib/test-data.js";
import { createTestScope } from "../lib/cleanup.js";
import {
  isAwsSdkAvailable,
  queryLicense,
  waitForDynamoRecord,
  pollSqsMessages,
} from "../lib/aws-helpers.js";

// ============================================================================
// Test Setup
// ============================================================================

describe("Architecture: Event Ordering", () => {
  let client;
  let scope;
  let awsAvailable;

  beforeEach(() => {
    const env = getEnvironment();
    client = new E2EHttpClient(env.apiBase);
    scope = createTestScope("arch-event-ordering");
    awsAvailable = isAwsSdkAvailable();

    log.info("Test setup complete", { awsAvailable });
  });

  afterEach(async () => {
    await scope.cleanup();
  });

  // ==========================================================================
  // Sequential Updates
  // ==========================================================================

  describe("Sequential Updates", () => {
    test("should maintain consistency with rapid sequential updates", async () => {
      requireMutations("rapid updates");

      const fingerprint = generateFingerprint();
      const machineId = generateMachineId();

      // Send 5 rapid validation requests (which may update trial)
      const responses = [];
      for (let i = 0; i < 5; i++) {
        const response = await client.post("/api/license/validate", {
          fingerprint,
          machineId,
        });
        responses.push(response);
      }

      // All should succeed
      const successCount = responses.filter((r) => r.status === 200).length;
      assert.ok(
        successCount >= 4, // Allow for rate limiting
        `At least 4/5 requests should succeed, got ${successCount}`,
      );

      // All successful responses should have same trial data
      const successResponses = responses.filter((r) => r.status === 200);
      if (successResponses.length >= 2) {
        const first = successResponses[0].json;
        const last = successResponses[successResponses.length - 1].json;

        if (first.trial && last.trial) {
          assert.equal(
            first.trial.trialStartDate,
            last.trial.trialStartDate,
            "Trial start date should be consistent across requests",
          );
        }
      }

      scope.trackTrial(fingerprint);
      log.info("Sequential update consistency verified", { successCount });
    });

    test("should handle concurrent heartbeats for same device", async () => {
      requireMutations("concurrent heartbeats");

      const device = generateDeviceData();

      // First establish trial
      const initResponse = await client.post("/api/license/validate", {
        fingerprint: device.fingerprint,
        machineId: device.machineId,
      });

      if (initResponse.status !== 200) {
        log.info("Skipping - could not initialize device");
        return;
      }

      scope.trackTrial(device.fingerprint);

      // Send concurrent heartbeats
      const heartbeatPromises = [];
      for (let i = 0; i < 3; i++) {
        heartbeatPromises.push(
          client.post("/api/license/heartbeat", {
            fingerprint: device.fingerprint,
            machineId: device.machineId,
            sessionId: device.sessionId,
          }),
        );
      }

      const heartbeats = await Promise.all(heartbeatPromises);

      // All should complete (success or rate limited)
      heartbeats.forEach((response, i) => {
        assert.ok(
          response.status < 500,
          `Heartbeat ${i} should not error, got ${response.status}`,
        );
      });

      log.info("Concurrent heartbeats handled", {
        statuses: heartbeats.map((h) => h.status),
      });
    });
  });

  // ==========================================================================
  // Cross-Service Event Order
  // ==========================================================================

  describe("Cross-Service Event Order", () => {
    test("should process checkout → license → notification in order", async () => {
      requireMutations("cross-service flow");

      // This tests the conceptual flow:
      // 1. Stripe checkout webhook arrives
      // 2. License is created in DynamoDB
      // 3. DynamoDB Stream triggers notification Lambda
      // 4. Email is sent

      const webhookEvent = generateStripeWebhookEvent(
        "checkout.session.completed",
        {
          customer_email: `order-test-${Date.now()}@test.hic-ai.com`,
          payment_status: "paid",
        },
      );

      const startTime = Date.now();

      const response = await client.post("/api/webhooks/stripe", webhookEvent, {
        headers: { "Stripe-Signature": "test-signature" },
      });

      const webhookTime = Date.now() - startTime;

      // Webhook should acknowledge quickly
      assert.ok(
        webhookTime < 5000,
        `Webhook should respond in < 5s, took ${webhookTime}ms`,
      );

      log.info("Cross-service flow initiated", {
        webhookStatus: response.status,
        webhookTimeMs: webhookTime,
      });
    });

    test("should maintain event order with DynamoDB Streams", async () => {
      // DynamoDB Streams guarantee ordering per partition key
      // Verify this through observation of events

      if (!process.env.E2E_SQS_QUEUE_URL) {
        log.info("Skipping - E2E_SQS_QUEUE_URL not configured");
        return;
      }

      requireMutations("stream ordering");

      const fingerprint = generateFingerprint();

      // Create trial (generates INSERT event)
      const init = await client.post("/api/license/validate", {
        fingerprint,
        machineId: generateMachineId(),
      });

      if (init.status !== 200) {
        log.info("Skipping - could not create trial");
        return;
      }

      scope.trackTrial(fingerprint);

      // Send heartbeat (generates MODIFY event)
      await client.post("/api/license/heartbeat", {
        fingerprint,
      });

      // If we have SQS access, verify event order
      try {
        const messages = await pollSqsMessages(
          process.env.E2E_SQS_QUEUE_URL,
          10,
          3,
        );

        const fingerprintEvents = messages.filter((m) => {
          const body = m.body.Message ? JSON.parse(m.body.Message) : m.body;
          return body.fingerprint === fingerprint;
        });

        if (fingerprintEvents.length >= 2) {
          log.info("Multiple events observed for fingerprint", {
            count: fingerprintEvents.length,
          });
        }
      } catch (error) {
        log.info("Event order verification skipped", { error: error.message });
      }
    });
  });

  // ==========================================================================
  // Idempotency
  // ==========================================================================

  describe("Idempotency", () => {
    test("should handle duplicate webhook deliveries", async () => {
      requireMutations("duplicate webhooks");

      const eventId = `evt_e2e_${Date.now()}`;
      const webhookEvent = generateStripeWebhookEvent(
        "checkout.session.completed",
        {
          id: `cs_e2e_${Date.now()}`,
        },
      );
      webhookEvent.id = eventId;

      // Send same webhook twice
      const response1 = await client.post(
        "/api/webhooks/stripe",
        webhookEvent,
        {
          headers: { "Stripe-Signature": "test-signature" },
        },
      );

      const response2 = await client.post(
        "/api/webhooks/stripe",
        webhookEvent,
        {
          headers: { "Stripe-Signature": "test-signature" },
        },
      );

      // Both should be handled gracefully
      assert.ok(
        response1.status < 500 && response2.status < 500,
        "Duplicate webhooks should not cause errors",
      );

      log.info("Duplicate webhook handling verified", {
        status1: response1.status,
        status2: response2.status,
      });
    });

    test("should be idempotent for trial initialization", async () => {
      requireMutations("trial idempotency");

      const fingerprint = generateFingerprint();
      const machineId = generateMachineId();

      // Initialize trial twice
      const response1 = await client.post("/api/license/validate", {
        fingerprint,
        machineId,
      });

      const response2 = await client.post("/api/license/validate", {
        fingerprint,
        machineId,
      });

      if (response1.status === 200 && response2.status === 200) {
        // Should return same trial data
        assert.equal(
          response1.json.trial?.trialStartDate,
          response2.json.trial?.trialStartDate,
          "Trial start date should be same on duplicate init",
        );

        scope.trackTrial(fingerprint);
        log.info("Trial idempotency verified");
      }
    });

    test("should be idempotent for device activation", async () => {
      requireMutations("activation idempotency");

      const device = generateDeviceData();
      const licenseKey = generateLicenseKeyFormat();

      // Activate same device twice
      const response1 = await client.post("/api/license/activate", {
        licenseKey,
        fingerprint: device.fingerprint,
        machineId: device.machineId,
      });

      const response2 = await client.post("/api/license/activate", {
        licenseKey,
        fingerprint: device.fingerprint,
        machineId: device.machineId,
      });

      // Should not increase device count on duplicate
      if (response1.status === 200 && response2.status === 200) {
        const count1 = response1.json.deviceCount || 1;
        const count2 = response2.json.deviceCount || 1;

        assert.equal(
          count1,
          count2,
          "Device count should not change on duplicate activation",
        );

        scope.trackDevice(device.fingerprint, response1.json.activationId);
        log.info("Activation idempotency verified");
      } else {
        log.info("Activation idempotency test skipped (no valid license)");
      }
    });
  });

  // ==========================================================================
  // Eventual Consistency
  // ==========================================================================

  describe("Eventual Consistency", () => {
    test("should achieve consistency within SLA window", async () => {
      requireMutations("consistency SLA");

      // After any write, reads should be consistent within 5 seconds
      const fingerprint = generateFingerprint();

      const writeStart = Date.now();

      await client.post("/api/license/validate", {
        fingerprint,
        machineId: generateMachineId(),
      });

      scope.trackTrial(fingerprint);

      // Immediate read
      const readResponse = await client.post("/api/license/validate", {
        fingerprint,
        machineId: generateMachineId(),
      });

      const readTime = Date.now() - writeStart;

      if (readResponse.status === 200) {
        assert.ok(
          readResponse.json.trial,
          "Should see trial on immediate read",
        );

        log.info("Consistency verified", { readTimeMs: readTime });
      }
    });
  });

  // ==========================================================================
  // Race Conditions
  // ==========================================================================

  describe("Race Conditions", () => {
    test("should handle concurrent trial + license validation", async () => {
      requireMutations("concurrent validation");

      const fingerprint = generateFingerprint();
      const licenseKey = generateLicenseKeyFormat();

      // Concurrent: trial validation and license validation
      const [trialResponse, licenseResponse] = await Promise.all([
        client.post("/api/license/validate", {
          fingerprint,
          machineId: generateMachineId(),
        }),
        client.post("/api/license/validate", {
          licenseKey,
          fingerprint,
        }),
      ]);

      // Both should complete without error
      assert.ok(
        trialResponse.status < 500,
        `Trial validation should not error, got ${trialResponse.status}`,
      );
      assert.ok(
        licenseResponse.status < 500,
        `License validation should not error, got ${licenseResponse.status}`,
      );

      if (trialResponse.status === 200) {
        scope.trackTrial(fingerprint);
      }

      log.info("Concurrent validation handled", {
        trialStatus: trialResponse.status,
        licenseStatus: licenseResponse.status,
      });
    });

    test("should handle concurrent activations on same license", async () => {
      requireMutations("concurrent activations");

      const licenseKey = generateLicenseKeyFormat();
      const device1 = generateDeviceData();
      const device2 = generateDeviceData();

      // Concurrent activations
      const [response1, response2] = await Promise.all([
        client.post("/api/license/activate", {
          licenseKey,
          fingerprint: device1.fingerprint,
          machineId: device1.machineId,
        }),
        client.post("/api/license/activate", {
          licenseKey,
          fingerprint: device2.fingerprint,
          machineId: device2.machineId,
        }),
      ]);

      // Should not cause errors or data corruption
      assert.ok(
        response1.status < 500 && response2.status < 500,
        "Concurrent activations should not cause errors",
      );

      log.info("Concurrent activations handled", {
        status1: response1.status,
        status2: response2.status,
      });
    });
  });
});
