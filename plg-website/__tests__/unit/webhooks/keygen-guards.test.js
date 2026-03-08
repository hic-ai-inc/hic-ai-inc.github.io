/**
 * Keygen Webhook Handler — Stale Event Guard Tests
 *
 * Verifies that Keygen webhook handlers do NOT overwrite authoritative DDB
 * state when a stale Keygen event arrives (e.g., license.expired after a
 * renewLicense() failure). DDB is the source of truth.
 *
 * Three guards tested:
 * 1. handleLicenseExpired — suppressed if DDB: active + future expiresAt
 * 2. handleLicenseReinstated — suppressed if DDB: disputed/revoked/expired
 * 3. handleLicenseRenewed — suppressed if DDB: disputed/revoked
 *
 * Uses extracted logic with dependency injection + source-level verification.
 */

import { describe, it } from "node:test";
import { expect, createSpy } from "../../../../dm/facade/test-helpers/index.js";

// ============================================================================
// Extracted logic: mirrors handler functions from route.js with DI
// ============================================================================

/**
 * Extracted handleLicenseExpired with dependency injection.
 * Guard: suppress if DDB says active with a future expiresAt.
 */
async function handleLicenseExpired(data, deps) {
  const licenseId = data.id;
  deps.log.info("license_expired", "License expired event received", {
    licenseId,
  });

  const license = await deps.getLicense(licenseId);
  if (
    license?.status === "active" &&
    license?.expiresAt &&
    license.expiresAt > new Date().toISOString()
  ) {
    deps.log.warn(
      "stale_keygen_expiration_suppressed",
      "Keygen expired event conflicts with DDB active status — suppressed to preserve DDB as source of truth",
      {
        licenseId,
        ddbStatus: license.status,
        ddbExpiresAt: license.expiresAt,
      },
    );
    return;
  }

  await deps.updateLicenseStatus(licenseId, "expired", {
    expiredAt: new Date().toISOString(),
  });

  if (license?.email) {
    deps.log.info("license_expired_processed", "License expiration processed", {
      hasEmail: true,
      licenseId,
    });
  }
}

/**
 * Extracted handleLicenseReinstated with dependency injection.
 * Guard: suppress if DDB status is disputed/revoked/expired.
 */
async function handleLicenseReinstated(data, deps) {
  const licenseId = data.id;
  deps.log.info("license_reinstated", "License reinstated event received", {
    licenseId,
  });

  const PROTECTED_STATUSES = ["disputed", "revoked", "expired"];
  const license = await deps.getLicense(licenseId);
  if (license && PROTECTED_STATUSES.includes(license.status)) {
    deps.log.warn(
      "stale_keygen_reinstate_suppressed",
      "Keygen reinstated event conflicts with DDB authoritative status — suppressed",
      {
        licenseId,
        ddbStatus: license.status,
      },
    );
    return;
  }

  await deps.updateLicenseStatus(licenseId, "active", {
    reinstatedAt: new Date().toISOString(),
  });
}

/**
 * Extracted handleLicenseRenewed with dependency injection.
 * Guard: suppress if DDB status is disputed/revoked.
 */
async function handleLicenseRenewed(data, deps) {
  const licenseId = data.id;
  const newExpiry = data.attributes?.expiry;
  deps.log.info("license_renewed", "License renewed event received", {
    licenseId,
    hasNewExpiry: Boolean(newExpiry),
  });

  const PROTECTED_STATUSES = ["disputed", "revoked"];
  const license = await deps.getLicense(licenseId);
  if (license && PROTECTED_STATUSES.includes(license.status)) {
    deps.log.warn(
      "stale_keygen_renew_suppressed",
      "Keygen renewed event conflicts with DDB authoritative status — suppressed",
      {
        licenseId,
        ddbStatus: license.status,
      },
    );
    return;
  }

  await deps.updateLicenseStatus(licenseId, "active", {
    expiresAt: newExpiry,
    renewedAt: new Date().toISOString(),
  });
}

// ============================================================================
// Test helpers
// ============================================================================

function createMockLog() {
  return {
    info: createSpy("log.info"),
    warn: createSpy("log.warn"),
    error: createSpy("log.error"),
  };
}

function createDeps({ licenseOverride = {} } = {}) {
  const log = createMockLog();
  const getLicense = createSpy("getLicense").mockResolvedValue({
    status: "active",
    expiresAt: "2099-12-31T00:00:00.000Z",
    email: "test@example.com",
    ...licenseOverride,
  });
  const updateLicenseStatus = createSpy(
    "updateLicenseStatus",
  ).mockResolvedValue(undefined);
  return { log, getLicense, updateLicenseStatus };
}

// ============================================================================
// Guard 1: handleLicenseExpired — suppress if DDB active + future expiresAt
// ============================================================================

describe("Keygen webhook guard: handleLicenseExpired", () => {
  it("should SUPPRESS expired event when DDB says active + future expiresAt", async () => {
    const deps = createDeps({
      licenseOverride: {
        status: "active",
        expiresAt: "2099-12-31T00:00:00.000Z",
      },
    });

    await handleLicenseExpired({ id: "lic-001" }, deps);

    expect(deps.updateLicenseStatus.callCount).toBe(0);
    expect(deps.log.warn.callCount).toBe(1);
    expect(deps.log.warn.calls[0][0]).toBe(
      "stale_keygen_expiration_suppressed",
    );
  });

  it("should ALLOW expired event when DDB says active but expiresAt is in the past", async () => {
    const deps = createDeps({
      licenseOverride: {
        status: "active",
        expiresAt: "2020-01-01T00:00:00.000Z",
      },
    });

    await handleLicenseExpired({ id: "lic-002" }, deps);

    expect(deps.updateLicenseStatus.callCount).toBe(1);
    expect(deps.updateLicenseStatus.calls[0][1]).toBe("expired");
  });

  it("should ALLOW expired event when DDB says past_due (not protected)", async () => {
    const deps = createDeps({
      licenseOverride: {
        status: "past_due",
        expiresAt: "2099-12-31T00:00:00.000Z",
      },
    });

    await handleLicenseExpired({ id: "lic-003" }, deps);

    expect(deps.updateLicenseStatus.callCount).toBe(1);
    expect(deps.updateLicenseStatus.calls[0][1]).toBe("expired");
  });

  it("should ALLOW expired event when DDB says suspended", async () => {
    const deps = createDeps({
      licenseOverride: {
        status: "suspended",
        expiresAt: "2099-12-31T00:00:00.000Z",
      },
    });

    await handleLicenseExpired({ id: "lic-004" }, deps);

    expect(deps.updateLicenseStatus.callCount).toBe(1);
  });

  it("should ALLOW expired event when DDB has no expiresAt", async () => {
    const deps = createDeps({
      licenseOverride: { status: "active", expiresAt: null },
    });

    await handleLicenseExpired({ id: "lic-005" }, deps);

    expect(deps.updateLicenseStatus.callCount).toBe(1);
  });

  it("should ALLOW expired event when DDB license not found (null)", async () => {
    const log = createMockLog();
    const getLicense = createSpy("getLicense").mockResolvedValue(null);
    const updateLicenseStatus = createSpy(
      "updateLicenseStatus",
    ).mockResolvedValue(undefined);

    await handleLicenseExpired(
      { id: "lic-006" },
      { log, getLicense, updateLicenseStatus },
    );

    expect(updateLicenseStatus.callCount).toBe(1);
  });

  it("should ALLOW expired event when DDB says already expired", async () => {
    const deps = createDeps({
      licenseOverride: {
        status: "expired",
        expiresAt: "2020-01-01T00:00:00.000Z",
      },
    });

    await handleLicenseExpired({ id: "lic-007" }, deps);

    // Idempotent — writing expired over expired is harmless
    expect(deps.updateLicenseStatus.callCount).toBe(1);
  });
});

// ============================================================================
// Guard 2: handleLicenseReinstated — suppress if DDB is disputed/revoked/expired
// ============================================================================

describe("Keygen webhook guard: handleLicenseReinstated", () => {
  it("should SUPPRESS reinstate when DDB says 'disputed'", async () => {
    const deps = createDeps({ licenseOverride: { status: "disputed" } });

    await handleLicenseReinstated({ id: "lic-010" }, deps);

    expect(deps.updateLicenseStatus.callCount).toBe(0);
    expect(deps.log.warn.callCount).toBe(1);
    expect(deps.log.warn.calls[0][0]).toBe("stale_keygen_reinstate_suppressed");
  });

  it("should SUPPRESS reinstate when DDB says 'revoked'", async () => {
    const deps = createDeps({ licenseOverride: { status: "revoked" } });

    await handleLicenseReinstated({ id: "lic-011" }, deps);

    expect(deps.updateLicenseStatus.callCount).toBe(0);
    expect(deps.log.warn.calls[0][0]).toBe("stale_keygen_reinstate_suppressed");
  });

  it("should SUPPRESS reinstate when DDB says 'expired'", async () => {
    const deps = createDeps({ licenseOverride: { status: "expired" } });

    await handleLicenseReinstated({ id: "lic-012" }, deps);

    expect(deps.updateLicenseStatus.callCount).toBe(0);
  });

  it("should ALLOW reinstate when DDB says 'suspended'", async () => {
    const deps = createDeps({ licenseOverride: { status: "suspended" } });

    await handleLicenseReinstated({ id: "lic-013" }, deps);

    expect(deps.updateLicenseStatus.callCount).toBe(1);
    expect(deps.updateLicenseStatus.calls[0][1]).toBe("active");
  });

  it("should ALLOW reinstate when DDB says 'past_due'", async () => {
    const deps = createDeps({ licenseOverride: { status: "past_due" } });

    await handleLicenseReinstated({ id: "lic-014" }, deps);

    expect(deps.updateLicenseStatus.callCount).toBe(1);
  });

  it("should ALLOW reinstate when DDB license not found (null)", async () => {
    const log = createMockLog();
    const getLicense = createSpy("getLicense").mockResolvedValue(null);
    const updateLicenseStatus = createSpy(
      "updateLicenseStatus",
    ).mockResolvedValue(undefined);

    await handleLicenseReinstated(
      { id: "lic-015" },
      { log, getLicense, updateLicenseStatus },
    );

    expect(updateLicenseStatus.callCount).toBe(1);
  });
});

// ============================================================================
// Guard 3: handleLicenseRenewed — suppress if DDB is disputed/revoked
// ============================================================================

describe("Keygen webhook guard: handleLicenseRenewed", () => {
  it("should SUPPRESS renew when DDB says 'disputed'", async () => {
    const deps = createDeps({ licenseOverride: { status: "disputed" } });

    await handleLicenseRenewed(
      { id: "lic-020", attributes: { expiry: "2099-12-31T00:00:00.000Z" } },
      deps,
    );

    expect(deps.updateLicenseStatus.callCount).toBe(0);
    expect(deps.log.warn.callCount).toBe(1);
    expect(deps.log.warn.calls[0][0]).toBe("stale_keygen_renew_suppressed");
  });

  it("should SUPPRESS renew when DDB says 'revoked'", async () => {
    const deps = createDeps({ licenseOverride: { status: "revoked" } });

    await handleLicenseRenewed(
      { id: "lic-021", attributes: { expiry: "2099-12-31T00:00:00.000Z" } },
      deps,
    );

    expect(deps.updateLicenseStatus.callCount).toBe(0);
  });

  it("should ALLOW renew when DDB says 'active'", async () => {
    const deps = createDeps({ licenseOverride: { status: "active" } });

    await handleLicenseRenewed(
      { id: "lic-022", attributes: { expiry: "2099-12-31T00:00:00.000Z" } },
      deps,
    );

    expect(deps.updateLicenseStatus.callCount).toBe(1);
    expect(deps.updateLicenseStatus.calls[0][1]).toBe("active");
  });

  it("should ALLOW renew when DDB says 'expired' (renewal restoring service)", async () => {
    const deps = createDeps({ licenseOverride: { status: "expired" } });

    await handleLicenseRenewed(
      { id: "lic-023", attributes: { expiry: "2099-12-31T00:00:00.000Z" } },
      deps,
    );

    expect(deps.updateLicenseStatus.callCount).toBe(1);
  });

  it("should ALLOW renew when DDB says 'suspended'", async () => {
    const deps = createDeps({ licenseOverride: { status: "suspended" } });

    await handleLicenseRenewed(
      { id: "lic-024", attributes: { expiry: "2099-12-31T00:00:00.000Z" } },
      deps,
    );

    expect(deps.updateLicenseStatus.callCount).toBe(1);
  });

  it("should ALLOW renew when DDB license not found (null)", async () => {
    const log = createMockLog();
    const getLicense = createSpy("getLicense").mockResolvedValue(null);
    const updateLicenseStatus = createSpy(
      "updateLicenseStatus",
    ).mockResolvedValue(undefined);

    await handleLicenseRenewed(
      { id: "lic-025", attributes: { expiry: "2099-12-31T00:00:00.000Z" } },
      { log, getLicense, updateLicenseStatus },
    );

    expect(updateLicenseStatus.callCount).toBe(1);
  });

  it("should pass the Keygen expiry through to updateLicenseStatus", async () => {
    const deps = createDeps({ licenseOverride: { status: "active" } });
    const testExpiry = "2027-06-15T00:00:00.000Z";

    await handleLicenseRenewed(
      { id: "lic-026", attributes: { expiry: testExpiry } },
      deps,
    );

    expect(deps.updateLicenseStatus.calls[0][2]).toHaveProperty(
      "expiresAt",
      testExpiry,
    );
  });

  it("should handle missing attributes gracefully", async () => {
    const deps = createDeps({ licenseOverride: { status: "active" } });

    // data.attributes is undefined (malformed Keygen event)
    await handleLicenseRenewed({ id: "lic-027" }, deps);

    expect(deps.updateLicenseStatus.callCount).toBe(1);
    expect(deps.updateLicenseStatus.calls[0][2]).toHaveProperty(
      "expiresAt",
      undefined,
    );
  });
});

// ============================================================================
// Source-level verification
// ============================================================================

describe("Source-level verification: Keygen webhook guard clauses exist", () => {
  let routeSource;

  // Read route source once for all source-level checks
  it("should load the route source file", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    routeSource = readFileSync(
      resolve(
        import.meta.dirname,
        "../../../src/app/api/webhooks/keygen/route.js",
      ),
      "utf-8",
    );
    expect(routeSource.length).toBeGreaterThan(0);
  });

  it("handleLicenseExpired should call getLicense BEFORE updateLicenseStatus", () => {
    const fnStart = routeSource.indexOf("async function handleLicenseExpired");
    const fnEnd = routeSource.indexOf("\nasync function", fnStart + 1);
    const fnBody = routeSource.slice(fnStart, fnEnd !== -1 ? fnEnd : undefined);

    const getLicensePos = fnBody.indexOf("getLicense(licenseId)");
    const updatePos = fnBody.indexOf("updateLicenseStatus(licenseId");

    expect(getLicensePos).toBeGreaterThan(-1);
    expect(updatePos).toBeGreaterThan(-1);
    expect(getLicensePos).toBeLessThan(updatePos);
  });

  it("handleLicenseExpired should check status === 'active' and expiresAt", () => {
    const fnStart = routeSource.indexOf("async function handleLicenseExpired");
    const fnEnd = routeSource.indexOf("\nasync function", fnStart + 1);
    const fnBody = routeSource.slice(fnStart, fnEnd !== -1 ? fnEnd : undefined);

    expect(fnBody).toMatch(/license\?\.status\s*===\s*"active"/);
    expect(fnBody).toMatch(
      /license\.expiresAt\s*>\s*new Date\(\)\.toISOString\(\)/,
    );
  });

  it("handleLicenseReinstated should guard against disputed/revoked/expired", () => {
    const fnStart = routeSource.indexOf(
      "async function handleLicenseReinstated",
    );
    const fnEnd = routeSource.indexOf("\nasync function", fnStart + 1);
    const fnBody = routeSource.slice(fnStart, fnEnd !== -1 ? fnEnd : undefined);

    expect(fnBody).toMatch(/PROTECTED_STATUSES/);
    expect(fnBody).toMatch(/"disputed"/);
    expect(fnBody).toMatch(/"revoked"/);
    expect(fnBody).toMatch(/"expired"/);
  });

  it("handleLicenseRenewed should guard against disputed/revoked", () => {
    const fnStart = routeSource.indexOf("async function handleLicenseRenewed");
    const fnEnd = routeSource.indexOf("\nasync function", fnStart + 1);
    const fnBody = routeSource.slice(fnStart, fnEnd !== -1 ? fnEnd : undefined);

    expect(fnBody).toMatch(/PROTECTED_STATUSES/);
    expect(fnBody).toMatch(/"disputed"/);
    expect(fnBody).toMatch(/"revoked"/);
  });

  it("handleLicenseSuspended should remain log-only (no updateLicenseStatus)", () => {
    const fnStart = routeSource.indexOf(
      "async function handleLicenseSuspended",
    );
    const fnEnd = routeSource.indexOf("\nasync function", fnStart + 1);
    const fnBody = routeSource.slice(fnStart, fnEnd !== -1 ? fnEnd : undefined);

    expect(fnBody).not.toMatch(/await\s+updateLicenseStatus/);
  });
});
