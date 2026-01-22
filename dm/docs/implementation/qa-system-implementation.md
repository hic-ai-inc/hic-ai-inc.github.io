# QA System Implementation - Proof of Concept

## 🎯 QA System Current State
- **6 Lambda functions**
- **Only qa-dispatcher needs AWS SDK** (@aws-sdk/client-lambda)
- **5 worker functions need ZERO dependencies**
- **All currently get 15 dependencies (1500% bloat)**

## 📦 New Architecture

### Layers Needed
1. **HIC-Minimal-Utils-Layer**: safe-logger, safe-json-parse
2. **HIC-Lambda-Invoke-Layer**: @aws-sdk/client-lambda

### Function Packaging
```
qa-dispatcher/
├── index.js (business logic only)
├── utils/ (copied shared utilities)
└── Layers: [Minimal-Utils, Lambda-Invoke]

qa-collator/
├── index.js (business logic only) 
├── utils/ (copied shared utilities)
└── Layers: [Minimal-Utils]

qa-*-worker/ (5 functions)
├── index.js (business logic only)
├── utils/ (copied shared utilities)  
└── Layers: [Minimal-Utils]
```

## 🔧 Implementation Files

### 1. Layer Build Script
```bash
# /shared/layers/build-qa-layers.sh
#!/bin/bash

build_minimal_utils_layer() {
    mkdir -p hic-minimal-utils/nodejs/node_modules/hic-minimal-utils
    cp ../utils/safe-logger.js hic-minimal-utils/nodejs/node_modules/hic-minimal-utils/
    cp ../utils/safe-json-parse.js hic-minimal-utils/nodejs/node_modules/hic-minimal-utils/
    
    cd hic-minimal-utils
    zip -r ../../../dist/layers/hic-minimal-utils.zip nodejs/
    cd ..
}

build_lambda_invoke_layer() {
    mkdir -p hic-lambda-invoke/nodejs
    cd hic-lambda-invoke/nodejs
    npm init -y
    npm install @aws-sdk/client-lambda --production
    cd ..
    zip -r ../../../dist/layers/hic-lambda-invoke.zip nodejs/
    cd ..
}

# Create dist directory
mkdir -p ../../dist/layers

# Build layers
build_minimal_utils_layer
build_lambda_invoke_layer

echo "✅ QA layers built successfully"
```

### 2. Function Build Script
```bash
# /qa/build-functions.sh
#!/bin/bash

build_function() {
    local func_name=$1
    local func_dir="src/lambda/${func_name}"
    
    echo "Building ${func_name}..."
    
    # Create utils directory and copy shared utilities
    mkdir -p ${func_dir}/utils
    cp ../../shared/utils/safe-logger.js ${func_dir}/utils/
    cp ../../shared/utils/safe-json-parse.js ${func_dir}/utils/
    
    # Create minimal package.json (no dependencies)
    cat > ${func_dir}/package.json << EOF
{
  "name": "${func_name}",
  "version": "1.0.0",
  "main": "index.js"
}
EOF
    
    # Package function (exclude tests and node_modules)
    cd ${func_dir}
    zip -r ../../../dist/${func_name}.zip . -x "*.test.js" "node_modules/*" "tests/*"
    cd ../../..
    
    echo "✅ ${func_name} packaged ($(du -h dist/${func_name}.zip | cut -f1))"
}

# Create dist directory
mkdir -p dist

# Build all QA functions
build_function "qa-dispatcher"
build_function "qa-collator" 
build_function "qa-policy-worker"
build_function "qa-structure-worker"
build_function "qa-style-worker"
build_function "qa-reproducibility-worker"

echo "🎉 All QA functions built successfully"
```

### 3. Updated CloudFormation Template
```yaml
# /qa/infrastructure/qa-minimal-stack.yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Parameters:
  MinimalUtilsLayerArn:
    Type: String
    Description: ARN of HIC Minimal Utils Layer
  LambdaInvokeLayerArn:
    Type: String
    Description: ARN of HIC Lambda Invoke Layer

Resources:
  QADispatcherFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: ../dist/qa-dispatcher.zip
      Handler: index.handler
      Runtime: nodejs20.x
      Layers:
        - !Ref MinimalUtilsLayerArn
        - !Ref LambdaInvokeLayerArn
      Environment:
        Variables:
          NODE_PATH: /opt/nodejs/node_modules

  QACollatorFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: ../dist/qa-collator.zip
      Handler: index.handler
      Runtime: nodejs20.x
      Layers:
        - !Ref MinimalUtilsLayerArn
      Environment:
        Variables:
          NODE_PATH: /opt/nodejs/node_modules

  # Repeat for other 4 worker functions...
```

### 4. Updated Deploy Script
```bash
# /qa/deploy-minimal.sh
#!/bin/bash

echo "🚀 Deploying QA System with Minimal Dependencies"

# 1. Build layers (if needed)
echo "Building required layers..."
cd ../shared/layers
./build-qa-layers.sh

# 2. Upload layers to S3
echo "Uploading layers..."
aws s3 cp ../../dist/layers/hic-minimal-utils.zip s3://hic-layers/
aws s3 cp ../../dist/layers/hic-lambda-invoke.zip s3://hic-layers/

# 3. Deploy layers
echo "Deploying layers..."
aws lambda publish-layer-version \
  --layer-name hic-minimal-utils \
  --content S3Bucket=hic-layers,S3Key=hic-minimal-utils.zip \
  --compatible-runtimes nodejs20.x

aws lambda publish-layer-version \
  --layer-name hic-lambda-invoke \
  --content S3Bucket=hic-layers,S3Key=hic-lambda-invoke.zip \
  --compatible-runtimes nodejs20.x

# 4. Build QA functions
cd ../../qa
echo "Building QA functions..."
./build-functions.sh

# 5. Deploy QA system
echo "Deploying QA system..."
sam deploy --template-file infrastructure/qa-minimal-stack.yaml \
  --stack-name hic-qa-minimal \
  --parameter-overrides \
    MinimalUtilsLayerArn=$(aws lambda list-layer-versions --layer-name hic-minimal-utils --query 'LayerVersions[0].LayerVersionArn' --output text) \
    LambdaInvokeLayerArn=$(aws lambda list-layer-versions --layer-name hic-lambda-invoke --query 'LayerVersions[0].LayerVersionArn' --output text)

echo "✅ QA System deployed with minimal dependencies!"
```

## 📊 Expected Results

### Package Sizes
- **Before**: qa-dispatcher.zip = 80MB
- **After**: qa-dispatcher.zip = 15KB (99.98% reduction)

### Deployment Time  
- **Before**: 3-5 minutes (uploading 80MB × 6 functions)
- **After**: 30 seconds (uploading 15KB × 6 functions)

### Dependencies
- **Before**: 15 deps per function (90 total)
- **After**: 0-1 deps per function (6 total)

This implementation eliminates the shared package bloat while maintaining utility access through file copying and proper layer management.