/**
 * License Activation API
 *
 * POST /api/license/activate
 *
 * Activates a license on a new device. Called by VS Code extension
 * when a license key is first entered.
 *
 * @see Security Considerations for Keygen Licensing
 */

import { NextResponse } from "next/server";
import { validateLicense, activateDevice, getLicense, getLicenseMachines, machineHeartbeat } from "@/lib/keygen";
import {
  addDeviceActivation,
  getLicense as getDynamoLicense,
  getActiveDevicesInWindow,
  getActiveUserDevicesInWindow,
} from "@/lib/dynamodb";
import { verifyAuthToken } from "@/lib/auth-verify";
import { PRICING } from "@/lib/constants";
import { createApiLogger } from "@/lib/api-log";

export async function POST(request) {
  const log = createApiLogger({
    service: "plg-api-license-activate",
    request,
    operation: "license_activate",
  });

  log.requestReceived();

  try {
    const body = await request.json();
    const { licenseKey, fingerprint, deviceName, platform } = body;

    // Phase 3E: Authentication is required for all activations.
    // The extension's browser-delegated flow (3A) always provides a JWT
    // via the /activate page. No unauthenticated path remains.
    const tokenPayload = await verifyAuthToken();
    if (!tokenPayload) {
      log.decision("auth_failed", "License activation rejected", {
        reason: "unauthorized",
      });
      log.response(401, "License activation rejected", { reason: "unauthorized" });
      return NextResponse.json(
        { error: "Unauthorized", detail: "Authentication is required to activate a license" },
        { status: 401 },
      );
    }
    const userId = tokenPayload.sub;
    const userEmail = tokenPayload.email;

    // Validate required fields
    if (!licenseKey) {
      log.decision("license_key_missing", "License activation rejected", {
        reason: "license_key_missing",
      });
      log.response(400, "License activation rejected", { reason: "license_key_missing" });
      return NextResponse.json(
        { error: "License key is required" },
        { status: 400 },
      );
    }

    if (!fingerprint) {
      log.decision("fingerprint_missing", "License activation rejected", {
        reason: "fingerprint_missing",
      });
      log.response(400, "License activation rejected", { reason: "fingerprint_missing" });
      return NextResponse.json(
        { error: "Device fingerprint is required" },
        { status: 400 },
      );
    }

    // First validate the license
    const validation = await validateLicense(licenseKey, fingerprint);

    // Check validation result
    // If already valid with this fingerprint, device is already activated
    if (validation.valid) {
      return NextResponse.json({
        success: true,
        alreadyActivated: true,
        license: validation.license,
        message: "Device already activated",
      });
    }

    // HEARTBEAT_NOT_STARTED means machine exists but hasn't sent heartbeat yet
    // This is an idempotent success case - the device IS activated, just needs heartbeat
    if (validation.code === "HEARTBEAT_NOT_STARTED") {
      return NextResponse.json({
        success: true,
        alreadyActivated: true,
        license: validation.license,
        message: "Device already activated (awaiting first heartbeat)",
      });
    }

    // License not valid - check if we should proceed to activation
    if (validation.code === "FINGERPRINT_SCOPE_MISMATCH" || validation.code === "NO_MACHINES") {
      // FINGERPRINT_SCOPE_MISMATCH: License valid but this device not yet activated
      // NO_MACHINES: Fresh license with no devices yet
      // Both cases: proceed to activation below
    } else {
      // Other validation errors (EXPIRED, SUSPENDED, NOT_FOUND, etc.)
      return NextResponse.json(
        {
          error: "License validation failed",
          code: validation.code,
          detail: validation.detail,
        },
        { status: 400 },
      );
    }

    // Safety check: ensure we have license data to proceed
    if (!validation.license?.id) {
      log.decision("license_data_missing", "License activation rejected", {
        reason: "license_data_missing",
      });
      log.response(400, "License activation rejected", { reason: "license_data_missing" });
      return NextResponse.json(
        {
          error: "License data unavailable",
          code: "LICENSE_DATA_MISSING",
          detail: "Unable to retrieve license details for activation",
        },
        { status: 400 },
      );
    }

    // Get full license details
    const license = await getLicense(validation.license.id);

    // Phase 3E: Per-seat enforcement (Business) or per-license enforcement (Individual).
    // DynamoDB is the sole enforcement layer — Keygen has ALWAYS_ALLOW_OVERAGE.
    const windowHours = parseInt(process.env.CONCURRENT_DEVICE_WINDOW_HOURS) || 2;

    // Look up DDB license record for planName to determine enforcement mode
    const ddbLicense = await getDynamoLicense(license.id);
    const planName = ddbLicense?.planName || "Individual";
    const isBusiness = planName === "Business";

    let activeDevices;
    let perSeatLimit;

    if (isBusiness) {
      // Business: enforce per-seat (per-user) concurrent device limit
      activeDevices = await getActiveUserDevicesInWindow(license.id, userId, windowHours);
      perSeatLimit = PRICING.business.maxConcurrentMachinesPerSeat;
    } else {
      // Individual: enforce per-license concurrent device limit
      activeDevices = await getActiveDevicesInWindow(license.id, windowHours);
      perSeatLimit = PRICING.individual.maxConcurrentMachines;
    }

    if (perSeatLimit && activeDevices.length >= perSeatLimit) {
      log.decision("device_limit_exceeded", "License activation rejected", {
        reason: "device_limit_exceeded",
        activeDevices: activeDevices.length,
        maxDevices: perSeatLimit,
      });
      log.response(403, "License activation rejected", { reason: "device_limit_exceeded" });
      return NextResponse.json(
        {
          error: "Device limit exceeded",
          code: "DEVICE_LIMIT_EXCEEDED",
          detail: isBusiness
            ? `You are using ${activeDevices.length} of ${perSeatLimit} concurrent devices allowed per seat. Deactivate an existing device or contact your admin.`
            : `You are using ${activeDevices.length} of ${perSeatLimit} concurrent devices allowed. Deactivate an existing device or upgrade to Business.`,
          activeDevices: activeDevices.length,
          maxDevices: perSeatLimit,
          planName,
        },
        { status: 403 },
      );
    }

    const overLimit = false; // Enforcement is now hard — we reject above

    // Activate device with Keygen
    const machine = await activateDevice({
      licenseId: license.id,
      fingerprint,
      name: deviceName || `Device ${fingerprint.slice(0, 8)}`,
      platform: platform || "unknown",
      metadata: {
        activatedAt: new Date().toISOString(),
      },
    });

    // Store in DynamoDB (must complete before returning HTTP 200)
    await addDeviceActivation({
      keygenLicenseId: license.id,
      keygenMachineId: machine.id,
      fingerprint,
      name: machine.name,
      platform: machine.platform,
      userId,
      userEmail,
    });

    // Send first heartbeat so Keygen validates this machine immediately.
    // Without this, Keygen returns HEARTBEAT_NOT_STARTED (valid: false)
    // and the extension's poll of /api/license/validate never succeeds.
    try {
      await machineHeartbeat(machine.id);
    } catch (heartbeatErr) {
      // Non-fatal: machine is activated, heartbeat can be retried by extension
      log.warn("first_heartbeat_failed", "First heartbeat failed (non-fatal)", {
        errorMessage: heartbeatErr.message,
      });
    }

    // Get current device count after activation (time-based)
    let deviceCount = activeDevices.length + 1;

    log.info("license_activated", "License activated", {
      activationId: machine.id,
      planName,
      deviceCount,
    });
    log.response(200, "License activated", { success: true });
    return NextResponse.json({
      success: true,
      activated: true,
      activationId: machine.id,
      userId,
      userEmail,
      deviceCount,
      maxDevices: perSeatLimit,
      planName,
      overLimit: false,
      machine: {
        id: machine.id,
        name: machine.name,
        fingerprint: machine.fingerprint,
      },
      license: {
        id: license.id,
        status: license.status,
        expiresAt: license.expiresAt,
      },
    });
  } catch (error) {
    log.exception(error, "license_activation_failed", "License activation failed");

    // Handle Keygen-specific errors
    if (error.status === 422) {
      log.response(422, "License activation failed", { reason: "activation_error" });
      return NextResponse.json(
        {
          error: "Activation failed",
          code: "ACTIVATION_ERROR",
          detail: error.errors?.[0]?.detail || error.message,
        },
        { status: 422 },
      );
    }

    log.response(500, "License activation failed", { reason: "unhandled_error" });
    return NextResponse.json(
      { error: "Activation failed", detail: error.message },
      { status: 500 },
    );
  }
}
