/**
 * DynamoDB Client
 *
 * Provides configured DynamoDB client and helper functions for
 * customer/license data operations.
 *
 * @see PLG Technical Specification v2 - Section 4
 * @see DDB Schema Addendum
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";

// Initialize DynamoDB client
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
});

// Document client for simplified operations
export const dynamodb = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "hic-plg-production";

// ===========================================
// CUSTOMER OPERATIONS
// ===========================================

/**
 * Get customer by Auth0 user ID
 */
export async function getCustomerByAuth0Id(auth0Id) {
  const result = await dynamodb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${auth0Id}`,
        SK: "PROFILE",
      },
    }),
  );
  return result.Item;
}

/**
 * Get customer by Stripe customer ID
 */
export async function getCustomerByStripeId(stripeCustomerId) {
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: {
        ":pk": `STRIPE#${stripeCustomerId}`,
      },
    }),
  );
  return result.Items?.[0];
}

/**
 * Get customer by email (for guest checkout linking)
 */
export async function getCustomerByEmail(email) {
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "GSI2",
      KeyConditionExpression: "GSI2PK = :pk",
      ExpressionAttributeValues: {
        ":pk": `EMAIL#${email.toLowerCase()}`,
      },
    }),
  );
  return result.Items?.[0];
}

/**
 * Create or update customer record
 */
export async function upsertCustomer({
  auth0Id,
  email,
  stripeCustomerId,
  keygenLicenseId,
  accountType,
  subscriptionStatus,
  metadata = {},
}) {
  const now = new Date().toISOString();
  const item = {
    PK: `USER#${auth0Id}`,
    SK: "PROFILE",
    GSI1PK: stripeCustomerId ? `STRIPE#${stripeCustomerId}` : undefined,
    GSI1SK: stripeCustomerId ? "CUSTOMER" : undefined,
    GSI2PK: `EMAIL#${email.toLowerCase()}`,
    GSI2SK: "USER",
    auth0Id,
    email: email.toLowerCase(),
    stripeCustomerId,
    keygenLicenseId,
    accountType,
    subscriptionStatus,
    ...metadata,
    updatedAt: now,
  };

  // Check if exists to preserve createdAt
  const existing = await getCustomerByAuth0Id(auth0Id);
  if (!existing) {
    item.createdAt = now;
  }

  await dynamodb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
    }),
  );

  return item;
}

/**
 * Update customer subscription status
 */
export async function updateCustomerSubscription(auth0Id, updates) {
  const updateExpressions = [];
  const expressionValues = {};
  const expressionNames = {};

  Object.entries(updates).forEach(([key, value]) => {
    updateExpressions.push(`#${key} = :${key}`);
    expressionValues[`:${key}`] = value;
    expressionNames[`#${key}`] = key;
  });

  updateExpressions.push("#updatedAt = :updatedAt");
  expressionValues[":updatedAt"] = new Date().toISOString();
  expressionNames["#updatedAt"] = "updatedAt";

  await dynamodb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${auth0Id}`,
        SK: "PROFILE",
      },
      UpdateExpression: `SET ${updateExpressions.join(", ")}`,
      ExpressionAttributeValues: expressionValues,
      ExpressionAttributeNames: expressionNames,
    }),
  );
}

// ===========================================
// LICENSE OPERATIONS
// ===========================================

/**
 * Get license by Keygen license ID
 */
export async function getLicense(keygenLicenseId) {
  const result = await dynamodb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `LICENSE#${keygenLicenseId}`,
        SK: "DETAILS",
      },
    }),
  );
  return result.Item;
}

/**
 * Get all licenses for a customer
 */
export async function getCustomerLicenses(auth0Id) {
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": `USER#${auth0Id}`,
        ":sk": "LICENSE#",
      },
    }),
  );
  return result.Items || [];
}

/**
 * Store license record
 */
export async function createLicense({
  keygenLicenseId,
  auth0Id,
  licenseKey,
  policyId,
  status,
  expiresAt,
  maxDevices,
  metadata = {},
}) {
  const now = new Date().toISOString();

  // License detail record
  const licenseItem = {
    PK: `LICENSE#${keygenLicenseId}`,
    SK: "DETAILS",
    GSI1PK: `USER#${auth0Id}`,
    GSI1SK: `LICENSE#${keygenLicenseId}`,
    keygenLicenseId,
    auth0Id,
    licenseKey,
    policyId,
    status,
    expiresAt,
    maxDevices,
    activatedDevices: 0,
    ...metadata,
    createdAt: now,
    updatedAt: now,
  };

  // User-license link record
  const userLicenseItem = {
    PK: `USER#${auth0Id}`,
    SK: `LICENSE#${keygenLicenseId}`,
    keygenLicenseId,
    status,
    createdAt: now,
  };

  await Promise.all([
    dynamodb.send(new PutCommand({ TableName: TABLE_NAME, Item: licenseItem })),
    dynamodb.send(
      new PutCommand({ TableName: TABLE_NAME, Item: userLicenseItem }),
    ),
  ]);

  return licenseItem;
}

/**
 * Update license status
 */
export async function updateLicenseStatus(
  keygenLicenseId,
  status,
  metadata = {},
) {
  const updateExpressions = ["#status = :status", "#updatedAt = :updatedAt"];
  const expressionValues = {
    ":status": status,
    ":updatedAt": new Date().toISOString(),
  };
  const expressionNames = {
    "#status": "status",
    "#updatedAt": "updatedAt",
  };

  Object.entries(metadata).forEach(([key, value]) => {
    updateExpressions.push(`#${key} = :${key}`);
    expressionValues[`:${key}`] = value;
    expressionNames[`#${key}`] = key;
  });

  await dynamodb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `LICENSE#${keygenLicenseId}`,
        SK: "DETAILS",
      },
      UpdateExpression: `SET ${updateExpressions.join(", ")}`,
      ExpressionAttributeValues: expressionValues,
      ExpressionAttributeNames: expressionNames,
    }),
  );
}

// ===========================================
// DEVICE OPERATIONS
// ===========================================

/**
 * Get devices for a license
 */
export async function getLicenseDevices(keygenLicenseId) {
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": `LICENSE#${keygenLicenseId}`,
        ":sk": "DEVICE#",
      },
    }),
  );
  return result.Items || [];
}

/**
 * Add device activation
 */
export async function addDeviceActivation({
  keygenLicenseId,
  keygenMachineId,
  fingerprint,
  name,
  platform,
  metadata = {},
}) {
  const now = new Date().toISOString();

  const item = {
    PK: `LICENSE#${keygenLicenseId}`,
    SK: `DEVICE#${keygenMachineId}`,
    keygenMachineId,
    fingerprint,
    name,
    platform,
    lastSeenAt: now,
    ...metadata,
    createdAt: now,
  };

  await dynamodb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));

  // Increment activated devices count
  await dynamodb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `LICENSE#${keygenLicenseId}`,
        SK: "DETAILS",
      },
      UpdateExpression:
        "SET activatedDevices = if_not_exists(activatedDevices, :zero) + :one",
      ExpressionAttributeValues: {
        ":zero": 0,
        ":one": 1,
      },
    }),
  );

  return item;
}

/**
 * Remove device activation
 */
export async function removeDeviceActivation(keygenLicenseId, keygenMachineId) {
  await dynamodb.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `LICENSE#${keygenLicenseId}`,
        SK: `DEVICE#${keygenMachineId}`,
      },
    }),
  );

  // Decrement activated devices count
  await dynamodb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `LICENSE#${keygenLicenseId}`,
        SK: "DETAILS",
      },
      UpdateExpression: "SET activatedDevices = activatedDevices - :one",
      ExpressionAttributeValues: {
        ":one": 1,
      },
    }),
  );
}

/**
 * Update device last seen timestamp
 */
export async function updateDeviceLastSeen(keygenLicenseId, keygenMachineId) {
  await dynamodb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `LICENSE#${keygenLicenseId}`,
        SK: `DEVICE#${keygenMachineId}`,
      },
      UpdateExpression: "SET lastSeenAt = :now",
      ExpressionAttributeValues: {
        ":now": new Date().toISOString(),
      },
    }),
  );
}
