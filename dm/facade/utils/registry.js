/**
 * Mock Registry - Automatic lifecycle management for test mocks
 *
 * Tracks all created mocks and automatically resets them after each test
 * to prevent test state leakage. Used by setup to ensure clean test isolation.
 */

const registry = new Set();

function registerMock(mockInstance) {
  if (!mockInstance || typeof mockInstance !== "object") {
    throw new Error("Mock instance must be a non-null object");
  }

  registry.add(mockInstance);
}

function resetAll() {
  for (const mock of registry) {
    try {
      if (typeof mock.reset === "function") {
        mock.reset();
      }
    } catch (error) {
      // Silently ignore reset errors to prevent test failures
      // Individual mocks may fail to reset due to various reasons
      console.warn("Mock reset failed:", error.message);
    }
  }
  registry.clear();
}

export { registerMock, resetAll };
