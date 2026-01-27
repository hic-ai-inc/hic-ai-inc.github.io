/**
 * Unit tests for plg-metrics.js
 *
 * Tests the PLG metrics dashboard script using mocked HTTP responses.
 * Uses dm/facade/test-helpers for Jest-like testing without dependencies.
 */

import {
  getDateRange,
  stripeRequest,
  getStripeMetrics,
  keygenRequest,
  getKeygenMetrics,
  generateReport,
  formatReport,
  config,
  __setHttpsRequestForTests,
  __resetHttpsRequestForTests,
  __setConfigForTests,
  __resetConfigForTests,
} from "../../../scripts/plg-metrics.js";

import { expect } from "../../lib/test-kit.js";
import { createSpy } from "../../lib/test-kit.js";

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create a mock HTTP response
 */
function mockHttpResponse(status, data) {
  return Promise.resolve({ status, data });
}

/**
 * Setup mocks before tests
 */
function setupMocks() {
  // Set test config so API calls don't fail on missing env vars
  __setConfigForTests({
    stripe: { apiKey: "sk_test_mock_key" },
    keygen: { accountId: "test-account", productToken: "test-token" },
  });
}

/**
 * Cleanup mocks after tests
 */
function cleanupMocks() {
  __resetHttpsRequestForTests();
  __resetConfigForTests();
}

// ============================================================================
// getDateRange() Tests
// ============================================================================

console.log("\n=== getDateRange() Tests ===\n");

// Test 1: Default 30-day range
{
  const result = getDateRange("30d");
  expect(result.days).toBe(30);
  expect(typeof result.startTimestamp).toBe("number");
  expect(typeof result.endTimestamp).toBe("number");
  expect(result.endTimestamp).toBeGreaterThan(result.startTimestamp);
  expect(result.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(result.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  console.log("✓ getDateRange: parses 30d correctly");
}

// Test 2: 7-day range
{
  const result = getDateRange("7d");
  expect(result.days).toBe(7);
  const diff = result.endTimestamp - result.startTimestamp;
  const expectedDiff = 7 * 24 * 60 * 60; // 7 days in seconds
  expect(diff).toBeCloseTo(expectedDiff, 1000); // Allow 1000s tolerance
  console.log("✓ getDateRange: parses 7d correctly");
}

// Test 3: 90-day range
{
  const result = getDateRange("90d");
  expect(result.days).toBe(90);
  console.log("✓ getDateRange: parses 90d correctly");
}

// Test 4: Invalid period defaults to 30
{
  const result = getDateRange("invalid");
  expect(result.days).toBe(30);
  console.log("✓ getDateRange: defaults to 30d for invalid input");
}

// Test 5: Empty string defaults to 30
{
  const result = getDateRange("");
  expect(result.days).toBe(30);
  console.log("✓ getDateRange: defaults to 30d for empty string");
}

// ============================================================================
// stripeRequest() Tests
// ============================================================================

console.log("\n=== stripeRequest() Tests ===\n");

// Test 6: Returns error when API key not set
{
  __resetConfigForTests();
  // Temporarily clear the API key
  const originalKey = config.stripe.apiKey;
  config.stripe.apiKey = null;

  const result = await stripeRequest("subscriptions");
  expect(result.error).toBe("STRIPE_SECRET_KEY not set");
  console.log("✓ stripeRequest: returns error when API key not set");

  // Restore
  config.stripe.apiKey = originalKey;
}

// Test 7: Successful Stripe request
{
  setupMocks();

  const mockData = {
    data: [
      { id: "sub_123", status: "active" },
      { id: "sub_456", status: "trialing" },
    ],
  };

  __setHttpsRequestForTests((options) => {
    expect(options.hostname).toBe("api.stripe.com");
    expect(options.path).toContain("/v1/subscriptions");
    expect(options.headers.Authorization).toContain("Bearer ");
    return mockHttpResponse(200, mockData);
  });

  const result = await stripeRequest("subscriptions", { limit: 10 });
  expect(result.data).toHaveLength(2);
  expect(result.data[0].status).toBe("active");
  console.log("✓ stripeRequest: makes correct API call and returns data");

  cleanupMocks();
}

// Test 8: Stripe request handles HTTP errors
{
  setupMocks();

  __setHttpsRequestForTests(() =>
    mockHttpResponse(401, { error: { message: "Invalid API key" } }),
  );

  const result = await stripeRequest("subscriptions");
  expect(result.error).toBe("Invalid API key");
  console.log("✓ stripeRequest: handles HTTP error responses");

  cleanupMocks();
}

// ============================================================================
// getStripeMetrics() Tests
// ============================================================================

console.log("\n=== getStripeMetrics() Tests ===\n");

// Test 9: Returns metrics structure with mocked data
{
  setupMocks();

  const now = Math.floor(Date.now() / 1000);
  const weekAgo = now - 86400 * 7;

  // Mock all Stripe API calls
  const mockResponses = {
    subscriptions: {
      data: [
        { id: "sub_1", status: "active", created: now - 86400 * 60 },
        { id: "sub_2", status: "active", created: now - 86400 * 20 },
        { id: "sub_3", status: "trialing", created: now - 86400 * 5 },
        {
          id: "sub_4",
          status: "canceled",
          created: now - 86400 * 90,
          canceled_at: now - 86400 * 10,
        },
      ],
    },
    charges: {
      data: [
        { amount: 1000, status: "succeeded", refunded: false, created: now },
        {
          amount: 2000,
          status: "succeeded",
          refunded: false,
          created: weekAgo + 86400,
        },
        {
          amount: 500,
          status: "succeeded",
          refunded: true,
          created: now - 86400,
        }, // Refunded, should not count
      ],
    },
    "checkout/sessions": {
      data: [
        { payment_status: "paid", status: "complete" },
        { payment_status: "paid", status: "complete" },
        { payment_status: "unpaid", status: "expired" },
      ],
    },
    customers: {
      data: [{ id: "cus_1" }],
    },
  };

  __setHttpsRequestForTests((options) => {
    const path = options.path;
    if (path.includes("/subscriptions")) {
      return mockHttpResponse(200, mockResponses.subscriptions);
    } else if (path.includes("/charges")) {
      return mockHttpResponse(200, mockResponses.charges);
    } else if (path.includes("/checkout/sessions")) {
      return mockHttpResponse(200, mockResponses["checkout/sessions"]);
    } else if (path.includes("/customers")) {
      return mockHttpResponse(200, mockResponses.customers);
    }
    return mockHttpResponse(404, { error: { message: "Not found" } });
  });

  const dateRange = getDateRange("30d");
  const result = await getStripeMetrics(dateRange);

  // Check subscriptions
  expect(result.subscriptions.active).toBe(2);
  expect(result.subscriptions.trialing).toBe(1);
  expect(result.subscriptions.canceled).toBe(1);

  // Check checkouts
  expect(result.checkouts.completed).toBe(2);
  expect(result.checkouts.abandoned).toBe(1);

  // Check revenue (only non-refunded charges count)
  expect(result.revenue.total).toBe(30); // $10 + $20 = $30

  console.log("✓ getStripeMetrics: returns correct metrics from mocked data");

  cleanupMocks();
}

// Test 10: getStripeMetrics handles API errors gracefully
{
  setupMocks();

  __setHttpsRequestForTests(() =>
    mockHttpResponse(500, { error: { message: "Server error" } }),
  );

  const dateRange = getDateRange("30d");
  const result = await getStripeMetrics(dateRange);

  expect(result.error).toBe("Server error");
  expect(result.metrics).toBeDefined();
  console.log("✓ getStripeMetrics: handles API errors gracefully");

  cleanupMocks();
}

// ============================================================================
// keygenRequest() Tests
// ============================================================================

console.log("\n=== keygenRequest() Tests ===\n");

// Test 11: Returns error when credentials not set
{
  __resetConfigForTests();
  config.keygen.accountId = null;

  const result = await keygenRequest("licenses");
  expect(result.error).toContain("not set");
  console.log("✓ keygenRequest: returns error when credentials not set");
}

// Test 12: Successful KeyGen request
{
  setupMocks();

  const mockData = {
    data: [
      { id: "lic_123", attributes: { status: "ACTIVE" } },
      { id: "lic_456", attributes: { status: "INACTIVE" } },
    ],
  };

  __setHttpsRequestForTests((options) => {
    expect(options.hostname).toBe("api.keygen.sh");
    expect(options.path).toContain("/licenses");
    expect(options.headers.Accept).toBe("application/vnd.api+json");
    return mockHttpResponse(200, mockData);
  });

  const result = await keygenRequest("licenses");
  expect(result.data).toHaveLength(2);
  console.log("✓ keygenRequest: makes correct API call and returns data");

  cleanupMocks();
}

// ============================================================================
// getKeygenMetrics() Tests
// ============================================================================

console.log("\n=== getKeygenMetrics() Tests ===\n");

// Test 13: Returns metrics structure with mocked data
{
  setupMocks();

  const now = new Date();
  // Use dates that are clearly within each bucket
  const hourAgo = new Date(now - 3600000).toISOString(); // 1 hour ago (today)
  const threeDaysAgo = new Date(now - 86400000 * 3).toISOString(); // 3 days ago (this week)
  const twoMonthsAgo = new Date(now - 86400000 * 60).toISOString(); // 60 days ago (outside month)

  const mockResponses = {
    licenses: {
      data: [
        { id: "lic_1", attributes: { status: "ACTIVE" } },
        { id: "lic_2", attributes: { status: "ACTIVE" } },
        { id: "lic_3", attributes: { status: "INACTIVE" } },
        { id: "lic_4", attributes: { status: "EXPIRED" } },
      ],
    },
    machines: {
      data: [
        { id: "mach_1", attributes: { created: hourAgo } }, // counts as today, thisWeek, thisMonth
        { id: "mach_2", attributes: { created: threeDaysAgo } }, // counts as thisWeek, thisMonth
        { id: "mach_3", attributes: { created: twoMonthsAgo } }, // doesn't count
      ],
    },
  };

  __setHttpsRequestForTests((options) => {
    if (options.path.includes("/licenses")) {
      return mockHttpResponse(200, mockResponses.licenses);
    } else if (options.path.includes("/machines")) {
      return mockHttpResponse(200, mockResponses.machines);
    }
    return mockHttpResponse(404, { errors: [{ detail: "Not found" }] });
  });

  const result = await getKeygenMetrics();

  // Check licenses
  expect(result.licenses.total).toBe(4);
  expect(result.licenses.active).toBe(2);
  expect(result.licenses.inactive).toBe(1);
  expect(result.licenses.expired).toBe(1);

  // Check machines
  expect(result.machines.total).toBe(3);
  expect(result.machines.activated).toBe(3);

  // Check activations (1 today, 2 this week, 2 this month)
  expect(result.activations.today).toBe(1);
  expect(result.activations.thisWeek).toBe(2);
  expect(result.activations.thisMonth).toBe(2);

  console.log("✓ getKeygenMetrics: returns correct metrics from mocked data");

  cleanupMocks();
}

// ============================================================================
// generateReport() Tests
// ============================================================================

console.log("\n=== generateReport() Tests ===\n");

// Test 14: Generates complete report with all metrics
{
  setupMocks();

  const now = Math.floor(Date.now() / 1000);

  // Comprehensive mock for full report
  __setHttpsRequestForTests((options) => {
    const path = options.path;
    const hostname = options.hostname;

    // Stripe mocks
    if (hostname === "api.stripe.com") {
      if (path.includes("/subscriptions")) {
        return mockHttpResponse(200, {
          data: [
            { status: "active", created: now - 86400 * 60 },
            { status: "active", created: now - 86400 * 20 },
          ],
        });
      }
      if (path.includes("/charges")) {
        return mockHttpResponse(200, {
          data: [
            {
              amount: 5000,
              status: "succeeded",
              refunded: false,
              created: now,
            },
          ],
        });
      }
      if (path.includes("/checkout/sessions")) {
        return mockHttpResponse(200, {
          data: [
            { payment_status: "paid" },
            { payment_status: "unpaid", status: "expired" },
          ],
        });
      }
      if (path.includes("/customers")) {
        return mockHttpResponse(200, { data: [] });
      }
    }

    // KeyGen mocks
    if (hostname === "api.keygen.sh") {
      if (path.includes("/licenses")) {
        return mockHttpResponse(200, {
          data: [{ attributes: { status: "ACTIVE" } }],
        });
      }
      if (path.includes("/machines")) {
        return mockHttpResponse(200, {
          data: [{ attributes: { created: new Date().toISOString() } }],
        });
      }
    }

    return mockHttpResponse(200, { data: [] });
  });

  const dateRange = getDateRange("30d");
  const report = await generateReport(dateRange);

  // Check report structure
  expect(report.generated).toBeDefined();
  expect(report.period).toContain("30 days");
  expect(report.coreMetrics).toBeDefined();
  expect(report.stripe).toBeDefined();
  expect(report.keygen).toBeDefined();
  expect(report.errors).toBeInstanceOf(Array);

  // Check core metrics
  expect(report.coreMetrics.checkoutStarted).toBe(2); // 1 completed + 1 abandoned
  expect(report.coreMetrics.checkoutCompleted).toBe(1);
  expect(report.coreMetrics.conversions).toBe(2); // 2 active subs

  console.log("✓ generateReport: generates complete report with core metrics");

  cleanupMocks();
}

// Test 15: Report handles errors from both sources
{
  setupMocks();

  __setHttpsRequestForTests(() =>
    mockHttpResponse(500, { error: { message: "API unavailable" } }),
  );

  const dateRange = getDateRange("30d");
  const report = await generateReport(dateRange);

  expect(report.errors.length).toBeGreaterThan(0);
  expect(report.errors[0]).toContain("Stripe");
  console.log("✓ generateReport: captures errors from failing APIs");

  cleanupMocks();
}

// ============================================================================
// formatReport() Tests
// ============================================================================

console.log("\n=== formatReport() Tests ===\n");

// Test 16: Formats report as human-readable text
{
  const mockReport = {
    generated: "2025-01-24T12:00:00.000Z",
    period: "30 days (2024-12-25 to 2025-01-24)",
    coreMetrics: {
      visitors: "N/A",
      pricingPageViews: "N/A",
      checkoutStarted: 10,
      checkoutCompleted: 7,
      trialActivations: 15,
      conversions: 5,
      churn: { count: 2, rate: "4.5%" },
    },
    stripe: {
      revenue: { today: 0, thisWeek: 150, thisMonth: 500 },
      subscriptions: { active: 5, trialing: 3, pastDue: 0, canceled: 2 },
      checkouts: { completed: 7, abandoned: 3 },
    },
    keygen: {
      licenses: {
        total: 20,
        active: 15,
        inactive: 3,
        suspended: 0,
        expired: 2,
      },
      machines: { total: 25, activated: 25 },
      activations: { today: 2, thisWeek: 8, thisMonth: 15 },
    },
    errors: [],
  };

  const formatted = formatReport(mockReport);

  // Check that it contains expected sections
  expect(formatted).toContain("PLG METRICS DASHBOARD");
  expect(formatted).toContain("7 CORE PLG METRICS");
  expect(formatted).toContain("STRIPE (PAYMENTS)");
  expect(formatted).toContain("KEYGEN (LICENSES)");

  // Check that values are present
  expect(formatted).toContain("Checkout Started");
  expect(formatted).toContain("10");
  expect(formatted).toContain("Conversions");
  expect(formatted).toContain("5");
  expect(formatted).toContain("4.5%");

  console.log("✓ formatReport: generates readable dashboard output");
}

// Test 17: Formats report with errors
{
  const mockReport = {
    generated: "2025-01-24T12:00:00.000Z",
    period: "30 days",
    coreMetrics: {
      visitors: "N/A",
      pricingPageViews: "N/A",
      checkoutStarted: 0,
      checkoutCompleted: 0,
      trialActivations: 0,
      conversions: 0,
      churn: { count: 0, rate: "N/A" },
    },
    stripe: { error: "STRIPE_SECRET_KEY not set" },
    keygen: { error: "KEYGEN_ACCOUNT_ID not set" },
    errors: [
      "Stripe: STRIPE_SECRET_KEY not set",
      "KeyGen: KEYGEN_ACCOUNT_ID not set",
    ],
  };

  const formatted = formatReport(mockReport);

  expect(formatted).toContain("Stripe Error");
  expect(formatted).toContain("KeyGen Error");
  expect(formatted).toContain("ERRORS");

  console.log("✓ formatReport: displays errors in formatted output");
}

// ============================================================================
// Summary
// ============================================================================

console.log("\n=== Test Summary ===\n");
console.log("All tests passed! ✅");
console.log(
  "\nNote: These tests use mock data. Run 'npm run metrics' with real API keys to test against live APIs.",
);
