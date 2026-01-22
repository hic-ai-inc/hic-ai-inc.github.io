/**
 * Step Functions Facade - Clean API for Step Functions mocking
 *
 * Provides simple methods for mocking Step Functions operations including
 * execution start, status checking, and result retrieval.
 */

import { mockClient } from "aws-sdk-client-mock";
import {
  SFNClient,
  StartExecutionCommand,
  DescribeExecutionCommand,
  StopExecutionCommand,
  SendTaskSuccessCommand,
  SendTaskFailureCommand,
} from "@aws-sdk/client-sfn";
import { deepEqual } from "../utils/deepEqual.js";
import { registerMock } from "../utils/registry.js";

function createSFNMock() {
  const sfnMock = mockClient(SFNClient);

  const api = {
    whenStartExecution(
      { stateMachineArn, input },
      result = { executionArn: "mock-execution-arn" }
    ) {
      if (!stateMachineArn || typeof stateMachineArn !== "string") {
        throw new Error("stateMachineArn must be a non-empty string");
      }
      if (
        input !== undefined &&
        (typeof input !== "object" || input === null)
      ) {
        throw new Error("input must be an object or undefined");
      }

      let serializedInput;
      if (input) {
        try {
          serializedInput = JSON.stringify(input);
        } catch (error) {
          throw new Error(
            `Failed to serialize execution input: ${error.message}`
          );
        }
      }

      sfnMock
        .on(StartExecutionCommand, (cmd) => {
          // Match state machine ARN
          if (cmd.stateMachineArn !== stateMachineArn) return false;

          // If no input expected, cmd.input should be undefined/empty
          if (!input) return !cmd.input || cmd.input === "{}";

          // If input expected, match serialized version
          return cmd.input === serializedInput;
        })
        .resolves({
          executionArn: result.executionArn,
          startDate: new Date(), // Current time when execution starts
        });
    },

    whenDescribeExecution({ executionArn }, result = { status: "SUCCEEDED" }) {
      if (!executionArn || typeof executionArn !== "string") {
        throw new Error("executionArn must be a non-empty string");
      }

      let serializedInput = "{}";
      let serializedOutput;

      if (result.input) {
        try {
          serializedInput = JSON.stringify(result.input);
        } catch (error) {
          throw new Error(
            `Failed to serialize execution input: ${error.message}`
          );
        }
      }

      if (result.output) {
        try {
          serializedOutput = JSON.stringify(result.output);
        } catch (error) {
          throw new Error(
            `Failed to serialize execution output: ${error.message}`
          );
        }
      }

      const mockStartDate = new Date(Date.now() - 60000); // Started 1 minute ago
      const mockStopDate = result.status !== "RUNNING" ? new Date() : undefined; // Stopped now if not running

      sfnMock
        .on(
          DescribeExecutionCommand,
          (cmd) => cmd.executionArn === executionArn
        )
        .resolves({
          executionArn,
          stateMachineArn: "mock-state-machine-arn",
          status: result.status,
          startDate: mockStartDate, // Realistic past start time
          stopDate: mockStopDate, // Current time if stopped, undefined if running
          input: serializedInput,
          output: serializedOutput,
        });
    },

    whenStopExecution({ executionArn }) {
      if (!executionArn || typeof executionArn !== "string") {
        throw new Error("executionArn must be a non-empty string");
      }

      sfnMock
        .on(StopExecutionCommand, (cmd) => cmd.executionArn === executionArn)
        .resolves({
          stopDate: new Date(), // Current time when stop command executed
        });
    },

    whenSendTaskSuccess({ taskToken, output }) {
      if (!taskToken || typeof taskToken !== "string") {
        throw new Error("taskToken must be a non-empty string");
      }
      if (
        output !== undefined &&
        (typeof output !== "object" || output === null)
      ) {
        throw new Error("output must be an object or undefined");
      }

      let serializedOutput;
      if (output) {
        try {
          serializedOutput = JSON.stringify(output);
        } catch (error) {
          throw new Error(`Failed to serialize task output: ${error.message}`);
        }
      }

      sfnMock
        .on(SendTaskSuccessCommand, (cmd) => {
          // Match task token
          if (cmd.taskToken !== taskToken) return false;

          // If no output expected, cmd.output should be undefined
          if (!output) return !cmd.output;

          // If output expected, match serialized version
          return cmd.output === serializedOutput;
        })
        .resolves({}); // No response data for task success
    },

    whenSendTaskFailure({ taskToken, error, cause }) {
      if (!taskToken || typeof taskToken !== "string") {
        throw new Error("taskToken must be a non-empty string");
      }
      if (error !== undefined && typeof error !== "string") {
        throw new Error("error must be a string or undefined");
      }
      if (cause !== undefined && typeof cause !== "string") {
        throw new Error("cause must be a string or undefined");
      }

      sfnMock
        .on(SendTaskFailureCommand, (cmd) => {
          // Match task token
          if (cmd.taskToken !== taskToken) return false;

          // Match error if provided
          if (error && cmd.error !== error) return false;

          // Match cause if provided
          if (cause && cmd.cause !== cause) return false;

          return true;
        })
        .resolves({}); // No response data for task failure
    },

    reset() {
      sfnMock.reset();
    },

    raw: sfnMock,
  };

  registerMock(api);
  return api;
}

// Re-export AWS SDK clients for compatibility with sfn Lambda layer
export * from "@aws-sdk/client-sfn";

export { createSFNMock };
