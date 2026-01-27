/**
 * Test Kit for PLG Website Tests
 *
 * Lightweight Jest-like testing utilities using Node.js built-in assert.
 * Designed to be standalone with no external dependencies.
 */

import { strict as assert } from "node:assert";

// ============================================================================
// Expectation Class
// ============================================================================

class Expectation {
  constructor(actual) {
    this.actual = actual;
    this.not = new NotExpectation(actual);
  }

  toBe(expected) {
    assert.strictEqual(this.actual, expected);
    return this;
  }

  toEqual(expected) {
    assert.deepStrictEqual(this.actual, expected);
    return this;
  }

  toBeNull() {
    assert.strictEqual(this.actual, null);
    return this;
  }

  toBeUndefined() {
    assert.strictEqual(this.actual, undefined);
    return this;
  }

  toBeDefined() {
    assert.notStrictEqual(this.actual, undefined);
    return this;
  }

  toBeTruthy() {
    assert.ok(this.actual);
    return this;
  }

  toBeFalsy() {
    assert.ok(!this.actual);
    return this;
  }

  toBeGreaterThan(expected) {
    assert.ok(
      this.actual > expected,
      `Expected ${this.actual} to be greater than ${expected}`,
    );
    return this;
  }

  toBeGreaterThanOrEqual(expected) {
    assert.ok(
      this.actual >= expected,
      `Expected ${this.actual} to be greater than or equal to ${expected}`,
    );
    return this;
  }

  toBeLessThan(expected) {
    assert.ok(
      this.actual < expected,
      `Expected ${this.actual} to be less than ${expected}`,
    );
    return this;
  }

  toBeLessThanOrEqual(expected) {
    assert.ok(
      this.actual <= expected,
      `Expected ${this.actual} to be less than or equal to ${expected}`,
    );
    return this;
  }

  toBeCloseTo(expected, tolerance = 0.001) {
    const diff = Math.abs(this.actual - expected);
    assert.ok(
      diff <= tolerance,
      `Expected ${this.actual} to be close to ${expected} (tolerance: ${tolerance})`,
    );
    return this;
  }

  toContain(item) {
    if (typeof this.actual === "string") {
      assert.ok(
        this.actual.includes(item),
        `Expected "${this.actual}" to contain "${item}"`,
      );
    } else if (Array.isArray(this.actual)) {
      assert.ok(
        this.actual.includes(item),
        `Expected array to contain ${JSON.stringify(item)}`,
      );
    } else {
      throw new Error("toContain() requires string or array");
    }
    return this;
  }

  toHaveLength(length) {
    assert.strictEqual(
      this.actual.length,
      length,
      `Expected length ${length} but got ${this.actual.length}`,
    );
    return this;
  }

  toMatch(pattern) {
    if (typeof pattern === "string") {
      assert.ok(
        this.actual.includes(pattern),
        `Expected "${this.actual}" to match "${pattern}"`,
      );
    } else if (pattern instanceof RegExp) {
      assert.ok(
        pattern.test(this.actual),
        `Expected "${this.actual}" to match ${pattern}`,
      );
    } else {
      throw new Error("toMatch() requires string or RegExp");
    }
    return this;
  }

  toBeInstanceOf(constructor) {
    assert.ok(
      this.actual instanceof constructor,
      `Expected value to be instance of ${constructor.name}`,
    );
    return this;
  }

  toHaveProperty(prop, value) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(this.actual, prop),
      `Expected object to have property "${prop}"`,
    );
    if (arguments.length > 1) {
      assert.deepStrictEqual(this.actual[prop], value);
    }
    return this;
  }

  toThrow(errorMessage) {
    if (typeof this.actual !== "function") {
      throw new Error("toThrow() requires a function");
    }

    let threw = false;
    try {
      this.actual();
    } catch (error) {
      threw = true;
      if (errorMessage) {
        if (typeof errorMessage === "string") {
          assert.ok(
            error.message && error.message.includes(errorMessage),
            `Expected error to contain "${errorMessage}" but got "${error.message}"`,
          );
        } else if (errorMessage instanceof RegExp) {
          assert.ok(
            errorMessage.test(error.message),
            `Expected error to match ${errorMessage} but got "${error.message}"`,
          );
        }
      }
    }

    assert.ok(threw, "Expected function to throw, but it did not");
    return this;
  }
}

class NotExpectation {
  constructor(actual) {
    this.actual = actual;
  }

  toBe(expected) {
    assert.notStrictEqual(this.actual, expected);
    return this;
  }

  toEqual(expected) {
    assert.notDeepStrictEqual(this.actual, expected);
    return this;
  }

  toBeNull() {
    assert.notStrictEqual(this.actual, null);
    return this;
  }

  toBeUndefined() {
    assert.notStrictEqual(this.actual, undefined);
    return this;
  }

  toBeDefined() {
    assert.strictEqual(this.actual, undefined);
    return this;
  }

  toBeTruthy() {
    assert.ok(!this.actual);
    return this;
  }

  toBeFalsy() {
    assert.ok(this.actual);
    return this;
  }

  toContain(item) {
    if (typeof this.actual === "string") {
      assert.ok(!this.actual.includes(item));
    } else if (Array.isArray(this.actual)) {
      assert.ok(!this.actual.includes(item));
    } else {
      throw new Error("toContain() requires string or array");
    }
    return this;
  }

  toThrow() {
    if (typeof this.actual !== "function") {
      throw new Error("toThrow() requires a function");
    }

    let threw = false;
    try {
      this.actual();
    } catch {
      threw = true;
    }

    assert.ok(!threw, "Expected function not to throw, but it did");
    return this;
  }
}

// ============================================================================
// Spy / Mock Function
// ============================================================================

function createSpy(implementation = () => {}) {
  const spy = function (...args) {
    spy.called = true;
    spy.callCount++;
    spy.calls.push(args);
    spy.lastCall = args;

    if (spy._mockReturnValueOnce.length > 0) {
      return spy._mockReturnValueOnce.shift();
    }

    if (spy._mockResolvedValueOnce.length > 0) {
      return Promise.resolve(spy._mockResolvedValueOnce.shift());
    }

    if (spy._mockRejectedValueOnce.length > 0) {
      return Promise.reject(spy._mockRejectedValueOnce.shift());
    }

    if (spy._mockResolvedValue !== undefined) {
      return Promise.resolve(spy._mockResolvedValue);
    }

    if (spy._mockRejectedValue !== undefined) {
      return Promise.reject(spy._mockRejectedValue);
    }

    if (spy._mockReturnValue !== undefined) {
      return spy._mockReturnValue;
    }

    if (spy._mockImplementation) {
      return spy._mockImplementation(...args);
    }

    return implementation(...args);
  };

  spy.called = false;
  spy.callCount = 0;
  spy.calls = [];
  spy.lastCall = null;
  spy._mockReturnValue = undefined;
  spy._mockReturnValueOnce = [];
  spy._mockResolvedValue = undefined;
  spy._mockResolvedValueOnce = [];
  spy._mockRejectedValue = undefined;
  spy._mockRejectedValueOnce = [];
  spy._mockImplementation = null;

  spy.mockReturnValue = (value) => {
    spy._mockReturnValue = value;
    return spy;
  };

  spy.mockReturnValueOnce = (value) => {
    spy._mockReturnValueOnce.push(value);
    return spy;
  };

  spy.mockResolvedValue = (value) => {
    spy._mockResolvedValue = value;
    return spy;
  };

  spy.mockResolvedValueOnce = (value) => {
    spy._mockResolvedValueOnce.push(value);
    return spy;
  };

  spy.mockRejectedValue = (error) => {
    spy._mockRejectedValue = error;
    return spy;
  };

  spy.mockRejectedValueOnce = (error) => {
    spy._mockRejectedValueOnce.push(error);
    return spy;
  };

  spy.mockImplementation = (fn) => {
    spy._mockImplementation = fn;
    return spy;
  };

  spy.mockClear = () => {
    spy.called = false;
    spy.callCount = 0;
    spy.calls = [];
    spy.lastCall = null;
    return spy;
  };

  spy.mockReset = () => {
    spy.mockClear();
    spy._mockReturnValue = undefined;
    spy._mockReturnValueOnce = [];
    spy._mockResolvedValue = undefined;
    spy._mockResolvedValueOnce = [];
    spy._mockRejectedValue = undefined;
    spy._mockRejectedValueOnce = [];
    spy._mockImplementation = null;
    return spy;
  };

  return spy;
}

// ============================================================================
// Export
// ============================================================================

function expect(actual) {
  return new Expectation(actual);
}

export { expect, createSpy, Expectation };
