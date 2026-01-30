/**
 * Test License Provisioning API (Staging Only)
 *
 * Creates a real Keygen license and DynamoDB records for testing without payment.
 * This allows E2E testing of:
 * - Email delivery (LICENSE_CREATED triggers email-sender via DynamoDB Streams)
 * - Admin Portal display (customer + license records in DynamoDB)
 * - VS Code extension activation (real Keygen license key)
 *
 * SECURITY: Only enabled in staging environment.
 *
 * Usage:
 *   POST /api/admin/provision-test-license
 *   Headers: x-admin-key: <admin secret>
 *   Body: { email, planType?, userName? }
 *
 * @see PLG User Journey - License Provisioning (test mode)
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createLicenseForPlan } from "@/lib/keygen";
import { upsertCustomer, createLicense, getCustomerByEmail } from "@/lib/dynamodb";
import { getAppSecrets } from "@/lib/secrets";
import crypto from "crypto";

// Only allow in staging (check multiple env var patterns)
const IS_STAGING =
  process.env.ENVIRONMENT === "staging" ||
  process.env.NEXT_PUBLIC_APP_ENV === "staging" ||
  process.env.NEXT_PUBLIC_APP_URL?.includes("staging") ||
  process.env.NODE_ENV === "development";

/**
 * Verify admin key from x-admin-key header
 * Fetches expected key from Secrets Manager at runtime
 */
async function verifyAdminKey() {
  const headersList = await headers();
  const adminKey = headersList.get("x-admin-key");

  if (!adminKey) {
    return false;
  }

  try {
    const { TEST_ADMIN_KEY } = await getAppSecrets();
    if (!TEST_ADMIN_KEY) {
      console.warn("[TestLicense] TEST_ADMIN_KEY not configured in Secrets Manager");
      return false;
    }
    return adminKey === TEST_ADMIN_KEY;
  } catch (error) {
    console.error("[TestLicense] Failed to verify admin key:", error.message);
    return false;
  }
}

export async function POST(request) {
  // Environment check
  if (!IS_STAGING) {
    return NextResponse.json(
      { error: "This endpoint is only available in staging" },
      { status: 403 },
    );
  }

  // Admin key verification
  const isAdmin = await verifyAdminKey();
  if (!isAdmin) {
    return NextResponse.json(
      { error: "Invalid or missing admin key" },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();
    const { email, planType = "individual", userName } = body;

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Validate plan type
    const validPlans = ["individual", "enterprise", "open_source"];
    if (!validPlans.includes(planType)) {
      return NextResponse.json(
        { error: `Invalid planType. Must be one of: ${validPlans.join(", ")}` },
        { status: 400 },
      );
    }

    // Check for existing customer by email to avoid duplicates
    const existingCustomer = await getCustomerByEmail(email);
    
    // Use existing IDs if customer exists, otherwise generate new ones
    const testUserId = existingCustomer?.userId || `test-user-${crypto.randomBytes(8).toString("hex")}`;
    const testStripeCustomerId = existingCustomer?.stripeCustomerId || `cus_test_${crypto.randomBytes(12).toString("hex")}`;
    const testStripeSubscriptionId = existingCustomer?.stripeSubscriptionId || `sub_test_${crypto.randomBytes(12).toString("hex")}`;

    if (existingCustomer) {
      console.log(`[TestLicense] Found existing customer for ${email}: ${existingCustomer.userId}`);
    }

    // Human-readable plan name
    const planName =
      planType === "individual"
        ? "Individual"
        : planType === "enterprise"
          ? "Enterprise"
          : "Open Source";

    console.log(
      `[TestLicense] Creating test license for ${email} (${planType})`,
    );

    // Create REAL Keygen license
    const license = await createLicenseForPlan(planType, {
      name: userName || email.split("@")[0],
      email,
      metadata: {
        userId: testUserId,
        stripeCustomerId: testStripeCustomerId,
        stripeSubscriptionId: testStripeSubscriptionId,
        testMode: true,
        provisionedAt: new Date().toISOString(),
      },
    });

    console.log(`[TestLicense] Keygen license created: ${license.id}`);

    // Store customer in DynamoDB (for Admin Portal)
    await upsertCustomer({
      userId: testUserId,
      email,
      stripeCustomerId: testStripeCustomerId,
      keygenLicenseId: license.id,
      accountType: planType,
      subscriptionStatus: "active",
      metadata: {
        name: userName || email.split("@")[0],
        stripeSubscriptionId: testStripeSubscriptionId,
        licenseKeyPreview: `${license.key.slice(0, 8)}...${license.key.slice(-4)}`,
        testMode: true,
      },
    });

    console.log(`[TestLicense] Customer record created in DynamoDB`);

    // Store license record (triggers email via DynamoDB Streams)
    // This write triggers:
    // DynamoDB Streams → StreamProcessor → SNS (plg-license-events) → EmailSender → SES
    await createLicense({
      keygenLicenseId: license.id,
      userId: testUserId,
      email, // Required for email notification
      licenseKey: license.key,
      policyId: planType,
      planName, // Human-readable plan name for email template
      status: "active",
      expiresAt: license.expiresAt,
      maxDevices:
        planType === "enterprise" ? 10 : planType === "individual" ? 3 : 2,
      metadata: {
        testMode: true,
      },
    });

    console.log(
      `[TestLicense] License record created - email should trigger via DynamoDB Streams`,
    );

    return NextResponse.json({
      success: true,
      message: "Test license provisioned successfully",
      license: {
        id: license.id,
        key: license.key, // Full key returned for testing
        planType,
        planName,
        expiresAt: license.expiresAt,
      },
      customer: {
        userId: testUserId,
        email,
        stripeCustomerId: testStripeCustomerId,
      },
      notes: [
        "This is a REAL Keygen license - use it in VS Code to test activation",
        "Email should be sent via DynamoDB Streams → email-sender Lambda",
        "Customer and license records are in DynamoDB for Admin Portal testing",
        "All records are marked with testMode: true for identification",
      ],
    });
  } catch (error) {
    console.error("[TestLicense] Error:", error);
    return NextResponse.json(
      { error: `Failed to provision test license: ${error.message}` },
      { status: 500 },
    );
  }
}

/**
 * GET - Endpoint documentation
 */
export async function GET() {
  if (!IS_STAGING) {
    return NextResponse.json(
      { error: "This endpoint is only available in staging" },
      { status: 403 },
    );
  }

  return NextResponse.json({
    endpoint: "POST /api/admin/provision-test-license",
    description:
      "Creates a real Keygen license and DynamoDB records for E2E testing without payment",
    headers: {
      "x-admin-key": "Required. Admin secret key from TEST_ADMIN_KEY env var",
      "Content-Type": "application/json",
    },
    body: {
      email: "Required. Email address for license delivery",
      planType:
        "Optional. One of: individual (default), enterprise, open_source",
      userName: "Optional. Display name for the user",
    },
    example: {
      email: "test@example.com",
      planType: "individual",
      userName: "Test User",
    },
    effects: [
      "Creates REAL Keygen license (not mocked)",
      "Writes customer record to DynamoDB",
      "Writes license record to DynamoDB (triggers email via Streams)",
      "Returns full license key for VS Code testing",
    ],
  });
}
