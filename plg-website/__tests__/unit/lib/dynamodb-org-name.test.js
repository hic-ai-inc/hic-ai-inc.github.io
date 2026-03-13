/**
 * Unit Tests — DynamoDB Organization Name Reservation Functions
 *
 * Feature: business-name-implementation, Tasks 1.1, 1.3
 *
 * Tests the three reservation functions using extracted logic with
 * an in-memory store (same dependency injection pattern as other tests).
 *
 * - getOrgNameReservation returns {exists: true, orgId} for existing
 * - getOrgNameReservation returns {exists: false, orgId: null} for missing
 * - createOrgNameReservation succeeds for new name
 * - createOrgNameReservation throws ConditionalCheckFailedException for duplicate
 * - deleteOrgNameReservation removes the reservation record
 * - Case-insensitive normalization: "Acme Corp" and "ACME CORP" produce same key
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.7**
 */

import { describe, it } from "node:test";
import { expect } from "../../../../dm/facade/test-helpers/index.js";

// ============================================================================
// Extracted logic: mirrors the reservation functions in dynamodb.js.
// In-memory store simulates DynamoDB conditional writes.
// ============================================================================

function createReservationStore() {
  const store = new Map();

  return {
    async get(name) {
      const key = `ORGNAME#${name.trim().toUpperCase()}`;
      const item = store.get(key);
      if (item) return { exists: true, orgId: item.orgId };
      return { exists: false, orgId: null };
    },

    async create(name, orgId) {
      const key = `ORGNAME#${name.trim().toUpperCase()}`;
      if (store.has(key)) {
        const err = new Error("The conditional request failed");
        err.name = "ConditionalCheckFailedException";
        throw err;
      }
      store.set(key, { orgId, name: name.trim(), createdAt: new Date().toISOString() });
    },

    async delete(name) {
      const key = `ORGNAME#${name.trim().toUpperCase()}`;
      store.delete(key);
    },

    _size() { return store.size; },
  };
}

// ============================================================================
// Unit tests
// ============================================================================

describe("DynamoDB org name reservation — getOrgNameReservation", () => {
  it("returns {exists: true, orgId} for existing reservation", async () => {
    const store = createReservationStore();
    await store.create("Acme Corp", "cus_abc123");

    const result = await store.get("Acme Corp");
    expect(result.exists).toBe(true);
    expect(result.orgId).toBe("cus_abc123");
  });

  it("returns {exists: false, orgId: null} for non-existent reservation", async () => {
    const store = createReservationStore();

    const result = await store.get("Nonexistent Corp");
    expect(result.exists).toBe(false);
    expect(result.orgId).toBe(null);
  });
});

describe("DynamoDB org name reservation — createOrgNameReservation", () => {
  it("succeeds for new name", async () => {
    const store = createReservationStore();
    await store.create("Acme Corp", "cus_abc123");

    const result = await store.get("Acme Corp");
    expect(result.exists).toBe(true);
    expect(result.orgId).toBe("cus_abc123");
  });

  it("throws ConditionalCheckFailedException for duplicate name", async () => {
    const store = createReservationStore();
    await store.create("Acme Corp", "cus_abc123");

    let threw = false;
    let errorName = "";
    try {
      await store.create("Acme Corp", "cus_different");
    } catch (err) {
      threw = true;
      errorName = err.name;
    }

    expect(threw).toBe(true);
    expect(errorName).toBe("ConditionalCheckFailedException");
  });

  it("throws ConditionalCheckFailedException for case-variant duplicate", async () => {
    const store = createReservationStore();
    await store.create("Acme Corp", "cus_abc123");

    let threw = false;
    try {
      await store.create("ACME CORP", "cus_different");
    } catch (err) {
      threw = true;
      expect(err.name).toBe("ConditionalCheckFailedException");
    }

    expect(threw).toBe(true);
  });
});

describe("DynamoDB org name reservation — deleteOrgNameReservation", () => {
  it("removes the reservation record", async () => {
    const store = createReservationStore();
    await store.create("Acme Corp", "cus_abc123");

    await store.delete("Acme Corp");

    const result = await store.get("Acme Corp");
    expect(result.exists).toBe(false);
    expect(result.orgId).toBe(null);
  });

  it("delete is idempotent — deleting non-existent name does not throw", async () => {
    const store = createReservationStore();

    // Should not throw
    await store.delete("Nonexistent Corp");
    expect(store._size()).toBe(0);
  });
});

describe("DynamoDB org name reservation — case-insensitive normalization", () => {
  it('"Acme Corp" and "ACME CORP" produce the same key', async () => {
    const store = createReservationStore();
    await store.create("Acme Corp", "cus_abc123");

    // Reading with uppercase variant should find the same reservation
    const result = await store.get("ACME CORP");
    expect(result.exists).toBe(true);
    expect(result.orgId).toBe("cus_abc123");
  });

  it('"acme corp" and "Acme Corp" produce the same key', async () => {
    const store = createReservationStore();
    await store.create("Acme Corp", "cus_abc123");

    const result = await store.get("acme corp");
    expect(result.exists).toBe(true);
    expect(result.orgId).toBe("cus_abc123");
  });

  it("leading/trailing whitespace is trimmed before normalization", async () => {
    const store = createReservationStore();
    await store.create("  Acme Corp  ", "cus_abc123");

    const result = await store.get("Acme Corp");
    expect(result.exists).toBe(true);
    expect(result.orgId).toBe("cus_abc123");
  });

  it("deleting with different casing removes the reservation", async () => {
    const store = createReservationStore();
    await store.create("Acme Corp", "cus_abc123");

    await store.delete("ACME CORP");

    const result = await store.get("Acme Corp");
    expect(result.exists).toBe(false);
  });
});


// ============================================================================
// Extracted logic: migrateCustomerUserId — MEMBER record migration & ORG ownerId update
//
// In-memory store simulates the DynamoDB operations performed by
// migrateCustomerUserId (Layer 2) when migrating from email: prefix
// userId to Cognito UUID.
// ============================================================================

function createMigrationStore() {
  const records = new Map(); // key = "PK|SK"
  const gsi1Index = new Map(); // key = "GSI1PK|GSI1SK" → "PK|SK"

  function key(pk, sk) { return `${pk}|${sk}`; }

  return {
    put(item) {
      const k = key(item.PK, item.SK);
      records.set(k, { ...item });
      if (item.GSI1PK && item.GSI1SK) {
        gsi1Index.set(key(item.GSI1PK, item.GSI1SK), k);
      }
    },

    get(pk, sk) {
      return records.get(key(pk, sk)) || null;
    },

    delete(pk, sk) {
      const k = key(pk, sk);
      const item = records.get(k);
      if (item && item.GSI1PK && item.GSI1SK) {
        gsi1Index.delete(key(item.GSI1PK, item.GSI1SK));
      }
      records.delete(k);
    },

    queryGSI1(gsi1pk, gsi1skPrefix) {
      const results = [];
      for (const [gsiKey, recordKey] of gsi1Index.entries()) {
        const [gpk, gsk] = gsiKey.split("|");
        if (gpk === gsi1pk && gsk.startsWith(gsi1skPrefix)) {
          const item = records.get(recordKey);
          if (item) results.push({ ...item });
        }
      }
      return results;
    },

    update(pk, sk, updates) {
      const k = key(pk, sk);
      const item = records.get(k);
      if (item) {
        Object.assign(item, updates);
        records.set(k, item);
      }
    },

    /**
     * Simulates the Layer 2 logic of migrateCustomerUserId:
     * 1. Query GSI1 for MEMBER records under oldUserId
     * 2. Create new MEMBER records with newUserId
     * 3. Delete old MEMBER records
     * 4. Update ORG DETAILS ownerId from old to new
     */
    async migrateMemberRecords(oldUserId, newUserId, orgId) {
      // Step 1: Find MEMBER records under old userId via GSI1
      const oldMembers = this.queryGSI1(`USER#${oldUserId}`, "ORG#");

      // Step 2 & 3: Create new, delete old
      for (const oldMember of oldMembers) {
        this.put({
          ...oldMember,
          SK: `MEMBER#${newUserId}`,
          GSI1PK: `USER#${newUserId}`,
          memberId: newUserId,
        });
        this.delete(oldMember.PK, oldMember.SK);
      }

      // Step 4: Update ORG DETAILS ownerId
      const orgDetails = this.get(`ORG#${orgId}`, "DETAILS");
      if (orgDetails && orgDetails.ownerId === oldUserId) {
        this.update(`ORG#${orgId}`, "DETAILS", {
          ownerId: newUserId,
          updatedAt: new Date().toISOString(),
        });
      }

      return { migratedCount: oldMembers.length };
    },

    _size() { return records.size; },
  };
}

// ============================================================================
// migrateCustomerUserId — MEMBER record migration (Layer 2)
// ============================================================================

describe("migrateCustomerUserId — MEMBER record migration", () => {
  const OLD_USER_ID = "email:owner@company.com";
  const NEW_USER_ID = "9448c4a8-e081-70fb-4a30-a4ce0f67b8d0";
  const ORG_ID = "cus_TuLKmYGoqenkv9";

  it("migrates MEMBER record SK from old userId to new userId", async () => {
    const store = createMigrationStore();

    // Seed: MEMBER record with email: prefix userId (pre-migration state)
    store.put({
      PK: `ORG#${ORG_ID}`,
      SK: `MEMBER#${OLD_USER_ID}`,
      GSI1PK: `USER#${OLD_USER_ID}`,
      GSI1SK: `ORG#${ORG_ID}`,
      memberId: OLD_USER_ID,
      orgId: ORG_ID,
      role: "owner",
      status: "active",
    });

    // Seed: ORG DETAILS with stale ownerId
    store.put({
      PK: `ORG#${ORG_ID}`,
      SK: "DETAILS",
      ownerId: OLD_USER_ID,
      name: "Test Organization",
    });

    await store.migrateMemberRecords(OLD_USER_ID, NEW_USER_ID, ORG_ID);

    // Old MEMBER record should be gone
    const oldMember = store.get(`ORG#${ORG_ID}`, `MEMBER#${OLD_USER_ID}`);
    expect(oldMember).toBe(null);

    // New MEMBER record should exist with updated fields
    const newMember = store.get(`ORG#${ORG_ID}`, `MEMBER#${NEW_USER_ID}`);
    expect(newMember).not.toBe(null);
    expect(newMember.memberId).toBe(NEW_USER_ID);
    expect(newMember.GSI1PK).toBe(`USER#${NEW_USER_ID}`);
    expect(newMember.role).toBe("owner");
    expect(newMember.status).toBe("active");
    expect(newMember.orgId).toBe(ORG_ID);
  });

  it("updates ORG DETAILS ownerId from old userId to new userId", async () => {
    const store = createMigrationStore();

    store.put({
      PK: `ORG#${ORG_ID}`,
      SK: `MEMBER#${OLD_USER_ID}`,
      GSI1PK: `USER#${OLD_USER_ID}`,
      GSI1SK: `ORG#${ORG_ID}`,
      memberId: OLD_USER_ID,
      orgId: ORG_ID,
      role: "owner",
      status: "active",
    });

    store.put({
      PK: `ORG#${ORG_ID}`,
      SK: "DETAILS",
      ownerId: OLD_USER_ID,
      name: "Test Organization",
    });

    await store.migrateMemberRecords(OLD_USER_ID, NEW_USER_ID, ORG_ID);

    const orgDetails = store.get(`ORG#${ORG_ID}`, "DETAILS");
    expect(orgDetails.ownerId).toBe(NEW_USER_ID);
    expect(orgDetails.updatedAt).not.toBe(undefined);
  });

  it("preserves GSI1SK on migrated MEMBER record", async () => {
    const store = createMigrationStore();

    store.put({
      PK: `ORG#${ORG_ID}`,
      SK: `MEMBER#${OLD_USER_ID}`,
      GSI1PK: `USER#${OLD_USER_ID}`,
      GSI1SK: `ORG#${ORG_ID}`,
      memberId: OLD_USER_ID,
      orgId: ORG_ID,
      role: "owner",
      status: "active",
    });

    store.put({
      PK: `ORG#${ORG_ID}`,
      SK: "DETAILS",
      ownerId: OLD_USER_ID,
    });

    await store.migrateMemberRecords(OLD_USER_ID, NEW_USER_ID, ORG_ID);

    const newMember = store.get(`ORG#${ORG_ID}`, `MEMBER#${NEW_USER_ID}`);
    expect(newMember.GSI1SK).toBe(`ORG#${ORG_ID}`);
  });

  it("new MEMBER record is queryable via GSI1 with new userId", async () => {
    const store = createMigrationStore();

    store.put({
      PK: `ORG#${ORG_ID}`,
      SK: `MEMBER#${OLD_USER_ID}`,
      GSI1PK: `USER#${OLD_USER_ID}`,
      GSI1SK: `ORG#${ORG_ID}`,
      memberId: OLD_USER_ID,
      orgId: ORG_ID,
      role: "owner",
      status: "active",
    });

    store.put({
      PK: `ORG#${ORG_ID}`,
      SK: "DETAILS",
      ownerId: OLD_USER_ID,
    });

    await store.migrateMemberRecords(OLD_USER_ID, NEW_USER_ID, ORG_ID);

    // GSI1 query with new userId should find the migrated MEMBER
    const results = store.queryGSI1(`USER#${NEW_USER_ID}`, "ORG#");
    expect(results.length).toBe(1);
    expect(results[0].memberId).toBe(NEW_USER_ID);
    expect(results[0].orgId).toBe(ORG_ID);

    // GSI1 query with old userId should find nothing
    const oldResults = store.queryGSI1(`USER#${OLD_USER_ID}`, "ORG#");
    expect(oldResults.length).toBe(0);
  });

  it("does not update ORG ownerId when ownerId does not match old userId", async () => {
    const store = createMigrationStore();
    const DIFFERENT_OWNER = "another-uuid-1234";

    store.put({
      PK: `ORG#${ORG_ID}`,
      SK: `MEMBER#${OLD_USER_ID}`,
      GSI1PK: `USER#${OLD_USER_ID}`,
      GSI1SK: `ORG#${ORG_ID}`,
      memberId: OLD_USER_ID,
      orgId: ORG_ID,
      role: "admin", // Not owner — different user is the owner
      status: "active",
    });

    store.put({
      PK: `ORG#${ORG_ID}`,
      SK: "DETAILS",
      ownerId: DIFFERENT_OWNER,
      name: "Other Owner's Org",
    });

    await store.migrateMemberRecords(OLD_USER_ID, NEW_USER_ID, ORG_ID);

    // MEMBER was still migrated
    const newMember = store.get(`ORG#${ORG_ID}`, `MEMBER#${NEW_USER_ID}`);
    expect(newMember).not.toBe(null);

    // But ORG ownerId was NOT changed (different owner)
    const orgDetails = store.get(`ORG#${ORG_ID}`, "DETAILS");
    expect(orgDetails.ownerId).toBe(DIFFERENT_OWNER);
  });

  it("handles no MEMBER records to migrate (non-org user)", async () => {
    const store = createMigrationStore();

    store.put({
      PK: `ORG#${ORG_ID}`,
      SK: "DETAILS",
      ownerId: "some-other-user",
    });

    const result = await store.migrateMemberRecords(OLD_USER_ID, NEW_USER_ID, ORG_ID);

    expect(result.migratedCount).toBe(0);
    // Store should only have the DETAILS record
    expect(store._size()).toBe(1);
  });

  it("migrates multiple MEMBER records across different orgs", async () => {
    const store = createMigrationStore();
    const ORG_ID_2 = "cus_SecondOrg";

    // MEMBER in first org
    store.put({
      PK: `ORG#${ORG_ID}`,
      SK: `MEMBER#${OLD_USER_ID}`,
      GSI1PK: `USER#${OLD_USER_ID}`,
      GSI1SK: `ORG#${ORG_ID}`,
      memberId: OLD_USER_ID,
      orgId: ORG_ID,
      role: "owner",
      status: "active",
    });

    // MEMBER in second org (theoretically, user could be member of multiple)
    store.put({
      PK: `ORG#${ORG_ID_2}`,
      SK: `MEMBER#${OLD_USER_ID}`,
      GSI1PK: `USER#${OLD_USER_ID}`,
      GSI1SK: `ORG#${ORG_ID_2}`,
      memberId: OLD_USER_ID,
      orgId: ORG_ID_2,
      role: "member",
      status: "active",
    });

    store.put({
      PK: `ORG#${ORG_ID}`,
      SK: "DETAILS",
      ownerId: OLD_USER_ID,
    });

    // Note: migrateMemberRecords queries GSI1 for ALL orgs the user belongs to
    // The actual implementation queries GSI1 which returns records across all orgs
    const result = await store.migrateMemberRecords(OLD_USER_ID, NEW_USER_ID, ORG_ID);

    // Both MEMBER records should be migrated
    expect(result.migratedCount).toBe(2);

    const newMember1 = store.get(`ORG#${ORG_ID}`, `MEMBER#${NEW_USER_ID}`);
    expect(newMember1).not.toBe(null);
    expect(newMember1.role).toBe("owner");

    const newMember2 = store.get(`ORG#${ORG_ID_2}`, `MEMBER#${NEW_USER_ID}`);
    expect(newMember2).not.toBe(null);
    expect(newMember2.role).toBe("member");
  });

  it("preserves all MEMBER record fields during migration", async () => {
    const store = createMigrationStore();
    const joinedAt = "2026-02-02T23:34:55.567Z";

    store.put({
      PK: `ORG#${ORG_ID}`,
      SK: `MEMBER#${OLD_USER_ID}`,
      GSI1PK: `USER#${OLD_USER_ID}`,
      GSI1SK: `ORG#${ORG_ID}`,
      GSI2PK: `EMAIL#owner@company.com`,
      GSI2SK: `MEMBER#${ORG_ID}`,
      memberId: OLD_USER_ID,
      orgId: ORG_ID,
      email: "owner@company.com",
      name: "Test Owner",
      role: "owner",
      status: "active",
      joinedAt,
    });

    store.put({
      PK: `ORG#${ORG_ID}`,
      SK: "DETAILS",
      ownerId: OLD_USER_ID,
    });

    await store.migrateMemberRecords(OLD_USER_ID, NEW_USER_ID, ORG_ID);

    const newMember = store.get(`ORG#${ORG_ID}`, `MEMBER#${NEW_USER_ID}`);
    // Fields that SHOULD be updated
    expect(newMember.SK).toBe(`MEMBER#${NEW_USER_ID}`);
    expect(newMember.GSI1PK).toBe(`USER#${NEW_USER_ID}`);
    expect(newMember.memberId).toBe(NEW_USER_ID);

    // Fields that SHOULD be preserved
    expect(newMember.PK).toBe(`ORG#${ORG_ID}`);
    expect(newMember.GSI1SK).toBe(`ORG#${ORG_ID}`);
    expect(newMember.GSI2PK).toBe(`EMAIL#owner@company.com`);
    expect(newMember.GSI2SK).toBe(`MEMBER#${ORG_ID}`);
    expect(newMember.orgId).toBe(ORG_ID);
    expect(newMember.email).toBe("owner@company.com");
    expect(newMember.name).toBe("Test Owner");
    expect(newMember.role).toBe("owner");
    expect(newMember.status).toBe("active");
    expect(newMember.joinedAt).toBe(joinedAt);
  });
});

// ============================================================================
// getOrgLicenseUsage — seat counting behavior
// ============================================================================

describe("getOrgLicenseUsage — seat counting", () => {
  /**
   * Extracted logic: mirrors the seat counting in getOrgLicenseUsage.
   * Seat count = active MEMBER records. Owner is counted as a MEMBER record.
   * If memberCount is 0 but org has an ownerId, that's anomalous.
   */
  function calculateSeatUsage(org, memberCount) {
    const seatLimit = org.seatLimit || 0;

    const anomalous = memberCount === 0 && org.ownerId;
    const seatsUsed = memberCount;

    return {
      seatLimit,
      seatsUsed,
      seatsAvailable: Math.max(0, seatLimit - seatsUsed),
      utilizationPercent: seatLimit > 0 ? Math.round((seatsUsed / seatLimit) * 100) : 0,
      anomalous: !!anomalous,
    };
  }

  it("counts owner MEMBER record as a seat", () => {
    // Owner has a MEMBER record + 2 invited members = 3 seats used
    const result = calculateSeatUsage({ seatLimit: 5, ownerId: "uuid-owner" }, 3);

    expect(result.seatsUsed).toBe(3);
    expect(result.seatsAvailable).toBe(2);
    expect(result.utilizationPercent).toBe(60);
    expect(result.anomalous).toBe(false);
  });

  it("owner alone uses exactly 1 seat", () => {
    // Brand new org: just the owner MEMBER record
    const result = calculateSeatUsage({ seatLimit: 5, ownerId: "uuid-owner" }, 1);

    expect(result.seatsUsed).toBe(1);
    expect(result.seatsAvailable).toBe(4);
    expect(result.utilizationPercent).toBe(20);
    expect(result.anomalous).toBe(false);
  });

  it("flags anomalous state when zero MEMBER records but ownerId exists", () => {
    // This is the BUG-5 scenario: owner has no MEMBER record
    const result = calculateSeatUsage({ seatLimit: 5, ownerId: "uuid-owner" }, 0);

    expect(result.seatsUsed).toBe(0);
    expect(result.anomalous).toBe(true);
  });

  it("does not flag anomalous when zero members and no ownerId (empty org)", () => {
    const result = calculateSeatUsage({ seatLimit: 0 }, 0);

    expect(result.seatsUsed).toBe(0);
    expect(result.anomalous).toBe(false);
  });

  it("calculates 100% utilization at full capacity", () => {
    const result = calculateSeatUsage({ seatLimit: 5, ownerId: "uuid-owner" }, 5);

    expect(result.seatsUsed).toBe(5);
    expect(result.seatsAvailable).toBe(0);
    expect(result.utilizationPercent).toBe(100);
  });

  it("clamps seatsAvailable to 0 when over-provisioned", () => {
    // Edge case: more members than seats (race condition or manual adjustment)
    const result = calculateSeatUsage({ seatLimit: 3, ownerId: "uuid-owner" }, 5);

    expect(result.seatsUsed).toBe(5);
    expect(result.seatsAvailable).toBe(0);
    expect(result.utilizationPercent).toBe(167);
  });
});
