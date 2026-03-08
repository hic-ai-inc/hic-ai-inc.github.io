/**
 * License Check API
 *
 * Allows Mouse extension to check if an email has an active license.
 * This enables "email-based activation" - user just enters their email,
 * and if they've purchased, Mouse auto-activates without copying a key.
 *
 * Rate limited to prevent enumeration attacks.
 *
 * @see PLG User Journey - Phase 4: Auto-Activation
 */

import { NextResponse } from "next/server";
import { getCustomerByEmail, getCustomerLicensesByEmail } from "@/lib/dynamodb";
import { checkRateLimit, RATE_LIMIT_PRESETS } from "@/lib/rate-limit";
import { createApiLogger } from "@/lib/api-log";

// Rate limit preset (uses heartbeat: 10 requests per minute)
const RATE_LIMIT_KEY_PREFIX = "license-check:";

export async function GET(request) {
  const log = createApiLogger({
    service: "plg-api-license-check",
    request,
    operation: "license_check",
  });

  log.requestReceived();

  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");

    if (!email) {
      log.decision("email_missing", "License check rejected", {
        reason: "email_missing",
      });
      log.response(400, "License check rejected", { reason: "email_missing" });
      return NextResponse.json(
        { error: "Email parameter is required" },
        { status: 400 },
      );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      log.decision("invalid_email_format", "License check rejected", {
        reason: "invalid_email_format",
      });
      log.response(400, "License check rejected", {
        reason: "invalid_email_format",
      });
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 },
      );
    }

    // Rate limiting by IP
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0] ||
      request.headers.get("x-real-ip") ||
      "unknown";

    // Rate limiting: 10 requests per minute per IP
    const rateLimitResult = checkRateLimit(ip, {
      windowMs: RATE_LIMIT_PRESETS.heartbeat.windowMs,
      maxRequests: RATE_LIMIT_PRESETS.heartbeat.maxRequests,
      keyPrefix: RATE_LIMIT_KEY_PREFIX,
    });
    if (!rateLimitResult.allowed) {
      log.decision("rate_limit_exceeded", "License check rejected", {
        reason: "rate_limit_exceeded",
      });
      log.response(429, "License check rate limited", {
        reason: "rate_limit_exceeded",
      });
      return NextResponse.json(
        { error: "Rate limit exceeded. Try again later." },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": String(rateLimitResult.limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(rateLimitResult.resetAt.getTime()),
            "Retry-After": String(
              Math.ceil((rateLimitResult.resetAt.getTime() - Date.now()) / 1000),
            ),
          },
        },
      );
    }

    // First check our DynamoDB for customer record
    const customer = await getCustomerByEmail(email.toLowerCase());

    if (customer && customer.keygenLicenseId) {
      // We have a stored license key - use it
      const hasActiveSubscription = ["active"].includes(
        customer.subscriptionStatus,
      );

      if (hasActiveSubscription) {
        log.info("customer_license_found", "Active customer license found", {
          source: "dynamodb",
        });
        log.response(200, "License check completed", { status: "active" });
        return NextResponse.json({
          status: "active",
          licenseKey: customer.keygenLicenseKey || null,
          licenseId: customer.keygenLicenseId,
          plan: customer.accountType || "individual",
          email: email.toLowerCase(),
        });
      }
    }

    // Fall back to DDB license lookup by email
    const licenses = await getCustomerLicensesByEmail(email);

    // Find the first active license
    const activeLicense = licenses.find(
      (lic) => lic.status === "active",
    );

    if (activeLicense) {
      log.info("active_license_found", "Active license found", {
        source: "dynamodb",
      });
      log.response(200, "License check completed", { status: "active" });
      return NextResponse.json({
        status: "active",
        licenseKey: activeLicense.licenseKey || null,
        licenseId: activeLicense.keygenLicenseId,
        plan: activeLicense.planName?.toLowerCase() || "individual",
        expiresAt: activeLicense.expiresAt,
        email: email.toLowerCase(),
      });
    }

    // Check for any license (might be suspended, expired, etc)
    const anyLicense = licenses[0];
    if (anyLicense) {
      log.info("non_active_license_found", "Non-active license found", {
        status: anyLicense.status || "unknown",
      });
      log.response(200, "License check completed", {
        status: anyLicense.status || "unknown",
      });
      return NextResponse.json({
        status: anyLicense.status || "unknown",
        licenseKey: anyLicense.licenseKey || null,
        licenseId: anyLicense.keygenLicenseId,
        plan: anyLicense.planName?.toLowerCase() || "individual",
        expiresAt: anyLicense.expiresAt,
        email: email.toLowerCase(),
      });
    }

    // No license found
    log.info("license_not_found", "No license found for email");
    log.response(200, "License check completed", { status: "none" });
    return NextResponse.json({
      status: "none",
      licenseKey: null,
      email: email.toLowerCase(),
    });
  } catch (error) {
    log.exception(error, "license_check_failed", "License check failed");
    log.response(500, "License check failed", { reason: "unhandled_error" });
    return NextResponse.json(
      { error: "Failed to check license status" },
      { status: 500 },
    );
  }
}
