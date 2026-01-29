/**
 * SES Facade - Clean API for SES mocking
 *
 * Provides simple methods for mocking SES operations without complex AWS SDK setup.
 * Handles SendEmail, SendTemplatedEmail, and SendRawEmail operations.
 */

import { mockClient } from "aws-sdk-client-mock";
import {
  SESClient,
  SendEmailCommand,
  SendTemplatedEmailCommand,
  SendRawEmailCommand,
  SendBulkTemplatedEmailCommand,
  GetIdentityVerificationAttributesCommand,
  VerifyEmailIdentityCommand,
} from "@aws-sdk/client-ses";
import { deepEqual } from "../utils/deepEqual.js";
import { registerMock } from "../utils/registry.js";

function createSESMock() {
  const sesMock = mockClient(SESClient);

  const api = {
    /**
     * Mock SendEmail - standard email with subject, body, to/from
     * @param {object} params - Match criteria
     * @param {string} params.from - From email address
     * @param {string|string[]} params.to - To email address(es)
     * @param {string} [params.subject] - Optional subject to match
     * @param {object} [response] - Mock response
     * @param {string} [response.messageId] - Message ID to return
     */
    whenSendEmail(
      { from, to, subject },
      { messageId = "mock-ses-msg-id" } = {},
    ) {
      if (!from || typeof from !== "string") {
        throw new Error("from must be a non-empty string");
      }
      if (!to) {
        throw new Error("to must be provided");
      }

      const toAddresses = Array.isArray(to) ? to : [to];

      sesMock
        .on(SendEmailCommand, (input) => {
          // Match source
          if (input.Source !== from) return false;

          // Match destination
          const inputTo = input.Destination?.ToAddresses || [];
          if (!deepEqual(inputTo, toAddresses)) return false;

          // Match subject if provided
          if (subject && input.Message?.Subject?.Data !== subject) return false;

          return true;
        })
        .resolves({ MessageId: messageId });
    },

    /**
     * Mock any SendEmail to a specific destination
     * @param {object} params - Match criteria
     * @param {string|string[]} params.to - To email address(es)
     * @param {object} [response] - Mock response
     */
    whenSendEmailTo({ to }, { messageId = "mock-ses-msg-id" } = {}) {
      if (!to) {
        throw new Error("to must be provided");
      }

      const toAddresses = Array.isArray(to) ? to : [to];

      sesMock
        .on(SendEmailCommand, (input) => {
          const inputTo = input.Destination?.ToAddresses || [];
          return deepEqual(inputTo, toAddresses);
        })
        .resolves({ MessageId: messageId });
    },

    /**
     * Mock all SendEmail commands with a generic success response
     * @param {object} [response] - Mock response
     */
    whenSendEmailAny({ messageId = "mock-ses-msg-id" } = {}) {
      sesMock.on(SendEmailCommand).resolves({ MessageId: messageId });
    },

    /**
     * Mock SendEmail to fail with an error
     * @param {object} params - Match criteria
     * @param {string} params.errorCode - AWS error code (e.g., 'MessageRejected')
     * @param {string} params.errorMessage - Error message
     */
    whenSendEmailFails({
      errorCode = "MessageRejected",
      errorMessage = "Email address is not verified",
    }) {
      const error = new Error(errorMessage);
      error.name = errorCode;
      error.Code = errorCode;
      error.$metadata = { httpStatusCode: 400 };

      sesMock.on(SendEmailCommand).rejects(error);
    },

    /**
     * Mock SendTemplatedEmail
     * @param {object} params - Match criteria
     * @param {string} params.template - Template name
     * @param {string|string[]} params.to - To email address(es)
     * @param {object} [response] - Mock response
     */
    whenSendTemplatedEmail(
      { template, to },
      { messageId = "mock-ses-msg-id" } = {},
    ) {
      if (!template || typeof template !== "string") {
        throw new Error("template must be a non-empty string");
      }

      sesMock
        .on(SendTemplatedEmailCommand, (input) => {
          if (input.Template !== template) return false;

          if (to) {
            const toAddresses = Array.isArray(to) ? to : [to];
            const inputTo = input.Destination?.ToAddresses || [];
            if (!deepEqual(inputTo, toAddresses)) return false;
          }

          return true;
        })
        .resolves({ MessageId: messageId });
    },

    /**
     * Mock SendBulkTemplatedEmail
     * @param {object} params - Match criteria
     * @param {string} params.template - Template name
     * @param {object} [response] - Mock response
     */
    whenSendBulkTemplatedEmail({ template }, { status = [] } = {}) {
      if (!template || typeof template !== "string") {
        throw new Error("template must be a non-empty string");
      }

      sesMock
        .on(
          SendBulkTemplatedEmailCommand,
          (input) => input.Template === template,
        )
        .resolves({ Status: status });
    },

    /**
     * Mock identity verification check
     * @param {object} params - Match criteria
     * @param {string[]} params.identities - Email identities to check
     * @param {object} params.attributes - Verification attributes per identity
     */
    whenGetIdentityVerification({ identities, attributes }) {
      sesMock
        .on(GetIdentityVerificationAttributesCommand, (input) => {
          if (identities) {
            return deepEqual(input.Identities, identities);
          }
          return true;
        })
        .resolves({ VerificationAttributes: attributes || {} });
    },

    /**
     * Reset all mocks
     */
    reset() {
      sesMock.reset();
    },

    /**
     * Access raw mock for advanced usage
     */
    raw: sesMock,

    /**
     * Create a new SES client for testing
     */
    newClient: () => new SESClient({}),
  };

  registerMock(api);
  return api;
}

// Re-export AWS SDK clients for compatibility with ses Lambda layer
export {
  SESClient,
  SendEmailCommand,
  SendTemplatedEmailCommand,
  SendRawEmailCommand,
  SendBulkTemplatedEmailCommand,
  GetIdentityVerificationAttributesCommand,
  VerifyEmailIdentityCommand,
  ListIdentitiesCommand,
  GetSendQuotaCommand,
  GetSendStatisticsCommand,
} from "@aws-sdk/client-ses";

export { createSESMock };
