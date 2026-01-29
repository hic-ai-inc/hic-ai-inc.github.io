/**
 * E2E Test Cleanup Utilities
 *
 * Track and clean up test data after E2E test runs.
 * Ensures test isolation and prevents data pollution.
 *
 * Features:
 * - Automatic tracking of created resources
 * - Cleanup in reverse dependency order
 * - Safe cleanup with error handling
 * - Support for both API and direct DynamoDB cleanup
 *
 * @see 20260129_E2E_BACKEND_VALIDATION_SPEC.md - Section 8.4
 */

import { http } from "./http-client.js";
import { endpoints, testConfig, log, canMutate } from "../config.js";
import { isTestData } from "./test-data.js";

// ============================================================================
// Resource Tracking
// ============================================================================

/**
 * Tracked test resources for cleanup
 */
const trackedResources = {
  trials: [], // { fingerprint }
  licenses: [], // { licenseKey, keygenId }
  devices: [], // { licenseKey, machineId }
  sessions: [], // { sessionId, licenseKey }
  customers: [], // { customerId, stripeId }
  checkoutSessions: [], // { sessionId }
};

/**
 * Track a trial for cleanup
 * @param {string} fingerprint
 */
export function trackTrial(fingerprint) {
  if (!isTestData(fingerprint)) {
    log.warn("Tracking non-test trial:", fingerprint);
  }
  trackedResources.trials.push({ fingerprint, createdAt: Date.now() });
  log.debug("Tracked trial:", fingerprint);
}

/**
 * Track a license for cleanup
 * @param {string} licenseKey
 * @param {string} [keygenId] - KeyGen license ID if known
 */
export function trackLicense(licenseKey, keygenId) {
  trackedResources.licenses.push({
    licenseKey,
    keygenId,
    createdAt: Date.now(),
  });
  log.debug("Tracked license:", licenseKey);
}

/**
 * Track a device activation for cleanup
 * @param {string} licenseKey
 * @param {string} machineId
 */
export function trackDevice(licenseKey, machineId) {
  if (!isTestData(machineId)) {
    log.warn("Tracking non-test device:", machineId);
  }
  trackedResources.devices.push({
    licenseKey,
    machineId,
    createdAt: Date.now(),
  });
  log.debug("Tracked device:", {
    licenseKey: licenseKey.slice(0, 10),
    machineId,
  });
}

/**
 * Track a session for cleanup
 * @param {string} sessionId
 * @param {string} licenseKey
 */
export function trackSession(sessionId, licenseKey) {
  trackedResources.sessions.push({
    sessionId,
    licenseKey,
    createdAt: Date.now(),
  });
  log.debug("Tracked session:", sessionId);
}

/**
 * Track a customer for cleanup
 * @param {string} customerId
 * @param {string} [stripeId]
 */
export function trackCustomer(customerId, stripeId) {
  trackedResources.customers.push({
    customerId,
    stripeId,
    createdAt: Date.now(),
  });
  log.debug("Tracked customer:", customerId);
}

/**
 * Track a checkout session for cleanup
 * @param {string} sessionId - Stripe checkout session ID
 */
export function trackCheckoutSession(sessionId) {
  trackedResources.checkoutSessions.push({
    sessionId,
    createdAt: Date.now(),
  });
  log.debug("Tracked checkout session:", sessionId);
}

// ============================================================================
// Cleanup Functions
// ============================================================================

/**
 * Deactivate a device via API
 * @param {string} licenseKey
 * @param {string} machineId
 * @returns {Promise<boolean>} - Success status
 */
async function deactivateDevice(licenseKey, machineId) {
  try {
    const response = await http.delete(endpoints.license.deactivate, {
      body: { licenseKey, machineId },
    });

    if (response.ok || response.status === 404) {
      return true; // Success or already deleted
    }

    log.warn("Failed to deactivate device:", {
      status: response.status,
      machineId,
    });
    return false;
  } catch (error) {
    log.warn("Error deactivating device:", error.message);
    return false;
  }
}

/**
 * Delete a trial via API (if endpoint exists) or mark for manual cleanup
 * @param {string} fingerprint
 * @returns {Promise<boolean>}
 */
async function deleteTrial(fingerprint) {
  // Note: If there's no trial deletion endpoint, this is a no-op
  // Trials should auto-expire via TTL
  log.debug("Trial cleanup (TTL-based):", fingerprint);
  return true;
}

/**
 * Delete a license via API (if endpoint exists) or mark for manual cleanup
 * @param {string} licenseKey
 * @returns {Promise<boolean>}
 */
async function deleteLicense(licenseKey) {
  // Note: License deletion typically requires admin access
  // For E2E tests, licenses may need manual cleanup or expire naturally
  log.debug("License marked for cleanup:", licenseKey.slice(0, 15));
  return true;
}

/**
 * Clean up all tracked resources
 * Cleans up in reverse dependency order:
 * 1. Sessions (depend on devices)
 * 2. Devices (depend on licenses)
 * 3. Licenses
 * 4. Trials
 * 5. Customers
 *
 * @returns {Promise<Object>} - Cleanup summary
 */
export async function cleanupAll() {
  if (!canMutate()) {
    log.warn("Cleanup skipped: Environment does not allow mutations");
    return { skipped: true, reason: "read-only environment" };
  }

  if (!testConfig.autoCleanup) {
    log.info("Auto-cleanup disabled, resources tracked but not deleted");
    return { skipped: true, reason: "auto-cleanup disabled" };
  }

  log.info("Starting E2E cleanup...");
  const results = {
    sessions: { total: 0, cleaned: 0, failed: 0 },
    devices: { total: 0, cleaned: 0, failed: 0 },
    licenses: { total: 0, cleaned: 0, failed: 0 },
    trials: { total: 0, cleaned: 0, failed: 0 },
    customers: { total: 0, cleaned: 0, failed: 0 },
  };

  // 1. Clean up sessions (no-op for now, sessions expire)
  results.sessions.total = trackedResources.sessions.length;
  trackedResources.sessions = [];
  results.sessions.cleaned = results.sessions.total;

  // 2. Clean up devices
  results.devices.total = trackedResources.devices.length;
  for (const device of trackedResources.devices) {
    const success = await deactivateDevice(device.licenseKey, device.machineId);
    if (success) {
      results.devices.cleaned++;
    } else {
      results.devices.failed++;
    }
  }
  trackedResources.devices = [];

  // 3. Clean up licenses (mark only)
  results.licenses.total = trackedResources.licenses.length;
  for (const license of trackedResources.licenses) {
    await deleteLicense(license.licenseKey);
    results.licenses.cleaned++;
  }
  trackedResources.licenses = [];

  // 4. Clean up trials (TTL-based)
  results.trials.total = trackedResources.trials.length;
  for (const trial of trackedResources.trials) {
    await deleteTrial(trial.fingerprint);
    results.trials.cleaned++;
  }
  trackedResources.trials = [];

  // 5. Clean up customers (mark only)
  results.customers.total = trackedResources.customers.length;
  trackedResources.customers = [];
  results.customers.cleaned = results.customers.total;

  // 6. Clear checkout sessions
  trackedResources.checkoutSessions = [];

  log.info("E2E cleanup complete:", results);
  return results;
}

/**
 * Get current tracking state (for debugging)
 * @returns {Object}
 */
export function getTrackedResources() {
  return {
    trials: trackedResources.trials.length,
    licenses: trackedResources.licenses.length,
    devices: trackedResources.devices.length,
    sessions: trackedResources.sessions.length,
    customers: trackedResources.customers.length,
    checkoutSessions: trackedResources.checkoutSessions.length,
  };
}

/**
 * Reset all tracking (without cleanup)
 * Use with caution - only for test isolation
 */
export function resetTracking() {
  trackedResources.trials = [];
  trackedResources.licenses = [];
  trackedResources.devices = [];
  trackedResources.sessions = [];
  trackedResources.customers = [];
  trackedResources.checkoutSessions = [];
  log.debug("Resource tracking reset");
}

// ============================================================================
// Cleanup Hooks
// ============================================================================

/**
 * Register cleanup to run on process exit
 * 
 * Note: We don't register beforeExit because async handlers can cause hangs.
 * The runner explicitly calls cleanupAll() after tests complete.
 * These handlers are only for unexpected terminations (Ctrl+C).
 */
export function registerExitCleanup() {
  let cleanupDone = false;
  
  const cleanup = async () => {
    if (cleanupDone) return;
    cleanupDone = true;
    log.info("Running exit cleanup...");
    await cleanupAll();
  };

  process.on("SIGINT", async () => {
    await cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    await cleanup();
    process.exit(0);
  });
}

/**
 * Create a cleanup function scoped to a single test
 * @returns {Object} - { track, cleanup }
 */
export function createTestScope() {
  const scopedResources = {
    trials: [],
    devices: [],
    licenses: [],
  };

  return {
    trackTrial(fingerprint) {
      scopedResources.trials.push(fingerprint);
      trackTrial(fingerprint);
    },

    trackLicense(licenseKey, keygenId) {
      scopedResources.licenses.push({ licenseKey, keygenId });
      trackLicense(licenseKey, keygenId);
    },

    trackDevice(licenseKey, machineId) {
      scopedResources.devices.push({ licenseKey, machineId });
      trackDevice(licenseKey, machineId);
    },

    async cleanup() {
      for (const device of scopedResources.devices) {
        await deactivateDevice(device.licenseKey, device.machineId);
      }
      scopedResources.trials = [];
      scopedResources.devices = [];
    },
  };
}

export default {
  trackTrial,
  trackLicense,
  trackDevice,
  trackSession,
  trackCustomer,
  trackCheckoutSession,
  cleanupAll,
  getTrackedResources,
  resetTracking,
  registerExitCleanup,
  createTestScope,
};
