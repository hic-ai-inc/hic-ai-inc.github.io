import { test, describe, expect } from "../../../facade/test-helpers/index.js";
import { deepEqual } from "../../../facade/utils/deepEqual.js";

describe("Deep Equality Utility", () => {
  test("should handle primitive values", () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual("hello", "hello")).toBe(true);
    expect(deepEqual(true, true)).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(undefined, undefined)).toBe(true);

    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual("hello", "world")).toBe(false);
    expect(deepEqual(true, false)).toBe(false);
    expect(deepEqual(null, undefined)).toBe(false);
  });

  test("should handle NaN values", () => {
    expect(deepEqual(NaN, NaN)).toBe(true);
    expect(deepEqual(NaN, 1)).toBe(false);
  });

  test("should handle simple objects", () => {
    expect(deepEqual({ a: 1 }, { a: 1 })).toBe(true);
    expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);

    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqual({ a: 1 }, { b: 1 })).toBe(false);
  });

  test("should handle nested objects", () => {
    const obj1 = { a: { b: { c: 1 } } };
    const obj2 = { a: { b: { c: 1 } } };
    const obj3 = { a: { b: { c: 2 } } };

    expect(deepEqual(obj1, obj2)).toBe(true);
    expect(deepEqual(obj1, obj3)).toBe(false);
  });

  test("should handle arrays", () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([], [])).toBe(true);

    expect(deepEqual([1, 2, 3], [1, 2, 4])).toBe(false);
    expect(deepEqual([1, 2, 3], [1, 2])).toBe(false);
    expect(deepEqual([1, 2, 3], [3, 2, 1])).toBe(false);
  });

  test("should handle nested arrays", () => {
    const arr1 = [
      [1, 2],
      [3, 4],
    ];
    const arr2 = [
      [1, 2],
      [3, 4],
    ];
    const arr3 = [
      [1, 2],
      [3, 5],
    ];

    expect(deepEqual(arr1, arr2)).toBe(true);
    expect(deepEqual(arr1, arr3)).toBe(false);
  });

  test("should handle mixed arrays and objects", () => {
    const mixed1 = { a: [1, { b: 2 }], c: 3 };
    const mixed2 = { a: [1, { b: 2 }], c: 3 };
    const mixed3 = { a: [1, { b: 3 }], c: 3 };

    expect(deepEqual(mixed1, mixed2)).toBe(true);
    expect(deepEqual(mixed1, mixed3)).toBe(false);
  });

  test("should distinguish between arrays and objects", () => {
    expect(deepEqual([], {})).toBe(false);
    expect(deepEqual([1, 2], { 0: 1, 1: 2 })).toBe(false);
  });

  test("should handle edge cases", () => {
    expect(deepEqual({}, {})).toBe(true);
    expect(deepEqual([], [])).toBe(true);
    expect(deepEqual(0, false)).toBe(false);
    expect(deepEqual("", false)).toBe(false);
    expect(deepEqual(null, {})).toBe(false);
    expect(deepEqual(undefined, {})).toBe(false);
  });

  test("should handle AWS SDK parameter comparison", () => {
    // Real-world AWS SDK parameter comparison
    const params1 = {
      TableName: "users",
      Key: { id: "123" },
      UpdateExpression: "SET #name = :name",
      ExpressionAttributeNames: { "#name": "name" },
      ExpressionAttributeValues: { ":name": "John" },
    };

    const params2 = {
      TableName: "users",
      Key: { id: "123" },
      UpdateExpression: "SET #name = :name",
      ExpressionAttributeNames: { "#name": "name" },
      ExpressionAttributeValues: { ":name": "John" },
    };

    const params3 = {
      TableName: "users",
      Key: { id: "123" },
      UpdateExpression: "SET #name = :name",
      ExpressionAttributeNames: { "#name": "name" },
      ExpressionAttributeValues: { ":name": "Jane" },
    };

    expect(deepEqual(params1, params2)).toBe(true);
    expect(deepEqual(params1, params3)).toBe(false);
  });

  test("should handle circular references", () => {
    // Circular reference detection now prevents stack overflow
    const obj1 = { a: 1 };
    obj1.self = obj1;

    const obj2 = { a: 1 };
    obj2.self = obj2;

    const obj3 = { a: 2 };
    obj3.self = obj3;

    expect(deepEqual(obj1, obj2)).toBe(true);
    expect(deepEqual(obj1, obj3)).toBe(false);
  });

  test("should handle performance with large objects", () => {
    const large1 = {};
    const large2 = {};

    for (let i = 0; i < 1000; i++) {
      large1[`key${i}`] = `value${i}`;
      large2[`key${i}`] = `value${i}`;
    }

    const startTime = Date.now();
    const result = deepEqual(large1, large2);
    const endTime = Date.now();

    expect(result).toBe(true);
    expect(endTime - startTime).toBeLessThan(100); // Should complete in <100ms
  });
});
