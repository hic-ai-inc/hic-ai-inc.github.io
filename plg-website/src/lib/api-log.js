/**
 * API Logging Adapter
 *
 * Reuse-first adapter around HIC first-party logging/security utilities for
 * Next.js API routes. This file intentionally builds on:
 * - HicLog (structured JSON logs + correlation support)
 * - sanitizeForLog (CWE-117 log sanitization)
 */

import {
  HicLog,
  sanitizeForLog,
} from "../../../dm/layers/base/src/container-exports.js";

const SENSITIVE_KEY_PATTERN =
  /(authorization|bearer|password|secret|api[_-]?key|cookie|token|session)/i;

let loggerFactory = (service, correlationId) =>
  new HicLog(service, correlationId);

function readHeader(headers, name) {
  if (!headers || !name) return null;

  if (typeof headers.get === "function") {
    return headers.get(name);
  }

  const lowerName = String(name).toLowerCase();

  if (headers instanceof Map) {
    return headers.get(name) ?? headers.get(lowerName) ?? null;
  }

  if (typeof headers === "object") {
    for (const [key, value] of Object.entries(headers)) {
      if (String(key).toLowerCase() === lowerName) {
        return value;
      }
    }
  }

  return null;
}

function getRequestPath(request) {
  if (!request) return null;

  if (request.nextUrl && typeof request.nextUrl.pathname === "string") {
    return request.nextUrl.pathname;
  }

  if (typeof request.url === "string") {
    try {
      return new URL(request.url).pathname;
    } catch (_error) {
      return request.url;
    }
  }

  return null;
}

function sanitizeMetadataValue(key, value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMetadataValue(key, item));
  }

  if (typeof value === "object") {
    return sanitizeApiMetadata(value);
  }

  if (SENSITIVE_KEY_PATTERN.test(String(key))) {
    return `[REDACTED:${sanitizeForLog(String(key))}]`;
  }

  return sanitizeForLog(value);
}

export function sanitizeApiMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== "object") {
    return {};
  }

  const sanitized = {};
  for (const [rawKey, rawValue] of Object.entries(metadata)) {
    const key = sanitizeForLog(String(rawKey));
    if (rawValue === undefined) continue;
    sanitized[key] = sanitizeMetadataValue(key, rawValue);
  }

  return sanitized;
}

export function getCorrelationId(request, providedCorrelationId = null) {
  const headers = request?.headers;

  const correlationId =
    readHeader(headers, "x-correlation-id") ||
    readHeader(headers, "x-request-id") ||
    readHeader(headers, "x-hic-probe-id") ||
    providedCorrelationId;

  if (typeof correlationId === "string" && correlationId.trim() !== "") {
    return correlationId.trim();
  }

  return null;
}

export function buildApiRequestContext(request, additionalMetadata = {}) {
  const headers = request?.headers;
  const method = request?.method || null;
  const path = getRequestPath(request);

  const requestId =
    readHeader(headers, "x-request-id") ||
    readHeader(headers, "x-amzn-requestid") ||
    null;

  const probeId = readHeader(headers, "x-hic-probe-id") || null;
  const userAgent = readHeader(headers, "user-agent") || null;

  return sanitizeApiMetadata({
    method,
    path,
    requestId,
    probeId,
    hasAuthorizationHeader: Boolean(readHeader(headers, "authorization")),
    hasCookieHeader: Boolean(readHeader(headers, "cookie")),
    hasUserAgent: Boolean(userAgent),
    ...additionalMetadata,
  });
}

export function createApiLogger({
  service,
  request,
  operation = null,
  correlationId = null,
  metadata = {},
} = {}) {
  if (!service || typeof service !== "string") {
    throw new Error("createApiLogger requires a non-empty service string");
  }

  const derivedCorrelationId = getCorrelationId(request, correlationId);
  const logger = loggerFactory(service, derivedCorrelationId || undefined);

  const baseMetadata = buildApiRequestContext(request, {
    operation,
    ...metadata,
  });

  const withBase = (extra = {}) => ({
    ...baseMetadata,
    ...sanitizeApiMetadata(extra),
  });

  return {
    correlationId: logger.correlationId,
    baseMetadata,

    info(event, message, extra = {}) {
      logger.logIntegrationEvent(event, message, withBase(extra));
    },

    warn(event, message, extra = {}) {
      logger.warn(message, withBase({ event, ...extra }));
    },

    debug(event, message, extra = {}) {
      logger.debug(message, withBase({ event, ...extra }));
    },

    error(event, message, error = null, extra = {}) {
      logger.error(message, error, withBase({ event, ...extra }));
    },

    requestReceived(extra = {}) {
      logger.logIntegrationEvent(
        "request_received",
        "API request received",
        withBase(extra),
      );
    },

    decision(event, message, extra = {}) {
      logger.logIntegrationEvent(event, message, withBase(extra));
    },

    response(statusCode, message = "API response", extra = {}) {
      const safeStatus = Number.isFinite(Number(statusCode))
        ? Number(statusCode)
        : null;

      const payload = withBase({ statusCode: safeStatus, ...extra });

      if (safeStatus !== null && safeStatus >= 500) {
        logger.error(message, null, payload);
        return;
      }

      if (safeStatus !== null && safeStatus >= 400) {
        logger.warn(message, payload);
        return;
      }

      logger.logIntegrationEvent("response", message, payload);
    },

    exception(
      error,
      event = "exception",
      message = "API exception",
      extra = {},
    ) {
      logger.error(message, error, withBase({ event, ...extra }));
    },
  };
}

export function __setLoggerFactoryForTests(factory) {
  loggerFactory = factory;
}

export function __resetLoggerFactoryForTests() {
  loggerFactory = (service, correlationId) =>
    new HicLog(service, correlationId);
}
