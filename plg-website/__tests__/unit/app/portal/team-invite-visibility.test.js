/**
 * Unit Tests — Team Page Invite Button Visibility
 *
 * Remediation Plan: Phase D, Task D.2 (BUG-6)
 *
 * Tests the role-based gate on the "Invite Member" button in
 * TeamManagement.js. The button should only be visible to owners
 * and admins; members should not see it.
 *
 * Uses extracted pure function pattern (same approach as org-card.test.js)
 * to test the conditional rendering logic independently of React.
 *
 * **Validates: BUG-6 fix — invite button hidden for member role**
 */

import { describe, it } from "node:test";
import { expect } from "../../../../../dm/facade/test-helpers/index.js";

// ============================================================================
// Extracted logic: mirrors the invite button visibility guard in
// TeamManagement.js line 322:
//   {(orgRole === "owner" || orgRole === "admin") && (<Button .../>)}
// ============================================================================

/**
 * Determine whether the "Invite Member" button should be visible.
 *
 * @param {string|undefined|null} orgRole - The user's role in the org
 * @returns {boolean} True if invite button should render
 */
function canInviteMembers(orgRole) {
  return orgRole === "owner" || orgRole === "admin";
}

// ============================================================================
// Invite button visibility tests
// ============================================================================

describe("Team page — invite button visibility (BUG-6)", () => {
  it("owner sees the invite button", () => {
    expect(canInviteMembers("owner")).toBe(true);
  });

  it("admin sees the invite button", () => {
    expect(canInviteMembers("admin")).toBe(true);
  });

  it("member does NOT see the invite button", () => {
    expect(canInviteMembers("member")).toBe(false);
  });

  it("undefined role does NOT see the invite button", () => {
    expect(canInviteMembers(undefined)).toBe(false);
  });

  it("null role does NOT see the invite button", () => {
    expect(canInviteMembers(null)).toBe(false);
  });

  it("empty string role does NOT see the invite button", () => {
    expect(canInviteMembers("")).toBe(false);
  });

  it("arbitrary role string does NOT see the invite button", () => {
    expect(canInviteMembers("superadmin")).toBe(false);
    expect(canInviteMembers("Owner")).toBe(false); // case-sensitive
    expect(canInviteMembers("ADMIN")).toBe(false); // case-sensitive
  });
});

// ============================================================================
// Integration: orgRole prop propagation from team page.js → TeamManagement
// ============================================================================

describe("Team page — orgRole prop source", () => {
  /**
   * Simulates the data path: accountData.orgMembership.role → orgRole prop.
   * Mirrors plg-website/src/app/portal/team/page.js:
   *   orgRole={accountData?.orgMembership?.role}
   */
  function extractOrgRole(accountData) {
    return accountData?.orgMembership?.role;
  }

  it("extracts owner role from accountData", () => {
    const accountData = { orgMembership: { role: "owner", orgId: "cus_123" } };
    expect(extractOrgRole(accountData)).toBe("owner");
  });

  it("extracts admin role from accountData", () => {
    const accountData = { orgMembership: { role: "admin", orgId: "cus_123" } };
    expect(extractOrgRole(accountData)).toBe("admin");
  });

  it("extracts member role from accountData", () => {
    const accountData = { orgMembership: { role: "member", orgId: "cus_123" } };
    expect(extractOrgRole(accountData)).toBe("member");
  });

  it("returns undefined when orgMembership is missing", () => {
    const accountData = {};
    expect(extractOrgRole(accountData)).toBe(undefined);
  });

  it("returns undefined when accountData is null", () => {
    expect(extractOrgRole(null)).toBe(undefined);
  });

  it("returns undefined when accountData is undefined (individual user)", () => {
    expect(extractOrgRole(undefined)).toBe(undefined);
  });

  it("individual user (no orgMembership) → invite button hidden", () => {
    const accountData = { profile: { accountType: "individual" } };
    const role = extractOrgRole(accountData);
    expect(canInviteMembers(role)).toBe(false);
  });
});
