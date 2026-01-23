/**
 * User Test Fixtures
 *
 * Provides consistent user data for testing across PLG components.
 * Users are structured to match Auth0 session/token claims.
 */

/**
 * Individual user (non-enterprise, paying subscription)
 */
export const individualUser = {
  sub: "auth0|individual_user_123",
  email: "individual@example.com",
  email_verified: true,
  name: "Individual User",
  nickname: "individual",
  picture: "https://example.com/avatar-individual.png",
  updated_at: "2026-01-01T00:00:00.000Z",
  // PLG custom claims
  "https://hic-ai.com/plan_type": "individual",
  "https://hic-ai.com/subscription_status": "active",
  "https://hic-ai.com/stripe_customer_id": "cus_individual_123",
  "https://hic-ai.com/org_id": null,
};

/**
 * Enterprise user (with organization context)
 */
export const enterpriseUser = {
  sub: "auth0|enterprise_user_123",
  email: "admin@acme-corp.com",
  email_verified: true,
  name: "Enterprise Admin",
  nickname: "enterprise",
  picture: "https://example.com/avatar-enterprise.png",
  updated_at: "2026-01-01T00:00:00.000Z",
  // PLG custom claims
  "https://hic-ai.com/plan_type": "enterprise",
  "https://hic-ai.com/subscription_status": "active",
  "https://hic-ai.com/stripe_customer_id": "cus_enterprise_123",
  "https://hic-ai.com/org_id": "org_acme_123",
};

/**
 * Expired/past due user (subscription lapsed)
 */
export const expiredUser = {
  sub: "auth0|expired_user_123",
  email: "expired@example.com",
  email_verified: true,
  name: "Expired User",
  nickname: "expired",
  picture: "https://example.com/avatar-expired.png",
  updated_at: "2025-06-01T00:00:00.000Z",
  // PLG custom claims
  "https://hic-ai.com/plan_type": "individual",
  "https://hic-ai.com/subscription_status": "past_due",
  "https://hic-ai.com/stripe_customer_id": "cus_expired_123",
  "https://hic-ai.com/org_id": null,
};

/**
 * Cancelled user (subscription cancelled but access until period end)
 */
export const cancelledUser = {
  sub: "auth0|cancelled_user_123",
  email: "cancelled@example.com",
  email_verified: true,
  name: "Cancelled User",
  nickname: "cancelled",
  picture: "https://example.com/avatar-cancelled.png",
  updated_at: "2026-01-15T00:00:00.000Z",
  // PLG custom claims
  "https://hic-ai.com/plan_type": "individual",
  "https://hic-ai.com/subscription_status": "cancelled",
  "https://hic-ai.com/stripe_customer_id": "cus_cancelled_123",
  "https://hic-ai.com/org_id": null,
};

/**
 * New user (just signed up, no subscription yet)
 */
export const newUser = {
  sub: "auth0|new_user_123",
  email: "newuser@example.com",
  email_verified: true,
  name: "New User",
  nickname: "newuser",
  picture: "https://example.com/avatar-new.png",
  updated_at: new Date().toISOString(),
  // PLG custom claims - new user with no subscription
  "https://hic-ai.com/plan_type": null,
  "https://hic-ai.com/subscription_status": null,
  "https://hic-ai.com/stripe_customer_id": null,
  "https://hic-ai.com/org_id": null,
};

/**
 * Enterprise member (non-admin member of organization)
 */
export const enterpriseMember = {
  sub: "auth0|enterprise_member_456",
  email: "member@acme-corp.com",
  email_verified: true,
  name: "Enterprise Member",
  nickname: "member",
  picture: "https://example.com/avatar-member.png",
  updated_at: "2026-01-10T00:00:00.000Z",
  // PLG custom claims
  "https://hic-ai.com/plan_type": "enterprise",
  "https://hic-ai.com/subscription_status": "active",
  "https://hic-ai.com/stripe_customer_id": null, // Members don't have their own customer ID
  "https://hic-ai.com/org_id": "org_acme_123",
};

/**
 * All test users exported as a collection
 */
export const testUsers = {
  individualUser,
  enterpriseUser,
  expiredUser,
  cancelledUser,
  newUser,
  enterpriseMember,
};

/**
 * Create a session object wrapping a user
 * @param {Object} user - User fixture
 * @param {Object} overrides - Session property overrides
 */
export function createSession(user, overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    user,
    accessToken: `test_access_token_${Date.now()}`,
    accessTokenExpiresAt: now + 86400, // +24 hours
    idToken: `test_id_token_${Date.now()}`,
    ...overrides,
  };
}

/**
 * Create an authenticated session for individual user
 */
export function createIndividualSession(overrides = {}) {
  return createSession(individualUser, overrides);
}

/**
 * Create an authenticated session for enterprise user
 */
export function createEnterpriseSession(overrides = {}) {
  return createSession(enterpriseUser, overrides);
}

export default testUsers;
