/**
 * SQS Facade - Clean API for SQS mocking with realistic message attributes
 *
 * Provides simple methods for mocking SQS operations including message sending,
 * receiving, and batch operations with proper message attribute handling.
 */

import { mockClient } from "aws-sdk-client-mock";
import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  SendMessageBatchCommand,
} from "@aws-sdk/client-sqs";
import { deepEqual } from "../utils/deepEqual.js";
import { registerMock } from "../utils/registry.js";

function createSQSMock() {
  const sqsMock = mockClient(SQSClient);

  const api = {
    whenSendMessage({ queueUrl, messageBody, messageAttributes }) {
      if (!queueUrl || typeof queueUrl !== "string") {
        throw new Error("queueUrl must be a non-empty string");
      }
      if (!messageBody || typeof messageBody !== "string") {
        throw new Error("messageBody must be a non-empty string");
      }
      if (
        messageAttributes !== undefined &&
        (typeof messageAttributes !== "object" || messageAttributes === null)
      ) {
        throw new Error("messageAttributes must be an object or undefined");
      }

      sqsMock
        .on(SendMessageCommand, (input) => {
          // Match queue URL
          if (input.QueueUrl !== queueUrl) return false;

          // Match message body
          if (input.MessageBody !== messageBody) return false;

          // Match message attributes if provided
          if (
            messageAttributes &&
            !deepEqual(input.MessageAttributes, messageAttributes)
          )
            return false;

          return true;
        })
        .resolves({ MessageId: "mock-message-id" });
    },

    whenReceiveMessage({ queueUrl }, messages = []) {
      if (!queueUrl || typeof queueUrl !== "string") {
        throw new Error("queueUrl must be a non-empty string");
      }
      if (!Array.isArray(messages)) {
        throw new Error("messages must be an array");
      }

      const mockMessages = messages.map((msg, i) => {
        let messageBody;
        if (typeof msg === "string") {
          messageBody = msg;
        } else {
          try {
            messageBody = JSON.stringify(msg);
          } catch (error) {
            throw new Error(
              `Failed to serialize message at index ${i}: ${error.message}`
            );
          }
        }

        return {
          MessageId: `mock-${i}`,
          ReceiptHandle: `mock-receipt-${i}`,
          Body: messageBody,
          Attributes: { SentTimestamp: Date.now().toString() },
          MessageAttributes:
            (typeof msg === "object" && msg.messageAttributes) || {},
        };
      });

      sqsMock
        .on(ReceiveMessageCommand, (input) => input.QueueUrl === queueUrl)
        .resolves({ Messages: mockMessages });
    },

    whenDeleteMessage({ queueUrl, receiptHandle }) {
      if (!queueUrl || typeof queueUrl !== "string") {
        throw new Error("queueUrl must be a non-empty string");
      }
      if (!receiptHandle || typeof receiptHandle !== "string") {
        throw new Error("receiptHandle must be a non-empty string");
      }

      sqsMock
        .on(DeleteMessageCommand, (input) => {
          // Match queue URL
          if (input.QueueUrl !== queueUrl) return false;

          // Match receipt handle
          if (input.ReceiptHandle !== receiptHandle) return false;

          return true;
        })
        .resolves({});
    },

    whenSendMessageBatch({ queueUrl, entries }, { failures = [] } = {}) {
      if (!queueUrl || typeof queueUrl !== "string") {
        throw new Error("queueUrl must be a non-empty string");
      }
      if (!Array.isArray(entries) || entries.length === 0) {
        throw new Error("entries must be a non-empty array");
      }
      if (!Array.isArray(failures)) {
        throw new Error("failures must be an array");
      }

      // Validate each entry
      entries.forEach((entry, index) => {
        if (!entry || typeof entry !== "object") {
          throw new Error(`Entry at index ${index} must be an object`);
        }
        if (!entry.Id || typeof entry.Id !== "string") {
          throw new Error(
            `Entry at index ${index} must have a non-empty Id string`
          );
        }
        if (!entry.MessageBody || typeof entry.MessageBody !== "string") {
          throw new Error(
            `Entry at index ${index} must have a non-empty MessageBody string`
          );
        }
      });

      // Validate failure IDs exist in entries
      failures.forEach((failureId) => {
        if (!entries.some((entry) => entry.Id === failureId)) {
          throw new Error(`Failure ID '${failureId}' not found in entries`);
        }
      });

      sqsMock
        .on(SendMessageBatchCommand, (input) => {
          // Match queue URL
          if (input.QueueUrl !== queueUrl) return false;

          // Match batch entries - must have same structure and content
          if (!input.Entries) return false;

          return deepEqual(input.Entries, entries);
        })
        .resolves(
          (() => {
            const successful = [];
            const failed = [];

            // Process each entry once - either success or failure
            entries.forEach((entry, index) => {
              if (failures.includes(entry.Id)) {
                // This entry should fail
                failed.push({
                  Id: entry.Id,
                  Code: "InternalError",
                  Message: "Mock failure for testing",
                  SenderFault: false,
                });
              } else {
                // This entry should succeed
                successful.push({
                  Id: entry.Id,
                  MessageId: `mock-${index}`,
                  MD5OfBody: `mock-md5-${index}`,
                });
              }
            });

            return {
              Successful: successful,
              Failed: failed,
            };
          })()
        );
    },

    reset() {
      sqsMock.reset();
    },

    raw: sqsMock,
  };

  registerMock(api);
  return api;
}

export { createSQSMock };
