/**
 * Stream Processor Lambda
 *
 * Reads DynamoDB Stream records, classifies by entity type,
 * and publishes to appropriate SNS topic for fan-out.
 *
 * Triggered by: DynamoDB Stream on PLG table
 * Publishes to: Payment, Customer, or License SNS topics
 *
 * Layer Dependencies: hic-base-layer, hic-messaging-layer
 */
import { SNSClient, PublishCommand } from "hic-messaging-layer";
import { HicLog } from "hic-base-layer";

// ============================================================================
// Injectable Client for Testing
// ============================================================================
let snsClient = new SNSClient({
  region: process.env.AWS_REGION || "us-east-1",
  maxAttempts: 3,
});

export function __setSnsClientForTests(client) {
  snsClient = client;
}
export function getSnsClientInstance() {
  return snsClient;
}

// ============================================================================
// Configuration
// ============================================================================
const TOPICS = {
  PAYMENT: process.env.PAYMENT_EVENTS_TOPIC_ARN,
  CUSTOMER: process.env.CUSTOMER_EVENTS_TOPIC_ARN,
  LICENSE: process.env.LICENSE_EVENTS_TOPIC_ARN,
};

/**
 * Classify event based on SK prefix or eventType
 * @param {Object} record - DynamoDB Stream record
 * @returns {string} - Topic category: PAYMENT, CUSTOMER, or LICENSE
 */
function classifyEvent(record) {
  const sk = record.dynamodb?.Keys?.SK?.S || "";
  const pk = record.dynamodb?.Keys?.PK?.S || "";

  // EVENT records go to topic based on their eventType
  if (pk.startsWith("EVENT#")) {
    const eventType = record.dynamodb?.NewImage?.eventType?.S || "";
    if (
      eventType.includes("payment") ||
      eventType.includes("invoice") ||
      eventType.includes("subscription")
    ) {
      return "PAYMENT";
    }
    if (eventType.includes("license") || eventType.includes("machine")) {
      return "LICENSE";
    }
    return "CUSTOMER";
  }

  // Direct entity classification by PK or SK prefix
  if (sk.startsWith("SUB#") || sk.startsWith("INV#")) return "PAYMENT";
  if (
    pk.startsWith("LICENSE#") ||
    sk.startsWith("LICENSE#") ||
    sk.startsWith("DEVICE#") ||
    sk.startsWith("MACHINE#")
  )
    return "LICENSE";
  if (sk === "PROFILE" || sk.startsWith("MEMBER#")) return "CUSTOMER";

  return "CUSTOMER"; // Default
}

/**
 * Lambda handler
 * @param {Object} event - DynamoDB Stream event
 */
export const handler = async (event) => {
  const log = new HicLog("stream-processor");
  log.info("start", { recordCount: event.Records.length });

  const results = await Promise.allSettled(
    event.Records.map(async (record) => {
      const eventType = classifyEvent(record);
      const topicArn = TOPICS[eventType];

      if (!topicArn) {
        log.warn("no-topic-configured", { eventType });
        return;
      }

      const message = {
        eventName: record.eventName, // INSERT, MODIFY, REMOVE
        keys: record.dynamodb?.Keys,
        newImage: record.dynamodb?.NewImage,
        oldImage: record.dynamodb?.OldImage,
        timestamp: new Date().toISOString(),
        environment: process.env.ENVIRONMENT,
      };

      await snsClient.send(
        new PublishCommand({
          TopicArn: topicArn,
          Message: JSON.stringify(message),
          MessageAttributes: {
            eventType: { DataType: "String", StringValue: eventType },
            eventName: { DataType: "String", StringValue: record.eventName },
          },
        }),
      );

      log.info("published", { eventName: record.eventName, eventType });
    }),
  );

  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    log.error("partial-failure", {
      total: results.length,
      failed: failures.length,
      errors: failures.map((f) => f.reason?.message),
    });
    throw new Error(`${failures.length} records failed to process`);
  }

  log.info("complete", { processed: results.length });
  return { processed: results.length };
};
