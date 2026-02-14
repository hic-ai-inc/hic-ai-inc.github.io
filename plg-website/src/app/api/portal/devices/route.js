/**
 * Portal Devices API
 *
 * GET /api/portal/devices
 *
 * Fetches device status for the authenticated user's license.
 * Returns per-user devices (scoped by Cognito userId).
 * For business accounts, includes totalActiveDevices across the license.
 *
 * Requires Authorization header with Cognito ID token.
 *
 * Phase 3F: Read-only endpoint. No DELETE — device lifecycle is
 * managed by HIC via heartbeat enforcement (2-hour sliding window).
 */

import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth-verify";
import {
  getCustomerByEmail,
  getUserDevices,
  getActiveDevicesInWindow,
  getUserOrgMembership,
  getOrganization,
} from "@/lib/dynamodb";
import { getMaxDevicesForAccountType } from "@/lib/constants";
import { checkRateLimit } from "@/lib/rate-limit";

async function resolveLicenseContext(tokenPayload) {
  const userEmail = tokenPayload?.email;
  const userId = tokenPayload?.sub;

  if (!userEmail) {
    return { error: "TOKEN_EMAIL_MISSING", status: 400 };
  }

  if (!userId) {
    return { error: "TOKEN_SUB_MISSING", status: 400 };
  }

  const customer = await getCustomerByEmail(userEmail);
  if (!customer) {
    return { error: "CUSTOMER_NOT_FOUND", status: 404 };
  }

  if (customer.keygenLicenseId) {
    return {
      customer,
      licenseId: customer.keygenLicenseId,
      accountType: customer.accountType || "individual",
    };
  }

  const membership = await getUserOrgMembership(userId);
  if (membership?.orgId) {
    const org = await getOrganization(membership.orgId);
    if (org?.ownerEmail) {
      const ownerCustomer = await getCustomerByEmail(org.ownerEmail);
      if (ownerCustomer?.keygenLicenseId) {
        return {
          customer: ownerCustomer,
          licenseId: ownerCustomer.keygenLicenseId,
          accountType: ownerCustomer.accountType || "business",
        };
      }
    }
  }

  return { error: "LICENSE_NOT_FOUND", status: 404 };
}

export async function GET(request) {
  try {
    const tokenPayload = await verifyAuthToken();
    if (!tokenPayload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const identifier =
      tokenPayload.sub ||
      tokenPayload.email ||
      request?.headers?.get("x-forwarded-for") ||
      "portal-devices";

    const rateLimitResult = checkRateLimit(identifier, {
      windowMs: 60 * 1000,
      maxRequests: 30,
      keyPrefix: "portal-devices",
    });

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          code: "RATE_LIMIT_EXCEEDED",
          retryAfter: Math.ceil(
            (rateLimitResult.resetAt.getTime() - Date.now()) / 1000,
          ),
        },
        { status: 429 },
      );
    }

    const resolved = await resolveLicenseContext(tokenPayload);
    if (!resolved.licenseId) {
      return NextResponse.json(
        {
          error: "Failed to resolve license context",
          code: resolved.error || "LICENSE_CONTEXT_ERROR",
        },
        { status: resolved.status || 500 },
      );
    }

    const userId = tokenPayload.sub;
    const devices = await getUserDevices(resolved.licenseId, userId);

    const mappedDevices = devices.map((device) => ({
      id: device.keygenMachineId,
      name: device.name,
      platform: device.platform,
      fingerprint: device.fingerprint,
      lastSeen: device.lastSeenAt,
      createdAt: device.createdAt,
    }));

    const response = {
      devices: mappedDevices,
      maxDevices: getMaxDevicesForAccountType(resolved.accountType),
    };

    if (resolved.accountType === "business") {
      const allActiveDevices = await getActiveDevicesInWindow(resolved.licenseId);
      response.totalActiveDevices = allActiveDevices.length;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("Portal devices error", {
      name: error?.name,
      message: error?.message,
    });

    return NextResponse.json(
      {
        error: "Failed to fetch devices",
        code: "INTERNAL_ERROR",
      },
      { status: 500 },
    );
  }
}
