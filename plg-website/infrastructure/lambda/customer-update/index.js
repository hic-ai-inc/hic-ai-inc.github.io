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

/**
 * Handle checkout.session.completed event
 * Customer and subscription creation handled by webhook directly
 * This handler updates any denormalized data
 */
async function handleCheckoutCompleted(event, log) {
  log.info("processing", { eventType: "checkout.session.completed" });
  // TODO: Update denormalized data if needed
}

/**
 * Handle customer.subscription.updated event
 * Update subscription status, plan changes
 */
async function handleSubscriptionUpdated(event, log) {
  log.info("processing", { eventType: "customer.subscription.updated" });
  // TODO: Implement subscription update logic
}

/**
 * Handle customer.subscription.deleted event
 * Mark license as canceled, update customer status
 */
async function handleSubscriptionDeleted(event, log) {
  log.info("processing", { eventType: "customer.subscription.deleted" });
  // TODO: Implement cancellation logic
}

/**
 * Handle invoice.payment_succeeded event
 * Reactivate license if previously suspended
 */
async function handlePaymentSucceeded(event, log) {
  log.info("processing", { eventType: "invoice.payment_succeeded" });
  // TODO: Implement payment success logic
}

/**
 * Handle invoice.payment_failed event
 * Increment failure count, potentially suspend license
 */
async function handlePaymentFailed(event, log) {
  log.info("processing", { eventType: "invoice.payment_failed" });
  // TODO: Implement payment failure logic
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
