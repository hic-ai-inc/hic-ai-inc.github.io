import { describe, test } from "node:test";
import { expect } from "../../../../../facade/test-helpers/index.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  mkdirSync,
  rmSync,
  existsSync,
  writeFileSync,
  readFileSync,
} from "node:fs";

// Import all the utilities from the index
import {
  safeLog,
  sanitizeForLog,
  safePath,
  safeJsonParse,
  HicLog,
} from "../../../../../layers/base/src/index.js";

describe("index.js - HIC Base Layer Main Exports", () => {
  describe("Export Verification", () => {
    test("exports safeLog function", () => {
      expect(typeof safeLog).toBe("function");
      expect(safeLog.name).toBe("safeLog");
    });

    test("exports sanitizeForLog function", () => {
      expect(typeof sanitizeForLog).toBe("function");
      expect(sanitizeForLog.name).toBe("sanitizeForLog");
    });

    test("exports safePath function", () => {
      expect(typeof safePath).toBe("function");
      expect(safePath.name).toBe("safePath");
    });

    test("exports safeJsonParse function", () => {
      expect(typeof safeJsonParse).toBe("function");
      expect(safeJsonParse.name).toBe("safeJsonParse");
    });

    test("exports HicLog class", () => {
      expect(typeof HicLog).toBe("function");
      expect(HicLog.name).toBe("HicLog");
      expect(HicLog.prototype.constructor).toBe(HicLog);
    });
  });

  describe("Functional Integration", () => {
    test("safeLog and sanitizeForLog work together", () => {
      let logOutput = "";
      const originalConsoleLog = console.log;
      console.log = (message) => {
        logOutput = message;
      };

      try {
        const unsafeInput = "Test\nmessage\twith\x00controls";
        safeLog(unsafeInput);

        expect(logOutput).toBe("Test message with controls");
        expect(logOutput).not.toContain("\n");
        expect(logOutput).not.toContain("\t");
        expect(logOutput).not.toContain("\x00");
      } finally {
        console.log = originalConsoleLog;
      }
    });

    test("HicLog uses sanitizeForLog internally", () => {
      let logOutput = "";
      const originalConsoleLog = console.log;
      console.log = (message) => {
        logOutput = message;
      };

      try {
        const logger = new HicLog("test-service");
        logger.info("Message with\ncontrols", { key: "value\nwith\ncontrols" });

        const logEntry = JSON.parse(logOutput);
        expect(logEntry.message).toBe("Message with controls");
        expect(logEntry.key).toBe("value with controls");
      } finally {
        console.log = originalConsoleLog;
      }
    });

    test("safePath validates paths securely", () => {
      // Create a temporary directory for testing
      const testDir = join(tmpdir(), `index-test-${Date.now()}`);
      mkdirSync(testDir, { recursive: true });

      try {
        const safeDir = join(testDir, "safe");
        mkdirSync(safeDir, { recursive: true });

        const result = safePath("file.txt", safeDir);
        expect(result).toBe(join(safeDir, "file.txt"));

        expect(() => {
          safePath("../unsafe.txt", safeDir);
        }).toThrow("Path outside allowed directory");
      } finally {
        if (existsSync(testDir)) {
          rmSync(testDir, { recursive: true, force: true });
        }
      }
    });

    test("safeJsonParse parses JSON safely", () => {
      const validJson = '{"name": "test", "value": 42}';
      const result = safeJsonParse(validJson);

      expect(result.name).toBe("test");
      expect(result.value).toBe(42);

      expect(() => {
        safeJsonParse('{"malformed": json}');
      }).toThrow("JSON parse failed");
    });
  });

  describe("Module Structure", () => {
    test("all exports are properly named", () => {
      const expectedExports = [
        "safeLog",
        "sanitizeForLog",
        "safePath",
        "safeJsonParse",
        "HicLog",
      ];

      const actualExports = [
        safeLog,
        sanitizeForLog,
        safePath,
        safeJsonParse,
        HicLog,
      ];

      expectedExports.forEach((name, index) => {
        expect(actualExports[index]).toBeTruthy();
        expect(typeof actualExports[index]).toBe(
          index === 4 ? "function" : "function"
        ); // HicLog is a class constructor
      });
    });

    test("exports are distinct and not duplicated", () => {
      const exports = [
        safeLog,
        sanitizeForLog,
        safePath,
        safeJsonParse,
        HicLog,
      ];
      const uniqueExports = new Set(exports);

      expect(uniqueExports.size).toBe(exports.length);
    });
  });

  describe("Real-world Usage Patterns", () => {
    test("complete logging workflow", () => {
      let logOutput = [];
      const originalConsoleLog = console.log;
      console.log = (message) => {
        logOutput.push(message);
      };

      try {
        // Initialize logger
        const logger = new HicLog("integration-test");

        // Log workflow start
        logger.logWorkflowStart("data-processing");

        // Simulate processing with sanitized data
        const userData = { name: "John\nDoe", email: "john@example.com" };
        // Create a JSON string with actual control characters (not escaped)
        const rawJsonString = '{"name":"John\nDoe","email":"john@example.com"}';
        const sanitizedData = sanitizeForLog(rawJsonString);
        logger.info("Processing user data", { sanitizedData });

        // Log completion
        logger.logWorkflowComplete("data-processing", { recordsProcessed: 1 });

        expect(logOutput).toHaveLength(3);

        // Verify all logs have same correlation ID
        const logs = logOutput.map((log) => JSON.parse(log));
        expect(logs[0].correlationId).toBe(logs[1].correlationId);
        expect(logs[1].correlationId).toBe(logs[2].correlationId);

        // Verify sanitization worked - the sanitizedData contains JSON that has been sanitized
        expect(logs[1].sanitizedData).toContain("John Doe");
        expect(logs[1].sanitizedData).toContain("john@example.com");
        expect(logs[1].sanitizedData).not.toContain("\\n"); // Should not contain escaped newlines
      } finally {
        console.log = originalConsoleLog;
      }
    });

    test("security-focused file processing workflow", () => {
      const testDir = join(tmpdir(), `security-test-${Date.now()}`);

      try {
        // Setup secure directory
        const secureDir = join(testDir, "secure");
        mkdirSync(secureDir, { recursive: true });

        // Write test config
        const configData = { setting: "value", secret: "hidden" };
        const configPath = join(secureDir, "config.json");
        writeFileSync(configPath, JSON.stringify(configData));

        // Simulate secure file processing
        const userInput = "config.json"; // Safe input
        const maliciousInput = "../../../etc/passwd"; // Malicious input

        // Safe path validation
        const safePath1 = safePath(userInput, secureDir);
        expect(safePath1).toBe(configPath);

        expect(() => {
          safePath(maliciousInput, secureDir);
        }).toThrow("Path outside allowed directory");

        // Safe JSON parsing with limits
        const configContent = readFileSync(configPath, "utf8");
        const parsedConfig = safeJsonParse(configContent, {
          source: "user-config",
          maxKeys: 10,
          maxDepth: 3,
        });

        expect(parsedConfig.setting).toBe("value");

        // Safe logging (would sanitize sensitive data)
        let logOutput = "";
        const originalConsoleLog = console.log;
        console.log = (message) => {
          logOutput = message;
        };

        try {
          safeLog("Config loaded", parsedConfig);
          expect(logOutput).toContain("setting");
          expect(logOutput).toContain("value");
        } finally {
          console.log = originalConsoleLog;
        }
      } finally {
        if (existsSync(testDir)) {
          rmSync(testDir, { recursive: true, force: true });
        }
      }
    });

    test("error handling across all utilities", () => {
      let logOutput = [];
      const originalConsoleLog = console.log;
      console.log = (message) => {
        logOutput.push(message);
      };

      try {
        const logger = new HicLog("error-test");

        // Test error scenarios and proper handling
        const testDir = join(tmpdir(), `error-test-${Date.now()}`);
        mkdirSync(testDir, { recursive: true });

        const testCases = [
          {
            name: "Invalid JSON",
            test: () => safeJsonParse('{"invalid": json}'),
            expectedError: "JSON parse failed",
          },
          {
            name: "Path traversal",
            test: () => safePath("../../../etc/passwd", testDir),
            expectedError: "Path outside allowed directory",
          },
          {
            name: "Invalid path input",
            test: () => safePath(null, "/safe/dir"),
            expectedError: "Path input cannot be null",
          },
        ];

        testCases.forEach((testCase) => {
          try {
            testCase.test();
            // Should not reach here
            expect(true).toBe(false, `Expected ${testCase.name} to throw`);
          } catch (error) {
            expect(error.message).toContain(testCase.expectedError);

            // Log the error safely
            logger.error(`${testCase.name} failed as expected`, error);
          }
        });

        // Verify error logging worked
        expect(logOutput).toHaveLength(3);
        logOutput.forEach((log) => {
          const entry = JSON.parse(log);
          expect(entry.level).toBe("ERROR");
          expect(entry.event).toBe("error");
        });

        // Cleanup test directory
        if (existsSync(testDir)) {
          rmSync(testDir, { recursive: true, force: true });
        }
      } finally {
        console.log = originalConsoleLog;
      }
    });
  });

  describe("Performance Integration", () => {
    test("all utilities perform efficiently together", () => {
      const start = Date.now();

      let logOutput = [];
      const originalConsoleLog = console.log;
      console.log = (message) => {
        logOutput.push(message);
      };

      try {
        const logger = new HicLog("performance-test");

        // Simulate a realistic workload using all utilities
        for (let i = 0; i < 100; i++) {
          // Generate some test data
          const testData = {
            id: i,
            message: `Test message ${i}\nwith\tcontrol\x00chars`,
            nested: {
              value: `Nested value ${i}`,
              array: [`item${i}a`, `item${i}b`],
            },
          };

          // Safe JSON parsing
          const jsonString = JSON.stringify(testData);
          const parsed = safeJsonParse(jsonString, { maxKeys: 20 });

          // Safe logging with sanitization
          logger.info(`Processing item ${i}`, {
            sanitizedData: sanitizeForLog(testData.message),
            parsedData: parsed.nested,
          });
        }

        const duration = Date.now() - start;

        expect(logOutput).toHaveLength(100);
        expect(duration).toBeLessThan(1000); // Should complete in under 1 second

        // Verify all logs are properly formatted
        logOutput.forEach((log, index) => {
          const entry = JSON.parse(log);
          expect(entry.message).toBe(`Processing item ${index}`);
          expect(entry.sanitizedData).toBe(
            `Test message ${index} with control chars`
          );
        });
      } finally {
        console.log = originalConsoleLog;
      }
    });
  });
});
