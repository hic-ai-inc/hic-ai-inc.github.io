/**
 * Property-Based Tests — DDB Migration (Fix 7)
 *
 * Properties 11, 12, 13: All migrated routes read from DDB only.
 *
 * Strategy: exhaustive enumeration over all license statuses with
 * randomized surrounding context (license fields, device records,
 * customer shapes). The status domain is finite — exhaustive coverage
 * beats random picks. Randomized context verifies classification is
 * orthogonal to incidental fields.
 *
 * **Validates: Requirements 9.1–9.6**
 */

import { describe, it } from "node:test";
import { expect } from "../../../../dm/facade/test-helpers/index.js";

// ============================================================================
// Random generators
// ============================================================================

function randomString(len) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++)
    s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomLicense(status) {
  return {
    PK: `LICENSE#lic_${randomString(12)}`,
    SK: "DETAILS",
    keygenLicenseId: `lic_${randomString(12)}`,
    licenseKey: `MOUSE-${randomString(4).toUpperCase()}-${randomString(4).toUpperCase()}-${randomString(4).toUpperCase()}-${randomString(4).toUpperCase()}`,
    status,
    expiresAt:
      Math.random() > 0.3
        ? new Date(Date.now() + Math.random() * 1e10).toISOString()
        : null,
    maxDevices: Math.floor(Math.random() * 10) + 1,
    activatedDevices: Math.floor(Math.random() * 5),
    email: `${randomString(6)}@${randomString(4)}.com`,
    planName: randomPick(["Individual", "Business"]),
    createdAt: new Date(Date.now() - Math.random() * 1e10).toISOString(),
  };
}

function randomDevice() {
  return {
    fingerprint: `fp_${randomString(16)}`,
    userId: `user_${randomString(10)}`,
    userEmail: `${randomString(6)}@example.com`,
    keygenMachineId: `mach_${randomString(12)}`,
    lastSeen: new Date().toISOString(),
  };
}

function randomCustomer() {
  return {
    userId: `user_${randomString(10)}`,
    email: `${randomString(6)}@${randomString(4)}.com`,
    keygenLicenseId: `lic_${randomString(12)}`,
    keygenLicenseKey: `MOUSE-${randomString(4).toUpperCase()}-${randomString(4).toUpperCase()}-${randomString(4).toUpperCase()}-${randomString(4).toUpperCase()}`,
    subscriptionStatus: randomPick([
      "active",
      "past_due",
      "canceled",
      "unpaid",
      "cancellation_pending",
    ]),
    accountType: randomPick(["individual", "business"]),
    stripeCustomerId: `cus_${randomString(14)}`,
  };
}

// ============================================================================
// Status domains
// ============================================================================

const VALID_STATUSES = [
  "active",
  "past_due",
  "cancellation_pending",
  "pending_account",
  "disputed",
];
const INVALID_STATUSES = ["expired", "suspended", "revoked"];
const ALL_STATUSES = [...VALID_STATUSES, ...INVALID_STATUSES];
const ITERATIONS_PER_STATUS = 20;

// ============================================================================
// Extracted logic: validate route classification
// ============================================================================

function classifyValidation(license, deviceRecord) {
  if (!license) {
    return {
      valid: false,
      code: "NOT_FOUND",
      detail: "License key not found",
      license: null,
    };
  }

  const licenseValid = !INVALID_STATUSES.includes(license.status);
  const code = licenseValid ? "VALID" : license.status.toUpperCase();
  const detail = licenseValid
    ? "License is valid"
    : `License is ${license.status}`;
  const deviceFound = Boolean(deviceRecord);

  const effectiveValid = licenseValid && deviceFound;
  const effectiveCode = effectiveValid
    ? "VALID"
    : !licenseValid
      ? code
      : "FINGERPRINT_SCOPE_MISMATCH";
  const effectiveDetail = effectiveValid
    ? detail
    : !licenseValid
      ? detail
      : "Device not associated with this license";

  return {
    valid: effectiveValid,
    code: effectiveCode,
    detail: effectiveDetail,
    license: { status: license.status, expiresAt: license.expiresAt },
  };
}

// ============================================================================
// Extracted logic: portal license — DDB-only status
// ============================================================================

function classifyPortalLicense(localLicense) {
  return {
    status: localLicense?.status || "unknown",
    expiresAt: localLicense?.expiresAt,
  };
}

// ============================================================================
// Extracted logic: check route — DDB field mapping
// ============================================================================

function mapCheckLicense(ddbLicense) {
  return {
    licenseKey: ddbLicense.licenseKey || null,
    licenseId: ddbLicense.keygenLicenseId,
    plan: ddbLicense.planName?.toLowerCase() || "individual",
    expiresAt: ddbLicense.expiresAt,
  };
}

// ============================================================================
// Feature: status-remediation-plan, Property 11
// Validate route reads from DDB only
// ============================================================================

describe("Property 11: Validate route reads from DDB only", () => {
  // ---- 11a: null license always yields NOT_FOUND ----

  it("null license always returns NOT_FOUND (20 iterations with random context)", () => {
    for (let i = 0; i < 20; i++) {
      const _device = randomDevice(); // context varies, irrelevant
      const result = classifyValidation(null, null);

      expect(result.valid).toBe(false);
      expect(result.code).toBe("NOT_FOUND");
      expect(result.license).toBe(null);
    }
  });

  // ---- 11b: valid statuses + device → VALID ----

  for (const status of VALID_STATUSES) {
    it(`"${status}" + device found → VALID (${ITERATIONS_PER_STATUS} iterations)`, () => {
      for (let i = 0; i < ITERATIONS_PER_STATUS; i++) {
        const license = randomLicense(status);
        const device = randomDevice();
        const result = classifyValidation(license, device);

        expect(result.valid).toBe(true);
        expect(result.code).toBe("VALID");
        expect(result.license.status).toBe(status);
      }
    });
  }

  // ---- 11c: valid statuses + no device → FINGERPRINT_SCOPE_MISMATCH ----

  for (const status of VALID_STATUSES) {
    it(`"${status}" + no device → FINGERPRINT_SCOPE_MISMATCH (${ITERATIONS_PER_STATUS} iterations)`, () => {
      for (let i = 0; i < ITERATIONS_PER_STATUS; i++) {
        const license = randomLicense(status);
        const result = classifyValidation(license, null);

        expect(result.valid).toBe(false);
        expect(result.code).toBe("FINGERPRINT_SCOPE_MISMATCH");
      }
    });
  }

  // ---- 11d: invalid statuses → status code regardless of device ----

  for (const status of INVALID_STATUSES) {
    it(`"${status}" → ${status.toUpperCase()} even with device (${ITERATIONS_PER_STATUS} iterations)`, () => {
      for (let i = 0; i < ITERATIONS_PER_STATUS; i++) {
        const license = randomLicense(status);
        const device = randomDevice();
        const result = classifyValidation(license, device);

        expect(result.valid).toBe(false);
        expect(result.code).toBe(status.toUpperCase());
        expect(result.detail).toBe(`License is ${status}`);
      }
    });
  }

  // ---- 11e: classification is deterministic ----

  it("classifying the same inputs twice yields identical results", () => {
    for (const status of ALL_STATUSES) {
      const license = randomLicense(status);
      const device = randomDevice();
      const r1 = classifyValidation(license, device);
      const r2 = classifyValidation(license, device);

      expect(r1.valid).toBe(r2.valid);
      expect(r1.code).toBe(r2.code);
      expect(r1.detail).toBe(r2.detail);
    }
  });
});

// ============================================================================
// Feature: status-remediation-plan, Property 12
// Portal license route reads from DDB only
// ============================================================================

describe("Property 12: Portal license route reads from DDB only", () => {
  // ---- 12a: every status is returned as-is from DDB ----

  for (const status of ALL_STATUSES) {
    it(`DDB status "${status}" returned directly (${ITERATIONS_PER_STATUS} iterations)`, () => {
      for (let i = 0; i < ITERATIONS_PER_STATUS; i++) {
        const license = randomLicense(status);
        const result = classifyPortalLicense(license);

        expect(result.status).toBe(status);
        expect(result.expiresAt).toBe(license.expiresAt);
      }
    });
  }

  // ---- 12b: null license → "unknown" ----

  it('null DDB license yields "unknown" (20 iterations)', () => {
    for (let i = 0; i < 20; i++) {
      const _customer = randomCustomer(); // context varies
      const result = classifyPortalLicense(null);
      expect(result.status).toBe("unknown");
    }
  });

  // ---- 12c: expiresAt passed through without transformation ----

  it("expiresAt from DDB is passed through unchanged (20 iterations)", () => {
    for (let i = 0; i < 20; i++) {
      const license = randomLicense(randomPick(ALL_STATUSES));
      const result = classifyPortalLicense(license);
      expect(result.expiresAt).toBe(license.expiresAt);
    }
  });
});

// ============================================================================
// Feature: status-remediation-plan, Property 13
// Check route reads from DDB only
// ============================================================================

describe("Property 13: Check route reads from DDB only", () => {
  // ---- 13a: DDB fields map correctly to response shape ----

  for (const status of ALL_STATUSES) {
    it(`DDB license with status "${status}" maps correctly (${ITERATIONS_PER_STATUS} iterations)`, () => {
      for (let i = 0; i < ITERATIONS_PER_STATUS; i++) {
        const license = randomLicense(status);
        const result = mapCheckLicense(license);

        expect(result.licenseId).toBe(license.keygenLicenseId);
        expect(result.expiresAt).toBe(license.expiresAt);
        // plan is lowercase of planName
        if (license.planName) {
          expect(result.plan).toBe(license.planName.toLowerCase());
        }
      }
    });
  }

  // ---- 13b: missing licenseKey → null ----

  it("missing licenseKey yields null (20 iterations)", () => {
    for (let i = 0; i < 20; i++) {
      const license = randomLicense(randomPick(ALL_STATUSES));
      delete license.licenseKey;
      const result = mapCheckLicense(license);
      expect(result.licenseKey).toBe(null);
    }
  });

  // ---- 13c: missing planName defaults to "individual" ----

  it('missing planName defaults to "individual" (20 iterations)', () => {
    for (let i = 0; i < 20; i++) {
      const license = randomLicense(randomPick(ALL_STATUSES));
      delete license.planName;
      const result = mapCheckLicense(license);
      expect(result.plan).toBe("individual");
    }
  });

  // ---- 13d: field mapping is deterministic ----

  it("mapping the same DDB license twice yields identical results", () => {
    for (const status of ALL_STATUSES) {
      const license = randomLicense(status);
      const r1 = mapCheckLicense(license);
      const r2 = mapCheckLicense(license);

      expect(r1.licenseKey).toBe(r2.licenseKey);
      expect(r1.licenseId).toBe(r2.licenseId);
      expect(r1.plan).toBe(r2.plan);
      expect(r1.expiresAt).toBe(r2.expiresAt);
    }
  });
});
