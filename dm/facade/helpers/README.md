# DM Facade Helpers

**Centralized AWS SDK Mock Clients for HIC Systems**

The `/dm/facade/helpers` directory provides a simple, consistent interface for HIC systems to obtain AWS SDK mock clients. This eliminates the need for each system to manage its own AWS SDK dependencies and mocking configurations.

## 🎯 **Purpose**

- **Centralized Mocking**: All HIC systems use the same AWS SDK mock implementations
- **Dependency Simplification**: No need to install AWS SDK packages in individual HIC systems
- **Consistent Testing**: Standardized mock behaviors across the HIC platform
- **Easy Integration**: Simple import statements replace complex mock setup

## 📁 **Available Helpers**

### **AWS Service Helpers**

The helpers are organized by AWS service and provide both real and mock clients:

```javascript
// Example structure (actual helpers may vary)
import { getDynamoDBClient } from "@hic/dm-facade-helpers/dynamodb";
import { getS3Client } from "@hic/dm-facade-helpers/s3";
import { getLambdaClient } from "@hic/dm-facade-helpers/lambda";
import { getSQSClient } from "@hic/dm-facade-helpers/sqs";
```

## 🚀 **Quick Start**

### **Installation**

The facade helpers are automatically available when you use DM layers in your Lambda functions. No additional installation required.

### **Basic Usage**

```javascript
// Import the helper for the AWS service you need
import { getDynamoDBClient } from "@hic/dm-facade-helpers/dynamodb";

// In your test file
const dynamodb = getDynamoDBClient({ mock: true });

// The client is pre-configured with appropriate mocks
await dynamodb.putItem({
  TableName: "TestTable",
  Item: { id: { S: "test-id" } },
});
```

### **Production vs Test Mode**

```javascript
// Production - uses real AWS SDK
const dynamodb = getDynamoDBClient({ mock: false });

// Testing - uses mock implementation
const dynamodb = getDynamoDBClient({ mock: true });

// Auto-detection based on environment
const dynamodb = getDynamoDBClient(); // Uses NODE_ENV to determine mock vs real
```

## 🧪 **Integration with DM Test Helpers**

The facade helpers work seamlessly with the DM test framework:

```javascript
import { describe, test, expect } from "@hic/dm-facade-test-helpers";
import { getDynamoDBClient } from "@hic/dm-facade-helpers/dynamodb";

describe("My Lambda Function", () => {
  test("should store data in DynamoDB", async () => {
    const dynamodb = getDynamoDBClient({ mock: true });

    // Your test logic here
    const result = await myFunction(dynamodb);

    expect(result).toBeTruthy();
  });
});
```

## 🔧 **Configuration Options**

Most helpers accept a configuration object:

```javascript
const client = getServiceClient({
  mock: true, // Use mock implementation
  region: "us-east-1", // AWS region (for real clients)
  endpoint: "custom", // Custom endpoint (for testing)
  // ... other AWS SDK options
});
```

## 📚 **Available Services**

The exact list of available services depends on the current DM layer builds. Common services include:

- **DynamoDB** - Database operations
- **S3** - Object storage
- **Lambda** - Function invocation
- **SQS** - Message queuing
- **SNS** - Notifications
- **CloudWatch** - Metrics and logging
- **Systems Manager** - Parameter store
- **Secrets Manager** - Secret storage

## 🎯 **Best Practices**

### **1. Use Environment Detection**

```javascript
// Good - automatically detects test vs production
const client = getServiceClient();

// Avoid - hardcoded mock setting
const client = getServiceClient({ mock: true });
```

### **2. Consistent Error Handling**

```javascript
try {
  const result = await client.someOperation();
  return result;
} catch (error) {
  // Mock clients throw realistic AWS errors
  console.error("AWS operation failed:", error.message);
  throw error;
}
```

### **3. Resource Cleanup**

```javascript
// Some helpers may provide cleanup methods
afterEach(async () => {
  await client.cleanup?.();
});
```

## 🔍 **Troubleshooting**

### **Common Issues**

**"Module not found" errors**:

- Ensure your Lambda function references the correct HIC layer ARN
- Check that the layer contains the facade helpers

**Mock not working as expected**:

- Verify `mock: true` is set in configuration
- Check that you're using the DM test environment

**Real AWS calls in tests**:

- Ensure `NODE_ENV=test` or explicitly set `mock: true`
- Verify test helpers are properly configured

### **Getting Help**

For issues with facade helpers:

1. Check the DM system logs for layer loading errors
2. Verify your Lambda function has the correct layer ARN
3. Ensure all DM layers are properly published
4. Review the DM system documentation for latest updates

## 🔄 **Migration Guide**

### **From Direct AWS SDK Usage**

**Before** (Direct AWS SDK):

```javascript
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
const dynamodb = new DynamoDBClient({ region: "us-east-1" });
```

**After** (DM Facade Helpers):

```javascript
import { getDynamoDBClient } from "@hic/dm-facade-helpers/dynamodb";
const dynamodb = getDynamoDBClient();
```

### **From Jest Mocks**

**Before** (Manual Jest mocking):

```javascript
jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({
    putItem: jest.fn().mockResolvedValue({}),
  })),
}));
```

**After** (DM Facade Helpers):

```javascript
import { getDynamoDBClient } from "@hic/dm-facade-helpers/dynamodb";
const dynamodb = getDynamoDBClient({ mock: true });
// Mocking is handled automatically
```

## 📈 **Version Compatibility**

The facade helpers are version-locked to specific AWS SDK versions through the DM layer system. This ensures:

- **Consistent behavior** across all HIC systems
- **Controlled updates** through DM layer versioning
- **No version conflicts** between different HIC systems

To update AWS SDK versions, work with the DM system maintainers to publish new layer versions.

---

**Documentation Version**: September 3, 2025  
**Last Updated**: Post Phase 1-3 Code Review  
**Maintainer**: HIC DM Team
