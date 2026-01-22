import {
  test,
  describe,
  beforeEach,
  expect,
} from "../../../facade/test-helpers/index.js";
import { createLambdaMock } from "../../../facade/helpers/__lambda.js";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

describe("Lambda Facade", () => {
  let lambda;
  let client;

  beforeEach(() => {
    lambda = createLambdaMock();
    client = new LambdaClient({});
  });

  test("whenInvoke should mock synchronous invocation", async () => {
    lambda.whenInvoke(
      { functionName: "my-function" },
      { success: true, data: "result" }
    );

    const result = await client.send(
      new InvokeCommand({
        FunctionName: "my-function",
      })
    );

    expect(result.StatusCode).toBe(200);
    const payload = JSON.parse(new TextDecoder().decode(result.Payload));
    expect(payload).toEqual({ success: true, data: "result" });
  });

  test("whenInvokeAsync should mock asynchronous invocation", async () => {
    lambda.whenInvokeAsync({ functionName: "my-function" }, 202);

    const result = await client.send(
      new InvokeCommand({
        FunctionName: "my-function",
        InvocationType: "Event",
      })
    );

    expect(result.StatusCode).toBe(202);
  });

  test("should validate input parameters", () => {
    expect(() => lambda.whenInvoke({ functionName: "" })).toThrow(
      "functionName must be a non-empty string"
    );
    expect(() => lambda.whenInvokeAsync({ functionName: "test" }, 404)).toThrow(
      "statusCode must be a valid 2xx HTTP status code"
    );
  });

  test("should handle payload encoding errors", () => {
    const circularObj = {};
    circularObj.self = circularObj;

    expect(() =>
      lambda.whenInvoke({ functionName: "test" }, circularObj)
    ).toThrow(); // Just check that it throws, don't validate exact message
  });

  test("should handle concurrent invocations", async () => {
    lambda.whenInvoke(
      { functionName: "function-1" },
      { success: true, data: "result1" }
    );
    lambda.whenInvoke(
      { functionName: "function-2" },
      { success: true, data: "result2" }
    );

    const [result1, result2] = await Promise.all([
      client.send(new InvokeCommand({ FunctionName: "function-1" })),
      client.send(new InvokeCommand({ FunctionName: "function-2" })),
    ]);

    expect(result1.StatusCode).toBe(200);
    expect(result2.StatusCode).toBe(200);
  });

  test("should handle retry patterns", async () => {
    lambda.whenInvoke(
      { functionName: "retry-function" },
      {
        StatusCode: 429,
        FunctionError: "TooManyRequestsException",
      }
    );

    const result = await client.send(
      new InvokeCommand({
        FunctionName: "retry-function",
      })
    );

    // Parse the payload to get the actual response
    const payloadString = Buffer.from(Object.values(result.Payload)).toString();
    const payloadData = JSON.parse(payloadString);

    expect(payloadData.StatusCode).toBe(429);
    expect(payloadData.FunctionError).toBe("TooManyRequestsException");
  });

  test("should handle large payload responses", async () => {
    const largePayload = { data: "x".repeat(1000000) }; // 1MB payload
    lambda.whenInvoke({ functionName: "large-function" }, largePayload);

    const result = await client.send(
      new InvokeCommand({
        FunctionName: "large-function",
      })
    );

    expect(result.StatusCode).toBe(200);
  });
});
