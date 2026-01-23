/**
 * Welcome Complete Page
 *
 * Final step after Auth0 authentication. Links Stripe purchase
 * to Auth0 account and provisions Keygen license.
 *
 * @see User Journey and Guest Checkout v2
 */

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { createLicenseForPlan } from "@/lib/keygen";
import {
  upsertCustomer,
  createLicense,
  getCustomerByEmail,
} from "@/lib/dynamodb";
import { sendLicenseEmail } from "@/lib/ses";
import WelcomeCompleteClient from "./WelcomeCompleteClient";

export default async function WelcomeCompletePage({ searchParams }) {
  const params = await searchParams;
  const sessionId = params.session_id;

  if (!sessionId) {
    redirect("/pricing");
  }

  // Get authenticated user
  const session = await getSession();
  if (!session?.user) {
    // Not logged in, redirect to welcome page to start flow
    redirect(`/welcome?session_id=${sessionId}`);
  }

  try {
    // Retrieve Stripe checkout session
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "customer"],
    });

    if (checkoutSession.payment_status !== "paid") {
      return (
        <WelcomeCompleteClient
          error="Payment not completed. Please contact support."
          sessionId={sessionId}
        />
      );
    }

    // Check if this session was already processed
    const existingCustomer = await getCustomerByEmail(session.user.email);
    if (existingCustomer?.stripeCustomerId === checkoutSession.customer?.id) {
      // Already processed, show license
      return (
        <WelcomeCompleteClient
          success
          licenseKey={
            existingCustomer.licenseKeyPreview ||
            "Check your email for your license key"
          }
          planName={existingCustomer.accountType}
        />
      );
    }

    // Determine plan type from metadata or price
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
        auth0Id: session.user.sub,
        stripeCustomerId: checkoutSession.customer?.id,
        stripeSubscriptionId: checkoutSession.subscription?.id,
      },
    });

    // Store customer in DynamoDB
    await upsertCustomer({
      auth0Id: session.user.sub,
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
      auth0Id: session.user.sub,
      licenseKey: license.key,
      policyId: planType,
      status: "active",
      expiresAt: license.expiresAt,
      maxDevices:
        planType === "enterprise" ? 10 : planType === "individual" ? 3 : 2,
    });

    // Send license email
    await sendLicenseEmail(session.user.email, license.key, planName);

    return (
      <WelcomeCompleteClient
        success
        licenseKey={license.key}
        planName={planName}
        userName={session.user.name || session.user.email.split("@")[0]}
      />
    );
  } catch (error) {
    console.error("Welcome complete error:", error);
    return (
      <WelcomeCompleteClient
        error={`Failed to provision license: ${error.message}`}
        sessionId={sessionId}
      />
    );
  }
}
