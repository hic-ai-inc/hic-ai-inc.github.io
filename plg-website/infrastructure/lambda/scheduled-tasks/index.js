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
  UpdateCommand,
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
const FROM_EMAIL = process.env.SES_FROM_EMAIL;

/**
 * Handle trial reminder job
 * Queries for trialing customers expiring in 3 days and sends reminders
 */
async function handleTrialReminder(log) {
  log.info("running-job", { job: "trial-reminder" });
  const threeDaysFromNow = new Date();
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
  const targetDate = threeDaysFromNow.toISOString().split("T")[0];

  // Query for trialing customers expiring in 3 days
  // TODO: Implement actual query and email sending
  log.info("would-query", { targetDate, type: "trial-expiring" });
}

/**
 * Handle 30-day win-back job
 * Queries for customers who canceled 30 days ago and sends win-back emails
 */
async function handleWinback30(log) {
  log.info("running-job", { job: "winback-30" });
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const targetDate = thirtyDaysAgo.toISOString().split("T")[0];

  // Query for customers who canceled 30 days ago
  // TODO: Implement actual query and email sending
  log.info("would-query", { targetDate, type: "cancellation-30-days" });
}

/**
 * Handle 90-day win-back job
 * Queries for customers who canceled 90 days ago and sends win-back emails
 */
async function handleWinback90(log) {
  log.info("running-job", { job: "winback-90" });
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const targetDate = ninetyDaysAgo.toISOString().split("T")[0];

  // Query for customers who canceled 90 days ago
  // TODO: Implement actual query and email sending
  log.info("would-query", { targetDate, type: "cancellation-90-days" });
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
    await taskHandler(log);
    log.info("complete", { taskType, status: "success" });
    return { status: "success", taskType };
  } catch (error) {
    log.error("task-failed", { taskType, error: error.message });
    throw error;
  }
};
