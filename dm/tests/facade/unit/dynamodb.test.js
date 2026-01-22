import {
  test,
  describe,
  beforeEach,
  expect,
} from "../../../facade/test-helpers/index.js";
import { createDynamoMock } from "../../../facade/helpers/dynamodb.js";
import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";

describe("DynamoDB Facade", () => {
  let dynamo;
  let client;

  beforeEach(() => {
    dynamo = createDynamoMock();
    client = dynamo.newDocumentClient();
  });

  test("whenGetItemByKey should mock specific key lookup", async () => {
    dynamo.whenGetItemByKey(
      { table: "users", key: { id: "123" } },
      { id: "123", name: "John" }
    );

    const result = await client.send(
      new GetCommand({
        TableName: "users",
        Key: { id: "123" },
      })
    );

    expect(result.Item).toEqual({ id: "123", name: "John" });
  });

  test("whenGetItem should mock any lookup on table", async () => {
    dynamo.whenGetItem({ table: "users" }, { id: "456", name: "Jane" });

    const result = await client.send(
      new GetCommand({
        TableName: "users",
        Key: { id: "anything" },
      })
    );

    expect(result.Item).toEqual({ id: "456", name: "Jane" });
  });

  test("whenPutItem should mock item creation", async () => {
    dynamo.whenPutItem({ table: "users", item: { id: "789", name: "Bob" } });

    const result = await client.send(
      new PutCommand({
        TableName: "users",
        Item: { id: "789", name: "Bob" },
      })
    );

    expect(result).toBeDefined();
  });

  test("should return empty result for null items", async () => {
    dynamo.whenGetItem({ table: "users" }, null);

    const result = await client.send(
      new GetCommand({
        TableName: "users",
        Key: { id: "nonexistent" },
      })
    );

    expect(result.Item).toBeUndefined();
  });

  test("whenUpdateItem should mock item updates", async () => {
    dynamo.whenUpdateItem({
      table: "users",
      key: { id: "123" },
      updates: { name: "Updated Name" },
    });

    const result = await client.send(
      new UpdateCommand({
        TableName: "users",
        Key: { id: "123" },
      })
    );

    expect(result.Attributes).toEqual({ id: "123", name: "Updated Name" });
  });

  test("whenQuery should mock query operations", async () => {
    dynamo.whenQuery({ table: "users" }, [
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
    ]);

    const result = await client.send(
      new QueryCommand({
        TableName: "users",
      })
    );

    expect(result.Items).toEqual([
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
    ]);
    expect(result.Count).toBe(2);
  });

  test("whenScan should mock scan operations", async () => {
    dynamo.whenScan({ table: "users" }, [{ id: "1", name: "Alice" }]);

    const result = await client.send(
      new ScanCommand({
        TableName: "users",
      })
    );

    expect(result.Items).toEqual([{ id: "1", name: "Alice" }]);
    expect(result.Count).toBe(1);
  });

  test("should validate input parameters", () => {
    expect(() => dynamo.whenGetItemByKey(null)).toThrow(
      "Cannot destructure property 'table' of 'object null' as it is null."
    );
    expect(() => dynamo.whenGetItemByKey({})).toThrow(
      "table must be a non-empty string"
    );
  });

  test("should handle concurrent mock calls", async () => {
    dynamo.whenGetItemByKey(
      { table: "users", key: { id: "concurrent1" } },
      { id: "concurrent1", data: "first" }
    );
    dynamo.whenGetItemByKey(
      { table: "users", key: { id: "concurrent2" } },
      { id: "concurrent2", data: "second" }
    );

    const [result1, result2] = await Promise.all([
      client.send(
        new GetCommand({ TableName: "users", Key: { id: "concurrent1" } })
      ),
      client.send(
        new GetCommand({ TableName: "users", Key: { id: "concurrent2" } })
      ),
    ]);

    expect(result1.Item).toEqual({ id: "concurrent1", data: "first" });
    expect(result2.Item).toEqual({ id: "concurrent2", data: "second" });
  });

  test("should handle mock overriding", async () => {
    dynamo.whenGetItemByKey(
      { table: "users", key: { id: "override" } },
      { id: "override", data: "original" }
    );
    dynamo.whenGetItemByKey(
      { table: "users", key: { id: "override" } },
      { id: "override", data: "updated" }
    );

    const result = await client.send(
      new GetCommand({
        TableName: "users",
        Key: { id: "override" },
      })
    );

    expect(result.Item).toEqual({ id: "override", data: "updated" });
  });

  test("should handle conditional operations", async () => {
    dynamo.whenPutItem(
      { table: "users", item: { id: "conditional", version: 1 } },
      { ConditionalCheckFailed: false }
    );

    const result = await client.send(
      new PutCommand({
        TableName: "users",
        Item: { id: "conditional", version: 1 },
        ConditionExpression: "attribute_not_exists(id)",
      })
    );

    // Verify the operation completed successfully
    expect(result).toBeDefined();
  });
});
