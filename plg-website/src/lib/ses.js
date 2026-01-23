/**
 * AWS SES Email Client
 *
 * Provides email sending functionality for:
 * - Welcome emails after purchase
 * - License delivery
 * - Payment notifications
 * - Account alerts
 *
 * @see PLG Technical Specification v2 - Section 5
 */

import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { HicLog } from "../../../dm/layers/base/src/index.js";

const ses = new SESClient({
  region: process.env.AWS_REGION || "us-east-1",
});

const FROM_EMAIL = process.env.SES_FROM_EMAIL || "noreply@hic-ai.com";
const COMPANY_NAME = "HIC AI";
const PRODUCT_NAME = "Mouse";

// ===========================================
// EMAIL TEMPLATES
// ===========================================

const templates = {
  /**
   * Welcome email after checkout (before account creation)
   */
  welcome: ({ email, sessionId }) => ({
    subject: `Welcome to ${PRODUCT_NAME}! Complete your account setup`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0B1220; color: #F6F8FB; padding: 40px 20px;">
        <div style="max-width: 600px; margin: 0 auto;">
          <h1 style="color: #F6F8FB; margin-bottom: 24px;">Welcome to ${PRODUCT_NAME}! 🎉</h1>
          
          <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
            Thank you for your purchase! Your subscription is now active.
          </p>
          
          <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
            To get your license key and start using ${PRODUCT_NAME}, please complete your account setup:
          </p>
          
          <div style="margin: 32px 0;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/welcome?session_id=${sessionId}" 
               style="display: inline-block; background-color: #C9DBF0; color: #0B1220; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
              Complete Account Setup
            </a>
          </div>
          
          <p style="color: #6B7C93; font-size: 14px;">
            This link will expire in 24 hours. If you have any questions, reply to this email or contact support@hic-ai.com.
          </p>
          
          <hr style="border: none; border-top: 1px solid rgba(201, 219, 240, 0.2); margin: 32px 0;">
          
          <p style="color: #6B7C93; font-size: 12px;">
            ${COMPANY_NAME} • Precision Editing Tools for AI Coding Agents
          </p>
        </div>
      </body>
      </html>
    `,
    text: `
Welcome to ${PRODUCT_NAME}!

Thank you for your purchase! Your subscription is now active.

To get your license key and start using ${PRODUCT_NAME}, please complete your account setup:

${process.env.NEXT_PUBLIC_APP_URL}/welcome?session_id=${sessionId}

This link will expire in 24 hours.

If you have any questions, contact support@hic-ai.com.

${COMPANY_NAME}
    `,
  }),

  /**
   * License key delivery after account creation
   */
  licenseDelivery: ({ email, licenseKey, planName }) => ({
    subject: `Your ${PRODUCT_NAME} License Key`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0B1220; color: #F6F8FB; padding: 40px 20px;">
        <div style="max-width: 600px; margin: 0 auto;">
          <h1 style="color: #F6F8FB; margin-bottom: 24px;">Your License Key</h1>
          
          <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
            Here's your ${PRODUCT_NAME} ${planName} license key:
          </p>
          
          <div style="background-color: rgba(201, 219, 240, 0.08); border: 1px solid rgba(201, 219, 240, 0.3); border-radius: 8px; padding: 20px; margin: 24px 0; font-family: monospace; font-size: 18px; color: #C9DBF0; word-break: break-all;">
            ${licenseKey}
          </div>
          
          <h2 style="color: #F6F8FB; font-size: 18px; margin-top: 32px;">How to Activate</h2>
          
          <ol style="color: #B8C4D0; font-size: 16px; line-height: 1.8; padding-left: 20px;">
            <li>Install the ${PRODUCT_NAME} extension from VS Code Marketplace</li>
            <li>Open VS Code Settings (Cmd/Ctrl + ,)</li>
            <li>Search for "mouse.licenseKey"</li>
            <li>Paste your license key and restart VS Code</li>
          </ol>
          
          <div style="margin: 32px 0;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/portal" 
               style="display: inline-block; background-color: #C9DBF0; color: #0B1220; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
              Go to Portal
            </a>
          </div>
          
          <hr style="border: none; border-top: 1px solid rgba(201, 219, 240, 0.2); margin: 32px 0;">
          
          <p style="color: #6B7C93; font-size: 12px;">
            ${COMPANY_NAME} • Precision Editing Tools for AI Coding Agents
          </p>
        </div>
      </body>
      </html>
    `,
    text: `
Your ${PRODUCT_NAME} License Key

Here's your ${PRODUCT_NAME} ${planName} license key:

${licenseKey}

How to Activate:
1. Install the ${PRODUCT_NAME} extension from VS Code Marketplace
2. Open VS Code Settings (Cmd/Ctrl + ,)
3. Search for "mouse.licenseKey"
4. Paste your license key and restart VS Code

Go to your portal: ${process.env.NEXT_PUBLIC_APP_URL}/portal

${COMPANY_NAME}
    `,
  }),

  /**
   * Payment failure notification
   */
  paymentFailed: ({ email, attemptCount, retryDate }) => ({
    subject: `Action Required: Payment Failed for ${PRODUCT_NAME}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0B1220; color: #F6F8FB; padding: 40px 20px;">
        <div style="max-width: 600px; margin: 0 auto;">
          <h1 style="color: #F87171; margin-bottom: 24px;">Payment Failed</h1>
          
          <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
            We were unable to process your payment for ${PRODUCT_NAME}. This was attempt ${attemptCount} of 3.
          </p>
          
          ${
            attemptCount < 3
              ? `<p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
              We'll automatically retry on ${retryDate}. Please update your payment method to avoid service interruption.
            </p>`
              : `<p style="color: #F87171; font-size: 16px; line-height: 1.6;">
              This was the final attempt. Your subscription has been suspended. Please update your payment method to restore access.
            </p>`
          }
          
          <div style="margin: 32px 0;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/portal/billing" 
               style="display: inline-block; background-color: #C9DBF0; color: #0B1220; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
              Update Payment Method
            </a>
          </div>
          
          <p style="color: #6B7C93; font-size: 14px;">
            Need help? Contact support@hic-ai.com
          </p>
          
          <hr style="border: none; border-top: 1px solid rgba(201, 219, 240, 0.2); margin: 32px 0;">
          
          <p style="color: #6B7C93; font-size: 12px;">
            ${COMPANY_NAME} • Precision Editing Tools for AI Coding Agents
          </p>
        </div>
      </body>
      </html>
    `,
    text: `
Payment Failed

We were unable to process your payment for ${PRODUCT_NAME}. This was attempt ${attemptCount} of 3.

${
  attemptCount < 3
    ? `We'll automatically retry on ${retryDate}. Please update your payment method to avoid service interruption.`
    : `This was the final attempt. Your subscription has been suspended. Please update your payment method to restore access.`
}

Update your payment method: ${process.env.NEXT_PUBLIC_APP_URL}/portal/billing

Need help? Contact support@hic-ai.com

${COMPANY_NAME}
    `,
  }),

  /**
   * Trial ending reminder
   */
  trialEnding: ({ email, daysRemaining, planName }) => ({
    subject: `Your ${PRODUCT_NAME} trial ends in ${daysRemaining} days`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0B1220; color: #F6F8FB; padding: 40px 20px;">
        <div style="max-width: 600px; margin: 0 auto;">
          <h1 style="color: #F6F8FB; margin-bottom: 24px;">Trial Ending Soon</h1>
          
          <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
            Your ${PRODUCT_NAME} ${planName} trial ends in <strong>${daysRemaining} days</strong>.
          </p>
          
          <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
            To continue using ${PRODUCT_NAME} without interruption, make sure your billing information is up to date.
          </p>
          
          <div style="margin: 32px 0;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/portal/billing" 
               style="display: inline-block; background-color: #C9DBF0; color: #0B1220; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
              Manage Subscription
            </a>
          </div>
          
          <hr style="border: none; border-top: 1px solid rgba(201, 219, 240, 0.2); margin: 32px 0;">
          
          <p style="color: #6B7C93; font-size: 12px;">
            ${COMPANY_NAME} • Precision Editing Tools for AI Coding Agents
          </p>
        </div>
      </body>
      </html>
    `,
    text: `
Trial Ending Soon

Your ${PRODUCT_NAME} ${planName} trial ends in ${daysRemaining} days.

To continue using ${PRODUCT_NAME} without interruption, make sure your billing information is up to date.

Manage subscription: ${process.env.NEXT_PUBLIC_APP_URL}/portal/billing

${COMPANY_NAME}
    `,
  }),
};

// ===========================================
// EMAIL FUNCTIONS
// ===========================================

/**
 * Send an email using a template
 */
export async function sendEmail(templateName, to, data) {
  const log = new HicLog('plg-ses');
  log.logAWSCall('SES', 'SendEmail', { templateName, to });
  
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
