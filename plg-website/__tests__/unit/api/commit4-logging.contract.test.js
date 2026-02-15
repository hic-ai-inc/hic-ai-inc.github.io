/**
 * Commit 4 Logging Contract Tests
 *
 * Validates structured logging behavior for:
 * - license/activate (POST)
 * - license/heartbeat (POST)
 * - license/validate (POST)
 * - license/trial/init (POST/GET)
 */

import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
} from "../../../../dm/facade/test-helpers/index.js";

import { POST as postLicenseActivate } from "../../../src/app/api/license/activate/route.js";
import { POST as postLicenseHeartbeat } from "../../../src/app/api/license/heartbeat/route.js";
import { POST as postLicenseValidate } from "../../../src/app/api/license/validate/route.js";
import {
  POST as postLicenseTrialInit,
  GET as getLicenseTrialInit,
} from "../../../src/app/api/license/trial/init/route.js";

import {
  __setVerifyAuthTokenForTests,
  __resetVerifyAuthTokenForTests,
} from "../../../src/lib/auth-verify.js";
import {
  __setLoggerFactoryForTests,
  __resetLoggerFactoryForTests,
} from "../../../src/lib/api-log.js";
import { clearAllRateLimits } from "../../../src/lib/rate-limit.js";

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
    clone() {
      return {
        async json() {
          if (jsonThrows) {
            throw jsonThrows;
          }
          return jsonBody;
        },
      };
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

describe("commit 4 structured logging contract", () => {
  let loggerStore;

  beforeEach(() => {
    loggerStore = createMockLoggerStore();

    __resetVerifyAuthTokenForTests();
    __resetLoggerFactoryForTests();
    clearAllRateLimits();

    __setLoggerFactoryForTests(
      (service, correlationId) =>
        new loggerStore.MockLogger(service, correlationId),
    );
  });

  afterEach(() => {
    __resetVerifyAuthTokenForTests();
    __resetLoggerFactoryForTests();
    clearAllRateLimits();
  });

  test("license/activate logs auth_failed + warning response when unauthorized", async () => {
    __setVerifyAuthTokenForTests(() => null);

    const response = await postLicenseActivate(
      createMockRequest({
        method: "POST",
        url: "https://hic-ai.com/api/license/activate",
        jsonBody: {
          licenseKey: "MOUSE-ABCD-EFGH-IJKL-MNOP",
          fingerprint: "abcdef0123456789abcdef0123456789",
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-license-activate" &&
          entry.event === "request_received" &&
          entry.metadata?.operation === "license_activate",
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-license-activate" &&
          entry.level === "INFO" &&
          entry.event === "auth_failed" &&
          entry.message.includes("License activation rejected"),
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-license-activate" &&
          entry.level === "WARN" &&
          entry.message.includes("License activation rejected") &&
          entry.metadata?.statusCode === 401,
      ),
    ).toBe(true);
  });

  test("license/activate logs fingerprint_missing decision + warning response", async () => {
    __setVerifyAuthTokenForTests(() => ({
      sub: "user_activate_1",
      email: "activate@example.com",
    }));

    const response = await postLicenseActivate(
      createMockRequest({
        method: "POST",
        url: "https://hic-ai.com/api/license/activate",
        jsonBody: {
          licenseKey: "MOUSE-ABCD-EFGH-IJKL-MNOP",
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Device fingerprint is required");

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.event === "fingerprint_missing" &&
          entry.level === "INFO" &&
          entry.message.includes("License activation rejected"),
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.level === "WARN" &&
          entry.message.includes("License activation rejected") &&
          entry.metadata?.statusCode === 400,
      ),
    ).toBe(true);
  });

  test("license/heartbeat logs fingerprint_missing + warning response", async () => {
    const response = await postLicenseHeartbeat(
      createMockRequest({
        method: "POST",
        url: "https://hic-ai.com/api/license/heartbeat",
        jsonBody: {},
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Device fingerprint is required");

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-license-heartbeat" &&
          entry.event === "request_received" &&
          entry.metadata?.operation === "license_heartbeat",
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-license-heartbeat" &&
          entry.event === "fingerprint_missing" &&
          entry.level === "INFO",
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-license-heartbeat" &&
          entry.level === "WARN" &&
          entry.message.includes("Heartbeat rejected") &&
          entry.metadata?.statusCode === 400,
      ),
    ).toBe(true);
  });

  test("license/heartbeat logs unauthorized licensed heartbeat path", async () => {
    __setVerifyAuthTokenForTests(() => null);

    const response = await postLicenseHeartbeat(
      createMockRequest({
        method: "POST",
        url: "https://hic-ai.com/api/license/heartbeat",
        headers: {
          authorization: "Bearer invalid-token",
        },
        jsonBody: {
          licenseKey: "MOUSE-ABCD-EFGH-IJKL-MNOP",
          fingerprint: "abcdef0123456789abcdef0123456789",
          sessionId: "session_123",
          machineId: "machine_123",
          userId: "user_heartbeat_1",
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.event === "licensed_heartbeat_unauthorized" &&
          entry.level === "WARN" &&
          entry.message.includes("Licensed heartbeat rejected"),
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.level === "WARN" &&
          entry.message.includes("Heartbeat rejected") &&
          entry.metadata?.statusCode === 401,
      ),
    ).toBe(true);
  });

  test("license/validate logs invalid_json + warning response", async () => {
    const response = await postLicenseValidate(
      createMockRequest({
        method: "POST",
        url: "https://hic-ai.com/api/license/validate",
        jsonThrows: new Error("Malformed JSON payload"),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid JSON");

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-license-validate" &&
          entry.event === "request_received" &&
          entry.metadata?.operation === "license_validate",
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.event === "invalid_json" &&
          entry.level === "INFO" &&
          entry.message.includes("License validation rejected"),
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.level === "WARN" &&
          entry.message.includes("License validation rejected") &&
          entry.metadata?.statusCode === 400,
      ),
    ).toBe(true);
  });

  test("license/validate logs fingerprint_missing + warning response", async () => {
    const response = await postLicenseValidate(
      createMockRequest({
        method: "POST",
        url: "https://hic-ai.com/api/license/validate",
        jsonBody: {
          licenseKey: "MOUSE-ABCD-EFGH-IJKL-MNOP",
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Device fingerprint is required");

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.event === "fingerprint_missing" &&
          entry.level === "INFO" &&
          entry.message.includes("License validation rejected"),
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.level === "WARN" &&
          entry.message.includes("License validation rejected") &&
          entry.metadata?.statusCode === 400,
      ),
    ).toBe(true);
  });

  test("license/trial/init POST logs invalid_fingerprint + warning response", async () => {
    const response = await postLicenseTrialInit(
      createMockRequest({
        method: "POST",
        url: "https://hic-ai.com/api/license/trial/init",
        jsonBody: {
          fingerprint: "bad-fingerprint",
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_fingerprint");

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-license-trial-init" &&
          entry.event === "request_received" &&
          entry.metadata?.operation === "license_trial_init",
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.event === "invalid_fingerprint" &&
          entry.level === "INFO" &&
          entry.message.includes("Trial init rejected"),
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.level === "WARN" &&
          entry.message.includes("Trial init rejected") &&
          entry.metadata?.statusCode === 400,
      ),
    ).toBe(true);
  });

  test("license/trial/init GET logs invalid_fingerprint + warning response", async () => {
    const response = await getLicenseTrialInit(
      createMockRequest({
        method: "GET",
        url: "https://hic-ai.com/api/license/trial/init?fingerprint=bad-fingerprint",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_fingerprint");

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.service === "plg-api-license-trial-init" &&
          entry.event === "request_received" &&
          entry.metadata?.operation === "license_trial_check",
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.event === "invalid_fingerprint" &&
          entry.level === "INFO" &&
          entry.message.includes("Trial init rejected"),
      ),
    ).toBe(true);

    expect(
      loggerStore.entries.some(
        (entry) =>
          entry.level === "WARN" &&
          entry.message.includes("Trial init rejected") &&
          entry.metadata?.statusCode === 400,
      ),
    ).toBe(true);
  });
});
