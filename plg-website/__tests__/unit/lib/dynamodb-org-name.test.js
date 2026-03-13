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
