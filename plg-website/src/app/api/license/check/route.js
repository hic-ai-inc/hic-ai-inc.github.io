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
import { getLicensesByEmail } from "@/lib/keygen";
import { getCustomerByEmail } from "@/lib/dynamodb";
import { checkRateLimit, RATE_LIMIT_PRESETS } from "@/lib/rate-limit";

// Rate limit preset (uses heartbeat: 10 requests per minute)
const RATE_LIMIT_KEY_PREFIX = "license-check:";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json(
        { error: "Email parameter is required" },
        { status: 400 },
      );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
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
      const hasActiveSubscription = ["active", "trialing"].includes(
        customer.subscriptionStatus,
      );

      if (hasActiveSubscription) {
        return NextResponse.json({
          status: "active",
          licenseKey: customer.keygenLicenseKey || null,
          licenseId: customer.keygenLicenseId,
          plan: customer.accountType || "individual",
          email: email.toLowerCase(),
        });
      }
    }

    // Fall back to KeyGen direct lookup by email metadata
    const licenses = await getLicensesByEmail(email);

    // Find the first active license
    const activeLicense = licenses.find(
      (lic) => lic.status === "ACTIVE" || lic.status === "active",
    );

    if (activeLicense) {
      return NextResponse.json({
        status: "active",
        licenseKey: activeLicense.key,
        licenseId: activeLicense.id,
        plan: activeLicense.policyId?.includes("business")
          ? "business"
          : "individual",
        expiresAt: activeLicense.expiresAt,
        email: email.toLowerCase(),
      });
    }

    // Check for any license (might be suspended, expired, etc)
    const anyLicense = licenses[0];
    if (anyLicense) {
      return NextResponse.json({
        status: anyLicense.status.toLowerCase(),
        licenseKey: anyLicense.key,
        licenseId: anyLicense.id,
        plan: anyLicense.policyId?.includes("business")
          ? "business"
          : "individual",
        expiresAt: anyLicense.expiresAt,
        email: email.toLowerCase(),
      });
    }

    // No license found
    return NextResponse.json({
      status: "none",
      licenseKey: null,
      email: email.toLowerCase(),
    });
  } catch (error) {
    console.error("[License Check] Error:", error);
    return NextResponse.json(
      { error: "Failed to check license status" },
      { status: 500 },
    );
  }
}
