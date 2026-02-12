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
import { validateLicense, activateDevice, getLicense, getLicenseMachines } from "@/lib/keygen";
import {
  addDeviceActivation,
  getLicense as getDynamoLicense,
  getActiveDevicesInWindow,
} from "@/lib/dynamodb";
import { verifyAuthToken } from "@/lib/auth-verify";

export async function POST(request) {
  try {
    const body = await request.json();
    const { licenseKey, fingerprint, deviceName, platform } = body;

    // Optional JWT authentication (Phase 3B)
    // If Authorization header is present, verify it and extract user identity.
    // No header = backward-compatible unauthenticated activation (transitional).
    // Invalid/expired header = 401 rejection (bad token ≠ no token).
    let userId = null;
    let userEmail = null;
    const authHeader = request.headers.get("authorization");
    if (authHeader) {
      const tokenPayload = await verifyAuthToken();
      if (!tokenPayload) {
        return NextResponse.json(
          { error: "Unauthorized", detail: "Invalid or expired authentication token" },
          { status: 401 },
        );
      }
      userId = tokenPayload.sub;
      userEmail = tokenPayload.email;
    }

    // Validate required fields
    if (!licenseKey) {
      return NextResponse.json(
        { error: "License key is required" },
        { status: 400 },
      );
    }

    if (!fingerprint) {
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

    // Check concurrent device count (2-hour sliding window)
    const windowHours = parseInt(process.env.CONCURRENT_DEVICE_WINDOW_HOURS) || 2;
    const activeDevices = await getActiveDevicesInWindow(license.id, windowHours);
    const overLimit = license.maxMachines && activeDevices.length >= license.maxMachines;

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

    // Get current device count after activation (time-based)
    let deviceCount = activeDevices.length + 1;

    return NextResponse.json({
      success: true,
      activated: true,
      activationId: machine.id,
      userId,
      userEmail,
      deviceCount,
      maxDevices: license.maxMachines,
      overLimit: overLimit,
      message: overLimit
        ? `You're using ${deviceCount} of ${license.maxMachines} allowed devices. Consider upgrading for more concurrent devices.`
        : null,
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
    console.error("License activation error:", error);

    // Handle Keygen-specific errors
    if (error.status === 422) {
      return NextResponse.json(
        {
          error: "Activation failed",
          code: "ACTIVATION_ERROR",
          detail: error.errors?.[0]?.detail || error.message,
        },
        { status: 422 },
      );
    }

    return NextResponse.json(
      { error: "Activation failed", detail: error.message },
      { status: 500 },
    );
  }
}
