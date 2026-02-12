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

export async function GET() {
  try {
    // Verify JWT from Authorization header
    const tokenPayload = await verifyAuthToken();
    if (!tokenPayload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get customer by email from verified token
    const customer = await getCustomerByEmail(tokenPayload.email);

    // Check if user has a direct license
    if (customer?.keygenLicenseId) {
      return buildLicenseResponse(customer);
    }

    // No direct license - check if user is an org member with shared license access
    const userId = tokenPayload.sub;
    const membership = await getUserOrgMembership(userId);

    if (membership?.orgId) {
      // User is a member of an org - get the org's shared license
      const org = await getOrganization(membership.orgId);

      if (org?.ownerEmail) {
        // Get the org owner's customer record (which has the license)
        const orgOwner = await getCustomerByEmail(org.ownerEmail);

        if (orgOwner?.keygenLicenseId) {
          return buildLicenseResponse(orgOwner, {
            isOrgMember: true,
            orgId: membership.orgId,
            orgName: org.name || "Organization",
            memberRole: membership.role || "member",
          });
        }
      }
    }

    // No license found (neither direct nor via org)
    return NextResponse.json({
      license: null,
      message: "No license found",
    });
  } catch (error) {
    console.error("Portal license error:", error);
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
async function buildLicenseResponse(customer, orgContext = null) {
  // Get license from DynamoDB
  const localLicense = await getLicense(customer.keygenLicenseId);

  // Also fetch from Keygen for accurate status
  let keygenLicense = null;
  try {
    keygenLicense = await getKeygenLicense(customer.keygenLicenseId);
  } catch (e) {
    console.error("Failed to fetch from Keygen:", e);
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
