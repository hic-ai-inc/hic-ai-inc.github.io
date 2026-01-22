/**
 * Jest-like expect() implementation for node:test
 */

import { strict as assert } from "node:assert";

class Expectation {
  constructor(actual) {
    this.actual = actual;
    this.not = new NotExpectation(actual);
  }

  toBe(expected) {
    assert.strictEqual(this.actual, expected);
  }

  toEqual(expected) {
    assert.deepStrictEqual(this.actual, expected);
  }

  toBeNull() {
    assert.strictEqual(this.actual, null);
  }

  toBeUndefined() {
    assert.strictEqual(this.actual, undefined);
  }

  toBeDefined() {
    assert.notStrictEqual(this.actual, undefined);
  }

  toBeTruthy() {
    assert.ok(this.actual);
  }

  toBeFalsy() {
    assert.ok(!this.actual);
  }

  toContain(item) {
    if (typeof this.actual === "string") {
      assert.ok(this.actual.includes(item));
    } else if (Array.isArray(this.actual)) {
      assert.ok(this.actual.includes(item));
    } else {
      throw new Error("toContain() requires string or array");
    }
  }

  toHaveLength(length) {
    assert.strictEqual(this.actual.length, length);
  }

  toThrow(errorMessage) {
    if (typeof this.actual !== "function") {
      throw new Error("toThrow() requires a function");
    }

    try {
      this.actual();
      throw new Error("Expected function to throw, but it did not throw");
    } catch (error) {
      if (
        error.message === "Expected function to throw, but it did not throw"
      ) {
        throw error;
      }

      if (errorMessage) {
        if (typeof errorMessage === "string") {
          // Allow partial message matching
          assert.ok(
            error.message && error.message.includes(errorMessage),
            `Expected error message to contain "${errorMessage}" but got "${error.message}"`
          );
        } else if (errorMessage instanceof RegExp) {
          // Handle regex patterns
          assert.ok(
            errorMessage.test(error.message),
            `Expected error message to match ${errorMessage} but got "${error.message}"`
          );
        } else {
          // Handle error constructor
          assert.ok(
            error instanceof errorMessage || error.constructor === errorMessage,
            `Expected error to be instance of ${errorMessage.name} but got ${error.constructor.name}`
          );
        }
      }
    }
  }

  async toReject(errorMessage) {
    await assert.rejects(this.actual, errorMessage);
  }

  async rejects(errorMessage) {
    return {
      toThrow: async (expectedError) => {
        try {
          await this.actual;
          throw new Error("Expected promise to reject, but it resolved");
        } catch (error) {
          if (error.message === "Expected promise to reject, but it resolved") {
            throw error;
          }
          
          if (expectedError) {
            if (typeof expectedError === "string") {
              assert.ok(
                error.message && error.message.includes(expectedError),
                `Expected error message to contain "${expectedError}" but got "${error.message}"`
              );
            }
          }
        }
      }
    };
  }

  toHaveBeenCalled() {
    assert.ok(this.actual.called, "Expected function to have been called");
  }

  toHaveBeenCalledWith(...args) {
    if (!this.actual.calls || !Array.isArray(this.actual.calls)) {
      throw new Error(
        "toHaveBeenCalledWith() requires a spy object with calls array"
      );
    }

    const callsMatch = this.actual.calls.some((call) => {
      if (call.length !== args.length) return false;
      return call.every((arg, index) => {
        const expected = args[index];
        // Handle asymmetric matchers like expect.any() and expect.objectContaining()
        if (typeof expected === 'object' && expected !== null && typeof expected.asymmetricMatch === 'function') {
          return expected.asymmetricMatch(arg);
        }
        // Handle deep equality for objects
        if (typeof arg === "object" && typeof expected === "object" && arg !== null && expected !== null) {
          return JSON.stringify(arg) === JSON.stringify(expected);
        }
        return arg === expected;
      });
    });

    assert.ok(
      callsMatch,
      `Expected function to have been called with ${args.map(arg => 
        (typeof arg === 'object' && arg !== null && typeof arg.toString === 'function') ? arg.toString() : JSON.stringify(arg)
      ).join(', ')}, but was called with: ${JSON.stringify(this.actual.calls)}`
    );
  }

  toHaveBeenCalledTimes(times) {
    if (!this.actual.hasOwnProperty("callCount")) {
      throw new Error(
        "toHaveBeenCalledTimes() requires a spy object with callCount property"
      );
    }
    assert.strictEqual(this.actual.callCount, times);
  }

  toBeLessThan(value) {
    assert.ok(
      this.actual < value,
      `Expected ${this.actual} to be less than ${value}`
    );
  }

  toBeInstanceOf(constructor) {
    assert.ok(
      this.actual instanceof constructor,
      `Expected ${this.actual} to be instance of ${constructor.name}`
    );
  }

  toMatch(pattern) {
    if (pattern instanceof RegExp) {
      assert.ok(
        pattern.test(this.actual),
        `Expected ${this.actual} to match ${pattern}`
      );
    } else {
      assert.ok(
        this.actual.includes(pattern),
        `Expected ${this.actual} to contain ${pattern}`
      );
    }
  }

  toHaveProperty(property, value) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(this.actual, property),
      `Expected object to have property ${property}`
    );
    if (value !== undefined) {
      assert.strictEqual(this.actual[property], value);
    }
  }

  toBeGreaterThan(value) {
    assert.ok(
      this.actual > value,
      `Expected ${this.actual} to be greater than ${value}`
    );
  }

  toBeLessThanOrEqual(value) {
    assert.ok(
      this.actual <= value,
      `Expected ${this.actual} to be less than or equal to ${value}`
    );
  }

  toBeGreaterThanOrEqual(value) {
    assert.ok(
      this.actual >= value,
      `Expected ${this.actual} to be greater than or equal to ${value}`
    );
  }

  toContainEqual(expected) {
    if (!Array.isArray(this.actual)) {
      throw new Error("toContainEqual() requires an array");
    }
    
    const found = this.actual.some(item => {
      try {
        // Handle asymmetric matchers like expect.objectContaining()
        if (typeof expected === 'object' && expected !== null && expected.asymmetricMatch) {
          return expected.asymmetricMatch(item);
        }
        // Use deep equality check
        if (typeof item === "object" && typeof expected === "object") {
          return JSON.stringify(item) === JSON.stringify(expected);
        }
        return item === expected;
      } catch {
        return false;
      }
    });
    
    assert.ok(
      found,
      `Expected array to contain equal element ${JSON.stringify(expected)}, but got ${JSON.stringify(this.actual)}`
    );
  }
}

class NotExpectation {
  constructor(actual) {
    this.actual = actual;
  }

  toBe(expected) {
    assert.notStrictEqual(this.actual, expected);
  }

  toEqual(expected) {
    assert.notDeepStrictEqual(this.actual, expected);
  }

  toBeNull() {
    assert.notStrictEqual(this.actual, null);
  }

  toBeUndefined() {
    assert.strictEqual(this.actual, undefined);
  }

  toBeDefined() {
    assert.strictEqual(this.actual, undefined);
  }

  toBeTruthy() {
    assert.ok(!this.actual);
  }

  toBeFalsy() {
    assert.ok(!!this.actual);
  }

  toThrow(errorMessage) {
    assert.doesNotThrow(this.actual);
  }

  toContain(item) {
    if (typeof this.actual === "string") {
      assert.ok(!this.actual.includes(item));
    } else if (Array.isArray(this.actual)) {
      assert.ok(!this.actual.includes(item));
    } else {
      throw new Error("toContain() requires string or array");
    }
  }

  toMatch(pattern) {
    if (pattern instanceof RegExp) {
      assert.ok(
        !pattern.test(this.actual),
        `Expected ${this.actual} not to match ${pattern}`
      );
    } else {
      assert.ok(
        !this.actual.includes(pattern),
        `Expected ${this.actual} not to contain ${pattern}`
      );
    }
  }

  toHaveProperty(property) {
    assert.ok(
      !Object.prototype.hasOwnProperty.call(this.actual, property),
      `Expected object not to have property ${property}`
    );
  }

  toHaveBeenCalled() {
    assert.ok(!this.actual.called, "Expected function not to have been called");
  }
}

export function expect(actual) {
  return new Expectation(actual);
}

// Add rejects method for async error testing
expect.rejects = {
  toThrow: async (promiseOrFunction, errorMessage) => {
    let promise;
    if (typeof promiseOrFunction === 'function') {
      promise = promiseOrFunction();
    } else {
      promise = promiseOrFunction;
    }
    
    try {
      await promise;
      throw new Error("Expected promise to reject, but it resolved");
    } catch (error) {
      if (error.message === "Expected promise to reject, but it resolved") {
        throw error;
      }
      
      if (errorMessage) {
        if (typeof errorMessage === "string") {
          assert.ok(
            error.message && error.message.includes(errorMessage),
            `Expected error message to contain "${errorMessage}" but got "${error.message}"`
          );
        } else if (errorMessage instanceof RegExp) {
          assert.ok(
            errorMessage.test(error.message),
            `Expected error message to match ${errorMessage} but got "${error.message}"`
          );
        }
      }
    }
  }
};

// Jest-like expect.any() matcher
expect.any = function(constructor) {
  return {
    asymmetricMatch: (actual) => {
      if (constructor === String) {
        return typeof actual === 'string';
      }
      if (constructor === Number) {
        return typeof actual === 'number';
      }
      if (constructor === Boolean) {
        return typeof actual === 'boolean';
      }
      return actual instanceof constructor;
    },
    toString: () => `Any<${constructor.name}>`
  };
};

// Jest-like expect.objectContaining() matcher
expect.objectContaining = function(expected) {
  return {
    asymmetricMatch: (actual) => {
      if (typeof actual !== 'object' || actual === null) return false;
      for (const key in expected) {
        if (!(key in actual)) return false;
        if (typeof expected[key] === 'object' && expected[key] !== null && typeof expected[key].asymmetricMatch === 'function') {
          if (!expected[key].asymmetricMatch(actual[key])) return false;
        } else if (typeof actual[key] === 'object' && typeof expected[key] === 'object' && actual[key] !== null && expected[key] !== null) {
          // Deep equality for nested objects
          if (JSON.stringify(actual[key]) !== JSON.stringify(expected[key])) return false;
        } else if (actual[key] !== expected[key]) {
          return false;
        }
      }
      return true;
    },
    toString: () => {
      const serialized = {};
      for (const key in expected) {
        if (typeof expected[key] === 'object' && expected[key] !== null && typeof expected[key].toString === 'function') {
          serialized[key] = expected[key].toString();
        } else {
          serialized[key] = expected[key];
        }
      }
      return `ObjectContaining<${JSON.stringify(serialized)}>`;
    }
  };
};

// Jest-like expect.stringContaining() matcher
expect.stringContaining = function(expected) {
  return {
    asymmetricMatch: (actual) => {
      return typeof actual === 'string' && actual.includes(expected);
    },
    toString: () => `StringContaining<${expected}>`
  };
};

// Jest-like expect.arrayContaining() matcher
expect.arrayContaining = function(expected) {
  return {
    asymmetricMatch: (actual) => {
      if (!Array.isArray(actual)) return false;
      return expected.every(item => actual.includes(item));
    },
    toString: () => `ArrayContaining<${JSON.stringify(expected)}>`
  };
};
