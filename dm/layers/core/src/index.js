// dm/layers/core/src/index.js
// Core layer: Consolidated AWS services for common HIC operations

// ============================================================================
// DYNAMODB - All exports from existing dynamodb layer
// ============================================================================

export {
  DynamoDBClient,
  PutItemCommand,
  UpdateItemCommand,
  QueryCommand as DDBQueryCommand,
  GetItemCommand,
  BatchWriteItemCommand,
  ScanCommand as DDBScanCommand,
  DeleteItemCommand,
} from "@aws-sdk/client-dynamodb";

export {
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
  QueryCommand,
  GetCommand,
  BatchWriteCommand,
  ScanCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";

export * from "@aws-sdk/util-dynamodb";
export * from "@aws-sdk/client-dynamodb-streams";

// ============================================================================
// MESSAGING - SNS and SQS from existing messaging layer
// ============================================================================

export {
  SNSClient,
  PublishCommand,
  SubscribeCommand,
  CreateTopicCommand,
  ListTopicsCommand,
  DeleteTopicCommand,
  SetTopicAttributesCommand,
  GetTopicAttributesCommand,
} from "@aws-sdk/client-sns";

export {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  GetQueueUrlCommand,
  GetQueueAttributesCommand,
  SetQueueAttributesCommand,
  CreateQueueCommand,
  DeleteQueueCommand,
  PurgeQueueCommand,
} from "@aws-sdk/client-sqs";

// ============================================================================
// METRICS - CloudWatch from existing metrics layer
// ============================================================================

export {
  CloudWatchClient,
  PutMetricDataCommand,
  GetMetricDataCommand,
  ListMetricsCommand,
  GetMetricStatisticsCommand,
} from "@aws-sdk/client-cloudwatch";
