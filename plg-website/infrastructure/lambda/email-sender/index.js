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
 * Layer Dependencies: hic-base-layer, hic-ses-layer
 */
import {
  SESClient,
  SendEmailCommand,
  GetIdentityVerificationAttributesCommand,
  createTemplates,
  EVENT_TYPE_TO_TEMPLATE,
} from "hic-ses-layer";
import { HicLog } from "hic-base-layer";

// ============================================================================
// Injectable Client for Testing
// ============================================================================
let sesClient = new SESClient({
  region: process.env.AWS_REGION || "us-east-1",
  maxAttempts: 3,
});

export function __setSesClientForTests(client) {
  sesClient = client;
}
export function getSesClientInstance() {
  return sesClient;
}

// ============================================================================
// Configuration
// ============================================================================
const FROM_EMAIL = process.env.SES_FROM_EMAIL || "noreply@hic-ai.com";
const APP_URL = process.env.APP_URL || "https://mouse.hic-ai.com";

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
      results.push({ success: true, emailAction, email });
    } catch (error) {
      log.error("email-failed", { error: error.message, record: record.messageId });
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

  // If all emails had actual errors (not just skipped for verification), throw to trigger SQS retry
  // Skipped emails (unverified) should not trigger retry - retrying won't help
  if (failCount > 0 && successCount === 0) {
    throw new Error(`All ${failCount} emails failed to send`);
  }

  return { processed: results.length, success: successCount, skipped: skippedCount, failed: failCount };
};
