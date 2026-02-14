/**
 * Portal Devices Route Contract Tests
 *
 * Verifies hardened behavior:
 * - differentiated auth/token failures
 * - org membership fallback for shared business licenses
 * - no licenseId leakage in response
 * - rate limiting enforcement
 */

import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  createSpy,
} from "../../../../dm/facade/test-helpers/index.js";

import { GET } from "../../../src/app/api/portal/devices/route.js";
import { dynamodb } from "../../../src/lib/dynamodb.js";
import { clearAllRateLimits } from "../../../src/lib/rate-limit.js";
import {
  __setVerifyAuthTokenForTests,
  __resetVerifyAuthTokenForTests,
} from "../../../src/lib/auth-verify.js";

function createMockRequest() {
  return {
    headers: {
      get: () => null,
    },
  };
}

describe("portal/devices route contract", () => {
  let originalSend;
  let mockSend;

  beforeEach(() => {
    clearAllRateLimits();
    __resetVerifyAuthTokenForTests();
    originalSend = dynamodb.send;
    mockSend = createSpy("dynamodb.send");
    dynamodb.send = mockSend;
  });

  afterEach(() => {
    clearAllRateLimits();
    __resetVerifyAuthTokenForTests();
    dynamodb.send = originalSend;
  });

  test("returns 401 when auth token is missing", async () => {
    __setVerifyAuthTokenForTests(() => null);

    const response = await GET(createMockRequest());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  test("returns TOKEN_EMAIL_MISSING when token has no email", async () => {
    __setVerifyAuthTokenForTests(() => ({ sub: "user-123" }));

    const response = await GET(createMockRequest());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("TOKEN_EMAIL_MISSING");
    expect(mockSend.callCount).toBe(0);
  });

  test("resolves shared business license via org fallback and omits licenseId", async () => {
    __setVerifyAuthTokenForTests(() => ({
      sub: "member-user-1",
      email: "member@example.com",
    }));

    mockSend.mockImplementation((command) => {
      const input = command?.input || {};

      if (
        input.IndexName === "GSI2" &&
        input.ExpressionAttributeValues?.[":pk"] === "EMAIL#member@example.com"
      ) {
        return Promise.resolve({
          Items: [
            {
              PK: "USER#member-user-1",
              SK: "PROFILE",
              email: "member@example.com",
            },
          ],
        });
      }

      if (
        input.IndexName === "GSI1" &&
        input.ExpressionAttributeValues?.[":pk"] === "USER#member-user-1"
      ) {
        return Promise.resolve({
          Items: [
            {
              orgId: "org_123",
              role: "member",
              status: "active",
              email: "member@example.com",
            },
          ],
        });
      }

      if (input.Key?.PK === "ORG#org_123" && input.Key?.SK === "DETAILS") {
        return Promise.resolve({
          Item: {
            orgId: "org_123",
            ownerEmail: "owner@example.com",
          },
        });
      }

      if (
        input.IndexName === "GSI2" &&
        input.ExpressionAttributeValues?.[":pk"] === "EMAIL#owner@example.com"
      ) {
        return Promise.resolve({
          Items: [
            {
              PK: "USER#owner-1",
              SK: "PROFILE",
              email: "owner@example.com",
              accountType: "business",
              keygenLicenseId: "lic_shared_123",
            },
          ],
        });
      }

      if (
        input.KeyConditionExpression === "PK = :pk AND begins_with(SK, :sk)" &&
        input.ExpressionAttributeValues?.[":pk"] === "LICENSE#lic_shared_123" &&
        input.ExpressionAttributeValues?.[":sk"] === "DEVICE#"
      ) {
        return Promise.resolve({
          Items: [
            {
              SK: "DEVICE#mach_member_1",
              keygenMachineId: "mach_member_1",
              userId: "member-user-1",
              userEmail: "member@example.com",
              name: "Member Mac",
              platform: "darwin",
              fingerprint: "fp_member_1",
              lastSeenAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
            },
            {
              SK: "DEVICE#mach_other_1",
              keygenMachineId: "mach_other_1",
              userId: "other-user",
              userEmail: "other@example.com",
              name: "Other Device",
              platform: "linux",
              fingerprint: "fp_other_1",
              lastSeenAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
            },
          ],
        });
      }

      return Promise.resolve({ Items: [] });
    });

    const response = await GET(createMockRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(body.devices)).toBe(true);
    expect(body.devices.length).toBe(1);
    expect(body.devices[0].id).toBe("mach_member_1");
    expect(body.maxDevices).toBe(5);
    expect(body.totalActiveDevices).toBe(2);
    expect(body.licenseId).toBe(undefined);
  });

  test("enforces rate limiting with RATE_LIMIT_EXCEEDED code", async () => {
    __setVerifyAuthTokenForTests(() => ({
      sub: "rate-user-1",
      email: "rate@example.com",
    }));

    mockSend.mockImplementation((command) => {
      const input = command?.input || {};

      if (
        input.IndexName === "GSI2" &&
        input.ExpressionAttributeValues?.[":pk"] === "EMAIL#rate@example.com"
      ) {
        return Promise.resolve({
          Items: [
            {
              PK: "USER#rate-user-1",
              SK: "PROFILE",
              email: "rate@example.com",
              accountType: "individual",
              keygenLicenseId: "lic_rate_123",
            },
          ],
        });
      }

      if (
        input.KeyConditionExpression === "PK = :pk AND begins_with(SK, :sk)" &&
        input.ExpressionAttributeValues?.[":pk"] === "LICENSE#lic_rate_123" &&
        input.ExpressionAttributeValues?.[":sk"] === "DEVICE#"
      ) {
        return Promise.resolve({ Items: [] });
      }

      return Promise.resolve({ Items: [] });
    });

    let lastResponse = null;
    for (let i = 0; i < 31; i += 1) {
      lastResponse = await GET(createMockRequest());
    }

    const body = await lastResponse.json();
    expect(lastResponse.status).toBe(429);
    expect(body.code).toBe("RATE_LIMIT_EXCEEDED");
  });
});
