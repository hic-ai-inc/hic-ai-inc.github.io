/**
 * OAuth Callback Page - Cognito Authentication
 *
 * Handles the OAuth callback from Cognito Hosted UI.
 * Manually exchanges the authorization code for tokens since we're
 * using a custom OAuth flow (not Amplify's signInWithRedirect).
 *
 * Flow:
 * 1. User completes login on Cognito Hosted UI
 * 2. Cognito redirects to /auth/callback?code=xxx
 * 3. This page exchanges the code for tokens via Cognito token endpoint
 * 4. User is redirected to the stored returnTo URL
 *
 * @see docs/20260128_AUTH0_TO_COGNITO_MIGRATION_DECISION.md
 */

"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getReturnToUrl,
  configureAmplify,
  getCognitoConfig,
} from "@/lib/cognito";

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

  // Exchange authorization code for tokens
  const exchangeCodeForTokens = useCallback(async (code) => {
    try {
      const config = getCognitoConfig();
      const tokenUrl = `https://${config.domain}/oauth2/token`;

      const params = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: config.userPoolClientId,
        code: code,
        redirect_uri: `${config.appUrl}/auth/callback`,
      });

      const response = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error_description ||
            errorData.error ||
            "Token exchange failed",
        );
      }

      const tokens = await response.json();

      // Store tokens in localStorage for Amplify to pick up
      // Amplify uses a specific key format for token storage
      const userPoolId = config.userPoolId;
      const clientId = config.userPoolClientId;

      // Decode the ID token to get the username
      const idTokenPayload = JSON.parse(atob(tokens.id_token.split(".")[1]));
      const username = idTokenPayload["cognito:username"] || idTokenPayload.sub;

      // Store in the format Amplify expects
      const keyPrefix = `CognitoIdentityServiceProvider.${clientId}`;
      localStorage.setItem(`${keyPrefix}.LastAuthUser`, username);
      localStorage.setItem(`${keyPrefix}.${username}.idToken`, tokens.id_token);
      localStorage.setItem(
        `${keyPrefix}.${username}.accessToken`,
        tokens.access_token,
      );
      if (tokens.refresh_token) {
        localStorage.setItem(
          `${keyPrefix}.${username}.refreshToken`,
          tokens.refresh_token,
        );
      }

      // Also store clock drift (Amplify uses this)
      localStorage.setItem(`${keyPrefix}.${username}.clockDrift`, "0");

      return true;
    } catch (err) {
      console.error("[Callback] Token exchange error:", err);
      throw err;
    }
  }, []);

  useEffect(() => {
    // Ensure Amplify is configured
    configureAmplify();

    // Get the authorization code from URL
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    const errorParam = urlParams.get("error");
    const errorDesc = urlParams.get("error_description");

    if (errorParam) {
      setError(errorDesc || errorParam);
      setStatus("error");
      return;
    }

    if (!code) {
      setError("No authorization code received");
      setStatus("error");
      return;
    }

    // Exchange code for tokens
    exchangeCodeForTokens(code)
      .then(() => {
        handleSuccess();
      })
      .catch((err) => {
        setError(err.message || "Authentication failed");
        setStatus("error");
      });
  }, [handleSuccess, exchangeCodeForTokens]);

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
