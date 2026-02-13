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

  test("licensed heartbeat returns version payload when license missing in DB (no minVersion)", async () => {
    const fingerprint = "fp_licensed_missing_123";

    const keygenMock = createKeygenMock();
    keygenMock.whenMachineHeartbeat(fingerprint).resolves({});
    __setKeygenRequestForTests(keygenMock.request);

    mockSend.mockImplementation((command) => {
      const pk = command?.input?.Key?.PK;

      if (typeof pk === "string" && pk.startsWith("LICENSE#")) {
        return Promise.resolve({ Item: undefined });
      }

      if (typeof pk === "string" && pk.startsWith("VERSION#")) {
        return Promise.resolve({ Item: versionItem });
      }

      return Promise.resolve({});
    });

    const response = await POST(
      createMockRequest({
        fingerprint,
        sessionId: "sess_123",
        licenseKey: generateValidLicenseKey(),
      }),
    );

    const data = await response.json();

    expect(data.valid).toBe(true);
    expect(data.status).toBe("active");

    expect(data.latestVersion).toBe("0.10.0");
    expect(data.readyVersion).toBe("0.10.0");
    expect(data.readyUpdateUrl).toContain("marketplace.visualstudio.com");

    expect(hasOwn(data, "minVersion")).toBe(false);
  });

  test("licensed heartbeat includes version payload for known licenses (no minVersion)", async () => {
    const fingerprint = "fp_licensed_known_123";

    const keygenMock = createKeygenMock();
    keygenMock.whenMachineHeartbeat(fingerprint).resolves({});
    __setKeygenRequestForTests(keygenMock.request);

    mockSend.mockImplementation((command) => {
      const pk = command?.input?.Key?.PK;

      if (typeof pk === "string" && pk.startsWith("LICENSE#")) {
        return Promise.resolve({
          Item: {
            PK: pk,
            SK: "DETAILS",
            maxDevices: 3,
            keygenLicenseId: null,
            status: "active",
          },
        });
      }

      if (typeof pk === "string" && pk.startsWith("VERSION#")) {
        return Promise.resolve({ Item: versionItem });
      }

      return Promise.resolve({});
    });

    const response = await POST(
      createMockRequest({
        fingerprint,
        sessionId: "sess_456",
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
});
