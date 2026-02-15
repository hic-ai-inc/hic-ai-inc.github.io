/**
 * Portal License API
 *
 * GET /api/portal/license
 *
 * Fetches license information for the authenticated user.
 * Requires Authorization header with Cognito ID token.
 *
 * For Individual users: Returns their direct license
 * For Business org members: Returns the organization's shared license
 */

import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth-verify";
import {
  getCustomerByEmail,
  getLicense,
  getUserOrgMembership,
  getOrganization,
} from "@/lib/dynamodb";
import { getLicense as getKeygenLicense } from "@/lib/keygen";
import { createApiLogger } from "@/lib/api-log";

export async function GET(request) {
  const log = createApiLogger({
    service: "plg-api-portal-license",
    request,
    operation: "portal_license",
  });

  log.requestReceived();

  try {
    const tokenPayload = await verifyAuthToken();
    if (!tokenPayload) {
      log.decision("auth_failed", "Portal license rejected", {
        reason: "unauthorized",
      });
      log.response(401, "Portal license rejected", { reason: "unauthorized" });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const customer = await getCustomerByEmail(tokenPayload.email);

    if (customer?.keygenLicenseId) {
      log.info("direct_license_found", "Direct license found", {
        hasLicenseId: Boolean(customer.keygenLicenseId),
      });
      const response = await buildLicenseResponse(customer, null, log);
      log.response(200, "Portal license fetched", { source: "direct" });
      return response;
    }

    const userId = tokenPayload.sub;
    const membership = await getUserOrgMembership(userId);

    if (membership?.orgId) {
      const org = await getOrganization(membership.orgId);

      if (org?.ownerEmail) {
        const orgOwner = await getCustomerByEmail(org.ownerEmail);

        if (orgOwner?.keygenLicenseId) {
          log.info("shared_license_found", "Shared organization license found", {
            hasLicenseId: Boolean(orgOwner.keygenLicenseId),
            role: membership.role,
          });
          const response = await buildLicenseResponse(
            orgOwner,
            {
              isOrgMember: true,
              orgId: membership.orgId,
              orgName: org.name || "Organization",
              memberRole: membership.role || "member",
            },
            log,
          );
          log.response(200, "Portal license fetched", { source: "organization" });
          return response;
        }
      }
    }

    log.info("license_not_found", "No license found for user");
    log.response(200, "Portal license empty result", { hasLicense: false });
    return NextResponse.json({
      license: null,
      message: "No license found",
    });
  } catch (error) {
    log.exception(error, "portal_license_failed", "Portal license failed");
    log.response(500, "Portal license failed", { reason: "unhandled_error" });
    return NextResponse.json(
      { error: "Failed to fetch license" },
      { status: 500 },
    );
  }
}

/**
 * Build the license response JSON from a customer record.
 *
 * @param {Object} customer - Customer record with keygenLicenseId
 * @param {Object} [orgContext] - Optional org membership context
 * @param {boolean} [orgContext.isOrgMember] - True if accessing via org membership
 * @param {string} [orgContext.orgId] - Organization ID
 * @param {string} [orgContext.orgName] - Organization display name
 * @param {string} [orgContext.memberRole] - Member's role in the org
 * @returns {NextResponse} JSON response with license details
 */
async function buildLicenseResponse(customer, orgContext = null, log = null) {
  // Get license from DynamoDB
  const localLicense = await getLicense(customer.keygenLicenseId);

  // Also fetch from Keygen for accurate status
  let keygenLicense = null;
  try {
    keygenLicense = await getKeygenLicense(customer.keygenLicenseId);
  } catch (e) {
    if (log) {
      log.warn("keygen_fetch_failed", "Keygen license fetch failed", {
        errorMessage: e?.message,
      });
    }
  }

  // Determine plan name (only Individual and Business exist)
  const planName =
    customer.accountType === "business" ? "Business" : "Individual";

  // Mask license key for display
  const maskedKey = localLicense?.licenseKey
    ? `${localLicense.licenseKey.slice(0, 8)}...${localLicense.licenseKey.slice(-4)}`
    : null;

  const response = {
    license: {
      id: customer.keygenLicenseId,
      licenseKey: localLicense?.licenseKey, // Full key for authenticated user
      maskedKey,
      status: keygenLicense?.status || localLicense?.status || "unknown",
      planType: customer.accountType,
      planName,
      expiresAt: keygenLicense?.expiresAt || localLicense?.expiresAt,
      maxDevices: localLicense?.maxDevices || 3,
      activatedDevices: localLicense?.activatedDevices || 0,
      createdAt: localLicense?.createdAt,
    },
    subscription: {
      status: customer.subscriptionStatus,
      stripeCustomerId: customer.stripeCustomerId,
    },
  };

  // Add org context if accessing via membership
  if (orgContext) {
    response.organization = {
      id: orgContext.orgId,
      name: orgContext.orgName,
      role: orgContext.memberRole,
      isSharedLicense: true,
    };
  }

  return NextResponse.json(response);
}
