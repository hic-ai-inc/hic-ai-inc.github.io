/**
 * Property-Based Tests — Team Device Deactivation (Fix 9)
 *
 * Feature: status-remediation-plan, Properties 14, 15, 16
 *
 * Property 14: Suspend/revoke deactivates all member devices
 * For any member with N devices (N >= 0), setting status to "suspended"
 * or "revoked" must call deactivateDevice (Keygen) and
 * removeDeviceActivation (DDB) for each device; N=0 completes as no-op.
 *
 * Property 15: Keygen device deactivation failure is non-blocking
 * For any device where Keygen deactivateDevice fails, DDB
 * removeDeviceActivation must still be called and the overall operation
 * must complete.
 *
 * Property 16: Reinstatement does not deactivate devices
 * For any member status change to "active", zero calls to deactivateDevice
 * or removeDeviceActivation must be made.
 *
 * Uses extracted logic with dependency injection — same pattern as the
 * Stripe and heartbeat property tests. Generates random device lists,
 * member IDs, and license IDs to verify the invariants hold across all inputs.
 *
 * **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.7**
 */

import { describe, it } from "node:test";
import { expect, createSpy } from "../../../../dm/facade/test-helpers/index.js";

// ============================================================================
// Extracted logic: mirrors the device-deactivation block in the team route's
// update_status handler. Uses dependency injection for testability.
// ============================================================================

/**
 * Handle device cleanup on member status update.
 * Only "suspended" and "revoked" trigger device deactivation.
 *
 * @param {string} status - Target member status
 * @param {string} memberId - Member being updated
 * @param {Object} deps - Injected dependencies
 */
async function handleStatusUpdateDeviceCleanup(status, memberId, deps) {
  const {
    getOrganization,
    getCustomerByUserId,
    getUserDevices,
    deactivateDevice,
    removeDeviceActivation,
    log,
  } = deps;

  if (status === "suspended" || status === "revoked") {
    const org = await getOrganization();
    const ownerCustomer = await getCustomerByUserId(org.ownerId);
    const keygenLicenseId = ownerCustomer?.keygenLicenseId;

    if (keygenLicenseId) {
      const devices = await getUserDevices(keygenLicenseId, memberId);
      for (const device of devices) {
        try {
          await deactivateDevice(device.keygenMachineId);
        } catch (err) {
          log.warn("keygen_device_deactivation_failed", "Non-blocking", {
            machineId: device.keygenMachineId,
            memberId,
            error: err.message,
          });
        }
        await removeDeviceActivation(
          keygenLicenseId,
          device.keygenMachineId,
          device.fingerprint,
        );
      }
    }
  }
}

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

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDevice() {
  return {
    keygenMachineId: `mach_${randomString(12)}`,
    fingerprint: `fp_${randomString(16)}`,
    userId: `user_${randomString(8)}`,
    userEmail: `${randomString(6)}@example.com`,
    lastSeen: new Date().toISOString(),
  };
}

function randomDeviceList() {
  // N = 0 to 10 devices (weighted toward small)
  const n = Math.random() < 0.15 ? 0 : randomInt(1, 10);
  const devices = [];
  for (let i = 0; i < n; i++) devices.push(randomDevice());
  return devices;
}

function randomMemberId() {
  return `user_${randomString(12)}`;
}

function randomLicenseId() {
  return `lic_${randomString(14)}`;
}

function randomOwnerId() {
  return `owner_${randomString(10)}`;
}

// ============================================================================
// Test helpers
// ============================================================================

function createMockDeps(devices, opts = {}) {
  const licenseId = opts.licenseId || randomLicenseId();
  const ownerId = opts.ownerId || randomOwnerId();
  const failingMachineIds = new Set(opts.failingMachineIds || []);

  return {
    getOrganization: createSpy("getOrganization").mockResolvedValue({
      orgId: `org_${randomString(8)}`,
      ownerId,
    }),
    getCustomerByUserId: createSpy("getCustomerByUserId").mockResolvedValue({
      userId: ownerId,
      keygenLicenseId: licenseId,
    }),
    getUserDevices: createSpy("getUserDevices").mockResolvedValue(devices),
    deactivateDevice: createSpy("deactivateDevice").mockImplementation(
      async (machineId) => {
        if (failingMachineIds.has(machineId)) {
          throw new Error(`Keygen API failure for ${machineId}`);
        }
      },
    ),
    removeDeviceActivation: createSpy(
      "removeDeviceActivation",
    ).mockResolvedValue({ removed: true }),
    log: {
      warn: createSpy("log.warn"),
      info: createSpy("log.info"),
    },
    // Expose for assertions
    _licenseId: licenseId,
    _ownerId: ownerId,
  };
}

// ============================================================================
// Feature: status-remediation-plan, Property 14
// ============================================================================

describe("Property 14: Suspend/revoke deactivates all member devices", () => {
  // ---- 14a: Both suspended and revoked call deactivateDevice for each device ----

  it("suspended/revoked calls deactivateDevice once per device (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const devices = randomDeviceList();
      const status = randomPick(["suspended", "revoked"]);
      const memberId = randomMemberId();
      const deps = createMockDeps(devices);

      await handleStatusUpdateDeviceCleanup(status, memberId, deps);

      expect(deps.deactivateDevice.callCount).toBe(devices.length);
      expect(deps.removeDeviceActivation.callCount).toBe(devices.length);
    }
  });

  // ---- 14b: Each device's machineId and fingerprint are passed correctly ----

  it("passes correct machineId/fingerprint to each deactivation call (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const devices = randomDeviceList();
      if (devices.length === 0) continue; // Skip empty for this sub-test

      const status = randomPick(["suspended", "revoked"]);
      const memberId = randomMemberId();
      const deps = createMockDeps(devices);

      await handleStatusUpdateDeviceCleanup(status, memberId, deps);

      for (let j = 0; j < devices.length; j++) {
        expect(deps.deactivateDevice.calls[j][0]).toBe(
          devices[j].keygenMachineId,
        );
        expect(deps.removeDeviceActivation.calls[j][0]).toBe(deps._licenseId);
        expect(deps.removeDeviceActivation.calls[j][1]).toBe(
          devices[j].keygenMachineId,
        );
        expect(deps.removeDeviceActivation.calls[j][2]).toBe(
          devices[j].fingerprint,
        );
      }
    }
  });

  // ---- 14c: N=0 devices is a successful no-op ----

  it("N=0 devices completes with zero deactivation calls (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const status = randomPick(["suspended", "revoked"]);
      const memberId = randomMemberId();
      const deps = createMockDeps([]);

      await handleStatusUpdateDeviceCleanup(status, memberId, deps);

      expect(deps.deactivateDevice.callCount).toBe(0);
      expect(deps.removeDeviceActivation.callCount).toBe(0);
      // But getUserDevices WAS called
      expect(deps.getUserDevices.callCount).toBe(1);
    }
  });
});

// ============================================================================
// Feature: status-remediation-plan, Property 15
// ============================================================================

describe("Property 15: Keygen device deactivation failure is non-blocking", () => {
  // ---- 15a: When some devices fail Keygen, DDB cleanup still happens for all ----

  it("DDB removeDeviceActivation called for every device even when Keygen fails (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const deviceCount = randomInt(1, 8);
      const devices = [];
      for (let j = 0; j < deviceCount; j++) devices.push(randomDevice());

      // Randomly select which devices will fail Keygen
      const failCount = randomInt(1, deviceCount);
      const failingMachineIds = new Set(
        devices
          .sort(() => Math.random() - 0.5)
          .slice(0, failCount)
          .map((d) => d.keygenMachineId),
      );

      const status = randomPick(["suspended", "revoked"]);
      const memberId = randomMemberId();
      const deps = createMockDeps(devices, { failingMachineIds });

      await handleStatusUpdateDeviceCleanup(status, memberId, deps);

      // DDB cleanup happens for ALL devices regardless of Keygen failures
      expect(deps.removeDeviceActivation.callCount).toBe(deviceCount);

      // Keygen was attempted for all devices
      expect(deps.deactivateDevice.callCount).toBe(deviceCount);

      // Warnings logged for each Keygen failure
      expect(deps.log.warn.callCount).toBe(failCount);
    }
  });

  // ---- 15b: Overall operation completes (does not throw) ----

  it("overall operation never throws even when all Keygen calls fail (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const devices = [];
      const count = randomInt(1, 5);
      for (let j = 0; j < count; j++) devices.push(randomDevice());

      const failingMachineIds = new Set(devices.map((d) => d.keygenMachineId));
      const deps = createMockDeps(devices, { failingMachineIds });
      const status = randomPick(["suspended", "revoked"]);

      // Must not throw
      await handleStatusUpdateDeviceCleanup(status, randomMemberId(), deps);

      // All DDB cleanup completed
      expect(deps.removeDeviceActivation.callCount).toBe(count);
    }
  });
});

// ============================================================================
// Feature: status-remediation-plan, Property 16
// ============================================================================

describe("Property 16: Reinstatement does not deactivate devices", () => {
  // ---- 16a: "active" status makes zero deactivation calls ----

  it("status 'active' makes zero deactivateDevice or removeDeviceActivation calls (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const devices = randomDeviceList();
      const memberId = randomMemberId();
      const deps = createMockDeps(devices);

      await handleStatusUpdateDeviceCleanup("active", memberId, deps);

      expect(deps.deactivateDevice.callCount).toBe(0);
      expect(deps.removeDeviceActivation.callCount).toBe(0);
      expect(deps.getOrganization.callCount).toBe(0);
      expect(deps.getUserDevices.callCount).toBe(0);
    }
  });

  // ---- 16b: Only "suspended" and "revoked" trigger cleanup ----

  it("only 'suspended' and 'revoked' trigger device cleanup — all other statuses are no-ops (100 iterations)", async () => {
    const nonTriggerStatuses = [
      "active",
      "pending",
      "invited",
      "removed",
      "unknown",
      "",
    ];

    for (let i = 0; i < 100; i++) {
      const status = randomPick(nonTriggerStatuses);
      const devices = randomDeviceList();
      const deps = createMockDeps(devices);

      await handleStatusUpdateDeviceCleanup(status, randomMemberId(), deps);

      expect(deps.deactivateDevice.callCount).toBe(0);
      expect(deps.removeDeviceActivation.callCount).toBe(0);
    }
  });
});
