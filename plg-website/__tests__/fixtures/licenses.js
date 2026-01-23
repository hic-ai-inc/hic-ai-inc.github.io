/**
 * License Test Fixtures
 *
 * Provides consistent Keygen license data for testing.
 * Structures match Keygen API response formats.
 */

const NOW = new Date();
const ONE_DAY_MS = 86400 * 1000;
const ONE_MONTH_MS = 30 * ONE_DAY_MS;
const ONE_YEAR_MS = 365 * ONE_DAY_MS;

/**
 * Generate a mock license key in Keygen format
 */
function generateLicenseKey() {
  const segment = () =>
    Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${segment()}-${segment()}-${segment()}-${segment()}`;
}

/**
 * Active individual license
 */
export const activeLicense = {
  id: "lic_active_individual_123",
  key: "ABCD-EFGH-IJKL-MNOP",
  status: "ACTIVE",
  expiresAt: null, // No expiry for subscription-based
  maxMachines: 3,
  uses: 1,
  metadata: {
    email: "individual@example.com",
    plan_type: "individual",
    stripe_customer_id: "cus_individual_123",
  },
};

/**
 * Active enterprise license
 */
export const enterpriseLicense = {
  id: "lic_enterprise_123",
  key: "ENTE-RPRI-SELI-C123",
  status: "ACTIVE",
  expiresAt: null,
  maxMachines: 100, // Enterprise gets more seats
  uses: 45,
  metadata: {
    email: "admin@acme-corp.com",
    plan_type: "enterprise",
    org_id: "org_acme_123",
    stripe_customer_id: "cus_enterprise_123",
  },
};

/**
 * License at device limit
 */
export const atLimitLicense = {
  id: "lic_at_limit_123",
  key: "FULL-DEVI-CELI-MIT1",
  status: "ACTIVE",
  expiresAt: null,
  maxMachines: 3,
  uses: 3, // At limit
  metadata: {
    email: "limit@example.com",
    plan_type: "individual",
  },
};

/**
 * Expired license
 */
export const expiredLicense = {
  id: "lic_expired_123",
  key: "EXPR-DLCE-NSE1-2345",
  status: "EXPIRED",
  expiresAt: new Date(NOW.getTime() - ONE_MONTH_MS).toISOString(),
  maxMachines: 3,
  uses: 2,
  metadata: {
    email: "expired@example.com",
    plan_type: "individual",
    expiry_reason: "subscription_cancelled",
  },
};

/**
 * Suspended license (admin action)
 */
export const suspendedLicense = {
  id: "lic_suspended_123",
  key: "SUSP-ENDE-DLIC-1234",
  status: "SUSPENDED",
  expiresAt: null,
  maxMachines: 3,
  uses: 1,
  metadata: {
    email: "suspended@example.com",
    plan_type: "individual",
    suspension_reason: "payment_failed",
    suspended_at: new Date(NOW.getTime() - 7 * ONE_DAY_MS).toISOString(),
  },
};

/**
 * License with offline checkout certificate
 */
export const offlineLicense = {
  id: "lic_offline_123",
  key: "OFFL-INEC-ERTI-F123",
  status: "ACTIVE",
  expiresAt: null,
  maxMachines: 3,
  uses: 1,
  metadata: {
    email: "offline@example.com",
    plan_type: "individual",
    offline_enabled: "true",
  },
};

/**
 * All test licenses exported as a collection
 */
export const testLicenses = {
  activeLicense,
  enterpriseLicense,
  atLimitLicense,
  expiredLicense,
  suspendedLicense,
  offlineLicense,
};

// ============================================================================
// MACHINE / DEVICE FIXTURES
// ============================================================================

/**
 * Active machine (device)
 */
export const activeMachine = {
  id: "mach_active_123",
  fingerprint: "fp_desktop_windows_abc123",
  name: "Work Desktop",
  platform: "win32",
  createdAt: new Date(NOW.getTime() - 30 * ONE_DAY_MS).toISOString(),
  lastHeartbeat: new Date(NOW.getTime() - 1 * ONE_DAY_MS).toISOString(),
};

/**
 * Stale machine (no recent heartbeat)
 */
export const staleMachine = {
  id: "mach_stale_456",
  fingerprint: "fp_laptop_old_xyz789",
  name: "Old Laptop",
  platform: "darwin",
  createdAt: new Date(NOW.getTime() - 90 * ONE_DAY_MS).toISOString(),
  lastHeartbeat: new Date(NOW.getTime() - 60 * ONE_DAY_MS).toISOString(),
};

/**
 * All test machines exported as a collection
 */
export const testMachines = {
  activeMachine,
  staleMachine,
};

// ============================================================================
// KEYGEN API RESPONSE WRAPPERS
// ============================================================================

/**
 * Wrap license data in Keygen API response format
 */
export function wrapLicenseResponse(license) {
  return {
    data: {
      id: license.id,
      type: "licenses",
      attributes: {
        key: license.key,
        status: license.status,
        expiry: license.expiresAt,
        maxMachines: license.maxMachines,
        uses: license.uses,
        metadata: license.metadata,
      },
    },
  };
}

/**
 * Create a validation response
 */
export function createValidationResponse(valid, license = null, options = {}) {
  return {
    meta: {
      valid,
      code: options.code || (valid ? "VALID" : "NOT_FOUND"),
      detail:
        options.detail || (valid ? "License is valid" : "License not found"),
    },
    data:
      valid && license
        ? {
            id: license.id,
            type: "licenses",
            attributes: {
              status: license.status,
              expiry: license.expiresAt,
            },
          }
        : null,
  };
}

/**
 * Wrap machine data in Keygen API response format
 */
export function wrapMachineResponse(machine) {
  return {
    data: {
      id: machine.id,
      type: "machines",
      attributes: {
        fingerprint: machine.fingerprint,
        name: machine.name,
        platform: machine.platform,
        created: machine.createdAt,
        lastHeartbeat: machine.lastHeartbeat,
      },
    },
  };
}

/**
 * Create a machine list response
 */
export function createMachineListResponse(machines) {
  return {
    data: machines.map((machine) => ({
      id: machine.id,
      type: "machines",
      attributes: {
        fingerprint: machine.fingerprint,
        name: machine.name,
        platform: machine.platform,
        created: machine.createdAt,
        lastHeartbeat: machine.lastHeartbeat,
      },
    })),
  };
}

/**
 * Create an offline checkout certificate response
 */
export function createCheckoutCertificate(ttl = 86400) {
  const expiry = new Date(NOW.getTime() + ttl * 1000);
  const certificate = Buffer.from(
    JSON.stringify({
      valid: true,
      exp: Math.floor(expiry.getTime() / 1000),
    }),
  ).toString("base64");

  return {
    data: {
      type: "license-files",
      attributes: {
        certificate: `-----BEGIN LICENSE FILE-----\n${certificate}\n-----END LICENSE FILE-----`,
        ttl,
        expiry: expiry.toISOString(),
      },
    },
  };
}

export default testLicenses;
