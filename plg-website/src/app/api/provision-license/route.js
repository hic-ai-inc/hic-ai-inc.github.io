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
import { verifyAuthToken } from "@/lib/auth-verify";
import { getStripeClient } from "@/lib/stripe";
import { createLicenseForPlan } from "@/lib/keygen";
import {
  upsertCustomer,
  createLicense,
  getCustomerByEmail,
  getLicense,
  migrateCustomerUserId,
} from "@/lib/dynamodb";
// Cognito RBAC for Business plan owner role assignment
import { assignOwnerRole } from "@/lib/cognito-admin";
import { createApiLogger } from "@/lib/api-log";
// NOTE: Email is sent via event-driven architecture:
// DynamoDB write → DynamoDB Streams → StreamProcessor Lambda → SNS → EmailSender Lambda → SES
// Do NOT call sendLicenseEmail() directly here.

export async function POST(request) {
  const log = createApiLogger({
    service: "plg-api-provision-license",
    request,
    operation: "provision_license",
  });

  log.requestReceived();

  try {
    // Get authenticated user from Authorization header
    const tokenPayload = await verifyAuthToken();
    if (!tokenPayload) {
      log.decision("auth_failed", "Provision license rejected", {
        reason: "authentication_required",
      });
      log.response(401, "Provision license rejected", {
        reason: "authentication_required",
      });
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    // Build user object from token payload
    // For Google login, name is in given_name/family_name; for email login, use cognito:username
    // IMPORTANT: cognito:username is the Cognito Username needed for admin API calls
    // For federated users (Google), this is "google_XXXX" format, not the sub UUID
    const firstName =
      tokenPayload.given_name ||
      tokenPayload.name?.split(" ")[0] ||
      tokenPayload.email?.split("@")[0] ||
      "there";
    const user = {
      sub: tokenPayload.sub,
      username: tokenPayload["cognito:username"], // Cognito Username for admin API calls
      email: tokenPayload.email,
      name:
        tokenPayload.name ||
        tokenPayload.given_name ||
        tokenPayload["cognito:username"],
      firstName,
    };

    const { sessionId } = await request.json();
    if (!sessionId) {
      log.decision("session_id_missing", "Provision license rejected", {
        reason: "session_id_missing",
      });
      log.response(400, "Provision license rejected", {
        reason: "session_id_missing",
      });
      return NextResponse.json(
        { error: "Missing session_id" },
        { status: 400 },
      );
    }

    // Retrieve Stripe checkout session
    const stripeClient = await getStripeClient();
    const checkoutSession = await stripeClient.checkout.sessions.retrieve(
      sessionId,
      {
        expand: ["subscription", "customer"],
      },
    );

    if (checkoutSession.payment_status !== "paid") {
      log.decision("payment_not_completed", "Provision license rejected", {
        reason: "payment_not_completed",
        paymentStatus: checkoutSession.payment_status,
      });
      log.response(400, "Provision license rejected", {
        reason: "payment_not_completed",
      });
      return NextResponse.json(
        { error: "Payment not completed" },
        { status: 400 },
      );
    }

    // Check if this user already has a license (prevent duplicates)
    let existingCustomer = await getCustomerByEmail(user.email);
    if (existingCustomer?.keygenLicenseId) {
      log.decision("existing_license_found", "Existing license found for user", {
        hasExistingLicenseId: Boolean(existingCustomer.keygenLicenseId),
        hasExistingStripeCustomerId: Boolean(existingCustomer.stripeCustomerId),
        hasExistingUserId: Boolean(existingCustomer.userId),
      });

      // If the existing customer was created by webhook with temp userId (email:xxx),
      // migrate it to the real Cognito userId so dashboard lookups work
      if (existingCustomer.userId && existingCustomer.userId !== user.sub) {
        if (existingCustomer.userId.startsWith("email:")) {
          log.info(
            "customer_userid_migration_started",
            "Migrating customer userId from temp to Cognito",
            { hasTempUserId: true },
          );
          try {
            existingCustomer = await migrateCustomerUserId(
              existingCustomer.userId,
              user.sub,
            );
            log.info(
              "customer_userid_migration_succeeded",
              "Customer userId migrated successfully",
            );
          } catch (migrateError) {
            log.warn(
              "customer_userid_migration_failed",
              "Failed to migrate userId",
              { errorMessage: migrateError?.message },
            );
            // Continue anyway - they still have a valid license
          }
        }
      }

      // RBAC: Assign owner role for Business plan if user was created before signing up
      // The Stripe webhook skips this if userId was temporary (email:xxx format)
      // Now that we have the real Cognito sub, assign the owner role
      const existingPlanType =
        existingCustomer.accountType ||
        checkoutSession.metadata?.planType ||
        "individual";
      if (existingPlanType === "business") {
        try {
          await assignOwnerRole(user.username);
          log.info("owner_role_assigned", "Owner role assigned for Business plan", {
            planType: existingPlanType,
          });
        } catch (roleError) {
          // Non-fatal: Log but continue - user can still use the license
          log.warn(
            "owner_role_assignment_failed",
            "Could not assign owner role",
            { errorMessage: roleError?.message },
          );
        }
      }

      // Check if DynamoDB license record exists (needed for license email)
      // The webhook may have created the Keygen license but not the DynamoDB license record
      const existingLicenseRecord = await getLicense(
        existingCustomer.keygenLicenseId,
      );
      if (!existingLicenseRecord) {
        log.info(
          "license_record_missing",
          "Creating DynamoDB license record for email trigger",
          { reason: "missing_license_record" },
        );
        const planType =
          existingCustomer.accountType ||
          checkoutSession.metadata?.planType ||
          "individual";
        const planName = planType === "business" ? "Business" : "Individual";

        // Create DynamoDB license record to trigger LICENSE_CREATED email
        // Use full license key from customer record (webhook stores it as keygenLicenseKey)
        const fullKeyForRecord = existingCustomer.keygenLicenseKey;
        await createLicense({
          keygenLicenseId: existingCustomer.keygenLicenseId,
          userId: user.sub,
          email: user.email,
          licenseKey: fullKeyForRecord || "License key will be sent by email",
          policyId: planType,
          planName,
          status: "active",
          expiresAt: null, // Subscription-based, no fixed expiry
          maxDevices: planType === "business" ? 5 : 3,
        });
        log.info(
          "license_record_created",
          "DynamoDB license record created for existing customer",
        );
      }

      // Get the full license key for display
      // Priority: license record has full key > customer record has full key > check email fallback
      const fullLicenseKey =
        existingLicenseRecord?.licenseKey || existingCustomer.keygenLicenseKey;

      // If this is from the same Stripe checkout, it's a refresh - just return the info
      // If it's a different Stripe checkout, they already have a license (shouldn't happen due to checkout guard)
      log.response(200, "Provision license returned existing license", {
        alreadyProvisioned: true,
      });
      return NextResponse.json({
        success: true,
        alreadyProvisioned: true,
        licenseKey: fullLicenseKey || "Check your email for your license key",
        planName:
          existingCustomer.accountType === "business"
            ? "Business"
            : "Individual",
        userName: user.firstName,
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

    log.info("keygen_license_created", "Keygen license created", {
      planType,
      licenseId: license.id,
    });

    // Store customer in DynamoDB
    await upsertCustomer({
      userId: user.sub,
      email: user.email,
      stripeCustomerId: checkoutSession.customer?.id,
      keygenLicenseId: license.id,
      keygenLicenseKey: license.key,
      accountType: planType,
      subscriptionStatus: "active",
      metadata: {
        name: user.name,
        stripeSubscriptionId: checkoutSession.subscription?.id,
        licenseKeyPreview: `${license.key.slice(0, 8)}...${license.key.slice(-4)}`,
      },
    });

    log.info("customer_record_upserted", "Customer record upserted", {
      planType,
      hasStripeCustomerId: Boolean(checkoutSession.customer?.id),
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
      maxDevices: planType === "business" ? 5 : 3,
    });

    log.info("license_record_created", "License record created", {
      planType,
      licenseId: license.id,
    });

    // RBAC: Assign owner role for new Business plan purchases
    // This user signed up first then purchased, so we can assign immediately
    if (planType === "business") {
      try {
        await assignOwnerRole(user.username);
        log.info("owner_role_assigned", "Owner role assigned for new Business plan", {
          planType,
        });
      } catch (roleError) {
        // Non-fatal: Log but continue - user has license, role can be fixed later
        log.warn("owner_role_assignment_failed", "Could not assign owner role", {
          errorMessage: roleError?.message,
        });
      }
    }

    // Email is sent asynchronously via event-driven pipeline
    // (see StreamProcessor Lambda → SNS → EmailSender Lambda)

    log.response(200, "Provision license completed", {
      success: true,
      alreadyProvisioned: false,
      planType,
    });
    return NextResponse.json({
      success: true,
      licenseKey: license.key,
      planName,
      userName: user.firstName,
    });
  } catch (error) {
    log.exception(error, "provision_license_failed", "Provision license failed");
    log.response(500, "Provision license failed", { reason: "unhandled_error" });
    return NextResponse.json(
      { error: `Failed to provision license: ${error.message}` },
      { status: 500 },
    );
  }
}
