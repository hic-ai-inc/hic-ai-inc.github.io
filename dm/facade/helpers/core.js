/**
 * Core Facade - Aggregates DynamoDB, Messaging, and Metrics mocking
 *
 * Re-exports from existing facade helpers to support consolidated core layer testing.
 * The test-loader will redirect 'hic-core-layer' imports to this file during testing.
 */

// Re-export everything from DynamoDB helper
export * from "./dynamodb.js";

// Re-export everything from Messaging helper (includes SNS and SQS)
export * from "./messaging.js";

// Re-export everything from Metrics helper
export * from "./metrics.js";
