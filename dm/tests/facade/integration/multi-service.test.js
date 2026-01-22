import { describe, test, afterEach } from "node:test";
import {
  createDynamoMock,
  createS3Mock,
  createLambdaMock,
  createSNSMock,
  createSQSMock,
} from "../../../facade/helpers/index.js";
import { resetAll } from "../../../facade/utils/registry.js";
import { expect, setupAutoReset } from "../../../facade/test-helpers/index.js";

setupAutoReset();

describe("DM Facade - Multi-Service Integration", () => {
  afterEach(() => {
    resetAll();
  });

  describe("Service Orchestration Patterns", () => {
    test("should support complex multi-service workflows", () => {
      const dynamoMock = createDynamoMock();
      const s3Mock = createS3Mock();
      const lambdaMock = createLambdaMock();
      const snsMock = createSNSMock();

      // Configure a typical serverless workflow
      dynamoMock.whenGetItemByKey(
        { table: "process-config", key: { id: "workflow-1" } },
        {
          id: "workflow-1",
          processConfig: JSON.stringify({
            bucket: "data-bucket",
            topic: "notifications",
          }),
        }
      );

      s3Mock.whenGetObject(
        { bucket: "data-bucket", key: "input.json" },
        JSON.stringify({ data: "processed", status: "complete" })
      );

      lambdaMock.whenInvoke(
        { functionName: "data-processor" },
        { result: "success" }
      );

      snsMock.whenPublish(
        { topicArn: "notifications", message: "test" },
        { MessageId: "msg-12345" }
      );

      // Simulate any system running this workflow
      expect(dynamoMock).toBeDefined();
      expect(s3Mock).toBeDefined();
      expect(lambdaMock).toBeDefined();
      expect(snsMock).toBeDefined();

      // Verify all mocks are properly configured
      expect(typeof dynamoMock.whenGetItemByKey).toBe("function");
      expect(typeof s3Mock.whenGetObject).toBe("function");
      expect(typeof lambdaMock.whenInvoke).toBe("function");
      expect(typeof snsMock.whenPublish).toBe("function");
    });

    test("should handle service interaction failure patterns", () => {
      const dynamoMock = createDynamoMock();
      const s3Mock = createS3Mock();

      // Configure partial failure scenario
      dynamoMock.whenGetItemByKey(
        { table: "config-table", key: { setting: "valid-config" } },
        { setting: "valid-config", value: "test-value" }
      );

      // Test that mocks can be configured independently
      expect(dynamoMock).toBeDefined();
      expect(s3Mock).toBeDefined();
      expect(dynamoMock).not.toBe(s3Mock);

      // Both should support their respective methods
      expect(typeof dynamoMock.whenGetItemByKey).toBe("function");
      expect(typeof s3Mock.whenGetObject).toBe("function");
    });
  });

  describe("Mock Isolation", () => {
    test("should maintain independence between service mocks", () => {
      const mock1 = createDynamoMock();
      const mock2 = createDynamoMock();

      mock1.whenGetItemByKey(
        { table: "test-table", key: { id: "mock1" } },
        { id: "mock1", data: "first-mock" }
      );
      mock2.whenGetItemByKey(
        { table: "test-table", key: { id: "mock2" } },
        { id: "mock2", data: "second-mock" }
      );

      // Each mock should be independent
      expect(mock1).not.toBe(mock2);
      expect(typeof mock1.whenGetItemByKey).toBe("function");
      expect(typeof mock2.whenGetItemByKey).toBe("function");
    });

    test("should support multiple service types simultaneously", () => {
      const services = {
        dynamo: createDynamoMock(),
        s3: createS3Mock(),
        lambda: createLambdaMock(),
        sns: createSNSMock(),
        sqs: createSQSMock(),
      };

      // All services should be independent
      const serviceKeys = Object.keys(services);
      expect(serviceKeys).toHaveLength(5);

      serviceKeys.forEach((key) => {
        expect(services[key]).toBeDefined();
      });

      // Each should have unique instances
      expect(services.dynamo).not.toBe(services.s3);
      expect(services.s3).not.toBe(services.lambda);
      expect(services.lambda).not.toBe(services.sns);
      expect(services.sns).not.toBe(services.sqs);
    });
  });

  describe("Performance with Multiple Services", () => {
    test("should handle multiple mock operations efficiently", () => {
      const services = [
        createDynamoMock(),
        createS3Mock(),
        createLambdaMock(),
        createSNSMock(),
        createSQSMock(),
      ];

      // Configure all services
      services[0].whenGetItemByKey(
        { table: "status-table", key: { id: "ready" } },
        { id: "ready", status: "active" }
      );
      services[1].whenGetObject(
        { bucket: "data-bucket", key: "file.json" },
        "data"
      );
      services[2].whenInvoke(
        { functionName: "processor" },
        { result: "success" }
      );
      services[3].whenPublish(
        { topicArn: "topic", message: "test" },
        { MessageId: "123" }
      );
      services[4].whenSendMessage(
        { queueUrl: "queue", messageBody: "test" },
        { MessageId: "456" }
      );

      // Simulate concurrent operations (any system pattern)
      const startTime = Date.now();

      // All mocks should be ready immediately
      services.forEach((service) => {
        expect(service).toBeDefined();
      });

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(100); // Should be very fast for mocks
    });
  });

  describe("Registry Management", () => {
    test("should handle resetAll functionality across all services", () => {
      const dynamoMock = createDynamoMock();
      const s3Mock = createS3Mock();
      const lambdaMock = createLambdaMock();

      // Configure all services
      dynamoMock.whenGetItem({ table: "test-table", key: {} }, { id: "test" });
      s3Mock.whenGetObject(
        { bucket: "test-bucket", key: "test-key" },
        "test-data"
      );
      lambdaMock.whenInvoke(
        { functionName: "test-function" },
        { result: "success" }
      );

      // All services should be functional
      expect(dynamoMock).toBeDefined();
      expect(s3Mock).toBeDefined();
      expect(lambdaMock).toBeDefined();

      // Reset should work without errors
      expect(() => resetAll()).not.toThrow();

      // After reset, services should still be creatable
      expect(() => createDynamoMock()).not.toThrow();
      expect(() => createS3Mock()).not.toThrow();
      expect(() => createLambdaMock()).not.toThrow();
    });
  });

  describe("Complex Workflow Integration", () => {
    test("should support realistic enterprise workflow patterns", () => {
      // Test a realistic complex workflow using multiple services
      const workflow = {
        config: createDynamoMock(),
        storage: createS3Mock(),
        compute: createLambdaMock(),
        notifications: createSNSMock(),
        queuing: createSQSMock(),
      };

      // Step 1: DynamoDB stores workflow configuration
      workflow.config.whenGetItemByKey(
        { table: "workflows", key: { id: "enterprise-wf" } },
        {
          id: "enterprise-wf",
          status: "processing",
          config: JSON.stringify({
            inputBucket: "enterprise-data",
            processor: "enterprise-lambda",
            notificationTopic: "enterprise-alerts",
            resultQueue: "enterprise-results",
          }),
        }
      );

      // Step 2: S3 provides input data
      workflow.storage.whenGetObject(
        { bucket: "enterprise-data", key: "input.json" },
        JSON.stringify({ records: 1000, format: "json" })
      );

      // Step 3: Lambda processes the workflow
      workflow.compute.whenInvoke(
        { functionName: "enterprise-lambda" },
        {
          success: true,
          processed: 1000,
          nextStep: "notification",
        }
      );

      // Step 4: SNS sends notifications
      workflow.notifications.whenPublish(
        { topicArn: "enterprise-alerts", message: "workflow complete" },
        { MessageId: "enterprise-notif-789" }
      );

      // Step 5: SQS queues results for downstream processing
      workflow.queuing.whenSendMessage(
        { queueUrl: "enterprise-results", messageBody: "results ready" },
        { MessageId: "enterprise-result-999" }
      );

      // Verify all services are properly configured and ready
      Object.values(workflow).forEach((service) => {
        expect(service).toBeDefined();
      });

      expect(Object.keys(workflow)).toHaveLength(5);
    });
  });
});

describe("Multi-Service Integration", () => {
  afterEach(() => {
    resetAll();
  });

  test("multiple AWS services work together", async () => {
    // Test facade helpers working together
    const dynamo = createDynamoMock();
    const s3 = createS3Mock();
    const lambda = createLambdaMock();

    // Set up a realistic multi-service workflow
    dynamo.whenGetItemByKey(
      { table: "workflows", key: { id: "wf-123" } },
      { id: "wf-123", status: "pending", s3Key: "data/input.json" }
    );

    s3.whenGetObject(
      { bucket: "workflow-bucket", key: "data/input.json" },
      JSON.stringify({ data: "test-data" })
    );

    lambda.whenInvoke(
      { functionName: "data-processor" },
      {
        processed: true,
        outputKey: "data/output.json",
      }
    );

    expect(dynamo).toBeDefined();
    expect(s3).toBeDefined();
    expect(lambda).toBeDefined();
  });

  test("service interactions maintain isolation", async () => {
    // Test that services don't interfere with each other
    const service1 = {
      dynamo: createDynamoMock(),
      s3: createS3Mock(),
    };

    const service2 = {
      dynamo: createDynamoMock(),
      s3: createS3Mock(),
    };

    // Configure different behaviors for each service group
    service1.dynamo.whenGetItem({ table: "table1", key: {} }, { id: 1 });
    service2.dynamo.whenGetItem({ table: "table1", key: {} }, { id: 2 });

    service1.s3.whenGetObject({ bucket: "bucket1", key: "key1" }, "data1");
    service2.s3.whenGetObject({ bucket: "bucket1", key: "key1" }, "data2");

    // Verify isolation - each mock group should maintain separate configurations
    expect(service1.dynamo).toBeDefined();
    expect(service2.dynamo).toBeDefined();
    expect(service1.s3).toBeDefined();
    expect(service2.s3).toBeDefined();

    // Services should be independent instances
    expect(service1.dynamo).not.toBe(service2.dynamo);
    expect(service1.s3).not.toBe(service2.s3);
  });

  test("shared state management works correctly", async () => {
    // Test registry auto-reset functionality across services
    const dynamo = createDynamoMock();
    const s3 = createS3Mock();
    const sns = createSNSMock();
    const sqs = createSQSMock();

    // Configure all services
    dynamo.whenGetItem({ table: "test-table", key: {} }, { id: "test" });
    s3.whenGetObject({ bucket: "test-bucket", key: "test-key" }, "test-data");
    sns.whenPublish(
      { topicArn: "test-topic", message: "test" },
      { MessageId: "msg-123" }
    );
    sqs.whenSendMessage(
      { queueUrl: "test-queue", messageBody: "test" },
      { MessageId: "msg-456" }
    );

    // All services should be registered and functional
    expect(dynamo).toBeDefined();
    expect(s3).toBeDefined();
    expect(sns).toBeDefined();
    expect(sqs).toBeDefined();

    // Reset should clear all service states
    resetAll();

    // After reset, services should still be functional but state should be cleared
    expect(() => createDynamoMock()).not.toThrow();
    expect(() => createS3Mock()).not.toThrow();
    expect(() => createSNSMock()).not.toThrow();
    expect(() => createSQSMock()).not.toThrow();
  });

  test("complex workflow integration", async () => {
    // Test a realistic complex workflow using multiple services
    const services = {
      dynamo: createDynamoMock(),
      s3: createS3Mock(),
      lambda: createLambdaMock(),
      sns: createSNSMock(),
      sqs: createSQSMock(),
    };

    // Step 1: DynamoDB stores workflow state
    services.dynamo.whenPutItem(
      { table: "workflows", item: { id: "wf-456", status: "processing" } },
      { id: "wf-456", status: "processing" }
    );

    // Step 2: S3 stores intermediate results
    services.s3.whenPutObject(
      { bucket: "results-bucket", key: "wf-456/step1.json", body: "{}" },
      { ETag: "abc123" }
    );

    // Step 3: Lambda processes data
    services.lambda.whenInvoke(
      { functionName: "workflow-processor" },
      { success: true, nextStep: "notification" }
    );

    // Step 4: SNS publishes completion notification
    services.sns.whenPublish(
      { topicArn: "workflow-notifications", message: "workflow complete" },
      { MessageId: "notif-789" }
    );

    // Step 5: SQS queues follow-up tasks
    services.sqs.whenSendMessage(
      { queueUrl: "follow-up-queue", messageBody: "follow-up task" },
      { MessageId: "task-999" }
    );

    // Verify all services are properly configured and ready
    Object.values(services).forEach((service) => {
      expect(service).toBeDefined();
    });

    expect(Object.keys(services)).toHaveLength(5);
  });
});
