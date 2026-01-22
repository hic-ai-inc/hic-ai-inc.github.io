// Aggregator helper for: hic-config-layer
// Re-export AWS SDK clients for compatibility with config Lambda layer
export * from "@aws-sdk/client-secrets-manager";
export * from "@aws-sdk/client-ssm";

// Re-export the public surface of Secrets Manager + SSM helpers
export { createSecretsMock } from "./secrets.js";
export { createSSMMock } from "./ssm.js";
