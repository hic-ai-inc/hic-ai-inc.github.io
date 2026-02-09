/**
 * Billing API Route Tests
 *
 * Issue 5 Fix (2/9/2026): Owner-only billing access control
 *
 * Tests the billing API access control including:
 * - Owner-only API access (403 for non-owners)
 * - Sidebar path filtering (owner vs member/admin)
 * - Dashboard billing card visibility
 */

import { describe, it } from "node:test";
import assert from "node:assert";

// Constants used in the routes
const AUTH_NAMESPACE = "https://hic-ai.com";

// Helper to create mock Auth0 session
function createMockSession(userOverrides = {}) {
  return {
    user: {
      sub: "auth0|test123",
      email: "test@example.com",
      email_verified: true,
      [`${AUTH_NAMESPACE}/org_id`]: "org123",
      [`${AUTH_NAMESPACE}/account_type`]: "team",
      ...userOverrides,
    },
  };
}

describe("Billing API - Owner-Only Access Control (Issue 5)", () => {
  /**
   * checkBillingAccess logic extracted from billing/route.js
   * Only org owners can view and modify billing information.
   * Members and admins get 403 Forbidden.
   */
  function checkBillingAccess(session, customer, orgMembership) {
    // Must be authenticated
    if (!session?.user) {
      return { authorized: false, error: "Unauthorized", status: 401 };
    }

    // Check if user is an org member (non-owner)
    if (orgMembership) {
      return {
        authorized: false,
        error: "Billing is managed by the subscription owner",
        status: 403,
      };
    }

    // Check if user is the subscription owner (has customer record with subscription)
    if (!customer?.subscriptionStatus) {
      return {
        authorized: false,
        error: "No subscription found",
        status: 404,
      };
    }

    // User is the subscription owner
    return { authorized: true };
  }

  describe("API Route Authorization", () => {
    it("should reject unauthenticated requests with 401", () => {
      const result = checkBillingAccess(null, null, null);
      assert.strictEqual(result.authorized, false);
      assert.strictEqual(result.status, 401);
    });

    it("should reject org members with 403", () => {
      const session = createMockSession({
        [`${AUTH_NAMESPACE}/org_role`]: "member",
      });
      const customer = null; // Members don't have their own customer record
      const orgMembership = {
        orgId: "org123",
        role: "member",
        ownerId: "owner456",
      };

      const result = checkBillingAccess(session, customer, orgMembership);
      assert.strictEqual(result.authorized, false);
      assert.strictEqual(result.status, 403);
      assert.match(result.error, /managed by the subscription owner/i);
    });

    it("should reject org admins with 403", () => {
      const session = createMockSession({
        [`${AUTH_NAMESPACE}/org_role`]: "admin",
      });
      const customer = null;
      const orgMembership = {
        orgId: "org123",
        role: "admin",
        ownerId: "owner456",
      };

      const result = checkBillingAccess(session, customer, orgMembership);
      assert.strictEqual(result.authorized, false);
      assert.strictEqual(result.status, 403);
    });

    it("should allow org owner (no orgMembership means they ARE the owner)", () => {
      const session = createMockSession({
        [`${AUTH_NAMESPACE}/org_role`]: "owner",
      });
      const customer = {
        subscriptionStatus: "active",
        stripeCustomerId: "cus_abc123",
      };
      const orgMembership = null; // Owner doesn't have orgMembership

      const result = checkBillingAccess(session, customer, orgMembership);
      assert.strictEqual(result.authorized, true);
    });

    it("should reject owner without subscription (404)", () => {
      const session = createMockSession();
      const customer = { email: "user@test.com" }; // No subscriptionStatus
      const orgMembership = null;

      const result = checkBillingAccess(session, customer, orgMembership);
      assert.strictEqual(result.authorized, false);
      assert.strictEqual(result.status, 404);
    });

    it("should allow owner with cancelled subscription", () => {
      const session = createMockSession();
      const customer = { subscriptionStatus: "cancelled" };
      const orgMembership = null;

      const result = checkBillingAccess(session, customer, orgMembership);
      assert.strictEqual(result.authorized, true);
    });

    it("should allow owner with past_due subscription", () => {
      const session = createMockSession();
      const customer = { subscriptionStatus: "past_due" };
      const orgMembership = null;

      const result = checkBillingAccess(session, customer, orgMembership);
      assert.strictEqual(result.authorized, true);
    });
  });
});

describe("Billing Sidebar Path Filter (Issue 5)", () => {
  /**
   * filterOwnerOnlyPaths logic extracted from PortalSidebar.js
   * Prior to fix: ADMIN_ONLY_PATHS filtered for role === "member"
   * After fix: OWNER_ONLY_PATHS filtered for role !== "owner"
   */
  const OWNER_ONLY_PATHS = ["/portal/billing"];

  function filterSidebarPaths(paths, orgRole) {
    // If user is not the owner, filter out owner-only paths
    if (orgRole !== "owner" && orgRole !== null) {
      return paths.filter((p) => !OWNER_ONLY_PATHS.includes(p));
    }
    return paths;
  }

  const allPaths = [
    "/portal",
    "/portal/team",
    "/portal/billing",
    "/portal/settings",
  ];

  it("should show billing for owners", () => {
    const filtered = filterSidebarPaths(allPaths, "owner");
    assert.ok(filtered.includes("/portal/billing"));
    assert.strictEqual(filtered.length, 4);
  });

  it("should hide billing for members", () => {
    const filtered = filterSidebarPaths(allPaths, "member");
    assert.ok(!filtered.includes("/portal/billing"));
    assert.strictEqual(filtered.length, 3);
  });

  it("should hide billing for admins", () => {
    const filtered = filterSidebarPaths(allPaths, "admin");
    assert.ok(!filtered.includes("/portal/billing"));
    assert.strictEqual(filtered.length, 3);
  });

  it("should show billing for individual users (no org role)", () => {
    // Individual users have orgRole = null, they manage their own billing
    const filtered = filterSidebarPaths(allPaths, null);
    assert.ok(filtered.includes("/portal/billing"));
    assert.strictEqual(filtered.length, 4);
  });
});

describe("Dashboard Billing Card Visibility (Issue 5)", () => {
  /**
   * isOrgOwner logic extracted from portal/page.js
   * Determines if billing card should be clickable or greyed out
   */
  function checkBillingCardState(orgRole, subscriptionStatus) {
    // Individual users (no org role) manage their own billing
    if (!orgRole) {
      return {
        canAccess: true,
        clickable: true,
        message: null,
      };
    }

    // Only owners can access billing in orgs
    if (orgRole === "owner") {
      return {
        canAccess: true,
        clickable: true,
        message: null,
      };
    }

    // Members and admins see greyed out card
    return {
      canAccess: false,
      clickable: false,
      message: "Managed by subscription owner",
    };
  }

  it("should make billing clickable for org owners", () => {
    const result = checkBillingCardState("owner", "active");
    assert.strictEqual(result.canAccess, true);
    assert.strictEqual(result.clickable, true);
    assert.strictEqual(result.message, null);
  });

  it("should grey out billing for org members", () => {
    const result = checkBillingCardState("member", "active");
    assert.strictEqual(result.canAccess, false);
    assert.strictEqual(result.clickable, false);
    assert.match(result.message, /subscription owner/i);
  });

  it("should grey out billing for org admins", () => {
    const result = checkBillingCardState("admin", "active");
    assert.strictEqual(result.canAccess, false);
    assert.strictEqual(result.clickable, false);
    assert.match(result.message, /subscription owner/i);
  });

  it("should make billing clickable for individual users", () => {
    const result = checkBillingCardState(null, "active");
    assert.strictEqual(result.canAccess, true);
    assert.strictEqual(result.clickable, true);
  });

  it("should make billing clickable for undefined org role", () => {
    const result = checkBillingCardState(undefined, "active");
    assert.strictEqual(result.canAccess, true);
    assert.strictEqual(result.clickable, true);
  });
});

describe("Billing Page 403 Redirect (Issue 5)", () => {
  /**
   * shouldRedirectFromBilling logic for billing/page.js
   * Non-owners who navigate directly to /portal/billing should be redirected
   */
  function shouldRedirectFromBilling(apiResponse) {
    // If API returns 403, user should be redirected
    if (apiResponse?.status === 403) {
      return {
        shouldRedirect: true,
        redirectTo: "/portal",
        reason: "forbidden",
      };
    }

    // If API returns 404 (no subscription), redirect to portal
    if (apiResponse?.status === 404) {
      return {
        shouldRedirect: true,
        redirectTo: "/portal",
        reason: "no_subscription",
      };
    }

    // Success - stay on page
    return { shouldRedirect: false };
  }

  it("should redirect on 403 Forbidden", () => {
    const apiResponse = {
      status: 403,
      error: "Billing is managed by the subscription owner",
    };
    const result = shouldRedirectFromBilling(apiResponse);
    assert.strictEqual(result.shouldRedirect, true);
    assert.strictEqual(result.redirectTo, "/portal");
    assert.strictEqual(result.reason, "forbidden");
  });

  it("should redirect on 404 No subscription", () => {
    const apiResponse = { status: 404, error: "No subscription found" };
    const result = shouldRedirectFromBilling(apiResponse);
    assert.strictEqual(result.shouldRedirect, true);
    assert.strictEqual(result.redirectTo, "/portal");
    assert.strictEqual(result.reason, "no_subscription");
  });

  it("should not redirect on success", () => {
    const apiResponse = { status: 200, data: { billingInfo: {} } };
    const result = shouldRedirectFromBilling(apiResponse);
    assert.strictEqual(result.shouldRedirect, false);
  });

  it("should not redirect on null response (loading)", () => {
    const result = shouldRedirectFromBilling(null);
    assert.strictEqual(result.shouldRedirect, false);
  });
});
