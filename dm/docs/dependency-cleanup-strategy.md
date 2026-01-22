# HIC Lambda Dependency Cleanup Strategy

## Current State Analysis

**CRITICAL FINDINGS:**
- **81 Lambda functions** across 8 systems
- **Only 3 systems use layers** (api-auth-unified, research-v2, rfa-unified)
- **5 systems WITHOUT layers** shipping massive duplicate dependencies
- **7 common dependencies** duplicated across multiple systems
- **All Lambdas use inline/S3 code** (no local CodeUri paths detected)

## Severity Assessment

### 🔴 HIGH PRIORITY - Systems Without Layers (30 Lambdas)
1. **code-review-v2**: 13 Lambdas, 0 Layers
2. **llm-access**: 4 Lambdas, 0 Layers  
3. **qa**: 6 Lambdas, 0 Layers
4. **research**: 6 Lambdas, 0 Layers
5. **research-db**: 1 Lambda, 0 Layers

### 🟡 MEDIUM PRIORITY - Systems With Partial Layers (51 Lambdas)
1. **api-auth-unified**: 26 Lambdas, 4 Layers (needs upgrade)
2. **research-v2**: 18 Lambdas, 1 Layer
3. **rfa-unified**: 7 Lambdas, 1 Layer

## Strategic Approach

### Phase 1: Create Shared Layer Foundation
**Goal**: Establish common dependency layers that all systems can use

**Shared Layers to Create:**
1. **HIC-Core-Layer**: uuid, joi, common utilities
2. **HIC-AWS-SDK-Layer**: All AWS SDK clients (@aws-sdk/*)
3. **HIC-Legacy-AWS-Layer**: aws-sdk v2 (for systems still using it)

### Phase 2: System-by-System Migration
**Priority Order** (based on Lambda count and complexity):

1. **api-auth-unified** (26 Lambdas) - Upgrade existing layer approach
2. **research-v2** (18 Lambdas) - Extend current layer
3. **code-review-v2** (13 Lambdas) - New layer implementation
4. **rfa-unified** (7 Lambdas) - Extend current layer
5. **qa** (6 Lambdas) - New layer implementation
6. **research** (6 Lambdas) - New layer implementation
7. **llm-access** (4 Lambdas) - New layer implementation
8. **research-db** (1 Lambda) - New layer implementation

### Phase 3: Standardization & Optimization
- Version alignment across all systems
- Remove duplicate layers
- Implement workspace-level dependency management

## Implementation Strategy

### Option A: Progressive Migration (Recommended)
- Migrate one system at a time
- Test thoroughly before moving to next
- Maintain production stability
- **Timeline**: 2-3 weeks

### Option B: Big Bang Migration
- Create all shared layers first
- Migrate all systems simultaneously
- Higher risk but faster completion
- **Timeline**: 1 week

## Common Dependencies Analysis

### Most Duplicated (High ROI for shared layers):
1. **uuid**: 3 systems (qa, research, research-v2)
2. **@aws-sdk/client-dynamodb**: 2 systems (llm-access, research-v2)
3. **@aws-sdk/client-bedrock-runtime**: 2 systems (llm-access, research)
4. **@aws-sdk/client-lambda**: 2 systems (qa, research-v2)
5. **joi**: 2 systems (qa, research)
6. **aws-sdk**: 2 systems (research, research-v2)
7. **@aws-sdk/client-sfn**: 2 systems (research, research-v2)

### Version Inconsistencies:
- **uuid**: v9.0.1 vs v10.0.0
- **@aws-sdk/client-dynamodb**: v3.0.0 vs v3.864.0
- **aws-sdk**: v2.1490.0 vs v2.1691.0

## Expected Benefits

### Immediate:
- **90% reduction** in package size for systems without layers
- **Faster deployments** (smaller packages)
- **Reduced attack surface** (fewer duplicate dependencies)

### Long-term:
- **Easier maintenance** (centralized dependency management)
- **Consistent versions** across all systems
- **Faster development** (shared layer reuse)
- **Cost savings** (smaller Lambda packages)

## Risk Mitigation

### Development Environment Testing:
- Use IDE Generator for isolated testing
- Comprehensive test coverage before production
- Rollback capability for each system

### Production Safety:
- Blue/green deployments
- Gradual rollout with monitoring
- Immediate rollback procedures

## Next Steps

1. **Create shared layer foundation** in development environment
2. **Start with api-auth-unified** (already has layer experience)
3. **Validate approach** with comprehensive testing
4. **Document patterns** for remaining systems
5. **Progressive migration** following priority order

## Success Metrics

- **Package size reduction**: Target 80-90% for systems without layers
- **Deployment time improvement**: Target 50% faster
- **Dependency consistency**: 100% version alignment
- **Test coverage maintenance**: No reduction in test pass rates