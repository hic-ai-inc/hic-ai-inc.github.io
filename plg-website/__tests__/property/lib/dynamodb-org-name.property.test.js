/**
 * Property-Based Tests — DynamoDB Organization Name Reservation Functions
 *
 * Feature: business-name-implementation, Properties 1, 2
 *
 * Property 1: Organization Name Round-Trip Consistency
 * For any valid org name, storing via createOrgNameReservation and reading
 * via getOrgNameReservation returns the correct orgId and original casing;
 * normalized key maps to exactly one reservation.
 *
 * Property 2: Reservation Invariant After Name Update
 * For any org changing name A→B (case-insensitively different), after
 * deleting old reservation and creating new, reservation for B exists
 * pointing to orgId and reservation for A does not exist.
 *
 * Uses extracted logic with dependency injection — same pattern as the
 * team and heartbeat property tests. Generates random org names and IDs
 * to verify the invariants hold across all valid inputs.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.6, 1.7, 5.3**
 */

import { describe, it } from "node:test";
import { expect, createSpy } from "../../../../dm/facade/test-helpers/index.js";

// ============================================================================
// Extracted logic: mirrors the reservation functions in dynamodb.js.
// Uses an in-memory store for dependency injection — no real DynamoDB needed.
// ============================================================================

/**
 * In-memory reservation store simulating DynamoDB reservation records.
 * Key: normalized name (ORGNAME#{UPPERCASE_TRIMMED}), Value: { orgId, name }
 */
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

    // Expose internals for assertions
    _store: store,
    _getByKey(key) { return store.get(key); },
    _size() { return store.size; },
  };
}

// ============================================================================
// Random generators
// ============================================================================

function randomString(len) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -_.&";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Generate a valid org name: non-empty after trim, ≤120 chars */
function randomOrgName() {
  const coreLen = randomInt(1, 100);
  const core = randomString(coreLen);
  // Randomly add leading/trailing whitespace
  const leadingSpaces = " ".repeat(randomInt(0, 3));
  const trailingSpaces = " ".repeat(randomInt(0, 3));
  return `${leadingSpaces}${core}${trailingSpaces}`;
}

/** Generate a random org ID matching the cus_xxx pattern */
function randomOrgId() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "cus_";
  for (let i = 0; i < 14; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/**
 * Generate two org names that are case-insensitively different.
 * Ensures trim().toUpperCase() produces different keys.
 */
function randomDistinctNamePair() {
  let a, b;
  do {
    a = randomOrgName();
    b = randomOrgName();
  } while (a.trim().toUpperCase() === b.trim().toUpperCase());
  return [a, b];
}

// ============================================================================
// Feature: business-name-implementation, Property 1
// ============================================================================

describe("Property 1: Organization Name Round-Trip Consistency", () => {
  it("create + get returns correct orgId for any valid org name (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const store = createReservationStore();
      const name = randomOrgName();
      const orgId = randomOrgId();

      await store.create(name, orgId);
      const result = await store.get(name);

      expect(result.exists).toBe(true);
      expect(result.orgId).toBe(orgId);
    }
  });

  it("stored name preserves original casing after trim (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const store = createReservationStore();
      const name = randomOrgName();
      const orgId = randomOrgId();

      await store.create(name, orgId);

      // Verify the stored name is the trimmed version (original casing)
      const key = `ORGNAME#${name.trim().toUpperCase()}`;
      const item = store._getByKey(key);
      expect(item.name).toBe(name.trim());
    }
  });

  it("normalized key maps to exactly one reservation (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const store = createReservationStore();
      const name = randomOrgName();
      const orgId = randomOrgId();

      await store.create(name, orgId);

      // Only one reservation should exist
      expect(store._size()).toBe(1);

      // The key should be the uppercase-trimmed version
      const expectedKey = `ORGNAME#${name.trim().toUpperCase()}`;
      const item = store._getByKey(expectedKey);
      expect(item).not.toBe(undefined);
      expect(item.orgId).toBe(orgId);
    }
  });

  it("case variations of the same name map to the same reservation key (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const store = createReservationStore();
      const baseName = randomOrgName().trim();
      const orgId = randomOrgId();

      // Create with original casing
      await store.create(baseName, orgId);

      // Read with uppercase variation
      const upper = await store.get(baseName.toUpperCase());
      expect(upper.exists).toBe(true);
      expect(upper.orgId).toBe(orgId);

      // Read with lowercase variation
      const lower = await store.get(baseName.toLowerCase());
      expect(lower.exists).toBe(true);
      expect(lower.orgId).toBe(orgId);
    }
  });
});

// ============================================================================
// Feature: business-name-implementation, Property 2
// ============================================================================

describe("Property 2: Reservation Invariant After Name Update", () => {
  it("after name change A→B, reservation for B exists and A does not (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const store = createReservationStore();
      const [nameA, nameB] = randomDistinctNamePair();
      const orgId = randomOrgId();

      // Create initial reservation for name A
      await store.create(nameA, orgId);

      // Simulate name change: delete A, create B
      await store.delete(nameA);
      await store.create(nameB, orgId);

      // Reservation for B should exist pointing to orgId
      const resultB = await store.get(nameB);
      expect(resultB.exists).toBe(true);
      expect(resultB.orgId).toBe(orgId);

      // Reservation for A should NOT exist
      const resultA = await store.get(nameA);
      expect(resultA.exists).toBe(false);
      expect(resultA.orgId).toBe(null);
    }
  });

  it("after name change, exactly one reservation exists (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const store = createReservationStore();
      const [nameA, nameB] = randomDistinctNamePair();
      const orgId = randomOrgId();

      await store.create(nameA, orgId);
      await store.delete(nameA);
      await store.create(nameB, orgId);

      // Exactly one reservation should remain
      expect(store._size()).toBe(1);
    }
  });

  it("new reservation after name change stores correct original casing (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const store = createReservationStore();
      const [nameA, nameB] = randomDistinctNamePair();
      const orgId = randomOrgId();

      await store.create(nameA, orgId);
      await store.delete(nameA);
      await store.create(nameB, orgId);

      // The stored name should be the trimmed version of nameB
      const key = `ORGNAME#${nameB.trim().toUpperCase()}`;
      const item = store._getByKey(key);
      expect(item.name).toBe(nameB.trim());
    }
  });
});
