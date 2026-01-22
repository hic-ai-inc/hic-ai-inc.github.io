# CI/CD Jest Implementation - Practical Example

## 🔄 Current CI/CD Pipeline Issue
Your pipeline probably does something like:
```bash
# BROKEN - Installs Jest globally or in shared package
npm install  # Gets Jest + AWS SDKs + everything
sam build    # Packages Jest into Lambda ZIPs
sam deploy   # Ships Jest to production
```

## ✅ Fixed CI/CD Pipeline

### GitHub Actions Workflow
```yaml
# .github/workflows/deployment-pipeline.yml
name: HIC Deployment Pipeline

on:
  push:
    branches: [main, development]
  pull_request:
    branches: [main, development]

jobs:
  test-qa-system:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      # CRITICAL: Install test deps in tests/ directory ONLY
      - name: Install QA test dependencies
        run: |
          cd qa/tests
          npm install  # Jest installed HERE, not globally
      
      - name: Run QA tests
        run: |
          cd qa/tests
          npm test     # Uses local Jest from tests/node_modules/
      
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: qa-test-results
          path: qa/tests/coverage/

  build-qa-system:
    needs: test-qa-system  # Only build if tests pass
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      # CRITICAL: Build layers (NO Jest)
      - name: Build QA layers
        run: |
          cd shared/layers
          ./build-qa-layers.sh  # Creates minimal layers
      
      # CRITICAL: Build functions (NO Jest, NO tests/)
      - name: Build QA functions
        run: |
          cd qa
          ./build-functions.sh  # Excludes tests/ directory
      
      - name: Upload build artifacts
        uses: actions/upload-artifact@v3
        with:
          name: qa-build-artifacts
          path: |
            dist/layers/
            qa/dist/

  deploy-qa-system:
    needs: build-qa-system
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      
      - name: Download build artifacts
        uses: actions/download-artifact@v3
        with:
          name: qa-build-artifacts
      
      # Deploy ONLY production code (NO Jest)
      - name: Deploy QA system
        run: |
          cd qa
          ./deploy-minimal.sh  # Uses pre-built ZIPs without Jest
```

## 🧪 Local Development Workflow

### Developer Testing (Local)
```bash
# Developer wants to run tests
cd qa/tests
npm install  # Installs Jest locally
npm test     # Runs tests with local Jest

# Developer wants to build for deployment
cd qa
./build-functions.sh  # Creates production ZIPs (NO Jest)
```

### Test Script Examples
```json
// /qa/tests/package.json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:ci": "jest --ci --coverage --watchAll=false"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "aws-sdk-client-mock": "^4.0.0"
  }
}
```

## 🔒 Build Script Isolation

### Function Build Script (NO Jest)
```bash
# /qa/build-functions.sh
#!/bin/bash

build_function() {
    local func_name=$1
    local func_dir="src/lambda/${func_name}"
    
    echo "Building ${func_name} (production only)..."
    
    # Copy ONLY production utilities
    mkdir -p ${func_dir}/utils
    cp ../../shared/utils/safe-logger.js ${func_dir}/utils/
    cp ../../shared/utils/safe-json-parse.js ${func_dir}/utils/
    
    # Package ONLY production code
    cd ${func_dir}
    zip -r ../../../dist/${func_name}.zip . \
      -x "*.test.js" \
         "tests/*" \
         "node_modules/*" \
         "coverage/*" \
         "jest.config.js"
    #    ^^^^^^^^^^^^^^^^^ Explicitly exclude ALL test-related files
    
    cd ../../..
    echo "✅ ${func_name}: $(du -h dist/${func_name}.zip | cut -f1) (NO Jest)"
}
```

## 📊 Pipeline Verification

### Test Phase Output
```bash
> cd qa/tests && npm test

PASS tests/qa-dispatcher.test.js
PASS tests/qa-collator.test.js
✅ 12 tests passed (using local Jest)
```

### Build Phase Output  
```bash
> cd qa && ./build-functions.sh

Building qa-dispatcher (production only)...
✅ qa-dispatcher: 8.2K (NO Jest)

Building qa-collator (production only)...
✅ qa-collator: 6.1K (NO Jest)
```

### Deploy Phase Verification
```bash
# Verify production Lambda doesn't contain Jest
aws lambda get-function --function-name qa-dispatcher
# CodeSize: 8192 bytes (instead of 90MB with Jest)
```

## 🎯 Key Guarantees

1. **Tests run in CI/CD** - Jest installed in `tests/` directory
2. **Jest NEVER in production** - build scripts exclude `tests/`
3. **Same test experience** - developers use `cd tests && npm test`
4. **Pipeline efficiency** - test and build phases separated

The critical insight: **Jest lives in `tests/node_modules/`**, production code lives in `src/lambda/`, and the build process **only packages `src/`**. The CI/CD pipeline runs tests first (with Jest), then builds production (without Jest).