/**
 * Lambda Facade - Clean API for Lambda invocation mocking
 *
 * Provides simple methods for mocking Lambda function invocations including
 * synchronous and asynchronous invocations with proper payload handling.
 */

import { mockClient } from "aws-sdk-client-mock";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { registerMock } from "../utils/registry.js";

function createLambdaMock() {
  const lambdaMock = mockClient(LambdaClient);

  const enc = (obj) => {
    try {
      return new TextEncoder().encode(JSON.stringify(obj));
    } catch (error) {
      throw new Error(`Failed to encode Lambda payload: ${error.message}`);
    }
  };

  const api = {
    whenInvoke({ functionName }, result = { ok: true }) {
      if (!functionName || typeof functionName !== "string") {
        throw new Error("functionName must be a non-empty string");
      }

      lambdaMock
        .on(InvokeCommand, (input) => input.FunctionName === functionName)
        .resolves({ StatusCode: 200, Payload: enc(result) });
    },

    whenInvokeAsync({ functionName }, statusCode = 202) {
      if (!functionName || typeof functionName !== "string") {
        throw new Error("functionName must be a non-empty string");
      }
      if (
        typeof statusCode !== "number" ||
        statusCode < 200 ||
        statusCode >= 300
      ) {
        throw new Error("statusCode must be a valid 2xx HTTP status code");
      }

      lambdaMock
        .on(
          InvokeCommand,
          (input) =>
            input.FunctionName === functionName &&
            input.InvocationType === "Event"
        )
        .resolves({ StatusCode: statusCode });
    },

    reset() {
      lambdaMock.reset();
    },

    raw: lambdaMock,
  };

  registerMock(api);
  return api;
}

export { createLambdaMock, LambdaClient, InvokeCommand };
