/**
 * Amazon Cognito Authentication Configuration
 *
 * Centralized Cognito/Amplify Auth setup for PLG.
 * Replaces Auth0 SDK v4 to resolve Amplify SSR compatibility issues.
 *
 * Environment Variables Required:
 * - NEXT_PUBLIC_COGNITO_USER_POOL_ID: Cognito User Pool ID
 * - NEXT_PUBLIC_COGNITO_CLIENT_ID: Cognito App Client ID
 * - NEXT_PUBLIC_COGNITO_DOMAIN: Cognito hosted UI domain (without https://)
 * - NEXT_PUBLIC_APP_URL: Application base URL (e.g., https://staging.hic-ai.com)
 *
 * @see docs/20260128_AUTH0_TO_COGNITO_MIGRATION_DECISION.md
 */

import { Amplify } from "aws-amplify";
import {
  fetchAuthSession,
  signIn,
  signOut,
  getCurrentUser,
  fetchUserAttributes,
} from "aws-amplify/auth";

// Cognito configuration from environment
const cognitoConfig = {
  userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID,
  userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID,
  domain: process.env.NEXT_PUBLIC_COGNITO_DOMAIN,
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
};

// Custom attribute namespace (matches Auth0 for migration compatibility)
const NAMESPACE = "https://hic-ai.com";

// Check if Cognito is configured
export const isCognitoConfigured = !!(
  cognitoConfig.userPoolId && cognitoConfig.userPoolClientId
);

/**
 * Get Cognito configuration (for callback page token exchange)
 * @returns {Object} Cognito configuration
 */
export function getCognitoConfig() {
  return cognitoConfig;
}

/**
 * Configure Amplify Auth (call once at app initialization)
 * Safe to call multiple times - Amplify handles deduplication
 */
export function configureAmplify() {
  if (!isCognitoConfigured) {
    console.warn("[Cognito] Not configured - missing environment variables");
    return;
  }

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: cognitoConfig.userPoolId,
        userPoolClientId: cognitoConfig.userPoolClientId,
        loginWith: {
          oauth: {
            domain: cognitoConfig.domain,
            scopes: ["openid", "email", "profile"],
            redirectSignIn: [`${cognitoConfig.appUrl}/auth/callback`],
            redirectSignOut: [`${cognitoConfig.appUrl}/`],
            responseType: "code",
          },
        },
      },
    },
  });
}

// Initialize on import (client-side only)
if (typeof window !== "undefined") {
  configureAmplify();
}

/**
 * Get the current authenticated session
 * @returns {Promise<Object|null>} Session with tokens, or null if not authenticated
 */
export async function getSession() {
  if (!isCognitoConfigured) {
    return null;
  }

  try {
    const session = await fetchAuthSession();

    if (!session.tokens) {
      return null;
    }

    // Decode ID token to get user claims
    const idToken = session.tokens.idToken;
    const payload = idToken?.payload || {};

    // Map Cognito attributes to our session format
    // This maintains compatibility with existing code that used Auth0 session
    return {
      user: {
        sub: payload.sub,
        email: payload.email,
        name: payload.name || payload["cognito:username"],
        picture: payload.picture || null,
        email_verified: payload.email_verified,
        // Custom attributes (set via Cognito custom attributes or post-auth Lambda)
        [`${NAMESPACE}/account_type`]:
          payload["custom:account_type"] || "individual",
        [`${NAMESPACE}/org_id`]: payload["custom:org_id"] || null,
        [`${NAMESPACE}/org_role`]: payload["custom:org_role"] || null,
        [`${NAMESPACE}/stripe_customer_id`]:
          payload["custom:stripe_customer_id"] || null,
        [`${NAMESPACE}/subscription_status`]:
          payload["custom:subscription_status"] || null,
        [`${NAMESPACE}/plan_type`]: payload["custom:plan_type"] || null,
      },
      accessToken: session.tokens.accessToken?.toString(),
      idToken: idToken?.toString(),
    };
  } catch (error) {
    // UserUnAuthenticatedException is expected when not logged in
    if (error.name === "UserUnAuthenticatedException") {
      return null;
    }
    console.error("[Cognito] Error fetching session:", error);
    return null;
  }
}

/**
 * Get the current user (basic info only)
 * @returns {Promise<Object|null>} User object or null
 */
export async function getUser() {
  if (!isCognitoConfigured) {
    return null;
  }

  try {
    const user = await getCurrentUser();
    const attributes = await fetchUserAttributes();

    return {
      username: user.username,
      userId: user.userId,
      ...attributes,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Redirect to Cognito Hosted UI for login
 * @param {string} returnTo - URL to return to after login
 */
export function redirectToLogin(returnTo = "/portal") {
  if (!isCognitoConfigured) {
    console.error("[Cognito] Cannot redirect - not configured");
    return;
  }

  // Store returnTo for post-callback redirect
  if (typeof window !== "undefined") {
    sessionStorage.setItem("auth_returnTo", returnTo);
  }

  // Build Cognito hosted UI URL
  const loginUrl = new URL(`https://${cognitoConfig.domain}/oauth2/authorize`);
  loginUrl.searchParams.set("client_id", cognitoConfig.userPoolClientId);
  loginUrl.searchParams.set("response_type", "code");
  loginUrl.searchParams.set("scope", "openid email profile");
  loginUrl.searchParams.set(
    "redirect_uri",
    `${cognitoConfig.appUrl}/auth/callback`,
  );

  window.location.href = loginUrl.toString();
}

/**
 * Redirect to Cognito Hosted UI for Google login
 * @param {string} returnTo - URL to return to after login
 */
export function redirectToGoogleLogin(returnTo = "/portal") {
  if (!isCognitoConfigured) {
    console.error("[Cognito] Cannot redirect - not configured");
    return;
  }

  // Store returnTo for post-callback redirect
  if (typeof window !== "undefined") {
    sessionStorage.setItem("auth_returnTo", returnTo);
  }

  // Build Cognito hosted UI URL with Google identity provider
  const loginUrl = new URL(`https://${cognitoConfig.domain}/oauth2/authorize`);
  loginUrl.searchParams.set("client_id", cognitoConfig.userPoolClientId);
  loginUrl.searchParams.set("response_type", "code");
  loginUrl.searchParams.set("scope", "openid email profile");
  loginUrl.searchParams.set(
    "redirect_uri",
    `${cognitoConfig.appUrl}/auth/callback`,
  );
  loginUrl.searchParams.set("identity_provider", "Google");

  window.location.href = loginUrl.toString();
}

/**
 * Sign out the current user
 * @param {boolean} global - If true, sign out from all devices
 */
export async function logout(global = false) {
  if (!isCognitoConfigured) {
    return;
  }

  try {
    await signOut({ global });

    // Redirect to Cognito logout endpoint to clear hosted UI session
    const logoutUrl = new URL(`https://${cognitoConfig.domain}/logout`);
    logoutUrl.searchParams.set("client_id", cognitoConfig.userPoolClientId);
    logoutUrl.searchParams.set("logout_uri", cognitoConfig.appUrl);

    window.location.href = logoutUrl.toString();
  } catch (error) {
    console.error("[Cognito] Error signing out:", error);
    // Redirect to home anyway
    window.location.href = cognitoConfig.appUrl;
  }
}

/**
 * Get the stored returnTo URL (for use after OAuth callback)
 * @returns {string} Return URL or default ('/portal')
 */
export function getReturnToUrl() {
  if (typeof window === "undefined") {
    return "/portal";
  }

  const returnTo = sessionStorage.getItem("auth_returnTo") || "/portal";
  sessionStorage.removeItem("auth_returnTo");
  return returnTo;
}

// ============================================
// HELPER FUNCTIONS (Maintain Auth0 API parity)
// ============================================

/**
 * Check if user has enterprise organization
 * @param {Object} session - Cognito session
 * @returns {string|null} Organization ID or null
 */
export function getOrganizationId(session) {
  return session?.user?.[`${NAMESPACE}/org_id`] || null;
}

/**
 * Check if user is an enterprise user
 * @param {Object} session - Cognito session
 * @returns {boolean} True if enterprise user
 */
export function isEnterpriseUser(session) {
  return !!getOrganizationId(session);
}

/**
 * Get user's subscription status from session
 * @param {Object} session - Cognito session
 * @returns {string|null} Subscription status
 */
export function getSubscriptionStatus(session) {
  return session?.user?.[`${NAMESPACE}/subscription_status`] || null;
}

/**
 * Get user's plan type from session
 * @param {Object} session - Cognito session
 * @returns {string|null} Plan type (oss, individual, enterprise)
 */
export function getPlanType(session) {
  return session?.user?.[`${NAMESPACE}/plan_type`] || null;
}

/**
 * Get user's account type from session
 * @param {Object} session - Cognito session
 * @returns {string} Account type (individual, business)
 */
export function getAccountType(session) {
  return session?.user?.[`${NAMESPACE}/account_type`] || "individual";
}

/**
 * Get user's organization role from session
 * @param {Object} session - Cognito session
 * @returns {string|null} Role (owner, admin, member) or null
 */
export function getOrgRole(session) {
  return session?.user?.[`${NAMESPACE}/org_role`] || null;
}
