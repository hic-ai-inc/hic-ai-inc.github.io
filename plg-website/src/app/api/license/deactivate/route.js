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
import { createApiLogger } from "@/lib/api-log";

async function handleDeactivation(request, log) {
  try {
    const body = await request.json();
    const { machineId, licenseId, fingerprint } = body;

    // Validate required fields
    if (!machineId && !fingerprint) {
      log.decision("machine_identifier_missing", "Deactivation rejected", {
        reason: "machine_identifier_missing",
      });
      log.response(400, "Deactivation rejected", {
        reason: "machine_identifier_missing",
      });
      return NextResponse.json(
        { error: "Machine ID or fingerprint is required" },
        { status: 400 },
      );
    }

    if (!licenseId) {
      log.decision("license_id_missing", "Deactivation rejected", {
        reason: "license_id_missing",
      });
      log.response(400, "Deactivation rejected", { reason: "license_id_missing" });
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
        log.decision("license_ownership_check_failed", "Deactivation rejected", {
          reason: "license_ownership_check_failed",
        });
        log.response(403, "Deactivation rejected", {
          reason: "license_ownership_check_failed",
        });
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
    }

    let resolvedMachineId = machineId;

    if (!resolvedMachineId && fingerprint) {
      const device = await getDeviceByFingerprint(licenseId, fingerprint);
      resolvedMachineId = device?.keygenMachineId || null;
    }

    if (!resolvedMachineId) {
      log.decision("machine_id_resolution_failed", "Deactivation rejected", {
        reason: "machine_id_resolution_failed",
      });
      log.response(400, "Deactivation rejected", {
        reason: "machine_id_resolution_failed",
      });
      return NextResponse.json(
        { error: "Unable to resolve machine ID for deactivation" },
        { status: 400 },
      );
    }

    // Deactivate device with Keygen
    await deactivateDevice(resolvedMachineId);

    // Remove from DynamoDB
    await removeDeviceActivation(licenseId, resolvedMachineId, fingerprint);

    log.info("device_deactivated", "Device deactivated", {
      hasFingerprint: Boolean(fingerprint),
    });
    log.response(200, "Device deactivated successfully", { success: true });
    return NextResponse.json({
      success: true,
      message: "Device deactivated successfully",
    });
  } catch (error) {
    if (error.status === 404) {
      // Device already deactivated or doesn't exist
      log.warn("device_not_found", "Device not found during deactivation", {
        statusCode: 404,
      });
      log.response(200, "Device not found during deactivation", {
        success: true,
      });
      return NextResponse.json({
        success: true,
        message: "Device not found (may already be deactivated)",
      });
    }

    log.exception(error, "license_deactivation_failed", "License deactivation failed");
    log.response(500, "License deactivation failed", { reason: "unhandled_error" });
    return NextResponse.json(
      { error: "Deactivation failed", detail: error.message },
      { status: 500 },
    );
  }
}

export async function DELETE(request) {
  const log = createApiLogger({
    service: "plg-api-license-deactivate",
    request,
    operation: "license_deactivate",
  });

  log.requestReceived();
  return handleDeactivation(request, log);
}

/**
 * POST handler - alias for DELETE
 * Provided for compatibility with clients that can't easily use DELETE with body
 */
export async function POST(request) {
  const log = createApiLogger({
    service: "plg-api-license-deactivate",
    request,
    operation: "license_deactivate",
  });

  log.requestReceived({ methodAlias: "POST" });
  return handleDeactivation(request, log);
}
