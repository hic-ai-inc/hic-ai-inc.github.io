# HIC PLG Infrastructure

CloudFormation templates and deployment scripts for the PLG website backend infrastructure.

## Directory Structure

```
infrastructure/
├── cloudformation/
│   ├── plg-main-stack.yaml      # Root stack (orchestrates nested stacks)
│   ├── plg-dynamodb.yaml        # DynamoDB table + GSIs + stream
│   ├── plg-messaging.yaml       # SNS topics + SQS queues
│   ├── plg-iam.yaml             # IAM roles for Amplify + Lambdas
│   ├── plg-compute.yaml         # Lambda functions (4)
│   ├── plg-ses.yaml             # SES email identity + config
│   ├── plg-scheduled.yaml       # EventBridge scheduled rules
│   └── plg-monitoring.yaml      # CloudWatch logs, metrics, alarms, dashboard
├── parameters/
│   ├── dev.json                 # Development environment params
│   ├── staging.json             # Staging environment params
│   └── prod.json                # Production environment params
├── deploy.sh                    # Deployment script with dry-run support
└── README.md                    # This file
```

## Quick Start

### Prerequisites

1. AWS CLI configured with appropriate credentials
2. Bash shell (Git Bash on Windows)

### Deploy to Development

```bash
# Preview changes (dry-run)
./deploy.sh dev --dry-run

# Deploy
./deploy.sh dev
```

### Deploy to Production

```bash
# Preview changes (ALWAYS do this first)
./deploy.sh prod --dry-run

# Deploy (requires confirmation)
./deploy.sh prod
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Amplify (Next.js)                           │
│                    API Routes + Frontend                        │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                     DynamoDB                                     │
│              (Single Table + 3 GSIs + Stream)                   │
└─────────────────────┬───────────────────────────────────────────┘
                      │ DynamoDB Stream
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│               Stream Processor Lambda                           │
│          (Classifies events, publishes to SNS)                  │
└─────────────────────┬───────────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
   ┌─────────┐  ┌─────────┐  ┌─────────┐
   │ Payment │  │Customer │  │ License │
   │  Topic  │  │  Topic  │  │  Topic  │
   └────┬────┘  └────┬────┘  └────┬────┘
        │            │            │
        └────────────┼────────────┘
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
   ┌─────────┐              ┌─────────┐
   │  Email  │              │Customer │
   │  Queue  │              │ Update  │
   └────┬────┘              │  Queue  │
        │                   └────┬────┘
        ▼                        ▼
   ┌─────────┐              ┌─────────┐
   │  Email  │              │Customer │
   │ Sender  │              │ Update  │
   │ Lambda  │              │ Lambda  │
   └────┬────┘              └────┬────┘
        │                        │
        ▼                        ▼
      AWS SES                DynamoDB
                            + Keygen API
```

## Resource Inventory

| Category       | Resource               | Purpose                          |
| -------------- | ---------------------- | -------------------------------- |
| **Database**   | PLGTable               | Single-table for all entities    |
|                | GSI1, GSI2, GSI3       | Stripe, License, Auth0 lookups   |
| **Messaging**  | 3 SNS Topics           | Event fan-out                    |
|                | 2 SQS Queues           | Async processing                 |
|                | 2 DLQ Queues           | Failure handling                 |
| **Compute**    | StreamProcessor Lambda | Event classification             |
|                | EmailSender Lambda     | Email delivery                   |
|                | CustomerUpdate Lambda  | State updates                    |
|                | ScheduledTasks Lambda  | Cron jobs                        |
| **Email**      | SES Identity           | Verified domain                  |
|                | SES Config Set         | Delivery tracking                |
| **Scheduled**  | 3 EventBridge Rules    | Trial reminders, win-back emails |
| **Monitoring** | CloudWatch Dashboard   | Business metrics                 |
|                | CloudWatch Alarms      | Error alerting                   |
|                | Metric Filters         | Extract metrics from logs        |

**Total: ~28 resources**

## Estimated Costs

| Environment | Monthly Cost |
| ----------- | ------------ |
| Development | $0-5         |
| Staging     | $0-5         |
| Production  | $5-20        |

All covered by AWS credits at MVP scale.

## Post-Deployment Steps

### 1. SES Domain Verification

After deployment, add DNS records in GoDaddy:

1. Go to AWS SES Console → Identities
2. Find your domain identity
3. Copy the DKIM CNAME records (3 records)
4. Add SPF record: `v=spf1 include:amazonses.com ~all`
5. Wait for verification (up to 72 hours)

### 2. Configure Amplify

1. Create Amplify app in AWS Console
2. Connect to GitHub repository
3. Set build settings:
   - App root: `plg-website`
   - Build command: `npm run build`
4. Add environment variables from `.env.example`
5. Set IAM role to `AmplifyExecutionRoleArn` from stack outputs

### 3. Set Up Secrets Manager

Create secrets in AWS Secrets Manager:

```
/plg/{env}/stripe/secret-key
/plg/{env}/stripe/webhook-secret
/plg/{env}/keygen/product-token
/plg/{env}/keygen/webhook-secret
/plg/{env}/auth0/client-secret
```

## Troubleshooting

### Stack Creation Fails

1. Check CloudFormation events in AWS Console
2. Verify all parameters are set correctly
3. Ensure IAM permissions are sufficient

### Template Validation Fails

```bash
# Validate a specific template
aws cloudformation validate-template \
  --template-body file://cloudformation/plg-dynamodb.yaml
```

### View Stack Events

```bash
aws cloudformation describe-stack-events \
  --stack-name hic-plg-dev \
  --query 'StackEvents[?ResourceStatus==`CREATE_FAILED`]'
```

## Development

### Adding New Resources

1. Create or modify template in `cloudformation/`
2. Update `plg-main-stack.yaml` to include as nested stack
3. Add any new parameters to `parameters/*.json`
4. Test with `./deploy.sh dev --dry-run`

### Template Syntax Reference

- [CloudFormation Template Reference](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/template-reference.html)
- [Intrinsic Function Reference](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference.html)

## Related Documentation

- [20260123_INFRASTRUCTURE_GAP_ANALYSIS_AND_PLAN.md](../../docs/plg/20260123_INFRASTRUCTURE_GAP_ANALYSIS_AND_PLAN.md)
- [20260121_GC_EVENT_DRIVEN_INFRASTRUCTURE_RECOMMENDATION.md](../../docs/plg/20260121_GC_EVENT_DRIVEN_INFRASTRUCTURE_RECOMMENDATION.md)
- [20260122_GC_PLG_TECHNICAL_SPECIFICATION_v2.md](../../docs/plg/20260122_GC_PLG_TECHNICAL_SPECIFICATION_v2.md)
