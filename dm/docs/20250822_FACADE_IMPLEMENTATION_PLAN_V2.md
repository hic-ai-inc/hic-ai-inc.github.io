# Facade Implementation Plan V2 - HIC Dependency Management

**Date**: August 22, 2025  
**Status**: Ready for implementation  
**Changes**: Incorporates GPT-5 feedback and corrections

## Executive Summary

The facade pattern provides a unified interface that abstracts complex dependency management. Instead of each HIC system managing AWS SDKs and Jest dependencies directly, they interact with a clean facade API that handles all complexity.

**Core Benefit**: Systems make simple requests ("I need DynamoDB mocking"), facade handles complexity (AWS SDK setup, version management, mock configuration).

## Architecture Overview

```
HIC Systems (QA, RFA, API, etc.)
         ↓ Simple Requests
    Facade Layer (@hic/testing-facade)
         ↓ Complex Operations
   Dependencies (AWS SDK, Jest, Layers)
```

## 1. DynamoDB Facade (Corrected Implementation)

### Problem: Current Complex Mocking

```javascript
// Each system manages raw AWS SDK mocking
const { mockClient } = require("aws-sdk-client-mock");
const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");

const ddbMock = mockClient(DynamoDBClient);
ddbMock
  .on(GetItemCommand, {
    TableName: "users",
    Key: { id: { S: "user123" } }, // Complex AWS AttributeValue format
  })
  .resolves({
    Item: { id: { S: "user123" }, name: { S: "John" } },
  });
```

### Solution: Facade-Simplified Mocking

```javascript
// Simple, declarative mocking API
const { createDynamoMock } = require("@hic/testing-facade/dynamodb");
const dynamo = createDynamoMock();

// Clean, intuitive interface with plain JS objects
dynamo.whenGetItem(
  { table: "users", key: { id: "user123" } },
  { id: "user123", name: "John" }
);
```

### Corrected Facade Implementation

```javascript
// shared/testing/helpers/dynamodb.js
const { mockClient } = require("aws-sdk-client-mock");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} = require("@aws-sdk/lib-dynamodb");
const { deepEqual } = require("../utils/deepEqual");
const { registerMock } = require("../utils/registry");

function createDynamoMock() {
  const docMock = mockClient(DynamoDBDocumentClient);
  docMock.rejectOnNoMatch(); // Guard against unexpected calls

  const api = {
    whenGetItemByKey({ table, key }, result) {
      docMock
        .on(
          GetCommand,
          (input) => input.TableName === table && deepEqual(input.Key, key)
        )
        .resolves(result == null ? {} : { Item: result });
    },
    whenGetItem({ table }, result) {
      docMock
        .on(GetCommand, (input) => input.TableName === table)
        .resolves(result == null ? {} : { Item: result });
    },
    whenPutItem({ table, item }) {
      docMock
        .on(
          PutCommand,
          (input) => input.TableName === table && deepEqual(input.Item, item)
        )
        .resolves({});
    },
    reset() {
      docMock.reset();
    },
    raw: docMock,
    newDocumentClient: () =>
      DynamoDBDocumentClient.from(new DynamoDBClient({})),
  };

  registerMock(api);
  return api;
}

// Low-level client support for AttributeValue shapes
function createDynamoMockAttribute() {
  const { marshall } = require("@aws-sdk/util-dynamodb");
  const {
    GetItemCommand,
  } = require("@aws-sdk/client-dynamodb");

  const low = mockClient(DynamoDBClient);
  low.rejectOnNoMatch();

  const api = {
    whenGetItemByKey({ table, key }, result) {
      const marshalledKey = marshall(key);
      low
        .on(
          GetItemCommand,
          (input) =>
            input.TableName === table && deepEqual(input.Key, marshalledKey)
        )
        .resolves(result == null ? {} : { Item: marshall(result) });
    },
    reset() {
      low.reset();
    },
    raw: low,
  };

  registerMock(api);
  return api;
}

module.exports = { createDynamoMock, createDynamoMockAttribute };
```

**Key Fixes**:

- Uses DocumentClient for plain JS object handling (no AttributeValue marshalling)
- Provides both key-specific and table-wide matchers
- Auto-registers for lifecycle management

## 2. Lambda Layer Management via Facade

### Current Complex Process

```bash
# Each system must understand layer building
cd dependency-manager/layers
npm install
webpack --config dynamodb.config.js
aws lambda publish-layer-version --layer-name hic-dynamodb-layer
```

### Facade-Simplified Process

```yaml
# CloudFormation template uses SSM-discovered ARNs
Parameters:
  HicBaseLayerArn:
    Type: AWS::SSM::Parameter::Value<String>
    Default: /hic/us-east-1/prod/layers/base/latest # Namespaced by region/env
  # For production, pin to specific version:
  # Default: /hic/us-east-1/prod/layers/base/v20250822.1430

MyLambda:
  Type: AWS::Lambda::Function
  Properties:
    Layers:
      - !Ref HicBaseLayerArn
```

### Layer Publishing Script

```bash
#!/bin/bash
# dependency-manager/scripts/publish-layers.sh
build_and_publish_layers() {
  cd layers
  bash build-all-layers.sh

  # Get region and environment
  REGION=${AWS_REGION:-us-east-1}
  ENV=${HIC_ENVIRONMENT:-prod}
  VERSION="v$(date +%Y%m%d.%H%M)"

  # Publish with versioning
  LAYER_ARN=$(aws lambda publish-layer-version \
    --layer-name hic-base-layer \
    --zip-file fileb://base-layer.zip \
    --query 'LayerVersionArn' --output text)

  # Write to SSM with namespaced params
  aws ssm put-parameter \
    --name "/hic/${REGION}/${ENV}/layers/base/latest" \
    --value "$LAYER_ARN" \
    --overwrite

  aws ssm put-parameter \
    --name "/hic/${REGION}/${ENV}/layers/base/${VERSION}" \
    --value "$LAYER_ARN"
}
```

## 3. Monorepo CI/CD via Facade

### Current Complex CI/CD

```yaml
jobs:
  test-qa:
    steps:
      - run: cd qa/tests && npm install
      - run: cd qa/tests && npm test
  test-rfa:
    steps:
      - run: cd rfa-unified/tests && npm install
      - run: cd rfa-unified/tests && npm test
```

### Facade-Simplified CI/CD

```yaml
jobs:
  test-all:
    steps:
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - run: pnpm install
      - run: pnpm test
```

### Workspace Configuration

```yaml
# pnpm-workspace.yaml
packages:
  - "shared/testing"
  - "qa/tests"
  - "rfa-unified/tests"
  - "api-auth-unified/tests"
  - "research/tests"
```

```json
// Root package.json
{
  "scripts": {
    "test": "pnpm -r test"
  },
  "pnpm": {
    "overrides": {
      "@aws-sdk/*": "^3.800.0",
      "aws-sdk-client-mock": ">=4.0.2"
    }
  }
}
```

```
# .npmrc
shared-workspace-lockfile=true
auto-install-peers=true
```

## 4. Testing Infrastructure

### Auto-Reset Registry

```javascript
// shared/testing/utils/registry.js
const registry = new Set();

function registerMock(m) {
  registry.add(m);
}

function resetAll() {
  for (const m of registry) {
    try {
      m.reset && m.reset();
    } catch (_) {}
  }
  registry.clear();
}

module.exports = { registerMock, resetAll };
```

### Jest Preset with Auto-Reset

```javascript
// shared/testing/jest-preset.js
module.exports = {
  testEnvironment: "node",
  setupFilesAfterEnv: ["@hic/testing-facade/jest.setup.js"],
};

// shared/testing/jest.setup.js
const { resetAll } = require("./utils/registry");
afterEach(() => resetAll());
```

### Deep Equality Utility

```javascript
// shared/testing/utils/deepEqual.js
function deepEqual(a, b) {
  if (a === b) return true;
  if (a && b && typeof a === "object" && typeof b === "object") {
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++)
        if (!deepEqual(a[i], b[i])) return false;
      return true;
    }
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const k of aKeys) if (!deepEqual(a[k], b[k])) return false;
    return true;
  }
  return Number.isNaN(a) && Number.isNaN(b);
}

module.exports = { deepEqual };
```

## 5. Implementation Phases

### Phase 1: Foundation (Week 1)

**Goal**: Build core facade infrastructure

**Steps**:

1. Create facade structure: `mkdir -p shared/testing/{helpers,__tests__,utils}`
2. Implement DynamoDB facade with corrected DocumentClient approach
3. Add registry and Jest preset
4. Test facade in isolation

**Deliverables**:

- Working DynamoDB facade with comprehensive tests
- Auto-reset lifecycle management
- Jest preset for consumer modules

### Phase 2: QA Pilot (Week 2)

**Goal**: Validate facade with QA module

**Steps**:

1. Update QA dependencies: `"@hic/testing-facade": "file:../../shared/testing"`
2. Migrate QA test imports to use facade
3. Validate all 133 tests pass
4. Measure package size reduction

**Success Criteria**:

- All QA tests pass with facade
- Measurable bundle size reduction (target: 80MB → 5KB)
- No performance degradation

### Phase 3: Service Expansion (Week 3)

**Goal**: Add remaining AWS service facades

**Services to Add**:

- S3 (GetObject, PutObject)
- Lambda (Invoke)
- SNS (Publish, PublishBatch)
- SQS (SendMessage, ReceiveMessage)

**S3 Facade**:

```javascript
// shared/testing/helpers/s3.js
const { mockClient } = require("aws-sdk-client-mock");
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const { Readable } = require("stream");
const { deepEqual } = require("../utils/deepEqual");
const { registerMock } = require("../utils/registry");

function createS3Mock() {
  const s3Mock = mockClient(S3Client);
  s3Mock.rejectOnNoMatch();

  const api = {
    whenGetObject({ bucket, key }, data = "") {
      const buf = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data || []);
      const stream = Readable.from([buf]);
      stream.transformToString = async (enc = 'utf-8') => buf.toString(enc);
      s3Mock
        .on(
          GetObjectCommand,
          (input) => input.Bucket === bucket && input.Key === key
        )
        .resolves({ Body: stream });
    },
    whenPutObject({ bucket, key, contentType, metadata }) {
      s3Mock
        .on(
          PutObjectCommand,
          (input) =>
            input.Bucket === bucket &&
            input.Key === key &&
            (!contentType || input.ContentType === contentType) &&
            (!metadata || deepEqual(input.Metadata, metadata))
        )
        .resolves({ ETag: '"mock-etag"' });
    },
    reset() {
      s3Mock.reset();
    },
    raw: s3Mock,
  };

  registerMock(api);
  return api;
}

// Lambda Facade
function createLambdaMock() {
  const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");
  const lambdaMock = mockClient(LambdaClient);
  lambdaMock.rejectOnNoMatch();

  const { TextEncoder } = require('util'); // Node compatibility
  const enc = (obj) => new TextEncoder().encode(JSON.stringify(obj));

  const api = {
    whenInvoke({ functionName }, result = { ok: true }) {
      lambdaMock
        .on(InvokeCommand, (input) => input.FunctionName === functionName)
        .resolves({ StatusCode: 200, Payload: enc(result) });
    },
    reset() {
      lambdaMock.reset();
    },
    raw: lambdaMock,
  };

  registerMock(api);
  return api;
}

module.exports = { createS3Mock, createLambdaMock };
```

### Phase 4: System-Wide Rollout (Week 4)

**Goal**: Migrate all HIC modules

**Steps**:

1. Migrate each module systematically
2. Remove duplicate dependencies from individual modules
3. Update CI/CD to use unified pnpm workflow
4. Validate all tests pass across all modules

### Phase 5: Governance & Documentation (Week 5)

**Goal**: Establish maintenance patterns

**Deliverables**:

- Comprehensive facade usage guide
- ESLint rules to enforce facade usage
- Governance model for facade maintenance
- Success metrics documentation

## 6. Governance & Quality Controls

### ESLint Rules

```json
{
  "rules": {
    "no-restricted-imports": [
      "error",
      {
        "paths": [
          {
            "name": "aws-sdk-client-mock",
            "message": "Use @hic/testing-facade instead."
          },
          {
            "name": "@aws-sdk/client-dynamodb",
            "importNames": ["DynamoDBClient"],
            "message": "Use facade in tests."
          },
          {
            "name": "@aws-sdk/client-s3",
            "importNames": ["S3Client"],
            "message": "Use facade in tests."
          },
          {
            "name": "@aws-sdk/client-lambda",
            "importNames": ["LambdaClient"],
            "message": "Use facade in tests."
          },
          {
            "name": "@aws-sdk/client-sns",
            "importNames": ["SNSClient"],
            "message": "Use facade in tests."
          },
          {
            "name": "@aws-sdk/client-sqs",
            "importNames": ["SQSClient"],
            "message": "Use facade in tests."
          }
        ]
      }
    ]
  }
}
```

### Package Structure

```
shared/testing/
├── helpers/
│   ├── dynamodb.js         # DynamoDB facade
│   ├── s3.js              # S3 & Lambda facades
│   ├── sns.js             # SNS facade
│   └── sqs.js             # SQS facade
├── utils/
│   ├── registry.js        # Mock registry
│   └── deepEqual.js       # Deep equality utility
├── __tests__/
│   ├── dynamodb.test.js   # Facade tests
│   ├── s3.test.js
│   └── integration.test.js
├── jest-preset.js         # Jest configuration
├── jest.setup.js          # Auto-reset setup
├── index.js              # Main exports
└── package.json          # Dependencies with proper exports
```

### Package.json with Proper Exports

````json
{
  "name": "@hic/testing-facade",
  "version": "0.1.0",
  "main": "index.js",
  "files": [
    "helpers/",
    "utils/",
    "jest-preset.js",
    "jest.setup.js",
    "index.js"
  ],
  "exports": {
    ".": "./index.js",
    "./dynamodb": "./helpers/dynamodb.js",
    "./s3": "./helpers/s3.js",
    "./sns": "./helpers/sns.js",
    "./sqs": "./helpers/sqs.js",
    "./jest-preset": "./jest-preset.js",
    "./jest.setup.js": "./jest.setup.js"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "aws-sdk-client-mock": ">=4.0.2"
  },
  "peerDependencies": {
    "@aws-sdk/client-dynamodb": ">=3.700 <4",
    "@aws-sdk/lib-dynamodb": ">=3.700 <4",
    "@aws-sdk/client-s3": ">=3.700 <4",
    "@aws-sdk/client-lambda": ">=3.700 <4",
    "@aws-sdk/client-sns": ">=3.700 <4",
    "@aws-sdk/client-sqs": ">=3.700 <4"
  }
}

### Enhanced Service Facades

**SNS Facade with FIFO Support**:
```javascript
// shared/testing/helpers/sns.js
const { mockClient } = require('aws-sdk-client-mock');
const { SNSClient, PublishCommand, PublishBatchCommand } = require('@aws-sdk/client-sns');
const { deepEqual } = require('../utils/deepEqual');
const { registerMock } = require('../utils/registry');

function createSNSMock() {
  const snsMock = mockClient(SNSClient);
  snsMock.rejectOnNoMatch();

  const api = {
    whenPublish({ topicArn, message, messageAttributes, messageGroupId, messageDeduplicationId }) {
      snsMock.on(PublishCommand, (input) =>
        input.TopicArn === topicArn &&
        input.Message === message &&
        (!messageAttributes || deepEqual(input.MessageAttributes, messageAttributes)) &&
        (!messageGroupId || input.MessageGroupId === messageGroupId) &&
        (!messageDeduplicationId || input.MessageDeduplicationId === messageDeduplicationId)
      ).resolves({ MessageId: 'mock-message-id' });
    },
    whenPublishBatch({ topicArn, entries }) {
      snsMock.on(PublishBatchCommand, (input) =>
        input.TopicArn === topicArn && deepEqual(input.PublishBatchRequestEntries, entries)
      ).resolves({ Successful: entries.map((e, i) => ({ Id: e.Id, MessageId: `mock-${i}` })) });
    },
    reset() { snsMock.reset(); },
    raw: snsMock
  };

  registerMock(api);
  return api;
}

module.exports = { createSNSMock };
````

**SQS Facade with Realistic Attributes**:

```javascript
// shared/testing/helpers/sqs.js
const { mockClient } = require("aws-sdk-client-mock");
const {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
} = require("@aws-sdk/client-sqs");
const { deepEqual } = require("../utils/deepEqual");
const { registerMock } = require("../utils/registry");

function createSQSMock() {
  const sqsMock = mockClient(SQSClient);
  sqsMock.rejectOnNoMatch();

  const api = {
    whenSendMessage({ queueUrl, messageBody, messageAttributes }) {
      sqsMock
        .on(
          SendMessageCommand,
          (input) =>
            input.QueueUrl === queueUrl &&
            input.MessageBody === messageBody &&
            (!messageAttributes ||
              deepEqual(input.MessageAttributes, messageAttributes))
        )
        .resolves({ MessageId: "mock-message-id" });
    },
    whenReceiveMessage({ queueUrl }, messages = []) {
      const mockMessages = messages.map((msg, i) => ({
        MessageId: `mock-${i}`,
        ReceiptHandle: `mock-receipt-${i}`,
        Body: typeof msg === "string" ? msg : JSON.stringify(msg),
        Attributes: { SentTimestamp: Date.now().toString() },
        MessageAttributes: msg.messageAttributes || {},
      }));

      sqsMock
        .on(ReceiveMessageCommand, (input) => input.QueueUrl === queueUrl)
        .resolves({ Messages: mockMessages });
    },
    reset() {
      sqsMock.reset();
    },
    raw: sqsMock,
  };

  registerMock(api);
  return api;
}

module.exports = { createSQSMock };
```

### Public API

```javascript
// shared/testing/index.js
module.exports = {
  dynamo: require("./helpers/dynamodb"),
  s3: require("./helpers/s3"),
  sns: require("./helpers/sns"),
  sqs: require("./helpers/sqs"),
  lambda: require("./helpers/s3"), // exposes createLambdaMock
};
```

## 7. Success Metrics

**Immediate Benefits**:

- **Bundle Size**: 80MB → 5KB Lambda packages
- **CI Performance**: 30% faster builds through caching
- **Consistency**: Identical testing patterns across modules

**Quality Metrics**:

- **Test Coverage**: Maintain 100% pass rate during migration
- **Developer Velocity**: <30 minutes to add new mocked service
- **Maintenance**: Single point of SDK version management

## 8. Risk Mitigation

**Rollback Strategy**:

- Incremental module-by-module migration
- Full rollback capability to direct dependencies
- Facade tested independently of application code

**Version Management**:

- Semantic versioning for facade releases
- Deprecation warnings for breaking changes
- Automated codemods for migration assistance

---

**Next Steps**: Begin Phase 1 implementation with corrected DynamoDB facade as the foundation for the entire dependency management solution.
