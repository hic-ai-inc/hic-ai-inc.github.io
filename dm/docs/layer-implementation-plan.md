# Lambda Layer Implementation Plan - Phase 1

## Shared Layer Architecture

### HIC-Core-Layer
**Purpose**: Common utilities and lightweight dependencies
**Contents**:
- uuid (standardize on v10.0.0)
- joi (standardize on v17.11.0)
- Safe logging utilities
- Common validation helpers

### HIC-AWS-SDK-Layer  
**Purpose**: All AWS SDK v3 clients
**Contents**:
- @aws-sdk/client-dynamodb (latest stable)
- @aws-sdk/client-bedrock-runtime (latest stable)
- @aws-sdk/client-lambda (latest stable)
- @aws-sdk/client-sfn (latest stable)
- @aws-sdk/client-s3 (for future use)
- @aws-sdk/client-sns (for future use)
- @aws-sdk/client-sqs (for future use)

### HIC-Legacy-AWS-Layer
**Purpose**: AWS SDK v2 for systems still using it
**Contents**:
- aws-sdk v2 (latest stable)

## Implementation Steps

### Step 1: Create Layer Templates
Create CloudFormation templates for shared layers that can be deployed independently.

### Step 2: Layer Deployment Strategy
Deploy layers to development environment first, then production after validation.

### Step 3: System Migration Order
1. **api-auth-unified** - Replace existing layers with shared ones
2. **research-v2** - Extend to use shared layers
3. **rfa-unified** - Extend to use shared layers
4. **code-review-v2** - Implement layer usage
5. **qa** - Implement layer usage
6. **research** - Implement layer usage
7. **llm-access** - Implement layer usage
8. **research-db** - Implement layer usage

## Template Structure for Each System

### Before (Current State):
```yaml
Resources:
  MyFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: inline-code-with-all-dependencies
      # Massive package with duplicated deps
```

### After (With Layers):
```yaml
Resources:
  MyFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: minimal-function-code-only
      Layers:
        - !Ref HICCoreLayer
        - !Ref HICAWSSDKLayer
      # Tiny package, shared dependencies
```

## Validation Checklist

### For Each System Migration:
- [ ] All tests pass with new layer configuration
- [ ] Package size reduced by 80%+ 
- [ ] Deployment time improved
- [ ] No functionality regression
- [ ] Error handling unchanged
- [ ] Monitoring/logging unchanged

### Cross-System Validation:
- [ ] No version conflicts between layers
- [ ] Shared layers work across all systems
- [ ] No circular dependencies
- [ ] Layer size limits respected (<250MB unzipped)

## Rollback Strategy

### Per-System Rollback:
- Keep original templates as `.backup` files
- Quick revert capability for each system
- Independent rollback (one system failure doesn't affect others)

### Layer Rollback:
- Version shared layers
- Ability to pin systems to specific layer versions
- Gradual migration to new layer versions

## Expected Outcomes

### Package Size Reduction:
- **code-review-v2**: ~90% reduction (13 functions)
- **llm-access**: ~85% reduction (4 functions)
- **qa**: ~90% reduction (6 functions)
- **research**: ~85% reduction (6 functions)
- **research-db**: ~80% reduction (1 function)

### Deployment Time Improvement:
- Current: 2-5 minutes per system
- Target: 30-60 seconds per system

### Maintenance Benefits:
- Single point of dependency updates
- Consistent versions across platform
- Easier security patching
- Simplified testing matrix