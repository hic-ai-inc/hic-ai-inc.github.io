/**
 * OAuth Callback Page - Cognito Authentication
 *
 * Handles the OAuth callback from Cognito Hosted UI.
 * Uses Amplify's built-in OAuth listener to complete the sign-in flow.
 *
 * Required for Multi-Page Applications:
 * @see https://docs.amplify.aws/react/build-a-backend/auth/concepts/external-identity-providers/#required-for-multi-page-applications-complete-external-sign-in-after-redirect
 *
 * Flow:
 * 1. User completes login on Cognito Hosted UI (or Google)
 * 2. Cognito redirects to /auth/callback?code=xxx
 * 3. Amplify's OAuth listener automatically exchanges the code for tokens
 * 4. Hub emits 'signInWithRedirect' event when complete
 * 5. We redirect to the stored returnTo URL
 *
 * @see docs/20260128_AUTH0_TO_COGNITO_MIGRATION_DECISION.md
 */

"use client";

// CRITICAL: This import enables the OAuth listener for multi-page apps
// It must be imported before any auth operations
import "aws-amplify/auth/enable-oauth-listener";

import { useEffect, useState } from "react";
import { Hub } from "aws-amplify/utils";
import { getCurrentUser } from "aws-amplify/auth";
import { configureAmplify, getReturnToUrl } from "@/lib/cognito";

export default function CallbackPage() {
  // Check for OAuth error in URL params on initial render (not in effect)
  const urlParams =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : null;
  const initialError = urlParams?.get("error");
  const initialErrorDesc = urlParams?.get("error_description");

  const [status, setStatus] = useState(initialError ? "error" : "processing");
  const [error, setError] = useState(
    initialError ? initialErrorDesc || initialError : null,
  );

  useEffect(() => {
    // If there was an initial error, don't set up listeners
    if (initialError) {
      return;
    }

    // Ensure Amplify is configured
    configureAmplify();

    // Listen for auth events from Amplify
    const unsubscribe = Hub.listen("auth", async ({ payload }) => {
      switch (payload.event) {
        case "signInWithRedirect":
          // OAuth flow completed successfully
          try {
            const user = await getCurrentUser();
            console.log("[Callback] Sign in successful:", user.username);
            setStatus("success");

            // Get the stored returnTo URL and redirect
            const returnTo = getReturnToUrl();
            setTimeout(() => {
              window.location.href = returnTo;
            }, 500);
          } catch (err) {
            console.error("[Callback] Error getting user after sign in:", err);
            setError("Failed to complete sign in");
            setStatus("error");
          }
          break;

        case "signInWithRedirect_failure":
          // OAuth flow failed
          console.error("[Callback] OAuth error:", payload.data);
          setError(payload.data?.message || "An error occurred during sign in");
          setStatus("error");
          break;

        case "customOAuthState":
          // Custom state passed through OAuth flow
          console.log("[Callback] Custom state:", payload.data);
          break;
      }
    });

    // Cleanup listener on unmount
    return () => unsubscribe();
  }, []);

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
          <div className="text-center">
            <div className="text-red-500 text-5xl mb-4">❌</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Authentication Failed
            </h1>
            <p className="text-gray-600 mb-6">{error}</p>
            <a
              href="/auth/login"
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Try Again
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-green-500 text-5xl mb-4">✓</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Welcome back!
          </h1>
          <p className="text-gray-600">Redirecting you now...</p>
        </div>
      </div>
    );
  }

  // Processing state
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Completing sign in...</p>
      </div>
    </div>
  );
}
