/**
 * Authentication Utilities
 *
 * Provides helper functions for authentication and authorization:
 * - Session validation
 * - Role-based access control
 * - Permission enforcement
 *
 * Dev Mode: Returns mock session when Auth0 is not configured (development only)
 *
 * @see Security Considerations for Auth0 Integration - Section 6.3
 */

import { Auth0Client } from "@auth0/nextjs-auth0/server";
import { headers } from "next/headers";

// Check if Auth0 is configured
const isAuth0Configured = !!(
  process.env.AUTH0_SECRET &&
  process.env.AUTH0_CLIENT_ID &&
  process.env.AUTH0_CLIENT_SECRET
);

// Dev role configurations for testing all 5 user journeys
// Use URL param ?role=individual|business_solo|business_member|business_admin|business_owner
const DEV_ROLE_CONFIGS = {
  individual: {
    account_type: "individual",
    org_id: null,
    org_role: null,
    name: "Individual User",
  },
  business_solo: {
    account_type: "business",
    org_id: "org_preview_solo",
    org_role: "owner", // Solo = owner of 1-person org
    name: "Business Solo User",
  },
  business_member: {
    account_type: "business",
    org_id: "org_preview_123",
    org_role: "member",
    name: "Business Team Member",
  },
  business_admin: {
    account_type: "business",
    org_id: "org_preview_123",
    org_role: "admin",
    name: "Business Admin",
  },
  business_owner: {
    account_type: "business",
    org_id: "org_preview_123",
    org_role: "owner",
    name: "Business Owner",
  },
};

/**
 * Get mock session for development based on URL ?role= parameter
 * @param {string} role - Role from URL parameter
 * @returns {object} Mock session object
 */
function getDevMockSession(role = "business_owner") {
  const config = DEV_ROLE_CONFIGS[role] || DEV_ROLE_CONFIGS.business_owner;

  return {
    user: {
      sub: `auth0|dev-preview-${role}`,
      email: `${role.replace("_", "-")}@example.com`,
      name: config.name,
      picture: null,
      email_verified: true,
      "https://hic-ai.com/account_type": config.account_type,
      "https://hic-ai.com/org_id": config.org_id,
      "https://hic-ai.com/org_role": config.org_role,
      "https://hic-ai.com/stripe_customer_id": "cus_preview_123",
    },
  };
}

// Auth0 v4 client instance (only create if configured)
let auth0 = null;
if (isAuth0Configured) {
  auth0 = new Auth0Client();
}

/**
 * Get current session
 * Returns mock session in development when Auth0 is not configured
 * Dev mode: Use ?role=individual|business_solo|business_member|business_admin|business_owner
 */
export const getSession = async () => {
  // In development without Auth0 configured, return mock session
  if (process.env.NODE_ENV === "development" && !isAuth0Configured) {
    // Read role from URL via referer header (works for server components)
    let role = "business_owner";
    try {
      const headersList = await headers();
      const referer = headersList.get("referer") || "";
      const url = new URL(referer, "http://localhost:3000");
      const roleParam = url.searchParams.get("role");
      if (roleParam && DEV_ROLE_CONFIGS[roleParam]) {
        role = roleParam;
      }
    } catch {
      // Ignore header parsing errors
    }
    console.log(`[DEV] Auth0 not configured, using mock session for role: ${role}`);
    return getDevMockSession(role);
  }

  if (!auth0) {
    console.warn("[Auth] Auth0 not configured");
    return null;
  }

  try {
    return await auth0.getSession();
  } catch (error) {
    // In development, return mock on error
    if (process.env.NODE_ENV === "development") {
      console.log("[DEV] Auth0 error, returning mock session:", error.message);
      return getDevMockSession("business_owner");
    }
    throw error;
  }
};

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
