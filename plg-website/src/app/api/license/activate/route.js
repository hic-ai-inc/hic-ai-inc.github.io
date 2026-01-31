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
} from "@/lib/dynamodb";

export async function POST(request) {
  try {
    const body = await request.json();
    const { licenseKey, fingerprint, deviceName, platform } = body;

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

    // Check if device limit reached (if maxMachines is set)
    if (license.maxMachines) {
      const dynamoLicense = await getDynamoLicense(license.id);
      if (
        dynamoLicense &&
        dynamoLicense.activatedDevices >= license.maxMachines
      ) {
        return NextResponse.json(
          {
            error: "Device limit reached",
            code: "DEVICE_LIMIT_REACHED",
            detail: `Maximum ${license.maxMachines} devices allowed. Please deactivate a device first.`,
            maxDevices: license.maxMachines,
            activatedDevices: dynamoLicense.activatedDevices,
          },
          { status: 403 },
        );
      }
    }

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

    // Store in DynamoDB
    await addDeviceActivation({
      keygenLicenseId: license.id,
      keygenMachineId: machine.id,
      fingerprint,
      name: machine.name,
      platform: machine.platform,
    });

    // Get current device count after activation
    let deviceCount = 1;
    try {
      const machines = await getLicenseMachines(license.id);
      deviceCount = machines.length;
    } catch (err) {
      console.error("Failed to get machine count:", err);
    }

    return NextResponse.json({
      success: true,
      activated: true,
      activationId: machine.id,
      deviceCount,
      maxDevices: license.maxMachines,
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
