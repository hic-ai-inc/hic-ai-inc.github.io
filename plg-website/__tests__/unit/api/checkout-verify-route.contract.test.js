/**
 * Checkout Verify Route Contract Tests
 *
 * Validates the first endpoint migration pattern to structured logging adapter.
 */

import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
} from "../../../../dm/facade/test-helpers/index.js";

import { GET } from "../../../src/app/api/checkout/verify/route.js";
import {
  __setStripeClientForTests,
  __resetStripeClientForTests,
} from "../../../src/lib/stripe.js";
import {
  __setLoggerFactoryForTests,
  __resetLoggerFactoryForTests,
} from "../../../src/lib/api-log.js";

function createMockRequest(url) {
  return {
    method: "GET",
    url,
    headers: {
      get(name) {
        if (String(name).toLowerCase() === "x-hic-probe-id") {
          return "probe-checkout-verify";
        }
        return null;
      },
    },
  };
}

function createMockLoggerStore() {
  const entries = [];

  class MockLogger {
    constructor(service, correlationId) {
      this.service = service;
      this.correlationId = correlationId || "generated-correlation-id";
    }

    logIntegrationEvent(event, message, metadata) {
      entries.push({ level: "INFO", event, message, metadata });
    }

    warn(message, metadata) {
      entries.push({ level: "WARN", event: "warning", message, metadata });
    }

    error(message, error, metadata) {
      entries.push({
        level: "ERROR",
        event: "error",
        message,
        error,
        metadata,
      });
    }

    debug(message, metadata) {
      entries.push({ level: "DEBUG", event: "debug", message, metadata });
    }
  }

  return { entries, MockLogger };
}

describe("checkout verify route structured logging", () => {
  let loggerStore;

  beforeEach(() => {
    loggerStore = createMockLoggerStore();
    __setLoggerFactoryForTests(
      (service, correlationId) => new loggerStore.MockLogger(service, correlationId),
    );
  });

  afterEach(() => {
    __resetStripeClientForTests();
    __resetLoggerFactoryForTests();
  });

  test("returns 400 when session_id is missing and logs validation decision", async () => {
    const response = await GET(
      createMockRequest("https://hic-ai.com/api/checkout/verify"),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Session ID is required");

    expect(
      loggerStore.entries.some(
        (entry) => entry.event === "request_received" && entry.level === "INFO",
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.event === "validation_failed" &&
          entry.message.includes("Missing required session_id"),
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.level === "WARN" &&
          entry.message.includes("Checkout verify rejected"),
      ),
    ).toBe(true);
  });

  test("returns 400 for unpaid session and logs payment_not_completed branch", async () => {
    __setStripeClientForTests({
      checkout: {
        sessions: {
          retrieve: async () => ({
            payment_status: "unpaid",
            metadata: { planType: "individual" },
          }),
        },
      },
    });

    const response = await GET(
      createMockRequest(
        "https://hic-ai.com/api/checkout/verify?session_id=cs_test_unpaid",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Payment not completed");

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.event === "payment_not_completed" &&
          entry.message.includes("Checkout session is not paid"),
      ),
    ).toBe(true);
  });

  test("returns 200 for paid session and logs success response", async () => {
    __setStripeClientForTests({
      checkout: {
        sessions: {
          retrieve: async () => ({
            payment_status: "paid",
            customer_email: "user@example.com",
            customer: "cus_123",
            subscription: { id: "sub_123" },
            metadata: { planType: "individual" },
          }),
        },
      },
    });

    const response = await GET(
      createMockRequest(
        "https://hic-ai.com/api/checkout/verify?session_id=cs_test_paid",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.valid).toBe(true);
    expect(body.planType).toBe("individual");

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.event === "response" &&
          entry.level === "INFO" &&
          entry.message.includes("Checkout verify succeeded"),
      ),
    ).toBe(true);
  });

  test("returns 400 for Stripe invalid request and logs exception", async () => {
    __setStripeClientForTests({
      checkout: {
        sessions: {
          retrieve: async () => {
            const error = new Error("No such checkout session");
            error.type = "StripeInvalidRequestError";
            throw error;
          },
        },
      },
    });

    const response = await GET(
      createMockRequest(
        "https://hic-ai.com/api/checkout/verify?session_id=cs_test_invalid",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid session ID");

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.level === "ERROR" &&
          entry.message.includes("Checkout verify failed"),
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.level === "WARN" &&
          entry.message.includes("Checkout verify invalid session"),
      ),
    ).toBe(true);
  });
});


// ============================================================================
// Task 15A — 4-Policy plan name display verification
// Tests all four plan type × billing cycle combinations for the checkout verify route.
// ============================================================================

describe("checkout verify route — 4-policy plan name display (Task 15A)", () => {
  let loggerStore;

  beforeEach(() => {
    loggerStore = createMockLoggerStore();
    __setLoggerFactoryForTests(
      (service, correlationId) => new loggerStore.MockLogger(service, correlationId),
    );
  });

  afterEach(() => {
    __resetStripeClientForTests();
    __resetLoggerFactoryForTests();
  });

  function mockPaidSession(metadata = {}) {
    __setStripeClientForTests({
      checkout: {
        sessions: {
          retrieve: async () => ({
            payment_status: "paid",
            customer_email: "test@example.com",
            customer: "cus_test",
            subscription: { id: "sub_test" },
            metadata,
          }),
        },
      },
    });
  }

  test("returns 'Individual Monthly' for individual plan with monthly billing", async () => {
    mockPaidSession({ planType: "individual", billingCycle: "monthly" });

    const response = await GET(
      createMockRequest("https://hic-ai.com/api/checkout/verify?session_id=cs_im"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.planName).toBe("Individual Monthly");
    expect(body.planType).toBe("individual");
  });

  test("returns 'Individual Annual' for individual plan with annual billing", async () => {
    mockPaidSession({ planType: "individual", billingCycle: "annual" });

    const response = await GET(
      createMockRequest("https://hic-ai.com/api/checkout/verify?session_id=cs_ia"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.planName).toBe("Individual Annual");
    expect(body.planType).toBe("individual");
  });

  test("returns 'Business Monthly' for business plan with monthly billing", async () => {
    mockPaidSession({ planType: "business", billingCycle: "monthly" });

    const response = await GET(
      createMockRequest("https://hic-ai.com/api/checkout/verify?session_id=cs_bm"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.planName).toBe("Business Monthly");
    expect(body.planType).toBe("business");
  });

  test("returns 'Business Annual' for business plan with annual billing", async () => {
    mockPaidSession({ planType: "business", billingCycle: "annual" });

    const response = await GET(
      createMockRequest("https://hic-ai.com/api/checkout/verify?session_id=cs_ba"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.planName).toBe("Business Annual");
    expect(body.planType).toBe("business");
  });

  test("defaults to 'Individual Monthly' when metadata is missing", async () => {
    mockPaidSession({});

    const response = await GET(
      createMockRequest("https://hic-ai.com/api/checkout/verify?session_id=cs_default"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.planName).toBe("Individual Monthly");
    expect(body.planType).toBe("individual");
  });

  test("defaults billingCycle to Monthly when only planType is set", async () => {
    mockPaidSession({ planType: "business" });

    const response = await GET(
      createMockRequest("https://hic-ai.com/api/checkout/verify?session_id=cs_biz_no_cycle"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.planName).toBe("Business Monthly");
  });

  test("defaults planType to individual when only billingCycle is set", async () => {
    mockPaidSession({ billingCycle: "annual" });

    const response = await GET(
      createMockRequest("https://hic-ai.com/api/checkout/verify?session_id=cs_annual_no_plan"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.planName).toBe("Individual Annual");
    expect(body.planType).toBe("individual");
  });
});

// ============================================================================
// Task 15A — email fallback edge cases
// Verifies customer_email || customer_details?.email fallback (route.js line 76)
// ============================================================================

describe("checkout verify route — email fallback (Task 15A)", () => {
  let loggerStore;

  beforeEach(() => {
    loggerStore = createMockLoggerStore();
    __setLoggerFactoryForTests(
      (service, correlationId) => new loggerStore.MockLogger(service, correlationId),
    );
  });

  afterEach(() => {
    __resetStripeClientForTests();
    __resetLoggerFactoryForTests();
  });

  test("falls back to customer_details.email when customer_email is null", async () => {
    __setStripeClientForTests({
      checkout: {
        sessions: {
          retrieve: async () => ({
            payment_status: "paid",
            customer_email: null,
            customer_details: { email: "fallback@example.com" },
            customer: "cus_test",
            subscription: { id: "sub_test" },
            metadata: {},
          }),
        },
      },
    });

    const response = await GET(
      createMockRequest("https://hic-ai.com/api/checkout/verify?session_id=cs_no_email"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.email).toBe("fallback@example.com");
  });

  test("returns undefined email when both customer_email and customer_details are absent", async () => {
    __setStripeClientForTests({
      checkout: {
        sessions: {
          retrieve: async () => ({
            payment_status: "paid",
            customer_email: null,
            customer: "cus_test",
            subscription: { id: "sub_test" },
            metadata: {},
          }),
        },
      },
    });

    const response = await GET(
      createMockRequest("https://hic-ai.com/api/checkout/verify?session_id=cs_no_details"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.email).toBe(undefined);
  });
});


