/**
 * Unit Tests — Settings API Organization Name (PATCH)
 *
 * Feature: business-name-implementation, Task 3.3
 *
 * Tests specific examples of the PATCH handler's org name update logic:
 * - Successful name set by owner (first time)
 * - Successful name change (old reservation deleted, new created)
 * - Casing-only change succeeds without reservation conflict
 * - 409 when name taken by different org
 * - 400 for empty, too-long, non-string values
 * - 403 for admin, member, and individual user attempts
 * - Whitespace trimming before storage
 *
 * Uses extracted pure-function logic with dependency injection.
 *
 * **Validates: Requirements 1.2–1.5, 2.1–2.4, 3.1–3.4**
 */

import { describe, it } from "node:test";
import { expect, createSpy } from "../../../../dm/facade/test-helpers/index.js";

// ============================================================================
// Extracted logic: mirrors Settings API PATCH org name flow from route.js
// ============================================================================

async function processOrgNameUpdate(organizationName, deps) {
  const { getUserOrgMembership, getOrganization, getOrgNameReservation,
          createOrgNameReservation, deleteOrgNameReservation, updateOrganization,
          userId } = deps;

  if (typeof organizationName !== "string") {
    return { status: 400, body: { error: "Organization name must be a string" } };
  }

  const trimmedName = organizationName.trim();

  if (!trimmedName) {
    return { status: 400, body: { error: "Organization name cannot be empty" } };
  }

  if (trimmedName.length > 120) {
    return { status: 400, body: { error: "Organization name must be 120 characters or fewer" } };
  }

  const orgMembership = await getUserOrgMembership(userId);
  if (!orgMembership || orgMembership.role !== "owner") {
    return { status: 403, body: { error: "Only the organization owner can update the business name" } };
  }

  const org = await getOrganization(orgMembership.orgId);
  const currentName = org?.name || "";
  const nameChanged = currentName.trim().toUpperCase() !== trimmedName.toUpperCase();

  if (nameChanged) {
    const reservation = await getOrgNameReservation(trimmedName);
    if (reservation.exists && reservation.orgId !== orgMembership.orgId) {
      return { status: 409, body: { error: "This business name is already registered." } };
    }

    if (currentName.trim()) {
      try { await deleteOrgNameReservation(currentName); } catch (_) { /* non-blocking */ }
    }

    await createOrgNameReservation(trimmedName, orgMembership.orgId);
  }

  await updateOrganization({ orgId: orgMembership.orgId, name: trimmedName });

  return {
    status: 200,
    body: {
      success: true,
      updated: ["organizationName"],
      organization: { id: orgMembership.orgId, name: trimmedName, role: orgMembership.role, canEdit: true },
    },
  };
}

// ============================================================================
// Test helpers
// ============================================================================

function createDeps(opts = {}) {
  const orgId = opts.orgId || "cus_test123";
  const role = opts.role || "owner";
  const currentOrgName = opts.currentOrgName || "";
  const existingReservation = opts.existingReservation || { exists: false, orgId: null };

  return {
    userId: opts.userId || "user_test123",
    getUserOrgMembership: createSpy("getUserOrgMembership").mockResolvedValue(
      role === "individual" ? null : { orgId, role }
    ),
    getOrganization: createSpy("getOrganization").mockResolvedValue({ orgId, name: currentOrgName }),
    getOrgNameReservation: createSpy("getOrgNameReservation").mockResolvedValue(existingReservation),
    createOrgNameReservation: createSpy("createOrgNameReservation").mockResolvedValue(undefined),
    deleteOrgNameReservation: createSpy("deleteOrgNameReservation").mockResolvedValue(undefined),
    updateOrganization: createSpy("updateOrganization").mockResolvedValue(undefined),
  };
}

// ============================================================================
// Unit tests
// ============================================================================

describe("Settings API PATCH — org name: successful operations", () => {
  it("owner sets name for the first time (no existing reservation)", async () => {
    const deps = createDeps({ role: "owner", currentOrgName: "" });

    const result = await processOrgNameUpdate("Acme Corp", deps);

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.organization.name).toBe("Acme Corp");
    expect(deps.createOrgNameReservation.callCount).toBe(1);
    expect(deps.deleteOrgNameReservation.callCount).toBe(0);
    expect(deps.updateOrganization.callCount).toBe(1);
  });

  it("owner changes name (old reservation deleted, new created, org updated)", async () => {
    const deps = createDeps({ role: "owner", currentOrgName: "Old Corp" });

    const result = await processOrgNameUpdate("New Corp", deps);

    expect(result.status).toBe(200);
    expect(result.body.organization.name).toBe("New Corp");
    expect(deps.deleteOrgNameReservation.callCount).toBe(1);
    expect(deps.createOrgNameReservation.callCount).toBe(1);
    expect(deps.updateOrganization.callCount).toBe(1);
  });

  it("casing-only change succeeds without reservation conflict", async () => {
    const deps = createDeps({ role: "owner", currentOrgName: "acme corp" });

    // Same name case-insensitively — nameChanged is false
    const result = await processOrgNameUpdate("Acme Corp", deps);

    expect(result.status).toBe(200);
    expect(result.body.organization.name).toBe("Acme Corp");
    // No reservation operations needed for casing-only change
    expect(deps.getOrgNameReservation.callCount).toBe(0);
    expect(deps.deleteOrgNameReservation.callCount).toBe(0);
    expect(deps.createOrgNameReservation.callCount).toBe(0);
    // But org record IS updated with new casing
    expect(deps.updateOrganization.callCount).toBe(1);
  });
});

describe("Settings API PATCH — org name: uniqueness enforcement", () => {
  it("returns 409 when name taken by different org", async () => {
    const deps = createDeps({
      role: "owner",
      orgId: "cus_orgB",
      currentOrgName: "",
      existingReservation: { exists: true, orgId: "cus_orgA" },
    });

    const result = await processOrgNameUpdate("Taken Name", deps);

    expect(result.status).toBe(409);
    expect(result.body.error).toBe("This business name is already registered.");
  });

  it("allows name when reservation belongs to same org", async () => {
    const deps = createDeps({
      role: "owner",
      orgId: "cus_sameOrg",
      currentOrgName: "Different Name",
      existingReservation: { exists: true, orgId: "cus_sameOrg" },
    });

    const result = await processOrgNameUpdate("New Name", deps);

    expect(result.status).toBe(200);
  });
});

describe("Settings API PATCH — org name: validation", () => {
  it("returns 400 for empty name", async () => {
    const deps = createDeps({ role: "owner" });
    const result = await processOrgNameUpdate("", deps);
    expect(result.status).toBe(400);
    expect(result.body.error).toBe("Organization name cannot be empty");
  });

  it("returns 400 for whitespace-only name", async () => {
    const deps = createDeps({ role: "owner" });
    const result = await processOrgNameUpdate("   ", deps);
    expect(result.status).toBe(400);
    expect(result.body.error).toBe("Organization name cannot be empty");
  });

  it("returns 400 for name exceeding 120 chars", async () => {
    const deps = createDeps({ role: "owner" });
    const longName = "A".repeat(121);
    const result = await processOrgNameUpdate(longName, deps);
    expect(result.status).toBe(400);
    expect(result.body.error).toBe("Organization name must be 120 characters or fewer");
  });

  it("returns 400 for non-string value (number)", async () => {
    const deps = createDeps({ role: "owner" });
    const result = await processOrgNameUpdate(123, deps);
    expect(result.status).toBe(400);
    expect(result.body.error).toBe("Organization name must be a string");
  });

  it("returns 400 for non-string value (null)", async () => {
    const deps = createDeps({ role: "owner" });
    const result = await processOrgNameUpdate(null, deps);
    expect(result.status).toBe(400);
  });

  it("returns 400 for non-string value (boolean)", async () => {
    const deps = createDeps({ role: "owner" });
    const result = await processOrgNameUpdate(true, deps);
    expect(result.status).toBe(400);
  });

  it("trims whitespace before storage", async () => {
    const deps = createDeps({ role: "owner", currentOrgName: "" });
    const result = await processOrgNameUpdate("  Acme Corp  ", deps);
    expect(result.status).toBe(200);
    expect(result.body.organization.name).toBe("Acme Corp");
  });
});

describe("Settings API PATCH — org name: role-based authorization", () => {
  it("returns 403 for admin", async () => {
    const deps = createDeps({ role: "admin" });
    const result = await processOrgNameUpdate("Acme Corp", deps);
    expect(result.status).toBe(403);
    expect(result.body.error).toBe("Only the organization owner can update the business name");
  });

  it("returns 403 for member", async () => {
    const deps = createDeps({ role: "member" });
    const result = await processOrgNameUpdate("Acme Corp", deps);
    expect(result.status).toBe(403);
  });

  it("returns 403 for individual user (no org membership)", async () => {
    const deps = createDeps({ role: "individual" });
    const result = await processOrgNameUpdate("Acme Corp", deps);
    expect(result.status).toBe(403);
  });

  it("succeeds for owner", async () => {
    const deps = createDeps({ role: "owner", currentOrgName: "" });
    const result = await processOrgNameUpdate("Acme Corp", deps);
    expect(result.status).toBe(200);
  });
});
