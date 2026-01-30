/**
 * Portal Data Export API
 *
 * POST /api/portal/settings/export - Export all user data
 *
 * Returns a JSON file with all user data (GDPR compliant data portability).
 * Requires Authorization header with Cognito ID token.
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import {
  getCustomerByUserId,
  getCustomerLicenses,
  getLicenseDevices,
} from "@/lib/dynamodb";
import { getStripeClient } from "@/lib/stripe";

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
    console.error("[Export] JWT verification failed:", error.message);
    return null;
  }
}

export async function POST() {
  try {
    const tokenPayload = await verifyAuthToken();
    if (!tokenPayload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = {
      sub: tokenPayload.sub,
      email: tokenPayload.email,
      name: tokenPayload.name || tokenPayload.given_name || null,
      emailVerified: tokenPayload.email_verified || false,
    };

    const exportData = {
      exportedAt: new Date().toISOString(),
      exportVersion: "1.0",
      user: {},
      customer: {},
      licenses: [],
      devices: [],
      invoices: [],
      subscription: null,
    };

    // User profile from verified token
    exportData.user = {
      id: user.sub,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
    };

    // Customer data from DynamoDB
    const customer = await getCustomerByUserId(user.sub);
    if (customer) {
      exportData.customer = {
        accountType: customer.accountType,
        subscriptionStatus: customer.subscriptionStatus,
        notificationPreferences: customer.notificationPreferences || {},
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
      };

      // Licenses
      const licenses = await getCustomerLicenses(user.sub);
      exportData.licenses = licenses.map((license) => ({
        id: license.keygenLicenseId,
        status: license.status,
        planType: license.planType,
        maxDevices: license.maxDevices,
        createdAt: license.createdAt,
        expiresAt: license.expiresAt,
      }));

      // Devices for each license
      for (const license of licenses) {
        try {
          const devices = await getLicenseDevices(license.keygenLicenseId);
          exportData.devices.push(
            ...devices.map((device) => ({
              licenseId: license.keygenLicenseId,
              machineId: device.keygenMachineId,
              name: device.name,
              platform: device.platform,
              fingerprint: device.fingerprint,
              createdAt: device.createdAt,
              lastSeenAt: device.lastSeenAt,
            })),
          );
        } catch (e) {
          console.error("Error fetching devices for license:", e);
        }
      }

      // Stripe data (invoices, subscription)
      if (customer.stripeCustomerId) {
        try {
          const stripe = await getStripeClient();
          // Invoices
          const invoices = await stripe.invoices.list({
            customer: customer.stripeCustomerId,
            limit: 100,
          });

          exportData.invoices = invoices.data.map((invoice) => ({
            id: invoice.id,
            number: invoice.number,
            status: invoice.status,
            amount: invoice.amount_due,
            currency: invoice.currency,
            description: invoice.lines.data[0]?.description || "Subscription",
            created: new Date(invoice.created * 1000).toISOString(),
            paidAt: invoice.status_transitions?.paid_at
              ? new Date(
                  invoice.status_transitions.paid_at * 1000,
                ).toISOString()
              : null,
          }));

          // Subscription
          const subscriptions = await stripe.subscriptions.list({
            customer: customer.stripeCustomerId,
            limit: 1,
          });

          if (subscriptions.data[0]) {
            const sub = subscriptions.data[0];
            exportData.subscription = {
              id: sub.id,
              status: sub.status,
              currentPeriodStart: new Date(
                sub.current_period_start * 1000,
              ).toISOString(),
              currentPeriodEnd: new Date(
                sub.current_period_end * 1000,
              ).toISOString(),
              cancelAtPeriodEnd: sub.cancel_at_period_end,
              created: new Date(sub.created * 1000).toISOString(),
            };
          }
        } catch (e) {
          console.error("Error fetching Stripe data:", e);
        }
      }
    }

    // Return as downloadable JSON
    const jsonString = JSON.stringify(exportData, null, 2);
    const filename = `mouse-data-export-${new Date().toISOString().split("T")[0]}.json`;

    return new NextResponse(jsonString, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Data export error:", error);
    return NextResponse.json(
      { error: "Failed to export data" },
      { status: 500 },
    );
  }
}
