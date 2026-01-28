/**
 * Portal Layout
 *
 * Authenticated layout with sidebar navigation.
 * Wraps all /portal/* pages.
 *
 * Uses client-side auth check since Cognito tokens are stored in localStorage.
 */

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PortalSidebar } from "@/components/layout";
import { useUser } from "@/lib/cognito-provider";

export default function PortalLayout({ children }) {
  const { user, isLoading, isAuthenticated } = useUser();
  const router = useRouter();

  useEffect(() => {
    // Once loading is complete, check if authenticated
    if (!isLoading && !isAuthenticated) {
      router.push("/auth/login?returnTo=/portal");
    }
  }, [isLoading, isAuthenticated, router]);

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="flex min-h-screen bg-midnight-navy items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cerulean-mist mx-auto"></div>
          <p className="mt-4 text-slate-grey">Loading...</p>
        </div>
      </div>
    );
  }

  // If not authenticated, show nothing (redirect will happen)
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-midnight-navy">
      <PortalSidebar />
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
