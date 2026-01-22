/**
 * dm/layers/base/src/hic-log.js
 * Last modified: August 28, 2025
 *
 * HIC Platform Structured Logger
 * Provides consistent logging, correlation tracking, and CloudWatch integration
 */

import { randomUUID } from "node:crypto";
import { sanitizeForLog } from "./safe-log.js";

// Simple level ordering for filtering
const LEVELS = ["DEBUG", "INFO", "WARN", "ERROR"];

// Dynamic function to get current MIN_LEVEL
const getMinLevel = () => {
  const env = String(process.env.LOG_LEVEL || "DEBUG").toUpperCase();
  return LEVELS.includes(env) ? env : "DEBUG";
};

const atOrAboveMin = (level) =>
  LEVELS.indexOf(level) >= LEVELS.indexOf(getMinLevel());

// Cycle-safe JSON replacer
function safeReplacer() {
  const seen = new WeakSet();
  return (_k, v) => {
    if (typeof v === "object" && v !== null) {
      if (seen.has(v)) return "[Circular]";
      seen.add(v);
    }
    return v;
  };
}
export class HicLog {
  constructor(service, correlationId = null) {
    this.service = service;
    this.correlationId = correlationId || randomUUID();
    this.startTime = Date.now();
  }

  _log(levelRaw, event, message, metadata = {}) {
    // Normalize and filter by minimum severity level
    const level = String(levelRaw || "").toUpperCase();
    if (!atOrAboveMin(level)) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      level: sanitizeForLog(level),
      service: sanitizeForLog(this.service),
      correlationId: sanitizeForLog(this.correlationId),
      event: sanitizeForLog(event),
      message: sanitizeForLog(message),
      ...this._sanitizeMetadata(metadata),
    };

    console.log(JSON.stringify(logEntry, safeReplacer()));
  }

  _sanitizeMetadata(metadata) {
    const sanitized = {};
    // Create one shared WeakSet for detecting circular references within this metadata
    const seen = new WeakSet();
    // Add the root metadata object to seen set
    seen.add(metadata);

    for (const [key, value] of Object.entries(metadata)) {
      sanitized[sanitizeForLog(key)] = this._sanitizeValue(value, seen);
    }
    return sanitized;
  }

  _sanitizeValue(value, seen = new WeakSet()) {
    if (value === null || value === undefined) {
      return value;
    }

    // Handle primitives without sanitization (preserve types)
    if (typeof value === "number" || typeof value === "boolean") {
      return value;
    }

    // Handle dates specially to preserve serialization
    if (value instanceof Date) {
      return value; // Let JSON.stringify handle it
    }

    if (typeof value === "object") {
      // Check for circular references
      if (seen.has(value)) {
        return "[Circular]";
      }
      seen.add(value);

      if (Array.isArray(value)) {
        return value.map((item) => this._sanitizeValue(item, seen));
      }

      const sanitizedObj = {};
      for (const [k, v] of Object.entries(value)) {
        sanitizedObj[sanitizeForLog(k)] = this._sanitizeValue(v, seen);
      }
      return sanitizedObj;
    }

    // Only sanitize strings and other types
    return sanitizeForLog(value);
  }

  // Workflow lifecycle events
  logWorkflowStart(operation, metadata = {}) {
    this._log("INFO", "workflow_start", `Starting ${operation}`, {
      operation,
      ...metadata,
    });
  }

  logWorkflowComplete(operation, metadata = {}) {
    const duration = Date.now() - this.startTime;
    this._log("INFO", "workflow_complete", `Completed ${operation}`, {
      operation,
      duration_ms: duration,
      ...metadata,
    });
  }

  logWorkflowError(operation, error, metadata = {}) {
    this._log(
      "ERROR",
      "workflow_error",
      `Error in ${operation}: ${error.message}`,
      {
        operation,
        error_name: error.name,
        error_message: sanitizeForLog(error.message),
        ...metadata,
      }
    );
  }

  // Generic integration events
  logIntegrationEvent(eventType, message, metadata = {}) {
    this._log("INFO", eventType, message, metadata);
  }

  // Performance metrics
  logMetric(metricName, value, unit = "Count", metadata = {}) {
    this._log("INFO", "metric", `Metric: ${metricName}`, {
      metric_name: metricName,
      metric_value: value,
      metric_unit: unit,
      ...metadata,
    });
  }

  logDuration(operation, startTime, metadata = {}) {
    const duration = Date.now() - startTime;
    this.logMetric(`${operation}_duration`, duration, "Milliseconds", {
      operation,
      ...metadata,
    });
  }

  // AWS service interactions
  logAWSCall(service, operation, metadata = {}) {
    this._log("DEBUG", "aws_call", `AWS ${service}.${operation}`, {
      aws_service: service,
      aws_operation: operation,
      ...metadata,
    });
  }

  logAWSError(service, operation, error, metadata = {}) {
    this._log("ERROR", "aws_error", `AWS ${service}.${operation} failed`, {
      aws_service: service,
      aws_operation: operation,
      error_name: error.name,
      error_message: sanitizeForLog(error.message),
      ...metadata,
    });
  }

  // General logging methods
  info(message, metadata = {}) {
    this._log("INFO", "info", message, metadata);
  }

  warn(message, metadata = {}) {
    this._log("WARN", "warning", message, metadata);
  }

  error(message, error = null, metadata = {}) {
    const errorMetadata = error
      ? {
          error_name: error.name,
          error_message: sanitizeForLog(error.message),
          ...metadata,
        }
      : metadata;

    this._log("ERROR", "error", message, errorMetadata);
  }

  debug(message, metadata = {}) {
    // Hard-disable debug in prod here if desired,
    // but LOG_LEVEL=INFO/WARN/ERROR already suppresses DEBUG.
    if (process.env.NODE_ENV !== "production") {
      this._log("DEBUG", "debug", message, metadata);
    }
  }
}
