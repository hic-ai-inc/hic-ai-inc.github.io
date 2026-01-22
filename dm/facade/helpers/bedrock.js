/**
 * Bedrock Facade - Clean API for Bedrock Runtime mocking
 *
 * Provides simple methods for mocking Bedrock Runtime operations including
 * model invocation with streaming and non-streaming responses.
 */

import { mockClient } from "aws-sdk-client-mock";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { deepEqual } from "../utils/deepEqual.js";
import { registerMock } from "../utils/registry.js";

// Inline safe functions for facade testing
const safeJsonParse = (str, context = {}) => {
  try {
    return JSON.parse(str);
  } catch (error) {
    throw new Error(
      `JSON parse failed for ${context.source || "unknown"}: ${error.message}`
    );
  }
};

const safeLog = (message, data = null) => {
  if (process.env.NODE_ENV === "test") return;
  const sanitized =
    typeof data === "string" ? data.replace(/[\r\n\t]/g, " ") : data;
  console.log(data ? `${message}: ${sanitized}` : message);
};

function createBedrockMock() {
  const bedrockMock = mockClient(BedrockRuntimeClient);

  const api = {
    whenInvokeModel(
      { modelId, body },
      result = { completion: "Mock response" }
    ) {
      if (!modelId || typeof modelId !== "string") {
        throw new Error("modelId must be a non-empty string");
      }
      if (body !== undefined && (typeof body !== "object" || body === null)) {
        throw new Error("body must be an object or undefined");
      }

      let responseBody;
      try {
        responseBody = JSON.stringify(result);
      } catch (error) {
        throw new Error(`Failed to serialize result: ${error.message}`);
      }

      bedrockMock
        .on(InvokeModelCommand, (cmd) => {
          if (cmd.modelId !== modelId) return false;
          if (!body) return true;
          try {
            const parsedBody = safeJsonParse(cmd.body, {
              source: "Bedrock command body",
            });
            return deepEqual(parsedBody, body);
          } catch {
            return false;
          }
        })
        .resolves({
          body: new TextEncoder().encode(responseBody),
          contentType: "application/json",
        });
    },

    whenInvokeModelWithResponseStream(
      { modelId, body },
      chunks = ["Mock", " streaming", " response"]
    ) {
      if (!modelId || typeof modelId !== "string") {
        throw new Error("modelId must be a non-empty string");
      }
      if (body !== undefined && (typeof body !== "object" || body === null)) {
        throw new Error("body must be an object or undefined");
      }
      if (!Array.isArray(chunks)) {
        throw new Error("chunks must be an array");
      }

      bedrockMock
        .on(InvokeModelWithResponseStreamCommand, (cmd) => {
          if (cmd.modelId !== modelId) return false;
          if (!body) return true;
          try {
            const parsedBody = safeJsonParse(cmd.body, {
              source: "Bedrock streaming command body",
            });
            return deepEqual(parsedBody, body);
          } catch {
            return false;
          }
        })
        .resolves({
          body: {
            async *[Symbol.asyncIterator]() {
              for (const chunk of chunks) {
                try {
                  const chunkData = JSON.stringify({ completion: chunk });
                  yield {
                    chunk: {
                      bytes: new TextEncoder().encode(chunkData),
                    },
                  };
                } catch (error) {
                  safeLog(
                    "Skipping malformed chunk in Bedrock stream",
                    error.message
                  );
                  continue;
                }
              }
            },
          },
          contentType: "application/json",
        });
    },

    reset() {
      bedrockMock.reset();
    },

    raw: bedrockMock,
  };

  registerMock(api);
  return api;
}

// Re-export AWS SDK clients for compatibility with bedrock Lambda layer
export * from "@aws-sdk/client-bedrock-runtime";
export * from "@aws-sdk/client-bedrock";

export { createBedrockMock };
