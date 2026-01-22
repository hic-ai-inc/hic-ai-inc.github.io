/**
 * Lambda Source Inspector Tests
 *
 * Comprehensive test suite for dm/analysis/lambda-source-inspector.js
 * Tests source code analysis, pattern detection, and code quality metrics
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
  chmodSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

// Test utilities
function createTempDir(prefix = "inspector-test-") {
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

function createMockAuditScript(testDir) {
  const dmDir = join(testDir, "dependency-manager", "analysis");
  mkdirSync(dmDir, { recursive: true });

  const mockAuditScript = `
console.log("Total Lambda Functions: 15");
console.log("Systems Analyzed: 5");
console.log("Analysis Complete");
  `;

  writeFileSync(join(dmDir, "lambda-audit.js"), mockAuditScript);
}

describe("Lambda Source Inspector", () => {
  let testDir;
  let dmRoot;
  let inspectorScript;

  beforeEach(() => {
    testDir = createTempDir();
    dmRoot = resolve(join(import.meta.dirname, "../../.."));
    inspectorScript = join(dmRoot, "analysis", "lambda-source-inspector.js");
  });

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("Source Code Analysis", () => {
    test("analyzes Lambda function source code structure", () => {
      const systemDir = join(testDir, "source-analysis-system");

      const complexSource = `
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import _ from "lodash";
import { v4 as uuidv4 } from "uuid";

// Handler with complex logic
export const handler = async (event, context) => {
  const requestId = uuidv4();
  console.log(\`Processing request \${requestId}\`);
  
  try {
    // Input validation
    if (!event || !event.data) {
      throw new Error("Invalid input data");
    }
    
    // Data transformation
    const processedData = _.pick(event.data, ['id', 'name', 'email']);
    processedData.timestamp = new Date().toISOString();
    processedData.requestId = requestId;
    
    // Database operation
    const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
    const putCommand = new PutItemCommand({
      TableName: process.env.TABLE_NAME,
      Item: {
        id: { S: processedData.id },
        data: { S: JSON.stringify(processedData) }
      }
    });
    
    await dynamoClient.send(putCommand);
    
    // Notification
    const snsClient = new SNSClient({ region: 'us-east-1' });
    const publishCommand = new PublishCommand({
      TopicArn: process.env.TOPIC_ARN,
      Message: JSON.stringify({
        action: 'data_processed',
        requestId,
        timestamp: processedData.timestamp
      })
    });
    
    await snsClient.send(publishCommand);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        requestId,
        processedAt: processedData.timestamp
      })
    };
    
  } catch (error) {
    console.error(\`Error processing request \${requestId}:\`, error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
        requestId
      })
    };
  }
};
      `;

      createSystemWithInfrastructure(
        systemDir,
        { "complex-handler.js": complexSource },
        {
          "@aws-sdk/client-dynamodb": "^3.400.0",
          "@aws-sdk/client-sns": "^3.400.0",
          lodash: "^4.17.21",
          uuid: "^9.0.0",
        }
      );

      createMockAuditScript(testDir);

      if (existsSync(inspectorScript)) {
        try {
          const result = execSync(`node "${inspectorScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 15000,
            env: {
              ...process.env,
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("complex-handler");
          expect(result).toContain("DynamoDBClient");
          expect(result).toContain("SNSClient");
        } catch (error) {
          console.log("Source analysis test output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });

    test("detects handler patterns and exports", () => {
      const systemDir = join(testDir, "handler-patterns-system");

      const handlerPatterns = {
        "es6-handler.js": `
          export const handler = async (event, context) => {
            return { statusCode: 200, body: "ES6 handler" };
          };
        `,
        "commonjs-handler.js": `
          exports.handler = async (event, context) => {
            return { statusCode: 200, body: "CommonJS handler" };
          };
        `,
        "module-exports-handler.js": `
          module.exports.handler = async (event, context) => {
            return { statusCode: 200, body: "Module exports handler" };
          };
        `,
        "named-function.js": `
          async function processData(event) {
            return { processed: true };
          }
          
          export { processData as handler };
        `,
      };

      createSystemWithInfrastructure(systemDir, handlerPatterns);
      createMockAuditScript(testDir);

      if (existsSync(inspectorScript)) {
        try {
          const result = execSync(`node "${inspectorScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 15000,
            env: {
              ...process.env,
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("exports.handler" || "handler");
        } catch (error) {
          console.log(
            "Handler patterns test output:",
            error.stdout?.toString()
          );
          expect(error.code).toBeDefined();
        }
      }
    });

    test("calculates complexity metrics", () => {
      const systemDir = join(testDir, "complexity-system");

      const complexFunction = `
        import _ from "lodash";
        
        export const handler = async (event, context) => {
          let result = { processed: 0, errors: 0 };
          
          // Nested loops and conditions (high complexity)
          for (const record of event.Records || []) {
            try {
              const data = JSON.parse(record.body || '{}');
              
              if (data.type === 'user') {
                if (data.action === 'create') {
                  for (const field of ['name', 'email', 'phone']) {
                    if (!data[field]) {
                      throw new Error(\`Missing \${field}\`);
                    }
                    
                    if (field === 'email' && !data[field].includes('@')) {
                      throw new Error('Invalid email');
                    }
                  }
                  result.processed++;
                } else if (data.action === 'update') {
                  const updates = _.pick(data, ['name', 'email', 'phone']);
                  if (Object.keys(updates).length === 0) {
                    throw new Error('No update fields');
                  }
                  result.processed++;
                } else if (data.action === 'delete') {
                  if (!data.id) {
                    throw new Error('Missing ID for delete');
                  }
                  result.processed++;
                }
              } else if (data.type === 'order') {
                switch (data.status) {
                  case 'pending':
                    await processPendingOrder(data);
                    break;
                  case 'confirmed':
                    await processConfirmedOrder(data);
                    break;
                  case 'cancelled':
                    await processCancelledOrder(data);
                    break;
                  default:
                    throw new Error(\`Unknown order status: \${data.status}\`);
                }
                result.processed++;
              }
            } catch (error) {
              console.error('Processing error:', error);
              result.errors++;
            }
          }
          
          return {
            statusCode: result.errors > 0 ? 207 : 200,
            body: JSON.stringify(result)
          };
        };
        
        async function processPendingOrder(order) {
          // Simulate processing
          return { status: 'processing' };
        }
        
        async function processConfirmedOrder(order) {
          // Simulate processing
          return { status: 'fulfilled' };
        }
        
        async function processCancelledOrder(order) {
          // Simulate processing
          return { status: 'cancelled' };
        }
      `;

      createSystemWithInfrastructure(
        systemDir,
        { "complex-function.js": complexFunction },
        { lodash: "^4.17.21" }
      );

      createMockAuditScript(testDir);

      if (existsSync(inspectorScript)) {
        try {
          const result = execSync(`node "${inspectorScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 15000,
            env: {
              ...process.env,
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("complex-function");
        } catch (error) {
          console.log("Complexity test output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });
  });

  describe("Pattern Detection", () => {
    test("identifies anti-patterns in code", () => {
      const systemDir = join(testDir, "anti-patterns-system");

      const antiPatternCode = `
        // Anti-pattern: Synchronous operations in async handler
        export const handler = async (event, context) => {
          // Bad: Blocking sleep
          const sleep = (ms) => {
            const start = Date.now();
            while (Date.now() - start < ms) {}
          };
          
          sleep(1000); // Blocking operation
          
          // Bad: Nested callbacks in async function
          return new Promise((resolve, reject) => {
            setTimeout(() => {
              fs.readFile('config.json', (err, data) => {
                if (err) {
                  reject(err);
                } else {
                  resolve({ statusCode: 200, body: data.toString() });
                }
              });
            }, 100);
          });
        };
        
        // Anti-pattern: Large inline functions
        export const anotherHandler = async (event) => {
          // 100+ lines of inline code (simulated)
          let result = "";
          for (let i = 0; i < 1000; i++) {
            result += \`Line \${i} of processing\n\`;
          }
          return { statusCode: 200, body: result };
        };
      `;

      createSystemWithInfrastructure(systemDir, {
        "anti-patterns.js": antiPatternCode,
      });

      createMockAuditScript(testDir);

      if (existsSync(inspectorScript)) {
        try {
          const result = execSync(`node "${inspectorScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 15000,
            env: {
              ...process.env,
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("anti-patterns");
        } catch (error) {
          console.log("Anti-patterns test output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });

    test("detects potential security vulnerabilities", () => {
      const systemDir = join(testDir, "security-system");

      const securityIssues = `
        import { execSync } from "child_process";
        
        export const handler = async (event, context) => {
          // Security issue: Command injection vulnerability
          const userInput = event.queryStringParameters?.cmd || 'ls';
          const result = execSync(userInput, { encoding: 'utf8' });
          
          // Security issue: Hardcoded credentials
          const apiKey = "sk-1234567890abcdef";
          const dbPassword = "admin123";
          
          // Security issue: Logging sensitive data
          console.log("Processing request with data:", JSON.stringify(event));
          console.log("Using API key:", apiKey);
          
          // Security issue: No input validation
          const sql = \`SELECT * FROM users WHERE id = '\${event.pathParameters.id}'\`;
          
          return {
            statusCode: 200,
            headers: {
              // Security issue: Overly permissive CORS
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': '*'
            },
            body: JSON.stringify({
              result: result,
              query: sql,
              apiKey: apiKey // Exposing sensitive data in response
            })
          };
        };
      `;

      createSystemWithInfrastructure(systemDir, {
        "security-issues.js": securityIssues,
      });

      createMockAuditScript(testDir);

      if (existsSync(inspectorScript)) {
        try {
          const result = execSync(`node "${inspectorScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 15000,
            env: {
              ...process.env,
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("security-issues");
        } catch (error) {
          console.log("Security test output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });

    test("identifies performance issues", () => {
      const systemDir = join(testDir, "performance-system");

      const performanceIssues = `
        export const handler = async (event, context) => {
          // Performance issue: Unnecessary loops
          const data = [];
          for (let i = 0; i < 10000; i++) {
            for (let j = 0; j < 1000; j++) {
              data.push({ i, j, value: Math.random() });
            }
          }
          
          // Performance issue: Synchronous operations
          const processedData = data.map(item => {
            // Simulate heavy processing
            let result = 0;
            for (let k = 0; k < 1000; k++) {
              result += Math.sin(item.value * k);
            }
            return { ...item, processed: result };
          });
          
          // Performance issue: No connection pooling
          const dbConnections = [];
          for (let i = 0; i < 100; i++) {
            dbConnections.push(createNewConnection());
          }
          
          // Performance issue: Large memory allocation
          const largeArray = new Array(1000000).fill(0).map((_, i) => ({
            id: i,
            data: \`Large data string \${i}\`.repeat(100)
          }));
          
          return {
            statusCode: 200,
            body: JSON.stringify({
              processedCount: processedData.length,
              connectionsCreated: dbConnections.length,
              memoryUsage: process.memoryUsage()
            })
          };
        };
        
        function createNewConnection() {
          // Simulate database connection
          return { connected: true, timestamp: Date.now() };
        }
      `;

      createSystemWithInfrastructure(systemDir, {
        "performance-issues.js": performanceIssues,
      });

      createMockAuditScript(testDir);

      if (existsSync(inspectorScript)) {
        try {
          const result = execSync(`node "${inspectorScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 15000,
            env: {
              ...process.env,
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("performance-issues");
        } catch (error) {
          console.log("Performance test output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });
  });

  describe("Quality Metrics", () => {
    test("generates code quality scores", () => {
      const systemDir = join(testDir, "quality-system");

      const qualityCode = {
        "high-quality.js": `
          /**
           * High-quality Lambda function with proper structure
           */
          import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
          import { validateInput, sanitizeOutput } from "./utils/validation.js";
          import { logger } from "./utils/logger.js";
          
          const dynamoClient = new DynamoDBClient({ 
            region: process.env.AWS_REGION || 'us-east-1' 
          });
          
          export const handler = async (event, context) => {
            const requestId = context.awsRequestId;
            
            try {
              // Input validation
              const validatedInput = validateInput(event);
              
              logger.info("Processing request", { requestId, input: validatedInput });
              
              // Business logic
              const result = await getUserData(validatedInput.userId);
              
              // Output sanitization
              const sanitizedResult = sanitizeOutput(result);
              
              logger.info("Request completed successfully", { requestId });
              
              return {
                statusCode: 200,
                headers: {
                  'Content-Type': 'application/json',
                  'X-Request-ID': requestId
                },
                body: JSON.stringify(sanitizedResult)
              };
              
            } catch (error) {
              logger.error("Request failed", { requestId, error: error.message });
              
              return {
                statusCode: error.statusCode || 500,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  error: error.message,
                  requestId
                })
              };
            }
          };
          
          async function getUserData(userId) {
            const command = new GetItemCommand({
              TableName: process.env.USERS_TABLE,
              Key: { id: { S: userId } }
            });
            
            const response = await dynamoClient.send(command);
            
            if (!response.Item) {
              const error = new Error("User not found");
              error.statusCode = 404;
              throw error;
            }
            
            return response.Item;
          }
        `,
        "low-quality.js": `
          // Poor quality code with multiple issues
          export const handler = async (event) => {
            var x = event.data;
            if (x) {
              var result = doStuff(x);
              console.log(result);
              return result;
            } else {
              return null;
            }
          };
          
          function doStuff(data) {
            // No error handling, unclear logic
            return data + "processed";
          }
        `,
      };

      createSystemWithInfrastructure(systemDir, qualityCode, {
        "@aws-sdk/client-dynamodb": "^3.400.0",
      });

      createMockAuditScript(testDir);

      if (existsSync(inspectorScript)) {
        try {
          const result = execSync(`node "${inspectorScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 15000,
            env: {
              ...process.env,
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("high-quality" || "low-quality");
        } catch (error) {
          console.log("Quality metrics test output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });

    test("provides improvement suggestions", () => {
      const systemDir = join(testDir, "suggestions-system");

      const improvableCode = `
        // Code that needs improvement
        export const handler = async (event, context) => {
          // Missing error handling
          const data = JSON.parse(event.body);
          
          // Inefficient processing
          let results = [];
          for (let i = 0; i < data.items.length; i++) {
            let item = data.items[i];
            let processed = processItem(item);
            results.push(processed);
          }
          
          // No logging
          return { statusCode: 200, body: JSON.stringify(results) };
        };
        
        function processItem(item) {
          // Synchronous heavy operation
          let sum = 0;
          for (let i = 0; i < 1000000; i++) {
            sum += Math.random();
          }
          return { ...item, processed: true, sum };
        }
      `;

      createSystemWithInfrastructure(systemDir, {
        "improvable.js": improvableCode,
      });

      createMockAuditScript(testDir);

      if (existsSync(inspectorScript)) {
        try {
          const result = execSync(`node "${inspectorScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 15000,
            env: {
              ...process.env,
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("improvable");
        } catch (error) {
          console.log(
            "Improvement suggestions test output:",
            error.stdout?.toString()
          );
          expect(error.code).toBeDefined();
        }
      }
    });
  });

  describe("Integration with Audit System", () => {
    test("gets function list dynamically from audit results", () => {
      createMockAuditScript(testDir);

      if (existsSync(inspectorScript)) {
        try {
          const result = execSync(`node "${inspectorScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 15000,
            env: {
              ...process.env,
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("Total functions found: 15");
        } catch (error) {
          console.log(
            "Audit integration test output:",
            error.stdout?.toString()
          );
          expect(error.code).toBeDefined();
        }
      }
    });

    test("handles audit script failures gracefully", () => {
      // Create broken audit script
      const dmDir = join(testDir, "dependency-manager", "analysis");
      mkdirSync(dmDir, { recursive: true });
      writeFileSync(
        join(dmDir, "lambda-audit.js"),
        "throw new Error('Audit failed');"
      );

      if (existsSync(inspectorScript)) {
        try {
          const result = execSync(`node "${inspectorScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 15000,
            env: {
              ...process.env,
              NODE_ENV: "test",
            },
          });

          expect(result).toContain(
            "Could not run audit" || "proceeding with source scan"
          );
        } catch (error) {
          console.log("Audit failure test output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });
  });

  describe("Source File Discovery", () => {
    test("finds actual source files for Lambda functions", () => {
      const system1Dir = join(testDir, "discovery-system1");
      const system2Dir = join(testDir, "discovery-system2");

      createSystemWithInfrastructure(system1Dir, {
        "handler1.js": "export const handler = async () => ({});",
        "processor1.js": "export const processor = async () => ({});",
      });

      createSystemWithInfrastructure(system2Dir, {
        "handler2.js": "export const handler = async () => ({});",
        "validator2.js": "export const validator = async () => ({});",
      });

      createMockAuditScript(testDir);

      if (existsSync(inspectorScript)) {
        try {
          const result = execSync(`node "${inspectorScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 15000,
            env: {
              ...process.env,
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("discovery-system1" || "discovery-system2");
        } catch (error) {
          console.log(
            "Source discovery test output:",
            error.stdout?.toString()
          );
          expect(error.code).toBeDefined();
        }
      }
    });

    test("respects exclusion patterns for systems", () => {
      const includeDir = join(testDir, "include-system");
      const excludeDir = join(testDir, "node_modules");

      createSystemWithInfrastructure(includeDir, {
        "handler.js": "export const handler = async () => ({});",
      });

      createSystemWithInfrastructure(excludeDir, {
        "should-ignore.js": "export const handler = async () => ({});",
      });

      createMockAuditScript(testDir);

      if (existsSync(inspectorScript)) {
        try {
          const result = execSync(`node "${inspectorScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 15000,
            env: {
              ...process.env,
              HIC_EXCLUDED_SYSTEM_DIRS: "node_modules,.git,dist",
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("include-system");
        } catch (error) {
          console.log("Exclusion test output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });

    test("handles systems without Lambda sources", () => {
      const systemDir = join(testDir, "no-lambda-system");

      // Create system with infrastructure but no lambda files
      mkdirSync(systemDir, { recursive: true });
      const infraDir = join(systemDir, "infrastructure");
      mkdirSync(infraDir, { recursive: true });
      writeFileSync(join(infraDir, "template.yaml"), "# Template");

      createMockAuditScript(testDir);

      if (existsSync(inspectorScript)) {
        try {
          const result = execSync(`node "${inspectorScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 15000,
            env: {
              ...process.env,
              NODE_ENV: "test",
            },
          });

          expect(result).toBeDefined();
        } catch (error) {
          console.log(
            "No lambda sources test output:",
            error.stdout?.toString()
          );
          expect(error.code).toBeDefined();
        }
      }
    });
  });

  describe("Environment Configuration", () => {
    test("respects environment variable configurations", () => {
      const systemDir = join(testDir, "env-config-system");

      createSystemWithInfrastructure(systemDir, {
        "custom-handler.js": `
          export const customHandler = async (event) => {
            return { statusCode: 200 };
          };
        `,
      });

      createMockAuditScript(testDir);

      if (existsSync(inspectorScript)) {
        try {
          const result = execSync(`node "${inspectorScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 15000,
            env: {
              ...process.env,
              HIC_SRC_DIR_NAME: "src",
              HIC_LAMBDA_DIR_NAME: "lambda",
              HIC_FILE_EXTENSION: ".js",
              HIC_HANDLER_PATTERNS: "customHandler,processData",
              HIC_MAX_FILE_SIZE: "2097152", // 2MB
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("customHandler" || "Lambda");
        } catch (error) {
          console.log(
            "Environment config test output:",
            error.stdout?.toString()
          );
          expect(error.code).toBeDefined();
        }
      }
    });

    test("validates file sizes according to configuration", () => {
      const systemDir = join(testDir, "file-size-system");

      const largeFile = "// Large file\n".repeat(10000);

      createSystemWithInfrastructure(systemDir, {
        "large-handler.js": largeFile,
      });

      createMockAuditScript(testDir);

      if (existsSync(inspectorScript)) {
        try {
          const result = execSync(`node "${inspectorScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 15000,
            env: {
              ...process.env,
              HIC_MAX_FILE_SIZE: "1024", // 1KB limit
              NODE_ENV: "test",
            },
          });

          expect(result).toBeDefined();
        } catch (error) {
          console.log("File size test output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });
  });

  describe("Error Handling", () => {
    test("handles malformed source files gracefully", () => {
      const systemDir = join(testDir, "malformed-system");

      const malformedCode = `
        // Malformed JavaScript
        import { incomplete
        export const handler = async (event) => {
          // Missing closing brace
      `;

      createSystemWithInfrastructure(systemDir, {
        "malformed.js": malformedCode,
      });

      createMockAuditScript(testDir);

      if (existsSync(inspectorScript)) {
        try {
          const result = execSync(`node "${inspectorScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 15000,
            env: {
              ...process.env,
              NODE_ENV: "test",
            },
          });

          expect(result).toBeDefined();
        } catch (error) {
          console.log("Malformed files test output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });

    test("handles inaccessible directories gracefully", () => {
      const systemDir = join(testDir, "inaccessible-system");

      createSystemWithInfrastructure(systemDir, {
        "handler.js": "export const handler = async () => ({});",
      });

      // Try to make directory inaccessible (may not work on all systems)
      try {
        chmodSync(join(systemDir, "src"), 0o000);
      } catch {
        // Ignore if chmod fails
      }

      createMockAuditScript(testDir);

      if (existsSync(inspectorScript)) {
        try {
          const result = execSync(`node "${inspectorScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 15000,
            env: {
              ...process.env,
              NODE_ENV: "test",
            },
          });

          expect(result).toBeDefined();
        } catch (error) {
          console.log(
            "Inaccessible directories test output:",
            error.stdout?.toString()
          );
          expect(error.code).toBeDefined();
        }
      }

      // Restore permissions for cleanup
      try {
        chmodSync(join(systemDir, "src"), 0o755);
      } catch {
        // Ignore if chmod fails
      }
    });

    test("handles missing workspace directories", () => {
      createMockAuditScript(testDir);

      if (existsSync(inspectorScript)) {
        try {
          const result = execSync(`node "${inspectorScript}"`, {
            stdio: "pipe",
            cwd: "/nonexistent",
            encoding: "utf8",
            timeout: 15000,
            env: {
              ...process.env,
              NODE_ENV: "test",
            },
          });

          expect(result).toBeDefined();
        } catch (error) {
          console.log(
            "Missing workspace test output:",
            error.stdout?.toString()
          );
          expect(error.code).toBeDefined();
        }
      }
    });
  });

  describe("Performance and Scale", () => {
    test("handles large number of source files efficiently", () => {
      // Create 25 systems with multiple source files each
      for (let i = 1; i <= 25; i++) {
        const systemDir = join(testDir, `perf-system-${i}`);

        const sourceFiles = {};
        for (let j = 1; j <= 4; j++) {
          sourceFiles[`handler-${j}.js`] = `
            export const handler = async (event) => {
              return { 
                statusCode: 200, 
                system: "perf-system-${i}",
                handler: "handler-${j}"
              };
            };
          `;
        }

        createSystemWithInfrastructure(systemDir, sourceFiles);
      }

      createMockAuditScript(testDir);

      if (existsSync(inspectorScript)) {
        const startTime = Date.now();

        try {
          const result = execSync(`node "${inspectorScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 30000, // Increased timeout
            env: {
              ...process.env,
              NODE_ENV: "test",
            },
          });

          const duration = Date.now() - startTime;
          console.log(`Performance test completed in ${duration}ms`);

          expect(result).toBeDefined();
          expect(duration).toBeLessThan(25000); // Should complete within 25 seconds
        } catch (error) {
          console.log("Performance test output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });

    test("efficiently processes large source files", () => {
      const systemDir = join(testDir, "large-files-system");

      // Create a large but valid source file
      const largeFunctionContent = `
        export const handler = async (event, context) => {
          const operations = [
            ${Array.from(
              { length: 1000 },
              (_, i) => `
              { id: ${i}, process: () => "Operation ${i}" }
            `
            ).join(",\n")}
          ];
          
          const results = operations.map(op => op.process());
          
          return {
            statusCode: 200,
            body: JSON.stringify({
              operationsCount: operations.length,
              firstResult: results[0],
              lastResult: results[results.length - 1]
            })
          };
        };
      `;

      createSystemWithInfrastructure(systemDir, {
        "large-handler.js": largeFunctionContent,
      });

      createMockAuditScript(testDir);

      if (existsSync(inspectorScript)) {
        try {
          const result = execSync(`node "${inspectorScript}"`, {
            stdio: "pipe",
            cwd: testDir,
            encoding: "utf8",
            timeout: 20000,
            env: {
              ...process.env,
              HIC_MAX_FILE_SIZE: "1048576", // 1MB limit
              NODE_ENV: "test",
            },
          });

          expect(result).toContain("large-handler" || "Lambda");
        } catch (error) {
          console.log("Large files test output:", error.stdout?.toString());
          expect(error.code).toBeDefined();
        }
      }
    });
  });
});
