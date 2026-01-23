/**
 * Facade Helpers Index
 * Public surface for mocks and HIC utilities.
 * Keep exports explicit to avoid duplicate/ambiguous re-exports.
 */

// Mock tooling (aws-sdk-client-mock)
export { mockClient } from "aws-sdk-client-mock";

// HIC utilities (no AWS deps)
export {
  safeLog,
  sanitizeForLog,
  safePath,
  safeJsonParse,
  tryJsonParse,
  HicLog,
} from "./__hic-base.js";

// Lambda
export { createLambdaMock, LambdaClient, InvokeCommand } from "./__lambda.js";

// DynamoDB (both low-level and DocumentClient)
export {
  createDynamoMock,
  DynamoDBClient,
  UpdateItemCommand,
  PutItemCommand,
  GetItemCommand,
  QueryCommand,
  ScanCommand,
  DeleteItemCommand,
  BatchWriteItemCommand,
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
  GetCommand,
  BatchWriteCommand,
  DeleteCommand,
  marshall,
  unmarshall,
} from "./dynamodb.js";

// ---- Bedrock
export {
  createBedrockMock,
  BedrockClient,
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
} from "./bedrock.js";

// ---- Step Functions
export {
  createSFNMock,
  SendTaskSuccessCommand,
  SendTaskFailureCommand,
} from "./sfn.js";

// Config layer = Secrets Manager + SSM
export {
  createSecretsMock,
  SecretsManagerClient,
  GetSecretValueCommand,
  PutSecretValueCommand,
  createSSMMock,
  SSMClient,
  PutParameterCommand,
} from "./config.js";

// Messaging layer = SNS + SQS
export {
  createSNSMock,
  SNSClient,
  PublishCommand,
  createSQSMock,
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  PurgeQueueCommand,
  GetQueueAttributesCommand,
  SetQueueAttributesCommand,
  GetQueueUrlCommand,
  SendMessageBatchCommand,
} from "./messaging.js";

// Storage layer = S3
export { createS3Mock, S3Client, PutObjectCommand } from "./storage.js";

// Metrics layer = CloudWatch
export {
  createMetricsMock,
  CloudWatchClient,
  PutMetricDataCommand,
  GetMetricDataCommand,
  DescribeAlarmsCommand,
  PutMetricAlarmCommand,
} from "./metrics.js";

// ============================================
// THIRD-PARTY SDK MOCKS (Stripe, Auth0, Keygen)
// ============================================

// Stripe (payment processing)
export {
  createStripeMock,
  createMockStripeEvent,
  createMockCheckoutSession,
  createMockSubscription,
  createMockCustomer,
} from "./stripe.js";

// Auth0 (authentication)
export {
  createAuth0Mock,
  createMockSession,
  createMockAuth0User,
  createMockIndividualUser,
  createMockEnterpriseUser,
  createMockOSSUser,
} from "./auth0.js";

// Keygen (license management)
export {
  createKeygenMock,
  createMockLicense,
  createMockLicenseResponse,
  createMockValidationResponse,
  createMockMachine,
  createMockMachineResponse,
  createMockCheckoutResponse,
  generateMockLicenseKey,
} from "./keygen.js";
