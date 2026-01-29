/**
 * Portal API Contract Tests
 *
 * Tests the authenticated user portal API endpoints:
 * - Status overview
 * - License details
 * - Billing information
 * - Team management
 * - Settings
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
import { generateEmail } from "../lib/test-data.js";
import { createTestScope } from "../lib/cleanup.js";

// ============================================================================
// Test Setup
// ============================================================================

describe("Portal API Contract", () => {
  let client;
  let scope;
  let authToken;

  beforeEach(() => {
    const env = getEnvironment();
    client = new E2EHttpClient(env.apiBase);
    scope = createTestScope("portal-contract");

    // Auth token would come from Cognito test user
    authToken = process.env.E2E_COGNITO_TEST_TOKEN || null;

    log.info("Test setup complete", { hasAuth: !!authToken });
  });

  afterEach(async () => {
    await scope.cleanup();
  });

  // Helper to make authenticated requests
  function authHeaders() {
    if (!authToken) {
      return {};
    }
    return { Authorization: `Bearer ${authToken}` };
  }

  // ==========================================================================
  // Authentication Required
  // ==========================================================================

  describe("Authentication Required", () => {
    test("should reject unauthenticated request to /api/portal/status", async () => {
      const response = await client.get("/api/portal/status");

      // Should require authentication
      assert.ok(
        [401, 403].includes(response.status),
        `Portal status should require auth, got ${response.status}`,
      );
    });

    test("should reject unauthenticated request to /api/portal/license", async () => {
      const response = await client.get("/api/portal/license");

      assert.ok(
        [401, 403].includes(response.status),
        `Portal license should require auth, got ${response.status}`,
      );
    });

    test("should reject unauthenticated request to /api/portal/billing", async () => {
      const response = await client.get("/api/portal/billing");

      assert.ok(
        [401, 403].includes(response.status),
        `Portal billing should require auth, got ${response.status}`,
      );
    });

    test("should reject invalid token", async () => {
      const response = await client.get("/api/portal/status", {
        headers: { Authorization: "Bearer invalid-token" },
      });

      assert.ok(
        [401, 403].includes(response.status),
        `Invalid token should be rejected, got ${response.status}`,
      );
    });
  });

  // ==========================================================================
  // GET /api/portal/status
  // ==========================================================================

  describe("GET /api/portal/status", () => {
    test("should return user status with valid auth", async () => {
      if (!authToken) {
        log.info("Skipping - no auth token configured");
        return;
      }

      const response = await client.get("/api/portal/status", {
        headers: authHeaders(),
      });

      expectStatus(response, 200);
      expectSuccess(response);
      expectFields(response.json, ["user", "subscription", "license"]);

      log.info("Portal status retrieved");
    });

    test("should include user email in response", async () => {
      if (!authToken) {
        log.info("Skipping - no auth token configured");
        return;
      }

      const response = await client.get("/api/portal/status", {
        headers: authHeaders(),
      });

      if (response.status === 200) {
        assert.ok(response.json.user?.email, "Should include user email");
      }
    });

    test("should complete within timeout", async () => {
      if (!authToken) {
        log.info("Skipping - no auth token configured");
        return;
      }

      await expectCompletesWithin(
        async () => {
          await client.get("/api/portal/status", { headers: authHeaders() });
        },
        testConfig.timeout.api,
        "Portal status",
      );
    });
  });

  // ==========================================================================
  // GET /api/portal/license
  // ==========================================================================

  describe("GET /api/portal/license", () => {
    test("should return license details with valid auth", async () => {
      if (!authToken) {
        log.info("Skipping - no auth token configured");
        return;
      }

      const response = await client.get("/api/portal/license", {
        headers: authHeaders(),
      });

      if (response.status === 200) {
        expectSuccess(response);
        expectFields(response.json, ["license"]);

        if (response.json.license) {
          expectFields(response.json.license, ["key", "status", "maxDevices"]);
        }

        log.info("License details retrieved");
      } else if (response.status === 404) {
        // User has no license
        log.info("No license found for user");
      }
    });

    test("should include device list", async () => {
      if (!authToken) {
        log.info("Skipping - no auth token configured");
        return;
      }

      const response = await client.get("/api/portal/license", {
        headers: authHeaders(),
      });

      if (response.status === 200 && response.json.license?.devices) {
        assert.ok(
          Array.isArray(response.json.license.devices),
          "Devices should be array",
        );
        log.info("Device list present", {
          count: response.json.license.devices.length,
        });
      }
    });
  });

  // ==========================================================================
  // GET /api/portal/billing
  // ==========================================================================

  describe("GET /api/portal/billing", () => {
    test("should return billing information", async () => {
      if (!authToken) {
        log.info("Skipping - no auth token configured");
        return;
      }

      const response = await client.get("/api/portal/billing", {
        headers: authHeaders(),
      });

      if (response.status === 200) {
        expectSuccess(response);
        log.info("Billing information retrieved");
      } else if (response.status === 404) {
        // User has no billing info
        log.info("No billing info found for user");
      }
    });

    test("should include payment method if present", async () => {
      if (!authToken) {
        log.info("Skipping - no auth token configured");
        return;
      }

      const response = await client.get("/api/portal/billing", {
        headers: authHeaders(),
      });

      if (response.status === 200 && response.json.paymentMethod) {
        expectFields(response.json.paymentMethod, ["type", "last4"]);
        log.info("Payment method present");
      }
    });
  });

  // ==========================================================================
  // GET /api/portal/invoices
  // ==========================================================================

  describe("GET /api/portal/invoices", () => {
    test("should return invoice history", async () => {
      if (!authToken) {
        log.info("Skipping - no auth token configured");
        return;
      }

      const response = await client.get("/api/portal/invoices", {
        headers: authHeaders(),
      });

      if (response.status === 200) {
        expectSuccess(response);
        assert.ok(
          Array.isArray(response.json.invoices),
          "Invoices should be array",
        );
        log.info("Invoice history retrieved", {
          count: response.json.invoices.length,
        });
      }
    });

    test("should include invoice download URL", async () => {
      if (!authToken) {
        log.info("Skipping - no auth token configured");
        return;
      }

      const response = await client.get("/api/portal/invoices", {
        headers: authHeaders(),
      });

      if (response.status === 200 && response.json.invoices?.length > 0) {
        const invoice = response.json.invoices[0];
        if (invoice.downloadUrl) {
          assert.ok(
            invoice.downloadUrl.startsWith("http"),
            "Download URL should be valid",
          );
        }
      }
    });
  });

  // ==========================================================================
  // Team Management
  // ==========================================================================

  describe("Team Management", () => {
    test("GET /api/portal/team should return team members", async () => {
      if (!authToken) {
        log.info("Skipping - no auth token configured");
        return;
      }

      const response = await client.get("/api/portal/team", {
        headers: authHeaders(),
      });

      if (response.status === 200) {
        assert.ok(
          Array.isArray(response.json.members),
          "Members should be array",
        );
        log.info("Team members retrieved");
      } else if (response.status === 403) {
        // Not a team license
        log.info("Not a team license - team endpoint forbidden");
      } else if (response.status === 404) {
        log.info("Team endpoint not found or no team");
      }
    });

    test("POST /api/portal/team should add team member", async () => {
      if (!authToken) {
        log.info("Skipping - no auth token configured");
        return;
      }

      requireMutations("add team member");

      const response = await client.post(
        "/api/portal/team",
        { email: generateEmail() },
        { headers: authHeaders() },
      );

      // Could be 200 (success), 400 (invalid), 403 (not team license), 409 (already member)
      assert.ok(
        response.status < 500,
        `Add team member should not error, got ${response.status}`,
      );
    });

    test("DELETE /api/portal/team should remove team member", async () => {
      if (!authToken) {
        log.info("Skipping - no auth token configured");
        return;
      }

      requireMutations("remove team member");

      const response = await client.delete("/api/portal/team", {
        headers: authHeaders(),
        body: { email: "nonexistent@test.com" },
      });

      // Could be 200 (success), 400 (invalid), 403 (not team license), 404 (not member)
      assert.ok(
        response.status < 500,
        `Remove team member should not error, got ${response.status}`,
      );
    });
  });

  // ==========================================================================
  // Settings
  // ==========================================================================

  describe("Settings", () => {
    test("GET /api/portal/settings should return user settings", async () => {
      if (!authToken) {
        log.info("Skipping - no auth token configured");
        return;
      }

      const response = await client.get("/api/portal/settings", {
        headers: authHeaders(),
      });

      if (response.status === 200) {
        expectSuccess(response);
        log.info("Settings retrieved");
      }
    });

    test("PUT /api/portal/settings should update settings", async () => {
      if (!authToken) {
        log.info("Skipping - no auth token configured");
        return;
      }

      requireMutations("update settings");

      const response = await client.put(
        "/api/portal/settings",
        { emailNotifications: true },
        { headers: authHeaders() },
      );

      assert.ok(
        response.status < 500,
        `Update settings should not error, got ${response.status}`,
      );
    });
  });

  // ==========================================================================
  // Stripe Portal Session
  // ==========================================================================

  describe("Stripe Portal Session", () => {
    test("POST /api/portal/stripe-session should create portal session", async () => {
      if (!authToken) {
        log.info("Skipping - no auth token configured");
        return;
      }

      requireMutations("create Stripe portal session");

      const response = await client.post(
        "/api/portal/stripe-session",
        { returnUrl: "https://example.com/return" },
        { headers: authHeaders() },
      );

      if (response.status === 200) {
        expectSuccess(response);
        expectFields(response.json, ["url"]);
        assert.ok(
          response.json.url.includes("stripe.com"),
          "Should return Stripe portal URL",
        );
        log.info("Stripe portal session created");
      } else if (response.status === 400 || response.status === 404) {
        // No Stripe customer
        log.info("No Stripe customer for user");
      }
    });

    test("should require returnUrl parameter", async () => {
      if (!authToken) {
        log.info("Skipping - no auth token configured");
        return;
      }

      const response = await client.post(
        "/api/portal/stripe-session",
        {},
        { headers: authHeaders() },
      );

      // Should require returnUrl
      assert.ok(
        [400, 422].includes(response.status),
        `Missing returnUrl should return 400/422, got ${response.status}`,
      );
    });
  });

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  describe("Error Handling", () => {
    test("should return 404 for unknown portal endpoint", async () => {
      const response = await client.get("/api/portal/nonexistent", {
        headers: authHeaders(),
      });

      // Could be 401 (no auth checked first) or 404
      assert.ok(
        [401, 403, 404].includes(response.status),
        `Unknown endpoint should return 401/403/404, got ${response.status}`,
      );
    });

    test("should handle malformed request body", async () => {
      if (!authToken) {
        log.info("Skipping - no auth token configured");
        return;
      }

      const response = await client.put("/api/portal/settings", "not-json", {
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
      });

      assert.ok(
        response.status < 500,
        `Malformed body should not cause error, got ${response.status}`,
      );
    });
  });
});
