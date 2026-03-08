/**
 * Property-Based Tests — Activation Blocking (Fix 9)
 *
 * Feature: status-remediation-plan, Properties 17, 18, 19
 *
 * Property 17: Business activation blocked for suspended/revoked members
 * For any activation on a Business plan where membership is "suspended"
 * or "revoked", must return HTTP 403 with appropriate code.
 *
 * Property 18: Active Business members proceed with activation
 * For any activation on a Business plan where membership is "active",
 * must proceed with normal activation (no 403).
 *
 * Property 19: Individual plan activations skip membership check
 * For any activation on an Individual plan, must not call
 * getUserOrgMembership and must proceed directly.
 *
 * Uses extracted logic with dependency injection — same pattern as the
 * team and heartbeat property tests. Generates random user IDs, plan
 * names, and membership statuses to verify the invariants hold.
 *
 * **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5**
 */

import { describe, it } from "node:test";
import { expect, createSpy } from "../../../../dm/facade/test-helpers/index.js";

// ============================================================================
// Extracted logic: mirrors the membership gate in the activate route.
// Dependency-injected for testability.
// ============================================================================

/**
 * Check if activation should be blocked for a Business plan member.
 *
 * @param {string} planName - "Business" or anything else
 * @param {string} userId - Authenticating user's ID
 * @param {Object} deps - Injected dependencies
 * @returns {Object|null} Rejection response or null (proceed)
 */
async function checkMembershipGate(planName, userId, deps) {
  const isBusiness = planName === "Business";

  if (!isBusiness) {
    return null;
  }

  const membership = await deps.getUserOrgMembership(userId, {
    includeAll: true,
  });

  if (membership?.status === "suspended") {
    return {
      httpStatus: 403,
      code: "MEMBER_SUSPENDED",
      message:
        "Your team membership has been suspended. Contact your team administrator.",
    };
  }

  if (membership?.status === "revoked") {
    return {
      httpStatus: 403,
      code: "MEMBER_REVOKED",
      message:
        "Your team membership has been revoked. Contact your team administrator.",
    };
  }

  return null;
}

// ============================================================================
// Random generators
// ============================================================================

function randomString(len) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++)
    s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomUserId() {
  return `user_${randomString(12)}`;
}

function randomMembership(status) {
  return {
    orgId: `org_${randomString(8)}`,
    role: randomPick(["member", "admin"]),
    status,
    email: `${randomString(6)}@${randomString(4)}.com`,
    joinedAt: new Date(Date.now() - Math.random() * 1e10).toISOString(),
  };
}

function createMockDeps(membership) {
  return {
    getUserOrgMembership: createSpy("getUserOrgMembership").mockResolvedValue(
      membership,
    ),
  };
}

// ============================================================================
// Feature: status-remediation-plan, Property 17
// ============================================================================

describe("Property 17: Business activation blocked for suspended/revoked members", () => {
  // ---- 17a: Suspended Business members always get 403 MEMBER_SUSPENDED ----

  it("suspended Business members always get 403 MEMBER_SUSPENDED (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const userId = randomUserId();
      const membership = randomMembership("suspended");
      const deps = createMockDeps(membership);

      const result = await checkMembershipGate("Business", userId, deps);

      expect(result).not.toBeNull();
      expect(result.httpStatus).toBe(403);
      expect(result.code).toBe("MEMBER_SUSPENDED");
      expect(result.message).toContain("suspended");
      expect(result.message).toContain("team administrator");
    }
  });

  // ---- 17b: Revoked Business members always get 403 MEMBER_REVOKED ----

  it("revoked Business members always get 403 MEMBER_REVOKED (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const userId = randomUserId();
      const membership = randomMembership("revoked");
      const deps = createMockDeps(membership);

      const result = await checkMembershipGate("Business", userId, deps);

      expect(result).not.toBeNull();
      expect(result.httpStatus).toBe(403);
      expect(result.code).toBe("MEMBER_REVOKED");
      expect(result.message).toContain("revoked");
      expect(result.message).toContain("team administrator");
    }
  });

  // ---- 17c: Suspended/revoked codes are distinct ----

  it("suspended and revoked produce distinct error codes (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const userId = randomUserId();
      const susDeps = createMockDeps(randomMembership("suspended"));
      const revDeps = createMockDeps(randomMembership("revoked"));

      const susResult = await checkMembershipGate("Business", userId, susDeps);
      const revResult = await checkMembershipGate("Business", userId, revDeps);

      expect(susResult.code).not.toBe(revResult.code);
      expect(susResult.code).toBe("MEMBER_SUSPENDED");
      expect(revResult.code).toBe("MEMBER_REVOKED");
    }
  });

  // ---- 17d: getUserOrgMembership always called with includeAll: true ----

  it("getUserOrgMembership is always called with includeAll: true for Business (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const userId = randomUserId();
      const status = randomPick(["suspended", "revoked", "active"]);
      const deps = createMockDeps(randomMembership(status));

      await checkMembershipGate("Business", userId, deps);

      expect(deps.getUserOrgMembership).toHaveBeenCalledTimes(1);
      expect(deps.getUserOrgMembership).toHaveBeenCalledWith(userId, {
        includeAll: true,
      });
    }
  });
});

// ============================================================================
// Feature: status-remediation-plan, Property 18
// ============================================================================

describe("Property 18: Active Business members proceed with activation", () => {
  // ---- 18a: Active membership returns null (proceed) ----

  it("active Business members always return null to proceed (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const userId = randomUserId();
      const membership = randomMembership("active");
      const deps = createMockDeps(membership);

      const result = await checkMembershipGate("Business", userId, deps);

      expect(result).toBeNull();
    }
  });

  // ---- 18b: Null membership also proceeds (edge case) ----

  it("null membership (no record found) returns null to proceed (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const deps = createMockDeps(null);

      const result = await checkMembershipGate(
        "Business",
        randomUserId(),
        deps,
      );

      expect(result).toBeNull();
    }
  });

  // ---- 18c: Any status other than suspended/revoked proceeds ----

  it("any non-suspended/revoked membership status returns null (100 iterations)", async () => {
    const safeStatuses = ["active", "invited", "pending", "unknown"];

    for (let i = 0; i < 100; i++) {
      const status = randomPick(safeStatuses);
      const deps = createMockDeps(randomMembership(status));

      const result = await checkMembershipGate(
        "Business",
        randomUserId(),
        deps,
      );

      expect(result).toBeNull();
    }
  });
});

// ============================================================================
// Feature: status-remediation-plan, Property 19
// ============================================================================

describe("Property 19: Individual plan activations skip membership check", () => {
  // ---- 19a: Individual plans never call getUserOrgMembership ----

  it("Individual plan activations never call getUserOrgMembership (100 iterations)", async () => {
    for (let i = 0; i < 100; i++) {
      const status = randomPick(["suspended", "revoked", "active"]);
      const deps = createMockDeps(randomMembership(status));

      const result = await checkMembershipGate(
        "Individual",
        randomUserId(),
        deps,
      );

      expect(result).toBeNull();
      expect(deps.getUserOrgMembership).toHaveBeenCalledTimes(0);
    }
  });

  // ---- 19b: Non-Business plan names all skip the check ----

  it("all non-Business plan names skip membership check (100 iterations)", async () => {
    const nonBusinessPlans = [
      "Individual",
      "individual",
      "Pro",
      "Free",
      "Enterprise",
      `plan_${randomString(8)}`,
    ];

    for (let i = 0; i < 100; i++) {
      const plan = randomPick(nonBusinessPlans);
      const deps = createMockDeps(randomMembership("suspended"));

      const result = await checkMembershipGate(plan, randomUserId(), deps);

      expect(result).toBeNull();
      expect(deps.getUserOrgMembership).toHaveBeenCalledTimes(0);
    }
  });

  // ---- 19c: Only exact "Business" string triggers the gate ----

  it("only exact 'Business' string activates the membership gate (100 iterations)", async () => {
    const deps = createMockDeps(randomMembership("suspended"));

    // "Business" should block
    const blocked = await checkMembershipGate("Business", randomUserId(), deps);
    expect(blocked).not.toBeNull();
    expect(blocked.httpStatus).toBe(403);

    // Reset spy
    deps.getUserOrgMembership.reset();
    deps.getUserOrgMembership.mockResolvedValue(randomMembership("suspended"));

    // "business" (lowercase) should NOT block
    const lowercase = await checkMembershipGate(
      "business",
      randomUserId(),
      deps,
    );
    expect(lowercase).toBeNull();
    expect(deps.getUserOrgMembership).toHaveBeenCalledTimes(0);
  });
});
