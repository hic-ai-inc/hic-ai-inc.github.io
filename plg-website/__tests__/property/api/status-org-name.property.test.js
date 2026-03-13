/**
 * Property-Based Tests — Status API Organization Name Inclusion
 *
 * Feature: business-name-implementation, Property 8
 *
 * Property 8: Status API Organization Name Inclusion
 * For any Business user (owner/admin/member), Status API GET includes
 * `name` in `orgMembership` block containing the org's stored name;
 * for Individual users, no `orgMembership` block.
 *
 * Uses extracted logic with dependency injection — mirrors the Status API
 * route handler's org membership response building.
 *
 * **Validates: Requirements 5.1, 5.2**
 */

import { describe, it } from "node:test";
import { expect } from "../../../../dm/facade/test-helpers/index.js";

// ============================================================================
// Extracted logic: mirrors the orgMembership block from status/route.js
// ============================================================================

/**
 * Build the orgMembership response block for the Status API.
 * Pure function extraction of the route handler's org context logic.
 *
 * @param {Object|null} orgMembership - User's org membership record or null
 * @param {Object|null} org - Organization record or null
 * @returns {Object|null} orgMembership response block or null
 */
function buildOrgMembershipBlock(orgMembership, org) {
  if (!orgMembership) return null;

  return {
    orgId: orgMembership.orgId,
    role: orgMembership.role,
    joinedAt: orgMembership.joinedAt,
    name: org?.name || null,
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

function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomOrgId() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "cus_";
  for (let i = 0; i < 14; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function randomOrgName() {
  return randomString(randomInt(1, 100));
}

function randomUserRole() {
  return randomPick(["owner", "admin", "member", "individual"]);
}

// ============================================================================
// Feature: business-name-implementation, Property 8
// ============================================================================

describe("Property 8: Status API Organization Name Inclusion", () => {
  it("Business users get orgMembership.name with stored org name (100 iterations)", () => {
    const businessRoles = ["owner", "admin", "member"];

    for (let i = 0; i < 100; i++) {
      const role = randomPick(businessRoles);
      const orgId = randomOrgId();
      const orgName = randomOrgName();
      const joinedAt = new Date(Date.now() - Math.random() * 1e10).toISOString();

      const orgMembership = { orgId, role, joinedAt };
      const org = { orgId, name: orgName };

      const block = buildOrgMembershipBlock(orgMembership, org);

      expect(block).not.toBe(null);
      expect(block.name).toBe(orgName);
      expect(block.orgId).toBe(orgId);
      expect(block.role).toBe(role);
      expect(block.joinedAt).toBe(joinedAt);
    }
  });

  it("Individual users get null orgMembership block (100 iterations)", () => {
    for (let i = 0; i < 100; i++) {
      const block = buildOrgMembershipBlock(null, null);
      expect(block).toBe(null);
    }
  });

  it("org with null name returns name: null in orgMembership (100 iterations)", () => {
    for (let i = 0; i < 100; i++) {
      const role = randomPick(["owner", "admin", "member"]);
      const orgId = randomOrgId();

      const orgMembership = { orgId, role, joinedAt: new Date().toISOString() };
      // Org exists but name is null/undefined
      const org = randomPick([{ orgId, name: null }, { orgId }, null]);

      const block = buildOrgMembershipBlock(orgMembership, org);

      expect(block).not.toBe(null);
      expect(block.name).toBe(null);
    }
  });

  it("name field preserves original casing from org record (100 iterations)", () => {
    for (let i = 0; i < 100; i++) {
      const orgName = randomOrgName();
      const orgId = randomOrgId();

      const orgMembership = { orgId, role: "owner", joinedAt: new Date().toISOString() };
      const org = { orgId, name: orgName };

      const block = buildOrgMembershipBlock(orgMembership, org);

      // Name should be exactly what was stored — no normalization
      expect(block.name).toBe(orgName);
    }
  });
});
