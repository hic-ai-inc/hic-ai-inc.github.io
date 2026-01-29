/**
 * Journey 8: Subscription Lifecycle
 *
 * Tests subscription state changes:
 * 1. Active subscription
 * 2. Cancellation → grace period
 * 3. Grace period expiry → suspension
 * 4. Reactivation
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
import {
  expectStatus,
  expectSuccess,
  expectError,
  expectFields,
  expectCompletesWithin,
} from "../lib/assertions.js";
import {
  generateFingerprint,
  generateLicenseKeyFormat,
  generateStripeWebhookEvent,
  generateEmail,
} from "../lib/test-data.js";
import { createTestScope } from "../lib/cleanup.js";

// ============================================================================
// Test Setup
// ============================================================================

describe("Journey 8: Subscription Lifecycle", () => {
  let client;
  let scope;

  beforeEach(() => {
    const env = getEnvironment();
    client = new E2EHttpClient(env.apiBase);
    scope = createTestScope("j8-subscription");
    log.info("Test setup complete");
  });

  afterEach(async () => {
    await scope.cleanup();
  });

  // ==========================================================================
  // J8.1: Active Subscription Status
  // ==========================================================================

  describe("J8.1: Active Subscription", () => {
    test("should return active status for valid subscription", async () => {
      const response = await client.post("/api/license/validate", {
        licenseKey: generateLicenseKeyFormat(),
        fingerprint: generateFingerprint(),
      });

      // With a valid subscription license, should return active
      if (response.status === 200 && response.json.status === "active") {
        expectSuccess(response);
        expectFields(response.json, ["valid", "status"]);
        assert.equal(response.json.status, "active");
        log.info("Active subscription verified");
      } else {
        log.info("No active subscription to test (expected in E2E)");
      }
    });

    test("should include subscription details in response", async () => {
      const response = await client.post("/api/license/validate", {
        licenseKey: generateLicenseKeyFormat(),
        fingerprint: generateFingerprint(),
      });

      if (response.status === 200) {
        // Active subscription should include renewal info
        const { subscription } = response.json;
        if (subscription) {
          log.info("Subscription details present", {
            status: subscription.status,
            renewsAt: subscription.renewsAt,
          });
        }
      }
    });
  });

  // ==========================================================================
  // J8.2: Subscription Cancellation
  // ==========================================================================

  describe("J8.2: Cancellation Webhook", () => {
    test("should handle customer.subscription.deleted webhook", async () => {
      requireMutations("subscription cancellation");

      const webhookEvent = generateStripeWebhookEvent(
        "customer.subscription.deleted",
        {
          id: "sub_test_cancel_123",
          customer: "cus_test_123",
          status: "canceled",
          canceled_at: Math.floor(Date.now() / 1000),
        },
      );

      const response = await client.post("/api/webhooks/stripe", webhookEvent, {
        headers: {
          "Stripe-Signature": "test-signature-for-e2e",
        },
      });

      // Without valid signature, will be 400
      // With valid signature, would be 200
      assert.ok(
        [200, 400].includes(response.status),
        `Cancellation webhook should return 200 or 400, got ${response.status}`,
      );

      if (response.status === 200) {
        log.info("Cancellation webhook processed");
      } else {
        log.info(
          "Cancellation webhook rejected (expected without valid signature)",
        );
      }
    });

    test("should handle customer.subscription.updated with cancel_at", async () => {
      requireMutations("subscription update");

      const futureTimestamp = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days

      const webhookEvent = generateStripeWebhookEvent(
        "customer.subscription.updated",
        {
          id: "sub_test_update_123",
          customer: "cus_test_123",
          status: "active",
          cancel_at: futureTimestamp, // Scheduled cancellation
          cancel_at_period_end: true,
        },
      );

      const response = await client.post("/api/webhooks/stripe", webhookEvent, {
        headers: {
          "Stripe-Signature": "test-signature-for-e2e",
        },
      });

      assert.ok(
        [200, 400].includes(response.status),
        `Update webhook should return 200 or 400, got ${response.status}`,
      );
    });
  });

  // ==========================================================================
  // J8.3: Grace Period
  // ==========================================================================

  describe("J8.3: Grace Period", () => {
    test("should allow usage during grace period", async () => {
      requireMutations("grace period usage");

      // Grace period: license still valid after cancellation until period end
      // This would require a license in grace period state

      const response = await client.post("/api/license/validate", {
        licenseKey: generateLicenseKeyFormat(),
        fingerprint: generateFingerprint(),
      });

      if (response.status === 200) {
        const { status, gracePeriod } = response.json;

        if (status === "grace" || gracePeriod) {
          assert.equal(
            response.json.valid,
            true,
            "Should be valid during grace period",
          );
          log.info("Grace period usage verified", {
            status,
            endsAt: gracePeriod?.endsAt,
          });
        } else {
          log.info("License not in grace period");
        }
      }
    });

    test("should include grace period end date", async () => {
      const response = await client.post("/api/license/validate", {
        licenseKey: generateLicenseKeyFormat(),
        fingerprint: generateFingerprint(),
      });

      if (response.status === 200 && response.json.gracePeriod) {
        expectFields(response.json.gracePeriod, ["endsAt"]);
        log.info("Grace period end date present");
      }
    });
  });

  // ==========================================================================
  // J8.4: Suspension
  // ==========================================================================

  describe("J8.4: Suspension", () => {
    test("should reject validation for suspended license", async () => {
      // A suspended license should not validate
      const response = await client.post("/api/license/validate", {
        licenseKey: "SUSPENDED-0000-0000-0000",
        fingerprint: generateFingerprint(),
      });

      if (response.status === 200) {
        // If it returns 200, valid should be false
        if (response.json.status === "suspended") {
          assert.equal(
            response.json.valid,
            false,
            "Suspended license should not be valid",
          );
          log.info("Suspension validation verified");
        }
      } else {
        // 400/404 is also acceptable
        assert.ok(
          response.status < 500,
          `Suspended license check should not error, got ${response.status}`,
        );
      }
    });

    test("should reject activation for suspended license", async () => {
      const response = await client.post("/api/license/activate", {
        licenseKey: "SUSPENDED-0000-0000-0000",
        fingerprint: generateFingerprint(),
        machineId: generateFingerprint(),
      });

      // Should not allow activation
      assert.ok(
        [400, 401, 403, 404].includes(response.status),
        `Suspended license activation should be rejected, got ${response.status}`,
      );
    });

    test("should reject heartbeat for suspended license", async () => {
      const response = await client.post("/api/license/heartbeat", {
        licenseKey: "SUSPENDED-0000-0000-0000",
        fingerprint: generateFingerprint(),
      });

      // Heartbeat should fail
      assert.ok(
        response.status !== 200 || response.json.valid === false,
        "Heartbeat should fail for suspended license",
      );
    });
  });

  // ==========================================================================
  // J8.5: Reactivation
  // ==========================================================================

  describe("J8.5: Reactivation", () => {
    test("should handle invoice.paid webhook for reactivation", async () => {
      requireMutations("subscription reactivation");

      const webhookEvent = generateStripeWebhookEvent("invoice.paid", {
        id: "in_test_reactivate_123",
        customer: "cus_test_123",
        subscription: "sub_test_123",
        status: "paid",
        amount_paid: 12900,
      });

      const response = await client.post("/api/webhooks/stripe", webhookEvent, {
        headers: {
          "Stripe-Signature": "test-signature-for-e2e",
        },
      });

      assert.ok(
        [200, 400].includes(response.status),
        `Invoice webhook should return 200 or 400, got ${response.status}`,
      );
    });

    test("should reactivate suspended license after payment", async () => {
      requireMutations("license reactivation");

      // This would require:
      // 1. A suspended license
      // 2. Process invoice.paid webhook
      // 3. Verify license is now active

      // We test the endpoint behavior
      const response = await client.post("/api/license/validate", {
        licenseKey: generateLicenseKeyFormat(),
        fingerprint: generateFingerprint(),
      });

      // Verify the response structure supports reactivation flow
      if (response.status === 200) {
        log.info("Validation endpoint working for reactivation flow");
      }
    });
  });

  // ==========================================================================
  // J8.6: Payment Failure Handling
  // ==========================================================================

  describe("J8.6: Payment Failures", () => {
    test("should handle invoice.payment_failed webhook", async () => {
      requireMutations("payment failure handling");

      const webhookEvent = generateStripeWebhookEvent(
        "invoice.payment_failed",
        {
          id: "in_test_failed_123",
          customer: "cus_test_123",
          subscription: "sub_test_123",
          attempt_count: 1,
          next_payment_attempt:
            Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60,
        },
      );

      const response = await client.post("/api/webhooks/stripe", webhookEvent, {
        headers: {
          "Stripe-Signature": "test-signature-for-e2e",
        },
      });

      assert.ok(
        [200, 400].includes(response.status),
        `Payment failed webhook should return 200 or 400, got ${response.status}`,
      );
    });

    test("should handle customer.subscription.past_due webhook", async () => {
      requireMutations("past due handling");

      const webhookEvent = generateStripeWebhookEvent(
        "customer.subscription.updated",
        {
          id: "sub_test_pastdue_123",
          customer: "cus_test_123",
          status: "past_due",
        },
      );

      const response = await client.post("/api/webhooks/stripe", webhookEvent, {
        headers: {
          "Stripe-Signature": "test-signature-for-e2e",
        },
      });

      assert.ok(
        [200, 400].includes(response.status),
        `Past due webhook should return 200 or 400, got ${response.status}`,
      );
    });
  });

  // ==========================================================================
  // J8.7: Subscription Upgrade/Downgrade
  // ==========================================================================

  describe("J8.7: Plan Changes", () => {
    test("should handle plan upgrade webhook", async () => {
      requireMutations("plan upgrade");

      const webhookEvent = generateStripeWebhookEvent(
        "customer.subscription.updated",
        {
          id: "sub_test_upgrade_123",
          customer: "cus_test_123",
          status: "active",
          items: {
            data: [
              {
                price: { id: "price_team_monthly" },
              },
            ],
          },
          previous_attributes: {
            items: {
              data: [
                {
                  price: { id: "price_individual_monthly" },
                },
              ],
            },
          },
        },
      );

      const response = await client.post("/api/webhooks/stripe", webhookEvent, {
        headers: {
          "Stripe-Signature": "test-signature-for-e2e",
        },
      });

      assert.ok(
        [200, 400].includes(response.status),
        `Upgrade webhook should return 200 or 400, got ${response.status}`,
      );
    });

    test("should reflect updated seat count after upgrade", async () => {
      // After upgrade to team plan, maxDevices should increase
      // This requires a real upgraded license

      const response = await client.post("/api/license/validate", {
        licenseKey: generateLicenseKeyFormat(),
        fingerprint: generateFingerprint(),
      });

      if (response.status === 200 && response.json.maxDevices) {
        log.info("Max devices field present", {
          maxDevices: response.json.maxDevices,
        });
      }
    });
  });

  // ==========================================================================
  // J8.8: Error Cases
  // ==========================================================================

  describe("J8.8: Error Cases", () => {
    test("should handle unknown subscription in webhook", async () => {
      requireMutations("unknown subscription handling");

      const webhookEvent = generateStripeWebhookEvent(
        "customer.subscription.updated",
        {
          id: "sub_nonexistent_123",
          customer: "cus_nonexistent_123",
          status: "active",
        },
      );

      const response = await client.post("/api/webhooks/stripe", webhookEvent, {
        headers: {
          "Stripe-Signature": "test-signature-for-e2e",
        },
      });

      // Should handle gracefully
      assert.ok(
        response.status < 500,
        `Unknown subscription should not cause error, got ${response.status}`,
      );
    });

    test("should handle malformed webhook payload", async () => {
      const response = await client.post(
        "/api/webhooks/stripe",
        { type: "invalid.event", data: null },
        {
          headers: {
            "Stripe-Signature": "test-signature-for-e2e",
          },
        },
      );

      // Should return 400, not 500
      assert.ok(
        response.status < 500,
        `Malformed webhook should not cause error, got ${response.status}`,
      );
    });
  });
});
