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
import { SESClient, SendEmailCommand } from "hic-ses-layer";
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
const COMPANY_NAME = "HIC AI";
const PRODUCT_NAME = "Mouse";

// ============================================================================
// Event Type to Email Action Mapping
// ============================================================================
const EMAIL_ACTIONS = {
  // License events
  LICENSE_CREATED: "licenseDelivery",
  LICENSE_REVOKED: "licenseRevoked",
  LICENSE_SUSPENDED: "licenseSuspended",

  // Customer/Payment events
  CUSTOMER_CREATED: "welcome",
  SUBSCRIPTION_CANCELLED: "cancellation",
  SUBSCRIPTION_REACTIVATED: "reactivation",
  PAYMENT_FAILED: "paymentFailed",

  // Trial events
  TRIAL_ENDING: "trialEnding",
};

// ============================================================================
// Email Templates
// ============================================================================
const templates = {
  licenseDelivery: ({ email, licenseKey, planName }) => ({
    subject: `Your ${PRODUCT_NAME} License Key`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0B1220; color: #F6F8FB; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto;">
    <h1 style="color: #F6F8FB; margin-bottom: 24px;">Your ${PRODUCT_NAME} License Key 🔑</h1>
    <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
      Your ${planName || "subscription"} is now active! Here's your license key:
    </p>
    <div style="background-color: #1A2332; border-radius: 8px; padding: 20px; margin: 24px 0; text-align: center;">
      <code style="font-size: 18px; color: #C9DBF0; word-break: break-all;">${licenseKey}</code>
    </div>
    <h3 style="color: #F6F8FB; margin-top: 32px;">Activate in VS Code:</h3>
    <ol style="color: #B8C4D0; font-size: 14px; line-height: 1.8;">
      <li>Open VS Code Settings (Cmd/Ctrl + ,)</li>
      <li>Search for <code style="color: #C9DBF0;">mouse.licenseKey</code></li>
      <li>Paste your license key and reload VS Code</li>
    </ol>
    <div style="margin: 32px 0;">
      <a href="${APP_URL}/portal" style="display: inline-block; background-color: #C9DBF0; color: #0B1220; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
        Go to Portal
      </a>
    </div>
    <hr style="border: none; border-top: 1px solid rgba(201, 219, 240, 0.2); margin: 32px 0;">
    <p style="color: #6B7C93; font-size: 12px;">${COMPANY_NAME} • Precision Editing Tools for AI Coding Agents</p>
  </div>
</body>
</html>`,
    text: `Your ${PRODUCT_NAME} License Key
\nYour ${planName || "subscription"} is now active!
\nLicense Key: ${licenseKey}
\nTo activate:\n1. Open VS Code Settings\n2. Search for mouse.licenseKey\n3. Paste your license key
\nPortal: ${APP_URL}/portal
\n${COMPANY_NAME}`,
  }),

  welcome: ({ email, sessionId }) => ({
    subject: `Welcome to ${PRODUCT_NAME}!`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0B1220; color: #F6F8FB; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto;">
    <h1 style="color: #F6F8FB; margin-bottom: 24px;">Welcome to ${PRODUCT_NAME}! 🎉</h1>
    <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
      Thank you for your purchase! Your subscription is now active.
    </p>
    <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
      Your license key will be delivered in a separate email shortly.
    </p>
    <div style="margin: 32px 0;">
      <a href="${APP_URL}/portal" style="display: inline-block; background-color: #C9DBF0; color: #0B1220; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
        Go to Portal
      </a>
    </div>
    <hr style="border: none; border-top: 1px solid rgba(201, 219, 240, 0.2); margin: 32px 0;">
    <p style="color: #6B7C93; font-size: 12px;">${COMPANY_NAME} • Precision Editing Tools for AI Coding Agents</p>
  </div>
</body>
</html>`,
    text: `Welcome to ${PRODUCT_NAME}!
\nThank you for your purchase! Your subscription is now active.
\nYour license key will be delivered in a separate email shortly.
\nPortal: ${APP_URL}/portal
\n${COMPANY_NAME}`,
  }),

  cancellation: ({ email, accessUntil }) => ({
    subject: `Your ${PRODUCT_NAME} Subscription Has Been Cancelled`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0B1220; color: #F6F8FB; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto;">
    <h1 style="color: #F6F8FB; margin-bottom: 24px;">Subscription Cancelled</h1>
    <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
      Your ${PRODUCT_NAME} subscription has been cancelled.
    </p>
    <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
      You'll continue to have access until <strong style="color: #F6F8FB;">${accessUntil || "the end of your billing period"}</strong>.
    </p>
    <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
      Changed your mind? You can reactivate anytime from your portal.
    </p>
    <div style="margin: 32px 0;">
      <a href="${APP_URL}/portal" style="display: inline-block; background-color: #C9DBF0; color: #0B1220; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
        Reactivate Subscription
      </a>
    </div>
    <hr style="border: none; border-top: 1px solid rgba(201, 219, 240, 0.2); margin: 32px 0;">
    <p style="color: #6B7C93; font-size: 12px;">${COMPANY_NAME} • Precision Editing Tools for AI Coding Agents</p>
  </div>
</body>
</html>`,
    text: `Subscription Cancelled
\nYour ${PRODUCT_NAME} subscription has been cancelled.
\nYou'll continue to have access until ${accessUntil || "the end of your billing period"}.
\nChanged your mind? Reactivate at: ${APP_URL}/portal
\n${COMPANY_NAME}`,
  }),

  reactivation: ({ email }) => ({
    subject: `Your ${PRODUCT_NAME} Subscription is Active Again!`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0B1220; color: #F6F8FB; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto;">
    <h1 style="color: #F6F8FB; margin-bottom: 24px;">Welcome Back! 🎉</h1>
    <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
      Great news! Your ${PRODUCT_NAME} subscription has been reactivated.
    </p>
    <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
      Your license is active and ready to use.
    </p>
    <div style="margin: 32px 0;">
      <a href="${APP_URL}/portal" style="display: inline-block; background-color: #C9DBF0; color: #0B1220; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
        Go to Portal
      </a>
    </div>
    <hr style="border: none; border-top: 1px solid rgba(201, 219, 240, 0.2); margin: 32px 0;">
    <p style="color: #6B7C93; font-size: 12px;">${COMPANY_NAME} • Precision Editing Tools for AI Coding Agents</p>
  </div>
</body>
</html>`,
    text: `Welcome Back!
\nGreat news! Your ${PRODUCT_NAME} subscription has been reactivated.
\nYour license is active and ready to use.
\nPortal: ${APP_URL}/portal
\n${COMPANY_NAME}`,
  }),

  paymentFailed: ({ email, attemptCount, retryDate }) => ({
    subject: `Action Required: Payment Failed for ${PRODUCT_NAME}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0B1220; color: #F6F8FB; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto;">
    <h1 style="color: #F6F8FB; margin-bottom: 24px;">Payment Failed ⚠️</h1>
    <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
      We were unable to process your payment for ${PRODUCT_NAME}.
    </p>
    ${attemptCount ? `<p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">This is attempt ${attemptCount} of 3.</p>` : ""}
    ${retryDate ? `<p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">We'll automatically retry on <strong style="color: #F6F8FB;">${retryDate}</strong>.</p>` : ""}
    <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
      Please update your payment method to avoid service interruption.
    </p>
    <div style="margin: 32px 0;">
      <a href="${APP_URL}/portal/billing" style="display: inline-block; background-color: #C9DBF0; color: #0B1220; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
        Update Payment Method
      </a>
    </div>
    <hr style="border: none; border-top: 1px solid rgba(201, 219, 240, 0.2); margin: 32px 0;">
    <p style="color: #6B7C93; font-size: 12px;">${COMPANY_NAME} • Precision Editing Tools for AI Coding Agents</p>
  </div>
</body>
</html>`,
    text: `Payment Failed
\nWe were unable to process your payment for ${PRODUCT_NAME}.
\n${attemptCount ? `This is attempt ${attemptCount} of 3.\n` : ""}${retryDate ? `We'll automatically retry on ${retryDate}.\n` : ""}\nPlease update your payment method: ${APP_URL}/portal/billing
\n${COMPANY_NAME}`,
  }),

  licenseRevoked: ({ email, organizationName }) => ({
    subject: `Your ${PRODUCT_NAME} License Has Been Revoked`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0B1220; color: #F6F8FB; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto;">
    <h1 style="color: #F6F8FB; margin-bottom: 24px;">License Revoked</h1>
    <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
      Your ${PRODUCT_NAME} license has been revoked${organizationName ? ` by ${organizationName}` : ""}.
    </p>
    <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
      If you believe this is an error, please contact your organization administrator or our support team.
    </p>
    <div style="margin: 32px 0;">
      <a href="mailto:support@hic-ai.com" style="display: inline-block; background-color: #C9DBF0; color: #0B1220; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
        Contact Support
      </a>
    </div>
    <hr style="border: none; border-top: 1px solid rgba(201, 219, 240, 0.2); margin: 32px 0;">
    <p style="color: #6B7C93; font-size: 12px;">${COMPANY_NAME} • Precision Editing Tools for AI Coding Agents</p>
  </div>
</body>
</html>`,
    text: `License Revoked
\nYour ${PRODUCT_NAME} license has been revoked${organizationName ? ` by ${organizationName}` : ""}.
\nIf you believe this is an error, please contact support@hic-ai.com.
\n${COMPANY_NAME}`,
  }),

  trialEnding: ({ email, daysRemaining, planName }) => ({
    subject: `Your ${PRODUCT_NAME} Trial Ends in ${daysRemaining} Days`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0B1220; color: #F6F8FB; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto;">
    <h1 style="color: #F6F8FB; margin-bottom: 24px;">Trial Ending Soon ⏰</h1>
    <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
      Your ${PRODUCT_NAME} trial ends in <strong style="color: #F6F8FB;">${daysRemaining} days</strong>.
    </p>
    <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
      Subscribe now to keep using all the features you've been enjoying.
    </p>
    <div style="margin: 32px 0;">
      <a href="${APP_URL}/pricing" style="display: inline-block; background-color: #C9DBF0; color: #0B1220; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
        View Plans
      </a>
    </div>
    <hr style="border: none; border-top: 1px solid rgba(201, 219, 240, 0.2); margin: 32px 0;">
    <p style="color: #6B7C93; font-size: 12px;">${COMPANY_NAME} • Precision Editing Tools for AI Coding Agents</p>
  </div>
</body>
</html>`,
    text: `Trial Ending Soon
\nYour ${PRODUCT_NAME} trial ends in ${daysRemaining} days.
\nSubscribe now: ${APP_URL}/pricing
\n${COMPANY_NAME}`,
  }),
};

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
  const failCount = results.filter((r) => !r.success).length;

  log.info("complete", { processed: results.length, success: successCount, failed: failCount });

  // If all failed, throw to trigger SQS retry
  if (failCount > 0 && successCount === 0) {
    throw new Error(`All ${failCount} emails failed to send`);
  }

  return { processed: results.length, success: successCount, failed: failCount };
};
