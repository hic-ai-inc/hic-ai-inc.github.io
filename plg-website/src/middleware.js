/**
 * Next.js Middleware for Route Protection
 *
 * Protects authenticated routes:
 * - /portal/* - Customer portal (requires authentication)
 * - /admin/*  - Admin routes (requires authentication + org context)
 *
 * @see Security Considerations for Auth0 Integration - Section 7.1
 */

import {
  withMiddlewareAuthRequired,
  getSession,
} from "@auth0/nextjs-auth0/edge";
import { NextResponse } from "next/server";

export default withMiddlewareAuthRequired(async function middleware(req) {
  const res = NextResponse.next();

  try {
    const session = await getSession(req, res);
    const path = req.nextUrl.pathname;

    // Admin routes require organization context (enterprise users)
    if (path.startsWith("/admin")) {
      const orgId = session?.user?.["https://hic-ai.com/org_id"];

      if (!orgId) {
        // Individual user trying to access admin - redirect to portal
        return NextResponse.redirect(new URL("/portal", req.url));
      }
    }

    return res;
  } catch (error) {
    console.error("Middleware error:", error);
    return res;
  }
});

export const config = {
  matcher: ["/portal/:path*", "/admin/:path*"],
};
