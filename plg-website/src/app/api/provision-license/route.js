/**
 * License Provisioning API
 *
 * Called after successful Stripe checkout to:
 * 1. Verify Stripe session is paid
 * 2. Create Keygen license
 * 3. Store customer/license in DynamoDB
 * 4. Send license email
 *
 * Requires authenticated user (Cognito ID token via Authorization header).
 *
 * @see PLG User Journey - License Provisioning
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { getStripeClient } from "@/lib/stripe";
import { createLicenseForPlan } from "@/lib/keygen";
import {
  upsertCustomer,
  createLicense,
  getCustomerByEmail,
} from "@/lib/dynamodb";
// NOTE: Email is sent via event-driven architecture:
// DynamoDB write → DynamoDB Streams → StreamProcessor Lambda → SNS → EmailSender Lambda → SES
// Do NOT call sendLicenseEmail() directly here.

// Cognito JWT verifier for ID tokens (contains user info)
const idVerifier = CognitoJwtVerifier.create({
  userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID,
  tokenUse: "id",
  clientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID,
});

/**
 * Verify Cognito ID token from Authorization header
 * Returns decoded token payload with user info
 */
async function verifyAuthToken(request) {
  const headersList = await headers();
  const authHeader = headersList.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7);
  try {
    return await idVerifier.verify(token);
  } catch (error) {
    console.error("[ProvisionLicense] JWT verification failed:", error.message);
    return null;
  }
}

export async function POST(request) {
  try {
    // Get authenticated user from Authorization header
    const tokenPayload = await verifyAuthToken(request);
    if (!tokenPayload) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    // Build user object from token payload
    // For Google login, name is in given_name/family_name; for email login, use cognito:username
    const firstName = tokenPayload.given_name || 
      tokenPayload.name?.split(' ')[0] || 
      tokenPayload.email?.split('@')[0] || 
      'there';
    const user = {
      sub: tokenPayload.sub,
      email: tokenPayload.email,
      name: tokenPayload.name || tokenPayload.given_name || tokenPayload["cognito:username"],
      firstName,
    };

    const { sessionId } = await request.json();
    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing session_id" },
        { status: 400 },
      );
    }

    // Retrieve Stripe checkout session
    const stripeClient = await getStripeClient();
    const checkoutSession = await stripeClient.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "customer"],
    });

    if (checkoutSession.payment_status !== "paid") {
      return NextResponse.json(
        { error: "Payment not completed" },
        { status: 400 },
      );
    }

    // Check if this session was already processed (idempotency)
    const existingCustomer = await getCustomerByEmail(user.email);
    if (existingCustomer?.stripeCustomerId === checkoutSession.customer?.id) {
      // Already processed, return existing license info
      return NextResponse.json({
        success: true,
        alreadyProvisioned: true,
        licenseKey:
          existingCustomer.licenseKeyPreview ||
          "Check your email for your license key",
        planName: existingCustomer.accountType,
      });
    }

    // Determine plan type from metadata (only individual and business exist)
    const planType = checkoutSession.metadata?.planType || "individual";
    const planName = planType === "business" ? "Business" : "Individual";

    // Create Keygen license
    const license = await createLicenseForPlan(planType, {
      name: user.name || user.email,
      email: user.email,
      metadata: {
        userId: user.sub,
        stripeCustomerId: checkoutSession.customer?.id,
        stripeSubscriptionId: checkoutSession.subscription?.id,
      },
    });

    // Store customer in DynamoDB
    await upsertCustomer({
      userId: user.sub,
      email: user.email,
      stripeCustomerId: checkoutSession.customer?.id,
      keygenLicenseId: license.id,
      accountType: planType,
      subscriptionStatus: "active",
      metadata: {
        name: user.name,
        stripeSubscriptionId: checkoutSession.subscription?.id,
        licenseKeyPreview: `${license.key.slice(0, 8)}...${license.key.slice(-4)}`,
      },
    });

    // Store license record
    // This DynamoDB write triggers:
    // DynamoDB Streams → StreamProcessor → SNS (plg-license-events) → EmailSender → SES
    await createLicense({
      keygenLicenseId: license.id,
      userId: user.sub,
      email: user.email, // Required for email notification
      licenseKey: license.key,
      policyId: planType,
      planName, // Human-readable plan name for email template
      status: "active",
      expiresAt: license.expiresAt,
      maxDevices:
        planType === "enterprise" ? 10 : planType === "individual" ? 3 : 2,
    });

    // Email is sent asynchronously via event-driven pipeline
    // (see StreamProcessor Lambda → SNS → EmailSender Lambda)

    return NextResponse.json({
      success: true,
      licenseKey: license.key,
      planName,
      userName: user.firstName,
    });
  } catch (error) {
    console.error("[API] Provision license error:", error);
    return NextResponse.json(
      { error: `Failed to provision license: ${error.message}` },
      { status: 500 },
    );
  }
}
