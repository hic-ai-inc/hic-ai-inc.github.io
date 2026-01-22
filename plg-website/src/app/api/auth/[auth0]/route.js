/**
 * Auth0 Authentication Routes
 *
 * This file handles all Auth0 authentication routes:
 * - /api/auth/login    - Initiates login flow
 * - /api/auth/logout   - Logs user out
 * - /api/auth/callback - Handles OAuth callback
 * - /api/auth/me       - Returns user profile
 *
 * @see https://auth0.com/docs/quickstart/webapp/nextjs
 */

import { handleAuth, handleLogin, handleLogout } from "@auth0/nextjs-auth0";

export const GET = handleAuth({
  login: handleLogin({
    authorizationParams: {
      // OAuth 2.1 scopes
      scope: "openid profile email",
    },
    returnTo: "/portal",
  }),

  logout: handleLogout({
    returnTo: "/",
  }),
});
