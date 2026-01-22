/**
 * Secrets Manager Facade - Clean API for Secrets Manager mocking
 *
 * Provides simple methods for mocking Secrets Manager operations including
 * secret retrieval, creation, and updates with proper JSON parsing.
 */

import { mockClient } from "aws-sdk-client-mock";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
  CreateSecretCommand,
  UpdateSecretCommand,
} from "@aws-sdk/client-secrets-manager";
import { deepEqual } from "../utils/deepEqual.js";
import { registerMock } from "../utils/registry.js";

function createSecretsMock() {
  const secretsMock = mockClient(SecretsManagerClient);

  const api = {
    whenGetSecretValue({ secretId }, result = { SecretString: "{}" }) {
      if (!secretId || typeof secretId !== "string") {
        throw new Error("secretId must be a non-empty string");
      }

      let secretString;
      if (typeof result === "string") {
        secretString = result;
      } else {
        try {
          secretString = JSON.stringify(result);
        } catch (error) {
          throw new Error(
            `Failed to serialize secret result: ${error.message}`
          );
        }
      }

      secretsMock
        .on(GetSecretValueCommand, (cmd) => cmd.SecretId === secretId)
        .resolves({
          SecretId: secretId,
          SecretString: secretString,
          VersionId: "mock-version-id",
          VersionStages: ["AWSCURRENT"],
        });
    },

    whenCreateSecret({ name, secretString }) {
      if (!name || typeof name !== "string") {
        throw new Error("name must be a non-empty string");
      }
      if (secretString !== undefined && typeof secretString !== "object") {
        throw new Error("secretString must be an object or undefined");
      }

      let serializedSecret;
      if (secretString) {
        try {
          serializedSecret = JSON.stringify(secretString);
        } catch (error) {
          throw new Error(`Failed to serialize secretString: ${error.message}`);
        }
      }

      secretsMock
        .on(
          CreateSecretCommand,
          (cmd) =>
            cmd.Name === name &&
            (!secretString || cmd.SecretString === serializedSecret)
        )
        .resolves({
          ARN: `arn:aws:secretsmanager:us-east-1:123456789012:secret:${name}-AbCdEf`,
          Name: name,
          VersionId: "mock-version-id",
        });
    },

    whenUpdateSecret({ secretId, secretString }) {
      if (!secretId || typeof secretId !== "string") {
        throw new Error("secretId must be a non-empty string");
      }
      if (secretString !== undefined && typeof secretString !== "object") {
        throw new Error("secretString must be an object or undefined");
      }

      let serializedSecret;
      if (secretString) {
        try {
          serializedSecret = JSON.stringify(secretString);
        } catch (error) {
          throw new Error(`Failed to serialize secretString: ${error.message}`);
        }
      }

      secretsMock
        .on(
          UpdateSecretCommand,
          (cmd) =>
            cmd.SecretId === secretId &&
            (!secretString || cmd.SecretString === serializedSecret)
        )
        .resolves({
          ARN: `arn:aws:secretsmanager:us-east-1:123456789012:secret:${secretId}-AbCdEf`,
          Name: secretId,
          VersionId: "mock-version-id-updated",
        });
    },

    reset() {
      secretsMock.reset();
    },

    raw: secretsMock,
  };

  registerMock(api);
  return api;
}

export { createSecretsMock };
