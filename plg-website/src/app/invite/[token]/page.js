"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/cognito-provider";

export default function AcceptInvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token;

  const { isLoading: authLoading, isAuthenticated, login } = useAuth();
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [accepting, setAccepting] = useState(false);
  const [success, setSuccess] = useState(false);
  const acceptAttempted = useRef(false);

  // Fetch invite details (public endpoint, no auth needed)
  useEffect(() => {
    async function fetchInvite() {
      try {
        const response = await fetch(`/api/portal/invite/${token}`);
        const data = await response.json();

        if (!response.ok) {
          setError(data.error || "Failed to load invite");
          return;
        }

        setInvite(data);
      } catch (err) {
        setError("Failed to load invite details");
      } finally {
        setLoading(false);
      }
    }

    if (token) {
      fetchInvite();
    }
  }, [token]);

  // Accept the invite via API — stable callback for useEffect dependency
  const acceptInvite = useCallback(async () => {
    if (acceptAttempted.current) return;
    acceptAttempted.current = true;

    setAccepting(true);
    setError(null);

    try {
      const response = await fetch(`/api/portal/invite/${token}`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          // Session not established on server yet — reset and let user retry
          acceptAttempted.current = false;
          setAccepting(false);
          setError("Session not ready. Please click the button to try again.");
          return;
        }
        setError(data.error || "Failed to accept invite");
        setAccepting(false);
        return;
      }

      setSuccess(true);
      // Redirect immediately — no delay
      router.push(data.redirectTo || "/portal/team");
    } catch (err) {
      setError("Failed to accept invite");
      setAccepting(false);
      acceptAttempted.current = false;
    }
  }, [token, router]);

  // Auto-accept: once authenticated AND invite loaded, accept immediately.
  // This fires after returning from Cognito sign-in redirect.
  useEffect(() => {
    if (
      isAuthenticated &&
      invite &&
      !acceptAttempted.current &&
      !success &&
      !error
    ) {
      acceptInvite();
    }
  }, [isAuthenticated, invite, success, error, acceptInvite]);

  // Redirect to Cognito sign-in, preserving invite URL as returnTo
  const handleSignIn = () => {
    login(`/invite/${token}`);
  };

  // Manual retry for authenticated users if auto-accept failed
  const handleRetryAccept = () => {
    acceptAttempted.current = false;
    setError(null);
    acceptInvite();
  };

  // ————————————————————————————————————————————————————————————————
  // Render states
  // ————————————————————————————————————————————————————————————————

  // Loading auth or invite data, or actively accepting — show spinner
  if (loading || authLoading || accepting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">
            {accepting ? "Joining the team..." : "Loading invite details..."}
          </p>
        </div>
      </div>
    );
  }

  // Error with no invite data — fatal
  if (error && !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Invalid Invite
          </h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <Link
            href="/"
            className="inline-block bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors"
          >
            Go to Homepage
          </Link>
        </div>
      </div>
    );
  }

  // Success — brief confirmation before redirect
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Welcome to the Team!
          </h1>
          <p className="text-gray-600 mb-4">
            You have successfully joined the organization.
          </p>
          <p className="text-sm text-gray-500">
            Redirecting to your team dashboard...
          </p>
        </div>
      </div>
    );
  }

  // ————————————————————————————————————————————————————————————————
  // Authenticated user with an error (e.g., 401 or accept failure)
  // Show error + retry — they should NOT have to re-accept
  // ————————————————————————————————————————————————————————————————
  if (isAuthenticated && error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8 text-center">
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-yellow-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Something went wrong
          </h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={handleRetryAccept}
            className="inline-block bg-blue-600 text-white px-6 py-3 rounded-md font-medium hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ————————————————————————————————————————————————————————————————
  // Unauthenticated user — show invite details + Sign in to Accept
  // Authenticated users never reach here (auto-accept fires above)
  // ————————————————————————————————————————————————————————————————
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            You&apos;re Invited!
          </h1>
          <p className="text-gray-600 mt-2">
            You&apos;ve been invited to join an organization on Mouse.
          </p>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-gray-500">Invited email:</dt>
              <dd className="font-medium text-gray-900">{invite?.email}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Your role:</dt>
              <dd className="font-medium text-gray-900 capitalize">
                {invite?.role}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Expires:</dt>
              <dd className="font-medium text-gray-900">
                {invite?.expiresAt
                  ? new Date(invite.expiresAt).toLocaleDateString()
                  : "N/A"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleSignIn}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-md font-medium hover:bg-blue-700 transition-colors"
          >
            Sign in to Accept
          </button>

          <p className="text-sm text-gray-500 text-center">
            Don&apos;t have an account?{" "}
            <button
              onClick={handleSignIn}
              className="text-blue-600 hover:underline"
            >
              Sign up here
            </button>
          </p>

          <Link
            href="/"
            className="block w-full text-center text-gray-600 py-2 hover:text-gray-800 transition-colors"
          >
            Decline and go back
          </Link>
        </div>

        <p className="text-xs text-gray-500 text-center mt-6">
          By accepting this invite, you agree to our{" "}
          <Link href="/terms" className="text-blue-600 hover:underline">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-blue-600 hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
