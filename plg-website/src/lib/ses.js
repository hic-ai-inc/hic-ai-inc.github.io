/**
 * AWS SES Email Client
 *
 * Provides email sending functionality for:
 * - Welcome emails after purchase
 * - License delivery
 * - Payment notifications
 * - Account alerts
 *
 * Templates are centralized in email-templates.js for consistency
 * across all email senders (ses.js, email-sender Lambda, scheduled-tasks Lambda).
 *
 * @see PLG Technical Specification v4 - Phase 2: Template Consolidation
 */

// HIC DM Layer imports - centralized dependency management
import {
  SESClient,
  SendEmailCommand,
  createTemplates,
} from "../../../dm/layers/ses/src/index.js";
import { HicLog } from "../../../dm/layers/base/src/index.js";

const ses = new SESClient({
  region: process.env.AWS_REGION || "us-east-1",
});

const FROM_EMAIL = process.env.SES_FROM_EMAIL || "noreply@hic-ai.com";

// Initialize templates with environment configuration
const templates = createTemplates({
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "https://mouse.hic-ai.com",
  companyName: "HIC AI",
  productName: "Mouse",
});

// ===========================================
// EMAIL FUNCTIONS
// ===========================================

/**
 * Send an email using a template
 */
export async function sendEmail(templateName, to, data) {
  const log = new HicLog("plg-ses");
  log.logAWSCall("SES", "SendEmail", { templateName, to });

  const template = templates[templateName];
  if (!template) {
    throw new Error(`Unknown email template: ${templateName}`);
  }

  const { subject, html, text } = template(data);

  const command = new SendEmailCommand({
    Source: FROM_EMAIL,
    Destination: {
      ToAddresses: [to],
    },
    Message: {
      Subject: {
        Data: subject,
        Charset: "UTF-8",
      },
      Body: {
        Html: {
          Data: html,
          Charset: "UTF-8",
        },
        Text: {
          Data: text,
          Charset: "UTF-8",
        },
      },
    },
  });

  try {
    const result = await ses.send(command);
    console.log(`Email sent: ${templateName} to ${to}`, result.MessageId);
    return { success: true, messageId: result.MessageId };
  } catch (error) {
    console.error(`Email failed: ${templateName} to ${to}`, error);
    throw error;
  }
}

/**
 * Send welcome email after checkout
 */
export async function sendWelcomeEmail(email, sessionId) {
  return sendEmail("welcome", email, { email, sessionId });
}

/**
 * Send license key after account creation
 */
export async function sendLicenseEmail(email, licenseKey, planName) {
  return sendEmail("licenseDelivery", email, { email, licenseKey, planName });
}

/**
 * Send payment failure notification
 */
export async function sendPaymentFailedEmail(email, attemptCount, retryDate) {
  return sendEmail("paymentFailed", email, { email, attemptCount, retryDate });
}

/**
 * Send trial ending reminder
 */
export async function sendTrialEndingEmail(email, daysRemaining, planName) {
  return sendEmail("trialEnding", email, { email, daysRemaining, planName });
}

/**
 * Send payment reactivation confirmation (A.2)
 */
export async function sendReactivationEmail(email) {
  return sendEmail("reactivation", email, { email });
}

/**
 * Send cancellation confirmation (A.9.1)
 */
export async function sendCancellationEmail(email, accessUntil) {
  return sendEmail("cancellation", email, { email, accessUntil });
}

/**
 * Send license revoked notification (A.7)
 */
export async function sendLicenseRevokedEmail(email, organizationName = null) {
  return sendEmail("licenseRevoked", email, { email, organizationName });
}

/**
 * Send dispute alert to support team (A.6.2)
 * Note: This goes to SUPPORT_EMAIL, not the customer
 */
export async function sendDisputeAlert(
  customerEmail,
  amount,
  reason,
  disputeId,
) {
  const supportEmail = process.env.SUPPORT_EMAIL || "support@hic-ai.com";
  return sendEmail("disputeAlert", supportEmail, {
    customerEmail,
    amount,
    reason,
    disputeId,
  });
}

/**
 * Send win-back email at 30 days post-cancellation (A.9.2)
 */
export async function sendWinBack30Email(email) {
  return sendEmail("winBack30", email, { email });
}

/**
 * Send win-back email at 90 days with discount offer (A.9.2)
 */
export async function sendWinBack90Email(email, discountCode = "WINBACK20") {
  return sendEmail("winBack90", email, { email, discountCode });
}

/**
 * Send enterprise team invitation (A.7)
 */
export async function sendEnterpriseInviteEmail(
  email,
  organizationName,
  inviterName,
  inviteToken,
) {
  return sendEmail("enterpriseInvite", email, {
    email,
    organizationName,
    inviterName,
    inviteToken,
  });
}
