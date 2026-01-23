/**
 * Next.js Middleware for Route Protection
 *
 * Protects authenticated routes:
 * - /portal/* - Customer portal (requires authentication)
 * - /admin/*  - Admin routes (requires authentication + org context)
 *
 * @see Security Considerations for Auth0 Integration - Section 7.1
 */

import { NextResponse } from "next/server";
import { Auth0Client } from "@auth0/nextjs-auth0/server";

const auth0 = new Auth0Client();

export async function middleware(req) {
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
    
    // Admin routes require organization context (enterprise users)
    if (path.startsWith("/admin")) {
      const orgId = session?.user?.["https://hic-ai.com/org_id"];
      
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

