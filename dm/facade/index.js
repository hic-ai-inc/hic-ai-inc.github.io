/**
 * HIC Dependency Manager - Universal Facade
 * Main entry point for dependency management throughout HIC
 */

// Re-export all mock helpers (for backward compatibility)
export * from "./helpers/index.js";

// Re-export testing utilities (Jest replacement)
export * from "./test-helpers/index.js";

// Optional: Provide grouped imports for clarity
export * as mocks from "./helpers/index.js";
export * as testing from "./test-helpers/index.js";

// Export utilities
export { resetAll } from "./utils/registry.js";
export { deepEqual } from "./utils/deepEqual.js";
export { resolve as testLoader } from "./utils/test-loader.js";
