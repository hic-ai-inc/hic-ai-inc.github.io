// dm/layers/llm-essentials/src/index.js
// LLM Essentials layer: Consolidated AWS services for LLM operations

// ============================================================================
// BEDROCK - From existing bedrock layer
// ============================================================================

export {
  BedrockClient,
  ListFoundationModelsCommand,
  GetFoundationModelCommand,
  CreateModelCustomizationJobCommand,
  GetModelCustomizationJobCommand,
} from "@aws-sdk/client-bedrock";

export {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
  ConverseCommand,
  ConverseStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";

// ============================================================================
// CONFIG - SSM and Secrets Manager from existing config layer
// ============================================================================

export {
  SSMClient,
  GetParameterCommand,
  GetParametersCommand,
  PutParameterCommand,
  DeleteParameterCommand,
  GetParametersByPathCommand,
} from "@aws-sdk/client-ssm";

export {
  SecretsManagerClient,
  GetSecretValueCommand,
  CreateSecretCommand,
  UpdateSecretCommand,
  DeleteSecretCommand,
  ListSecretsCommand,
} from "@aws-sdk/client-secrets-manager";

// ============================================================================
// S3 - From existing storage layer
// ============================================================================

export {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  CopyObjectCommand,
  CreateBucketCommand,
  DeleteBucketCommand,
  GetBucketPolicyCommand,
  PutBucketPolicyCommand,
} from "@aws-sdk/client-s3";

export { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// ============================================================================
// STEP FUNCTIONS - From existing sfn layer
// ============================================================================

export {
  SFNClient,
  StartExecutionCommand,
  DescribeExecutionCommand,
  StopExecutionCommand,
  ListExecutionsCommand,
  GetExecutionHistoryCommand,
  DescribeStateMachineCommand,
  SendTaskSuccessCommand,
  SendTaskFailureCommand,
} from "@aws-sdk/client-sfn";
