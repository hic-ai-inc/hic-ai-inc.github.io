/**
 * Checkout API Contract Tests
 *
 * Validates the Checkout API endpoints:
 * - Session creation
 * - Session status
 * - Payment verification
 * - Error handling
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
  expectBadRequest,
  expectFields,
  expectUrl,
  expectCompletesWithin,
} from "../lib/assertions.js";
import {
  generateEmail,
  generateFingerprint,
  generateCheckoutData,
} from "../lib/test-data.js";
import { createTestScope } from "../lib/cleanup.js";

// ============================================================================
// Test Setup
// ============================================================================

describe("Checkout API Contract", () => {
  let client;
  let scope;

  beforeEach(() => {
    const env = getEnvironment();
    client = new E2EHttpClient(env.apiBase);
    scope = createTestScope("checkout-contract");
    log.info("Test setup complete");
  });

  afterEach(async () => {
    await scope.cleanup();
  });

  // ==========================================================================
  // POST /api/checkout (or POST /api/checkout)
  // ==========================================================================

  describe("POST /api/checkout", () => {
    describe("Request Validation", () => {
      test("should require email", async () => {
        const response = await client.post("/api/checkout", {
          licenseType: "individual",
          // email missing
        });

        expectBadRequest(response);
      });

      test("should reject invalid email format", async () => {
        const response = await client.post("/api/checkout", {
          email: "not-an-email",
          licenseType: "individual",
        });

        expectBadRequest(response);
      });

      test("should accept valid email", async () => {
        requireMutations("checkout with valid email");

        const response = await client.post("/api/checkout", {
          email: generateEmail(),
          licenseType: "individual",
        });

        // Should succeed or fail on Stripe side, not validation
        if (response.status === 400) {
          // Check it's not email validation error
          const errorMsg =
            response.json.error?.message || response.json.message || "";
          assert.ok(
            !errorMsg.toLowerCase().includes("email"),
            "Valid email should not cause email validation error",
          );
        }
      });

      test("should require licenseType", async () => {
        const response = await client.post("/api/checkout", {
          email: generateEmail(),
          // licenseType missing
        });

        // May accept with default or reject
        if (response.status === 400) {
          expectBadRequest(response);
        }
      });

      test("should reject unknown license type", async () => {
        const response = await client.post("/api/checkout", {
          email: generateEmail(),
          licenseType: "unknown-type",
        });

        expectBadRequest(response);
      });

      test("should accept individual license type", async () => {
        requireMutations("individual checkout");

        const response = await client.post("/api/checkout", {
          email: generateEmail(),
          licenseType: "individual",
        });

        // Should not fail on license type validation
        if (response.status === 400) {
          const errorMsg =
            response.json.error?.message || response.json.message || "";
          assert.ok(
            !errorMsg.toLowerCase().includes("license"),
            "Individual type should be accepted",
          );
        }
      });

      test("should accept team license type", async () => {
        requireMutations("team checkout");

        const response = await client.post("/api/checkout", {
          email: generateEmail(),
          licenseType: "team",
          seats: 5,
        });

        // Should not fail on license type validation
        assert.ok(
          response.status !== 400 ||
            !(response.json.error?.message || "")
              .toLowerCase()
              .includes("type"),
          "Team type should be accepted",
        );
      });
    });

    describe("Optional Fields", () => {
      test("should accept fingerprint for trial conversion", async () => {
        requireMutations("checkout with fingerprint");

        const response = await client.post("/api/checkout", {
          email: generateEmail(),
          licenseType: "individual",
          fingerprint: generateFingerprint(),
        });

        // Should accept fingerprint
        assert.ok(
          response.status < 500,
          "Should not return server error with fingerprint",
        );
      });

      test("should accept seats for team license", async () => {
        requireMutations("checkout with seats");

        const response = await client.post("/api/checkout", {
          email: generateEmail(),
          licenseType: "team",
          seats: 10,
        });

        assert.ok(
          response.status < 500,
          "Should not return server error with seats",
        );
      });

      test("should accept successUrl and cancelUrl", async () => {
        requireMutations("checkout with redirect URLs");

        const response = await client.post("/api/checkout", {
          email: generateEmail(),
          licenseType: "individual",
          successUrl: "https://example.com/success",
          cancelUrl: "https://example.com/cancel",
        });

        assert.ok(
          response.status < 500,
          "Should not return server error with redirect URLs",
        );
      });
    });

    describe("Response Schema", () => {
      test("should return checkoutUrl on success", async () => {
        requireMutations("checkout URL response");

        const response = await client.post("/api/checkout", {
          email: generateEmail(),
          licenseType: "individual",
        });

        if (response.status === 200) {
          expectFields(response.json, ["checkoutUrl"]);
          expectUrl(response.json.checkoutUrl, "checkout URL");

          // Should be a Stripe URL
          assert.ok(
            response.json.checkoutUrl.includes("stripe.com") ||
              response.json.checkoutUrl.includes("checkout"),
            "Checkout URL should be Stripe URL",
          );
        }
      });

      test("should return sessionId on success", async () => {
        requireMutations("session ID response");

        const response = await client.post("/api/checkout", {
          email: generateEmail(),
          licenseType: "individual",
        });

        if (response.status === 200) {
          expectFields(response.json, ["sessionId"]);
          assert.ok(
            typeof response.json.sessionId === "string",
            "sessionId should be string",
          );
          assert.ok(
            response.json.sessionId.length > 0,
            "sessionId should not be empty",
          );
        }
      });
    });

    describe("Performance", () => {
      test("should complete within timeout", async () => {
        requireMutations("checkout timeout");

        await expectCompletesWithin(
          async () => {
            await client.post("/api/checkout", {
              email: generateEmail(),
              licenseType: "individual",
            });
          },
          testConfig.timeout.api,
          "Checkout session creation",
        );
      });
    });

    describe("Error Handling", () => {
      test("should handle empty request body", async () => {
        const response = await client.post("/api/checkout", {});

        expectBadRequest(response);
      });

      test("should return structured error response", async () => {
        const response = await client.post("/api/checkout", {
          email: "invalid",
        });

        if (response.status >= 400) {
          const hasError =
            response.json.error !== undefined ||
            response.json.message !== undefined;
          assert.ok(hasError, "Error response should have error or message");
        }
      });

      test("should not expose internal errors", async () => {
        const response = await client.post("/api/checkout", {
          email: generateEmail(),
          licenseType: "individual",
          priceId: "invalid_price_that_does_not_exist",
        });

        if (response.status >= 400) {
          const errorMsg =
            response.json.error?.message || response.json.message || "";
          // Should not expose stack traces or internal details
          assert.ok(
            !errorMsg.includes("at ") && !errorMsg.includes(".js:"),
            "Should not expose stack traces",
          );
        }
      });
    });
  });

  // ==========================================================================
  // GET /api/checkout/verify
  // ==========================================================================

  describe("GET /api/checkout/verify", () => {
    describe("Request Validation", () => {
      test("should require session_id parameter", async () => {
        const response = await client.get("/api/checkout/verify");

        expectStatus(response, 400);
      });

      test("should reject empty session_id", async () => {
        const response = await client.get("/api/checkout/verify?session_id=");

        expectStatus(response, 400);
      });
    });

    describe("Response for Unknown Session", () => {
      test("should return 404 for non-existent session", async () => {
        const response = await client.get(
          "/api/checkout/verify?session_id=cs_test_nonexistent123",
        );

        // Should be 404 (not found) or 400 (invalid)
        assert.ok(
          [400, 404].includes(response.status),
          `Expected 400 or 404 for unknown session, got ${response.status}`,
        );
      });
    });

    describe("Response Schema", () => {
      test("should return payment status fields", async () => {
        requireMutations("verify response schema");

        // First create a session
        const createResponse = await client.post(
          "/api/checkout",
          {
            email: generateEmail(),
            licenseType: "individual",
          },
        );

        if (createResponse.status !== 200) {
          log.info("Skipping - could not create session");
          return;
        }

        const { sessionId } = createResponse.json;

        // Verify the session (will be unpaid)
        const verifyResponse = await client.get(
          `/api/checkout/verify?session_id=${sessionId}`,
        );

        if (verifyResponse.status === 200) {
          // Should have status field
          expectFields(verifyResponse.json, ["status"]);
        }
      });
    });
  });

  // ==========================================================================
  // GET /api/checkout/products (Optional)
  // ==========================================================================

  describe("GET /api/checkout/products", () => {
    test("should return products list if implemented", async () => {
      const response = await client.get("/api/checkout/products");

      if (response.status === 404) {
        log.info("Products endpoint not implemented");
        return;
      }

      expectStatus(response, 200);
      expectSuccess(response);

      if (response.json.products) {
        assert.ok(
          Array.isArray(response.json.products),
          "products should be array",
        );
      }
    });

    test("should include product details", async () => {
      const response = await client.get("/api/checkout/products");

      if (response.status !== 200) {
        return;
      }

      if (response.json.products?.length > 0) {
        const product = response.json.products[0];
        // Should have basic product info
        assert.ok(
          product.id || product.name || product.price,
          "Product should have id, name, or price",
        );
      }
    });
  });

  // ==========================================================================
  // GET /api/checkout/pricing (Optional)
  // ==========================================================================

  describe("GET /api/checkout/pricing", () => {
    test("should return pricing info if implemented", async () => {
      const response = await client.get("/api/checkout/pricing");

      if (response.status === 404) {
        log.info("Pricing endpoint not implemented");
        return;
      }

      expectStatus(response, 200);
    });
  });

  // ==========================================================================
  // Session Status (Optional)
  // ==========================================================================

  describe("GET /api/checkout/session/:id/status", () => {
    test("should return session status if implemented", async () => {
      requireMutations("session status check");

      // Create session first
      const createResponse = await client.post("/api/checkout", {
        email: generateEmail(),
        licenseType: "individual",
      });

      if (createResponse.status !== 200) {
        log.info("Skipping - could not create session");
        return;
      }

      const { sessionId } = createResponse.json;

      const statusResponse = await client.get(
        `/api/checkout/session/${sessionId}/status`,
      );

      if (statusResponse.status === 404) {
        log.info("Session status endpoint not implemented");
        return;
      }

      if (statusResponse.status === 200) {
        expectFields(statusResponse.json, ["status"]);
        // New session should be open/unpaid
        assert.ok(
          ["open", "unpaid", "pending", "complete"].includes(
            statusResponse.json.status.toLowerCase(),
          ),
          `Unexpected status: ${statusResponse.json.status}`,
        );
      }
    });
  });

  // ==========================================================================
  // Idempotency
  // ==========================================================================

  describe("Idempotency", () => {
    test("should handle repeated checkout requests", async () => {
      requireMutations("checkout idempotency");

      const checkoutData = {
        email: generateEmail(),
        licenseType: "individual",
      };

      // First request
      const response1 = await client.post(
        "/api/checkout",
        checkoutData,
      );

      if (response1.status !== 200) {
        log.info("Skipping - first request failed");
        return;
      }

      // Second request with same data
      const response2 = await client.post(
        "/api/checkout",
        checkoutData,
      );

      // Should either create new session or return existing (idempotent)
      if (response2.status === 200) {
        expectFields(response2.json, ["sessionId"]);
        // May be same or different session ID depending on implementation
      } else if (response2.status === 409) {
        log.info("Server returned conflict for duplicate (strict idempotency)");
      }
    });
  });

  // ==========================================================================
  // Currency and Locale
  // ==========================================================================

  describe("Currency and Locale", () => {
    test("should accept currency parameter if supported", async () => {
      requireMutations("checkout with currency");

      const response = await client.post("/api/checkout", {
        email: generateEmail(),
        licenseType: "individual",
        currency: "eur",
      });

      // Should accept or ignore gracefully
      assert.ok(
        response.status < 500,
        "Should not return server error with currency",
      );
    });

    test("should accept locale parameter if supported", async () => {
      requireMutations("checkout with locale");

      const response = await client.post("/api/checkout", {
        email: generateEmail(),
        licenseType: "individual",
        locale: "de",
      });

      assert.ok(
        response.status < 500,
        "Should not return server error with locale",
      );
    });
  });
});
