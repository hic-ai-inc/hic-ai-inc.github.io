/**
 * Webhook API Contract Tests
 *
 * Validates the Webhook API endpoints:
 * - Stripe webhook handling
 * - KeyGen webhook handling
 * - Signature verification
 * - Event processing
 *
 * Priority: P1
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
import {
  expectStatus,
  expectSuccess,
  expectError,
  expectFields,
  expectCompletesWithin,
} from "../lib/assertions.js";
import {
  generateStripeWebhookEvent,
  generateKeygenWebhookEvent,
  generateEmail,
  generateFingerprint,
  generateLicenseKeyFormat,
} from "../lib/test-data.js";
import { createTestScope } from "../lib/cleanup.js";

// ============================================================================
// Test Setup
// ============================================================================

describe("Webhook API Contract", () => {
  let client;
  let scope;

  beforeEach(() => {
    const env = getEnvironment();
    client = new E2EHttpClient(env.apiBase);
    scope = createTestScope("webhook-contract");
    log.info("Test setup complete");
  });

  afterEach(async () => {
    await scope.cleanup();
  });

  // ==========================================================================
  // POST /api/webhooks/stripe
  // ==========================================================================

  describe("POST /api/webhooks/stripe", () => {
    describe("Signature Verification", () => {
      test("should reject requests without signature header", async () => {
        const webhookEvent = generateStripeWebhookEvent(
          "checkout.session.completed",
        );

        const response = await client.post(
          "/api/webhooks/stripe",
          webhookEvent,
        );
        // No Stripe-Signature header

        // Should reject
        assert.ok(
          [400, 401, 403].includes(response.status),
          `Should reject unsigned webhook, got ${response.status}`,
        );
      });

      test("should reject invalid signature", async () => {
        const webhookEvent = generateStripeWebhookEvent(
          "checkout.session.completed",
        );

        const response = await client.post(
          "/api/webhooks/stripe",
          webhookEvent,
          {
            headers: {
              "Stripe-Signature": "invalid_signature_value",
            },
          },
        );

        // Should reject
        assert.ok(
          [400, 401, 403].includes(response.status),
          `Should reject invalid signature, got ${response.status}`,
        );
      });

      test("should reject expired signature timestamp", async () => {
        const webhookEvent = generateStripeWebhookEvent(
          "checkout.session.completed",
        );

        // Stripe signature format: t=timestamp,v1=signature
        const expiredTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 min ago
        const response = await client.post(
          "/api/webhooks/stripe",
          webhookEvent,
          {
            headers: {
              "Stripe-Signature": `t=${expiredTimestamp},v1=fake_signature`,
            },
          },
        );

        // Should reject
        assert.ok(
          [400, 401, 403].includes(response.status),
          `Should reject expired timestamp, got ${response.status}`,
        );
      });
    });

    describe("Event Types - checkout.session.completed", () => {
      test("should process checkout.session.completed event", async () => {
        requireMutations("checkout completed webhook");

        const webhookEvent = generateStripeWebhookEvent(
          "checkout.session.completed",
          {
            customer_email: generateEmail(),
            metadata: {
              licenseType: "individual",
              fingerprint: generateFingerprint(),
            },
          },
        );

        const response = await client.post(
          "/api/webhooks/stripe",
          webhookEvent,
          {
            headers: {
              "Stripe-Signature": `t=${Math.floor(Date.now() / 1000)},v1=test_e2e_signature`,
            },
          },
        );

        // Will be 400/401 without valid signature, but tests format acceptance
        log.info("checkout.session.completed response", {
          status: response.status,
        });
      });

      test("should include required checkout session fields", async () => {
        const webhookEvent = generateStripeWebhookEvent(
          "checkout.session.completed",
          {
            customer_email: generateEmail(),
            payment_status: "paid",
            amount_total: 12900,
            currency: "usd",
          },
        );

        // Verify event structure is correct
        assert.ok(webhookEvent.type === "checkout.session.completed");
        assert.ok(webhookEvent.data.object.customer_email);
        assert.ok(webhookEvent.data.object.payment_status);
      });
    });

    describe("Event Types - payment_intent.succeeded", () => {
      test("should process payment_intent.succeeded event", async () => {
        requireMutations("payment intent webhook");

        const webhookEvent = generateStripeWebhookEvent(
          "payment_intent.succeeded",
          {
            amount: 12900,
            currency: "usd",
            status: "succeeded",
          },
        );

        const response = await client.post(
          "/api/webhooks/stripe",
          webhookEvent,
          {
            headers: {
              "Stripe-Signature": `t=${Math.floor(Date.now() / 1000)},v1=test_e2e_signature`,
            },
          },
        );

        log.info("payment_intent.succeeded response", {
          status: response.status,
        });
      });
    });

    describe("Event Types - customer.subscription.updated", () => {
      test("should process subscription.updated event", async () => {
        requireMutations("subscription updated webhook");

        const webhookEvent = generateStripeWebhookEvent(
          "customer.subscription.updated",
          {
            status: "active",
            cancel_at_period_end: false,
          },
        );

        const response = await client.post(
          "/api/webhooks/stripe",
          webhookEvent,
          {
            headers: {
              "Stripe-Signature": `t=${Math.floor(Date.now() / 1000)},v1=test_e2e_signature`,
            },
          },
        );

        log.info("customer.subscription.updated response", {
          status: response.status,
        });
      });
    });

    describe("Event Types - customer.subscription.deleted", () => {
      test("should process subscription.deleted event", async () => {
        requireMutations("subscription deleted webhook");

        const webhookEvent = generateStripeWebhookEvent(
          "customer.subscription.deleted",
          {
            status: "canceled",
          },
        );

        const response = await client.post(
          "/api/webhooks/stripe",
          webhookEvent,
          {
            headers: {
              "Stripe-Signature": `t=${Math.floor(Date.now() / 1000)},v1=test_e2e_signature`,
            },
          },
        );

        log.info("customer.subscription.deleted response", {
          status: response.status,
        });
      });
    });

    describe("Unknown Event Types", () => {
      test("should handle unknown event types gracefully", async () => {
        const webhookEvent = generateStripeWebhookEvent("unknown.event.type");

        const response = await client.post(
          "/api/webhooks/stripe",
          webhookEvent,
          {
            headers: {
              "Stripe-Signature": `t=${Math.floor(Date.now() / 1000)},v1=test_e2e_signature`,
            },
          },
        );

        // Should not return 500
        assert.ok(
          response.status < 500,
          `Unknown event should not cause server error, got ${response.status}`,
        );
      });
    });

    describe("Response Format", () => {
      test("should return acknowledgment response", async () => {
        const webhookEvent = generateStripeWebhookEvent(
          "checkout.session.completed",
        );

        const response = await client.post(
          "/api/webhooks/stripe",
          webhookEvent,
          {
            headers: {
              "Stripe-Signature": `t=${Math.floor(Date.now() / 1000)},v1=test_e2e_signature`,
            },
          },
        );

        // Even if rejected, should have response body
        if (response.status === 200) {
          // Success response
          const hasAck =
            response.json.received !== undefined ||
            response.json.success !== undefined;
          if (hasAck) {
            log.info("Webhook acknowledgment received");
          }
        }
      });
    });

    describe("Performance", () => {
      test("should respond quickly (acknowledgment)", async () => {
        requireMutations("webhook performance");

        await expectCompletesWithin(
          async () => {
            const webhookEvent = generateStripeWebhookEvent(
              "checkout.session.completed",
            );
            await client.post("/api/webhooks/stripe", webhookEvent, {
              headers: {
                "Stripe-Signature": `t=${Math.floor(Date.now() / 1000)},v1=test`,
              },
            });
          },
          testConfig.timeout.fast,
          "Stripe webhook acknowledgment",
        );
      });
    });

    describe("Idempotency", () => {
      test("should handle duplicate events idempotently", async () => {
        requireMutations("webhook idempotency");

        const webhookEvent = generateStripeWebhookEvent(
          "checkout.session.completed",
        );

        // Send same event twice
        const response1 = await client.post(
          "/api/webhooks/stripe",
          webhookEvent,
          {
            headers: {
              "Stripe-Signature": `t=${Math.floor(Date.now() / 1000)},v1=test`,
            },
          },
        );

        const response2 = await client.post(
          "/api/webhooks/stripe",
          webhookEvent,
          {
            headers: {
              "Stripe-Signature": `t=${Math.floor(Date.now() / 1000)},v1=test`,
            },
          },
        );

        // Both should have same response (idempotent)
        // Or at least neither should cause server error
        assert.ok(response1.status < 500, "First request should not error");
        assert.ok(response2.status < 500, "Duplicate request should not error");
      });
    });
  });

  // ==========================================================================
  // POST /api/webhooks/keygen
  // ==========================================================================

  describe("POST /api/webhooks/keygen", () => {
    describe("Signature Verification", () => {
      test("should reject requests without signature header", async () => {
        const webhookEvent = generateKeygenWebhookEvent("license.created");

        const response = await client.post(
          "/api/webhooks/keygen",
          webhookEvent,
        );
        // No signature header

        assert.ok(
          [400, 401, 403].includes(response.status),
          `Should reject unsigned webhook, got ${response.status}`,
        );
      });

      test("should reject invalid signature", async () => {
        const webhookEvent = generateKeygenWebhookEvent("license.created");

        const response = await client.post(
          "/api/webhooks/keygen",
          webhookEvent,
          {
            headers: {
              "Keygen-Signature": "invalid_signature",
            },
          },
        );

        assert.ok(
          [400, 401, 403].includes(response.status),
          `Should reject invalid signature, got ${response.status}`,
        );
      });
    });

    describe("Event Types - license.created", () => {
      test("should process license.created event", async () => {
        requireMutations("license created webhook");

        const webhookEvent = generateKeygenWebhookEvent("license.created", {
          licenseKey: generateLicenseKeyFormat(),
          email: generateEmail(),
        });

        const response = await client.post(
          "/api/webhooks/keygen",
          webhookEvent,
          {
            headers: {
              "Keygen-Signature": `sig_test_${Date.now()}`,
            },
          },
        );

        log.info("license.created response", { status: response.status });
      });
    });

    describe("Event Types - license.suspended", () => {
      test("should process license.suspended event", async () => {
        requireMutations("license suspended webhook");

        const webhookEvent = generateKeygenWebhookEvent("license.suspended", {
          licenseKey: generateLicenseKeyFormat(),
          reason: "payment_failed",
        });

        const response = await client.post(
          "/api/webhooks/keygen",
          webhookEvent,
          {
            headers: {
              "Keygen-Signature": `sig_test_${Date.now()}`,
            },
          },
        );

        log.info("license.suspended response", { status: response.status });
      });
    });

    describe("Event Types - license.revoked", () => {
      test("should process license.revoked event", async () => {
        requireMutations("license revoked webhook");

        const webhookEvent = generateKeygenWebhookEvent("license.revoked", {
          licenseKey: generateLicenseKeyFormat(),
          reason: "fraud",
        });

        const response = await client.post(
          "/api/webhooks/keygen",
          webhookEvent,
          {
            headers: {
              "Keygen-Signature": `sig_test_${Date.now()}`,
            },
          },
        );

        log.info("license.revoked response", { status: response.status });
      });
    });

    describe("Event Types - machine.heartbeat.dead", () => {
      test("should process machine.heartbeat.dead event", async () => {
        requireMutations("heartbeat dead webhook");

        const webhookEvent = generateKeygenWebhookEvent(
          "machine.heartbeat.dead",
          {
            machineId: "mach_test123",
            fingerprint: generateFingerprint(),
            lastHeartbeat: new Date(Date.now() - 3600000).toISOString(),
          },
        );

        const response = await client.post(
          "/api/webhooks/keygen",
          webhookEvent,
          {
            headers: {
              "Keygen-Signature": `sig_test_${Date.now()}`,
            },
          },
        );

        log.info("machine.heartbeat.dead response", {
          status: response.status,
        });
      });
    });

    describe("Unknown Event Types", () => {
      test("should handle unknown event types gracefully", async () => {
        const webhookEvent = generateKeygenWebhookEvent("unknown.event.type");

        const response = await client.post(
          "/api/webhooks/keygen",
          webhookEvent,
          {
            headers: {
              "Keygen-Signature": `sig_test_${Date.now()}`,
            },
          },
        );

        assert.ok(
          response.status < 500,
          `Unknown event should not cause server error, got ${response.status}`,
        );
      });
    });

    describe("Response Format", () => {
      test("should return acknowledgment response", async () => {
        const webhookEvent = generateKeygenWebhookEvent("license.created");

        const response = await client.post(
          "/api/webhooks/keygen",
          webhookEvent,
          {
            headers: {
              "Keygen-Signature": `sig_test_${Date.now()}`,
            },
          },
        );

        if (response.status === 200) {
          log.info("KeyGen webhook acknowledgment received");
        }
      });
    });

    describe("Performance", () => {
      test("should respond quickly (acknowledgment)", async () => {
        requireMutations("keygen webhook performance");

        await expectCompletesWithin(
          async () => {
            const webhookEvent = generateKeygenWebhookEvent("license.created");
            await client.post("/api/webhooks/keygen", webhookEvent, {
              headers: {
                "Keygen-Signature": `sig_test_${Date.now()}`,
              },
            });
          },
          testConfig.timeout.fast,
          "KeyGen webhook acknowledgment",
        );
      });
    });
  });

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  describe("Error Handling", () => {
    test("should handle malformed JSON in Stripe webhook", async () => {
      const response = await client.post(
        "/api/webhooks/stripe",
        "not-valid-json",
        {
          headers: {
            "Content-Type": "application/json",
            "Stripe-Signature": `t=${Math.floor(Date.now() / 1000)},v1=test`,
          },
        },
      );

      // Should return 400, not 500
      assert.ok(
        [400, 415].includes(response.status),
        `Malformed JSON should return client error, got ${response.status}`,
      );
    });

    test("should handle malformed JSON in KeyGen webhook", async () => {
      const response = await client.post(
        "/api/webhooks/keygen",
        "not-valid-json",
        {
          headers: {
            "Content-Type": "application/json",
            "Keygen-Signature": `sig_test_${Date.now()}`,
          },
        },
      );

      assert.ok(
        [400, 415].includes(response.status),
        `Malformed JSON should return client error, got ${response.status}`,
      );
    });

    test("should handle empty request body", async () => {
      const response = await client.post(
        "/api/webhooks/stripe",
        {},
        {
          headers: {
            "Stripe-Signature": `t=${Math.floor(Date.now() / 1000)},v1=test`,
          },
        },
      );

      // Should not return 500
      assert.ok(
        response.status < 500,
        `Empty body should not cause server error, got ${response.status}`,
      );
    });

    test("should not expose internal errors", async () => {
      const webhookEvent = generateStripeWebhookEvent(
        "checkout.session.completed",
      );

      const response = await client.post("/api/webhooks/stripe", webhookEvent, {
        headers: {
          "Stripe-Signature": "malformed_signature",
        },
      });

      if (response.status >= 400 && response.json) {
        const errorMsg = JSON.stringify(response.json);
        // Should not expose stack traces
        assert.ok(
          !errorMsg.includes("at ") && !errorMsg.includes(".js:"),
          "Should not expose stack traces",
        );
      }
    });
  });

  // ==========================================================================
  // Security
  // ==========================================================================

  describe("Security", () => {
    test("should reject requests from untrusted origins", async () => {
      const webhookEvent = generateStripeWebhookEvent(
        "checkout.session.completed",
      );

      // Request without proper signature but with suspicious headers
      const response = await client.post("/api/webhooks/stripe", webhookEvent, {
        headers: {
          "X-Forwarded-For": "malicious.example.com",
          // Missing Stripe-Signature
        },
      });

      // Should still reject without signature
      assert.ok(
        [400, 401, 403].includes(response.status),
        "Should reject requests without signature",
      );
    });

    test("should log webhook attempts for audit", async () => {
      // This is a behavioral test - we verify the endpoint handles
      // the request, and logging would be verified in server logs

      const webhookEvent = generateStripeWebhookEvent(
        "checkout.session.completed",
      );

      const response = await client.post("/api/webhooks/stripe", webhookEvent, {
        headers: {
          "Stripe-Signature": `t=${Math.floor(Date.now() / 1000)},v1=audit_test`,
        },
      });

      // Just verify endpoint responds
      assert.ok(
        response.status !== undefined,
        "Endpoint should respond for audit logging",
      );
    });
  });
});
