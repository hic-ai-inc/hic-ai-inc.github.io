import { describe, test, beforeEach, afterEach } from "node:test";
import { expect } from "../../../../../facade/test-helpers/index.js";

// Import the utility we're testing
import { HicLog } from "../../../../../layers/base/src/hic-log.js";

describe("hic-log.js - HIC Base Layer Structured Logging", () => {
  let originalEnv;
  let originalConsoleLog;
  let logOutput;
  let logger;

  beforeEach(() => {
    originalEnv = { ...process.env };
    originalConsoleLog = console.log;
    logOutput = [];

    // Capture console.log output
    console.log = (message) => {
      logOutput.push(message);
    };

    // Reset log level to DEBUG for tests
    delete process.env.LOG_LEVEL;

    logger = new HicLog("test-service");
  });

  afterEach(() => {
    process.env = originalEnv;
    console.log = originalConsoleLog;
  });

  describe("Logger Construction", () => {
    test("creates logger with service name", () => {
      const testLogger = new HicLog("my-service");

      testLogger.info("test message");

      expect(logOutput).toHaveLength(1);
      const logEntry = JSON.parse(logOutput[0]);
      expect(logEntry.service).toBe("my-service");
    });

    test("generates correlation ID automatically", () => {
      const testLogger = new HicLog("test-service");

      testLogger.info("test message");

      expect(logOutput).toHaveLength(1);
      const logEntry = JSON.parse(logOutput[0]);
      expect(logEntry.correlationId).toBeTruthy();
      expect(typeof logEntry.correlationId).toBe("string");
      expect(logEntry.correlationId.length).toBeGreaterThan(10);
    });

    test("accepts custom correlation ID", () => {
      const customId = "custom-correlation-123";
      const testLogger = new HicLog("test-service", customId);

      testLogger.info("test message");

      expect(logOutput).toHaveLength(1);
      const logEntry = JSON.parse(logOutput[0]);
      expect(logEntry.correlationId).toBe(customId);
    });

    test("records start time for duration calculations", () => {
      const testLogger = new HicLog("test-service");
      expect(testLogger.startTime).toBeTruthy();
      expect(typeof testLogger.startTime).toBe("number");
      expect(testLogger.startTime).toBeLessThanOrEqual(Date.now());
    });
  });

  describe("Log Level Filtering", () => {
    test("logs all levels when LOG_LEVEL=DEBUG (default)", () => {
      delete process.env.LOG_LEVEL;

      logger.debug("debug message");
      logger.info("info message");
      logger.warn("warn message");
      logger.error("error message");

      expect(logOutput).toHaveLength(4);
    });

    test("filters out DEBUG when LOG_LEVEL=INFO", () => {
      process.env.LOG_LEVEL = "INFO";
      const testLogger = new HicLog("test-service");

      testLogger.debug("debug message");
      testLogger.info("info message");
      testLogger.warn("warn message");
      testLogger.error("error message");

      expect(logOutput).toHaveLength(3);
      expect(logOutput.some((log) => JSON.parse(log).level === "DEBUG")).toBe(
        false
      );
    });

    test("filters out DEBUG and INFO when LOG_LEVEL=WARN", () => {
      process.env.LOG_LEVEL = "WARN";
      const testLogger = new HicLog("test-service");

      testLogger.debug("debug message");
      testLogger.info("info message");
      testLogger.warn("warn message");
      testLogger.error("error message");

      expect(logOutput).toHaveLength(2);
      expect(logOutput.some((log) => JSON.parse(log).level === "DEBUG")).toBe(
        false
      );
      expect(logOutput.some((log) => JSON.parse(log).level === "INFO")).toBe(
        false
      );
    });

    test("only logs ERROR when LOG_LEVEL=ERROR", () => {
      process.env.LOG_LEVEL = "ERROR";
      const testLogger = new HicLog("test-service");

      testLogger.debug("debug message");
      testLogger.info("info message");
      testLogger.warn("warn message");
      testLogger.error("error message");

      expect(logOutput).toHaveLength(1);
      const logEntry = JSON.parse(logOutput[0]);
      expect(logEntry.level).toBe("ERROR");
    });

    test("defaults to DEBUG for invalid LOG_LEVEL", () => {
      process.env.LOG_LEVEL = "INVALID";
      const testLogger = new HicLog("test-service");

      testLogger.debug("debug message");

      expect(logOutput).toHaveLength(1);
    });

    test("handles case-insensitive LOG_LEVEL", () => {
      process.env.LOG_LEVEL = "warn";
      const testLogger = new HicLog("test-service");

      testLogger.info("info message");
      testLogger.warn("warn message");

      expect(logOutput).toHaveLength(1);
      const logEntry = JSON.parse(logOutput[0]);
      expect(logEntry.level).toBe("WARN");
    });
  });

  describe("Basic Logging Methods", () => {
    test("info() creates structured log entry", () => {
      logger.info("Test info message", { key: "value" });

      expect(logOutput).toHaveLength(1);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry.level).toBe("INFO");
      expect(logEntry.event).toBe("info");
      expect(logEntry.message).toBe("Test info message");
      expect(logEntry.key).toBe("value");
      expect(logEntry.timestamp).toBeTruthy();
      expect(logEntry.service).toBe("test-service");
    });

    test("warn() creates warning log entry", () => {
      logger.warn("Test warning", { severity: "medium" });

      expect(logOutput).toHaveLength(1);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry.level).toBe("WARN");
      expect(logEntry.event).toBe("warning");
      expect(logEntry.message).toBe("Test warning");
      expect(logEntry.severity).toBe("medium");
    });

    test("error() creates error log entry with error details", () => {
      const testError = new Error("Test error");
      testError.name = "TestError";

      logger.error("Something went wrong", testError, { context: "test" });

      expect(logOutput).toHaveLength(1);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry.level).toBe("ERROR");
      expect(logEntry.event).toBe("error");
      expect(logEntry.message).toBe("Something went wrong");
      expect(logEntry.error_name).toBe("TestError");
      expect(logEntry.error_message).toBe("Test error");
      expect(logEntry.context).toBe("test");
    });

    test("error() works without error object", () => {
      logger.error("Simple error message", null, { context: "test" });

      expect(logOutput).toHaveLength(1);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry.level).toBe("ERROR");
      expect(logEntry.message).toBe("Simple error message");
      expect(logEntry.context).toBe("test");
      expect(logEntry.error_name).toBeUndefined();
      expect(logEntry.error_message).toBeUndefined();
    });

    test("debug() creates debug log entry", () => {
      logger.debug("Debug information", { details: "verbose" });

      expect(logOutput).toHaveLength(1);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry.level).toBe("DEBUG");
      expect(logEntry.event).toBe("debug");
      expect(logEntry.message).toBe("Debug information");
      expect(logEntry.details).toBe("verbose");
    });

    test("debug() suppressed in production", () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      try {
        logger.debug("Debug in production");
        expect(logOutput).toHaveLength(0);
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });
  });

  describe("Workflow Lifecycle Logging", () => {
    test("logWorkflowStart() creates workflow start entry", () => {
      logger.logWorkflowStart("data-processing", { batchId: "batch-123" });

      expect(logOutput).toHaveLength(1);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry.level).toBe("INFO");
      expect(logEntry.event).toBe("workflow_start");
      expect(logEntry.message).toBe("Starting data-processing");
      expect(logEntry.operation).toBe("data-processing");
      expect(logEntry.batchId).toBe("batch-123");
    });

    test("logWorkflowComplete() creates completion entry with duration", () => {
      // Simulate some time passing
      logger.startTime = Date.now() - 1000; // 1 second ago

      logger.logWorkflowComplete("data-processing", { recordsProcessed: 100 });

      expect(logOutput).toHaveLength(1);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry.level).toBe("INFO");
      expect(logEntry.event).toBe("workflow_complete");
      expect(logEntry.message).toBe("Completed data-processing");
      expect(logEntry.operation).toBe("data-processing");
      expect(logEntry.recordsProcessed).toBe(100);
      expect(logEntry.duration_ms).toBeGreaterThanOrEqual(1000);
    });

    test("logWorkflowError() creates error entry with operation context", () => {
      const testError = new Error("Processing failed");

      logger.logWorkflowError("data-processing", testError, {
        step: "validation",
      });

      expect(logOutput).toHaveLength(1);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry.level).toBe("ERROR");
      expect(logEntry.event).toBe("workflow_error");
      expect(logEntry.message).toBe(
        "Error in data-processing: Processing failed"
      );
      expect(logEntry.operation).toBe("data-processing");
      expect(logEntry.error_name).toBe("Error");
      expect(logEntry.error_message).toBe("Processing failed");
      expect(logEntry.step).toBe("validation");
    });
  });

  describe("AWS Service Logging", () => {
    test("logAWSCall() creates AWS service call entry", () => {
      logger.logAWSCall("DynamoDB", "putItem", {
        tableName: "users",
        itemId: "123",
      });

      expect(logOutput).toHaveLength(1);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry.level).toBe("DEBUG");
      expect(logEntry.event).toBe("aws_call");
      expect(logEntry.message).toBe("AWS DynamoDB.putItem");
      expect(logEntry.aws_service).toBe("DynamoDB");
      expect(logEntry.aws_operation).toBe("putItem");
      expect(logEntry.tableName).toBe("users");
      expect(logEntry.itemId).toBe("123");
    });

    test("logAWSError() creates AWS error entry", () => {
      const awsError = new Error("ResourceNotFoundException");
      awsError.name = "ResourceNotFoundException";

      logger.logAWSError("DynamoDB", "getItem", awsError, {
        tableName: "missing-table",
      });

      expect(logOutput).toHaveLength(1);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry.level).toBe("ERROR");
      expect(logEntry.event).toBe("aws_error");
      expect(logEntry.message).toBe("AWS DynamoDB.getItem failed");
      expect(logEntry.aws_service).toBe("DynamoDB");
      expect(logEntry.aws_operation).toBe("getItem");
      expect(logEntry.error_name).toBe("ResourceNotFoundException");
      expect(logEntry.error_message).toBe("ResourceNotFoundException");
      expect(logEntry.tableName).toBe("missing-table");
    });
  });

  describe("Metrics and Performance Logging", () => {
    test("logMetric() creates metric entry", () => {
      logger.logMetric("records_processed", 150, "Count", {
        source: "batch-job",
      });

      expect(logOutput).toHaveLength(1);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry.level).toBe("INFO");
      expect(logEntry.event).toBe("metric");
      expect(logEntry.message).toBe("Metric: records_processed");
      expect(logEntry.metric_name).toBe("records_processed");
      expect(logEntry.metric_value).toBe(150);
      expect(logEntry.metric_unit).toBe("Count");
      expect(logEntry.source).toBe("batch-job");
    });

    test("logMetric() defaults to Count unit", () => {
      logger.logMetric("api_calls", 42);

      expect(logOutput).toHaveLength(1);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry.metric_unit).toBe("Count");
    });

    test("logDuration() creates duration metric", () => {
      const startTime = Date.now() - 500; // 500ms ago

      logger.logDuration("database_query", startTime, {
        query: "SELECT users",
      });

      expect(logOutput).toHaveLength(1);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry.level).toBe("INFO");
      expect(logEntry.event).toBe("metric");
      expect(logEntry.metric_name).toBe("database_query_duration");
      expect(logEntry.metric_value).toBeGreaterThanOrEqual(500);
      expect(logEntry.metric_unit).toBe("Milliseconds");
      expect(logEntry.operation).toBe("database_query");
      expect(logEntry.query).toBe("SELECT users");
    });
  });

  describe("Generic Integration Events", () => {
    test("logIntegrationEvent() creates custom event entry", () => {
      logger.logIntegrationEvent(
        "third_party_api_call",
        "Called payment processor",
        {
          provider: "stripe",
          endpoint: "/charges",
        }
      );

      expect(logOutput).toHaveLength(1);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry.level).toBe("INFO");
      expect(logEntry.event).toBe("third_party_api_call");
      expect(logEntry.message).toBe("Called payment processor");
      expect(logEntry.provider).toBe("stripe");
      expect(logEntry.endpoint).toBe("/charges");
    });
  });

  describe("Data Sanitization", () => {
    test("sanitizes log messages for security", () => {
      logger.info("Message with\ncontrol\tchars");

      expect(logOutput).toHaveLength(1);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry.message).toBe("Message with control chars");
      expect(logEntry.message).not.toContain("\n");
      expect(logEntry.message).not.toContain("\t");
    });

    test("sanitizes metadata keys and values", () => {
      const metadata = {
        "key\nwith\nnewlines": "value\nwith\nnewlines",
        normalKey: "normal value",
      };

      logger.info("Test message", metadata);

      expect(logOutput).toHaveLength(1);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry["key with newlines"]).toBe("value with newlines");
      expect(logEntry.normalKey).toBe("normal value");
    });

    test("handles circular references in metadata", () => {
      const metadata = { name: "test" };
      metadata.circular = metadata;

      logger.info("Circular test", metadata);

      expect(logOutput).toHaveLength(1);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry.name).toBe("test");
      expect(logEntry.circular).toBe("[Circular]");
    });

    test("sanitizes nested objects in metadata", () => {
      const metadata = {
        user: {
          "name\nwith\nnewlines": "John\nDoe",
          profile: {
            "setting\twith\ttabs": "value\twith\ttabs",
          },
        },
      };

      logger.info("Nested test", metadata);

      expect(logOutput).toHaveLength(1);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry.user["name with newlines"]).toBe("John Doe");
      expect(logEntry.user.profile["setting with tabs"]).toBe(
        "value with tabs"
      );
    });

    test("sanitizes arrays in metadata", () => {
      const metadata = {
        items: [
          "item\nwith\nnewline",
          "normal item",
          { "key\nwith\nnewline": "value\nwith\nnewline" },
        ],
      };

      logger.info("Array test", metadata);

      expect(logOutput).toHaveLength(1);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry.items[0]).toBe("item with newline");
      expect(logEntry.items[1]).toBe("normal item");
      expect(logEntry.items[2]["key with newline"]).toBe("value with newline");
    });
  });

  describe("Timestamp and Format", () => {
    test("includes ISO timestamp in log entries", () => {
      logger.info("Test message");

      expect(logOutput).toHaveLength(1);
      const logEntry = JSON.parse(logOutput[0]);

      expect(logEntry.timestamp).toBeTruthy();
      expect(new Date(logEntry.timestamp).toISOString()).toBe(
        logEntry.timestamp
      );
    });

    test("produces valid JSON output", () => {
      logger.info("Test message", {
        string: "value",
        number: 42,
        boolean: true,
        null_value: null,
        array: [1, 2, 3],
        object: { nested: "value" },
      });

      expect(logOutput).toHaveLength(1);
      expect(() => JSON.parse(logOutput[0])).not.toThrow();

      const logEntry = JSON.parse(logOutput[0]);
      expect(logEntry.string).toBe("value");
      expect(logEntry.number).toBe(42);
      expect(logEntry.boolean).toBe(true);
      expect(logEntry.null_value).toBeNull();
      expect(logEntry.array).toEqual([1, 2, 3]);
      expect(logEntry.object.nested).toBe("value");
    });

    test("handles JSON serialization edge cases", () => {
      const metadata = {
        undefined_value: undefined,
        function_value: () => "test",
        symbol_value: Symbol("test"),
        date_value: new Date("2025-01-01T00:00:00Z"),
      };

      logger.info("Edge case test", metadata);

      expect(logOutput).toHaveLength(1);
      expect(() => JSON.parse(logOutput[0])).not.toThrow();

      const logEntry = JSON.parse(logOutput[0]);
      // These should be serialized according to JSON.stringify rules
      expect(logEntry.undefined_value).toBeUndefined(); // undefined values are dropped
      expect(logEntry.date_value).toBe("2025-01-01T00:00:00.000Z");
    });
  });

  describe("Correlation ID Consistency", () => {
    test("maintains same correlation ID across multiple log calls", () => {
      logger.info("First message");
      logger.warn("Second message");
      logger.error("Third message");

      expect(logOutput).toHaveLength(3);

      const correlationIds = logOutput.map(
        (log) => JSON.parse(log).correlationId
      );
      expect(correlationIds[0]).toBe(correlationIds[1]);
      expect(correlationIds[1]).toBe(correlationIds[2]);
    });

    test("different logger instances have different correlation IDs", () => {
      const logger2 = new HicLog("other-service");

      logger.info("First logger");
      logger2.info("Second logger");

      expect(logOutput).toHaveLength(2);

      const log1 = JSON.parse(logOutput[0]);
      const log2 = JSON.parse(logOutput[1]);

      expect(log1.correlationId).not.toBe(log2.correlationId);
    });
  });

  describe("Performance", () => {
    test("handles high-volume logging efficiently", () => {
      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        logger.info(`Message ${i}`, { iteration: i, data: "test data" });
      }

      const duration = Date.now() - start;

      expect(logOutput).toHaveLength(1000);
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
    });

    test("handles large metadata objects efficiently", () => {
      const largeMetadata = {};
      for (let i = 0; i < 100; i++) {
        largeMetadata[`key${i}`] = `value${i}`.repeat(10);
      }

      const start = Date.now();
      logger.info("Large metadata test", largeMetadata);
      const duration = Date.now() - start;

      expect(logOutput).toHaveLength(1);
      expect(duration).toBeLessThan(100);

      const logEntry = JSON.parse(logOutput[0]);
      expect(Object.keys(logEntry).length).toBeGreaterThan(100); // All keys should be present
    });
  });
});
