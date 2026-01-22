/**
 * HIC Base Layer Helper - Combined exports for testing
 *
 * Provides both HIC utilities and mocked Lambda functionality
 * to match the actual hic-base-layer Lambda layer structure.
 *
 * This file acts as a drop-in replacement for the 'hic-base-layer'
 * import during testing, providing all exports that would be
 * available from the actual Lambda layer, but with mocked AWS SDK.
 */

// Re-export HIC utilities from the internal helper
export {
  safeLog,
  sanitizeForLog,
  safePath,
  safeJsonParse,
  tryJsonParse,
  HicLog,
} from "./__hic-base.js";

// Export the Lambda mock creator for testing
export { createLambdaMock, LambdaClient, InvokeCommand } from "./__lambda.js";
