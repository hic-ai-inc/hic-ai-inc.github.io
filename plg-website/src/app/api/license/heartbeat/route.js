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
import { createApiLogger } from "@/lib/api-log";

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
  const log = createApiLogger({
    service: "plg-api-license-heartbeat",
    request,
    operation: "license_heartbeat",
  });

  log.requestReceived();

  try {
    // Rate limiting: 10 heartbeats per minute per license key
    const rateLimitResult = await rateLimitMiddleware(request, {
      getIdentifier: (body) => body.licenseKey,
      limits: "heartbeat",
    });

    if (rateLimitResult) {
      log.decision("rate_limit_exceeded", "Heartbeat rejected", {
        reason: "rate_limit_exceeded",
      });
      log.response(429, "Heartbeat rate limited", { reason: "rate_limit_exceeded" });
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
      log.decision("fingerprint_missing", "Heartbeat rejected", {
        reason: "fingerprint_missing",
      });
      log.response(400, "Heartbeat rejected", { reason: "fingerprint_missing" });
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
        log.warn("trial_heartbeat_record_failed", "Trial heartbeat recording failed", {
          errorMessage: err?.message,
        });
        // Non-critical - continue with success response
      }

      // Get version config for auto-update notification (B2)
      const versionConfig = await getVersionConfig();

      log.response(200, "Trial heartbeat recorded", { status: "trial" });
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

      log.warn("licensed_heartbeat_unauthorized", "Licensed heartbeat rejected", {
        reason: hasBearerToken
          ? "token_verification_failed"
          : "missing_or_malformed_bearer",
        hasAuthorizationHeader: Boolean(authHeader),
        hasBearerToken,
        hasSessionId: Boolean(sessionId),
        hasFingerprint: Boolean(fingerprint),
        hasMachineId: Boolean(machineId),
        hasBodyUserId: Boolean(userId),
      });

      log.response(401, "Heartbeat rejected", { reason: "unauthorized" });
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
      log.decision("session_id_missing", "Heartbeat rejected", {
        reason: "session_id_missing",
      });
      log.response(400, "Heartbeat rejected", { reason: "session_id_missing" });
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 },
      );
    }

    // Validate license key format before any server calls (CWE-306 mitigation)
    const formatValidation = validateLicenseKeyFormat(licenseKey);
    if (!formatValidation.valid) {
      log.decision("invalid_license_format", "Heartbeat rejected", {
        reason: "invalid_license_format",
      });
      log.response(400, "Heartbeat rejected", { reason: "invalid_license_format" });
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
      log.decision("machine_not_found", "Heartbeat rejected", {
        reason: "machine_not_found",
      });
      log.response(200, "Heartbeat machine not found", { status: "machine_not_found" });
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
        log.warn("device_last_seen_update_failed", "Device last seen update failed", {
          errorMessage: err?.message,
        });
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
        log.warn("active_device_count_fetch_failed", "Failed to fetch active device count", {
          errorMessage: err?.message,
        });
      }
    }

    // Check if device limit exceeded (for concurrent device enforcement)
    const overLimit = maxMachines && concurrentMachines > maxMachines;

    if (overLimit) {
      log.response(200, "Heartbeat over device limit", { status: "over_limit" });
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

    log.response(200, "Heartbeat succeeded", { status: overLimit ? "over_limit" : "active" });
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
    log.exception(error, "license_heartbeat_failed", "Heartbeat failed");

    // Don't expose internal errors
    log.response(500, "Heartbeat failed", { reason: "unhandled_error" });
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
