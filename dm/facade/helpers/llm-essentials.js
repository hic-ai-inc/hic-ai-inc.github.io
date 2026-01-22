/**
 * LLM Essentials Facade - Aggregates Bedrock, Config, Storage, and SFN mocking
 *
 * Re-exports from existing facade helpers to support consolidated LLM layer testing.
 * The test-loader will redirect 'hic-llm-essentials-layer' imports to this file during testing.
 */

// Re-export everything from Bedrock helper
export * from "./bedrock.js";

// Re-export everything from Config helper (includes SSM and Secrets Manager)
export * from "./config.js";

// Re-export everything from Storage helper
export * from "./storage.js";

// Re-export everything from Step Functions helper
export * from "./sfn.js";

// Re-export S3 presigner for signed URLs
export { getSignedUrl } from "@aws-sdk/s3-request-presigner";
