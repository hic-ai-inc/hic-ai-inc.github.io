/**
 * Infrastructure Tests: Parameter File Validation
 *
 * Tests the PLG parameter files (dev.json, staging.json, prod.json) for:
 * - Proper JSON structure
 * - Consistent parameter keys across environments
 * - Required parameters present
 * - Environment-specific values
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

const PARAMS_DIR = join(__dirname, "../../infrastructure/parameters");

const ENVIRONMENTS = ["dev", "staging", "prod"];

// Required parameters that must be in ALL environment files
const REQUIRED_PARAMETERS = [
  "Environment",
  "TemplatesBucket",
  "EmailDomain",
  "AlertEmail",
  "LambdaCodeBucket",
  "LambdaCodePrefix",
  "VpcSubnetIds",
  "VpcSecurityGroupIds",
];

describe("PLG Parameter Files Validation", () => {
  const parametersByEnv = {};

  test("all environment parameter files exist", async () => {
    for (const env of ENVIRONMENTS) {
      const filePath = join(PARAMS_DIR, `${env}.json`);
      try {
        await access(filePath, constants.F_OK | constants.R_OK);
      } catch (error) {
        throw new Error(`Parameter file missing: ${env}.json`);
      }
    }
  });

  test("all parameter files are valid JSON", async () => {
    for (const env of ENVIRONMENTS) {
      const filePath = join(PARAMS_DIR, `${env}.json`);
      const content = await readFile(filePath, "utf8");

      try {
        const parsed = JSON.parse(content);
        parametersByEnv[env] = parsed;
        expect(Array.isArray(parsed)).toBe(true);
      } catch (error) {
        throw new Error(`Invalid JSON in ${env}.json: ${error.message}`);
      }
    }
  });

  test("parameter files use CloudFormation parameter format", async () => {
    for (const env of ENVIRONMENTS) {
      const filePath = join(PARAMS_DIR, `${env}.json`);
      const content = await readFile(filePath, "utf8");
      const params = JSON.parse(content);

      params.forEach((param, index) => {
        expect(param).toHaveProperty("ParameterKey");
        expect(param).toHaveProperty("ParameterValue");
        expect(typeof param.ParameterKey).toBe("string");
        expect(typeof param.ParameterValue).toBe("string");
      });
    }
  });

  test("all required parameters are present in each environment", async () => {
    for (const env of ENVIRONMENTS) {
      const filePath = join(PARAMS_DIR, `${env}.json`);
      const content = await readFile(filePath, "utf8");
      const params = JSON.parse(content);

      const paramKeys = params.map((p) => p.ParameterKey);

      REQUIRED_PARAMETERS.forEach((required) => {
        const hasParam = paramKeys.includes(required);
        if (!hasParam) {
          throw new Error(
            `Missing required parameter '${required}' in ${env}.json`,
          );
        }
      });
    }
  });

  test("parameter keys are consistent across all environments", async () => {
    const keysByEnv = {};

    for (const env of ENVIRONMENTS) {
      const filePath = join(PARAMS_DIR, `${env}.json`);
      const content = await readFile(filePath, "utf8");
      const params = JSON.parse(content);
      keysByEnv[env] = params.map((p) => p.ParameterKey).sort();
    }

    // All environments should have the same parameter keys
    const devKeys = keysByEnv.dev;
    const stagingKeys = keysByEnv.staging;
    const prodKeys = keysByEnv.prod;

    expect(devKeys).toEqual(stagingKeys);
    expect(stagingKeys).toEqual(prodKeys);
  });

  test("Environment parameter matches filename", async () => {
    for (const env of ENVIRONMENTS) {
      const filePath = join(PARAMS_DIR, `${env}.json`);
      const content = await readFile(filePath, "utf8");
      const params = JSON.parse(content);

      const envParam = params.find((p) => p.ParameterKey === "Environment");
      expect(envParam).toBeDefined();
      expect(envParam.ParameterValue).toBe(env);
    }
  });

  test("TemplatesBucket follows naming convention", async () => {
    for (const env of ENVIRONMENTS) {
      const filePath = join(PARAMS_DIR, `${env}.json`);
      const content = await readFile(filePath, "utf8");
      const params = JSON.parse(content);

      const bucket = params.find((p) => p.ParameterKey === "TemplatesBucket");
      expect(bucket).toBeDefined();

      // Should be hic-plg-templates-{env}
      expect(bucket.ParameterValue).toBe(`hic-plg-templates-${env}`);
    }
  });

  test("LambdaCodeBucket follows naming convention", async () => {
    for (const env of ENVIRONMENTS) {
      const filePath = join(PARAMS_DIR, `${env}.json`);
      const content = await readFile(filePath, "utf8");
      const params = JSON.parse(content);

      const bucket = params.find((p) => p.ParameterKey === "LambdaCodeBucket");
      expect(bucket).toBeDefined();

      // Should be hic-plg-lambda-{env}
      expect(bucket.ParameterValue).toBe(`hic-plg-lambda-${env}`);
    }
  });

  test("EmailDomain is consistent across environments", async () => {
    const domains = [];

    for (const env of ENVIRONMENTS) {
      const filePath = join(PARAMS_DIR, `${env}.json`);
      const content = await readFile(filePath, "utf8");
      const params = JSON.parse(content);

      const domain = params.find((p) => p.ParameterKey === "EmailDomain");
      domains.push(domain.ParameterValue);
    }

    // All environments should use the same email domain
    expect(domains[0]).toBe(domains[1]);
    expect(domains[1]).toBe(domains[2]);
    expect(domains[0]).toBe("hic-ai.com");
  });

  test("prod AlertEmail differs from dev/staging", async () => {
    const alertEmails = {};

    for (const env of ENVIRONMENTS) {
      const filePath = join(PARAMS_DIR, `${env}.json`);
      const content = await readFile(filePath, "utf8");
      const params = JSON.parse(content);

      const alert = params.find((p) => p.ParameterKey === "AlertEmail");
      alertEmails[env] = alert.ParameterValue;
    }

    // Dev and staging can use personal email
    expect(alertEmails.dev).toContain("@");
    expect(alertEmails.staging).toContain("@");

    // Prod should use alerts@ (team distribution)
    expect(alertEmails.prod).toBe("alerts@hic-ai.com");
  });

  test("VPC settings allow empty values for no-VPC deployment", async () => {
    for (const env of ENVIRONMENTS) {
      const filePath = join(PARAMS_DIR, `${env}.json`);
      const content = await readFile(filePath, "utf8");
      const params = JSON.parse(content);

      const vpcSubnets = params.find((p) => p.ParameterKey === "VpcSubnetIds");
      const vpcSGs = params.find(
        (p) => p.ParameterKey === "VpcSecurityGroupIds",
      );

      expect(vpcSubnets).toBeDefined();
      expect(vpcSGs).toBeDefined();

      // Empty string is valid (means no VPC)
      expect(typeof vpcSubnets.ParameterValue).toBe("string");
      expect(typeof vpcSGs.ParameterValue).toBe("string");
    }
  });

  test("no duplicate parameter keys in any file", async () => {
    for (const env of ENVIRONMENTS) {
      const filePath = join(PARAMS_DIR, `${env}.json`);
      const content = await readFile(filePath, "utf8");
      const params = JSON.parse(content);

      const keys = params.map((p) => p.ParameterKey);
      const uniqueKeys = new Set(keys);

      if (keys.length !== uniqueKeys.size) {
        const duplicates = keys.filter((key, i) => keys.indexOf(key) !== i);
        throw new Error(
          `Duplicate parameter keys in ${env}.json: ${duplicates.join(", ")}`,
        );
      }
    }
  });
});
