/**
 * License Provisioning API
 *
 * Called after successful Stripe checkout to:
 * 1. Verify Stripe session is paid
 * 2. Create Keygen license
 * 3. Store customer/license in DynamoDB
 * 4. Send license email
 *
 * Requires authenticated user (Cognito token).
 *
 * @see PLG User Journey - License Provisioning
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { createLicenseForPlan } from "@/lib/keygen";
import {
  upsertCustomer,
  createLicense,
  getCustomerByEmail,
} from "@/lib/dynamodb";
import { sendLicenseEmail } from "@/lib/ses";

export async function POST(request) {
  try {
    // Get authenticated user from request
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const { sessionId } = await request.json();
    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing session_id" },
        { status: 400 },
      );
    }

    // Retrieve Stripe checkout session
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "customer"],
    });

    if (checkoutSession.payment_status !== "paid") {
      return NextResponse.json(
        { error: "Payment not completed" },
        { status: 400 },
      );
    }

    // Check if this session was already processed (idempotency)
    const existingCustomer = await getCustomerByEmail(session.user.email);
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

    // Determine plan type from metadata
    const planType = checkoutSession.metadata?.planType || "individual";
    const planName =
      planType === "individual"
        ? "Individual"
        : planType === "enterprise"
          ? "Enterprise"
          : "Open Source";

    // Create Keygen license
    const license = await createLicenseForPlan(planType, {
      name: session.user.name || session.user.email,
      email: session.user.email,
      metadata: {
        userId: session.user.sub,
        stripeCustomerId: checkoutSession.customer?.id,
        stripeSubscriptionId: checkoutSession.subscription?.id,
      },
    });

    // Store customer in DynamoDB
    await upsertCustomer({
      userId: session.user.sub,
      email: session.user.email,
      stripeCustomerId: checkoutSession.customer?.id,
      keygenLicenseId: license.id,
      accountType: planType,
      subscriptionStatus: "active",
      metadata: {
        name: session.user.name,
        stripeSubscriptionId: checkoutSession.subscription?.id,
        licenseKeyPreview: `${license.key.slice(0, 8)}...${license.key.slice(-4)}`,
      },
    });

    // Store license record
    await createLicense({
      keygenLicenseId: license.id,
      userId: session.user.sub,
      licenseKey: license.key,
      policyId: planType,
      status: "active",
      expiresAt: license.expiresAt,
      maxDevices:
        planType === "enterprise" ? 10 : planType === "individual" ? 3 : 2,
    });

    // Send license email
    await sendLicenseEmail(session.user.email, license.key, planName);

    return NextResponse.json({
      success: true,
      licenseKey: license.key,
      planName,
      userName: session.user.name || session.user.email.split("@")[0],
    });
  } catch (error) {
    console.error("[API] Provision license error:", error);
    return NextResponse.json(
      { error: `Failed to provision license: ${error.message}` },
      { status: 500 },
    );
  }
}
