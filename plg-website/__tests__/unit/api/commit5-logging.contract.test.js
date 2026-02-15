/**
 * Commit 5 Logging Contract Tests
 *
 * Validates structured logging behavior for:
 * - provision-license (POST)
 * - admin/provision-test-license (POST/GET)
 */

import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
} from "../../../../dm/facade/test-helpers/index.js";

import { POST as postProvisionLicense } from "../../../src/app/api/provision-license/route.js";
import {
  POST as postAdminProvisionTestLicense,
  GET as getAdminProvisionTestLicense,
} from "../../../src/app/api/admin/provision-test-license/route.js";

import {
  __setVerifyAuthTokenForTests,
  __resetVerifyAuthTokenForTests,
} from "../../../src/lib/auth-verify.js";
import {
  __setLoggerFactoryForTests,
  __resetLoggerFactoryForTests,
} from "../../../src/lib/api-log.js";
import {
  __setStripeClientForTests,
  __resetStripeClientForTests,
} from "../../../src/lib/stripe.js";

function createMockRequest({
  method = "GET",
  url = "https://hic-ai.com/api/test",
  headers = {},
  jsonBody = {},
  jsonThrows = null,
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
    async json() {
      if (jsonThrows) {
        throw jsonThrows;
      }
      return jsonBody;
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

describe("commit 5 structured logging contract", () => {
  let loggerStore;

  beforeEach(() => {
    loggerStore = createMockLoggerStore();

    __resetVerifyAuthTokenForTests();
    __resetLoggerFactoryForTests();
    __resetStripeClientForTests();

    __setLoggerFactoryForTests(
      (service, correlationId) =>
        new loggerStore.MockLogger(service, correlationId),
    );
  });

  afterEach(() => {
    __resetVerifyAuthTokenForTests();
    __resetLoggerFactoryForTests();
    __resetStripeClientForTests();
  });

  test("provision-license logs auth_failed + warning response when unauthorized", async () => {
    __setVerifyAuthTokenForTests(() => null);

    const response = await postProvisionLicense(
      createMockRequest({
        method: "POST",
        url: "https://hic-ai.com/api/provision-license",
        jsonBody: { sessionId: "cs_test_123" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Authentication required");

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-provision-license" &&
          entry.event === "request_received" &&
          entry.metadata?.operation === "provision_license",
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-provision-license" &&
          entry.level === "INFO" &&
          entry.event === "auth_failed" &&
          entry.message.includes("Provision license rejected"),
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-provision-license" &&
          entry.level === "WARN" &&
          entry.message.includes("Provision license rejected") &&
          entry.metadata?.statusCode === 401,
      ),
    ).toBe(true);
  });

  test("provision-license logs session_id_missing + warning response", async () => {
    __setVerifyAuthTokenForTests(() => ({
      sub: "user_provision_1",
      email: "provision@example.com",
      "cognito:username": "provision-user",
    }));

    const response = await postProvisionLicense(
      createMockRequest({
        method: "POST",
        url: "https://hic-ai.com/api/provision-license",
        jsonBody: {},
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Missing session_id");

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.event === "session_id_missing" &&
          entry.level === "INFO" &&
          entry.message.includes("Provision license rejected"),
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.level === "WARN" &&
          entry.message.includes("Provision license rejected") &&
          entry.metadata?.statusCode === 400,
      ),
    ).toBe(true);
  });

  test("provision-license logs payment_not_completed + warning response", async () => {
    __setVerifyAuthTokenForTests(() => ({
      sub: "user_provision_2",
      email: "provision2@example.com",
      "cognito:username": "provision-user-2",
    }));

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

    const response = await postProvisionLicense(
      createMockRequest({
        method: "POST",
        url: "https://hic-ai.com/api/provision-license",
        jsonBody: { sessionId: "cs_test_unpaid" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Payment not completed");

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.event === "payment_not_completed" &&
          entry.level === "INFO" &&
          entry.message.includes("Provision license rejected"),
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.level === "WARN" &&
          entry.message.includes("Provision license rejected") &&
          entry.metadata?.statusCode === 400,
      ),
    ).toBe(true);
  });

  test("admin/provision-test-license POST logs environment/auth rejection contract", async () => {
    const response = await postAdminProvisionTestLicense(
      createMockRequest({
        method: "POST",
        url: "https://hic-ai.com/api/admin/provision-test-license",
        jsonBody: { email: "test@example.com" },
      }),
    );
    const body = await response.json();

    expect(response.status === 403 || response.status === 401).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-admin-provision-test" &&
          entry.event === "request_received" &&
          entry.metadata?.operation === "admin_provision_test",
      ),
    ).toBe(true);

    if (response.status === 403) {
      expect(body.error).toBe("This endpoint is only available in staging");
      expect(
        loggerStore.entries.some(
          (entry) =>
            entry.event === "environment_restricted" &&
            entry.level === "INFO" &&
            entry.message.includes("Test license provisioning rejected"),
        ),
      ).toBe(true);
    }

    if (response.status === 401) {
      expect(body.error).toBe("Invalid or missing admin key");
      expect(
        loggerStore.entries.some(
          (entry) =>
            entry.event === "admin_auth_failed" &&
            entry.level === "INFO" &&
            entry.message.includes("Test license provisioning rejected"),
        ),
      ).toBe(true);
    }

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.level === "WARN" &&
          entry.message.includes("Test license provisioning rejected") &&
          (entry.metadata?.statusCode === 403 ||
            entry.metadata?.statusCode === 401),
      ),
    ).toBe(true);
  });

  test("admin/provision-test-license GET logs request/decision/response contract", async () => {
    const response = await getAdminProvisionTestLicense(
      createMockRequest({
        method: "GET",
        url: "https://hic-ai.com/api/admin/provision-test-license",
      }),
    );

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-admin-provision-test" &&
          entry.event === "request_received" &&
          entry.metadata?.operation === "admin_provision_test_check",
      ),
    ).toBe(true);

    if (response.status === 403) {
      expect(
        loggerStore.entries.some(
          (entry) =>
            entry.event === "environment_restricted" &&
            entry.level === "INFO" &&
            entry.message.includes("Provision test endpoint rejected"),
        ),
      ).toBe(true);

      expect(
        loggerStore.entries.some(
          (entry) =>
            entry.level === "WARN" &&
            entry.message.includes("Provision test endpoint rejected") &&
            entry.metadata?.statusCode === 403,
        ),
      ).toBe(true);
      return;
    }

    expect(response.status).toBe(200);
    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.level === "INFO" &&
          entry.event === "response" &&
          entry.message.includes(
            "Provision test endpoint documentation returned",
          ) &&
          entry.metadata?.statusCode === 200,
      ),
    ).toBe(true);
  });
});
