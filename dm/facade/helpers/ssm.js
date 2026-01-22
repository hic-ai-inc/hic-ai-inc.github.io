/**
 * SSM Parameter Store Facade - Clean API for Parameter Store mocking
 *
 * Provides simple methods for mocking SSM Parameter Store operations including
 * parameter retrieval, creation, and updates with proper type handling.
 */

import { mockClient } from "aws-sdk-client-mock";
import {
  SSMClient,
  GetParameterCommand,
  GetParametersCommand,
  PutParameterCommand,
  DeleteParameterCommand,
} from "@aws-sdk/client-ssm";
import { deepEqual } from "../utils/deepEqual.js";
import { registerMock } from "../utils/registry.js";

// Inline safe path function for facade testing
const safePath = (path, context = {}) => {
  if (typeof path !== "string") throw new Error("Path must be a string");
  // Basic path validation - prevent traversal
  if (path.includes("..") || path.includes("\\")) {
    throw new Error(
      `Invalid path detected: ${context.context || "path validation"}`
    );
  }
  return path;
};

function createSSMMock() {
  const ssmMock = mockClient(SSMClient);

  const api = {
    whenGetParameter(
      { name, withDecryption },
      result = { Value: "mock-value" }
    ) {
      if (!name || typeof name !== "string") {
        throw new Error("name must be a non-empty string");
      }
      if (withDecryption !== undefined && typeof withDecryption !== "boolean") {
        throw new Error("withDecryption must be a boolean or undefined");
      }

      // Validate parameter name path for security
      const validatedName = safePath(name, {
        context: "SSM parameter name validation",
      });

      ssmMock
        .on(GetParameterCommand, (cmd) => {
          // Match parameter name
          if (cmd.Name !== validatedName) return false;

          // Match decryption flag if provided
          if (
            withDecryption !== undefined &&
            cmd.WithDecryption !== withDecryption
          )
            return false;

          return true;
        })
        .resolves({
          Parameter: {
            Name: validatedName,
            Value: result.Value || result,
            Type: result.Type || "String",
            Version: result.Version || 1,
          },
        });
    },

    whenGetParameters({ names, withDecryption }, results = []) {
      if (!Array.isArray(names) || names.length === 0) {
        throw new Error("names must be a non-empty array");
      }
      if (withDecryption !== undefined && typeof withDecryption !== "boolean") {
        throw new Error("withDecryption must be a boolean or undefined");
      }
      if (!Array.isArray(results)) {
        throw new Error("results must be an array");
      }

      // Validate all parameter names for security
      const validatedNames = names.map((name) => {
        if (!name || typeof name !== "string") {
          throw new Error("Each name must be a non-empty string");
        }
        return safePath(name, { context: "SSM parameter name validation" });
      });

      ssmMock
        .on(GetParametersCommand, (cmd) => {
          // Match parameter names
          if (!deepEqual(cmd.Names, validatedNames)) return false;

          // Match decryption flag if provided
          if (
            withDecryption !== undefined &&
            cmd.WithDecryption !== withDecryption
          )
            return false;

          return true;
        })
        .resolves({
          Parameters: results.map((result, i) => ({
            Name: validatedNames[i],
            Value: result.Value || result,
            Type: result.Type || "String",
            Version: result.Version || 1,
          })),
          InvalidParameters: [],
        });
    },

    whenPutParameter({ name, value, type }) {
      if (!name || typeof name !== "string") {
        throw new Error("name must be a non-empty string");
      }
      if (value === undefined || value === null) {
        throw new Error("value must be provided");
      }
      if (typeof value !== "string") {
        throw new Error("value must be a string");
      }
      if (
        type !== undefined &&
        !["String", "StringList", "SecureString"].includes(type)
      ) {
        throw new Error("type must be String, StringList, or SecureString");
      }

      // Validate parameter name path for security
      const validatedName = safePath(name, {
        context: "SSM parameter name validation",
      });

      ssmMock
        .on(PutParameterCommand, (cmd) => {
          // Match parameter name
          if (cmd.Name !== validatedName) return false;

          // Match parameter value
          if (cmd.Value !== value) return false;

          // Match parameter type if provided
          if (type && cmd.Type !== type) return false;

          return true;
        })
        .resolves({
          Version: 1,
        });
    },

    whenDeleteParameter({ name }) {
      if (!name || typeof name !== "string") {
        throw new Error("name must be a non-empty string");
      }

      // Validate parameter name path for security
      const validatedName = safePath(name, {
        context: "SSM parameter name validation",
      });

      ssmMock
        .on(DeleteParameterCommand, (cmd) => cmd.Name === validatedName)
        .resolves({});
    },

    reset() {
      ssmMock.reset();
    },

    raw: ssmMock,
  };

  registerMock(api);
  return api;
}

export { createSSMMock };
