import {
  test,
  describe,
  beforeEach,
  expect,
} from "../../../facade/test-helpers/index.js";
import { createSNSMock } from "../../../facade/helpers/sns.js";
import {
  SNSClient,
  PublishCommand,
  PublishBatchCommand,
} from "@aws-sdk/client-sns";

describe("SNS Facade", () => {
  let sns;
  let client;

  beforeEach(() => {
    sns = createSNSMock();
    client = new SNSClient({});
  });

  test("whenPublish should mock message publishing", async () => {
    sns.whenPublish({
      topicArn: "arn:aws:sns:us-east-1:123456789012:my-topic",
      message: "Hello World",
      messageAttributes: { type: { DataType: "String", StringValue: "test" } },
    });

    const result = await client.send(
      new PublishCommand({
        TopicArn: "arn:aws:sns:us-east-1:123456789012:my-topic",
        Message: "Hello World",
        MessageAttributes: {
          type: { DataType: "String", StringValue: "test" },
        },
      })
    );

    expect(result.MessageId).toBe("mock-message-id");
  });

  test("whenPublish should handle FIFO topics", async () => {
    sns.whenPublish({
      topicArn: "arn:aws:sns:us-east-1:123456789012:my-topic.fifo",
      message: "FIFO Message",
      messageGroupId: "group1",
      messageDeduplicationId: "dedup1",
    });

    const result = await client.send(
      new PublishCommand({
        TopicArn: "arn:aws:sns:us-east-1:123456789012:my-topic.fifo",
        Message: "FIFO Message",
        MessageGroupId: "group1",
        MessageDeduplicationId: "dedup1",
      })
    );

    expect(result.MessageId).toBe("mock-message-id");
  });

  test("whenPublishBatch should mock batch publishing", async () => {
    const entries = [
      { Id: "msg1", Message: "First message" },
      { Id: "msg2", Message: "Second message" },
    ];

    sns.whenPublishBatch({
      topicArn: "arn:aws:sns:us-east-1:123456789012:my-topic",
      entries,
    });

    const result = await client.send(
      new PublishBatchCommand({
        TopicArn: "arn:aws:sns:us-east-1:123456789012:my-topic",
        PublishBatchRequestEntries: entries,
      })
    );

    expect(result.Successful).toHaveLength(2);
    expect(result.Successful[0].Id).toBe("msg1");
    expect(result.Failed).toHaveLength(0);
  });

  test("whenPublishBatch should handle failures", async () => {
    const entries = [
      { Id: "msg1", Message: "First message" },
      { Id: "msg2", Message: "Second message" },
    ];

    sns.whenPublishBatch(
      { topicArn: "arn:aws:sns:us-east-1:123456789012:my-topic", entries },
      { failures: ["msg1"] }
    );

    const result = await client.send(
      new PublishBatchCommand({
        TopicArn: "arn:aws:sns:us-east-1:123456789012:my-topic",
        PublishBatchRequestEntries: entries,
      })
    );

    expect(result.Successful).toHaveLength(1);
    expect(result.Successful[0].Id).toBe("msg2");
    expect(result.Failed).toHaveLength(1);
    expect(result.Failed[0].Id).toBe("msg1");
  });

  test("should validate input parameters", () => {
    expect(() => sns.whenPublish({ topicArn: "", message: "test" })).toThrow(
      "topicArn must be a non-empty string"
    );
    expect(() =>
      sns.whenPublish({ topicArn: "arn:test", message: "" })
    ).toThrow("message must be a non-empty string");
    expect(() =>
      sns.whenPublishBatch({ topicArn: "arn:test", entries: [] })
    ).toThrow("entries must be a non-empty array");
  });

  test("should validate batch entry structure", () => {
    const invalidEntries = [{ Id: "msg1" }]; // Missing Message

    expect(() =>
      sns.whenPublishBatch({
        topicArn: "arn:test",
        entries: invalidEntries,
      })
    ).toThrow("Entry at index 0 must have a non-empty Message string");
  });
});
