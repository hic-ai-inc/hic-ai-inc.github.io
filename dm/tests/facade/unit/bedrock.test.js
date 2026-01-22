import {
  test,
  describe,
  beforeEach,
  expect,
} from "../../../facade/test-helpers/index.js";
import { createBedrockMock } from "../../../facade/helpers/bedrock.js";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";

describe("Bedrock Facade", () => {
  let bedrock;
  let client;

  beforeEach(() => {
    bedrock = createBedrockMock();
    client = new BedrockRuntimeClient({});
  });

  test("whenInvokeModel should mock model invocation", async () => {
    bedrock.whenInvokeModel(
      { modelId: "claude-3", body: { prompt: "Hello" } },
      { completion: "Hi there!" }
    );

    const result = await client.send(
      new InvokeModelCommand({
        modelId: "claude-3",
        body: JSON.stringify({ prompt: "Hello" }),
      })
    );

    const responseBody = JSON.parse(new TextDecoder().decode(result.body));
    expect(responseBody.completion).toBe("Hi there!");
  });

  test("whenInvokeModelWithResponseStream should mock streaming", async () => {
    bedrock.whenInvokeModelWithResponseStream(
      { modelId: "claude-3", body: { prompt: "Hello" } },
      ["Hello", " world", "!"]
    );

    const result = await client.send(
      new InvokeModelWithResponseStreamCommand({
        modelId: "claude-3",
        body: JSON.stringify({ prompt: "Hello" }),
      })
    );

    const chunks = [];
    for await (const chunk of result.body) {
      if (chunk.chunk?.bytes) {
        const text = JSON.parse(new TextDecoder().decode(chunk.chunk.bytes));
        chunks.push(text.completion);
      }
    }

    expect(chunks).toEqual(["Hello", " world", "!"]);
  });

  test("should validate input parameters", () => {
    expect(() => bedrock.whenInvokeModel({ modelId: "", body: {} })).toThrow(
      "modelId must be a non-empty string"
    );
    expect(() =>
      bedrock.whenInvokeModel({ modelId: "claude-3", body: null })
    ).toThrow("body must be an object or undefined");
  });

  test("should handle malformed result gracefully", () => {
    const circularObj = {};
    circularObj.self = circularObj;

    expect(() =>
      bedrock.whenInvokeModel({ modelId: "claude-3" }, circularObj)
    ).toThrow(); // Just check that it throws
  });

  test("should handle concurrent model invocations", async () => {
    bedrock.whenInvokeModel(
      { modelId: "claude-3", body: { prompt: "First" } },
      { completion: "Response 1" }
    );
    bedrock.whenInvokeModel(
      { modelId: "titan", body: { prompt: "Second" } },
      { completion: "Response 2" }
    );

    const [result1, result2] = await Promise.all([
      client.send(
        new InvokeModelCommand({
          modelId: "claude-3",
          body: JSON.stringify({ prompt: "First" }),
        })
      ),
      client.send(
        new InvokeModelCommand({
          modelId: "titan",
          body: JSON.stringify({ prompt: "Second" }),
        })
      ),
    ]);

    const response1 = JSON.parse(new TextDecoder().decode(result1.body));
    const response2 = JSON.parse(new TextDecoder().decode(result2.body));

    expect(response1.completion).toBe("Response 1");
    expect(response2.completion).toBe("Response 2");
  });

  test("should handle large model responses", async () => {
    const largeResponse = { completion: "x".repeat(100000) }; // Large response
    bedrock.whenInvokeModel(
      { modelId: "claude-3", body: { prompt: "Generate large text" } },
      largeResponse
    );

    const result = await client.send(
      new InvokeModelCommand({
        modelId: "claude-3",
        body: JSON.stringify({ prompt: "Generate large text" }),
      })
    );

    const response = JSON.parse(new TextDecoder().decode(result.body));
    expect(response.completion).toHaveLength(100000);
  });
});
