import {
  test,
  describe,
  beforeEach,
  expect,
} from "../../../facade/test-helpers/index.js";
import { createS3Mock } from "../../../facade/helpers/s3.js";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

describe("S3 Facade", () => {
  let s3;
  let client;

  beforeEach(() => {
    s3 = createS3Mock();
    client = new S3Client({});
  });

  test("whenGetObject should mock object retrieval", async () => {
    s3.whenGetObject({ bucket: "my-bucket", key: "test.txt" }, "Hello World");

    const result = await client.send(
      new GetObjectCommand({
        Bucket: "my-bucket",
        Key: "test.txt",
      })
    );

    const body = await result.Body.transformToString();
    expect(body).toBe("Hello World");
  });

  test("whenPutObject should mock object upload", async () => {
    s3.whenPutObject({
      bucket: "my-bucket",
      key: "test.txt",
      contentType: "text/plain",
    });

    const result = await client.send(
      new PutObjectCommand({
        Bucket: "my-bucket",
        Key: "test.txt",
        ContentType: "text/plain",
      })
    );

    expect(result.ETag).toBe('"mock-etag"');
  });

  test("whenDeleteObject should mock object deletion", async () => {
    s3.whenDeleteObject({ bucket: "my-bucket", key: "test.txt" });

    const result = await client.send(
      new DeleteObjectCommand({
        Bucket: "my-bucket",
        Key: "test.txt",
      })
    );

    expect(result).toBeDefined();
  });

  test("whenListObjects should mock object listing", async () => {
    s3.whenListObjects({ bucket: "my-bucket", prefix: "docs/" }, [
      "docs/file1.txt",
      "docs/file2.txt",
    ]);

    const result = await client.send(
      new ListObjectsV2Command({
        Bucket: "my-bucket",
        Prefix: "docs/",
      })
    );

    expect(result.Contents).toHaveLength(2);
    expect(result.Contents[0].Key).toBe("docs/file1.txt");
    expect(result.KeyCount).toBe(2);
  });

  test("should validate input parameters", () => {
    expect(() => s3.whenGetObject({ bucket: "", key: "test" })).toThrow(
      "bucket must be a non-empty string"
    );
    expect(() =>
      s3.whenPutObject({ bucket: "test", key: "", contentType: 123 })
    ).toThrow("key must be a non-empty string");
    expect(() => s3.whenListObjects({ bucket: "test", prefix: 123 })).toThrow(
      "prefix must be a string or undefined"
    );
  });

  test("should handle buffer data in GetObject", async () => {
    const bufferData = Buffer.from("Binary data");
    s3.whenGetObject({ bucket: "my-bucket", key: "binary.dat" }, bufferData);

    const result = await client.send(
      new GetObjectCommand({
        Bucket: "my-bucket",
        Key: "binary.dat",
      })
    );

    const body = await result.Body.transformToString();
    expect(body).toBe("Binary data");
  });

  test("should handle concurrent mock calls", async () => {
    s3.whenGetObject({ bucket: "bucket1", key: "file1.txt" }, "Content 1");
    s3.whenGetObject({ bucket: "bucket2", key: "file2.txt" }, "Content 2");

    const [result1, result2] = await Promise.all([
      client.send(
        new GetObjectCommand({ Bucket: "bucket1", Key: "file1.txt" })
      ),
      client.send(
        new GetObjectCommand({ Bucket: "bucket2", Key: "file2.txt" })
      ),
    ]);

    const [body1, body2] = await Promise.all([
      result1.Body.transformToString(),
      result2.Body.transformToString(),
    ]);

    expect(body1).toBe("Content 1");
    expect(body2).toBe("Content 2");
  });

  test("should handle mock overriding", async () => {
    s3.whenGetObject({ bucket: "my-bucket", key: "override.txt" }, "Original");
    s3.whenGetObject({ bucket: "my-bucket", key: "override.txt" }, "Updated");

    const result = await client.send(
      new GetObjectCommand({
        Bucket: "my-bucket",
        Key: "override.txt",
      })
    );

    const body = await result.Body.transformToString();
    expect(body).toBe("Updated");
  });

  test("should handle pagination patterns", async () => {
    s3.whenListObjects({ bucket: "my-bucket" }, [
      { Key: "file1.txt", Size: 100 },
      { Key: "file2.txt", Size: 200 },
    ]);

    const result = await client.send(
      new ListObjectsV2Command({
        Bucket: "my-bucket",
        MaxKeys: 2,
      })
    );

    expect(result.Contents).toHaveLength(2);
    expect(result.Contents[0].Key).toBe("file1.txt");
    expect(result.Contents[1].Key).toBe("file2.txt");
  });
});
