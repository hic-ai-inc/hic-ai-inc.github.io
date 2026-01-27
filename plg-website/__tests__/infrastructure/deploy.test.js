/**
 * Infrastructure Tests: Deploy Script Validation
 *
 * Tests the PLG deploy.sh deployment script for:
 * - Proper bash structure and error handling
 * - Required deployment variables and functions
 * - AWS CloudFormation integration
 * - Dry-run support
 * - Layer ARN discovery
 *
 * @see 20260127_PRE_E2E_INFRASTRUCTURE_AND_WIRING_REQUIREMENTS.md
 */

import { test, describe } from "node:test";
import { readFile, access, constants } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { expect } from "../lib/test-kit.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEPLOY_SCRIPT_PATH = join(__dirname, "../../infrastructure/deploy.sh");

describe("PLG Deploy Script Validation", () => {
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

    // Should have strict error handling for deployment safety
    expect(scriptContent).toContain("set -euo pipefail");
  });

  test("script defines required deployment variables", async () => {
    scriptContent =
      scriptContent || (await readFile(DEPLOY_SCRIPT_PATH, "utf8"));

    // Core deployment configuration
    const requiredVariables = [
      "STACK_NAME",
      "TEMPLATES_BUCKET",
      "TEMPLATES_DIR",
      "PARAMS_DIR",
      "REGION",
      "ENVIRONMENT",
    ];

    requiredVariables.forEach((variable) => {
      expect(scriptContent).toContain(variable);
    });

    // PLG-specific naming
    expect(scriptContent).toContain("hic-plg");
    expect(scriptContent).toContain("us-east-1");
  });

  test("script supports all three environments", async () => {
    scriptContent =
      scriptContent || (await readFile(DEPLOY_SCRIPT_PATH, "utf8"));

    // Environment validation
    expect(scriptContent).toContain("dev");
    expect(scriptContent).toContain("staging");
    expect(scriptContent).toContain("prod");

    // Should validate environment
    expect(scriptContent).toMatch(/dev\|staging\|prod/);
  });

  test("script has dry-run support", async () => {
    scriptContent =
      scriptContent || (await readFile(DEPLOY_SCRIPT_PATH, "utf8"));

    // Dry-run flag
    expect(scriptContent).toContain("--dry-run");
    expect(scriptContent).toContain("DRY_RUN");

    // Should mention "DRY RUN" in output
    expect(scriptContent).toContain("DRY RUN");
  });

  test("script validates AWS credentials", async () => {
    scriptContent =
      scriptContent || (await readFile(DEPLOY_SCRIPT_PATH, "utf8"));

    // Should check AWS credentials
    expect(scriptContent).toContain("aws sts get-caller-identity");

    // Should retrieve account ID
    expect(scriptContent).toContain("ACCOUNT_ID");
  });

  test("script validates CloudFormation templates", async () => {
    scriptContent =
      scriptContent || (await readFile(DEPLOY_SCRIPT_PATH, "utf8"));

    // Should validate templates before deployment
    expect(scriptContent).toContain("aws cloudformation validate-template");
  });

  test("script uses change sets for safe deployment", async () => {
    scriptContent =
      scriptContent || (await readFile(DEPLOY_SCRIPT_PATH, "utf8"));

    // Should use change sets (not direct deploy)
    expect(scriptContent).toContain("create-change-set");
    expect(scriptContent).toContain("describe-change-set");
    expect(scriptContent).toContain("execute-change-set");

    // Should wait for completion
    expect(scriptContent).toContain("stack-create-complete");
    expect(scriptContent).toContain("stack-update-complete");
  });

  test("script has proper IAM capabilities", async () => {
    scriptContent =
      scriptContent || (await readFile(DEPLOY_SCRIPT_PATH, "utf8"));

    // Required capabilities for nested stacks with IAM
    expect(scriptContent).toContain("CAPABILITY_NAMED_IAM");
    expect(scriptContent).toContain("CAPABILITY_AUTO_EXPAND");
  });

  test("script retrieves Lambda layer ARNs", async () => {
    scriptContent =
      scriptContent || (await readFile(DEPLOY_SCRIPT_PATH, "utf8"));

    // Should retrieve all 5 HIC layers
    const requiredLayers = [
      "hic-base-layer",
      "hic-messaging-layer",
      "hic-dynamodb-layer",
      "hic-ses-layer",
      "hic-config-layer",
    ];

    requiredLayers.forEach((layer) => {
      expect(scriptContent).toContain(layer);
    });

    // Should use aws lambda list-layer-versions
    expect(scriptContent).toContain("list-layer-versions");
  });

  test("script validates missing layers", async () => {
    scriptContent =
      scriptContent || (await readFile(DEPLOY_SCRIPT_PATH, "utf8"));

    // Should check for missing layers
    expect(scriptContent).toContain("MISSING_LAYERS");

    // Should provide helpful error message
    expect(scriptContent).toContain("Deploy HIC layers first");
  });

  test("script has production confirmation prompt", async () => {
    scriptContent =
      scriptContent || (await readFile(DEPLOY_SCRIPT_PATH, "utf8"));

    // Should require confirmation for production
    expect(scriptContent).toContain("PRODUCTION");

    // Should ask for explicit confirmation
    expect(scriptContent).toContain("Type 'yes' to confirm");
  });

  test("script provides visual feedback", async () => {
    scriptContent =
      scriptContent || (await readFile(DEPLOY_SCRIPT_PATH, "utf8"));

    // Should have echo statements for progress
    expect(scriptContent).toContain("echo");

    // Should use colors or emojis
    const hasVisualFeedback =
      scriptContent.includes("🚀") ||
      scriptContent.includes("✅") ||
      scriptContent.includes("❌") ||
      scriptContent.includes("GREEN") ||
      scriptContent.includes("RED");
    expect(hasVisualFeedback).toBe(true);
  });

  test("script uses jq for parameter manipulation", async () => {
    scriptContent =
      scriptContent || (await readFile(DEPLOY_SCRIPT_PATH, "utf8"));

    // Should use jq to merge layer ARNs into parameters
    expect(scriptContent).toContain("jq");

    // Should create temp file for merged params
    expect(scriptContent).toContain("mktemp");
    expect(scriptContent).toContain("trap");
  });

  test("script has help option", async () => {
    scriptContent =
      scriptContent || (await readFile(DEPLOY_SCRIPT_PATH, "utf8"));

    // Should support --help
    expect(scriptContent).toContain("--help");
    expect(scriptContent).toContain("show_help");
  });

  test("script displays stack outputs after deployment", async () => {
    scriptContent =
      scriptContent || (await readFile(DEPLOY_SCRIPT_PATH, "utf8"));

    // Should show stack outputs
    expect(scriptContent).toContain("describe-stacks");
    expect(scriptContent).toContain("Outputs");

    // Should provide next steps
    expect(scriptContent).toContain("Next steps");
  });

  test("script structure is well-organized", async () => {
    scriptContent =
      scriptContent || (await readFile(DEPLOY_SCRIPT_PATH, "utf8"));

    const lines = scriptContent.split("\n");

    // Should have substantial complexity (PLG is more complex than DM)
    expect(lines.length).toBeGreaterThan(300);

    // Should have section headers
    expect(scriptContent).toContain("# ─");

    // Should have comments
    const commentLines = lines.filter((line) => line.trim().startsWith("#"));
    expect(commentLines.length).toBeGreaterThan(20);
  });
});
