# Target Systems Analysis - Production-Ready Systems

## System Overview

### QA System (6 Lambda Functions)
**Lambda Functions:**
- `qa-dispatcher.js` - Uses: @aws-sdk/client-lambda
- `qa-collator.js` - No AWS SDKs
- `qa-policy-worker.js` - No AWS SDKs  
- `qa-reproducibility-worker.js` - No AWS SDKs
- `qa-structure-worker.js` - No AWS SDKs
- `qa-style-worker.js` - No AWS SDKs

**Dependencies:**
- Production: 3 deps (uuid, joi, @aws-sdk/client-lambda)
- Dev: 12 deps (HEAVY Jest bloat)
- **Jest Dependencies**: jest, jest-environment-node, jest-junit, jest-watch-typeahead, jest-serializer-path, jest-sonar-reporter, babel-jest, @babel/core, @babel/preset-env

### LLM-Access System (7 Lambda Functions)
**Lambda Functions:**
- `callback-handler.js` - Uses: @aws-sdk/client-dynamodb
- `llm-request-router.js` - Uses: @aws-sdk/client-dynamodb, @aws-sdk/client-sqs
- `model-selector.js` - Uses: @aws-sdk/client-dynamodb, @aws-sdk/client-bedrock-runtime, @aws-sdk/client-sqs
- `response-processor.js` - Uses: @aws-sdk/client-dynamodb, @aws-sdk/client-sqs
- `hic-logger.js` - Utility (No AWS SDKs)
- `safe-json-parse.js` - Utility (No AWS SDKs)
- `safe-logger.js` - Utility (No AWS SDKs)

**Dependencies:**
- Production: 3 deps
- Separate test package with 4 production + 1 dev dependency

### Research-DB System (1 Lambda Function)
**Lambda Functions:**
- `knowledge-persistence.js` - Uses: @aws-sdk/client-s3, @aws-sdk/client-dynamodb

**Dependencies:**
- Separate test package with 5 dev dependencies

### Research-RFA Bridge (2 Lambda Functions)
**Lambda Functions:**
- `research-callback-handler.js` - Uses: @aws-sdk/client-secrets-manager, @aws-sdk/client-sfn
- `rfa-request-processor.js` - Uses: @aws-sdk/client-dynamodb, @aws-sdk/client-secrets-manager

**Dependencies:**
- Separate test package configuration

## Key Findings

### 🎯 Perfect Layer Candidates
These systems have **clean, distinct patterns**:

1. **QA System**: Lambda-invoke pattern (1 function) + utility workers (5 functions)
2. **LLM-Access**: DDB + SQS + Bedrock pattern (4 functions) + utilities (3 functions)
3. **Research-DB**: S3 + DDB storage pattern (1 function)
4. **Research-RFA**: Secrets Manager + Step Functions bridge pattern (2 functions)

### 🚨 Jest Bloat Issue
**QA system has MASSIVE Jest bloat**: 9 Jest-related dependencies in dev dependencies
- This is likely being packaged with Lambda functions
- **Immediate 80%+ size reduction** possible by proper layer separation

### 💡 Optimal Layer Strategy

#### HIC-Lambda-Invoke-Layer
- **Target**: qa-dispatcher.js
- **SDKs**: @aws-sdk/client-lambda

#### HIC-LLM-Worker-Layer  
- **Target**: llm-access core functions (4 functions)
- **SDKs**: @aws-sdk/client-dynamodb, @aws-sdk/client-sqs, @aws-sdk/client-bedrock-runtime

#### HIC-Storage-Worker-Layer
- **Target**: research-db knowledge-persistence.js
- **SDKs**: @aws-sdk/client-s3, @aws-sdk/client-dynamodb

#### HIC-Bridge-Worker-Layer
- **Target**: research-rfa bridge functions (2 functions)
- **SDKs**: @aws-sdk/client-secrets-manager, @aws-sdk/client-sfn, @aws-sdk/client-dynamodb

#### HIC-Core-Utils-Layer
- **Target**: All utility functions (hic-logger, safe-json-parse, etc.)
- **Contents**: uuid, joi, shared utilities (NO Jest dependencies)

### 🔧 Implementation Priority

1. **Start with QA** - Biggest immediate impact (Jest bloat removal)
2. **LLM-Access** - Clean pattern, good validation case
3. **Research-DB** - Simple single function
4. **Research-RFA** - Bridge pattern validation

### 📊 Expected Results

**Package Size Reductions:**
- **QA**: 90% reduction (Jest bloat elimination)
- **LLM-Access**: 85% reduction (heavy SDK usage)
- **Research-DB**: 75% reduction
- **Research-RFA**: 80% reduction

**Common SDKs Across All Systems:**
- @aws-sdk/client-dynamodb (3 systems)
- @aws-sdk/client-sqs (1 system)
- @aws-sdk/client-lambda (1 system)
- @aws-sdk/client-bedrock-runtime (1 system)
- @aws-sdk/client-s3 (1 system)
- @aws-sdk/client-secrets-manager (1 system)
- @aws-sdk/client-sfn (1 system)

## Next Steps

1. **Create pattern-specific layers** for these 4 systems
2. **Eliminate Jest from Lambda packages** (move to layer or exclude entirely)
3. **Validate approach** with QA system first (biggest impact)
4. **Progressive rollout** to remaining 3 systems
5. **Document patterns** for future system development