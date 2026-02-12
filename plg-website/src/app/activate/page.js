/**
 * Browser-Delegated Device Activation Page
 *
 * Opened by the VS Code extension during authenticated activation.
 * Accepts device parameters via URL, requires Cognito auth,
 * then calls the activation API with the user's JWT.
 *
 * URL format:
 *   /activate?key={licenseKey}&fingerprint={fingerprint}&deviceName={deviceName}&platform={platform}
 *
 * Flow:
 *   1. Extension opens this URL via vscode.env.openExternal()
 *   2. Page requires auth — redirects to Cognito Hosted UI if not logged in
 *   3. On auth, calls POST /api/license/activate with JWT + device params
 *   4. Shows success page ONLY after HTTP 200 confirms DynamoDB write
 *   5. Extension polls /api/license/validate to detect activation
 *
 * @see Phase 3B — Multi-Seat Implementation Plan V3
 * @see Browser-Delegated Activation Proposal
 */

"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/cognito-provider";
import { getSession } from "@/lib/cognito";

/**
 * Inner component wrapped in Suspense (required by Next.js for useSearchParams)
 */
function ActivateContent() {
  const { user, isLoading: authLoading, login } = useAuth();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState("loading"); // loading | activating | success | error
  const [errorMessage, setErrorMessage] = useState(null);
  const [activationResult, setActivationResult] = useState(null);

  // Extract device parameters from URL
  const licenseKey = searchParams.get("key");
  const fingerprint = searchParams.get("fingerprint");
  const deviceName = searchParams.get("deviceName");
  const platform = searchParams.get("platform");

  // Require auth — redirect to Cognito if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      // Preserve URL params across auth redirect
      const currentUrl = window.location.pathname + window.location.search;
      login(currentUrl);
    }
  }, [authLoading, user, login]);

  // Once authenticated, call activation API
  useEffect(() => {
    if (!user || status !== "loading") return;

    async function activate() {
      // Validate required params
      if (!licenseKey || !fingerprint) {
        setStatus("error");
        setErrorMessage(
          "Missing required parameters. This page should be opened from the Mouse extension.",
        );
        return;
      }

      setStatus("activating");

      try {
        const session = await getSession();
        if (!session?.idToken) {
          setStatus("error");
          setErrorMessage("Unable to retrieve authentication session.");
          return;
        }

        const response = await fetch("/api/license/activate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.idToken}`,
          },
          body: JSON.stringify({
            licenseKey,
            fingerprint,
            deviceName: deviceName || undefined,
            platform: platform || undefined,
          }),
        });

        const data = await response.json();

        if (response.ok && data.success) {
          setActivationResult(data);
          setStatus("success");
        } else if (response.status === 401) {
          setStatus("error");
          setErrorMessage("Authentication failed. Please sign in again.");
        } else {
          setStatus("error");
          setErrorMessage(
            data.detail || data.error || "Activation failed. Please try again.",
          );
        }
      } catch (err) {
        console.error("Activation request failed:", err);
        setStatus("error");
        setErrorMessage(
          "Network error. Please check your connection and try again.",
        );
      }
    }

    activate();
  }, [user, status, licenseKey, fingerprint, deviceName, platform]);

  // Loading state (checking auth)
  if (authLoading) {
    return (
      <div className="min-h-screen bg-midnight-navy flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cerulean-mist mx-auto mb-4" />
          <p className="text-frost-white/70">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Not authenticated — redirecting (login() was called in useEffect)
  if (!user) {
    return (
      <div className="min-h-screen bg-midnight-navy flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cerulean-mist mx-auto mb-4" />
          <p className="text-frost-white/70">Redirecting to sign in...</p>
        </div>
      </div>
    );
  }

  // Activating — calling API
  if (status === "activating") {
    return (
      <div className="min-h-screen bg-midnight-navy flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cerulean-mist mx-auto mb-4" />
          <p className="text-frost-white/70">Activating your device...</p>
        </div>
      </div>
    );
  }

  // Success — activation confirmed (DynamoDB write completed)
  if (status === "success") {
    return (
      <div className="min-h-screen bg-midnight-navy flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg
              className="w-8 h-8 text-green-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-frost-white mb-2">
            Mouse is activated!
          </h1>
          <p className="text-frost-white/70 mb-6">
            You can close this tab and return to VS Code.
          </p>
          {activationResult?.alreadyActivated && (
            <p className="text-frost-white/50 text-sm mb-4">
              This device was already activated.
            </p>
          )}
          <div className="bg-frost-white/5 border border-frost-white/10 rounded-lg p-4 text-left text-sm text-frost-white/60">
            <p>
              <span className="text-frost-white/80">Device:</span>{" "}
              {activationResult?.machine?.name || deviceName || "Unknown"}
            </p>
            <p>
              <span className="text-frost-white/80">Platform:</span>{" "}
              {platform || "Unknown"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  return (
    <div className="min-h-screen bg-midnight-navy flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg
            className="w-8 h-8 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-frost-white mb-2">
          Activation Failed
        </h1>
        <p className="text-frost-white/70 mb-6">
          {errorMessage || "An unexpected error occurred."}
        </p>
        <button
          onClick={() => {
            setStatus("loading");
            setErrorMessage(null);
          }}
          className="px-6 py-2 bg-cerulean-mist text-midnight-navy font-medium rounded-lg hover:bg-cerulean-mist/90 transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}

/**
 * Activate page — wrapped in Suspense for useSearchParams
 */
export default function ActivatePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-midnight-navy flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cerulean-mist mx-auto" />
        </div>
      }
    >
      <ActivateContent />
    </Suspense>
  );
}
