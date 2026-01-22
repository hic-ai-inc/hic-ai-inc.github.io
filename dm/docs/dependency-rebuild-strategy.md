# Dependency Rebuild Strategy - From Bloat to Minimal

## 🚨 Current Disaster
- **14 Lambda functions** getting **15x average bloat**
- **QA system**: 5 of 6 Lambdas need ZERO dependencies, get 15
- **Most Lambdas**: Need 0-3 deps, get 15 (including Jest!)
- **Only 2 utilities truly shared**: safe-logger, safe-json-parse

## 🎯 Rebuild Plan

### Phase 1: Strip Shared Package to Studs
**New minimal shared package should contain ONLY:**
- `safe-logger.js`
- `safe-json-parse.js`
- **Nothing else** - no AWS SDKs, no Jest, no utilities

### Phase 2: Create Precise Lambda Layers

#### HIC-Minimal-Utils-Layer
- safe-logger, safe-json-parse
- **Size**: ~5KB
- **Used by**: All Lambdas

#### HIC-DDB-Layer  
- @aws-sdk/client-dynamodb only
- **Used by**: callback-handler, llm-request-router, model-selector, response-processor, knowledge-persistence

#### HIC-SQS-Layer
- @aws-sdk/client-sqs only  
- **Used by**: llm-request-router, model-selector, response-processor

#### HIC-Lambda-Invoke-Layer
- @aws-sdk/client-lambda only
- **Used by**: qa-dispatcher

#### HIC-Bedrock-Layer
- @aws-sdk/client-bedrock-runtime only
- **Used by**: model-selector

#### HIC-S3-Layer
- @aws-sdk/client-s3 only
- **Used by**: knowledge-persistence

#### HIC-Secrets-SFN-Layer
- @aws-sdk/client-secrets-manager, @aws-sdk/client-sfn
- **Used by**: research-rfa bridge functions

### Phase 3: Lambda-Specific Optimization

#### QA System (Biggest Win)
- **qa-dispatcher**: Minimal-Utils + Lambda-Invoke layers
- **5 worker functions**: Minimal-Utils layer ONLY
- **Reduction**: From 15 deps to 0-1 deps per function

#### LLM-Access System  
- **model-selector**: Minimal-Utils + DDB + SQS + Bedrock layers
- **router/processor**: Minimal-Utils + DDB + SQS layers
- **callback-handler**: Minimal-Utils + DDB layers
- **utilities**: Minimal-Utils layer ONLY

#### Research-DB System
- **knowledge-persistence**: Minimal-Utils + DDB + S3 layers

#### Research-RFA Bridge
- **Both functions**: Minimal-Utils + Secrets-SFN layers

## 📊 Expected Results

### Before (Current Bloat):
```
Every Lambda: 15 dependencies (80MB+)
- All AWS SDKs (needed or not)
- Jest testing framework  
- Mock libraries
- Unused utilities
```

### After (Minimal Layers):
```
qa-collator: 1 layer (5KB) - 99.9% reduction
qa-dispatcher: 2 layers (10KB) - 99.8% reduction  
model-selector: 4 layers (25KB) - 99.7% reduction
knowledge-persistence: 3 layers (20KB) - 99.8% reduction
```

## 🚀 Implementation Steps

### Step 1: Create New Minimal Shared Package
```json
{
  "name": "hic-minimal-shared",
  "dependencies": {},
  "files": ["utils/safe-logger.js", "utils/safe-json-parse.js"]
}
```

### Step 2: Create Layer Templates
- One CloudFormation template per layer
- Precise SDK versions
- No cross-contamination

### Step 3: Update Lambda References
- Remove shared package bloat references
- Add only required layers per function
- Test each function individually

### Step 4: Separate Test Dependencies
- Create HIC-Test-Layer for Jest/mocking
- Used ONLY by test environments
- Never referenced by production Lambdas

## 💡 Key Insights

1. **Most Lambdas need almost nothing** - they're pure business logic
2. **Only 2 utilities are truly shared** across systems
3. **Each Lambda has specific, minimal AWS SDK needs**
4. **Test dependencies should never touch production**

This rebuild will transform your deployment experience from "dependency hell" to "minimal precision" - exactly what Lambda functions should be!