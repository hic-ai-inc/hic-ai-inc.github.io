/**
 * Test lifecycle management
 * Manages mock reset between tests
 */

import { afterEach } from "node:test";

// Store all active mocks for cleanup
const activeMocks = new Set();

export function registerMock(mock) {
  activeMocks.add(mock);
}

export function unregisterMock(mock) {
  activeMocks.delete(mock);
}

export function setupAutoReset() {
  afterEach(() => {
    resetAllMocks();
  });
}

export function resetAllMocks() {
  for (const mock of activeMocks) {
    if (typeof mock.reset === "function") {
      mock.reset();
    } else if (typeof mock.restore === "function") {
      mock.restore();
    }
  }

  // Clear the registry after reset
  activeMocks.clear();
}
