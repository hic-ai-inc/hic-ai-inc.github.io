/**
 * License Heartbeat API
 *
 * POST /api/license/heartbeat
 *
 * Called periodically by the VS Code extension (default: every 10 minutes)
 * to verify concurrent device limits and update last-seen timestamps.
 *
 * This endpoint is lightweight and optimized for high-frequency calls:
 * - No full license validation (assumes already validated on activation)
 * - Quick machine ping to Keygen
 * - DynamoDB update for device tracking
 *
 * @see Security Considerations for Keygen Licensing
 * @see PLG Technical Specification v2 - Section 3.3
 */

import { NextResponse } from "next/server";
import { machineHeartbeat, getLicenseMachines } from "@/lib/keygen";
import {
  updateDeviceLastSeen,
  getLicense,
  recordTrialHeartbeat,
  getVersionConfig,
  getActiveDevicesInWindow,
} from "@/lib/dynamodb";
import { verifyAuthToken } from "@/lib/auth-verify";
import {
  rateLimitMiddleware,
  getRateLimitHeaders,
  RATE_LIMIT_PRESETS,
} from "@/lib/rate-limit";

/**
 * Validate license key format before any server calls
 * Prevents enumeration attacks by rejecting malformed keys early
 *
 * Format: MOUSE-XXXX-XXXX-XXXX-YYYY (where YYYY is checksum)
 */
function validateLicenseKeyFormat(licenseKey) {
  if (!licenseKey || typeof licenseKey !== "string") {
    return { valid: false, reason: "License key is required" };
  }

  // Check format: MOUSE-XXXX-XXXX-XXXX-YYYY
  const pattern = /^MOUSE-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
  if (!pattern.test(licenseKey)) {
    return { valid: false, reason: "Invalid license key format" };
  }

  // Validate checksum (last 4 characters)
  const parts = licenseKey.split("-");
  const keyBody = parts.slice(1, 4).join(""); // XXXXXXXXXXXX
  const providedChecksum = parts[4];
  const expectedChecksum = calculateChecksum(keyBody);

  if (providedChecksum !== expectedChecksum) {
    return { valid: false, reason: "Invalid license key checksum" };
  }

  return { valid: true };
}

/**
 * Calculate checksum for license key body
 * Simple deterministic hash to prevent enumeration attacks
 */
function calculateChecksum(keyBody) {
  let sum = 0;
  for (let i = 0; i < keyBody.length; i++) {
    sum += keyBody.charCodeAt(i) * (i + 1);
  }
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let checksum = "";
  for (let i = 0; i < 4; i++) {
    checksum += chars[(sum >> (i * 5)) % 36];
  }
  return checksum;
}

export async function POST(request) {
  try {
    // Rate limiting: 10 heartbeats per minute per license key
    const rateLimitResult = await rateLimitMiddleware(request, {
      getIdentifier: (body) => body.licenseKey,
      limits: "heartbeat",
    });

    if (rateLimitResult) {
      return NextResponse.json(rateLimitResult, {
        status: 429,
        headers: {
          "Retry-After": rateLimitResult.retryAfter.toString(),
        },
      });
    }

    const body = await request.json();
    const { machineId, sessionId, licenseKey, fingerprint, userId } = body;

    // Validate required fields - fingerprint is always required
    // Each container/device must have a unique fingerprint for concurrent session tracking
    if (!fingerprint) {
      return NextResponse.json(
        { error: "Device fingerprint is required" },
        { status: 400 },
      );
    }

    // =========================================================================
    // TRIAL USER HEARTBEAT (no license key)
    // =========================================================================
    // Trial users send heartbeats before purchasing. We record their device
    // so it can be linked to their account when they purchase a license.
    if (!licenseKey) {
      // Record trial device heartbeat in DynamoDB using fingerprint as unique key
      try {
        await recordTrialHeartbeat(fingerprint, {
          fingerprint,
          machineId,
          sessionId,
          lastSeen: new Date().toISOString(),
        });
      } catch (err) {
        console.error("Trial heartbeat recording failed:", err);
        // Non-critical - continue with success response
      }

      // Get version config for auto-update notification (B2)
      const versionConfig = await getVersionConfig();

      return NextResponse.json({
        valid: true,
        status: "trial",
        reason: "Trial heartbeat recorded",
        concurrentMachines: 1,
        maxMachines: 1,
        nextHeartbeat: 900,
        // Auto-update fields (B2)
        latestVersion: versionConfig?.latestVersion || null,
        releaseNotesUrl: versionConfig?.releaseNotesUrl || null,
        updateUrl: versionConfig?.updateUrl?.marketplace || null,
        // Daily-gated notification fields (see scheduled task: mouse-version-notify)
        readyVersion: versionConfig?.readyVersion || null,
        readyReleaseNotesUrl: versionConfig?.readyReleaseNotesUrl || null,
        readyUpdateUrl: versionConfig?.readyUpdateUrl || null,
        readyUpdatedAt: versionConfig?.readyUpdatedAt || null,
      });
    }

    // =========================================================================
    // LICENSED USER HEARTBEAT (with license key)
    // =========================================================================

    // Phase 3E: Authentication is required for licensed heartbeats.
    // The extension always sends the JWT obtained during browser-delegated activation.
    const tokenPayload = await verifyAuthToken();
    if (!tokenPayload) {
      const authHeader = request.headers.get("authorization");
      const hasBearerToken =
        typeof authHeader === "string" && authHeader.startsWith("Bearer ");

      console.warn("[license/heartbeat] Licensed heartbeat rejected (401)", {
        reason: hasBearerToken
          ? "token_verification_failed"
          : "missing_or_malformed_bearer",
        hasAuthorizationHeader: Boolean(authHeader),
        hasBearerToken,
        hasSessionId: Boolean(sessionId),
        hasFingerprint: Boolean(fingerprint),
        hasMachineId: Boolean(machineId),
        hasBodyUserId: Boolean(userId),
        fingerprintPrefix:
          typeof fingerprint === "string" ? fingerprint.slice(0, 12) : null,
      });

      return NextResponse.json(
        {
          error: "Unauthorized",
          detail: "Authentication is required for licensed heartbeats",
        },
        { status: 401 },
      );
    }
    const authedUserId = tokenPayload.sub;

    // SessionId required for licensed users
    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 },
      );
    }

    // Validate license key format before any server calls (CWE-306 mitigation)
    const formatValidation = validateLicenseKeyFormat(licenseKey);
    if (!formatValidation.valid) {
      return NextResponse.json(
        {
          valid: false,
          status: "invalid",
          reason: formatValidation.reason,
        },
        { status: 400 },
      );
    }

    // Ping Keygen to update machine heartbeat
    // Use fingerprint for the ping - Keygen accepts URL-safe fingerprints as machine identifiers
    // This is more reliable than machineId since Mouse always sends fingerprint
    const heartbeatResult = await machineHeartbeat(fingerprint);

    if (!heartbeatResult.success) {
      // Machine not found or inactive - license may have been revoked
      return NextResponse.json({
        valid: false,
        status: "machine_not_found",
        reason: heartbeatResult.error || "Machine not found or deactivated",
        concurrentMachines: 0,
        maxMachines: 0,
      });
    }

    // Get license details from DynamoDB
    const license = await getLicense(licenseKey);

    if (!license) {
      // License not in our database - might be valid in Keygen but not synced
      // Still return version payload so the extension can prompt updates consistently.
      const versionConfig = await getVersionConfig();

      return NextResponse.json({
        valid: true,
        status: "active",
        reason: "Heartbeat successful",
        concurrentMachines: 1,
        maxMachines: null, // Unknown
        nextHeartbeat: 900,
        // Auto-update fields (B2)
        latestVersion: versionConfig?.latestVersion || null,
        releaseNotesUrl: versionConfig?.releaseNotesUrl || null,
        updateUrl: versionConfig?.updateUrl?.marketplace || null,
        // Daily-gated notification fields (see scheduled task: mouse-version-notify)
        readyVersion: versionConfig?.readyVersion || null,
        readyReleaseNotesUrl: versionConfig?.readyReleaseNotesUrl || null,
        readyUpdateUrl: versionConfig?.readyUpdateUrl || null,
        readyUpdatedAt: versionConfig?.readyUpdatedAt || null,
      });
    }

    // Update device last seen in DynamoDB (fire and forget)
    // Phase 3E: Use verified authedUserId from JWT, not body-supplied userId
    if (license.keygenLicenseId) {
      updateDeviceLastSeen(
        license.keygenLicenseId,
        fingerprint,
        authedUserId,
      ).catch((err) => {
        console.error("Device last seen update failed:", err);
      });
    }

    // Get active device count using time-based window (2-hour sliding window)
    const windowHours =
      parseInt(process.env.CONCURRENT_DEVICE_WINDOW_HOURS) || 2;
    let concurrentMachines = 1;
    let maxMachines = license.maxDevices || null;

    if (license.keygenLicenseId) {
      try {
        const activeDevices = await getActiveDevicesInWindow(
          license.keygenLicenseId,
          windowHours,
        );
        concurrentMachines = activeDevices.length;
      } catch (err) {
        console.error("Failed to fetch active device count:", err);
      }
    }

    // Check if device limit exceeded (for concurrent device enforcement)
    const overLimit = maxMachines && concurrentMachines > maxMachines;

    if (overLimit) {
      return NextResponse.json({
        valid: true,
        status: "over_limit",
        reason: `You're using ${concurrentMachines} of ${maxMachines} allowed devices`,
        concurrentMachines,
        maxMachines,
        message: "Consider upgrading your plan for more concurrent devices.",
      });
    }

    // Success response with rate limit headers
    const rateLimitHeaders = getRateLimitHeaders(
      licenseKey,
      RATE_LIMIT_PRESETS.heartbeat,
    );

    // Get version config for auto-update notification (B2)
    const versionConfig = await getVersionConfig();

    return NextResponse.json(
      {
        valid: true,
        status: overLimit ? "over_limit" : "active",
        reason: "Heartbeat successful",
        concurrentMachines,
        maxMachines,
        overLimit: overLimit,
        message: overLimit
          ? `You're using ${concurrentMachines} of ${maxMachines} allowed devices. Consider upgrading.`
          : null,
        nextHeartbeat: 900,
        // Auto-update fields (B2)
        latestVersion: versionConfig?.latestVersion || null,
        releaseNotesUrl: versionConfig?.releaseNotesUrl || null,
        updateUrl: versionConfig?.updateUrl?.marketplace || null,
        // Daily-gated notification fields (see scheduled task: mouse-version-notify)
        readyVersion: versionConfig?.readyVersion || null,
        readyReleaseNotesUrl: versionConfig?.readyReleaseNotesUrl || null,
        readyUpdateUrl: versionConfig?.readyUpdateUrl || null,
        readyUpdatedAt: versionConfig?.readyUpdatedAt || null,
      },
      { headers: rateLimitHeaders },
    );
  } catch (error) {
    console.error("Heartbeat error:", error);

    // Don't expose internal errors
    return NextResponse.json(
      {
        valid: false,
        status: "error",
        reason: "Server error during heartbeat",
        concurrentMachines: 0,
        maxMachines: 0,
      },
      { status: 500 },
    );
  }
}
