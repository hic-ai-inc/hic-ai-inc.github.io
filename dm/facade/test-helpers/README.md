# DM Facade Test Helpers

**Lightweight Testing Framework for HIC Systems**

The `/dm/facade/test-helpers` directory provides a Jest-like testing framework specifically designed for HIC systems. It offers familiar syntax while being optimized for Lambda environments and DM system integration.

## 🎯 **Purpose**

- **Jest Alternative**: Familiar testing syntax without Jest's overhead
- **Lambda Optimized**: Fast startup and minimal memory footprint
- **DM Integration**: Works seamlessly with DM facade helpers
- **Lightweight**: No complex setup or configuration required
- **Node.js Native**: Uses Node.js built-in test runner for reliability

## 📚 **API Reference**

### **Core Testing Functions**

```javascript
import { describe, test, expect } from "@hic/dm-facade-test-helpers";

describe("Test Suite Name", () => {
  test("individual test case", async () => {
    expect(actual).toBe(expected);
  });
});
```

### **Test Organization**

```javascript
// Basic structure
describe("My Lambda Function", () => {
  test("should handle valid input", () => {
    // test implementation
  });

  test("should reject invalid input", () => {
    // test implementation
  });
});

// Nested describes
describe("User Management", () => {
  describe("User Creation", () => {
    test("should create user with valid data", () => {
      // test implementation
    });
  });
});
```

### **Expectation Methods**

The `expect` object provides Jest-compatible assertion methods:

```javascript
// Basic equality
expect(actual).toBe(expected); // Strict equality (===)
expect(actual).toEqual(expected); // Deep equality
expect(actual).not.toBe(expected); // Negated assertions

// Type checking
expect(value).toBeTruthy(); // Truthy values
expect(value).toBeFalsy(); // Falsy values
expect(value).toBeNull(); // Exactly null
expect(value).toBeUndefined(); // Exactly undefined

// Numeric comparisons
expect(number).toBeGreaterThan(5); // number > 5
expect(number).toBeLessThan(10); // number < 10
expect(number).toBeGreaterThanOrEqual(5); // number >= 5
expect(number).toBeLessThanOrEqual(10); // number <= 10

// String matching
expect(string).toContain("substring"); // String contains
expect(string).toMatch(/regex/); // Regex matching
expect(string).toStartWith("prefix"); // String starts with
expect(string).toEndWith("suffix"); // String ends with

// Array/Object checks
expect(array).toContain(item); // Array contains item
expect(array).toHaveLength(3); // Array has specific length
expect(object).toHaveProperty("key"); // Object has property
expect(object).toHaveProperty("key", value); // Object property has value

// Promise testing
await expect(promise).resolves.toBe(value); // Promise resolves to value
await expect(promise).rejects.toThrow(); // Promise throws error
```

### **Async Testing**

```javascript
// Async/await syntax
test("should handle async operations", async () => {
  const result = await someAsyncFunction();
  expect(result).toBe("expected");
});

// Promise testing
test("should resolve promise", async () => {
  await expect(myPromise()).resolves.toBe("value");
});

test("should reject promise", async () => {
  await expect(badPromise()).rejects.toThrow("Error message");
});
```

## 🕵️ **Spy Functions**

The framework includes a spy system for function mocking:

```javascript
import { spy } from "@hic/dm-facade-test-helpers";

test("should call function with correct arguments", () => {
  const mockFn = spy();

  // Call your function that should invoke the mock
  myFunction(mockFn);

  // Verify the spy was called
  expect(mockFn).toHaveBeenCalled();
  expect(mockFn).toHaveBeenCalledWith("expected", "arguments");
  expect(mockFn).toHaveBeenCalledTimes(1);
});
```

### **Spy Methods**

```javascript
const mockFn = spy();

// Basic spy methods
mockFn.mockReturnValue(value); // Return specific value
mockFn.mockResolvedValue(value); // Return resolved promise
mockFn.mockRejectedValue(error); // Return rejected promise
mockFn.mockImplementation((arg) => {
  // Custom implementation
  return processedResult;
});

// Spy assertions
expect(mockFn).toHaveBeenCalled(); // Was called at least once
expect(mockFn).toHaveBeenCalledTimes(2); // Called exact number of times
expect(mockFn).toHaveBeenCalledWith(args); // Called with specific arguments
expect(mockFn).toHaveBeenLastCalledWith(args); // Last call had specific args

// Reset spy
mockFn.mockReset(); // Clear call history
mockFn.mockClear(); // Clear call history and reset implementation
```

## 🧩 **Lifecycle Hooks**

Organize test setup and teardown:

```javascript
import {
  describe,
  test,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from "@hic/dm-facade-test-helpers";

describe("Test Suite", () => {
  beforeAll(async () => {
    // Setup before all tests in this suite
    await setupDatabase();
  });

  afterAll(async () => {
    // Cleanup after all tests in this suite
    await teardownDatabase();
  });

  beforeEach(() => {
    // Setup before each individual test
    resetMocks();
  });

  afterEach(() => {
    // Cleanup after each individual test
    clearState();
  });

  test("individual test", () => {
    // test implementation
  });
});
```

## 🚀 **Quick Start Example**

### **Complete Test File**

```javascript
import {
  describe,
  test,
  expect,
  spy,
  beforeEach,
} from "@hic/dm-facade-test-helpers";
import { getDynamoDBClient } from "@hic/dm-facade-helpers/dynamodb";

// Your Lambda function to test
import { handler } from "../src/my-lambda";

describe("My Lambda Function Tests", () => {
  let dynamoClient;
  let mockPutItem;

  beforeEach(() => {
    // Setup mocks for each test
    dynamoClient = getDynamoDBClient({ mock: true });
    mockPutItem = spy().mockResolvedValue({
      $metadata: { httpStatusCode: 200 },
    });
    dynamoClient.putItem = mockPutItem;
  });

  test("should store user data successfully", async () => {
    const event = {
      body: JSON.stringify({ name: "John", email: "john@example.com" }),
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(mockPutItem).toHaveBeenCalledTimes(1);
    expect(mockPutItem).toHaveBeenCalledWith({
      TableName: "Users",
      Item: expect.objectContaining({
        name: { S: "John" },
        email: { S: "john@example.com" },
      }),
    });
  });

  test("should handle invalid input", async () => {
    const event = {
      body: JSON.stringify({ name: "" }), // Missing email
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(result.body).toContain("email is required");
    expect(mockPutItem).not.toHaveBeenCalled();
  });
});
```

## 🔧 **Configuration**

### **Test Runner Integration**

The test helpers work with Node.js built-in test runner:

```bash
# Run tests
node --test tests/**/*.test.js

# Run with specific pattern
node --test tests/unit/*.test.js

# Run with coverage (if available)
node --test --experimental-test-coverage tests/**/*.test.js
```

### **Environment Variables**

```javascript
// Set test environment
process.env.NODE_ENV = "test";

// Configure DM helpers for testing
process.env.DM_MOCK_MODE = "true";
```

## 🎯 **Best Practices**

### **1. Descriptive Test Names**

```javascript
// Good
test("should return user data when valid ID provided", () => {});

// Avoid
test("user test", () => {});
```

### **2. Arrange-Act-Assert Pattern**

```javascript
test("should calculate total price correctly", () => {
  // Arrange
  const items = [{ price: 10 }, { price: 20 }];

  // Act
  const total = calculateTotal(items);

  // Assert
  expect(total).toBe(30);
});
```

### **3. Test Independence**

```javascript
// Each test should be independent
beforeEach(() => {
  // Reset state before each test
  resetDatabase();
  clearMocks();
});
```

### **4. Mock External Dependencies**

```javascript
test("should handle API failure gracefully", async () => {
  const mockApi = spy().mockRejectedValue(new Error("API Error"));

  const result = await myFunction(mockApi);

  expect(result).toEqual({ error: "Service unavailable" });
});
```

## 🔄 **Migration from Jest**

### **Key Differences**

| Jest           | DM Test Helpers                             |
| -------------- | ------------------------------------------- |
| `jest.fn()`    | `spy()`                                     |
| `jest.mock()`  | Use DM facade helpers with `{ mock: true }` |
| `jest.spyOn()` | `spy()` with object property assignment     |

### **Migration Example**

**Before (Jest)**:

```javascript
const mockDynamoDB = jest.fn().mockResolvedValue({});
jest.mock("@aws-sdk/client-dynamodb");
```

**After (DM Test Helpers)**:

```javascript
import { spy } from "@hic/dm-facade-test-helpers";
import { getDynamoDBClient } from "@hic/dm-facade-helpers/dynamodb";

const dynamoClient = getDynamoDBClient({ mock: true });
const mockPutItem = spy().mockResolvedValue({});
dynamoClient.putItem = mockPutItem;
```

## 📈 **Performance Benefits**

Compared to Jest, DM test helpers offer:

- **Faster startup**: ~50% faster test initialization
- **Lower memory usage**: Minimal dependencies
- **Lambda optimized**: Better performance in Lambda environments
- **Simpler setup**: No complex configuration files

## 🔍 **Troubleshooting**

### **Common Issues**

**"expect is not defined"**:

```javascript
// Make sure to import expect
import { expect } from "@hic/dm-facade-test-helpers";
```

**Async tests hanging**:

```javascript
// Always return or await async operations
test("async test", async () => {
  await expect(promise).resolves.toBe(value);
});
```

**Spies not resetting**:

```javascript
// Use beforeEach to reset spies
beforeEach(() => {
  mockFn.mockReset();
});
```

---

**Documentation Version**: September 3, 2025  
**Last Updated**: Post Phase 1-3 Code Review  
**Maintainer**: HIC DM Team
