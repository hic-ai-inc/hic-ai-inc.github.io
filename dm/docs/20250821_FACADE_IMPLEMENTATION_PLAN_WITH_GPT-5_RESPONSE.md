# Facade Implementation Plan for HIC Dependency Management

**Date**: August 21, 2025  
**Context**: Implementing facade pattern to solve dependency bloat and centralize dependency management  
**Status**: Ready for implementation

## Executive Summary

The facade pattern provides a unified, simplified interface that abstracts complex dependency management operations. Instead of each HIC system directly managing AWS SDKs, Jest dependencies, and Lambda layers, they interact with a clean facade API that handles all complexity behind the scenes.

**Core Benefit**: Systems make simple requests ("I need DynamoDB mocking"), facade handles complexity (AWS SDK setup, version management, mock configuration).

## Facade Architecture Overview

```
HIC Systems (QA, RFA, API, etc.)
         ↓ Simple Requests
    Facade Layer (@hic/testing-shared)
         ↓ Complex Operations
   Dependencies (AWS SDK, Jest, Layers)
```

**Key Principle**: Systems interact with stable, simple APIs. Facade manages all underlying complexity and changes.

## 1. Lambda Layer Utilization via Facade

### Current Complex Process

```bash
# Each system must understand layer building
cd dependency-manager/layers
npm install
webpack --config dynamodb.config.js
aws lambda publish-layer-version --layer-name hic-dynamodb-layer
```

### Facade-Simplified Process

**System Request**:

```yaml
# Any module's CloudFormation template
MyLambda:
  Type: AWS::Lambda::Function
  Properties:
    Layers:
      - !Ref HicBaseLayer # Facade provides standardized layers
      - !Ref HicStorageLayer
```

**Facade Implementation**:

```bash
# dependency-manager/scripts/facade-layer-manager.sh
#!/bin/bash
# Facade handles all complexity
build_standardized_layers() {
  echo "Building HIC standardized layers..."
  cd layers
  bash build-all-layers.sh    # Facade orchestrates building
  bash deploy-all-layers.sh   # Facade orchestrates deployment
}
```

**Benefits**:

- Systems declare needs, don't manage complexity
- Standardized, optimized layers across all modules
- Single point of maintenance for layer logic

## 2. Mocking via Facade Pattern

### Current Complex Mocking

```javascript
// Each system manages raw AWS SDK mocking
const { mockClient } = require("aws-sdk-client-mock");
const {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} = require("@aws-sdk/client-dynamodb");

const ddbMock = mockClient(DynamoDBClient);
ddbMock
  .on(GetItemCommand, {
    TableName: "users",
    Key: { id: { S: "user123" } }, // Complex AWS data format
  })
  .resolves({
    Item: { id: { S: "user123" }, name: { S: "John" } },
  });
```

### Facade-Simplified Mocking

**System Request**:

```javascript
// Simple, declarative mocking API
const { createDynamoMock } = require("@hic/testing-shared/helpers/dynamodb");
const dynamo = createDynamoMock();

// Clean, intuitive interface
dynamo.whenGetItem(
  { table: "users", key: { id: "user123" } },
  { id: "user123", name: "John" }
);
```

**Facade Implementation**:

```javascript
// shared/testing/helpers/dynamodb.js
const { mockClient } = require("aws-sdk-client-mock");
const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");

function createDynamoMock() {
  const clientMock = mockClient(DynamoDBClient);

  return {
    whenGetItem: ({ table, key }, result) => {
      // Facade handles AWS complexity
      clientMock.on(GetItemCommand, { TableName: table }).resolves({
        Item: result || undefined,
      });
    },
    whenPutItem: ({ table, item }) => {
      clientMock.on(PutItemCommand, { TableName: table }).resolves({});
    },
    reset: () => clientMock.reset(),
    raw: clientMock, // Escape hatch for complex cases
  };
}

module.exports = { createDynamoMock };
```

**Benefits**:

- Tests use simple, stable API
- Facade handles AWS SDK version changes
- Consistent patterns across all modules

## 3. CI/CD Pipeline via Facade

### Current Complex CI/CD

```yaml
# Each module manages its own dependencies
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

**System Request**:

```yaml
# Simple, unified testing
jobs:
  test-all:
    steps:
      - run: pnpm install # Facade manages all dependencies
      - run: pnpm test # Facade coordinates all tests
```

**Facade Implementation**:

```json
// Root package.json - Facade manages dependency resolution
{
  "scripts": {
    "test": "pnpm run --recursive test"
  },
  "pnpm": {
    "overrides": {
      "@aws-sdk/*": "^3.800.0" // Facade ensures version consistency
    }
  }
}
```

```json
// shared/testing/package.json - Facade centralizes test dependencies
{
  "name": "@hic/testing-shared",
  "devDependencies": {
    "jest": "^29.7.0",
    "aws-sdk-client-mock": "^4.0.0"
  },
  "peerDependencies": {
    "@aws-sdk/client-dynamodb": ">=3.700 <4"
  }
}
```

**Benefits**:

- Single dependency installation
- Consistent versions across modules
- Faster CI through caching and deduplication

## 4. Testing Strategy for Facade Layer

### The Challenge: Testing Without Circular Dependencies

**Problem**: How do we test the facade without importing the systems that use it?

**Solution**: Test facade in isolation with dummy inputs.

### Facade Test Structure

```
shared/testing/
├── __tests__/
│   ├── dynamodb.test.js     # Test DynamoDB facade
│   ├── lambda.test.js       # Test Lambda facade
│   └── s3.test.js          # Test S3 facade
├── helpers/
│   ├── dynamodb.js         # DynamoDB facade implementation
│   ├── lambda.js           # Lambda facade implementation
│   └── s3.js              # S3 facade implementation
└── package.json            # Facade dependencies
```

### Facade Test Implementation

```javascript
// shared/testing/__tests__/dynamodb.test.js
const { createDynamoMock } = require("../helpers/dynamodb");
const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");

describe("DynamoDB Facade", () => {
  let dynamo;

  beforeEach(() => {
    dynamo = createDynamoMock();
  });

  afterEach(() => {
    dynamo.reset();
  });

  it("should mock GetItem successfully", async () => {
    // Test facade behavior with dummy data
    dynamo.whenGetItem(
      { table: "test-table", key: { id: "test123" } },
      { id: "test123", name: "Test User" }
    );

    // Verify facade configured mock correctly
    const client = new DynamoDBClient({});
    const result = await client.send(
      new GetItemCommand({
        TableName: "test-table",
        Key: { id: { S: "test123" } },
      })
    );

    expect(result.Item).toBeDefined();
  });

  it("should handle missing items", async () => {
    dynamo.whenGetItem(
      { table: "test-table", key: { id: "missing" } },
      null // No item found
    );

    const client = new DynamoDBClient({});
    const result = await client.send(
      new GetItemCommand({
        TableName: "test-table",
        Key: { id: { S: "missing" } },
      })
    );

    expect(result.Item).toBeUndefined();
  });
});
```

### Dependency Import Strategy for Facade Tests

**Key Principle**: Facade tests only import facade code and raw dependencies, never application code.

```javascript
// ✅ ALLOWED: Facade tests import facade helpers
const { createDynamoMock } = require("../helpers/dynamodb");

// ✅ ALLOWED: Facade tests import raw dependencies to verify behavior
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");

// ❌ FORBIDDEN: Facade tests never import application code
// const qaDispatcher = require('../../qa/lambda/qa-dispatcher'); // NO!
```

**Testing Package Dependencies**:

```json
// shared/testing/package.json
{
  "devDependencies": {
    "jest": "^29.7.0",
    "aws-sdk-client-mock": "^4.0.0"
  },
  "peerDependencies": {
    "@aws-sdk/client-dynamodb": ">=3.700 <4",
    "@aws-sdk/client-lambda": ">=3.700 <4",
    "@aws-sdk/client-s3": ">=3.700 <4"
  }
}
```

## 5. Implementation Phases

### Phase 1: Facade Foundation (Week 1)

**Goal**: Build core facade infrastructure

**Steps**:

1. **Create facade structure**

   ```bash
   mkdir -p shared/testing/{helpers,__tests__,docs}
   ```

2. **Set up facade package**

   ```json
   // shared/testing/package.json
   {
     "name": "@hic/testing-shared",
     "version": "0.1.0",
     "main": "index.js"
   }
   ```

3. **Build DynamoDB facade**

   ```javascript
   // shared/testing/helpers/dynamodb.js
   function createDynamoMock() {
     // Implementation as shown above
   }
   ```

4. **Test facade in isolation**
   ```javascript
   // shared/testing/__tests__/dynamodb.test.js
   // Tests as shown above
   ```

**Deliverables**:

- Working DynamoDB facade with tests
- Lambda facade with tests
- S3 facade with tests

### Phase 2: QA Pilot Integration (Week 2)

**Goal**: Integrate facade with QA module as proof of concept

**Steps**:

1. **Update QA test dependencies**

   ```json
   // qa/tests/package.json
   {
     "devDependencies": {
       "@hic/testing-shared": "file:../../shared/testing"
     }
   }
   ```

2. **Migrate QA test imports**

   ```javascript
   // Before
   const { mockClient } = require("aws-sdk-client-mock");

   // After
   const { createDynamoMock } = require("@hic/testing-shared/helpers/dynamodb");
   ```

3. **Validate QA tests**

   ```bash
   cd qa/tests
   npm test  # All 133 tests should pass
   ```

4. **Measure improvements**
   - Package size reduction
   - Test execution time
   - CI performance

**Success Criteria**:

- All QA tests pass with facade
- Measurable package size reduction
- No performance degradation

### Phase 3: Facade Expansion (Week 3)

**Goal**: Extend facade to cover all AWS services used by HIC

**Steps**:

1. **Add remaining service facades**

   ```javascript
   // shared/testing/helpers/sns.js
   function createSNSMock() {
     /* ... */
   }

   // shared/testing/helpers/sqs.js
   function createSQSMock() {
     /* ... */
   }
   ```

2. **Create facade index**

   ```javascript
   // shared/testing/index.js
   module.exports = {
     ...require("./helpers/dynamodb"),
     ...require("./helpers/lambda"),
     ...require("./helpers/s3"),
     ...require("./helpers/sns"),
     ...require("./helpers/sqs"),
   };
   ```

3. **Test all facades**
   ```bash
   cd shared/testing
   npm test  # All facade tests pass
   ```

**Deliverables**:

- Complete facade coverage for all HIC AWS services
- Comprehensive test suite for facade layer
- Documentation for facade usage patterns

### Phase 4: System-Wide Rollout (Week 4)

**Goal**: Migrate all HIC modules to use facade

**Steps**:

1. **Migrate each module systematically**

   ```bash
   # For each module
   cd rfa-unified/tests
   # Update package.json to use facade
   # Update test imports
   # Validate tests pass
   ```

2. **Remove duplicate dependencies**

   ```json
   // Remove from each module
   {
     "devDependencies": {
       // "jest": "^29.7.0",  // REMOVED
       // "aws-sdk-client-mock": "^4.0.0"  // REMOVED
     }
   }
   ```

3. **Update CI/CD pipeline**

   ```yaml
   # .github/workflows/test.yml
   - name: Install dependencies
     run: pnpm install # Single install for all modules

   - name: Run all tests
     run: pnpm test # Facade coordinates testing
   ```

**Success Criteria**:

- All modules use facade successfully
- CI/CD performance improvements measured
- Dependency bloat eliminated

### Phase 5: Documentation & Governance (Week 5)

**Goal**: Establish facade maintenance and usage patterns

**Steps**:

1. **Create comprehensive documentation**

   ```markdown
   // shared/testing/docs/FACADE_GUIDE.md

   # HIC Testing Facade Guide

   ## Quick Start

   ## Common Patterns

   ## Troubleshooting
   ```

2. **Establish governance model**

   - Designate facade maintainers
   - Define contribution process
   - Set up automated testing for facade changes

3. **Measure and document results**
   - Bundle size reductions achieved
   - CI/CD performance improvements
   - Developer experience feedback

**Deliverables**:

- Complete facade documentation
- Governance model for facade maintenance
- Success metrics and lessons learned

## Benefits Summary

### Immediate Benefits

- **80MB → 5KB Lambda packages**: Testing dependencies removed from production
- **Faster CI/CD**: Single dependency installation and caching
- **Consistent patterns**: All modules use identical testing approaches

### Long-term Benefits

- **Easy SDK upgrades**: Change facade, all systems benefit
- **Simplified onboarding**: New developers learn one testing pattern
- **Reduced maintenance**: Centralized dependency management

### Risk Mitigation

- **Incremental rollout**: Module-by-module migration
- **Full rollback capability**: Can revert to direct dependencies if needed
- **Isolated testing**: Facade tested independently of application code

## Success Metrics

- **Bundle Size**: Median Lambda package reduction (target: 80MB → 5KB)
- **CI Performance**: Build time reduction (target: 30% faster)
- **Test Coverage**: Maintain 100% pass rate during migration
- **Developer Velocity**: Time to add new mocked service (target: <30 minutes)

## Evolution Path

**Current**: Simple facade with basic mocking
**Future**: Enhanced facade with contract testing, LocalStack integration, and advanced patterns

The facade pattern provides a clear evolution path - as needs grow, we enhance the facade implementation while keeping the simple API stable for all systems.

---

**Next Steps**: Begin Phase 1 implementation with DynamoDB facade as the foundation for the entire dependency management solution.

///

END OF Q DEVELOPER FACADE IMPLEMENTATION MEMO

///

///

GPT-5 RESPONSE:

///

Love the direction. A centralized testing/deps facade is exactly the right lever for HIC right now—quick to ship, high leverage, and future-proofable. I combed through Q’s plan line-by-line. Below are (1) correctness nits you should fix before cutting v0.1, (2) medium-term concerns you’ll want to guardrail, and (3) concrete upgrades that keep the surface simple while making the internals safer and more extensible.

Verdict (TL;DR)

Concept: ✅ Solid. A testing/dependency facade is the right abstraction.

Scope: ✅ Reasonable MVP (DynamoDB/Lambda/S3 first; SNS/SQS next).

Implementation notes: ⚠️ A few correctness gaps in the DynamoDB mock, layer wiring, and workspace governance that will bite you during rollout.

My call: Ship it after addressing the fixes below. Add the small API/design tweaks I suggest so you won’t have to do a breaking v0.2.

Critical fixes (before v0.1)

1. DynamoDB facade must marshal/unmarshal

In the examples, the facade returns an Item as a plain JS object while the test client uses @aws-sdk/client-dynamodb with AttributeValue shapes:

// Test uses low-level client (AttributeValue):
new GetItemCommand({
TableName: 'test-table',
Key: { id: { S: 'test123' } }
});

Your facade code resolves with:

{ Item: { id: 'test123', name: 'Test User' } } // ❌ not AttributeValue

This will “work” only insofar as the mock returns whatever you give it, but it won’t match production semantics and will produce subtle test/prod divergences.

Fix: Pick one of these two strategies and stick to it everywhere:

A. DocumentClient strategy (recommended): Internally use DynamoDBDocumentClient so all inputs/outputs are plain JS. Tests and app code can remain in JS objects; the facade handles marshalling under the hood.

B. Marshal strategy: Accept plain JS from the test author, but marshal to AttributeValue before stubbing the response and marshal the key for matchers. (More boilerplate; slightly more fragile.)

A minimal TypeScript sketch (A):

// shared/testing/helpers/dynamodb.ts
import { mockClient } from 'aws-sdk-client-mock';
import {
DynamoDBClient,
GetItemCommand,
PutItemCommand
} from '@aws-sdk/client-dynamodb';
import {
DynamoDBDocumentClient,
GetCommand,
PutCommand
} from '@aws-sdk/lib-dynamodb';

export type Dynamo = {
whenGetItem(
args: { table: string; key: Record<string, any> },
result: Record<string, any> | null
): void;
whenPutItem(args: { table: string; item: Record<string, any> }): void;
reset(): void;
raw: ReturnType<typeof mockClient<DynamoDBClient>>;
};

export function createDynamoMock(): Dynamo {
// We mock the low-level client but expose a DocumentClient to tests/app
const low = mockClient(DynamoDBClient);
// NB: Consumers can also import the DocumentClient; behavior remains consistent.
// For internal matching, we compare only TableName and use predicate matching for Key.

return {
whenGetItem({ table, key }, result) {
// Match only by TableName; use a matcher function if you need key matching.
low.on(GetItemCommand, (input) => input.TableName === table).resolves(
result === null ? {} : { Item: result }
);
},
whenPutItem({ table, item }) {
low.on(PutItemCommand, (input) => input.TableName === table).resolves({});
},
reset() {
low.reset();
},
raw: low
};
}

Why this works: Your app/tests can use DynamoDBDocumentClient (plain JS). The mock is attached at the low-level client, but it returns document-shaped payloads; the doc client will pass them through. If your production app uses low-level clients anywhere, add a second set of helpers (or a switch) so the facade can mimic both shapes deterministically.

If you prefer strategy B, add marshall/unmarshall from @aws-sdk/util-dynamodb and transform inputs/outputs at the facade boundary.

2. Import omissions & command scoping

In the plan snippet, PutItemCommand is used but not imported. Also, the mock matcher is overly broad:

clientMock.on(GetItemCommand, { TableName: table }).resolves(...)

This will match all GetItem calls for the table, regardless of key—fine for some tests, but often you want per-key control. Provide both:

whenGetItemByKey({ table, key }, result) { /_ match Key and TableName _/ }
whenGetItem({ table }, result) { /_ match only TableName _/ }

Use predicate matchers:

low.on(GetItemCommand, (input) =>
input.TableName === table && deepEqual(input.Key, marshall(key))
)

(Implement a tiny deepEqual util or import a stable one.)

3. v2 + v3 dual support must be explicit

You note some functions still use SDK v2. If any tests or helpers touch v2 (AWS.DynamoDB.DocumentClient), your facade needs a v2 adapter:

@hic/testing-shared/v2/dynamodb exports createDynamoMockV2() with the same simple API, but internally stubs AWS.DynamoDB calls (e.g., by injecting a wrapper; or use a tiny shim layer that re-exports v3 through a v2-like facade for tests only).

Lock the versions with peerDependencies on both v2 and v3 in the testing package, and add optionalPeerDependencies for the one not used in a given repo folder to avoid install pain.

4. Lambda Layers wiring in CFN is underspecified

The template example shows:

Layers:

- !Ref HicBaseLayer
- !Ref HicStorageLayer

That only works if those LayerVersion resources are declared in the same stack. If you publish layers in a separate “dependency-manager” stack, functions in consumer stacks need the LayerVersion ARN, not a Ref.

Fix: Provide a stable discovery mechanism:

Best: On publish, write LayerVersionArns to SSM Parameters with semantic names (e.g., /hic/layers/base/prod/latest and /hic/layers/base/prod/v1.2.3).
Consumers take a parameter:

Parameters:
HicBaseLayerArn:
Type: AWS::SSM::Parameter::Value<String>
Default: /hic/layers/base/prod/latest
...
Layers:

- !Ref HicBaseLayerArn

Or export Outputs from the layer stack and import with Fn::ImportValue (tighter coupling; SSM is usually smoother for multi-account).

Also add:

SemVer discipline for layer contents; never overwrite major versions silently.

A rollback script to pin last known-good ARN if a new layer breaks cold starts or exceeds size.

5. Monorepo & CI details (pnpm)

The plan assumes “just run pnpm -r test and overrides do the rest.” Good, but you should lock the following to avoid heisenbugs:

.npmrc:

shared-workspace-lockfile=true
auto-install-peers=true

pnpm-workspace.yaml: include only the packages you want (avoid pulling local junk into CI).

Use pnpm overrides and packageExtensions to force consistent transitive deps for Jest/ts-jest/@types.

GitHub Actions cache keys must include the pnpm store hash and pnpm-lock.yaml. Use the official pnpm/action-setup with cache: true.

6. Test isolation lifecycle

Provide a Jest preset in @hic/testing-shared that installs per-test lifecycle hooks:

afterEach → mock.reset() for every registered mock (ddb, s3, sns, …).

A tiny registry:

const registry = new Set<{reset: () => void}>();
export const registerMock = (m) => registry.add(m);
export const resetAll = () => { for (const m of registry) m.reset(); registry.clear(); };

Jest setup file:

afterEach(() => resetAll());

This prevents the most common leakage bugs during the migration.

Medium-term concerns (have a plan)

Service coverage parity
SNS/SQS are trickier than they look:

SNS: confirm you cover PublishBatch, message attributes, and failure shapes.

SQS: model ReceiveMessage with long polling, visibility timeouts, and partial batches. Many tests only need “one message arrives,” but your facade should optionally emulate multiple receives and deletes to match handlers with at-least-once semantics.

Middleware & retry behavior (v3)
If any consumer relies on v3 middleware (e.g., retry strategy, user agent, endpoint rules), ensure your mocks don’t accidentally bypass code that your prod path depends on. A small “contract mode” that runs the command through the real middleware stack (but short-circuits at the handler) is useful for higher-fidelity tests.

TypeScript ergonomics
Publish the facade as TS with d.ts outputs. Provide narrowed types for façade helpers so IDE hints are great (e.g., whenPublish exposes the message shape your apps actually send).

Governance / breaking changes
Document a simple policy:

No breaking changes on the public testing API without a major bump.

Deprecations live for 2 minors with a runtime console.warn (can be silenced in CI).

Each release ships a codemod if signatures change (migrate import paths in repo).

Suggested upgrades (keep the surface simple; harden the core)
A) One import path per service

Prefer clean entrypoints over deep paths like @hic/testing-shared/helpers/dynamodb.

// Good:
import { dynamo } from '@hic/testing-facade'; // aggregated
// or
import { createDynamoMock } from '@hic/testing-facade/dynamodb'; // per-service

Publish both to keep DX high; back them with a single internal implementation.

B) Dual client support switch

Offer a one-liner to pick v2 or v3 behavior:

createDynamoMock({ sdk: 'v3' | 'v2', shape: 'document' | 'attribute' })

Default to { sdk: 'v3', shape: 'document' }. This future-proofs migration off v2 without forcing changes across tests.

C) Matchers > literals

Provide composable matchers so tests read cleanly but can be precise:

dynamo.whenGetItem(
match.table('users').keyEq({ id: '123' }),
{ id: '123', name: 'John' }
);

dynamo.whenPutItem(match.table('users'), ok());

Under the hood, matchers are tiny predicate functions against the real command input.

D) Minimal contract tests

Add a contracts/ folder with a few “black box” tests per service that use only the public facade and the real v3 clients to assert shapes. This catches accidental API drift inside the facade.

E) Lint rule to enforce facade usage

Add an ESLint rule (or a simple forbid-imports rule) to block direct imports of aws-sdk-client-mock or raw AWS SDK in test files outside the facade:

"no-restricted-imports": [
"error",
{
"paths": [
{ "name": "aws-sdk-client-mock", "message": "Use @hic/testing-facade instead." },
{ "name": "@aws-sdk/client-dynamodb", "importNames": ["DynamoDBClient"], "message": "Use facade in tests." }
]
}
]

(Allowlist specific paths inside shared/testing.)

F) Layer publishing: versioning & discovery

On publish, write both /latest and /vX.Y.Z SSM params.

Consumers default to /latest, but each stack can pin /vX.Y.Z for deterministic deploys.

Keep a layers/manifest.json checked in for visibility/auditing.

Rollout checklist (practical & quick)

Ship @hic/testing-facade@0.1.0 with Dynamo (document shape), Lambda (invoke mocking), S3 (get/put), plus Jest preset & lifecycle.

Add ESLint guard to force use of facade in tests.

Migrate QA module (as in Phase 2) and capture metrics:

Node_modules size drop per package

CI wall time before/after

Cold/warm test reliability (flakiness)

Publish layers via a one-command script that:

Builds

Publishes

Writes /latest and /vX.Y.Z SSM params

Prints ARNs and changelog summary

Pin consumers to the SSM params—start with /latest in non-prod, /vX.Y.Z in prod.

Draft governance doc (semver, deprecation, release cadence, owners).

Tiny code patches (drop-in now)

1. Package entrypoints

// shared/testing/index.ts
export _ as dynamo from './dynamodb';
export _ as s3 from './s3';
export \* as lambda from './lambda';

// shared/testing/dynamodb.ts
export { createDynamoMock } from './helpers/dynamodb';

2. Jest preset

// shared/testing/jest-preset.js
module.exports = {
testEnvironment: 'node',
setupFilesAfterEnv: ['@hic/testing-facade/dist/jest.setup.js'],
};

// shared/testing/src/jest.setup.ts
import { resetAll } from './registry';
afterEach(() => resetAll());

Final call

With the marshalling fix, better matchers, explicit v2/v3 handling, and ARN discovery for layers, this plan is in excellent shape. It keeps your public testing API stable, lets you upgrade SDKs centrally, and cuts dependency bloat immediately—without painting you into a corner.

If you want, I can draft the exact dynamodb.ts (both shapes), the SSM-backed layer publisher script, and the Jest preset files so you can paste them straight in and start Phase 2.

///

END OF GPT-5 RESPONSE

///

///

MY FOLLOW-UP:

///

This is very helpful. We have however been using exclusively JavaScript and not TypeScript throughout this project. Can you please review your response above one more time and just let me know what if anything about your answer changes given we are using JavaScript? If nothing important, that's fine too!

///

END OF MY FOLLOW-UP

///

///

GPT-5 REPLY:

Great question — almost everything still stands. The few places that change for a JavaScript-only codebase are about types, module format, and a couple of helper files. Below are the practical deltas and JS drop-ins so you can paste and go.

What changes for plain JavaScript?

1. Files and exports: use CommonJS (or ESM) consistently

Your examples use require, so I’ll assume CommonJS. If you’re on ESM, flip require→import and module.exports→export.

CommonJS:

module.exports = { … }

const X = require('x')

ESM (optional): set "type": "module" in package.json, use export/import.

Everything else (facade structure, matchers, test preset, layer wiring, pnpm settings) is unchanged.

2. Facade internals: pick one Dynamo strategy in JS

I still recommend the DocumentClient strategy (plain JS in tests), but in JS we’ll implement it with aws-sdk-client-mock against DynamoDBDocumentClient and the lib-dynamodb commands.

If you also have code still using the low-level client (AttributeValue shapes), keep a second helper that matches on the low-level DynamoDBClient and uses marshall/unmarshall. Both JS versions are below.

3. Jest preset & lifecycle: JS files instead of TS

Provide a tiny registry and a Jest setup file in JS. No TS types needed.

4. ESLint rule: same config, just JSON

Exactly as suggested; it’s tool-agnostic.

5. Lambda Layers & SSM discovery, pnpm workspace governance

Identical. Those were tooling/runtime concerns, not language-level.

Paste-in JS snippets
A) DocumentClient (plain-JS shapes) — recommended for v3 paths

shared/testing/helpers/dynamodb.js

const { mockClient } = require('aws-sdk-client-mock');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
DynamoDBDocumentClient,
GetCommand,
PutCommand
} = require('@aws-sdk/lib-dynamodb');

const { deepEqual } = require('../utils/deepEqual');
const { registerMock } = require('../utils/registry');

/\*\*

- createDynamoMock (DocumentClient mode)
- - Tests and app code can use plain JS objects for items/keys.
- - We attach the mock to DynamoDBDocumentClient so command shapes are document-style.
    \*/
    function createDynamoMock() {
    // Create a real doc client but we only need its class for the mock
    const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
    const docMock = mockClient(DynamoDBDocumentClient);

// Optional: keep reference if you want to instantiate a client inside a test
const newDocumentClient = () => DynamoDBDocumentClient.from(new DynamoDBClient({}));

const api = {
whenGetItemByKey({ table, key }, result) {
docMock.on(GetCommand, (input) =>
input.TableName === table && deepEqual(input.Key, key)
).resolves(result == null ? {} : { Item: result });
},
whenGetItem({ table }, result) {
docMock.on(GetCommand, (input) =>
input.TableName === table
).resolves(result == null ? {} : { Item: result });
},
whenPutItem({ table, item }) {
docMock.on(PutCommand, (input) =>
input.TableName === table && deepEqual(input.Item, item)
).resolves({});
},
reset() {
docMock.reset();
},
raw: docMock,
newDocumentClient
};

registerMock(api); // so afterEach can reset everything
return api;
}

module.exports = { createDynamoMock };

// shared/testing/utils/deepEqual.js

function deepEqual(a, b) {
if (a === b) return true;
if (a && b && typeof a === 'object' && typeof b === 'object') {
if (Array.isArray(a) !== Array.isArray(b)) return false;
if (Array.isArray(a)) {
if (a.length !== b.length) return false;
for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
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

// shared/testing/utils/registry.js

const registry = new Set();
function registerMock(m) { registry.add(m); }
function resetAll() {
for (const m of registry) { try { m.reset && m.reset(); } catch (\_) {} }
registry.clear();
}
module.exports = { registerMock, resetAll };

B) Low-level client (AttributeValue shapes) — only if you need it

// shared/testing/helpers/dynamodb-attr.js

const { mockClient } = require('aws-sdk-client-mock');
const {
DynamoDBClient,
GetItemCommand,
PutItemCommand
} = require('@aws-sdk/client-dynamodb');
const { marshall } = require('@aws-sdk/util-dynamodb');
const { deepEqual } = require('../utils/deepEqual');
const { registerMock } = require('../utils/registry');

function createDynamoMockAttribute() {
const low = mockClient(DynamoDBClient);

const api = {
whenGetItemByKey({ table, key }, result) {
const marshalledKey = marshall(key);
low.on(GetItemCommand, (input) =>
input.TableName === table && deepEqual(input.Key, marshalledKey)
).resolves(result == null ? {} : { Item: marshall(result) });
},
whenGetItem({ table }, result) {
low.on(GetItemCommand, (input) =>
input.TableName === table
).resolves(result == null ? {} : { Item: marshall(result) });
},
whenPutItem({ table, item }) {
const marshalledItem = marshall(item);
low.on(PutItemCommand, (input) =>
input.TableName === table && deepEqual(input.Item, marshalledItem)
).resolves({});
},
reset() { low.reset(); },
raw: low
};

registerMock(api);
return api;
}

module.exports = { createDynamoMockAttribute };

C) Public entrypoints (one clean import path)

// shared/testing/index.js

module.exports = {
dynamo: require('./helpers/dynamodb'), // document-mode helpers
dynamoAttr: require('./helpers/dynamodb-attr'), // attribute-mode helpers (optional)
// s3: require('./helpers/s3'),
// lambda: require('./helpers/lambda'),
// sns: require('./helpers/sns'),
// sqs: require('./helpers/sqs')
};

Usage in tests:

const { createDynamoMock } = require('@hic/testing-facade/dynamodb'). // if you publish per-service entries
// or
const { dynamo } = require('@hic/testing-facade');
const { createDynamoMock } = dynamo;

const ddb = createDynamoMock();
afterEach(() => ddb.reset());

D) Jest preset + auto-reset (JS)

// shared/testing/jest-preset.js

module.exports = {
testEnvironment: 'node',
setupFilesAfterEnv: ['@hic/testing-facade/jest.setup.js'],
};

// shared/testing/jest.setup.js

const { resetAll } = require('./utils/registry');
afterEach(() => resetAll());

In a consumer package:

{
"jest": {
"preset": "@hic/testing-facade/jest-preset"
}
}

E) ESLint guard (same in JS)

{
"rules": {
"no-restricted-imports": ["error", {
"paths": [
{ "name": "aws-sdk-client-mock", "message": "Use @hic/testing-facade instead." },
{ "name": "@aws-sdk/client-dynamodb", "importNames": ["DynamoDBClient"], "message": "Use the facade in tests." }
]
}]
}
}

F) pnpm & workspace (unchanged)

pnpm-workspace.yaml scopes which packages participate.

Root package.json:

{
"scripts": { "test": "pnpm -r test" },
"pnpm": {
"overrides": { "@aws-sdk/_": "^3.800.0" },
"packageExtensions": {
"ts-jest@_": { "peerDependencies": { "jest": "\*" } }
}
}
}

.npmrc:

shared-workspace-lockfile=true
auto-install-peers=true

G) Lambda Layers via SSM (unchanged)

Your publishing script and CloudFormation/SSM wiring is identical in JS projects; no TypeScript specifics there.

Net: do any recommendations change materially?

No change in architecture or rollout plan.

Two concrete JS helpers provided so you don’t need TS:

createDynamoMock() (DocumentClient/plain-JS) — use this by default.

createDynamoMockAttribute() (low-level/AttributeValue) — only if you have tests hitting the raw client.

Jest preset/registry now in JS.

Keep the other guidance (matchers, ESLint guard, SSM-backed layer ARNs, governance) as-is.

If you want, I can also drop in JS facades for S3/SNS/SQS/Lambda next, following the same pattern (predicate matchers + auto-reset).
