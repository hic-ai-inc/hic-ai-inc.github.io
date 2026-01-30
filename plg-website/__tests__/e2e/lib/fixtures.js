/**
 * E2E Test Fixtures
 *
 * Creates real licenses and test data via Keygen API for E2E testing.
 * All fixtures are tracked for cleanup after tests.
 *
 * @see 20260129_E2E_BACKEND_VALIDATION_SPEC.md
 */

import { getKeygenTestKey, log } from "../config.js";
import { generateEmail } from "./test-data.js";

// ============================================================================
// Keygen Configuration
// ============================================================================

const KEYGEN_ACCOUNT_ID = "868fccd3-676d-4b9d-90ab-c86ae54419f6";
const KEYGEN_BASE_URL = `https://api.keygen.sh/v1/accounts/${KEYGEN_ACCOUNT_ID}`;

// Policy IDs for different license types
const POLICIES = {
  individual: "91f1947e-0730-48f9-b19a-eb8016ae2f84", // maxMachines=2
  business: "b0bcab98-6693-4c44-ad0d-ee3dbb069aea", // maxMachines=5
};

// ============================================================================
// Keygen API Helpers
// ============================================================================

/**
 * Make a request to Keygen API
 * @param {string} endpoint - API endpoint (e.g., "/licenses")
 * @param {object} options - Fetch options
 * @returns {Promise<object>} API response
 */
async function keygenRequest(endpoint, options = {}) {
  const token = getKeygenTestKey();
  if (!token) {
    throw new Error(
      "Keygen API key not available. Set E2E_KEYGEN_TEST_KEY environment variable.",
    );
  }

  const url = `${KEYGEN_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/vnd.api+json",
      Accept: "application/vnd.api+json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    let errorDetail;
    try {
      const json = JSON.parse(text);
      errorDetail = json.errors?.[0]?.detail || text;
    } catch {
      errorDetail = text;
    }
    throw new Error(`Keygen API error ${response.status}: ${errorDetail}`);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return null;
  }

  return response.json();
}

// ============================================================================
// License Fixtures
// ============================================================================

/**
 * Create a real license in Keygen for testing
 * @param {object} options
 * @param {string} [options.type="individual"] - License type ("individual" or "business")
 * @param {string} [options.email] - Email to associate with license
 * @param {object} [options.metadata] - Additional metadata
 * @returns {Promise<object>} Created license with key, id, etc.
 */
export async function createTestLicense(options = {}) {
  const { type = "individual", email, metadata = {} } = options;

  const policyId = POLICIES[type];
  if (!policyId) {
    throw new Error(
      `Unknown license type: ${type}. Use "individual" or "business".`,
    );
  }

  const testEmail = email || generateEmail("e2e-fixture");
  const testName = `E2E Test License - ${new Date().toISOString()}`;

  log.info("Creating test license", { type, email: testEmail });

  const response = await keygenRequest("/licenses", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "licenses",
        attributes: {
          name: testName,
          metadata: {
            email: testEmail.toLowerCase(),
            testFixture: true,
            createdAt: new Date().toISOString(),
            ...metadata,
          },
        },
        relationships: {
          policy: {
            data: { type: "policies", id: policyId },
          },
        },
      },
    }),
  });

  const license = {
    id: response.data.id,
    key: response.data.attributes.key,
    status: response.data.attributes.status,
    expiresAt: response.data.attributes.expiry,
    maxMachines: response.data.attributes.maxMachines,
    email: testEmail,
    type,
  };

  log.info("Created test license", {
    id: license.id,
    key: license.key.slice(0, 20) + "...",
  });

  return license;
}

/**
 * Delete a license from Keygen
 * @param {string} licenseId - License ID to delete
 */
export async function deleteLicense(licenseId) {
  log.info("Deleting license", { licenseId });
  await keygenRequest(`/licenses/${licenseId}`, {
    method: "DELETE",
  });
}

/**
 * Suspend a license in Keygen
 * @param {string} licenseId - License ID to suspend
 */
export async function suspendLicense(licenseId) {
  log.info("Suspending license", { licenseId });
  await keygenRequest(`/licenses/${licenseId}/actions/suspend`, {
    method: "POST",
  });
}

/**
 * Revoke a license in Keygen
 * @param {string} licenseId - License ID to revoke
 */
export async function revokeLicense(licenseId) {
  log.info("Revoking license", { licenseId });
  await keygenRequest(`/licenses/${licenseId}/actions/revoke`, {
    method: "POST",
  });
}

/**
 * Reinstate a suspended license
 * @param {string} licenseId - License ID to reinstate
 */
export async function reinstateLicense(licenseId) {
  log.info("Reinstating license", { licenseId });
  await keygenRequest(`/licenses/${licenseId}/actions/reinstate`, {
    method: "POST",
  });
}

// ============================================================================
// Machine (Device) Operations
// ============================================================================

/**
 * Deactivate a machine from a license
 * @param {string} machineId - Machine ID to deactivate
 */
export async function deactivateMachine(machineId) {
  log.info("Deactivating machine", { machineId });
  try {
    await keygenRequest(`/machines/${machineId}`, {
      method: "DELETE",
    });
  } catch (error) {
    // Ignore 404 - machine already deactivated
    if (!error.message.includes("404")) {
      throw error;
    }
  }
}

/**
 * Get all machines for a license
 * @param {string} licenseId - License ID
 * @returns {Promise<Array>} Array of machine objects
 */
export async function getLicenseMachines(licenseId) {
  const response = await keygenRequest(`/licenses/${licenseId}/machines`);
  return response.data.map((machine) => ({
    id: machine.id,
    fingerprint: machine.attributes.fingerprint,
    name: machine.attributes.name,
    lastHeartbeat: machine.attributes.lastHeartbeatAt,
  }));
}

// ============================================================================
// Test Fixture Manager
// ============================================================================

/**
 * Manages test fixtures with automatic cleanup
 */
export class FixtureManager {
  constructor(name) {
    this.name = name;
    this.licenses = [];
    this.machines = [];
  }

  /**
   * Create a tracked test license
   * @param {object} options - Same as createTestLicense
   * @returns {Promise<object>} Created license
   */
  async createLicense(options = {}) {
    const license = await createTestLicense(options);
    this.licenses.push(license);
    return license;
  }

  /**
   * Track a machine for cleanup
   * @param {string} machineId - Machine ID to track
   */
  trackMachine(machineId) {
    if (machineId && !this.machines.includes(machineId)) {
      this.machines.push(machineId);
    }
  }

  /**
   * Clean up all tracked fixtures
   */
  async cleanup() {
    log.info(`Cleaning up fixtures for ${this.name}`, {
      licenses: this.licenses.length,
      machines: this.machines.length,
    });

    // Deactivate machines first
    for (const machineId of this.machines) {
      try {
        await deactivateMachine(machineId);
      } catch (error) {
        log.warn(`Failed to deactivate machine ${machineId}:`, error.message);
      }
    }

    // Then delete licenses
    for (const license of this.licenses) {
      try {
        await deleteLicense(license.id);
      } catch (error) {
        log.warn(`Failed to delete license ${license.id}:`, error.message);
      }
    }

    this.licenses = [];
    this.machines = [];
  }
}

/**
 * Create a fixture manager for a test
 * @param {string} name - Test name for logging
 * @returns {FixtureManager}
 */
export function createFixtureManager(name) {
  return new FixtureManager(name);
}

// ============================================================================
// Exports
// ============================================================================

export default {
  createTestLicense,
  deleteLicense,
  suspendLicense,
  revokeLicense,
  reinstateLicense,
  deactivateMachine,
  getLicenseMachines,
  createFixtureManager,
  FixtureManager,
  POLICIES,
};
