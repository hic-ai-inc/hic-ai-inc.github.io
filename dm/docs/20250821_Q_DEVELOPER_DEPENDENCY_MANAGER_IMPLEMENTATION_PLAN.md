# Q Developer Dependency Manager Implementation Plan

**Date**: August 21, 2025  
**Context**: Final implementation plan based on GPT-5 consensus and Q Developer analysis  
**Status**: Ready for GPT-5 review and implementation  

## Executive Summary

After extensive analysis with GPT-5, we have reached consensus on a **"Minimal-Plus" architecture** that solves HIC's dependency bloat (80MB→5KB) while maintaining all existing functionality and providing a clear evolution path to enterprise scale.

**Core Decision**: Implement simple shared testing package with three strategic guardrails that prevent future migration pain while delivering immediate value.

## Background Recap

### The Problem
- **Dependency Bloat**: 81+ Lambda functions across 8 modules, each with 80MB packages vs 5KB actual needs
- **Root Cause**: Every Lambda includes all AWS SDKs + Jest dependencies
- **Current Working State**: 133 passing tests in QA module using aws-sdk-client-mock pattern
- **Risk**: Over-engineering complex solutions for theoretical future problems

### The Analysis Process
1. **Initial Approach**: Built complete dependency-manager system with modular Lambda layers
2. **Complexity Challenge**: Faced circular dependencies and architecture complexity
3. **GPT-5 Consultation**: Received two detailed architectural recommendations
4. **Q Developer Analysis**: Identified simpler solution that achieves 90% benefits with 10% complexity
5. **Consensus Reached**: GPT-5 endorsed "minimal-plus" approach with strategic guardrails

## Consensus Solution: Minimal-Plus Architecture

### Core Components

**1. Shared Testing Package**
- Centralize Jest + aws-sdk-client-mock in `shared/testing/`
- Use proven HIC pattern: `"@hic/testing-shared": "file:../../shared/testing"`
- Eliminate duplicate testing dependencies across modules

**2. Façade-Style Helpers**
- Abstract away raw `mockClient` calls with stable helper functions
- Enable future migration to complex architecture without test code changes
- Maintain consistent testing patterns across modules

**3. PeerDependencies + Overrides**
- Use peerDependencies for AWS SDKs (modules own versions)
- Root-level overrides keep SDK versions coherent
- Prevent version conflicts without lockstep coupling

**4. Future Evolution Path**
- Clear migration strategy to complex architecture when needed
- Defined triggers for when to add conformance testing
- Maintains flexibility without immediate complexity

## Detailed Implementation Plan

### Phase 1: Foundation Setup (Week 1)

**1.1 Create Shared Testing Structure**
```bash
mkdir -p shared/testing/helpers
mkdir -p shared/testing/docs
```

**1.2 Shared Package Configuration**
```json
// shared/testing/package.json
{
  "name": "@hic/testing-shared",
  "version": "0.1.0",
  "peerDependencies": {
    "@aws-sdk/client-dynamodb": ">=3.700 <4",
    "@aws-sdk/client-s3": ">=3.700 <4",
    "@aws-sdk/client-lambda": ">=3.700 <4"
  },
  "devDependencies": {
    "aws-sdk-client-mock": "^4.0.0",
    "jest": "^29.7.0",
    "jest-environment-node": "^29.0.0"
  }
}
```

**1.3 Helper Façades**
```javascript
// shared/testing/helpers/dynamodb.js
const { mockClient } = require('aws-sdk-client-mock');
const { DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand, QueryCommand } = 
  require('@aws-sdk/client-dynamodb');

function createDynamoMock() {
  const clientMock = mockClient(DynamoDBClient);
  
  return {
    whenGetItem: ({ table, key }, result) => {
      clientMock.on(GetItemCommand, { TableName: table }).resolves({
        Item: result ? result : undefined
      });
    },
    whenPutItem: ({ table, item }) => {
      clientMock.on(PutItemCommand, { TableName: table }).resolves({});
    },
    whenUpdateItem: ({ table, key, update }) => {
      clientMock.on(UpdateItemCommand, { TableName: table }).resolves({});
    },
    whenQuery: (params, items = []) => {
      clientMock.on(QueryCommand).resolves({ Items: items });
    },
    reset: () => clientMock.reset(),
    raw: clientMock // Escape hatch for complex cases
  };
}

module.exports = { createDynamoMock };
```

**1.4 Root-Level SDK Version Management**
```json
// Root package.json additions
{
  "pnpm": {
    "overrides": {
      "@aws-sdk/*": "^3.800.0"
    }
  }
}
```

### Phase 2: Pilot Migration - QA Module (Week 2)

**2.1 Update QA Test Dependencies**
```json
// qa/tests/package.json
{
  "name": "qa-tests",
  "devDependencies": {
    "@hic/testing-shared": "file:../../shared/testing"
  }
}
```

**2.2 Migrate QA Test Imports**
```javascript
// BEFORE: qa/tests/lambda/qa-dispatcher.test.js
const { mockClient } = require('aws-sdk-client-mock');
const { LambdaClient } = require('@aws-sdk/client-lambda');
const lambdaMock = mockClient(LambdaClient);

// AFTER: qa/tests/lambda/qa-dispatcher.test.js
const { createLambdaMock } = require('@hic/testing-shared/helpers/lambda');
const lambda = createLambdaMock();
```

**2.3 Validation**
- Run all 133 QA tests to ensure zero breaking changes
- Measure package size reduction
- Validate CI/CD pipeline compatibility

### Phase 3: Rollout to Remaining Modules (Weeks 3-4)

**3.1 Module-by-Module Migration**
Apply same pattern to:
- `rfa-unified/tests/`
- `api-auth-unified/tests/`
- `research/tests/`
- All other modules with tests

**3.2 Remove Duplicate Dependencies**
```json
// Remove from each module's package.json
{
  "devDependencies": {
    // REMOVE: "jest": "^29.7.0"
    // REMOVE: "aws-sdk-client-mock": "^4.0.0"
    // REMOVE: Other duplicated test dependencies
  }
}
```

### Phase 4: Documentation and Optimization (Week 5)

**4.1 Create Testing Cookbook**
```markdown
// shared/testing/TESTING_GUIDE.md
# HIC Testing Guide

## Common Patterns
- Mocking DynamoDB operations
- Testing error conditions
- Debugging test failures

## Best Practices
- When to use mocks vs integration tests
- Test organization strategies
```

**4.2 Measure and Document Results**
- Bundle size reduction metrics
- Test execution time improvements
- Developer experience feedback

## Impact Analysis

### 1. New Lambda Layer Implementation
**No Change**: Existing layer deployment process remains identical
```bash
cd dependency-manager/layers
bash build-all-layers.sh
bash deploy-all-layers.sh
```

**Testing New Lambdas**: Use standardized shared helpers
```javascript
const { createDynamoMock } = require('@hic/testing-shared/helpers/dynamodb');
const dynamo = createDynamoMock();
```

### 2. Migrating Existing Systems
**Production Code**: Update to use centralized layers
```javascript
// BEFORE: Bloated direct imports
const AWS = require('aws-sdk');

// AFTER: Lean layer-based imports
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb'); // From layer
```

**CloudFormation**: Add layer references
```yaml
MyLambdaFunction:
  Type: AWS::Lambda::Function
  Properties:
    Layers:
      - !Ref HicDynamodbLayer
      - !Ref HicStorageLayer
```

### 3. Testing Without Production Dependencies
**Isolation**: Testing dependencies stay in `tests/` directories with separate `package.json`
**No Leakage**: Production bundles never include Jest or mocks
**Standardization**: All modules use same testing patterns

### 4. CI/CD Pipeline
**Efficiency**: Single installation of shared testing dependencies
**Parallel Testing**: All modules test simultaneously with shared deps
**Simplicity**: Focus on core product development without testing complexity

### 5. Developer Experience
**Consistency**: Same helper functions across all modules
**Simplicity**: One-line imports for all mocking needs
**Documentation**: Shared cookbook for common testing patterns

## Benefits Summary

### ✅ Immediate Value
- **Eliminates 80MB→5KB bloat** by centralizing dependencies
- **Preserves all 133 existing tests** with minimal changes
- **Uses proven HIC patterns** (`file:../../shared`)
- **Delivers results in days, not weeks**

### ✅ Future-Proofed
- **Façade pattern** enables painless architecture evolution
- **PeerDependencies** prevent version conflicts
- **Clear evolution path** for v1 scale (1,000+ Lambdas)
- **Simple evolution path** when conformance testing becomes necessary

### ✅ Risk Mitigation
- **No circular dependencies** (testing is leaf dependency)
- **No breaking changes** to existing patterns
- **Incremental rollout** (module by module)
- **Full rollback capability** if needed

## Evolution Triggers

**Revisit architecture when any 2 occur**:
- ≥3 AWS services mocked (DDB + SQS + SNS/S3)
- ≥2 SDK version bands in parallel for >30 days
- ≥3 teams pushing test helpers
- Compliance audit requires contract proofs

**Evolution Path**:
- Add `@hic/contracts` (JSON Schemas for events/DTOs)
- Publish to CodeArtifact (no more `file:` links)
- Split helpers by SDK major version if needed
- Expand conformance to include SQS/SNS

## Success Metrics

- **Bundle Size**: Median Lambda package size reduction (target: 80MB→5KB)
- **Test Coverage**: Maintain 100% pass rate during migration
- **Developer Velocity**: Time to add new mocked service
- **Simplicity**: Reduced cognitive overhead for developers

## Questions for GPT-5 Deep Research

**Priority**: Request Deep Research with citations for comprehensive implementation guidance

### 1. Practical Mock Implementation and Debugging
**Question**: "Can you provide a comprehensive guide with citations on implementing and debugging AWS SDK mocks in Jest environments? Specifically:
- Best practices for structuring mock helper functions (createDynamoMock, createS3Mock, etc.)
- Common patterns for mocking complex AWS operations (conditional updates, batch operations, pagination)
- Debugging strategies when tests fail due to mock configuration issues
- How to handle edge cases like AWS service errors, throttling, and retries in mocks
- Real-world examples of mock façade patterns that remain stable during SDK version changes"

### 2. GitHub Actions CI/CD Best Practices
**Question**: "Can you provide detailed GitHub Actions CI/CD pipeline configurations with citations for Node.js monorepo testing? Specifically:
- Optimal workflow structure for testing multiple modules with shared dependencies
- Caching strategies for node_modules and pnpm/npm dependencies
- Parallel job execution for faster CI times
- Proper handling of file: dependencies in CI environments
- Security best practices for AWS credentials in GitHub Actions
- Matrix testing strategies for multiple Node.js versions
- Integration with AWS deployment workflows"

### 3. Monorepo Dependency Management
**Question**: "Can you provide comprehensive guidance with citations on managing shared dependencies in Node.js monorepos? Specifically:
- pnpm vs npm vs yarn workspaces for shared testing dependencies
- Best practices for peerDependencies and overrides configuration
- Handling version conflicts between modules in monorepo environments
- Strategies for gradual migration from individual module dependencies to shared packages
- Performance optimization for dependency installation in CI/CD"

### 4. Testing Architecture Evolution
**Question**: "Can you provide guidance with citations on when and how to evolve testing architectures in growing codebases? Specifically:
- Metrics and triggers for determining when simple shared testing becomes insufficient
- Migration strategies from file: dependencies to published packages
- Best practices for maintaining backward compatibility during testing infrastructure changes
- Governance models for shared testing utilities in multi-team environments
- Cost-benefit analysis of testing complexity vs development velocity"

### 5. AWS SDK Testing Patterns
**Question**: "Can you provide detailed patterns with citations for testing AWS SDK v3 applications? Specifically:
- Comprehensive examples of mocking DynamoDB, S3, Lambda, SQS, and SNS operations
- Handling both legacy v2 and modern v3 SDK patterns in the same codebase
- Testing strategies for AWS SDK error handling and retry logic
- Mock patterns that accurately reflect AWS service behavior and limitations
- Integration testing approaches that don't require actual AWS resources"

### 6. Circular Dependency Prevention in Testing Infrastructure
**Question**: "Can you provide comprehensive guidance with citations on preventing circular dependencies when implementing shared testing infrastructure? Specifically:
- Architectural patterns that ensure testing utilities never import application code
- Dependency graph design principles for monorepos with shared testing packages
- How to structure testing infrastructure so it remains a 'leaf' dependency
- Best practices for testing the testing infrastructure itself without creating cycles
- Common circular dependency anti-patterns in Node.js testing setups and how to avoid them
- Strategies for validating dependency graphs in CI/CD to catch circular dependencies early
- Real-world examples of testing infrastructure that scales without circular dependency issues
- How to handle cases where testing utilities need to validate against application contracts without importing application code"

## Implementation Priority

**Immediate Focus**: Core product development with dependency bloat resolution
**Deferred**: Advanced conformance testing and LocalStack integration
**Research Needed**: Practical implementation details and circular dependency prevention from GPT-5 deep research

## Next Steps

1. **GPT-5 Deep Research**: Request comprehensive answers to above questions with citations
2. **Implementation Start**: Begin Phase 1 foundation setup based on research findings
3. **QA Pilot**: Validate approach with existing 133 tests
4. **Measure Results**: Document bloat reduction achieved
5. **Full Rollout**: Apply to all modules systematically

---

**Consensus Achieved**: Both GPT-5 responses and Q Developer analysis align on this minimal-plus approach as the optimal balance of immediate value, future flexibility, and implementation simplicity. Deep research requested for practical implementation details.

///

END OF Q DEVELOPER PROMPT

///

RESPONSE FROM GPT-5 WITH DEEP RESEARCH AND EXTENDED INFERENCE:

Implementation Research Report
1. AWS SDK Mocking in Jest: Implementation and Debugging

Structured Mock Helpers: When using the AWS SDK for JavaScript (v3) with Jest, a best practice is to centralize common mocking patterns into helper functions (like createDynamoMock, createS3Mock, etc.). This follows the façade pattern – your tests call high-level helper methods (e.g. whenGetItem, whenPutItem) instead of the raw aws-sdk-client-mock API. This indirection ensures that if the underlying SDK or mock library changes, you can update the helpers without rewriting every test. For example, a helper might wrap mockClient(DynamoDBClient) and provide methods like whenGetItem({table, key}, result) to stub GetItemCommand responses
aws.amazon.com
aws.amazon.com
. By encapsulating .on(Command).resolves() calls inside a helper, tests stay clean and stable: even if AWS changes method names or you migrate to a new testing approach, the tests remain unchanged – only the helper implementation updates. This façade approach is reflected in the plan’s code sample, where tests do const dynamo = createDynamoMock() and call methods on dynamo instead of directly using mockClient
stackoverflow.com
stackoverflow.com
. It’s a proven strategy to maintain consistency across modules and ease future migrations.

Mocking Complex Operations: The aws-sdk-client-mock library supports rich behaviors for complex AWS operations like conditional writes, batch operations, and pagination. You can chain multiple .on() calls to simulate different responses based on input parameters or call order. For example, you might stub a DynamoDB Query to return an empty result on the first call and some items on the second call, to test pagination logic. The library provides .resolvesOnce() and .rejectsOnce() for sequential behaviors
m-radzikowski.github.io
m-radzikowski.github.io
. It also allows partial parameter matching – you can specify only the relevant bits of the command input that matter for the test, and the mock will ignore extra fields unless you enable strict matching
m-radzikowski.github.io
m-radzikowski.github.io
. This is useful for conditional updates or batch writes: you can stub, say, a TransactWriteItemsCommand with particular conditions to return a ConditionalCheckFailed exception by using .rejects() with an error object whose name matches the AWS error (e.g. ConditionalCheckFailedException)
m-radzikowski.github.io
. The library even supports custom implementations via .callsFake(), so you can programmatically decide what to return based on the input (for instance, simulate different page tokens for pagination)
m-radzikowski.github.io
m-radzikowski.github.io
. Real-world usage shows how to mock S3 multipart uploads by stubbing multiple underlying commands (CreateMultipartUpload, UploadPart, CompleteMultipartUpload) – demonstrating that even multi-step operations can be handled by defining the necessary sequence of mock responses
m-radzikowski.github.io
m-radzikowski.github.io
. In summary, you can comprehensively mock complex AWS SDK v3 workflows by combining these features: chainable responses, input-based filters, sequential outputs, and custom logic injections.

Debugging Failed Tests: When tests fail due to mock configuration issues, a structured approach is needed. First, ensure isolation between tests. Always reset or restore mocks in a beforeEach to avoid state leaking from one test to another
aws.amazon.com
. If you find that calls from previous tests persist (e.g. a mock recording more invocations than expected), consider using resetHistory() in addition to reset() – or even restore() for a clean slate
stackoverflow.com
stackoverflow.com
. The difference is that reset() clears stubs and history but keeps the mock in place, whereas restore() completely removes the mocking and returns the client to real behavior
m-radzikowski.github.io
m-radzikowski.github.io
. A common pattern is to call mock.reset() before each test, and use mock.restore() in a top-level afterAll if needed. For example, developers on StackOverflow noted that only restore() fully cleared certain persistent state, and recommended re-initializing the mock after restoring
stackoverflow.com
stackoverflow.com
. Another debugging tip is to leverage the library’s call inspection and Jest matchers. You can retrieve all calls (e.g. snsMock.calls()) or use built-in matchers like toHaveReceivedCommandWith to assert exactly what parameters were received
m-radzikowski.github.io
m-radzikowski.github.io
. If a test is failing, these tools let you see whether the function under test called the AWS SDK in the way you expected. Often, a misconfigured mock (e.g. wrong command class or payload filter) results in the SDK call not matching any stub, causing the real AWS call to happen or an unhandled promise rejection. Checking mock.calls() will quickly show if your stub was hit or not. In summary, reset aggressively and use the introspection features to debug mismatches between your expectations and actual calls.

Handling AWS Errors and Edge Cases: Your tests should also verify how code handles AWS-side errors like throttling, timeouts, or partial failures. The mock library makes this straightforward: you can have a stub reject with a specific error. For instance, to simulate AWS throttling, create an Error with name "ThrottlingException" and use snsMock.rejects(throttlingError) – your code should see it as if the SDK threw that error
m-radzikowski.github.io
. If your code has retry logic, you can simulate a failure on the first call and success on the second by chaining .resolvesOnce() and .rejectsOnce() calls
m-radzikowski.github.io
m-radzikowski.github.io
. This ensures your retry code path is executed in tests. Also consider service-specific quirks: e.g., S3’s GetObject returns a stream. The docs note you’ll need to wrap a dummy stream with sdkStreamMixin() to mimic what the real SDK does
m-radzikowski.github.io
m-radzikowski.github.io
if your code calls .transformToString() on the Body. By accounting for such details, your mocks can closely mirror AWS behavior. Always test both the happy path and failure modes. For example, have one test where DynamoDB’s GetItemCommand returns data, and another where it returns Item: undefined to simulate a missing record
aws.amazon.com
aws.amazon.com
. This way you validate that your code handles “not found” cases gracefully.

Stable Facade for SDK Evolution: The facade-style helpers not only make tests cleaner, but also insulate against SDK version changes. AWS SDK v3 uses a different call style than v2 (command objects + send() vs. direct method calls). If you have legacy code still using v2 (e.g. calling docClient.put(params).promise()), you’ll need a different approach to test those. One option is to use the older community library aws-sdk-mock for v2
aws.amazon.com
, which can stub methods of the global AWS SDK v2 object. However, a better strategy is to migrate gradually toward SDK v3 in your tests by wrapping even v2 calls in a facade. For example, your createDynamoMock helper can internally stub either v3 commands or, if detecting a v2 usage, stub the v2 method. The AWS SDK v3 actually provides v2-style convenience methods (e.g. you can call client.putItem({...}) directly without send()) for backwards compatibility
m-radzikowski.github.io
. The official guidance is to mock those via the v3 client class and command objects anyway
m-radzikowski.github.io
m-radzikowski.github.io
. In practice, this means if some of your functions use older patterns, you can still use the new aws-sdk-client-mock: just ensure you call mockClient on the v3 client class and stub the appropriate Command. The facade can hide these details. Over time, as you fully transition to v3 across the codebase, your tests won’t need to change at all – only the implementation of the helpers might simplify. This approach of one stable test interface decouples tests from the specific SDK version, preventing “lock-in” to a deprecated approach and easing future upgrades.
2. GitHub Actions CI/CD for a Node.js Monorepo

Workflow Structure for Multiple Modules: In a monorepo with many modules (like 8+ modules and shared packages), it’s best to have a single unified CI workflow that can run tests for all modules, but structured to avoid redundant work. You can use GitHub Actions matrix jobs or dynamic job generation to handle multiple modules in parallel. For example, a matrix can be defined with an array of module names, and each matrix job runs pnpm run test filtered to that module
stackoverflow.com
stackoverflow.com
. This means each module’s tests execute in separate jobs concurrently, which can significantly speed up CI. An even more advanced pattern is to auto-detect modules that changed and generate the matrix dynamically
stackoverflow.com
stackoverflow.com
. One approach, as shown by an open-source snippet, is to run a script (pnpm -s list-packages) that outputs a JSON array of package names, then use fromJson in the workflow to feed that into a matrix
stackoverflow.com
stackoverflow.com
. This way, you don’t need to manually update the matrix when modules are added or removed. In summary, parallelize by module to keep CI times low, and consider dynamic matrices for scalability. If tests are fast and you prefer simplicity, you could also run a single job that runs all tests together, but as the repo grows that becomes a bottleneck. Parallel jobs ensure one slow module doesn’t hold back others.

Dependency Caching: Caching dependencies is crucial for CI speed, especially with a large monorepo. GitHub’s official Node.js Action now supports dependency caching out-of-the-box for npm, Yarn, and pnpm
pnpm.io
. Using actions/setup-node@v4 with cache: "pnpm" will cache your node_modules/pnpm store between builds
pnpm.io
. Since you use pnpm, what actually gets cached is pnpm’s content-addressable store (~/.pnpm-store) rather than each project’s node_modules. This gives huge speed gains on subsequent runs – pnpm can just symlink packages from the store without re-downloading. The example in pnpm’s docs shows a simple workflow snippet: checkout, set up pnpm, then use setup-node with cache enabled
pnpm.io
pnpm.io
. Additionally, because all modules share a single lockfile, one cache covers the whole monorepo. Ensure the cache key includes pnpm-lock.yaml (the default in setup-node does this) so it busts when dependencies change. With caching, we’ve seen cold installs that took minutes drop to under a minute on cache hits
oleksiipopov.com
oleksiipopov.com
. Also consider partial installs: pnpm can install only needed sub-packages via pnpm install --filter <pkg> if you want to isolate dependencies by module in separate jobs, but typically in a monorepo it’s simpler to do a top-level install (caching will make it fast) and then run tests.

Handling file: Dependencies in CI: Using local packages via file:../../shared/testing is convenient, but requires CI to have the proper folder structure. As long as your repository is checked out entirely (which actions/checkout does), pnpm and npm will resolve the file: references to the local folder. There’s no special step needed beyond a normal install. Pnpm will treat the shared package as part of the workspace if configured, or simply link it. One thing to watch is that caching should include these built artifacts if any. In our case, shared/testing is just JS/TS, so installing it means linking the folder. If you run pnpm install at the root, it will automatically symlink the local package thanks to the workspace file references
pnpm.io
. In CI, ensure you run builds or compiles for any TS code in shared packages before running tests in consuming packages, if they rely on compiled output. For pure JS or if tests run in TS with ts-jest, you might not need a separate build step. The key point is that GitHub Actions can handle file: deps just like any other – just don’t shallow-checkout only part of the repo.

Parallel Execution and Matrix Strategies: As mentioned, matrix jobs can run tests on multiple Node versions (e.g. testing on Node 16, 18, 20) to ensure compatibility. You can add another dimension to the matrix for Node versions
pnpm.io
pnpm.io
. This will multiply the jobs (e.g. 8 modules * 2 Node versions = 16 jobs), so use it thoughtfully based on need. Another form of parallelism is splitting different tasks (lint, unit test, integration test, etc.) into separate jobs that run simultaneously. GitHub Actions allows defining multiple jobs that start after the build step. For example, you might have one job that runs all unit tests (perhaps as matrix), another that builds and deploys layers, etc., all triggered on the same push. Use the needs: dependency if a job must wait for another (e.g. a deploy job needs tests to pass first). Since our focus is testing, we likely have a single “Test” job (matrix) and can have a subsequent “Deploy” job that depends on Test.

Secure AWS Credential Management: Storing long-lived AWS keys in GitHub secrets is workable but not ideal. A modern best practice is to use GitHub’s OpenID Connect (OIDC) federation to obtain short-lived AWS credentials at build time. With OIDC, your workflow requests a token from GitHub’s OIDC provider and AWS STS issues temporary creds for a role – no static secrets needed. GitHub’s docs “Configuring OpenID Connect in AWS” explain that this allows GitHub Actions to access AWS **“without needing to store the AWS credentials as long-lived secrets.”*
docs.github.com
. The setup involves an IAM role with a trust policy for GitHub’s identity, and then using the aws-actions/configure-aws-credentials action to fetch credentials within the job
docs.github.com
docs.github.com
. We recommend configuring this if you haven’t already: it improves security by eliminating secret access keys (which could leak) and it scopes the permissions tightly to the repo or environment. If OIDC is not immediately feasible, at least use GitHub Encrypted Secrets for AWS keys and restrict their access to specific environments/branches. Avoid hard-coding any credentials in the repository. Also consider using a role with minimal privileges needed for deployments, and enabling CloudTrail or Access Analyzer to monitor the use of those creds from CI.

CI/CD Pipeline Integration: Given that HIC uses AWS Lambda and layers, your GitHub Actions pipeline can not only run tests but also package and deploy. You might create a job (or separate workflow) that runs on push to main or on a release tag, which builds the Lambda layers and functions and deploys them (via AWS CLI or CloudFormation). This job would use the AWS credentials as discussed. To keep things organized, use artifacts or caching for build outputs if the build is heavy. For instance, if you package layers as zip files, you can store those as workflow artifacts to use in a later deploy step. Another tip: enable branch or path filters so that if you change only tests or docs, you don’t run expensive deploy jobs. GitHub Actions supports paths: conditions to, say, skip the deploy if no production code changed. This ensures CI is efficient and focuses on relevant changes
stackoverflow.com
.

Matrix and Monorepo Testing: If you need to run different combinations of services or configurations, consider using strategy matrices for that too. For example, testing AWS SDK v2 and v3 behaviors might be done by setting an environment variable matrix (though in our case, we test both in one run). Also leverage the GitHub Actions cache for any other heavy dependencies (like if you use Chrome for integration tests or have a Python layer – there are actions to cache those as well). Always measure CI time before and after these changes. With a properly cached monorepo setup and parallel jobs, you should see dramatic improvements. For instance, a pnpm monorepo can often install deps in under 30 seconds on cache hits
oleksiipopov.com
, and if tests are parallelized, the slowest test suite’s duration becomes the total time.
3. Monorepo Dependency Management Best Practices

Choosing a Package Manager (pnpm vs npm vs Yarn): For a growing monorepo, pnpm is widely regarded as a top choice due to its speed and disk space efficiency. Yarn (Classic) was a popular monorepo solution and npm gained workspace support in v7, but pnpm’s design offers concrete benefits. It uses a global content-addressable store with hard links, so all modules share the same copies of packages, drastically cutting space and install time
oleksiipopov.com
oleksiipopov.com
. In benchmarks, pnpm often outpaces others especially for repeated installs and large repos, thanks to aggressive caching
oleksiipopov.com
. Yarn Berry (v2+) introduces Plug’n’Play installs (no node_modules at all) which can be even faster, but it requires more ecosystem adjustments and isn’t as widely adopted yet (market share for Yarn 2 is much lower)
oleksiipopov.com
. npm workspaces have improved, but still perform the slower “copying” style installs, and historically had issues with hoisting. Given that HIC already uses pnpm, staying with it is pragmatic – it’s purpose-built for monorepos and the industry trend leans toward pnpm for multi-project repos
oleksiipopov.com
oleksiipopov.com
. In short, pnpm offers the best mix of speed, strictness (avoiding phantom dependencies), and easy workspace linking. Yarn Workspaces (classic) could handle the linking similarly and might be fine too, but since pnpm is in place and solving the problems, there’s no compelling reason to switch. If anything, ensure all team members use the same pnpm version and enable pnpm’s strict settings to catch dependency issues early.

Peer Dependencies and Version Overriding: In a monorepo, using peerDependencies for libraries like AWS SDK in a shared package is a smart strategy. Our shared testing package declares AWS SDK clients in peerDependencies (e.g. DynamoDB, S3 clients)
pnpm.io
. This means each service/module that uses @hic/testing-shared must provide its own AWS SDK dependency (ensuring it matches a compatible version). Why do this? It prevents duplicate copies of the SDK – all modules will use the single version they depend on (which, via pnpm workspace, will typically be hoisted or linked to one resolution). To guarantee consistency, we also use pnpm overrides at the root to force all @aws-sdk/* to a specific version range
pnpm.io
pnpm.io
. This root override ensures that even if one module’s package.json has a slightly different version, pnpm will resolve them to the same version (3.800.0 in the example). Using overrides or a consistent version policy avoids the dreaded situation of having two different AWS SDK versions in different Lambdas by accident. Overall, the combination of peerDependencies + root override locks the version across the repo while avoiding bundling the SDK into the shared package itself.

When conflicts do occur (say Module A needs SDK v3.200 and Module B needs v3.300), peerDependencies will at least warn of the discrepancy. A best practice is to resolve such conflicts proactively – update one module or introduce conditional loading if truly needed. In npm and pnpm, by default, unresolved or conflicting peer deps will just log warnings, so keep an eye on your install logs. Don’t ignore peer warnings; treat them as a smell to fix. If two versions are absolutely needed (e.g. two Lambda modules using different major versions), pnpm can technically install both, but that complicates the layer strategy and is better avoided. The plan’s guardrail of a single override for all AWS SDK v3 ensures this doesn’t happen at runtime.

Gradual Migration to Shared Packages: Adopting a shared dependency (like our testing package) should be done incrementally to mitigate risk. The plan outlines migrating one module (QA) as a pilot, then extending to others. This is a textbook rollout: start with a low-risk module, confirm all tests still pass with the shared package, then proceed module by module【Q Developer Memo】. In practice, you’ll remove the duplicate devDependencies (Jest, aws-sdk-client-mock, etc.) from each module’s package.json and add @hic/testing-shared instead【Q Memo Phase 3.2】. During the transition, it’s wise to run the entire test suite frequently to catch any module that might have a unique quirk. Communication with the team is key too – ensure everyone knows to use the new helpers and not reintroduce old patterns. A potential challenge is if some module had a unique version of a dependency; the solution is to verify that the unified version (e.g. Jest 29.x) is compatible with all tests. It likely is, but be prepared to adjust test code if something relies on an older Jest behavior.

Another tip: use version control to your advantage. Each module migration can be a separate pull request, making it easier to bisect issues if something fails. Since tests are green in QA with the new setup, any failures in later modules might reveal hidden assumptions in tests (for example, maybe a test was accidentally importing a module from another package, etc., which the new structure uncovers).

Handling Version Conflicts: In a large monorepo, it’s almost inevitable that dependencies diverge at times (perhaps one team updates a library while another hasn’t yet). Tools like pnpm are strict by default – they will try to avoid duplicates. If two versions are truly incompatible, pnpm will isolate them, but you want to minimize that. A good practice is to periodically audit dependency versions across packages. You can use pnpm outdated across the workspace or third-party tools to list different version ranges used for the same library. Aim to converge them. If you must temporarily allow multiple versions, pnpm can do it, but mark it as technical debt to resolve. In our context, AWS SDK should remain single-version. Other dev tools (like eslint, typescript) can sometimes be different per module, which is fine as long as they don’t conflict during a combined build.

pnpm vs Others – Performance: We should highlight performance optimizations since CI/CD time is crucial for developer velocity. pnpm’s ability to install in parallel and link dependencies yields very fast installs. According to a comparison, a cached pnpm install can be under 1 second for a project since it just links files
oleksiipopov.com
. Yarn’s Plug’n’Play would avoid install entirely after initial, but that requires all tools (Jest, etc.) to support PnP (which in 2025 they generally do, but switching to Yarn 2 at this point might be more churn). npmis fine but slower and uses more disk (100% duplication vs pnpm’s ~25% disk usage in monorepos)
oleksiipopov.com
. Summing up: sticking with pnpm aligns with monorepo best practices and will scale to our target of 1000+ Lambdas by using content-addressed storage and fast installs
oleksiipopov.com
.

Dev vs Prod Dependencies Separation: One more note – ensure that testing packages like our shared testing lib are devDependencies in each module. This keeps production Lambda bundles slim. pnpm will not include devDeps when you do a production install or a pnpm pack of the Lambda function package. By centralizing test deps, you’ve made it clear that things like Jest and the AWS mock are only needed in test context. This is already evident in our package.json setups, but worth verifying after migration: run a production build of a Lambda and confirm that none of the test libraries are getting included erroneously. The structure of separate tests/ package.json helps with this – as long as you don’t accidentally require @hic/testing-shared from production code, it won’t be bundled, preserving the ~5 KB Lambda package goal.

Workspace Tools: As an aside, there are advanced tools like Nx or Turborepo which can orchestrate monorepos, but they might be overkill given our plan. We are achieving most benefits with pnpm workspaces and some manual scripting. Nx, for instance, could detect affected projects on each change and run only those tests, but it introduces its own complexity. Our approach is simpler and sufficient now; just keep these tools in mind if build times or test orchestration becomes a bottleneck in the future (say, at 1000 Lambdas, running all tests all the time might be slow, and an affected-only strategy could help).
4. Evolving Testing Architecture at Scale

When to Reassess the Test Strategy: Right now, a shared testing package with mocks addresses our immediate needs. But as HIC scales, watch for certain trigger points that signal it’s time to evolve the testing architecture. The memo already proposes some triggers, which align with industry experience. For example, if you find that more and more AWS services are being mocked (DynamoDB, S3, Lambda, SQS, SNS, etc.), you might eventually introduce a more sophisticated solution like contract testing or local integration tests. Specifically, if we exceed 3 or more core services being heavily mocked, that’s a cue to consider formalizing contract tests for those interactions or using something like LocalStack for integration tests of AWS calls. Similarly, if you have multiple versions of the AWS SDK in play (say AWS releases v4 and some teams upgrade while others lag), and this persists >30 days, it indicates the need for versioned test utilities (e.g. separate helpers for v4) or a broader upgrade plan. Another trigger is organizational: if 3+ teams are contributing to the shared testing utilities and coordination becomes an issue, it might be time to establish a maintainer group or ownership model for the testing package. The goal is to avoid a scenario where changes to testing utils break other teams’ tests unexpectedly. A formal review process or even moving the shared library to its own repository (or an internal package registry like CodeArtifact) could be warranted at that stage.

Migration to Published Packages: As soon as the shared test helpers become relatively stable and widely used, consider publishing them to a private npm registry (e.g. AWS CodeArtifact or GitHub Packages). Using file: links is fine in a closed monorepo, but publishing has advantages: versioning and outside-project reuse. When you publish @hic/testing-shared v1.0.0, each module can declare that version. Teams can then upgrade the testing library on their schedule by bumping the version, rather than it changing instantly for all via a file reference. This decoupling can be important in a large enterprise – it provides backward compatibility during transitions. For example, you could release a v2.0.0 of testing-shared with new features or breaking changes, and not all teams have to jump to it at once. They can stick on v1 until ready. In a file-reference approach, you’d have to coordinate a flag-day update for everyone. So, as soon as maintaining multiple versions or wanting strict semver control becomes an issue, publish the package. That said, within our monorepo right now, file references work and ensure everyone uses the latest – which is good for now to avoid drift. A possible interim is to use workspace: syntax* (pnpm supports "@hic/testing-shared": "workspace:*" to always use latest from repo). But eventually, yes, an internal registry and semver versions will be cleaner.

Maintaining Backward Compatibility: When evolving test infrastructure, plan changes to minimize disruption. For instance, if we introduce an @hic/contracts package containing JSON schemas or TypeScript interfaces for Lambda events, we should ensure that older tests (which might have been asserting on raw payload shapes) still pass. We might provide adapter functions or deprecate old usage gradually. A concrete example: suppose currently tests manually construct DynamoDB event objects, and in future we add a contract schema for them. We could create helper builders in the testing package that use the new schema but accept parameters in the old way, so tests can seamlessly move to using the contract without rewriting every literal object. In multi-team environments, a deprecation policy is useful – e.g. announce that “by version 2 of testing-shared, we will remove function X, please migrate in the next 3 sprints.” Because tests are not production code, teams might prioritize these changes lower, so give ample time and clarity. Also, maintain a CHANGELOG or migration guide in the shared testing repo so that anyone updating the package version can see what changed (similar to how external libraries communicate).

Governance Model for Shared Utilities: The StackOverflow discussion on internal common libraries highlights that success requires dedicated ownership and clear processes
stackoverflow.com
stackoverflow.com
. We should assign a small group (perhaps one QA representative and one developer from core team) as maintainers of the testing package. Their job is to review contributions, write documentation, and ensure quality (like adding unit tests for the helpers themselves). Indeed, treat the testing utils as its own product – with regular releases, version control, and thorough tests
stackoverflow.com
stackoverflow.com
. Encourage contributions by making it easy: good documentation (our Testing Guide), clear guidelines (coding style, semantic versioning rules for the package), and maybe even incentives (recognition for improving test efficiency). At the same time, control the quality: every new helper or mock pattern should come with tests (the testing-shared package can have its own Jest tests that run during CI). This avoids broken helpers which would cascade failures to all modules.

An internal library should also release often, as one answer noted – “release it on regular intervals… release often so that new submissions show up in the product frequently”
stackoverflow.com
. Frequent releases (or just merges, in a monorepo case) prevent divergence and keep everyone on latest, assuming we stick with file reference or a single version. If we publish versions, releasing often means teams aren’t stuck waiting months for a fix or improvement – you can issue v1.1, v1.2 rapidly. We just have to coordinate if a release has breaking changes (likely rare for test helpers – we can strive to keep them additive and backward-compatible as long as possible).

Cost-Benefit of Complexity vs. Velocity: We consciously chose a simpler approach over an over-engineered one. This is generally wise – over-engineering too early can slow down development more than it helps. We should periodically evaluate: Is our current testing approach still giving us more benefit than cost? Right now, yes – it massively cuts down maintenance (one place to update mocks) and package size, with minimal complexity. In the future, if requirements like contract verification or integration tests (perhaps using local AWS emulators) come in, we’ll introduce additional complexity carefully. The key is to match the solution to the scale of the problem:

    Small scale (current): Simple shared library, purely in-memory mocks, fast unit tests. Low complexity, high dev velocity. This addresses immediate pain (dependency bloat) at 90% of the benefit and only 10% complexity.

    Medium scale: As more teams and services join, we might add a layer of contract testing. For example, define schemas for events and responses so that tests can validate not just that “Lambda X invoked DynamoDB” but that it did so following a known contract. This is an extra safety net for correctness as the system grows. Contract testing frameworks (like Pact) could be considered when there are many independent deployable services
    getambassador.io
    getambassador.io
    , but for our Lambdas within one system, a simpler approach might be just shared schemas and using them in tests.

    Large scale: At 1000+ Lambdas and many teams, you might need a full testing platform: some tests using mocks (fast unit tests), some using local integration tests (perhaps using LocalStack to spin up fake AWS services for more confidence), and maybe some lightweight end-to-end tests in a staging environment. Each layer adds complexity (e.g. LocalStack tests are slower and require Docker, etc.), so we only add them as needed. The triggers defined help decide when to layer these on – for example, a compliance requirement for more realistic testing could force us to incorporate such tools.

Remember that every additional testing layer or tool can slow down developers if not managed well. So if velocity dips because tests are flaky or too slow, that’s a sign the approach needs refining. A periodic review (maybe every quarter) of test suite health (flakiness rate, average runtime, coverage, etc.) can inform if we need changes. The success metrics we set – e.g. developer velocity: time to add a new mocked service – should remain low. If adding a new AWS service to our mocks becomes non-trivial or error-prone, maybe the architecture needs to evolve (perhaps by generating some boilerplate or abstracting further).

Multi-Team Coordination: As multiple teams start writing tests with shared utils, setting up a community of practice might help. For instance, a monthly meeting of QA/developers from each team to discuss testing pain points or needed features in the shared lib. This governance by collaboration ensures the shared library actually addresses real needs and teams feel ownership. It also mitigates the risk of one team unilaterally changing the library and breaking others – decisions become a bit more collective (or at least communicated). The StackOverflow advice resonates: “make it easy for people to contribute…and put one or two developers in charge with allocated time”
stackoverflow.com
stackoverflow.com
. So management should acknowledge that maintaining the test infrastructure is an ongoing effort that deserves time allocation, not just a one-time project.

In summary, keep it simple until it isn’t simple anymore. Use triggers like number of services, version conflicts, team count, and compliance needs to decide when to introduce more sophisticated testing measures. And when you do, do it in a backward-compatible, incremental way – maintain support for old patterns during a transition, communicate changes, and possibly version the testing framework so teams can upgrade gradually. Our “Minimal-Plus” approach can grow with the product – it has a clear evolution path (layers and contract tests) when needed, but until those needs are concrete, it wisely avoids burdening the team with unnecessary complexity.
5. AWS SDK Testing Patterns (v3 and v2)

Mocking AWS Services (DynamoDB, S3, Lambda, SQS, SNS): Thanks to the aws-sdk-client-mock library, the approach to all these services is uniform. You create a mock for the respective client and stub command calls. For DynamoDB (v3 DocumentClient), as we’ve done, you’d use ddbMock.on(GetCommand).resolves({...}) for specific GetItem outputs
aws.amazon.com
, or ddbMock.on(QueryCommand).resolves({Items: [...]}) for queries, etc. For S3, you might use s3Mock.on(PutObjectCommand).resolves({}) to simulate a successful put, or even provide a fake ETag. The library handles SNS and SQS similarly – e.g. snsMock.on(PublishCommand).resolves({MessageId: '...'}); for SNS publish
m-radzikowski.github.io
m-radzikowski.github.io
, or sqsMock.on(SendMessageCommand).resolves({MessageId: '...'}); for SQS. If testing Lambda invocations (calling one Lambda from another), you’d stub LambdaClient’s InvokeCommand. In our tests we already have patterns for Lambda via createLambdaMock – likely wrapping lambdaMock.on(InvokeCommand). In short, for each AWS service operation that your code calls, identify the corresponding Command class in AWS SDK v3 and use .on(Command, [optional input filter]) to define the desired outcome.

For batch operations, like BatchWriteItem or SQS ReceiveMessage with multiple messages, you return an array or list just as the real SDK would. For example, sqsMock.on(ReceiveMessageCommand).resolves({Messages: [{...}, {...}]}) to simulate receiving two messages. For pagination, if your code uses the SDK’s built-in paginators (async iterators), you might need to simulate multiple calls. The library doesn’t automatically iterate, but you can stub the underlying command multiple times. Alternatively, for simpler manual pagination (where code calls an API in a loop until no NextToken), you can use .resolvesOnce({...NextToken: 'token'}) then .resolves({ ...no NextToken }) to simulate two pages.

Error Handling and Retries: It’s important to test error paths. As mentioned earlier, use .rejects() to simulate thrown exceptions from AWS calls
m-radzikowski.github.io
. You can provide specific error types by creating an Error with a .name property. AWS SDK v3 typically throws errors that are instances of Error with names like ResourceNotFoundException or ThrottlingException. Your code might be checking err.name or using the instanceof on the SDK error classes. In tests, ensuring the name matches is usually sufficient, but if using instanceof, you might need to import and throw the actual Error class from @aws-sdk/... (which is rare, usually name or status code checks). For retry logic, if your code uses the SDK v3 middleware-based retries (which it does by default for idempotent operations), you might not explicitly see retry in code. But you can still test your own wrapper’s retry by making the first call fail and subsequent calls succeed. The mock library’s .resolvesOnce and .rejectsOnce shine here – e.g., simulate 1st attempt throws ThrottlingException, 2nd attempt returns data, and then assert that the final result was success and maybe that the mock recorded two calls
stackoverflow.com
stackoverflow.com
. The library even provides helper matchers like toHaveReceivedCommandTimes to assert how many times a command was called (useful to verify that a retry was attempted the expected number of times)
m-radzikowski.github.io
m-radzikowski.github.io
.

AWS SDK v2 vs v3 in Same Codebase: Managing both versions in tests can be tricky but doable. For any new code using SDK v3, prefer using the mock library as above. For legacy v2 SDK code (for example, code that does AWS.DynamoDB.DocumentClient() and calls .update()), you can use the older aws-sdk-mock library
aws.amazon.com
. The usage of aws-sdk-mock (by DWYL) is to call AWS.mock('DynamoDB.DocumentClient', 'update', (params, callback) => { ... }) to stub a method. If only a few functions use v2, writing manual mocks via Jest might be sufficient: e.g. jest.spyOn(AWS.DynamoDB.DocumentClient.prototype, 'update').mockImplementation((params) => Promise.resolve(...)). However, a cleaner approach is to refactor the v2 calls behind an interface if possible. For instance, create a small wrapper in your code: updateItem(table, key, updateExpr) { if(usingV3) ddbClient.send(new UpdateItemCommand) else docClient.update().promise() }. Then your tests can mock that wrapper uniformly. This may or may not be worth it depending on how soon you plan to upgrade those remaining functions to v3. Given the small number of v2 usages (7 functions with update, 4 with put), an argument can be made to just bite the bullet and convert them to v3 clients now (to avoid needing v2-specific test solutions). If that’s not immediately feasible, consider using both mocking libraries side by side: use aws-sdk-client-mock for all v3 clients, and use aws-sdk-mock for the global v2 SDK. They won’t conflict as long as you don’t call them on the same class. The AWS blog explicitly mentions aws-sdk-mock for v2 and the new library for v3
aws.amazon.com
.

Realistic Service Behavior: When writing tests, try to mirror real AWS behavior where it matters. For example, DynamoDB’s GetItem when item is missing returns {Item: undefined}, not an error – and our tests reflect that by resolving with Item: undefined for a miss
aws.amazon.com
. For S3’s GetObjectCommand, as noted, the Body is a special stream. If your code doesn’t use .transformToString() or similar, you might get away with returning a simple Buffer or string. But if it does, then follow the pattern to use sdkStreamMixin to wrap a Node.js stream
m-radzikowski.github.io
m-radzikowski.github.io
. Another example: when simulating AWS Lambda invocation, if the function errors out, AWS still returns a 200 HTTP with a payload that contains the error information. It might not be necessary to replicate that binary blob, but at least you might test a success path (StatusCode 200 and some FunctionError maybe). For most services, the simpler approach of resolve with the expected output object, or reject with an Error for exceptions, suffices.

Also think about side effects: e.g., if your code upon S3 upload calls .on('httpUploadProgress'), our tests would need to handle that event emitter. The library can’t easily simulate events, but you can call the listener yourself in your test after the upload promise resolves. Or you can use the partial mocking approach: in one of the docs examples, they override the S3 client’s endpoint to a dummy value via callsFake, which hints at doing minimal changes to let code run
m-radzikowski.github.io
. Usually, unit tests won’t go so far as to use actual streams or events – those are more integration test concerns. But be aware of these details in case a test fails due to an unfulfilled expectation (like a stream not being readable).

Integration Testing Without AWS: Pure unit tests with mocks are fast and cover logic, but they don’t guarantee that your code works against real AWS. To increase confidence without hitting AWS in CI, some teams use LocalStack (an AWS emulator). This would allow you to spin up a fake DynamoDB or S3 and run the SDK against it. The downside is slower tests and the complexity of managing a Docker service in CI. Given our context (fast-moving dev, currently 133 tests passing with mocks), it’s fine to rely on mocks and trust AWS SDK itself. The AWS SDK is well-tested by AWS; what we need to test is our integration logic. Contract testing, as discussed, is another approach: define the expected request/response contracts for interactions between components. For internal interactions (e.g. one Lambda calling another or putting to SQS), we can simulate that with structured objects. For external interactions (Lambda to AWS service), usually we trust AWS to do what it’s supposed to if our requests are correct. However, as the system grows, having a small number of smoke tests that run against a real AWS environment (perhaps in a staging account) can be valuable. These wouldn’t run on every commit, but maybe nightly or before a deployment, using actual AWS resources provisioned for testing. This catches any drift between our assumptions in mocks and reality. For example, if AWS adds a required parameter and our code/mocks didn’t catch that, an integration test would. In summary, continue using the efficient mock-based tests day-to-day, and plan for a supplemental integration test layer if needed for critical paths (maybe using a framework like AWS’s SAM CLI with local integration tests or a small deployed test stack).

Legacy Code Testing: For the few legacy v2 patterns, note that the v2 SDK uses callbacks or .promise(). If using aws-sdk-mock, the mocks will automatically call the provided callback or return a promise as needed. If stubbing manually, remember to return a Promise (or use util.promisify on callback functions in tests). The dev.to article by Jan Grzesik shows an example of trying to jest.mock the v2 SDK and running into issues with references
dev.to
dev.to
. The conclusion was that using the community aws-sdk-mock was easier for v2. As we migrate everything to v3, those problems disappear. The v3 modular SDK, combined with aws-sdk-client-mock, is the long-term solution and our façade helpers are built on that.
6. Preventing Circular Dependencies in Test Infrastructure

Architectural Patterns to Avoid Cycles: The cardinal rule is one-way dependencies – production code can never depend on test code. We enforce this by where we place our code: all testing utilities reside in a clearly separate package (shared/testing) which is only listed as a devDependency in test projects. None of our runtime Lambda packages should include @hic/testing-shared in their dependencies. This way, even if someone tried to import a testing helper in production code, it would fail to resolve in the Lambda build (since devDeps aren’t installed in production build). Still, we should be vigilant. One way to enforce this is via automated checks. For example, there are tools that analyze import graphs; we could run a check that ensures no module outside tests/ imports the testing package. A simpler approach is a naming convention – sometimes teams prefix test modules with something like test- and production modules with something like lib-, then a lint rule can ban any import that has test- in it from non-test files.

Ensuring the Testing Package is a Leaf: In dependency graph terms, @hic/testing-shared should be a leaf node – nothing depends on it except tests. We’ve arranged that by design. To illustrate, if our modules are A, B, C (Lambdas) and T (testing), we want A->T, B->T, C->T, and no edge from T back to any of A, B, C. Also, T should not depend on any of A/B/C (it doesn’t; its package.json doesn’t list them). This means you can run pnpm why @hic/testing-shared and see only test packages referencing it. To guarantee it stays that way, never import application code into the testing library. This can be tempting if, for instance, you want a helper to create a DynamoDB item that matches your app’s schema. You might think, “I’ll import the User model from the app into the testing package to use its schema.” Resist that – that would introduce a reverse dependency (testing depends on app code). Instead, pass the needed schema or values from the test into the helper, or define a lightweight representation (like a JSON schema in the contracts package). Another approach is to place common domain data (like JSON schemas or TypeScript types for items) in a neutral location that both app and test can depend on (for example, a separate @hic/contracts package as planned). That @hic/contracts would contain things like object shapes, validation schemas, etc., and both the production code and @hic/testing-shared could depend on @hic/contracts
innovation.ebayinc.com
dev.to
without creating a cycle (contracts is a shared low-level package). This is essentially how you share things without direct coupling. Many organizations use this pattern to avoid duplicating things like API models between services – it’s similar here for test vs prod code.

Testing the Testing Infrastructure: A conundrum can arise: how do we test our test helpers without causing dependency issues? The answer is to test them in isolation. The shared/testing package can have its own test suite (perhaps in shared/testing/__tests__ and possibly using a minimal testing framework like a simple Jest setup). These tests would import the helpers and perhaps simulate a fake AWS SDK call to ensure the stubbing works. Crucially, these tests should not import any application code – they should use dummy inputs. For example, to test createDynamoMock.whenGetItem, you can call it and then do a fake DynamoDBClient.send(GetItemCommand) to verify it returns the stubbed value. This way, the testing package’s tests are self-contained and only verify that our facade does what we expect (essentially they’re ensuring our usage of aws-sdk-client-mock is correct and that our convenience methods behave). This doesn’t create circularity since we’re not involving other packages.

When the testing package itself changes, run its tests and also maybe run one module’s tests as a smoke to ensure nothing broke. In CI, if we have a job to run all tests, it will naturally run shared/testing tests too if included. Ensuring the testing package has 100% coverage for its functions can give confidence that any failure in application tests are due to integration issues, not bugs in the test helpers.

Dependency Graph Validation: It might be worthwhile to incorporate a tool like Madge or Nx lint rules to catch circular dependencies. Madge is a CLI that analyzes require/import graphs and can list cycles
stackoverflow.com
andrejsabrickis.medium.com
. We could run Madge in CI as a step to ensure no cycles. In a monorepo, especially one managed by pnpm or Nx, you might also see warnings if a cycle exists (Nx, for example, has nx dep-graph which can highlight cycles, and it has a enforceCircularDependencies: true option to fail builds on cycles
github.com
). Given our relatively simple dependency structure (each Lambda is independent, and they share only a few common libs), cycles are unlikely except by human mistake. But adding an automated check is cheap insurance.

Common Anti-Patterns and How to Avoid Them: A known anti-pattern is having test code reside in the same module as production code (which can inadvertently be included in builds). In some languages, like Go, if you put test helpers in a non-_test file, they can end up in production binary
dolthub.com
dolthub.com
. In Node, that’s less of an issue because devDependencies aren’t installed in prod. However, if someone placed a testing helper in a production file out of convenience, that could bloat the Lambda or cause runtime errors (since Jest isn’t there). Our separate folder/package approach prevents that structurally. Another anti-pattern: test depending on production initializers. For example, if a test triggered some singleton from the app which then refers back to test config, you could get a knot. Instead, tests should instantiate only the units under test, not full app context unless truly integration testing. Keep unit tests focused.

Also be wary of circular devDependencies: e.g., if @hic/testing-shared for some reason listed one of the service packages in its devDependencies (maybe to use some types), that’s a cycle in the dev graph. We should avoid that; if needed, extract types to @hic/contracts or duplicate small constants. Generally, devDependencies cycles are not as harmful (they don’t affect production), but they can confuse build tools or editors.

Validating Against Application Contracts Without Importing App Code: This is where having a separate contracts package is ideal. Suppose you want to validate that a DynamoDB item fixture you created in a test conforms to the application’s schema. Instead of importing the application’s ORM or model, you could have a JSON schema for a valid item in @hic/contracts that both the app and the test can use. The test can then import the schema from contracts and validate the fake item (maybe using a library like Ajv for JSON schema validation). This way, the test indirectly ensures alignment with app’s expectations, without the test code reaching into app code. Another approach: if the application code already has validation logic (say a function validateItem(item)), you still don’t want to call that directly in tests (that’s more like testing the app code itself rather than the integration). Instead, you’d unit test validateItem within the app, and separately ensure your test data is correct by duplication or schemas. It’s a subtle point – generally tests should know about the app’s interface (e.g., function inputs/outputs) but not its inner workings. If the “contract” is something like “Lambda A’s output should be valid input for Lambda B”, you could formalize that by putting a schema or TypeScript type for that data structure in contracts, then both Lambdas and tests use that.

Real-World Example – Avoiding Cycles: In a large-scale example, Google’s monorepo approach strictly separates test-only code and production code, and uses presubmit checks to enforce that no prod code depends on test code (they even have different Bazel visibility rules). While our setup is simpler, we emulate the spirit by our folder structure and dependency declarations. Another scenario to avoid: sometimes test code might need to refer to application constants (say an event type string). If a constant is defined in application code, one might think to import it into tests. This is fine (tests can import from app code – that’s one-way), but what if you wanted to define expected outputs in the testing package for reuse? If you do so by importing the constant and then exporting it from testing package, you just made a path from testing to app and back to testing, which is circular. Instead, either duplicate the constant in testing (acceptable if not too volatile) or better, move the constant to a common location (again, a contracts or constants package). In general, any value used in both app and tests that could cause a cycle should be placed in a common dependency. That common dependency can be extremely small – even a single JSON file – as long as it resides in a lower layer than both.

Continuous Enforcement: Consider adding a step in CI that uses a script to parse package.json files and ensure no disallowed dependencies. For instance, fail if any production package lists @hic/testing-shared in dependencies (should only be devDependencies in test packages). Also ensure testing package has no dependency on any @hic/* except perhaps @hic/contracts. These are simple grep or JSON queries that can be done in a lint step.

By following these practices, we keep the test infrastructure truly isolated. The testing codebase becomes a leaf in the dep graph that can be developed independently and updated without entangling the production code. This reduces the chance of weird coupling bugs (like tests passing due to some shared global state with app, etc.) and keeps deployment artifacts lean. A final thought: documentation helps here too. In the Testing Guide, explicitly state: “Testing utilities should never import from application modules. If you find yourself needing something from app code, consider moving that definition to a shared contracts package or duplicating it.” Making this guideline clear to all contributors will prevent well-meaning but cycle-inducing changes.

Sources:

    AWS Developer Blog – Mocking AWS SDK v3 in Unit Tests
    aws.amazon.com
    aws.amazon.com

    AWS Developer Blog – Chaining multiple responses for DynamoDB in tests
    aws.amazon.com

    AWS SDK Client Mock Documentation – Sequential resolvesOnce and error simulation
    m-radzikowski.github.io
    m-radzikowski.github.io

    Stack Overflow – Using restore() to avoid cross-test mock interference
    stackoverflow.com
    stackoverflow.com

    AWS SDK Client Mock Documentation – Custom callsFake usage for conditional logic
    m-radzikowski.github.io
    m-radzikowski.github.io

    AWS SDK Client Mock Documentation – Mocking S3 Upload and multi-part behavior
    m-radzikowski.github.io
    m-radzikowski.github.io

    AWS Developer Blog – Recommendation of aws-sdk-mock for SDK v2 testing
    aws.amazon.com

    AWS SDK Client Mock Documentation – Supporting v2-style client calls in v3
    m-radzikowski.github.io
    m-radzikowski.github.io

    pnpm official docs – GitHub Actions workflow caching with setup-node
    pnpm.io
    pnpm.io

    Stack Overflow – Parallel matrix jobs for pnpm monorepo on GitHub Actions
    stackoverflow.com
    stackoverflow.com

    Oleksii Popov Blog – Package manager comparison (npm vs Yarn vs pnpm)
    oleksiipopov.com
    oleksiipopov.com

    Oleksii Popov Blog – Monorepo install performance: pnpm vs others
    oleksiipopov.com
    oleksiipopov.com

    Inedo Blog – Best practices for internal npm packages (governance)
    stackoverflow.com
    stackoverflow.com

    AWS SDK Client Mock Documentation – Jest matchers to verify calls (received times)
    m-radzikowski.github.io
    m-radzikowski.github.io

    GitHub Docs – Using OIDC for GitHub Actions to avoid long-lived secrets
    docs.github.com
    docs.github.com

    Stack Overflow – Common libraries in large teams (maintainer and test requirements)
    stackoverflow.com
    stackoverflow.com

Citations

Mocking modular AWS SDK for JavaScript (v3) in Unit Tests | AWS Developer Tools Blog
https://aws.amazon.com/blogs/developer/mocking-modular-aws-sdk-for-javascript-v3-in-unit-tests/

Mocking modular AWS SDK for JavaScript (v3) in Unit Tests | AWS Developer Tools Blog
https://aws.amazon.com/blogs/developer/mocking-modular-aws-sdk-for-javascript-v3-in-unit-tests/

javascript - Why does mock has not reset in Jest for aws sdk v3 unit testing? - Stack Overflow
https://stackoverflow.com/questions/75945593/why-does-mock-has-not-reset-in-jest-for-aws-sdk-v3-unit-testing

javascript - Why does mock has not reset in Jest for aws sdk v3 unit testing? - Stack Overflow
https://stackoverflow.com/questions/75945593/why-does-mock-has-not-reset-in-jest-for-aws-sdk-v3-unit-testing

AWS SDK v3 Client mock - v4.0.2
https://m-radzikowski.github.io/aws-sdk-client-mock/

AWS SDK v3 Client mock - v4.0.2
https://m-radzikowski.github.io/aws-sdk-client-mock/

AWS SDK v3 Client mock - v4.0.2
https://m-radzikowski.github.io/aws-sdk-client-mock/

AWS SDK v3 Client mock - v4.0.2
https://m-radzikowski.github.io/aws-sdk-client-mock/

AWS SDK v3 Client mock - v4.0.2
https://m-radzikowski.github.io/aws-sdk-client-mock/

AWS SDK v3 Client mock - v4.0.2
https://m-radzikowski.github.io/aws-sdk-client-mock/

AWS SDK v3 Client mock - v4.0.2
https://m-radzikowski.github.io/aws-sdk-client-mock/

AWS SDK v3 Client mock - v4.0.2
https://m-radzikowski.github.io/aws-sdk-client-mock/

AWS SDK v3 Client mock - v4.0.2
https://m-radzikowski.github.io/aws-sdk-client-mock/

Mocking modular AWS SDK for JavaScript (v3) in Unit Tests | AWS Developer Tools Blog
https://aws.amazon.com/blogs/developer/mocking-modular-aws-sdk-for-javascript-v3-in-unit-tests/

javascript - Why does mock has not reset in Jest for aws sdk v3 unit testing? - Stack Overflow
https://stackoverflow.com/questions/75945593/why-does-mock-has-not-reset-in-jest-for-aws-sdk-v3-unit-testing

javascript - Why does mock has not reset in Jest for aws sdk v3 unit testing? - Stack Overflow
https://stackoverflow.com/questions/75945593/why-does-mock-has-not-reset-in-jest-for-aws-sdk-v3-unit-testing

AWS SDK v3 Client mock - v4.0.2
https://m-radzikowski.github.io/aws-sdk-client-mock/

AWS SDK v3 Client mock - v4.0.2
https://m-radzikowski.github.io/aws-sdk-client-mock/

javascript - Why does mock has not reset in Jest for aws sdk v3 unit testing? - Stack Overflow
https://stackoverflow.com/questions/75945593/why-does-mock-has-not-reset-in-jest-for-aws-sdk-v3-unit-testing

javascript - Why does mock has not reset in Jest for aws sdk v3 unit testing? - Stack Overflow
https://stackoverflow.com/questions/75945593/why-does-mock-has-not-reset-in-jest-for-aws-sdk-v3-unit-testing

AWS SDK v3 Client mock - v4.0.2
https://m-radzikowski.github.io/aws-sdk-client-mock/

AWS SDK v3 Client mock - v4.0.2
https://m-radzikowski.github.io/aws-sdk-client-mock/

AWS SDK v3 Client mock - v4.0.2
https://m-radzikowski.github.io/aws-sdk-client-mock/

AWS SDK v3 Client mock - v4.0.2
https://m-radzikowski.github.io/aws-sdk-client-mock/

AWS SDK v3 Client mock - v4.0.2
https://m-radzikowski.github.io/aws-sdk-client-mock/

AWS SDK v3 Client mock - v4.0.2
https://m-radzikowski.github.io/aws-sdk-client-mock/

Mocking modular AWS SDK for JavaScript (v3) in Unit Tests | AWS Developer Tools Blog
https://aws.amazon.com/blogs/developer/mocking-modular-aws-sdk-for-javascript-v3-in-unit-tests/

Mocking modular AWS SDK for JavaScript (v3) in Unit Tests | AWS Developer Tools Blog
https://aws.amazon.com/blogs/developer/mocking-modular-aws-sdk-for-javascript-v3-in-unit-tests/

AWS SDK v3 Client mock - v4.0.2
https://m-radzikowski.github.io/aws-sdk-client-mock/

AWS SDK v3 Client mock - v4.0.2
https://m-radzikowski.github.io/aws-sdk-client-mock/

AWS SDK v3 Client mock - v4.0.2
https://m-radzikowski.github.io/aws-sdk-client-mock/

continuous integration - How can I run PNPM workspace projects as parallel jobs on GitHub Actions? - Stack Overflow
https://stackoverflow.com/questions/68427503/how-can-i-run-pnpm-workspace-projects-as-parallel-jobs-on-github-actions

continuous integration - How can I run PNPM workspace projects as parallel jobs on GitHub Actions? - Stack Overflow
https://stackoverflow.com/questions/68427503/how-can-i-run-pnpm-workspace-projects-as-parallel-jobs-on-github-actions

continuous integration - How can I run PNPM workspace projects as parallel jobs on GitHub Actions? - Stack Overflow
https://stackoverflow.com/questions/68427503/how-can-i-run-pnpm-workspace-projects-as-parallel-jobs-on-github-actions

continuous integration - How can I run PNPM workspace projects as parallel jobs on GitHub Actions? - Stack Overflow
https://stackoverflow.com/questions/68427503/how-can-i-run-pnpm-workspace-projects-as-parallel-jobs-on-github-actions

continuous integration - How can I run PNPM workspace projects as parallel jobs on GitHub Actions? - Stack Overflow
https://stackoverflow.com/questions/68427503/how-can-i-run-pnpm-workspace-projects-as-parallel-jobs-on-github-actions

continuous integration - How can I run PNPM workspace projects as parallel jobs on GitHub Actions? - Stack Overflow
https://stackoverflow.com/questions/68427503/how-can-i-run-pnpm-workspace-projects-as-parallel-jobs-on-github-actions

Continuous Integration | pnpm
https://pnpm.io/continuous-integration

Continuous Integration | pnpm
https://pnpm.io/continuous-integration

Continuous Integration | pnpm
https://pnpm.io/continuous-integration

Continuous Integration | pnpm
https://pnpm.io/continuous-integration

NPM Package Managers Comparison: npm vs Yarn vs pnpm - Oleksii Popov
https://oleksiipopov.com/blog/npm-package-managers-comparison/

NPM Package Managers Comparison: npm vs Yarn vs pnpm - Oleksii Popov
https://oleksiipopov.com/blog/npm-package-managers-comparison/

Continuous Integration | pnpm
https://pnpm.io/continuous-integration

Continuous Integration | pnpm
https://pnpm.io/continuous-integration

Configuring OpenID Connect in Amazon Web Services - GitHub Docs
https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws

Configuring OpenID Connect in Amazon Web Services - GitHub Docs
https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws

Configuring OpenID Connect in Amazon Web Services - GitHub Docs
https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws

Deploy individual services from a monorepo using github actions
https://stackoverflow.com/questions/58136102/deploy-individual-services-from-a-monorepo-using-github-actions

NPM Package Managers Comparison: npm vs Yarn vs pnpm - Oleksii Popov
https://oleksiipopov.com/blog/npm-package-managers-comparison/

NPM Package Managers Comparison: npm vs Yarn vs pnpm - Oleksii Popov
https://oleksiipopov.com/blog/npm-package-managers-comparison/

NPM Package Managers Comparison: npm vs Yarn vs pnpm - Oleksii Popov
https://oleksiipopov.com/blog/npm-package-managers-comparison/

NPM Package Managers Comparison: npm vs Yarn vs pnpm - Oleksii Popov
https://oleksiipopov.com/blog/npm-package-managers-comparison/

NPM Package Managers Comparison: npm vs Yarn vs pnpm - Oleksii Popov
https://oleksiipopov.com/blog/npm-package-managers-comparison/

NPM Package Managers Comparison: npm vs Yarn vs pnpm - Oleksii Popov
https://oleksiipopov.com/blog/npm-package-managers-comparison/

Continuous Integration | pnpm
https://pnpm.io/continuous-integration

Continuous Integration | pnpm
https://pnpm.io/continuous-integration

NPM Package Managers Comparison: npm vs Yarn vs pnpm - Oleksii Popov
https://oleksiipopov.com/blog/npm-package-managers-comparison/

NPM Package Managers Comparison: npm vs Yarn vs pnpm - Oleksii Popov
https://oleksiipopov.com/blog/npm-package-managers-comparison/

unit testing - Common libraries in a large team - Stack Overflow
https://stackoverflow.com/questions/431007/common-libraries-in-a-large-team

unit testing - Common libraries in a large team - Stack Overflow
https://stackoverflow.com/questions/431007/common-libraries-in-a-large-team

unit testing - Common libraries in a large team - Stack Overflow
https://stackoverflow.com/questions/431007/common-libraries-in-a-large-team

unit testing - Common libraries in a large team - Stack Overflow
https://stackoverflow.com/questions/431007/common-libraries-in-a-large-team

Contract Testing: The Missing Link in Your Microservices Strategy?
https://www.getambassador.io/blog/contract-testing-microservices-strategy

Contract Testing: The Missing Link in Your Microservices Strategy?
https://www.getambassador.io/blog/contract-testing-microservices-strategy

unit testing - Common libraries in a large team - Stack Overflow
https://stackoverflow.com/questions/431007/common-libraries-in-a-large-team

AWS SDK v3 Client mock - v4.0.2
https://m-radzikowski.github.io/aws-sdk-client-mock/

javascript - Why does mock has not reset in Jest for aws sdk v3 unit testing? - Stack Overflow
https://stackoverflow.com/questions/75945593/why-does-mock-has-not-reset-in-jest-for-aws-sdk-v3-unit-testing

AWS SDK v3 Client mock - v4.0.2
https://m-radzikowski.github.io/aws-sdk-client-mock/

AWS SDK v3 Client mock - v4.0.2
https://m-radzikowski.github.io/aws-sdk-client-mock/

AWS SDK v3 Client mock - v4.0.2
https://m-radzikowski.github.io/aws-sdk-client-mock/

How to mock and spy on AWS-SDK calls with jest - DEV Community
https://dev.to/jan_grz/how-to-mock-and-spy-on-aws-sdk-calls-with-jest-c35

How to mock and spy on AWS-SDK calls with jest - DEV Community
https://dev.to/jan_grz/how-to-mock-and-spy-on-aws-sdk-calls-with-jest-c35

API Evolution Is a Challenge. Could Contract Testing Be the Solution?
https://innovation.ebayinc.com/stories/api-evolution-with-confidence-a-case-study-of-contract-testing-adoption-at-ebay/

My thoughts and notes about Consumer Driven Contract Testing
https://dev.to/muratkeremozcan/my-thoughts-and-notes-about-consumer-driven-contract-testing-11id

Detect circular dependencies in project - Stack Overflow
https://stackoverflow.com/questions/44356204/detect-circular-dependencies-in-project

Locate circular dependencies in TypeScript modules - Andrejs Abrickis
https://andrejsabrickis.medium.com/locate-circular-dependencies-in-typescript-modules-2b1eb03dbf2e

Is there any way to just check if my monorepo doesn't contain ...
https://github.com/lerna/lerna/issues/2776

Pruning test dependencies from Go binaries | DoltHub Blog
https://www.dolthub.com/blog/2022-11-07-pruning-test-dependencies-from-golang-binaries/

Pruning test dependencies from Go binaries | DoltHub Blog
https://www.dolthub.com/blog/2022-11-07-pruning-test-dependencies-from-golang-binaries/

Continuous Integration | pnpm
https://pnpm.io/continuous-integration

Continuous Integration | pnpm
https://pnpm.io/continuous-integration

unit testing - Common libraries in a large team - Stack Overflow
https://stackoverflow.com/questions/431007/common-libraries-in-a-large-team

unit testing - Common libraries in a large team - Stack Overflow
https://stackoverflow.com/questions/431007/common-libraries-in-a-large-team