/**
 * Commit 2 Portal Logging Contract Tests
 *
 * Validates newly added structured logging behavior for:
 * - portal/invite/[token] (GET/POST)
 * - portal/seats (GET/POST)
 * - portal/settings (GET/PATCH)
 * - portal/settings/delete-account (POST/DELETE)
 */

import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
} from "../../../../dm/facade/test-helpers/index.js";

import {
  GET as getPortalInvite,
  POST as postPortalInvite,
} from "../../../src/app/api/portal/invite/[token]/route.js";
import {
  GET as getPortalSeats,
  POST as postPortalSeats,
} from "../../../src/app/api/portal/seats/route.js";
import {
  GET as getPortalSettings,
  PATCH as patchPortalSettings,
} from "../../../src/app/api/portal/settings/route.js";
import {
  POST as postPortalDeleteAccount,
  DELETE as deletePortalDeleteAccount,
} from "../../../src/app/api/portal/settings/delete-account/route.js";

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

describe("portal commit 2 structured logging contract", () => {
  let loggerStore;

  beforeEach(() => {
    loggerStore = createMockLoggerStore();

    __resetVerifyAuthTokenForTests();
    __resetLoggerFactoryForTests();

    __setLoggerFactoryForTests(
      (service, correlationId) =>
        new loggerStore.MockLogger(service, correlationId),
    );
  });

  afterEach(() => {
    __resetVerifyAuthTokenForTests();
    __resetLoggerFactoryForTests();
  });

  test("portal/invite/[token] GET logs token_missing decision + warning response", async () => {
    const response = await getPortalInvite(
      createMockRequest({
        method: "GET",
        url: "https://hic-ai.com/api/portal/invite/test-token",
      }),
      { params: {} },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid invite link");

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-portal-invite" &&
          entry.event === "request_received" &&
          entry.metadata?.operation === "portal_invite_check",
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-portal-invite" &&
          entry.level === "INFO" &&
          entry.event === "token_missing" &&
          entry.message.includes("Invite check rejected"),
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-portal-invite" &&
          entry.level === "WARN" &&
          entry.message.includes("Invite check rejected") &&
          entry.metadata?.statusCode === 400,
      ),
    ).toBe(true);
  });

  test("portal/invite/[token] POST logs auth_failed decision + warning response", async () => {
    __setVerifyAuthTokenForTests(() => null);

    const response = await postPortalInvite(
      createMockRequest({
        method: "POST",
        url: "https://hic-ai.com/api/portal/invite/test-token",
      }),
      { params: { token: "test-token" } },
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toContain("Please sign in");

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.event === "request_received" &&
          entry.metadata?.operation === "portal_invite_accept",
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
          entry.message.includes("Invite accept rejected") &&
          entry.metadata?.statusCode === 401,
      ),
    ).toBe(true);
  });

  test("portal/seats GET logs auth_failed decision + warning response", async () => {
    __setVerifyAuthTokenForTests(() => null);

    const response = await getPortalSeats(
      createMockRequest({
        method: "GET",
        url: "https://hic-ai.com/api/portal/seats",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-portal-seats" &&
          entry.event === "request_received" &&
          entry.metadata?.operation === "portal_seats_list",
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-portal-seats" &&
          entry.event === "auth_failed" &&
          entry.level === "INFO",
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-portal-seats" &&
          entry.level === "WARN" &&
          entry.message.includes("Seat list rejected") &&
          entry.metadata?.statusCode === 401,
      ),
    ).toBe(true);
  });

  test("portal/seats POST logs auth_failed decision + warning response", async () => {
    __setVerifyAuthTokenForTests(() => null);

    const response = await postPortalSeats(
      createMockRequest({
        method: "POST",
        url: "https://hic-ai.com/api/portal/seats",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-portal-seats" &&
          entry.event === "request_received" &&
          entry.metadata?.operation === "portal_seats_update",
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-portal-seats" &&
          entry.event === "auth_failed" &&
          entry.level === "INFO",
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-portal-seats" &&
          entry.level === "WARN" &&
          entry.message.includes("Seat update rejected") &&
          entry.metadata?.statusCode === 401,
      ),
    ).toBe(true);
  });

  test("portal/settings GET logs auth_failed decision + warning response", async () => {
    __setVerifyAuthTokenForTests(() => null);

    const response = await getPortalSettings(
      createMockRequest({
        method: "GET",
        url: "https://hic-ai.com/api/portal/settings",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-portal-settings" &&
          entry.event === "request_received" &&
          entry.metadata?.operation === "portal_settings_get",
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-portal-settings" &&
          entry.event === "auth_failed" &&
          entry.level === "INFO",
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-portal-settings" &&
          entry.level === "WARN" &&
          entry.message.includes("Settings GET rejected") &&
          entry.metadata?.statusCode === 401,
      ),
    ).toBe(true);
  });

  test("portal/settings PATCH logs auth_failed decision + warning response", async () => {
    __setVerifyAuthTokenForTests(() => null);

    const response = await patchPortalSettings(
      createMockRequest({
        method: "PATCH",
        url: "https://hic-ai.com/api/portal/settings",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-portal-settings" &&
          entry.event === "request_received" &&
          entry.metadata?.operation === "portal_settings_update",
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-portal-settings" &&
          entry.event === "auth_failed" &&
          entry.level === "INFO",
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-portal-settings" &&
          entry.level === "WARN" &&
          entry.message.includes("Settings PATCH rejected") &&
          entry.metadata?.statusCode === 401,
      ),
    ).toBe(true);
  });

  test("portal/settings/delete-account POST logs confirmation_invalid decision + warning response", async () => {
    __setVerifyAuthTokenForTests(() => ({
      sub: "user-delete-1",
      email: "delete@example.com",
    }));

    const response = await postPortalDeleteAccount(
      createMockRequest({
        method: "POST",
        url: "https://hic-ai.com/api/portal/settings/delete-account",
        jsonBody: {
          confirmation: "WRONG CONFIRMATION",
          reason: "testing",
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("DELETE MY ACCOUNT");

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-portal-settings-delete" &&
          entry.event === "request_received" &&
          entry.metadata?.operation === "portal_settings_delete_request",
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-portal-settings-delete" &&
          entry.event === "confirmation_invalid" &&
          entry.level === "INFO",
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-portal-settings-delete" &&
          entry.level === "WARN" &&
          entry.message.includes("Delete account request rejected") &&
          entry.metadata?.statusCode === 400,
      ),
    ).toBe(true);
  });

  test("portal/settings/delete-account DELETE logs auth_failed decision + warning response", async () => {
    __setVerifyAuthTokenForTests(() => null);

    const response = await deletePortalDeleteAccount(
      createMockRequest({
        method: "DELETE",
        url: "https://hic-ai.com/api/portal/settings/delete-account",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-portal-settings-delete" &&
          entry.event === "request_received" &&
          entry.metadata?.operation === "portal_settings_delete_confirm",
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-portal-settings-delete" &&
          entry.event === "auth_failed" &&
          entry.level === "INFO",
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-portal-settings-delete" &&
          entry.level === "WARN" &&
          entry.message.includes("Cancel deletion rejected") &&
          entry.metadata?.statusCode === 401,
      ),
    ).toBe(true);
  });
});
