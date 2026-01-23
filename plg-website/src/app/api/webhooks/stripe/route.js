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
import { headers } from "next/headers";
import { stripe } from "@/lib/stripe";
import {
  getCustomerByStripeId,
  upsertCustomer,
  updateCustomerSubscription,
  getLicense,
  updateLicenseStatus,
} from "@/lib/dynamodb";
import { suspendLicense, reinstateLicense } from "@/lib/keygen";
import {
  sendWelcomeEmail,
  sendPaymentFailedEmail,
  sendReactivationEmail,
  sendCancellationEmail,
  sendDisputeAlert,
} from "@/lib/ses";

export async function POST(request) {
  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 },
    );
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;

      case "customer.subscription.created":
        await handleSubscriptionCreated(event.data.object);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object);
        break;

      case "invoice.payment_succeeded":
        await handlePaymentSucceeded(event.data.object);
        break;

      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object);
        break;

      case "charge.dispute.created":
        await handleDisputeCreated(event.data.object);
        break;

      case "charge.dispute.closed":
        await handleDisputeClosed(event.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`Webhook handler error for ${event.type}:`, error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 },
    );
  }
}

/**
 * Handle successful checkout session
 * Creates pending license record, sends welcome email
 */
async function handleCheckoutCompleted(session) {
  console.log("Checkout completed:", session.id);

  const { customer, customer_email, metadata, subscription } = session;

  // Extract plan details from metadata
  const plan = metadata?.planType || "individual";
  const seats = parseInt(metadata?.seats || "1", 10);

  // Check if this customer already exists (returning customer)
  const existingCustomer = await getCustomerByStripeId(customer);

  if (!existingCustomer) {
    // New customer - send welcome email with account creation link
    // License will be provisioned when they complete account setup
    await sendWelcomeEmail(customer_email, session.id);
    console.log(`Welcome email sent to ${customer_email}`);
  } else {
    // Existing customer - update their subscription info
    await updateCustomerSubscription(existingCustomer.auth0Id, {
      subscriptionStatus: "active",
      stripeSubscriptionId: subscription,
      accountType: plan,
      seats,
    });
    console.log(`Updated existing customer ${existingCustomer.auth0Id}`);
  }

  console.log(
    `New subscription: ${plan} plan with ${seats} seats for ${customer_email}`,
  );
}

/**
 * Handle new subscription created
 */
async function handleSubscriptionCreated(subscription) {
  console.log("Subscription created:", subscription.id);

  // TODO: Update license status in Keygen if needed
}

/**
 * Handle subscription updates (plan changes, renewals)
 */
async function handleSubscriptionUpdated(subscription) {
  console.log("Subscription updated:", subscription.id);

  const { status, cancel_at_period_end, customer } = subscription;

  // Find customer by Stripe ID
  const dbCustomer = await getCustomerByStripeId(customer);
  if (!dbCustomer) {
    console.log("Customer not found for subscription update");
    return;
  }

  // Map Stripe status to our status
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

  // Update customer subscription status
  await updateCustomerSubscription(dbCustomer.auth0Id, {
    subscriptionStatus: newStatus,
    cancelAtPeriodEnd: cancel_at_period_end,
  });

  // Update license status in DynamoDB
  if (dbCustomer.keygenLicenseId) {
    await updateLicenseStatus(dbCustomer.keygenLicenseId, newStatus);

    // Handle Keygen license status
    if (status === "unpaid" || status === "canceled") {
      try {
        await suspendLicense(dbCustomer.keygenLicenseId);
      } catch (e) {
        console.error("Failed to suspend Keygen license:", e);
      }
    } else if (
      status === "active" &&
      dbCustomer.subscriptionStatus === "suspended"
    ) {
      try {
        await reinstateLicense(dbCustomer.keygenLicenseId);
      } catch (e) {
        console.error("Failed to reinstate Keygen license:", e);
      }
    }
  }

  // Send cancellation confirmation email when user cancels (A.9.1)
  if (cancel_at_period_end && dbCustomer.email) {
    const cancelAt = subscription.cancel_at
      ? new Date(subscription.cancel_at * 1000).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : "the end of your billing period";
    try {
      await sendCancellationEmail(dbCustomer.email, cancelAt);
      console.log(`Cancellation confirmation sent to ${dbCustomer.email}`);
    } catch (e) {
      console.error("Failed to send cancellation email:", e);
    }
  }
}

/**
 * Handle subscription cancellation
 */
async function handleSubscriptionDeleted(subscription) {
  console.log("Subscription deleted:", subscription.id);

  const { customer } = subscription;

  // Find customer by Stripe ID
  const dbCustomer = await getCustomerByStripeId(customer);
  if (!dbCustomer) {
    console.log("Customer not found for subscription deletion");
    return;
  }

  // Update customer status
  await updateCustomerSubscription(dbCustomer.auth0Id, {
    subscriptionStatus: "canceled",
  });

  // Suspend license in Keygen
  if (dbCustomer.keygenLicenseId) {
    await updateLicenseStatus(dbCustomer.keygenLicenseId, "canceled");
    try {
      await suspendLicense(dbCustomer.keygenLicenseId);
    } catch (e) {
      console.error("Failed to suspend Keygen license:", e);
    }
  }

  console.log(`Subscription canceled for customer ${dbCustomer.auth0Id}`);
}

/**
 * Handle successful payment
 */
async function handlePaymentSucceeded(invoice) {
  console.log("Payment succeeded:", invoice.id);

  const { customer, lines } = invoice;

  // Find customer by Stripe ID
  const dbCustomer = await getCustomerByStripeId(customer);
  if (!dbCustomer) {
    console.log("Customer not found for payment success");
    return;
  }

  // Get subscription period end from line items
  const periodEnd = lines.data[0]?.period?.end;
  const expiresAt = periodEnd ? new Date(periodEnd * 1000).toISOString() : null;

  // Update license with new expiry
  if (dbCustomer.keygenLicenseId && expiresAt) {
    await updateLicenseStatus(dbCustomer.keygenLicenseId, "active", {
      expiresAt,
    });
  }

  // If was past_due, restore to active and send reactivation email (A.2)
  if (dbCustomer.subscriptionStatus === "past_due") {
    await updateCustomerSubscription(dbCustomer.auth0Id, {
      subscriptionStatus: "active",
    });

    // Reinstate Keygen license
    if (dbCustomer.keygenLicenseId) {
      try {
        await reinstateLicense(dbCustomer.keygenLicenseId);
      } catch (e) {
        console.error("Failed to reinstate Keygen license:", e);
      }
    }

    // Send reactivation confirmation email
    if (dbCustomer.email) {
      try {
        await sendReactivationEmail(dbCustomer.email);
        console.log(`Reactivation email sent to ${dbCustomer.email}`);
      } catch (e) {
        console.error("Failed to send reactivation email:", e);
      }
    }
  }

  console.log(`Payment succeeded for customer ${dbCustomer.auth0Id}`);
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(invoice) {
  console.log("Payment failed:", invoice.id);

  const { customer_email, attempt_count, customer, next_payment_attempt } =
    invoice;

  // Find customer by Stripe ID
  const dbCustomer = await getCustomerByStripeId(customer);
  if (!dbCustomer) {
    console.log("Customer not found for payment failure");
    return;
  }

  // Update customer status
  await updateCustomerSubscription(dbCustomer.auth0Id, {
    subscriptionStatus: "past_due",
    paymentFailedCount: attempt_count,
  });

  // Update license status
  if (dbCustomer.keygenLicenseId) {
    await updateLicenseStatus(dbCustomer.keygenLicenseId, "past_due");
  }

  // Calculate retry date
  const retryDate = next_payment_attempt
    ? new Date(next_payment_attempt * 1000).toLocaleDateString()
    : null;

  // Send payment failure email
  await sendPaymentFailedEmail(customer_email, attempt_count, retryDate);

  // After 3 attempts, suspend license
  if (attempt_count >= 3) {
    console.log("Max payment attempts reached, suspending license");

    await updateCustomerSubscription(dbCustomer.auth0Id, {
      subscriptionStatus: "suspended",
    });

    if (dbCustomer.keygenLicenseId) {
      await updateLicenseStatus(dbCustomer.keygenLicenseId, "suspended");
      try {
        await suspendLicense(dbCustomer.keygenLicenseId);
      } catch (e) {
        console.error("Failed to suspend Keygen license:", e);
      }
    }
  }
}


/**
 * Handle dispute created (chargeback) - Addendum A.6.2
 *
 * When a dispute is created:
 * 1. Immediately suspend the license
 * 2. Update customer status to DISPUTED
 * 3. Alert support team for evidence gathering
 */
async function handleDisputeCreated(dispute) {
  console.log("Dispute created:", dispute.id);

  const { customer, amount, reason, id: disputeId } = dispute;

  // Find customer by Stripe ID
  const dbCustomer = await getCustomerByStripeId(customer);
  if (!dbCustomer) {
    console.log("Customer not found for dispute");
    // Still alert support even if customer not found
    await sendDisputeAlert("unknown", amount, reason, disputeId);
    return;
  }

  // Immediately suspend access
  if (dbCustomer.keygenLicenseId) {
    await updateLicenseStatus(dbCustomer.keygenLicenseId, "disputed");
    try {
      await suspendLicense(dbCustomer.keygenLicenseId);
    } catch (e) {
      console.error("Failed to suspend Keygen license:", e);
    }
  }

  // Update customer status to disputed
  await updateCustomerSubscription(dbCustomer.auth0Id, {
    subscriptionStatus: "disputed",
  });

  // Alert support team
  await sendDisputeAlert(dbCustomer.email || "unknown", amount, reason, disputeId);

  console.log(`License suspended for disputed customer ${dbCustomer.auth0Id}`);
}

/**
 * Handle dispute closed - Addendum A.6.2
 *
 * When a dispute is resolved:
 * - If won: reinstate license (customer was legitimate)
 * - If lost: keep license suspended (fraud confirmed)
 * - If withdrawn: reinstate license
 */
async function handleDisputeClosed(dispute) {
  console.log("Dispute closed:", dispute.id, "Status:", dispute.status);

  const { customer, status } = dispute;

  // Find customer by Stripe ID
  const dbCustomer = await getCustomerByStripeId(customer);
  if (!dbCustomer) {
    console.log("Customer not found for dispute closure");
    return;
  }

  // Dispute outcomes:
  // - won: We won, reinstate
  // - lost: We lost, keep suspended
  // - withdrawn: Customer withdrew, reinstate
  // - warning_closed: Handled as inquiry, reinstate
  const reinstateStatuses = ["won", "withdrawn", "warning_closed"];

  if (reinstateStatuses.includes(status)) {
    // Reinstate license
    if (dbCustomer.keygenLicenseId) {
      await updateLicenseStatus(dbCustomer.keygenLicenseId, "active");
      try {
        await reinstateLicense(dbCustomer.keygenLicenseId);
      } catch (e) {
        console.error("Failed to reinstate Keygen license:", e);
      }
    }

    await updateCustomerSubscription(dbCustomer.auth0Id, {
      subscriptionStatus: "active",
    });

    console.log(`Dispute ${status}: License reinstated for ${dbCustomer.auth0Id}`);
  } else {
    // Lost dispute - keep suspended, mark as fraud
    await updateCustomerSubscription(dbCustomer.auth0Id, {
      subscriptionStatus: "suspended",
      fraudulent: true,
    });

    console.log(`Dispute lost: License remains suspended for ${dbCustomer.auth0Id}`);
  }
}

