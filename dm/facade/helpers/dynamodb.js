/**
 * DynamoDB Facade - Clean API for DynamoDB DocumentClient mocking
 *
 * Provides simple methods for mocking DynamoDB operations using plain JavaScript objects
 * instead of complex AttributeValue formats. Uses DocumentClient for automatic marshalling.
 * Supports Get, Put, Query, and Scan operations with key-based and table-wide matching.
 */

import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { deepEqual } from "../utils/deepEqual.js";
import { registerMock } from "../utils/registry.js";

function createDynamoMock() {
  const docMock = mockClient(DynamoDBDocumentClient);
  const rawMock = mockClient(DynamoDBClient);

  const api = {
    whenGetItemByKey({ table, key }, result) {
      if (!table || typeof table !== "string") {
        throw new Error("table must be a non-empty string");
      }
      if (!key || typeof key !== "object") {
        throw new Error("key must be a non-null object");
      }

      docMock
        .on(
          GetCommand,
          (input) => input.TableName === table && deepEqual(input.Key, key)
        )
        .resolves(result == null ? {} : { Item: result });
    },

    whenGetItem({ table }, result) {
      if (!table || typeof table !== "string") {
        throw new Error("table must be a non-empty string");
      }

      docMock
        .on(GetCommand, (input) => input.TableName === table)
        .resolves(result == null ? {} : { Item: result });
    },

    whenPutItem({ table, item }) {
      if (!table || typeof table !== "string") {
        throw new Error("table must be a non-empty string");
      }
      if (!item || typeof item !== "object") {
        throw new Error("item must be a non-null object");
      }

      docMock
        .on(
          PutCommand,
          (input) => input.TableName === table && deepEqual(input.Item, item)
        )
        .resolves({});
    },

    whenUpdateItem({ table, key, updates }) {
      if (!table || typeof table !== "string") {
        throw new Error("table must be a non-empty string");
      }
      if (!key || typeof key !== "object") {
        throw new Error("key must be a non-null object");
      }
      if (!updates || typeof updates !== "object") {
        throw new Error("updates must be a non-null object");
      }

      docMock
        .on(
          UpdateCommand,
          (input) => input.TableName === table && deepEqual(input.Key, key)
        )
        .resolves({ Attributes: { ...key, ...updates } });
    },

    whenQuery({ table }, results = []) {
      if (!table || typeof table !== "string") {
        throw new Error("table must be a non-empty string");
      }
      if (!Array.isArray(results)) {
        throw new Error("results must be an array");
      }

      docMock
        .on(QueryCommand, (input) => input.TableName === table)
        .resolves({ Items: results, Count: results.length });
    },

    whenScan({ table }, results = []) {
      if (!table || typeof table !== "string") {
        throw new Error("table must be a non-empty string");
      }
      if (!Array.isArray(results)) {
        throw new Error("results must be an array");
      }

      docMock
        .on(ScanCommand, (input) => input.TableName === table)
        .resolves({ Items: results, Count: results.length });
    },

    reset() {
      docMock.reset();
      rawMock.reset();
    },

    raw: docMock,
    rawClient: rawMock,

    newDocumentClient: () =>
      DynamoDBDocumentClient.from(new DynamoDBClient({})),

    newRawClient: () => new DynamoDBClient({}),
  };

  registerMock(api);
  return api;
}

// Re-export AWS SDK clients for compatibility with dynamodb Lambda layer
// Export DynamoDB client and low-level commands
export {
  DynamoDBClient,
  PutItemCommand,
  UpdateItemCommand,
  QueryCommand as DDBQueryCommand,
  GetItemCommand,
  BatchWriteItemCommand,
  ScanCommand as DDBScanCommand,
  DeleteItemCommand,
} from "@aws-sdk/client-dynamodb";

// Export DocumentClient and high-level commands (preferred)
export {
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
  QueryCommand,
  GetCommand,
  BatchWriteCommand,
  ScanCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";

// Export utilities and streams
export * from "@aws-sdk/util-dynamodb";
export * from "@aws-sdk/client-dynamodb-streams";

export { createDynamoMock };
