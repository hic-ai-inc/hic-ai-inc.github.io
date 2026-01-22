/**
 * Welcome Complete Client Component
 *
 * Renders the final welcome screen with license key display.
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import { Header, Footer, Container } from "@/components/layout";
import { Button, Card } from "@/components/ui";

export default function WelcomeCompleteClient({
  success,
  licenseKey,
  planName,
  userName,
  error,
  sessionId,
}) {
  const [copied, setCopied] = useState(false);

  const copyLicenseKey = async () => {
    if (licenseKey) {
      await navigator.clipboard.writeText(licenseKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Error state
  if (error) {
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
                <p className="text-frost-white/70 mb-6">{error}</p>
                <div className="flex justify-center gap-4">
                  <Link href={`/welcome?session_id=${sessionId}`}>
                    <Button variant="secondary">Try Again</Button>
                  </Link>
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

              {/* Welcome Message */}
              <h1 className="text-3xl md:text-4xl font-bold mb-2">
                Welcome{userName ? `, ${userName}` : ""}! 🎉
              </h1>
              <p className="text-xl text-frost-white/70 mb-8">
                Your {planName} license is ready
              </p>

              {/* License Key Display */}
              <div className="bg-frost-white/5 border border-cerulean-mist/30 rounded-xl p-6 mb-8">
                <p className="text-sm text-frost-white/60 mb-3">
                  Your License Key
                </p>
                <code className="block text-cerulean-mist text-lg md:text-xl font-mono break-all mb-4">
                  {licenseKey}
                </code>
                <Button onClick={copyLicenseKey} variant="secondary" size="sm">
                  {copied ? (
                    <>
                      <svg
                        className="w-4 h-4 mr-2 text-green-500"
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
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-4 h-4 mr-2"
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
                      Copy Key
                    </>
                  )}
                </Button>
              </div>

              {/* Setup Instructions */}
              <div className="bg-frost-white/5 rounded-xl p-6 text-left mb-8">
                <h2 className="font-semibold mb-4 text-center">
                  🚀 Quick Setup
                </h2>
                <ol className="space-y-3 text-frost-white/80">
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-cerulean-mist/20 rounded-full flex items-center justify-center text-sm text-cerulean-mist">
                      1
                    </span>
                    <span>
                      Install the <strong>Mouse</strong> extension from VS Code
                      Marketplace
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-cerulean-mist/20 rounded-full flex items-center justify-center text-sm text-cerulean-mist">
                      2
                    </span>
                    <span>
                      Open Settings (
                      <code className="bg-frost-white/10 px-1.5 py-0.5 rounded text-sm">
                        Cmd/Ctrl + ,
                      </code>
                      )
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-cerulean-mist/20 rounded-full flex items-center justify-center text-sm text-cerulean-mist">
                      3
                    </span>
                    <span>
                      Search for{" "}
                      <code className="bg-frost-white/10 px-1.5 py-0.5 rounded text-sm">
                        mouse.licenseKey
                      </code>
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-cerulean-mist/20 rounded-full flex items-center justify-center text-sm text-cerulean-mist">
                      4
                    </span>
                    <span>Paste your license key and restart VS Code</span>
                  </li>
                </ol>
              </div>

              {/* Email Notice */}
              <p className="text-sm text-frost-white/50 mb-8">
                ✉️ A copy of your license key has been sent to your email
              </p>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <Link href="/portal">
                  <Button size="lg">Go to Portal</Button>
                </Link>
                <Link href="/docs/quickstart">
                  <Button variant="secondary" size="lg">
                    Read Documentation
                  </Button>
                </Link>
              </div>
            </Card>

            {/* Support Section */}
            <div className="mt-8 text-center text-frost-white/50 text-sm">
              <p>
                Need help?{" "}
                <a
                  href="mailto:support@hic-ai.com"
                  className="text-cerulean-mist hover:underline"
                >
                  Contact support
                </a>{" "}
                or visit our{" "}
                <Link
                  href="/docs"
                  className="text-cerulean-mist hover:underline"
                >
                  documentation
                </Link>
              </p>
            </div>
          </div>
        </Container>
      </main>
      <Footer />
    </>
  );
}
