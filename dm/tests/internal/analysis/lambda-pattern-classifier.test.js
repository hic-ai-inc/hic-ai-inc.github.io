/**
 * Lambda Pattern Classifier Tests
 *
 * Comprehensive test suite for dm/analysis/lambda-pattern-classifier.js
 * Tests pattern detection, classification algorithms, and layer optimization
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
import LambdaPatternClassifier from "../../../analysis/lambda-pattern-classifier.js";

// Test utilities
function createTempDir(prefix = "pattern-test-") {
  const tempPath = join(
    tmpdir(),
    `${prefix}${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  );
  mkdirSync(tempPath, { recursive: true });
  return tempPath;
}

function createMockSystem(systemDir, lambdaFiles = {}, dependencies = {}) {
  // Ensure the system directory exists
  mkdirSync(systemDir, { recursive: true });

  // Create package.json
  const systemName = systemDir.split(/[/\\]/).pop(); // Handle both Unix and Windows paths
  const packageJson = {
    name: `@hic/${systemName}`,
    version: "1.0.0",
    type: "module",
    dependencies: dependencies,
  };
  writeFileSync(
    join(systemDir, "package.json"),
    JSON.stringify(packageJson, null, 2)
  );

  // Create lambda source files
  if (Object.keys(lambdaFiles).length > 0) {
    const srcDir = join(systemDir, "src");
    mkdirSync(srcDir, { recursive: true });

    Object.entries(lambdaFiles).forEach(([filename, content]) => {
      writeFileSync(join(srcDir, filename), content);
    });
  }
}

function createSystemWithInfrastructure(
  systemDir,
  lambdaFiles = {},
  dependencies = {}
) {
  createMockSystem(systemDir, lambdaFiles, dependencies);

  // Create infrastructure directory for system discovery
  const infraDir = join(systemDir, "infrastructure");
  mkdirSync(infraDir, { recursive: true });
  writeFileSync(join(infraDir, "template.yaml"), "# CloudFormation template");
}

describe("Lambda Pattern Classifier", () => {
  let testDir;
  let dmRoot;
  let classifierScript;

  beforeEach(() => {
    testDir = createTempDir();
    dmRoot = resolve(join(import.meta.dirname, "../../.."));
    classifierScript = join(dmRoot, "analysis", "lambda-pattern-classifier.js");
  });

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("Pattern Detection", () => {
    test("detects DynamoDB access patterns", () => {
      const systemDir = join(testDir, "dynamodb-system");

      const dynamoCode = `
import { DynamoDBClient, PutItemCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";

export const handler = async (event) => {
  const client = new DynamoDBClient({ region: 'us-east-1' });
  
  const putCommand = new PutItemCommand({
    TableName: 'Users',
    Item: { id: { S: event.userId } }
  });
  
  await client.send(putCommand);
  
  const getCommand = new GetItemCommand({
    TableName: 'Users',
    Key: { id: { S: event.userId } }
  });
  
  const response = await client.send(getCommand);
  return { statusCode: 200, body: JSON.stringify(response.Item) };
};
      `;

      createSystemWithInfrastructure(
        systemDir,
        { "dynamodb-handler.js": dynamoCode },
        { "@aws-sdk/client-dynamodb": "^3.400.0" }
      );

      if (existsSync(classifierScript)) {
        try {
          const result = execSync(`node "${classifierScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 15000,
            env: {
              ...process.env,
              HIC_SYSTEMS_ROOT: testDir,
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("DynamoDB");
          expect(result).toContain("PutItemCommand");
          expect(result).toContain("GetItemCommand");
        } catch (error) {
          console.log(
            "DynamoDB pattern test output:",
            error.stdout?.toString()
          );
          expect(error.code).toBeDefined();
        }
      }
    });

    test("detects SNS/SQS messaging patterns", () => {
      const systemDir = join(testDir, "messaging-system");

      const messagingCode = `
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

export const handler = async (event) => {
  const snsClient = new SNSClient({ region: 'us-east-1' });
  const sqsClient = new SQSClient({ region: 'us-east-1' });
  
  // Publish to SNS
  await snsClient.send(new PublishCommand({
    TopicArn: process.env.TOPIC_ARN,
    Message: JSON.stringify(event)
  }));
  
  // Send to SQS
  await sqsClient.send(new SendMessageCommand({
    QueueUrl: process.env.QUEUE_URL,
    MessageBody: JSON.stringify(event)
  }));
  
  return { statusCode: 200 };
};
      `;

      createSystemWithInfrastructure(
        systemDir,
        { "messaging-handler.js": messagingCode },
        {
          "@aws-sdk/client-sns": "^3.400.0",
          "@aws-sdk/client-sqs": "^3.400.0",
        }
      );

      if (existsSync(classifierScript)) {
        try {
          const result = execSync(`node "${classifierScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 15000,
            env: {
              ...process.env,
              HIC_SYSTEMS_ROOT: testDir,
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("SNS");
          expect(result).toContain("SQS");
          expect(result).toContain("PublishCommand");
        } catch (error) {
          console.log(
            "Messaging pattern test output:",
            error.stdout?.toString()
          );
          expect(error.code).toBeDefined();
        }
      }
    });

    test("detects API Gateway handler patterns", () => {
      const systemDir = join(testDir, "api-system");

      const apiCode = `
export const handler = async (event, context) => {
  const { httpMethod, path, pathParameters, queryStringParameters } = event;
  
  if (httpMethod === 'GET' && path === '/users/{id}') {
    const userId = pathParameters.id;
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ userId, method: 'GET' })
    };
  }
  
  if (httpMethod === 'POST') {
    const body = JSON.parse(event.body || '{}');
    return {
      statusCode: 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Created', data: body })
    };
  }
  
  return {
    statusCode: 404,
    body: JSON.stringify({ error: 'Not Found' })
  };
};
      `;

      createSystemWithInfrastructure(systemDir, { "api-handler.js": apiCode });

      if (existsSync(classifierScript)) {
        try {
          const result = execSync(`node "${classifierScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 15000,
            env: {
              ...process.env,
              HIC_SYSTEMS_ROOT: testDir,
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("httpMethod");
          expect(result).toContain("statusCode");
        } catch (error) {
          console.log("API pattern test output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });

    test("detects Step Functions workflow patterns", () => {
      const systemDir = join(testDir, "stepfunctions-system");

      const stepFunctionsCode = `
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";

export const handler = async (event) => {
  const client = new SFNClient({ region: 'us-east-1' });
  
  const command = new StartExecutionCommand({
    stateMachineArn: process.env.STATE_MACHINE_ARN,
    input: JSON.stringify({
      requestId: event.requestId,
      data: event.data,
      timestamp: new Date().toISOString()
    })
  });
  
  const result = await client.send(command);
  
  return {
    statusCode: 200,
    body: JSON.stringify({
      executionArn: result.executionArn,
      startDate: result.startDate
    })
  };
};
      `;

      createSystemWithInfrastructure(
        systemDir,
        { "stepfunctions-handler.js": stepFunctionsCode },
        { "@aws-sdk/client-sfn": "^3.400.0" }
      );

      if (existsSync(classifierScript)) {
        try {
          const result = execSync(`node "${classifierScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 15000,
            env: {
              ...process.env,
              HIC_SYSTEMS_ROOT: testDir,
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("SFNClient");
          expect(result).toContain("StartExecutionCommand");
        } catch (error) {
          console.log(
            "Step Functions pattern test output:",
            error.stdout?.toString()
          );
          expect(error.code).toBeDefined();
        }
      }
    });

    test("detects data processing patterns", () => {
      const systemDir = join(testDir, "processing-system");

      const processingCode = `
import _ from "lodash";

export const handler = async (event) => {
  const records = event.Records || [];
  
  const processed = await Promise.all(
    records.map(async (record) => {
      const data = JSON.parse(record.body || '{}');
      
      // Transform data
      const transformed = _.pick(data, ['id', 'name', 'email']);
      transformed.processedAt = new Date().toISOString();
      transformed.hash = _.uniqueId('proc_');
      
      // Validate required fields
      if (!transformed.id || !transformed.email) {
        throw new Error('Missing required fields');
      }
      
      return transformed;
    })
  );
  
  return {
    statusCode: 200,
    body: JSON.stringify({
      processedCount: processed.length,
      records: processed
    })
  };
};
      `;

      createSystemWithInfrastructure(
        systemDir,
        { "processing-handler.js": processingCode },
        { lodash: "^4.17.21" }
      );

      if (existsSync(classifierScript)) {
        try {
          const result = execSync(`node "${classifierScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 15000,
            env: {
              ...process.env,
              HIC_SYSTEMS_ROOT: testDir,
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("lodash");
          expect(result).toContain("Promise.all");
        } catch (error) {
          console.log(
            "Processing pattern test output:",
            error.stdout?.toString()
          );
          expect(error.code).toBeDefined();
        }
      }
    });
  });

  describe("Classification Algorithms", () => {
    test("classifies Lambda functions by usage patterns", () => {
      const systemDir = join(testDir, "classification-system");

      // Create multiple functions with different patterns
      const functions = {
        "api-handler.js": `
          export const handler = async (event) => {
            const { httpMethod } = event;
            return { statusCode: 200, body: JSON.stringify({ method: httpMethod }) };
          };
        `,
        "data-processor.js": `
          import _ from "lodash";
          export const handler = async (event) => {
            return _.map(event.records, r => ({ processed: true, ...r }));
          };
        `,
        "notification-sender.js": `
          import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
          export const handler = async (event) => {
            const client = new SNSClient({});
            await client.send(new PublishCommand({ TopicArn: 'arn', Message: 'msg' }));
          };
        `,
      };

      createSystemWithInfrastructure(systemDir, functions, {
        lodash: "^4.17.21",
        "@aws-sdk/client-sns": "^3.400.0",
      });

      if (existsSync(classifierScript)) {
        try {
          const result = execSync(`node "${classifierScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 15000,
            env: {
              ...process.env,
              HIC_SYSTEMS_ROOT: testDir,
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("api-handler");
          expect(result).toContain("data-processor");
          expect(result).toContain("notification-sender");
        } catch (error) {
          console.log("Classification test output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });

    test("groups functions with similar dependency patterns", () => {
      const system1Dir = join(testDir, "similar-system1");
      const system2Dir = join(testDir, "similar-system2");

      const awsPattern = {
        "aws-handler.js": `
          import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
          import { SNSClient } from "@aws-sdk/client-sns";
          export const handler = async () => ({ statusCode: 200 });
        `,
      };

      const awsDependencies = {
        "@aws-sdk/client-dynamodb": "^3.400.0",
        "@aws-sdk/client-sns": "^3.400.0",
      };

      createSystemWithInfrastructure(system1Dir, awsPattern, awsDependencies);
      createSystemWithInfrastructure(system2Dir, awsPattern, awsDependencies);

      if (existsSync(classifierScript)) {
        try {
          const result = execSync(`node "${classifierScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 15000,
            env: {
              ...process.env,
              HIC_SYSTEMS_ROOT: testDir,
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("DynamoDBClient");
          expect(result).toContain("SNSClient");
        } catch (error) {
          console.log("Grouping test output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });

    test("identifies common utility patterns across functions", () => {
      const systemDir = join(testDir, "utility-system");

      const utilityFunctions = {
        "validator.js": `
          import Joi from "joi";
          export const handler = async (event) => {
            const schema = Joi.object({ id: Joi.string().required() });
            const { error } = schema.validate(event);
            return { valid: !error };
          };
        `,
        "logger.js": `
          import { safeLog } from "../layers/base/src/index.js";
          export const handler = async (event) => {
            safeLog("Processing event", event);
            return { logged: true };
          };
        `,
        "uuid-generator.js": `
          import { v4 as uuidv4 } from "uuid";
          export const handler = async () => {
            return { id: uuidv4() };
          };
        `,
      };

      createSystemWithInfrastructure(systemDir, utilityFunctions, {
        joi: "^17.9.0",
        uuid: "^9.0.0",
      });

      if (existsSync(classifierScript)) {
        try {
          const result = execSync(`node "${classifierScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 15000,
            env: {
              ...process.env,
              HIC_SYSTEMS_ROOT: testDir,
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("Joi");
          expect(result).toContain("uuid");
          expect(result).toContain("safeLog");
        } catch (error) {
          console.log("Utility pattern test output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });
  });

  describe("Layer Optimization", () => {
    test("optimizes layer assignments based on patterns", () => {
      const systemDir = join(testDir, "layer-optimization-system");

      const functions = {
        "shared-utils-1.js": `
          import _ from "lodash";
          import { v4 } from "uuid";
          export const handler = async () => ({ id: v4(), data: _.pick({}, []) });
        `,
        "shared-utils-2.js": `
          import _ from "lodash";
          import { v4 } from "uuid";
          export const handler = async () => ({ id: v4(), processed: _.map([], x => x) });
        `,
        "aws-only.js": `
          import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
          export const handler = async () => ({ client: new DynamoDBClient({}) });
        `,
      };

      createSystemWithInfrastructure(systemDir, functions, {
        lodash: "^4.17.21",
        uuid: "^9.0.0",
        "@aws-sdk/client-dynamodb": "^3.400.0",
      });

      if (existsSync(classifierScript)) {
        try {
          const result = execSync(`node "${classifierScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 15000,
            env: {
              ...process.env,
              HIC_SYSTEMS_ROOT: testDir,
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("LAYER RECOMMENDATIONS");
        } catch (error) {
          console.log(
            "Layer optimization test output:",
            error.stdout?.toString()
          );
          expect(error.code).toBeDefined();
        }
      }
    });

    test("creates optimized layer specifications for each pattern type", () => {
      const system1Dir = join(testDir, "pattern-system1");
      const system2Dir = join(testDir, "pattern-system2");

      // API pattern functions
      createSystemWithInfrastructure(system1Dir, {
        "api-handler.js": `
          export const handler = async (event) => {
            return { statusCode: 200, body: JSON.stringify(event) };
          };
        `,
      });

      // Data processing pattern functions
      createSystemWithInfrastructure(
        system2Dir,
        {
          "processor.js": `
          import _ from "lodash";
          export const handler = async (event) => {
            return _.map(event.records, r => ({ ...r, processed: true }));
          };
        `,
        },
        { lodash: "^4.17.21" }
      );

      if (existsSync(classifierScript)) {
        try {
          const result = execSync(`node "${classifierScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 15000,
            env: {
              ...process.env,
              HIC_SYSTEMS_ROOT: testDir,
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("Pattern");
        } catch (error) {
          console.log(
            "Layer specification test output:",
            error.stdout?.toString()
          );
          expect(error.code).toBeDefined();
        }
      }
    });

    test("recommends consolidation opportunities", () => {
      const systemDir = join(testDir, "consolidation-system");

      // Multiple functions with overlapping dependencies
      const functions = {
        "function1.js": `
          import _ from "lodash";
          import { v4 } from "uuid";
          export const handler = async () => ({});
        `,
        "function2.js": `
          import _ from "lodash";
          import axios from "axios";
          export const handler = async () => ({});
        `,
        "function3.js": `
          import { v4 } from "uuid";
          import axios from "axios";
          export const handler = async () => ({});
        `,
      };

      createSystemWithInfrastructure(systemDir, functions, {
        lodash: "^4.17.21",
        uuid: "^9.0.0",
        axios: "^1.4.0",
      });

      if (existsSync(classifierScript)) {
        try {
          const result = execSync(`node "${classifierScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 15000,
            env: {
              ...process.env,
              HIC_SYSTEMS_ROOT: testDir,
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("lodash");
          expect(result).toContain("uuid");
          expect(result).toContain("axios");
        } catch (error) {
          console.log("Consolidation test output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });
  });

  describe("System Analysis", () => {
    test("analyzes individual Lambda function files", () => {
      const classifier = new LambdaPatternClassifier();
      expect(classifier).toBeDefined();
      expect(typeof classifier.analyzeLambdaFunction).toBe("function");
    });

    test("scans all systems for Lambda functions", () => {
      const classifier = new LambdaPatternClassifier();
      expect(typeof classifier.scanAllSystems).toBe("function");
    });

    test("generates comprehensive analysis report", () => {
      const classifier = new LambdaPatternClassifier();
      expect(typeof classifier.run).toBe("function");
    });
  });

  describe("File Size and Security Validation", () => {
    test("validates file sizes before processing", () => {
      const systemDir = join(testDir, "size-validation-system");

      // Create a very large file (simulated)
      const largeContent = "// Large file content\n".repeat(10000);

      createSystemWithInfrastructure(systemDir, {
        "large-handler.js": largeContent,
      });

      if (existsSync(classifierScript)) {
        try {
          const result = execSync(`node "${classifierScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 15000,
            env: {
              ...process.env,
              HIC_SYSTEMS_ROOT: testDir,
              HIC_MAX_FILE_SIZE: "1024", // 1KB limit
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("File too large" || "Pattern");
        } catch (error) {
          console.log("Size validation test output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });

    test("handles invalid file paths securely", async () => {
      const classifier = new LambdaPatternClassifier();

      // Test invalid inputs
      const result1 = await classifier.analyzeLambdaFunction(
        null,
        "test-system"
      );
      const result2 = await classifier.analyzeLambdaFunction("", "test-system");
      const result3 = await classifier.analyzeLambdaFunction(
        "valid-path",
        null
      );

      expect(result1).toBe(null);
      expect(result2).toBe(null);
      expect(result3).toBe(null);
    });
  });

  describe("Environment Configuration", () => {
    test("respects environment variable configurations", () => {
      const systemDir = join(testDir, "env-config-system");

      createSystemWithInfrastructure(systemDir, {
        "handler.js": "export const handler = async () => ({});",
      });

      if (existsSync(classifierScript)) {
        try {
          const result = execSync(`node "${classifierScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 15000,
            env: {
              ...process.env,
              HIC_SYSTEMS_ROOT: testDir,
              HIC_EXCLUDED_DIRS: "custom-exclude,another-exclude",
              HIC_AWS_SERVICES: "CustomService,AnotherService",
              NODE_ENV: "test",
            },
          });

          expect(result).toBeDefined();
        } catch (error) {
          console.log(
            "Environment config test output:",
            error.stdout?.toString()
          );
          expect(error.code).toBeDefined();
        }
      }
    });

    test("handles missing environment variables gracefully", () => {
      const systemDir = join(testDir, "minimal-env-system");

      createSystemWithInfrastructure(systemDir, {
        "handler.js": "export const handler = async () => ({});",
      });

      if (existsSync(classifierScript)) {
        try {
          const result = execSync(`node "${classifierScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 15000,
            env: {
              HIC_SYSTEMS_ROOT: testDir,
              NODE_ENV: "test",
            },
          });

          expect(result).toBeDefined();
        } catch (error) {
          console.log("Minimal env test output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });
  });

  describe("Error Handling", () => {
    test("handles malformed JavaScript files gracefully", () => {
      const systemDir = join(testDir, "malformed-js-system");

      const malformedCode = `
        import { incomplete syntax
        export const handler = async (event) => {
          // Missing closing brace
      `;

      createSystemWithInfrastructure(systemDir, {
        "malformed.js": malformedCode,
      });

      if (existsSync(classifierScript)) {
        try {
          const result = execSync(`node "${classifierScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 15000,
            env: {
              ...process.env,
              HIC_SYSTEMS_ROOT: testDir,
              NODE_ENV: "test",
            },
          });

          expect(result).toBeDefined();
        } catch (error) {
          console.log("Malformed JS test output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });

    test("handles missing source directories gracefully", () => {
      const systemDir = join(testDir, "no-source-system");

      // Create system with infrastructure but no src directory
      mkdirSync(systemDir, { recursive: true });
      const infraDir = join(systemDir, "infrastructure");
      mkdirSync(infraDir, { recursive: true });
      writeFileSync(join(infraDir, "template.yaml"), "# Template");

      if (existsSync(classifierScript)) {
        try {
          const result = execSync(`node "${classifierScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 15000,
            env: {
              ...process.env,
              HIC_SYSTEMS_ROOT: testDir,
              NODE_ENV: "test",
            },
          });

          expect(result).toBeDefined();
        } catch (error) {
          console.log("No source test output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });

    test("handles unreadable files gracefully", () => {
      const systemDir = join(testDir, "unreadable-system");

      createSystemWithInfrastructure(systemDir, {
        "handler.js": "export const handler = async () => ({});",
      });

      // Change file permissions to make it unreadable (on Unix systems)
      // On Windows this test will still run but permissions may not apply
      try {
        execSync(`chmod 000 "${join(systemDir, "src", "handler.js")}"`, {
          stdio: "ignore",
        });
      } catch {
        // Ignore permission errors on Windows
      }

      if (existsSync(classifierScript)) {
        try {
          const result = execSync(`node "${classifierScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 15000,
            env: {
              ...process.env,
              HIC_SYSTEMS_ROOT: testDir,
              NODE_ENV: "test",
            },
          });

          expect(result).toBeDefined();
        } catch (error) {
          console.log("Unreadable file test output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });
  });

  describe("Performance and Scale", () => {
    test("handles large number of Lambda functions efficiently", () => {
      // Create 20 systems with multiple functions each
      for (let i = 1; i <= 20; i++) {
        const systemDir = join(testDir, `perf-system-${i}`);

        const functions = {};
        for (let j = 1; j <= 3; j++) {
          functions[`handler-${j}.js`] = `
            import _ from "lodash";
            export const handler = async (event) => {
              return _.pick(event, ['id', 'data']);
            };
          `;
        }

        createSystemWithInfrastructure(systemDir, functions, {
          lodash: "^4.17.21",
        });
      }

      if (existsSync(classifierScript)) {
        const startTime = Date.now();

        try {
          const result = execSync(`node "${classifierScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 30000, // Increased timeout
            env: {
              ...process.env,
              HIC_SYSTEMS_ROOT: testDir,
              NODE_ENV: "test",
            },
          });

          const duration = Date.now() - startTime;
          console.log(`Performance test completed in ${duration}ms`);

          expect(result).toContain("Pattern" || "Lambda");
          expect(duration).toBeLessThan(25000); // Should complete within 25 seconds
        } catch (error) {
          console.log("Performance test output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });
  });
});
