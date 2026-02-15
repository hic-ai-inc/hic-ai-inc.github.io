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
import { validateLicense, machineHeartbeat } from "@/lib/keygen";
import {
  updateDeviceLastSeen,
  getTrialByFingerprint,
  createTrial,
  getLicenseDevices,
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

    // Mode 2: License key provided = validate with Keygen
    const result = await validateLicense(licenseKey, fingerprint);

    // If valid, update heartbeat and last-seen
    if (result.valid && result.license?.id) {
      // Fire and forget - don't block response
      const tasks = [];
      tasks.push(updateDeviceLastSeen(result.license.id, fingerprint));
      if (machineId) {
        tasks.push(machineHeartbeat(machineId));
      }
      Promise.all(tasks).catch((err) => {
        log.warn("heartbeat_update_failed", "Heartbeat update failed", {
          errorMessage: err?.message,
        });
      });
    }

    // Look up device record to include userId/userEmail/machineId in response.
    // Also runs for HEARTBEAT_NOT_STARTED: machine IS activated but hasn't
    // sent its first heartbeat, so Keygen returns valid: false. We look up
    // the device, send the first heartbeat, and return valid: true.
    let deviceUserId = null;
    let deviceUserEmail = null;
    let deviceMachineId = null;
    let effectiveValid = result.valid;
    const shouldLookupDevice =
      (result.valid || result.code === "HEARTBEAT_NOT_STARTED") &&
      result.license?.id;

    if (shouldLookupDevice) {
      try {
        const devices = await getLicenseDevices(result.license.id);
        const deviceRecord = devices.find((d) => d.fingerprint === fingerprint);
        if (deviceRecord) {
          deviceUserId = deviceRecord.userId || null;
          deviceUserEmail = deviceRecord.userEmail || null;
          deviceMachineId = deviceRecord.keygenMachineId || null;
        }
      } catch (err) {
        // Non-critical — proceed without user identity
        log.warn("device_lookup_failed", "Device lookup for user identity failed", {
          errorMessage: err?.message,
        });
      }

      // Self-healing: if HEARTBEAT_NOT_STARTED and we found the machine,
      // send the first heartbeat so Keygen recognizes the machine as alive.
      if (result.code === "HEARTBEAT_NOT_STARTED" && deviceMachineId) {
        try {
          await machineHeartbeat(deviceMachineId);
          effectiveValid = true;
        } catch (hbErr) {
          log.warn("self_healing_heartbeat_failed", "Self-healing heartbeat failed", {
            errorMessage: hbErr.message,
          });
          // Still return machineId so extension can start its own heartbeats
        }
      }
    }

    // Return validation result
    log.response(200, "License validation completed", {
      valid: effectiveValid,
      code: result.code,
    });
    return NextResponse.json({
      valid: effectiveValid,
      code: result.code,
      detail: result.detail,
      userId: deviceUserId,
      userEmail: deviceUserEmail,
      machineId: deviceMachineId,
      license: result.license
        ? {
            status: result.license.status,
            expiresAt: result.license.expiresAt,
          }
        : null,
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
