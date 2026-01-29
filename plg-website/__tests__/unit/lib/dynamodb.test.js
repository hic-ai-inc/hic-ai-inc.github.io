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
  createLicense,
  updateLicenseStatus,
  getLicenseDevices,
  addDeviceActivation,
  removeDeviceActivation,
  updateDeviceLastSeen,
  getOrgMembers,
  updateOrgMemberStatus,
  getOrgLicenseUsage,
  dynamodb,
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
    it("should query GSI2 with lowercased email", async () => {
      mockSend.mockResolvedValue({
        Items: [{ email: "test@example.com" }],
      });

      const result = await getCustomerByEmail("Test@Example.COM");

      expect(result).toEqual({ email: "test@example.com" });

      const command = mockSend.calls[0][0];
      expect(command.input.IndexName).toBe("GSI2");
      expect(command.input.ExpressionAttributeValues[":pk"]).toBe(
        "EMAIL#test@example.com",
      );
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
  });

  describe("addDeviceActivation", () => {
    it("should create device record and increment counter", async () => {
      mockSend.mockResolvedValue({});

      const result = await addDeviceActivation({
        keygenLicenseId: "lic_123",
        keygenMachineId: "mach_new",
        fingerprint: "abc123fingerprint",
        name: "MacBook Pro",
        platform: "darwin",
      });

      // Should call send twice (device record + increment counter)
      expect(mockSend.callCount).toBe(2);

      expect(result.keygenMachineId).toBe("mach_new");
      expect(result.fingerprint).toBe("abc123fingerprint");
      expect(result.platform).toBe("darwin");
      expect(result.createdAt).toBeDefined();
      expect(result.lastSeenAt).toBeDefined();
    });
  });

  describe("removeDeviceActivation", () => {
    it("should delete device record and decrement counter", async () => {
      mockSend.mockResolvedValue({});

      await removeDeviceActivation("lic_123", "mach_remove");

      // Should call send twice (delete device + decrement counter)
      expect(mockSend.callCount).toBe(2);

      // First call should be DeleteCommand
      const deleteCommand = mockSend.calls[0][0];
      expect(deleteCommand.input.Key.PK).toBe("LICENSE#lic_123");
      expect(deleteCommand.input.Key.SK).toBe("DEVICE#mach_remove");

      // Second call should be UpdateCommand to decrement
      const updateCommand = mockSend.calls[1][0];
      expect(updateCommand.input.UpdateExpression).toContain(
        "activatedDevices",
      );
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
});
