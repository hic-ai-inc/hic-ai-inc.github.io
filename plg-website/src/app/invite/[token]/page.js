"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

export default function AcceptInvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token;

  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [accepting, setAccepting] = useState(false);
  const [success, setSuccess] = useState(false);

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

  const handleAccept = async () => {
    setAccepting(true);
    setError(null);

    try {
      const response = await fetch(`/api/portal/invite/${token}`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        // If unauthorized, redirect to sign-in
        if (response.status === 401) {
          // Store return URL and redirect to sign in
          const returnUrl = encodeURIComponent(`/invite/${token}`);
          router.push(`/auth/login?returnTo=${returnUrl}`);
          return;
        }
        setError(data.error || "Failed to accept invite");
        return;
      }

      setSuccess(true);
      // Redirect to team page after short delay
      setTimeout(() => {
        router.push(data.redirectTo || "/portal/team");
      }, 2000);
    } catch (err) {
      setError("Failed to accept invite");
    } finally {
      setAccepting(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading invite details...</p>
        </div>
      </div>
    );
  }

  // Error state
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

  // Success state
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

  // Invite details
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

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md mb-4">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={handleAccept}
            disabled={accepting}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-md font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {accepting ? (
              <span className="flex items-center justify-center">
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Joining...
              </span>
            ) : (
              "Accept Invite"
            )}
          </button>

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
