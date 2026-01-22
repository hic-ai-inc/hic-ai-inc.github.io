# DM Facade System

**External Interface for HIC Systems Dependency Management**

The `/dm/facade` directory provides the external-facing interface that other HIC systems use to access centralized dependency management. It acts as a service provider, offering both AWS SDK helpers and testing utilities through a clean, simple API.

## 🎯 **System Role**

The DM Facade serves as the **service provider** for the HIC platform:

- **External Interface**: What other HIC systems import and use
- **Abstraction Layer**: Hides DM system complexity behind simple APIs
- **Dependency Isolation**: Other systems don't need to know about AWS SDK versions
- **Testing Integration**: Provides both production and test utilities

## 📁 **Directory Structure**

```
/dm/facade/
├── helpers/           # AWS SDK mock clients for HIC systems
│   ├── README.md      # Developer guide for AWS helpers
│   ├── dynamodb.js    # DynamoDB client helper
│   ├── s3.js          # S3 client helper
│   ├── lambda.js      # Lambda client helper
│   └── ...            # Other AWS service helpers
├── test-helpers/      # Lightweight testing framework
│   ├── README.md      # Developer guide for test framework
│   ├── expect.js      # Jest-like assertion library
│   ├── spy.js         # Function mocking utilities
│   └── index.js       # Main test framework exports
└── README.md          # This file
```

## 🚀 **Quick Start for HIC Systems**

### **1. Import AWS Helpers**

```javascript
// In your Lambda function or HIC system
import { getDynamoDBClient } from "@hic/dm-facade-helpers/dynamodb";
import { getS3Client } from "@hic/dm-facade-helpers/s3";

// Use in production (real AWS services)
const dynamodb = getDynamoDBClient({ mock: false });
const s3 = getS3Client({ mock: false });
```

### **2. Import Test Framework**

```javascript
// In your test files
import { describe, test, expect } from "@hic/dm-facade-test-helpers";
import { getDynamoDBClient } from "@hic/dm-facade-helpers/dynamodb";

describe("My Function Tests", () => {
  test("should work with mocked AWS services", async () => {
    const dynamodb = getDynamoDBClient({ mock: true });
    // Test your code with mocked services
  });
});
```

## 🧩 **Integration Patterns**

### **Pattern 1: Lambda Function with DM Layers**

```javascript
// CloudFormation template
"MyLambdaFunction": {
  "Type": "AWS::Lambda::Function",
  "Properties": {
    "Layers": [
      "arn:aws:lambda:us-east-1:123456789012:layer:hic-base-layer:1",
      "arn:aws:lambda:us-east-1:123456789012:layer:hic-dynamodb-layer:1"
    ],
    "Handler": "index.handler",
    "Runtime": "nodejs18.x"
  }
}

// Lambda function code (index.js)
import { getDynamoDBClient } from '@hic/dm-facade-helpers/dynamodb';

export const handler = async (event) => {
  const dynamodb = getDynamoDBClient();
  // Your Lambda logic here
};
```

### **Pattern 2: HIC System Testing**

```javascript
// test/my-function.test.js
import { describe, test, expect, spy } from "@hic/dm-facade-test-helpers";
import { getDynamoDBClient } from "@hic/dm-facade-helpers/dynamodb";
import { handler } from "../src/my-lambda";

describe("My Lambda Handler", () => {
  test("should process events correctly", async () => {
    const mockClient = getDynamoDBClient({ mock: true });
    const mockPut = spy().mockResolvedValue({
      $metadata: { httpStatusCode: 200 },
    });
    mockClient.putItem = mockPut;

    const result = await handler(testEvent);

    expect(result.statusCode).toBe(200);
    expect(mockPut).toHaveBeenCalledTimes(1);
  });
});
```

### **Pattern 3: Multi-Service Integration**

```javascript
// Using multiple AWS services together
import { getDynamoDBClient } from "@hic/dm-facade-helpers/dynamodb";
import { getS3Client } from "@hic/dm-facade-helpers/s3";
import { getSQSClient } from "@hic/dm-facade-helpers/sqs";

async function processUserData(userData) {
  const dynamodb = getDynamoDBClient();
  const s3 = getS3Client();
  const sqs = getSQSClient();

  // Store user in database
  await dynamodb.putItem({
    /* ... */
  });

  // Upload profile image to S3
  await s3.putObject({
    /* ... */
  });

  // Send notification message
  await sqs.sendMessage({
    /* ... */
  });
}
```

## 🔧 **Configuration & Environment**

### **Automatic Environment Detection**

The facade system automatically detects the environment:

```javascript
// Automatically uses mock in test environment
process.env.NODE_ENV = "test";
const client = getServiceClient(); // Will be mocked

// Automatically uses real AWS in production
process.env.NODE_ENV = "production";
const client = getServiceClient(); // Will be real AWS SDK
```

### **Manual Override**

```javascript
// Force mock mode
const client = getServiceClient({ mock: true });

// Force real AWS mode
const client = getServiceClient({ mock: false });
```

### **Global Configuration**

```javascript
// Set global defaults
process.env.DM_MOCK_MODE = "true"; // Force all clients to mock
process.env.DM_AWS_REGION = "us-east-1"; // Default region
process.env.DM_LOG_LEVEL = "debug"; // Enable debug logging
```

## 📊 **Testing Integration**

### **Test Suite Structure**

```javascript
// Recommended test file structure
import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
} from "@hic/dm-facade-test-helpers";

describe("User Management Service", () => {
  let mockClients;

  beforeEach(() => {
    // Setup mocks before each test
    mockClients = setupMockClients();
  });

  afterEach(() => {
    // Cleanup after each test
    resetMocks();
  });

  describe("User Creation", () => {
    test("should create user with valid data", async () => {
      // Individual test logic
    });
  });

  describe("User Retrieval", () => {
    test("should fetch user by ID", async () => {
      // Individual test logic
    });
  });
});
```

### **Mock Reset Patterns**

```javascript
// Pattern for managing mock state
import { spy } from "@hic/dm-facade-test-helpers";

let mockDynamoDB, mockS3, mockSQS;

beforeEach(() => {
  // Create fresh mocks for each test
  mockDynamoDB = getDynamoDBClient({ mock: true });
  mockS3 = getS3Client({ mock: true });
  mockSQS = getSQSClient({ mock: true });

  // Setup spy implementations
  mockDynamoDB.putItem = spy().mockResolvedValue({});
  mockS3.putObject = spy().mockResolvedValue({});
  mockSQS.sendMessage = spy().mockResolvedValue({});
});
```

## 📚 **Available Services**

### **Currently Supported AWS Services**

- **DynamoDB** - Database operations with table mocking
- **S3** - Object storage with bucket simulation
- **Lambda** - Function invocation with response mocking
- **SQS** - Message queuing with queue simulation
- **SNS** - Notification publishing with topic mocking
- **CloudWatch** - Metrics and logging simulation
- **Systems Manager** - Parameter store mocking
- **Secrets Manager** - Secret retrieval simulation

### **Service Helper API**

Each service helper follows a consistent pattern:

```javascript
const client = getServiceClient({
  mock: boolean, // Use mock implementation
  region: string, // AWS region (for real clients)
  endpoint: string, // Custom endpoint URL
  // ...other AWS SDK client options
});
```

## 🎯 **Best Practices**

### **1. Use Environment Detection**

```javascript
// Good - automatic detection
const client = getServiceClient();

// Avoid - hardcoded mock setting (unless testing mocks specifically)
const client = getServiceClient({ mock: true });
```

### **2. Consistent Error Handling**

```javascript
// Handle both mock and real AWS errors consistently
try {
  const result = await client.someOperation(params);
  return { success: true, data: result };
} catch (error) {
  console.error("AWS operation failed:", error.message);
  return { success: false, error: error.message };
}
```

### **3. Resource Management**

```javascript
// Some services may need cleanup
afterEach(async () => {
  // Clean up any test resources
  await client.cleanup?.();
});
```

### **4. Test Independence**

```javascript
// Ensure tests don't interfere with each other
beforeEach(() => {
  // Reset all mock state
  resetAllMocks();
});
```

## 🔄 **Migration Guide**

### **From Direct AWS SDK**

**Before**:

```javascript
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({ region: "us-east-1" });
const command = new PutItemCommand(params);
await client.send(command);
```

**After**:

```javascript
import { getDynamoDBClient } from "@hic/dm-facade-helpers/dynamodb";

const client = getDynamoDBClient();
await client.putItem(params); // Simplified API
```

### **From Jest Testing**

**Before**:

```javascript
jest.mock("@aws-sdk/client-dynamodb");
const mockSend = jest.fn().mockResolvedValue({});
```

**After**:

```javascript
import { spy } from "@hic/dm-facade-test-helpers";
import { getDynamoDBClient } from "@hic/dm-facade-helpers/dynamodb";

const client = getDynamoDBClient({ mock: true });
client.putItem = spy().mockResolvedValue({});
```

## 🚨 **Troubleshooting**

### **Common Issues**

1. **Module not found errors**

   - Ensure Lambda function references correct DM layer ARNs
   - Verify layers are properly published and available

2. **Real AWS calls in tests**

   - Check `NODE_ENV` is set to 'test'
   - Verify mock configuration: `{ mock: true }`

3. **Inconsistent behavior across environments**
   - Use environment detection instead of hardcoded mock settings
   - Check for conflicting environment variables

### **Debug Mode**

```javascript
// Enable debug logging
process.env.DM_LOG_LEVEL = "debug";

// Will log client creation and configuration
const client = getServiceClient();
```

## 📈 **Performance**

The facade system is optimized for Lambda environments:

- **Fast startup**: Minimal initialization overhead
- **Lazy loading**: Services loaded only when needed
- **Memory efficient**: Shared client instances where safe
- **Mock optimization**: Test mocks designed for speed

## 🔗 **Related Documentation**

- **[Facade Helpers](helpers/README.md)** - Detailed guide for AWS service helpers
- **[Test Helpers](test-helpers/README.md)** - Complete testing framework documentation
- **[DM System Overview](../README.md)** - Main DM system documentation
- **[Layer Management](../layers/README.md)** - How to use DM layers

---

**Documentation Version**: September 3, 2025  
**Last Updated**: Post Phase 1-3 Code Review  
**System Status**: Production Ready  
**Maintainer**: HIC DM Team
