/**
 * Next.js Middleware for Route Protection
 *
 * Protects authenticated routes:
 * - /portal/* - Customer portal (requires authentication)
 * - /portal/billing, /portal/team - Admin-only routes for enterprise accounts
 * - /admin/*  - Admin routes (requires authentication + org context)
 *
 * @see Security Considerations for Auth0 Integration - Section 7.1
 */

import { NextResponse } from "next/server";
import { getAuth0Client, getOrganizationId } from "./lib/auth0.js";

const AUTH0_NAMESPACE = "https://hic-ai.com";

// Routes that require admin or owner role for enterprise accounts
const ADMIN_ONLY_ROUTES = ["/portal/billing", "/portal/team"];

export async function middleware(req) {
  const auth0 = getAuth0Client();
  const authRes = await auth0.middleware(req);

  // If Auth0 middleware returned a response, use it (redirects, etc.)
  if (authRes) {
    return authRes;
  }

  const path = req.nextUrl.pathname;

  // Check if route requires authentication
  if (path.startsWith("/portal") || path.startsWith("/admin")) {
    const session = await auth0.getSession();

    if (!session) {
      // Redirect to login
      return NextResponse.redirect(new URL("/auth/login", req.url));
    }

    // Role-based protection for enterprise admin-only routes
    if (ADMIN_ONLY_ROUTES.some((route) => path.startsWith(route))) {
      const accountType =
        session.user?.[`${AUTH0_NAMESPACE}/account_type`] || "individual";
      const orgRole = session.user?.[`${AUTH0_NAMESPACE}/org_role`] || "member";

      // Only enforce for enterprise accounts
      if (accountType === "enterprise") {
        // Regular members cannot access admin-only routes
        if (orgRole === "member") {
          return NextResponse.redirect(new URL("/portal", req.url));
        }
      }
    }

    // Admin routes require organization context (enterprise users)
    if (path.startsWith("/admin")) {
      const orgId = getOrganizationId(session);

      if (!orgId) {
        // Individual user trying to access admin - redirect to portal
        return NextResponse.redirect(new URL("/portal", req.url));
      }
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
