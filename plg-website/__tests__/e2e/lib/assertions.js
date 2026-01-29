/**
 * E2E Test Assertions
 *
 * Custom assertions for E2E API testing.
 * Extends dm/facade/test-helpers with E2E-specific assertions.
 *
 * Features:
 * - HTTP response assertions
 * - JSON schema validation
 * - License key format validation
 * - Timing assertions
 *
 * @see 20260129_E2E_BACKEND_VALIDATION_SPEC.md - Section 8.2
 */

import { expect } from "../../../../dm/facade/test-helpers/index.js";
import { log } from "../config.js";

// ============================================================================
// HTTP Response Assertions
// ============================================================================

/**
 * Assert response has specific status code
 * @param {E2EResponse} response
 * @param {number} expectedStatus
 * @param {string} [message]
 */
export function expectStatus(response, expectedStatus, message) {
  const msg =
    message ||
    `Expected status ${expectedStatus}, got ${response.status}. Body: ${JSON.stringify(response.data)}`;

  if (response.status !== expectedStatus) {
    log.error("Status mismatch:", {
      expected: expectedStatus,
      actual: response.status,
      body: response.data,
    });
  }

  expect(response.status).toBe(expectedStatus);
}

/**
 * Assert response is successful (2xx)
 * @param {E2EResponse} response
 * @param {string} [message]
 */
export function expectSuccess(response, message) {
  const msg = message || `Expected success, got ${response.status}`;

  if (!response.ok) {
    log.error("Expected success:", {
      status: response.status,
      body: response.data,
    });
  }

  expect(response.ok).toBe(true);
}

/**
 * Assert response is an error with specific status
 * @param {E2EResponse} response
 * @param {number} expectedStatus
 * @param {string} [expectedMessage] - Substring to match in error message
 */
export function expectError(response, expectedStatus, expectedMessage) {
  expectStatus(response, expectedStatus);

  if (expectedMessage) {
    const errorMsg = response.getErrorMessage() || "";
    expect(errorMsg.toLowerCase()).toContain(expectedMessage.toLowerCase());
  }
}

/**
 * Assert response is 400 Bad Request
 * @param {E2EResponse} response
 * @param {string} [expectedMessage]
 */
export function expectBadRequest(response, expectedMessage) {
  expectError(response, 400, expectedMessage);
}

/**
 * Assert response is 401 Unauthorized
 * @param {E2EResponse} response
 * @param {string} [expectedMessage]
 */
export function expectUnauthorized(response, expectedMessage) {
  expectError(response, 401, expectedMessage);
}

/**
 * Assert response is 403 Forbidden
 * @param {E2EResponse} response
 * @param {string} [expectedMessage]
 */
export function expectForbidden(response, expectedMessage) {
  expectError(response, 403, expectedMessage);
}

/**
 * Assert response is 404 Not Found
 * @param {E2EResponse} response
 * @param {string} [expectedMessage]
 */
export function expectNotFound(response, expectedMessage) {
  expectError(response, 404, expectedMessage);
}

/**
 * Assert response is 429 Too Many Requests (rate limited)
 * @param {E2EResponse} response
 */
export function expectRateLimited(response) {
  expectStatus(response, 429);
}

// ============================================================================
// JSON/Data Assertions
// ============================================================================

/**
 * Assert response data contains required fields
 * @param {Object} data
 * @param {string[]} requiredFields
 */
export function expectFields(data, requiredFields) {
  for (const field of requiredFields) {
    if (data[field] === undefined) {
      log.error(`Missing required field: ${field}`, { data });
    }
    expect(data[field]).toBeDefined();
  }
}

/**
 * Assert response data matches expected shape (partial match)
 * @param {Object} data
 * @param {Object} expectedShape
 */
export function expectShape(data, expectedShape) {
  for (const [key, value] of Object.entries(expectedShape)) {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      expectShape(data[key], value);
    } else {
      expect(data[key]).toBe(value);
    }
  }
}

/**
 * Assert value is a valid ISO 8601 date string
 * @param {string} value
 */
export function expectIsoDate(value) {
  expect(typeof value).toBe("string");
  const date = new Date(value);
  expect(date.toISOString()).toBe(value);
}

/**
 * Assert value is a valid UUID
 * @param {string} value
 */
export function expectUuid(value) {
  expect(typeof value).toBe("string");
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  expect(value).toMatch(uuidRegex);
}

// ============================================================================
// License-Specific Assertions
// ============================================================================

/**
 * Assert value is a valid Mouse license key format
 * Format: MOUSE-XXXX-XXXX-XXXX-XXXX (4 groups of 4 alphanumeric chars)
 * @param {string} key
 */
export function expectLicenseKey(key) {
  expect(typeof key).toBe("string");
  const licenseKeyRegex =
    /^MOUSE-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

  if (!licenseKeyRegex.test(key)) {
    log.error("Invalid license key format:", key);
  }

  expect(key).toMatch(licenseKeyRegex);
}

/**
 * Assert license validation response shape
 * @param {Object} data
 */
export function expectLicenseValidation(data) {
  expectFields(data, ["valid", "code"]);
  expect(typeof data.valid).toBe("boolean");
  expect(typeof data.code).toBe("string");

  if (data.license) {
    expect(typeof data.license.status).toBe("string");
  }
}

/**
 * Assert license activation response shape
 * @param {Object} data
 */
export function expectLicenseActivation(data) {
  expectFields(data, ["success"]);
  expect(data.success).toBe(true);
}

/**
 * Assert trial init response shape
 * Accepts either E2EResponse or plain data object
 * @param {Object} data - E2EResponse or plain object
 */
export function expectTrialInit(data) {
  // Handle E2EResponse objects (get the json/data property)
  const json = data.json || data.data || data;

  // Validate top-level response structure
  expectFields(json, ["valid", "trial"]);
  expect(json.valid).toBe(true);

  // Validate trial object structure
  const { trial } = json;
  expectFields(trial, ["trialStartDate", "trialEndDate", "daysRemaining"]);
  expect(typeof trial.daysRemaining).toBe("number");
  expectIsoDate(trial.trialStartDate, "trial start date");
  expectIsoDate(trial.trialEndDate, "trial end date");
}

/**
 * Assert heartbeat response shape
 * @param {Object} data
 */
export function expectHeartbeat(data) {
  expectFields(data, ["valid", "nextHeartbeat"]);
  expect(typeof data.valid).toBe("boolean");
  expect(typeof data.nextHeartbeat).toBe("number");
}

/**
 * Assert days remaining is within expected range
 * @param {number} daysRemaining - Actual days remaining
 * @param {Object} options - Validation options
 * @param {number} [options.min] - Minimum expected days
 * @param {number} [options.max] - Maximum expected days
 * @param {number} [options.exact] - Exact expected days (overrides min/max)
 */
export function expectDaysRemaining(daysRemaining, options = {}) {
  expect(typeof daysRemaining).toBe("number");

  if (options.exact !== undefined) {
    expect(daysRemaining).toBe(options.exact);
    return;
  }

  if (options.min !== undefined) {
    if (daysRemaining < options.min) {
      log.error(`Days remaining ${daysRemaining} is below minimum ${options.min}`);
    }
    expect(daysRemaining).toBeGreaterThanOrEqual(options.min);
  }

  if (options.max !== undefined) {
    if (daysRemaining > options.max) {
      log.error(`Days remaining ${daysRemaining} is above maximum ${options.max}`);
    }
    expect(daysRemaining).toBeLessThanOrEqual(options.max);
  }
}

// ============================================================================
// Timing Assertions
// ============================================================================

/**
 * Assert operation completed within time limit
 * @param {number} durationMs - Actual duration
 * @param {number} maxMs - Maximum allowed duration
 * @param {string} [operation] - Operation name for error message
 */
export function expectWithinTime(durationMs, maxMs, operation = "Operation") {
  if (durationMs > maxMs) {
    log.warn(`${operation} took ${durationMs}ms (limit: ${maxMs}ms)`);
  }
  expect(durationMs).toBeLessThanOrEqual(maxMs);
}

/**
 * Time an async operation and assert it completes within limit
 * @param {Function} asyncFn - Async function to time
 * @param {number} maxMs - Maximum allowed duration
 * @param {string} [operation] - Operation name
 * @returns {Promise<any>} - Result of asyncFn
 */
export async function expectCompletesWithin(asyncFn, maxMs, operation) {
  const start = Date.now();
  const result = await asyncFn();
  const duration = Date.now() - start;

  expectWithinTime(duration, maxMs, operation);
  return result;
}

// ============================================================================
// Array Assertions
// ============================================================================

/**
 * Assert array has specific length
 * @param {Array} arr
 * @param {number} expectedLength
 */
export function expectLength(arr, expectedLength) {
  expect(Array.isArray(arr)).toBe(true);
  expect(arr.length).toBe(expectedLength);
}

/**
 * Assert array is not empty
 * @param {Array} arr
 */
export function expectNonEmpty(arr) {
  expect(Array.isArray(arr)).toBe(true);
  expect(arr.length).toBeGreaterThan(0);
}

/**
 * Assert value is a valid URL
 * @param {string} url
 * @param {string} [label] - Description of the URL for error messages
 */
export function expectUrl(url, label = "URL") {
  expect(typeof url).toBe("string");
  
  try {
    new URL(url);
  } catch (e) {
    log.error(`Invalid ${label}:`, { url, error: e.message });
    throw new Error(`Expected valid ${label}, got: ${url}`);
  }
  
  expect(url).toMatch(/^https?:\/\//);
}

/**
 * Assert array contains item matching predicate
 * @param {Array} arr
 * @param {Function} predicate
 */
export function expectContains(arr, predicate) {
  expect(Array.isArray(arr)).toBe(true);
  const found = arr.some(predicate);

  if (!found) {
    log.error("Array does not contain expected item:", arr);
  }

  expect(found).toBe(true);
}

// ============================================================================
// Re-export base assertions
// ============================================================================

export { expect };

export default {
  expectStatus,
  expectSuccess,
  expectError,
  expectBadRequest,
  expectUnauthorized,
  expectForbidden,
  expectNotFound,
  expectRateLimited,
  expectFields,
  expectShape,
  expectIsoDate,
  expectUuid,
  expectUrl,
  expectLicenseKey,
  expectLicenseValidation,
  expectLicenseActivation,
  expectTrialInit,
  expectHeartbeat,
  expectDaysRemaining,
  expectWithinTime,
  expectCompletesWithin,
  expectLength,
  expectNonEmpty,
  expectContains,
  expect,
};
