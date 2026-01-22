# MEMORANDUM

**TO:** Simon Reiff, President & Technical Founder  
**FROM:** GC  
**DATE:** January 21, 2026  
**RE:** Event-Driven Infrastructure Recommendation for PLG Backend

---

## Executive Summary

This memo recommends the AWS infrastructure required to implement the PLG backend using event-driven architecture. The design follows the pattern:

```
API Event → DynamoDB Write → DynamoDB Stream → Lambda → SNS → SQS Consumers
```

**Key Infrastructure Components:**

| Component         | Count | Purpose                             |
| ----------------- | ----- | ----------------------------------- |
| DynamoDB Tables   | 1     | Single-table design (existing)      |
| DynamoDB Streams  | 1     | Change data capture                 |
| Lambda Functions  | 8     | Event processing + webhooks         |
| SNS Topics        | 5     | Event fan-out by domain             |
| SQS Queues        | 10    | Consumer queues (5 primary + 5 DLQ) |
| EventBridge Rules | 3     | Scheduled tasks                     |

**Estimated Monthly Cost:** $15-50/month at MVP scale (covered by AWS credits)

---

## 1. Architecture Overview

### 1.1 High-Level Event Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              EVENT SOURCES                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │   Amplify    │  │    Stripe    │  │  Keygen.sh   │  │    Auth0     │        │
│  │  API Routes  │  │   Webhooks   │  │   Webhooks   │  │   Webhooks   │        │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘        │
│         │                 │                 │                 │                │
│         └────────────┬────┴────────┬────────┴────────┬────────┘                │
│                      │             │                 │                         │
│                      ▼             ▼                 ▼                         │
│              ┌─────────────────────────────────────────────┐                   │
│              │           DynamoDB (Single Table)          │                   │
│              │                                             │                   │
│              │  CUSTOMER | SUBSCRIPTION | LICENSE | MACHINE│                   │
│              │  INVOICE  | EVENT        | PROMO            │                   │
│              └────────────────────┬────────────────────────┘                   │
│                                   │                                            │
│                                   │ DynamoDB Streams                           │
│                                   │ (NEW_AND_OLD_IMAGES)                       │
│                                   ▼                                            │
└───────────────────────────────────┬─────────────────────────────────────────────┘
                                    │
┌───────────────────────────────────┼─────────────────────────────────────────────┐
│                                   ▼                                             │
│              ┌─────────────────────────────────────────────┐                   │
│              │     Lambda: StreamProcessor                 │                   │
│              │                                             │                   │
│              │  • Reads DynamoDB Stream records            │                   │
│              │  • Classifies events by entity type         │                   │
│              │  • Publishes to appropriate SNS topic       │                   │
│              └────────────────────┬────────────────────────┘                   │
│                                   │                                            │
│                   ┌───────────────┼───────────────┐                            │
│                   │               │               │                            │
│                   ▼               ▼               ▼                            │
│  ┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐         │
│  │  SNS: Customer     │ │  SNS: License      │ │  SNS: Payment      │         │
│  │       Events       │ │       Events       │ │       Events       │         │
│  └─────────┬──────────┘ └─────────┬──────────┘ └─────────┬──────────┘         │
│            │                      │                      │                     │
│            │    ┌─────────────────┼──────────────────────┘                     │
│            │    │                 │                                            │
│            ▼    ▼                 ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                         SQS CONSUMER QUEUES                              │  │
│  │                                                                          │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │  │
│  │  │   Email     │  │  Analytics  │  │   Audit     │  │  Webhook    │     │  │
│  │  │   Queue     │  │   Queue     │  │   Queue     │  │   Retry     │     │  │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │  │
│  │         │                │                │                │            │  │
│  │         ▼                ▼                ▼                ▼            │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │  │
│  │  │ Email DLQ   │  │Analytics DLQ│  │  Audit DLQ  │  │ Webhook DLQ │     │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘     │  │
│  │                                                                          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                │
│            EVENT PROCESSING LAYER                                              │
└────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                         CONSUMER LAMBDAS                                       │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐    │
│  │  Lambda: EmailSender │  │ Lambda: Analytics   │  │  Lambda: AuditLog   │    │
│  │                      │  │                     │  │                     │    │
│  │  • Welcome emails    │  │  • Update metrics   │  │  • Write to audit   │    │
│  │  • License delivery  │  │  • Track conversions│  │    table            │    │
│  │  • Payment receipts  │  │  • Usage analytics  │  │  • Compliance trail │    │
│  │  • Trial reminders   │  │                     │  │                     │    │
│  └──────────┬───────────┘  └──────────┬──────────┘  └──────────┬──────────┘    │
│             │                         │                        │               │
│             ▼                         ▼                        ▼               │
│        ┌─────────┐             ┌─────────────┐           ┌──────────┐          │
│        │   SES   │             │ CloudWatch  │           │ DynamoDB │          │
│        │         │             │  Metrics    │           │ (Audit)  │          │
│        └─────────┘             └─────────────┘           └──────────┘          │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Event Classification

Events are classified by the entity type in the DynamoDB record's sort key:

| SK Prefix  | Entity             | SNS Topic                 |
| ---------- | ------------------ | ------------------------- |
| `PROFILE`  | Customer profile   | `plg-customer-events`     |
| `SUB#`     | Subscription       | `plg-subscription-events` |
| `LICENSE#` | License            | `plg-license-events`      |
| `MACHINE#` | Machine activation | `plg-license-events`      |
| `INV#`     | Invoice            | `plg-payment-events`      |
| `EVENT#`   | Audit event        | `plg-audit-events`        |

---

## 2. DynamoDB Configuration

### 2.1 Enable DynamoDB Streams

```yaml
# CloudFormation snippet
HicPlgTable:
  Type: AWS::DynamoDB::Table
  Properties:
    TableName: hic-plg-production
    BillingMode: PAY_PER_REQUEST

    # Enable Streams with full before/after images
    StreamSpecification:
      StreamViewType: NEW_AND_OLD_IMAGES

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
      - AttributeName: GSI3PK
        AttributeType: S
      - AttributeName: GSI3SK
        AttributeType: S

    KeySchema:
      - AttributeName: PK
        KeyType: HASH
      - AttributeName: SK
        KeyType: RANGE

    GlobalSecondaryIndexes:
      # GSI1: Stripe Customer lookup
      - IndexName: GSI1
        KeySchema:
          - AttributeName: GSI1PK
            KeyType: HASH
          - AttributeName: GSI1SK
            KeyType: RANGE
        Projection:
          ProjectionType: ALL

      # GSI2: License/Keygen lookup
      - IndexName: GSI2
        KeySchema:
          - AttributeName: GSI2PK
            KeyType: HASH
          - AttributeName: GSI2SK
            KeyType: RANGE
        Projection:
          ProjectionType: ALL

      # GSI3: Auth0 user lookup
      - IndexName: GSI3
        KeySchema:
          - AttributeName: GSI3PK
            KeyType: HASH
          - AttributeName: GSI3SK
            KeyType: RANGE
        Projection:
          ProjectionType: ALL

    Tags:
      - Key: Environment
        Value: production
      - Key: Project
        Value: plg
```

### 2.2 Stream Record Format

When a record is written/updated, the stream delivers:

```javascript
{
  "eventID": "1234567890",
  "eventName": "INSERT" | "MODIFY" | "REMOVE",
  "eventSource": "aws:dynamodb",
  "eventVersion": "1.1",
  "dynamodb": {
    "Keys": {
      "PK": { "S": "CUST#simon@example.com" },
      "SK": { "S": "PROFILE" }
    },
    "NewImage": {
      "PK": { "S": "CUST#simon@example.com" },
      "SK": { "S": "PROFILE" },
      "email": { "S": "simon@example.com" },
      "status": { "S": "TRIAL" },
      "createdAt": { "S": "2026-01-21T12:00:00Z" }
      // ... full record
    },
    "OldImage": {
      // Previous state (for MODIFY/REMOVE)
    },
    "StreamViewType": "NEW_AND_OLD_IMAGES"
  }
}
```

---

## 3. SNS Topics

### 3.1 Topic Definitions

```yaml
# CloudFormation
PlgCustomerEventsTopic:
  Type: AWS::SNS::Topic
  Properties:
    TopicName: plg-customer-events
    Tags:
      - Key: Domain
        Value: customer

PlgSubscriptionEventsTopic:
  Type: AWS::SNS::Topic
  Properties:
    TopicName: plg-subscription-events
    Tags:
      - Key: Domain
        Value: subscription

PlgLicenseEventsTopic:
  Type: AWS::SNS::Topic
  Properties:
    TopicName: plg-license-events
    Tags:
      - Key: Domain
        Value: license

PlgPaymentEventsTopic:
  Type: AWS::SNS::Topic
  Properties:
    TopicName: plg-payment-events
    Tags:
      - Key: Domain
        Value: payment

PlgAuditEventsTopic:
  Type: AWS::SNS::Topic
  Properties:
    TopicName: plg-audit-events
    Tags:
      - Key: Domain
        Value: audit
```

### 3.2 Event Message Format

Standardized envelope for all events:

```javascript
{
  "version": "1.0",
  "id": "evt_abc123",                    // Unique event ID
  "source": "plg.dynamodb.stream",       // Event source
  "type": "customer.created",            // Event type
  "time": "2026-01-21T12:00:00.000Z",    // ISO timestamp
  "dataVersion": "1.0",                  // Schema version
  "data": {
    "entityType": "CUSTOMER",
    "entityId": "simon@example.com",
    "operation": "INSERT",               // INSERT | MODIFY | REMOVE
    "newState": { /* full record */ },
    "oldState": { /* previous record or null */ },
    "changedFields": ["status", "trialEndsAt"],  // For MODIFY
    "metadata": {
      "correlationId": "req_xyz789",     // Request trace ID
      "actor": "stripe-webhook",         // Who triggered
      "ip": "192.168.1.1"               // Optional
    }
  }
}
```

### 3.3 Event Types by Topic

**plg-customer-events:**

- `customer.created` — New customer record
- `customer.updated` — Profile changed
- `customer.status_changed` — Status transition (PENDING → TRIAL → ACTIVE, etc.)
- `customer.account_linked` — Auth0 account connected

**plg-subscription-events:**

- `subscription.created` — New subscription
- `subscription.updated` — Plan/seats changed
- `subscription.renewed` — Successful renewal
- `subscription.cancelled` — Cancellation
- `subscription.expired` — Subscription ended

**plg-license-events:**

- `license.created` — License key generated
- `license.activated` — First activation
- `license.validated` — Phone-home check
- `license.suspended` — Payment failed
- `license.revoked` — Manual revocation
- `machine.activated` — Device added
- `machine.deactivated` — Device removed
- `machine.heartbeat` — Phone-home ping

**plg-payment-events:**

- `payment.succeeded` — Successful charge
- `payment.failed` — Failed charge
- `payment.refunded` — Refund processed
- `invoice.created` — New invoice
- `invoice.paid` — Invoice settled
- `invoice.past_due` — Overdue invoice

**plg-audit-events:**

- `audit.login` — User login
- `audit.logout` — User logout
- `audit.password_reset` — Password changed
- `audit.license_copied` — License key viewed
- `audit.device_removed` — Device deactivated

---

## 4. SQS Queues

### 4.1 Queue Definitions

```yaml
# CloudFormation

# ============================================
# EMAIL QUEUE
# ============================================
PlgEmailQueue:
  Type: AWS::SQS::Queue
  Properties:
    QueueName: plg-email-queue
    VisibilityTimeoutSeconds: 60
    MessageRetentionPeriod: 1209600 # 14 days
    RedrivePolicy:
      deadLetterTargetArn: !GetAtt PlgEmailDLQ.Arn
      maxReceiveCount: 3

PlgEmailDLQ:
  Type: AWS::SQS::Queue
  Properties:
    QueueName: plg-email-dlq
    MessageRetentionPeriod: 1209600

# ============================================
# ANALYTICS QUEUE
# ============================================
PlgAnalyticsQueue:
  Type: AWS::SQS::Queue
  Properties:
    QueueName: plg-analytics-queue
    VisibilityTimeoutSeconds: 30
    RedrivePolicy:
      deadLetterTargetArn: !GetAtt PlgAnalyticsDLQ.Arn
      maxReceiveCount: 3

PlgAnalyticsDLQ:
  Type: AWS::SQS::Queue
  Properties:
    QueueName: plg-analytics-dlq
    MessageRetentionPeriod: 1209600

# ============================================
# AUDIT QUEUE
# ============================================
PlgAuditQueue:
  Type: AWS::SQS::Queue
  Properties:
    QueueName: plg-audit-queue
    VisibilityTimeoutSeconds: 30
    RedrivePolicy:
      deadLetterTargetArn: !GetAtt PlgAuditDLQ.Arn
      maxReceiveCount: 3

PlgAuditDLQ:
  Type: AWS::SQS::Queue
  Properties:
    QueueName: plg-audit-dlq
    MessageRetentionPeriod: 1209600

# ============================================
# WEBHOOK RETRY QUEUE
# ============================================
PlgWebhookRetryQueue:
  Type: AWS::SQS::Queue
  Properties:
    QueueName: plg-webhook-retry-queue
    VisibilityTimeoutSeconds: 120
    DelaySeconds: 60 # Retry after 1 minute
    RedrivePolicy:
      deadLetterTargetArn: !GetAtt PlgWebhookRetryDLQ.Arn
      maxReceiveCount: 5

PlgWebhookRetryDLQ:
  Type: AWS::SQS::Queue
  Properties:
    QueueName: plg-webhook-retry-dlq
    MessageRetentionPeriod: 1209600

# ============================================
# LICENSE VALIDATION QUEUE (High-throughput)
# ============================================
PlgLicenseValidationQueue:
  Type: AWS::SQS::Queue
  Properties:
    QueueName: plg-license-validation-queue
    VisibilityTimeoutSeconds: 15
    RedrivePolicy:
      deadLetterTargetArn: !GetAtt PlgLicenseValidationDLQ.Arn
      maxReceiveCount: 2

PlgLicenseValidationDLQ:
  Type: AWS::SQS::Queue
  Properties:
    QueueName: plg-license-validation-dlq
    MessageRetentionPeriod: 604800 # 7 days
```

### 4.2 SNS → SQS Subscriptions

```yaml
# Subscribe queues to SNS topics with filters

# Email queue subscribes to multiple topics
EmailQueueCustomerSubscription:
  Type: AWS::SNS::Subscription
  Properties:
    TopicArn: !Ref PlgCustomerEventsTopic
    Protocol: sqs
    Endpoint: !GetAtt PlgEmailQueue.Arn
    FilterPolicy:
      type:
        - customer.created
        - customer.status_changed

EmailQueueLicenseSubscription:
  Type: AWS::SNS::Subscription
  Properties:
    TopicArn: !Ref PlgLicenseEventsTopic
    Protocol: sqs
    Endpoint: !GetAtt PlgEmailQueue.Arn
    FilterPolicy:
      type:
        - license.created
        - license.suspended

EmailQueuePaymentSubscription:
  Type: AWS::SNS::Subscription
  Properties:
    TopicArn: !Ref PlgPaymentEventsTopic
    Protocol: sqs
    Endpoint: !GetAtt PlgEmailQueue.Arn
    FilterPolicy:
      type:
        - payment.succeeded
        - payment.failed
        - invoice.past_due

# Analytics queue - subscribes to ALL events
AnalyticsQueueCustomerSubscription:
  Type: AWS::SNS::Subscription
  Properties:
    TopicArn: !Ref PlgCustomerEventsTopic
    Protocol: sqs
    Endpoint: !GetAtt PlgAnalyticsQueue.Arn
    # No filter - receives all customer events

AnalyticsQueueLicenseSubscription:
  Type: AWS::SNS::Subscription
  Properties:
    TopicArn: !Ref PlgLicenseEventsTopic
    Protocol: sqs
    Endpoint: !GetAtt PlgAnalyticsQueue.Arn

AnalyticsQueuePaymentSubscription:
  Type: AWS::SNS::Subscription
  Properties:
    TopicArn: !Ref PlgPaymentEventsTopic
    Protocol: sqs
    Endpoint: !GetAtt PlgAnalyticsQueue.Arn

# Audit queue - subscribes to audit topic
AuditQueueSubscription:
  Type: AWS::SNS::Subscription
  Properties:
    TopicArn: !Ref PlgAuditEventsTopic
    Protocol: sqs
    Endpoint: !GetAtt PlgAuditQueue.Arn
```

### 4.3 Queue Purposes

| Queue                            | Triggers                                          | Consumer Action                                |
| -------------------------------- | ------------------------------------------------- | ---------------------------------------------- |
| **plg-email-queue**              | customer.created, license.created, payment.failed | Send transactional emails via SES              |
| **plg-analytics-queue**          | All events                                        | Update CloudWatch metrics, conversion tracking |
| **plg-audit-queue**              | audit.\* events                                   | Write to audit log table                       |
| **plg-webhook-retry-queue**      | Failed outbound webhooks                          | Retry with exponential backoff                 |
| **plg-license-validation-queue** | High-volume phone-home                            | Async validation processing                    |

---

## 5. Lambda Functions

### 5.1 Stream Processor Lambda

The core Lambda that reads DynamoDB Streams and publishes to SNS:

```javascript
// lambda/stream-processor/index.js

const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");
const { unmarshall } = require("@aws-sdk/util-dynamodb");

const sns = new SNSClient({ region: process.env.AWS_REGION });

// Topic ARN mapping
const TOPIC_MAP = {
  PROFILE: process.env.SNS_CUSTOMER_TOPIC,
  SUB: process.env.SNS_SUBSCRIPTION_TOPIC,
  LICENSE: process.env.SNS_LICENSE_TOPIC,
  MACHINE: process.env.SNS_LICENSE_TOPIC, // Machines → License topic
  INV: process.env.SNS_PAYMENT_TOPIC,
  EVENT: process.env.SNS_AUDIT_TOPIC,
};

// Event type mapping based on SK prefix and operation
function getEventType(skPrefix, operation, newImage, oldImage) {
  const base = skPrefix.toLowerCase();

  if (operation === "INSERT") {
    return `${base}.created`;
  }

  if (operation === "REMOVE") {
    return `${base}.deleted`;
  }

  // MODIFY - detect specific changes
  if (skPrefix === "PROFILE") {
    if (newImage?.status !== oldImage?.status) {
      return "customer.status_changed";
    }
    if (newImage?.auth0UserId && !oldImage?.auth0UserId) {
      return "customer.account_linked";
    }
    return "customer.updated";
  }

  if (skPrefix === "SUB") {
    if (newImage?.status === "cancelled") return "subscription.cancelled";
    if (newImage?.status === "active" && oldImage?.status === "trialing") {
      return "subscription.renewed";
    }
    return "subscription.updated";
  }

  if (skPrefix === "LICENSE") {
    if (newImage?.status === "suspended") return "license.suspended";
    if (newImage?.status === "revoked") return "license.revoked";
    if (newImage?.activatedAt && !oldImage?.activatedAt)
      return "license.activated";
    return "license.updated";
  }

  if (skPrefix === "MACHINE") {
    if (newImage?.lastHeartbeat !== oldImage?.lastHeartbeat) {
      return "machine.heartbeat";
    }
    return "machine.updated";
  }

  if (skPrefix === "INV") {
    if (newImage?.status === "paid" && oldImage?.status !== "paid") {
      return "invoice.paid";
    }
    return "invoice.updated";
  }

  return `${base}.updated`;
}

// Get changed fields for MODIFY operations
function getChangedFields(newImage, oldImage) {
  if (!oldImage) return [];

  const changed = [];
  for (const key of Object.keys(newImage)) {
    if (JSON.stringify(newImage[key]) !== JSON.stringify(oldImage?.[key])) {
      changed.push(key);
    }
  }
  return changed;
}

// Extract SK prefix (e.g., "SUB#sub_xxx" → "SUB")
function getSkPrefix(sk) {
  if (sk === "PROFILE") return "PROFILE";
  const match = sk.match(/^([A-Z]+)#/);
  return match ? match[1] : "UNKNOWN";
}

exports.handler = async (event) => {
  const results = { processed: 0, errors: 0 };

  for (const record of event.Records) {
    try {
      const { eventName, dynamodb } = record;

      // Unmarshall DynamoDB record format to plain JS objects
      const newImage = dynamodb.NewImage ? unmarshall(dynamodb.NewImage) : null;
      const oldImage = dynamodb.OldImage ? unmarshall(dynamodb.OldImage) : null;

      const pk = newImage?.PK || oldImage?.PK;
      const sk = newImage?.SK || oldImage?.SK;
      const skPrefix = getSkPrefix(sk);

      // Determine target SNS topic
      const topicArn = TOPIC_MAP[skPrefix];
      if (!topicArn) {
        console.warn(`No topic mapping for SK prefix: ${skPrefix}`);
        continue;
      }

      // Build event type
      const eventType = getEventType(skPrefix, eventName, newImage, oldImage);

      // Build standardized event envelope
      const eventMessage = {
        version: "1.0",
        id: `evt_${record.eventID}`,
        source: "plg.dynamodb.stream",
        type: eventType,
        time: new Date().toISOString(),
        dataVersion: "1.0",
        data: {
          entityType: skPrefix,
          entityId: pk?.replace(/^CUST#/, ""),
          operation: eventName,
          newState: newImage,
          oldState: oldImage,
          changedFields:
            eventName === "MODIFY" ? getChangedFields(newImage, oldImage) : [],
          metadata: {
            streamEventId: record.eventID,
            approximateCreationDateTime: dynamodb.ApproximateCreationDateTime,
          },
        },
      };

      // Publish to SNS
      await sns.send(
        new PublishCommand({
          TopicArn: topicArn,
          Message: JSON.stringify(eventMessage),
          MessageAttributes: {
            type: {
              DataType: "String",
              StringValue: eventType,
            },
            entityType: {
              DataType: "String",
              StringValue: skPrefix,
            },
          },
        }),
      );

      results.processed++;
      console.log(`Published ${eventType} to ${topicArn}`);
    } catch (error) {
      console.error("Error processing record:", error);
      results.errors++;
      // Don't throw - continue processing other records
    }
  }

  console.log(`Processed: ${results.processed}, Errors: ${results.errors}`);
  return results;
};
```

### 5.2 Lambda Configuration

```yaml
# CloudFormation

StreamProcessorFunction:
  Type: AWS::Lambda::Function
  Properties:
    FunctionName: plg-stream-processor
    Runtime: nodejs20.x
    Handler: index.handler
    MemorySize: 256
    Timeout: 60
    ReservedConcurrentExecutions: 10 # Limit concurrency
    Environment:
      Variables:
        SNS_CUSTOMER_TOPIC: !Ref PlgCustomerEventsTopic
        SNS_SUBSCRIPTION_TOPIC: !Ref PlgSubscriptionEventsTopic
        SNS_LICENSE_TOPIC: !Ref PlgLicenseEventsTopic
        SNS_PAYMENT_TOPIC: !Ref PlgPaymentEventsTopic
        SNS_AUDIT_TOPIC: !Ref PlgAuditEventsTopic
    Code:
      S3Bucket: !Ref DeploymentBucket
      S3Key: lambda/stream-processor.zip

# DynamoDB Stream → Lambda trigger
StreamProcessorEventSourceMapping:
  Type: AWS::Lambda::EventSourceMapping
  Properties:
    EventSourceArn: !GetAtt HicPlgTable.StreamArn
    FunctionName: !Ref StreamProcessorFunction
    StartingPosition: TRIM_HORIZON
    BatchSize: 100
    MaximumBatchingWindowInSeconds: 5
    BisectBatchOnFunctionError: true
    MaximumRetryAttempts: 3
    DestinationConfig:
      OnFailure:
        Destination: !GetAtt StreamProcessorDLQ.Arn

StreamProcessorDLQ:
  Type: AWS::SQS::Queue
  Properties:
    QueueName: plg-stream-processor-dlq
    MessageRetentionPeriod: 1209600
```

### 5.3 Consumer Lambda Functions

```yaml
# Email Sender Lambda
EmailSenderFunction:
  Type: AWS::Lambda::Function
  Properties:
    FunctionName: plg-email-sender
    Runtime: nodejs20.x
    Handler: index.handler
    MemorySize: 256
    Timeout: 30
    Environment:
      Variables:
        SES_FROM_EMAIL: noreply@hic-ai.com
        WEBSITE_URL: https://hic-ai.com

EmailSenderEventSourceMapping:
  Type: AWS::Lambda::EventSourceMapping
  Properties:
    EventSourceArn: !GetAtt PlgEmailQueue.Arn
    FunctionName: !Ref EmailSenderFunction
    BatchSize: 10

# Analytics Processor Lambda
AnalyticsProcessorFunction:
  Type: AWS::Lambda::Function
  Properties:
    FunctionName: plg-analytics-processor
    Runtime: nodejs20.x
    Handler: index.handler
    MemorySize: 128
    Timeout: 15

AnalyticsEventSourceMapping:
  Type: AWS::Lambda::EventSourceMapping
  Properties:
    EventSourceArn: !GetAtt PlgAnalyticsQueue.Arn
    FunctionName: !Ref AnalyticsProcessorFunction
    BatchSize: 50

# Audit Logger Lambda
AuditLoggerFunction:
  Type: AWS::Lambda::Function
  Properties:
    FunctionName: plg-audit-logger
    Runtime: nodejs20.x
    Handler: index.handler
    MemorySize: 128
    Timeout: 15

AuditLoggerEventSourceMapping:
  Type: AWS::Lambda::EventSourceMapping
  Properties:
    EventSourceArn: !GetAtt PlgAuditQueue.Arn
    FunctionName: !Ref AuditLoggerFunction
    BatchSize: 25
```

### 5.4 Complete Lambda Inventory

| Lambda                    | Trigger                | Purpose                    | Memory | Timeout |
| ------------------------- | ---------------------- | -------------------------- | ------ | ------- |
| `plg-stream-processor`    | DynamoDB Stream        | Route events to SNS topics | 256 MB | 60s     |
| `plg-email-sender`        | SQS (email queue)      | Send emails via SES        | 256 MB | 30s     |
| `plg-analytics-processor` | SQS (analytics queue)  | Update CloudWatch metrics  | 128 MB | 15s     |
| `plg-audit-logger`        | SQS (audit queue)      | Write audit records        | 128 MB | 15s     |
| `plg-stripe-webhook`      | API Gateway            | Handle Stripe webhooks     | 256 MB | 30s     |
| `plg-keygen-webhook`      | API Gateway            | Handle Keygen webhooks     | 256 MB | 30s     |
| `plg-license-validator`   | SQS (validation queue) | Async license validation   | 128 MB | 15s     |
| `plg-scheduled-tasks`     | EventBridge            | Trial reminders, cleanup   | 256 MB | 300s    |

---

## 6. API Gateway for Webhooks

Stripe and Keygen webhooks need public HTTPS endpoints:

```yaml
PlgWebhookApi:
  Type: AWS::ApiGatewayV2::Api
  Properties:
    Name: plg-webhook-api
    ProtocolType: HTTP
    CorsConfiguration:
      AllowOrigins:
        - "*" # Webhooks don't need CORS, but doesn't hurt

# Stripe webhook route
StripeWebhookRoute:
  Type: AWS::ApiGatewayV2::Route
  Properties:
    ApiId: !Ref PlgWebhookApi
    RouteKey: POST /webhooks/stripe
    Target: !Sub integrations/${StripeWebhookIntegration}

StripeWebhookIntegration:
  Type: AWS::ApiGatewayV2::Integration
  Properties:
    ApiId: !Ref PlgWebhookApi
    IntegrationType: AWS_PROXY
    IntegrationUri: !GetAtt StripeWebhookFunction.Arn
    PayloadFormatVersion: "2.0"

# Keygen webhook route
KeygenWebhookRoute:
  Type: AWS::ApiGatewayV2::Route
  Properties:
    ApiId: !Ref PlgWebhookApi
    RouteKey: POST /webhooks/keygen
    Target: !Sub integrations/${KeygenWebhookIntegration}

KeygenWebhookIntegration:
  Type: AWS::ApiGatewayV2::Integration
  Properties:
    ApiId: !Ref PlgWebhookApi
    IntegrationType: AWS_PROXY
    IntegrationUri: !GetAtt KeygenWebhookFunction.Arn
    PayloadFormatVersion: "2.0"

# Stage
PlgWebhookApiStage:
  Type: AWS::ApiGatewayV2::Stage
  Properties:
    ApiId: !Ref PlgWebhookApi
    StageName: prod
    AutoDeploy: true
```

**Webhook URLs:**

- Stripe: `https://{api-id}.execute-api.{region}.amazonaws.com/prod/webhooks/stripe`
- Keygen: `https://{api-id}.execute-api.{region}.amazonaws.com/prod/webhooks/keygen`

---

## 7. EventBridge Scheduled Rules

For tasks that run on a schedule (not triggered by events):

```yaml
# Trial expiration reminder (daily at 9 AM UTC)
TrialReminderRule:
  Type: AWS::Events::Rule
  Properties:
    Name: plg-trial-reminder
    Description: Send trial expiration reminders
    ScheduleExpression: cron(0 9 * * ? *)
    State: ENABLED
    Targets:
      - Id: TrialReminderTarget
        Arn: !GetAtt ScheduledTasksFunction.Arn
        Input: '{"task": "trial_reminder"}'

# Subscription renewal check (daily at 6 AM UTC)
RenewalCheckRule:
  Type: AWS::Events::Rule
  Properties:
    Name: plg-renewal-check
    Description: Check for upcoming renewals
    ScheduleExpression: cron(0 6 * * ? *)
    State: ENABLED
    Targets:
      - Id: RenewalCheckTarget
        Arn: !GetAtt ScheduledTasksFunction.Arn
        Input: '{"task": "renewal_check"}'

# Stale machine cleanup (weekly on Sunday at 2 AM UTC)
MachineCleanupRule:
  Type: AWS::Events::Rule
  Properties:
    Name: plg-machine-cleanup
    Description: Clean up stale machine activations
    ScheduleExpression: cron(0 2 ? * SUN *)
    State: ENABLED
    Targets:
      - Id: MachineCleanupTarget
        Arn: !GetAtt ScheduledTasksFunction.Arn
        Input: '{"task": "machine_cleanup"}'
```

---

## 8. IAM Roles & Permissions

### 8.1 Stream Processor Role

```yaml
StreamProcessorRole:
  Type: AWS::IAM::Role
  Properties:
    RoleName: plg-stream-processor-role
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
      - PolicyName: StreamProcessorPolicy
        PolicyDocument:
          Version: "2012-10-17"
          Statement:
            # Read from DynamoDB Stream
            - Effect: Allow
              Action:
                - dynamodb:GetRecords
                - dynamodb:GetShardIterator
                - dynamodb:DescribeStream
                - dynamodb:ListStreams
              Resource: !GetAtt HicPlgTable.StreamArn

            # Publish to SNS topics
            - Effect: Allow
              Action:
                - sns:Publish
              Resource:
                - !Ref PlgCustomerEventsTopic
                - !Ref PlgSubscriptionEventsTopic
                - !Ref PlgLicenseEventsTopic
                - !Ref PlgPaymentEventsTopic
                - !Ref PlgAuditEventsTopic

            # Write to DLQ on failure
            - Effect: Allow
              Action:
                - sqs:SendMessage
              Resource: !GetAtt StreamProcessorDLQ.Arn
```

### 8.2 Email Sender Role

```yaml
EmailSenderRole:
  Type: AWS::IAM::Role
  Properties:
    RoleName: plg-email-sender-role
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
      - PolicyName: EmailSenderPolicy
        PolicyDocument:
          Version: "2012-10-17"
          Statement:
            # Read from SQS queue
            - Effect: Allow
              Action:
                - sqs:ReceiveMessage
                - sqs:DeleteMessage
                - sqs:GetQueueAttributes
              Resource: !GetAtt PlgEmailQueue.Arn

            # Send emails via SES
            - Effect: Allow
              Action:
                - ses:SendEmail
                - ses:SendTemplatedEmail
              Resource: "*"
              Condition:
                StringEquals:
                  ses:FromAddress: noreply@hic-ai.com

            # Read customer data for email personalization
            - Effect: Allow
              Action:
                - dynamodb:GetItem
                - dynamodb:Query
              Resource:
                - !GetAtt HicPlgTable.Arn
                - !Sub ${HicPlgTable.Arn}/index/*
```

---

## 9. CloudWatch Alarms & Monitoring

```yaml
# Stream processor errors
StreamProcessorErrorAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: plg-stream-processor-errors
    AlarmDescription: Stream processor Lambda errors
    MetricName: Errors
    Namespace: AWS/Lambda
    Dimensions:
      - Name: FunctionName
        Value: !Ref StreamProcessorFunction
    Statistic: Sum
    Period: 300
    EvaluationPeriods: 1
    Threshold: 5
    ComparisonOperator: GreaterThanThreshold
    AlarmActions:
      - !Ref OpsAlertTopic

# DLQ messages (something failed repeatedly)
DLQMessageAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: plg-dlq-messages
    AlarmDescription: Messages in dead letter queues
    MetricName: ApproximateNumberOfMessagesVisible
    Namespace: AWS/SQS
    Dimensions:
      - Name: QueueName
        Value: plg-email-dlq
    Statistic: Sum
    Period: 300
    EvaluationPeriods: 1
    Threshold: 1
    ComparisonOperator: GreaterThanThreshold
    AlarmActions:
      - !Ref OpsAlertTopic

# Stream processor iterator age (falling behind)
StreamIteratorAgeAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: plg-stream-iterator-age
    AlarmDescription: Stream processor falling behind
    MetricName: IteratorAge
    Namespace: AWS/Lambda
    Dimensions:
      - Name: FunctionName
        Value: !Ref StreamProcessorFunction
    Statistic: Maximum
    Period: 300
    EvaluationPeriods: 2
    Threshold: 60000 # 1 minute behind
    ComparisonOperator: GreaterThanThreshold
    AlarmActions:
      - !Ref OpsAlertTopic

# Custom metrics dashboard
PlgDashboard:
  Type: AWS::CloudWatch::Dashboard
  Properties:
    DashboardName: plg-events
    DashboardBody: |
      {
        "widgets": [
          {
            "type": "metric",
            "properties": {
              "title": "Events Processed",
              "metrics": [
                ["AWS/Lambda", "Invocations", "FunctionName", "plg-stream-processor"]
              ],
              "period": 60
            }
          },
          {
            "type": "metric",
            "properties": {
              "title": "Email Queue Depth",
              "metrics": [
                ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", "plg-email-queue"]
              ],
              "period": 60
            }
          },
          {
            "type": "metric",
            "properties": {
              "title": "DLQ Messages",
              "metrics": [
                ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", "plg-email-dlq"],
                ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", "plg-analytics-dlq"]
              ],
              "period": 60
            }
          }
        ]
      }
```

---

## 10. Complete Resource Inventory

### 10.1 Infrastructure Summary

| Category             | Resource               | Name                           |
| -------------------- | ---------------------- | ------------------------------ |
| **Database**         | DynamoDB Table         | `hic-plg-production`           |
|                      | DynamoDB Stream        | (attached to table)            |
| **SNS Topics**       | Customer Events        | `plg-customer-events`          |
|                      | Subscription Events    | `plg-subscription-events`      |
|                      | License Events         | `plg-license-events`           |
|                      | Payment Events         | `plg-payment-events`           |
|                      | Audit Events           | `plg-audit-events`             |
| **SQS Queues**       | Email Queue            | `plg-email-queue`              |
|                      | Email DLQ              | `plg-email-dlq`                |
|                      | Analytics Queue        | `plg-analytics-queue`          |
|                      | Analytics DLQ          | `plg-analytics-dlq`            |
|                      | Audit Queue            | `plg-audit-queue`              |
|                      | Audit DLQ              | `plg-audit-dlq`                |
|                      | Webhook Retry          | `plg-webhook-retry-queue`      |
|                      | Webhook Retry DLQ      | `plg-webhook-retry-dlq`        |
|                      | License Validation     | `plg-license-validation-queue` |
|                      | License Validation DLQ | `plg-license-validation-dlq`   |
|                      | Stream Processor DLQ   | `plg-stream-processor-dlq`     |
| **Lambda Functions** | Stream Processor       | `plg-stream-processor`         |
|                      | Email Sender           | `plg-email-sender`             |
|                      | Analytics Processor    | `plg-analytics-processor`      |
|                      | Audit Logger           | `plg-audit-logger`             |
|                      | Stripe Webhook         | `plg-stripe-webhook`           |
|                      | Keygen Webhook         | `plg-keygen-webhook`           |
|                      | License Validator      | `plg-license-validator`        |
|                      | Scheduled Tasks        | `plg-scheduled-tasks`          |
| **API Gateway**      | Webhook API            | `plg-webhook-api`              |
| **EventBridge**      | Trial Reminder         | `plg-trial-reminder`           |
|                      | Renewal Check          | `plg-renewal-check`            |
|                      | Machine Cleanup        | `plg-machine-cleanup`          |

### 10.2 Estimated Monthly Cost

| Service          | Usage Estimate      | Cost        |
| ---------------- | ------------------- | ----------- |
| DynamoDB         | 100K requests/day   | ~$3/mo      |
| DynamoDB Streams | Included with table | $0          |
| Lambda           | 500K invocations/mo | ~$2/mo      |
| SNS              | 100K messages/mo    | ~$0.50/mo   |
| SQS              | 500K messages/mo    | ~$0.50/mo   |
| API Gateway      | 100K requests/mo    | ~$1/mo      |
| CloudWatch       | Logs + metrics      | ~$5/mo      |
| **Total**        |                     | **~$12/mo** |

**Note:** AWS Activate credits ($1,000) will cover ~80+ months at this scale.

---

## 11. Deployment Strategy

### 11.1 CloudFormation Stack Structure

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
├── lambda/
│   ├── stream-processor/
│   ├── email-sender/
│   ├── analytics-processor/
│   ├── audit-logger/
│   ├── stripe-webhook/
│   ├── keygen-webhook/
│   ├── license-validator/
│   └── scheduled-tasks/
└── scripts/
    ├── deploy.sh
    └── package-lambdas.sh
```

### 11.2 Deployment Order

```bash
# 1. Package Lambda functions
./scripts/package-lambdas.sh

# 2. Deploy infrastructure (dependencies handled by CloudFormation)
aws cloudformation deploy \
  --template-file templates/main.yaml \
  --stack-name plg-infrastructure \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    Environment=production \
    AlertEmail=simon@hic.ai

# 3. Configure Stripe webhook URL
stripe webhooks create \
  --url "https://{api-id}.execute-api.{region}.amazonaws.com/prod/webhooks/stripe" \
  --events checkout.session.completed,customer.subscription.updated,...

# 4. Configure Keygen webhook URL
# (via Keygen dashboard)
```

---

## 12. Event Flow Examples

### 12.1 New Customer Purchase

```
1. User completes Stripe Checkout
   └─→ Stripe fires checkout.session.completed webhook

2. plg-stripe-webhook Lambda receives webhook
   └─→ Writes CUSTOMER record to DynamoDB
   └─→ Writes SUBSCRIPTION record to DynamoDB
   └─→ Calls Keygen to create license
   └─→ Writes LICENSE record to DynamoDB

3. DynamoDB Stream captures 3 writes
   └─→ Stream Processor Lambda invoked (3 records)

4. Stream Processor publishes events:
   └─→ customer.created → plg-customer-events
   └─→ subscription.created → plg-subscription-events
   └─→ license.created → plg-license-events

5. SNS delivers to subscribed queues:
   └─→ plg-email-queue (customer.created, license.created)
   └─→ plg-analytics-queue (all 3 events)

6. Consumer Lambdas process:
   └─→ Email Sender: Sends welcome email with license key
   └─→ Analytics: Increments new_customer metric
```

### 12.2 License Validation (Phone Home)

```
1. Mouse extension sends validation request
   └─→ POST /api/license/validate

2. Amplify API route validates license
   └─→ Queries DynamoDB for license + customer
   └─→ Checks status, expiration, machine count
   └─→ Updates lastValidated timestamp

3. If async processing needed:
   └─→ Sends to plg-license-validation-queue
   └─→ Returns immediate 200 OK to extension

4. DynamoDB Stream captures update
   └─→ Stream Processor: license.validated event
   └─→ Analytics queue: Track validation metric
```

### 12.3 Payment Failure

```
1. Stripe renewal charge fails
   └─→ Stripe fires invoice.payment_failed webhook

2. plg-stripe-webhook Lambda:
   └─→ Updates CUSTOMER status to PAST_DUE
   └─→ Updates SUBSCRIPTION status to past_due

3. DynamoDB Stream → Stream Processor:
   └─→ customer.status_changed → plg-customer-events
   └─→ payment.failed → plg-payment-events

4. SNS → SQS → Lambdas:
   └─→ Email Sender: "Update your payment method" email
   └─→ Analytics: Track payment_failed metric

5. If still unpaid after 14 days (scheduled task):
   └─→ Updates LICENSE status to suspended
   └─→ license.suspended event triggers suspension email
```

---

## 13. Architectural Rationale

### 13.1 Why DynamoDB Streams Are Non-Negotiable

For payment processing, the architecture MUST follow:

```
API → DynamoDB (single atomic write) → Stream → Lambda → SNS → downstream
```

**NOT:**

```
API → DynamoDB + SNS (two separate operations)
```

**The "direct publish" anti-pattern has unacceptable failure modes:**

| Failure Scenario | Consequence |
|-----------------|-------------|
| DDB succeeds, SNS fails | Customer charged, no welcome email, no license delivered |
| SNS succeeds, DDB fails | Email sent, no record of payment, audit trail broken |
| Partial DDB write | Inconsistent state between CUSTOMER and SUBSCRIPTION records |

**With DynamoDB Streams, it's all-or-nothing:**

| Scenario | Outcome |
|----------|---------|
| DDB write fails | Clean failure, nothing happens, API returns error |
| DDB write succeeds | Stream GUARANTEED to fire, Lambda retries automatically, SNS eventually succeeds |

**Key guarantees:**
- **Single source of truth** — DynamoDB IS the event log
- **Atomic operations** — No split-brain between DB and messaging
- **Guaranteed delivery** — Streams retry for 24 hours
- **Audit trail replay** — Can reprocess any historical event
- **Idempotency** — Stream records have unique eventID for deduplication

### 13.2 Cross-Region Replication (DynamoDB Global Tables)

For disaster recovery and reduced latency, enable Global Tables:

```yaml
HicPlgTable:
  Type: AWS::DynamoDB::GlobalTable
  Properties:
    TableName: hic-plg-production
    BillingMode: PAY_PER_REQUEST
    
    # Enable streams (required for global tables)
    StreamSpecification:
      StreamViewType: NEW_AND_OLD_IMAGES
    
    AttributeDefinitions:
      - AttributeName: PK
        AttributeType: S
      - AttributeName: SK
        AttributeType: S
      # ... (GSI attributes)
    
    KeySchema:
      - AttributeName: PK
        KeyType: HASH
      - AttributeName: SK
        KeyType: RANGE
    
    # Multi-region replication
    Replicas:
      - Region: us-east-1
        PointInTimeRecoverySpecification:
          PointInTimeRecoveryEnabled: true
        Tags:
          - Key: Environment
            Value: production
      - Region: us-west-2
        PointInTimeRecoverySpecification:
          PointInTimeRecoveryEnabled: true
        Tags:
          - Key: Environment
            Value: production-replica
```

**Benefits:**
- **RPO near zero** — Asynchronous replication typically < 1 second
- **Automatic failover** — Route 53 health checks can redirect traffic
- **Read scaling** — Serve reads from nearest region
- **Compliance** — Data residency in multiple regions

**Cost impact:** ~2x DynamoDB costs (still minimal at MVP scale)

### 13.3 Post-Launch Enhancements

1. **X-Ray tracing** — Distributed tracing across Lambda chain
2. **EventBridge migration** — If filtering needs become complex, EventBridge offers:
   - Content-based filtering (filter on any field in event body)
   - Schema registry (event schema discovery)
   - Archive/replay (replay historical events)
   - Cross-account delivery

### 13.4 Infrastructure Phasing

**Week 1:** Core infrastructure
- DynamoDB Global Table with streams
- Stream processor Lambda
- Single SNS topic (plg-events)
- Email queue + DLQ
- Stripe webhook handler

**Week 2:** Full event routing
- Split into 5 domain-specific SNS topics
- Add analytics and audit queues
- Keygen webhook handler
- Scheduled tasks (EventBridge rules)

**Post-launch:** Monitoring and optimization
- CloudWatch alarms and dashboard
- X-Ray tracing
- Performance tuning

---

## 14. Summary

The recommended infrastructure provides:

| Capability           | Implementation                        |
| -------------------- | ------------------------------------- |
| **Event capture**    | DynamoDB Streams (NEW_AND_OLD_IMAGES) |
| **Event routing**    | Lambda → SNS (5 domain topics)        |
| **Async processing** | SQS queues with DLQs                  |
| **Email delivery**   | SQS → Lambda → SES                    |
| **Analytics**        | SQS → Lambda → CloudWatch Metrics     |
| **Audit trail**      | SQS → Lambda → DynamoDB (audit table) |
| **Webhook handling** | API Gateway → Lambda                  |
| **Scheduled tasks**  | EventBridge Rules → Lambda            |
| **Monitoring**       | CloudWatch Alarms + Dashboard         |

**Total resources:** 1 table, 5 SNS topics, 11 SQS queues, 8 Lambda functions, 1 API Gateway, 3 EventBridge rules

**Monthly cost:** ~$12-15 at MVP scale (covered by AWS credits for years)

---

**Next Steps:**

1. Review and approve infrastructure design
2. Create CloudFormation templates
3. Deploy to development environment
4. Configure Stripe + Keygen webhook URLs
5. Test end-to-end event flow

---

_This memorandum is for internal planning purposes._
