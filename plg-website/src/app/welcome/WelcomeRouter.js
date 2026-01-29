"use client";

/**
 * WelcomeRouter - Client-side auth-aware routing
 *
 * Handles post-checkout redirect logic on the client where
 * Amplify auth is properly configured and can detect sessions.
 *
 * Server components cannot detect Cognito sessions because Amplify
 * is only configured in browser context.
 */

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSession } from "@/lib/auth";

export default function WelcomeRouter({ children }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [checking, setChecking] = useState(true);
  const [shouldShowContent, setShouldShowContent] = useState(false);

  useEffect(() => {
    async function checkAuthAndRoute() {
      try {
        const session = await getSession();

        // If authenticated with session_id, complete the license provisioning
        if (session && sessionId) {
          router.replace(`/welcome/complete?session_id=${sessionId}`);
          return;
        }

        // If authenticated without session_id (direct visit), go to portal
        if (session) {
          router.replace("/portal");
          return;
        }

        // If no session ID and not authenticated, redirect to pricing
        if (!sessionId && !session) {
          router.replace("/pricing");
          return;
        }

        // User has session_id but not authenticated - show the sign-up page
        setShouldShowContent(true);
      } catch (error) {
        console.error("[WelcomeRouter] Auth check failed:", error);
        // On error, show the content (fail open for UX)
        setShouldShowContent(true);
      } finally {
        setChecking(false);
      }
    }

    checkAuthAndRoute();
  }, [router, sessionId]);

  // Show loading state while checking auth
  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-void-black">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cerulean-mist mx-auto mb-4"></div>
          <p className="text-silver">Setting up your account...</p>
        </div>
      </div>
    );
  }

  // Show the welcome content only for unauthenticated users with session_id
  if (shouldShowContent) {
    return children;
  }

  // Still redirecting
  return (
    <div className="min-h-screen flex items-center justify-center bg-void-black">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cerulean-mist mx-auto mb-4"></div>
        <p className="text-silver">Redirecting...</p>
      </div>
    </div>
  );
}
