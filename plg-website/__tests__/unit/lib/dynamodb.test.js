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
  addDeviceActivation,
  removeDeviceActivation,
  updateDeviceLastSeen,
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
      });

      // Should call send 3 times (getLicenseDevices + device record + increment counter)
      expect(mockSend.callCount).toBe(3);

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
      expect(command.input.ExpressionAttributeValues[":updatedAt"]).toBeTruthy();
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
      expect(command.input.ExpressionAttributeValues[":pk"]).toBe("USER#user_123");
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
          minVersion: "0.9.0",
          updateUrl: {
            marketplace: "https://marketplace.visualstudio.com/items?itemName=hic-ai.mouse",
          },
          releaseNotesUrl: "https://hic.ai/mouse/changelog",
        },
      });

      const result = await getVersionConfig("mouse");

      expect(result).not.toBeNull();
      expect(result.latestVersion).toBe("0.10.0");
      expect(result.minVersion).toBe("0.9.0");
      expect(result.updateUrl.marketplace).toContain("marketplace.visualstudio.com");
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
});
