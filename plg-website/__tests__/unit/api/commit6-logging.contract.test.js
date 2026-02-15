/**
 * Commit 6 Logging Contract Tests
 *
 * Validates structured logging behavior for:
 * - webhooks/stripe (POST)
 * - webhooks/keygen (POST)
 */

import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
} from "../../../../dm/facade/test-helpers/index.js";

import { POST as postStripeWebhook } from "../../../src/app/api/webhooks/stripe/route.js";
import { POST as postKeygenWebhook } from "../../../src/app/api/webhooks/keygen/route.js";

import {
  __setLoggerFactoryForTests,
  __resetLoggerFactoryForTests,
} from "../../../src/lib/api-log.js";
import {
  __setStripeClientForTests,
  __resetStripeClientForTests,
} from "../../../src/lib/stripe.js";

function createMockRequest({
  method = "POST",
  url = "https://hic-ai.com/api/test",
  headers = {},
  textBody = "",
  textThrows = null,
} = {}) {
  const headerMap = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );

  return {
    method,
    url,
    headers: {
      get(name) {
        return headerMap.get(String(name).toLowerCase()) ?? null;
      },
    },
    async text() {
      if (textThrows) {
        throw textThrows;
      }
      return textBody;
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
      entries.push({
        level: "INFO",
        service: this.service,
        event,
        message,
        metadata,
      });
    }

    warn(message, metadata) {
      entries.push({
        level: "WARN",
        service: this.service,
        event: metadata?.event || "warning",
        message,
        metadata,
      });
    }

    error(message, error, metadata) {
      entries.push({
        level: "ERROR",
        service: this.service,
        event: metadata?.event || "error",
        message,
        error,
        metadata,
      });
    }

    debug(message, metadata) {
      entries.push({
        level: "DEBUG",
        service: this.service,
        event: metadata?.event || "debug",
        message,
        metadata,
      });
    }
  }

  return { entries, MockLogger };
}

describe("commit 6 structured logging contract", () => {
  let loggerStore;

  beforeEach(() => {
    loggerStore = createMockLoggerStore();

    __resetLoggerFactoryForTests();
    __resetStripeClientForTests();

    __setLoggerFactoryForTests(
      (service, correlationId) =>
        new loggerStore.MockLogger(service, correlationId),
    );
  });

  afterEach(() => {
    __resetLoggerFactoryForTests();
    __resetStripeClientForTests();
  });

  test("webhooks/stripe logs signature_missing + warning response", async () => {
    __setStripeClientForTests({
      webhooks: {
        constructEvent: () => {
          throw new Error("should not be called when signature missing");
        },
      },
    });

    const response = await postStripeWebhook(
      createMockRequest({
        method: "POST",
        url: "https://hic-ai.com/api/webhooks/stripe",
        textBody: "{}",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Missing stripe-signature header");

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-webhooks-stripe" &&
          entry.event === "request_received" &&
          entry.metadata?.operation === "webhook_stripe",
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-webhooks-stripe" &&
          entry.level === "INFO" &&
          entry.event === "signature_missing" &&
          entry.message.includes("Stripe webhook rejected"),
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-webhooks-stripe" &&
          entry.level === "WARN" &&
          entry.message.includes("Stripe webhook rejected") &&
          entry.metadata?.statusCode === 400,
      ),
    ).toBe(true);
  });

  test("webhooks/keygen logs signature verification failure contract", async () => {
    const response = await postKeygenWebhook(
      createMockRequest({
        method: "POST",
        url: "https://hic-ai.com/api/webhooks/keygen",
        headers: {
          "keygen-signature":
            'keyid="test" algorithm="ed25519" signature="bad" headers="(request-target) host date digest"',
          host: "hic-ai.com",
          date: new Date().toUTCString(),
        },
        textBody: JSON.stringify({
          meta: { event: "license.created" },
          data: { id: "lic_123" },
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Invalid signature");

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-webhooks-keygen" &&
          entry.event === "request_received" &&
          entry.metadata?.operation === "webhook_keygen",
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-webhooks-keygen" &&
          entry.level === "ERROR" &&
          entry.event === "webhook_public_key_missing",
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-webhooks-keygen" &&
          entry.level === "INFO" &&
          entry.event === "signature_invalid" &&
          entry.message.includes("Invalid Keygen webhook signature"),
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-webhooks-keygen" &&
          entry.level === "WARN" &&
          entry.message.includes("Keygen webhook rejected") &&
          entry.metadata?.statusCode === 401,
      ),
    ).toBe(true);
  });

  test("webhooks/keygen logs exception + error response when payload read fails", async () => {
    const response = await postKeygenWebhook(
      createMockRequest({
        method: "POST",
        url: "https://hic-ai.com/api/webhooks/keygen",
        textThrows: new Error("payload stream failed"),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Webhook processing failed");

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-webhooks-keygen" &&
          entry.level === "ERROR" &&
          entry.event === "keygen_webhook_failed" &&
          entry.message.includes("Keygen webhook processing failed"),
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-webhooks-keygen" &&
          entry.level === "ERROR" &&
          entry.message.includes("Keygen webhook processing failed") &&
          entry.metadata?.statusCode === 500,
      ),
    ).toBe(true);
  });
});
