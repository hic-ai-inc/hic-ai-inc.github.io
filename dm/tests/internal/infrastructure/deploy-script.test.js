/**
 * Infrastructure Tests: Deploy Script Validation
 * Tests the deploy.sh deployment script
 */

import { test, describe } from "node:test";
import { readFile, access, constants } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { expect } from "../../../facade/test-helpers/expect.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEPLOY_SCRIPT_PATH = join(__dirname, "../../../infrastructure/deploy.sh");

describe("Deploy Script Validation", () => {
  let scriptContent;

  test("deploy script exists and is readable", async () => {
    try {
      await access(DEPLOY_SCRIPT_PATH, constants.F_OK | constants.R_OK);
      scriptContent = await readFile(DEPLOY_SCRIPT_PATH, "utf8");
      expect(scriptContent).toBeTruthy();
      expect(scriptContent.length).toBeGreaterThan(0);
    } catch (error) {
      throw new Error(`Deploy script not accessible: ${error.message}`);
    }
  });

  test("script has proper bash shebang and error handling", async () => {
    scriptContent =
      scriptContent || (await readFile(DEPLOY_SCRIPT_PATH, "utf8"));

    // Should start with bash shebang
    expect(scriptContent).toContain("#!/bin/bash");

    // Should have error handling for deployment safety
    expect(scriptContent).toContain("set -euo pipefail");
  });

  test("script defines required deployment variables", async () => {
    scriptContent =
      scriptContent || (await readFile(DEPLOY_SCRIPT_PATH, "utf8"));

    // Core deployment configuration
    const requiredVariables = [
      "STACK_NAME",
      "TEMPLATE_FILE",
      "REGION",
      "ARTIFACT_BUCKET_NAME",
      "TRAIL_BUCKET_NAME",
    ];

    requiredVariables.forEach((variable) => {
      expect(scriptContent).toContain(variable);
    });

    // Specific values for HIC DM
    expect(scriptContent).toContain("hic-dm-layer-artifacts");
    expect(scriptContent).toContain(
      "lambda-layer-artifact-repository-stack.yaml"
    );
    expect(scriptContent).toContain("us-east-1");
  });

  test("script uses AWS CloudFormation deploy command", async () => {
    scriptContent =
      scriptContent || (await readFile(DEPLOY_SCRIPT_PATH, "utf8"));

    // Must use AWS CLI with CloudFormation
    expect(scriptContent).toContain("aws cloudformation deploy");

    // Required CloudFormation deploy parameters
    const requiredFlags = [
      "--stack-name",
      "--template-file",
      "--capabilities",
      "--region",
      "--parameter-overrides",
    ];

    requiredFlags.forEach((flag) => {
      expect(scriptContent).toContain(flag);
    });

    // Must have IAM capability for CloudTrail role
    expect(scriptContent).toContain("CAPABILITY_NAMED_IAM");
  });

  test("script passes all required CloudFormation parameters", async () => {
    scriptContent =
      scriptContent || (await readFile(DEPLOY_SCRIPT_PATH, "utf8"));

    // All template parameters should be passed
    const requiredParameters = [
      "ArtifactBucketName",
      "TrailBucketName",
      "CloudWatchLogRetentionDays",
      "TrailName",
    ];

    requiredParameters.forEach((param) => {
      expect(scriptContent).toContain(param);
    });
  });

  test("script allows environment variable overrides", async () => {
    scriptContent =
      scriptContent || (await readFile(DEPLOY_SCRIPT_PATH, "utf8"));

    // Should support environment variable overrides for flexibility
    expect(scriptContent).toContain("${ARTIFACT_BUCKET_NAME:-");
    expect(scriptContent).toContain("${TRAIL_BUCKET_NAME:-");
    expect(scriptContent).toContain("${CloudWatchRetentionDays:-");
    expect(scriptContent).toContain("${TrailName:-");
  });

  test("script provides user feedback", async () => {
    scriptContent =
      scriptContent || (await readFile(DEPLOY_SCRIPT_PATH, "utf8"));

    // Should provide deployment status messages
    expect(scriptContent).toContain("echo");
    expect(scriptContent).toContain("Deploying");
    expect(scriptContent).toContain("Deployment complete");

    // Should use emoji or clear indicators
    const hasVisualFeedback =
      scriptContent.includes("🚀") ||
      scriptContent.includes("✅") ||
      scriptContent.includes("Deploying") ||
      scriptContent.includes("complete");
    expect(hasVisualFeedback).toBe(true);
  });

  test("script has safe default values", async () => {
    scriptContent =
      scriptContent || (await readFile(DEPLOY_SCRIPT_PATH, "utf8"));

    // Default values should be reasonable
    expect(scriptContent).toContain("90"); // CloudWatch retention days
    expect(scriptContent).toContain("hic-dm-artifact-trail"); // Trail name

    // Bucket names should include region for uniqueness
    expect(scriptContent).toContain("${REGION}");
    expect(scriptContent).toContain("hic-dm-artifacts-");
    expect(scriptContent).toContain("hic-dm-cloudtrail-");
  });

  test("script structure is logical and maintainable", async () => {
    scriptContent =
      scriptContent || (await readFile(DEPLOY_SCRIPT_PATH, "utf8"));

    const lines = scriptContent.split("\n");

    // Should have reasonable minimum complexity (not too trivial)
    expect(lines.length).toBeGreaterThan(15);

    // Should have comments explaining key sections
    const commentLines = lines.filter((line) => line.trim().startsWith("#"));
    expect(commentLines.length).toBeGreaterThan(0);

    // Should not have obvious syntax errors (basic check)
    const hasUnmatchedQuotes =
      (scriptContent.match(/"/g) || []).length % 2 !== 0;
    expect(hasUnmatchedQuotes).toBe(false);
  });
});
