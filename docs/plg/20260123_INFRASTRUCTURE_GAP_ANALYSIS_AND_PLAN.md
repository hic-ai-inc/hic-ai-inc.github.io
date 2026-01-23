# MEMORANDUM

**TO:** Simon Reiff, President & Technical Founder  
**FROM:** GC  
**DATE:** January 23, 2026  
**RE:** PLG Infrastructure Gap Analysis and Implementation Plan

---

## Executive Summary

This memo provides a comprehensive analysis of infrastructure gaps between what's documented in our technical specifications and what actually exists, followed by a detailed implementation plan to close those gaps.

**Key Findings:**

| Category                 | Documented  | Exists              | Gap             |
| ------------------------ | ----------- | ------------------- | --------------- |
| CloudFormation Templates | 7 templates | 0 templates         | ❌ Critical     |
| deploy.sh with dry-run   | Required    | None                | ❌ Critical     |
| GitHub Actions CI/CD     | 3 workflows | 0 workflows         | ❌ Critical     |
| amplify.yml              | Required    | None                | ❌ Critical     |
| Environment Variables    | Documented  | .env.example exists | ⚠️ Partial      |
| Parameter Store Setup    | Required    | None                | ❌ Critical     |
| HTTP Test Files          | Recommended | None                | ⚠️ Nice-to-have |

**Estimated Effort:** 16-24 hours

---

## 1. Current State Analysis

### 1.1 What Exists

**Documentation (Complete):**

- `20260121_GC_EVENT_DRIVEN_INFRASTRUCTURE_RECOMMENDATION.md` — Full event-driven architecture spec
- `20260122_GC_PLG_TECHNICAL_SPECIFICATION_v2.md` — Complete technical architecture
- `20260122_BACK_END_REVIEW_PLAN.md` — Infrastructure review checklist
- `20260121_GC_NEXTJS_FRONTEND_FOUNDATION.md` — Environment variable spec

**Code (Partial):**

- `.env.example` (108 lines) — Environment variable template
- Application code in `plg-website/src/` — Fully scaffolded
- Existing dm/infrastructure patterns to follow

**What's Missing:**

1. **Infrastructure as Code** — No CloudFormation templates
2. **Deployment Scripts** — No deploy.sh for PLG
3. **CI/CD Pipeline** — No GitHub Actions workflows
4. **Amplify Configuration** — No amplify.yml
5. **Parameter Store Configuration** — No IaC for SSM parameters
6. **Local Testing Setup** — No HTTP test files

### 1.2 Reference Patterns from SimonReiff/hic

The `SimonReiff/hic` repository demonstrates mature patterns:

```
.github/workflows/cicd.yml          # Multi-system CI/CD
llm/infrastructure/deploy.sh        # 3-phase deployment
dm/infrastructure/deploy.sh         # CloudFormation deployment
dm/infrastructure/validation-utils.sh # Input validation
```

Key patterns to adopt:

- `set -euo pipefail` for bash safety
- 3-phase deployment: Build → Validate → Deploy
- Environment parameter overrides
- Deployment status feedback with emojis
- Validation before execution

---

## 2. Discrepancy Analysis

### 2.1 CloudFormation Stack Structure

**Documented in EVENT_DRIVEN_INFRASTRUCTURE_RECOMMENDATION (§11.1):**

```
plg-infrastructure/
├── templates/
│   ├── main.yaml              # Root stack
│   ├── database.yaml          # DynamoDB table + streams
│   ├── messaging.yaml         # SNS topics + SQS queues
│   ├── compute.yaml           # Lambda functions
│   ├── api.yaml               # API Gateway for webhooks
│   ├── monitoring.yaml        # CloudWatch alarms + dashboard
│   └── iam.yaml               # IAM roles and policies
```

**Documented in BACK_END_REVIEW_PLAN (§1.2):**

```
infrastructure/
├── cloudformation/
│   ├── template.yaml          # Main CloudFormation template
│   ├── dynamodb.yaml          # Table definitions + GSIs
│   ├── ses.yaml               # Email domain verification
│   ├── iam.yaml               # Service roles and policies
│   └── parameters/
│       ├── dev.json           # Development params
│       ├── staging.json       # Staging params
│       └── prod.json          # Production params
```

**What Actually Exists:** Nothing for PLG.

**Discrepancy:** Two different documentation sources propose slightly different structures. The EVENT_DRIVEN spec is more comprehensive (includes Lambda-based event processing), while the BACK_END_REVIEW_PLAN is simpler (Amplify-focused).

**Resolution:** Given AWS Amplify handles compute (Next.js API routes run as Lambda@Edge), we need a hybrid approach focused on what Amplify doesn't provide:

- DynamoDB table + GSIs (Amplify doesn't provision this)
- SES domain verification (Amplify doesn't handle email)
- IAM roles for DynamoDB/SES access from Amplify
- Parameter Store configuration

### 2.2 Event-Driven Architecture Decision

**Documented:** Full SNS/SQS/Lambda event-driven architecture

**Current Implementation:** Direct calls in API routes (no queues)

**Analysis:** The current implementation uses synchronous processing:

- Stripe webhook → API route → DynamoDB write + email send
- No DynamoDB Streams, no SNS fan-out, no SQS consumers

**Recommendation:** For MVP, the synchronous approach is acceptable. The event-driven architecture can be added later when:

1. We need async processing for high throughput
2. We want decoupled services (email, analytics, audit)
3. We need retry/DLQ patterns for reliability

**Action:** Document this as a Phase 2 enhancement, not MVP blocker.

### 2.3 Environment Configuration

**Documented Categories (from your request):**

| Layer                   | Description                          | Storage                               |
| ----------------------- | ------------------------------------ | ------------------------------------- |
| **System Values**       | API keys, secrets, service endpoints | AWS Parameter Store / Secrets Manager |
| **User-Defined Values** | Customer overrides (none for PLG)    | N/A                                   |
| **Default Values**      | Fallback values when not configured  | `constants.js`                        |

**Current State:**

- `.env.example` defines all variables
- `constants.js` has some defaults
- No Parameter Store IaC

**AWS Amplify Environment Variables:**
Amplify supports environment variables in two ways:

1. **Build-time** — Set in Amplify Console, available during `npm run build`
2. **Runtime (SSR)** — Set in Amplify Console, available in API routes

For secrets (API keys), Amplify recommends:

- **Option A:** Amplify Console environment variables (encrypted at rest)
- **Option B:** AWS Secrets Manager with IAM role access

**Recommendation:** Use Amplify Console for most env vars, Secrets Manager only for highly sensitive keys (Stripe secret key, webhook secrets).

---

## 3. Implementation Plan

### Phase 1: CloudFormation Templates (4-6 hours)

Create infrastructure templates in `plg-website/infrastructure/`:

```
plg-website/infrastructure/
├── cloudformation/
│   ├── plg-main-stack.yaml       # Nested stack orchestrator
│   ├── plg-dynamodb.yaml         # DynamoDB table + GSIs
│   ├── plg-ses.yaml              # SES domain + templates
│   └── plg-iam.yaml              # Amplify execution role
├── parameters/
│   ├── dev.json                  # Development parameters
│   ├── staging.json              # Staging parameters
│   └── prod.json                 # Production parameters
└── deploy.sh                     # Deployment script with dry-run
```

#### 3.1.1 DynamoDB Template (plg-dynamodb.yaml)

Based on Technical Specification §2.1:

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: HIC PLG DynamoDB Table with GSIs

Parameters:
  Environment:
    Type: String
    AllowedValues: [dev, staging, prod]
  TableName:
    Type: String
    Default: hic-plg

Resources:
  PLGTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: !Sub "${TableName}-${Environment}"
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: PK
          AttributeType: S
        - AttributeName: SK
          AttributeType: S
        - AttributeName: GSI1PK
          AttributeType: S
        - AttributeName: GSI1SK
          AttributeType: S
        - AttributeName: GSI2PK
          AttributeType: S
        - AttributeName: GSI2SK
          AttributeType: S
      KeySchema:
        - AttributeName: PK
          KeyType: HASH
        - AttributeName: SK
          KeyType: RANGE
      GlobalSecondaryIndexes:
        - IndexName: GSI1
          KeySchema:
            - AttributeName: GSI1PK
              KeyType: HASH
            - AttributeName: GSI1SK
              KeyType: RANGE
          Projection:
            ProjectionType: ALL
        - IndexName: GSI2
          KeySchema:
            - AttributeName: GSI2PK
              KeyType: HASH
            - AttributeName: GSI2SK
              KeyType: RANGE
          Projection:
            ProjectionType: ALL
      PointInTimeRecoverySpecification:
        PointInTimeRecoveryEnabled: true
      Tags:
        - Key: Environment
          Value: !Ref Environment
        - Key: Application
          Value: plg-website

Outputs:
  TableName:
    Value: !Ref PLGTable
  TableArn:
    Value: !GetAtt PLGTable.Arn
```

#### 3.1.2 Deploy Script (deploy.sh)

```bash
#!/bin/bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════
# HIC PLG Infrastructure Deployment Script
# ═══════════════════════════════════════════════════════════════════
# Usage: ./deploy.sh [environment] [--dry-run]
# Example: ./deploy.sh dev --dry-run
# ═══════════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Configuration
ENVIRONMENT=${1:-dev}
DRY_RUN=false

# Parse flags
for arg in "$@"; do
  case $arg in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
  esac
done

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|prod)$ ]]; then
  echo "❌ ERROR: Environment must be 'dev', 'staging', or 'prod'"
  exit 1
fi

# Stack configuration
STACK_NAME="hic-plg-${ENVIRONMENT}"
REGION="${AWS_REGION:-us-east-1}"
PARAMS_FILE="${SCRIPT_DIR}/parameters/${ENVIRONMENT}.json"

echo "═══════════════════════════════════════════════════════════════════"
echo "🚀 HIC PLG Infrastructure Deployment"
echo "═══════════════════════════════════════════════════════════════════"
echo "Environment: ${ENVIRONMENT}"
echo "Stack Name:  ${STACK_NAME}"
echo "Region:      ${REGION}"
echo "Dry Run:     ${DRY_RUN}"
echo ""

# Validate AWS credentials
echo "🔍 Validating AWS credentials..."
if ! aws sts get-caller-identity &>/dev/null; then
  echo "❌ ERROR: No valid AWS credentials found"
  exit 1
fi
echo "✅ AWS Account: $(aws sts get-caller-identity --query Account --output text)"

# Validate template
echo ""
echo "🔍 Validating CloudFormation template..."
aws cloudformation validate-template \
  --template-body "file://${SCRIPT_DIR}/cloudformation/plg-main-stack.yaml" \
  --region "$REGION" > /dev/null
echo "✅ Template validation passed"

# Create change set for dry-run or deployment
CHANGE_SET_NAME="deploy-$(date +%Y%m%d-%H%M%S)"

echo ""
echo "📋 Creating change set: ${CHANGE_SET_NAME}..."

aws cloudformation create-change-set \
  --stack-name "$STACK_NAME" \
  --change-set-name "$CHANGE_SET_NAME" \
  --template-body "file://${SCRIPT_DIR}/cloudformation/plg-main-stack.yaml" \
  --parameters "file://${PARAMS_FILE}" \
  --capabilities CAPABILITY_NAMED_IAM \
  --region "$REGION" \
  --change-set-type $(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" 2>/dev/null && echo "UPDATE" || echo "CREATE")

# Wait for change set creation
echo "⏳ Waiting for change set to be created..."
aws cloudformation wait change-set-create-complete \
  --stack-name "$STACK_NAME" \
  --change-set-name "$CHANGE_SET_NAME" \
  --region "$REGION" 2>/dev/null || true

# Display proposed changes
echo ""
echo "📋 Proposed Changes:"
echo "─────────────────────────────────────────────────────────────────────"
aws cloudformation describe-change-set \
  --stack-name "$STACK_NAME" \
  --change-set-name "$CHANGE_SET_NAME" \
  --region "$REGION" \
  --query 'Changes[*].ResourceChange.{Action:Action,LogicalId:LogicalResourceId,Type:ResourceType}' \
  --output table

if [ "$DRY_RUN" = true ]; then
  echo ""
  echo "🔍 DRY RUN MODE - No changes applied"
  echo "   To execute: ./deploy.sh ${ENVIRONMENT}"

  # Clean up change set
  aws cloudformation delete-change-set \
    --stack-name "$STACK_NAME" \
    --change-set-name "$CHANGE_SET_NAME" \
    --region "$REGION"
  exit 0
fi

# Execute change set
echo ""
echo "🚀 Executing change set..."
aws cloudformation execute-change-set \
  --stack-name "$STACK_NAME" \
  --change-set-name "$CHANGE_SET_NAME" \
  --region "$REGION"

# Wait for deployment
echo "⏳ Waiting for deployment to complete (this may take several minutes)..."
aws cloudformation wait stack-update-complete \
  --stack-name "$STACK_NAME" \
  --region "$REGION" 2>/dev/null || \
aws cloudformation wait stack-create-complete \
  --stack-name "$STACK_NAME" \
  --region "$REGION"

# Display outputs
echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Stack Outputs:"
echo "─────────────────────────────────────────────────────────────────────"
aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query 'Stacks[0].Outputs[*].{Key:OutputKey,Value:OutputValue}' \
  --output table
```

### Phase 2: GitHub Actions CI/CD (3-4 hours)

Create `.github/workflows/`:

```
.github/workflows/
├── test.yml                    # Run tests on PR
├── deploy-staging.yml          # Deploy to staging on merge to development
└── deploy-production.yml       # Deploy to production on merge to main
```

#### 3.2.1 Test Workflow (test.yml)

```yaml
name: Test

on:
  pull_request:
    branches: [main, development]
    paths:
      - "plg-website/**"
      - ".github/workflows/test.yml"
  push:
    branches: [development]
    paths:
      - "plg-website/**"

jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: plg-website

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: plg-website/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Run ESLint
        run: npm run lint

      - name: Run tests
        run: npm test
        env:
          # Test environment variables
          AUTH0_SECRET: test-secret
          AUTH0_BASE_URL: http://localhost:3000
          NEXT_PUBLIC_AUTH0_DOMAIN: test.auth0.com
          NEXT_PUBLIC_AUTH0_CLIENT_ID: test-client-id
          STRIPE_SECRET_KEY: sk_test_xxx
          DYNAMODB_TABLE_NAME: hic-plg-test

      - name: Build
        run: npm run build
```

#### 3.2.2 Deploy Staging Workflow (deploy-staging.yml)

```yaml
name: Deploy to Staging

on:
  push:
    branches: [development]
    paths:
      - "plg-website/**"
      - "plg-website/infrastructure/**"

jobs:
  deploy-infrastructure:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read

    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN_STAGING }}
          aws-region: us-east-1

      - name: Deploy Infrastructure (Dry Run)
        run: |
          cd plg-website/infrastructure
          ./deploy.sh staging --dry-run

      - name: Deploy Infrastructure
        run: |
          cd plg-website/infrastructure
          ./deploy.sh staging

  # Note: Amplify handles application deployment automatically
  # This workflow only deploys infrastructure (DynamoDB, SES, IAM)
```

### Phase 3: Amplify Configuration (2-3 hours)

Create `plg-website/amplify.yml`:

```yaml
version: 1
applications:
  - frontend:
      phases:
        preBuild:
          commands:
            - npm ci
        build:
          commands:
            - npm run build
      artifacts:
        baseDirectory: .next
        files:
          - "**/*"
      cache:
        paths:
          - node_modules/**/*
          - .next/cache/**/*
    appRoot: plg-website
```

### Phase 4: Parameter Store Setup (2-3 hours)

Create CloudFormation template for SSM parameters and secrets:

```yaml
# plg-ssm-parameters.yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: HIC PLG SSM Parameters (non-sensitive)

Parameters:
  Environment:
    Type: String
    AllowedValues: [dev, staging, prod]

Resources:
  # System configuration parameters
  DynamoDBTableName:
    Type: AWS::SSM::Parameter
    Properties:
      Name: !Sub "/plg/${Environment}/dynamodb/table-name"
      Type: String
      Value: !Sub "hic-plg-${Environment}"
      Description: DynamoDB table name for PLG
      Tags:
        Environment: !Ref Environment

  SESFromEmail:
    Type: AWS::SSM::Parameter
    Properties:
      Name: !Sub "/plg/${Environment}/ses/from-email"
      Type: String
      Value: !Sub "noreply@${Environment}.hic-ai.com"
      Description: SES sender email address
      Tags:
        Environment: !Ref Environment

  # Feature flags
  FeatureOSSEnabled:
    Type: AWS::SSM::Parameter
    Properties:
      Name: !Sub "/plg/${Environment}/features/oss-enabled"
      Type: String
      Value: "false"
      Description: Enable OSS tier (deferred per Addendum A.1)
      Tags:
        Environment: !Ref Environment
```

**Secrets (manual setup in AWS Console or Secrets Manager IaC):**

- `/plg/{env}/stripe/secret-key`
- `/plg/{env}/stripe/webhook-secret`
- `/plg/{env}/keygen/product-token`
- `/plg/{env}/keygen/webhook-secret`
- `/plg/{env}/auth0/client-secret`

### Phase 5: Local Development Setup (2-3 hours)

#### 3.5.1 HTTP Test Files

Create `plg-website/http/` directory with test files:

```
plg-website/http/
├── README.md                    # Setup instructions
├── .env.http                    # Variables for HTTP client
├── checkout.http                # Checkout API tests
├── license.http                 # License API tests
├── portal.http                  # Portal API tests
└── webhooks.http                # Webhook simulation tests
```

**Example: license.http**

```http
### Variables
@baseUrl = http://localhost:3000
@licenseKey = MOUSE-TEST-1234-5678

### Validate License
POST {{baseUrl}}/api/license/validate
Content-Type: application/json

{
  "licenseKey": "{{licenseKey}}",
  "machineFingerprint": "test-machine-fp-abc123",
  "vsCodeVersion": "1.85.0",
  "mouseVersion": "0.9.7"
}

### Activate License
POST {{baseUrl}}/api/license/activate
Content-Type: application/json

{
  "licenseKey": "{{licenseKey}}",
  "machineFingerprint": "test-machine-fp-abc123",
  "machineName": "Test MacBook Pro",
  "vsCodeVersion": "1.85.0",
  "mouseVersion": "0.9.7",
  "platform": "darwin"
}

### Deactivate License
POST {{baseUrl}}/api/license/deactivate
Content-Type: application/json

{
  "licenseKey": "{{licenseKey}}",
  "machineFingerprint": "test-machine-fp-abc123"
}
```

**VS Code Extension Recommendation:**

- Install "REST Client" extension by Huachao Mao
- Allows running HTTP requests directly from VS Code
- Supports environment variables and request chaining

---

## 4. Environment Configuration Strategy

### 4.1 Three-Layer Architecture

| Layer                   | Purpose                             | Storage                               | Example                          |
| ----------------------- | ----------------------------------- | ------------------------------------- | -------------------------------- |
| **System Values**       | Service config not user-overridable | AWS Parameter Store + Amplify Console | API keys, endpoints, table names |
| **User-Defined Values** | Customer customizations             | N/A for PLG (no user config)          | —                                |
| **Default Values**      | Fallback when not configured        | `constants.js`                        | Pricing, limits, feature flags   |

### 4.2 Environment Variable Categories

**Amplify Console (Build + Runtime):**

```
# Authentication
AUTH0_SECRET
AUTH0_CLIENT_SECRET
NEXT_PUBLIC_AUTH0_DOMAIN
NEXT_PUBLIC_AUTH0_CLIENT_ID
NEXT_PUBLIC_AUTH0_AUDIENCE

# Public URLs
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
NEXT_PUBLIC_STRIPE_PRICE_*
```

**Secrets Manager (Sensitive):**

```
/plg/{env}/stripe/secret-key
/plg/{env}/stripe/webhook-secret
/plg/{env}/keygen/product-token
/plg/{env}/keygen/webhook-secret
```

**Parameter Store (System Config):**

```
/plg/{env}/dynamodb/table-name
/plg/{env}/ses/from-email
/plg/{env}/features/*
```

**constants.js (Defaults):**

```javascript
export const PRICING = {
  INDIVIDUAL_MONTHLY: 1000, // $10.00
  INDIVIDUAL_ANNUAL: 9600, // $96.00 (20% discount)
  ENTERPRISE_PER_SEAT: 2500, // $25.00
};

export const LIMITS = {
  INDIVIDUAL_DEVICES: 3,
  ENTERPRISE_DEVICES_PER_SEAT: 2,
};
```

---

## 5. Implementation Order

Based on dependencies and risk:

| Order | Task                             | Est. Hours | Dependencies | Risk   |
| ----- | -------------------------------- | ---------- | ------------ | ------ |
| 1     | CloudFormation DynamoDB template | 2h         | None         | Low    |
| 2     | CloudFormation SES template      | 1h         | None         | Low    |
| 3     | CloudFormation IAM template      | 1h         | #1, #2       | Medium |
| 4     | deploy.sh script                 | 2h         | #1-3         | Low    |
| 5     | GitHub Actions test.yml          | 2h         | None         | Low    |
| 6     | amplify.yml                      | 1h         | None         | Low    |
| 7     | GitHub Actions deploy workflows  | 2h         | #4-6         | Medium |
| 8     | Parameter Store templates        | 2h         | None         | Low    |
| 9     | HTTP test files                  | 2h         | None         | Low    |
| 10    | Documentation update             | 2h         | All          | Low    |

**Total: 17 hours**

---

## 6. Recommendations

### 6.1 Local Development Setup

For back-end API testing, I recommend:

1. **HTTP Files (Primary)** — Use VS Code's REST Client extension
   - Lightweight, version-controlled, team-shareable
   - Variables support for different environments
   - Request chaining for auth flows
2. **Postman (Secondary)** — Use when you need:
   - Complex authentication flows (OAuth dance)
   - Collection sharing with external testers
   - Mock servers for webhook testing

### 6.2 Event-Driven Architecture

Defer the full SNS/SQS/Lambda event architecture to Phase 2. Current synchronous approach is acceptable for MVP because:

- Low volume expected initially
- Simplicity reduces debugging complexity
- Amplify API routes have built-in retry on failure
- Can add queues later without changing business logic

### 6.3 Secrets Management

Use AWS Secrets Manager for:

- `STRIPE_SECRET_KEY` — Critical payment secrets
- `STRIPE_WEBHOOK_SECRET` — Webhook verification
- `KEYGEN_PRODUCT_TOKEN` — License server auth
- `AUTH0_CLIENT_SECRET` — Auth server secrets

All other config can go in Amplify Console or Parameter Store.

---

## 7. Next Steps

Upon your approval:

1. **Create infrastructure directory structure**
2. **Implement CloudFormation templates**
3. **Create deploy.sh with dry-run support**
4. **Set up GitHub Actions workflows**
5. **Create amplify.yml**
6. **Set up HTTP test files**
7. **Document deployment procedures**

Should I proceed with implementation?

---

**Document Version:** 1.0  
**Status:** Ready for Review

---

# Addendum A: Simplified Event-Driven Architecture

**Date:** January 23, 2026  
**Status:** APPROVED — Supersedes §6.2 of main document

---

## A.1 Architecture Decision

Per discussion with Simon, the event-driven architecture is **required for MVP**, not deferred. However, the architecture has been **simplified** to reduce complexity while maintaining async processing throughout.

### A.1.1 Key Decisions

| Topic                | Decision           | Rationale                                      |
| -------------------- | ------------------ | ---------------------------------------------- |
| Analytics Queue      | ❌ Removed         | Use CloudWatch Metric Filters on HicLog output |
| Audit Queue          | ❌ Removed         | Use CloudWatch Logs with retention policy      |
| Email Queue          | ✅ Kept            | Emails need retry semantics                    |
| CustomerUpdate Queue | ✅ Kept            | State updates need ordering guarantees         |
| Observability        | CloudWatch-centric | HicLog already writes to CloudWatch            |

### A.1.2 Synchronous vs Asynchronous Processing

**Required synchronous junction:** Webhook handlers must return HTTP 200 within 30 seconds (Stripe/Keygen requirement).

**Minimal synchronous work:**

1. Verify webhook signature
2. Write raw EVENT record to DynamoDB
3. Return HTTP 200

**Everything else is async:**

- Customer/License/Subscription record updates
- Email sending
- Analytics/Metrics
- Audit logging

---

## A.2 Revised Event Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 1: WEBHOOK RECEIPT (Synchronous — <30 seconds)                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Stripe/Keygen ──webhook──► API Gateway ──► Amplify API Route              │
│                                                   │                         │
│                                                   │ 1. Verify signature     │
│                                                   │ 2. Write EVENT record   │
│                                                   │ 3. Return HTTP 200      │
│                                                   ▼                         │
│                                            DynamoDB Table                   │
│                                            (EVENT entity only)              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                                   │
                                                   │ DynamoDB Stream
                                                   │ (NEW_AND_OLD_IMAGES)
                                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 2: EVENT CLASSIFICATION (Async)                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  DynamoDB Stream ──► Stream Processor Lambda                               │
│                              │                                              │
│                              │ • Read stream record                         │
│                              │ • HicLog to CloudWatch (automatic)           │
│                              │ • Classify event type                        │
│                              │ • Publish to SNS topic                       │
│                              ▼                                              │
│                         SNS Topics                                          │
│                    ┌────────┴────────┐                                      │
│                    ▼                 ▼                                      │
│           PaymentEvents      LicenseEvents                                  │
│           CustomerEvents                                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
┌───────────────────────────────────┐ ┌───────────────────────────────────────┐
│  PHASE 3A: STATE UPDATES (Async)  │ │  PHASE 3B: NOTIFICATIONS (Async)      │
├───────────────────────────────────┤ ├───────────────────────────────────────┤
│                                   │ │                                       │
│  CustomerUpdateQueue              │ │  EmailQueue                           │
│         │                         │ │       │                               │
│         ▼                         │ │       ▼                               │
│  CustomerUpdateLambda             │ │  EmailSenderLambda                    │
│         │                         │ │       │                               │
│         │ • HicLog (auto)         │ │       │ • HicLog (auto)               │
│         │ • Update CUSTOMER       │ │       │ • Send via SES                │
│         │ • Update LICENSE        │ │       │ • Mark email sent             │
│         │ • Update SUBSCRIPTION   │ │       ▼                               │
│         │ • Call Keygen API       │ │    AWS SES                            │
│         ▼                         │ │                                       │
│  DynamoDB (state entities)        │ │  EmailDLQ (failures)                  │
│                                   │ │                                       │
│  CustomerUpdateDLQ (failures)     │ │                                       │
│                                   │ │                                       │
└───────────────────────────────────┘ └───────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  OBSERVABILITY (CloudWatch-Centric)                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  All Lambda Functions ──HicLog──► CloudWatch Logs                          │
│                                          │                                  │
│           ┌──────────────────────────────┼──────────────────────────────┐   │
│           │                              │                              │   │
│           ▼                              ▼                              ▼   │
│   Metric Filters               Logs Insights              (Future) S3 Export│
│   ───────────────              ─────────────              ─────────────────│
│   • PaymentCount               Ad-hoc queries:            Long-term archive │
│   • NewCustomerCount           • "Events for cust X"      for compliance    │
│   • LicenseValidations         • "Failed payments today"                    │
│   • EmailsSent                 • "Errors in last hour"                      │
│           │                                                                 │
│           ▼                                                                 │
│   CloudWatch Metrics ──► Dashboard + Alarms                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## A.3 Idempotency and Payment Safety

### A.3.1 Why "Credit Cards Charged Twice" Is Not Our Risk

**Key insight:** We never initiate charges. Stripe does.

```
Customer clicks "Pay"
       │
       ▼
Stripe Checkout (hosted by Stripe)
       │
       │ Stripe handles:
       │ • Card validation
       │ • 3D Secure
       │ • Fraud detection
       │ • Charge creation
       │
       ▼
Stripe fires webhook: checkout.session.completed
       │
       ▼
Our webhook handler
       │
       │ We RECORD that Stripe charged
       │ We NEVER call Stripe to charge
       │
       ▼
Write EVENT to DynamoDB (idempotent)
```

### A.3.2 Idempotent Event Processing

The risk is "process webhook twice," which we handle with conditional writes:

```javascript
// Webhook handler - idempotent write
await dynamodb.put({
  TableName: TABLE_NAME,
  Item: {
    PK: `EVENT#${event.id}`, // Stripe event ID is unique
    SK: `SOURCE#stripe`,
    eventId: event.id,
    eventType: event.type,
    payload: event.data.object,
    receivedAt: new Date().toISOString(),
    processed: false,
  },
  ConditionExpression: "attribute_not_exists(PK)", // Fails if already exists
});
```

**If webhook is delivered twice:**

1. First delivery: Write succeeds, stream triggers processing
2. Second delivery: Write fails (condition), webhook returns 200 anyway
3. Result: Event processed exactly once

---

## A.4 Revised Resource Inventory

### A.4.1 Resources Removed (vs. Original Spec)

| Resource                 | Original Purpose                | Replacement                 |
| ------------------------ | ------------------------------- | --------------------------- |
| AnalyticsQueue           | Buffer for analytics processing | CloudWatch Metric Filters   |
| AnalyticsDLQ             | Failed analytics retry          | N/A (CloudWatch is durable) |
| AuditQueue               | Buffer for audit logging        | CloudWatch Logs             |
| AuditDLQ                 | Failed audit retry              | N/A (CloudWatch is durable) |
| AnalyticsProcessorLambda | Write CloudWatch metrics        | Metric Filters (zero code)  |
| AuditLoggerLambda        | Write audit trail               | CloudWatch Logs (automatic) |

### A.4.2 Final Resource List

| Category       | Resource              | Type                      | Purpose                            |
| -------------- | --------------------- | ------------------------- | ---------------------------------- |
| **Database**   | PLGTable              | DynamoDB Table            | Single-table for all entities      |
|                | GSI1                  | Global Secondary Index    | Stripe ID lookups                  |
|                | GSI2                  | Global Secondary Index    | License key lookups                |
|                | PLGTableStream        | DynamoDB Stream           | Event trigger (NEW_AND_OLD_IMAGES) |
| **Messaging**  | PaymentEventsTopic    | SNS Topic                 | Payment event fan-out              |
|                | CustomerEventsTopic   | SNS Topic                 | Customer lifecycle fan-out         |
|                | LicenseEventsTopic    | SNS Topic                 | License event fan-out              |
|                | EmailQueue            | SQS Queue                 | Email delivery buffer              |
|                | EmailDLQ              | SQS Dead Letter Queue     | Failed email retry                 |
|                | CustomerUpdateQueue   | SQS Queue                 | State update buffer                |
|                | CustomerUpdateDLQ     | SQS Dead Letter Queue     | Failed update retry                |
| **Compute**    | StreamProcessorLambda | Lambda Function           | Classify events, publish to SNS    |
|                | EmailSenderLambda     | Lambda Function           | Send emails via SES                |
|                | CustomerUpdateLambda  | Lambda Function           | Update state in DynamoDB + Keygen  |
|                | ScheduledTasksLambda  | Lambda Function           | Trial reminders, win-back emails   |
| **Email**      | SESIdentity           | SES Domain Identity       | Verified sending domain            |
|                | SESConfigSet          | SES Configuration Set     | Bounce/complaint tracking          |
| **Scheduled**  | TrialReminderRule     | EventBridge Rule          | Daily 9 AM UTC                     |
|                | WinbackEmail30Rule    | EventBridge Rule          | Daily 10 AM UTC                    |
|                | WinbackEmail90Rule    | EventBridge Rule          | Daily 10 AM UTC                    |
| **Monitoring** | LogGroups             | CloudWatch Log Groups     | Lambda log storage                 |
|                | MetricFilters         | CloudWatch Metric Filters | Extract metrics from HicLog        |
|                | Alarms                | CloudWatch Alarms         | Error/DLQ alerts                   |
|                | Dashboard             | CloudWatch Dashboard      | Business metrics overview          |
| **Security**   | AmplifyRole           | IAM Role                  | Amplify → DynamoDB, SES            |
|                | StreamProcessorRole   | IAM Role                  | Stream → SNS                       |
|                | EmailSenderRole       | IAM Role                  | SQS → SES                          |
|                | CustomerUpdateRole    | IAM Role                  | SQS → DynamoDB, Keygen             |
|                | ScheduledTasksRole    | IAM Role                  | EventBridge → DynamoDB, SES        |

**Total: 28 resources** (reduced from ~36 in original spec)

---

## A.5 EventBridge Scheduled Jobs

### A.5.1 MVP Scheduled Jobs

| Job                       | Schedule        | Purpose                                                  | Query                                                |
| ------------------------- | --------------- | -------------------------------------------------------- | ---------------------------------------------------- |
| **Trial Ending Reminder** | Daily 9 AM UTC  | Email users 3 days before trial expires                  | `status = TRIALING AND validUntil = today + 3 days`  |
| **Win-back Email #1**     | Daily 10 AM UTC | Email users 30 days after cancellation                   | `status = CANCELED AND canceledAt = today - 30 days` |
| **Win-back Email #2**     | Daily 10 AM UTC | Email users 90 days after cancellation with 20% discount | `status = CANCELED AND canceledAt = today - 90 days` |

### A.5.2 What External Services Handle

| Capability                | Service              | Notes                         |
| ------------------------- | -------------------- | ----------------------------- |
| Payment retry reminders   | Stripe Smart Retries | Configurable in Dashboard     |
| Subscription auto-renewal | Stripe               | Automatic                     |
| License expiration        | Keygen.sh            | Built-in expiry enforcement   |
| Dunning emails            | Stripe               | Payment failure notifications |

### A.5.3 Future Jobs (Not MVP)

| Job                        | Schedule    | Purpose                                  | Priority |
| -------------------------- | ----------- | ---------------------------------------- | -------- |
| Stale device cleanup       | Weekly      | Deactivate machines not seen in 90 days  | Low      |
| Weekly business metrics    | Monday 8 AM | Email Simon with KPIs                    | Low      |
| License expiration warning | Daily       | 7 days before expiry (if Keygen doesn't) | Medium   |
| PITR backup verification   | Daily       | Verify DynamoDB backups                  | Low      |

---

## A.6 CloudWatch Metric Filters

### A.6.1 Business Metrics (Extracted from HicLog)

```javascript
// HicLog output structure
{
  "timestamp": "2026-01-23T14:30:00Z",
  "level": "INFO",
  "event": "PAYMENT_SUCCEEDED",
  "customerId": "cust_abc123",
  "amount": 1000,
  "currency": "usd",
  "plan": "individual_monthly",
  "source": "stream-processor"
}
```

| Metric Name          | Filter Pattern                          | Statistic       |
| -------------------- | --------------------------------------- | --------------- |
| PaymentSucceeded     | `{ $.event = "PAYMENT_SUCCEEDED" }`     | Count           |
| PaymentAmount        | `{ $.event = "PAYMENT_SUCCEEDED" }`     | Sum of $.amount |
| PaymentFailed        | `{ $.event = "PAYMENT_FAILED" }`        | Count           |
| NewCustomer          | `{ $.event = "CUSTOMER_CREATED" }`      | Count           |
| LicenseValidation    | `{ $.event = "LICENSE_VALIDATED" }`     | Count           |
| LicenseActivation    | `{ $.event = "LICENSE_ACTIVATED" }`     | Count           |
| EmailSent            | `{ $.event = "EMAIL_SENT" }`            | Count           |
| EmailFailed          | `{ $.event = "EMAIL_FAILED" }`          | Count           |
| SubscriptionCanceled | `{ $.event = "SUBSCRIPTION_CANCELED" }` | Count           |

### A.6.2 CloudWatch Dashboard Widgets

| Widget              | Type       | Metrics                                  |
| ------------------- | ---------- | ---------------------------------------- |
| Revenue Today       | Number     | Sum(PaymentAmount) for today             |
| New Customers       | Number     | Sum(NewCustomer) for today               |
| Active Licenses     | Number     | Count from DynamoDB                      |
| License Validations | Line Graph | LicenseValidation over 24h               |
| Email Delivery      | Line Graph | EmailSent vs EmailFailed                 |
| Error Rate          | Line Graph | Lambda errors across all functions       |
| DLQ Depth           | Number     | Messages in EmailDLQ + CustomerUpdateDLQ |

---

## A.7 Revised Cost Estimate

| Category   | Resources                             | Monthly Cost (MVP) |
| ---------- | ------------------------------------- | ------------------ |
| Database   | 1 table, 2 GSIs, 1 stream             | $0-5               |
| Messaging  | 3 SNS topics, 4 SQS queues            | $0-2               |
| Compute    | 4 Lambda functions                    | $0-5               |
| Email      | SES domain + config                   | $0-1               |
| Monitoring | Log groups, metric filters, dashboard | $0-3               |
| Scheduled  | 3 EventBridge rules                   | $0 (free tier)     |
| **Total**  | **28 resources**                      | **$0-16/month**    |

All covered by AWS credits at MVP scale.

---

## A.8 Updated Implementation Order

| Order | Task                                       | Est. Hours | Dependencies |
| ----- | ------------------------------------------ | ---------- | ------------ |
| 1     | `plg-dynamodb.yaml` (table + stream)       | 2h         | None         |
| 2     | `plg-messaging.yaml` (SNS + SQS)           | 2h         | None         |
| 3     | `plg-iam.yaml` (all roles)                 | 2h         | #1, #2       |
| 4     | `plg-compute.yaml` (4 Lambdas)             | 3h         | #1, #2, #3   |
| 5     | `plg-ses.yaml` (email infra)               | 1h         | None         |
| 6     | `plg-scheduled.yaml` (EventBridge rules)   | 1h         | #4           |
| 7     | `plg-monitoring.yaml` (metrics, dashboard) | 2h         | #4           |
| 8     | `plg-main-stack.yaml` (orchestrator)       | 1h         | All above    |
| 9     | `deploy.sh` with dry-run                   | 2h         | #8           |
| 10    | GitHub Actions workflows                   | 3h         | #9           |
| 11    | `amplify.yml`                              | 1h         | None         |
| 12    | HTTP test files                            | 2h         | None         |

**Total: ~22 hours**

---

## A.9 Next Steps

With this addendum approved:

1. ✅ Architecture decisions finalized
2. ⬜ Implement CloudFormation templates
3. ⬜ Create deploy.sh with dry-run
4. ⬜ Set up GitHub Actions CI/CD
5. ⬜ Create amplify.yml
6. ⬜ Refactor webhook handlers to use event-sourcing pattern
7. ⬜ Implement Lambda functions
8. ⬜ Set up CloudWatch observability

---

**Addendum Version:** 1.0  
**Status:** APPROVED  
**Approved By:** Simon Reiff  
**Approval Date:** January 23, 2026
