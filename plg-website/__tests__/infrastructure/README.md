# PLG Infrastructure Tests

Tests validating the PLG infrastructure deployment scripts, parameter files, CloudFormation templates, and Lambda functions.

## Test Files

| File                     | Purpose                              | Test Count |
| ------------------------ | ------------------------------------ | ---------- |
| `deploy.test.js`         | Validates deploy.sh script structure | ~20        |
| `parameters.test.js`     | Validates parameter file consistency | ~15        |
| `cloudformation.test.js` | Validates CloudFormation templates   | ~20        |
| `lambda.test.js`         | Validates Lambda function sources    | ~12        |

## Running Tests

```bash
# Run all infrastructure tests
npm test __tests__/infrastructure

# Run specific test file
npm test __tests__/infrastructure/deploy.test.js
```

## What These Tests Validate

### Deploy Script (`deploy.test.js`)

- ✅ Bash shebang and `set -euo pipefail` error handling
- ✅ Required deployment variables (STACK_NAME, REGION, etc.)
- ✅ Support for all 3 environments (dev, staging, prod)
- ✅ Dry-run support (`--dry-run` flag)
- ✅ AWS credentials validation
- ✅ CloudFormation template validation
- ✅ Change set based deployment (safe updates)
- ✅ IAM capabilities (CAPABILITY_NAMED_IAM, CAPABILITY_AUTO_EXPAND)
- ✅ Lambda layer ARN discovery (all 5 HIC layers)
- ✅ Production confirmation prompt
- ✅ Visual feedback (colors, emojis)
- ✅ Help option (`--help`)

### Parameter Files (`parameters.test.js`)

- ✅ All environment files exist (dev.json, staging.json, prod.json)
- ✅ Valid JSON format
- ✅ CloudFormation parameter format (`ParameterKey`, `ParameterValue`)
- ✅ Required parameters present in all files
- ✅ Consistent parameter keys across environments
- ✅ Environment parameter matches filename
- ✅ Naming conventions (TemplatesBucket, LambdaCodeBucket)
- ✅ Prod uses alerts@hic-ai.com for AlertEmail
- ✅ No duplicate parameter keys

### CloudFormation Templates (`cloudformation.test.js`)

- ✅ All 8 expected templates exist
- ✅ Valid YAML syntax
- ✅ AWSTemplateFormatVersion present
- ✅ Meaningful Description
- ✅ Environment parameter with allowed values
- ✅ Main stack has nested stack references
- ✅ DynamoDB table has Retain deletion policy
- ✅ DynamoDB has PITR and SSE enabled
- ✅ DynamoDB has TTL for TRIAL records
- ✅ Compute template references all 5 HIC layers
- ✅ Proper resource tagging
- ✅ No hardcoded account IDs or secrets

### Lambda Functions (`lambda.test.js`)

- ✅ All 4 expected Lambda directories exist
- ✅ index.js entry point present
- ✅ Handler function exported
- ✅ HIC layer imports (not direct SDK)
- ✅ Injectable clients for testing
- ✅ Try/catch error handling
- ✅ Error logging
- ✅ Documentation/comments

## Dependencies

These tests require the `yaml` package for parsing CloudFormation templates:

```bash
npm install yaml --save-dev
```

## Pre-Deployment Checklist

Before running `./deploy.sh`:

1. ✅ All infrastructure tests pass
2. ✅ AWS credentials configured (`aws sts get-caller-identity`)
3. ✅ HIC Lambda layers deployed (`dm/layers/*/publish.sh`)
4. ✅ Parameter files reviewed for environment

## Related Documentation

- [Pre-E2E Infrastructure and Wiring Requirements](../../docs/20260127_PRE_E2E_INFRASTRUCTURE_AND_WIRING_REQUIREMENTS.md)
- [Infrastructure Gap Analysis](../../docs/plg/20260123_INFRASTRUCTURE_GAP_ANALYSIS_AND_PLAN.md)
- [Deploy Script Usage](../infrastructure/README.md)
