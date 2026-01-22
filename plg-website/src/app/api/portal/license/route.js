/**
 * Portal License API
 *
 * GET /api/portal/license
 *
 * Fetches license information for the authenticated user.
 */

import { NextResponse } from "next/server";
import { getSession } from "@auth0/nextjs-auth0";
import { getCustomerByAuth0Id, getLicense } from "@/lib/dynamodb";
import { getLicense as getKeygenLicense } from "@/lib/keygen";

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get customer
    const customer = await getCustomerByAuth0Id(session.user.sub);
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

    // Determine plan name
    const planName =
      customer.accountType === "enterprise"
        ? "Enterprise"
        : customer.accountType === "individual"
          ? "Individual"
          : "Open Source";

    // Mask license key for display
    const maskedKey = localLicense?.licenseKey
      ? `${localLicense.licenseKey.slice(0, 8)}...${localLicense.licenseKey.slice(-4)}`
      : null;

    return NextResponse.json({
      license: {
        id: customer.keygenLicenseId,
        key: localLicense?.licenseKey, // Full key for authenticated user
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
