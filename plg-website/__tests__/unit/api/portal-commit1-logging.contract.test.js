/**
 * Commit 1 Portal Logging Contract Tests
 *
 * Validates newly added structured logging behavior for:
 * - portal/billing
 * - portal/devices
 * - portal/license
 * - portal/status
 * - portal/stripe-session
 * - portal/settings/export
 * - portal/settings/leave-organization
 */

import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  createSpy,
} from "../../../../dm/facade/test-helpers/index.js";

import { GET as getPortalBilling } from "../../../src/app/api/portal/billing/route.js";
import { GET as getPortalDevices } from "../../../src/app/api/portal/devices/route.js";
import { GET as getPortalLicense } from "../../../src/app/api/portal/license/route.js";
import { GET as getPortalStatus } from "../../../src/app/api/portal/status/route.js";
import { POST as postPortalStripeSession } from "../../../src/app/api/portal/stripe-session/route.js";
import { POST as postPortalSettingsExport } from "../../../src/app/api/portal/settings/export/route.js";
import { POST as postPortalLeaveOrganization } from "../../../src/app/api/portal/settings/leave-organization/route.js";

import { dynamodb } from "../../../src/lib/dynamodb.js";
import { clearAllRateLimits } from "../../../src/lib/rate-limit.js";
import {
  __setVerifyAuthTokenForTests,
  __resetVerifyAuthTokenForTests,
} from "../../../src/lib/auth-verify.js";
import {
  __setLoggerFactoryForTests,
  __resetLoggerFactoryForTests,
} from "../../../src/lib/api-log.js";

function createMockRequest({
  method = "GET",
  url = "https://hic-ai.com/api/test",
  headers = {},
  jsonBody = {},
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

describe("portal commit 1 structured logging contract", () => {
  let loggerStore;
  let originalSend;
  let mockSend;

  beforeEach(() => {
    loggerStore = createMockLoggerStore();

    __resetVerifyAuthTokenForTests();
    __resetLoggerFactoryForTests();

    __setLoggerFactoryForTests(
      (service, correlationId) =>
        new loggerStore.MockLogger(service, correlationId),
    );

    clearAllRateLimits();
    originalSend = dynamodb.send;
    mockSend = createSpy("dynamodb.send");
    dynamodb.send = mockSend;
  });

  afterEach(() => {
    clearAllRateLimits();
    __resetVerifyAuthTokenForTests();
    __resetLoggerFactoryForTests();
    dynamodb.send = originalSend;
  });

  test("portal/billing returns 401 and logs auth_failed + warning response", async () => {
    __setVerifyAuthTokenForTests(() => null);

    const response = await getPortalBilling(
      createMockRequest({
        method: "GET",
        url: "https://hic-ai.com/api/portal/billing",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");

    expect(
      loggerStore.entries.some(
        (entry) => entry.event === "request_received" && entry.level === "INFO",
      ),
    ).toBe(true);
    expect(
      loggerStore.entries.some(
        (entry) => entry.event === "auth_failed" && entry.level === "INFO",
      ),
    ).toBe(true);
    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.level === "WARN" &&
          entry.message.includes("Portal billing rejected"),
      ),
    ).toBe(true);
  });

  test("portal/billing returns 403 for non-owner org member and logs decision", async () => {
    __setVerifyAuthTokenForTests(() => ({
      sub: "member-user-1",
      email: "member@example.com",
    }));

    mockSend.mockImplementation((command) => {
      const input = command?.input || {};

      if (
        input.Key?.PK === "USER#member-user-1" &&
        input.Key?.SK === "PROFILE"
      ) {
        return Promise.resolve({
          Item: {
            userId: "member-user-1",
            email: "member@example.com",
          },
        });
      }

      if (
        input.IndexName === "GSI1" &&
        input.ExpressionAttributeValues?.[":pk"] === "USER#member-user-1"
      ) {
        return Promise.resolve({
          Items: [{ orgId: "org_123", role: "member", status: "active" }],
        });
      }

      return Promise.resolve({ Items: [] });
    });

    const response = await getPortalBilling(
      createMockRequest({
        method: "GET",
        url: "https://hic-ai.com/api/portal/billing",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("Only the subscription owner");

    expect(
      loggerStore.entries.some(
        (entry) => entry.event === "org_member_forbidden",
      ),
    ).toBe(true);
    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.level === "WARN" &&
          entry.message.includes("Portal billing rejected"),
      ),
    ).toBe(true);
  });

  test("portal/devices returns 401 and logs auth_failed", async () => {
    __setVerifyAuthTokenForTests(() => null);

    const response = await getPortalDevices(
      createMockRequest({
        method: "GET",
        url: "https://hic-ai.com/api/portal/devices",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");

    expect(
      loggerStore.entries.some(
        (entry) => entry.event === "auth_failed" && entry.level === "INFO",
      ),
    ).toBe(true);
    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.level === "WARN" &&
          entry.message.includes("Portal devices rejected"),
      ),
    ).toBe(true);
  });

  test("portal/license returns no-license response and logs empty result", async () => {
    __setVerifyAuthTokenForTests(() => ({
      sub: "no-license-user",
      email: "nolicense@example.com",
    }));

    mockSend.mockImplementation((command) => {
      const input = command?.input || {};

      if (
        input.IndexName === "GSI2" &&
        input.ExpressionAttributeValues?.[":pk"] ===
          "EMAIL#nolicense@example.com"
      ) {
        return Promise.resolve({ Items: [] });
      }

      if (
        input.IndexName === "GSI1" &&
        input.ExpressionAttributeValues?.[":pk"] === "USER#no-license-user"
      ) {
        return Promise.resolve({ Items: [] });
      }

      return Promise.resolve({ Items: [] });
    });

    const response = await getPortalLicense(
      createMockRequest({
        method: "GET",
        url: "https://hic-ai.com/api/portal/license",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.license).toBe(null);
    expect(body.message).toBe("No license found");

    expect(
      loggerStore.entries.some((entry) => entry.event === "license_not_found"),
    ).toBe(true);
    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.event === "response" &&
          entry.level === "INFO" &&
          entry.message.includes("Portal license empty result"),
      ),
    ).toBe(true);
  });

  test("portal/status returns new-user payload and logs new_user event", async () => {
    __setVerifyAuthTokenForTests(() => ({
      sub: "new-user-123",
      email: "new@example.com",
      email_verified: true,
    }));

    mockSend.mockImplementation((command) => {
      const input = command?.input || {};

      if (
        input.Key?.PK === "USER#new-user-123" &&
        input.Key?.SK === "PROFILE"
      ) {
        return Promise.resolve({ Item: null });
      }

      if (
        input.IndexName === "GSI2" &&
        input.ExpressionAttributeValues?.[":pk"] === "EMAIL#new@example.com"
      ) {
        return Promise.resolve({ Items: [] });
      }

      if (
        input.IndexName === "GSI1" &&
        input.ExpressionAttributeValues?.[":pk"] === "USER#new-user-123"
      ) {
        return Promise.resolve({ Items: [] });
      }

      return Promise.resolve({ Items: [] });
    });

    const response = await getPortalStatus(
      createMockRequest({
        method: "GET",
        url: "https://hic-ai.com/api/portal/status",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("new");
    expect(body.shouldRedirectToCheckout).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) => entry.event === "new_user" && entry.level === "INFO",
      ),
    ).toBe(true);
    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.event === "response" &&
          entry.level === "INFO" &&
          entry.message.includes("Portal status fetched"),
      ),
    ).toBe(true);
  });

  test("portal/stripe-session returns 404 for missing customer and logs decision", async () => {
    __setVerifyAuthTokenForTests(() => ({
      sub: "portal-user-1",
      email: "portal@example.com",
    }));

    mockSend.mockImplementation((command) => {
      const input = command?.input || {};

      if (
        input.IndexName === "GSI2" &&
        input.ExpressionAttributeValues?.[":pk"] === "EMAIL#portal@example.com"
      ) {
        return Promise.resolve({ Items: [] });
      }

      return Promise.resolve({ Items: [] });
    });

    const response = await postPortalStripeSession(
      createMockRequest({
        method: "POST",
        url: "https://hic-ai.com/api/portal/stripe-session",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toContain("No Stripe customer found");

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.event === "customer_not_found" && entry.level === "INFO",
      ),
    ).toBe(true);
    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.level === "WARN" &&
          entry.message.includes("Portal stripe session rejected"),
      ),
    ).toBe(true);
  });

  test("portal/settings/export returns 401 and logs auth_failed", async () => {
    __setVerifyAuthTokenForTests(() => null);

    const response = await postPortalSettingsExport(
      createMockRequest({
        method: "POST",
        url: "https://hic-ai.com/api/portal/settings/export",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");

    expect(
      loggerStore.entries.some(
        (entry) => entry.event === "auth_failed" && entry.level === "INFO",
      ),
    ).toBe(true);
    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.level === "WARN" &&
          entry.message.includes("Portal data export rejected"),
      ),
    ).toBe(true);
  });

  test("portal/settings/leave-organization rejects invalid confirmation and logs decision", async () => {
    __setVerifyAuthTokenForTests(() => ({
      sub: "member-user-9",
      email: "member9@example.com",
    }));

    const response = await postPortalLeaveOrganization(
      createMockRequest({
        method: "POST",
        url: "https://hic-ai.com/api/portal/settings/leave-organization",
        jsonBody: { confirmation: "WRONG" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("LEAVE ORGANIZATION");

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.event === "confirmation_invalid" && entry.level === "INFO",
      ),
    ).toBe(true);
    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.level === "WARN" &&
          entry.message.includes("Leave organization rejected"),
      ),
    ).toBe(true);
  });
});
