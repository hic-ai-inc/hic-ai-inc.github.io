import {
  test,
  describe,
  beforeEach,
  expect,
} from "../../../facade/test-helpers/index.js";
import { createSecretsMock } from "../../../facade/helpers/secrets.js";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
  CreateSecretCommand,
  UpdateSecretCommand,
} from "@aws-sdk/client-secrets-manager";

describe("Secrets Manager Facade", () => {
  let secrets;
  let client;

  beforeEach(() => {
    secrets = createSecretsMock();
    client = new SecretsManagerClient({});
  });

  test("whenGetSecretValue should mock secret retrieval", async () => {
    secrets.whenGetSecretValue(
      { secretId: "my-secret" },
      { username: "admin", password: "secret123" }
    );

    const result = await client.send(
      new GetSecretValueCommand({
        SecretId: "my-secret",
      })
    );

    expect(result.SecretId).toBe("my-secret");
    expect(JSON.parse(result.SecretString)).toEqual({
      username: "admin",
      password: "secret123",
    });
    expect(result.VersionId).toBe("mock-version-id");
  });

  test("whenGetSecretValue should handle string results", async () => {
    secrets.whenGetSecretValue({ secretId: "my-secret" }, "plain-text-secret");

    const result = await client.send(
      new GetSecretValueCommand({
        SecretId: "my-secret",
      })
    );

    expect(result.SecretString).toBe("plain-text-secret");
  });

  test("whenCreateSecret should mock secret creation", async () => {
    secrets.whenCreateSecret({
      name: "new-secret",
      secretString: { api_key: "abc123" },
    });

    const result = await client.send(
      new CreateSecretCommand({
        Name: "new-secret",
        SecretString: JSON.stringify({ api_key: "abc123" }),
      })
    );

    expect(result.Name).toBe("new-secret");
    expect(result.ARN).toContain("new-secret");
    expect(result.VersionId).toBe("mock-version-id");
  });

  test("whenUpdateSecret should mock secret update", async () => {
    secrets.whenUpdateSecret({
      secretId: "existing-secret",
      secretString: { api_key: "updated123" },
    });

    const result = await client.send(
      new UpdateSecretCommand({
        SecretId: "existing-secret",
        SecretString: JSON.stringify({ api_key: "updated123" }),
      })
    );

    expect(result.Name).toBe("existing-secret");
    expect(result.ARN).toContain("existing-secret");
    expect(result.VersionId).toBe("mock-version-id-updated");
  });

  test("should validate input parameters", () => {
    expect(() => secrets.whenGetSecretValue({ secretId: "" })).toThrow(
      "secretId must be a non-empty string"
    );
    expect(() =>
      secrets.whenCreateSecret({ name: "", secretString: {} })
    ).toThrow("name must be a non-empty string");
    expect(() =>
      secrets.whenCreateSecret({ name: "test", secretString: "invalid" })
    ).toThrow("secretString must be an object or undefined");
  });

  test("should handle JSON serialization errors", () => {
    const circularObj = {};
    circularObj.self = circularObj;

    expect(() =>
      secrets.whenGetSecretValue({ secretId: "test" }, circularObj)
    ).toThrow(); // Just check that it throws
    expect(() =>
      secrets.whenCreateSecret({ name: "test", secretString: circularObj })
    ).toThrow(); // Just check that it throws
  });

  test("should work without secretString parameter", async () => {
    secrets.whenCreateSecret({ name: "simple-secret" });

    const result = await client.send(
      new CreateSecretCommand({
        Name: "simple-secret",
      })
    );

    expect(result.Name).toBe("simple-secret");
  });
});
