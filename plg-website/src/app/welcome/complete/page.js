/**
 * Welcome Complete Page
 *
 * Final step after Stripe checkout. User is ALWAYS authenticated
 * at this point (they had to log in to access checkout).
 *
 * This is a client component that:
 * 1. Verifies the user is authenticated
 * 2. Calls the provision-license API
 * 3. Displays the license key or error
 *
 * @see PLG User Journey - License Provisioning
 */

"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Header, Footer, Container } from "@/components/layout";
import { Button, Card } from "@/components/ui";
import Link from "next/link";

function WelcomeCompleteContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get("session_id");

  const [state, setState] = useState({
    status: "loading", // loading | provisioning | success | error
    licenseKey: null,
    planName: null,
    userName: null,
    error: null,
  });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function provisionLicense() {
      // Verify we have a session_id
      if (!sessionId) {
        setState({
          status: "error",
          error:
            "Missing checkout session. Please try the checkout process again.",
        });
        return;
      }

      // Verify user is authenticated with valid token
      const session = await getSession();
      if (!session?.user || !session?.idToken) {
        // This should never happen - user must be logged in to reach checkout
        // But if it does, redirect to login
        console.error(
          "[WelcomeComplete] User not authenticated or missing ID token",
        );
        router.replace(
          `/auth/login?returnTo=/welcome/complete&session_id=${sessionId}`,
        );
        return;
      }

      setState((prev) => ({ ...prev, status: "provisioning" }));

      try {
        const response = await fetch("/api/provision-license", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.idToken}`,
          },
          body: JSON.stringify({ sessionId }),
        });

        const data = await response.json();

        if (!response.ok) {
          setState({
            status: "error",
            error: data.error || "Failed to provision license",
          });
          return;
        }

        setState({
          status: "success",
          licenseKey: data.licenseKey,
          planName: data.planName,
          userName: data.userName,
          error: null,
        });
      } catch (error) {
        console.error("[WelcomeComplete] Provisioning error:", error);
        setState({
          status: "error",
          error: `Network error: ${error.message}`,
        });
      }
    }

    provisionLicense();
  }, [sessionId, router]);

  const copyLicenseKey = async () => {
    if (state.licenseKey) {
      await navigator.clipboard.writeText(state.licenseKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Loading state
  if (state.status === "loading" || state.status === "provisioning") {
    return (
      <>
        <Header />
        <main className="min-h-screen bg-midnight-navy pt-20">
          <Container>
            <div className="max-w-lg mx-auto py-20">
              <Card className="text-center p-8">
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-cerulean-mist mx-auto mb-6"></div>
                <h1 className="text-2xl font-bold mb-2">
                  {state.status === "loading"
                    ? "Loading..."
                    : "Provisioning Your License"}
                </h1>
                <p className="text-frost-white/70">
                  {state.status === "provisioning" &&
                    "Creating your license key and setting up your account..."}
                </p>
              </Card>
            </div>
          </Container>
        </main>
        <Footer />
      </>
    );
  }

  // Error state
  if (state.status === "error") {
    return (
      <>
        <Header />
        <main className="min-h-screen bg-midnight-navy pt-20">
          <Container>
            <div className="max-w-lg mx-auto py-20">
              <Card className="text-center p-8">
                <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg
                    className="w-8 h-8 text-red-500"
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
                <h1 className="text-2xl font-bold mb-2">
                  Something went wrong
                </h1>
                <p className="text-frost-white/70 mb-6">{state.error}</p>
                <div className="flex justify-center gap-4">
                  <Button
                    onClick={() => window.location.reload()}
                    variant="secondary"
                  >
                    Try Again
                  </Button>
                  <a href="mailto:support@hic-ai.com">
                    <Button variant="ghost">Contact Support</Button>
                  </a>
                </div>
              </Card>
            </div>
          </Container>
        </main>
        <Footer />
      </>
    );
  }

  // Success state
  return (
    <>
      <Header />
      <main className="min-h-screen bg-midnight-navy pt-20">
        <Container>
          <div className="max-w-2xl mx-auto py-16">
            <Card className="p-8 text-center">
              {/* Success Icon */}
              <div className="w-24 h-24 bg-gradient-to-br from-green-500/20 to-cerulean-mist/20 rounded-full flex items-center justify-center mx-auto mb-8">
                <svg
                  className="w-12 h-12 text-green-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>

              <h1 className="text-3xl font-bold mb-2">
                Welcome to Mouse{state.userName ? `, ${state.userName}` : ""}!
              </h1>
              <p className="text-frost-white/70 text-lg mb-8">
                Your {state.planName} subscription is active.
              </p>

              {/* License Key Display */}
              <div className="bg-void-black/50 rounded-xl p-6 mb-8">
                <p className="text-sm text-frost-white/60 mb-2">
                  Your License Key
                </p>
                <div className="flex items-center justify-center gap-3">
                  <code className="text-lg font-mono text-cerulean-mist break-all">
                    {state.licenseKey}
                  </code>
                  <button
                    onClick={copyLicenseKey}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                    title="Copy to clipboard"
                  >
                    {copied ? (
                      <svg
                        className="w-5 h-5 text-green-500"
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
                    ) : (
                      <svg
                        className="w-5 h-5 text-frost-white/60"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      </svg>
                    )}
                  </button>
                </div>
                <p className="text-xs text-frost-white/40 mt-3">
                  We&apos;ve also sent this to your email
                </p>
              </div>

              {/* Next Steps */}
              <div className="text-left bg-card-bg/30 rounded-xl p-6 mb-8">
                <h3 className="font-semibold mb-4">
                  Next: Activate Mouse in VS Code
                </h3>
                <ol className="space-y-3 text-frost-white/70">
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cerulean-mist/20 text-cerulean-mist text-sm flex items-center justify-center">
                      1
                    </span>
                    <span>Open VS Code Settings (Cmd/Ctrl + ,)</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cerulean-mist/20 text-cerulean-mist text-sm flex items-center justify-center">
                      2
                    </span>
                    <span>
                      Search for{" "}
                      <code className="text-cerulean-mist">
                        mouse.licenseKey
                      </code>
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cerulean-mist/20 text-cerulean-mist text-sm flex items-center justify-center">
                      3
                    </span>
                    <span>Paste your license key and reload VS Code</span>
                  </li>
                </ol>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <Link href="/portal">
                  <Button size="lg">Go to Portal</Button>
                </Link>
                <Link href="/docs/getting-started">
                  <Button variant="secondary" size="lg">
                    Getting Started Guide
                  </Button>
                </Link>
              </div>
            </Card>
          </div>
        </Container>
      </main>
      <Footer />
    </>
  );
}

// Loading fallback for Suspense
function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-midnight-navy">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cerulean-mist mx-auto mb-4"></div>
        <p className="text-frost-white/70">Loading...</p>
      </div>
    </div>
  );
}

export default function WelcomeCompletePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <WelcomeCompleteContent />
    </Suspense>
  );
}
