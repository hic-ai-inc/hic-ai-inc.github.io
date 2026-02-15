/**
 * Stripe Webhook Handler
 *
 * Processes Stripe webhook events for subscription lifecycle.
 * - checkout.session.completed: New subscription created
 * - customer.subscription.updated: Plan changes, renewals
 * - customer.subscription.deleted: Cancellation
 * - invoice.payment_failed: Payment failures
 *
 * @see PLG Technical Specification v2 - Section 3.2
 * @see Security Considerations for Stripe Payments
 */

import { NextResponse } from "next/server";
import { getStripeClient, getWebhookSecret } from "@/lib/stripe";
import {
  getCustomerByStripeId,
  getCustomerByEmail,
  upsertCustomer,
  updateCustomerSubscription,
  getLicense,
  updateLicenseStatus,
  createLicense as createDynamoDBLicense,
  upsertOrganization,
  updateOrgSeatLimit,
  getOrganizationByStripeCustomer,
  addOrgMember,
} from "@/lib/dynamodb";
import {
  suspendLicense,
  reinstateLicense,
  createLicense,
  getPolicyId,
} from "@/lib/keygen";
// NOTE: Most emails are now sent via event-driven architecture:
// DynamoDB write (with eventType) → DynamoDB Streams → StreamProcessor → SNS → EmailSender → SES
// Only sendDisputeAlert is called directly (urgent security notification)
import { sendDisputeAlert } from "@/lib/ses";
// Cognito admin operations for RBAC group assignment
import { assignOwnerRole } from "@/lib/cognito-admin";
import { createApiLogger } from "@/lib/api-log";

export async function POST(request) {
  const log = createApiLogger({
    service: "plg-api-webhooks-stripe",
    request,
    operation: "webhook_stripe",
  });

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  log.requestReceived({ hasSignature: Boolean(signature) });

  if (!signature) {
    log.decision("signature_missing", "Stripe webhook rejected", {
      reason: "signature_missing",
    });
    log.response(400, "Stripe webhook rejected", { reason: "signature_missing" });
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 },
    );
  }

  let event;

  try {
    const stripe = await getStripeClient();
    const webhookSecret = getWebhookSecret();

    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    log.warn("signature_verification_failed", "Stripe webhook signature verification failed", {
      errorMessage: err?.message,
    });
    log.response(400, "Stripe webhook rejected", { reason: "invalid_signature" });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object, log);
        break;

      case "customer.subscription.created":
        await handleSubscriptionCreated(event.data.object, log);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object, log);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object, log);
        break;

      case "invoice.payment_succeeded":
        await handlePaymentSucceeded(event.data.object, log);
        break;

      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object, log);
        break;

      case "charge.dispute.created":
        await handleDisputeCreated(event.data.object, log);
        break;

      case "charge.dispute.closed":
        await handleDisputeClosed(event.data.object, log);
        break;

      default:
        log.info("event_unhandled", "Unhandled Stripe webhook event type", {
          eventType: event.type,
        });
    }

    log.response(200, "Stripe webhook processed", { eventType: event.type });
    return NextResponse.json({ received: true });
  } catch (error) {
    log.exception(
      error,
      "stripe_webhook_handler_failed",
      "Stripe webhook handler failed",
      { eventType: event?.type || null },
    );
    log.response(500, "Stripe webhook handler failed", {
      reason: "handler_error",
      eventType: event?.type || null,
    });
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 },
    );
  }
}

/**
 * Handle successful checkout session
 * Creates KeyGen license, upserts customer record, sends welcome email
 */
async function handleCheckoutCompleted(session, log) {
  log.info("checkout_completed", "Checkout completed webhook received", {
    sessionId: session.id,
  });

  const { customer, customer_email, metadata, subscription } = session;

  const plan = metadata?.plan || metadata?.planType || "individual";
  const seats = parseInt(metadata?.seats || "1", 10);

  const planType = plan === "business" ? "business" : "individual";
  const policyId = await getPolicyId(planType);

  const existingByStripeId = await getCustomerByStripeId(customer);
  const existingByEmail = await getCustomerByEmail(customer_email);
  const existingCustomer = existingByStripeId || existingByEmail;

  if (existingCustomer?.keygenLicenseId) {
    log.decision("existing_license_found", "Skipping duplicate license creation", {
      hasExistingLicenseId: Boolean(existingCustomer.keygenLicenseId),
    });
    return;
  }

  let licenseKey = null;
  let licenseId = null;

  if (policyId) {
    try {
      const license = await createLicense({
        policyId,
        name: `License for ${customer_email}`,
        email: customer_email,
        metadata: {
          email: customer_email.toLowerCase(),
          stripeCustomerId: customer,
          stripeSubscriptionId: subscription,
          plan,
          seats: String(seats),
        },
      });
      licenseKey = license.key;
      licenseId = license.id;
      log.info("keygen_license_created", "Keygen license created", {
        licenseId,
        plan,
      });
    } catch (error) {
      log.warn("keygen_license_create_failed", "Failed to create Keygen license", {
        errorMessage: error?.message,
      });
    }
  }

  if (!existingCustomer) {
    const tempUserId = `email:${customer_email.toLowerCase()}`;

    await upsertCustomer({
      userId: tempUserId,
      email: customer_email,
      stripeCustomerId: customer,
      keygenLicenseId: licenseId,
      keygenLicenseKey: licenseKey,
      accountType: plan,
      subscriptionStatus: "active",
      metadata: {
        stripeSubscriptionId: subscription,
        seats,
        createdFromCheckout: session.id,
        eventType: "CUSTOMER_CREATED",
        sessionId: session.id,
      },
    });
    log.info("customer_record_created", "New customer record created", {
      plan,
      seats,
    });

    if (licenseId && licenseKey) {
      try {
        const planName = plan === "business" ? "Business" : "Individual";
        await createDynamoDBLicense({
          keygenLicenseId: licenseId,
          userId: tempUserId,
          licenseKey,
          policyId,
          status: "active",
          expiresAt: null,
          maxDevices: plan === "business" ? 5 : 3,
          email: customer_email,
          planName,
          metadata: {
            stripeCustomerId: customer,
            stripeSubscriptionId: subscription,
          },
        });
        log.info("license_record_created", "LICENSE# record created", {
          licenseId,
          isExistingCustomer: false,
        });
      } catch (error) {
        log.warn("license_record_create_failed", "Failed to create LICENSE# record", {
          errorMessage: error?.message,
          isExistingCustomer: false,
        });
      }
    }

    log.info("welcome_email_pipeline_triggered", "Welcome email will be sent via event pipeline");
  } else {
    await updateCustomerSubscription(existingCustomer.userId, {
      subscriptionStatus: "active",
      stripeCustomerId: customer,
      stripeSubscriptionId: subscription,
      keygenLicenseId: licenseId || existingCustomer.keygenLicenseId,
      keygenLicenseKey: licenseKey || existingCustomer.keygenLicenseKey,
      accountType: plan,
      seats,
    });
    log.info("customer_subscription_updated", "Updated existing customer subscription", {
      hasLicenseId: Boolean(licenseId || existingCustomer.keygenLicenseId),
      plan,
      seats,
    });

    if (licenseId && licenseKey && !existingCustomer.keygenLicenseId) {
      try {
        const planName = plan === "business" ? "Business" : "Individual";
        await createDynamoDBLicense({
          keygenLicenseId: licenseId,
          userId: existingCustomer.userId,
          licenseKey,
          policyId,
          status: "active",
          expiresAt: null,
          maxDevices: plan === "business" ? 5 : 3,
          email: customer_email,
          planName,
          metadata: {
            stripeCustomerId: customer,
            stripeSubscriptionId: subscription,
          },
        });
        log.info("license_record_created", "LICENSE# record created for existing customer", {
          licenseId,
          isExistingCustomer: true,
        });
      } catch (error) {
        log.warn(
          "license_record_create_failed",
          "Failed to create LICENSE# record for existing customer",
          {
            errorMessage: error?.message,
            isExistingCustomer: true,
          },
        );
      }
    }
  }

  log.info("subscription_created", "Processed new subscription from checkout", {
    plan,
    seats,
  });

  if (plan === "business") {
    const cognitoUserId = existingCustomer?.userId || null;

    if (cognitoUserId && !cognitoUserId.startsWith("email:")) {
      try {
        await assignOwnerRole(cognitoUserId);
        log.info("owner_role_assigned", "Owner role assigned for Business plan", {
          hasCognitoUserId: true,
        });
      } catch (error) {
        log.warn("owner_role_assign_failed", "Could not assign owner role", {
          errorMessage: error?.message,
          hasCognitoUserId: true,
        });
      }
    } else {
      log.info("owner_role_deferred", "Owner role will be assigned on first Cognito login", {
        hasCognitoUserId: false,
      });
    }

    try {
      const ownerId = existingCustomer?.userId || `email:${customer_email.toLowerCase()}`;

      await upsertOrganization({
        orgId: customer,
        name: `${customer_email.split("@")[0]}'s Organization`,
        seatLimit: seats,
        ownerId,
        ownerEmail: customer_email,
        stripeCustomerId: customer,
        stripeSubscriptionId: subscription,
      });
      log.info("organization_created", "Organization created for business subscription", {
        seatLimit: seats,
      });

      await addOrgMember({
        orgId: customer,
        userId: ownerId,
        email: customer_email,
        name: customer_email.split("@")[0],
        role: "owner",
      });
      log.info("organization_owner_added", "Owner added as organization member");

      await updateCustomerSubscription(ownerId, {
        orgId: customer,
        orgRole: "owner",
      });
      log.info("organization_owner_linked", "Owner linked to organization in customer record");
    } catch (error) {
      log.warn("organization_create_failed", "Failed to create or link organization", {
        errorMessage: error?.message,
      });
    }
  }
}

/**
 * Handle new subscription created
 * Note: License is already created by handleCheckoutCompleted.
 * Status updates are handled by handleSubscriptionUpdated/Deleted.
 */
async function handleSubscriptionCreated(subscription, log) {
  log.info("subscription_created_event", "Subscription created event received", {
    subscriptionId: subscription.id,
  });
}

/**
 * Handle subscription updates (plan changes, renewals, seat count changes)
 */
async function handleSubscriptionUpdated(subscription, log) {
  log.info("subscription_updated", "Subscription updated event received", {
    subscriptionId: subscription.id,
  });

  const { status, cancel_at_period_end, customer, items } = subscription;
  const seatQuantity = items?.data?.[0]?.quantity || 1;

  const dbCustomer = await getCustomerByStripeId(customer);
  if (!dbCustomer) {
    log.decision("customer_not_found", "Customer not found for subscription update", {
      reason: "customer_not_found",
    });
    return;
  }

  const statusMap = {
    active: "active",
    past_due: "past_due",
    canceled: "canceled",
    unpaid: "suspended",
    incomplete: "pending",
    incomplete_expired: "expired",
    trialing: "trialing",
    paused: "paused",
  };

  const newStatus = statusMap[status] || status;

  const subscriptionUpdate = {
    subscriptionStatus: newStatus,
    cancelAtPeriodEnd: cancel_at_period_end,
  };

  if (cancel_at_period_end) {
    const cancelAt = subscription.cancel_at
      ? new Date(subscription.cancel_at * 1000).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : "the end of your billing period";
    subscriptionUpdate.eventType = "SUBSCRIPTION_CANCELLED";
    subscriptionUpdate.email = dbCustomer.email;
    subscriptionUpdate.accessUntil = cancelAt;
  }

  await updateCustomerSubscription(dbCustomer.userId, subscriptionUpdate);

  if (dbCustomer.keygenLicenseId) {
    await updateLicenseStatus(dbCustomer.keygenLicenseId, newStatus);

    if (status === "unpaid" || status === "canceled") {
      try {
        await suspendLicense(dbCustomer.keygenLicenseId);
      } catch (e) {
        log.warn("license_suspend_failed", "Failed to suspend Keygen license", {
          errorMessage: e?.message,
        });
      }
    } else if (
      status === "active" &&
      dbCustomer.subscriptionStatus === "suspended"
    ) {
      try {
        await reinstateLicense(dbCustomer.keygenLicenseId);
      } catch (e) {
        log.warn("license_reinstate_failed", "Failed to reinstate Keygen license", {
          errorMessage: e?.message,
        });
      }
    }
  }

  if (cancel_at_period_end) {
    log.info("cancellation_email_pipeline_triggered", "Cancellation email will be sent via event pipeline");
  }

  if (seatQuantity > 0) {
    try {
      const org = await getOrganizationByStripeCustomer(customer);
      if (org && org.seatLimit !== seatQuantity) {
        await updateOrgSeatLimit(customer, seatQuantity);
        log.info("organization_seat_limit_synced", "Organization seat limit synced", {
          previousSeatLimit: org.seatLimit,
          newSeatLimit: seatQuantity,
        });
      }
    } catch (error) {
      log.warn("organization_seat_sync_failed", "Failed to sync organization seat limit", {
        errorMessage: error?.message,
      });
    }
  }
}

/**
 * Handle subscription cancellation
 */
async function handleSubscriptionDeleted(subscription, log) {
  log.info("subscription_deleted", "Subscription deleted event received", {
    subscriptionId: subscription.id,
  });

  const { customer } = subscription;

  const dbCustomer = await getCustomerByStripeId(customer);
  if (!dbCustomer) {
    log.decision("customer_not_found", "Customer not found for subscription deletion", {
      reason: "customer_not_found",
    });
    return;
  }

  const cancelAt = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  await updateCustomerSubscription(dbCustomer.userId, {
    subscriptionStatus: "canceled",
    eventType: "SUBSCRIPTION_CANCELLED",
    email: dbCustomer.email,
    accessUntil: cancelAt,
  });

  if (dbCustomer.keygenLicenseId) {
    await updateLicenseStatus(dbCustomer.keygenLicenseId, "canceled");
    try {
      await suspendLicense(dbCustomer.keygenLicenseId);
    } catch (e) {
      log.warn("license_suspend_failed", "Failed to suspend Keygen license", {
        errorMessage: e?.message,
      });
    }
  }

  log.info("subscription_cancellation_processed", "Subscription cancellation processed", {
    hasLicenseId: Boolean(dbCustomer.keygenLicenseId),
  });
}

/**
 * Handle successful payment
 */
async function handlePaymentSucceeded(invoice, log) {
  log.info("payment_succeeded", "Payment succeeded event received", {
    invoiceId: invoice.id,
  });

  const { customer, lines } = invoice;

  const dbCustomer = await getCustomerByStripeId(customer);
  if (!dbCustomer) {
    log.decision("customer_not_found", "Customer not found for payment success", {
      reason: "customer_not_found",
    });
    return;
  }

  const periodEnd = lines.data[0]?.period?.end;
  const expiresAt = periodEnd ? new Date(periodEnd * 1000).toISOString() : null;

  if (dbCustomer.keygenLicenseId && expiresAt) {
    await updateLicenseStatus(dbCustomer.keygenLicenseId, "active", {
      expiresAt,
    });
  }

  if (dbCustomer.subscriptionStatus === "past_due") {
    await updateCustomerSubscription(dbCustomer.userId, {
      subscriptionStatus: "active",
      eventType: "SUBSCRIPTION_REACTIVATED",
      email: dbCustomer.email,
    });

    if (dbCustomer.keygenLicenseId) {
      try {
        await reinstateLicense(dbCustomer.keygenLicenseId);
      } catch (e) {
        log.warn("license_reinstate_failed", "Failed to reinstate Keygen license", {
          errorMessage: e?.message,
        });
      }
    }

    log.info("reactivation_email_pipeline_triggered", "Reactivation email will be sent via event pipeline");
  }

  log.info("payment_success_processed", "Payment success processed", {
    hasLicenseId: Boolean(dbCustomer.keygenLicenseId),
  });
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(invoice, log) {
  log.info("payment_failed", "Payment failed event received", {
    invoiceId: invoice.id,
  });

  const { customer_email, attempt_count, customer, next_payment_attempt } =
    invoice;

  const dbCustomer = await getCustomerByStripeId(customer);
  if (!dbCustomer) {
    log.decision("customer_not_found", "Customer not found for payment failure", {
      reason: "customer_not_found",
    });
    return;
  }

  const retryDate = next_payment_attempt
    ? new Date(next_payment_attempt * 1000).toLocaleDateString()
    : null;

  await updateCustomerSubscription(dbCustomer.userId, {
    subscriptionStatus: "past_due",
    paymentFailedCount: attempt_count,
    eventType: "PAYMENT_FAILED",
    email: customer_email,
    attemptCount: attempt_count,
    retryDate,
  });

  if (dbCustomer.keygenLicenseId) {
    await updateLicenseStatus(dbCustomer.keygenLicenseId, "past_due");
  }

  log.info("payment_failure_email_pipeline_triggered", "Payment failure email will be sent via event pipeline", {
    attemptCount: attempt_count,
  });

  if (attempt_count >= 3) {
    log.decision("max_payment_attempts_reached", "Max payment attempts reached, suspending license", {
      attemptCount: attempt_count,
    });

    await updateCustomerSubscription(dbCustomer.userId, {
      subscriptionStatus: "suspended",
    });

    if (dbCustomer.keygenLicenseId) {
      await updateLicenseStatus(dbCustomer.keygenLicenseId, "suspended");
      try {
        await suspendLicense(dbCustomer.keygenLicenseId);
      } catch (e) {
        log.warn("license_suspend_failed", "Failed to suspend Keygen license", {
          errorMessage: e?.message,
        });
      }
    }
  }
}

/**
 * Handle dispute created (chargeback) - Addendum A.6.2
 */
async function handleDisputeCreated(dispute, log) {
  log.info("dispute_created", "Dispute created event received", {
    disputeId: dispute.id,
  });

  const { customer, amount, reason, id: disputeId } = dispute;

  const dbCustomer = await getCustomerByStripeId(customer);
  if (!dbCustomer) {
    log.decision("customer_not_found", "Customer not found for dispute", {
      reason: "customer_not_found",
    });
    await sendDisputeAlert("unknown", amount, reason, disputeId);
    return;
  }

  if (dbCustomer.keygenLicenseId) {
    await updateLicenseStatus(dbCustomer.keygenLicenseId, "disputed");
    try {
      await suspendLicense(dbCustomer.keygenLicenseId);
    } catch (e) {
      log.warn("license_suspend_failed", "Failed to suspend Keygen license", {
        errorMessage: e?.message,
      });
    }
  }

  await updateCustomerSubscription(dbCustomer.userId, {
    subscriptionStatus: "disputed",
  });

  await sendDisputeAlert(
    dbCustomer.email || "unknown",
    amount,
    reason,
    disputeId,
  );

  log.info("dispute_handled", "License suspended for disputed customer", {
    hasLicenseId: Boolean(dbCustomer.keygenLicenseId),
  });
}

/**
 * Handle dispute closed - Addendum A.6.2
 */
async function handleDisputeClosed(dispute, log) {
  log.info("dispute_closed", "Dispute closed event received", {
    disputeId: dispute.id,
    disputeStatus: dispute.status,
  });

  const { customer, status } = dispute;

  const dbCustomer = await getCustomerByStripeId(customer);
  if (!dbCustomer) {
    log.decision("customer_not_found", "Customer not found for dispute closure", {
      reason: "customer_not_found",
    });
    return;
  }

  const reinstateStatuses = ["won", "withdrawn", "warning_closed"];

  if (reinstateStatuses.includes(status)) {
    if (dbCustomer.keygenLicenseId) {
      await updateLicenseStatus(dbCustomer.keygenLicenseId, "active");
      try {
        await reinstateLicense(dbCustomer.keygenLicenseId);
      } catch (e) {
        log.warn("license_reinstate_failed", "Failed to reinstate Keygen license", {
          errorMessage: e?.message,
        });
      }
    }

    await updateCustomerSubscription(dbCustomer.userId, {
      subscriptionStatus: "active",
    });

    log.info("dispute_reinstated", "License reinstated after dispute resolution", {
      disputeStatus: status,
    });
  } else {
    await updateCustomerSubscription(dbCustomer.userId, {
      subscriptionStatus: "suspended",
      fraudulent: true,
    });

    log.info("dispute_lost_suspended", "License remains suspended after lost dispute", {
      disputeStatus: status,
    });
  }
}
