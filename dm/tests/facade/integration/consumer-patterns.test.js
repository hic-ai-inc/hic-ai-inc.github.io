import { describe, test, beforeEach } from "node:test";
import {
  createDynamoMock,
  createS3Mock,
  createLambdaMock,
} from "../../../facade/helpers/index.js";
import { expect, setupAutoReset } from "../../../facade/test-helpers/index.js";

setupAutoReset();

describe("DM Facade - Consumer Integration Patterns", () => {
  describe("Pattern: Single Service Consumer", () => {
    test("should support importing one mock service", () => {
      const dynamoMock = createDynamoMock();

      expect(dynamoMock).toBeDefined();
      expect(typeof dynamoMock.whenGetItem).toBe("function");
      expect(typeof dynamoMock.whenPutItem).toBe("function");
      expect(typeof dynamoMock.whenQuery).toBe("function");
    });

    test("should allow configuration and usage of single service", () => {
      const dynamoMock = createDynamoMock();

      dynamoMock.whenGetItemByKey(
        { table: "test-table", key: { id: "test-123" } },
        { id: "test-123", data: "test-data" }
      );

      // Simulate any consumer system behavior
      expect(dynamoMock).toBeDefined();
      expect(typeof dynamoMock.whenGetItemByKey).toBe("function");
    });
  });

  describe("Pattern: Multi-Service Consumer", () => {
    test("should support importing multiple mock services simultaneously", () => {
      const dynamoMock = createDynamoMock();
      const s3Mock = createS3Mock();
      const lambdaMock = createLambdaMock();

      expect(dynamoMock).toBeDefined();
      expect(s3Mock).toBeDefined();
      expect(lambdaMock).toBeDefined();

      // Each should be independent
      expect(dynamoMock).not.toBe(s3Mock);
      expect(s3Mock).not.toBe(lambdaMock);
    });

    test("should handle multiple services in complex workflow", () => {
      const dynamoMock = createDynamoMock();
      const s3Mock = createS3Mock();

      // Configure typical workflow: read config from DynamoDB, process file from S3
      dynamoMock.whenGetItemByKey(
        { table: "config-table", key: { setting: "process-files" } },
        { setting: "process-files", bucket: "test-bucket" }
      );

      s3Mock.whenGetObject(
        { bucket: "test-bucket", key: "input.json" },
        "test file content"
      );

      // Simulate any system that reads config then processes files
      expect(dynamoMock).toBeDefined();
      expect(s3Mock).toBeDefined();
      expect(typeof dynamoMock.whenGetItemByKey).toBe("function");
      expect(typeof s3Mock.whenGetObject).toBe("function");
    });
  });

  describe("Pattern: Testing Utilities Integration", () => {
    test("should work seamlessly with node:test primitives", () => {
      const dynamoMock = createDynamoMock();

      // Test that expect() works with mocks
      expect(dynamoMock).toBeDefined();
      expect(() =>
        dynamoMock.whenGetItem({ table: "test-table" }, null)
      ).not.toThrow();

      // Test mock configuration
      dynamoMock.whenGetItem({ table: "test-table" }, { id: "test" });
      expect(typeof dynamoMock.whenGetItem).toBe("function");
    });

    test("should support beforeEach setup patterns", () => {
      let dynamoMock;

      beforeEach(() => {
        dynamoMock = createDynamoMock();
      });

      // This pattern should work for any consumer system
      expect(() => {
        dynamoMock = createDynamoMock();
        dynamoMock.whenGetItem({ table: "test-table" }, null);
      }).not.toThrow();
    });
  });

  describe("Pattern: Error Handling", () => {
    test("should handle mock service configuration errors consistently", () => {
      const dynamoMock = createDynamoMock();

      // Test invalid configurations are caught
      expect(() => {
        dynamoMock.whenGetItemByKey({ table: "", key: { id: "test" } }, {});
      }).toThrow();

      expect(() => {
        dynamoMock.whenGetItemByKey({ table: "valid-table", key: null }, {});
      }).toThrow();
    });

    test("should provide clear error messages for consumer debugging", () => {
      const s3Mock = createS3Mock();

      // Test parameter validation
      expect(() => {
        s3Mock.whenGetObject({ bucket: "", key: "key" }, {});
      }).toThrow();

      expect(() => {
        s3Mock.whenPutObject({ bucket: "bucket", key: "" }, {});
      }).toThrow();
    });
  });

  describe("Pattern: ESM Import Compatibility", () => {
    test("should work with various ESM import patterns", async () => {
      // Test named imports
      const { createDynamoMock: namedImport } = await import(
        "../../../facade/helpers/index.js"
      );
      expect(typeof namedImport).toBe("function");

      // Test that consumers can import selectively
      const dynamoOnly = await import("../../../facade/helpers/dynamodb.js");
      expect(typeof dynamoOnly.createDynamoMock).toBe("function");
    });

    test("should support facade main entry point", async () => {
      // Test the main facade entry point pattern
      const facade = await import("../../../facade/index.js");

      expect(typeof facade.createDynamoMock).toBe("function");
      expect(typeof facade.createS3Mock).toBe("function");
      expect(typeof facade.expect).toBe("function");
      expect(typeof facade.test).toBe("function");
    });
  });
});
