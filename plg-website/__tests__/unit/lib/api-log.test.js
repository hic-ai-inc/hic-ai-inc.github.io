import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";

import {
  sanitizeApiMetadata,
  getCorrelationId,
  buildApiRequestContext,
  createApiLogger,
  __setLoggerFactoryForTests,
  __resetLoggerFactoryForTests,
} from "../../../src/lib/api-log.js";

function makeHeaders(values = {}) {
  const map = new Map();
  for (const [key, value] of Object.entries(values)) {
    map.set(String(key).toLowerCase(), value);
  }
  return {
    get(name) {
      return map.get(String(name).toLowerCase()) ?? null;
    },
  };
}

function createFakeLogger(correlationId = "cid-test") {
  return {
    correlationId,
    calls: [],
    logIntegrationEvent(event, message, metadata) {
      this.calls.push({
        method: "logIntegrationEvent",
        event,
        message,
        metadata,
      });
    },
    warn(message, metadata) {
      this.calls.push({ method: "warn", message, metadata });
    },
    error(message, error, metadata) {
      this.calls.push({ method: "error", message, error, metadata });
    },
    debug(message, metadata) {
      this.calls.push({ method: "debug", message, metadata });
    },
  };
}

describe("api-log adapter", () => {
  afterEach(() => {
    __resetLoggerFactoryForTests();
  });

  describe("sanitizeApiMetadata", () => {
    it("sanitizes string values and removes undefined", () => {
      const result = sanitizeApiMetadata({
        message: "hello\nworld",
        optional: undefined,
        count: 4,
        ok: true,
      });

      assert.strictEqual(result.message, "hello world");
      assert.strictEqual("optional" in result, false);
      assert.strictEqual(result.count, 4);
      assert.strictEqual(result.ok, true);
    });

    it("redacts sensitive key names", () => {
      const result = sanitizeApiMetadata({
        authorization: "Bearer secret-token",
        apiKey: "abc123",
        nested: {
          refreshToken: "xyz",
        },
      });

      assert.strictEqual(result.authorization, "[REDACTED:authorization]");
      assert.strictEqual(result.apiKey, "[REDACTED:apiKey]");
      assert.strictEqual(result.nested.refreshToken, "[REDACTED:refreshToken]");
    });

    it("handles non-object input safely", () => {
      assert.deepStrictEqual(sanitizeApiMetadata(null), {});
      assert.deepStrictEqual(sanitizeApiMetadata("abc"), {});
    });
  });

  describe("getCorrelationId", () => {
    it("uses x-correlation-id first", () => {
      const request = {
        headers: makeHeaders({
          "x-correlation-id": "cid-1",
          "x-request-id": "rid-1",
        }),
      };
      assert.strictEqual(getCorrelationId(request), "cid-1");
    });

    it("falls back to x-request-id then probe id", () => {
      const requestA = { headers: makeHeaders({ "x-request-id": "rid-22" }) };
      const requestB = {
        headers: makeHeaders({ "x-hic-probe-id": "probe-abc" }),
      };

      assert.strictEqual(getCorrelationId(requestA), "rid-22");
      assert.strictEqual(getCorrelationId(requestB), "probe-abc");
    });

    it("falls back to provided correlation id", () => {
      const request = { headers: makeHeaders({}) };
      assert.strictEqual(
        getCorrelationId(request, "provided-cid"),
        "provided-cid",
      );
    });

    it("returns null when no correlation source exists", () => {
      const request = { headers: makeHeaders({}) };
      assert.strictEqual(getCorrelationId(request), null);
    });
  });

  describe("buildApiRequestContext", () => {
    it("builds safe context from NextRequest-like object", () => {
      const request = {
        method: "POST",
        nextUrl: { pathname: "/api/license/validate" },
        headers: makeHeaders({
          authorization: "Bearer abc",
          cookie: "sid=123",
          "x-request-id": "req-111",
          "x-hic-probe-id": "probe-222",
          "user-agent": "Mouse/1.0",
        }),
      };

      const context = buildApiRequestContext(request, {
        operation: "validate",
      });

      assert.strictEqual(context.method, "POST");
      assert.strictEqual(context.path, "/api/license/validate");
      assert.strictEqual(context.requestId, "req-111");
      assert.strictEqual(context.probeId, "probe-222");
      assert.strictEqual(context.hasAuthorizationHeader, true);
      assert.strictEqual(context.hasCookieHeader, true);
      assert.strictEqual(context.hasUserAgent, true);
      assert.strictEqual(context.operation, "validate");
    });

    it("parses path from url when nextUrl is not present", () => {
      const request = {
        method: "GET",
        url: "https://staging.hic-ai.com/api/portal/status?x=1",
        headers: makeHeaders({}),
      };

      const context = buildApiRequestContext(request);
      assert.strictEqual(context.path, "/api/portal/status");
      assert.strictEqual(context.method, "GET");
    });
  });

  describe("createApiLogger", () => {
    let fakeLogger;

    beforeEach(() => {
      fakeLogger = createFakeLogger("cid-from-fake");
      __setLoggerFactoryForTests((_service, _correlationId) => fakeLogger);
    });

    it("throws when service is missing", () => {
      assert.throws(
        () => createApiLogger(),
        /requires a non-empty service string/,
      );
    });

    it("creates logger and logs requestReceived with base metadata", () => {
      const request = {
        method: "POST",
        nextUrl: { pathname: "/api/license/heartbeat" },
        headers: makeHeaders({ "x-correlation-id": "cid-123" }),
      };

      const apiLog = createApiLogger({
        service: "plg-api-license-heartbeat",
        request,
        operation: "POST",
        metadata: { endpoint: "heartbeat" },
      });

      assert.strictEqual(apiLog.correlationId, "cid-from-fake");
      apiLog.requestReceived({ phase: "entry" });

      assert.strictEqual(fakeLogger.calls.length, 1);
      const call = fakeLogger.calls[0];
      assert.strictEqual(call.method, "logIntegrationEvent");
      assert.strictEqual(call.event, "request_received");
      assert.strictEqual(call.metadata.path, "/api/license/heartbeat");
      assert.strictEqual(call.metadata.operation, "POST");
      assert.strictEqual(call.metadata.endpoint, "heartbeat");
      assert.strictEqual(call.metadata.phase, "entry");
    });

    it("maps response levels by status code", () => {
      const apiLog = createApiLogger({
        service: "plg-api-test",
        request: {
          method: "GET",
          url: "https://example.com/api/test",
          headers: makeHeaders({}),
        },
      });

      apiLog.response(200, "ok");
      apiLog.response(429, "rate limited");
      apiLog.response(500, "boom");

      assert.strictEqual(fakeLogger.calls[0].method, "logIntegrationEvent");
      assert.strictEqual(fakeLogger.calls[1].method, "warn");
      assert.strictEqual(fakeLogger.calls[2].method, "error");
    });

    it("passes error details through exception helper", () => {
      const apiLog = createApiLogger({
        service: "plg-api-test",
        request: {
          method: "GET",
          url: "https://example.com/api/test",
          headers: makeHeaders({}),
        },
      });

      const error = new Error("Failure");
      apiLog.exception(error, "validation_error", "Validation failed", {
        branch: "trial",
      });

      assert.strictEqual(fakeLogger.calls.length, 1);
      const call = fakeLogger.calls[0];
      assert.strictEqual(call.method, "error");
      assert.strictEqual(call.message, "Validation failed");
      assert.strictEqual(call.error, error);
      assert.strictEqual(call.metadata.event, "validation_error");
      assert.strictEqual(call.metadata.branch, "trial");
    });

    it("supports info/warn/debug/error methods with explicit event tags", () => {
      const apiLog = createApiLogger({
        service: "plg-api-test",
        request: {
          method: "GET",
          url: "https://example.com/api/test",
          headers: makeHeaders({}),
        },
      });

      apiLog.info("custom_event", "Hello", { a: 1 });
      apiLog.warn("warn_event", "Warning", { b: 2 });
      apiLog.debug("debug_event", "Debug", { c: 3 });
      apiLog.error("error_event", "Oops", null, { d: 4 });

      assert.strictEqual(fakeLogger.calls.length, 4);
      assert.strictEqual(fakeLogger.calls[0].method, "logIntegrationEvent");
      assert.strictEqual(fakeLogger.calls[0].event, "custom_event");

      assert.strictEqual(fakeLogger.calls[1].method, "warn");
      assert.strictEqual(fakeLogger.calls[1].metadata.event, "warn_event");

      assert.strictEqual(fakeLogger.calls[2].method, "debug");
      assert.strictEqual(fakeLogger.calls[2].metadata.event, "debug_event");

      assert.strictEqual(fakeLogger.calls[3].method, "error");
      assert.strictEqual(fakeLogger.calls[3].metadata.event, "error_event");
    });
  });
});
