/**
 * SNS Facade - Clean API for SNS mocking with FIFO support
 *
 * Provides simple methods for mocking SNS operations without complex AWS SDK setup.
 * Handles both standard and FIFO topics with message attributes and deduplication.
 */

import { mockClient } from "aws-sdk-client-mock";
import {
  SNSClient,
  PublishCommand,
  PublishBatchCommand,
} from "@aws-sdk/client-sns";
import { deepEqual } from "../utils/deepEqual.js";
import { registerMock } from "../utils/registry.js";

function createSNSMock() {
  const snsMock = mockClient(SNSClient);

  const api = {
    whenPublish({
      topicArn,
      message,
      messageAttributes,
      messageGroupId,
      messageDeduplicationId,
    }) {
      if (!topicArn || typeof topicArn !== "string") {
        throw new Error("topicArn must be a non-empty string");
      }
      if (!message || typeof message !== "string") {
        throw new Error("message must be a non-empty string");
      }
      if (
        messageAttributes !== undefined &&
        (typeof messageAttributes !== "object" || messageAttributes === null)
      ) {
        throw new Error("messageAttributes must be an object or undefined");
      }
      if (messageGroupId !== undefined && typeof messageGroupId !== "string") {
        throw new Error("messageGroupId must be a string or undefined");
      }
      if (
        messageDeduplicationId !== undefined &&
        typeof messageDeduplicationId !== "string"
      ) {
        throw new Error("messageDeduplicationId must be a string or undefined");
      }

      snsMock
        .on(PublishCommand, (input) => {
          // Match topic ARN
          if (input.TopicArn !== topicArn) return false;

          // Match message content
          if (input.Message !== message) return false;

          // Match message attributes if provided
          if (
            messageAttributes &&
            !deepEqual(input.MessageAttributes, messageAttributes)
          )
            return false;

          // Match FIFO parameters if provided
          if (messageGroupId && input.MessageGroupId !== messageGroupId)
            return false;
          if (
            messageDeduplicationId &&
            input.MessageDeduplicationId !== messageDeduplicationId
          )
            return false;

          return true;
        })
        .resolves({ MessageId: "mock-message-id" });
    },

    whenPublishBatch({ topicArn, entries }, { failures = [] } = {}) {
      if (!topicArn || typeof topicArn !== "string") {
        throw new Error("topicArn must be a non-empty string");
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
        if (!entry.Message || typeof entry.Message !== "string") {
          throw new Error(
            `Entry at index ${index} must have a non-empty Message string`
          );
        }
      });

      // Validate failure IDs exist in entries
      failures.forEach((failureId) => {
        if (!entries.some((entry) => entry.Id === failureId)) {
          throw new Error(`Failure ID '${failureId}' not found in entries`);
        }
      });

      snsMock
        .on(PublishBatchCommand, (input) => {
          // Match topic ARN
          if (input.TopicArn !== topicArn) return false;

          // Match batch entries - must have same structure and content
          if (!input.PublishBatchRequestEntries) return false;

          return deepEqual(input.PublishBatchRequestEntries, entries);
        })
        .resolves({
          Successful: entries
            .filter((e) => !failures.includes(e.Id))
            .map((e, i) => ({
              Id: e.Id,
              MessageId: `mock-${i}`,
            })),
          Failed: failures.map((failureId) => ({
            Id: failureId,
            Code: "InternalError",
            Message: "Mock failure for testing",
            SenderFault: false,
          })),
        });
    },

    reset() {
      snsMock.reset();
    },

    raw: snsMock,
  };

  registerMock(api);
  return api;
}

export { createSNSMock };
