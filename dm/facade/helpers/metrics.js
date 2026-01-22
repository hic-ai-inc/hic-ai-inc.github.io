/**
 * Metrics Facade - Clean API for CloudWatch mocking
 *
 * Provides simple methods for mocking CloudWatch operations including
 * metric data publishing and alarm management.
 */

import { mockClient } from "aws-sdk-client-mock";
import {
  CloudWatchClient,
  PutMetricDataCommand,
  GetMetricDataCommand,
  DescribeAlarmsCommand,
  PutMetricAlarmCommand,
} from "@aws-sdk/client-cloudwatch";
import { registerMock } from "../utils/registry.js";

function createMetricsMock() {
  const cwMock = mockClient(CloudWatchClient);

  const api = {
    whenPutMetricData({ namespace, metricData }) {
      if (!namespace || typeof namespace !== "string") {
        throw new Error("namespace must be a non-empty string");
      }
      if (!Array.isArray(metricData)) {
        throw new Error("metricData must be an array");
      }

      cwMock
        .on(PutMetricDataCommand, (cmd) => cmd.Namespace === namespace)
        .resolves({});
    },

    whenGetMetricData(result = { MetricDataResults: [] }) {
      cwMock.on(GetMetricDataCommand).resolves(result);
    },

    whenDescribeAlarms(result = { MetricAlarms: [] }) {
      cwMock.on(DescribeAlarmsCommand).resolves(result);
    },

    whenPutMetricAlarm({ alarmName }) {
      if (!alarmName || typeof alarmName !== "string") {
        throw new Error("alarmName must be a non-empty string");
      }

      cwMock
        .on(PutMetricAlarmCommand, (cmd) => cmd.AlarmName === alarmName)
        .resolves({});
    },

    reset() {
      cwMock.reset();
    },

    raw: cwMock,
  };

  registerMock(api);
  return api;
}

// Re-export AWS SDK clients for compatibility with metrics Lambda layer
export * from "@aws-sdk/client-cloudwatch";

export { createMetricsMock };
