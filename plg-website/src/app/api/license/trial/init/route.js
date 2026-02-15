/**
 * Trial Token Initialization API
 *
 * POST /api/license/trial/init
 *
 * Issues a cryptographically-bound trial token for new users.
 * Trial tokens are:
 * - Bound to machine fingerprint (hardware-derived)
 * - Time-limited (14 days)
 * - One-time issuable per fingerprint (prevents trial farming)
 *
 * Security: Implements CWE-306 mitigation via HMAC-signed tokens
 *
 * @see Security Considerations for Keygen Licensing - Layer 1: Trial Token
 * @see PLG_ROADMAP_v4.md Phase 4 - Trial token system
 */

import { NextResponse } from "next/server";
import crypto from "crypto";
import { getTrialByFingerprint, createTrial } from "@/lib/dynamodb";
import {
  rateLimitMiddleware,
  getRateLimitHeaders,
  RATE_LIMIT_PRESETS,
} from "@/lib/rate-limit";
import { getAppSecrets } from "@/lib/secrets";
import { createApiLogger } from "@/lib/api-log";

// Trial configuration
const TRIAL_DURATION_DAYS = 14;
const TRIAL_DURATION_MS = TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000;

// HMAC secret fetched from AWS Secrets Manager at runtime
let cachedTrialSecret = null;

/**
 * Validate fingerprint format
 * Fingerprint should be a hex string of reasonable length
 */
function validateFingerprint(fingerprint) {
  if (!fingerprint || typeof fingerprint !== "string") {
    return { valid: false, reason: "Fingerprint is required" };
  }

  // Fingerprint should be a hex string between 32-128 characters
  // (16-64 bytes when decoded)
  if (fingerprint.length < 32 || fingerprint.length > 128) {
    return { valid: false, reason: "Invalid fingerprint length" };
  }

  // Should only contain hex characters
  if (!/^[a-f0-9]+$/i.test(fingerprint)) {
    return { valid: false, reason: "Invalid fingerprint format" };
  }

  return { valid: true };
}

/**
 * Get the trial token secret (cached after first fetch)
 */
async function getTrialSecret() {
  if (!cachedTrialSecret) {
    const secrets = await getAppSecrets();
    cachedTrialSecret = secrets.TRIAL_TOKEN_SECRET;
  }
  return cachedTrialSecret;
}

/**
 * Generate HMAC-SHA256 signed trial token
 *
 * Token format: base64url(payload).base64url(signature)
 * Payload contains: type, fingerprint, issuedAt, expiresAt
 *
 * @param {string} fingerprint - Machine fingerprint
 * @param {string} secret - HMAC signing secret
 */
function generateTrialToken(fingerprint, secret) {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + TRIAL_DURATION_MS;

  const payload = {
    type: "trial",
    fingerprint,
    issuedAt,
    expiresAt,
  };

  const payloadStr = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadStr).toString("base64url");

  // HMAC-SHA256 signature
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payloadStr);
  const signature = hmac.digest("base64url");

  return {
    token: `${payloadB64}.${signature}`,
    expiresAt,
    issuedAt,
  };
}

/**
 * Verify a trial token's signature and expiration
 * Used for subsequent requests to validate trial status
 */
export function verifyTrialToken(token, expectedFingerprint) {
  try {
    const [payloadB64, signature] = token.split(".");
    if (!payloadB64 || !signature) {
      return { valid: false, reason: "Invalid token format" };
    }

    // Decode and parse payload
    const payloadStr = Buffer.from(payloadB64, "base64url").toString("utf-8");
    const payload = JSON.parse(payloadStr);

    // Verify signature
    const hmac = crypto.createHmac("sha256", TRIAL_SECRET);
    hmac.update(payloadStr);
    const expectedSignature = hmac.digest("base64url");

    if (signature !== expectedSignature) {
      return { valid: false, reason: "Invalid signature" };
    }

    // Verify fingerprint matches
    if (payload.fingerprint !== expectedFingerprint) {
      return { valid: false, reason: "Fingerprint mismatch" };
    }

    // Check expiration
    if (Date.now() > payload.expiresAt) {
      return {
        valid: false,
        reason: "Trial expired",
        expiredAt: new Date(payload.expiresAt).toISOString(),
      };
    }

    // Valid token
    return {
      valid: true,
      payload,
      remainingDays: Math.ceil(
        (payload.expiresAt - Date.now()) / (24 * 60 * 60 * 1000),
      ),
    };
  } catch (error) {
    return { valid: false, reason: "Token parsing failed" };
  }
}

/**
 * Calculate remaining days for an existing trial
 */
function calculateRemainingDays(trial) {
  const remaining = trial.expiresAt - Date.now();
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / (24 * 60 * 60 * 1000));
}

export async function POST(request) {
  const log = createApiLogger({
    service: "plg-api-license-trial-init",
    request,
    operation: "license_trial_init",
  });

  log.requestReceived();

  try {
    // Rate limiting: 5 requests per hour per fingerprint
    const rateLimitResult = await rateLimitMiddleware(request, {
      getIdentifier: (body) => body.fingerprint,
      limits: "trialInit",
    });

    if (rateLimitResult) {
      log.decision("rate_limit_exceeded", "Trial init rejected", {
        reason: "rate_limit_exceeded",
      });
      log.response(429, "Trial init rate limited", { reason: "rate_limit_exceeded" });
      return NextResponse.json(rateLimitResult, {
        status: 429,
        headers: {
          "Retry-After": rateLimitResult.retryAfter.toString(),
        },
      });
    }

    const body = await request.json();
    const { fingerprint } = body;

    // Validate fingerprint
    const validation = validateFingerprint(fingerprint);
    if (!validation.valid) {
      log.decision("invalid_fingerprint", "Trial init rejected", {
        reason: "invalid_fingerprint",
      });
      log.response(400, "Trial init rejected", { reason: "invalid_fingerprint" });
      return NextResponse.json(
        {
          error: "invalid_fingerprint",
          reason: validation.reason,
        },
        { status: 400 },
      );
    }

    // Check if fingerprint already has a trial
    const existingTrial = await getTrialByFingerprint(fingerprint);

    if (existingTrial) {
      const remainingDays = calculateRemainingDays(existingTrial);

      if (remainingDays <= 0) {
        // Trial expired
        log.decision("trial_expired", "Trial init rejected", {
          reason: "trial_expired",
        });
        log.response(410, "Trial init rejected", { reason: "trial_expired" });
        return NextResponse.json(
          {
            error: "trial_expired",
            message: "Your trial period has ended",
            expiredAt: new Date(existingTrial.expiresAt).toISOString(),
            action: "purchase_required",
          },
          { status: 410 }, // 410 Gone
        );
      }

      // Trial exists and is still valid - return existing info
      log.decision("trial_exists", "Trial init rejected", {
        reason: "trial_exists",
      });
      log.response(409, "Trial init rejected", { reason: "trial_exists" });
      return NextResponse.json(
        {
          error: "trial_exists",
          message: "A trial has already been issued for this device",
          expiresAt: new Date(existingTrial.expiresAt).toISOString(),
          remainingDays,
          // Don't return the token - they should have it locally
        },
        { status: 409 }, // 409 Conflict
      );
    }

    // Generate new trial token (secret fetched from AWS Secrets Manager)
    const trialSecret = await getTrialSecret();
    const { token, expiresAt, issuedAt } = generateTrialToken(
      fingerprint,
      trialSecret,
    );

    // Store in database
    await createTrial({
      fingerprint,
      trialToken: token,
      expiresAt,
      issuedAt,
      createdAt: Date.now(),
    });

    // Success - return trial token
    const responseHeaders = getRateLimitHeaders(
      fingerprint,
      RATE_LIMIT_PRESETS.trialInit,
    );

        log.response(200, "Trial initialized", { success: true });
    return NextResponse.json(
      {
        trialToken: token,
        expiresAt: new Date(expiresAt).toISOString(),
        remainingDays: TRIAL_DURATION_DAYS,
        issuedAt: new Date(issuedAt).toISOString(),
      },
      { headers: responseHeaders },
    );
  } catch (error) {
    log.exception(error, "license_trial_init_failed", "Trial init failed");

    log.response(500, "Trial init failed", { reason: "unhandled_error" });
    return NextResponse.json(
      {
        error: "server_error",
        message: "Failed to initialize trial",
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/license/trial/init
 *
 * Check trial status for a fingerprint
 * Query params: ?fingerprint=xxx
 */
export async function GET(request) {
  const log = createApiLogger({
    service: "plg-api-license-trial-init",
    request,
    operation: "license_trial_check",
  });

  log.requestReceived();

  try {
    const { searchParams } = new URL(request.url);
    const fingerprint = searchParams.get("fingerprint");

    // Validate fingerprint
    const validation = validateFingerprint(fingerprint);
    if (!validation.valid) {
      log.decision("invalid_fingerprint", "Trial init rejected", {
        reason: "invalid_fingerprint",
      });
      log.response(400, "Trial init rejected", { reason: "invalid_fingerprint" });
      return NextResponse.json(
        {
          error: "invalid_fingerprint",
          reason: validation.reason,
        },
        { status: 400 },
      );
    }

    // Look up trial
    const trial = await getTrialByFingerprint(fingerprint);

    if (!trial) {
      log.response(200, "Trial status returned", { hasTrialHistory: false });
      return NextResponse.json({
        hasTrialHistory: false,
        canStartTrial: true,
      });
    }

    const remainingDays = calculateRemainingDays(trial);
    const isExpired = remainingDays <= 0;

        log.response(200, "Trial status returned", {
      hasTrialHistory: true,
      isExpired,
    });
    return NextResponse.json({
      hasTrialHistory: true,
      canStartTrial: false,
      isExpired,
      remainingDays: isExpired ? 0 : remainingDays,
      expiresAt: new Date(trial.expiresAt).toISOString(),
    });
  } catch (error) {
    log.exception(error, "license_trial_check_failed", "Trial status check failed");

    log.response(500, "Trial status check failed", { reason: "unhandled_error" });
    return NextResponse.json(
      {
        error: "server_error",
        message: "Failed to check trial status",
      },
      { status: 500 },
    );
  }
}
