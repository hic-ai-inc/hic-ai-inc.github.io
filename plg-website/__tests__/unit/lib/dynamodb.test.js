/**
 * DynamoDB Client Tests
 *
 * Tests the dynamodb.js module that provides DynamoDB operations for
 * customer, license, device, and organization data.
 *
 * Behaviors tested:
 * - Customer operations (get by Auth0 ID, Stripe ID, email, upsert)
 * - License operations (get, create, update status)
 * - Device operations (add, remove, get devices)
 * - Organization operations (members, usage stats)
 */

import {
  describe,
  it,
  beforeEach,
  afterEach,
  expect,
  createSpy,
  spyOn,
} from "../../../../dm/facade/test-helpers/index.js";

import {
  getCustomerByUserId,
  getCustomerByStripeId,
  getCustomerByEmail,
  upsertCustomer,
  updateCustomerSubscription,
  getLicenseByKey,
  getLicense,
  getCustomerLicenses,
  getCustomerLicensesByEmail,
  createLicense,
  updateLicenseStatus,
  getLicenseDevices,
  getDeviceByFingerprint,
  getDeviceByMachineId,
  addDeviceActivation,
  removeDeviceActivation,
  updateDeviceLastSeen,
  getActiveDevicesInWindow,
  getUserDevices,
  getActiveUserDevicesInWindow,
  getOrgMembers,
  updateOrgMemberStatus,
  getOrgLicenseUsage,
  getVersionConfig,
  dynamodb,
  // Organization management functions
  upsertOrganization,
  updateOrganization,
  updateOrgSeatLimit,
  getOrganization,
  getOrganizationByStripeCustomer,
  getUserOrgMembership,
  createOrgInvite,
  getOrgInvites,
  acceptOrgInvite,
} from "../../../src/lib/dynamodb.js";

describe("dynamodb.js", () => {
  let originalSend;
  let mockSend;

  beforeEach(() => {
    // Store original send method and replace with spy
    originalSend = dynamodb.send;
    mockSend = createSpy("dynamodb.send");
    dynamodb.send = mockSend;
  });

  afterEach(() => {
    // Restore original send method
    dynamodb.send = originalSend;
  });

  // ===========================================
  // CUSTOMER OPERATIONS
  // ===========================================

  describe("getCustomerByUserId", () => {
    it("should query with USER#auth0Id partition key", async () => {
      mockSend.mockResolvedValue({
        Item: { userId: "auth0|123", email: "test@example.com" },
      });

      const result = await getCustomerByUserId("auth0|123");

      expect(result).toEqual({
        userId: "auth0|123",
        email: "test@example.com",
      });
      expect(mockSend.callCount).toBe(1);

      const command = mockSend.calls[0][0];
      expect(command.input.Key.PK).toBe("USER#auth0|123");
      expect(command.input.Key.SK).toBe("PROFILE");
    });

    it("should return undefined when customer not found", async () => {
      mockSend.mockResolvedValue({ Item: undefined });

      const result = await getCustomerByUserId("nonexistent");

      expect(result).toBe(undefined);
    });
  });

  describe("getCustomerByStripeId", () => {
    it("should query GSI1 with STRIPE#customerId", async () => {
      mockSend.mockResolvedValue({
        Items: [{ stripeCustomerId: "cus_abc123", email: "test@example.com" }],
      });

      const result = await getCustomerByStripeId("cus_abc123");

      expect(result).toEqual({
        stripeCustomerId: "cus_abc123",
        email: "test@example.com",
      });

      const command = mockSend.calls[0][0];
      expect(command.input.IndexName).toBe("GSI1");
      expect(command.input.ExpressionAttributeValues[":pk"]).toBe(
        "STRIPE#cus_abc123",
      );
    });

    it("should return undefined when no customer found", async () => {
      mockSend.mockResolvedValue({ Items: [] });

      const result = await getCustomerByStripeId("cus_nonexistent");

      expect(result).toBe(undefined);
    });
  });

  describe("getCustomerByEmail", () => {
    it("should query GSI2 with lowercased email and GSI2SK filter", async () => {
      mockSend.mockResolvedValue({
        Items: [{ email: "test@example.com", SK: "PROFILE" }],
      });

      const result = await getCustomerByEmail("Test@Example.COM");

      expect(result).toEqual({ email: "test@example.com", SK: "PROFILE" });

      const command = mockSend.calls[0][0];
      expect(command.input.IndexName).toBe("GSI2");
      expect(command.input.KeyConditionExpression).toBe(
        "GSI2PK = :pk AND GSI2SK = :sk",
      );
      expect(command.input.ExpressionAttributeValues[":pk"]).toBe(
        "EMAIL#test@example.com",
      );
      expect(command.input.ExpressionAttributeValues[":sk"]).toBe("USER");
    });

    it("should NOT return org membership records (GSI2 collision fix)", async () => {
      // After the GSI2SK filter, membership records (GSI2SK: MEMBER#orgId)
      // are excluded at the DynamoDB query level. This test verifies the
      // KeyConditionExpression includes the GSI2SK = USER constraint.
      mockSend.mockResolvedValue({ Items: [] });

      const result = await getCustomerByEmail("member@example.com");

      expect(result).toBe(null);

      const command = mockSend.calls[0][0];
      // The key assertion: GSI2SK must be constrained to "USER"
      expect(command.input.KeyConditionExpression).toContain("GSI2SK = :sk");
      expect(command.input.ExpressionAttributeValues[":sk"]).toBe("USER");
    });

    it("should return null when no customer found", async () => {
      mockSend.mockResolvedValue({ Items: [] });

      const result = await getCustomerByEmail("nobody@example.com");

      expect(result).toBe(null);
    });

    it("should prefer customer with keygenLicenseId when multiple exist", async () => {
      mockSend.mockResolvedValue({
        Items: [
          { email: "user@example.com", userId: "old" },
          {
            email: "user@example.com",
            userId: "licensed",
            keygenLicenseId: "lic_123",
          },
        ],
      });

      const result = await getCustomerByEmail("user@example.com");

      expect(result.userId).toBe("licensed");
      expect(result.keygenLicenseId).toBe("lic_123");
    });

    it("should return first item when none have keygenLicenseId", async () => {
      mockSend.mockResolvedValue({
        Items: [
          { email: "user@example.com", userId: "first" },
          { email: "user@example.com", userId: "second" },
        ],
      });

      const result = await getCustomerByEmail("user@example.com");

      expect(result.userId).toBe("first");
    });
  });

  describe("upsertCustomer", () => {
    it("should create new customer with createdAt timestamp", async () => {
      // First call: getCustomerByUserId returns undefined (new customer)
      // Second call: PutCommand
      mockSend
        .mockResolvedValueOnce({ Item: undefined }) // Customer doesn't exist
        .mockResolvedValueOnce({}); // PutCommand success

      const result = await upsertCustomer({
        userId: "auth0|new",
        email: "New@Example.com",
        stripeCustomerId: "cus_new",
        accountType: "individual",
        subscriptionStatus: "active",
      });

      expect(result.userId).toBe("auth0|new");
      expect(result.email).toBe("new@example.com"); // Lowercased
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it("should update existing customer without overwriting createdAt", async () => {
      // First call: getCustomerByUserId returns existing customer
      // Second call: PutCommand
      mockSend
        .mockResolvedValueOnce({
          Item: {
            userId: "auth0|existing",
            createdAt: "2025-01-01T00:00:00Z",
          },
        })
        .mockResolvedValueOnce({});

      const result = await upsertCustomer({
        userId: "auth0|existing",
        email: "existing@example.com",
        accountType: "individual",
      });

      // Should NOT have createdAt (preserves existing)
      expect(result.createdAt).toBeUndefined();
      expect(result.updatedAt).toBeDefined();
    });

    it("should set GSI1 keys when stripeCustomerId provided", async () => {
      mockSend.mockResolvedValue({});

      const result = await upsertCustomer({
        userId: "auth0|123",
        email: "test@example.com",
        stripeCustomerId: "cus_stripe123",
      });

      expect(result.GSI1PK).toBe("STRIPE#cus_stripe123");
      expect(result.GSI1SK).toBe("CUSTOMER");
    });

    it("should not set GSI1 keys when stripeCustomerId not provided", async () => {
      mockSend.mockResolvedValue({});

      const result = await upsertCustomer({
        userId: "auth0|123",
        email: "test@example.com",
      });

      expect(result.GSI1PK).toBeUndefined();
      expect(result.GSI1SK).toBeUndefined();
    });
  });

  describe("updateCustomerSubscription", () => {
    it("should update subscription fields with UpdateCommand", async () => {
      mockSend.mockResolvedValue({});

      await updateCustomerSubscription("auth0|123", {
        subscriptionStatus: "active",
        planType: "individual",
      });

      expect(mockSend.callCount).toBe(1);

      const command = mockSend.calls[0][0];
      expect(command.input.Key.PK).toBe("USER#auth0|123");
      expect(command.input.Key.SK).toBe("PROFILE");
      expect(command.input.UpdateExpression).toContain("#subscriptionStatus");
      expect(command.input.UpdateExpression).toContain("#planType");
    });

    it("should always include updatedAt in update", async () => {
      mockSend.mockResolvedValue({});

      await updateCustomerSubscription("auth0|123", { status: "active" });

      const command = mockSend.calls[0][0];
      expect(command.input.UpdateExpression).toContain("#updatedAt");
    });
  });

  // ===========================================
  // LICENSE OPERATIONS
  // ===========================================

  describe("getLicenseByKey", () => {
    it("should query GSI2 with LICENSE_KEY#key", async () => {
      mockSend.mockResolvedValue({
        Items: [{ licenseKey: "MOUSE-XXX-YYY", status: "active" }],
      });

      const result = await getLicenseByKey("MOUSE-XXX-YYY");

      expect(result).toEqual({ licenseKey: "MOUSE-XXX-YYY", status: "active" });

      const command = mockSend.calls[0][0];
      expect(command.input.IndexName).toBe("GSI2");
      expect(command.input.ExpressionAttributeValues[":pk"]).toBe(
        "LICENSE_KEY#MOUSE-XXX-YYY",
      );
    });

    it("should return null when license not found", async () => {
      mockSend.mockResolvedValue({ Items: [] });

      const result = await getLicenseByKey("NONEXISTENT");

      expect(result).toBe(null);
    });
  });

  describe("getLicense", () => {
    it("should get license by Keygen license ID", async () => {
      mockSend.mockResolvedValue({
        Item: { keygenLicenseId: "lic_123", status: "active" },
      });

      const result = await getLicense("lic_123");

      expect(result).toEqual({ keygenLicenseId: "lic_123", status: "active" });

      const command = mockSend.calls[0][0];
      expect(command.input.Key.PK).toBe("LICENSE#lic_123");
      expect(command.input.Key.SK).toBe("DETAILS");
    });
  });

  describe("getCustomerLicenses", () => {
    it("should query licenses with begins_with SK", async () => {
      mockSend.mockResolvedValue({
        Items: [
          { keygenLicenseId: "lic_1", status: "active" },
          { keygenLicenseId: "lic_2", status: "expired" },
        ],
      });

      const result = await getCustomerLicenses("auth0|123");

      expect(result).toHaveLength(2);

      const command = mockSend.calls[0][0];
      expect(command.input.KeyConditionExpression).toContain("begins_with");
      expect(command.input.ExpressionAttributeValues[":pk"]).toBe(
        "USER#auth0|123",
      );
      expect(command.input.ExpressionAttributeValues[":sk"]).toBe("LICENSE#");
    });

    it("should return empty array when no licenses", async () => {
      mockSend.mockResolvedValue({});

      const result = await getCustomerLicenses("auth0|nolicenses");

      expect(result).toEqual([]);
    });
  });

  describe("getCustomerLicensesByEmail", () => {
    it("should query licenses by email via GSI1", async () => {
      mockSend.mockResolvedValue({
        Items: [
          { PK: "LICENSE#lic_1", SK: "DETAILS", status: "active" },
          { PK: "LICENSE#lic_2", SK: "DETAILS", status: "expired" },
        ],
      });

      const result = await getCustomerLicensesByEmail("test@example.com");

      expect(result).toHaveLength(2);

      const command = mockSend.calls[0][0];
      expect(command.input.IndexName).toBe("GSI1");
      expect(command.input.KeyConditionExpression).toBe("GSI1PK = :pk");
      expect(command.input.ExpressionAttributeValues[":pk"]).toBe(
        "USER#email:test@example.com",
      );
    });

    it("should normalize email to lowercase", async () => {
      mockSend.mockResolvedValue({ Items: [] });

      await getCustomerLicensesByEmail("Test@EXAMPLE.com");

      const command = mockSend.calls[0][0];
      expect(command.input.ExpressionAttributeValues[":pk"]).toBe(
        "USER#email:test@example.com",
      );
    });

    it("should filter out non-license records", async () => {
      mockSend.mockResolvedValue({
        Items: [
          { PK: "LICENSE#lic_1", SK: "DETAILS", status: "active" },
          { PK: "LICENSE#lic_1", SK: "DEVICE#abc", machineId: "abc" },
          { PK: "USER#123", SK: "PROFILE", email: "test@example.com" },
        ],
      });

      const result = await getCustomerLicensesByEmail("test@example.com");

      // Should only return the LICENSE DETAILS record
      expect(result).toHaveLength(1);
      expect(result[0].PK).toBe("LICENSE#lic_1");
      expect(result[0].SK).toBe("DETAILS");
    });

    it("should return empty array when no licenses", async () => {
      mockSend.mockResolvedValue({});

      const result = await getCustomerLicensesByEmail("nolicenses@example.com");

      expect(result).toEqual([]);
    });
  });

  describe("createLicense", () => {
    it("should create license detail and user-license link records", async () => {
      mockSend.mockResolvedValue({});

      const result = await createLicense({
        keygenLicenseId: "lic_new",
        userId: "auth0|123",
        licenseKey: "MOUSE-ABC-123",
        policyId: "pol_individual",
        status: "active",
        expiresAt: "2026-01-01T00:00:00Z",
        maxDevices: 3,
      });

      // Should call send twice (license record + user-license link)
      expect(mockSend.callCount).toBe(2);

      expect(result.keygenLicenseId).toBe("lic_new");
      expect(result.licenseKey).toBe("MOUSE-ABC-123");
      expect(result.activatedDevices).toBe(0);
      expect(result.createdAt).toBeDefined();
    });

    it("should set GSI1 for user lookup", async () => {
      mockSend.mockResolvedValue({});

      const result = await createLicense({
        keygenLicenseId: "lic_new",
        userId: "auth0|123",
        licenseKey: "MOUSE-ABC-123",
        policyId: "pol_individual",
        status: "active",
        maxDevices: 3,
      });

      expect(result.GSI1PK).toBe("USER#auth0|123");
      expect(result.userId).toBe("auth0|123");
      expect(result.GSI1SK).toBe("LICENSE#lic_new");
    });
  });

  describe("updateLicenseStatus", () => {
    it("should update status with metadata", async () => {
      mockSend.mockResolvedValue({});

      await updateLicenseStatus("lic_123", "suspended", {
        suspendedReason: "payment_failed",
      });

      const command = mockSend.calls[0][0];
      expect(command.input.Key.PK).toBe("LICENSE#lic_123");
      expect(command.input.ExpressionAttributeValues[":status"]).toBe(
        "suspended",
      );
    });
  });

  // ===========================================
  // DEVICE OPERATIONS
  // ===========================================

  describe("getLicenseDevices", () => {
    it("should query devices with DEVICE# SK prefix", async () => {
      mockSend.mockResolvedValue({
        Items: [
          { keygenMachineId: "mach_1", name: "MacBook Pro" },
          { keygenMachineId: "mach_2", name: "Windows Desktop" },
        ],
      });

      const result = await getLicenseDevices("lic_123");

      expect(result).toHaveLength(2);

      const command = mockSend.calls[0][0];
      expect(command.input.ExpressionAttributeValues[":pk"]).toBe(
        "LICENSE#lic_123",
      );
      expect(command.input.ExpressionAttributeValues[":sk"]).toBe("DEVICE#");
    });

    it("should throw when keygenLicenseId is missing", async () => {
      let threw = false;
      try {
        await getLicenseDevices();
      } catch (err) {
        threw = true;
        expect(err.message).toContain("requires keygenLicenseId");
      }
      expect(threw).toBe(true);
      expect(mockSend.callCount).toBe(0);
    });
  });

  describe("addDeviceActivation", () => {
    it("should create device record and increment counter", async () => {
      // Mock getLicenseDevices to return empty (no existing devices)
      mockSend.mockResolvedValueOnce({ Items: [] });
      // Mock the remaining calls
      mockSend.mockResolvedValue({});

      const result = await addDeviceActivation({
        keygenLicenseId: "lic_123",
        keygenMachineId: "mach_new",
        fingerprint: "abc123fingerprint",
        name: "MacBook Pro",
        platform: "darwin",
        userId: "cognito|user-001",
        userEmail: "test@example.com",
      });

      const canonicalPutCall = mockSend.calls.find((call) => {
        const item = call?.[0]?.input?.Item;
        return item && item.SK === "DEVICE#abc123fingerprint";
      });
      expect(canonicalPutCall).toBeDefined();

      const counterUpdateCall = mockSend.calls.find((call) => {
        const input = call?.[0]?.input;
        return (
          typeof input?.UpdateExpression === "string" &&
          input.UpdateExpression.includes("activatedDevices")
        );
      });
      expect(counterUpdateCall).toBeDefined();

      expect(result.keygenMachineId).toBe("mach_new");
      expect(result.fingerprint).toBe("abc123fingerprint");
      expect(result.platform).toBe("darwin");
      expect(result.userId).toBe("cognito|user-001");
      expect(result.userEmail).toBe("test@example.com");
      expect(result.createdAt).toBeDefined();
      expect(result.lastSeenAt).toBeDefined();
    });

    it("should rekey legacy machineId-based row to canonical fingerprint key", async () => {
      mockSend.mockResolvedValueOnce({});
      mockSend.mockResolvedValueOnce({ Item: undefined });
      mockSend.mockResolvedValueOnce({
        Items: [
          {
            PK: "LICENSE#lic_123",
            SK: "DEVICE#mach_old",
            keygenMachineId: "mach_old",
            fingerprint: "legacy_fp",
            name: "Legacy Device",
            platform: "win32",
            createdAt: "2026-02-01T00:00:00.000Z",
          },
        ],
      });
      mockSend.mockResolvedValue({});

      const result = await addDeviceActivation({
        keygenLicenseId: "lic_123",
        keygenMachineId: "mach_new",
        fingerprint: "legacy_fp",
        name: "Upgraded Device",
        platform: "win32",
        userId: "cognito|user-777",
        userEmail: "legacy@example.com",
      });

      expect(result.SK).toBe("DEVICE#legacy_fp");
      expect(result.keygenMachineId).toBe("mach_new");

      const updateCall = mockSend.calls.find((call) => {
        const key = call?.[0]?.input?.Key;
        return key?.PK === "LICENSE#lic_123" && key?.SK === "DEVICE#legacy_fp";
      });
      expect(updateCall).toBeDefined();

      const legacyDeleteCall = mockSend.calls.find((call) => {
        const key = call?.[0]?.input?.Key;
        return key?.PK === "LICENSE#lic_123" && key?.SK === "DEVICE#mach_old";
      });
      expect(legacyDeleteCall).toBeDefined();
    });

    it("should store metadata under metadata field without overriding protected keys", async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });
      mockSend.mockResolvedValue({});

      await addDeviceActivation({
        keygenLicenseId: "lic_123",
        keygenMachineId: "mach_new",
        fingerprint: "meta_fingerprint",
        name: "Metadata Device",
        platform: "linux",
        userId: "cognito|user-999",
        userEmail: "meta@example.com",
        metadata: {
          PK: "LICENSE#attacker",
          SK: "DEVICE#attacker",
          role: "admin",
          environment: "staging",
        },
      });

      const putCall = mockSend.calls.find((call) => {
        const item = call?.[0]?.input?.Item;
        return item && item.SK === "DEVICE#meta_fingerprint";
      });

      expect(putCall).toBeDefined();
      const putItem = putCall[0].input.Item;
      expect(putItem.PK).toBe("LICENSE#lic_123");
      expect(putItem.SK).toBe("DEVICE#meta_fingerprint");
      expect(putItem.metadata.environment).toBe("staging");
      expect(putItem.metadata.PK).toBe("LICENSE#attacker");
    });

    it("should throw when key identifiers are missing", async () => {
      let threw = false;
      try {
        await addDeviceActivation({
          keygenLicenseId: "lic_123",
          userId: "cognito|user-1",
          userEmail: "user@example.com",
        });
      } catch (err) {
        threw = true;
        expect(err.message).toContain("keygenLicenseId, keygenMachineId, and fingerprint");
      }
      expect(threw).toBe(true);
      expect(mockSend.callCount).toBe(0);
    });
  });

  describe("removeDeviceActivation", () => {
    it("should delete device record and decrement counter", async () => {
      mockSend.mockResolvedValueOnce({
        Items: [
          {
            PK: "LICENSE#lic_123",
            SK: "DEVICE#fp_remove",
            keygenMachineId: "mach_remove",
            fingerprint: "fp_remove",
          },
        ],
      });
      mockSend.mockResolvedValueOnce({ Attributes: { SK: "DEVICE#fp_remove" } });
      mockSend.mockResolvedValue({});

      await removeDeviceActivation("lic_123", "mach_remove");

      const deleteCommandCall = mockSend.calls.find((call) => {
        const input = call?.[0]?.input;
        return input?.Key?.SK === "DEVICE#fp_remove";
      });
      expect(deleteCommandCall).toBeDefined();

      const updateCommandCall = mockSend.calls.find((call) => {
        const input = call?.[0]?.input;
        return (
          typeof input?.UpdateExpression === "string" &&
          input.UpdateExpression.includes("activatedDevices")
        );
      });
      expect(updateCommandCall).toBeDefined();
    });

    it("should skip counter decrement when no device record was deleted", async () => {
      mockSend.mockResolvedValueOnce({ Attributes: undefined });

      const result = await removeDeviceActivation("lic_123", "mach_missing");

      expect(result.removed).toBe(false);
      expect(mockSend.callCount).toBe(1);
    });

    it("should remove by fingerprint when machineId is unavailable", async () => {
      mockSend.mockResolvedValueOnce({
        Item: {
          PK: "LICENSE#lic_123",
          SK: "DEVICE#fp_remove",
          fingerprint: "fp_remove",
          keygenMachineId: "mach_remove",
        },
      });
      mockSend.mockResolvedValueOnce({ Attributes: { SK: "DEVICE#fp_remove" } });
      mockSend.mockResolvedValue({});

      const result = await removeDeviceActivation(
        "lic_123",
        undefined,
        "fp_remove",
      );

      expect(result.removed).toBe(true);

      const deleteCommandCall = mockSend.calls.find((call) => {
        const key = call?.[0]?.input?.Key;
        return key?.PK === "LICENSE#lic_123" && key?.SK === "DEVICE#fp_remove";
      });
      expect(deleteCommandCall).toBeDefined();
    });
  });

  describe("updateDeviceLastSeen", () => {
    it("should update lastSeenAt timestamp", async () => {
      mockSend.mockResolvedValue({});

      await updateDeviceLastSeen("lic_123", "mach_123");

      const command = mockSend.calls[0][0];
      expect(command.input.Key.PK).toBe("LICENSE#lic_123");
      expect(command.input.Key.SK).toBe("DEVICE#mach_123");
      expect(command.input.UpdateExpression).toContain("lastSeenAt");
    });

    it("should include ConditionExpression to prevent upsert (Phase 3F)", async () => {
      mockSend.mockResolvedValue({});

      await updateDeviceLastSeen("lic_123", "mach_456");

      const command = mockSend.calls[0][0];
      expect(command.input.ConditionExpression).toBe("attribute_exists(PK)");
    });

    it("should silently catch ConditionalCheckFailedException (Phase 3F)", async () => {
      const condError = new Error("Conditional check failed");
      condError.name = "ConditionalCheckFailedException";
      mockSend.mockRejectedValue(condError);

      // Should NOT throw — ghost device records silently ignored
      await updateDeviceLastSeen("lic_123", "mach_nonexistent");
      expect(mockSend.callCount).toBe(1);
    });

    it("should re-throw non-conditional errors (Phase 3F)", async () => {
      const otherError = new Error("DynamoDB throttle");
      otherError.name = "ProvisionedThroughputExceededException";
      mockSend.mockRejectedValue(otherError);

      let threw = false;
      try {
        await updateDeviceLastSeen("lic_123", "mach_456");
      } catch (err) {
        threw = true;
        expect(err.name).toBe("ProvisionedThroughputExceededException");
      }
      expect(threw).toBe(true);
    });

    it("should NOT include userId in UpdateExpression when provided (security hardening)", async () => {
      mockSend.mockResolvedValue({});

      await updateDeviceLastSeen("lic_123", "mach_789", "user_abc");

      const command = mockSend.calls[0][0];
      expect(command.input.UpdateExpression).not.toContain("userId");
      expect(command.input.ExpressionAttributeValues[":userId"]).toBe(
        undefined,
      );
    });

    it("should NOT include userId when not provided (Phase 3F)", async () => {
      mockSend.mockResolvedValue({});

      await updateDeviceLastSeen("lic_123", "mach_789");

      const command = mockSend.calls[0][0];
      expect(command.input.UpdateExpression).not.toContain("userId");
      expect(command.input.ExpressionAttributeValues[":userId"]).toBe(
        undefined,
      );
    });

    it("should key lastSeen updates by fingerprint identity", async () => {
      mockSend.mockResolvedValue({});

      await updateDeviceLastSeen("lic_123", "fp_123");

      const command = mockSend.calls[0][0];
      expect(command.input.Key.PK).toBe("LICENSE#lic_123");
      expect(command.input.Key.SK).toBe("DEVICE#fp_123");
    });
  });
  describe("getActiveDevicesInWindow", () => {
    it("should return only devices active within 24-hour window", async () => {
      const now = Date.now();
      const twentyHoursAgo = new Date(now - 20 * 60 * 60 * 1000).toISOString();
      const thirtyHoursAgo = new Date(now - 30 * 60 * 60 * 1000).toISOString();

      mockSend.mockResolvedValue({
        Items: [
          { keygenMachineId: "mach_1", lastSeenAt: twentyHoursAgo },
          { keygenMachineId: "mach_2", lastSeenAt: thirtyHoursAgo },
          {
            keygenMachineId: "mach_3",
            lastSeenAt: new Date(now).toISOString(),
          },
        ],
      });

      const { getActiveDevicesInWindow } =
        await import("../../../src/lib/dynamodb.js");
      const result = await getActiveDevicesInWindow("lic_123", 24);

      expect(result).toHaveLength(2);
      expect(result[0].keygenMachineId).toBe("mach_1");
      expect(result[1].keygenMachineId).toBe("mach_3");
    });

    it("should filter out devices with lastSeenAt older than window", async () => {
      const now = Date.now();
      const fortyEightHoursAgo = new Date(
        now - 48 * 60 * 60 * 1000,
      ).toISOString();

      mockSend.mockResolvedValue({
        Items: [
          { keygenMachineId: "mach_old", lastSeenAt: fortyEightHoursAgo },
        ],
      });

      const { getActiveDevicesInWindow } =
        await import("../../../src/lib/dynamodb.js");
      const result = await getActiveDevicesInWindow("lic_123", 24);

      expect(result).toHaveLength(0);
    });

    it("should use createdAt when lastSeenAt is missing", async () => {
      const now = Date.now();
      const tenHoursAgo = new Date(now - 10 * 60 * 60 * 1000).toISOString();

      mockSend.mockResolvedValue({
        Items: [{ keygenMachineId: "mach_new", createdAt: tenHoursAgo }],
      });

      const { getActiveDevicesInWindow } =
        await import("../../../src/lib/dynamodb.js");
      const result = await getActiveDevicesInWindow("lic_123", 24);

      expect(result).toHaveLength(1);
      expect(result[0].keygenMachineId).toBe("mach_new");
    });

    it("should accept custom window hours parameter", async () => {
      const now = Date.now();
      const tenHoursAgo = new Date(now - 10 * 60 * 60 * 1000).toISOString();

      mockSend.mockResolvedValue({
        Items: [{ keygenMachineId: "mach_1", lastSeenAt: tenHoursAgo }],
      });

      const { getActiveDevicesInWindow } =
        await import("../../../src/lib/dynamodb.js");
      const result = await getActiveDevicesInWindow("lic_123", 8);

      expect(result).toHaveLength(0);
    });

    it("should return empty array when no devices active", async () => {
      mockSend.mockResolvedValue({ Items: [] });

      const { getActiveDevicesInWindow } =
        await import("../../../src/lib/dynamodb.js");
      const result = await getActiveDevicesInWindow("lic_123", 24);

      expect(result).toEqual([]);
    });

    it("should handle devices at exact window boundary", async () => {
      const now = Date.now();
      const exactlyTwentyFourHoursAgo = new Date(
        now - 24 * 60 * 60 * 1000,
      ).toISOString();

      mockSend.mockResolvedValue({
        Items: [
          {
            keygenMachineId: "mach_boundary",
            lastSeenAt: exactlyTwentyFourHoursAgo,
          },
        ],
      });

      const { getActiveDevicesInWindow } =
        await import("../../../src/lib/dynamodb.js");
      const result = await getActiveDevicesInWindow("lic_123", 24);

      expect(result).toHaveLength(0);
    });

    it("should exclude devices with invalid date strings", async () => {
      mockSend.mockResolvedValue({
        Items: [
          { keygenMachineId: "mach_bad", lastSeenAt: "not-a-date" },
          {
            keygenMachineId: "mach_good",
            lastSeenAt: new Date().toISOString(),
          },
        ],
      });

      const result = await getActiveDevicesInWindow("lic_123", 24);

      expect(result).toHaveLength(1);
      expect(result[0].keygenMachineId).toBe("mach_good");
    });

    it("should throw when keygenLicenseId is missing", async () => {
      let threw = false;
      try {
        await getActiveDevicesInWindow();
      } catch (err) {
        threw = true;
        expect(err.message).toContain("requires keygenLicenseId");
      }
      expect(threw).toBe(true);
      expect(mockSend.callCount).toBe(0);
    });
  });

  describe("device lookup helpers", () => {
    it("should get device by canonical fingerprint key", async () => {
      mockSend.mockResolvedValueOnce({
        Item: {
          PK: "LICENSE#lic_123",
          SK: "DEVICE#fp_lookup",
          fingerprint: "fp_lookup",
          keygenMachineId: "mach_lookup",
        },
      });

      const result = await getDeviceByFingerprint("lic_123", "fp_lookup");

      expect(result).toBeDefined();
      expect(result.fingerprint).toBe("fp_lookup");
      expect(result.keygenMachineId).toBe("mach_lookup");

      const command = mockSend.calls[0][0];
      expect(command.input.Key.PK).toBe("LICENSE#lic_123");
      expect(command.input.Key.SK).toBe("DEVICE#fp_lookup");
    });

    it("should resolve device by machineId from license partition", async () => {
      mockSend.mockResolvedValueOnce({
        Items: [
          {
            SK: "DEVICE#fp_a",
            fingerprint: "fp_a",
            keygenMachineId: "mach_a",
          },
          {
            SK: "DEVICE#fp_b",
            fingerprint: "fp_b",
            keygenMachineId: "mach_b",
          },
        ],
      });

      const result = await getDeviceByMachineId("lic_123", "mach_b");

      expect(result).toBeDefined();
      expect(result.fingerprint).toBe("fp_b");
      expect(result.keygenMachineId).toBe("mach_b");
    });
  });

  // ===========================================
  // ORGANIZATION OPERATIONS
  // ===========================================

  describe("getOrgMembers", () => {
    it("should query members with MEMBER# SK prefix", async () => {
      mockSend.mockResolvedValue({
        Items: [
          { memberId: "user_1", status: "active" },
          { memberId: "user_2", status: "suspended" },
        ],
      });

      const result = await getOrgMembers("org_123");

      expect(result).toHaveLength(2);

      const command = mockSend.calls[0][0];
      expect(command.input.ExpressionAttributeValues[":pk"]).toBe(
        "ORG#org_123",
      );
      expect(command.input.ExpressionAttributeValues[":sk"]).toBe("MEMBER#");
    });
  });

  describe("updateOrgMemberStatus", () => {
    it("should update member status", async () => {
      mockSend.mockResolvedValue({
        Attributes: { memberId: "user_1", status: "suspended" },
      });

      const result = await updateOrgMemberStatus(
        "org_123",
        "user_1",
        "suspended",
      );

      expect(result).toEqual({ memberId: "user_1", status: "suspended" });

      const command = mockSend.calls[0][0];
      expect(command.input.Key.PK).toBe("ORG#org_123");
      expect(command.input.Key.SK).toBe("MEMBER#user_1");
      expect(command.input.ExpressionAttributeValues[":status"]).toBe(
        "suspended",
      );
    });
  });

  describe("getOrgLicenseUsage", () => {
    it("should calculate seat usage correctly", async () => {
      mockSend
        .mockResolvedValueOnce({
          // GetCommand for org details
          Item: { orgId: "org_123", seatLimit: 25 },
        })
        .mockResolvedValueOnce({
          // QueryCommand for active members
          Items: Array(10).fill({ status: "active" }),
        });

      const result = await getOrgLicenseUsage("org_123");

      expect(result.orgId).toBe("org_123");
      expect(result.seatLimit).toBe(25);
      expect(result.seatsUsed).toBe(10);
      expect(result.seatsAvailable).toBe(15);
      expect(result.utilizationPercent).toBe(40);
    });

    it("should handle zero seat limit", async () => {
      mockSend
        .mockResolvedValueOnce({ Item: {} }) // No seatLimit
        .mockResolvedValueOnce({ Items: [] });

      const result = await getOrgLicenseUsage("org_new");

      expect(result.seatLimit).toBe(0);
      expect(result.seatsUsed).toBe(0);
      expect(result.seatsAvailable).toBe(0);
      expect(result.utilizationPercent).toBe(0);
    });
  });

  describe("getOrgInvites", () => {
    it("should return both pending and accepted invites", async () => {
      mockSend.mockResolvedValue({
        Items: [
          { inviteId: "inv_1", status: "pending", email: "a@test.com" },
          {
            inviteId: "inv_2",
            status: "accepted",
            email: "b@test.com",
            acceptedAt: "2026-02-08T00:00:00Z",
          },
        ],
      });

      const result = await getOrgInvites("org_123");

      expect(result).toHaveLength(2);
      expect(result[0].status).toBe("pending");
      expect(result[1].status).toBe("accepted");
    });

    it("should query with IN filter for pending and accepted statuses", async () => {
      mockSend.mockResolvedValue({ Items: [] });

      await getOrgInvites("org_123");

      const command = mockSend.calls[0][0];
      expect(command.input.KeyConditionExpression).toBe(
        "PK = :pk AND begins_with(SK, :sk)",
      );
      expect(command.input.FilterExpression).toBe(
        "#status IN (:pending, :accepted)",
      );
      expect(command.input.ExpressionAttributeValues[":pk"]).toBe(
        "ORG#org_123",
      );
      expect(command.input.ExpressionAttributeValues[":sk"]).toBe("INVITE#");
      expect(command.input.ExpressionAttributeValues[":pending"]).toBe(
        "pending",
      );
      expect(command.input.ExpressionAttributeValues[":accepted"]).toBe(
        "accepted",
      );
    });

    it("should NOT return cancelled or expired invites", async () => {
      // The filter only allows pending and accepted, so cancelled/expired
      // records are excluded by DynamoDB. Verify by checking filter expression.
      mockSend.mockResolvedValue({ Items: [] });

      await getOrgInvites("org_123");

      const command = mockSend.calls[0][0];
      expect(command.input.FilterExpression).toBe(
        "#status IN (:pending, :accepted)",
      );
      // Cancelled and expired are not in the IN list
    });

    it("should return empty array when no invites exist", async () => {
      mockSend.mockResolvedValue({ Items: undefined });

      const result = await getOrgInvites("org_empty");

      expect(result).toEqual([]);
    });
  });

  describe("createOrgInvite", () => {
    it("should include eventType field in created invite", async () => {
      mockSend.mockResolvedValueOnce({}); // PutCommand success

      const result = await createOrgInvite(
        "org_123",
        "user@example.com",
        "admin",
        "inviter_123",
      );

      expect(result.eventType).toBe("TEAM_INVITE_CREATED");
      expect(result.email).toBe("user@example.com");
      expect(result.role).toBe("admin");
    });

    it("should include metadata fields when provided", async () => {
      mockSend.mockResolvedValueOnce({}); // PutCommand success

      const result = await createOrgInvite(
        "org_123",
        "user@example.com",
        "member",
        "inviter_123",
        {
          organizationName: "Test Corp",
          inviterName: "Test User",
        },
      );

      expect(result.organizationName).toBe("Test Corp");
      expect(result.inviterName).toBe("Test User");
      expect(result.eventType).toBe("TEAM_INVITE_CREATED");
    });

    it("should keep invite metadata nested while preserving protected top-level fields", async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await createOrgInvite(
        "org_123",
        "user@example.com",
        "member",
        "inviter_123",
        {
          organizationName: "Secure Org",
          inviterName: "Secure Inviter",
          role: "owner",
          token: "forged-token",
          expiresAt: "2099-01-01T00:00:00.000Z",
          extraField: "kept-in-metadata",
        },
      );

      expect(result.role).toBe("member");
      expect(result.token).not.toBe("forged-token");
      expect(result.organizationName).toBe("Secure Org");
      expect(result.inviterName).toBe("Secure Inviter");
      expect(result.metadata.extraField).toBe("kept-in-metadata");
      expect(result.metadata.role).toBe("owner");
    });

    it("should sanitize invite metadata field types", async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await createOrgInvite(
        "org_123",
        "user@example.com",
        "member",
        "inviter_123",
        {
          organizationName: { bad: true },
          inviterName: 42,
        },
      );

      expect(result.organizationName).toBe(undefined);
      expect(result.inviterName).toBe(undefined);
      expect(result.metadata).toBeDefined();
    });

    it("should accept metadata parameter with default empty object", async () => {
      mockSend.mockResolvedValueOnce({}); // PutCommand success

      const result = await createOrgInvite(
        "org_123",
        "user@example.com",
        "admin",
        "inviter_123",
      );

      expect(result).toBeDefined();
      expect(result.eventType).toBe("TEAM_INVITE_CREATED");
    });
  });

  // ===========================================
  // ORGANIZATION MANAGEMENT TESTS
  // Per Phase 1: Organization & Seat Sync
  // ===========================================

  describe("upsertOrganization", () => {
    it("should create organization with all fields", async () => {
      mockSend.mockResolvedValueOnce({}); // PutCommand success

      const result = await upsertOrganization({
        orgId: "cus_stripe123",
        name: "Acme Corp",
        seatLimit: 10,
        ownerId: "user_owner123",
        ownerEmail: "owner@acme.com",
        stripeCustomerId: "cus_stripe123",
        stripeSubscriptionId: "sub_abc123",
      });

      expect(result.orgId).toBe("cus_stripe123");
      expect(result.name).toBe("Acme Corp");
      expect(result.seatLimit).toBe(10);
      expect(result.ownerId).toBe("user_owner123");
      expect(result.ownerEmail).toBe("owner@acme.com");
      expect(result.stripeCustomerId).toBe("cus_stripe123");

      const command = mockSend.calls[0][0];
      expect(command.input.Item.PK).toBe("ORG#cus_stripe123");
      expect(command.input.Item.SK).toBe("DETAILS");
    });

    it("should normalize owner email to lowercase", async () => {
      mockSend.mockResolvedValueOnce({});

      await upsertOrganization({
        orgId: "org_123",
        name: "Test Org",
        seatLimit: 5,
        ownerId: "user_1",
        ownerEmail: "OWNER@EXAMPLE.COM",
      });

      const command = mockSend.calls[0][0];
      expect(command.input.Item.ownerEmail).toBe("owner@example.com");
    });

    it("should default name from orgId when not provided", async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await upsertOrganization({
        orgId: "cus_abcdefgh12345678",
        seatLimit: 1,
        ownerId: "user_1",
        ownerEmail: "test@example.com",
      });

      // Name should be generated from last 8 chars of orgId
      expect(result.name).toBe("Organization 12345678");
    });

    it("should default seatLimit to 1 when not provided", async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await upsertOrganization({
        orgId: "org_123",
        ownerId: "user_1",
        ownerEmail: "test@example.com",
      });

      expect(result.seatLimit).toBe(1);
    });

    it("should call updateOrganization if org already exists", async () => {
      // First call fails with ConditionalCheckFailedException
      const conditionalError = new Error("Condition not met");
      conditionalError.name = "ConditionalCheckFailedException";
      mockSend.mockRejectedValueOnce(conditionalError);
      // Second call (update) succeeds
      mockSend.mockResolvedValueOnce({
        Attributes: {
          orgId: "org_123",
          seatLimit: 10,
          updatedAt: "2026-02-02T00:00:00.000Z",
        },
      });

      const result = await upsertOrganization({
        orgId: "org_123",
        seatLimit: 10,
        ownerId: "user_1",
        ownerEmail: "test@example.com",
      });

      expect(mockSend.callCount).toBe(2);
      expect(result.seatLimit).toBe(10);
    });

    it("should throw on non-conditional errors", async () => {
      const dbError = new Error("DynamoDB error");
      dbError.name = "InternalServerError";
      mockSend.mockRejectedValueOnce(dbError);

      let error;
      try {
        await upsertOrganization({
          orgId: "org_123",
          ownerId: "user_1",
          ownerEmail: "test@example.com",
        });
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.message).toBe("DynamoDB error");
    });
  });

  describe("updateOrganization", () => {
    it("should update only provided fields", async () => {
      mockSend.mockResolvedValueOnce({
        Attributes: {
          orgId: "org_123",
          name: "New Name",
          seatLimit: 25,
          updatedAt: "2026-02-02T00:00:00.000Z",
        },
      });

      const result = await updateOrganization({
        orgId: "org_123",
        name: "New Name",
        seatLimit: 25,
      });

      expect(result.name).toBe("New Name");
      expect(result.seatLimit).toBe(25);

      const command = mockSend.calls[0][0];
      expect(command.input.Key.PK).toBe("ORG#org_123");
      expect(command.input.Key.SK).toBe("DETAILS");
      expect(command.input.UpdateExpression).toContain("seatLimit");
      expect(command.input.UpdateExpression).toContain("updatedAt");
    });

    it("should handle name field with reserved word", async () => {
      mockSend.mockResolvedValueOnce({
        Attributes: { name: "Updated Org" },
      });

      await updateOrganization({
        orgId: "org_123",
        name: "Updated Org",
      });

      const command = mockSend.calls[0][0];
      // name is a reserved word, so it should use expression attribute name
      expect(command.input.ExpressionAttributeNames["#name"]).toBe("name");
    });

    it("should always update updatedAt timestamp", async () => {
      mockSend.mockResolvedValueOnce({ Attributes: {} });

      await updateOrganization({
        orgId: "org_123",
        seatLimit: 5,
      });

      const command = mockSend.calls[0][0];
      expect(command.input.UpdateExpression).toContain("updatedAt");
      expect(
        command.input.ExpressionAttributeValues[":updatedAt"],
      ).toBeTruthy();
    });
  });

  describe("updateOrgSeatLimit", () => {
    it("should update seat limit directly", async () => {
      mockSend.mockResolvedValueOnce({
        Attributes: {
          orgId: "cus_stripe123",
          seatLimit: 50,
          updatedAt: "2026-02-02T00:00:00.000Z",
        },
      });

      const result = await updateOrgSeatLimit("cus_stripe123", 50);

      expect(result.seatLimit).toBe(50);

      const command = mockSend.calls[0][0];
      expect(command.input.Key.PK).toBe("ORG#cus_stripe123");
      expect(command.input.Key.SK).toBe("DETAILS");
      expect(command.input.ExpressionAttributeValues[":seatLimit"]).toBe(50);
    });

    it("should handle zero seat limit", async () => {
      mockSend.mockResolvedValueOnce({
        Attributes: { seatLimit: 0 },
      });

      const result = await updateOrgSeatLimit("org_123", 0);

      expect(result.seatLimit).toBe(0);
    });

    it("should throw on DynamoDB error", async () => {
      mockSend.mockRejectedValueOnce(new Error("DB error"));

      let error;
      try {
        await updateOrgSeatLimit("org_123", 10);
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.message).toBe("DB error");
    });
  });

  describe("getOrganization", () => {
    it("should return organization by ID", async () => {
      mockSend.mockResolvedValueOnce({
        Item: {
          PK: "ORG#org_123",
          SK: "DETAILS",
          orgId: "org_123",
          name: "Test Org",
          seatLimit: 10,
          ownerId: "user_1",
        },
      });

      const result = await getOrganization("org_123");

      expect(result.orgId).toBe("org_123");
      expect(result.name).toBe("Test Org");
      expect(result.seatLimit).toBe(10);

      const command = mockSend.calls[0][0];
      expect(command.input.Key.PK).toBe("ORG#org_123");
      expect(command.input.Key.SK).toBe("DETAILS");
    });

    it("should return null when organization not found", async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });

      const result = await getOrganization("nonexistent");

      expect(result).toBe(null);
    });

    it("should throw on DynamoDB error", async () => {
      mockSend.mockRejectedValueOnce(new Error("Connection failed"));

      let error;
      try {
        await getOrganization("org_123");
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.message).toBe("Connection failed");
    });
  });

  describe("getOrganizationByStripeCustomer", () => {
    it("should lookup organization by Stripe customer ID", async () => {
      mockSend.mockResolvedValueOnce({
        Item: {
          PK: "ORG#cus_stripe123",
          SK: "DETAILS",
          orgId: "cus_stripe123",
          stripeCustomerId: "cus_stripe123",
          seatLimit: 25,
        },
      });

      const result = await getOrganizationByStripeCustomer("cus_stripe123");

      expect(result.orgId).toBe("cus_stripe123");
      expect(result.stripeCustomerId).toBe("cus_stripe123");
      expect(result.seatLimit).toBe(25);

      // Should query using stripeCustomerId as key (since orgId = stripeCustomerId)
      const command = mockSend.calls[0][0];
      expect(command.input.Key.PK).toBe("ORG#cus_stripe123");
    });

    it("should return null when no organization found", async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });

      const result = await getOrganizationByStripeCustomer("cus_unknown");

      expect(result).toBe(null);
    });

    it("should throw on DynamoDB error", async () => {
      mockSend.mockRejectedValueOnce(new Error("Access denied"));

      let error;
      try {
        await getOrganizationByStripeCustomer("cus_123");
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.message).toBe("Access denied");
    });

    // ===========================================
    // USER ORG MEMBERSHIP TESTS
    // ===========================================

    describe("getUserOrgMembership", () => {
      it("should return org membership for user with active membership", async () => {
        mockSend.mockResolvedValueOnce({
          Items: [
            {
              GSI1PK: "USER#user_123",
              GSI1SK: "ORG#org_acme",
              orgId: "org_acme",
              role: "member",
              status: "active",
              email: "user@acme.com",
              joinedAt: "2026-02-01T00:00:00.000Z",
            },
          ],
        });

        const result = await getUserOrgMembership("user_123");

        expect(result).not.toBeNull();
        expect(result.orgId).toBe("org_acme");
        expect(result.role).toBe("member");
        expect(result.status).toBe("active");
        expect(result.email).toBe("user@acme.com");

        // Should query GSI1 with USER# prefix
        const command = mockSend.calls[0][0];
        expect(command.input.IndexName).toBe("GSI1");
        expect(command.input.ExpressionAttributeValues[":pk"]).toBe(
          "USER#user_123",
        );
      });

      it("should return null for user with no org membership", async () => {
        mockSend.mockResolvedValueOnce({ Items: [] });

        const result = await getUserOrgMembership("user_no_org");

        expect(result).toBeNull();
      });

      it("should return null for user with only inactive memberships", async () => {
        mockSend.mockResolvedValueOnce({
          Items: [
            {
              orgId: "org_old",
              role: "member",
              status: "removed",
              email: "user@old.com",
            },
          ],
        });

        const result = await getUserOrgMembership("user_inactive");

        expect(result).toBeNull();
      });

      it("should return first active membership when user has multiple", async () => {
        mockSend.mockResolvedValueOnce({
          Items: [
            {
              orgId: "org_inactive",
              role: "member",
              status: "removed",
            },
            {
              orgId: "org_active",
              role: "admin",
              status: "active",
              email: "user@active.com",
              joinedAt: "2026-02-02T00:00:00.000Z",
            },
          ],
        });

        const result = await getUserOrgMembership("user_multi");

        expect(result.orgId).toBe("org_active");
        expect(result.role).toBe("admin");
      });

      it("should throw on DynamoDB error", async () => {
        mockSend.mockRejectedValueOnce(new Error("Connection failed"));

        let error;
        try {
          await getUserOrgMembership("user_error");
        } catch (e) {
          error = e;
        }

        expect(error).toBeDefined();
        expect(error.message).toBe("Connection failed");
      });
    });
  });

  // ===========================================
  // VERSION CONFIG TESTS (B2)
  // ===========================================

  describe("getVersionConfig", () => {
    it("should return version config for mouse product", async () => {
      mockSend.mockResolvedValueOnce({
        Item: {
          PK: "VERSION#mouse",
          SK: "CURRENT",
          latestVersion: "0.10.0",
          updateUrl: {
            marketplace:
              "https://marketplace.visualstudio.com/items?itemName=hic-ai.mouse",
          },
          releaseNotesUrl: "https://hic.ai/mouse/changelog",
          readyVersion: "0.10.0",
          readyReleaseNotesUrl: "https://hic.ai/mouse/changelog",
          readyUpdateUrl:
            "https://marketplace.visualstudio.com/items?itemName=hic-ai.mouse",
          readyUpdatedAt: "2026-02-05T00:00:00.000Z",
        },
      });

      const result = await getVersionConfig("mouse");

      expect(result).not.toBeNull();
      expect(result.latestVersion).toBe("0.10.0");
      expect(result.releaseNotesUrl).toBe("https://hic.ai/mouse/changelog");
      expect(result.readyVersion).toBe("0.10.0");
      expect(result.readyUpdateUrl).toContain("marketplace.visualstudio.com");
      expect(result.updateUrl.marketplace).toContain(
        "marketplace.visualstudio.com",
      );
    });

    it("should default to mouse product when no argument provided", async () => {
      mockSend.mockResolvedValueOnce({
        Item: { PK: "VERSION#mouse", SK: "CURRENT", latestVersion: "0.10.0" },
      });

      await getVersionConfig();

      expect(mockSend.callCount).toBe(1);
      const call = mockSend.calls[0][0];
      expect(call.input.Key.PK).toBe("VERSION#mouse");
    });

    it("should return null when version config not found", async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });

      const result = await getVersionConfig("unknown");

      expect(result).toBeNull();
    });

    it("should return null and log error on DynamoDB failure", async () => {
      const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
      mockSend.mockRejectedValueOnce(new Error("DynamoDB error"));

      const result = await getVersionConfig("mouse");

      expect(result).toBeNull();
      expect(consoleSpy.callCount).toBe(1);
      expect(consoleSpy.calls[0][0]).toBe("Failed to get version config:");
      expect(consoleSpy.calls[0][1]).toBe("DynamoDB error");
      consoleSpy.mockRestore();
    });
  });

  // ===========================================
  // PHASE 2: PER-USER DEVICE TRACKING
  // ===========================================

  describe("addDeviceActivation with userId/userEmail", () => {
    it("should include userId and userEmail in new device record", async () => {
      // Mock getLicenseDevices to return empty (no existing devices)
      mockSend.mockResolvedValueOnce({ Items: [] });
      // Mock PutCommand and UpdateCommand
      mockSend.mockResolvedValue({});

      const result = await addDeviceActivation({
        keygenLicenseId: "lic_123",
        keygenMachineId: "mach_new",
        fingerprint: "abc123fingerprint",
        name: "MacBook Pro",
        platform: "darwin",
        userId: "cognito|user-456",
        userEmail: "user@example.com",
      });

      expect(result.userId).toBe("cognito|user-456");
      expect(result.userEmail).toBe("user@example.com");
      expect(result.fingerprint).toBe("abc123fingerprint");
      expect(result.keygenMachineId).toBe("mach_new");

      // Verify canonical put includes userId/userEmail in the item
      const putCommandCall = mockSend.calls.find((call) => {
        const item = call?.[0]?.input?.Item;
        return item && item.SK === "DEVICE#abc123fingerprint";
      });
      expect(putCommandCall).toBeDefined();
      expect(putCommandCall[0].input.Item.userId).toBe("cognito|user-456");
      expect(putCommandCall[0].input.Item.userEmail).toBe("user@example.com");
    });

    it("should include userId and userEmail when updating existing device", async () => {
      // Mock lock PutCommand, then canonical lookup miss, then legacy lookup hit
      mockSend.mockResolvedValueOnce({});
      mockSend.mockResolvedValueOnce({ Item: undefined });
      mockSend.mockResolvedValueOnce({
        Items: [
          {
            PK: "LICENSE#lic_123",
            SK: "DEVICE#mach_old",
            keygenMachineId: "mach_old",
            fingerprint: "abc123fingerprint",
            name: "Old Name",
            platform: "darwin",
          },
        ],
      });
      // Mock update/delete/cleanup calls
      mockSend.mockResolvedValue({});

      const result = await addDeviceActivation({
        keygenLicenseId: "lic_123",
        keygenMachineId: "mach_new",
        fingerprint: "abc123fingerprint",
        name: "MacBook Pro",
        platform: "darwin",
        userId: "cognito|user-789",
        userEmail: "updated@example.com",
      });

      expect(result.userId).toBe("cognito|user-789");
      expect(result.userEmail).toBe("updated@example.com");
      expect(result.keygenMachineId).toBe("mach_new");

      // Verify UpdateCommand includes userId/userEmail in expression
      const updateCommandCall = mockSend.calls.find((call) => {
        const input = call?.[0]?.input;
        return (
          typeof input?.UpdateExpression === "string" &&
          input.UpdateExpression.includes("userId") &&
          input.UpdateExpression.includes("userEmail")
        );
      });

      expect(updateCommandCall).toBeDefined();

      const updateCommand = updateCommandCall[0];
      expect(updateCommand.input.UpdateExpression).toContain("userId");
      expect(updateCommand.input.UpdateExpression).toContain("userEmail");
      expect(updateCommand.input.ExpressionAttributeValues[":userId"]).toBe(
        "cognito|user-789",
      );
      expect(updateCommand.input.ExpressionAttributeValues[":userEmail"]).toBe(
        "updated@example.com",
      );
    });

    it("should throw when userId is missing (Phase 3E: auth mandatory)", async () => {
      let threw = false;
      try {
        await addDeviceActivation({
          keygenLicenseId: "lic_123",
          keygenMachineId: "mach_no_user",
          fingerprint: "nouser_fingerprint",
          name: "Anonymous Device",
          platform: "linux",
          userEmail: "test@example.com",
        });
      } catch (err) {
        threw = true;
        expect(err.message).toContain("userId and userEmail");
      }
      expect(threw).toBe(true);
    });

    it("should throw when userEmail is missing (Phase 3E: auth mandatory)", async () => {
      let threw = false;
      try {
        await addDeviceActivation({
          keygenLicenseId: "lic_123",
          keygenMachineId: "mach_no_email",
          fingerprint: "noemail_fingerprint",
          name: "No Email Device",
          platform: "linux",
          userId: "cognito|user-001",
        });
      } catch (err) {
        threw = true;
        expect(err.message).toContain("userId and userEmail");
      }
      expect(threw).toBe(true);
    });

    it("should throw when updating existing device without userId (Phase 3E: auth mandatory)", async () => {
      let threw = false;
      try {
        await addDeviceActivation({
          keygenLicenseId: "lic_123",
          keygenMachineId: "mach_updated",
          fingerprint: "existing_fp",
          name: "Updated Name",
          platform: "win32",
        });
      } catch (err) {
        threw = true;
        expect(err.message).toContain("userId and userEmail");
      }
      expect(threw).toBe(true);
    });
  });

  describe("getUserDevices", () => {
    it("should return only devices belonging to specified userId", async () => {
      mockSend.mockResolvedValueOnce({
        Items: [
          { keygenMachineId: "mach_1", userId: "user-A", name: "MacBook" },
          { keygenMachineId: "mach_2", userId: "user-B", name: "Windows PC" },
          { keygenMachineId: "mach_3", userId: "user-A", name: "Linux Server" },
        ],
      });

      const result = await getUserDevices("lic_123", "user-A");

      expect(result).toHaveLength(2);
      expect(result[0].keygenMachineId).toBe("mach_1");
      expect(result[1].keygenMachineId).toBe("mach_3");
    });

    it("should return empty array when no devices match userId", async () => {
      mockSend.mockResolvedValueOnce({
        Items: [
          { keygenMachineId: "mach_1", userId: "user-B", name: "Other Device" },
        ],
      });

      const result = await getUserDevices("lic_123", "user-A");

      expect(result).toHaveLength(0);
    });

    it("should not return devices without userId attribute", async () => {
      // Pre-Phase 2 devices have no userId — they should not match any user query
      mockSend.mockResolvedValueOnce({
        Items: [
          { keygenMachineId: "mach_legacy", name: "Legacy Device" },
          { keygenMachineId: "mach_new", userId: "user-A", name: "New Device" },
        ],
      });

      const result = await getUserDevices("lic_123", "user-A");

      expect(result).toHaveLength(1);
      expect(result[0].keygenMachineId).toBe("mach_new");
    });

    it("should return empty array when licenseId is missing", async () => {
      const result = await getUserDevices(null, "user-A");
      expect(result).toHaveLength(0);
      // Should not call DynamoDB
      expect(mockSend.callCount).toBe(0);
    });

    it("should return empty array when userId is missing", async () => {
      const result = await getUserDevices("lic_123", null);
      expect(result).toHaveLength(0);
      expect(mockSend.callCount).toBe(0);
    });

    it("should return empty array when both params are missing", async () => {
      const result = await getUserDevices(null, null);
      expect(result).toHaveLength(0);
      expect(mockSend.callCount).toBe(0);
    });

    it("should isolate devices between users on same license", async () => {
      const allDevices = [
        { keygenMachineId: "mach_1", userId: "user-A", name: "A's MacBook" },
        { keygenMachineId: "mach_2", userId: "user-B", name: "B's Windows" },
        { keygenMachineId: "mach_3", userId: "user-C", name: "C's Linux" },
        { keygenMachineId: "mach_4", userId: "user-A", name: "A's iPad" },
      ];

      // Query for user-B
      mockSend.mockResolvedValueOnce({ Items: allDevices });
      const userB = await getUserDevices("lic_shared", "user-B");
      expect(userB).toHaveLength(1);
      expect(userB[0].name).toBe("B's Windows");

      // Query for user-A
      mockSend.mockResolvedValueOnce({ Items: allDevices });
      const userA = await getUserDevices("lic_shared", "user-A");
      expect(userA).toHaveLength(2);
    });
  });

  describe("getActiveUserDevicesInWindow", () => {
    it("should return only user's devices within the time window", async () => {
      const now = Date.now();
      const oneHourAgo = new Date(now - 1 * 60 * 60 * 1000).toISOString();
      const threeHoursAgo = new Date(now - 3 * 60 * 60 * 1000).toISOString();

      mockSend.mockResolvedValueOnce({
        Items: [
          {
            keygenMachineId: "mach_1",
            userId: "user-A",
            lastSeenAt: oneHourAgo,
          },
          {
            keygenMachineId: "mach_2",
            userId: "user-A",
            lastSeenAt: threeHoursAgo,
          },
          {
            keygenMachineId: "mach_3",
            userId: "user-B",
            lastSeenAt: oneHourAgo,
          },
        ],
      });

      // Default window is 2 hours
      const result = await getActiveUserDevicesInWindow("lic_123", "user-A");

      // Only mach_1 — user-A's device within 2-hour window
      // mach_2 is user-A but outside window, mach_3 is user-B
      expect(result).toHaveLength(1);
      expect(result[0].keygenMachineId).toBe("mach_1");
    });

    it("should default to 2-hour window", async () => {
      const now = Date.now();
      const ninetyMinutesAgo = new Date(now - 90 * 60 * 1000).toISOString();
      const threeHoursAgo = new Date(now - 3 * 60 * 60 * 1000).toISOString();

      mockSend.mockResolvedValueOnce({
        Items: [
          {
            keygenMachineId: "mach_recent",
            userId: "user-A",
            lastSeenAt: ninetyMinutesAgo,
          },
          {
            keygenMachineId: "mach_stale",
            userId: "user-A",
            lastSeenAt: threeHoursAgo,
          },
        ],
      });

      // No windowHours param — should use 2-hour default
      const result = await getActiveUserDevicesInWindow("lic_123", "user-A");

      expect(result).toHaveLength(1);
      expect(result[0].keygenMachineId).toBe("mach_recent");
    });

    it("should accept custom window hours", async () => {
      const now = Date.now();
      const fiveHoursAgo = new Date(now - 5 * 60 * 60 * 1000).toISOString();

      mockSend.mockResolvedValueOnce({
        Items: [
          {
            keygenMachineId: "mach_1",
            userId: "user-A",
            lastSeenAt: fiveHoursAgo,
          },
        ],
      });

      // 8-hour window should include device from 5 hours ago
      const result = await getActiveUserDevicesInWindow("lic_123", "user-A", 8);
      expect(result).toHaveLength(1);

      // Reset mock for 4-hour window test
      mockSend.mockResolvedValueOnce({
        Items: [
          {
            keygenMachineId: "mach_1",
            userId: "user-A",
            lastSeenAt: fiveHoursAgo,
          },
        ],
      });

      // 4-hour window should exclude device from 5 hours ago
      const result2 = await getActiveUserDevicesInWindow(
        "lic_123",
        "user-A",
        4,
      );
      expect(result2).toHaveLength(0);
    });

    it("should use createdAt when lastSeenAt is missing", async () => {
      const now = Date.now();
      const oneHourAgo = new Date(now - 1 * 60 * 60 * 1000).toISOString();

      mockSend.mockResolvedValueOnce({
        Items: [
          {
            keygenMachineId: "mach_1",
            userId: "user-A",
            createdAt: oneHourAgo,
          },
        ],
      });

      const result = await getActiveUserDevicesInWindow("lic_123", "user-A");

      expect(result).toHaveLength(1);
      expect(result[0].keygenMachineId).toBe("mach_1");
    });

    it("should exclude stale devices outside window", async () => {
      const now = Date.now();
      const twentyFourHoursAgo = new Date(
        now - 24 * 60 * 60 * 1000,
      ).toISOString();

      mockSend.mockResolvedValueOnce({
        Items: [
          {
            keygenMachineId: "mach_stale",
            userId: "user-A",
            lastSeenAt: twentyFourHoursAgo,
          },
        ],
      });

      // Default 2-hour window — 24 hours ago is well outside
      const result = await getActiveUserDevicesInWindow("lic_123", "user-A");

      expect(result).toHaveLength(0);
    });

    it("should return empty array when licenseId is missing", async () => {
      const result = await getActiveUserDevicesInWindow(null, "user-A");
      expect(result).toHaveLength(0);
      expect(mockSend.callCount).toBe(0);
    });

    it("should return empty array when userId is missing", async () => {
      const result = await getActiveUserDevicesInWindow("lic_123", null);
      expect(result).toHaveLength(0);
      expect(mockSend.callCount).toBe(0);
    });

    it("should not include other users' active devices", async () => {
      const now = Date.now();
      const tenMinutesAgo = new Date(now - 10 * 60 * 1000).toISOString();

      mockSend.mockResolvedValueOnce({
        Items: [
          {
            keygenMachineId: "mach_1",
            userId: "user-A",
            lastSeenAt: tenMinutesAgo,
          },
          {
            keygenMachineId: "mach_2",
            userId: "user-B",
            lastSeenAt: tenMinutesAgo,
          },
          {
            keygenMachineId: "mach_3",
            userId: "user-C",
            lastSeenAt: tenMinutesAgo,
          },
        ],
      });

      const result = await getActiveUserDevicesInWindow("lic_123", "user-B");

      expect(result).toHaveLength(1);
      expect(result[0].keygenMachineId).toBe("mach_2");
      expect(result[0].userId).toBe("user-B");
    });
  });
});
