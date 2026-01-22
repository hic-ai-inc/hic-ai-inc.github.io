# Pattern-Based Lambda Layer Strategy

## Analysis Results

**DISCOVERED PATTERNS** (49 functions analyzed):
1. **DDB-Stream-to-SNS**: 15 functions (30% of total)
2. **DDB-CRUD-Worker**: 8 functions (16% of total)  
3. **SQS-Queue-Worker**: 7 functions (14% of total)
4. **S3-Storage-Worker**: 4 functions (8% of total)
5. **Lambda-Invoke-Worker**: 3 functions (6% of total)
6. **Step-Function-Trigger**: 2 functions (4% of total)
7. **API-Gateway-Auth**: 2 functions (4% of total)
8. **Unknown**: 8 functions (16% of total) - mostly utilities

## Optimized Layer Architecture

### HIC-DDB-Stream-SNS-Layer (15 functions)
**Purpose**: Event streaming from DynamoDB to SNS
**SDKs**: 
- @aws-sdk/client-sns
- @aws-sdk/client-dynamodb  
- @aws-sdk/lib-dynamodb
- @aws-sdk/client-sfn (for step function triggers)

### HIC-DDB-CRUD-Layer (8 functions)
**Purpose**: Basic DynamoDB operations
**SDKs**:
- @aws-sdk/client-dynamodb
- @aws-sdk/util-dynamodb
- @aws-sdk/client-ssm (for config)

### HIC-SQS-Worker-Layer (7 functions)  
**Purpose**: SQS message processing
**SDKs**:
- @aws-sdk/client-sqs
- @aws-sdk/client-dynamodb
- @aws-sdk/client-bedrock-runtime (for LLM workers)

### HIC-S3-Storage-Layer (4 functions)
**Purpose**: S3 file operations
**SDKs**:
- @aws-sdk/client-s3
- @aws-sdk/client-dynamodb

### HIC-Lambda-Invoke-Layer (3 functions)
**Purpose**: Lambda-to-Lambda invocation
**SDKs**:
- @aws-sdk/client-lambda

### HIC-Step-Function-Layer (2 functions)
**Purpose**: Step Function orchestration
**SDKs**:
- @aws-sdk/client-sfn
- @aws-sdk/client-secrets-manager

### HIC-Core-Utils-Layer (All functions)
**Purpose**: Common utilities and lightweight deps
**Contents**:
- uuid
- joi  
- hic-logger
- safe-json-parse

## Implementation Priority

### Phase 1: High-Impact Patterns (30 functions)
1. **HIC-DDB-Stream-SNS-Layer** (15 functions) - Biggest impact
2. **HIC-DDB-CRUD-Layer** (8 functions) - Most common pattern
3. **HIC-SQS-Worker-Layer** (7 functions) - LLM integration critical

### Phase 2: Specialized Patterns (9 functions)
4. **HIC-S3-Storage-Layer** (4 functions)
5. **HIC-Lambda-Invoke-Layer** (3 functions)  
6. **HIC-Step-Function-Layer** (2 functions)

### Phase 3: System-Specific (2 functions + utilities)
7. **HIC-API-Gateway-Auth-Layer** (2 functions) - Wait for api-auth-unified upgrade
8. **HIC-Core-Utils-Layer** (All functions) - Cross-cutting

## Expected Benefits

### Package Size Reduction by Pattern:
- **DDB-Stream-to-SNS**: ~85% reduction (heaviest SDK usage)
- **SQS-Queue-Worker**: ~80% reduction (includes Bedrock SDK)
- **DDB-CRUD-Worker**: ~75% reduction
- **S3-Storage-Worker**: ~70% reduction
- **Others**: ~60-70% reduction

### Maintenance Benefits:
- **Single point of SDK updates** per pattern
- **Pattern-specific optimizations** possible
- **Clear separation of concerns**
- **Reusable across new systems**

## Migration Strategy

### Start with research-v2 (18 functions, multiple patterns)
- Contains 15 DDB-Stream-to-SNS functions
- Already has 1 layer (easier to extend)
- High impact demonstration

### Then qa (6 functions, clean patterns)
- Mix of Lambda-Invoke and utility functions
- Simpler migration to validate approach

### Progressive rollout to remaining systems
- Validate each pattern layer works across systems
- Build confidence before tackling complex systems

## Pattern Layer Templates

Each pattern gets its own CloudFormation template:
- `layers/hic-ddb-stream-sns-layer.yaml`
- `layers/hic-ddb-crud-layer.yaml`  
- `layers/hic-sqs-worker-layer.yaml`
- etc.

Systems reference only the layers they need:
```yaml
Layers:
  - !Ref HICDDBStreamSNSLayer  # Only for stream processors
  - !Ref HICCoreUtilsLayer     # All functions get this
```

This approach gives you the "off-the-shelf Lambda worker layers" you envisioned - each optimized for specific architectural patterns with precisely the SDKs needed and nothing more.