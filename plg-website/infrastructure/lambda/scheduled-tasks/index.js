/**
 * Scheduled Tasks Lambda
 *
 * Runs scheduled jobs:
 * - Trial ending reminders (3 days before)
 * - Win-back emails (30 days, 90 days after cancellation)
 *
 * Triggered by: EventBridge scheduled rules
 *
 * Layer Dependencies: hic-base-layer, hic-dynamodb-layer, hic-ses-layer
 */
import {
  DynamoDBClient,
  DynamoDBDocumentClient,
  ScanCommand,
  QueryCommand,
  UpdateCommand,
  PutCommand,
} from "hic-dynamodb-layer";
import { SESClient, SendEmailCommand } from "hic-ses-layer";
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

let sesClient = new SESClient({
  region: process.env.AWS_REGION || "us-east-1",
  maxAttempts: 3,
});

export function __setDynamoClientForTests(client) {
  dynamoClient = client;
}
export function getDynamoClientInstance() {
  return dynamoClient;
}

export function __setSesClientForTests(client) {
  sesClient = client;
}
export function getSesClientInstance() {
  return sesClient;
}

// ============================================================================
// Configuration
// ============================================================================
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME;
const FROM_EMAIL = process.env.SES_FROM_EMAIL || "noreply@hic-ai.com";
const APP_URL = process.env.APP_URL || "https://mouse.hic-ai.com";
const COMPANY_NAME = "HIC AI";
const PRODUCT_NAME = "Mouse";

// ============================================================================
// Email Templates
// ============================================================================
const emailTemplates = {
  trialEnding: ({ email, daysRemaining }) => ({
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

  winback30: ({ email }) => ({
    subject: `We miss you! Come back to ${PRODUCT_NAME}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0B1220; color: #F6F8FB; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto;">
    <h1 style="color: #F6F8FB; margin-bottom: 24px;">We Miss You! 💙</h1>
    <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
      It's been a month since you canceled your ${PRODUCT_NAME} subscription.
    </p>
    <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
      Since then, we've been working hard on improvements:
    </p>
    <ul style="color: #B8C4D0; font-size: 14px; line-height: 1.8;">
      <li>Faster performance and reliability</li>
      <li>New editing tools and operations</li>
      <li>Better integration with AI agents</li>
    </ul>
    <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
      Ready to give us another try?
    </p>
    <div style="margin: 32px 0;">
      <a href="${APP_URL}/pricing" style="display: inline-block; background-color: #C9DBF0; color: #0B1220; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
        Resubscribe Now
      </a>
    </div>
    <hr style="border: none; border-top: 1px solid rgba(201, 219, 240, 0.2); margin: 32px 0;">
    <p style="color: #6B7C93; font-size: 12px;">${COMPANY_NAME} • Precision Editing Tools for AI Coding Agents</p>
  </div>
</body>
</html>`,
    text: `We Miss You!
\nIt's been a month since you canceled your ${PRODUCT_NAME} subscription.
\nSince then, we've made improvements:\n- Faster performance and reliability\n- New editing tools and operations\n- Better integration with AI agents
\nResubscribe now: ${APP_URL}/pricing
\n${COMPANY_NAME}`,
  }),

  winback90: ({ email }) => ({
    subject: `One more chance? ${PRODUCT_NAME} has evolved`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0B1220; color: #F6F8FB; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto;">
    <h1 style="color: #F6F8FB; margin-bottom: 24px;">A Lot Has Changed 🚀</h1>
    <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
      It's been 90 days since you last used ${PRODUCT_NAME}, and we've transformed.
    </p>
    <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
      ${PRODUCT_NAME} now offers the most precise file editing tools available for AI coding agents.
    </p>
    <p style="color: #B8C4D0; font-size: 16px; line-height: 1.6;">
      We'd love to have you back. Your feedback helped shape many of our improvements.
    </p>
    <div style="margin: 32px 0;">
      <a href="${APP_URL}/pricing" style="display: inline-block; background-color: #C9DBF0; color: #0B1220; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
        See What's New
      </a>
    </div>
    <hr style="border: none; border-top: 1px solid rgba(201, 219, 240, 0.2); margin: 32px 0;">
    <p style="color: #6B7C93; font-size: 12px;">${COMPANY_NAME} • Precision Editing Tools for AI Coding Agents</p>
  </div>
</body>
</html>`,
    text: `A Lot Has Changed
\nIt's been 90 days since you last used ${PRODUCT_NAME}, and we've transformed.
\n${PRODUCT_NAME} now offers the most precise file editing tools available for AI coding agents.
\nWe'd love to have you back.
\nSee what's new: ${APP_URL}/pricing
\n${COMPANY_NAME}`,
  }),
};

// ============================================================================
// Helper: Send email via SES
// ============================================================================
async function sendEmail(template, data, log) {
  const emailContent = emailTemplates[template](data);

  try {
    await sesClient.send(
      new SendEmailCommand({
        Source: FROM_EMAIL,
        Destination: { ToAddresses: [data.email] },
        Message: {
          Subject: { Data: emailContent.subject },
          Body: {
            Html: { Data: emailContent.html },
            Text: { Data: emailContent.text },
          },
        },
      }),
    );
    log.info("email-sent", {
      template,
      email: data.email.replace(/(.{2}).*@/, "$1***@"),
    });
    return true;
  } catch (error) {
    log.error("email-failed", {
      template,
      email: data.email.replace(/(.{2}).*@/, "$1***@"),
      error: error.message,
    });
    return false;
  }
}

// ============================================================================
// Helper: Mark email as sent (prevent duplicates)
// ============================================================================
async function markEmailSent(userId, emailType) {
  const now = new Date().toISOString();
  await dynamoClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: "PROFILE",
      },
      UpdateExpression: "SET #emailsSent.#emailType = :timestamp",
      ExpressionAttributeNames: {
        "#emailsSent": "emailsSent",
        "#emailType": emailType,
      },
      ExpressionAttributeValues: {
        ":timestamp": now,
      },
    }),
  );
}

// ============================================================================
// Helper: Check if email was already sent
// ============================================================================
function wasEmailSent(customer, emailType) {
  return customer.emailsSent?.[emailType] !== undefined;
}

// ============================================================================
// Helper: Calculate date strings for queries
// ============================================================================
function getDateRange(daysOffset) {
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + daysOffset);
  const startOfDay = targetDate.toISOString().split("T")[0] + "T00:00:00.000Z";
  const endOfDay = targetDate.toISOString().split("T")[0] + "T23:59:59.999Z";
  return { startOfDay, endOfDay, dateString: targetDate.toISOString().split("T")[0] };
}

/**
 * Handle trial reminder job
 * Queries for trialing customers expiring in 3 days and sends reminders
 */
async function handleTrialReminder(log) {
  log.info("running-job", { job: "trial-reminder" });
  const { startOfDay, endOfDay, dateString } = getDateRange(3);

  // Scan for trialing customers with expiration in target range
  // Note: In production, use GSI on subscriptionStatus + expiresAt for efficiency
  const result = await dynamoClient.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression:
        "SK = :sk AND subscriptionStatus = :status AND currentPeriodEnd BETWEEN :start AND :end",
      ExpressionAttributeValues: {
        ":sk": "PROFILE",
        ":status": "trialing",
        ":start": startOfDay,
        ":end": endOfDay,
      },
    }),
  );

  const customers = result.Items || [];
  log.info("found-trialing-customers", { count: customers.length, targetDate: dateString });

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const customer of customers) {
    // Skip if already sent this email
    if (wasEmailSent(customer, "trial-reminder")) {
      skipped++;
      continue;
    }

    const success = await sendEmail("trialEnding", {
      email: customer.email,
      daysRemaining: 3,
    }, log);

    if (success) {
      await markEmailSent(customer.userId, "trial-reminder");
      sent++;
    } else {
      failed++;
    }
  }

  log.info("trial-reminder-complete", { sent, skipped, failed, total: customers.length });
  return { sent, skipped, failed };
}

/**
 * Handle 30-day win-back job
 * Queries for customers who canceled 30 days ago and sends win-back emails
 */
async function handleWinback30(log) {
  log.info("running-job", { job: "winback-30" });
  const { startOfDay, endOfDay, dateString } = getDateRange(-30);

  // Scan for canceled customers with canceledAt in target range
  const result = await dynamoClient.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression:
        "SK = :sk AND subscriptionStatus = :status AND canceledAt BETWEEN :start AND :end",
      ExpressionAttributeValues: {
        ":sk": "PROFILE",
        ":status": "canceled",
        ":start": startOfDay,
        ":end": endOfDay,
      },
    }),
  );

  const customers = result.Items || [];
  log.info("found-canceled-customers-30", { count: customers.length, targetDate: dateString });

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const customer of customers) {
    // Skip if already sent this email
    if (wasEmailSent(customer, "winback-30")) {
      skipped++;
      continue;
    }

    const success = await sendEmail("winback30", { email: customer.email }, log);

    if (success) {
      await markEmailSent(customer.userId, "winback-30");
      sent++;
    } else {
      failed++;
    }
  }

  log.info("winback-30-complete", { sent, skipped, failed, total: customers.length });
  return { sent, skipped, failed };
}

/**
 * Handle 90-day win-back job
 * Queries for customers who canceled 90 days ago and sends win-back emails
 */
async function handleWinback90(log) {
  log.info("running-job", { job: "winback-90" });
  const { startOfDay, endOfDay, dateString } = getDateRange(-90);

  // Scan for canceled customers with canceledAt in target range
  const result = await dynamoClient.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression:
        "SK = :sk AND subscriptionStatus = :status AND canceledAt BETWEEN :start AND :end",
      ExpressionAttributeValues: {
        ":sk": "PROFILE",
        ":status": "canceled",
        ":start": startOfDay,
        ":end": endOfDay,
      },
    }),
  );

  const customers = result.Items || [];
  log.info("found-canceled-customers-90", { count: customers.length, targetDate: dateString });

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const customer of customers) {
    // Skip if already sent this email
    if (wasEmailSent(customer, "winback-90")) {
      skipped++;
      continue;
    }

    const success = await sendEmail("winback90", { email: customer.email }, log);

    if (success) {
      await markEmailSent(customer.userId, "winback-90");
      sent++;
    } else {
      failed++;
    }
  }

  log.info("winback-90-complete", { sent, skipped, failed, total: customers.length });
  return { sent, skipped, failed };
}

/**
 * Task handlers map
 */
const TASK_HANDLERS = {
  "trial-reminder": handleTrialReminder,
  "winback-30": handleWinback30,
  "winback-90": handleWinback90,
};

/**
 * Lambda handler
 * @param {Object} event - EventBridge scheduled event
 */
export const handler = async (event) => {
  const log = new HicLog("scheduled-tasks");
  const taskType = event.taskType || event["detail-type"] || "unknown";
  log.info("start", { taskType });

  const taskHandler = TASK_HANDLERS[taskType];
  if (!taskHandler) {
    log.warn("unknown-task", { taskType });
    return { status: "skipped", taskType };
  }

  try {
    const result = await taskHandler(log);
    log.info("complete", { taskType, status: "success", ...result });
    return { status: "success", taskType, ...result };
  } catch (error) {
    log.error("task-failed", { taskType, error: error.message });
    throw error;
  }
};
