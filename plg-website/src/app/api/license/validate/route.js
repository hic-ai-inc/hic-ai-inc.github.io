/**
 * License Validation API
 *
 * POST /api/license/validate
 *
 * This endpoint is called by the VS Code extension to validate
 * license keys. It acts as a proxy to Keygen with rate limiting
 * and caching.
 *
 * @see Security Considerations for Keygen Licensing
 */

import { NextResponse } from "next/server";
import { validateLicense, machineHeartbeat } from "@/lib/keygen";
import { updateDeviceLastSeen } from "@/lib/dynamodb";

export async function POST(request) {
  try {
    const body = await request.json();
    // Support both client field names (machineId) and legacy (fingerprint)
    const { licenseKey, fingerprint, machineId } = body;
    const deviceFingerprint = machineId || fingerprint;

    // Validate required fields
    if (!licenseKey) {
      return NextResponse.json(
        { error: "License key is required" },
        { status: 400 },
      );
    }

    if (!deviceFingerprint) {
      return NextResponse.json(
        { error: "Device fingerprint or machineId is required" },
        { status: 400 },
      );
    }

    // Validate license with Keygen
    const result = await validateLicense(licenseKey, deviceFingerprint);

    // If valid and machine ID provided, update heartbeat
    if (result.valid && deviceFingerprint && result.license?.id) {
      // Fire and forget - don't block response
      Promise.all([
        machineHeartbeat(machineId),
        updateDeviceLastSeen(result.license.id, machineId),
      ]).catch((err) => {
        console.error("Heartbeat update failed:", err);
      });
    }

    // Return validation result
    return NextResponse.json({
      valid: result.valid,
      code: result.code,
      detail: result.detail,
      license: result.license
        ? {
            status: result.license.status,
            expiresAt: result.license.expiresAt,
          }
        : null,
    });
  } catch (error) {
    console.error("License validation error:", error);
    return NextResponse.json(
      { error: "Validation failed", detail: error.message },
      { status: 500 },
    );
  }
}
