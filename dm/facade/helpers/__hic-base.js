/**
 * HIC base utilities - Clean API for safe HIC operations
 * For import by test files in other HIC systems
 * Provides safe JSON parsing and logging utilities
 * Pass-through for HIC base functions and abstraction layer for future changes
 *
 *  */

export {
  safeLog,
  sanitizeForLog,
  safePath,
  safeJsonParse,
  tryJsonParse,
  HicLog,
} from "../../layers/base/src/index.js";
