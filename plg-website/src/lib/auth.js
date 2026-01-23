/**
 * Authentication Utilities
 *
 * Provides helper functions for authentication and authorization:
 * - Session validation
 * - Role-based access control
 * - Permission enforcement
 *
 * @see Security Considerations for Auth0 Integration - Section 6.3
 */

import { Auth0Client } from "@auth0/nextjs-auth0/server";

// Auth0 v4 client instance
const auth0 = new Auth0Client();

// Re-export getSession for compatibility
export const getSession = () => auth0.getSession();

const NAMESPACE = "https://hic-ai.com";

/**
 * Custom authentication error
 */
export class AuthError extends Error {
  constructor(message, statusCode = 401) {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
  }
}

/**
 * Require authentication - throws if not authenticated
 * @returns {Promise<Object>} Session object
 */
export async function requireAuth() {
  const session = await getSession();

  if (!session?.user) {
    throw new AuthError("Authentication required", 401);
  }

  return session;
}

/**
 * Require specific organization role(s)
 * @param {string[]} requiredRoles - Array of allowed roles
 * @returns {Promise<Object>} Session object
 */
export async function requireOrgRole(requiredRoles) {
  const session = await requireAuth();
  const roles = session.user[`${NAMESPACE}/org_roles`] || [];

  const hasRole = requiredRoles.some((role) => roles.includes(role));

  if (!hasRole) {
    throw new AuthError("Insufficient permissions", 403);
  }

  return session;
}

/**
 * Require Billing Contact role (highest privilege)
 * Only billing contacts can: delete org, change subscription, update payment
 */
export async function requireBillingContact() {
  return requireOrgRole(["org_billing"]);
}

/**
 * Require Admin role (Billing Contact or Admin)
 * Admins can: manage licenses, invite members, view usage
 */
export async function requireAdmin() {
  return requireOrgRole(["org_billing", "org_admin"]);
}

/**
 * Require Member role (any org member)
 * Members can: view own license, activate devices
 */
export async function requireMember() {
  return requireOrgRole(["org_billing", "org_admin", "org_member"]);
}

/**
 * Get user's customer ID from session
 * @param {Object} session - Auth0 session
 * @returns {string|null} Customer ID
 */
export function getCustomerId(session) {
  return session?.user?.[`${NAMESPACE}/customer_id`] || null;
}

/**
 * Get user's organization ID from session
 * @param {Object} session - Auth0 session
 * @returns {string|null} Organization ID
 */
export function getOrgId(session) {
  return session?.user?.[`${NAMESPACE}/org_id`] || null;
}

/**
 * Get user's account type from session
 * @param {Object} session - Auth0 session
 * @returns {string|null} Account type (individual, enterprise, oss)
 */
export function getAccountType(session) {
  return session?.user?.[`${NAMESPACE}/account_type`] || null;
}

/**
 * Check if user is a billing contact
 * @param {Object} session - Auth0 session
 * @returns {boolean}
 */
export function isBillingContact(session) {
  const roles = session?.user?.[`${NAMESPACE}/org_roles`] || [];
  return roles.includes("org_billing");
}

/**
 * Check if user is an admin (billing contact or admin)
 * @param {Object} session - Auth0 session
 * @returns {boolean}
 */
export function isAdmin(session) {
  const roles = session?.user?.[`${NAMESPACE}/org_roles`] || [];
  return roles.includes("org_billing") || roles.includes("org_admin");
}

/**
 * Allowed return paths for secure redirects
 */
const ALLOWED_RETURN_PATHS = [
  "/portal",
  "/admin",
  "/portal/license",
  "/portal/devices",
  "/portal/billing",
  "/portal/settings",
  "/admin/members",
  "/admin/billing",
  "/admin/settings",
];

/**
 * Validate and sanitize return URL to prevent open redirects
 * @param {string} returnTo - Requested return path
 * @returns {string} Safe return path
 */
export function validateReturnTo(returnTo) {
  if (!returnTo) return "/portal";

  // Must be relative path
  if (returnTo.startsWith("http://") || returnTo.startsWith("https://")) {
    console.warn("Attempted open redirect:", returnTo);
    return "/portal";
  }

  // Must be in allowed list (or prefix match)
  const isAllowed = ALLOWED_RETURN_PATHS.some(
    (path) => returnTo === path || returnTo.startsWith(path + "/"),
  );

  if (!isAllowed) {
    console.warn("Unauthorized return path:", returnTo);
    return "/portal";
  }

  return returnTo;
}
