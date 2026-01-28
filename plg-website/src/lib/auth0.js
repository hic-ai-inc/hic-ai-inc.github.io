/**
 * Auth0 Client Wrapper for PLG
 *
 * Provides a centralized Auth0 client with injectable seams for testing.
 * This module wraps the Auth0 SDK to enable consistent mocking across
 * all PLG components.
 *
 * @see Security Considerations for Auth0 Integration - Section 7.1
 */

import { Auth0Client } from "@auth0/nextjs-auth0/server";

/**
 * Auth0 client instance - exported directly per Auth0 SDK v4 conventions
 * The SDK reads env vars at construction time (AUTH0_DOMAIN, AUTH0_CLIENT_ID, etc.)
 */
export const auth0 = new Auth0Client();

/**
 * Get the current Auth0 client (for backwards compatibility)
 * This should be used instead of instantiating Auth0Client directly
 */
export function getAuth0Client() {
  return auth0;
}

/**
 * Injectable seam for testing - allows replacing the Auth0 client
 * Note: This only works for code using getAuth0Client(), not direct auth0 import
 * @param {Object} mockClient - Mock Auth0 client (from createAuth0Mock())
 */
export function __setAuth0ClientForTests(mockClient) {
  auth0Client = mockClient;
}

/**
 * Reset to default (production) Auth0 client
 * Sets to null so it will be lazily re-created on next access
 */
export function __resetAuth0ClientForTests() {
  auth0Client = null;
}

// ============================================
// CONVENIENCE EXPORTS
// These wrap the client methods for easier usage
// ============================================

/**
 * Execute Auth0 middleware for a request
 * @param {Request} req - Incoming request
 * @returns {Promise<Response|null>} Auth0 response or null to continue
 */
export async function auth0Middleware(req) {
  return auth0Client.middleware(req);
}

/**
 * Get the current user session
 * @returns {Promise<Object|null>} Session object or null if not authenticated
 */
export async function getSession() {
  return auth0Client.getSession();
}

/**
 * Get access token for API calls
 * @returns {Promise<Object>} Access token response
 */
export async function getAccessToken() {
  return auth0Client.getAccessToken();
}

// ============================================
// NOTE: Auth0 SDK v4 handles auth routes via middleware
// Login/logout/callback are at /auth/login, /auth/logout, /auth/callback
// These are NOT exposed as client methods - use middleware instead
// ============================================

/**
 * Check if user has enterprise organization
 * @param {Object} session - Auth0 session
 * @returns {string|null} Organization ID or null
 */
export function getOrganizationId(session) {
  return session?.user?.["https://hic-ai.com/org_id"] || null;
}

/**
 * Check if user is an enterprise user
 * @param {Object} session - Auth0 session
 * @returns {boolean} True if enterprise user
 */
export function isEnterpriseUser(session) {
  return !!getOrganizationId(session);
}

/**
 * Get user's subscription status from session
 * @param {Object} session - Auth0 session
 * @returns {string|null} Subscription status
 */
export function getSubscriptionStatus(session) {
  return session?.user?.["https://hic-ai.com/subscription_status"] || null;
}

/**
 * Get user's plan type from session
 * @param {Object} session - Auth0 session
 * @returns {string|null} Plan type (oss, individual, enterprise)
 */
export function getPlanType(session) {
  return session?.user?.["https://hic-ai.com/plan_type"] || null;
}

/**
 * Get user's Stripe customer ID from session
 * @param {Object} session - Auth0 session
 * @returns {string|null} Stripe customer ID
 */
export function getStripeCustomerId(session) {
  return session?.user?.["https://hic-ai.com/stripe_customer_id"] || null;
}
