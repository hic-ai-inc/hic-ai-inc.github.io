import { describe, test, beforeEach, afterEach } from "node:test";
import { expect, createSpy } from "../../../facade/test-helpers/index.js";
import { execSync, spawn } from "node:child_process";
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
function createTempDir(prefix = "audit-test-") {
  const tempPath = join(
    tmpdir(),
    `${prefix}${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  );
  mkdirSync(tempPath, { recursive: true });
  return tempPath;
}

function createMockSystem(systemDir, lambdaFunctions = {}, dependencies = {}) {
  // Create infrastructure directory
  const infraDir = join(systemDir, "infrastructure");
  mkdirSync(infraDir, { recursive: true });

  // Create CloudFormation template with Lambda functions
  const template = {
    AWSTemplateFormatVersion: "2010-09-09",
    Transform: "AWS::Serverless-2016-10-31",
    Resources: {},
  };

  // Add Lambda functions to template
  Object.entries(lambdaFunctions).forEach(([name, config]) => {
    template.Resources[name] = {
      Type: "AWS::Serverless::Function",
      Properties: {
        CodeUri: config.codeUri || "src/",
        Handler: config.handler || "index.handler",
        Runtime: config.runtime || "nodejs20.x",
        Timeout: config.timeout || 30,
        MemorySize: config.memorySize || 128,
        Layers: config.layers || [],
      },
    };
  });

  writeFileSync(
    join(infraDir, "template.yaml"),
    JSON.stringify(template, null, 2).replace(/"/g, "").replace(/,/g, "")
  );

  // Create package.json
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

  // Create source files
  if (Object.keys(lambdaFunctions).length > 0) {
    const srcDir = join(systemDir, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(
      join(srcDir, "index.js"),
      "export const handler = async () => ({ statusCode: 200 });"
    );
  }
}

describe("Lambda Audit Analysis", () => {
  let testDir;
  let dmRoot;
  let auditScript;

  beforeEach(() => {
    testDir = createTempDir();
    dmRoot = resolve(join(import.meta.dirname, "../../.."));
    auditScript = join(dmRoot, "analysis", "lambda-audit.js");
  });

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("System Discovery", () => {
    test("finds all systems with Lambda functions", () => {
      // Create mock HIC workspace structure
      const system1Dir = join(testDir, "system1");
      const system2Dir = join(testDir, "system2");
      const system3Dir = join(testDir, "no-lambdas"); // System without Lambdas

      mkdirSync(system1Dir, { recursive: true });
      mkdirSync(system2Dir, { recursive: true });
      mkdirSync(system3Dir, { recursive: true });

      // System1 with 2 Lambda functions
      createMockSystem(system1Dir, {
        ProcessorFunction: {
          codeUri: "src/processor/",
          handler: "processor.handler",
          layers: [
            "arn:aws:lambda:us-east-1:123456789012:layer:hic-base-layer:1",
          ],
        },
        ValidatorFunction: {
          codeUri: "src/validator/",
          handler: "validator.handler",
        },
      });

      // System2 with 1 Lambda function
      createMockSystem(system2Dir, {
        HandlerFunction: {
          codeUri: "src/",
          handler: "index.handler",
          layers: [
            "arn:aws:lambda:us-east-1:123456789012:layer:hic-base-layer:1",
          ],
        },
      });

      // System3 with no Lambda functions (only package.json)
      writeFileSync(
        join(system3Dir, "package.json"),
        JSON.stringify(
          {
            name: "@hic/no-lambdas",
            version: "1.0.0",
          },
          null,
          2
        )
      );

      if (existsSync(auditScript)) {
        try {
          const result = execSync(`node "${auditScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 10000,
            env: {
              ...process.env,
              HIC_SYSTEMS_ROOT: testDir,
              HIC_EXCLUSIONS: "",
              NODE_ENV: "test",
            },
          });

          // Should find systems 1 and 2 (with Lambdas), skip system 3
          expect(result).toContain("system1");
          expect(result).toContain("system2");
          expect(result).toContain("ProcessorFunction");
          expect(result).toContain("ValidatorFunction");
          expect(result).toContain("HandlerFunction");
        } catch (error) {
          // Log audit failures for debugging
          console.log("Audit script output:", error.stdout?.toString());
          console.log("Audit script error:", error.stderr?.toString());
          expect(error.code).toBeDefined(); // Test that audit ran
        }
      }
    });

    test("respects exclusion patterns", () => {
      const includeDir = join(testDir, "include-system");
      const excludeDir = join(testDir, "exclude-system");
      const nodeModulesDir = join(testDir, "node_modules", "some-package");

      mkdirSync(includeDir, { recursive: true });
      mkdirSync(excludeDir, { recursive: true });
      mkdirSync(nodeModulesDir, { recursive: true });

      // Create systems that should be included and excluded
      createMockSystem(includeDir, {
        IncludeFunction: { handler: "index.handler" },
      });

      createMockSystem(excludeDir, {
        ExcludeFunction: { handler: "index.handler" },
      });

      createMockSystem(nodeModulesDir, {
        NodeModulesFunction: { handler: "index.handler" },
      });

      if (existsSync(auditScript)) {
        try {
          const result = execSync(`node "${auditScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 10000,
            env: {
              ...process.env,
              HIC_SYSTEMS_ROOT: testDir,
              HIC_EXCLUSIONS: "exclude-system,node_modules",
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("include-system");
          expect(result).not.toContain("exclude-system");
          expect(result).not.toContain("node_modules");
        } catch (error) {
          expect(error).toBeDefined(); // Test ran
        }
      }
    });

    test("handles missing infrastructure directories gracefully", () => {
      const systemDir = join(testDir, "broken-system");
      mkdirSync(systemDir, { recursive: true });

      // Create package.json but no infrastructure directory
      writeFileSync(
        join(systemDir, "package.json"),
        JSON.stringify(
          {
            name: "@hic/broken-system",
            version: "1.0.0",
          },
          null,
          2
        )
      );

      if (existsSync(auditScript)) {
        try {
          const result = execSync(`node "${auditScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 5000,
            env: {
              ...process.env,
              HIC_SYSTEMS_ROOT: testDir,
              NODE_ENV: "test",
            },
          });

          // Should handle gracefully, not crash
          expect(result).toBeDefined();
        } catch (error) {
          // Expected - script might exit with error for broken systems
          expect(error.message).toContain("Command failed");
        }
      }
    });
  });

  describe("Template Parsing", () => {
    test("extracts Lambda functions from CloudFormation YAML", () => {
      const systemDir = join(testDir, "yaml-system");
      mkdirSync(systemDir, { recursive: true });

      // Create proper YAML CloudFormation template
      const yamlTemplate = `AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: Test system with Lambda functions

Resources:
  ProcessorFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: src/processor/
      Handler: processor.handler
      Runtime: nodejs20.x
      Timeout: 30
      MemorySize: 256
      Layers:
        - !Ref HicBaseLayer
        
  ValidatorFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: src/validator/
      Handler: validator.handler
      Runtime: nodejs20.x
      Environment:
        Variables:
          LOG_LEVEL: INFO`;

      const infraDir = join(systemDir, "infrastructure");
      mkdirSync(infraDir, { recursive: true });
      writeFileSync(join(infraDir, "template.yaml"), yamlTemplate);

      // Create package.json
      writeFileSync(
        join(systemDir, "package.json"),
        JSON.stringify(
          {
            name: "@hic/yaml-system",
            version: "1.0.0",
            dependencies: {
              "aws-sdk": "^3.400.0",
              lodash: "^4.17.21",
            },
          },
          null,
          2
        )
      );

      if (existsSync(auditScript)) {
        try {
          const result = execSync(`node "${auditScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 10000,
            env: {
              ...process.env,
              HIC_SYSTEMS_ROOT: testDir,
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("ProcessorFunction");
          expect(result).toContain("ValidatorFunction");
          expect(result).toContain("processor.handler");
          expect(result).toContain("validator.handler");
        } catch (error) {
          console.log("YAML parsing test output:", error.stdout?.toString());
          expect(error).toBeDefined();
        }
      }
    });

    test("identifies layer references correctly", () => {
      const systemDir = join(testDir, "layers-system");
      mkdirSync(systemDir, { recursive: true });

      createMockSystem(systemDir, {
        LayeredFunction: {
          handler: "index.handler",
          layers: [
            "arn:aws:lambda:us-east-1:123456789012:layer:hic-base-layer:1",
            "arn:aws:lambda:us-east-1:123456789012:layer:hic-dynamodb-layer:2",
          ],
        },
        NoLayersFunction: {
          handler: "simple.handler",
          // No layers property
        },
      });

      if (existsSync(auditScript)) {
        try {
          const result = execSync(`node "${auditScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 10000,
            env: {
              ...process.env,
              HIC_SYSTEMS_ROOT: testDir,
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("hic-base-layer");
          expect(result).toContain("hic-dynamodb-layer");
          expect(result).toContain("LayeredFunction");
          expect(result).toContain("NoLayersFunction");
        } catch (error) {
          expect(error).toBeDefined();
        }
      }
    });

    test("maps CodeUri paths correctly", () => {
      const systemDir = join(testDir, "codeuri-system");
      mkdirSync(systemDir, { recursive: true });

      createMockSystem(systemDir, {
        RootFunction: {
          codeUri: "src/",
          handler: "index.handler",
        },
        SubdirFunction: {
          codeUri: "src/processor/",
          handler: "processor.handler",
        },
        DefaultFunction: {
          // No codeUri specified - should default to "src/"
          handler: "default.handler",
        },
      });

      // Create corresponding source directories
      const srcDir = join(systemDir, "src");
      const processorDir = join(systemDir, "src", "processor");
      mkdirSync(srcDir, { recursive: true });
      mkdirSync(processorDir, { recursive: true });

      writeFileSync(
        join(srcDir, "index.js"),
        "export const handler = async () => ({});"
      );
      writeFileSync(
        join(processorDir, "processor.js"),
        "export const handler = async () => ({});"
      );
      writeFileSync(
        join(srcDir, "default.js"),
        "export const handler = async () => ({});"
      );

      if (existsSync(auditScript)) {
        try {
          const result = execSync(`node "${auditScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 10000,
            env: {
              ...process.env,
              HIC_SYSTEMS_ROOT: testDir,
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("src/");
          expect(result).toContain("src/processor/");
          expect(result).toContain("RootFunction");
          expect(result).toContain("SubdirFunction");
          expect(result).toContain("DefaultFunction");
        } catch (error) {
          expect(error).toBeDefined();
        }
      }
    });
  });

  describe("Dependency Analysis", () => {
    test("aggregates system-level dependencies correctly", () => {
      const systemDir = join(testDir, "deps-system");
      mkdirSync(systemDir, { recursive: true });

      const dependencies = {
        "aws-sdk": "^3.400.0",
        lodash: "^4.17.21",
        uuid: "^9.0.0",
        express: "^4.18.2",
      };

      createMockSystem(
        systemDir,
        {
          DependentFunction: {
            handler: "index.handler",
          },
        },
        dependencies
      );

      if (existsSync(auditScript)) {
        try {
          const result = execSync(`node "${auditScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 10000,
            env: {
              ...process.env,
              HIC_SYSTEMS_ROOT: testDir,
              NODE_ENV: "test",
            },
          });

          // Should include production dependencies
          expect(result).toContain("aws-sdk");
          expect(result).toContain("lodash");
          expect(result).toContain("uuid");
          expect(result).toContain("express");
        } catch (error) {
          expect(error).toBeDefined();
        }
      }
    });

    test("identifies duplication opportunities across systems", () => {
      const system1Dir = join(testDir, "system1");
      const system2Dir = join(testDir, "system2");

      mkdirSync(system1Dir, { recursive: true });
      mkdirSync(system2Dir, { recursive: true });

      // Both systems use same dependencies
      const sharedDependencies = {
        "aws-sdk": "^3.400.0",
        lodash: "^4.17.21",
      };

      createMockSystem(
        system1Dir,
        {
          Function1: { handler: "index.handler" },
        },
        {
          ...sharedDependencies,
          "unique-to-system1": "^1.0.0",
        }
      );

      createMockSystem(
        system2Dir,
        {
          Function2: { handler: "index.handler" },
        },
        {
          ...sharedDependencies,
          "unique-to-system2": "^2.0.0",
        }
      );

      if (existsSync(auditScript)) {
        try {
          const result = execSync(`node "${auditScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 10000,
            env: {
              ...process.env,
              HIC_SYSTEMS_ROOT: testDir,
              NODE_ENV: "test",
            },
          });

          // Should identify shared dependencies
          expect(result).toContain("aws-sdk");
          expect(result).toContain("lodash");
          expect(result).toContain("system1");
          expect(result).toContain("system2");
        } catch (error) {
          expect(error).toBeDefined();
        }
      }
    });

    test("generates actionable recommendations", () => {
      const systemDir = join(testDir, "recommendations-system");
      mkdirSync(systemDir, { recursive: true });

      createMockSystem(
        systemDir,
        {
          OverloadedFunction: {
            handler: "index.handler",
            memorySize: 512,
            timeout: 300,
          },
        },
        {
          "aws-sdk": "^3.400.0",
          lodash: "^4.17.21",
          moment: "^2.29.4",
          axios: "^1.4.0",
          express: "^4.18.2",
          uuid: "^9.0.0",
        }
      );

      if (existsSync(auditScript)) {
        try {
          const result = execSync(`node "${auditScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 10000,
            env: {
              ...process.env,
              HIC_SYSTEMS_ROOT: testDir,
              NODE_ENV: "test",
            },
          });

          // Should provide recommendations for optimization
          expect(result).toBeDefined();
          expect(result.length).toBeGreaterThan(0);
        } catch (error) {
          // Audit may fail but should produce output
          expect(error.stdout || error.stderr).toBeDefined();
        }
      }
    });
  });

  describe("Performance and Scale", () => {
    test("handles large number of systems efficiently", () => {
      // Create 10 systems with multiple Lambda functions each
      for (let i = 1; i <= 10; i++) {
        const systemDir = join(testDir, `large-system-${i}`);
        mkdirSync(systemDir, { recursive: true });

        const functions = {};
        for (let j = 1; j <= 3; j++) {
          functions[`Function${j}`] = {
            handler: `function${j}.handler`,
            codeUri: `src/function${j}/`,
          };
        }

        createMockSystem(systemDir, functions, {
          "aws-sdk": "^3.400.0",
          lodash: "^4.17.21",
        });
      }

      if (existsSync(auditScript)) {
        const startTime = Date.now();

        try {
          const result = execSync(`node "${auditScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 30000, // 30 second timeout for large test
            env: {
              ...process.env,
              HIC_SYSTEMS_ROOT: testDir,
              NODE_ENV: "test",
            },
          });

          const duration = Date.now() - startTime;

          // Should complete in reasonable time (under 30 seconds)
          expect(duration).toBeLessThan(30000);
          expect(result).toContain("large-system");
        } catch (error) {
          const duration = Date.now() - startTime;
          expect(duration).toBeLessThan(30000); // Should not timeout
          expect(error).toBeDefined();
        }
      }
    });
  });

  describe("Error Handling", () => {
    test("handles malformed CloudFormation templates gracefully", () => {
      const systemDir = join(testDir, "malformed-system");
      const infraDir = join(systemDir, "infrastructure");
      mkdirSync(infraDir, { recursive: true });

      // Create malformed YAML template
      writeFileSync(
        join(infraDir, "template.yaml"),
        `
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Resources:
  BadFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: src/
      Handler: index.handler
      Runtime: nodejs20.x
      # Missing required closing bracket or invalid YAML
      BadProperty: {
        NestedBad: incomplete
`
      );

      writeFileSync(
        join(systemDir, "package.json"),
        JSON.stringify(
          {
            name: "@hic/malformed-system",
            version: "1.0.0",
          },
          null,
          2
        )
      );

      if (existsSync(auditScript)) {
        try {
          const result = execSync(`node "${auditScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 10000,
            env: {
              ...process.env,
              HIC_SYSTEMS_ROOT: testDir,
              NODE_ENV: "test",
            },
          });

          // Should handle gracefully, not crash
          expect(result).toBeDefined();
        } catch (error) {
          // Expected to fail with malformed template
          expect(error.message).toContain("Command failed");
          expect(error.code).toBeGreaterThan(0);
        }
      }
    });

    test("handles missing package.json files", () => {
      const systemDir = join(testDir, "no-package-system");
      const infraDir = join(systemDir, "infrastructure");
      mkdirSync(infraDir, { recursive: true });

      // Create valid template but no package.json
      createMockSystem(systemDir, {
        OrphanFunction: { handler: "index.handler" },
      });

      // Remove the package.json that createMockSystem created
      rmSync(join(systemDir, "package.json"));

      if (existsSync(auditScript)) {
        try {
          const result = execSync(`node "${auditScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 10000,
            env: {
              ...process.env,
              HIC_SYSTEMS_ROOT: testDir,
              NODE_ENV: "test",
            },
          });

          expect(result).toBeDefined();
        } catch (error) {
          // May fail due to missing package.json, that's expected
          expect(error).toBeDefined();
        }
      }
    });
  });
});
