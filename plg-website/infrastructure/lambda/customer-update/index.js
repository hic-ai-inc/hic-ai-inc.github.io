/**
 * Customer Update Lambda
 *
 * Consumes messages from CustomerUpdate Queue and updates:
 * - Customer records in DynamoDB
 * - License status in Keygen
 * - Subscription records
 *
 * Triggered by: CustomerUpdate SQS Queue
 *
 * Layer Dependencies: hic-base-layer, hic-dynamodb-layer, hic-config-layer
 */
import {
  DynamoDBClient,
  DynamoDBDocumentClient,
  UpdateCommand,
  GetCommand,
  QueryCommand,
  PutCommand,
} from "hic-dynamodb-layer";
import { SecretsManagerClient, GetSecretValueCommand } from "hic-config-layer";
import { HicLog } from "hic-base-layer";

// ============================================================================
// Injectable Clients for Testing
// ============================================================================
let dynamoClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: process.env.AWS_REGION || "us-east-1",
    maxAttempts: 3,
  }),
);

let secretsClient = new SecretsManagerClient({
  region: process.env.AWS_REGION || "us-east-1",
  maxAttempts: 3,
});

export function __setDynamoClientForTests(client) {
  dynamoClient = client;
}
export function getDynamoClientInstance() {
  return dynamoClient;
}

export function __setSecretsClientForTests(client) {
  secretsClient = client;
}
export function getSecretsClientInstance() {
  return secretsClient;
}

// ============================================================================
// Configuration
// ============================================================================
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME;
const ENVIRONMENT = process.env.ENVIRONMENT;

// Maximum payment failures before license suspension
const MAX_PAYMENT_FAILURES = 3;

// ============================================================================
// Helper: Extract field value from DynamoDB record
// ============================================================================
function getField(image, field) {
  const value = image?.[field];
  if (!value) return undefined;
  return value.S || value.N || value.BOOL || value;
}

// ============================================================================
// Helper: Get customer by Stripe ID
// ============================================================================
async function getCustomerByStripeId(stripeCustomerId) {
  const result = await dynamoClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: {
        ":pk": `STRIPE#${stripeCustomerId}`,
      },
    }),
  );
  return result.Items?.[0];
}

// ============================================================================
// Helper: Get customer's licenses
// ============================================================================
async function getCustomerLicenses(userId) {
  const result = await dynamoClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": `USER#${userId}`,
        ":sk": "LICENSE#",
      },
    }),
  );
  return result.Items || [];
}

// ============================================================================
// Helper: Update license status
// ============================================================================
async function updateLicenseStatus(keygenLicenseId, status, metadata = {}) {
  const now = new Date().toISOString();
  const updateExpressions = ["#status = :status", "#updatedAt = :updatedAt"];
  const expressionValues = {
    ":status": status,
    ":updatedAt": now,
  };
  const expressionNames = {
    "#status": "status",
    "#updatedAt": "updatedAt",
  };

  Object.entries(metadata).forEach(([key, value]) => {
    updateExpressions.push(`#${key} = :${key}`);
    expressionValues[`:${key}`] = value;
    expressionNames[`#${key}`] = key;
  });

  await dynamoClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `LICENSE#${keygenLicenseId}`,
        SK: "DETAILS",
      },
      UpdateExpression: `SET ${updateExpressions.join(", ")}`,
      ExpressionAttributeValues: expressionValues,
      ExpressionAttributeNames: expressionNames,
    }),
  );
}

// ============================================================================
// Helper: Update customer subscription status
// ============================================================================
async function updateCustomerSubscription(userId, updates) {
  const now = new Date().toISOString();
  const updateExpressions = [];
  const expressionValues = { ":updatedAt": now };
  const expressionNames = { "#updatedAt": "updatedAt" };

  Object.entries(updates).forEach(([key, value]) => {
    updateExpressions.push(`#${key} = :${key}`);
    expressionValues[`:${key}`] = value;
    expressionNames[`#${key}`] = key;
  });

  updateExpressions.push("#updatedAt = :updatedAt");

  await dynamoClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: "PROFILE",
      },
      UpdateExpression: `SET ${updateExpressions.join(", ")}`,
      ExpressionAttributeValues: expressionValues,
      ExpressionAttributeNames: expressionNames,
    }),
  );
}

// ============================================================================
// Helper: Write event record for email trigger
// ============================================================================
async function writeEventRecord(eventType, data) {
  const now = new Date().toISOString();
  const eventId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  await dynamoClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `EVENT#${eventId}`,
        SK: "DETAILS",
        eventType,
        ...data,
        createdAt: now,
      },
    }),
  );
}

/**
 * Handle checkout.session.completed event
 * Customer and subscription creation handled by webhook directly
 * This handler syncs any denormalized data and confirms consistency
 */
async function handleCheckoutCompleted(event, log) {
  log.info("processing", { eventType: "checkout.session.completed" });

  const newImage = event.newImage;
  const stripeCustomerId = getField(newImage, "stripeCustomerId");
  const subscriptionId = getField(newImage, "subscriptionId");

  if (!stripeCustomerId) {
    log.warn("no-stripe-customer-id", { event: "checkout.session.completed" });
    return;
  }

  // Verify customer record exists
  const customer = await getCustomerByStripeId(stripeCustomerId);
  if (!customer) {
    log.warn("customer-not-found", { stripeCustomerId });
    return;
  }

  // Update customer with latest subscription info if provided
  if (subscriptionId) {
    await updateCustomerSubscription(customer.userId, {
      subscriptionId,
      subscriptionStatus: "active",
      checkoutCompletedAt: new Date().toISOString(),
    });
    log.info("customer-updated", { userId: customer.userId, subscriptionId });
  }
}

/**
 * Handle customer.subscription.updated event
 * Update subscription status, plan changes, billing cycle
 */
async function handleSubscriptionUpdated(event, log) {
  log.info("processing", { eventType: "customer.subscription.updated" });

  const newImage = event.newImage;
  const stripeCustomerId = getField(newImage, "stripeCustomerId");
  const subscriptionStatus = getField(newImage, "subscriptionStatus");
  const planId = getField(newImage, "planId");
  const currentPeriodEnd = getField(newImage, "currentPeriodEnd");
  const cancelAtPeriodEnd = getField(newImage, "cancelAtPeriodEnd");

  if (!stripeCustomerId) {
    log.warn("no-stripe-customer-id", { event: "subscription.updated" });
    return;
  }

  const customer = await getCustomerByStripeId(stripeCustomerId);
  if (!customer) {
    log.warn("customer-not-found", { stripeCustomerId });
    return;
  }

  // Build updates object
  const updates = { subscriptionUpdatedAt: new Date().toISOString() };

  if (subscriptionStatus) {
    updates.subscriptionStatus = subscriptionStatus;
  }
  if (planId) {
    updates.planId = planId;
  }
  if (currentPeriodEnd) {
    updates.currentPeriodEnd = currentPeriodEnd;
  }
  if (cancelAtPeriodEnd !== undefined) {
    updates.cancelAtPeriodEnd = cancelAtPeriodEnd === "true" || cancelAtPeriodEnd === true;
  }

  await updateCustomerSubscription(customer.userId, updates);

  // Update license status if subscription is no longer active
  if (subscriptionStatus && subscriptionStatus !== "active" && subscriptionStatus !== "trialing") {
    const licenses = await getCustomerLicenses(customer.userId);
    for (const license of licenses) {
      await updateLicenseStatus(license.keygenLicenseId, subscriptionStatus);
      log.info("license-status-updated", {
        licenseId: license.keygenLicenseId,
        status: subscriptionStatus,
      });
    }
  }

  log.info("subscription-updated", {
    userId: customer.userId,
    status: subscriptionStatus,
    planId,
  });
}

/**
 * Handle customer.subscription.deleted event
 * Mark license as canceled, update customer status, trigger cancellation email
 */
async function handleSubscriptionDeleted(event, log) {
  log.info("processing", { eventType: "customer.subscription.deleted" });

  const newImage = event.newImage;
  const stripeCustomerId = getField(newImage, "stripeCustomerId");
  const accessUntil = getField(newImage, "currentPeriodEnd");

  if (!stripeCustomerId) {
    log.warn("no-stripe-customer-id", { event: "subscription.deleted" });
    return;
  }

  const customer = await getCustomerByStripeId(stripeCustomerId);
  if (!customer) {
    log.warn("customer-not-found", { stripeCustomerId });
    return;
  }

  // Update customer record
  await updateCustomerSubscription(customer.userId, {
    subscriptionStatus: "canceled",
    canceledAt: new Date().toISOString(),
    accessUntil: accessUntil || new Date().toISOString(),
  });

  // Update all licenses to canceled
  const licenses = await getCustomerLicenses(customer.userId);
  for (const license of licenses) {
    await updateLicenseStatus(license.keygenLicenseId, "canceled", {
      eventType: "SUBSCRIPTION_CANCELLED",
      email: customer.email,
      accessUntil,
    });
    log.info("license-canceled", { licenseId: license.keygenLicenseId });
  }

  // Write event record to trigger cancellation email
  await writeEventRecord("SUBSCRIPTION_CANCELLED", {
    email: customer.email,
    userId: customer.userId,
    accessUntil,
  });

  log.info("subscription-deleted", { userId: customer.userId, accessUntil });
}

/**
 * Handle invoice.payment_succeeded event
 * Reactivate license if previously suspended, reset failure count
 */
async function handlePaymentSucceeded(event, log) {
  log.info("processing", { eventType: "invoice.payment_succeeded" });

  const newImage = event.newImage;
  const stripeCustomerId = getField(newImage, "stripeCustomerId");
  const invoiceId = getField(newImage, "invoiceId");

  if (!stripeCustomerId) {
    log.warn("no-stripe-customer-id", { event: "payment.succeeded" });
    return;
  }

  const customer = await getCustomerByStripeId(stripeCustomerId);
  if (!customer) {
    log.warn("customer-not-found", { stripeCustomerId });
    return;
  }

  // Check if customer was in a suspended state
  const wasSuspended = customer.subscriptionStatus === "past_due" ||
                       customer.paymentFailureCount > 0;

  // Update customer: reset failure count, set status to active
  await updateCustomerSubscription(customer.userId, {
    subscriptionStatus: "active",
    paymentFailureCount: 0,
    lastPaymentSuccessAt: new Date().toISOString(),
    lastInvoiceId: invoiceId,
  });

  // Reactivate licenses if previously suspended
  if (wasSuspended) {
    const licenses = await getCustomerLicenses(customer.userId);
    for (const license of licenses) {
      await updateLicenseStatus(license.keygenLicenseId, "active", {
        eventType: "SUBSCRIPTION_REACTIVATED",
        email: customer.email,
      });
      log.info("license-reactivated", { licenseId: license.keygenLicenseId });
    }

    // Write event record to trigger reactivation email
    await writeEventRecord("SUBSCRIPTION_REACTIVATED", {
      email: customer.email,
      userId: customer.userId,
    });
  }

  log.info("payment-succeeded", { userId: customer.userId, wasSuspended });
}

/**
 * Handle invoice.payment_failed event
 * Increment failure count, suspend license after max failures
 */
async function handlePaymentFailed(event, log) {
  log.info("processing", { eventType: "invoice.payment_failed" });

  const newImage = event.newImage;
  const stripeCustomerId = getField(newImage, "stripeCustomerId");
  const attemptCount = parseInt(getField(newImage, "attemptCount") || "1", 10);
  const nextRetryAt = getField(newImage, "nextRetryAt");

  if (!stripeCustomerId) {
    log.warn("no-stripe-customer-id", { event: "payment.failed" });
    return;
  }

  const customer = await getCustomerByStripeId(stripeCustomerId);
  if (!customer) {
    log.warn("customer-not-found", { stripeCustomerId });
    return;
  }

  const currentFailureCount = (customer.paymentFailureCount || 0) + 1;

  // Update customer with failure info
  await updateCustomerSubscription(customer.userId, {
    subscriptionStatus: "past_due",
    paymentFailureCount: currentFailureCount,
    lastPaymentFailedAt: new Date().toISOString(),
  });

  // Suspend license if max failures reached
  if (currentFailureCount >= MAX_PAYMENT_FAILURES) {
    const licenses = await getCustomerLicenses(customer.userId);
    for (const license of licenses) {
      await updateLicenseStatus(license.keygenLicenseId, "suspended", {
        suspendedAt: new Date().toISOString(),
        suspendReason: "payment_failed",
      });
      log.info("license-suspended", {
        licenseId: license.keygenLicenseId,
        reason: "payment_failed",
      });
    }
  }

  // Write event record to trigger payment failed email
  await writeEventRecord("PAYMENT_FAILED", {
    email: customer.email,
    userId: customer.userId,
    attemptCount: currentFailureCount,
    retryDate: nextRetryAt,
  });

  log.info("payment-failed", {
    userId: customer.userId,
    failureCount: currentFailureCount,
    suspended: currentFailureCount >= MAX_PAYMENT_FAILURES,
  });
}

/**
 * Event handlers map
 */
const EVENT_HANDLERS = {
  "checkout.session.completed": handleCheckoutCompleted,
  "customer.subscription.updated": handleSubscriptionUpdated,
  "customer.subscription.deleted": handleSubscriptionDeleted,
  "invoice.payment_succeeded": handlePaymentSucceeded,
  "invoice.payment_failed": handlePaymentFailed,
};

/**
 * Lambda handler
 * @param {Object} event - SQS event with customer update messages
 */
export const handler = async (event) => {
  const log = new HicLog("customer-update");
  log.info("start", { recordCount: event.Records.length });

  for (const record of event.Records) {
    const message = JSON.parse(record.body);
    const eventType = message.newImage?.eventType?.S;

    const handler = EVENT_HANDLERS[eventType];
    if (!handler) {
      log.info("no-handler", { eventType });
      continue;
    }

    try {
      await handler(message, log);
      log.info("processed", { eventType });
    } catch (error) {
      log.error("handler-failed", { eventType, error: error.message });
      throw error; // Will be retried or moved to DLQ
    }
  }

  log.info("complete", { processed: event.Records.length });
  return { processed: event.Records.length };
};
