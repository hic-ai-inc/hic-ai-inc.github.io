import {
  test,
  describe,
  beforeEach,
  expect,
} from "../../../facade/test-helpers/index.js";
import { createSSMMock } from "../../../facade/helpers/ssm.js";
import {
  SSMClient,
  GetParameterCommand,
  GetParametersCommand,
  PutParameterCommand,
  DeleteParameterCommand,
} from "@aws-sdk/client-ssm";

describe("SSM Parameter Store Facade", () => {
  let ssm;
  let client;

  beforeEach(() => {
    ssm = createSSMMock();
    client = new SSMClient({});
  });

  test("whenGetParameter should mock parameter retrieval", async () => {
    ssm.whenGetParameter(
      { name: "/app/database/host", withDecryption: true },
      { Value: "db.example.com", Type: "String", Version: 2 }
    );

    const result = await client.send(
      new GetParameterCommand({
        Name: "/app/database/host",
        WithDecryption: true,
      })
    );

    expect(result.Parameter.Name).toBe("/app/database/host");
    expect(result.Parameter.Value).toBe("db.example.com");
    expect(result.Parameter.Type).toBe("String");
    expect(result.Parameter.Version).toBe(2);
  });

  test("whenGetParameter should handle simple values", async () => {
    ssm.whenGetParameter({ name: "/app/config/timeout" }, "30");

    const result = await client.send(
      new GetParameterCommand({
        Name: "/app/config/timeout",
      })
    );

    expect(result.Parameter.Value).toBe("30");
    expect(result.Parameter.Type).toBe("String");
    expect(result.Parameter.Version).toBe(1);
  });

  test("whenGetParameters should mock multiple parameter retrieval", async () => {
    ssm.whenGetParameters(
      { names: ["/app/db/host", "/app/db/port"], withDecryption: false },
      ["db.example.com", "5432"]
    );

    const result = await client.send(
      new GetParametersCommand({
        Names: ["/app/db/host", "/app/db/port"],
        WithDecryption: false,
      })
    );

    expect(result.Parameters).toHaveLength(2);
    expect(result.Parameters[0].Name).toBe("/app/db/host");
    expect(result.Parameters[0].Value).toBe("db.example.com");
    expect(result.Parameters[1].Name).toBe("/app/db/port");
    expect(result.Parameters[1].Value).toBe("5432");
    expect(result.InvalidParameters).toEqual([]);
  });

  test("whenPutParameter should mock parameter creation", async () => {
    ssm.whenPutParameter({
      name: "/app/new/setting",
      value: "new-value",
      type: "String",
    });

    const result = await client.send(
      new PutParameterCommand({
        Name: "/app/new/setting",
        Value: "new-value",
        Type: "String",
      })
    );

    expect(result.Version).toBe(1);
  });

  test("whenDeleteParameter should mock parameter deletion", async () => {
    ssm.whenDeleteParameter({ name: "/app/old/setting" });

    const result = await client.send(
      new DeleteParameterCommand({
        Name: "/app/old/setting",
      })
    );

    expect(result).toBeDefined();
  });

  test("should validate input parameters", () => {
    expect(() =>
      ssm.whenGetParameter({ name: "", withDecryption: true })
    ).toThrow("name must be a non-empty string");
    expect(() =>
      ssm.whenGetParameter({ name: "/test", withDecryption: "invalid" })
    ).toThrow("withDecryption must be a boolean or undefined");
    expect(() =>
      ssm.whenGetParameters({ names: [], withDecryption: false })
    ).toThrow("names must be a non-empty array");
    expect(() => ssm.whenPutParameter({ name: "/test", value: null })).toThrow(
      "value must be provided"
    );
    expect(() =>
      ssm.whenPutParameter({
        name: "/test",
        value: "test",
        type: "InvalidType",
      })
    ).toThrow("type must be String, StringList, or SecureString");
  });

  test("should validate parameter names in array", () => {
    expect(() => ssm.whenGetParameters({ names: ["/valid", ""] })).toThrow(
      "Each name must be a non-empty string"
    );
  });

  test("should handle SecureString parameters", async () => {
    ssm.whenPutParameter({
      name: "/app/secret/key",
      value: "encrypted-value",
      type: "SecureString",
    });

    const result = await client.send(
      new PutParameterCommand({
        Name: "/app/secret/key",
        Value: "encrypted-value",
        Type: "SecureString",
      })
    );

    expect(result.Version).toBe(1);
  });

  test("should work without type parameter", async () => {
    ssm.whenPutParameter({
      name: "/app/simple/setting",
      value: "simple-value",
    });

    const result = await client.send(
      new PutParameterCommand({
        Name: "/app/simple/setting",
        Value: "simple-value",
      })
    );

    expect(result.Version).toBe(1);
  });
});
