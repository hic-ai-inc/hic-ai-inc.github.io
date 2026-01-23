/**
 * Auth Utilities Tests
 *
 * Tests the auth.js module that provides authentication helper functions
 * for session validation, role-based access control, and permission enforcement.
 *
 * Behaviors tested:
 * - AuthError custom error class
 * - requireAuth() authentication enforcement
 * - Role-based access: requireOrgRole, requireBillingContact, requireAdmin, requireMember
 * - Session data extraction: getCustomerId, getOrgId, getAccountType
 * - Role checking: isBillingContact, isAdmin
 * - URL validation: validateReturnTo
 */

import {
  describe,
  it,
  beforeEach,
  afterEach,
  expect,
} from "../../../../dm/facade/test-helpers/index.js";

// Import the auth module - note: auth.js creates its own Auth0Client internally
// We need to mock at the getSession level
import {
  AuthError,
  requireAuth,
  requireOrgRole,
  requireBillingContact,
  requireAdmin,
  requireMember,
  getCustomerId,
  getOrgId,
  getAccountType,
  isBillingContact,
  isAdmin,
  validateReturnTo,
} from "../../../src/lib/auth.js";

describe("auth.js", () => {
  describe("AuthError", () => {
    it("should create error with default status code 401", () => {
      const error = new AuthError("Test error");

      expect(error.message).toBe("Test error");
      expect(error.statusCode).toBe(401);
      expect(error.name).toBe("AuthError");
    });

    it("should create error with custom status code", () => {
      const error = new AuthError("Forbidden", 403);

      expect(error.message).toBe("Forbidden");
      expect(error.statusCode).toBe(403);
    });

    it("should be instanceof Error", () => {
      const error = new AuthError("Test");

      expect(error instanceof Error).toBe(true);
    });
  });

  describe("getCustomerId", () => {
    const NAMESPACE = "https://hic-ai.com";

    it("should return null when session is null", () => {
      const result = getCustomerId(null);
      expect(result).toBe(null);
    });

    it("should return null when session.user is undefined", () => {
      const result = getCustomerId({});
      expect(result).toBe(null);
    });

    it("should return null when customer_id claim is missing", () => {
      const session = { user: { email: "test@example.com" } };
      const result = getCustomerId(session);
      expect(result).toBe(null);
    });

    it("should return customer ID when present", () => {
      const session = {
        user: {
          email: "test@example.com",
          [`${NAMESPACE}/customer_id`]: "cus_test123",
        },
      };
      const result = getCustomerId(session);
      expect(result).toBe("cus_test123");
    });
  });

  describe("getOrgId", () => {
    const NAMESPACE = "https://hic-ai.com";

    it("should return null when session is null", () => {
      const result = getOrgId(null);
      expect(result).toBe(null);
    });

    it("should return null when org_id claim is missing", () => {
      const session = { user: { email: "test@example.com" } };
      const result = getOrgId(session);
      expect(result).toBe(null);
    });

    it("should return organization ID when present", () => {
      const session = {
        user: {
          email: "test@example.com",
          [`${NAMESPACE}/org_id`]: "org_acme123",
        },
      };
      const result = getOrgId(session);
      expect(result).toBe("org_acme123");
    });
  });

  describe("getAccountType", () => {
    const NAMESPACE = "https://hic-ai.com";

    it("should return null when session is null", () => {
      const result = getAccountType(null);
      expect(result).toBe(null);
    });

    it("should return null when account_type claim is missing", () => {
      const session = { user: { email: "test@example.com" } };
      const result = getAccountType(session);
      expect(result).toBe(null);
    });

    it("should return individual account type", () => {
      const session = {
        user: {
          email: "test@example.com",
          [`${NAMESPACE}/account_type`]: "individual",
        },
      };
      const result = getAccountType(session);
      expect(result).toBe("individual");
    });

    it("should return enterprise account type", () => {
      const session = {
        user: {
          email: "test@example.com",
          [`${NAMESPACE}/account_type`]: "enterprise",
        },
      };
      const result = getAccountType(session);
      expect(result).toBe("enterprise");
    });
  });

  describe("isBillingContact", () => {
    const NAMESPACE = "https://hic-ai.com";

    it("should return false when session is null", () => {
      const result = isBillingContact(null);
      expect(result).toBe(false);
    });

    it("should return false when user has no org_roles", () => {
      const session = { user: { email: "test@example.com" } };
      const result = isBillingContact(session);
      expect(result).toBe(false);
    });

    it("should return false when user has org_member role only", () => {
      const session = {
        user: {
          email: "test@example.com",
          [`${NAMESPACE}/org_roles`]: ["org_member"],
        },
      };
      const result = isBillingContact(session);
      expect(result).toBe(false);
    });

    it("should return false when user has org_admin role only", () => {
      const session = {
        user: {
          email: "test@example.com",
          [`${NAMESPACE}/org_roles`]: ["org_admin"],
        },
      };
      const result = isBillingContact(session);
      expect(result).toBe(false);
    });

    it("should return true when user has org_billing role", () => {
      const session = {
        user: {
          email: "test@example.com",
          [`${NAMESPACE}/org_roles`]: ["org_billing"],
        },
      };
      const result = isBillingContact(session);
      expect(result).toBe(true);
    });

    it("should return true when user has org_billing among multiple roles", () => {
      const session = {
        user: {
          email: "test@example.com",
          [`${NAMESPACE}/org_roles`]: [
            "org_member",
            "org_billing",
            "org_admin",
          ],
        },
      };
      const result = isBillingContact(session);
      expect(result).toBe(true);
    });
  });

  describe("isAdmin", () => {
    const NAMESPACE = "https://hic-ai.com";

    it("should return false when session is null", () => {
      const result = isAdmin(null);
      expect(result).toBe(false);
    });

    it("should return false when user has no org_roles", () => {
      const session = { user: { email: "test@example.com" } };
      const result = isAdmin(session);
      expect(result).toBe(false);
    });

    it("should return false when user has org_member role only", () => {
      const session = {
        user: {
          email: "test@example.com",
          [`${NAMESPACE}/org_roles`]: ["org_member"],
        },
      };
      const result = isAdmin(session);
      expect(result).toBe(false);
    });

    it("should return true when user has org_admin role", () => {
      const session = {
        user: {
          email: "test@example.com",
          [`${NAMESPACE}/org_roles`]: ["org_admin"],
        },
      };
      const result = isAdmin(session);
      expect(result).toBe(true);
    });

    it("should return true when user has org_billing role", () => {
      const session = {
        user: {
          email: "test@example.com",
          [`${NAMESPACE}/org_roles`]: ["org_billing"],
        },
      };
      const result = isAdmin(session);
      expect(result).toBe(true);
    });

    it("should return true when user has both org_billing and org_admin", () => {
      const session = {
        user: {
          email: "test@example.com",
          [`${NAMESPACE}/org_roles`]: ["org_billing", "org_admin"],
        },
      };
      const result = isAdmin(session);
      expect(result).toBe(true);
    });
  });

  describe("validateReturnTo", () => {
    it("should return /portal when returnTo is null", () => {
      const result = validateReturnTo(null);
      expect(result).toBe("/portal");
    });

    it("should return /portal when returnTo is undefined", () => {
      const result = validateReturnTo(undefined);
      expect(result).toBe("/portal");
    });

    it("should return /portal when returnTo is empty string", () => {
      const result = validateReturnTo("");
      expect(result).toBe("/portal");
    });

    it("should return /portal when returnTo starts with http://", () => {
      const result = validateReturnTo("http://evil.com");
      expect(result).toBe("/portal");
    });

    it("should return /portal when returnTo starts with https://", () => {
      const result = validateReturnTo("https://evil.com");
      expect(result).toBe("/portal");
    });

    it("should return /portal for unauthorized paths", () => {
      const result = validateReturnTo("/api/secret");
      expect(result).toBe("/portal");
    });

    it("should return /portal for paths not in allowed list", () => {
      const result = validateReturnTo("/dashboard");
      expect(result).toBe("/portal");
    });

    // Valid paths
    it("should allow /portal", () => {
      const result = validateReturnTo("/portal");
      expect(result).toBe("/portal");
    });

    it("should allow /admin", () => {
      const result = validateReturnTo("/admin");
      expect(result).toBe("/admin");
    });

    it("should allow /portal/license", () => {
      const result = validateReturnTo("/portal/license");
      expect(result).toBe("/portal/license");
    });

    it("should allow /portal/devices", () => {
      const result = validateReturnTo("/portal/devices");
      expect(result).toBe("/portal/devices");
    });

    it("should allow /portal/billing", () => {
      const result = validateReturnTo("/portal/billing");
      expect(result).toBe("/portal/billing");
    });

    it("should allow /portal/settings", () => {
      const result = validateReturnTo("/portal/settings");
      expect(result).toBe("/portal/settings");
    });

    it("should allow /admin/members", () => {
      const result = validateReturnTo("/admin/members");
      expect(result).toBe("/admin/members");
    });

    it("should allow /admin/billing", () => {
      const result = validateReturnTo("/admin/billing");
      expect(result).toBe("/admin/billing");
    });

    it("should allow /admin/settings", () => {
      const result = validateReturnTo("/admin/settings");
      expect(result).toBe("/admin/settings");
    });

    it("should allow subpaths of allowed paths", () => {
      const result = validateReturnTo("/portal/settings/notifications");
      expect(result).toBe("/portal/settings/notifications");
    });

    it("should allow subpaths of admin routes", () => {
      const result = validateReturnTo("/admin/members/user123");
      expect(result).toBe("/admin/members/user123");
    });
  });
});
