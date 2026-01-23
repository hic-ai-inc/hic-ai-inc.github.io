/**
 * Auth0 Client Wrapper Tests
 *
 * Tests the auth0.js wrapper module that provides centralized Auth0 client access
 * with injectable seams for testing.
 *
 * Behaviors tested:
 * - Client injection and reset for testing
 * - Session helper functions
 * - Custom claim extraction (org_id, subscription_status, plan_type, stripe_customer_id)
 */

import {
  describe,
  it,
  beforeEach,
  afterEach,
  expect,
} from "../../../../dm/facade/test-helpers/index.js";
import {
  createAuth0Mock,
  createMockSession,
} from "../../../../dm/facade/helpers/auth0.js";

import {
  getAuth0Client,
  __setAuth0ClientForTests,
  __resetAuth0ClientForTests,
  auth0Middleware,
  getSession,
  getAccessToken,
  handleLogin,
  handleLogout,
  handleCallback,
  getOrganizationId,
  isEnterpriseUser,
  getSubscriptionStatus,
  getPlanType,
  getStripeCustomerId,
} from "../../../src/lib/auth0.js";

describe("auth0.js", () => {
  let auth0Mock;

  beforeEach(() => {
    auth0Mock = createAuth0Mock();
    __setAuth0ClientForTests(auth0Mock);
  });

  afterEach(() => {
    __resetAuth0ClientForTests();
  });

  describe("getAuth0Client", () => {
    it("should return the injected mock client during tests", () => {
      const client = getAuth0Client();
      expect(client).toBe(auth0Mock);
    });
  });

  describe("auth0Middleware", () => {
    it("should call the client middleware method", async () => {
      const mockRequest = { url: "https://test.com" };
      auth0Mock.middleware.mockResolvedValue(null);

      const result = await auth0Middleware(mockRequest);

      expect(auth0Mock.middleware.calls.length).toBe(1);
      expect(auth0Mock.middleware.calls[0][0]).toBe(mockRequest);
      expect(result).toBe(null);
    });

    it("should return auth0 response when middleware returns one", async () => {
      const mockRequest = { url: "https://test.com" };
      const mockResponse = new Response("Redirect", { status: 302 });
      auth0Mock.middleware.mockResolvedValue(mockResponse);

      const result = await auth0Middleware(mockRequest);

      expect(result).toBe(mockResponse);
    });
  });

  describe("getSession", () => {
    it("should return null when no session exists", async () => {
      auth0Mock.getSession.mockResolvedValue(null);

      const session = await getSession();

      expect(session).toBe(null);
    });

    it("should return session when user is authenticated", async () => {
      const mockSession = createMockSession({ email: "user@example.com" });
      auth0Mock.getSession.mockResolvedValue(mockSession);

      const session = await getSession();

      expect(session.user.email).toBe("user@example.com");
    });
  });

  describe("getAccessToken", () => {
    it("should call the client getAccessToken method", async () => {
      const tokenResponse = { accessToken: "test_token_123" };
      auth0Mock.getAccessToken.mockResolvedValue(tokenResponse);

      const result = await getAccessToken();

      expect(auth0Mock.getAccessToken.calls.length).toBe(1);
      expect(result.accessToken).toBe("test_token_123");
    });
  });

  describe("handleLogin", () => {
    it("should call the client handleLogin method", async () => {
      const mockRequest = { url: "https://test.com/login" };
      const mockResponse = new Response("Login redirect", { status: 302 });
      auth0Mock.handleLogin.mockResolvedValue(mockResponse);

      const result = await handleLogin(mockRequest);

      expect(auth0Mock.handleLogin.calls.length).toBe(1);
      expect(auth0Mock.handleLogin.calls[0][0]).toBe(mockRequest);
      expect(result).toBe(mockResponse);
    });
  });

  describe("handleLogout", () => {
    it("should call the client handleLogout method", async () => {
      const mockRequest = { url: "https://test.com/logout" };
      const mockResponse = new Response("Logout redirect", { status: 302 });
      auth0Mock.handleLogout.mockResolvedValue(mockResponse);

      const result = await handleLogout(mockRequest);

      expect(auth0Mock.handleLogout.calls.length).toBe(1);
      expect(auth0Mock.handleLogout.calls[0][0]).toBe(mockRequest);
      expect(result).toBe(mockResponse);
    });
  });

  describe("handleCallback", () => {
    it("should call the client handleCallback method", async () => {
      const mockRequest = { url: "https://test.com/callback" };
      const mockResponse = new Response("Callback handled", { status: 200 });
      auth0Mock.handleCallback.mockResolvedValue(mockResponse);

      const result = await handleCallback(mockRequest);

      expect(auth0Mock.handleCallback.calls.length).toBe(1);
      expect(auth0Mock.handleCallback.calls[0][0]).toBe(mockRequest);
      expect(result).toBe(mockResponse);
    });
  });

  describe("getOrganizationId", () => {
    it("should return null when session is null", () => {
      const result = getOrganizationId(null);
      expect(result).toBe(null);
    });

    it("should return null when user has no org_id claim", () => {
      const session = { user: { email: "user@example.com" } };
      const result = getOrganizationId(session);
      expect(result).toBe(null);
    });

    it("should return organization ID when present", () => {
      const session = {
        user: {
          email: "user@example.com",
          "https://hic-ai.com/org_id": "org_enterprise_123",
        },
      };
      const result = getOrganizationId(session);
      expect(result).toBe("org_enterprise_123");
    });
  });

  describe("isEnterpriseUser", () => {
    it("should return false when session is null", () => {
      const result = isEnterpriseUser(null);
      expect(result).toBe(false);
    });

    it("should return false when user has no org_id", () => {
      const session = { user: { email: "user@example.com" } };
      const result = isEnterpriseUser(session);
      expect(result).toBe(false);
    });

    it("should return true when user has org_id", () => {
      const session = {
        user: {
          email: "user@example.com",
          "https://hic-ai.com/org_id": "org_enterprise_123",
        },
      };
      const result = isEnterpriseUser(session);
      expect(result).toBe(true);
    });
  });

  describe("getSubscriptionStatus", () => {
    it("should return null when session is null", () => {
      const result = getSubscriptionStatus(null);
      expect(result).toBe(null);
    });

    it("should return null when user has no subscription_status claim", () => {
      const session = { user: { email: "user@example.com" } };
      const result = getSubscriptionStatus(session);
      expect(result).toBe(null);
    });

    it("should return subscription status when present", () => {
      const session = {
        user: {
          email: "user@example.com",
          "https://hic-ai.com/subscription_status": "active",
        },
      };
      const result = getSubscriptionStatus(session);
      expect(result).toBe("active");
    });

    it("should return trialing status correctly", () => {
      const session = {
        user: {
          email: "user@example.com",
          "https://hic-ai.com/subscription_status": "trialing",
        },
      };
      const result = getSubscriptionStatus(session);
      expect(result).toBe("trialing");
    });
  });

  describe("getPlanType", () => {
    it("should return null when session is null", () => {
      const result = getPlanType(null);
      expect(result).toBe(null);
    });

    it("should return null when user has no plan_type claim", () => {
      const session = { user: { email: "user@example.com" } };
      const result = getPlanType(session);
      expect(result).toBe(null);
    });

    it("should return individual plan type", () => {
      const session = {
        user: {
          email: "user@example.com",
          "https://hic-ai.com/plan_type": "individual",
        },
      };
      const result = getPlanType(session);
      expect(result).toBe("individual");
    });

    it("should return enterprise plan type", () => {
      const session = {
        user: {
          email: "user@example.com",
          "https://hic-ai.com/plan_type": "enterprise",
        },
      };
      const result = getPlanType(session);
      expect(result).toBe("enterprise");
    });
  });

  describe("getStripeCustomerId", () => {
    it("should return null when session is null", () => {
      const result = getStripeCustomerId(null);
      expect(result).toBe(null);
    });

    it("should return null when user has no stripe_customer_id claim", () => {
      const session = { user: { email: "user@example.com" } };
      const result = getStripeCustomerId(session);
      expect(result).toBe(null);
    });

    it("should return Stripe customer ID when present", () => {
      const session = {
        user: {
          email: "user@example.com",
          "https://hic-ai.com/stripe_customer_id": "cus_abc123",
        },
      };
      const result = getStripeCustomerId(session);
      expect(result).toBe("cus_abc123");
    });
  });
});
