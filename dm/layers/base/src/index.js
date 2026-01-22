/* HIC Base Utilities -- Core Exports
 * Last modified: September 4, 2025
 * This module exports all the core utilities for the HIC platform's Lambda layers.
 */

// HIC Base Utilities
export { safeLog, sanitizeForLog } from "./safe-log.js";
export { safePath } from "./safe-path.js";
export { safeJsonParse, tryJsonParse } from "./safe-json-parse.js";
export { HicLog } from "./hic-log.js";

// AWS SDK Exports (from layer dependencies)
export { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";