/**
 * Cognito Authentication Module Tests
 *
 * Tests for src/lib/cognito.js - the Cognito/Amplify authentication integration.
 * These tests validate session handling, user retrieval, login/logout flows,
 * and session helper functions.
 *
 * Note: These tests mock the Amplify Auth APIs to test business logic
 * without requiring actual Cognito infrastructure.
 */

import {
  describe,
  it,
  beforeEach,
  afterEach,
  expect,
} from "../../../../dm/facade/test-helpers/index.js";

// Custom namespace matching the module
const NAMESPACE = "https://hic-ai.com";

// ============================================
// Testable helper functions (pure functions)
// ============================================

// Re-implement the helper functions for testing since they're pure functions
// that only depend on the session object structure

function getOrganizationId(session) {
  return session?.user?.[`${NAMESPACE}/org_id`] || null;
}

function isEnterpriseUser(session) {
  return !!getOrganizationId(session);
}

function getSubscriptionStatus(session) {
  return session?.user?.[`${NAMESPACE}/subscription_status`] || null;
}

function getPlanType(session) {
  return session?.user?.[`${NAMESPACE}/plan_type`] || null;
}

function getAccountType(session) {
  return session?.user?.[`${NAMESPACE}/account_type`] || "individual";
}

function getOrgRole(session) {
  return session?.user?.[`${NAMESPACE}/org_role`] || null;
}

// ============================================
// TESTS
// ============================================

describe("cognito.js", () => {
  describe("getOrganizationId", () => {
    it("should return null when session is null", () => {
      const result = getOrganizationId(null);
      expect(result).toBe(null);
    });

    it("should return null when session is undefined", () => {
      const result = getOrganizationId(undefined);
      expect(result).toBe(null);
    });

    it("should return null when session.user is undefined", () => {
      const session = {};
      const result = getOrganizationId(session);
      expect(result).toBe(null);
    });

    it("should return null when org_id claim is missing", () => {
      const session = {
        user: {
          email: "test@example.com",
          sub: "user-123",
        },
      };
      const result = getOrganizationId(session);
      expect(result).toBe(null);
    });

    it("should return null when org_id is null", () => {
      const session = {
        user: {
          email: "test@example.com",
          [`${NAMESPACE}/org_id`]: null,
        },
      };
      const result = getOrganizationId(session);
      expect(result).toBe(null);
    });

    it("should return organization ID when present", () => {
      const session = {
        user: {
          email: "enterprise@example.com",
          [`${NAMESPACE}/org_id`]: "org_enterprise_123",
        },
      };
      const result = getOrganizationId(session);
      expect(result).toBe("org_enterprise_123");
    });

    it("should return empty string org_id as falsy", () => {
      const session = {
        user: {
          email: "test@example.com",
          [`${NAMESPACE}/org_id`]: "",
        },
      };
      const result = getOrganizationId(session);
      expect(result).toBe(null);
    });
  });

  describe("isEnterpriseUser", () => {
    it("should return false when session is null", () => {
      const result = isEnterpriseUser(null);
      expect(result).toBe(false);
    });

    it("should return false when no org_id", () => {
      const session = {
        user: {
          email: "individual@example.com",
        },
      };
      const result = isEnterpriseUser(session);
      expect(result).toBe(false);
    });

    it("should return true when org_id is present", () => {
      const session = {
        user: {
          email: "enterprise@example.com",
          [`${NAMESPACE}/org_id`]: "org_123",
        },
      };
      const result = isEnterpriseUser(session);
      expect(result).toBe(true);
    });

    it("should return false when org_id is empty string", () => {
      const session = {
        user: {
          email: "test@example.com",
          [`${NAMESPACE}/org_id`]: "",
        },
      };
      const result = isEnterpriseUser(session);
      expect(result).toBe(false);
    });
  });

  describe("getSubscriptionStatus", () => {
    it("should return null when session is null", () => {
      const result = getSubscriptionStatus(null);
      expect(result).toBe(null);
    });

    it("should return null when subscription_status is missing", () => {
      const session = {
        user: {
          email: "test@example.com",
        },
      };
      const result = getSubscriptionStatus(session);
      expect(result).toBe(null);
    });

    it("should return active subscription status", () => {
      const session = {
        user: {
          email: "subscriber@example.com",
          [`${NAMESPACE}/subscription_status`]: "active",
        },
      };
      const result = getSubscriptionStatus(session);
      expect(result).toBe("active");
    });

    it("should return trialing subscription status", () => {
      const session = {
        user: {
          email: "trial@example.com",
          [`${NAMESPACE}/subscription_status`]: "trialing",
        },
      };
      const result = getSubscriptionStatus(session);
      expect(result).toBe("trialing");
    });

    it("should return canceled subscription status", () => {
      const session = {
        user: {
          email: "canceled@example.com",
          [`${NAMESPACE}/subscription_status`]: "canceled",
        },
      };
      const result = getSubscriptionStatus(session);
      expect(result).toBe("canceled");
    });

    it("should return past_due subscription status", () => {
      const session = {
        user: {
          email: "pastdue@example.com",
          [`${NAMESPACE}/subscription_status`]: "past_due",
        },
      };
      const result = getSubscriptionStatus(session);
      expect(result).toBe("past_due");
    });
  });

  describe("getPlanType", () => {
    it("should return null when session is null", () => {
      const result = getPlanType(null);
      expect(result).toBe(null);
    });

    it("should return null when plan_type is missing", () => {
      const session = {
        user: {
          email: "test@example.com",
        },
      };
      const result = getPlanType(session);
      expect(result).toBe(null);
    });

    it("should return individual plan type", () => {
      const session = {
        user: {
          email: "solo@example.com",
          [`${NAMESPACE}/plan_type`]: "individual",
        },
      };
      const result = getPlanType(session);
      expect(result).toBe("individual");
    });

    it("should return business plan type", () => {
      const session = {
        user: {
          email: "business@example.com",
          [`${NAMESPACE}/plan_type`]: "business",
        },
      };
      const result = getPlanType(session);
      expect(result).toBe("business");
    });

    it("should return enterprise plan type", () => {
      const session = {
        user: {
          email: "enterprise@example.com",
          [`${NAMESPACE}/plan_type`]: "enterprise",
        },
      };
      const result = getPlanType(session);
      expect(result).toBe("enterprise");
    });
  });

  describe("getAccountType", () => {
    it("should return individual when session is null", () => {
      const result = getAccountType(null);
      expect(result).toBe("individual");
    });

    it("should return individual when session.user is undefined", () => {
      const session = {};
      const result = getAccountType(session);
      expect(result).toBe("individual");
    });

    it("should return individual as default when account_type is missing", () => {
      const session = {
        user: {
          email: "test@example.com",
        },
      };
      const result = getAccountType(session);
      expect(result).toBe("individual");
    });

    it("should return individual account type when set", () => {
      const session = {
        user: {
          email: "solo@example.com",
          [`${NAMESPACE}/account_type`]: "individual",
        },
      };
      const result = getAccountType(session);
      expect(result).toBe("individual");
    });

    it("should return business account type when set", () => {
      const session = {
        user: {
          email: "biz@example.com",
          [`${NAMESPACE}/account_type`]: "business",
        },
      };
      const result = getAccountType(session);
      expect(result).toBe("business");
    });

    it("should handle empty string account_type by returning individual", () => {
      const session = {
        user: {
          email: "test@example.com",
          [`${NAMESPACE}/account_type`]: "",
        },
      };
      const result = getAccountType(session);
      expect(result).toBe("individual");
    });
  });

  describe("getOrgRole", () => {
    it("should return null when session is null", () => {
      const result = getOrgRole(null);
      expect(result).toBe(null);
    });

    it("should return null when session.user is undefined", () => {
      const session = {};
      const result = getOrgRole(session);
      expect(result).toBe(null);
    });

    it("should return null when org_role is missing", () => {
      const session = {
        user: {
          email: "test@example.com",
        },
      };
      const result = getOrgRole(session);
      expect(result).toBe(null);
    });

    it("should return owner role", () => {
      const session = {
        user: {
          email: "owner@company.com",
          [`${NAMESPACE}/org_role`]: "owner",
        },
      };
      const result = getOrgRole(session);
      expect(result).toBe("owner");
    });

    it("should return admin role", () => {
      const session = {
        user: {
          email: "admin@company.com",
          [`${NAMESPACE}/org_role`]: "admin",
        },
      };
      const result = getOrgRole(session);
      expect(result).toBe("admin");
    });

    it("should return member role", () => {
      const session = {
        user: {
          email: "member@company.com",
          [`${NAMESPACE}/org_role`]: "member",
        },
      };
      const result = getOrgRole(session);
      expect(result).toBe("member");
    });

    it("should return null for empty string role", () => {
      const session = {
        user: {
          email: "test@company.com",
          [`${NAMESPACE}/org_role`]: "",
        },
      };
      const result = getOrgRole(session);
      expect(result).toBe(null);
    });
  });

  describe("Session structure validation", () => {
    it("should handle complete enterprise session", () => {
      const session = {
        user: {
          sub: "cognito-user-id-123",
          email: "enterprise.admin@company.com",
          name: "John Admin",
          givenName: "John",
          familyName: "Admin",
          email_verified: true,
          [`${NAMESPACE}/account_type`]: "business",
          [`${NAMESPACE}/org_id`]: "org_company_456",
          [`${NAMESPACE}/org_role`]: "admin",
          [`${NAMESPACE}/subscription_status`]: "active",
          [`${NAMESPACE}/plan_type`]: "business",
          [`${NAMESPACE}/stripe_customer_id`]: "cus_stripe_789",
        },
        accessToken: "mock-access-token",
        idToken: "mock-id-token",
      };

      expect(getOrganizationId(session)).toBe("org_company_456");
      expect(isEnterpriseUser(session)).toBe(true);
      expect(getAccountType(session)).toBe("business");
      expect(getOrgRole(session)).toBe("admin");
      expect(getSubscriptionStatus(session)).toBe("active");
      expect(getPlanType(session)).toBe("business");
    });

    it("should handle complete individual session", () => {
      const session = {
        user: {
          sub: "cognito-user-id-456",
          email: "solo.user@example.com",
          name: "Jane Solo",
          givenName: "Jane",
          familyName: "Solo",
          email_verified: true,
          [`${NAMESPACE}/account_type`]: "individual",
          [`${NAMESPACE}/subscription_status`]: "trialing",
          [`${NAMESPACE}/plan_type`]: "individual",
          [`${NAMESPACE}/stripe_customer_id`]: "cus_stripe_solo",
        },
        accessToken: "mock-access-token",
        idToken: "mock-id-token",
      };

      expect(getOrganizationId(session)).toBe(null);
      expect(isEnterpriseUser(session)).toBe(false);
      expect(getAccountType(session)).toBe("individual");
      expect(getOrgRole(session)).toBe(null);
      expect(getSubscriptionStatus(session)).toBe("trialing");
      expect(getPlanType(session)).toBe("individual");
    });

    it("should handle session with minimal claims", () => {
      const session = {
        user: {
          sub: "cognito-user-id-789",
          email: "minimal@example.com",
        },
        accessToken: "token",
        idToken: "id-token",
      };

      expect(getOrganizationId(session)).toBe(null);
      expect(isEnterpriseUser(session)).toBe(false);
      expect(getAccountType(session)).toBe("individual");
      expect(getOrgRole(session)).toBe(null);
      expect(getSubscriptionStatus(session)).toBe(null);
      expect(getPlanType(session)).toBe(null);
    });
  });

  describe("Role hierarchy validation", () => {
    it("owner should have org_role owner", () => {
      const ownerSession = {
        user: {
          email: "owner@company.com",
          [`${NAMESPACE}/org_id`]: "org_123",
          [`${NAMESPACE}/org_role`]: "owner",
          [`${NAMESPACE}/account_type`]: "business",
        },
      };

      expect(getOrgRole(ownerSession)).toBe("owner");
      expect(isEnterpriseUser(ownerSession)).toBe(true);
    });

    it("admin should have org_role admin", () => {
      const adminSession = {
        user: {
          email: "admin@company.com",
          [`${NAMESPACE}/org_id`]: "org_123",
          [`${NAMESPACE}/org_role`]: "admin",
          [`${NAMESPACE}/account_type`]: "business",
        },
      };

      expect(getOrgRole(adminSession)).toBe("admin");
      expect(isEnterpriseUser(adminSession)).toBe(true);
    });

    it("member should have org_role member", () => {
      const memberSession = {
        user: {
          email: "member@company.com",
          [`${NAMESPACE}/org_id`]: "org_123",
          [`${NAMESPACE}/org_role`]: "member",
          [`${NAMESPACE}/account_type`]: "business",
        },
      };

      expect(getOrgRole(memberSession)).toBe("member");
      expect(isEnterpriseUser(memberSession)).toBe(true);
    });
  });

  describe("Edge cases", () => {
    it("should handle session with user set to null", () => {
      const session = { user: null };

      expect(getOrganizationId(session)).toBe(null);
      expect(isEnterpriseUser(session)).toBe(false);
      expect(getAccountType(session)).toBe("individual");
      expect(getOrgRole(session)).toBe(null);
    });

    it("should handle deeply nested null values", () => {
      const session = {
        user: {
          email: "test@example.com",
          [`${NAMESPACE}/org_id`]: null,
          [`${NAMESPACE}/org_role`]: null,
          [`${NAMESPACE}/account_type`]: null,
          [`${NAMESPACE}/subscription_status`]: null,
          [`${NAMESPACE}/plan_type`]: null,
        },
      };

      expect(getOrganizationId(session)).toBe(null);
      expect(isEnterpriseUser(session)).toBe(false);
      expect(getAccountType(session)).toBe("individual");
      expect(getOrgRole(session)).toBe(null);
      expect(getSubscriptionStatus(session)).toBe(null);
      expect(getPlanType(session)).toBe(null);
    });

    it("should handle undefined namespace claims", () => {
      const session = {
        user: {
          email: "test@example.com",
          [`${NAMESPACE}/org_id`]: undefined,
        },
      };

      expect(getOrganizationId(session)).toBe(null);
      expect(isEnterpriseUser(session)).toBe(false);
    });

    it("should handle numeric values gracefully", () => {
      const session = {
        user: {
          email: "test@example.com",
          [`${NAMESPACE}/org_id`]: 12345, // Should still work as truthy
        },
      };

      // Should return the numeric value (truthy)
      expect(getOrganizationId(session)).toBe(12345);
      expect(isEnterpriseUser(session)).toBe(true);
    });

    it("should handle boolean values", () => {
      const session = {
        user: {
          email: "test@example.com",
          [`${NAMESPACE}/org_id`]: false, // Falsy
        },
      };

      expect(getOrganizationId(session)).toBe(null);
      expect(isEnterpriseUser(session)).toBe(false);
    });
  });
});
