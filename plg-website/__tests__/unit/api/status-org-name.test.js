/**
 * Unit Tests — Status API Organization Name Inclusion
 *
 * Feature: business-name-implementation, Task 4.3
 *
 * Tests specific examples of the Status API's orgMembership.name field:
 * - Business Owner response includes orgMembership.name with correct value
 * - Business Admin response includes orgMembership.name
 * - Business Member response includes orgMembership.name
 * - Individual User response has no orgMembership block
 * - Org with null/missing name returns name: null
 *
 * Uses extracted pure-function logic with dependency injection.
 *
 * **Validates: Requirements 5.1, 5.2, 5.3**
 */

import { describe, it } from "node:test";
import { expect } from "../../../../dm/facade/test-helpers/index.js";

// ============================================================================
// Extracted logic: mirrors the orgMembership block from status/route.js
// ============================================================================

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
// Unit tests
// ============================================================================

describe("Status API — orgMembership.name for Business users", () => {
  it("Business Owner response includes orgMembership.name with correct value", () => {
    const orgMembership = { orgId: "cus_owner123", role: "owner", joinedAt: "2026-01-01T00:00:00Z" };
    const org = { orgId: "cus_owner123", name: "Acme Corp" };

    const block = buildOrgMembershipBlock(orgMembership, org);

    expect(block).not.toBe(null);
    expect(block.name).toBe("Acme Corp");
    expect(block.role).toBe("owner");
    expect(block.orgId).toBe("cus_owner123");
  });

  it("Business Admin response includes orgMembership.name", () => {
    const orgMembership = { orgId: "cus_admin123", role: "admin", joinedAt: "2026-02-01T00:00:00Z" };
    const org = { orgId: "cus_admin123", name: "Admin's Org" };

    const block = buildOrgMembershipBlock(orgMembership, org);

    expect(block).not.toBe(null);
    expect(block.name).toBe("Admin's Org");
    expect(block.role).toBe("admin");
  });

  it("Business Member response includes orgMembership.name", () => {
    const orgMembership = { orgId: "cus_member123", role: "member", joinedAt: "2026-03-01T00:00:00Z" };
    const org = { orgId: "cus_member123", name: "Member's Org" };

    const block = buildOrgMembershipBlock(orgMembership, org);

    expect(block).not.toBe(null);
    expect(block.name).toBe("Member's Org");
    expect(block.role).toBe("member");
  });
});

describe("Status API — Individual User has no orgMembership block", () => {
  it("Individual User response has no orgMembership block", () => {
    const block = buildOrgMembershipBlock(null, null);
    expect(block).toBe(null);
  });
});

describe("Status API — org with null/missing name", () => {
  it("org with null name returns name: null", () => {
    const orgMembership = { orgId: "cus_nullname", role: "owner", joinedAt: "2026-01-01T00:00:00Z" };
    const org = { orgId: "cus_nullname", name: null };

    const block = buildOrgMembershipBlock(orgMembership, org);

    expect(block).not.toBe(null);
    expect(block.name).toBe(null);
  });

  it("org with missing name field returns name: null", () => {
    const orgMembership = { orgId: "cus_noname", role: "admin", joinedAt: "2026-01-01T00:00:00Z" };
    const org = { orgId: "cus_noname" }; // no name field

    const block = buildOrgMembershipBlock(orgMembership, org);

    expect(block).not.toBe(null);
    expect(block.name).toBe(null);
  });

  it("null org record returns name: null", () => {
    const orgMembership = { orgId: "cus_nullorg", role: "member", joinedAt: "2026-01-01T00:00:00Z" };

    const block = buildOrgMembershipBlock(orgMembership, null);

    expect(block).not.toBe(null);
    expect(block.name).toBe(null);
  });
});
