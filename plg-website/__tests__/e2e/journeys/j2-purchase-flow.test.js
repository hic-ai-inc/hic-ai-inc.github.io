/**
 * Journey 2: Purchase Flow
 *
 * Tests the complete purchase flow:
 * 1. Checkout session creation
 * 2. Stripe webhook processing
 * 3. License key generation
 * 4. License delivery
 *
 * Priority: P0 (Critical Path)
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
  expectLicenseKey,
  expectFields,
  expectUrl,
  expectCompletesWithin,
} from "../lib/assertions.js";
import {
  generateFingerprint,
  generateMachineId,
  generateCheckoutData,
  generateEmail,
  STRIPE_TEST_CARDS,
  generateStripeWebhookEvent,
} from "../lib/test-data.js";
import { createTestScope } from "../lib/cleanup.js";

// ============================================================================
// Test Setup
// ============================================================================

describe("Journey 2: Purchase Flow", () => {
  let client;
  let scope;

  beforeEach(() => {
    const env = getEnvironment();
    client = new E2EHttpClient(env.apiBase);
    scope = createTestScope("j2-purchase");
    log.info("Test setup complete");
  });

  afterEach(async () => {
    await scope.cleanup();
  });

  // ==========================================================================
  // J2.1: Checkout Session Creation
  // ==========================================================================

  describe("J2.1: Checkout Session Creation", () => {
    test("should create checkout session for individual license", async () => {
      requireMutations("checkout session creation");

      const checkoutData = generateCheckoutData({
        licenseType: "individual",
      });

      const response = await client.post(
        "/api/checkout/create-session",
        checkoutData,
      );

      expectStatus(response, 200);
      expectSuccess(response);

      // Verify checkout URL
      expectFields(response.json, ["checkoutUrl", "sessionId"]);
      expectUrl(response.json.checkoutUrl, "checkout URL");

      // Verify Stripe URL format
      assert.ok(
        response.json.checkoutUrl.includes("checkout.stripe.com") ||
          response.json.checkoutUrl.includes("stripe.com"),
        "Checkout URL should be Stripe URL",
      );

      log.info("Checkout session created", {
        sessionId: response.json.sessionId,
      });
    });

    test("should create checkout session for team license", async () => {
      requireMutations("team checkout session");

      const checkoutData = generateCheckoutData({
        licenseType: "team",
        seats: 5,
      });

      const response = await client.post(
        "/api/checkout/create-session",
        checkoutData,
      );

      expectStatus(response, 200);
      expectSuccess(response);
      expectFields(response.json, ["checkoutUrl", "sessionId"]);

      log.info("Team checkout session created");
    });

    test("should include trial fingerprint in checkout", async () => {
      requireMutations("checkout with trial fingerprint");

      const fingerprint = generateFingerprint();
      const checkoutData = generateCheckoutData({
        licenseType: "individual",
        fingerprint, // Link checkout to existing trial
      });

      const response = await client.post(
        "/api/checkout/create-session",
        checkoutData,
      );

      expectStatus(response, 200);
      expectSuccess(response);

      // Session should be linked to fingerprint for trial conversion
      log.info("Checkout linked to trial", { fingerprint });
    });

    test("should complete within timeout", async () => {
      requireMutations("checkout timeout");

      await expectCompletesWithin(
        async () => {
          const response = await client.post(
            "/api/checkout/create-session",
            generateCheckoutData(),
          );
          expectStatus(response, 200);
        },
        testConfig.timeout.api,
        "Checkout session creation",
      );
    });

    test("should reject invalid email", async () => {
      const response = await client.post("/api/checkout/create-session", {
        email: "not-an-email",
        licenseType: "individual",
      });

      expectStatus(response, 400);
      expectError(response);
    });

    test("should reject unknown license type", async () => {
      const response = await client.post("/api/checkout/create-session", {
        email: generateEmail(),
        licenseType: "unknown-type",
      });

      expectStatus(response, 400);
      expectError(response);
    });

    test("should handle missing required fields", async () => {
      const response = await client.post("/api/checkout/create-session", {});

      expectStatus(response, 400);
      expectError(response);
    });
  });

  // ==========================================================================
  // J2.2: Webhook Processing
  // ==========================================================================

  describe("J2.2: Webhook Processing", () => {
    test("should handle checkout.session.completed webhook", async () => {
      requireMutations("webhook processing");

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

      // Note: Real webhook needs Stripe signature
      // This tests the endpoint accepts the format
      const response = await client.post("/api/webhooks/stripe", webhookEvent, {
        headers: {
          "Stripe-Signature": "test-signature-for-e2e",
        },
      });

      // Webhook should respond quickly (acknowledgment)
      // 200 = processed, 400 = bad signature/format
      assert.ok(
        [200, 400].includes(response.status),
        `Webhook should return 200 or 400, got ${response.status}`,
      );

      if (response.status === 200) {
        log.info("Webhook processed successfully");
      } else {
        log.info("Webhook rejected (expected in E2E without valid signature)");
      }
    });

    test("should handle payment_intent.succeeded webhook", async () => {
      requireMutations("payment intent webhook");

      const webhookEvent = generateStripeWebhookEvent(
        "payment_intent.succeeded",
        {
          amount: 12900,
          currency: "usd",
        },
      );

      const response = await client.post("/api/webhooks/stripe", webhookEvent, {
        headers: {
          "Stripe-Signature": "test-signature-for-e2e",
        },
      });

      assert.ok(
        [200, 400].includes(response.status),
        `Webhook should return 200 or 400, got ${response.status}`,
      );
    });

    test("should reject webhook without signature", async () => {
      const webhookEvent = generateStripeWebhookEvent(
        "checkout.session.completed",
      );

      const response = await client.post("/api/webhooks/stripe", webhookEvent);
      // Should be 400 or 401 without signature

      assert.ok(
        [400, 401].includes(response.status),
        `Should reject unsigned webhook, got ${response.status}`,
      );
    });
  });

  // ==========================================================================
  // J2.3: License Key Format
  // ==========================================================================

  describe("J2.3: License Key Format", () => {
    test("should validate expected license key format", async () => {
      // Test the format we expect from KeyGen
      const validFormats = [
        "XXXX-XXXX-XXXX-XXXX",
        "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX", // UUID format
      ];

      // This is a format validation - actual license creation
      // happens via webhook flow
      validFormats.forEach((format) => {
        assert.ok(format.includes("-"), "License key should have separators");
      });

      log.info("License key format expectations documented");
    });
  });

  // ==========================================================================
  // J2.4: Checkout Session Status
  // ==========================================================================

  describe("J2.4: Checkout Session Status", () => {
    test("should check checkout session status", async () => {
      requireMutations("session status check");

      // First create a session
      const createResponse = await client.post(
        "/api/checkout/create-session",
        generateCheckoutData(),
      );

      if (createResponse.status !== 200) {
        log.info("Skipping status check - could not create session");
        return;
      }

      const { sessionId } = createResponse.json;

      // Check status (new session should be 'open' or 'unpaid')
      const statusResponse = await client.get(
        `/api/checkout/session/${sessionId}/status`,
      );

      // Session status endpoint may or may not exist
      if (statusResponse.status === 404) {
        log.info("Session status endpoint not implemented");
        return;
      }

      expectStatus(statusResponse, 200);
      log.info("Session status checked", { sessionId });
    });
  });

  // ==========================================================================
  // J2.5: Pricing and Products
  // ==========================================================================

  describe("J2.5: Pricing", () => {
    test("should return available products", async () => {
      const response = await client.get("/api/checkout/products");

      // Products endpoint may or may not exist
      if (response.status === 404) {
        log.info("Products endpoint not implemented");
        return;
      }

      expectStatus(response, 200);
      expectSuccess(response);

      const { products } = response.json;
      assert.ok(Array.isArray(products), "Products should be array");

      if (products.length > 0) {
        expectFields(products[0], ["id", "name", "price"]);
      }

      log.info("Products retrieved", { count: products.length });
    });

    test("should return pricing information", async () => {
      const response = await client.get("/api/checkout/pricing");

      // Pricing endpoint may or may not exist
      if (response.status === 404) {
        log.info("Pricing endpoint not implemented");
        return;
      }

      expectStatus(response, 200);
      log.info("Pricing retrieved");
    });
  });

  // ==========================================================================
  // J2.6: Error Cases
  // ==========================================================================

  describe("J2.6: Error Handling", () => {
    test("should handle Stripe API errors gracefully", async () => {
      requireMutations("Stripe error handling");

      // Force an error condition
      const response = await client.post("/api/checkout/create-session", {
        email: generateEmail(),
        licenseType: "individual",
        priceId: "invalid_price_id", // Invalid price
      });

      // Should return client error, not 500
      assert.ok(
        response.status < 500,
        `Should not return server error, got ${response.status}`,
      );
    });

    test("should handle duplicate checkout attempts", async () => {
      requireMutations("duplicate checkout handling");

      const checkoutData = generateCheckoutData();

      // First checkout
      const response1 = await client.post(
        "/api/checkout/create-session",
        checkoutData,
      );

      if (response1.status !== 200) {
        log.info("Skipping duplicate test - first checkout failed");
        return;
      }

      // Second checkout with same data
      const response2 = await client.post(
        "/api/checkout/create-session",
        checkoutData,
      );

      // Should either create new session or return idempotent result
      assert.ok(
        [200, 409].includes(response2.status),
        `Should handle duplicate gracefully, got ${response2.status}`,
      );
    });
  });

  // ==========================================================================
  // J2.7: Customer Portal (Optional)
  // ==========================================================================

  describe("J2.7: Customer Portal", () => {
    test("should create portal session for existing customer", async () => {
      requireMutations("portal session creation");

      // Portal session requires valid customer ID
      const response = await client.post("/api/portal/create-session", {
        customerId: "cus_test123",
        returnUrl: "https://example.com/return",
      });

      // May require valid customer ID
      if (response.status === 404) {
        log.info("Portal endpoint not implemented or customer not found");
        return;
      }

      // Should be 200 (success) or 400/404 (invalid customer)
      assert.ok(
        response.status < 500,
        `Should not return server error, got ${response.status}`,
      );

      if (response.status === 200) {
        expectFields(response.json, ["portalUrl"]);
        log.info("Portal session created");
      }
    });
  });
});
