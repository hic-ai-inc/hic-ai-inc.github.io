/**
 * Email Sender Lambda
 *
 * Consumes messages from Email Queue and sends emails via SES.
 * Determines which email template to use based on eventType field
 * in DynamoDB records.
 *
 * Triggered by: Email SQS Queue (subscribed to all SNS topics)
 * Sends via: AWS SES
 *
 * Event Flow:
 *   DynamoDB write (with eventType) → Stream → StreamProcessor → SNS → SQS → This Lambda → SES
 *
 * Layer Dependencies: hic-base-layer, hic-ses-layer, hic-dynamodb-layer
 */
import {
  SESClient,
  SendEmailCommand,
  GetIdentityVerificationAttributesCommand,
  createTemplates,
  EVENT_TYPE_TO_TEMPLATE,
} from "hic-ses-layer";
import {
  DynamoDBClient,
  DynamoDBDocumentClient,
  UpdateCommand,
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
const FROM_EMAIL = process.env.SES_FROM_EMAIL || "noreply@hic-ai.com";
const ENVIRONMENT = process.env.ENVIRONMENT || "staging";
const APP_URL = process.env.APP_URL || `https://${ENVIRONMENT === "prod" ? "" : ENVIRONMENT + "."}hic-ai.com`;
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME;

// Initialize templates from hic-ses-layer (single source of truth)
const templates = createTemplates({
  appUrl: APP_URL,
  companyName: "HIC AI",
  productName: "Mouse",
});

// Use centralized event-to-template mapping from hic-ses-layer
const EMAIL_ACTIONS = EVENT_TYPE_TO_TEMPLATE;


// ============================================================================
// Helper: Extract field value from DynamoDB record
// ============================================================================
function getField(image, field) {
  const value = image?.[field];
  if (!value) return undefined;
  // Handle DynamoDB types: S (string), N (number), etc.
  return value.S || value.N || value.BOOL || value;
}

// ============================================================================
// Lambda Handler
// ============================================================================
export const handler = async (event) => {
  const log = new HicLog("email-sender");
  log.info("start", { recordCount: event.Records.length });

  const results = [];
  const batchItemFailures = [];

  for (const record of event.Records) {
    try {
      // Parse SNS → SQS message
      const message = JSON.parse(record.body);
      const newImage = message.newImage;
      const eventName = message.eventName; // INSERT, MODIFY, REMOVE

      // Only process INSERT events for most email types
      // (MODIFY events handled for status changes)
      const eventType = getField(newImage, "eventType");

      if (!eventType) {
        log.debug("no-event-type", { keys: message.keys });
        continue;
      }

      const emailAction = EMAIL_ACTIONS[eventType];
      if (!emailAction) {
        log.debug("no-email-action", { eventType });
        continue;
      }

      // Guard 1: Skip MODIFY/REMOVE events for initial-creation email types
      // Our DDB update (clearing emailPendingVerification) triggers a MODIFY stream
      // event which would re-enter this pipeline and send duplicate emails
      if (eventName !== "INSERT" && eventType === "CUSTOMER_CREATED") {
        log.debug("skip-non-insert", { eventName, eventType });
        continue;
      }

      // Guard 2: Check emailsSent map — if this eventType was already sent, skip
      // Belt-and-suspenders dedup: newImage is in DynamoDB JSON format (M/S types)
      const emailsSentMap = newImage?.emailsSent?.M;
      if (emailsSentMap?.[eventType]) {
        log.debug("already-sent", { eventType });
        continue;
      }

      // Get email address from the record
      const email = getField(newImage, "email");
      if (!email) {
        log.warn("no-email-in-record", { eventType, keys: message.keys });
        continue;
      }

      // Build template data from record
      const templateData = {
        email,
        licenseKey: getField(newImage, "licenseKey"),
        planName: getField(newImage, "planName"),
        sessionId: getField(newImage, "sessionId"),
        accessUntil: getField(newImage, "accessUntil"),
        attemptCount: getField(newImage, "attemptCount"),
        retryDate: getField(newImage, "retryDate"),
        organizationName: getField(newImage, "organizationName"),
        inviterName: getField(newImage, "inviterName"),
        inviteToken: getField(newImage, "token"),
        daysRemaining: getField(newImage, "daysRemaining"),
      };

      // Get email template
      const template = templates[emailAction];
      if (!template) {
        log.error("template-not-found", { emailAction });
        continue;
      }

      const emailContent = template(templateData);

      // Check if email is verified in SES (required for sandbox mode, good practice in production)
      const maskedEmail = email.replace(/(.{2}).*@/, "$1***@");
      try {
        const verificationResult = await sesClient.send(
          new GetIdentityVerificationAttributesCommand({
            Identities: [email],
          }),
        );
        const verificationStatus =
          verificationResult.VerificationAttributes?.[email]?.VerificationStatus;

        if (verificationStatus !== "Success") {
          log.warn("email-not-verified", {
            emailAction,
            email: maskedEmail,
            status: verificationStatus || "NotFound",
          });
          results.push({
            success: false,
            skipped: true,
            reason: "email-not-verified",
            email,
            status: verificationStatus || "NotFound",
          });
          continue;
        }
      } catch (verificationError) {
        // If we can't check verification status, log warning but continue
        // This allows graceful degradation if SES API is temporarily unavailable
        log.warn("verification-check-failed", {
          email: maskedEmail,
          error: verificationError.message,
        });
        // Continue to try sending - SES will reject if not verified
      }

      // Send email via SES
      await sesClient.send(
        new SendEmailCommand({
          Source: FROM_EMAIL,
          Destination: { ToAddresses: [email] },
          Message: {
            Subject: { Data: emailContent.subject },
            Body: {
              Html: { Data: emailContent.html },
              Text: { Data: emailContent.text },
            },
          },
        }),
      );

      log.info("email-sent", { emailAction, email: email.replace(/(.{2}).*@/, "$1***@") });

      // Clear emailPendingVerification flag to prevent duplicate sends from scheduled retry
      // Extract userId from PK (format: USER#<userId> or EVENT#<eventId>)
      const pk = getField(newImage, "PK");
      const userId = getField(newImage, "userId");
      if (TABLE_NAME && userId) {
        try {
          await dynamoClient.send(
            new UpdateCommand({
              TableName: TABLE_NAME,
              Key: { PK: `USER#${userId}`, SK: "PROFILE" },
              UpdateExpression: "SET emailPendingVerification = :false, #emailsSent.#eventType = :timestamp",
              ExpressionAttributeNames: {
                "#emailsSent": "emailsSent",
                "#eventType": eventType,
              },
              ExpressionAttributeValues: {
                ":false": false,
                ":timestamp": new Date().toISOString(),
              },
            }),
          );
          log.info("cleared-pending-flag", { userId, eventType });
        } catch (updateError) {
          // Non-fatal - worst case is a duplicate email attempt from scheduled retry
          log.warn("failed-to-clear-pending-flag", { userId, error: updateError.message });
        }
      }

      results.push({ success: true, emailAction, email });
    } catch (error) {
      log.error("email-failed", { error: error.message, record: record.messageId });
      batchItemFailures.push({ itemIdentifier: record.messageId });
      results.push({ success: false, error: error.message });
      // Don't throw - continue processing other records
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const skippedCount = results.filter((r) => r.skipped).length;
  const failCount = results.filter((r) => !r.success && !r.skipped).length;

  log.info("complete", {
    processed: results.length,
    success: successCount,
    skipped: skippedCount,
    failed: failCount,
  });

  // Partial batch response for SQS: only the messageIds listed below are retried/redriven.
  return {
    processed: results.length,
    success: successCount,
    skipped: skippedCount,
    failed: failCount,
    batchItemFailures,
  };
};
