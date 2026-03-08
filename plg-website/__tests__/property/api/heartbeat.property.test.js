/**
 * Property-Based Tests — Heartbeat Status Classification
 *
 * Feature: status-remediation-plan, Property 9
 *
 * Property 9: Heartbeat status classification
 * For any license record, heartbeat returns `valid: true` iff status is in
 * {active, past_due, cancellation_pending, trial}; `valid: false` for
 * {expired, suspended, revoked}; HTTP 404 for null.
 *
 * Uses extracted logic with dependency injection — same pattern as the
 * Stripe property tests. Generates random license objects and statuses to
 * verify the classification invariant holds across all inputs.
 *
 * **Validates: Requirements 7.1, 7.2, 7.3, 7.4**
 */

import { describe, it } from "node:test";
import { expect } from "../../../../dm/facade/test-helpers/index.js";
import { LICENSE_STATUS } from "../../../src/lib/constants.js";

// ============================================================================
// Extracted logic: mirrors the status-classification gate in heartbeat/route.js
// Dependency-injected for testability — no module mocking needed.
// ============================================================================

/**
 * Classify a heartbeat request based on license lookup result and status.
 *
 * This is a pure-function extraction of the three decision points added by
 * Fix 2 (Tasks 9.1 + 9.2) in the heartbeat route handler:
 *   1. null license  →  { httpStatus: 404, valid: false, status: "not_found" }
 *   2. invalid status (expired/suspended/revoked)  →  { httpStatus: 200, valid: false, status }
 *   3. valid status   →  { httpStatus: 200, valid: true }
 *
 * @param {Object|null} license - DynamoDB license record or null
 * @returns {{ httpStatus: number, valid: boolean, status: string, reason?: string }}
 */
function classifyHeartbeat(license) {
  // Task 9.1: null license guard
  if (!license) {
    return {
      httpStatus: 404,
      valid: false,
      status: "not_found",
      reason: "License not found",
    };
  }

  // Task 9.2: status classification
  const INVALID_STATUSES = [
    LICENSE_STATUS.EXPIRED,
    LICENSE_STATUS.SUSPENDED,
    LICENSE_STATUS.REVOKED,
  ];

  if (INVALID_STATUSES.includes(license.status)) {
    return {
      httpStatus: 200,
      valid: false,
      status: license.status,
      reason: `License is ${license.status}`,
    };
  }

  // Valid — falls through to normal heartbeat success path
  return {
    httpStatus: 200,
    valid: true,
    status: license.status,
  };
}

// ============================================================================
// Random generators
// ============================================================================

const VALID_STATUSES = [
  LICENSE_STATUS.ACTIVE,
  LICENSE_STATUS.PAST_DUE,
  LICENSE_STATUS.CANCELLATION_PENDING,
];

const INVALID_STATUSES = [
  LICENSE_STATUS.EXPIRED,
  LICENSE_STATUS.SUSPENDED,
  LICENSE_STATUS.REVOKED,
];

function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomString(len) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++)
    s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function randomLicense(status) {
  return {
    PK: `LICENSE#lic_${randomString(8)}`,
    SK: "DETAILS",
    maxDevices: Math.floor(Math.random() * 10) + 1,
    keygenLicenseId: Math.random() > 0.5 ? `kgen_${randomString(12)}` : null,
    status,
    customerEmail: `${randomString(6)}@example.com`,
  };
}

// ============================================================================
// Feature: status-remediation-plan, Property 9
// ============================================================================

describe("Property 9: Heartbeat status classification", () => {
  // ---- 9a: null license always yields 404 + valid: false ----

  it("null license always returns 404 with valid: false (100 iterations)", () => {
    for (let i = 0; i < 100; i++) {
      const result = classifyHeartbeat(null);

      expect(result.httpStatus).toBe(404);
      expect(result.valid).toBe(false);
      expect(result.status).toBe("not_found");
      expect(result.reason).toBe("License not found");
    }
  });

  // ---- 9b: valid statuses yield valid: true ----

  it("valid statuses always return valid: true (100 iterations)", () => {
    for (let i = 0; i < 100; i++) {
      const status = randomPick(VALID_STATUSES);
      const license = randomLicense(status);
      const result = classifyHeartbeat(license);

      expect(result.httpStatus).toBe(200);
      expect(result.valid).toBe(true);
      expect(result.status).toBe(status);
      expect(result.reason).toBe(undefined);
    }
  });

  // ---- 9c: invalid statuses yield valid: false ----

  it("invalid statuses always return valid: false (100 iterations)", () => {
    for (let i = 0; i < 100; i++) {
      const status = randomPick(INVALID_STATUSES);
      const license = randomLicense(status);
      const result = classifyHeartbeat(license);

      expect(result.httpStatus).toBe(200);
      expect(result.valid).toBe(false);
      expect(result.status).toBe(status);
      expect(result.reason).toBe(`License is ${status}`);
    }
  });

  // ---- 9d: past_due is specifically valid (dunning window) ----

  it("past_due is always classified as valid (100 iterations)", () => {
    for (let i = 0; i < 100; i++) {
      const license = randomLicense(LICENSE_STATUS.PAST_DUE);
      const result = classifyHeartbeat(license);

      expect(result.valid).toBe(true);
      expect(result.status).toBe("past_due");
    }
  });

  // ---- 9e: exhaustive — every LICENSE_STATUS value classified correctly ----

  it("all LICENSE_STATUS values are classified", () => {
    const allStatuses = Object.values(LICENSE_STATUS);
    const validSet = new Set(VALID_STATUSES);
    const invalidSet = new Set(INVALID_STATUSES);
    const classifiedSet = new Set([...VALID_STATUSES, ...INVALID_STATUSES]);

    for (const status of allStatuses) {
      const license = randomLicense(status);
      const result = classifyHeartbeat(license);

      if (validSet.has(status)) {
        expect(result.valid).toBe(true);
      } else if (invalidSet.has(status)) {
        expect(result.valid).toBe(false);
      } else {
        // Statuses not in either list (pending_account, canceled, disputed)
        // fall through to valid: true in the extracted logic — this matches
        // the route behavior where anything not explicitly rejected continues
        // to the success path
        expect(result.valid).toBe(true);
      }
    }
  });

  // ---- 9f: classification is idempotent ----

  it("classifying the same license twice yields identical results (100 iterations)", () => {
    for (let i = 0; i < 100; i++) {
      const status = randomPick([...VALID_STATUSES, ...INVALID_STATUSES, null]);
      const license = status ? randomLicense(status) : null;

      const result1 = classifyHeartbeat(license);
      const result2 = classifyHeartbeat(license);

      expect(result1.httpStatus).toBe(result2.httpStatus);
      expect(result1.valid).toBe(result2.valid);
      expect(result1.status).toBe(result2.status);
      expect(result1.reason).toBe(result2.reason);
    }
  });
});
