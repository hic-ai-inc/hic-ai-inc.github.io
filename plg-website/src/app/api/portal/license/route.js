/**
 * Portal License API
 *
 * GET /api/portal/license
 *
 * Fetches license information for the authenticated user.
 * Requires Authorization header with Cognito ID token.
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { getCustomerByEmail, getLicense } from "@/lib/dynamodb";
import { getLicense as getKeygenLicense } from "@/lib/keygen";

// Cognito JWT verifier for ID tokens
const idVerifier = CognitoJwtVerifier.create({
  userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID,
  tokenUse: "id",
  clientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID,
});

/**
 * Verify Cognito ID token from Authorization header
 */
async function verifyAuthToken() {
  const headersList = await headers();
  const authHeader = headersList.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7);
  try {
    return await idVerifier.verify(token);
  } catch (error) {
    console.error("[License] JWT verification failed:", error.message);
    return null;
  }
}

export async function GET() {
  try {
    // Verify JWT from Authorization header
    const tokenPayload = await verifyAuthToken();
    if (!tokenPayload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get customer by email from verified token
    const customer = await getCustomerByEmail(tokenPayload.email);
    if (!customer || !customer.keygenLicenseId) {
      return NextResponse.json({
        license: null,
        message: "No license found",
      });
    }

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

    return NextResponse.json({
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
    });
  } catch (error) {
    console.error("Portal license error:", error);
    return NextResponse.json(
      { error: "Failed to fetch license" },
      { status: 500 },
    );
  }
}
