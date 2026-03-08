/**
 * DDB Migration — Unit Tests (Task 12.4)
 *
 * Tests the Fix 7 migration: Keygen read calls replaced with DDB reads.
 * Covers all three migrated routes:
 *   - validate: getLicenseByKey + getDeviceByFingerprint (was validateLicense)
 *   - portal/license: getLicense only (was getLicense + getKeygenLicense)
 *   - check: getCustomerLicensesByEmail (was getLicensesByEmail from Keygen)
 *
 * Also verifies no Keygen read imports remain in migrated routes.
 *
 * Uses extracted pure-function logic — no module mocking needed.
 *
 * _Requirements: 13.10_
 */

import { describe, it } from "node:test";
import { expect } from "../../../../dm/facade/test-helpers/index.js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = resolve(__dirname, "../../../src");

// ============================================================================
// Extracted logic: validate route — license + device classification
// Mirrors the DDB-based validation gate from license/validate/route.js
// ============================================================================

const INVALID_STATUSES = ["expired", "suspended", "revoked"];

/**
 * Classify a license validation request using DDB data.
 *
 * @param {Object|null} license - DDB license record from getLicenseByKey
 * @param {Object|null} deviceRecord - DDB device record from getDeviceByFingerprint
 * @returns {{ valid: boolean, code: string, detail: string, license: Object|null }}
 */
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
    license: {
      status: license.status,
      expiresAt: license.expiresAt,
    },
  };
}

// ============================================================================
// Extracted logic: portal license route — DDB-only status
// Mirrors buildLicenseResponse from portal/license/route.js
// ============================================================================

/**
 * Build license status from DDB record only (no Keygen).
 *
 * @param {Object|null} localLicense - DDB license record from getLicense
 * @returns {{ status: string, expiresAt: string|undefined }}
 */
function classifyPortalLicense(localLicense) {
  return {
    status: localLicense?.status || "unknown",
    expiresAt: localLicense?.expiresAt,
  };
}

// ============================================================================
// Extracted logic: check route — DDB license field mapping
// Mirrors the license response mapping from license/check/route.js
// ============================================================================

/**
 * Map a DDB license record to the check route response shape.
 *
 * @param {Object} ddbLicense - DDB license record from getCustomerLicensesByEmail
 * @returns {{ licenseKey: string|null, licenseId: string, plan: string, expiresAt: string }}
 */
function mapCheckLicense(ddbLicense) {
  return {
    licenseKey: ddbLicense.licenseKey || null,
    licenseId: ddbLicense.keygenLicenseId,
    plan: ddbLicense.planName?.toLowerCase() || "individual",
    expiresAt: ddbLicense.expiresAt,
  };
}

// ============================================================================
// Unit tests: Validate route (Task 12.1)
// ============================================================================

describe("validate route — DDB migration (Fix 7 / Task 12.1)", () => {
  describe("license not found", () => {
    it("returns NOT_FOUND when getLicenseByKey returns null", () => {
      const result = classifyValidation(null, null);
      expect(result.valid).toBe(false);
      expect(result.code).toBe("NOT_FOUND");
      expect(result.license).toBe(null);
    });
  });

  describe("license status classification", () => {
    it("active license + device found → VALID", () => {
      const license = {
        status: "active",
        expiresAt: "2027-01-01",
        keygenLicenseId: "lic_1",
      };
      const device = { fingerprint: "fp_1", userId: "u1" };
      const result = classifyValidation(license, device);
      expect(result.valid).toBe(true);
      expect(result.code).toBe("VALID");
    });

    it("active license + no device → FINGERPRINT_SCOPE_MISMATCH", () => {
      const license = {
        status: "active",
        expiresAt: "2027-01-01",
        keygenLicenseId: "lic_1",
      };
      const result = classifyValidation(license, null);
      expect(result.valid).toBe(false);
      expect(result.code).toBe("FINGERPRINT_SCOPE_MISMATCH");
      expect(result.detail).toBe("Device not associated with this license");
    });

    it("expired license → EXPIRED regardless of device", () => {
      const license = {
        status: "expired",
        expiresAt: "2025-01-01",
        keygenLicenseId: "lic_1",
      };
      const device = { fingerprint: "fp_1", userId: "u1" };
      const result = classifyValidation(license, device);
      expect(result.valid).toBe(false);
      expect(result.code).toBe("EXPIRED");
      expect(result.detail).toBe("License is expired");
    });

    it("suspended license → SUSPENDED regardless of device", () => {
      const license = {
        status: "suspended",
        expiresAt: "2027-01-01",
        keygenLicenseId: "lic_1",
      };
      const device = { fingerprint: "fp_1", userId: "u1" };
      const result = classifyValidation(license, device);
      expect(result.valid).toBe(false);
      expect(result.code).toBe("SUSPENDED");
    });

    it("revoked license → REVOKED regardless of device", () => {
      const license = {
        status: "revoked",
        expiresAt: null,
        keygenLicenseId: "lic_1",
      };
      const device = { fingerprint: "fp_1", userId: "u1" };
      const result = classifyValidation(license, device);
      expect(result.valid).toBe(false);
      expect(result.code).toBe("REVOKED");
    });

    it("past_due license + device → VALID (tools work during dunning)", () => {
      const license = {
        status: "past_due",
        expiresAt: "2027-01-01",
        keygenLicenseId: "lic_1",
      };
      const device = { fingerprint: "fp_1", userId: "u1" };
      const result = classifyValidation(license, device);
      expect(result.valid).toBe(true);
      expect(result.code).toBe("VALID");
    });

    it("cancellation_pending license + device → VALID", () => {
      const license = {
        status: "cancellation_pending",
        expiresAt: "2027-01-01",
        keygenLicenseId: "lic_1",
      };
      const device = { fingerprint: "fp_1", userId: "u1" };
      const result = classifyValidation(license, device);
      expect(result.valid).toBe(true);
      expect(result.code).toBe("VALID");
    });
  });

  describe("response shape", () => {
    it("includes license status and expiresAt when license exists", () => {
      const license = {
        status: "active",
        expiresAt: "2027-03-01T00:00:00Z",
        keygenLicenseId: "lic_1",
      };
      const device = { fingerprint: "fp_1", userId: "u1" };
      const result = classifyValidation(license, device);
      expect(result.license.status).toBe("active");
      expect(result.license.expiresAt).toBe("2027-03-01T00:00:00Z");
    });
  });
});

// ============================================================================
// Unit tests: Portal license route (Task 12.2)
// ============================================================================

describe("portal license route — DDB migration (Fix 7 / Task 12.2)", () => {
  it("uses DDB license status directly", () => {
    const localLicense = { status: "active", expiresAt: "2027-03-01" };
    const result = classifyPortalLicense(localLicense);
    expect(result.status).toBe("active");
    expect(result.expiresAt).toBe("2027-03-01");
  });

  it("returns unknown when DDB license is null", () => {
    const result = classifyPortalLicense(null);
    expect(result.status).toBe("unknown");
  });

  it("returns expired status from DDB (not from Keygen)", () => {
    const localLicense = { status: "expired", expiresAt: "2025-01-01" };
    const result = classifyPortalLicense(localLicense);
    expect(result.status).toBe("expired");
  });
});

// ============================================================================
// Unit tests: Check route (Task 12.3)
// ============================================================================

describe("check route — DDB migration (Fix 7 / Task 12.3)", () => {
  it("maps DDB license fields to response shape", () => {
    const ddbLicense = {
      licenseKey: "MOUSE-ABCD-1234-EFGH-WXYZ",
      keygenLicenseId: "lic_abc123",
      planName: "Business",
      expiresAt: "2027-06-01",
      status: "active",
    };
    const result = mapCheckLicense(ddbLicense);
    expect(result.licenseKey).toBe("MOUSE-ABCD-1234-EFGH-WXYZ");
    expect(result.licenseId).toBe("lic_abc123");
    expect(result.plan).toBe("business");
    expect(result.expiresAt).toBe("2027-06-01");
  });

  it("handles missing licenseKey gracefully", () => {
    const ddbLicense = {
      keygenLicenseId: "lic_xyz",
      planName: "Individual",
      expiresAt: "2027-01-01",
      status: "expired",
    };
    const result = mapCheckLicense(ddbLicense);
    expect(result.licenseKey).toBe(null);
    expect(result.plan).toBe("individual");
  });

  it("defaults plan to individual when planName is missing", () => {
    const ddbLicense = {
      keygenLicenseId: "lic_xyz",
      expiresAt: null,
      status: "active",
    };
    const result = mapCheckLicense(ddbLicense);
    expect(result.plan).toBe("individual");
  });
});

// ============================================================================
// Source file verification: No Keygen read imports remain
// ============================================================================

describe("no Keygen read imports in migrated routes", () => {
  const KEYGEN_READ_PATTERNS = [
    /import\s+.*validateLicense.*from\s+["']@\/lib\/keygen["']/,
    /import\s+.*getLicensesByEmail.*from\s+["']@\/lib\/keygen["']/,
    /import\s+.*getLicense\s+as\s+getKeygenLicense.*from\s+["']@\/lib\/keygen["']/,
  ];

  const MIGRATED_ROUTES = [
    "app/api/license/validate/route.js",
    "app/api/portal/license/route.js",
    "app/api/license/check/route.js",
  ];

  for (const route of MIGRATED_ROUTES) {
    it(`${route} has no Keygen read imports`, () => {
      const source = readFileSync(resolve(SRC_ROOT, route), "utf8");
      for (const pattern of KEYGEN_READ_PATTERNS) {
        expect(pattern.test(source)).toBe(false);
      }
    });
  }

  it("validate route still imports machineHeartbeat (write, intentionally kept)", () => {
    const source = readFileSync(
      resolve(SRC_ROOT, "app/api/license/validate/route.js"),
      "utf8",
    );
    expect(
      source.includes('import { machineHeartbeat } from "@/lib/keygen"'),
    ).toBe(true);
  });
});
