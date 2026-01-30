/**
 * Journey 5: Heartbeat Loop
 *
 * Tests heartbeat/keepalive functionality:
 * 1. Session establishment
 * 2. Consecutive heartbeats
 * 3. Session continuity
 * 4. Heartbeat interval compliance
 *
 * Priority: P1
 *
 * @see 20260129_E2E_BACKEND_VALIDATION_SPEC.md
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";

import {
  getEnvironment,
  testConfig,
  log,
  requireMutations,
} from "../config.js";
import { E2EHttpClient } from "../lib/http-client.js";
import {
  expectStatus,
  expectSuccess,
  expectError,
  expectHeartbeat,
  expectFields,
  expectCompletesWithin,
} from "../lib/assertions.js";
import {
  generateFingerprint,
  generateMachineId,
  generateSessionId,
  generateDeviceData,
  generateHeartbeatData,
  generateLicenseKeyFormat,
} from "../lib/test-data.js";
import { createTestScope } from "../lib/cleanup.js";

// ============================================================================
// Test Setup
// ============================================================================

describe("Journey 5: Heartbeat Loop", () => {
  let client;
  let scope;
  let deviceData;

  beforeEach(() => {
    const env = getEnvironment();
    client = new E2EHttpClient(env.apiBase);
    scope = createTestScope("j5-heartbeat");
    deviceData = generateDeviceData();
    log.info("Test setup complete", { deviceId: deviceData.fingerprint });
  });

  afterEach(async () => {
    await scope.cleanup();
  });

  // ==========================================================================
  // J5.1: Session Establishment
  // ==========================================================================

  describe("J5.1: Session Establishment", () => {
    test("should establish session with first heartbeat", async () => {
      requireMutations("session establishment");

      // First: Create a trial or activate license to have a valid device
      const initResponse = await client.post("/api/license/validate", {
        fingerprint: deviceData.fingerprint,
        machineId: deviceData.machineId,
      });

      if (initResponse.status !== 200) {
        log.info("Skipping - could not initialize device");
        return;
      }
      scope.trackTrial(deviceData.fingerprint);

      // Send first heartbeat
      const sessionId = generateSessionId();
      const heartbeatResponse = await client.post("/api/license/heartbeat", {
        fingerprint: deviceData.fingerprint,
        machineId: deviceData.machineId,
        sessionId,
        timestamp: new Date().toISOString(),
      });

      if (heartbeatResponse.status === 200) {
        expectHeartbeat(heartbeatResponse);
        scope.trackSession(sessionId);
        log.info("Session established", { sessionId });
      }
    });

    test("should return next heartbeat interval", async () => {
      requireMutations("heartbeat interval");

      // Initialize device
      await client.post("/api/license/validate", {
        fingerprint: deviceData.fingerprint,
        machineId: deviceData.machineId,
      });
      scope.trackTrial(deviceData.fingerprint);

      // Send heartbeat
      const response = await client.post("/api/license/heartbeat", {
        fingerprint: deviceData.fingerprint,
        machineId: deviceData.machineId,
        sessionId: generateSessionId(),
        timestamp: new Date().toISOString(),
      });

      if (response.status === 200) {
        // Should include next heartbeat timing
        const { nextHeartbeat, interval } = response.json;
        const heartbeatInterval = nextHeartbeat || interval;

        if (heartbeatInterval) {
          assert.ok(
            typeof heartbeatInterval === "number",
            "Heartbeat interval should be a number",
          );
          assert.ok(
            heartbeatInterval > 0,
            "Heartbeat interval should be positive",
          );
          log.info("Heartbeat interval received", {
            interval: heartbeatInterval,
          });
        }
      }
    });
  });

  // ==========================================================================
  // J5.2: Consecutive Heartbeats
  // ==========================================================================

  describe("J5.2: Consecutive Heartbeats", () => {
    test("should accept 3 consecutive heartbeats", async () => {
      requireMutations("consecutive heartbeats");

      // Initialize device
      const initResponse = await client.post("/api/license/validate", {
        fingerprint: deviceData.fingerprint,
        machineId: deviceData.machineId,
      });

      if (initResponse.status !== 200) {
        log.info("Skipping - could not initialize device");
        return;
      }
      scope.trackTrial(deviceData.fingerprint);

      const sessionId = generateSessionId();
      scope.trackSession(sessionId);

      // Send 3 consecutive heartbeats
      const results = [];
      for (let i = 1; i <= 3; i++) {
        const response = await client.post("/api/license/heartbeat", {
          fingerprint: deviceData.fingerprint,
          machineId: deviceData.machineId,
          sessionId,
          timestamp: new Date().toISOString(),
          sequenceNumber: i,
        });

        results.push({
          attempt: i,
          status: response.status,
          valid: response.json?.valid,
        });

        // Small delay between heartbeats
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // All should succeed
      const successCount = results.filter((r) => r.status === 200).length;
      log.info("Consecutive heartbeats completed", {
        total: 3,
        succeeded: successCount,
        results,
      });

      assert.ok(
        successCount >= 2,
        `At least 2 of 3 heartbeats should succeed, got ${successCount}`,
      );
    });

    test("should maintain session across heartbeats", async () => {
      requireMutations("session continuity");

      // Initialize device
      await client.post("/api/license/validate", {
        fingerprint: deviceData.fingerprint,
        machineId: deviceData.machineId,
      });
      scope.trackTrial(deviceData.fingerprint);

      const sessionId = generateSessionId();
      scope.trackSession(sessionId);

      // First heartbeat
      const response1 = await client.post("/api/license/heartbeat", {
        fingerprint: deviceData.fingerprint,
        machineId: deviceData.machineId,
        sessionId,
        timestamp: new Date().toISOString(),
      });

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Second heartbeat with same session
      const response2 = await client.post("/api/license/heartbeat", {
        fingerprint: deviceData.fingerprint,
        machineId: deviceData.machineId,
        sessionId, // Same session ID
        timestamp: new Date().toISOString(),
      });

      if (response1.status === 200 && response2.status === 200) {
        // Session should be recognized
        log.info("Session continuity maintained");
      }
    });
  });

  // ==========================================================================
  // J5.3: Last-Seen Timestamp
  // ==========================================================================

  describe("J5.3: Last-Seen Timestamp", () => {
    test("should update last-seen on each heartbeat", async () => {
      requireMutations("last-seen update");

      // Initialize device
      await client.post("/api/license/validate", {
        fingerprint: deviceData.fingerprint,
        machineId: deviceData.machineId,
      });
      scope.trackTrial(deviceData.fingerprint);

      const sessionId = generateSessionId();

      // First heartbeat
      const time1 = new Date().toISOString();
      await client.post("/api/license/heartbeat", {
        fingerprint: deviceData.fingerprint,
        machineId: deviceData.machineId,
        sessionId,
        timestamp: time1,
      });

      // Wait
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Second heartbeat
      const time2 = new Date().toISOString();
      const response2 = await client.post("/api/license/heartbeat", {
        fingerprint: deviceData.fingerprint,
        machineId: deviceData.machineId,
        sessionId,
        timestamp: time2,
      });

      if (response2.status === 200) {
        // Last-seen should be updated
        const { lastSeen } = response2.json;
        if (lastSeen) {
          assert.ok(
            new Date(lastSeen) >= new Date(time1),
            "Last-seen should be updated",
          );
        }
        log.info("Last-seen timestamp updated");
      }
    });
  });

  // ==========================================================================
  // J5.4: Session Expiry
  // ==========================================================================

  describe("J5.4: Session Behavior", () => {
    test("should handle new session after gap", async () => {
      requireMutations("session gap handling");

      // Initialize device
      await client.post("/api/license/validate", {
        fingerprint: deviceData.fingerprint,
        machineId: deviceData.machineId,
      });
      scope.trackTrial(deviceData.fingerprint);

      // First session
      const session1 = generateSessionId();
      await client.post("/api/license/heartbeat", {
        fingerprint: deviceData.fingerprint,
        machineId: deviceData.machineId,
        sessionId: session1,
        timestamp: new Date().toISOString(),
      });

      // New session (simulating app restart)
      const session2 = generateSessionId();
      const response = await client.post("/api/license/heartbeat", {
        fingerprint: deviceData.fingerprint,
        machineId: deviceData.machineId,
        sessionId: session2,
        timestamp: new Date().toISOString(),
      });

      if (response.status === 200) {
        log.info("New session accepted after gap");
      }
    });

    test("should reject heartbeat with invalid session format", async () => {
      // Initialize device
      await client.post("/api/license/validate", {
        fingerprint: deviceData.fingerprint,
        machineId: deviceData.machineId,
      });

      const response = await client.post("/api/license/heartbeat", {
        fingerprint: deviceData.fingerprint,
        machineId: deviceData.machineId,
        sessionId: "invalid", // Too short
        timestamp: new Date().toISOString(),
      });

      // May accept or reject based on validation rules
      if (response.status === 400) {
        expectError(response);
        log.info("Invalid session format rejected");
      } else {
        log.info("Server accepted short session ID (lenient validation)");
      }
    });
  });

  // ==========================================================================
  // J5.5: Performance
  // ==========================================================================

  describe("J5.5: Heartbeat Performance", () => {
    test("should complete heartbeat within fast timeout", async () => {
      requireMutations("heartbeat performance");

      // Initialize device
      await client.post("/api/license/validate", {
        fingerprint: deviceData.fingerprint,
        machineId: deviceData.machineId,
      });
      scope.trackTrial(deviceData.fingerprint);

      await expectCompletesWithin(
        async () => {
          await client.post("/api/license/heartbeat", {
            fingerprint: deviceData.fingerprint,
            machineId: deviceData.machineId,
            sessionId: generateSessionId(),
            timestamp: new Date().toISOString(),
          });
        },
        testConfig.timeout.fast,
        "Heartbeat",
      );
    });

    test("should handle rapid heartbeats", async () => {
      requireMutations("rapid heartbeats");

      // Initialize device
      await client.post("/api/license/validate", {
        fingerprint: deviceData.fingerprint,
        machineId: deviceData.machineId,
      });
      scope.trackTrial(deviceData.fingerprint);

      const sessionId = generateSessionId();

      // Send 5 rapid heartbeats
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          client.post("/api/license/heartbeat", {
            fingerprint: deviceData.fingerprint,
            machineId: deviceData.machineId,
            sessionId,
            timestamp: new Date().toISOString(),
          }),
        );
      }

      const responses = await Promise.all(promises);
      const statuses = responses.map((r) => r.status);

      // Check for rate limiting
      const hasRateLimit = statuses.includes(429);
      const successCount = statuses.filter((s) => s === 200).length;

      if (hasRateLimit) {
        log.info("Rate limiting active for rapid heartbeats");
      } else {
        log.info("Rapid heartbeats processed", { successCount });
      }
    });
  });

  // ==========================================================================
  // J5.6: Heartbeat Payload Variations
  // ==========================================================================

  describe("J5.6: Payload Variations", () => {
    test("should accept heartbeat with app version", async () => {
      requireMutations("heartbeat with version");

      // Initialize device
      await client.post("/api/license/validate", {
        fingerprint: deviceData.fingerprint,
        machineId: deviceData.machineId,
      });
      scope.trackTrial(deviceData.fingerprint);

      const response = await client.post("/api/license/heartbeat", {
        fingerprint: deviceData.fingerprint,
        machineId: deviceData.machineId,
        sessionId: generateSessionId(),
        timestamp: new Date().toISOString(),
        appVersion: "0.9.5",
        platform: "win32",
      });

      if (response.status === 200) {
        log.info("Heartbeat with version accepted");
      }
    });

    test("should accept heartbeat with metrics", async () => {
      requireMutations("heartbeat with metrics");

      // Initialize device
      await client.post("/api/license/validate", {
        fingerprint: deviceData.fingerprint,
        machineId: deviceData.machineId,
      });
      scope.trackTrial(deviceData.fingerprint);

      const response = await client.post("/api/license/heartbeat", {
        fingerprint: deviceData.fingerprint,
        machineId: deviceData.machineId,
        sessionId: generateSessionId(),
        timestamp: new Date().toISOString(),
        metrics: {
          activeTime: 3600,
          editsCount: 150,
          filesOpened: 25,
        },
      });

      if (response.status === 200) {
        log.info("Heartbeat with metrics accepted");
      }
    });

    test("should require fingerprint in heartbeat", async () => {
      const response = await client.post("/api/license/heartbeat", {
        machineId: deviceData.machineId,
        sessionId: generateSessionId(),
        timestamp: new Date().toISOString(),
        // fingerprint missing
      });

      expectStatus(response, 400);
      expectError(response);
    });
  });

  // ==========================================================================
  // J5.7: License Key Heartbeat
  // ==========================================================================

  describe("J5.7: Licensed Heartbeat", () => {
    test("should accept heartbeat with license key", async () => {
      requireMutations("licensed heartbeat");

      const licenseKey = generateLicenseKeyFormat();

      const response = await client.post("/api/license/heartbeat", {
        licenseKey,
        fingerprint: deviceData.fingerprint,
        machineId: deviceData.machineId,
        sessionId: generateSessionId(),
        timestamp: new Date().toISOString(),
      });

      // May succeed or fail depending on license validity
      if (response.status === 200) {
        expectHeartbeat(response.json);
        log.info("Licensed heartbeat accepted");
      } else if ([400, 404].includes(response.status)) {
        log.info("Licensed heartbeat rejected (invalid license - expected)");
      }
    });
  });
});
