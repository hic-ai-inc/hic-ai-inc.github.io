# DM Layer Management

**Centralized Lambda Layer Building and Publishing for HIC Platform**

The `/dm/layers` directory contains the automated system for building, versioning, and publishing Lambda layers that provide standardized dependencies across all HIC systems. Each layer is optimized for specific use cases to minimize bloat and maximize performance.

## 🎯 **System Purpose**

- **Dependency Centralization**: All HIC systems use the same AWS SDK versions
- **Bloat Elimination**: Purpose-built layers contain only required dependencies
- **Version Management**: Automated semantic versioning prevents conflicts
- **Performance Optimization**: Layers are optimized for Lambda cold start performance
- **Security**: Consistent, audited dependency versions across the platform

## 📁 **Layer Architecture**

### **Available Layers**

#### **hic-base-layer** (~5KB)

**Purpose**: Essential HIC utilities required by all Lambda functions
**Contents**:

- `safeLog()` - Secure logging with PII sanitization
- `sanitizeForLog()` - Input sanitization utility
- `safePath()` - Path traversal protection
- `safeJsonParse()` - Safe JSON parsing with error handling
- `HicLog` - Structured logging framework
- Lambda runtime helpers

**Usage**: Required by all HIC Lambda functions

#### **hic-aws-sdk-base** (~8MB)

**Purpose**: Core AWS SDK packages used by most HIC systems
**Contents**:

- `@aws-sdk/client-lambda` - Lambda service client
- `@aws-sdk/client-sts` - Security Token Service client
- Core AWS SDK utilities and credentials

**Usage**: Functions that need basic AWS service access

#### **hic-dynamodb-layer** (~3MB)

**Purpose**: DynamoDB operations
**Contents**:

- `@aws-sdk/client-dynamodb` - DynamoDB service client
- `@aws-sdk/lib-dynamodb` - DynamoDB document client utilities

**Usage**: Functions that interact with DynamoDB

#### **hic-s3-layer** (~4MB)

**Purpose**: S3 object storage operations
**Contents**:

- `@aws-sdk/client-s3` - S3 service client
- `@aws-sdk/s3-request-presigner` - S3 URL signing utilities

**Usage**: Functions that work with S3 buckets

#### **Additional Service Layers**

- **hic-sqs-layer** - Message queue operations
- **hic-sns-layer** - Notification services
- **hic-cloudwatch-layer** - Metrics and logging
- **hic-secretsmanager-layer** - Secret retrieval
- **hic-ssm-layer** - Parameter store access

## 🚀 **Quick Start**

### **Building Layers Locally**

```bash
# Build all layers
cd /dm/layers
./build-all-layers.sh

# Build specific layer
cd base
./build.sh

# Build with clean dependencies
./build.sh --clean
```

### **Publishing to AWS**

```bash
# Publish all layers
./publish-all-layers.sh

# Publish specific layer
cd base
./publish.sh

# Publish to specific region
./publish.sh --region us-west-2
```

### **Using Published Layers**

```yaml
# CloudFormation template
Resources:
  MyLambdaFunction:
    Type: AWS::Lambda::Function
    Properties:
      Runtime: nodejs18.x
      Handler: index.handler
      Layers:
        - arn:aws:lambda:us-east-1:123456789012:layer:hic-base-layer:3
        - arn:aws:lambda:us-east-1:123456789012:layer:hic-dynamodb-layer:2
      Code:
        ZipFile: |
          import { HicLog } from '/opt/nodejs/hic-base-utilities';
          import { getDynamoDBClient } from '@hic/dm-facade-helpers/dynamodb';

          export const handler = async (event) => {
            const log = new HicLog('MyFunction');
            const dynamodb = getDynamoDBClient();
            // Your function logic here
          };

## 🔧 **Layer Development Workflow**

### **Directory Structure**
```

/dm/layers/
├── versions.env # Global version configuration
├── build-lambda-layer.sh # Core build script (shared)
├── publish-lambda-layer.sh # Core publish script (shared)
├── base/ # hic-base-layer
│ ├── build.sh # Layer-specific build wrapper
│ ├── publish.sh # Layer-specific publish wrapper
│ ├── package.json # Layer dependencies
│ ├── src/ # Layer source files
│ └── version.manifest.json # Current version tracking
├── dynamodb/ # hic-dynamodb-layer
│ ├── build.sh
│ ├── publish.sh
│ ├── package.json
│ └── version.manifest.json
└── s3/ # hic-s3-layer
├── build.sh  
 ├── publish.sh
├── package.json
└── version.manifest.json

````

### **Build Process**

Each layer follows the standardized build process:

1. **Dependency Resolution**: Install npm packages per `package.json`
2. **Version Calculation**: Automatic semantic versioning based on content changes
3. **Optimization**: Remove unnecessary files, optimize for Lambda
4. **Packaging**: Create optimized ZIP file with correct directory structure
5. **Validation**: Verify layer contents and structure
6. **Manifest Update**: Update version tracking files

```bash
# Example build process
cd /dm/layers/dynamodb
./build.sh

# Output:
# ✅ Dependencies installed
# ✅ Version calculated: 1.2.3
# ✅ Layer packaged: hic-dynamodb-layer-1.2.3.zip
# ✅ Manifest updated
````

### **Publish Process**

Publishing layers to AWS Lambda:

1. **Artifact Upload**: Upload ZIP to S3 artifact repository
2. **Layer Creation**: Create new Lambda layer version
3. **ARN Recording**: Save layer ARN for reference
4. **Manifest Update**: Record published version details
5. **Validation**: Verify layer is accessible

```bash
# Example publish process
cd /dm/layers/dynamodb
./publish.sh

# Output:
# ✅ Uploaded to S3: s3://hic-dm-artifacts/layers/hic-dynamodb-layer-1.2.3.zip
# ✅ Published layer: arn:aws:lambda:us-east-1:123456789012:layer:hic-dynamodb-layer:5
# ✅ Manifest updated: publish.1.2.3.manifest.json
```

## 📊 **Version Management**

### **Semantic Versioning**

Layers use automatic semantic versioning based on content analysis:

- **MAJOR** (x.0.0): Breaking changes to layer structure or major dependency updates
- **MINOR** (x.y.0): New dependencies added, backward-compatible changes
- **PATCH** (x.y.z): Dependency version updates, bug fixes, optimizations

### **Version Tracking Files**

```javascript
// version.manifest.json - Current state
{
  "layerName": "hic-dynamodb-layer",
  "version": "1.2.3",
  "contentHash": "sha256:abc123...",
  "lastBuild": "2025-09-03T10:30:00Z",
  "dependencies": {
    "@aws-sdk/client-dynamodb": "3.876.0",
    "@aws-sdk/lib-dynamodb": "3.876.0"
  }
}

// publish.1.2.3.manifest.json - Publication record
{
  "layerName": "hic-dynamodb-layer",
  "version": "1.2.3",
  "layerArn": "arn:aws:lambda:us-east-1:123456789012:layer:hic-dynamodb-layer:5",
  "s3Uri": "s3://hic-dm-artifacts/layers/hic-dynamodb-layer-1.2.3.zip",
  "publishedAt": "2025-09-03T10:35:00Z",
  "publishedBy": "hic-dm-system",
  "region": "us-east-1"
}
```

---

**Documentation Version**: September 3, 2025  
**Last Updated**: Post Phase 1-3 Code Review  
**Build System**: Production Ready  
**Maintainer**: HIC DM Team

```
        - !Ref HICBaseLayerArn
        - !Ref HICLambdaInvokeLayerArn  # Only if needed
      Environment:
        Variables:
          NODE_PATH: /opt/nodejs/node_modules
```

## 🔧 Layer Import in Lambda Code

```javascript
// Import from layers (no local dependencies needed)
import { safeLog, safeJsonParse } from "hic-base-layer";
import { DynamoDBClient } from "hic-dynamodb-layer";

export const handler = async (event) => {
  const logger = safeLog("my-function");
  // Function logic here
};
```

## 📊 Impact

### Before (Shared Package Bloat)

- Every Lambda: 80MB (all AWS SDKs + Jest)
- Deployment: 3-5 minutes
- Dependencies: 15 per function

### After (Minimal Layers)

- Lambda function: 5-15KB (business logic only)
- Deployment: 30 seconds
- Dependencies: 0-1 per function

## ⚠️ Platform Notes

**Windows-Specific**: The `create-zip.js` utility currently uses PowerShell and is Windows-specific. Scripts work in Git Bash on Windows but may need modification for other platforms.
