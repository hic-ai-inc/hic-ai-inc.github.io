import {
  test,
  describe,
  beforeEach,
  expect,
} from "../../../facade/test-helpers/index.js";
import { createSFNMock } from "../../../facade/helpers/sfn.js";
import {
  SFNClient,
  StartExecutionCommand,
  DescribeExecutionCommand,
  StopExecutionCommand,
  SendTaskSuccessCommand,
  SendTaskFailureCommand,
} from "@aws-sdk/client-sfn";

describe("Step Functions Facade", () => {
  let sfn;
  let client;

  beforeEach(() => {
    sfn = createSFNMock();
    client = new SFNClient({});
  });

  test("whenStartExecution should mock execution start", async () => {
    sfn.whenStartExecution(
      {
        stateMachineArn:
          "arn:aws:states:us-east-1:123456789012:stateMachine:MyStateMachine",
        input: { name: "test" },
      },
      {
        executionArn:
          "arn:aws:states:us-east-1:123456789012:execution:MyStateMachine:test-execution",
      }
    );

    const result = await client.send(
      new StartExecutionCommand({
        stateMachineArn:
          "arn:aws:states:us-east-1:123456789012:stateMachine:MyStateMachine",
        input: JSON.stringify({ name: "test" }),
      })
    );

    expect(result.executionArn).toBe(
      "arn:aws:states:us-east-1:123456789012:execution:MyStateMachine:test-execution"
    );
    expect(result.startDate).toBeInstanceOf(Date);
  });

  test("whenStartExecution should handle no input", async () => {
    sfn.whenStartExecution({
      stateMachineArn:
        "arn:aws:states:us-east-1:123456789012:stateMachine:MyStateMachine",
    });

    const result = await client.send(
      new StartExecutionCommand({
        stateMachineArn:
          "arn:aws:states:us-east-1:123456789012:stateMachine:MyStateMachine",
      })
    );

    expect(result.executionArn).toBe("mock-execution-arn");
  });

  test("whenDescribeExecution should mock execution description", async () => {
    sfn.whenDescribeExecution(
      {
        executionArn:
          "arn:aws:states:us-east-1:123456789012:execution:MyStateMachine:test-execution",
      },
      { status: "SUCCEEDED", output: { result: "success" } }
    );

    const result = await client.send(
      new DescribeExecutionCommand({
        executionArn:
          "arn:aws:states:us-east-1:123456789012:execution:MyStateMachine:test-execution",
      })
    );

    expect(result.status).toBe("SUCCEEDED");
    expect(JSON.parse(result.output)).toEqual({ result: "success" });
    expect(result.startDate).toBeInstanceOf(Date);
    expect(result.stopDate).toBeInstanceOf(Date);
  });

  test("whenDescribeExecution should handle running execution", async () => {
    sfn.whenDescribeExecution(
      {
        executionArn:
          "arn:aws:states:us-east-1:123456789012:execution:MyStateMachine:test-execution",
      },
      { status: "RUNNING" }
    );

    const result = await client.send(
      new DescribeExecutionCommand({
        executionArn:
          "arn:aws:states:us-east-1:123456789012:execution:MyStateMachine:test-execution",
      })
    );

    expect(result.status).toBe("RUNNING");
    expect(result.stopDate).toBeUndefined();
  });

  test("whenStopExecution should mock execution stop", async () => {
    sfn.whenStopExecution({
      executionArn:
        "arn:aws:states:us-east-1:123456789012:execution:MyStateMachine:test-execution",
    });

    const result = await client.send(
      new StopExecutionCommand({
        executionArn:
          "arn:aws:states:us-east-1:123456789012:execution:MyStateMachine:test-execution",
      })
    );

    expect(result.stopDate).toBeInstanceOf(Date);
  });

  test("whenSendTaskSuccess should mock task success", async () => {
    sfn.whenSendTaskSuccess({
      taskToken: "task-token-123",
      output: { result: "completed" },
    });

    const result = await client.send(
      new SendTaskSuccessCommand({
        taskToken: "task-token-123",
        output: JSON.stringify({ result: "completed" }),
      })
    );

    expect(result).toBeDefined();
  });

  test("whenSendTaskFailure should mock task failure", async () => {
    sfn.whenSendTaskFailure({
      taskToken: "task-token-123",
      error: "TaskFailed",
      cause: "Something went wrong",
    });

    const result = await client.send(
      new SendTaskFailureCommand({
        taskToken: "task-token-123",
        error: "TaskFailed",
        cause: "Something went wrong",
      })
    );

    expect(result).toBeDefined();
  });

  test("should validate input parameters", () => {
    expect(() =>
      sfn.whenStartExecution({ stateMachineArn: "", input: {} })
    ).toThrow("stateMachineArn must be a non-empty string");
    expect(() =>
      sfn.whenStartExecution({ stateMachineArn: "arn:test", input: null })
    ).toThrow("input must be an object or undefined");
    expect(() => sfn.whenSendTaskSuccess({ taskToken: "" })).toThrow(
      "taskToken must be a non-empty string"
    );
    expect(() =>
      sfn.whenSendTaskFailure({ taskToken: "test", error: 123 })
    ).toThrow("error must be a string or undefined");
  });

  test("should handle JSON serialization errors", () => {
    const circularObj = {};
    circularObj.self = circularObj;

    expect(() =>
      sfn.whenStartExecution({
        stateMachineArn: "arn:test",
        input: circularObj,
      })
    ).toThrow(); // Just check that it throws
  });
});
