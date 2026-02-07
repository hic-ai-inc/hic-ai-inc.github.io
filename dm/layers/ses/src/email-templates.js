/**
 * Centralized Email Templates
 *
 * Single source of truth for all email templates used across:
 * - src/lib/ses.js (Next.js application)
 * - infrastructure/lambda/email-sender/index.js (Event-driven Lambda)
 * - infrastructure/lambda/scheduled-tasks/index.js (Cron Lambda)
 *
 * Each template is a function that returns { subject, html, text }
 *
 * @see PLG Technical Specification v4 - Phase 2: Template Consolidation
 */

// ============================================================================
// Configuration (must be set by consumer via createTemplates)
// ============================================================================

/**
 * Create email templates with environment-specific configuration
 *
 * @param {Object} config - Template configuration
 * @param {string} config.appUrl - Base URL for links (e.g., process.env.NEXT_PUBLIC_APP_URL)
 * @param {string} [config.companyName="HIC AI"] - Company name for footer
 * @param {string} [config.productName="Mouse"] - Product name used in copy
 * @returns {Object} All email template functions
 */
export function createTemplates(config = {}) {
  const {
    appUrl = "https://mouse.hic-ai.com",
    companyName = "HIC AI",
    productName = "Mouse",
  } = config;

  const COMPANY_NAME = companyName;
  const PRODUCT_NAME = productName;
  const APP_URL = appUrl;

  return {
    // ========================================================================
    // 1. WELCOME - After checkout (before account creation)
    // ========================================================================
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
      <a href="${APP_URL}/welcome?session_id=${sessionId}" 
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
</html>`,
      text: `Welcome to ${PRODUCT_NAME}!

Thank you for your purchase! Your subscription is now active.

To get your license key and start using ${PRODUCT_NAME}, please complete your account setup:

${APP_URL}/welcome?session_id=${sessionId}

This link will expire in 24 hours.

If you have any questions, contact support@hic-ai.com.

${COMPANY_NAME}`,
    }),

    // ========================================================================
    // 2. LICENSE DELIVERY - After account creation
    // ========================================================================
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
      <a href="${APP_URL}/portal" 
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
</html>`,
      text: `Your ${PRODUCT_NAME} License Key

Here's your ${PRODUCT_NAME} ${planName} license key:

${licenseKey}

How to Activate:
1. Install the ${PRODUCT_NAME} extension from VS Code Marketplace
2. Open VS Code Settings (Cmd/Ctrl + ,)
3. Search for "mouse.licenseKey"
4. Paste your license key and restart VS Code

Go to your portal: ${APP_URL}/portal

${COMPANY_NAME}`,
    }),

    // ========================================================================
    // 3. PAYMENT FAILED - After failed payment attempt
    // ========================================================================
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
      <a href="${APP_URL}/portal/billing" 
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
</html>`,
      text: `Payment Failed

We were unable to process your payment for ${PRODUCT_NAME}. This was attempt ${attemptCount} of 3.

${
  attemptCount < 3
    ? `We'll automatically retry on ${retryDate}. Please update your payment method to avoid service interruption.`
    : `This was the final attempt. Your subscription has been suspended. Please update your payment method to restore access.`
}

Update your payment method: ${APP_URL}/portal/billing

Need help? Contact support@hic-ai.com

${COMPANY_NAME}`,
    }),

    // ========================================================================
    // 4. TRIAL ENDING - Reminder before trial expires
    // ========================================================================
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
      Your ${PRODUCT_NAME}${planName ? ` ${planName}` : ""} trial ends in <strong>${daysRemaining} days</strong>.
    </p>
    
    <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
      To continue using ${PRODUCT_NAME} without interruption, make sure your billing information is up to date.
    </p>
    
    <div style="margin: 32px 0;">
      <a href="${APP_URL}/portal/billing" 
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
</html>`,
      text: `Trial Ending Soon

Your ${PRODUCT_NAME}${planName ? ` ${planName}` : ""} trial ends in ${daysRemaining} days.

To continue using ${PRODUCT_NAME} without interruption, make sure your billing information is up to date.

Manage subscription: ${APP_URL}/portal/billing

${COMPANY_NAME}`,
    }),

    // ========================================================================
    // 5. REACTIVATION - Payment recovered after suspension (A.2)
    // ========================================================================
    reactivation: ({ email }) => ({
      subject: `Payment Successful - ${PRODUCT_NAME} Access Restored`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0B1220; color: #F6F8FB; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto;">
    <h1 style="color: #10B981; margin-bottom: 24px;">✅ Payment Successful!</h1>
    
    <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
      Great news! Your payment has been processed successfully and your ${PRODUCT_NAME} subscription is now fully active.
    </p>
    
    <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
      Your license has been reinstated. If you're currently in VS Code, ${PRODUCT_NAME} will automatically restore full functionality within the next hour, or you can restart VS Code to activate immediately.
    </p>
    
    <div style="margin: 32px 0;">
      <a href="${APP_URL}/portal" 
         style="display: inline-block; background-color: #C9DBF0; color: #0B1220; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
        Go to Portal
      </a>
    </div>
    
    <p style="color: #6B7C93; font-size: 14px;">
      Thank you for continuing with ${PRODUCT_NAME}!
    </p>
    
    <hr style="border: none; border-top: 1px solid rgba(201, 219, 240, 0.2); margin: 32px 0;">
    
    <p style="color: #6B7C93; font-size: 12px;">
      ${COMPANY_NAME} • Precision Editing Tools for AI Coding Agents
    </p>
  </div>
</body>
</html>`,
      text: `Payment Successful!

Great news! Your payment has been processed successfully and your ${PRODUCT_NAME} subscription is now fully active.

Your license has been reinstated. If you're currently in VS Code, ${PRODUCT_NAME} will automatically restore full functionality within the next hour, or you can restart VS Code to activate immediately.

Go to your portal: ${APP_URL}/portal

Thank you for continuing with ${PRODUCT_NAME}!

${COMPANY_NAME}`,
    }),

    // ========================================================================
    // 6. CANCELLATION - Subscription cancelled confirmation (A.9.1)
    // ========================================================================
    cancellation: ({ email, accessUntil }) => ({
      subject: `We're sorry to see you go - ${PRODUCT_NAME}`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0B1220; color: #F6F8FB; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto;">
    <h1 style="color: #F6F8FB; margin-bottom: 24px;">Subscription Cancelled</h1>
    
    <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
      Your ${PRODUCT_NAME} subscription has been cancelled.
    </p>
    
    <div style="background-color: rgba(201, 219, 240, 0.08); border: 1px solid rgba(201, 219, 240, 0.3); border-radius: 8px; padding: 20px; margin: 24px 0;">
      <h3 style="color: #F6F8FB; margin: 0 0 12px 0; font-size: 16px;">What happens next:</h3>
      <ul style="color: #B8C4D0; font-size: 14px; line-height: 1.8; padding-left: 20px; margin: 0;">
        <li>You'll have full access until <strong>${accessUntil}</strong></li>
        <li>After that, your license will expire</li>
        <li>Your account and data will be preserved</li>
      </ul>
    </div>
    
    <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
      Changed your mind? You can reactivate anytime before your access expires.
    </p>
    
    <div style="margin: 32px 0;">
      <a href="${APP_URL}/portal/billing" 
         style="display: inline-block; background-color: #C9DBF0; color: #0B1220; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
        Reactivate Subscription
      </a>
    </div>
    
    <p style="color: #6B7C93; font-size: 14px;">
      If something wasn't working right, we'd love to hear about it. Just reply to this email.
    </p>
    
    <hr style="border: none; border-top: 1px solid rgba(201, 219, 240, 0.2); margin: 32px 0;">
    
    <p style="color: #6B7C93; font-size: 12px;">
      ${COMPANY_NAME} • Precision Editing Tools for AI Coding Agents
    </p>
  </div>
</body>
</html>`,
      text: `Subscription Cancelled

Your ${PRODUCT_NAME} subscription has been cancelled.

What happens next:
• You'll have full access until ${accessUntil}
• After that, your license will expire
• Your account and data will be preserved

Changed your mind? You can reactivate anytime:
${APP_URL}/portal/billing

If something wasn't working right, we'd love to hear about it. Just reply to this email.

${COMPANY_NAME}`,
    }),

    // ========================================================================
    // 7. LICENSE REVOKED - By admin (A.7)
    // ========================================================================
    licenseRevoked: ({ email, organizationName }) => ({
      subject: `Your ${PRODUCT_NAME} License Has Been Revoked`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0B1220; color: #F6F8FB; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto;">
    <h1 style="color: #F87171; margin-bottom: 24px;">License Revoked</h1>
    
    <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
      Your ${PRODUCT_NAME} license${organizationName ? ` from ${organizationName}` : ""} has been revoked by your organization's administrator.
    </p>
    
    <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
      This means you no longer have access to ${PRODUCT_NAME} through this license. If you believe this is an error, please contact your administrator.
    </p>
    
    <div style="background-color: rgba(201, 219, 240, 0.08); border: 1px solid rgba(201, 219, 240, 0.3); border-radius: 8px; padding: 20px; margin: 24px 0;">
      <h3 style="color: #F6F8FB; margin: 0 0 12px 0; font-size: 16px;">Want to continue using ${PRODUCT_NAME}?</h3>
      <p style="color: #B8C4D0; font-size: 14px; margin: 0;">
        You can purchase an Individual license for $10/month to keep using ${PRODUCT_NAME} on your own.
      </p>
    </div>
    
    <div style="margin: 32px 0;">
      <a href="${APP_URL}/pricing" 
         style="display: inline-block; background-color: #C9DBF0; color: #0B1220; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
        Get Individual License
      </a>
    </div>
    
    <hr style="border: none; border-top: 1px solid rgba(201, 219, 240, 0.2); margin: 32px 0;">
    
    <p style="color: #6B7C93; font-size: 12px;">
      ${COMPANY_NAME} • Precision Editing Tools for AI Coding Agents
    </p>
  </div>
</body>
</html>`,
      text: `License Revoked

Your ${PRODUCT_NAME} license${organizationName ? ` from ${organizationName}` : ""} has been revoked by your organization's administrator.

This means you no longer have access to ${PRODUCT_NAME} through this license. If you believe this is an error, please contact your administrator.

Want to continue using ${PRODUCT_NAME}?
You can purchase an Individual license for $10/month:
${APP_URL}/pricing

${COMPANY_NAME}`,
    }),

    // ========================================================================
    // 8. LICENSE SUSPENDED - Due to billing/policy issues
    // ========================================================================
    licenseSuspended: ({ email }) => ({
      subject: `Your ${PRODUCT_NAME} License Has Been Suspended`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0B1220; color: #F6F8FB; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto;">
    <h1 style="color: #F87171; margin-bottom: 24px;">License Suspended ⚠️</h1>
    
    <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
      Your ${PRODUCT_NAME} license has been suspended.
    </p>
    
    <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
      This may be due to a billing issue or policy violation. Please check your account status or contact support to resolve this.
    </p>
    
    <div style="margin: 32px 0;">
      <a href="${APP_URL}/portal/billing" 
         style="display: inline-block; background-color: #C9DBF0; color: #0B1220; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
        Check Account Status
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
</html>`,
      text: `License Suspended

Your ${PRODUCT_NAME} license has been suspended.

This may be due to a billing issue or policy violation. Please check your account status or contact support to resolve this.

Check account: ${APP_URL}/portal/billing

Need help? Contact support@hic-ai.com

${COMPANY_NAME}`,
    }),

    // ========================================================================
    // 9. WIN-BACK 30 - 30 days post-cancellation (A.9.2)
    // ========================================================================
    winBack30: ({ email }) => ({
      subject: `We miss you! Come back to ${PRODUCT_NAME}`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0B1220; color: #F6F8FB; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto;">
    <h1 style="color: #F6F8FB; margin-bottom: 24px;">We miss you! 💙</h1>
    
    <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
      It's been 30 days since you cancelled your ${PRODUCT_NAME} subscription, and we wanted to check in.
    </p>
    
    <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
      We've been busy making ${PRODUCT_NAME} even better. Here's what's new since you left:
    </p>
    
    <ul style="color: #B8C4D0; font-size: 16px; line-height: 1.8; padding-left: 20px;">
      <li>Performance improvements and faster edits</li>
      <li>Better error handling and recovery</li>
      <li>New staging workflow for safer edits</li>
    </ul>
    
    <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
      Ready to give it another try? Your account is still here, waiting for you.
    </p>
    
    <div style="margin: 32px 0;">
      <a href="${APP_URL}/pricing" 
         style="display: inline-block; background-color: #C9DBF0; color: #0B1220; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
        Reactivate Now
      </a>
    </div>
    
    <hr style="border: none; border-top: 1px solid rgba(201, 219, 240, 0.2); margin: 32px 0;">
    
    <p style="color: #6B7C93; font-size: 12px;">
      ${COMPANY_NAME} • Precision Editing Tools for AI Coding Agents<br>
      <a href="${APP_URL}/unsubscribe?email=${encodeURIComponent(email)}" style="color: #6B7C93;">Unsubscribe from win-back emails</a>
    </p>
  </div>
</body>
</html>`,
      text: `We miss you!

It's been 30 days since you cancelled your ${PRODUCT_NAME} subscription, and we wanted to check in.

We've been busy making ${PRODUCT_NAME} even better. Here's what's new since you left:
- Performance improvements and faster edits
- Better error handling and recovery
- New staging workflow for safer edits

Ready to give it another try? Your account is still here, waiting for you.

Reactivate now: ${APP_URL}/pricing

${COMPANY_NAME}
Unsubscribe: ${APP_URL}/unsubscribe?email=${encodeURIComponent(email)}`,
    }),

    // ========================================================================
    // 10. WIN-BACK 90 - 90 days post-cancellation with discount (A.9.2)
    // ========================================================================
    winBack90: ({ email, discountCode }) => ({
      subject: `Special offer: 20% off ${PRODUCT_NAME} — we'd love you back`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0B1220; color: #F6F8FB; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto;">
    <h1 style="color: #F6F8FB; margin-bottom: 24px;">Special Offer Just For You 🎁</h1>
    
    <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
      It's been a while since you left ${PRODUCT_NAME}, and we wanted to reach out one more time.
    </p>
    
    <div style="background-color: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 8px; padding: 24px; margin: 24px 0; text-align: center;">
      <h2 style="color: #10B981; margin: 0 0 12px 0;">20% OFF</h2>
      <p style="color: #B8C4D0; font-size: 16px; margin: 0 0 16px 0;">Your first 3 months back</p>
      <div style="background-color: rgba(201, 219, 240, 0.08); border: 1px dashed rgba(201, 219, 240, 0.3); border-radius: 4px; padding: 12px; font-family: monospace; font-size: 18px; color: #C9DBF0;">
        ${discountCode || "WINBACK20"}
      </div>
    </div>
    
    <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
      This offer expires in 7 days. Enter the code at checkout to claim your discount.
    </p>
    
    <div style="margin: 32px 0;">
      <a href="${APP_URL}/pricing?code=${discountCode || "WINBACK20"}" 
         style="display: inline-block; background-color: #10B981; color: #ffffff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
        Claim Your Discount
      </a>
    </div>
    
    <hr style="border: none; border-top: 1px solid rgba(201, 219, 240, 0.2); margin: 32px 0;">
    
    <p style="color: #6B7C93; font-size: 12px;">
      ${COMPANY_NAME} • Precision Editing Tools for AI Coding Agents<br>
      <a href="${APP_URL}/unsubscribe?email=${encodeURIComponent(email)}" style="color: #6B7C93;">Unsubscribe from win-back emails</a>
    </p>
  </div>
</body>
</html>`,
      text: `Special Offer Just For You!

It's been a while since you left ${PRODUCT_NAME}, and we wanted to reach out one more time.

20% OFF your first 3 months back!
Use code: ${discountCode || "WINBACK20"}

This offer expires in 7 days.

Claim your discount: ${APP_URL}/pricing?code=${discountCode || "WINBACK20"}

${COMPANY_NAME}
Unsubscribe: ${APP_URL}/unsubscribe?email=${encodeURIComponent(email)}`,
    }),

    // ========================================================================
    // 11. ENTERPRISE INVITE - Team invitation (A.7)
    // ========================================================================
    enterpriseInvite: ({
      email,
      organizationName,
      inviterName,
      inviteToken,
    }) => ({
      subject: `You've been invited to use ${PRODUCT_NAME}`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0B1220; color: #F6F8FB; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto;">
    <h1 style="color: #F6F8FB; margin-bottom: 24px;">You're Invited! 🚀</h1>
    
    <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
      ${inviterName} has invited you to join <strong>${organizationName}</strong>'s ${PRODUCT_NAME} team.
    </p>
    
    <div style="background-color: rgba(201, 219, 240, 0.08); border: 1px solid rgba(201, 219, 240, 0.3); border-radius: 8px; padding: 20px; margin: 24px 0;">
      <h3 style="color: #F6F8FB; margin: 0 0 12px 0; font-size: 16px;">What is ${PRODUCT_NAME}?</h3>
      <p style="color: #B8C4D0; font-size: 14px; margin: 0;">
        ${PRODUCT_NAME} provides precision editing tools for AI coding agents in VS Code. It helps AI assistants make more accurate, atomic edits to your codebase.
      </p>
    </div>
    
    <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
      Accept this invitation to get your license key and start using ${PRODUCT_NAME} — your organization has you covered.
    </p>
    
    <div style="margin: 32px 0;">
      <a href="${APP_URL}/invite/accept?token=${inviteToken}" 
         style="display: inline-block; background-color: #C9DBF0; color: #0B1220; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
        Accept Invitation
      </a>
    </div>
    
    <p style="color: #6B7C93; font-size: 14px;">
      This invitation expires in 7 days. If you didn't expect this email, you can safely ignore it.
    </p>
    
    <hr style="border: none; border-top: 1px solid rgba(201, 219, 240, 0.2); margin: 32px 0;">
    
    <p style="color: #6B7C93; font-size: 12px;">
      ${COMPANY_NAME} • Precision Editing Tools for AI Coding Agents
    </p>
  </div>
</body>
</html>`,
      text: `You're Invited!

${inviterName} has invited you to join ${organizationName}'s ${PRODUCT_NAME} team.

What is ${PRODUCT_NAME}?
${PRODUCT_NAME} provides precision editing tools for AI coding agents in VS Code. It helps AI assistants make more accurate, atomic edits to your codebase.

Accept this invitation to get your license key and start using ${PRODUCT_NAME} — your organization has you covered.

Accept invitation: ${APP_URL}/invite/accept?token=${inviteToken}

This invitation expires in 7 days. If you didn't expect this email, you can safely ignore it.

${COMPANY_NAME}`,
    }),

    // ========================================================================
    // 12. DISPUTE ALERT - Internal alert to support team (A.6.2)
    // ========================================================================
    disputeAlert: ({ customerEmail, amount, reason, disputeId }) => ({
      subject: `⚠️ DISPUTE ALERT: ${customerEmail} - $${(amount / 100).toFixed(2)}`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px;">
  <h1 style="color: #DC2626;">⚠️ Chargeback Dispute Created</h1>
  
  <table style="border-collapse: collapse; width: 100%; max-width: 500px;">
    <tr>
      <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Customer</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${customerEmail}</td>
    </tr>
    <tr>
      <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Amount</td>
      <td style="padding: 8px; border: 1px solid #ddd;">$${(amount / 100).toFixed(2)}</td>
    </tr>
    <tr>
      <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Reason</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${reason || "Not specified"}</td>
    </tr>
    <tr>
      <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Dispute ID</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${disputeId}</td>
    </tr>
  </table>
  
  <h2>Actions Taken:</h2>
  <ul>
    <li>✅ License suspended immediately</li>
    <li>✅ Customer status set to DISPUTED</li>
  </ul>
  
  <h2>Required Actions:</h2>
  <ol>
    <li>Gather evidence (activation logs, ToS acceptance, usage data)</li>
    <li>Submit response via Stripe Dashboard within deadline</li>
  </ol>
  
  <p><a href="https://dashboard.stripe.com/disputes/${disputeId}">View in Stripe Dashboard →</a></p>
</body>
</html>`,
      text: `DISPUTE ALERT

Customer: ${customerEmail}
Amount: $${(amount / 100).toFixed(2)}
Reason: ${reason || "Not specified"}
Dispute ID: ${disputeId}

Actions Taken:
- License suspended immediately
- Customer status set to DISPUTED

Required Actions:
1. Gather evidence (activation logs, ToS acceptance, usage data)
2. Submit response via Stripe Dashboard within deadline

View in Stripe: https://dashboard.stripe.com/disputes/${disputeId}`,
    }),
  };
}

// ============================================================================
// Default Export - Pre-configured templates (for backward compatibility)
// ============================================================================

/**
 * Get list of all available template names
 * Useful for validation and documentation
 */
export const TEMPLATE_NAMES = [
  "welcome",
  "licenseDelivery",
  "paymentFailed",
  "trialEnding",
  "reactivation",
  "cancellation",
  "licenseRevoked",
  "licenseSuspended",
  "winBack30",
  "winBack90",
  "enterpriseInvite",
  "disputeAlert",
];

/**
 * Event type to template name mapping
 * Used by event-driven email Lambda
 */
export const EVENT_TYPE_TO_TEMPLATE = {
  LICENSE_CREATED: "licenseDelivery",
  LICENSE_REVOKED: "licenseRevoked",
  LICENSE_SUSPENDED: "licenseSuspended",
  CUSTOMER_CREATED: "welcome",
  SUBSCRIPTION_CANCELLED: "cancellation",
  SUBSCRIPTION_REACTIVATED: "reactivation",
  PAYMENT_FAILED: "paymentFailed",
  TRIAL_ENDING: "trialEnding",
  TEAM_INVITE_CREATED: "enterpriseInvite",
};
