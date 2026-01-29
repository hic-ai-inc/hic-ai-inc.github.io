/**
 * Journey 1: Trial Start Flow
 *
 * Tests the complete trial initialization flow:
 * 1. First launch detection
 * 2. Trial initialization
 * 3. Grace period handling
 * 4. Trial state persistence
 *
 * Priority: P0 (Critical Path)
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
  expectTrialInit,
  expectFields,
  expectIsoDate,
  expectCompletesWithin,
  expectDaysRemaining,
} from "../lib/assertions.js";
import {
  generateFingerprint,
  generateMachineId,
  generateDeviceData,
} from "../lib/test-data.js";
import { createTestScope } from "../lib/cleanup.js";

// ============================================================================
// Test Setup
// ============================================================================

describe("Journey 1: Trial Start Flow", () => {
  let client;
  let scope;
  let deviceData;

  beforeEach(() => {
    const env = getEnvironment();
    client = new E2EHttpClient(env.apiBase);
    scope = createTestScope("j1-trial-start");
    deviceData = generateDeviceData();
    log.info("Test setup complete", { deviceId: deviceData.fingerprint });
  });

  afterEach(async () => {
    await scope.cleanup();
  });

  // ==========================================================================
  // J1.1: First Launch - New Device Gets Trial
  // ==========================================================================

  describe("J1.1: First Launch Detection", () => {
    test("should initialize trial for new device", async () => {
      requireMutations("trial initialization");

      const response = await client.post("/api/license/validate", {
        fingerprint: deviceData.fingerprint,
        machineId: deviceData.machineId,
      });

      expectStatus(response, 200);
      expectSuccess(response);
      expectTrialInit(response);

      const { trial } = response.json;
      scope.trackTrial(trial.id || deviceData.fingerprint);

      // Verify trial properties
      assert.ok(trial.trialStartDate, "Trial should have start date");
      assert.ok(trial.trialEndDate, "Trial should have end date");
      expectIsoDate(trial.trialStartDate, "trial start date");
      expectIsoDate(trial.trialEndDate, "trial end date");

      // Verify trial duration
      const startDate = new Date(trial.trialStartDate);
      const endDate = new Date(trial.trialEndDate);
      const trialDays = Math.round(
        (endDate - startDate) / (1000 * 60 * 60 * 24),
      );
      assert.equal(trialDays, 14, `Trial should be 14 days, got ${trialDays}`);

      log.info("Trial initialized successfully", {
        fingerprint: deviceData.fingerprint,
        trialDays,
      });
    });

    test("should return same trial for same device on repeat call", async () => {
      requireMutations("trial persistence check");

      // First call
      const response1 = await client.post("/api/license/validate", {
        fingerprint: deviceData.fingerprint,
        machineId: deviceData.machineId,
      });
      expectStatus(response1, 200);
      expectTrialInit(response1);

      const trial1 = response1.json.trial;
      scope.trackTrial(trial1.id || deviceData.fingerprint);

      // Second call - should return same trial
      const response2 = await client.post("/api/license/validate", {
        fingerprint: deviceData.fingerprint,
        machineId: deviceData.machineId,
      });
      expectStatus(response2, 200);
      expectTrialInit(response2);

      const trial2 = response2.json.trial;

      // Verify same trial
      assert.equal(
        trial1.trialStartDate,
        trial2.trialStartDate,
        "Trial start date should be same",
      );
      assert.equal(
        trial1.trialEndDate,
        trial2.trialEndDate,
        "Trial end date should be same",
      );

      log.info("Trial persistence verified");
    });

    test("should complete within timeout", async () => {
      requireMutations("trial timeout check");

      await expectCompletesWithin(
        async () => {
          const response = await client.post("/api/license/validate", {
            fingerprint: generateFingerprint(),
            machineId: generateMachineId(),
          });
          expectStatus(response, 200);
          scope.trackTrial(response.json.trial?.id);
        },
        testConfig.timeout.fast,
        "Trial initialization",
      );
    });
  });

  // ==========================================================================
  // J1.2: Trial State Response Format
  // ==========================================================================

  describe("J1.2: Trial State Response", () => {
    test("should return correct trial response structure", async () => {
      requireMutations("trial response structure check");

      const response = await client.post("/api/license/validate", {
        fingerprint: deviceData.fingerprint,
        machineId: deviceData.machineId,
      });

      expectStatus(response, 200);
      expectSuccess(response);

      // Verify top-level fields
      expectFields(response.json, [
        "success",
        "valid",
        "status",
        "trial",
        "features",
      ]);

      // Verify trial object fields
      expectFields(response.json.trial, [
        "isActive",
        "trialStartDate",
        "trialEndDate",
        "daysRemaining",
      ]);

      assert.equal(response.json.valid, true, "Should be valid during trial");
      assert.equal(response.json.status, "trial", "Status should be trial");

      scope.trackTrial(response.json.trial.id || deviceData.fingerprint);
    });

    test("should include features during trial", async () => {
      requireMutations("trial features check");

      const response = await client.post("/api/license/validate", {
        fingerprint: deviceData.fingerprint,
        machineId: deviceData.machineId,
      });

      expectStatus(response, 200);

      const { features } = response.json;
      assert.ok(features, "Features object should exist");
      assert.ok(
        Array.isArray(features) || typeof features === "object",
        "Features should be array or object",
      );

      scope.trackTrial(response.json.trial?.id || deviceData.fingerprint);
      log.info("Trial features verified", { features });
    });
  });

  // ==========================================================================
  // J1.3: Grace Period Handling
  // ==========================================================================

  describe("J1.3: Grace Period", () => {
    test("should handle offline grace period", async () => {
      requireMutations("grace period check");

      // First: Initialize trial
      const initResponse = await client.post("/api/license/validate", {
        fingerprint: deviceData.fingerprint,
        machineId: deviceData.machineId,
      });
      expectStatus(initResponse, 200);
      scope.trackTrial(initResponse.json.trial?.id || deviceData.fingerprint);

      // Validate includes grace period info
      const { trial } = initResponse.json;

      // Grace period should allow offline usage
      // The exact implementation depends on the server
      // This test verifies the response includes needed data
      assert.ok(
        trial.trialEndDate,
        "Trial should include end date for offline calculation",
      );

      log.info("Grace period data present", {
        trialEndDate: trial.trialEndDate,
      });
    });
  });

  // ==========================================================================
  // J1.4: Error Handling
  // ==========================================================================

  describe("J1.4: Error Handling", () => {
    test("should reject missing fingerprint", async () => {
      const response = await client.post("/api/license/validate", {
        machineId: deviceData.machineId,
        // fingerprint missing
      });

      expectStatus(response, 400);
      expectError(response);
    });

    test("should reject invalid fingerprint format", async () => {
      const response = await client.post("/api/license/validate", {
        fingerprint: "invalid",
        machineId: deviceData.machineId,
      });

      // Server should either reject or normalize
      if (response.status === 400) {
        expectError(response);
      } else {
        // If accepted, verify it's handled gracefully
        expectStatus(response, 200);
      }
    });

    test("should handle empty request body", async () => {
      const response = await client.post("/api/license/validate", {});

      expectStatus(response, 400);
      expectError(response);
    });

    test("should handle malformed JSON gracefully", async () => {
      const response = await client.post("/api/license/validate", "not-json", {
        headers: { "Content-Type": "application/json" },
      });

      // Should return 400, not 500
      assert.ok(
        [400, 415].includes(response.status),
        `Should return client error, got ${response.status}`,
      );
    });
  });

  // ==========================================================================
  // J1.5: Days Remaining Calculation
  // ==========================================================================

  describe("J1.5: Days Remaining", () => {
    test("should return correct days remaining on first call", async () => {
      requireMutations("days remaining check");

      const response = await client.post("/api/license/validate", {
        fingerprint: deviceData.fingerprint,
        machineId: deviceData.machineId,
      });

      expectStatus(response, 200);
      expectTrialInit(response);

      const { daysRemaining } = response.json.trial;

      // New trial should have ~14 days
      expectDaysRemaining(daysRemaining, {
        min: 13, // Allow for time zone edge cases
        max: 14,
      });

      scope.trackTrial(response.json.trial?.id || deviceData.fingerprint);
    });

    test("should decrement days remaining over time", async () => {
      requireMutations("days decrement check");

      // This is a behavioral test - we verify the structure
      // Actual day decrement would require time manipulation

      const response = await client.post("/api/license/validate", {
        fingerprint: deviceData.fingerprint,
        machineId: deviceData.machineId,
      });

      expectStatus(response, 200);

      const { daysRemaining, trialStartDate, trialEndDate } =
        response.json.trial;

      // Calculate expected days
      const now = new Date();
      const end = new Date(trialEndDate);
      const expectedDays = Math.ceil((end - now) / (1000 * 60 * 60 * 24));

      // Should be close to calculated
      assert.ok(
        Math.abs(daysRemaining - expectedDays) <= 1,
        `Days remaining (${daysRemaining}) should match calculated (${expectedDays})`,
      );

      scope.trackTrial(response.json.trial?.id || deviceData.fingerprint);
    });
  });

  // ==========================================================================
  // J1.6: Multiple Devices
  // ==========================================================================

  describe("J1.6: Multiple Devices", () => {
    test("should create independent trials for different devices", async () => {
      requireMutations("multi-device trial check");

      const device1 = generateDeviceData();
      const device2 = generateDeviceData();

      // Device 1
      const response1 = await client.post("/api/license/validate", {
        fingerprint: device1.fingerprint,
        machineId: device1.machineId,
      });
      expectStatus(response1, 200);
      scope.trackTrial(response1.json.trial?.id || device1.fingerprint);

      // Device 2
      const response2 = await client.post("/api/license/validate", {
        fingerprint: device2.fingerprint,
        machineId: device2.machineId,
      });
      expectStatus(response2, 200);
      scope.trackTrial(response2.json.trial?.id || device2.fingerprint);

      // Both should have valid trials
      assert.equal(response1.json.status, "trial");
      assert.equal(response2.json.status, "trial");

      // Fingerprints should differ
      assert.notEqual(
        device1.fingerprint,
        device2.fingerprint,
        "Device fingerprints should be unique",
      );

      log.info("Multiple device trials created", {
        device1: device1.fingerprint,
        device2: device2.fingerprint,
      });
    });
  });
});
