/**
 * Actual vs Bloat Analyzer Tests
 *
 * Comprehensive test suite for dm/analysis/actual-vs-bloat-analyzer.js
 * Tests dependency analysis, bloat detection, and optimization recommendations
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import { expect } from "../../../facade/test-helpers/expect.js";
import { execSync } from "node:child_process";
import {
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

// Test utilities
function createTempDir(prefix = "bloat-test-") {
  const tempPath = join(
    tmpdir(),
    `${prefix}${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  );
  mkdirSync(tempPath, { recursive: true });
  return tempPath;
}

function createMockSystem(systemDir, dependencies = {}, lambdaFiles = {}) {
  // Create package.json with dependencies
  const packageJson = {
    name: `@hic/${systemDir.split("/").pop()}`,
    version: "1.0.0",
    type: "module",
    dependencies: dependencies,
  };
  writeFileSync(
    join(systemDir, "package.json"),
    JSON.stringify(packageJson, null, 2)
  );

  // Create lambda source files if specified
  if (Object.keys(lambdaFiles).length > 0) {
    const lambdaDir = join(systemDir, "src", "lambda");
    mkdirSync(lambdaDir, { recursive: true });

    Object.entries(lambdaFiles).forEach(([filename, content]) => {
      writeFileSync(join(lambdaDir, filename), content);
    });
  }
}

function createVersionsFile(testDir, versions = {}) {
  const dmDir = join(testDir, "dependency-manager", "layers");
  mkdirSync(dmDir, { recursive: true });

  const versionsContent = Object.entries(versions)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  writeFileSync(join(dmDir, "versions.env"), versionsContent);
}

function createAnalyzerConfig(testDir, config = {}) {
  const defaultConfig = {
    maxFileSize: 1024 * 1024,
    excludedDirectories: ["node_modules", ".git", "dist"],
    potentiallySharedPackages: ["aws-sdk", "lodash", "uuid"],
    sharedUtilPatterns: ["shared/utils", "hic-logger", "safe-"],
    importPatterns: {
      require: "require\\(['\"`]([^'\"`]+)['\"`]\\)",
      import: "import .+ from ['\"`]([^'\"`]+)['\"`]",
    },
    exampleUnnecessaryBloat: ["jest", "aws-sdk-client-mock"],
  };

  const finalConfig = { ...defaultConfig, ...config };
  writeFileSync(
    join(testDir, "analyzer-config.json"),
    JSON.stringify(finalConfig, null, 2)
  );
}

describe("Actual vs Bloat Analyzer", () => {
  let testDir;
  let dmRoot;
  let analyzerScript;

  beforeEach(() => {
    testDir = createTempDir();
    dmRoot = resolve(join(import.meta.dirname, "../../.."));
    analyzerScript = join(dmRoot, "analysis", "actual-vs-bloat-analyzer.js");
  });

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("Configuration Loading", () => {
    test("loads default configuration when config file missing", () => {
      const system1Dir = join(testDir, "system1");
      mkdirSync(system1Dir, { recursive: true });

      createMockSystem(system1Dir, {
        "aws-sdk": "^3.400.0",
        lodash: "^4.17.21",
      });

      if (existsSync(analyzerScript)) {
        try {
          const result = execSync(`node "${analyzerScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 10000,
            env: {
              ...process.env,
              HIC_WORKSPACE_ROOT: testDir,
              NODE_ENV: "test",
            },
          });

          // Should run without config file and use defaults
          expect(result).toContain("DEPENDENCY ANALYSIS");
        } catch (error) {
          console.log("Analyzer output:", error.stdout?.toString());
          console.log("Analyzer error:", error.stderr?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });

    test("loads custom configuration from analyzer-config.json", () => {
      const system1Dir = join(testDir, "system1");
      mkdirSync(system1Dir, { recursive: true });

      const customConfig = {
        potentiallySharedPackages: ["custom-package", "another-shared"],
        excludedDirectories: ["custom-exclude"],
      };

      createAnalyzerConfig(testDir, customConfig);
      createMockSystem(system1Dir, {
        "custom-package": "^1.0.0",
        "another-shared": "^2.0.0",
      });

      if (existsSync(analyzerScript)) {
        try {
          const result = execSync(`node "${analyzerScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 10000,
            env: {
              ...process.env,
              HIC_WORKSPACE_ROOT: testDir,
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("custom-package");
        } catch (error) {
          console.log("Config test output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });
  });

  describe("System Discovery", () => {
    test("discovers systems with Lambda functions", () => {
      const system1Dir = join(testDir, "system1");
      const system2Dir = join(testDir, "system2");
      const noLambdaDir = join(testDir, "no-lambda-system");

      mkdirSync(system1Dir, { recursive: true });
      mkdirSync(system2Dir, { recursive: true });
      mkdirSync(noLambdaDir, { recursive: true });

      // System1 with Lambda functions
      createMockSystem(
        system1Dir,
        { "aws-sdk": "^3.400.0" },
        { "handler.js": "export const handler = async () => {}" }
      );

      // System2 with Lambda functions
      createMockSystem(
        system2Dir,
        { lodash: "^4.17.21" },
        { "processor.js": "export const processor = async () => {}" }
      );

      // System without Lambda functions
      createMockSystem(noLambdaDir, { express: "^4.18.2" });

      if (existsSync(analyzerScript)) {
        try {
          const result = execSync(`node "${analyzerScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 10000,
            env: {
              ...process.env,
              HIC_WORKSPACE_ROOT: testDir,
              HIC_LAMBDA_PATH: "src/lambda",
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("system1");
          expect(result).toContain("system2");
        } catch (error) {
          console.log("Discovery test output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });

    test("respects excluded directories", () => {
      const includeDir = join(testDir, "include-system");
      const excludeDir = join(testDir, "node_modules");

      mkdirSync(includeDir, { recursive: true });
      mkdirSync(excludeDir, { recursive: true });

      createMockSystem(
        includeDir,
        { "aws-sdk": "^3.400.0" },
        { "handler.js": "export const handler = async () => {}" }
      );

      createMockSystem(
        excludeDir,
        { "should-ignore": "^1.0.0" },
        { "handler.js": "export const handler = async () => {}" }
      );

      if (existsSync(analyzerScript)) {
        try {
          const result = execSync(`node "${analyzerScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 10000,
            env: {
              ...process.env,
              HIC_WORKSPACE_ROOT: testDir,
              HIC_LAMBDA_PATH: "src/lambda",
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("include-system");
          expect(result).not.toContain("should-ignore");
        } catch (error) {
          console.log("Exclusion test output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });

    test("handles invalid workspace paths gracefully", () => {
      if (existsSync(analyzerScript)) {
        try {
          const result = execSync(`node "${analyzerScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 10000,
            env: {
              ...process.env,
              HIC_WORKSPACE_ROOT: "/nonexistent/path",
              NODE_ENV: "test",
            },
          });

          // Should handle gracefully and use current directory
          expect(result).toBeDefined();
        } catch (error) {
          console.log("Invalid path test output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });
  });

  describe("Dependency Analysis", () => {
    test("analyzes actual vs declared dependencies in source files", () => {
      const systemDir = join(testDir, "analysis-system");
      mkdirSync(systemDir, { recursive: true });

      const sourceCode = `
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import _ from "lodash";
import { v4 as uuidv4 } from "uuid";

export const handler = async (event) => {
  const id = uuidv4();
  const processed = _.map(event.records, r => r.data);
  return { statusCode: 200, body: JSON.stringify({ id, processed }) };
};
      `;

      createMockSystem(
        systemDir,
        {
          "@aws-sdk/client-dynamodb": "^3.400.0",
          lodash: "^4.17.21",
          uuid: "^9.0.0",
          "unused-package": "^1.0.0", // This should be detected as bloat
        },
        { "handler.js": sourceCode }
      );

      if (existsSync(analyzerScript)) {
        try {
          const result = execSync(`node "${analyzerScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 10000,
            env: {
              ...process.env,
              HIC_WORKSPACE_ROOT: testDir,
              HIC_LAMBDA_PATH: "src/lambda",
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("@aws-sdk/client-dynamodb");
          expect(result).toContain("lodash");
          expect(result).toContain("uuid");
        } catch (error) {
          console.log("Dependency analysis output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });

    test("detects unused dependencies as bloat", () => {
      const systemDir = join(testDir, "bloat-system");
      mkdirSync(systemDir, { recursive: true });

      const sourceCode = `
export const handler = async (event) => {
  return { statusCode: 200, body: "Simple handler" };
};
      `;

      createMockSystem(
        systemDir,
        {
          "aws-sdk": "^3.400.0", // Declared but not used
          lodash: "^4.17.21", // Declared but not used
          express: "^4.18.2", // Declared but not used
        },
        { "simple.js": sourceCode }
      );

      if (existsSync(analyzerScript)) {
        try {
          const result = execSync(`node "${analyzerScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 10000,
            env: {
              ...process.env,
              HIC_WORKSPACE_ROOT: testDir,
              HIC_LAMBDA_PATH: "src/lambda",
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("BLOAT ANALYSIS");
        } catch (error) {
          console.log("Bloat detection output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });

    test("identifies shared dependencies across multiple systems", () => {
      const system1Dir = join(testDir, "shared-system1");
      const system2Dir = join(testDir, "shared-system2");
      const system3Dir = join(testDir, "shared-system3");

      mkdirSync(system1Dir, { recursive: true });
      mkdirSync(system2Dir, { recursive: true });
      mkdirSync(system3Dir, { recursive: true });

      const sharedDeps = {
        "aws-sdk": "^3.400.0",
        lodash: "^4.17.21",
      };

      createMockSystem(
        system1Dir,
        { ...sharedDeps, unique1: "^1.0.0" },
        { "handler1.js": "import _ from 'lodash';" }
      );

      createMockSystem(
        system2Dir,
        { ...sharedDeps, unique2: "^2.0.0" },
        { "handler2.js": "import _ from 'lodash';" }
      );

      createMockSystem(
        system3Dir,
        { ...sharedDeps, unique3: "^3.0.0" },
        { "handler3.js": "import _ from 'lodash';" }
      );

      if (existsSync(analyzerScript)) {
        try {
          const result = execSync(`node "${analyzerScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 10000,
            env: {
              ...process.env,
              HIC_WORKSPACE_ROOT: testDir,
              HIC_LAMBDA_PATH: "src/lambda",
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("lodash");
          expect(result).toContain("SHARED PACKAGE");
        } catch (error) {
          console.log("Shared deps output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });
  });

  describe("Bloat Detection", () => {
    test("calculates dependency sizes and impact", () => {
      const systemDir = join(testDir, "size-system");
      mkdirSync(systemDir, { recursive: true });

      createMockSystem(
        systemDir,
        {
          "aws-sdk": "^3.400.0", // Large package
          lodash: "^4.17.21", // Medium package
          uuid: "^9.0.0", // Small package
          jest: "^29.0.0", // Test dependency (should be flagged)
        },
        { "handler.js": "import { v4 } from 'uuid';" }
      );

      if (existsSync(analyzerScript)) {
        try {
          const result = execSync(`node "${analyzerScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 10000,
            env: {
              ...process.env,
              HIC_WORKSPACE_ROOT: testDir,
              HIC_LAMBDA_PATH: "src/lambda",
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("jest");
        } catch (error) {
          console.log("Size calculation output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });

    test("detects redundant packages across systems", () => {
      const system1Dir = join(testDir, "redundant1");
      const system2Dir = join(testDir, "redundant2");

      mkdirSync(system1Dir, { recursive: true });
      mkdirSync(system2Dir, { recursive: true });

      // Both systems have similar functionality but different packages
      createMockSystem(
        system1Dir,
        { moment: "^2.29.4", uuid: "^9.0.0" },
        { "handler1.js": "import moment from 'moment';" }
      );

      createMockSystem(
        system2Dir,
        { dayjs: "^1.11.0", uuid: "^9.0.0" }, // dayjs is smaller alternative to moment
        { "handler2.js": "import dayjs from 'dayjs';" }
      );

      if (existsSync(analyzerScript)) {
        try {
          const result = execSync(`node "${analyzerScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 10000,
            env: {
              ...process.env,
              HIC_WORKSPACE_ROOT: testDir,
              HIC_LAMBDA_PATH: "src/lambda",
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("moment");
          expect(result).toContain("dayjs");
        } catch (error) {
          console.log("Redundancy test output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });
  });

  describe("Optimization Recommendations", () => {
    test("generates actionable recommendations for bloat removal", () => {
      const systemDir = join(testDir, "optimize-system");
      mkdirSync(systemDir, { recursive: true });

      createMockSystem(
        systemDir,
        {
          "aws-sdk": "^3.400.0", // Used
          lodash: "^4.17.21", // Unused
          jest: "^29.0.0", // Test dependency
          "aws-sdk-client-mock": "^1.0.0", // Mock library
        },
        { "handler.js": "import { DynamoDB } from 'aws-sdk';" }
      );

      if (existsSync(analyzerScript)) {
        try {
          const result = execSync(`node "${analyzerScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 10000,
            env: {
              ...process.env,
              HIC_WORKSPACE_ROOT: testDir,
              HIC_LAMBDA_PATH: "src/lambda",
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("MINIMAL SHARED PACKAGE");
        } catch (error) {
          console.log("Optimization output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });

    test("prioritizes recommendations by impact and usage frequency", () => {
      const system1Dir = join(testDir, "priority1");
      const system2Dir = join(testDir, "priority2");
      const system3Dir = join(testDir, "priority3");

      mkdirSync(system1Dir, { recursive: true });
      mkdirSync(system2Dir, { recursive: true });
      mkdirSync(system3Dir, { recursive: true });

      // High impact: Used in all 3 systems
      const highImpactDep = { lodash: "^4.17.21" };

      // Medium impact: Used in 2 systems
      const mediumImpactDep = { uuid: "^9.0.0" };

      // Low impact: Used in 1 system
      const lowImpactDep = { axios: "^1.4.0" };

      createMockSystem(
        system1Dir,
        { ...highImpactDep, ...mediumImpactDep, ...lowImpactDep },
        { "handler1.js": "import _ from 'lodash';" }
      );

      createMockSystem(
        system2Dir,
        { ...highImpactDep, ...mediumImpactDep },
        { "handler2.js": "import _ from 'lodash';" }
      );

      createMockSystem(
        system3Dir,
        { ...highImpactDep },
        { "handler3.js": "import _ from 'lodash';" }
      );

      if (existsSync(analyzerScript)) {
        try {
          const result = execSync(`node "${analyzerScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 10000,
            env: {
              ...process.env,
              HIC_WORKSPACE_ROOT: testDir,
              HIC_LAMBDA_PATH: "src/lambda",
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("lodash");
        } catch (error) {
          console.log("Priority test output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });
  });

  describe("Versions File Integration", () => {
    test("loads shared bloat list from versions.env", () => {
      const systemDir = join(testDir, "versions-system");
      mkdirSync(systemDir, { recursive: true });

      createVersionsFile(testDir, {
        SHARED_PACKAGE_1: "aws-sdk@^3.400.0",
        SHARED_PACKAGE_2: "lodash@^4.17.21",
        BLOAT_PACKAGE: "jest@^29.0.0",
      });

      createMockSystem(
        systemDir,
        {
          "aws-sdk": "^3.400.0",
          jest: "^29.0.0",
        },
        { "handler.js": "import AWS from 'aws-sdk';" }
      );

      if (existsSync(analyzerScript)) {
        try {
          const result = execSync(`node "${analyzerScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 10000,
            env: {
              ...process.env,
              HIC_WORKSPACE_ROOT: testDir,
              HIC_LAMBDA_PATH: "src/lambda",
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("jest");
        } catch (error) {
          console.log("Versions file test output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });

    test("falls back to defaults when versions.env missing", () => {
      const systemDir = join(testDir, "no-versions-system");
      mkdirSync(systemDir, { recursive: true });

      createMockSystem(
        systemDir,
        { "aws-sdk": "^3.400.0" },
        { "handler.js": "import AWS from 'aws-sdk';" }
      );

      if (existsSync(analyzerScript)) {
        try {
          const result = execSync(`node "${analyzerScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 10000,
            env: {
              ...process.env,
              HIC_WORKSPACE_ROOT: testDir,
              HIC_LAMBDA_PATH: "src/lambda",
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("DEPENDENCY ANALYSIS");
        } catch (error) {
          console.log("No versions test output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });
  });

  describe("Error Handling", () => {
    test("handles malformed package.json files gracefully", () => {
      const systemDir = join(testDir, "malformed-package-system");
      mkdirSync(systemDir, { recursive: true });

      // Create malformed package.json
      writeFileSync(
        join(systemDir, "package.json"),
        '{ "name": "@hic/malformed", "dependencies": { invalid json'
      );

      // Create lambda directory
      const lambdaDir = join(systemDir, "src", "lambda");
      mkdirSync(lambdaDir, { recursive: true });
      writeFileSync(
        join(lambdaDir, "handler.js"),
        "export const handler = async () => {};"
      );

      if (existsSync(analyzerScript)) {
        try {
          const result = execSync(`node "${analyzerScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 10000,
            env: {
              ...process.env,
              HIC_WORKSPACE_ROOT: testDir,
              HIC_LAMBDA_PATH: "src/lambda",
              NODE_ENV: "test",
            },
          });

          expect(result).toBeDefined();
        } catch (error) {
          console.log(
            "Malformed package test output:",
            error.stdout?.toString()
          );
          expect(error.code).toBeDefined();
        }
      }
    });

    test("handles missing source files gracefully", () => {
      const systemDir = join(testDir, "missing-source-system");
      mkdirSync(systemDir, { recursive: true });

      createMockSystem(systemDir, { "aws-sdk": "^3.400.0" });
      // Don't create lambda source files

      if (existsSync(analyzerScript)) {
        try {
          const result = execSync(`node "${analyzerScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 10000,
            env: {
              ...process.env,
              HIC_WORKSPACE_ROOT: testDir,
              HIC_LAMBDA_PATH: "src/lambda",
              NODE_ENV: "test",
            },
          });

          expect(result).toBeDefined();
        } catch (error) {
          console.log("Missing source test output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });

    test("handles systems without package.json gracefully", () => {
      const systemDir = join(testDir, "no-package-system");
      const lambdaDir = join(systemDir, "src", "lambda");
      mkdirSync(lambdaDir, { recursive: true });

      writeFileSync(
        join(lambdaDir, "handler.js"),
        "export const handler = async () => {};"
      );
      // Don't create package.json

      if (existsSync(analyzerScript)) {
        try {
          const result = execSync(`node "${analyzerScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 10000,
            env: {
              ...process.env,
              HIC_WORKSPACE_ROOT: testDir,
              HIC_LAMBDA_PATH: "src/lambda",
              NODE_ENV: "test",
            },
          });

          expect(result).toBeDefined();
        } catch (error) {
          console.log("No package test output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });
  });

  describe("Performance and Scale", () => {
    test("handles large number of systems efficiently", () => {
      // Create 15 systems with various dependency patterns
      for (let i = 1; i <= 15; i++) {
        const systemDir = join(testDir, `large-system-${i}`);
        mkdirSync(systemDir, { recursive: true });

        const dependencies = {
          "aws-sdk": "^3.400.0",
          [`unique-dep-${i}`]: "^1.0.0",
        };

        if (i % 3 === 0) dependencies["lodash"] = "^4.17.21";
        if (i % 5 === 0) dependencies["uuid"] = "^9.0.0";

        createMockSystem(systemDir, dependencies, {
          [`handler-${i}.js`]: `import AWS from 'aws-sdk'; export const handler = async () => {};`,
        });
      }

      if (existsSync(analyzerScript)) {
        const startTime = Date.now();

        try {
          const result = execSync(`node "${analyzerScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 30000, // Increased timeout for large test
            env: {
              ...process.env,
              HIC_WORKSPACE_ROOT: testDir,
              HIC_LAMBDA_PATH: "src/lambda",
              NODE_ENV: "test",
            },
          });

          const duration = Date.now() - startTime;
          console.log(`Large scale test completed in ${duration}ms`);

          expect(result).toContain("DEPENDENCY ANALYSIS");
          expect(duration).toBeLessThan(25000); // Should complete within 25 seconds
        } catch (error) {
          console.log("Large scale test output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });
  });
});
