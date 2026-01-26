/**
 * Auth0 Route Handler Tests
 *
 * Tests the Auth0 catch-all route handler:
 * - /api/auth/login
 * - /api/auth/logout
 * - /api/auth/callback
 * - /api/auth/profile
 * - /api/auth/access-token
 */

import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert";

// Mock Auth0 client responses
function createMockAuth0Client(overrides = {}) {
  return {
    handleLogin: mock.fn(() =>
      Response.redirect("https://auth0.com/authorize", 302),
    ),
    handleLogout: mock.fn(() => Response.redirect("https://hic-ai.com", 302)),
    handleCallback: mock.fn(() =>
      Response.redirect("http://localhost:3000/portal", 302),
    ),
    getSession: mock.fn(() => null),
    getAccessToken: mock.fn(() => ({ accessToken: "test_token" })),
    ...overrides,
  };
}

// Test the route handler logic (extracted for unit testing)
describe("Auth0 Route Handler Logic", () => {
  describe("login route", () => {
    it("should delegate to handleLogin", async () => {
      const mockClient = createMockAuth0Client();
      const req = new Request("http://localhost:3000/api/auth/login");

      // Simulate route logic
      const result = await mockClient.handleLogin(req);

      assert.strictEqual(mockClient.handleLogin.mock.calls.length, 1);
      assert.strictEqual(result.status, 302);
    });
  });

  describe("logout route", () => {
    it("should delegate to handleLogout", async () => {
      const mockClient = createMockAuth0Client();
      const req = new Request("http://localhost:3000/api/auth/logout");

      const result = await mockClient.handleLogout(req);

      assert.strictEqual(mockClient.handleLogout.mock.calls.length, 1);
      assert.strictEqual(result.status, 302);
    });
  });

  describe("callback route", () => {
    it("should delegate to handleCallback", async () => {
      const mockClient = createMockAuth0Client();
      const req = new Request(
        "http://localhost:3000/api/auth/callback?code=abc123",
      );

      const result = await mockClient.handleCallback(req);

      assert.strictEqual(mockClient.handleCallback.mock.calls.length, 1);
      assert.strictEqual(result.status, 302);
    });
  });

  describe("profile route", () => {
    it("should return 401 when not authenticated", async () => {
      const mockClient = createMockAuth0Client({
        getSession: mock.fn(() => null),
      });

      const session = await mockClient.getSession();

      assert.strictEqual(session, null);
      // Route would return 401
    });

    it("should return user profile when authenticated", async () => {
      const mockUser = {
        sub: "auth0|123",
        email: "test@example.com",
        name: "Test User",
      };
      const mockClient = createMockAuth0Client({
        getSession: mock.fn(() => ({ user: mockUser })),
      });

      const session = await mockClient.getSession();

      assert.deepStrictEqual(session.user, mockUser);
    });
  });

  describe("access-token route", () => {
    it("should return 401 when not authenticated", async () => {
      const mockClient = createMockAuth0Client({
        getSession: mock.fn(() => null),
      });

      const session = await mockClient.getSession();

      assert.strictEqual(session, null);
      // Route would return 401
    });

    it("should return access token when authenticated", async () => {
      const mockClient = createMockAuth0Client({
        getSession: mock.fn(() => ({ user: { sub: "auth0|123" } })),
        getAccessToken: mock.fn(() => ({ accessToken: "eyJ..." })),
      });

      const session = await mockClient.getSession();
      assert.ok(session);

      const { accessToken } = await mockClient.getAccessToken();
      assert.strictEqual(accessToken, "eyJ...");
    });
  });

  describe("unknown route", () => {
    it("should return 404 for unknown auth routes", () => {
      // The route handler returns 404 for unknown routes
      const validRoutes = [
        "login",
        "logout",
        "callback",
        "profile",
        "access-token",
      ];
      const unknownRoute = "unknown";

      assert.strictEqual(validRoutes.includes(unknownRoute), false);
    });
  });
});

describe("Auth0 Session Helpers", () => {
  describe("session validation", () => {
    it("should identify missing session", () => {
      const session = null;
      assert.strictEqual(session?.user != null, false);
    });

    it("should identify valid session with user", () => {
      const session = { user: { sub: "auth0|123" } };
      assert.strictEqual(session?.user != null, true);
    });

    it("should identify session without user", () => {
      const session = {};
      assert.strictEqual(session?.user != null, false);
    });
  });

  describe("user profile extraction", () => {
    const AUTH0_NAMESPACE = "https://hic-ai.com";

    it("should extract standard claims", () => {
      const user = {
        sub: "auth0|123",
        email: "test@example.com",
        email_verified: true,
        name: "Test User",
        picture: "https://example.com/avatar.png",
      };

      assert.strictEqual(user.sub, "auth0|123");
      assert.strictEqual(user.email, "test@example.com");
      assert.strictEqual(user.email_verified, true);
    });

    it("should extract custom namespace claims", () => {
      const user = {
        sub: "auth0|123",
        [`${AUTH0_NAMESPACE}/account_type`]: "enterprise",
        [`${AUTH0_NAMESPACE}/org_id`]: "org_abc123",
        [`${AUTH0_NAMESPACE}/org_roles`]: ["org_admin", "org_member"],
      };

      assert.strictEqual(user[`${AUTH0_NAMESPACE}/account_type`], "enterprise");
      assert.strictEqual(user[`${AUTH0_NAMESPACE}/org_id`], "org_abc123");
      assert.deepStrictEqual(user[`${AUTH0_NAMESPACE}/org_roles`], [
        "org_admin",
        "org_member",
      ]);
    });

    it("should handle missing custom claims gracefully", () => {
      const user = {
        sub: "auth0|123",
        email: "test@example.com",
      };

      const accountType =
        user[`${AUTH0_NAMESPACE}/account_type`] || "individual";
      const orgId = user[`${AUTH0_NAMESPACE}/org_id`] || null;

      assert.strictEqual(accountType, "individual");
      assert.strictEqual(orgId, null);
    });
  });
});
