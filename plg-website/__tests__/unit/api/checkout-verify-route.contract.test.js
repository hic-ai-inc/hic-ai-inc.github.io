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

