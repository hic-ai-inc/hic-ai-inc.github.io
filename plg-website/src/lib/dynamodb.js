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
console.log(
  `[DynamoDB] Using table: ${TABLE_NAME} (env: ${process.env.DYNAMODB_TABLE_NAME || "not set"})`,
);

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
 * If multiple records exist, prioritize the one with a keygenLicenseId
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

  if (!result.Items || result.Items.length === 0) {
    return null;
  }

  // If multiple records, prefer one with a license
  const withLicense = result.Items.find((item) => item.keygenLicenseId);
  return withLicense || result.Items[0];
}

/**
 * Create or update customer record
 */
export async function upsertCustomer({
  userId,
  email,
  stripeCustomerId,
  keygenLicenseId,
  keygenLicenseKey,
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
    keygenLicenseKey,
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
 * Update customer's account type (tier)
 *
 * Used when changing between Individual and Business tiers.
 * This updates the accountType field which affects feature access.
 *
 * @param {string} userId - The user's sub claim from the identity provider
 * @param {string} accountType - New account type ('individual' or 'business')
 * @returns {Promise<void>}
 */
export async function updateCustomerAccountType(userId, accountType) {
  const logger = createLogger("updateCustomerAccountType");

  if (!["individual", "business"].includes(accountType)) {
    throw new Error(`Invalid account type: ${accountType}`);
  }

  logger.info("Updating customer account type", { userId, accountType });

  await dynamodb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: "PROFILE",
      },
      UpdateExpression:
        "SET #accountType = :accountType, #updatedAt = :updatedAt",
      ExpressionAttributeValues: {
        ":accountType": accountType,
        ":updatedAt": new Date().toISOString(),
      },
      ExpressionAttributeNames: {
        "#accountType": "accountType",
        "#updatedAt": "updatedAt",
      },
    }),
  );

  logger.info("Account type updated successfully", { userId, accountType });
}

/**
 * Migrate customer record from temporary userId to real Cognito userId.
 *
 * When a webhook creates a customer before the user signs in with Cognito,
 * it uses a temporary ID like `email:xxx@xxx.com`. When the user later
 * signs in and completes provisioning, we need to migrate the record to
 * use their real Cognito sub as the userId.
 *
 * This creates a new record with the real userId and deletes the old one.
 *
 * @param {string} oldUserId - The temporary userId (e.g., "email:user@example.com")
 * @param {string} newUserId - The real Cognito sub
 * @returns {Promise<Object>} The migrated customer record
 */
export async function migrateCustomerUserId(oldUserId, newUserId) {
  const logger = createLogger("migrateCustomerUserId");

  // Get the existing customer record
  const existing = await getCustomerByUserId(oldUserId);
  if (!existing) {
    logger.error("Original customer record not found", { oldUserId });
    throw new Error(`Customer not found with userId: ${oldUserId}`);
  }

  logger.info("Migrating customer userId", {
    oldUserId,
    newUserId,
    email: existing.email,
  });

  // Create new record with updated userId
  const now = new Date().toISOString();
  const newItem = {
    PK: `USER#${newUserId}`,
    SK: "PROFILE",
    GSI1PK: existing.stripeCustomerId
      ? `STRIPE#${existing.stripeCustomerId}`
      : undefined,
    GSI1SK: existing.stripeCustomerId ? "CUSTOMER" : undefined,
    GSI2PK: `EMAIL#${existing.email.toLowerCase()}`,
    GSI2SK: "USER",
    userId: newUserId,
    email: existing.email.toLowerCase(),
    stripeCustomerId: existing.stripeCustomerId,
    keygenLicenseId: existing.keygenLicenseId,
    keygenLicenseKey: existing.keygenLicenseKey,
    accountType: existing.accountType,
    subscriptionStatus: existing.subscriptionStatus,
    name: existing.name,
    createdAt: existing.createdAt,
    updatedAt: now,
    migratedFrom: oldUserId,
    migratedAt: now,
    // Preserve organization linkage for Business accounts
    ...(existing.orgId && { orgId: existing.orgId }),
    ...(existing.orgRole && { orgRole: existing.orgRole }),
    // Preserve any metadata
    ...(existing.notificationPreferences && {
      notificationPreferences: existing.notificationPreferences,
    }),
  };

  // Write new record
  await dynamodb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: newItem,
    }),
  );

  // Delete old record
  await dynamodb.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${oldUserId}`,
        SK: "PROFILE",
      },
    }),
  );

  logger.info("Customer userId migrated successfully", {
    oldUserId,
    newUserId,
  });
  return newItem;
}

/**
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

  logger.info("Updating customer profile", {
    userId,
    fields: Object.keys(updates),
  });

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
 * Get all licenses for a customer by email
 * This is the correct lookup method as licenses are stored with GSI1PK: USER#email:{email}
 * @param {string} email - The user's email address
 * @returns {Promise<Array>} Array of license records
 */
export async function getCustomerLicensesByEmail(email) {
  const normalizedEmail = email.toLowerCase();
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: {
        ":pk": `USER#email:${normalizedEmail}`,
      },
    }),
  );
  // Filter to only LICENSE records (not other GSI1 records)
  return (result.Items || []).filter(
    (item) => item.PK?.startsWith("LICENSE#") && item.SK === "DETAILS",
  );
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
 *
 * IMPORTANT: Uses fingerprint as the deduplication key.
 * If a device with the same fingerprint already exists for this license,
 * updates the existing record instead of creating a duplicate.
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

  // Check if a device with this fingerprint already exists for this license
  const existingDevices = await getLicenseDevices(keygenLicenseId);
  const existingDevice = existingDevices.find(
    (d) => d.fingerprint === fingerprint,
  );

  if (existingDevice) {
    // Update existing device record (may have new Keygen machine ID)
    await dynamodb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `LICENSE#${keygenLicenseId}`,
          SK: existingDevice.SK,
        },
        UpdateExpression:
          "SET keygenMachineId = :machineId, #name = :name, platform = :platform, lastSeenAt = :lastSeen",
        ExpressionAttributeNames: {
          "#name": "name",
        },
        ExpressionAttributeValues: {
          ":machineId": keygenMachineId,
          ":name": name,
          ":platform": platform,
          ":lastSeen": now,
        },
      }),
    );
    return {
      ...existingDevice,
      keygenMachineId,
      name,
      platform,
      lastSeenAt: now,
    };
  }

  // No existing device with this fingerprint - create new record
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

  // Increment activated devices count only for new devices
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
 * Create or update an organization record
 * Creates ORG#{orgId} / SK: DETAILS with organization metadata
 * @param {Object} params - Organization parameters
 * @param {string} params.orgId - Organization ID (usually stripeCustomerId)
 * @param {string} params.name - Organization name
 * @param {number} params.seatLimit - Number of seats purchased
 * @param {string} params.ownerId - Cognito user ID of owner
 * @param {string} params.ownerEmail - Email of owner
 * @param {string} [params.stripeCustomerId] - Stripe customer ID
 * @param {string} [params.stripeSubscriptionId] - Stripe subscription ID
 * @returns {Promise<Object>} Created/updated organization record
 */
export async function upsertOrganization({
  orgId,
  name,
  seatLimit,
  ownerId,
  ownerEmail,
  stripeCustomerId,
  stripeSubscriptionId,
}) {
  const logger = createLogger("upsertOrganization");
  const now = new Date().toISOString();

  try {
    const item = {
      PK: `ORG#${orgId}`,
      SK: "DETAILS",
      orgId,
      name: name || `Organization ${orgId.slice(-8)}`,
      seatLimit: seatLimit || 1,
      ownerId,
      ownerEmail: ownerEmail?.toLowerCase(),
      stripeCustomerId,
      stripeSubscriptionId,
      createdAt: now,
      updatedAt: now,
    };

    await dynamodb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
        // Don't overwrite if exists - use updateOrgSeatLimit for updates
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );

    logger.info("Organization created", { orgId, seatLimit, ownerId });
    return item;
  } catch (error) {
    // If org exists, update it instead
    if (error.name === "ConditionalCheckFailedException") {
      logger.info("Organization exists, updating", { orgId });
      return updateOrganization({
        orgId,
        name,
        seatLimit,
        stripeCustomerId,
        stripeSubscriptionId,
      });
    }

    logger.error("Failed to create organization", {
      orgId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Update an existing organization's details
 * @param {Object} params - Update parameters
 * @param {string} params.orgId - Organization ID
 * @param {string} [params.name] - New organization name
 * @param {number} [params.seatLimit] - New seat limit
 * @param {string} [params.stripeCustomerId] - Stripe customer ID
 * @param {string} [params.stripeSubscriptionId] - Stripe subscription ID
 * @returns {Promise<Object>} Updated organization record
 */
export async function updateOrganization({
  orgId,
  name,
  seatLimit,
  stripeCustomerId,
  stripeSubscriptionId,
}) {
  const logger = createLogger("updateOrganization");
  const now = new Date().toISOString();

  // Build update expression dynamically based on provided fields
  const updates = [];
  const expressionNames = {};
  const expressionValues = { ":updatedAt": now };

  if (name !== undefined) {
    updates.push("#name = :name");
    expressionNames["#name"] = "name";
    expressionValues[":name"] = name;
  }

  if (seatLimit !== undefined) {
    updates.push("seatLimit = :seatLimit");
    expressionValues[":seatLimit"] = seatLimit;
  }

  if (stripeCustomerId !== undefined) {
    updates.push("stripeCustomerId = :stripeCustomerId");
    expressionValues[":stripeCustomerId"] = stripeCustomerId;
  }

  if (stripeSubscriptionId !== undefined) {
    updates.push("stripeSubscriptionId = :stripeSubscriptionId");
    expressionValues[":stripeSubscriptionId"] = stripeSubscriptionId;
  }

  updates.push("updatedAt = :updatedAt");

  try {
    const result = await dynamodb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `ORG#${orgId}`,
          SK: "DETAILS",
        },
        UpdateExpression: `SET ${updates.join(", ")}`,
        ExpressionAttributeNames:
          Object.keys(expressionNames).length > 0 ? expressionNames : undefined,
        ExpressionAttributeValues: expressionValues,
        ReturnValues: "ALL_NEW",
      }),
    );

    logger.info("Organization updated", { orgId, seatLimit });
    return result.Attributes;
  } catch (error) {
    logger.error("Failed to update organization", {
      orgId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Update organization seat limit (called from Stripe webhook)
 * @param {string} orgId - Organization ID
 * @param {number} newSeatLimit - New seat limit from Stripe subscription quantity
 * @returns {Promise<Object>} Updated organization record
 */
export async function updateOrgSeatLimit(orgId, newSeatLimit) {
  const logger = createLogger("updateOrgSeatLimit");

  try {
    const result = await dynamodb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `ORG#${orgId}`,
          SK: "DETAILS",
        },
        UpdateExpression: "SET seatLimit = :seatLimit, updatedAt = :updatedAt",
        ExpressionAttributeValues: {
          ":seatLimit": newSeatLimit,
          ":updatedAt": new Date().toISOString(),
        },
        ReturnValues: "ALL_NEW",
      }),
    );

    logger.info("Organization seat limit updated", {
      orgId,
      newSeatLimit,
      previousLimit: result.Attributes?.seatLimit,
    });
    return result.Attributes;
  } catch (error) {
    logger.error("Failed to update organization seat limit", {
      orgId,
      newSeatLimit,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get organization details by ID
 * @param {string} orgId - Organization ID
 * @returns {Promise<Object|null>} Organization details or null if not found
 */
export async function getOrganization(orgId) {
  const logger = createLogger("getOrganization");

  try {
    const result = await dynamodb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `ORG#${orgId}`,
          SK: "DETAILS",
        },
      }),
    );

    return result.Item || null;
  } catch (error) {
    logger.error("Failed to get organization", {
      orgId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get organization by Stripe customer ID
 * @param {string} stripeCustomerId - Stripe customer ID
 * @returns {Promise<Object|null>} Organization details or null if not found
 */
export async function getOrganizationByStripeCustomer(stripeCustomerId) {
  const logger = createLogger("getOrganizationByStripeCustomer");

  try {
    // Query GSI for stripe customer ID
    // For now, we use stripeCustomerId as orgId, so direct lookup works
    const result = await dynamodb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `ORG#${stripeCustomerId}`,
          SK: "DETAILS",
        },
      }),
    );

    return result.Item || null;
  } catch (error) {
    logger.error("Failed to get organization by Stripe customer", {
      stripeCustomerId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get a user's organization membership by userId
 * Queries GSI1 to find what org a user belongs to
 * @param {string} userId - User ID (Cognito sub)
 * @returns {Promise<Object|null>} Membership record with orgId, role, status, or null if not a member
 */
export async function getUserOrgMembership(userId) {
  const logger = createLogger("getUserOrgMembership");

  try {
    // Query GSI1 where membership records have GSI1PK = USER#{userId}
    const result = await dynamodb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk AND begins_with(GSI1SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `USER#${userId}`,
          ":sk": "ORG#",
        },
      }),
    );

    // Return the first active membership (users can only be in one org)
    const membership = result.Items?.find((item) => item.status === "active");

    if (!membership) {
      logger.info("No org membership found", { userId });
      return null;
    }

    logger.info("Org membership found", {
      userId,
      orgId: membership.orgId,
      role: membership.role,
    });

    return {
      orgId: membership.orgId,
      role: membership.role,
      status: membership.status,
      email: membership.email,
      joinedAt: membership.joinedAt,
    };
  } catch (error) {
    logger.error("Failed to get user org membership", {
      userId,
      error: error.message,
    });
    throw error;
  }
}

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

// ===========================================
// VERSION CONFIG OPERATIONS (B2)
// ===========================================

/**
 * Get version config for auto-update integration
 * Returns the VERSION#mouse record with latest version info
 *
 * @param {string} productId - Product identifier (default: "mouse")
 * @returns {Promise<Object|null>} Version config or null if not found
 */
export async function getVersionConfig(productId = "mouse") {
  try {
    const result = await dynamodb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `VERSION#${productId}`,
          SK: "CURRENT",
        },
      }),
    );
    return result.Item || null;
  } catch (error) {
    console.error("Failed to get version config:", error.message);
    return null;
  }
}

/**
 * Update version config (for CI/CD release automation)
 *
 * @param {string} productId - Product identifier (default: "mouse")
 * @param {Object} versionInfo - Version info to update
 * @param {string} versionInfo.latestVersion - Latest version number
 * @param {string} versionInfo.releaseNotesUrl - URL to release notes
 * @returns {Promise<void>}
 */
export async function updateVersionConfig(productId = "mouse", versionInfo) {
  const now = new Date().toISOString();

  await dynamodb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `VERSION#${productId}`,
        SK: "CURRENT",
      },
      UpdateExpression:
        "SET latestVersion = :v, releaseNotesUrl = :r, updatedAt = :t",
      ExpressionAttributeValues: {
        ":v": versionInfo.latestVersion,
        ":r": versionInfo.releaseNotesUrl,
        ":t": now,
      },
    }),
  );
}
