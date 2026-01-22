import {
  test,
  describe,
  expect,
  createSpy,
} from "../../../facade/test-helpers/index.js";
import { resolve as testLoaderResolve } from "../../../facade/utils/test-loader.js";

describe("Test Loader", () => {
  test("should redirect hic-base-layer to facade helper", async () => {
    const mockNextResolve = createSpy();
    const mockContext = {};

    const result = await testLoaderResolve(
      "hic-base-layer",
      mockContext,
      mockNextResolve
    );

    expect(result).toHaveProperty("url");
    expect(result).toHaveProperty("shortCircuit", true);
    expect(result.url).toMatch(/base\.js$/);
    expect(mockNextResolve.callCount).toBe(0);
  });

  test("should delegate @aws-sdk/client-lambda to nextResolve", async () => {
    const mockNextResolve = createSpy(); // returns undefined
    const mockContext = {};

    const result = await testLoaderResolve(
      "@aws-sdk/client-lambda",
      mockContext,
      mockNextResolve
    );

    // Delegation: loader should NOT short-circuit AWS packages
    expect(result).toBeUndefined();
    expect(mockNextResolve.callCount).toBe(1);
    expect(
      mockNextResolve.calledWith("@aws-sdk/client-lambda", mockContext)
    ).toBe(true);
  });

  test("should pass through unknown specifiers to nextResolve", async () => {
    const mockNextResolve = createSpy("mockNextResolve").mockImplementation(
      () => ({ url: "mock://resolved" })
    );
    const mockContext = {};

    const result = await testLoaderResolve(
      "unknown-module",
      mockContext,
      mockNextResolve
    );

    expect(mockNextResolve.callCount).toBe(1);
    expect(mockNextResolve.calledWith("unknown-module", mockContext)).toBe(
      true
    );
    expect(result).toBeDefined();
    expect(result.url).toBe("mock://resolved");
  });

  test("should validate specifier input type", async () => {
    const mockNextResolve = createSpy();
    const mockContext = {};

    try {
      await testLoaderResolve(null, mockContext, mockNextResolve);
      expect.fail("Should have thrown for null specifier");
    } catch (error) {
      expect(error.message).toMatch(/Invalid specifier type/);
    }

    try {
      await testLoaderResolve(123, mockContext, mockNextResolve);
      expect.fail("Should have thrown for number specifier");
    } catch (error) {
      expect(error.message).toMatch(/Invalid specifier type/);
    }
  });

  test("should validate nextResolve function", async () => {
    const mockContext = {};

    try {
      await testLoaderResolve("test", mockContext, null);
      expect.fail("Should have thrown for null nextResolve");
    } catch (error) {
      expect(error.message).toMatch(/nextResolve must be a function/);
    }

    try {
      await testLoaderResolve("test", mockContext, "not-function");
      expect.fail("Should have thrown for string nextResolve");
    } catch (error) {
      expect(error.message).toMatch(/nextResolve must be a function/);
    }
  });

  test("should handle nextResolve errors gracefully", async () => {
    const mockNextResolve = createSpy("mockNextResolve").mockImplementation(
      () => {
        throw new Error("Resolution failed");
      }
    );
    const mockContext = {};

    try {
      await testLoaderResolve("unknown-module", mockContext, mockNextResolve);
      throw new Error("Should have thrown wrapped error");
    } catch (error) {
      expect(error.message).toMatch(
        /Module resolution failed for 'unknown-module'/
      );
    }
  });

  test("should handle pathToFileURL errors gracefully", async () => {
    const mockNextResolve = createSpy();
    const mockContext = {};

    const result = await testLoaderResolve(
      "hic-base-layer",
      mockContext,
      mockNextResolve
    );
    expect(result).toHaveProperty("url");
    expect(result).toHaveProperty("shortCircuit", true);
  });

  test("should return file:// URLs for redirected modules", async () => {
    const mockNextResolve = createSpy();
    const mockContext = {};

    const result = await testLoaderResolve(
      "hic-base-layer",
      mockContext,
      mockNextResolve
    );

    expect(result.url).toMatch(/^file:\/\//);
    expect(result.shortCircuit).toBe(true);
  });

  test("should handle empty string specifier", async () => {
    const mockNextResolve = createSpy("mockNextResolve").mockImplementation(
      () => ({ url: "mock://empty" })
    );
    const mockContext = {};

    const result = await testLoaderResolve("", mockContext, mockNextResolve);

    expect(mockNextResolve.callCount).toBe(1);
    expect(mockNextResolve.calledWith("", mockContext)).toBe(true);
    expect(result).toBeDefined();
    expect(result.url).toBe("mock://empty");
  });

  test("should handle context parameter variations", async () => {
    const mockNextResolve = createSpy("mockNextResolve").mockImplementation(
      () => ({ url: "mock://context" })
    );

    const result1 = await testLoaderResolve("unknown", null, mockNextResolve);
    expect(result1).toBeDefined();
    expect(result1.url).toBe("mock://context");

    const result2 = await testLoaderResolve("unknown", {}, mockNextResolve);
    expect(result2).toBeDefined();
    expect(result2.url).toBe("mock://context");

    const result3 = await testLoaderResolve(
      "unknown",
      { parentURL: "file://test" },
      mockNextResolve
    );
    expect(result3).toBeDefined();
    expect(result3.url).toBe("mock://context");
  });

  test("should maintain file:// URL + shortCircuit for HIC layers and delegate AWS", async () => {
    const mockNextResolve = createSpy(); // returns undefined
    const mockContext = {};

    // HIC layer short-circuits to helpers/base.js
    const hicResult = await testLoaderResolve(
      "hic-base-layer",
      mockContext,
      mockNextResolve
    );
    expect(hicResult).toBeDefined();
    expect(hicResult.url).toMatch(/^file:\/\//);
    expect(hicResult.shortCircuit).toBe(true);
    expect(hicResult.url).toMatch(/base\.js$/);

    // AWS package delegates (no short-circuit)
    const lambdaResult = await testLoaderResolve(
      "@aws-sdk/client-lambda",
      mockContext,
      mockNextResolve
    );
    expect(lambdaResult).toBeUndefined();
    expect(mockNextResolve.callCount).toBe(1);
    expect(
      mockNextResolve.calledWith("@aws-sdk/client-lambda", mockContext)
    ).toBe(true);
  });
});
