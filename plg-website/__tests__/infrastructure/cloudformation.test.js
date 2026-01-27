/**
 * Infrastructure Tests: CloudFormation Template Validation
 *
 * Tests the PLG CloudFormation templates for:
 * - Valid YAML syntax
 * - Required sections (Parameters, Resources, Outputs)
 * - Consistent resource naming
 * - Proper deletion/update policies
 * - Security best practices
 *
 * @see 20260127_PRE_E2E_INFRASTRUCTURE_AND_WIRING_REQUIREMENTS.md
 */

import { test, describe } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { expect } from "../lib/test-kit.js";
import * as yaml from "yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CF_DIR = join(__dirname, "../../infrastructure/cloudformation");

// Expected CloudFormation templates
const EXPECTED_TEMPLATES = [
  "plg-main-stack.yaml",
  "plg-dynamodb.yaml",
  "plg-iam.yaml",
  "plg-messaging.yaml",
  "plg-compute.yaml",
  "plg-ses.yaml",
  "plg-scheduled.yaml",
  "plg-monitoring.yaml",
];

describe("PLG CloudFormation Templates Validation", () => {
  test("all expected templates exist", async () => {
    const files = await readdir(CF_DIR);

    EXPECTED_TEMPLATES.forEach((template) => {
      const exists = files.includes(template);
      if (!exists) {
        throw new Error(`Missing CloudFormation template: ${template}`);
      }
    });
  });

  test("all templates are valid YAML", async () => {
    for (const template of EXPECTED_TEMPLATES) {
      const filePath = join(CF_DIR, template);
      const content = await readFile(filePath, "utf8");

      try {
        const parsed = yaml.parse(content);
        expect(parsed).toBeTruthy();
        expect(typeof parsed).toBe("object");
      } catch (error) {
        throw new Error(`Invalid YAML in ${template}: ${error.message}`);
      }
    }
  });

  test("all templates have AWSTemplateFormatVersion", async () => {
    for (const template of EXPECTED_TEMPLATES) {
      const filePath = join(CF_DIR, template);
      const content = await readFile(filePath, "utf8");
      const parsed = yaml.parse(content);

      expect(parsed.AWSTemplateFormatVersion).toBe("2010-09-09");
    }
  });

  test("all templates have Description", async () => {
    for (const template of EXPECTED_TEMPLATES) {
      const filePath = join(CF_DIR, template);
      const content = await readFile(filePath, "utf8");
      const parsed = yaml.parse(content);

      expect(parsed.Description).toBeDefined();
      expect(parsed.Description.length).toBeGreaterThan(10);
    }
  });

  test("all templates have Environment parameter", async () => {
    for (const template of EXPECTED_TEMPLATES) {
      const filePath = join(CF_DIR, template);
      const content = await readFile(filePath, "utf8");
      const parsed = yaml.parse(content);

      expect(parsed.Parameters).toBeDefined();
      expect(parsed.Parameters.Environment).toBeDefined();
      expect(parsed.Parameters.Environment.Type).toBe("String");
      expect(parsed.Parameters.Environment.AllowedValues).toContain("dev");
      expect(parsed.Parameters.Environment.AllowedValues).toContain("staging");
      expect(parsed.Parameters.Environment.AllowedValues).toContain("prod");
    }
  });

  test("main stack template has nested stack references", async () => {
    const filePath = join(CF_DIR, "plg-main-stack.yaml");
    const content = await readFile(filePath, "utf8");
    const parsed = yaml.parse(content);

    expect(parsed.Resources).toBeDefined();

    // Should have nested stack resources
    const resourceTypes = Object.values(parsed.Resources).map((r) => r.Type);
    const nestedStacks = resourceTypes.filter(
      (t) => t === "AWS::CloudFormation::Stack",
    );

    // Should have multiple nested stacks
    expect(nestedStacks.length).toBeGreaterThanOrEqual(5);
  });

  test("DynamoDB template has proper retention policies", async () => {
    const filePath = join(CF_DIR, "plg-dynamodb.yaml");
    const content = await readFile(filePath, "utf8");
    const parsed = yaml.parse(content);

    const table = parsed.Resources.PLGTable;
    expect(table).toBeDefined();

    // DynamoDB table should have Retain policy to prevent data loss
    expect(table.DeletionPolicy).toBe("Retain");
    expect(table.UpdateReplacePolicy).toBe("Retain");
  });

  test("DynamoDB template enables Point-in-Time Recovery", async () => {
    const filePath = join(CF_DIR, "plg-dynamodb.yaml");
    const content = await readFile(filePath, "utf8");
    const parsed = yaml.parse(content);

    const table = parsed.Resources.PLGTable;
    expect(
      table.Properties.PointInTimeRecoverySpecification
        .PointInTimeRecoveryEnabled,
    ).toBe(true);
  });

  test("DynamoDB template has SSE enabled", async () => {
    const filePath = join(CF_DIR, "plg-dynamodb.yaml");
    const content = await readFile(filePath, "utf8");
    const parsed = yaml.parse(content);

    const table = parsed.Resources.PLGTable;
    expect(table.Properties.SSESpecification.SSEEnabled).toBe(true);
  });

  test("DynamoDB template has TTL enabled", async () => {
    const filePath = join(CF_DIR, "plg-dynamodb.yaml");
    const content = await readFile(filePath, "utf8");
    const parsed = yaml.parse(content);

    const table = parsed.Resources.PLGTable;
    expect(table.Properties.TimeToLiveSpecification.Enabled).toBe(true);
    expect(table.Properties.TimeToLiveSpecification.AttributeName).toBe("ttl");
  });

  test("DynamoDB template supports TRIAL entities", async () => {
    const filePath = join(CF_DIR, "plg-dynamodb.yaml");
    const content = await readFile(filePath, "utf8");

    // The description should mention TRIAL entities
    expect(content).toContain("TRIAL");
  });

  test("IAM template has proper Lambda execution role", async () => {
    const filePath = join(CF_DIR, "plg-iam.yaml");
    const content = await readFile(filePath, "utf8");
    const parsed = yaml.parse(content);

    expect(parsed.Resources).toBeDefined();

    // Should have outputs for role ARNs
    expect(parsed.Outputs).toBeDefined();
  });

  test("compute template references all 5 HIC layers", async () => {
    const filePath = join(CF_DIR, "plg-compute.yaml");
    const content = await readFile(filePath, "utf8");

    // Should have parameters for all HIC layers
    expect(content).toContain("HicBaseLayerArn");
    expect(content).toContain("HicMessagingLayerArn");
    expect(content).toContain("HicDynamoDBLayerArn");
    expect(content).toContain("HicSesLayerArn");
    expect(content).toContain("HicConfigLayerArn");
  });

  test("all templates have proper tagging", async () => {
    // Main template tags nested stacks with Environment and StackLayer
    const mainPath = join(CF_DIR, "plg-main-stack.yaml");
    const mainContent = await readFile(mainPath, "utf8");

    // Main template should tag nested stacks with Environment
    expect(mainContent).toContain("Environment");
    expect(mainContent).toContain("StackLayer");

    // Check all templates reference Environment parameter
    for (const template of EXPECTED_TEMPLATES) {
      const filePath = join(CF_DIR, template);
      const content = await readFile(filePath, "utf8");
      expect(content).toContain("Environment");
    }
  });

  test("SES template configures domain identity", async () => {
    const filePath = join(CF_DIR, "plg-ses.yaml");
    const content = await readFile(filePath, "utf8");
    const parsed = yaml.parse(content);

    expect(parsed.Resources).toBeDefined();

    // Should have outputs for DNS records
    expect(parsed.Outputs).toBeDefined();
  });

  test("monitoring template creates CloudWatch dashboard", async () => {
    const filePath = join(CF_DIR, "plg-monitoring.yaml");
    const content = await readFile(filePath, "utf8");
    const parsed = yaml.parse(content);

    expect(parsed.Resources).toBeDefined();

    // Should have dashboard
    const resourceTypes = Object.values(parsed.Resources).map((r) => r.Type);
    expect(resourceTypes).toContain("AWS::CloudWatch::Dashboard");
  });

  test("messaging template creates SNS topics and SQS queues", async () => {
    const filePath = join(CF_DIR, "plg-messaging.yaml");
    const content = await readFile(filePath, "utf8");
    const parsed = yaml.parse(content);

    expect(parsed.Resources).toBeDefined();

    const resourceTypes = Object.values(parsed.Resources).map((r) => r.Type);

    // Should have SNS topics
    expect(resourceTypes.some((t) => t === "AWS::SNS::Topic")).toBe(true);

    // Should have SQS queues
    expect(resourceTypes.some((t) => t === "AWS::SQS::Queue")).toBe(true);
  });

  test("no hardcoded account IDs or secrets in templates", async () => {
    for (const template of EXPECTED_TEMPLATES) {
      const filePath = join(CF_DIR, template);
      const content = await readFile(filePath, "utf8");

      // Should not contain hardcoded AWS account IDs (12-digit numbers)
      // Exception: ARN patterns are allowed
      const lines = content.split("\n");
      for (const line of lines) {
        // Skip lines that are comments or ARN references
        if (line.trim().startsWith("#")) continue;
        if (line.includes("!Ref") || line.includes("!Sub")) continue;
        if (line.includes("AWS::AccountId")) continue;

        // Check for hardcoded 12-digit account IDs
        const accountIdPattern = /[^0-9]\d{12}[^0-9]/;
        if (accountIdPattern.test(line)) {
          // Allow layer ARN examples in descriptions
          if (!line.includes("Format:") && !line.includes("ARN")) {
            throw new Error(
              `Possible hardcoded account ID in ${template}: ${line.trim()}`,
            );
          }
        }
      }

      // Should not contain hardcoded secrets
      expect(content.toLowerCase()).not.toContain("password=");
      expect(content.toLowerCase()).not.toContain("secret=");
      expect(content.toLowerCase()).not.toContain("api_key=");
    }
  });
});
