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
 * @see Security Considerations for Auth0 Integration - Section 7.1
 */

import { NextResponse } from "next/server";

const AUTH0_NAMESPACE = "https://hic-ai.com";

// Routes that require admin or owner role for business accounts
const ADMIN_ONLY_ROUTES = ["/portal/billing", "/portal/team"];

export async function middleware(req) {
  const path = req.nextUrl.pathname;

  // ===========================================
  // AUTH0 MIDDLEWARE (must run on ALL requests)
  // ===========================================
  // Auth0 SDK v4 handles /auth/* routes via middleware
  // This MUST be called before any other logic
  let auth0, getOrganizationId;
  try {
    const auth0Module = await import("./lib/auth0.js");
    auth0 = auth0Module.getAuth0Client();
    getOrganizationId = auth0Module.getOrganizationId;
  } catch (error) {
    console.error("[Middleware] Auth0 not configured:", error.message);
    // In development, allow access if Auth0 isn't configured
    if (process.env.NODE_ENV === "development") {
      console.log(`[DEV] Auth0 not configured, allowing access to: ${path}`);
      return NextResponse.next();
    }
    // In production, redirect to home if Auth0 fails (except public routes)
    const requiresAuth =
      path.startsWith("/portal") || path.startsWith("/admin");
    if (requiresAuth) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  // Let Auth0 handle /auth/* routes (login, logout, callback, etc.)
  const authRes = await auth0.middleware(req);

  // Auth0 SDK v4: ALWAYS return authRes for /auth/* routes
  // The middleware handles login, logout, callback, profile, access-token
  if (path.startsWith("/auth")) {
    return authRes;
  }

  // For non-auth routes, only return authRes if it has a response
  if (authRes) {
    return authRes;
  }

  // ===========================================
  // DEV MODE BYPASS (development only)
  // ===========================================
  // Add ?dev=preview to any URL to bypass auth checks
  // Only works when NODE_ENV=development
  if (process.env.NODE_ENV === "development") {
    const devParam = req.nextUrl.searchParams.get("dev");
    if (devParam === "preview") {
      console.log(`[DEV] Auth bypass for: ${path}`);
      return NextResponse.next();
    }
  }

  // Only apply additional auth checks to protected routes
  const requiresAuth = path.startsWith("/portal") || path.startsWith("/admin");
  if (!requiresAuth) {
    return NextResponse.next();
  }

  const session = await auth0.getSession();

  if (!session) {
    // Redirect to login
    return NextResponse.redirect(new URL("/auth/login", req.url));
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
        return NextResponse.redirect(new URL("/portal", req.url));
      }
    }
  }

  // Admin routes require organization context (business users)
  if (path.startsWith("/admin")) {
    const orgId = getOrganizationId(session);

    if (!orgId) {
      // Individual user trying to access admin - redirect to portal
      return NextResponse.redirect(new URL("/portal", req.url));
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
