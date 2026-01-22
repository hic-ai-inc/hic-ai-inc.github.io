/**
 * Universal testing utilities for all HIC systems
 * Replaces Jest functionality with node:test primitives
 */

// Re-export node:test primitives
export {
  describe,
  it,
  test,
  beforeEach,
  afterEach,
  before,
  after,
} from "node:test";
export { strict as assert } from "node:assert";

// Custom assertions that replace Jest's expect()
export { expect } from "./expect.js";

// Mock management
export { setupAutoReset, resetAllMocks } from "./lifecycle.js";

// Spy utilities
export { createSpy, spyOn } from "./spy.js";
