// Aggregator helper for: hic-storage-layer
// Re-export AWS SDK clients for compatibility with storage Lambda layer
export * from "@aws-sdk/client-s3";

export { createS3Mock } from "./s3.js";
