import { describe, test, beforeEach, afterEach } from "node:test";
import { expect } from "../../../../../facade/test-helpers/index.js";

// Import the utilities we're testing
import {
  safeLog,
  sanitizeForLog,
} from "../../../../../layers/base/src/safe-log.js";

describe("safe-log.js - HIC Base Layer Safe Logging Utilities", () => {
  let originalEnv;
  let originalConsoleLog;
  let logOutput;

  beforeEach(() => {
    originalEnv = { ...process.env };
    originalConsoleLog = console.log;
    logOutput = [];

    // Capture console.log output
    console.log = (...args) => {
      logOutput.push(args.join(" "));
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    console.log = originalConsoleLog;
  });

  describe("sanitizeForLog()", () => {
    describe("String Input Sanitization", () => {
      test("removes control characters from strings", () => {
        const input = "Hello\x00\x01\x1F World\x7F";
        const result = sanitizeForLog(input);

        expect(result).toBe("Hello World");
        expect(result).not.toContain("\x00");
        expect(result).not.toContain("\x01");
        expect(result).not.toContain("\x1F");
        expect(result).not.toContain("\x7F");
      });

      test("replaces newlines with spaces", () => {
        const input = "Line 1\nLine 2\rLine 3\r\nLine 4";
        const result = sanitizeForLog(input);

        // Newlines are replaced with spaces
        expect(result).toBe("Line 1 Line 2 Line 3 Line 4");
        expect(result).not.toContain("\n");
        expect(result).not.toContain("\r");
      });

      test("replaces tabs with spaces", () => {
        const input = "Column1\tColumn2\tColumn3";
        const result = sanitizeForLog(input);

        // Tabs are replaced with spaces
        expect(result).toBe("Column1 Column2 Column3");
        expect(result).not.toContain("\t");
      });

      test("limits string length to 1000 characters", () => {
        const longString = "a".repeat(1500);
        const result = sanitizeForLog(longString);

        expect(result.length).toBe(1000);
        expect(result).toBe("a".repeat(1000));
      });

      test("handles empty strings", () => {
        const result = sanitizeForLog("");
        expect(result).toBe("");
      });

      test("handles strings with only whitespace", () => {
        const result = sanitizeForLog("   \t  \n  ");
        // Tab and newline are converted to spaces: 3 spaces + 1 tab->space + 2 spaces + 1 newline->space + 2 spaces = 9 spaces
        expect(result).toBe("         ");
      });
    });

    describe("Object Input Sanitization", () => {
      test("serializes simple objects to JSON", () => {
        const input = { name: "test", value: 42 };
        const result = sanitizeForLog(input);

        expect(result).toContain("name");
        expect(result).toContain("test");
        expect(result).toContain("value");
        expect(result).toContain("42");
      });

      test("handles nested objects", () => {
        const input = {
          user: {
            id: 123,
            profile: {
              name: "John Doe",
              settings: { theme: "dark" },
            },
          },
        };
        const result = sanitizeForLog(input);

        expect(result).toContain("John Doe");
        expect(result).toContain("dark");
      });

      test("handles arrays within objects", () => {
        const input = {
          items: ["apple", "banana", "cherry"],
          count: 3,
        };
        const result = sanitizeForLog(input);

        expect(result).toContain("apple");
        expect(result).toContain("banana");
        expect(result).toContain("cherry");
      });

      test("handles objects with special characters in values", () => {
        const input = {
          message: "Hello\nWorld\t!",
          special: "Control\x00Chars\x1F",
        };
        const result = sanitizeForLog(input);

        // JSON.stringify escapes the characters, so we see \\n and \\t in the output
        expect(result).toContain("Hello\\nWorld\\t!");
        // Control characters become Unicode escapes
        expect(result).toContain("Control");
        expect(result).toContain("Chars");
        expect(result).not.toContain("\n");
        expect(result).not.toContain("\t");
        expect(result).not.toContain("\x00");
      });

      test("returns error message for circular references", () => {
        const obj = { name: "test" };
        obj.self = obj; // Create circular reference

        const result = sanitizeForLog(obj);
        expect(result).toBe("[Object - could not serialize]");
      });

      test("handles null objects", () => {
        const result = sanitizeForLog(null);
        expect(result).toBe("null");
      });

      test("handles undefined objects", () => {
        const result = sanitizeForLog(undefined);
        expect(result).toBe("undefined");
      });

      test("limits serialized object length to 1000 characters", () => {
        const largeObj = {
          data: "x".repeat(1500),
        };
        const result = sanitizeForLog(largeObj);

        expect(result.length).toBe(1000);
      });
    });

    describe("Other Data Types", () => {
      test("handles numbers", () => {
        expect(sanitizeForLog(42)).toBe("42");
        expect(sanitizeForLog(-3.14)).toBe("-3.14");
        expect(sanitizeForLog(0)).toBe("0");
      });

      test("handles booleans", () => {
        expect(sanitizeForLog(true)).toBe("true");
        expect(sanitizeForLog(false)).toBe("false");
      });

      test("handles symbols", () => {
        const sym = Symbol("test");
        const result = sanitizeForLog(sym);
        expect(result).toContain("Symbol(test)");
      });

      test("handles functions", () => {
        function testFunc() {
          return "test";
        }
        const result = sanitizeForLog(testFunc);
        expect(result).toContain("function");
      });
    });
  });

  describe("safeLog()", () => {
    describe("Normal Logging Behavior", () => {
      beforeEach(() => {
        // Ensure logging is enabled
        delete process.env.SUPPRESS_LOGS;
        delete process.env.NODE_ENV;
      });

      test("logs simple messages", () => {
        safeLog("Test message");

        expect(logOutput).toHaveLength(1);
        expect(logOutput[0]).toBe("Test message");
      });

      test("logs message with data", () => {
        safeLog("User created", { id: 123, name: "John" });

        expect(logOutput).toHaveLength(1);
        expect(logOutput[0]).toContain("User created:");
        expect(logOutput[0]).toContain("123");
        expect(logOutput[0]).toContain("John");
      });

      test("sanitizes message content", () => {
        safeLog("Message with\ncontrol\tchars");

        expect(logOutput[0]).toBe("Message with control chars");
        expect(logOutput[0]).not.toContain("\n");
        expect(logOutput[0]).not.toContain("\t");
      });

      test("sanitizes data content", () => {
        safeLog("Test", { message: "Data with\nspecial\tchars" });

        expect(logOutput[0]).toContain("Test:");
        // JSON.stringify escapes the characters as \\n and \\t
        expect(logOutput[0]).toContain("Data with\\nspecial\\tchars");
        expect(logOutput[0]).not.toContain("\n");
        expect(logOutput[0]).not.toContain("\t");
      });

      test("handles null data gracefully", () => {
        safeLog("Message with null", null);

        expect(logOutput).toHaveLength(1);
        expect(logOutput[0]).toBe("Message with null");
      });

      test("handles undefined data gracefully", () => {
        safeLog("Message with undefined", undefined);

        expect(logOutput).toHaveLength(1);
        expect(logOutput[0]).toBe("Message with undefined");
      });
    });

    describe("Log Suppression", () => {
      test("suppresses logs when SUPPRESS_LOGS=true", () => {
        process.env.SUPPRESS_LOGS = "true";

        safeLog("This should not appear");

        expect(logOutput).toHaveLength(0);
      });

      test("suppresses logs when NODE_ENV=test", () => {
        process.env.NODE_ENV = "test";

        safeLog("This should not appear");

        expect(logOutput).toHaveLength(0);
      });

      test("logs normally when SUPPRESS_LOGS=false", () => {
        process.env.SUPPRESS_LOGS = "false";

        safeLog("This should appear");

        expect(logOutput).toHaveLength(1);
        expect(logOutput[0]).toBe("This should appear");
      });

      test("logs normally when NODE_ENV is not test", () => {
        process.env.NODE_ENV = "development";

        safeLog("This should appear");

        expect(logOutput).toHaveLength(1);
        expect(logOutput[0]).toBe("This should appear");
      });
    });

    describe("Security Features", () => {
      test("prevents log injection through message", () => {
        const maliciousInput =
          "User login\n[INJECTED] Admin access granted\nReal message";

        safeLog(maliciousInput);

        expect(logOutput[0]).toBe(
          "User login [INJECTED] Admin access granted Real message"
        );
        expect(logOutput).toHaveLength(1); // Should not create multiple log entries
      });

      test("prevents log injection through data", () => {
        const maliciousData = {
          username: "user123",
          message: "Login successful\n[FAKE] Elevated privileges granted",
        };

        safeLog("User login", maliciousData);

        expect(logOutput[0]).toContain(
          "Login successful\\n[FAKE] Elevated privileges granted"
        );
        expect(logOutput).toHaveLength(1);
      });

      test("handles extremely long messages", () => {
        const veryLongMessage = "A".repeat(2000);

        safeLog(veryLongMessage);

        expect(logOutput[0].length).toBe(1000); // Should be truncated
        expect(logOutput[0]).toBe("A".repeat(1000));
      });

      test("handles circular references in data safely", () => {
        const obj = { name: "test" };
        obj.circular = obj;

        safeLog("Circular test", obj);

        expect(logOutput).toHaveLength(1);
        expect(logOutput[0]).toContain("Circular test:");
        expect(logOutput[0]).toContain("[Object - could not serialize]");
      });
    });

    describe("Edge Cases", () => {
      test("handles empty string message", () => {
        safeLog("");

        expect(logOutput).toHaveLength(1);
        expect(logOutput[0]).toBe("");
      });

      test("handles numeric messages", () => {
        safeLog(42);

        expect(logOutput).toHaveLength(1);
        expect(logOutput[0]).toBe("42");
      });

      test("handles boolean messages", () => {
        safeLog(true);
        safeLog(false);

        expect(logOutput).toHaveLength(2);
        expect(logOutput[0]).toBe("true");
        expect(logOutput[1]).toBe("false");
      });

      test("handles object as message", () => {
        safeLog({ type: "info", content: "test" });

        expect(logOutput).toHaveLength(1);
        expect(logOutput[0]).toContain("info");
        expect(logOutput[0]).toContain("test");
      });
    });
  });

  describe("Integration Tests", () => {
    test("safeLog uses sanitizeForLog for both message and data", () => {
      const unsafeMessage = "Message\nwith\tcontrols";
      const unsafeData = { value: "Data\nwith\tcontrols" };

      safeLog(unsafeMessage, unsafeData);

      // The message newlines/tabs become spaces, the JSON is compressed due to sanitization,
      // and the JSON values keep their escaped characters
      expect(logOutput[0]).toBe(
        'Message with controls: {   "value": "Data\\nwith\\tcontrols" }'
      );
    });

    test("consistent sanitization across different input types", () => {
      const testCases = [
        "Simple string",
        "String\nwith\nlines",
        { obj: "value" },
        ["array", "values"],
        42,
        true,
        null,
      ];

      testCases.forEach((testCase, index) => {
        safeLog(`Test ${index}`, testCase);
      });

      // All logs should be safe (no control chars, proper formatting)
      logOutput.forEach((log) => {
        expect(log).not.toContain("\x00");
        expect(log).not.toContain("\x01");
        expect(log.length).toBeLessThanOrEqual(2000); // Reasonable upper bound
      });
    });
  });
});
