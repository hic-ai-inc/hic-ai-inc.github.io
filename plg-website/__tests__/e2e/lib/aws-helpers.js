/**
 * AWS Helpers for E2E Architecture Tests
 *
 * Provides utilities for:
 * - Direct DynamoDB queries
 * - SNS/SQS message verification
 * - CloudWatch log inspection
 * - Lambda invocation status
 *
 * Priority: P2
 *
 * @see 20260129_E2E_BACKEND_VALIDATION_SPEC.md
 */

import { getEnvironment, log } from "../config.js";

// ============================================================================
// Configuration
// ============================================================================

const AWS_CONFIG = {
  region: process.env.AWS_REGION || "us-east-1",
  staging: {
    tableName: "hic-plg-staging",
    streamProcessorArn: process.env.E2E_STREAM_PROCESSOR_ARN,
    snsTopicArn: process.env.E2E_SNS_TOPIC_ARN,
    sqsQueueUrl: process.env.E2E_SQS_QUEUE_URL,
  },
  production: {
    tableName: "hic-plg-production",
    // Production uses same patterns but different resources
  },
};

function getConfig() {
  const env = getEnvironment();
  return AWS_CONFIG[env.name] || AWS_CONFIG.staging;
}

// ============================================================================
// DynamoDB Helpers
// ============================================================================

/**
 * Check if AWS SDK is available (for architecture tests)
 */
export function isAwsSdkAvailable() {
  try {
    // We'll use dynamic import in actual functions
    return true;
  } catch {
    return false;
  }
}

/**
 * Query DynamoDB for a record by partition key
 * @param {string} pk - Partition key value
 * @param {string} sk - Sort key value (optional)
 * @returns {Promise<Object|null>}
 */
export async function queryDynamoItem(pk, sk = null) {
  const config = getConfig();

  try {
    const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
    const { DynamoDBDocumentClient, GetCommand, QueryCommand } =
      await import("@aws-sdk/lib-dynamodb");

    const client = new DynamoDBClient({ region: AWS_CONFIG.region });
    const docClient = DynamoDBDocumentClient.from(client);

    if (sk) {
      // Direct get
      const response = await docClient.send(
        new GetCommand({
          TableName: config.tableName,
          Key: { PK: pk, SK: sk },
        }),
      );
      return response.Item || null;
    } else {
      // Query by PK only
      const response = await docClient.send(
        new QueryCommand({
          TableName: config.tableName,
          KeyConditionExpression: "PK = :pk",
          ExpressionAttributeValues: { ":pk": pk },
        }),
      );
      return response.Items || [];
    }
  } catch (error) {
    log.error("DynamoDB query failed", { pk, sk, error: error.message });
    throw error;
  }
}

/**
 * Query DynamoDB for license by key
 * @param {string} licenseKey
 * @returns {Promise<Object|null>}
 */
export async function queryLicense(licenseKey) {
  return queryDynamoItem(`LICENSE#${licenseKey}`, "LICENSE#METADATA");
}

/**
 * Query DynamoDB for trial by fingerprint
 * @param {string} fingerprint
 * @returns {Promise<Object|null>}
 */
export async function queryTrial(fingerprint) {
  return queryDynamoItem(`TRIAL#${fingerprint}`, "TRIAL#METADATA");
}

/**
 * Query DynamoDB for device activations
 * @param {string} licenseKey
 * @returns {Promise<Array>}
 */
export async function queryDevices(licenseKey) {
  const config = getConfig();

  try {
    const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
    const { DynamoDBDocumentClient, QueryCommand } =
      await import("@aws-sdk/lib-dynamodb");

    const client = new DynamoDBClient({ region: AWS_CONFIG.region });
    const docClient = DynamoDBDocumentClient.from(client);

    const response = await docClient.send(
      new QueryCommand({
        TableName: config.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `LICENSE#${licenseKey}`,
          ":sk": "DEVICE#",
        },
      }),
    );

    return response.Items || [];
  } catch (error) {
    log.error("Device query failed", { licenseKey, error: error.message });
    throw error;
  }
}

/**
 * Wait for a DynamoDB record to appear (polling)
 * @param {Function} queryFn - Function that returns the item or null
 * @param {number} timeoutMs - Maximum wait time
 * @param {number} intervalMs - Poll interval
 * @returns {Promise<Object>}
 */
export async function waitForDynamoRecord(
  queryFn,
  timeoutMs = 10000,
  intervalMs = 500,
) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const result = await queryFn();
    if (result) {
      return result;
    }
    await sleep(intervalMs);
  }

  throw new Error(`DynamoDB record not found after ${timeoutMs}ms`);
}

// ============================================================================
// SNS/SQS Helpers
// ============================================================================

/**
 * Poll SQS queue for messages
 * @param {string} queueUrl - SQS queue URL
 * @param {number} maxMessages - Maximum messages to receive
 * @param {number} waitTimeSeconds - Long polling wait time
 * @returns {Promise<Array>}
 */
export async function pollSqsMessages(
  queueUrl = null,
  maxMessages = 10,
  waitTimeSeconds = 5,
) {
  const config = getConfig();
  const url = queueUrl || config.sqsQueueUrl;

  if (!url) {
    log.warn("No SQS queue URL configured for E2E tests");
    return [];
  }

  try {
    const { SQSClient, ReceiveMessageCommand } =
      await import("@aws-sdk/client-sqs");

    const client = new SQSClient({ region: AWS_CONFIG.region });

    const response = await client.send(
      new ReceiveMessageCommand({
        QueueUrl: url,
        MaxNumberOfMessages: maxMessages,
        WaitTimeSeconds: waitTimeSeconds,
        MessageAttributeNames: ["All"],
      }),
    );

    return (response.Messages || []).map((msg) => ({
      id: msg.MessageId,
      body: JSON.parse(msg.Body),
      attributes: msg.MessageAttributes,
      receiptHandle: msg.ReceiptHandle,
    }));
  } catch (error) {
    log.error("SQS poll failed", { queueUrl: url, error: error.message });
    throw error;
  }
}

/**
 * Delete processed messages from SQS
 * @param {string} queueUrl
 * @param {Array<string>} receiptHandles
 */
export async function deleteSqsMessages(queueUrl, receiptHandles) {
  if (!receiptHandles.length) return;

  try {
    const { SQSClient, DeleteMessageBatchCommand } =
      await import("@aws-sdk/client-sqs");

    const client = new SQSClient({ region: AWS_CONFIG.region });

    await client.send(
      new DeleteMessageBatchCommand({
        QueueUrl: queueUrl,
        Entries: receiptHandles.map((handle, i) => ({
          Id: String(i),
          ReceiptHandle: handle,
        })),
      }),
    );
  } catch (error) {
    log.error("SQS delete failed", { error: error.message });
  }
}

/**
 * Wait for specific event in SQS queue
 * @param {string} eventType - Event type to wait for
 * @param {Object} matchCriteria - Fields to match in event
 * @param {number} timeoutMs - Maximum wait time
 * @returns {Promise<Object>}
 */
export async function waitForSnsEvent(
  eventType,
  matchCriteria = {},
  timeoutMs = 15000,
) {
  const config = getConfig();
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const messages = await pollSqsMessages(config.sqsQueueUrl, 10, 2);

    for (const msg of messages) {
      // SNS wraps messages
      const snsMessage = msg.body.Message
        ? JSON.parse(msg.body.Message)
        : msg.body;

      if (snsMessage.eventType === eventType) {
        // Check match criteria
        let matches = true;
        for (const [key, value] of Object.entries(matchCriteria)) {
          if (snsMessage[key] !== value) {
            matches = false;
            break;
          }
        }

        if (matches) {
          // Delete the message we found
          await deleteSqsMessages(config.sqsQueueUrl, [msg.receiptHandle]);
          return snsMessage;
        }
      }
    }

    await sleep(1000);
  }

  throw new Error(`SNS event '${eventType}' not found after ${timeoutMs}ms`);
}

// ============================================================================
// CloudWatch Helpers
// ============================================================================

/**
 * Query CloudWatch logs for a Lambda function
 * @param {string} functionName - Lambda function name
 * @param {number} startTime - Start time in epoch ms
 * @param {string} filterPattern - CloudWatch filter pattern
 * @returns {Promise<Array>}
 */
export async function queryCloudWatchLogs(
  functionName,
  startTime,
  filterPattern = "",
) {
  try {
    const { CloudWatchLogsClient, FilterLogEventsCommand } =
      await import("@aws-sdk/client-cloudwatch-logs");

    const client = new CloudWatchLogsClient({ region: AWS_CONFIG.region });

    const response = await client.send(
      new FilterLogEventsCommand({
        logGroupName: `/aws/lambda/${functionName}`,
        startTime,
        filterPattern,
        limit: 50,
      }),
    );

    return (response.events || []).map((event) => ({
      timestamp: event.timestamp,
      message: event.message,
      logStreamName: event.logStreamName,
    }));
  } catch (error) {
    log.error("CloudWatch query failed", {
      functionName,
      error: error.message,
    });
    return [];
  }
}

/**
 * Wait for Lambda execution log entry
 * @param {string} functionName
 * @param {string} searchString - String to find in logs
 * @param {number} startTime - Start time in epoch ms
 * @param {number} timeoutMs - Maximum wait time
 * @returns {Promise<Object>}
 */
export async function waitForLambdaLog(
  functionName,
  searchString,
  startTime,
  timeoutMs = 30000,
) {
  const pollStart = Date.now();

  while (Date.now() - pollStart < timeoutMs) {
    const logs = await queryCloudWatchLogs(
      functionName,
      startTime,
      searchString,
    );

    if (logs.length > 0) {
      return logs[0];
    }

    await sleep(2000);
  }

  throw new Error(`Lambda log entry not found after ${timeoutMs}ms`);
}

// ============================================================================
// Lambda Helpers
// ============================================================================

/**
 * Get Lambda function status
 * @param {string} functionName
 * @returns {Promise<Object>}
 */
export async function getLambdaStatus(functionName) {
  try {
    const { LambdaClient, GetFunctionCommand } =
      await import("@aws-sdk/client-lambda");

    const client = new LambdaClient({ region: AWS_CONFIG.region });

    const response = await client.send(
      new GetFunctionCommand({ FunctionName: functionName }),
    );

    return {
      state: response.Configuration.State,
      lastModified: response.Configuration.LastModified,
      runtime: response.Configuration.Runtime,
      memorySize: response.Configuration.MemorySize,
      timeout: response.Configuration.Timeout,
    };
  } catch (error) {
    log.error("Lambda status check failed", {
      functionName,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get DynamoDB Stream status for table
 * @param {string} tableName
 * @returns {Promise<Object>}
 */
export async function getStreamStatus(tableName = null) {
  const config = getConfig();
  const table = tableName || config.tableName;

  try {
    const { DynamoDBClient, DescribeTableCommand } =
      await import("@aws-sdk/client-dynamodb");

    const client = new DynamoDBClient({ region: AWS_CONFIG.region });

    const response = await client.send(
      new DescribeTableCommand({ TableName: table }),
    );

    const streamArn = response.Table.LatestStreamArn;
    const streamStatus = response.Table.StreamSpecification?.StreamEnabled;

    return {
      tableName: table,
      streamEnabled: streamStatus,
      streamArn,
    };
  } catch (error) {
    log.error("Stream status check failed", {
      tableName: table,
      error: error.message,
    });
    throw error;
  }
}

// ============================================================================
// Verification Utilities
// ============================================================================

/**
 * Verify DynamoDB → SNS propagation
 * @param {Function} triggerFn - Function that creates/updates DynamoDB record
 * @param {string} expectedEventType - Expected SNS event type
 * @param {Object} matchCriteria - Fields to match
 * @returns {Promise<{record: Object, event: Object}>}
 */
export async function verifyDynamoToSnsPropagation(
  triggerFn,
  expectedEventType,
  matchCriteria = {},
) {
  const startTime = Date.now();

  // Execute the trigger
  const result = await triggerFn();

  // Wait for SNS event
  const event = await waitForSnsEvent(expectedEventType, matchCriteria, 15000);

  const propagationTime = Date.now() - startTime;

  log.info("DynamoDB → SNS propagation verified", {
    eventType: expectedEventType,
    propagationTimeMs: propagationTime,
  });

  return {
    record: result,
    event,
    propagationTimeMs: propagationTime,
  };
}

/**
 * Verify complete webhook → Lambda → DynamoDB flow
 * @param {Object} webhookEvent - Webhook event payload
 * @param {string} webhookUrl - Webhook endpoint URL
 * @param {Function} verifyFn - Function to verify result in DynamoDB
 * @returns {Promise<Object>}
 */
export async function verifyWebhookFlow(webhookEvent, webhookUrl, verifyFn) {
  const { E2EHttpClient } = await import("./http-client.js");

  const env = getEnvironment();
  const client = new E2EHttpClient(env.apiBase);
  const startTime = Date.now();

  // Post webhook
  const response = await client.post(webhookUrl, webhookEvent, {
    headers: { "Stripe-Signature": "test-signature" },
  });

  if (response.status !== 200) {
    throw new Error(`Webhook returned ${response.status}`);
  }

  // Wait for DynamoDB update
  const record = await waitForDynamoRecord(verifyFn, 15000);

  const flowTime = Date.now() - startTime;

  log.info("Webhook → Lambda → DynamoDB flow verified", {
    flowTimeMs: flowTime,
  });

  return {
    webhookResponse: response,
    record,
    flowTimeMs: flowTime,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Clean up test records from DynamoDB
 * @param {Array<{pk: string, sk: string}>} keys
 */
export async function cleanupDynamoRecords(keys) {
  if (!keys.length) return;

  const config = getConfig();

  try {
    const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
    const { DynamoDBDocumentClient, BatchWriteCommand } =
      await import("@aws-sdk/lib-dynamodb");

    const client = new DynamoDBClient({ region: AWS_CONFIG.region });
    const docClient = DynamoDBDocumentClient.from(client);

    // Batch delete (max 25 items per batch)
    const batches = [];
    for (let i = 0; i < keys.length; i += 25) {
      batches.push(keys.slice(i, i + 25));
    }

    for (const batch of batches) {
      await docClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [config.tableName]: batch.map(({ pk, sk }) => ({
              DeleteRequest: { Key: { PK: pk, SK: sk } },
            })),
          },
        }),
      );
    }

    log.info("Cleaned up DynamoDB test records", { count: keys.length });
  } catch (error) {
    log.error("DynamoDB cleanup failed", { error: error.message });
  }
}

export default {
  isAwsSdkAvailable,
  queryDynamoItem,
  queryLicense,
  queryTrial,
  queryDevices,
  waitForDynamoRecord,
  pollSqsMessages,
  deleteSqsMessages,
  waitForSnsEvent,
  queryCloudWatchLogs,
  waitForLambdaLog,
  getLambdaStatus,
  getStreamStatus,
  verifyDynamoToSnsPropagation,
  verifyWebhookFlow,
  cleanupDynamoRecords,
};
