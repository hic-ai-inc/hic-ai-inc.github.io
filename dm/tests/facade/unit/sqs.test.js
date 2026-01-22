import {
  test,
  describe,
  beforeEach,
  expect,
} from "../../../facade/test-helpers/index.js";
import { createSQSMock } from "../../../facade/helpers/sqs.js";
import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  SendMessageBatchCommand,
} from "@aws-sdk/client-sqs";

describe("SQS Facade", () => {
  let sqs;
  let client;

  beforeEach(() => {
    sqs = createSQSMock();
    client = new SQSClient({});
  });

  test("whenSendMessage should mock message sending", async () => {
    sqs.whenSendMessage({
      queueUrl: "https://sqs.us-east-1.amazonaws.com/123456789012/my-queue",
      messageBody: "Hello World",
      messageAttributes: { type: { DataType: "String", StringValue: "test" } },
    });

    const result = await client.send(
      new SendMessageCommand({
        QueueUrl: "https://sqs.us-east-1.amazonaws.com/123456789012/my-queue",
        MessageBody: "Hello World",
        MessageAttributes: {
          type: { DataType: "String", StringValue: "test" },
        },
      })
    );

    expect(result.MessageId).toBe("mock-message-id");
  });

  test("whenReceiveMessage should mock message receiving", async () => {
    sqs.whenReceiveMessage(
      { queueUrl: "https://sqs.us-east-1.amazonaws.com/123456789012/my-queue" },
      ["Message 1", "Message 2"]
    );

    const result = await client.send(
      new ReceiveMessageCommand({
        QueueUrl: "https://sqs.us-east-1.amazonaws.com/123456789012/my-queue",
      })
    );

    expect(result.Messages).toHaveLength(2);
    expect(result.Messages[0].Body).toBe("Message 1");
    expect(result.Messages[0].MessageId).toBe("mock-0");
    expect(result.Messages[0].ReceiptHandle).toBe("mock-receipt-0");
  });

  test("whenReceiveMessage should handle object messages", async () => {
    sqs.whenReceiveMessage(
      { queueUrl: "https://sqs.us-east-1.amazonaws.com/123456789012/my-queue" },
      [{ data: "test", messageAttributes: { type: "object" } }]
    );

    const result = await client.send(
      new ReceiveMessageCommand({
        QueueUrl: "https://sqs.us-east-1.amazonaws.com/123456789012/my-queue",
      })
    );

    expect(result.Messages).toHaveLength(1);
    expect(JSON.parse(result.Messages[0].Body)).toEqual({
      data: "test",
      messageAttributes: { type: "object" },
    });
    expect(result.Messages[0].MessageAttributes).toEqual({ type: "object" });
  });

  test("whenDeleteMessage should mock message deletion", async () => {
    sqs.whenDeleteMessage({
      queueUrl: "https://sqs.us-east-1.amazonaws.com/123456789012/my-queue",
      receiptHandle: "receipt-123",
    });

    const result = await client.send(
      new DeleteMessageCommand({
        QueueUrl: "https://sqs.us-east-1.amazonaws.com/123456789012/my-queue",
        ReceiptHandle: "receipt-123",
      })
    );

    expect(result).toBeDefined();
  });

  test("whenSendMessageBatch should mock batch sending", async () => {
    const entries = [
      { Id: "msg1", MessageBody: "First message" },
      { Id: "msg2", MessageBody: "Second message" },
    ];

    sqs.whenSendMessageBatch({
      queueUrl: "https://sqs.us-east-1.amazonaws.com/123456789012/my-queue",
      entries,
    });

    const result = await client.send(
      new SendMessageBatchCommand({
        QueueUrl: "https://sqs.us-east-1.amazonaws.com/123456789012/my-queue",
        Entries: entries,
      })
    );

    expect(result.Successful).toHaveLength(2);
    expect(result.Successful[0].Id).toBe("msg1");
    expect(result.Failed).toHaveLength(0);
  });

  test("whenSendMessageBatch should handle failures", async () => {
    const entries = [
      { Id: "msg1", MessageBody: "First message" },
      { Id: "msg2", MessageBody: "Second message" },
    ];

    sqs.whenSendMessageBatch(
      {
        queueUrl: "https://sqs.us-east-1.amazonaws.com/123456789012/my-queue",
        entries,
      },
      { failures: ["msg2"] }
    );

    const result = await client.send(
      new SendMessageBatchCommand({
        QueueUrl: "https://sqs.us-east-1.amazonaws.com/123456789012/my-queue",
        Entries: entries,
      })
    );

    expect(result.Successful).toHaveLength(1);
    expect(result.Successful[0].Id).toBe("msg1");
    expect(result.Failed).toHaveLength(1);
    expect(result.Failed[0].Id).toBe("msg2");
  });

  test("should validate input parameters", () => {
    expect(() =>
      sqs.whenSendMessage({ queueUrl: "", messageBody: "test" })
    ).toThrow("queueUrl must be a non-empty string");
    expect(() =>
      sqs.whenReceiveMessage({ queueUrl: "test" }, "not-array")
    ).toThrow("messages must be an array");
    expect(() =>
      sqs.whenDeleteMessage({ queueUrl: "test", receiptHandle: "" })
    ).toThrow("receiptHandle must be a non-empty string");
  });

  test("should handle message serialization errors", () => {
    const circularObj = {};
    circularObj.self = circularObj;

    expect(() =>
      sqs.whenReceiveMessage({ queueUrl: "test" }, [circularObj])
    ).toThrow(); // Just check that it throws
  });

  test("should handle concurrent queue operations", async () => {
    const queue1 = "https://sqs.us-east-1.amazonaws.com/123456789012/queue1";
    const queue2 = "https://sqs.us-east-1.amazonaws.com/123456789012/queue2";

    sqs.whenSendMessage({
      queueUrl: queue1,
      messageBody: "Message for queue 1",
    });
    sqs.whenSendMessage({
      queueUrl: queue2,
      messageBody: "Message for queue 2",
    });

    const [result1, result2] = await Promise.all([
      client.send(
        new SendMessageCommand({
          QueueUrl: queue1,
          MessageBody: "Message for queue 1",
        })
      ),
      client.send(
        new SendMessageCommand({
          QueueUrl: queue2,
          MessageBody: "Message for queue 2",
        })
      ),
    ]);

    expect(result1.MessageId).toBeDefined();
    expect(result2.MessageId).toBeDefined();
  });

  test("should handle FIFO queue patterns", async () => {
    const fifoQueue =
      "https://sqs.us-east-1.amazonaws.com/123456789012/my-fifo.fifo";

    sqs.whenSendMessage({
      queueUrl: fifoQueue,
      messageBody: "FIFO message",
      messageGroupId: "group1",
      messageDeduplicationId: "dedup1",
    });

    const result = await client.send(
      new SendMessageCommand({
        QueueUrl: fifoQueue,
        MessageBody: "FIFO message",
        MessageGroupId: "group1",
        MessageDeduplicationId: "dedup1",
      })
    );

    expect(result.MessageId).toBeDefined();
  });
});
