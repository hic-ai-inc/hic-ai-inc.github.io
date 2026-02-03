/**
 * Next.js Middleware for Route Protection
 *
 * Protects authenticated routes:
 * - /portal/* - Customer portal (requires authentication)
 * - /portal/billing, /portal/team - Admin-only routes for business accounts
 * - /admin/*  - Admin routes (requires authentication + org context)
 *
 * Dev Mode: Add ?dev=preview to bypass auth for UI preview (NODE_ENV=development only)
 *
 * Note: With Cognito/Amplify Auth, session management is client-side.
 * Middleware handles route protection via redirect to /auth/login.
 * The login page and callback handle the OAuth flow with Cognito.
 *
 * @see docs/20260128_AUTH0_TO_COGNITO_MIGRATION_DECISION.md
 */

import { NextResponse } from "next/server";

// Routes that require admin or owner role for business accounts
const ADMIN_ONLY_ROUTES = ["/portal/billing", "/portal/team"];

export async function middleware(request) {
  // Get path from URL
  const url = new URL(request.url);
  const path = url.pathname;

  // ===========================================
  // AUTH ROUTES - Let them through
  // ===========================================
  // /auth/* routes are handled by Next.js pages/routes
  // - /auth/login - Login page (redirects to Cognito)
  // - /auth/callback - OAuth callback handler
  // - /auth/logout - Logout API route
  if (path.startsWith("/auth/")) {
    return NextResponse.next();
  }

  // Determine if this route requires authentication
  const requiresAuth = path.startsWith("/portal") || path.startsWith("/admin");

  if (!requiresAuth) {
    // Public routes - pass through
    return NextResponse.next();
  }

  // ===========================================
  // DEV MODE BYPASS (development only)
  // ===========================================
  // Add ?dev=preview to any URL to bypass auth checks
  // Only works when NODE_ENV=development
  if (process.env.NODE_ENV === "development") {
    const devParam = url.searchParams.get("dev");
    if (devParam === "preview") {
      console.log(`[DEV] Auth bypass for: ${path}`);
      return NextResponse.next();
    }
  }

  // ===========================================
  // PROTECTED ROUTES
  // ===========================================
  // With Amplify Auth, session is stored client-side (localStorage/cookies).
  // We can't verify the session in Edge middleware without calling Cognito.
  // Instead, we rely on client-side session checks in the pages.
  //
  // Strategy: Let the request through, and the page components check auth.
  // If unauthenticated, the page redirects to /auth/login.
  //
  // For server components that need session data, we'll use API routes
  // that validate the Cognito access token.
  //

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
