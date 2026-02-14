/**
 * License Deactivation API
 *
 * DELETE /api/license/deactivate
 *
 * Deactivates a license from a device. Can be called by:
 * - VS Code extension when user removes license
 * - Portal when user deactivates a device remotely
 *
 * @see Security Considerations for Keygen Licensing
 */

import { NextResponse } from "next/server";
import { deactivateDevice } from "@/lib/keygen";
import {
  removeDeviceActivation,
  getCustomerLicenses,
  getDeviceByFingerprint,
} from "@/lib/dynamodb";
import { getSession } from "@/lib/auth";

export async function DELETE(request) {
  try {
    const body = await request.json();
    const { machineId, licenseId, fingerprint } = body;

    // Validate required fields
    if (!machineId && !fingerprint) {
      return NextResponse.json(
        { error: "Machine ID or fingerprint is required" },
        { status: 400 },
      );
    }

    if (!licenseId) {
      return NextResponse.json(
        { error: "License ID is required" },
        { status: 400 },
      );
    }

    // If called from portal, verify user owns this license
    const session = await getSession();
    if (session?.user) {
      // SECURITY: Verify license ownership to prevent users from deactivating others' devices
      const userLicenses = await getCustomerLicenses(session.user.sub);
      if (!userLicenses.find((l) => l.keygenLicenseId === licenseId)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
    }

    let resolvedMachineId = machineId;

    if (!resolvedMachineId && fingerprint) {
      const device = await getDeviceByFingerprint(licenseId, fingerprint);
      resolvedMachineId = device?.keygenMachineId || null;
    }

    if (!resolvedMachineId) {
      return NextResponse.json(
        { error: "Unable to resolve machine ID for deactivation" },
        { status: 400 },
      );
    }

    // Deactivate device with Keygen
    await deactivateDevice(resolvedMachineId);

    // Remove from DynamoDB
    await removeDeviceActivation(licenseId, resolvedMachineId, fingerprint);

    return NextResponse.json({
      success: true,
      message: "Device deactivated successfully",
    });
  } catch (error) {
    console.error("License deactivation error:", error);

    if (error.status === 404) {
      // Device already deactivated or doesn't exist
      return NextResponse.json({
        success: true,
        message: "Device not found (may already be deactivated)",
      });
    }

    return NextResponse.json(
      { error: "Deactivation failed", detail: error.message },
      { status: 500 },
    );
  }
}

/**
 * POST handler - alias for DELETE
 * Provided for compatibility with clients that can't easily use DELETE with body
 */
export async function POST(request) {
  return DELETE(request);
}
