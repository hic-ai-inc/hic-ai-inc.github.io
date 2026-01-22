/**
 * S3 Facade - Clean API for S3 mocking with stream handling
 *
 * Provides simple methods for mocking S3 operations including GetObject and PutObject.
 * Handles stream creation for GetObject responses and supports content type and metadata
 * matching for PutObject operations. Uses safe path validation for S3 keys.
 */

import { mockClient } from "aws-sdk-client-mock";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

import { Readable } from "stream";
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

function createS3Mock() {
  const s3Mock = mockClient(S3Client);

  const api = {
    whenGetObject({ bucket, key }, data = "") {
      if (!bucket || typeof bucket !== "string") {
        throw new Error("bucket must be a non-empty string");
      }
      if (!key || typeof key !== "string") {
        throw new Error("key must be a non-empty string");
      }

      // Validate S3 key path for security
      const validatedKey = safePath(key, { context: "S3 key validation" });

      let buf;
      if (typeof data === "string") {
        buf = Buffer.from(data);
      } else if (data) {
        buf = Buffer.from(data);
      } else {
        buf = Buffer.from([]);
      }
      const stream = Readable.from([buf]);
      stream.transformToString = async (enc = "utf-8") => buf.toString(enc);
      s3Mock
        .on(
          GetObjectCommand,
          (input) => input.Bucket === bucket && input.Key === validatedKey
        )
        .resolves({ Body: stream });
    },

    whenPutObject({ bucket, key, contentType, metadata }) {
      if (!bucket || typeof bucket !== "string") {
        throw new Error("bucket must be a non-empty string");
      }
      if (!key || typeof key !== "string") {
        throw new Error("key must be a non-empty string");
      }
      if (contentType !== undefined && typeof contentType !== "string") {
        throw new Error("contentType must be a string or undefined");
      }
      if (
        metadata !== undefined &&
        (typeof metadata !== "object" || metadata === null)
      ) {
        throw new Error("metadata must be an object or undefined");
      }

      // Validate S3 key path for security
      const validatedKey = safePath(key, { context: "S3 key validation" });

      s3Mock
        .on(
          PutObjectCommand,
          (input) =>
            input.Bucket === bucket &&
            input.Key === validatedKey &&
            (!contentType || input.ContentType === contentType) &&
            (!metadata || deepEqual(input.Metadata, metadata))
        )
        .resolves({ ETag: '"mock-etag"' });
    },

    whenDeleteObject({ bucket, key }) {
      if (!bucket || typeof bucket !== "string") {
        throw new Error("bucket must be a non-empty string");
      }
      if (!key || typeof key !== "string") {
        throw new Error("key must be a non-empty string");
      }

      // Validate S3 key path for security
      const validatedKey = safePath(key, { context: "S3 key validation" });

      s3Mock
        .on(
          DeleteObjectCommand,
          (input) => input.Bucket === bucket && input.Key === validatedKey
        )
        .resolves({});
    },

    whenListObjects({ bucket, prefix }, objects = []) {
      if (!bucket || typeof bucket !== "string") {
        throw new Error("bucket must be a non-empty string");
      }
      if (prefix !== undefined && typeof prefix !== "string") {
        throw new Error("prefix must be a string or undefined");
      }
      if (!Array.isArray(objects)) {
        throw new Error("objects must be an array");
      }

      // Validate prefix path if provided
      const validatedPrefix = prefix
        ? safePath(prefix, { context: "S3 prefix validation" })
        : undefined;

      const mockObjects = objects.map((obj) => ({
        Key: typeof obj === "string" ? obj : obj.Key,
        Size: typeof obj === "string" ? 1024 : obj.Size || 1024,
        LastModified:
          typeof obj === "string" ? new Date() : obj.LastModified || new Date(),
      }));

      s3Mock
        .on(
          ListObjectsV2Command,
          (input) =>
            input.Bucket === bucket &&
            (!prefix || input.Prefix === validatedPrefix)
        )
        .resolves({
          Contents: mockObjects,
          KeyCount: mockObjects.length,
          IsTruncated: false,
        });
    },

    reset() {
      s3Mock.reset();
    },

    raw: s3Mock,
  };

  registerMock(api);
  return api;
}

export { createS3Mock };
