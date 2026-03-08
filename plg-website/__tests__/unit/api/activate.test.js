/**
 * License Activation API — Fix 9 Tests
 *
 * Tests the activation blocking logic for suspended/revoked members:
 * - Business plan: blocked for suspended org members (403 MEMBER_SUSPENDED)
 * - Business plan: blocked for revoked org members (403 MEMBER_REVOKED)
 * - Business plan: active org members proceed normally (no regression)
 * - Individual plan: membership check skipped entirely
 *
 * Feature: status-remediation-plan, Fix 9 (Task 14.4)
 * Requirements: 13.16, 13.17, 13.18
 */

import { describe, it, mock } from "node:test";
import assert from "node:assert";

// ===========================================
// Extracted logic: mirrors the membership gate
// in the activate route's POST handler.
// Dependency-injected for testability.
// ===========================================

/**
 * Check if a Business plan activation should be blocked due to
 * suspended or revoked org membership.
 *
 * @param {string} planName - "Business" or "Individual"
 * @param {string} userId - Authenticating user's ID
 * @param {Object} deps - Injected dependencies
 * @returns {Object|null} Rejection response or null (proceed)
 */
async function checkMembershipGate(planName, userId, deps) {
  const isBusiness = planName === "Business";

  if (!isBusiness) {
    // Individual plan: skip membership check entirely
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

  // Active (or no membership found) — proceed with activation
  return null;
}

// ===========================================
// FIX 9 — ACTIVATION BLOCKING (Task 14.4)
// ===========================================

describe("Fix 9: Activation Blocking for Suspended/Revoked Members (Task 14.4)", () => {
  function createMockDeps(membershipStatus = "active") {
    const membership = membershipStatus
      ? {
          orgId: "org_test123",
          role: "member",
          status: membershipStatus,
          email: "member@co.com",
        }
      : null;

    return {
      getUserOrgMembership: mock.fn(async () => membership),
    };
  }

  // ---- Business plan: suspended member blocked with 403 ----

  it("should return 403 MEMBER_SUSPENDED for suspended Business org members", async () => {
    const deps = createMockDeps("suspended");

    const result = await checkMembershipGate("Business", "user_abc", deps);

    assert.notStrictEqual(result, null);
    assert.strictEqual(result.httpStatus, 403);
    assert.strictEqual(result.code, "MEMBER_SUSPENDED");
    assert.match(result.message, /suspended/i);
    assert.match(result.message, /team administrator/i);
  });

  // ---- Business plan: revoked member blocked with 403 ----

  it("should return 403 MEMBER_REVOKED for revoked Business org members", async () => {
    const deps = createMockDeps("revoked");

    const result = await checkMembershipGate("Business", "user_abc", deps);

    assert.notStrictEqual(result, null);
    assert.strictEqual(result.httpStatus, 403);
    assert.strictEqual(result.code, "MEMBER_REVOKED");
    assert.match(result.message, /revoked/i);
    assert.match(result.message, /team administrator/i);
  });

  // ---- Business plan: active member proceeds normally ----

  it("should allow active Business org members to proceed (returns null)", async () => {
    const deps = createMockDeps("active");

    const result = await checkMembershipGate("Business", "user_abc", deps);

    assert.strictEqual(result, null);
    // getUserOrgMembership called with includeAll: true
    assert.strictEqual(deps.getUserOrgMembership.mock.callCount(), 1);
    assert.deepStrictEqual(deps.getUserOrgMembership.mock.calls[0].arguments, [
      "user_abc",
      { includeAll: true },
    ]);
  });

  // ---- Individual plan: membership check skipped entirely ----

  it("should skip membership check for Individual plan activations", async () => {
    const deps = createMockDeps("suspended"); // Even if the user would be suspended

    const result = await checkMembershipGate("Individual", "user_abc", deps);

    assert.strictEqual(result, null);
    // getUserOrgMembership should NOT have been called
    assert.strictEqual(deps.getUserOrgMembership.mock.callCount(), 0);
  });

  // ---- includeAll: true is passed so suspended/revoked memberships are found ----

  it("should pass includeAll: true to find non-active memberships", async () => {
    const deps = createMockDeps("suspended");

    await checkMembershipGate("Business", "user_xyz", deps);

    assert.strictEqual(deps.getUserOrgMembership.mock.callCount(), 1);
    const [userId, options] = deps.getUserOrgMembership.mock.calls[0].arguments;
    assert.strictEqual(userId, "user_xyz");
    assert.strictEqual(options.includeAll, true);
  });

  // ---- No membership found — proceeds (edge case for orphan users) ----

  it("should proceed when no membership record found (null)", async () => {
    const deps = createMockDeps(null);

    const result = await checkMembershipGate("Business", "user_orphan", deps);

    assert.strictEqual(result, null);
  });

  // ---- Distinct error codes for suspended vs. revoked ----

  it("should return distinct error codes for suspended vs. revoked", async () => {
    const suspDeps = createMockDeps("suspended");
    const revDeps = createMockDeps("revoked");

    const suspResult = await checkMembershipGate("Business", "u1", suspDeps);
    const revResult = await checkMembershipGate("Business", "u2", revDeps);

    assert.notStrictEqual(suspResult.code, revResult.code);
    assert.strictEqual(suspResult.code, "MEMBER_SUSPENDED");
    assert.strictEqual(revResult.code, "MEMBER_REVOKED");
  });

  // ---- Multiple plan names: only "Business" triggers gate ----

  it("should only trigger membership check for planName === 'Business'", async () => {
    const deps = createMockDeps("suspended");

    for (const plan of [
      "Individual",
      "individual",
      "Pro",
      "Free",
      "",
      undefined,
    ]) {
      const result = await checkMembershipGate(plan, "user_abc", deps);
      assert.strictEqual(
        result,
        null,
        `Plan '${plan}' should not trigger gate`,
      );
    }
    // None of the non-Business plans should have called getUserOrgMembership
    assert.strictEqual(deps.getUserOrgMembership.mock.callCount(), 0);
  });
});
