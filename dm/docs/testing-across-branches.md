# Testing Across All Branches - Complete Clarification

## 🎯 "Production" Definition
**"Production code"** = Lambda function business logic (NO Jest)
**"Production environment"** = main branch deployment to AWS production

**Jest isolation applies to ALL branches** - feature, development, AND main.

## 🧪 Testing Capabilities by Branch

### Feature Branch
```bash
# Developer working on feature/qa-optimization
cd qa/tests
npm install  # Jest available locally
npm test     # Tests run against current feature code

# CI/CD Pipeline runs:
1. Install Jest in tests/
2. Run tests against feature branch code  
3. Build Lambda ZIPs (NO Jest)
4. Deploy to development environment (NO Jest in Lambdas)
```

### Development Branch  
```bash
# After merging feature → development
cd qa/tests
npm install  # Jest still available locally
npm test     # Tests run against development branch code

# CI/CD Pipeline runs:
1. Install Jest in tests/
2. Run tests against development code
3. Build Lambda ZIPs (NO Jest) 
4. Deploy to development environment (NO Jest in Lambdas)
```

### Main Branch (Production Environment)
```bash
# After merging development → main
cd qa/tests
npm install  # Jest STILL available locally
npm test     # Tests run against main branch code

# CI/CD Pipeline runs:
1. Install Jest in tests/
2. Run tests against main code
3. Build Lambda ZIPs (NO Jest)
4. Deploy to PRODUCTION environment (NO Jest in Lambdas)
```

## ✅ Post-Deployment Testing

### You CAN Always Test Locally
```bash
# After ANY deployment (feature/dev/main)
git checkout main  # or development, or feature branch
cd qa/tests
npm install       # Jest installs locally
npm test          # Tests run against deployed code logic
```

### You CAN Test Against Deployed Functions
```bash
# Integration tests against actual deployed Lambdas
cd qa/tests
npm run test:integration  # Calls real AWS Lambda functions
```

## 🔄 Branch-Specific Behavior

### All Branches: Same Jest Isolation
```
feature-branch/
├── src/lambda/          ← Deployed to AWS (NO Jest)
├── tests/               ← Available for local testing
│   ├── node_modules/    ← Jest here on ALL branches
│   └── *.test.js        ← Tests work on ALL branches
```

### All Branches: Same CI/CD Flow
```yaml
# Same pipeline for ALL branches
on:
  push:
    branches: [main, development, feature/*]

jobs:
  test:    # Jest runs on ALL branches
  build:   # NO Jest packaged on ANY branch  
  deploy:  # NO Jest deployed to ANY environment
```

## 📊 Environment Deployments

### Feature Branch → Development Environment
- **Lambda Code**: Business logic only (8KB)
- **Jest**: Available locally for testing
- **Environment**: AWS development account

### Development Branch → Development Environment  
- **Lambda Code**: Business logic only (8KB)
- **Jest**: Available locally for testing
- **Environment**: AWS development account

### Main Branch → Production Environment
- **Lambda Code**: Business logic only (8KB) 
- **Jest**: Available locally for testing
- **Environment**: AWS production account

## 🎯 Key Points

1. **Jest NEVER deployed** to ANY AWS environment (dev or prod)
2. **Jest ALWAYS available** for local testing on ANY branch
3. **"Production code"** means Lambda business logic (applies to ALL branches)
4. **"Production environment"** means main branch → AWS production account

### Post-Deployment Testing Examples
```bash
# Test locally after feature branch deployment
git checkout feature/qa-optimization
cd qa/tests && npm test  ✅ Works

# Test locally after development deployment  
git checkout development
cd qa/tests && npm test  ✅ Works

# Test locally after main deployment
git checkout main
cd qa/tests && npm test  ✅ Works

# Integration test against deployed Lambda
cd qa/tests && npm run test:integration  ✅ Works on all environments
```

**Bottom Line**: Jest isolation is about **packaging**, not **availability**. Jest is excluded from Lambda ZIPs on ALL branches but remains available for local testing on ALL branches.