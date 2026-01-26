/**
 * Auth0 Catch-All Route Handler
 *
 * Handles all Auth0 authentication flows:
 * - /api/auth/login    → Redirects to Auth0 login
 * - /api/auth/logout   → Clears session, redirects to Auth0 logout
 * - /api/auth/callback → Handles OAuth callback from Auth0
 * - /api/auth/profile  → Returns current user profile (JSON)
 * - /api/auth/access-token → Returns access token for API calls
 *
 * @see https://github.com/auth0/nextjs-auth0
 * @see Security Considerations for Auth0 Integration - Section 7.1
 */

import { getAuth0Client } from "@/lib/auth0";

/**
 * GET handler for Auth0 routes
 * Delegates to Auth0 SDK's built-in handlers
 */
export async function GET(req, ctx) {
  const auth0 = getAuth0Client();
  const { params } = ctx;
  const auth0Params = await params;
  const route = auth0Params.auth0;

  try {
    switch (route) {
      case "login":
        return auth0.handleLogin(req);

      case "logout":
        return auth0.handleLogout(req);

      case "callback":
        return auth0.handleCallback(req);

      case "profile": {
        const session = await auth0.getSession();
        if (!session) {
          return Response.json({ error: "Not authenticated" }, { status: 401 });
        }
        return Response.json(session.user);
      }

      case "access-token": {
        const session = await auth0.getSession();
        if (!session) {
          return Response.json({ error: "Not authenticated" }, { status: 401 });
        }
        try {
          const { accessToken } = await auth0.getAccessToken();
          return Response.json({ accessToken });
        } catch {
          return Response.json(
            { error: "Failed to get access token" },
            { status: 500 },
          );
        }
      }

      default:
        return Response.json({ error: "Not found" }, { status: 404 });
    }
  } catch (error) {
    console.error(`Auth0 ${route} error:`, error);

    // Auth0 SDK errors often include redirect responses
    if (error.status && error.headers) {
      return error;
    }

    return Response.json(
      { error: error.message || "Authentication error" },
      { status: error.status || 500 },
    );
  }
}

/**
 * POST handler for Auth0 routes
 * Some Auth0 operations (like logout with body) use POST
 */
export async function POST(req, ctx) {
  return GET(req, ctx);
}
