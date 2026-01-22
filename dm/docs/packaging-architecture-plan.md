# Lambda Packaging Architecture Plan

## 🏗️ Packaging Components

### 1. Lambda Layers (Shared Dependencies)
**Location**: `/shared/layers/`
**Contents**: AWS SDKs + minimal utilities
**Packaging**: ZIP → S3 → CloudFormation LayerVersion
**Lifecycle**: Build once, reuse across systems

### 2. Lambda Functions (Business Logic)
**Location**: Each system's `/src/lambda/`
**Contents**: Pure business logic + copied minimal utilities
**Packaging**: ZIP → S3 → CloudFormation Function
**Lifecycle**: Build per system deployment

### 3. Test Dependencies (Development Only)
**Location**: Each system's `/tests/`
**Contents**: Jest + mocks + test utilities
**Packaging**: Local node_modules only
**Lifecycle**: Never shipped to production

## 📦 Detailed Architecture

### Shared Layer Structure
```
/shared/layers/
├── hic-minimal-utils/
│   ├── nodejs/node_modules/
│   │   └── hic-minimal-utils/
│   │       ├── safe-logger.js
│   │       └── safe-json-parse.js
│   └── package.json
├── hic-ddb-layer/
│   ├── nodejs/node_modules/
│   │   └── @aws-sdk/client-dynamodb/
│   └── package.json
└── build-layers.sh
```

### Lambda Function Structure (QA Example)
```
/qa/src/lambda/
├── qa-dispatcher/
│   ├── index.js (business logic)
│   ├── utils/ (copied from shared)
│   │   ├── safe-logger.js
│   │   └── safe-json-parse.js
│   └── package.json (minimal)
├── qa-collator/
│   ├── index.js (business logic)
│   └── utils/ (copied from shared)
└── build-functions.sh
```

### Test Structure (Separate)
```
/qa/tests/
├── node_modules/ (Jest + mocks)
├── package.json (test deps only)
├── jest.config.js
└── *.test.js files
```

## 🔧 Packaging Process

### Layer Packaging (Shared)
```bash
# /shared/layers/build-layers.sh
build_layer() {
    local layer_name=$1
    cd $layer_name
    npm install --production
    zip -r ../../../dist/layers/${layer_name}.zip nodejs/
    aws s3 cp ../../../dist/layers/${layer_name}.zip s3://hic-layers/
}
```

### Function Packaging (Per System)
```bash
# /qa/build-functions.sh
build_function() {
    local func_name=$1
    
    # Copy minimal shared utilities
    mkdir -p src/lambda/${func_name}/utils
    cp ../../shared/utils/safe-logger.js src/lambda/${func_name}/utils/
    cp ../../shared/utils/safe-json-parse.js src/lambda/${func_name}/utils/
    
    # Package function
    cd src/lambda/${func_name}
    zip -r ../../../../dist/${func_name}.zip . -x "*.test.js" "node_modules/*"
    aws s3 cp ../../../../dist/${func_name}.zip s3://hic-deployments/qa/
}
```

## 🧪 Jest Handling

### Test Dependencies (Never in Production)
```json
// /qa/tests/package.json
{
  "devDependencies": {
    "jest": "^29.7.0",
    "aws-sdk-client-mock": "^4.0.0"
  }
}
```

### Test Execution
```bash
# /qa/run-tests.sh
cd tests
npm install  # Installs Jest locally
npm test     # Runs tests with local Jest
```

### Production Exclusion
- Jest stays in `/tests/node_modules/`
- Lambda functions never reference test directory
- CloudFormation excludes test paths

## 📋 What Goes Where

### Shared Across All Systems
- `safe-logger.js` (copied to each function)
- `safe-json-parse.js` (copied to each function)
- Layer build scripts
- Layer CloudFormation templates

### System-Specific (QA Example)
- Business logic functions
- System-specific utilities
- Function build scripts
- System CloudFormation template

### Test-Only (Never Shipped)
- Jest framework
- AWS SDK mocks
- Test fixtures
- Test configuration

## 🚀 Deploy Script Changes

### Current (Broken)
```bash
# Packages everything including shared bloat
sam build
sam deploy
```

### New (Precise)
```bash
#!/bin/bash
# /qa/deploy.sh

# 1. Build required layers (if not exists)
cd ../../shared/layers
./build-layers.sh hic-minimal-utils hic-lambda-invoke

# 2. Build QA functions
cd ../../qa
./build-functions.sh qa-dispatcher qa-collator qa-policy-worker qa-structure-worker qa-style-worker qa-reproducibility-worker

# 3. Deploy with layers
sam deploy --template-file infrastructure/qa-stack.yaml \
  --parameter-overrides \
    MinimalUtilsLayerArn=arn:aws:lambda:region:account:layer:hic-minimal-utils:1 \
    LambdaInvokeLayerArn=arn:aws:lambda:region:account:layer:hic-lambda-invoke:1
```

## 🎯 Key Benefits

### Size Reduction
- **qa-collator**: 80MB → 5KB (copied utils only)
- **qa-dispatcher**: 80MB → 10KB (copied utils + layer reference)

### Build Speed
- Layers built once, reused everywhere
- Functions contain only business logic
- No dependency resolution per function

### Test Isolation
- Jest never touches production
- Tests run with local dependencies
- No production/test contamination

### Deployment Clarity
- Clear separation of concerns
- Predictable package sizes
- Easy debugging when issues arise

This architecture eliminates the shared package bloat while maintaining utility sharing through file copying and proper layer management.