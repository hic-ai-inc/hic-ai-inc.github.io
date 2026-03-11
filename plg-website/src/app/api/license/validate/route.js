/**
 * License Validation API
 *
 * POST /api/license/validate
 *
 * This endpoint is called by the VS Code extension to validate
 * license keys OR check device trial status. It supports two modes:
 *
 * 1. WITH licenseKey: Validate license via Keygen
 * 2. WITHOUT licenseKey: Check/start trial by fingerprint
 *
 * Device Identity Principle: Fingerprint is the source of truth for
 * device identity. Once a device has used a trial, it cannot get
 * another trial even after reinstalling.
 *
 * @see 20260129_DEVICE_VALIDATION_USER_JOURNEY.md
 * @see Security Considerations for Keygen Licensing
 */

import { NextResponse } from "next/server";
import { machineHeartbeat } from "@/lib/keygen";
import {
  updateDeviceLastSeen,
  getTrialByFingerprint,
  createTrial,
  getLicenseByKey,
  getDeviceByFingerprint,
} from "@/lib/dynamodb";
import { createApiLogger } from "@/lib/api-log";

// Trial duration in days
const TRIAL_DAYS = 14;

// Trial features - what's available during the trial period
const TRIAL_FEATURES = [
  "basic_editing",
  "file_operations",
  "batch_edit",
  "find_in_file",
  "datetime_tools",
  "calculator_tools",
  "notepad",
];

/**
 * Build a trial response object with all expected fields
 * @param {Object} params - Response parameters
 * @returns {Object} Complete trial response
 */
function buildTrialResponse({
  valid,
  code,
  detail,
  isActive,
  trialStartDate,
  trialEndDate,
  daysRemaining,
}) {
  return {
    success: true,
    valid,
    status: isActive ? "trial" : "expired",
    code,
    detail,
    trial: {
      isActive,
      trialStartDate,
      trialEndDate,
      daysRemaining,
    },
    features: isActive ? TRIAL_FEATURES : [],
  };
}

/**
 * Handle fingerprint-only request (trial flow)
 * Returns trial status based on device history
 */
async function handleTrialValidation(fingerprint) {
  // Check existing trial record
  const existingTrial = await getTrialByFingerprint(fingerprint);

  if (existingTrial) {
    // Device has trial history
    const now = Date.now();
    const isExpired = now > existingTrial.expiresAt;

    if (isExpired) {
      // Trial expired - no fresh trial allowed
      return NextResponse.json(
        buildTrialResponse({
          valid: false,
          code: "TRIAL_EXPIRED",
          detail: "Trial period has ended. Please purchase a license.",
          isActive: false,
          trialStartDate: new Date(existingTrial.issuedAt).toISOString(),
          trialEndDate: new Date(existingTrial.expiresAt).toISOString(),
          daysRemaining: 0,
        }),
      );
    }

    // Active trial
    const daysRemaining = Math.ceil(
      (existingTrial.expiresAt - now) / (1000 * 60 * 60 * 24),
    );

    return NextResponse.json(
      buildTrialResponse({
        valid: true,
        code: "TRIAL_ACTIVE",
        detail: `Trial active with ${daysRemaining} days remaining`,
        isActive: true,
        trialStartDate: new Date(existingTrial.issuedAt).toISOString(),
        trialEndDate: new Date(existingTrial.expiresAt).toISOString(),
        daysRemaining,
      }),
    );
  }

  // No trial history - create new trial
  const now = Date.now();
  const expiresAt = now + TRIAL_DAYS * 24 * 60 * 60 * 1000;

  try {
    await createTrial({
      fingerprint,
      trialToken: `trial_${fingerprint}_${now}`, // Simple token for tracking
      expiresAt,
      issuedAt: now,
      createdAt: now,
    });

    return NextResponse.json(
      buildTrialResponse({
        valid: true,
        code: "TRIAL_STARTED",
        detail: `Trial started with ${TRIAL_DAYS} days`,
        isActive: true,
        trialStartDate: new Date(now).toISOString(),
        trialEndDate: new Date(expiresAt).toISOString(),
        daysRemaining: TRIAL_DAYS,
      }),
    );
  } catch (error) {
    // Handle race condition - trial was created by another request
    if (error.message === "Trial already exists for this device") {
      // Fetch the trial that was just created
      const trial = await getTrialByFingerprint(fingerprint);
      if (trial) {
        const daysRemaining = Math.ceil(
          (trial.expiresAt - now) / (1000 * 60 * 60 * 24),
        );
        return NextResponse.json(
          buildTrialResponse({
            valid: true,
            code: "TRIAL_ACTIVE",
            detail: `Trial active with ${daysRemaining} days remaining`,
            isActive: true,
            trialStartDate: new Date(trial.issuedAt).toISOString(),
            trialEndDate: new Date(trial.expiresAt).toISOString(),
            daysRemaining,
          }),
        );
      }
    }
    throw error;
  }
}

export async function POST(request) {
  const log = createApiLogger({
    service: "plg-api-license-validate",
    request,
    operation: "license_validate",
  });

  log.requestReceived();

  try {
    // Parse JSON body with explicit error handling
    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      log.decision("invalid_json", "License validation rejected", {
        reason: "invalid_json",
      });
      log.response(400, "License validation rejected", { reason: "invalid_json" });
      return NextResponse.json(
        { error: "Invalid JSON", detail: parseError.message },
        { status: 400 },
      );
    }

    const { licenseKey, fingerprint, machineId } = body;

    // Fingerprint is REQUIRED - it's the primary device identifier
    // machineId is optional secondary identifier for additional tracking
    if (!fingerprint) {
      log.decision("fingerprint_missing", "License validation rejected", {
        reason: "fingerprint_missing",
      });
      log.response(400, "License validation rejected", { reason: "fingerprint_missing" });
      return NextResponse.json(
        { error: "Device fingerprint is required" },
        { status: 400 },
      );
    }

    // Mode 1: Fingerprint-only = trial flow
    if (!licenseKey) {
      log.info("trial_validation_requested", "Trial validation requested");
      return await handleTrialValidation(fingerprint);
    }

    // Mode 2: License key provided = validate against DynamoDB
    // Fix 7 / Task 12.1: Replace Keygen validateLicense read with DDB reads.
    // DDB is the sole source of truth for license status. Keygen writes
    // (machineHeartbeat) are preserved — only the read is migrated.
    const license = await getLicenseByKey(licenseKey);

    if (!license) {
      log.warn("license_not_found_gsi2", "License key not found via GSI2 lookup — verify GSI2PK exists on license record", {
        licenseKeyPrefix: licenseKey?.substring(0, 10) + "...",
      });
      log.response(200, "License validation completed", {
        valid: false,
        code: "NOT_FOUND",
      });
      return NextResponse.json({
        valid: false,
        code: "NOT_FOUND",
        detail: "License key not found",
        userId: null,
        userEmail: null,
        machineId: null,
        license: null,
      });
    }

    // Classify license status
    const INVALID_STATUSES = ["expired", "suspended", "revoked"];
    const licenseValid = !INVALID_STATUSES.includes(license.status);
    const code = licenseValid ? "VALID" : license.status.toUpperCase();
    const detail = licenseValid
      ? "License is valid"
      : `License is ${license.status}`;

    // Look up device record for this fingerprint
    const licenseId = license.keygenLicenseId;
    let deviceUserId = null;
    let deviceUserEmail = null;
    let deviceMachineId = null;
    let deviceFound = false;

    const deviceRecord = await getDeviceByFingerprint(licenseId, fingerprint);
    if (deviceRecord) {
      deviceFound = true;
      deviceUserId = deviceRecord.userId || null;
      deviceUserEmail = deviceRecord.userEmail || null;
      deviceMachineId = deviceRecord.keygenMachineId || null;
    }

    // Determine effective validity: license must be valid AND device must
    // be associated with this fingerprint (mirrors Keygen's scope check)
    let effectiveValid = licenseValid && deviceFound;
    let effectiveCode = effectiveValid
      ? "VALID"
      : !licenseValid
        ? code
        : "FINGERPRINT_SCOPE_MISMATCH";
    let effectiveDetail = effectiveValid
      ? detail
      : !licenseValid
        ? detail
        : "Device not associated with this license";

    // If valid, update heartbeat and last-seen (fire and forget)
    if (effectiveValid && licenseId) {
      const tasks = [];
      tasks.push(updateDeviceLastSeen(licenseId, fingerprint));
      if (deviceMachineId || machineId) {
        tasks.push(machineHeartbeat(deviceMachineId || machineId));
      }
      Promise.all(tasks).catch((err) => {
        log.warn("heartbeat_update_failed", "Heartbeat update failed", {
          errorMessage: err?.message,
        });
      });
    }

    // Return validation result
    log.response(200, "License validation completed", {
      valid: effectiveValid,
      code: effectiveCode,
    });
    return NextResponse.json({
      valid: effectiveValid,
      code: effectiveCode,
      detail: effectiveDetail,
      userId: deviceUserId,
      userEmail: deviceUserEmail,
      machineId: deviceMachineId,
      license: {
        status: license.status,
        expiresAt: license.expiresAt,
      },
    });
  } catch (error) {
    log.exception(error, "license_validation_failed", "License validation failed");
    log.response(500, "License validation failed", { reason: "unhandled_error" });
    return NextResponse.json(
      { error: "Validation failed", detail: error.message },
      { status: 500 },
    );
  }
}
