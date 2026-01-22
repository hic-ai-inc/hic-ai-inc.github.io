/**
 * Keygen.sh License Management Client
 *
 * Provides functions for license lifecycle management:
 * - License creation and validation
 * - Device activation and deactivation
 * - Policy management
 *
 * @see Security Considerations for Keygen Licensing
 * @see PLG Technical Specification v2 - Section 3.3
 */

const KEYGEN_ACCOUNT_ID = process.env.KEYGEN_ACCOUNT_ID;
const KEYGEN_PRODUCT_TOKEN = process.env.KEYGEN_PRODUCT_TOKEN;
const KEYGEN_API_URL = `https://api.keygen.sh/v1/accounts/${KEYGEN_ACCOUNT_ID}`;

// Policy IDs (configured in Keygen dashboard)
export const KEYGEN_POLICIES = {
  oss: process.env.KEYGEN_POLICY_ID_OSS,
  individual: process.env.KEYGEN_POLICY_ID_INDIVIDUAL,
  enterprise: process.env.KEYGEN_POLICY_ID_ENTERPRISE,
};

/**
 * Make authenticated request to Keygen API
 */
async function keygenRequest(endpoint, options = {}) {
  const url = `${KEYGEN_API_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${KEYGEN_PRODUCT_TOKEN}`,
      "Content-Type": "application/vnd.api+json",
      Accept: "application/vnd.api+json",
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.errors?.[0]?.detail || "Keygen API error");
    error.status = response.status;
    error.errors = data.errors;
    throw error;
  }

  return data;
}

// ===========================================
// LICENSE OPERATIONS
// ===========================================

/**
 * Create a new license
 */
export async function createLicense({ policyId, name, email, metadata = {} }) {
  const response = await keygenRequest("/licenses", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "licenses",
        attributes: {
          name,
          metadata: {
            email,
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

  return {
    id: response.data.id,
    key: response.data.attributes.key,
    status: response.data.attributes.status,
    expiresAt: response.data.attributes.expiry,
    maxMachines: response.data.attributes.maxMachines,
    metadata: response.data.attributes.metadata,
  };
}

/**
 * Get license by ID
 */
export async function getLicense(licenseId) {
  const response = await keygenRequest(`/licenses/${licenseId}`);

  return {
    id: response.data.id,
    key: response.data.attributes.key,
    status: response.data.attributes.status,
    expiresAt: response.data.attributes.expiry,
    maxMachines: response.data.attributes.maxMachines,
    uses: response.data.attributes.uses,
    metadata: response.data.attributes.metadata,
  };
}

/**
 * Validate a license key
 * This is the "phone home" endpoint used by the VS Code extension
 */
export async function validateLicense(licenseKey, fingerprint) {
  try {
    const response = await keygenRequest("/licenses/actions/validate-key", {
      method: "POST",
      body: JSON.stringify({
        meta: {
          key: licenseKey,
          scope: {
            fingerprint,
          },
        },
      }),
    });

    return {
      valid: response.meta.valid,
      code: response.meta.code,
      detail: response.meta.detail,
      license: response.data
        ? {
            id: response.data.id,
            status: response.data.attributes.status,
            expiresAt: response.data.attributes.expiry,
          }
        : null,
    };
  } catch (error) {
    // Return validation failure instead of throwing
    return {
      valid: false,
      code: error.errors?.[0]?.code || "UNKNOWN_ERROR",
      detail: error.message,
      license: null,
    };
  }
}

/**
 * Suspend a license
 */
export async function suspendLicense(licenseId) {
  await keygenRequest(`/licenses/${licenseId}/actions/suspend`, {
    method: "POST",
  });
}

/**
 * Reinstate a suspended license
 */
export async function reinstateLicense(licenseId) {
  await keygenRequest(`/licenses/${licenseId}/actions/reinstate`, {
    method: "POST",
  });
}

/**
 * Revoke (delete) a license
 */
export async function revokeLicense(licenseId) {
  await keygenRequest(`/licenses/${licenseId}`, {
    method: "DELETE",
  });
}

/**
 * Update license metadata
 */
export async function updateLicenseMetadata(licenseId, metadata) {
  await keygenRequest(`/licenses/${licenseId}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        type: "licenses",
        attributes: {
          metadata,
        },
      },
    }),
  });
}

// ===========================================
// DEVICE/MACHINE OPERATIONS
// ===========================================

/**
 * Activate a device (create machine)
 */
export async function activateDevice({
  licenseId,
  fingerprint,
  name,
  platform,
  metadata = {},
}) {
  const response = await keygenRequest("/machines", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "machines",
        attributes: {
          fingerprint,
          name,
          platform,
          metadata,
        },
        relationships: {
          license: {
            data: { type: "licenses", id: licenseId },
          },
        },
      },
    }),
  });

  return {
    id: response.data.id,
    fingerprint: response.data.attributes.fingerprint,
    name: response.data.attributes.name,
    platform: response.data.attributes.platform,
    createdAt: response.data.attributes.created,
    lastHeartbeat: response.data.attributes.lastHeartbeat,
  };
}

/**
 * Deactivate a device (delete machine)
 */
export async function deactivateDevice(machineId) {
  await keygenRequest(`/machines/${machineId}`, {
    method: "DELETE",
  });
}

/**
 * Get all machines for a license
 */
export async function getLicenseMachines(licenseId) {
  const response = await keygenRequest(`/machines?license=${licenseId}`);

  return response.data.map((machine) => ({
    id: machine.id,
    fingerprint: machine.attributes.fingerprint,
    name: machine.attributes.name,
    platform: machine.attributes.platform,
    createdAt: machine.attributes.created,
    lastHeartbeat: machine.attributes.lastHeartbeat,
  }));
}

/**
 * Heartbeat - update machine last seen
 */
export async function machineHeartbeat(machineId) {
  try {
    await keygenRequest(`/machines/${machineId}/actions/ping`, {
      method: "POST",
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Check out a license (for offline use)
 */
export async function checkoutLicense(licenseId, ttl = 86400) {
  const response = await keygenRequest(
    `/licenses/${licenseId}/actions/check-out`,
    {
      method: "POST",
      body: JSON.stringify({
        meta: {
          ttl, // seconds (default 24 hours)
          include: ["license", "entitlements"],
        },
      }),
    },
  );

  return {
    certificate: response.data.attributes.certificate,
    ttl: response.data.attributes.ttl,
    expiry: response.data.attributes.expiry,
  };
}

// ===========================================
// POLICY HELPERS
// ===========================================

/**
 * Get policy ID for plan type
 */
export function getPolicyId(planType) {
  const policyId = KEYGEN_POLICIES[planType];
  if (!policyId) {
    throw new Error(`Unknown plan type: ${planType}`);
  }
  return policyId;
}

/**
 * Create license for a specific plan
 */
export async function createLicenseForPlan(
  planType,
  { name, email, metadata = {} },
) {
  const policyId = getPolicyId(planType);
  return createLicense({ policyId, name, email, metadata });
}
