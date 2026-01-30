/**
 * DynamoDB Client
 *
 * Provides configured DynamoDB client and helper functions for
 * customer/license data operations.
 *
 * @see PLG Technical Specification v2 - Section 4
 * @see DDB Schema Addendum
 */

// HIC DM Layer imports - centralized dependency management
import {
  DynamoDBClient,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
  DeleteCommand,
} from "../../../dm/layers/dynamodb/src/index.js";
import { HicLog, safeJsonParse } from "../../../dm/layers/base/src/index.js";

// Initialize DynamoDB client with HIC logging
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
});

// Service logger for all DynamoDB operations
const createLogger = (operation) => new HicLog(`plg-dynamodb-${operation}`);

// Document client for simplified operations
export const dynamodb = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

// Get table name from environment - MUST be explicitly set in production
// Fallback to staging to avoid accidentally writing to production
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "hic-plg-staging";

// Log table name on first import for debugging
console.log(`[DynamoDB] Using table: ${TABLE_NAME} (env: ${process.env.DYNAMODB_TABLE_NAME || "not set"})`);

// ===========================================
// CUSTOMER OPERATIONS
// ===========================================

/**
 * Get customer by identity provider user ID (Cognito sub)
 * @param {string} userId - The user's sub claim from the identity provider
 */
export async function getCustomerByUserId(userId) {
  const result = await dynamodb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: "PROFILE",
      },
    }),
  );
  return result.Item;
}

// Backward compatibility alias (deprecated, use getCustomerByUserId)
// Backward compatibility alias (deprecated, use getCustomerByUserId)
export const getCustomerByAuth0Id = getCustomerByUserId;

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
  userId,
  email,
  stripeCustomerId,
  keygenLicenseId,
  accountType,
  subscriptionStatus,
  metadata = {},
}) {
  const now = new Date().toISOString();
  const item = {
    PK: `USER#${userId}`,
    SK: "PROFILE",
    GSI1PK: stripeCustomerId ? `STRIPE#${stripeCustomerId}` : undefined,
    GSI1SK: stripeCustomerId ? "CUSTOMER" : undefined,
    GSI2PK: `EMAIL#${email.toLowerCase()}`,
    GSI2SK: "USER",
    userId,
    email: email.toLowerCase(),
    stripeCustomerId,
    keygenLicenseId,
    accountType,
    subscriptionStatus,
    ...metadata,
    updatedAt: now,
  };

  // Check if exists to preserve createdAt
  const existing = await getCustomerByUserId(userId);
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
export async function updateCustomerSubscription(userId, updates) {
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
        PK: `USER#${userId}`,
        SK: "PROFILE",
      },
      UpdateExpression: `SET ${updateExpressions.join(", ")}`,
      ExpressionAttributeValues: expressionValues,
      ExpressionAttributeNames: expressionNames,
    }),
  );
}

/**
 * Update customer profile fields (name, notification preferences, etc.)
 * Uses UpdateCommand to only modify specified fields without overwriting others.
 * 
 * @param {string} userId - The user's sub claim from the identity provider
 * @param {Object} updates - Fields to update (e.g., { name, notificationPreferences })
 * @returns {Promise<Object>} Updated attributes
 */
export async function updateCustomerProfile(userId, updates) {
  const logger = createLogger("updateCustomerProfile");
  const updateExpressions = [];
  const expressionValues = {};
  const expressionNames = {};

  // Build update expression from provided fields
  Object.entries(updates).forEach(([key, value]) => {
    if (value !== undefined) {
      updateExpressions.push(`#${key} = :${key}`);
      expressionValues[`:${key}`] = value;
      expressionNames[`#${key}`] = key;
    }
  });

  // Always update timestamp
  updateExpressions.push("#updatedAt = :updatedAt");
  expressionValues[":updatedAt"] = new Date().toISOString();
  expressionNames["#updatedAt"] = "updatedAt";

  logger.info("Updating customer profile", { userId, fields: Object.keys(updates) });

  const result = await dynamodb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: "PROFILE",
      },
      UpdateExpression: `SET ${updateExpressions.join(", ")}`,
      ExpressionAttributeValues: expressionValues,
      ExpressionAttributeNames: expressionNames,
      ReturnValues: "ALL_NEW",
    }),
  );

  logger.info("Customer profile updated", { userId });
  return result.Attributes;
}

// ===========================================
// LICENSE OPERATIONS
// ===========================================

/**
 * Get license by license key (for activation/validation endpoints)
 * Queries GSI2 by LICENSE_KEY#<key>
 */
export async function getLicenseByKey(licenseKey) {
  const logger = createLogger("getLicenseByKey");
  try {
    const result = await dynamodb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "GSI2",
        KeyConditionExpression: "GSI2PK = :pk",
        ExpressionAttributeValues: {
          ":pk": `LICENSE_KEY#${licenseKey}`,
        },
      }),
    );
    return result.Items?.[0] || null;
  } catch (error) {
    logger.error("Failed to get license by key", { error: error.message });
    throw error;
  }
}

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
export async function getCustomerLicenses(userId) {
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": `USER#${userId}`,
        ":sk": "LICENSE#",
      },
    }),
  );
  return result.Items || [];
}

/**
 * Store license record
 *
 * Event-Driven Architecture:
 *   This write triggers DynamoDB Stream → StreamProcessor → SNS → EmailSender
 *   The eventType field signals what email template to use.
 *   Required fields for email: email, licenseKey, planName
 */
export async function createLicense({
  keygenLicenseId,
  userId,
  licenseKey,
  policyId,
  status,
  expiresAt,
  maxDevices,
  email,
  planName,
  metadata = {},
}) {
  const now = new Date().toISOString();

  // License detail record
  // eventType triggers the email-sender Lambda via DynamoDB Streams
  const licenseItem = {
    PK: `LICENSE#${keygenLicenseId}`,
    SK: "DETAILS",
    GSI1PK: `USER#${userId}`,
    GSI1SK: `LICENSE#${keygenLicenseId}`,
    keygenLicenseId,
    userId,
    licenseKey,
    policyId,
    status,
    expiresAt,
    maxDevices,
    activatedDevices: 0,
    // Event-driven email fields
    eventType: "LICENSE_CREATED",
    email,
    planName,
    ...metadata,
    createdAt: now,
    updatedAt: now,
  };

  // User-license link record
  const userLicenseItem = {
    PK: `USER#${userId}`,
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

// ===========================================
// TRIAL OPERATIONS
// Per: Pre-E2E Infrastructure Requirements
// Pattern: PK=TRIAL#fingerprint, SK=TRIAL
// ===========================================

/**
 * Get trial record by machine fingerprint
 * Used to check if a trial has already been issued for this device
 * @param {string} fingerprint - Machine fingerprint (hex string)
 * @returns {Promise<Object|null>} Trial record or null
 */
export async function getTrialByFingerprint(fingerprint) {
  const logger = createLogger("getTrialByFingerprint");
  try {
    const result = await dynamodb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `TRIAL#${fingerprint}`,
          SK: "TRIAL",
        },
      }),
    );
    return result.Item || null;
  } catch (error) {
    logger.error("Failed to get trial by fingerprint", {
      fingerprint: fingerprint.substring(0, 8) + "...",
      error: error.message,
    });
    throw error;
  }
}

/**
 * Create a new trial record
 * Prevents trial farming by binding to machine fingerprint
 * @param {Object} params - Trial parameters
 * @param {string} params.fingerprint - Machine fingerprint
 * @param {string} params.trialToken - HMAC-signed trial token
 * @param {number} params.expiresAt - Expiration timestamp (ms)
 * @param {number} params.issuedAt - Issued timestamp (ms)
 * @param {number} params.createdAt - Created timestamp (ms)
 * @returns {Promise<Object>} Created trial record
 */
export async function createTrial({
  fingerprint,
  trialToken,
  expiresAt,
  issuedAt,
  createdAt,
}) {
  const logger = createLogger("createTrial");
  try {
    const item = {
      PK: `TRIAL#${fingerprint}`,
      SK: "TRIAL",
      fingerprint,
      trialToken,
      expiresAt,
      issuedAt,
      createdAt,
      // TTL: auto-delete 90 days after expiration (cleanup)
      ttl: Math.floor((expiresAt + 90 * 24 * 60 * 60 * 1000) / 1000),
    };

    await dynamodb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
        // Ensure we don't overwrite an existing trial
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );

    logger.info("Trial created", {
      fingerprint: fingerprint.substring(0, 8) + "...",
      expiresAt: new Date(expiresAt).toISOString(),
    });

    return item;
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      logger.warn("Trial already exists for fingerprint", {
        fingerprint: fingerprint.substring(0, 8) + "...",
      });
      throw new Error("Trial already exists for this device");
    }
    logger.error("Failed to create trial", {
      fingerprint: fingerprint.substring(0, 8) + "...",
      error: error.message,
    });
    throw error;
  }
}

/**
 * Record a heartbeat from a trial device
 * Updates lastSeenAt, or creates record if device hasn't initialized trial yet.
 * This allows us to track devices before they purchase, for later linking.
 * 
 * @param {string} deviceId - Device identifier (fingerprint or machineId)
 * @param {Object} metadata - Additional device metadata
 * @param {string} [metadata.fingerprint] - Machine fingerprint
 * @param {string} [metadata.machineId] - Machine ID
 * @param {string} [metadata.sessionId] - Session ID
 * @param {string} [metadata.lastSeen] - ISO timestamp
 * @returns {Promise<void>}
 */
export async function recordTrialHeartbeat(deviceId, metadata = {}) {
  const logger = createLogger("recordTrialHeartbeat");
  try {
    await dynamodb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `TRIAL#${deviceId}`,
          SK: "HEARTBEAT",
        },
        UpdateExpression:
          "SET lastSeenAt = :now, fingerprint = :fp, machineId = :mid, sessionId = :sid, updatedAt = :now",
        ExpressionAttributeValues: {
          ":now": metadata.lastSeen || new Date().toISOString(),
          ":fp": metadata.fingerprint || null,
          ":mid": metadata.machineId || null,
          ":sid": metadata.sessionId || null,
        },
      }),
    );
    logger.info("Trial heartbeat recorded", {
      deviceId: deviceId.substring(0, 8) + "...",
    });
  } catch (error) {
    logger.error("Failed to record trial heartbeat", {
      deviceId: deviceId.substring(0, 8) + "...",
      error: error.message,
    });
    throw error;
  }
}

// ===========================================
// ENTERPRISE ORGANIZATION OPERATIONS
// Per Addendum A.5/A.7
// ===========================================

/**
 * Get all members of an organization
 * @param {string} orgId - Organization ID
 * @returns {Promise<Array>} Organization members
 */
export async function getOrgMembers(orgId) {
  const logger = createLogger("getOrgMembers");
  try {
    const result = await dynamodb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `ORG#${orgId}`,
          ":sk": "MEMBER#",
        },
      }),
    );
    return result.Items || [];
  } catch (error) {
    logger.error("Failed to get org members", { orgId, error: error.message });
    throw error;
  }
}

/**
 * Update organization member status
 * @param {string} orgId - Organization ID
 * @param {string} memberId - Member user ID
 * @param {string} status - New status (active, suspended, revoked)
 * @returns {Promise<Object>} Updated member record
 */
export async function updateOrgMemberStatus(orgId, memberId, status) {
  const logger = createLogger("updateOrgMemberStatus");
  try {
    const result = await dynamodb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `ORG#${orgId}`,
          SK: `MEMBER#${memberId}`,
        },
        UpdateExpression: "SET #status = :status, updatedAt = :now",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":status": status,
          ":now": new Date().toISOString(),
        },
        ReturnValues: "ALL_NEW",
      }),
    );
    logger.info("Org member status updated", { orgId, memberId, status });
    return result.Attributes;
  } catch (error) {
    logger.error("Failed to update org member status", {
      orgId,
      memberId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Update organization member role
 * @param {string} orgId - Organization ID
 * @param {string} memberId - Member user ID
 * @param {string} role - New role (admin, member)
 * @returns {Promise<Object>} Updated member record
 */
export async function updateOrgMemberRole(orgId, memberId, role) {
  const logger = createLogger("updateOrgMemberRole");
  try {
    const result = await dynamodb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `ORG#${orgId}`,
          SK: `MEMBER#${memberId}`,
        },
        UpdateExpression: "SET #role = :role, updatedAt = :now",
        ExpressionAttributeNames: {
          "#role": "role",
        },
        ExpressionAttributeValues: {
          ":role": role,
          ":now": new Date().toISOString(),
        },
        ReturnValues: "ALL_NEW",
      }),
    );
    logger.info("Org member role updated", { orgId, memberId, role });
    return result.Attributes;
  } catch (error) {
    logger.error("Failed to update org member role", {
      orgId,
      memberId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get organization license usage statistics
 * @param {string} orgId - Organization ID
 * @returns {Promise<Object>} License usage stats
 */
export async function getOrgLicenseUsage(orgId) {
  const logger = createLogger("getOrgLicenseUsage");
  try {
    // Get org details for seat limit
    const orgResult = await dynamodb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `ORG#${orgId}`,
          SK: "DETAILS",
        },
      }),
    );

    // Get all active members
    const membersResult = await dynamodb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        FilterExpression: "#status = :active",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":pk": `ORG#${orgId}`,
          ":sk": "MEMBER#",
          ":active": "active",
        },
      }),
    );

    const org = orgResult.Item || {};
    const activeMembers = membersResult.Items?.length || 0;
    const seatLimit = org.seatLimit || 0;

    return {
      orgId,
      seatLimit,
      seatsUsed: activeMembers,
      seatsAvailable: Math.max(0, seatLimit - activeMembers),
      utilizationPercent:
        seatLimit > 0 ? Math.round((activeMembers / seatLimit) * 100) : 0,
    };
  } catch (error) {
    logger.error("Failed to get org license usage", {
      orgId,
      error: error.message,
    });
    throw error;
  }
}

// ===========================================
// ORGANIZATION INVITE OPERATIONS
// Per PLG Technical Specification v2 - Team Management
// ===========================================

/**
 * Generate a secure invite token
 * @returns {string} Random invite token
 */
function generateInviteToken() {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * Create an organization invite
 * @param {string} orgId - Organization ID
 * @param {string} email - Invitee email address
 * @param {string} role - Role to assign (admin, member)
 * @param {string} invitedBy - User ID of inviter
 * @returns {Promise<Object>} Created invite record
 */
export async function createOrgInvite(orgId, email, role, invitedBy) {
  const logger = createLogger("createOrgInvite");
  const normalizedEmail = email.toLowerCase();
  const inviteId = `inv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const token = generateInviteToken();
  const now = new Date().toISOString();
  const expiresAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000,
  ).toISOString(); // 7 days

  try {
    const item = {
      PK: `ORG#${orgId}`,
      SK: `INVITE#${inviteId}`,
      GSI1PK: `INVITE_TOKEN#${token}`,
      GSI1SK: `ORG#${orgId}`,
      GSI2PK: `EMAIL#${normalizedEmail}`,
      GSI2SK: `INVITE#${orgId}`,
      inviteId,
      orgId,
      email: normalizedEmail,
      role,
      token,
      status: "pending",
      invitedBy,
      createdAt: now,
      expiresAt,
    };

    await dynamodb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );

    logger.info("Org invite created", { orgId, email: normalizedEmail, role });
    return item;
  } catch (error) {
    logger.error("Failed to create org invite", {
      orgId,
      email: normalizedEmail,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get all pending invites for an organization
 * @param {string} orgId - Organization ID
 * @returns {Promise<Array>} Pending invites
 */
export async function getOrgInvites(orgId) {
  const logger = createLogger("getOrgInvites");
  try {
    const result = await dynamodb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        FilterExpression: "#status = :pending",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":pk": `ORG#${orgId}`,
          ":sk": "INVITE#",
          ":pending": "pending",
        },
      }),
    );
    return result.Items || [];
  } catch (error) {
    logger.error("Failed to get org invites", { orgId, error: error.message });
    throw error;
  }
}

/**
 * Resend an organization invite by refreshing its expiration
 * @param {string} orgId - Organization ID
 * @param {string} inviteId - Invite ID
 * @returns {Promise<Object>} Updated invite record
 */
export async function resendOrgInvite(orgId, inviteId) {
  const logger = createLogger("resendOrgInvite");
  const newExpiresAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000,
  ).toISOString(); // Fresh 7 days

  try {
    const result = await dynamodb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `ORG#${orgId}`,
          SK: `INVITE#${inviteId}`,
        },
        UpdateExpression:
          "SET expiresAt = :expiresAt, resentAt = :now, resentCount = if_not_exists(resentCount, :zero) + :one",
        ExpressionAttributeValues: {
          ":expiresAt": newExpiresAt,
          ":now": new Date().toISOString(),
          ":zero": 0,
          ":one": 1,
        },
        ReturnValues: "ALL_NEW",
      }),
    );
    logger.info("Org invite resent", { orgId, inviteId });
    return result.Attributes;
  } catch (error) {
    logger.error("Failed to resend org invite", {
      orgId,
      inviteId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get invite by token (for acceptance flow)
 * @param {string} token - Invite token
 * @returns {Promise<Object|null>} Invite record or null
 */
export async function getInviteByToken(token) {
  const logger = createLogger("getInviteByToken");
  try {
    const result = await dynamodb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: {
          ":pk": `INVITE_TOKEN#${token}`,
        },
      }),
    );
    return result.Items?.[0] || null;
  } catch (error) {
    logger.error("Failed to get invite by token", { error: error.message });
    throw error;
  }
}

/**
 * Accept an organization invite
 * @param {string} token - Invite token
 * @param {string} userId - User ID (Cognito sub) of accepting user
 * @param {string} userName - Name of accepting user
 * @returns {Promise<Object>} Result with org membership
 */
export async function acceptOrgInvite(token, userId, userName) {
  const logger = createLogger("acceptOrgInvite");

  try {
    // Get the invite
    const invite = await getInviteByToken(token);
    if (!invite) {
      throw new Error("Invite not found");
    }
    if (invite.status !== "pending") {
      throw new Error("Invite is no longer valid");
    }
    if (new Date(invite.expiresAt) < new Date()) {
      throw new Error("Invite has expired");
    }

    const now = new Date().toISOString();

    // Mark invite as accepted
    await dynamodb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `ORG#${invite.orgId}`,
          SK: `INVITE#${invite.inviteId}`,
        },
        UpdateExpression:
          "SET #status = :accepted, acceptedAt = :now, acceptedBy = :userId",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":accepted": "accepted",
          ":now": now,
          ":userId": userId,
        },
      }),
    );

    // Create org membership
    const memberItem = {
      PK: `ORG#${invite.orgId}`,
      SK: `MEMBER#${userId}`,
      GSI1PK: `USER#${userId}`,
      GSI1SK: `ORG#${invite.orgId}`,
      GSI2PK: `EMAIL#${invite.email}`,
      GSI2SK: `MEMBER#${invite.orgId}`,
      memberId: userId,
      orgId: invite.orgId,
      email: invite.email,
      name: userName,
      role: invite.role,
      status: "active",
      joinedAt: now,
      inviteId: invite.inviteId,
    };

    await dynamodb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: memberItem,
      }),
    );

    logger.info("Org invite accepted", {
      orgId: invite.orgId,
      userId,
      role: invite.role,
    });
    return { invite, membership: memberItem };
  } catch (error) {
    logger.error("Failed to accept org invite", {
      token: token.substring(0, 8) + "...",
      error: error.message,
    });
    throw error;
  }
}

/**
 * Delete/revoke an organization invite
 * @param {string} orgId - Organization ID
 * @param {string} inviteId - Invite ID
 * @returns {Promise<void>}
 */
export async function deleteOrgInvite(orgId, inviteId) {
  const logger = createLogger("deleteOrgInvite");
  try {
    await dynamodb.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `ORG#${orgId}`,
          SK: `INVITE#${inviteId}`,
        },
      }),
    );
    logger.info("Org invite deleted", { orgId, inviteId });
  } catch (error) {
    logger.error("Failed to delete org invite", {
      orgId,
      inviteId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Remove a member from an organization
 * @param {string} orgId - Organization ID
 * @param {string} memberId - Member user ID
 * @returns {Promise<void>}
 */
export async function removeOrgMember(orgId, memberId) {
  const logger = createLogger("removeOrgMember");
  try {
    await dynamodb.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `ORG#${orgId}`,
          SK: `MEMBER#${memberId}`,
        },
      }),
    );
    logger.info("Org member removed", { orgId, memberId });
  } catch (error) {
    logger.error("Failed to remove org member", {
      orgId,
      memberId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Add a member to an organization (direct add, no invite)
 * Used for owner setup or bulk imports
 * @param {Object} params - Member parameters
 * @returns {Promise<Object>} Created member record
 */
export async function addOrgMember({
  orgId,
  userId,
  email,
  name,
  role = "member",
}) {
  const logger = createLogger("addOrgMember");
  const normalizedEmail = email.toLowerCase();
  const now = new Date().toISOString();

  try {
    const item = {
      PK: `ORG#${orgId}`,
      SK: `MEMBER#${userId}`,
      GSI1PK: `USER#${userId}`,
      GSI1SK: `ORG#${orgId}`,
      GSI2PK: `EMAIL#${normalizedEmail}`,
      GSI2SK: `MEMBER#${orgId}`,
      memberId: userId,
      orgId,
      email: normalizedEmail,
      name,
      role,
      status: "active",
      joinedAt: now,
    };

    await dynamodb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
      }),
    );

    logger.info("Org member added", { orgId, userId, role });
    return item;
  } catch (error) {
    logger.error("Failed to add org member", {
      orgId,
      userId,
      error: error.message,
    });
    throw error;
  }
}
