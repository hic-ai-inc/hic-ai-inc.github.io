/**
 * Deep Equality Utility - Recursive object comparison for mock matching
 *
 * Compares objects by value rather than reference, enabling accurate mock
 * parameter matching. Handles nested objects, arrays, primitives, NaN,
 * and circular references. Used by facade helpers to match AWS SDK
 * command parameters.
 */

function deepEqual(a, b, visited = new WeakMap()) {
  if (a === b) return true;

  if (a && b && typeof a === "object" && typeof b === "object") {
    // Handle circular references
    if (visited.has(a)) {
      return visited.get(a) === b;
    }
    visited.set(a, b);

    if (Array.isArray(a) !== Array.isArray(b)) return false;

    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!deepEqual(a[i], b[i], visited)) return false;
      }
      return true;
    }

    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;

    for (const k of aKeys) {
      if (!deepEqual(a[k], b[k], visited)) return false;
    }
    return true;
  }

  return Number.isNaN(a) && Number.isNaN(b);
}

export { deepEqual };
