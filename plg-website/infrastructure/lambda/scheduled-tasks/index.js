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
import { SESClient, SendEmailCommand, createTemplates } from "hic-ses-layer";
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

// Initialize templates from hic-ses-layer (single source of truth)
const emailTemplates = createTemplates({
  appUrl: APP_URL,
  companyName: "HIC AI",
  productName: "Mouse",
});

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

    const success = await sendEmail("winBack30", { email: customer.email }, log);

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

    const success = await sendEmail("winBack90", { email: customer.email }, log);

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
