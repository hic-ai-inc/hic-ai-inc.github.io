/**
 * Heartbeat Route Contract Tests
 *
 * Contract-level tests for the Next.js App Route handler:
 * - Always returns daily-gated update payload fields (readyVersion*)
 * - Never returns or relies on minVersion
 * - Version payload present even for "license missing in DB" case
 */

import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  createSpy,
} from "../../../../dm/facade/test-helpers/index.js";

import { POST } from "../../../src/app/api/license/heartbeat/route.js";
import { dynamodb } from "../../../src/lib/dynamodb.js";
import {
  __setKeygenRequestForTests,
  __resetKeygenRequestForTests,
} from "../../../src/lib/keygen.js";
import { createKeygenMock } from "../../../../dm/facade/helpers/keygen.js";
import { clearAllRateLimits } from "../../../src/lib/rate-limit.js";
import { NEXT_HEARTBEAT_SECONDS } from "../../../src/lib/constants.js";
import {
  __setVerifyAuthTokenForTests,
  __resetVerifyAuthTokenForTests,
} from "../../../src/lib/auth-verify.js";

function calculateChecksum(keyBody) {
  let sum = 0;
  for (let i = 0; i < keyBody.length; i++) {
    sum += keyBody.charCodeAt(i) * (i + 1);
  }

  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let checksum = "";
  for (let i = 0; i < 4; i++) {
    checksum += chars[(sum >> (i * 5)) % 36];
  }
  return checksum;
}

function generateValidLicenseKey() {
  const body = "ABCD1234EFGH";
  const checksum = calculateChecksum(body);
  return `MOUSE-ABCD-1234-EFGH-${checksum}`;
}

function createMockRequest(body) {
  return {
    json: () => Promise.resolve(body),
    clone: () => ({
      json: () => Promise.resolve(body),
    }),
  };
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

describe("Heartbeat Route - Contract", () => {
  let originalSend;
  let mockSend;

  const versionItem = {
    PK: "VERSION#mouse",
    SK: "CURRENT",
    latestVersion: "0.10.0",
    releaseNotesUrl: "https://hic.ai/mouse/changelog",
    updateUrl: {
      marketplace:
        "https://marketplace.visualstudio.com/items?itemName=hic-ai.mouse",
    },
    readyVersion: "0.10.0",
    readyReleaseNotesUrl: "https://hic.ai/mouse/changelog",
    readyUpdateUrl:
      "https://marketplace.visualstudio.com/items?itemName=hic-ai.mouse",
    readyUpdatedAt: "2026-02-05T00:00:00.000Z",
  };

  beforeEach(() => {
    clearAllRateLimits();
    __resetKeygenRequestForTests();
    // Mock auth to return a valid user for licensed heartbeat tests
    __setVerifyAuthTokenForTests(() => ({ sub: "test-user-id", email: "test@example.com" }));

    originalSend = dynamodb.send;
    mockSend = createSpy("dynamodb.send");
    dynamodb.send = mockSend;
  });

  afterEach(() => {
    clearAllRateLimits();
    __resetKeygenRequestForTests();
    __resetVerifyAuthTokenForTests();
    dynamodb.send = originalSend;
  });

  test("trial heartbeat includes readyVersion payload and no minVersion", async () => {
    mockSend.mockImplementation((command) => {
      const pk = command?.input?.Key?.PK;
      if (typeof pk === "string" && pk.startsWith("VERSION#")) {
        return Promise.resolve({ Item: versionItem });
      }
      return Promise.resolve({});
    });

    const response = await POST(
      createMockRequest({
        fingerprint: "fp_trial_123",
        machineId: "mach_123",
      }),
    );

    const data = await response.json();

    expect(data.valid).toBe(true);
    expect(data.status).toBe("trial");

    expect(data.latestVersion).toBe("0.10.0");
    expect(data.readyVersion).toBe("0.10.0");
    expect(data.readyUpdateUrl).toContain("marketplace.visualstudio.com");

    expect(hasOwn(data, "readyReleaseNotesUrl")).toBe(true);
    expect(hasOwn(data, "readyUpdatedAt")).toBe(true);

    expect(hasOwn(data, "minVersion")).toBe(false);
  });

  // Fix 2 / Task 9.1: null license now returns 404 with valid: false
  test("licensed heartbeat returns 404 when license missing in DB", async () => {
    const fingerprint = "fp_licensed_missing_123";

    const keygenMock = createKeygenMock();
    keygenMock.whenMachineHeartbeat(fingerprint).resolves({});
    __setKeygenRequestForTests(keygenMock.request);

    mockSend.mockImplementation((command) => {
      const input = command?.input;
      const pk = input?.Key?.PK;

      // GetCommand: LICENSE# lookup (getDeviceByFingerprint)
      if (typeof pk === "string" && pk.startsWith("LICENSE#")) {
        return Promise.resolve({ Item: undefined });
      }

      // QueryCommand: GSI2 license-by-key lookup (getLicenseByKey) — no license in DB
      if (input?.IndexName === "GSI2") {
        return Promise.resolve({ Items: [] });
      }

      return Promise.resolve({});
    });

    const response = await POST(
      createMockRequest({
        fingerprint,
        sessionId: "sess_123",
        machineId: "mach_missing_license",
        licenseKey: generateValidLicenseKey(),
      }),
    );

    expect(response.status).toBe(404);

    const data = await response.json();

    expect(data.valid).toBe(false);
    expect(data.status).toBe("not_found");
    expect(data.reason).toBe("License not found");
  });

  test("licensed heartbeat includes version payload for known licenses (no minVersion)", async () => {
    const fingerprint = "fp_licensed_known_123";

    const keygenMock = createKeygenMock();
    keygenMock.whenMachineHeartbeat(fingerprint).resolves({});
    __setKeygenRequestForTests(keygenMock.request);

    mockSend.mockImplementation((command) => {
      const input = command?.input;
      const pk = input?.Key?.PK;

      // GetCommand: LICENSE# lookup (getDeviceByFingerprint — no keygenLicenseId so won't be called)
      if (typeof pk === "string" && pk.startsWith("LICENSE#")) {
        return Promise.resolve({ Item: undefined });
      }

      // GetCommand: VERSION# lookup
      if (typeof pk === "string" && pk.startsWith("VERSION#")) {
        return Promise.resolve({ Item: versionItem });
      }

      // QueryCommand: GSI2 license-by-key lookup (getLicenseByKey)
      if (input?.IndexName === "GSI2") {
        return Promise.resolve({
          Items: [{
            PK: "LICENSE#lic_known",
            SK: "DETAILS",
            maxDevices: 3,
            keygenLicenseId: null,
            status: "active",
          }],
        });
      }

      return Promise.resolve({});
    });

    const response = await POST(
      createMockRequest({
        fingerprint,
        sessionId: "sess_456",
        machineId: "mach_known_license",
        licenseKey: generateValidLicenseKey(),
      }),
    );

    const data = await response.json();

    expect(data.valid).toBe(true);
    expect(data.status).toBe("active");
    expect(data.maxMachines).toBe(3);

    expect(data.latestVersion).toBe("0.10.0");
    expect(data.readyVersion).toBe("0.10.0");

    expect(hasOwn(data, "minVersion")).toBe(false);
  });

  // =========================================================================
  // Contract tests for 4 missing server statuses (Stream 1A)
  // Validates: Requirements 1.1, 1.2, 2.1–2.6
  // =========================================================================

  test("over_limit response includes version fields and correct shape", async () => {
    const fingerprint = "fp_over_limit_123";
    const keygenLicenseId = "lic_over_limit_test";

    const keygenMock = createKeygenMock();
    keygenMock.whenMachineHeartbeat(fingerprint).resolves({});
    __setKeygenRequestForTests(keygenMock.request);

    mockSend.mockImplementation((command) => {
      const input = command?.input;

      // GetCommand: LICENSE# lookup (getDeviceByFingerprint)
      if (input?.Key?.PK?.startsWith("LICENSE#")) {
        return Promise.resolve({
          Item: {
            fingerprint,
            userId: "user_over_limit",
            keygenMachineId: "mach_over_limit",
          },
        });
      }

      // GetCommand: VERSION# lookup
      if (input?.Key?.PK?.startsWith("VERSION#")) {
        return Promise.resolve({ Item: versionItem });
      }

      // QueryCommand: GSI2 license-by-key lookup (getLicenseByKey)
      if (input?.IndexName === "GSI2") {
        return Promise.resolve({
          Items: [{
            PK: `LICENSE#${keygenLicenseId}`,
            SK: "DETAILS",
            maxDevices: 3,
            keygenLicenseId,
            status: "active",
          }],
        });
      }

      // QueryCommand: device listing (return 4 devices to exceed Individual maxDevices: 3)
      if (input?.KeyConditionExpression) {
        return Promise.resolve({
          Items: [
            { fingerprint: "device_1", lastSeenAt: new Date().toISOString() },
            { fingerprint: "device_2", lastSeenAt: new Date().toISOString() },
            { fingerprint: "device_3", lastSeenAt: new Date().toISOString() },
            { fingerprint: "device_4", lastSeenAt: new Date().toISOString() },
          ],
        });
      }

      return Promise.resolve({});
    });

    const response = await POST(
      createMockRequest({
        fingerprint,
        sessionId: "sess_over_limit",
        machineId: "mach_over_limit",
        licenseKey: generateValidLicenseKey(),
      }),
    );

    expect(response.status).toBe(200);
    const data = await response.json();

    // Core fields
    expect(data.valid).toBe(true);
    expect(data.status).toBe("over_limit");
    expect(data.concurrentMachines).toBe(4);
    expect(data.maxMachines).toBe(3);
    expect(data.message).toBe("Consider upgrading your plan for more concurrent devices.");
    expect(data.nextHeartbeat).toBe(NEXT_HEARTBEAT_SECONDS);

    // Version fields — Property 1: Over-limit response includes version fields
    expect(data.latestVersion).toBe("0.10.0");
    expect(data.releaseNotesUrl).toBe("https://hic.ai/mouse/changelog");
    expect(data.updateUrl).toContain("marketplace.visualstudio.com");
    expect(data.readyVersion).toBe("0.10.0");
    expect(data.readyReleaseNotesUrl).toBe("https://hic.ai/mouse/changelog");
    expect(data.readyUpdateUrl).toContain("marketplace.visualstudio.com");
    expect(hasOwn(data, "readyUpdatedAt")).toBe(true);

    // No minVersion field
    expect(hasOwn(data, "minVersion")).toBe(false);

    // Exact field count — Property 2: no unexpected fields
    const expectedFields = [
      "valid", "status", "reason", "concurrentMachines", "maxMachines",
      "message", "nextHeartbeat", "latestVersion", "releaseNotesUrl",
      "updateUrl", "readyVersion", "readyReleaseNotesUrl", "readyUpdateUrl",
      "readyUpdatedAt",
    ];
    expect(Object.keys(data).length).toBe(expectedFields.length);
  });

  test("machine_not_found response has correct shape", async () => {
    const fingerprint = "fp_machine_not_found_123";

    const keygenMock = createKeygenMock();
    keygenMock.whenMachineHeartbeat(fingerprint).rejects(new Error("Machine not found"));
    __setKeygenRequestForTests(keygenMock.request);

    const response = await POST(
      createMockRequest({
        fingerprint,
        sessionId: "sess_mnf",
        machineId: "mach_not_found",
        licenseKey: generateValidLicenseKey(),
      }),
    );

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.valid).toBe(false);
    expect(data.status).toBe("machine_not_found");
    expect(data.concurrentMachines).toBe(0);
    expect(data.maxMachines).toBe(0);
    expect(typeof data.reason).toBe("string");

    // Exact field count
    const expectedFields = ["valid", "status", "reason", "concurrentMachines", "maxMachines"];
    expect(Object.keys(data).length).toBe(expectedFields.length);
  });

  test("error response has correct shape (HTTP 500)", async () => {
    // Force unhandled exception by making request.json() throw
    const badRequest = {
      json: () => { throw new Error("Simulated parse failure"); },
      clone: () => ({
        json: () => { throw new Error("Simulated parse failure"); },
      }),
    };

    const response = await POST(badRequest);

    expect(response.status).toBe(500);
    const data = await response.json();

    expect(data.valid).toBe(false);
    expect(data.status).toBe("error");
    expect(data.reason).toBe("Server error during heartbeat");
    expect(data.concurrentMachines).toBe(0);
    expect(data.maxMachines).toBe(0);

    // Exact field count
    const expectedFields = ["valid", "status", "reason", "concurrentMachines", "maxMachines"];
    expect(Object.keys(data).length).toBe(expectedFields.length);
  });

  test("invalid response has correct shape (HTTP 400)", async () => {
    const response = await POST(
      createMockRequest({
        fingerprint: "fp_invalid_123",
        sessionId: "sess_invalid",
        machineId: "mach_invalid",
        licenseKey: "INVALID-KEY",
      }),
    );

    expect(response.status).toBe(400);
    const data = await response.json();

    expect(data.valid).toBe(false);
    expect(data.status).toBe("invalid");
    expect(typeof data.reason).toBe("string");

    // Exact field count
    const expectedFields = ["valid", "status", "reason"];
    expect(Object.keys(data).length).toBe(expectedFields.length);
  });

  // =========================================================================
  // Fix 2: Heartbeat null-license guard and status classification
  // Feature: status-remediation-plan, Tasks 9.1 / 9.2 / 9.3
  // Validates: Requirements 7.1, 7.2, 7.3, 7.4
  // =========================================================================

  /**
   * Helper: builds a mockSend that returns a license with the given status.
   * The license has no keygenLicenseId so the device-lookup and device-count
   * code paths are skipped, isolating the status-classification logic.
   */
  function mockSendWithLicenseStatus(status) {
    return (command) => {
      const input = command?.input;
      const pk = input?.Key?.PK;

      // GetCommand: VERSION# lookup
      if (typeof pk === "string" && pk.startsWith("VERSION#")) {
        return Promise.resolve({ Item: versionItem });
      }

      // QueryCommand: GSI2 license-by-key lookup
      if (input?.IndexName === "GSI2") {
        return Promise.resolve({
          Items: [{
            PK: "LICENSE#lic_status_test",
            SK: "DETAILS",
            maxDevices: 3,
            keygenLicenseId: null,
            status,
          }],
        });
      }

      return Promise.resolve({});
    };
  }

  /** Helper: creates a standard licensed heartbeat request. */
  function licensedRequest(fingerprint) {
    return createMockRequest({
      fingerprint,
      sessionId: "sess_status_test",
      machineId: "mach_status_test",
      licenseKey: generateValidLicenseKey(),
    });
  }

  // ---- Task 9.1: null license ➜ 404 ----

  test("null license returns 404 with valid: false and exact field count", async () => {
    const fingerprint = "fp_null_lic_shape";

    const keygenMock = createKeygenMock();
    keygenMock.whenMachineHeartbeat(fingerprint).resolves({});
    __setKeygenRequestForTests(keygenMock.request);

    mockSend.mockImplementation((command) => {
      const input = command?.input;
      const pk = input?.Key?.PK;

      if (typeof pk === "string" && pk.startsWith("LICENSE#")) {
        return Promise.resolve({ Item: undefined });
      }
      if (input?.IndexName === "GSI2") {
        return Promise.resolve({ Items: [] });
      }
      return Promise.resolve({});
    });

    const response = await POST(licensedRequest(fingerprint));

    expect(response.status).toBe(404);
    const data = await response.json();

    expect(data.valid).toBe(false);
    expect(data.status).toBe("not_found");
    expect(data.reason).toBe("License not found");

    // Exact field count — no version payload on 404
    const expectedFields = ["valid", "status", "reason"];
    expect(Object.keys(data).length).toBe(expectedFields.length);
  });

  // ---- Task 9.2: invalid statuses ➜ valid: false ----

  test("expired license returns valid: false", async () => {
    const fingerprint = "fp_expired_test";

    const keygenMock = createKeygenMock();
    keygenMock.whenMachineHeartbeat(fingerprint).resolves({});
    __setKeygenRequestForTests(keygenMock.request);

    mockSend.mockImplementation(mockSendWithLicenseStatus("expired"));

    const response = await POST(licensedRequest(fingerprint));

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.valid).toBe(false);
    expect(data.status).toBe("expired");
    expect(data.reason).toBe("License is expired");
  });

  test("suspended license returns valid: false", async () => {
    const fingerprint = "fp_suspended_test";

    const keygenMock = createKeygenMock();
    keygenMock.whenMachineHeartbeat(fingerprint).resolves({});
    __setKeygenRequestForTests(keygenMock.request);

    mockSend.mockImplementation(mockSendWithLicenseStatus("suspended"));

    const response = await POST(licensedRequest(fingerprint));

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.valid).toBe(false);
    expect(data.status).toBe("suspended");
    expect(data.reason).toBe("License is suspended");
  });

  test("revoked license returns valid: false", async () => {
    const fingerprint = "fp_revoked_test";

    const keygenMock = createKeygenMock();
    keygenMock.whenMachineHeartbeat(fingerprint).resolves({});
    __setKeygenRequestForTests(keygenMock.request);

    mockSend.mockImplementation(mockSendWithLicenseStatus("revoked"));

    const response = await POST(licensedRequest(fingerprint));

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.valid).toBe(false);
    expect(data.status).toBe("revoked");
    expect(data.reason).toBe("License is revoked");
  });

  test("invalid-status response has exact 3 fields (no version payload)", async () => {
    const fingerprint = "fp_invalid_shape";

    const keygenMock = createKeygenMock();
    keygenMock.whenMachineHeartbeat(fingerprint).resolves({});
    __setKeygenRequestForTests(keygenMock.request);

    mockSend.mockImplementation(mockSendWithLicenseStatus("expired"));

    const response = await POST(licensedRequest(fingerprint));
    const data = await response.json();

    const expectedFields = ["valid", "status", "reason"];
    expect(Object.keys(data).length).toBe(expectedFields.length);
  });

  // ---- Task 9.2: valid statuses ➜ valid: true ----

  test("active license returns valid: true", async () => {
    const fingerprint = "fp_active_test";

    const keygenMock = createKeygenMock();
    keygenMock.whenMachineHeartbeat(fingerprint).resolves({});
    __setKeygenRequestForTests(keygenMock.request);

    mockSend.mockImplementation(mockSendWithLicenseStatus("active"));

    const response = await POST(licensedRequest(fingerprint));

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.valid).toBe(true);
    expect(data.status).toBe("active");
  });

  test("past_due license returns valid: true (dunning window)", async () => {
    const fingerprint = "fp_past_due_test";

    const keygenMock = createKeygenMock();
    keygenMock.whenMachineHeartbeat(fingerprint).resolves({});
    __setKeygenRequestForTests(keygenMock.request);

    mockSend.mockImplementation(mockSendWithLicenseStatus("past_due"));

    const response = await POST(licensedRequest(fingerprint));

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.valid).toBe(true);
    expect(data.status).toBe("past_due");
  });

  test("cancellation_pending license returns valid: true", async () => {
    const fingerprint = "fp_cancel_pending_test";

    const keygenMock = createKeygenMock();
    keygenMock.whenMachineHeartbeat(fingerprint).resolves({});
    __setKeygenRequestForTests(keygenMock.request);

    mockSend.mockImplementation(mockSendWithLicenseStatus("cancellation_pending"));

    const response = await POST(licensedRequest(fingerprint));

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.valid).toBe(true);
    expect(data.status).toBe("cancellation_pending");
  });

});
