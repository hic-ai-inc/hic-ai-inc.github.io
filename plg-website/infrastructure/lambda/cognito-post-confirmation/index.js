/**
 * Cognito Post-Confirmation Lambda
 *
 * Triggered when a user successfully confirms their Cognito account.
 * Writes a CUSTOMER_CREATED event to DynamoDB to trigger welcome email
 * via the event-driven pipeline (DynamoDB Stream → StreamProcessor → SNS → EmailSender → SES).
 *
 * Trigger: Cognito PostConfirmation event
 * Layer Dependencies: hic-base-layer
 */
import { HicLog } from "hic-base-layer";
import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  marshall,
} from "hic-dynamodb-layer";

// ============================================================================
// Injectable Clients for Testing
// ============================================================================
let dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
  maxAttempts: 3,
});

export function __setDynamoClientForTests(client) {
  dynamoClient = client;
}

export function getDynamoClientInstance() {
  return dynamoClient;
}

// ============================================================================
// Configuration
// ============================================================================
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "hic-plg-staging";
const ENVIRONMENT = process.env.ENVIRONMENT || "staging";

// ============================================================================
// Lambda Handler
// ============================================================================
export const handler = async (event, context) => {
  const log = new HicLog("cognito-post-confirmation");

  // Extract user info from Cognito event
  const { userAttributes } = event.request;
  const email = userAttributes.email;
  const userId = event.userName; // Cognito user ID (sub)
  const name =
    userAttributes.name || userAttributes.given_name || email.split("@")[0];

  log.info("start", {
    userId,
    email: maskEmail(email),
    triggerSource: event.triggerSource,
  });

  try {
    // Write CUSTOMER_CREATED event to DynamoDB
    // This triggers the welcome email via event-driven pipeline
    await writeUserCreatedEvent(userId, email, name, log);

    log.info("complete", {
      userId,
      email: maskEmail(email),
      userCreatedEventWritten: true,
    });

    // Return the event unchanged (required by Cognito)
    return event;
  } catch (error) {
    log.error("failed", {
      userId,
      email: maskEmail(email),
      error: error.message,
    });

    // Don't throw - we don't want to block user signup if email verification fails
    // The user can still use the app, they just won't receive transactional emails
    // until they verify (which they can request again from the portal)
    return event;
  }
};

// ============================================================================
// DynamoDB Operations
// ============================================================================
async function writeUserCreatedEvent(userId, email, name, log) {
  const now = new Date().toISOString();

  // Check if user already exists (avoid duplicate CUSTOMER_CREATED events)
  const existing = await dynamoClient.send(
    new GetItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({
        PK: `USER#${userId}`,
        SK: "PROFILE",
      }),
    }),
  );

  if (existing.Item) {
    log.info("user-already-exists", { userId });
    return;
  }

  // Write new user profile with CUSTOMER_CREATED event type
  // This triggers DynamoDB Stream → StreamProcessor → SNS → email-sender → SES
  const userItem = {
    PK: `USER#${userId}`,
    SK: "PROFILE",
    // B0 FIX: Add GSI2PK for email-based lookup (enables getCustomerByEmail)
    GSI2PK: `EMAIL#${email.toLowerCase()}`,
    GSI2SK: "USER",
    userId,
    email,
    name,
    // Event-driven email fields
    eventType: "CUSTOMER_CREATED",
    emailsSent: {}, // Track sent emails to prevent duplicates
    // Metadata
    createdAt: now,
    updatedAt: now,
    environment: ENVIRONMENT,
  };

  await dynamoClient.send(
    new PutItemCommand({
      TableName: TABLE_NAME,
      Item: marshall(userItem),
      ConditionExpression: "attribute_not_exists(PK)",
    }),
  );

  log.info("user-created-event-written", {
    userId,
    email: maskEmail(email),
    eventType: "CUSTOMER_CREATED",
  });
}

// ============================================================================
// Utilities
// ============================================================================
function maskEmail(email) {
  if (!email) return "[no-email]";
  const [local, domain] = email.split("@");
  if (!domain) return "[invalid-email]";
  const maskedLocal =
    local.length > 2 ? `${local.slice(0, 2)}***` : `${local[0]}***`;
  return `${maskedLocal}@${domain}`;
}
