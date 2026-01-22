# Jest Isolation Strategy - Complete Separation

## 🚨 Current Problem
Jest is in the **shared package** that gets bundled with **every Lambda function** in production.

## ✅ Solution: Complete Directory Separation

### Directory Structure (QA Example)
```
/qa/
├── src/
│   └── lambda/
│       ├── qa-dispatcher/
│       │   └── index.js (PRODUCTION CODE)
│       └── qa-collator/
│           └── index.js (PRODUCTION CODE)
├── tests/
│   ├── package.json (Jest + test deps ONLY)
│   ├── node_modules/ (Jest installed HERE)
│   ├── jest.config.js
│   ├── qa-dispatcher.test.js
│   └── qa-collator.test.js
└── infrastructure/
    └── qa-stack.yaml (NO reference to tests/)
```

## 🧪 Test Execution Strategy

### Local Testing
```bash
# Developer runs tests locally
cd /qa/tests
npm install  # Installs Jest in tests/node_modules/
npm test     # Runs Jest from local node_modules
```

### CI/CD Pipeline Testing
```yaml
# .github/workflows/deployment-pipeline.yml
jobs:
  test-qa:
    steps:
      - name: Install test dependencies
        run: |
          cd qa/tests
          npm install  # Jest installed in tests/ only
      
      - name: Run tests
        run: |
          cd qa/tests
          npm test     # Uses local Jest
      
      - name: Build production (NO tests directory)
        run: |
          cd qa
          ./build-functions.sh  # Excludes tests/ completely
```

## 🔒 Production Isolation Mechanisms

### 1. Directory Exclusion
```bash
# /qa/build-functions.sh
zip -r dist/${func_name}.zip src/lambda/${func_name}/ \
  -x "tests/*" "*/tests/*" "**/node_modules/*"
#     ^^^^^^^^^ Explicitly excludes tests directory
```

### 2. CloudFormation Exclusion
```yaml
# /qa/infrastructure/qa-stack.yaml
Resources:
  QADispatcherFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: ../dist/qa-dispatcher.zip  # Only contains src/lambda/
      # NO reference to tests/ directory anywhere
```

### 3. Package.json Separation
```json
// /qa/tests/package.json (TEST ONLY)
{
  "devDependencies": {
    "jest": "^29.7.0",
    "aws-sdk-client-mock": "^4.0.0"
  }
}

// /qa/src/lambda/qa-dispatcher/package.json (PRODUCTION)
{
  "dependencies": {}  // NO Jest, NO test deps
}
```

## 🔄 Test Import Strategy

### Test Files Import Production Code
```javascript
// /qa/tests/qa-dispatcher.test.js
const { handler } = require('../src/lambda/qa-dispatcher/index.js');
//                           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//                           Tests import FROM production code

describe('QA Dispatcher', () => {
  test('should dispatch correctly', async () => {
    const result = await handler(mockEvent);
    expect(result).toBeDefined();
  });
});
```

### Production Code NEVER Imports Tests
```javascript
// /qa/src/lambda/qa-dispatcher/index.js
const { safeLogger } = require('./utils/safe-logger');
//                              ^^^^^^^^^^^^^^^^^^^
//                              Only imports utilities, NEVER test code

exports.handler = async (event) => {
  // Pure business logic - no test dependencies
};
```

## 🚀 CI/CD Pipeline Flow

### 1. Code Commit Triggers Pipeline
```bash
git push origin feature/qa-optimization
```

### 2. Test Phase (Uses Jest)
```bash
# Pipeline runs in tests/ directory
cd qa/tests
npm install  # Jest + mocks installed locally
npm test     # All tests run with local Jest
```

### 3. Build Phase (Excludes Tests)
```bash
# Pipeline runs in qa/ directory  
cd qa
./build-functions.sh  # Creates production ZIPs
# Tests directory completely ignored
```

### 4. Deploy Phase (Production Only)
```bash
# Pipeline deploys production ZIPs
sam deploy --template-file infrastructure/qa-stack.yaml
# Only src/lambda/ code deployed, NO tests/
```

## 📊 Size Comparison

### Before (Jest in Production)
```
qa-dispatcher.zip contents:
├── index.js (5KB)
├── node_modules/
│   ├── jest/ (25MB)
│   ├── @aws-sdk/ (50MB)
│   └── babel/ (15MB)
Total: 90MB
```

### After (Jest Isolated)
```
qa-dispatcher.zip contents:
├── index.js (5KB)
├── utils/
│   ├── safe-logger.js (2KB)
│   └── safe-json-parse.js (1KB)
Total: 8KB

tests/node_modules/ (SEPARATE):
├── jest/ (25MB - LOCAL ONLY)
└── aws-sdk-client-mock/ (5MB - LOCAL ONLY)
```

## 🎯 Key Guarantees

1. **Jest NEVER in production ZIPs** - directory exclusion
2. **Tests run normally** - local Jest installation
3. **CI/CD works unchanged** - tests run before build
4. **No production contamination** - complete separation

The secret is **directory-based isolation**: Jest lives in `tests/`, production code lives in `src/`, and the build process only packages `src/`.