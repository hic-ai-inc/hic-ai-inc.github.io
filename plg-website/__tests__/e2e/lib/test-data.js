/**
 * E2E Test Data Generators
 *
 * Generate unique test data to avoid collisions between test runs.
 * All generated data includes a prefix for easy identification and cleanup.
 *
 * @see 20260129_E2E_BACKEND_VALIDATION_SPEC.md - Section 8.3
 */

import { randomBytes, createHash } from "crypto";
import { testConfig } from "../config.js";

// ============================================================================
// Identifiers
// ============================================================================

/**
 * Generate a unique test ID with prefix
 * @param {string} [type] - Type identifier (e.g., 'fp', 'mach', 'sess')
 * @returns {string}
 */
export function generateId(type = "id") {
  const random = randomBytes(8).toString("hex");
  const timestamp = Date.now().toString(36);
  return `${testConfig.testDataPrefix}${type}-${timestamp}-${random}`;
}

/**
 * Generate unique device fingerprint
 * @returns {string}
 */
export function generateFingerprint() {
  return generateId("fp");
}

/**
 * Generate unique machine ID
 * @returns {string}
 */
export function generateMachineId() {
  return generateId("mach");
}

/**
 * Generate unique session ID
 * @returns {string}
 */
export function generateSessionId() {
  return generateId("sess");
}

/**
 * Generate unique user ID
 * @returns {string}
 */
export function generateUserId() {
  return generateId("user");
}

/**
 * Generate unique organization ID
 * @returns {string}
 */
export function generateOrgId() {
  return generateId("org");
}

// ============================================================================
// Contact Information
// ============================================================================

/**
 * Generate unique test email address
 * Uses a subdomain to avoid polluting real inboxes
 * @param {string} [prefix] - Optional prefix
 * @returns {string}
 */
export function generateEmail(prefix = "user") {
  const random = randomBytes(4).toString("hex");
  const timestamp = Date.now().toString(36);
  return `${testConfig.testDataPrefix}${prefix}-${timestamp}-${random}@test.hic-ai.com`;
}

/**
 * Generate a test user profile
 * @returns {Object}
 */
export function generateUserProfile() {
  const id = generateUserId();
  return {
    id,
    email: generateEmail("profile"),
    firstName: "Test",
    lastName: "User",
    displayName: `Test User ${id.slice(-6)}`,
  };
}

// ============================================================================
// License Data
// ============================================================================

/**
 * Generate a valid-format license key body (without checksum)
 * Note: This generates the format, not a real activatable license
 * @returns {string}
 */
export function generateLicenseKeyBody() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let body = "";
  for (let i = 0; i < 12; i++) {
    body += chars[Math.floor(Math.random() * chars.length)];
  }
  return body;
}

/**
 * Calculate checksum for license key body
 * @param {string} keyBody - 12-character key body
 * @returns {string} - 4-character checksum
 */
export function calculateChecksum(keyBody) {
  let sum = 0;
  for (let i = 0; i < keyBody.length; i++) {
    sum += keyBody.charCodeAt(i) * (i + 1);
  }
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let checksum = "";
  for (let i = 0; i < 4; i++) {
    checksum += chars[(sum >> (i * 5)) % 36];
  }
  return checksum;
}

/**
 * Generate a valid-format license key (format only, not real)
 * Format: MOUSE-XXXX-XXXX-XXXX-XXXX
 * @returns {string}
 */
export function generateLicenseKeyFormat() {
  const body = generateLicenseKeyBody();
  const checksum = calculateChecksum(body);
  const part1 = body.slice(0, 4);
  const part2 = body.slice(4, 8);
  const part3 = body.slice(8, 12);
  return `MOUSE-${part1}-${part2}-${part3}-${checksum}`;
}

/**
 * Generate device activation data
 * @returns {Object}
 */
export function generateDeviceData() {
  return {
    fingerprint: generateFingerprint(),
    machineId: generateMachineId(),
    deviceName: `Test Device ${Date.now().toString(36)}`,
    platform: "darwin", // or 'win32', 'linux'
    osVersion: "14.0.0",
    appVersion: "0.9.9",
  };
}

/**
 * Generate heartbeat request data
 * @param {string} licenseKey
 * @param {Object} device - Device data from generateDeviceData
 * @returns {Object}
 */
export function generateHeartbeatData(licenseKey, device) {
  return {
    licenseKey,
    machineId: device.machineId,
    sessionId: generateSessionId(),
    fingerprint: device.fingerprint,
  };
}

// ============================================================================
// Checkout/Payment Data
// ============================================================================

/**
 * Generate checkout request data
 * @param {Object} options
 * @returns {Object}
 */
export function generateCheckoutData(options = {}) {
  return {
    email: options.email || generateEmail("checkout"),
    priceId: options.priceId || "price_test_individual_monthly",
    successUrl: options.successUrl || "https://test.hic-ai.com/success",
    cancelUrl: options.cancelUrl || "https://test.hic-ai.com/cancel",
    metadata: {
      source: "e2e-test",
      testId: generateId("checkout"),
      ...options.metadata,
    },
  };
}

/**
 * Generate Stripe test card token
 * Uses Stripe's test card numbers
 * @param {string} [type] - Card type: 'success', 'decline', 'expired'
 * @returns {Object}
 */
export function getStripeTestCard(type = "success") {
  const cards = {
    success: { number: "4242424242424242", cvc: "123", exp: "12/30" },
    decline: { number: "4000000000000002", cvc: "123", exp: "12/30" },
    expired: { number: "4000000000000069", cvc: "123", exp: "12/30" },
    insufficient: { number: "4000000000009995", cvc: "123", exp: "12/30" },
  };
  return cards[type] || cards.success;
}

// ============================================================================
// Webhook Simulation Data
// ============================================================================

/**
 * Generate Stripe webhook event payload
 * @param {string} eventType - e.g., 'checkout.session.completed'
 * @param {Object} data - Event data
 * @returns {Object}
 */
export function generateStripeWebhookEvent(eventType, data = {}) {
  return {
    id: `evt_${generateId("stripe")}`,
    object: "event",
    api_version: "2023-10-16",
    created: Math.floor(Date.now() / 1000),
    type: eventType,
    data: {
      object: data,
    },
    livemode: false,
    pending_webhooks: 1,
  };
}

/**
 * Generate KeyGen webhook event payload
 * @param {string} eventType - e.g., 'license.created'
 * @param {Object} data - Event data
 * @returns {Object}
 */
export function generateKeygenWebhookEvent(eventType, data = {}) {
  return {
    data: {
      id: data.id || generateId("lic"),
      type: eventType.split(".")[0], // 'license', 'machine', etc.
      attributes: data,
    },
    meta: {
      event: eventType,
      timestamp: new Date().toISOString(),
    },
  };
}

// ============================================================================
// Bulk Data Generation
// ============================================================================

/**
 * Generate multiple devices for multi-device testing
 * @param {number} count - Number of devices
 * @returns {Object[]}
 */
export function generateMultipleDevices(count) {
  return Array.from({ length: count }, (_, i) => ({
    ...generateDeviceData(),
    deviceName: `Test Device ${i + 1}`,
  }));
}

/**
 * Generate test scenario data bundle
 * @returns {Object}
 */
export function generateTestScenario() {
  const user = generateUserProfile();
  const devices = generateMultipleDevices(3);

  return {
    user,
    devices,
    primaryDevice: devices[0],
    secondaryDevice: devices[1],
    tertiaryDevice: devices[2],
    checkout: generateCheckoutData({ email: user.email }),
  };
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Check if a value is E2E test data (has our prefix)
 * @param {string} value
 * @returns {boolean}
 */
export function isTestData(value) {
  return typeof value === "string" && value.includes(testConfig.testDataPrefix);
}

/**
 * Extract test ID from test data value
 * @param {string} value
 * @returns {string|null}
 */
export function extractTestId(value) {
  if (!isTestData(value)) return null;
  const match = value.match(new RegExp(`${testConfig.testDataPrefix}[^@\\s]+`));
  return match ? match[0] : null;
}

export default {
  generateId,
  generateFingerprint,
  generateMachineId,
  generateSessionId,
  generateUserId,
  generateOrgId,
  generateEmail,
  generateUserProfile,
  generateLicenseKeyBody,
  calculateChecksum,
  generateLicenseKeyFormat,
  generateDeviceData,
  generateHeartbeatData,
  generateCheckoutData,
  getStripeTestCard,
  generateStripeWebhookEvent,
  generateKeygenWebhookEvent,
  generateMultipleDevices,
  generateTestScenario,
  isTestData,
  extractTestId,
};
