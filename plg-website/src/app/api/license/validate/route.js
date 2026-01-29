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
} from "@/lib/dynamodb";

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
  try {
    const body = await request.json();
    const { licenseKey, fingerprint, machineId } = body;

    // Fingerprint is REQUIRED - it's the primary device identifier
    // machineId is optional secondary identifier for additional tracking
    if (!fingerprint) {
      return NextResponse.json(
        { error: "Device fingerprint is required" },
        { status: 400 },
      );
    }

    // Mode 1: Fingerprint-only = trial flow
    if (!licenseKey) {
      return await handleTrialValidation(fingerprint);
    }

    // Mode 2: License key provided = validate with Keygen
    const result = await validateLicense(licenseKey, fingerprint);

    // If valid, update heartbeat (machineId optional but useful for tracking)
    if (result.valid && result.license?.id) {
      // Fire and forget - don't block response
      const trackingId = machineId || fingerprint;
      Promise.all([
        machineHeartbeat(trackingId),
        updateDeviceLastSeen(result.license.id, trackingId),
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
