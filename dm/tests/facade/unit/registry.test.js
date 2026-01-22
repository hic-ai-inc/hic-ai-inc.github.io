import {
  test,
  describe,
  expect,
  createSpy,
  spyOn,
} from "../../../facade/test-helpers/index.js";
import { registerMock, resetAll } from "../../../facade/utils/registry.js";

describe("Registry", () => {
  test("should register and reset mocks", () => {
    const mockA = { reset: createSpy() };
    const mockB = { reset: createSpy() };

    registerMock(mockA);
    registerMock(mockB);

    resetAll();

    expect(mockA.reset).toHaveBeenCalled();
    expect(mockB.reset).toHaveBeenCalled();
  });

  test("should handle mocks without reset method", () => {
    const mockWithoutReset = {};

    registerMock(mockWithoutReset);

    expect(() => resetAll()).not.toThrow();
  });

  test("should clear registry after reset", () => {
    const mock = { reset: createSpy() };
    registerMock(mock);

    resetAll();
    resetAll(); // Second call should not call reset again

    expect(mock.reset).toHaveBeenCalledTimes(1);
  });

  test("should validate mock instance input", () => {
    expect(() => registerMock(null)).toThrow(
      "Mock instance must be a non-null object"
    );
    expect(() => registerMock(undefined)).toThrow(
      "Mock instance must be a non-null object"
    );
    expect(() => registerMock("not-object")).toThrow(
      "Mock instance must be a non-null object"
    );
    expect(() => registerMock(123)).toThrow(
      "Mock instance must be a non-null object"
    );
  });

  test("should handle reset errors gracefully", () => {
    const mockWithError = {
      reset: createSpy(() => {
        throw new Error("Reset failed");
      }),
    };

    registerMock(mockWithError);

    // Should not throw even when reset fails
    expect(() => resetAll()).not.toThrow();
  });

  test("should auto-register all facade mocks", async () => {
    const { createDynamoMock } = await import(
      "../../../facade/helpers/dynamodb.js"
    );
    const { createS3Mock } = await import("../../../facade/helpers/s3.js");
    const { createLambdaMock } = await import(
      "../../../facade/helpers/__lambda.js"
    );

    // Create mocks - they should auto-register
    const dynamo = createDynamoMock();
    const s3 = createS3Mock();
    const lambda = createLambdaMock();

    // Verify they're registered by checking reset calls
    dynamo.reset = createSpy();
    s3.reset = createSpy();
    lambda.reset = createSpy();

    resetAll();

    expect(dynamo.reset).toHaveBeenCalled();
    expect(s3.reset).toHaveBeenCalled();
    expect(lambda.reset).toHaveBeenCalled();
  });

  test("should handle mixed mock types in registry", () => {
    const mockWithReset = { reset: createSpy() };
    const mockWithoutReset = {};
    const mockWithFailingReset = {
      reset: createSpy(() => {
        throw new Error("Reset failed");
      }),
    };

    registerMock(mockWithReset);
    registerMock(mockWithoutReset);
    registerMock(mockWithFailingReset);

    expect(() => resetAll()).not.toThrow();
    expect(mockWithReset.reset).toHaveBeenCalled();
    expect(mockWithFailingReset.reset).toHaveBeenCalled();
  });
});
