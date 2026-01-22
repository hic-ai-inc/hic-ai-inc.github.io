// dm/layers/metrics/src/index.js
// Exports AWS SDKs for CloudWatch Metrics to Lambda layer
export {
  CloudWatchClient,
  PutMetricDataCommand,
  GetMetricDataCommand,
  DescribeAlarmsCommand,
  PutMetricAlarmCommand,
} from "@aws-sdk/client-cloudwatch";
