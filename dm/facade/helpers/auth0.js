/**
 * Auth0 Mock Factory
 *
 * Provides mock implementations for Auth0 SDK operations used in PLG.
 * Follows the same pattern as other HIC mock factories (createDynamoMock, etc.)
 *
 * The Auth0 SDK uses a client-based approach where:
 * - Auth0Client handles session management
 * - middleware() is called on each request
 * - getSession() returns the current user session
 *
 * @see dm/facade/helpers/dynamodb.js for pattern reference
 */

import { createSpy } from "../test-helpers/spy.js";

/**
 * Create a mock Auth0 client with all methods used in PLG
 *
 * Usage:
 *   import { createAuth0Mock } from 'hic-test-helpers';
 *   const auth0Mock = createAuth0Mock();
 *
 *   // Configure session
 *   auth0Mock.getSession.mockResolvedValue({
 *     user: { sub: 'auth0|123', email: 'test@example.com' }
 *   });
 *
 *   // Inject into module under test
 *   __setAuth0ClientForTests(auth0Mock);
 *
 * @returns {Object} Mock Auth0Client with spied methods
 */
export function createAuth0Mock() {
  const mock = {
    // Core middleware method (called on every request)
    middleware: createSpy("auth0.middleware"),

    // Session management
    getSession: createSpy("auth0.getSession"),
    touchSession: createSpy("auth0.touchSession"),
    updateSession: createSpy("auth0.updateSession"),

    // Access token (for API calls)
    getAccessToken: createSpy("auth0.getAccessToken"),

    // User handlers (typically used in API routes)
    handleLogin: createSpy("auth0.handleLogin"),
    handleLogout: createSpy("auth0.handleLogout"),
    handleCallback: createSpy("auth0.handleCallback"),
    handleProfile: createSpy("auth0.handleProfile"),
  };

  // Set sensible defaults
  // middleware() returns null by default (let request proceed)
  mock.middleware.mockResolvedValue(null);

  // getSession() returns null by default (no session)
  mock.getSession.mockResolvedValue(null);

  // Attach helper methods for test setup
  mock.reset = () => {
    Object.values(mock).forEach((spy) => {
      if (typeof spy.reset === "function") {
        spy.reset();
      }
    });
    // Restore defaults after reset
    mock.middleware.mockResolvedValue(null);
    mock.getSession.mockResolvedValue(null);
  };

  /**
   * Helper to simulate authenticated user
   * @param {Object} user - User data to include in session
   */
  mock.simulateAuthenticatedUser = (user) => {
    mock.getSession.mockResolvedValue(createMockSession(user));
    return mock;
  };

  /**
   * Helper to simulate unauthenticated state
   */
  mock.simulateUnauthenticated = () => {
    mock.getSession.mockResolvedValue(null);
    return mock;
  };

  /**
   * Helper to simulate enterprise user with organization
   * @param {Object} user - Base user data
   * @param {string} orgId - Organization ID
   */
  mock.simulateEnterpriseUser = (user, orgId) => {
    mock.getSession.mockResolvedValue(
      createMockSession({
        ...user,
        "https://hic-ai.com/org_id": orgId,
      }),
    );
    return mock;
  };

  return mock;
}

/**
 * Create mock Auth0 session for testing
 *
 * @param {Object} userOverrides - User properties to override defaults
 * @param {Object} sessionOverrides - Session properties to override defaults
 * @returns {Object} Mock Auth0 session
 */
export function createMockSession(userOverrides = {}, sessionOverrides = {}) {
  const now = Math.floor(Date.now() / 1000);

  return {
    user: {
      sub: `auth0|test_${Date.now()}`,
      email: "test@example.com",
      email_verified: true,
      name: "Test User",
      nickname: "testuser",
      picture: "https://example.com/avatar.png",
      updated_at: new Date().toISOString(),
      ...userOverrides,
    },
    accessToken: `test_access_token_${Date.now()}`,
    accessTokenExpiresAt: now + 86400, // +24 hours
    idToken: `test_id_token_${Date.now()}`,
    ...sessionOverrides,
  };
}

/**
 * Create mock Auth0 user with common PLG claims
 */
export function createMockAuth0User(overrides = {}) {
  return {
    sub: `auth0|test_${Date.now()}`,
    email: "test@example.com",
    email_verified: true,
    name: "Test User",
    nickname: "testuser",
    picture: "https://example.com/avatar.png",
    updated_at: new Date().toISOString(),
    // PLG-specific custom claims
    "https://hic-ai.com/stripe_customer_id": null,
    "https://hic-ai.com/subscription_status": null,
    "https://hic-ai.com/plan_type": null,
    "https://hic-ai.com/org_id": null,
    ...overrides,
  };
}

/**
 * Create mock individual user (non-enterprise)
 */
export function createMockIndividualUser(overrides = {}) {
  return createMockAuth0User({
    "https://hic-ai.com/stripe_customer_id": "cus_test_123",
    "https://hic-ai.com/subscription_status": "active",
    "https://hic-ai.com/plan_type": "individual",
    ...overrides,
  });
}

/**
 * Create mock enterprise user with organization
 */
export function createMockEnterpriseUser(orgId, overrides = {}) {
  return createMockAuth0User({
    "https://hic-ai.com/stripe_customer_id": "cus_test_123",
    "https://hic-ai.com/subscription_status": "active",
    "https://hic-ai.com/plan_type": "enterprise",
    "https://hic-ai.com/org_id": orgId,
    ...overrides,
  });
}

/**
 * Create mock OSS user (free tier)
 */
export function createMockOSSUser(overrides = {}) {
  return createMockAuth0User({
    "https://hic-ai.com/subscription_status": "active",
    "https://hic-ai.com/plan_type": "oss",
    ...overrides,
  });
}
