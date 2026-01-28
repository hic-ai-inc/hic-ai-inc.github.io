/**
 * Next.js Proxy for Route Protection (Next.js 16+)
 *
 * Protects authenticated routes:
 * - /portal/* - Customer portal (requires authentication)
 * - /portal/billing, /portal/team - Admin-only routes for business accounts
 * - /admin/*  - Admin routes (requires authentication + org context)
 *
 * Dev Mode: Add ?dev=preview to bypass auth for UI preview (NODE_ENV=development only)
 *
 * @see Security Considerations for Auth0 Integration - Section 7.1
 */

import { NextResponse } from "next/server";

const AUTH0_NAMESPACE = "https://hic-ai.com";

// Routes that require admin or owner role for business accounts
const ADMIN_ONLY_ROUTES = ["/portal/billing", "/portal/team"];

export async function proxy(request) {
  // Next.js 16 proxy receives standard Request, not NextRequest
  // Get path from URL
  const url = new URL(request.url);
  const path = url.pathname;

  // ===========================================
  // AUTH0 MIDDLEWARE (MUST run first on ALL requests)
  // ===========================================
  // Auth0 SDK v4 handles /auth/* routes via middleware
  // For all other routes, it returns NextResponse.next() with session cookies
  let auth0, getOrganizationId;
  try {
    const auth0Module = await import("./lib/auth0.js");
    auth0 = auth0Module.getAuth0Client();
    getOrganizationId = auth0Module.getOrganizationId;
  } catch (error) {
    console.error("[Proxy] Auth0 not configured:", error.message);
    // In development, allow access if Auth0 isn't configured
    if (process.env.NODE_ENV === "development") {
      console.log(`[DEV] Auth0 not configured, allowing access to: ${path}`);
      return NextResponse.next();
    }
    // In production, redirect to home if Auth0 fails (except public routes)
    const requiresAuth =
      path.startsWith("/portal") || path.startsWith("/admin");
    if (requiresAuth) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // CRITICAL: Auth0 SDK v4 middleware handles EVERYTHING
  // - For /auth/* routes: Returns redirect to Auth0 or handles callback
  // - For other routes: Returns NextResponse.next() with session cookies
  const authRes = await auth0.middleware(request);

  // For /auth/* routes, ALWAYS return the Auth0 response (redirect to Auth0, callback handling, etc.)
  if (path.startsWith("/auth/")) {
    return authRes;
  }

  // For protected routes, check session after Auth0 middleware runs
  const requiresAuth = path.startsWith("/portal") || path.startsWith("/admin");

  if (!requiresAuth) {
    // Public routes: Return Auth0 response (includes session cookies)
    return authRes;
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

  // Protected routes - check session
  const session = await auth0.getSession();

  if (!session) {
    // Redirect to login with returnTo
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("returnTo", path);
    return NextResponse.redirect(loginUrl);
  }

  // Role-based protection for business admin-only routes
  if (ADMIN_ONLY_ROUTES.some((route) => path.startsWith(route))) {
    const accountType =
      session.user?.[`${AUTH0_NAMESPACE}/account_type`] || "individual";
    const orgRole = session.user?.[`${AUTH0_NAMESPACE}/org_role`] || "member";

    // Only enforce for business accounts
    if (accountType === "business") {
      // Regular members cannot access admin-only routes
      if (orgRole === "member") {
        return NextResponse.redirect(new URL("/portal", request.url));
      }
    }
  }

  // Admin routes require organization context (business users)
  if (path.startsWith("/admin")) {
    const orgId = getOrganizationId(session);

    if (!orgId) {
      // Individual user trying to access admin - redirect to portal
      return NextResponse.redirect(new URL("/portal", request.url));
    }
  }

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
