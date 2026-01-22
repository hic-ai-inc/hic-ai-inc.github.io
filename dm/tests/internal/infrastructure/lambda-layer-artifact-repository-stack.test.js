/**
 * Infrastructure Tests: CloudFormation Template Validation
 * Tests the lambda-layer-artifact-repository-stack.yaml template
 */

import { test, describe } from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { expect } from "../../../facade/test-helpers/expect.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEMPLATE_PATH = join(
  __dirname,
  "../../../infrastructure/lambda-layer-artifact-repository-stack.yaml"
);

describe("CloudFormation Template Validation", () => {
  let templateContent;

  test("template file exists and is readable", async () => {
    try {
      templateContent = await readFile(TEMPLATE_PATH, "utf8");
      expect(templateContent).toBeTruthy();
      expect(templateContent.length).toBeGreaterThan(0);
    } catch (error) {
      throw new Error(`Failed to read template file: ${error.message}`);
    }
  });

  test("template has valid YAML structure", async () => {
    templateContent =
      templateContent || (await readFile(TEMPLATE_PATH, "utf8"));

    // Basic YAML validation - should not start with invalid characters
    expect(templateContent.startsWith("\t")).toBe(false);
    expect(templateContent.includes("\t")).toBe(false); // Should use spaces, not tabs

    // Should have proper line endings and indentation
    const lines = templateContent.split("\n");
    expect(lines.length).toBeGreaterThan(10); // Should have substantial content
  });

  test("template has required CloudFormation structure", async () => {
    templateContent =
      templateContent || (await readFile(TEMPLATE_PATH, "utf8"));

    // Basic CloudFormation template structure
    expect(templateContent).toContain("AWSTemplateFormatVersion: \"2010-09-09\"");
    expect(templateContent).toContain(
      "Description: HIC /dm Artifact Repository"
    );
    expect(templateContent).toContain("Parameters:");
    expect(templateContent).toContain("Resources:");
    expect(templateContent).toContain("Outputs:");
  });

  test("template has required parameters", async () => {
    templateContent =
      templateContent || (await readFile(TEMPLATE_PATH, "utf8"));

    // Critical parameters for bucket configuration
    const requiredParams = [
      "ArtifactBucketName:",
      "TrailBucketName:",
      "CloudWatchLogRetentionDays:",
      "TrailName:",
    ];

    requiredParams.forEach((param) => {
      expect(templateContent).toContain(param);
    });

    // Parameters should have Type definitions
    expect(templateContent).toContain("Type: String");
    expect(templateContent).toContain("Type: Number");
  });

  test("template defines S3 artifact bucket resource", async () => {
    templateContent =
      templateContent || (await readFile(TEMPLATE_PATH, "utf8"));

    // Must have main artifact bucket
    expect(templateContent).toContain("ArtifactBucket:");
    expect(templateContent).toContain("Type: AWS::S3::Bucket");

    // Security: encryption enabled
    expect(templateContent).toContain("BucketEncryption:");
    expect(templateContent).toContain("ServerSideEncryptionConfiguration:");
    expect(templateContent).toContain("SSEAlgorithm: AES256");

    // Security: public access blocked
    expect(templateContent).toContain("PublicAccessBlockConfiguration:");
    expect(templateContent).toContain("BlockPublicAcls: true");
    expect(templateContent).toContain("RestrictPublicBuckets: true");

    // Compliance: versioning enabled
    expect(templateContent).toContain("VersioningConfiguration:");
    expect(templateContent).toContain("Status: Enabled");
  });

  test("template includes security policies", async () => {
    templateContent =
      templateContent || (await readFile(TEMPLATE_PATH, "utf8"));

    // Artifact bucket policy should exist
    expect(templateContent).toContain("ArtifactBucketPolicy:");
    expect(templateContent).toContain("Type: AWS::S3::BucketPolicy");

    // Policy should enforce TLS
    expect(templateContent).toContain("PolicyDocument:");
    expect(templateContent).toContain("Statement:");
    expect(templateContent).toContain("EnforceTLSOnly");
    expect(templateContent).toContain("Effect: Deny");
    expect(templateContent).toContain("aws:SecureTransport: false");
  });

  test("template includes CloudTrail monitoring", async () => {
    templateContent =
      templateContent || (await readFile(TEMPLATE_PATH, "utf8"));

    // CloudTrail components should exist
    expect(templateContent).toContain("ArtifactTrail:");
    expect(templateContent).toContain("Type: AWS::CloudTrail::Trail");
    expect(templateContent).toContain("TrailLogsGroup:");
    expect(templateContent).toContain("Type: AWS::Logs::LogGroup");
    expect(templateContent).toContain("TrailRole:");
    expect(templateContent).toContain("Type: AWS::IAM::Role");

    // Trail should monitor S3 data events
    expect(templateContent).toContain("EventSelectors:");
    expect(templateContent).toContain("DataResources:");
    expect(templateContent).toContain("Type: AWS::S3::Object");
    expect(templateContent).toContain("ReadWriteType: All");
  });

  test("template defines required outputs", async () => {
    templateContent =
      templateContent || (await readFile(TEMPLATE_PATH, "utf8"));

    expect(templateContent).toContain("Outputs:");

    // Critical outputs for integration
    const requiredOutputs = [
      "ArtifactBucketNameOut:",
      "ArtifactBucketArn:",
      "CloudTrailLogGroupName:",
      "TrailBucketNameOut:",
    ];

    requiredOutputs.forEach((output) => {
      expect(templateContent).toContain(output);
    });

    // Outputs should have descriptions
    expect(templateContent).toContain("Description: Artifact bucket name");
    expect(templateContent).toContain("Description: Artifact bucket ARN");
  });

  test("template has lifecycle management configured", async () => {
    templateContent =
      templateContent || (await readFile(TEMPLATE_PATH, "utf8"));

    expect(templateContent).toContain("LifecycleConfiguration:");
    expect(templateContent).toContain("Rules:");

    // Should have rules for cleanup and cost optimization
    expect(templateContent).toContain("NonCurrentCleanup");
    expect(templateContent).toContain("Status: Enabled");
    expect(templateContent).toContain("NoncurrentVersionExpiration:");
    expect(templateContent).toContain("NoncurrentDays: 365");

    // Should have transition rules
    expect(templateContent).toContain("TransitionToIA");
    expect(templateContent).toContain("StorageClass: STANDARD_IA");
    expect(templateContent).toContain("TransitionInDays: 30");
  });
});
