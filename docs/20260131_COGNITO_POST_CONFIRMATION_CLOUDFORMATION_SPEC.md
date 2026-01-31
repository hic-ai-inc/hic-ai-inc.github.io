# Cognito Post-Confirmation Lambda CloudFormation Specification

**Date:** January 31, 2026  
**Status:** Ready for Implementation  
**Related:** [PLG Email System Technical Specification V5](20260131_PLG_EMAIL_SYSTEM_TECHNICAL_SPECIFICATION_V5.md)

---

## Overview

This document specifies the CloudFormation changes required to deploy the `cognito-post-confirmation` Lambda function. The Lambda code already exists and is unit tested (10/10 tests passing). This specification covers the IaC additions needed to deploy it properly.

### Lambda Purpose

The `cognito-post-confirmation` Lambda is triggered when a user confirms their Cognito account. It:

1. **Requests SES email verification** - Calls `ses:VerifyEmailIdentity` to send AWS verification email
2. **Writes USER_CREATED event** - Records event in DynamoDB to trigger welcome email (after verification)

### Current State

| Component       | Status                                                                   |
| --------------- | ------------------------------------------------------------------------ |
| Lambda code     | ✅ Complete (`infrastructure/lambda/cognito-post-confirmation/index.js`) |
| Unit tests      | ✅ Passing (10/10)                                                       |
| CloudFormation  | ❌ Not defined                                                           |
| Cognito trigger | ❌ Not configured                                                        |

---

## Architecture

```
┌─────────────────┐      ┌──────────────────────────┐      ┌─────────────┐
│  User confirms  │──────│  cognito-post-confirmation │──────│  SES        │
│  Cognito email  │      │  Lambda                    │      │  VerifyEmail│
└─────────────────┘      └──────────────────────────┘      └─────────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │  DynamoDB           │
                         │  USER_CREATED event │
                         └─────────────────────┘
```

---

## CloudFormation Changes

### 1. plg-iam.yaml - Add IAM Role

Add after `ScheduledTasksRole` resource (~line 310):

```yaml
# ═══════════════════════════════════════════════════════════════════════════
# COGNITO POST-CONFIRMATION LAMBDA ROLE
# Triggered by Cognito PostConfirmation, requests SES verification, writes to DynamoDB
# ═══════════════════════════════════════════════════════════════════════════

CognitoPostConfirmationRole:
  Type: AWS::IAM::Role
  Properties:
    RoleName: !Sub "plg-cognito-post-confirmation-role-${Environment}"
    AssumeRolePolicyDocument:
      Version: "2012-10-17"
      Statement:
        - Effect: Allow
          Principal:
            Service: lambda.amazonaws.com
          Action: sts:AssumeRole
    ManagedPolicyArns:
      - arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
    Policies:
      - PolicyName: SESVerifyEmailAccess
        PolicyDocument:
          Version: "2012-10-17"
          Statement:
            - Effect: Allow
              Action:
                - ses:VerifyEmailIdentity
              Resource: "*"
      - PolicyName: DynamoDBWriteAccess
        PolicyDocument:
          Version: "2012-10-17"
          Statement:
            - Effect: Allow
              Action:
                - dynamodb:PutItem
                - dynamodb:GetItem
              Resource:
                - !Ref DynamoDBTableArn
    Tags:
      - Key: Environment
        Value: !Ref Environment
      - Key: Application
        Value: plg-website
```

Add to Outputs section:

```yaml
CognitoPostConfirmationRoleArn:
  Description: ARN of Cognito Post-Confirmation Lambda role
  Value: !GetAtt CognitoPostConfirmationRole.Arn
  Export:
    Name: !Sub "${AWS::StackName}-CognitoPostConfirmationRoleArn"
```

### 2. plg-compute.yaml - Add Lambda Function

Add new parameter after `ScheduledTasksRoleArn`:

```yaml
CognitoPostConfirmationRoleArn:
  Type: String
  Description: ARN of Cognito Post-Confirmation IAM role
```

Add after `ScheduledTasksFunction` resource (~line 280):

```yaml
# ═══════════════════════════════════════════════════════════════════════════
# LAMBDA FUNCTION: Cognito Post-Confirmation
# Triggered by Cognito PostConfirmation, requests SES verification
# ═══════════════════════════════════════════════════════════════════════════

CognitoPostConfirmationFunction:
  Type: AWS::Lambda::Function
  Properties:
    FunctionName: !Sub "plg-cognito-post-confirmation-${Environment}"
    Description: Requests SES email verification on Cognito signup confirmation
    Runtime: nodejs20.x
    Handler: index.handler
    Role: !Ref CognitoPostConfirmationRoleArn
    Timeout: 30
    MemorySize: 128
    Layers:
      - !Ref HicBaseLayerArn
      - !Ref HicSesLayerArn
      - !Ref HicDynamoDBLayerArn
    Environment:
      Variables:
        ENVIRONMENT: !Ref Environment
        DYNAMODB_TABLE_NAME: !Ref DynamoDBTableName
    Code:
      S3Bucket: !Ref LambdaCodeBucket
      S3Key: !Sub "${LambdaCodePrefix}/cognito-post-confirmation.zip"
    VpcConfig: !If
      - HasVpcConfig
      - SubnetIds: !Ref VpcSubnetIds
        SecurityGroupIds: !Ref VpcSecurityGroupIds
      - !Ref AWS::NoValue
    Tags:
      - Key: Environment
        Value: !Ref Environment
      - Key: Application
        Value: plg-website

CognitoPostConfirmationPermission:
  Type: AWS::Lambda::Permission
  Properties:
    FunctionName: !Ref CognitoPostConfirmationFunction
    Action: lambda:InvokeFunction
    Principal: cognito-idp.amazonaws.com
    SourceArn: !Sub "arn:aws:cognito-idp:${AWS::Region}:${AWS::AccountId}:userpool/*"
```

Add to Outputs section:

```yaml
CognitoPostConfirmationFunctionArn:
  Description: Cognito Post-Confirmation Lambda ARN
  Value: !GetAtt CognitoPostConfirmationFunction.Arn
  Export:
    Name: !Sub "${AWS::StackName}-CognitoPostConfirmationFunctionArn"
```

### 3. plg-main-stack.yaml - Wire Up Parameters

Add to ComputeStack Parameters section (~line 185):

```yaml
CognitoPostConfirmationRoleArn: !GetAtt IAMStack.Outputs.CognitoPostConfirmationRoleArn
```

Add to Outputs section:

```yaml
CognitoPostConfirmationFunctionArn:
  Description: Cognito Post-Confirmation Lambda ARN (use in Amplify Cognito config)
  Value: !GetAtt ComputeStack.Outputs.CognitoPostConfirmationFunctionArn
  Export:
    Name: !Sub "${AWS::StackName}-CognitoPostConfirmationFunctionArn"
```

---

## Cognito Trigger Configuration

The Cognito PostConfirmation trigger must be configured in Amplify. This is separate from the CloudFormation stack because Cognito is managed by Amplify.

### Option A: Amplify Backend Configuration

Update `amplify/backend.ts` to add the Lambda trigger:

```typescript
import { defineAuth } from "@aws-amplify/backend";

export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  triggers: {
    postConfirmation: {
      // Reference the deployed Lambda ARN from CloudFormation output
      handler:
        "arn:aws:lambda:us-east-1:ACCOUNT:function:plg-cognito-post-confirmation-staging",
    },
  },
});
```

### Option B: Manual Console Configuration

After deploying the CloudFormation stack:

1. Go to AWS Console → Cognito → User Pools
2. Select `us-east-1_CntYimcMm` (staging pool)
3. Go to "User pool properties" → "Lambda triggers"
4. Under "Post confirmation", select `plg-cognito-post-confirmation-staging`
5. Save changes

---

## Deployment Steps

### 1. Package Lambda Code

```bash
cd plg-website/infrastructure/lambda/cognito-post-confirmation
zip -r cognito-post-confirmation.zip index.js
aws s3 cp cognito-post-confirmation.zip s3://${LAMBDA_CODE_BUCKET}/lambda/cognito-post-confirmation.zip
```

### 2. Update CloudFormation Templates

Apply the changes specified above to:

- `plg-iam.yaml`
- `plg-compute.yaml`
- `plg-main-stack.yaml`

### 3. Deploy Stack Update

```bash
aws cloudformation update-stack \
  --stack-name plg-main-stack-staging \
  --template-url https://${TEMPLATES_BUCKET}.s3.amazonaws.com/cloudformation/plg-main-stack.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameters file://stack-parameters-staging.json
```

### 4. Configure Cognito Trigger

Use Option A (Amplify config) or Option B (manual console) from above.

### 5. Validate

```bash
# Test by signing up a new user
# Check CloudWatch logs for Lambda execution
aws logs tail /aws/lambda/plg-cognito-post-confirmation-staging --follow
```

---

## Security Considerations

### IAM Permissions

The Lambda role follows least-privilege:

| Permission                | Scope                        | Reason                                                                      |
| ------------------------- | ---------------------------- | --------------------------------------------------------------------------- |
| `ses:VerifyEmailIdentity` | `*`                          | Required - SES verification API doesn't support resource-level restrictions |
| `dynamodb:PutItem`        | Table ARN only               | Write USER_CREATED event                                                    |
| `dynamodb:GetItem`        | Table ARN only               | Check for existing customer record                                          |
| CloudWatch Logs           | Automatic via managed policy | Lambda logging                                                              |

### Cognito Permission

The `AWS::Lambda::Permission` resource grants Cognito the ability to invoke the Lambda. The `SourceArn` uses a wildcard for the user pool to support multiple environments, but the actual invocation is controlled by the Cognito trigger configuration.

---

## Testing Checklist

- [ ] Lambda deploys successfully
- [ ] IAM role has correct permissions
- [ ] Cognito trigger is configured
- [ ] New user signup triggers Lambda
- [ ] SES verification email is sent to user
- [ ] USER_CREATED event appears in DynamoDB
- [ ] CloudWatch logs show successful execution

---

## Rollback Plan

If issues occur:

1. **Remove Cognito trigger** - Disable in Cognito console immediately
2. **CloudFormation rollback** - Stack will automatically rollback on failure
3. **Manual cleanup** - Delete Lambda and IAM role if needed

---

## References

- [PLG Email System Technical Specification V5](20260131_PLG_EMAIL_SYSTEM_TECHNICAL_SPECIFICATION_V5.md)
- [Infrastructure Gap Analysis](20260123_INFRASTRUCTURE_GAP_ANALYSIS_AND_PLAN.md)
- Lambda code: `plg-website/infrastructure/lambda/cognito-post-confirmation/index.js`
- Unit tests: `plg-website/infrastructure/lambda/cognito-post-confirmation/tests/`
