/**
 * Property-Based Tests — Settings API Organization Name Logic
 *
 * Feature: business-name-implementation, Properties 3, 4, 5, 6, 7, 9
 *
 * Property 3: Cross-Organization Uniqueness Enforcement
 * Property 4: Same-Organization Re-Submission Allowed
 * Property 5: Validation Rejects Invalid Organization Names
 * Property 6: Role-Based Write Authorization
 * Property 7: Role-Based GET Response Shape
 * Property 9: Settings API GET Backward Compatibility
 *
 * Uses extracted logic with dependency injection — mirrors the Settings API
 * route handlers as pure functions with injected DynamoDB dependencies.
 *
 * **Validates: Requirements 1.4, 1.5, 2.1–2.4, 3.1–3.4, 4.1–4.5**
 */

import { describe, it } from "node:test";
import { expect, createSpy } from "../../../../dm/facade/test-helpers/index.js";

// ============================================================================
// Extracted logic: mirrors Settings API PATCH org name flow from route.js
// ============================================================================

/**
 * Process an organization name update request.
 * Pure function extraction of the PATCH handler's org name logic.
 *
 * @param {*} organizationName - The submitted org name (any type)
 * @param {Object} deps - Injected dependencies
 * @returns {{ status: number, body: Object }}
 */
async function processOrgNameUpdate(organizationName, deps) {
  const { getUserOrgMembership, getOrganization, getOrgNameReservation,
          createOrgNameReservation, deleteOrgNameReservation, updateOrganization,
          userId } = deps;

  // Validate type
  if (typeof organizationName !== "string") {
    return { status: 400, body: { error: "Organization name must be a string" } };
  }

  const trimmedName = organizationName.trim();

  // Validate non-empty
  if (!trimmedName) {
    return { status: 400, body: { error: "Organization name cannot be empty" } };
  }

  // Validate length
  if (trimmedName.length > 120) {
    return { status: 400, body: { error: "Organization name must be 120 characters or fewer" } };
  }

  // Enforce role: must be Business Owner
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
      organization: {
        id: orgMembership.orgId,
        name: trimmedName,
        role: orgMembership.role,
        canEdit: true,
      },
    },
  };
}

/**
 * Build the Settings API GET response organization block.
 * Pure function extraction of the GET handler's org context logic.
 *
 * @param {Object|null} orgMembership - User's org membership or null
 * @param {Object|null} org - Organization record or null
 * @param {Object} customer - Customer record
 * @param {Object} user - Authenticated user
 * @returns {Object} Response body
 */
function buildSettingsGetResponse(orgMembership, org, customer, user) {
  const defaultNotifications = {
    productUpdates: true,
    usageAlerts: true,
    billingReminders: true,
    marketingEmails: false,
  };

  const response = {
    profile: {
      givenName: customer?.givenName || "",
      middleName: customer?.middleName || "",
      familyName: customer?.familyName || "",
      name: user.name || customer?.name || "",
      email: user.email,
      picture: user.picture || null,
      accountType: customer?.accountType || "individual",
      createdAt: customer?.createdAt || null,
    },
    notifications: customer?.notificationPreferences || defaultNotifications,
  };

  if (orgMembership) {
    response.organization = {
      id: orgMembership.orgId,
      name: org?.name || null,
      role: orgMembership.role,
      canEdit: orgMembership.role === "owner",
    };
  }

  return response;
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

function randomOrgName() {
  const coreLen = randomInt(1, 100);
  return randomString(coreLen);
}

function randomOrgId() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "cus_";
  for (let i = 0; i < 14; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function randomUserId() {
  return `user_${randomString(12).replace(/[^a-z0-9]/g, "")}`;
}

function randomUserRole() {
  return randomPick(["owner", "admin", "member", "individual"]);
}

/** Generate an invalid org name for Property 5 */
function randomInvalidOrgName() {
  const type = randomPick(["empty", "whitespace", "too_long", "non_string"]);
  switch (type) {
    case "empty": return "";
    case "whitespace": return " ".repeat(randomInt(1, 10));
    case "too_long": return randomString(121 + randomInt(0, 50));
    case "non_string": return randomPick([123, null, undefined, true, {}, []]);
  }
}

/** Create mock deps for PATCH testing */
function createPatchDeps(opts = {}) {
  const orgId = opts.orgId || randomOrgId();
  const role = opts.role || "owner";
  const currentOrgName = opts.currentOrgName || "";
  const existingReservation = opts.existingReservation || null;

  return {
    userId: opts.userId || randomUserId(),
    getUserOrgMembership: createSpy("getUserOrgMembership").mockResolvedValue(
      role === "individual" ? null : { orgId, role }
    ),
    getOrganization: createSpy("getOrganization").mockResolvedValue(
      { orgId, name: currentOrgName }
    ),
    getOrgNameReservation: createSpy("getOrgNameReservation").mockResolvedValue(
      existingReservation || { exists: false, orgId: null }
    ),
    createOrgNameReservation: createSpy("createOrgNameReservation").mockResolvedValue(undefined),
    deleteOrgNameReservation: createSpy("deleteOrgNameReservation").mockResolvedValue(undefined),
    updateOrganization: createSpy("updateOrganization").mockResolvedValue(undefined),
    _orgId: orgId,
  };
}

// ============================================================================
// Property 3: Cross-Organization Uniqueness Enforcement
// ============================================================================

describe("Property 3: Cross-Organization Uniqueness Enforcement", () => {
  it("org B gets 409 when claiming a name already reserved by org A (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const name = randomOrgName();
      const orgA = randomOrgId();
      const orgB = randomOrgId();

      // Org A already holds the reservation
      const deps = createPatchDeps({
        orgId: orgB,
        role: "owner",
        currentOrgName: "",
        existingReservation: { exists: true, orgId: orgA },
      });

      const result = await processOrgNameUpdate(name, deps);

      expect(result.status).toBe(409);
      expect(result.body.error).toBe("This business name is already registered.");
    }
  });
});

// ============================================================================
// Property 4: Same-Organization Re-Submission Allowed
// ============================================================================

describe("Property 4: Same-Organization Re-Submission Allowed", () => {
  it("re-submitting same name (including casing variations) succeeds (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const name = randomOrgName();
      const orgId = randomOrgId();

      // Org already owns this reservation
      const deps = createPatchDeps({
        orgId,
        role: "owner",
        currentOrgName: name,
        existingReservation: { exists: true, orgId },
      });

      const result = await processOrgNameUpdate(name, deps);

      // Should succeed — same org re-submitting same name
      expect(result.status).toBe(200);
      expect(result.body.success).toBe(true);
    }
  });

  it("casing-only change succeeds without uniqueness conflict (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const baseName = randomOrgName();
      const orgId = randomOrgId();

      // Swap case for the re-submission
      const casingVariant = baseName.split("").map(c =>
        Math.random() > 0.5 ? c.toUpperCase() : c.toLowerCase()
      ).join("");

      // Same name case-insensitively — nameChanged will be false
      const deps = createPatchDeps({
        orgId,
        role: "owner",
        currentOrgName: baseName,
      });

      const result = await processOrgNameUpdate(casingVariant, deps);

      expect(result.status).toBe(200);
      expect(result.body.success).toBe(true);
    }
  });
});

// ============================================================================
// Property 5: Validation Rejects Invalid Organization Names
// ============================================================================

describe("Property 5: Validation Rejects Invalid Organization Names", () => {
  it("invalid org names get HTTP 400 (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const invalidName = randomInvalidOrgName();
      const deps = createPatchDeps({ role: "owner" });

      const result = await processOrgNameUpdate(invalidName, deps);

      expect(result.status).toBe(400);
    }
  });

  it("valid names with leading/trailing whitespace are stored trimmed (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const core = randomString(randomInt(1, 80));
      const padded = `  ${core}  `;
      const deps = createPatchDeps({ role: "owner", currentOrgName: "" });

      const result = await processOrgNameUpdate(padded, deps);

      expect(result.status).toBe(200);
      // The stored name should be trimmed
      expect(result.body.organization.name).toBe(padded.trim());
    }
  });
});

// ============================================================================
// Property 6: Role-Based Write Authorization
// ============================================================================

describe("Property 6: Role-Based Write Authorization", () => {
  it("PATCH succeeds iff user is Business Owner (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const role = randomUserRole();
      const name = randomOrgName();
      const deps = createPatchDeps({ role, currentOrgName: "" });

      const result = await processOrgNameUpdate(name, deps);

      if (role === "owner") {
        expect(result.status).toBe(200);
      } else {
        expect(result.status).toBe(403);
        expect(result.body.error).toBe("Only the organization owner can update the business name");
      }
    }
  });
});

// ============================================================================
// Property 7: Role-Based GET Response Shape
// ============================================================================

describe("Property 7: Role-Based GET Response Shape", () => {
  it("response shape matches role for any authenticated user (100 iterations)", () => {
    for (let i = 0; i < 100; i++) {
      const role = randomUserRole();
      const orgId = randomOrgId();
      const orgName = randomOrgName();
      const user = { name: "Test User", email: "test@example.com", picture: null };
      const customer = {
        givenName: "Test", middleName: "", familyName: "User",
        name: "Test User", accountType: role === "individual" ? "individual" : "business",
        createdAt: new Date().toISOString(),
        notificationPreferences: { productUpdates: true, usageAlerts: true, billingReminders: true, marketingEmails: false },
      };

      const orgMembership = role === "individual" ? null : { orgId, role };
      const org = role === "individual" ? null : { orgId, name: orgName };

      const response = buildSettingsGetResponse(orgMembership, org, customer, user);

      if (role === "individual") {
        // No organization block
        expect(response.organization).toBe(undefined);
      } else if (role === "owner") {
        expect(response.organization.canEdit).toBe(true);
        expect(response.organization.role).toBe("owner");
        expect(response.organization.id).toBe(orgId);
      } else {
        // admin or member
        expect(response.organization.canEdit).toBe(false);
        expect(response.organization.role).toBe(role);
        expect(response.organization.id).toBe(orgId);
      }
    }
  });
});

// ============================================================================
// Property 9: Settings API GET Backward Compatibility
// ============================================================================

describe("Property 9: Settings API GET Backward Compatibility", () => {
  it("response always includes profile and notifications blocks (100 iterations)", () => {
    for (let i = 0; i < 100; i++) {
      const role = randomUserRole();
      const user = { name: "Test User", email: `user${i}@example.com`, picture: null };
      const customer = {
        givenName: "Test", middleName: "", familyName: "User",
        name: "Test User", accountType: role === "individual" ? "individual" : "business",
        createdAt: new Date().toISOString(),
        notificationPreferences: { productUpdates: true, usageAlerts: false, billingReminders: true, marketingEmails: false },
      };

      const orgMembership = role === "individual" ? null : { orgId: randomOrgId(), role };
      const org = role === "individual" ? null : { orgId: orgMembership?.orgId, name: "Test Org" };

      const response = buildSettingsGetResponse(orgMembership, org, customer, user);

      // profile block always present with expected keys
      expect(response.profile).not.toBe(undefined);
      expect(typeof response.profile.givenName).toBe("string");
      expect(typeof response.profile.familyName).toBe("string");
      expect(typeof response.profile.email).toBe("string");
      expect(response.profile.email).toBe(user.email);

      // notifications block always present with expected keys
      expect(response.notifications).not.toBe(undefined);
      expect(typeof response.notifications.productUpdates).toBe("boolean");
      expect(typeof response.notifications.usageAlerts).toBe("boolean");
      expect(typeof response.notifications.billingReminders).toBe("boolean");
      expect(typeof response.notifications.marketingEmails).toBe("boolean");
    }
  });
});
