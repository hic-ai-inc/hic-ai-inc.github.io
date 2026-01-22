// dm/layers/dynamodb/src/index.js
// Exports AWS SDKs for DynamoDB to Lambda layer

// Export DynamoDB client and low-level commands
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

// Export DocumentClient and high-level commands (preferred)
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

// Export utilities and streams
export * from "@aws-sdk/util-dynamodb";
export * from "@aws-sdk/client-dynamodb-streams";