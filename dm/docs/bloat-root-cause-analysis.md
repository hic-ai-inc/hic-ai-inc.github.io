# ROOT CAUSE ANALYSIS - Dependency Bloat

## 🚨 CRITICAL FINDING: Shared Package Bloat

**The shared package (`hic-shared-utilities`) contains ALL AWS SDKs as devDependencies:**

### Shared Package Contents:
- @aws-sdk/client-cognito-identity-provider
- @aws-sdk/client-dynamodb  
- @aws-sdk/lib-dynamodb
- @aws-sdk/client-lambda
- @aws-sdk/client-secrets-manager
- @aws-sdk/client-sfn
- @aws-sdk/client-sns
- @aws-sdk/client-sqs
- @aws-sdk/util-dynamodb
- aws-sdk (v2)
- aws-sdk-client-mock
- jest
- joi
- uuid

**EVERY system references this shared package**, meaning they're all getting ALL dependencies regardless of what they actually need.

## Impact Analysis

### Current Bloat Sources:
1. **Shared Package Bloat**: All systems get all AWS SDKs + Jest + testing tools
2. **Individual Package Bloat**: Systems add their own copies on top
3. **Version Conflicts**: Multiple versions of same packages
4. **Test Dependencies in Production**: Jest and testing tools in Lambda packages

### Systems Analysis:
- **QA**: 15 total deps (9 testing + shared bloat)
- **LLM-Access**: 5 direct + shared bloat  
- **Research-DB**: 5 direct + shared bloat
- **Research-RFA**: 0 direct + shared bloat

## The Real Problem

**Every Lambda function is getting:**
- All 10+ AWS SDK packages (whether needed or not)
- Jest testing framework
- All testing utilities
- Legacy aws-sdk v2 AND v3 packages
- Mock libraries

**Estimated bloat per Lambda: 50-100MB of unnecessary dependencies**

## Solution Strategy

### Phase 1: Eliminate Shared Package Bloat
1. **Remove ALL dependencies from shared package**
2. **Create pattern-specific layers instead**
3. **Move utilities to layers, not shared package**

### Phase 2: Proper Layer Architecture
1. **HIC-Core-Utils-Layer**: uuid, joi, hic-logger (NO AWS SDKs)
2. **HIC-AWS-DDB-Layer**: Only DynamoDB SDKs
3. **HIC-AWS-SQS-Layer**: Only SQS SDKs  
4. **HIC-AWS-Bedrock-Layer**: Only Bedrock SDKs
5. **HIC-Test-Layer**: Jest + testing (separate from production)

### Phase 3: Clean System Dependencies
1. **Remove shared package references**
2. **Add only required layers per Lambda**
3. **Separate test dependencies completely**

## Expected Impact

### Before (Current):
- Every Lambda: ~80MB (all AWS SDKs + Jest + utilities)
- 16 Lambda functions × 80MB = ~1.3GB total bloat

### After (Layers):
- Core Lambda: ~5MB (business logic only)
- Shared layers: ~30MB total (reused across all)
- **95% size reduction per Lambda**

## Immediate Action Required

**The shared package is the root cause.** All layer strategies will fail until this is fixed first.

**Priority 1**: Remove dependencies from shared package
**Priority 2**: Create proper layer architecture  
**Priority 3**: Migrate systems to use layers instead of shared package