/**
 * Email Sender Lambda
 *
 * Consumes messages from Email Queue and sends emails via SES.
 * Determines which email template to use based on event type.
 *
 * Triggered by: Email SQS Queue
 * Sends via: AWS SES
 *
 * Layer Dependencies: hic-base-layer, hic-dynamodb-layer, hic-ses-layer
 */
import { SESClient, SendEmailCommand } from "hic-ses-layer";
import {
  DynamoDBClient,
  DynamoDBDocumentClient,
  GetCommand,
} from "hic-dynamodb-layer";
import { HicLog } from "hic-base-layer";

// ============================================================================
// Injectable Clients for Testing
// ============================================================================
let sesClient = new SESClient({
  region: process.env.AWS_REGION || "us-east-1",
  maxAttempts: 3,
});

let dynamoClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: process.env.AWS_REGION || "us-east-1",
    maxAttempts: 3,
  }),
);

export function __setSesClientForTests(client) {
  sesClient = client;
}
export function getSesClientInstance() {
  return sesClient;
}

export function __setDynamoClientForTests(client) {
  dynamoClient = client;
}
export function getDynamoClientInstance() {
  return dynamoClient;
}

// ============================================================================
// Configuration
// ============================================================================
const FROM_EMAIL = process.env.SES_FROM_EMAIL;
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME;

/**
 * Map event types to email actions
 * null = no email should be sent for this event
 */
const EMAIL_TRIGGERS = {
  "checkout.session.completed": "welcome",
  "customer.subscription.created": "licenseDelivery",
  "invoice.payment_failed": "paymentFailed",
  "customer.subscription.deleted": "cancellation",
  "license.validation.succeeded": null, // No email
};

/**
 * Get customer email from DynamoDB
 * @param {string} customerId - Customer ID
 * @returns {string|undefined} - Customer email address
 */
async function getCustomerEmail(customerId) {
  const result = await dynamoClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `CUSTOMER#${customerId}`, SK: "PROFILE" },
    }),
  );
  return result.Item?.email;
}

/**
 * Lambda handler
 * @param {Object} event - SQS event with email messages
 */
export const handler = async (event) => {
  const log = new HicLog("email-sender");
  log.info("start", { recordCount: event.Records.length });

  for (const record of event.Records) {
    const message = JSON.parse(record.body);
    const eventType = message.newImage?.eventType?.S;

    const emailAction = EMAIL_TRIGGERS[eventType];
    if (!emailAction) {
      log.info("no-email-action", { eventType });
      continue;
    }

    // Get customer email from DynamoDB
    const customerId = message.newImage?.customerId?.S;
    if (!customerId) {
      log.warn("no-customer-id", { eventType });
      continue;
    }

    const email = await getCustomerEmail(customerId);
    if (!email) {
      log.warn("no-email-found", { customerId });
      continue;
    }

    // TODO: Implement actual email templates
    // For now, log what we would send
    log.info("would-send-email", { emailAction, email, customerId });

    // Placeholder email send
    // await sesClient.send(new SendEmailCommand({
    //   Source: FROM_EMAIL,
    //   Destination: { ToAddresses: [email] },
    //   Message: {
    //     Subject: { Data: `PLG Event: ${emailAction}` },
    //     Body: { Text: { Data: JSON.stringify(message, null, 2) } },
    //   },
    // }));
  }

  log.info("complete", { processed: event.Records.length });
  return { processed: event.Records.length };
};
