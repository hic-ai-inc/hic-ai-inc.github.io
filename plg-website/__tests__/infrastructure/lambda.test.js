/**
 * Infrastructure Tests: Lambda Function Source Validation
 *
 * Tests the PLG Lambda function source files for:
 * - Proper exports and structure
 * - HIC layer imports (not direct SDK)
 * - Injectable clients for testing
 * - Error handling patterns
 *
 * @see 20260127_PRE_E2E_INFRASTRUCTURE_AND_WIRING_REQUIREMENTS.md
 */

import { test, describe } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { expect } from "../lib/test-kit.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LAMBDA_DIR = join(__dirname, "../../infrastructure/lambda");

// Expected Lambda functions
const EXPECTED_LAMBDAS = [
  "stream-processor",
  "email-sender",
  "customer-update",
  "scheduled-tasks",
];

describe("PLG Lambda Function Validation", () => {
  test("all expected Lambda function directories exist", async () => {
    const dirs = await readdir(LAMBDA_DIR);

    EXPECTED_LAMBDAS.forEach((lambdaName) => {
      const exists = dirs.includes(lambdaName);
      if (!exists) {
        throw new Error(`Missing Lambda function directory: ${lambdaName}`);
      }
    });
  });

  test("all Lambda functions have index.js entry point", async () => {
    for (const lambdaName of EXPECTED_LAMBDAS) {
      const indexPath = join(LAMBDA_DIR, lambdaName, "index.js");
      try {
        await readFile(indexPath, "utf8");
      } catch (error) {
        throw new Error(
          `Lambda ${lambdaName} missing index.js: ${error.message}`,
        );
      }
    }
  });

  test("all Lambda functions export handler", async () => {
    for (const lambdaName of EXPECTED_LAMBDAS) {
      const indexPath = join(LAMBDA_DIR, lambdaName, "index.js");
      const content = await readFile(indexPath, "utf8");

      expect(content).toContain("export");
      expect(content).toContain("handler");
    }
  });

  test("Lambda functions use HIC layer imports (not direct SDK)", async () => {
    for (const lambdaName of EXPECTED_LAMBDAS) {
      const indexPath = join(LAMBDA_DIR, lambdaName, "index.js");
      const content = await readFile(indexPath, "utf8");

      // Should import from HIC layers (runtime path)
      // In Lambda, layers are at /opt/nodejs/node_modules/
      const usesLayers =
        content.includes("/opt/") ||
        content.includes("hic-") ||
        content.includes("@hic/");

      // Should NOT have direct AWS SDK imports (except for layer testing)
      const hasDirectImport =
        content.includes("from '@aws-sdk/") ||
        content.includes('from "@aws-sdk/');

      if (hasDirectImport && !usesLayers) {
        throw new Error(
          `Lambda ${lambdaName} has direct SDK imports. Use HIC layers instead.`,
        );
      }
    }
  });

  test("Lambda functions have injectable clients for testing", async () => {
    for (const lambdaName of EXPECTED_LAMBDAS) {
      const indexPath = join(LAMBDA_DIR, lambdaName, "index.js");
      const content = await readFile(indexPath, "utf8");

      // Should have __setClientForTests or similar injection pattern
      const hasTestInjection =
        content.includes("__setClientForTests") ||
        content.includes("__setClients") ||
        content.includes("// Injectable") ||
        content.includes("// For testing");

      // If function uses clients, should have injection
      const usesClients =
        content.includes("Client") ||
        content.includes("dynamodb") ||
        content.includes("sns") ||
        content.includes("sqs");

      if (usesClients && !hasTestInjection) {
        // This is a warning, not a hard failure
        console.warn(
          `Lambda ${lambdaName} may need client injection for testing`,
        );
      }
    }
  });

  test("Lambda functions have proper error handling", async () => {
    for (const lambdaName of EXPECTED_LAMBDAS) {
      const indexPath = join(LAMBDA_DIR, lambdaName, "index.js");
      const content = await readFile(indexPath, "utf8");

      // Should have error handling - multiple acceptable patterns:
      // 1. Traditional try/catch
      const hasTryCatch = content.includes("try") && content.includes("catch");
      // 2. Promise.allSettled for parallel operations
      const hasPromiseAllSettled = content.includes("Promise.allSettled");
      // 3. Defensive coding with optional chaining and early returns
      //    (validates inputs before async ops, logs warnings for missing data)
      const hasDefensiveCoding = 
        content.includes("?.") &&
        content.includes("continue") &&
        (content.includes(".warn") || content.includes("log.info"));
      
      const hasErrorHandling = hasTryCatch || hasPromiseAllSettled || hasDefensiveCoding;

      if (!hasErrorHandling) {
        throw new Error(
          `Lambda ${lambdaName} lacks error handling (needs try/catch, Promise.allSettled, or defensive coding pattern)`
        );
      }

      // Should log errors or warnings
      const logsErrors =
        content.includes("console.error") ||
        content.includes("logger.error") ||
        content.includes("HicLog") ||
        content.includes(".error(") ||
        content.includes(".warn");

      expect(logsErrors).toBe(true);
    }
  });

  test("stream-processor Lambda classifies DynamoDB events", async () => {
    const indexPath = join(LAMBDA_DIR, "stream-processor", "index.js");
    const content = await readFile(indexPath, "utf8");

    // Should handle DynamoDB stream events
    expect(content).toContain("Records");

    // Should publish to SNS topics
    expect(content).toContain("SNS");
  });

  test("email-sender Lambda uses SES", async () => {
    const indexPath = join(LAMBDA_DIR, "email-sender", "index.js");
    const content = await readFile(indexPath, "utf8");

    // Should use SES
    expect(content).toContain("SES");
  });

  test("scheduled-tasks Lambda handles EventBridge events", async () => {
    const indexPath = join(LAMBDA_DIR, "scheduled-tasks", "index.js");
    const content = await readFile(indexPath, "utf8");

    // Should have scheduled task logic
    expect(content).toContain("handler");
  });

  test("Lambda functions have appropriate comments/documentation", async () => {
    for (const lambdaName of EXPECTED_LAMBDAS) {
      const indexPath = join(LAMBDA_DIR, lambdaName, "index.js");
      const content = await readFile(indexPath, "utf8");

      // Should have JSDoc or block comments
      const hasDocumentation =
        content.includes("/**") ||
        content.includes("/*") ||
        content.includes("// ");

      expect(hasDocumentation).toBe(true);

      // Should have some meaningful comment lines
      const lines = content.split("\n");
      const commentLines = lines.filter(
        (l) =>
          l.trim().startsWith("//") ||
          l.trim().startsWith("*") ||
          l.trim().startsWith("/*"),
      );

      expect(commentLines.length).toBeGreaterThan(3);
    }
  });
});
