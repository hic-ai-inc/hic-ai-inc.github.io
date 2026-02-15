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
import { createApiLogger } from "@/lib/api-log";
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
async function verifyAdminKey(log) {
  const headersList = await headers();
  const adminKey = headersList.get("x-admin-key");

  if (!adminKey) {
    return false;
  }

  try {
    const { TEST_ADMIN_KEY } = await getAppSecrets();
    if (!TEST_ADMIN_KEY) {
      log.warn(
        "test_admin_key_missing",
        "TEST_ADMIN_KEY not configured in Secrets Manager",
      );
      return false;
    }
    return adminKey === TEST_ADMIN_KEY;
  } catch (error) {
    log.error(
      "admin_key_verification_failed",
      "Failed to verify admin key",
      error,
      { errorMessage: error?.message },
    );
    return false;
  }
}

export async function POST(request) {
  const log = createApiLogger({
    service: "plg-api-admin-provision-test",
    request,
    operation: "admin_provision_test",
  });

  log.requestReceived();

  // Environment check
  if (!IS_STAGING) {
    log.decision("environment_restricted", "Test license provisioning rejected", {
      reason: "non_staging_environment",
    });
    log.response(403, "Test license provisioning rejected", {
      reason: "non_staging_environment",
    });
    return NextResponse.json(
      { error: "This endpoint is only available in staging" },
      { status: 403 },
    );
  }

  // Admin key verification
  const isAdmin = await verifyAdminKey(log);
  if (!isAdmin) {
    log.decision("admin_auth_failed", "Test license provisioning rejected", {
      reason: "invalid_or_missing_admin_key",
    });
    log.response(401, "Test license provisioning rejected", {
      reason: "invalid_or_missing_admin_key",
    });
    return NextResponse.json(
      { error: "Invalid or missing admin key" },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();
    const { email, planType = "individual", userName } = body;

    if (!email) {
      log.decision("email_missing", "Test license provisioning rejected", {
        reason: "email_required",
      });
      log.response(400, "Test license provisioning rejected", {
        reason: "email_required",
      });
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Validate plan type
    const validPlans = ["individual", "business"];
    if (!validPlans.includes(planType)) {
      log.decision("invalid_plan_type", "Test license provisioning rejected", {
        reason: "invalid_plan_type",
        planType,
      });
      log.response(400, "Test license provisioning rejected", {
        reason: "invalid_plan_type",
      });
      return NextResponse.json(
        { error: `Invalid planType. Must be one of: ${validPlans.join(", ")}` },
        { status: 400 },
      );
    }

    // Check for existing customer by email to avoid duplicates
    const existingCustomer = await getCustomerByEmail(email);

    // If user already has a license, return it instead of creating a new one
    if (existingCustomer?.keygenLicenseId) {
      log.decision("existing_license_found", "Returning existing test license", {
        hasLicenseId: Boolean(existingCustomer.keygenLicenseId),
        hasUserId: Boolean(existingCustomer.userId),
        accountType: existingCustomer.accountType || "individual",
      });
      log.response(200, "Returned existing test license", {
        alreadyExists: true,
      });
      return NextResponse.json({
        success: true,
        alreadyExists: true,
        message: "User already has a license",
        licenseId: existingCustomer.keygenLicenseId,
        licenseKeyPreview:
          existingCustomer.metadata?.licenseKeyPreview || "Already provisioned",
        planName:
          existingCustomer.accountType === "business" ? "Business" : "Individual",
        userId: existingCustomer.userId,
      });
    }

    // Generate new IDs for new customer
    const testUserId = `test-user-${crypto.randomBytes(8).toString("hex")}`;
    const testStripeCustomerId = `cus_test_${crypto.randomBytes(12).toString("hex")}`;
    const testStripeSubscriptionId = `sub_test_${crypto.randomBytes(12).toString("hex")}`;

    // Human-readable plan name (only individual and business exist)
    const planName = planType === "business" ? "Business" : "Individual";

    log.info("test_provision_started", "Creating test license", {
      planType,
      hasUserName: Boolean(userName),
    });

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

    log.info("keygen_license_created", "Keygen license created for test provisioning", {
      licenseId: license.id,
      planType,
    });

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

    log.info("customer_record_created", "Customer record created in DynamoDB", {
      planType,
      hasStripeCustomerId: true,
    });

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
      maxDevices: planType === "business" ? 5 : 3,
      metadata: {
        testMode: true,
      },
    });

    log.info("license_record_created", "License record created for test provisioning", {
      licenseId: license.id,
      planType,
    });

    log.response(200, "Test license provisioned successfully", {
      success: true,
      planType,
    });
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
    log.exception(
      error,
      "test_license_provision_failed",
      "Test license provisioning failed",
    );
    log.response(500, "Test license provisioning failed", {
      reason: "unhandled_error",
    });
    return NextResponse.json(
      { error: `Failed to provision test license: ${error.message}` },
      { status: 500 },
    );
  }
}

/**
 * GET - Endpoint documentation
 */
export async function GET(request) {
  const log = createApiLogger({
    service: "plg-api-admin-provision-test",
    request,
    operation: "admin_provision_test_check",
  });

  log.requestReceived();

  if (!IS_STAGING) {
    log.decision("environment_restricted", "Provision test endpoint rejected", {
      reason: "non_staging_environment",
    });
    log.response(403, "Provision test endpoint rejected", {
      reason: "non_staging_environment",
    });
    return NextResponse.json(
      { error: "This endpoint is only available in staging" },
      { status: 403 },
    );
  }

  log.response(200, "Provision test endpoint documentation returned", {
    success: true,
  });
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
      planType: "Optional. One of: individual (default), business",
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
