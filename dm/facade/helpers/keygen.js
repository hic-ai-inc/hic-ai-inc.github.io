/**
 * Keygen.sh Mock Factory
 *
 * Provides mock implementations for Keygen license management operations used in PLG.
 * Follows the same pattern as other HIC mock factories (createDynamoMock, etc.)
 *
 * Keygen uses a REST API with fetch, so we mock the fetch-based request helper.
 *
 * @see dm/facade/helpers/dynamodb.js for pattern reference
 */

import { createSpy } from "../test-helpers/spy.js";

/**
 * Create a mock Keygen request handler for testing
 *
 * This mocks the internal keygenRequest function that all Keygen operations use.
 *
 * Usage:
 *   import { createKeygenMock } from 'hic-test-helpers';
 *   const keygenMock = createKeygenMock();
 *
 *   // Configure mock responses
 *   keygenMock.whenCreateLicense({ policyId: 'pol_123' }).resolves({
 *     id: 'lic_123',
 *     key: 'XXXX-XXXX-XXXX-XXXX',
 *     status: 'ACTIVE'
 *   });
 *
 *   // Inject into module under test
 *   __setKeygenRequestForTests(keygenMock.request);
 *
 * @returns {Object} Mock Keygen handler with fluent API
 */
export function createKeygenMock() {
  // The core spy that replaces keygenRequest
  const requestSpy = createSpy("keygenRequest");

  // Registry for endpoint-specific responses
  const responseRegistry = new Map();

  const mock = {
    // Direct access to the request spy
    request: requestSpy,

    /**
     * Configure mock response for license creation
     */
    whenCreateLicense(matcher = {}) {
      return createEndpointMatcher(
        requestSpy,
        responseRegistry,
        "/licenses",
        "POST",
        matcher,
      );
    },

    /**
     * Configure mock response for license retrieval
     */
    whenGetLicense(licenseId) {
      return createEndpointMatcher(
        requestSpy,
        responseRegistry,
        `/licenses/${licenseId}`,
        "GET",
      );
    },

    /**
     * Configure mock response for license validation
     */
    whenValidateLicense(matcher = {}) {
      return createEndpointMatcher(
        requestSpy,
        responseRegistry,
        "/licenses/actions/validate-key",
        "POST",
        matcher,
      );
    },

    /**
     * Configure mock response for license suspension
     */
    whenSuspendLicense(licenseId) {
      return createEndpointMatcher(
        requestSpy,
        responseRegistry,
        `/licenses/${licenseId}/actions/suspend`,
        "POST",
      );
    },

    /**
     * Configure mock response for license reinstatement
     */
    whenReinstateLicense(licenseId) {
      return createEndpointMatcher(
        requestSpy,
        responseRegistry,
        `/licenses/${licenseId}/actions/reinstate`,
        "POST",
      );
    },

    /**
     * Configure mock response for license revocation
     */
    whenRevokeLicense(licenseId) {
      return createEndpointMatcher(
        requestSpy,
        responseRegistry,
        `/licenses/${licenseId}`,
        "DELETE",
      );
    },

    /**
     * Configure mock response for license checkout
     */
    whenCheckoutLicense(licenseId) {
      return createEndpointMatcher(
        requestSpy,
        responseRegistry,
        `/licenses/${licenseId}/actions/check-out`,
        "POST",
      );
    },

    /**
     * Configure mock response for device activation
     */
    whenActivateDevice(matcher = {}) {
      return createEndpointMatcher(
        requestSpy,
        responseRegistry,
        "/machines",
        "POST",
        matcher,
      );
    },

    /**
     * Configure mock response for device deactivation
     */
    whenDeactivateDevice(machineId) {
      return createEndpointMatcher(
        requestSpy,
        responseRegistry,
        `/machines/${machineId}`,
        "DELETE",
      );
    },

    /**
     * Configure mock response for machine list
     */
    whenGetLicenseMachines(licenseId) {
      return createEndpointMatcher(
        requestSpy,
        responseRegistry,
        `/machines?license=${licenseId}`,
        "GET",
      );
    },

    /**
     * Configure mock response for machine heartbeat
     */
    whenMachineHeartbeat(machineId) {
      return createEndpointMatcher(
        requestSpy,
        responseRegistry,
        `/machines/${machineId}/actions/ping`,
        "POST",
      );
    },

    /**
     * Reset all mock state
     */
    reset() {
      requestSpy.reset();
      responseRegistry.clear();
    },
  };

  // Configure the request spy to use the response registry
  requestSpy.mockImplementation(async (endpoint, options = {}) => {
    const method = options.method || "GET";
    const key = `${method}:${endpoint}`;

    // Check for exact match first
    if (responseRegistry.has(key)) {
      const handler = responseRegistry.get(key);
      return handler(endpoint, options);
    }

    // Check for pattern matches (e.g., /licenses/:id)
    for (const [pattern, handler] of responseRegistry.entries()) {
      if (matchesEndpointPattern(pattern, `${method}:${endpoint}`)) {
        return handler(endpoint, options);
      }
    }

    // Default: throw unhandled error
    throw new Error(
      `Unhandled Keygen request: ${method} ${endpoint}. Configure with keygenMock.when*() methods.`,
    );
  });

  return mock;
}

/**
 * Create fluent endpoint matcher for configuring responses
 */
function createEndpointMatcher(
  requestSpy,
  registry,
  endpoint,
  method,
  matcher = {},
) {
  const key = `${method}:${endpoint}`;

  return {
    /**
     * Configure successful response
     */
    resolves(data) {
      registry.set(key, async () => wrapKeygenResponse(data));
      return this;
    },

    /**
     * Configure error response
     */
    rejects(error, status = 400) {
      registry.set(key, async () => {
        const err = new Error(
          error.detail || error.message || "Keygen API error",
        );
        err.status = status;
        err.errors = error.errors || [{ detail: err.message }];
        throw err;
      });
      return this;
    },

    /**
     * Configure custom implementation
     */
    implements(fn) {
      registry.set(key, fn);
      return this;
    },
  };
}

/**
 * Check if an endpoint matches a pattern
 */
function matchesEndpointPattern(pattern, endpoint) {
  // Simple pattern matching - can be enhanced as needed
  const patternRegex = pattern
    .replace(/:[^/]+/g, "[^/]+") // :id -> [^/]+
    .replace(/\?/g, "\\?"); // Escape query string ?
  return new RegExp(`^${patternRegex}$`).test(endpoint);
}

/**
 * Wrap data in Keygen API response format
 */
function wrapKeygenResponse(data) {
  // If data already has Keygen response structure, return as-is
  if (data && (data.data || data.meta)) {
    return data;
  }

  // Otherwise, wrap in standard response format
  return { data };
}

// ============================================
// MOCK DATA FACTORIES
// ============================================

/**
 * Create mock license for testing
 */
export function createMockLicense(overrides = {}) {
  const id = overrides.id || `lic_test_${Date.now()}`;
  return {
    id,
    key: overrides.key || generateMockLicenseKey(),
    status: overrides.status || "ACTIVE",
    expiresAt: overrides.expiresAt || null,
    maxMachines: overrides.maxMachines || 3,
    uses: overrides.uses || 0,
    metadata: overrides.metadata || {},
  };
}

/**
 * Create mock license in Keygen API response format
 */
export function createMockLicenseResponse(overrides = {}) {
  const license = createMockLicense(overrides);
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
 * Create mock validation response
 */
export function createMockValidationResponse(valid, overrides = {}) {
  return {
    meta: {
      valid,
      code: overrides.code || (valid ? "VALID" : "NOT_FOUND"),
      detail:
        overrides.detail || (valid ? "License is valid" : "License not found"),
    },
    data: valid
      ? {
          id: overrides.licenseId || `lic_test_${Date.now()}`,
          type: "licenses",
          attributes: {
            status: overrides.status || "ACTIVE",
            expiry: overrides.expiresAt || null,
          },
        }
      : null,
  };
}

/**
 * Create mock machine/device for testing
 */
export function createMockMachine(overrides = {}) {
  const id = overrides.id || `mach_test_${Date.now()}`;
  return {
    id,
    fingerprint: overrides.fingerprint || `fp_${Date.now()}`,
    name: overrides.name || "Test Machine",
    platform: overrides.platform || "darwin",
    createdAt: overrides.createdAt || new Date().toISOString(),
    lastHeartbeat: overrides.lastHeartbeat || new Date().toISOString(),
  };
}

/**
 * Create mock machine in Keygen API response format
 */
export function createMockMachineResponse(overrides = {}) {
  const machine = createMockMachine(overrides);
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
 * Create mock checkout/certificate response
 */
export function createMockCheckoutResponse(overrides = {}) {
  return {
    data: {
      type: "license-files",
      attributes: {
        certificate:
          overrides.certificate ||
          `-----BEGIN LICENSE FILE-----\n${Buffer.from(JSON.stringify({ valid: true })).toString("base64")}\n-----END LICENSE FILE-----`,
        ttl: overrides.ttl || 86400,
        expiry:
          overrides.expiry || new Date(Date.now() + 86400 * 1000).toISOString(),
      },
    },
  };
}

/**
 * Generate a mock license key in Keygen format
 */
export function generateMockLicenseKey() {
  const segment = () =>
    Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${segment()}-${segment()}-${segment()}-${segment()}`;
}
