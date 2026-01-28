/**
 * OAuth Callback Page - Cognito Authentication
 *
 * Handles the OAuth callback from Cognito Hosted UI.
 * Amplify Auth automatically exchanges the code for tokens.
 *
 * Flow:
 * 1. User completes login on Cognito Hosted UI
 * 2. Cognito redirects to /auth/callback?code=xxx
 * 3. This page loads, Amplify Auth detects the code and exchanges it
 * 4. User is redirected to the stored returnTo URL
 *
 * @see docs/20260128_AUTH0_TO_COGNITO_MIGRATION_DECISION.md
 */

"use client";

import { useEffect, useState, useCallback } from "react";
import { Hub } from "aws-amplify/utils";
import { getSession, getReturnToUrl, configureAmplify } from "@/lib/cognito";

export default function CallbackPage() {
  const [status, setStatus] = useState("processing");
  const [error, setError] = useState(null);

  // Define handleSuccess before it's used
  const handleSuccess = useCallback(() => {
    setStatus("success");

    // Get the stored returnTo URL
    const returnTo = getReturnToUrl();

    // Redirect after a brief moment to show success state
    setTimeout(() => {
      window.location.href = returnTo;
    }, 500);
  }, []);

  // Define checkExistingSession before it's used
  const checkExistingSession = useCallback(async () => {
    try {
      // Give Amplify a moment to process the callback
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const session = await getSession();
      if (session) {
        handleSuccess();
      }
      // If no session yet, stay in "processing" state and wait for Hub event
    } catch (err) {
      // Not authenticated yet, wait for Hub event
      console.log("[Callback] Waiting for authentication...");
    }
  }, [handleSuccess]);

  useEffect(() => {
    // Ensure Amplify is configured
    configureAmplify();

    // Listen for auth events
    const unsubscribe = Hub.listen("auth", ({ payload }) => {
      switch (payload.event) {
        case "signedIn":
          // Successfully signed in
          handleSuccess();
          break;
        case "signInWithRedirect_failure":
          // OAuth failed
          setError(payload.data?.message || "Authentication failed");
          setStatus("error");
          break;
        case "tokenRefresh":
          // Token refreshed
          break;
        case "tokenRefresh_failure":
          // Token refresh failed
          setError("Session expired. Please sign in again.");
          setStatus("error");
          break;
      }
    });

    // Check if we already have a session (page refresh scenario)
    checkExistingSession();

    return () => {
      unsubscribe();
    };
  }, [handleSuccess, checkExistingSession]);

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
