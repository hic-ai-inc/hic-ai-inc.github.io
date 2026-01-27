/**
 * Portal Layout
 *
 * Authenticated layout with sidebar navigation.
 * Wraps all /portal/* pages.
 *
 * Dev Mode: Uses mock session when AUTH0 is not configured (development only)
 */

import { redirect } from "next/navigation";
import { PortalSidebar } from "@/components/layout";

// Mock session for development preview
const MOCK_DEV_SESSION = {
  user: {
    sub: "auth0|dev-preview-user",
    email: "preview@example.com",
    name: "Business Owner",
    email_verified: true,
    "https://hic-ai.com/account_type": "business",
    "https://hic-ai.com/org_id": "org_preview_123",
    "https://hic-ai.com/org_role": "owner",
  },
};

// Check if Auth0 is configured
const isAuth0Configured = !!(
  process.env.AUTH0_SECRET &&
  process.env.AUTH0_CLIENT_ID &&
  process.env.AUTH0_CLIENT_SECRET
);

export const metadata = {
  title: "Portal",
};

// Force dynamic rendering - portal requires authentication
export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }) {
  let session = null;

  // In development without Auth0 configured, use mock session
  if (process.env.NODE_ENV === "development" && !isAuth0Configured) {
    console.log("[DEV] Auth0 not configured, using mock session for portal");
    session = MOCK_DEV_SESSION;
  } else {
    // Try to get real session
    try {
      const { getSession } = await import("@/lib/auth");
      session = await getSession();
    } catch (error) {
      console.error("[Portal] Auth error:", error.message);
      // Fallback to mock in development
      if (process.env.NODE_ENV === "development") {
        console.log("[DEV] Auth error, using mock session");
        session = MOCK_DEV_SESSION;
      }
    }
  }

  if (!session) {
    redirect("/auth/login?returnTo=/portal");
  }

  return (
    <div className="flex min-h-screen bg-midnight-navy">
      <PortalSidebar />
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
