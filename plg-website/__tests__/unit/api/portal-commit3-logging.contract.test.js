/**
 * Commit 3 Logging Contract Tests
 *
 * Validates structured logging behavior for:
 * - portal/team (GET/POST/DELETE)
 * - license/check (GET)
 * - license/deactivate (DELETE/POST)
 */

import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
} from "../../../../dm/facade/test-helpers/index.js";

import {
  GET as getPortalTeam,
  POST as postPortalTeam,
  DELETE as deletePortalTeam,
} from "../../../src/app/api/portal/team/route.js";
import { GET as getLicenseCheck } from "../../../src/app/api/license/check/route.js";
import {
  DELETE as deleteLicenseDeactivate,
  POST as postLicenseDeactivate,
} from "../../../src/app/api/license/deactivate/route.js";

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

describe("commit 3 structured logging contract", () => {
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

  test("portal/team GET logs auth_failed + warning response when unauthorized", async () => {
    __setVerifyAuthTokenForTests(() => null);

    const response = await getPortalTeam(
      createMockRequest({
        method: "GET",
        url: "https://hic-ai.com/api/portal/team",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-portal-team" &&
          entry.event === "request_received" &&
          entry.metadata?.operation === "portal_team_list",
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-portal-team" &&
          entry.event === "auth_failed" &&
          entry.level === "INFO" &&
          entry.message.includes("Team list rejected"),
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-portal-team" &&
          entry.level === "WARN" &&
          entry.message.includes("Team list rejected") &&
          entry.metadata?.statusCode === 401,
      ),
    ).toBe(true);
  });

  test("portal/team POST logs auth_failed + warning response when unauthorized", async () => {
    __setVerifyAuthTokenForTests(() => null);

    const response = await postPortalTeam(
      createMockRequest({
        method: "POST",
        url: "https://hic-ai.com/api/portal/team",
        jsonBody: { action: "invite", email: "member@example.com" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.event === "request_received" &&
          entry.metadata?.operation === "portal_team_invite",
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.event === "auth_failed" &&
          entry.level === "INFO" &&
          entry.message.includes("Team update rejected"),
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.level === "WARN" &&
          entry.message.includes("Team update rejected") &&
          entry.metadata?.statusCode === 401,
      ),
    ).toBe(true);
  });

  test("portal/team DELETE logs auth_failed + warning response when unauthorized", async () => {
    __setVerifyAuthTokenForTests(() => null);

    const response = await deletePortalTeam(
      createMockRequest({
        method: "DELETE",
        url: "https://hic-ai.com/api/portal/team",
        jsonBody: { type: "member", memberId: "user_123" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.event === "request_received" &&
          entry.metadata?.operation === "portal_team_remove",
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.event === "auth_failed" &&
          entry.level === "INFO" &&
          entry.message.includes("Team remove rejected"),
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.level === "WARN" &&
          entry.message.includes("Team remove rejected") &&
          entry.metadata?.statusCode === 401,
      ),
    ).toBe(true);
  });

  test("license/check logs email_missing decision + warning response", async () => {
    const response = await getLicenseCheck(
      createMockRequest({
        method: "GET",
        url: "https://hic-ai.com/api/license/check",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Email parameter is required");

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-license-check" &&
          entry.event === "request_received" &&
          entry.metadata?.operation === "license_check",
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-license-check" &&
          entry.event === "email_missing" &&
          entry.level === "INFO",
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-license-check" &&
          entry.level === "WARN" &&
          entry.message.includes("License check rejected") &&
          entry.metadata?.statusCode === 400,
      ),
    ).toBe(true);
  });

  test("license/check logs invalid_email_format decision + warning response", async () => {
    const response = await getLicenseCheck(
      createMockRequest({
        method: "GET",
        url: "https://hic-ai.com/api/license/check?email=invalid-email",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid email format");

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.event === "invalid_email_format" && entry.level === "INFO",
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.level === "WARN" &&
          entry.message.includes("License check rejected") &&
          entry.metadata?.statusCode === 400,
      ),
    ).toBe(true);
  });

  test("license/deactivate DELETE logs machine_identifier_missing + warning response", async () => {
    const response = await deleteLicenseDeactivate(
      createMockRequest({
        method: "DELETE",
        url: "https://hic-ai.com/api/license/deactivate",
        jsonBody: {
          licenseId: "lic_123",
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Machine ID or fingerprint is required");

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-license-deactivate" &&
          entry.event === "request_received" &&
          entry.metadata?.operation === "license_deactivate",
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.event === "machine_identifier_missing" &&
          entry.level === "INFO" &&
          entry.message.includes("Deactivation rejected"),
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.level === "WARN" &&
          entry.message.includes("Deactivation rejected") &&
          entry.metadata?.statusCode === 400,
      ),
    ).toBe(true);
  });

  test("license/deactivate POST alias logs request_received + license_id_missing decision", async () => {
    const response = await postLicenseDeactivate(
      createMockRequest({
        method: "POST",
        url: "https://hic-ai.com/api/license/deactivate",
        jsonBody: {
          machineId: "machine_123",
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("License ID is required");

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.event === "request_received" &&
          entry.metadata?.operation === "license_deactivate" &&
          entry.metadata?.methodAlias === "POST",
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.event === "license_id_missing" &&
          entry.level === "INFO" &&
          entry.message.includes("Deactivation rejected"),
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.level === "WARN" &&
          entry.message.includes("Deactivation rejected") &&
          entry.metadata?.statusCode === 400,
      ),
    ).toBe(true);
  });
});
