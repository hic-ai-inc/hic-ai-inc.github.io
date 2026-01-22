// Aggregator helper for: hic-messaging-layer
// Re-export AWS SDK clients for compatibility with messaging Lambda layer
export * from "@aws-sdk/client-sns";
export * from "@aws-sdk/client-sqs";

// Re-export the public surface of SNS + SQS helpers
export { createSNSMock } from "./sns.js";
export { createSQSMock } from "./sqs.js";
