"use client";

/**
 * WelcomeContent - Create Account UI
 *
 * Displayed to users who completed checkout but need to create an account.
 * Uses client-side searchParams for session_id.
 */

import { useSearchParams } from "next/navigation";
import { Header, Footer } from "@/components/layout";
import { Button, Card, CardContent, Badge } from "@/components/ui";

export default function WelcomeContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  return (
    <>
      <Header />
      <main className="min-h-screen pt-24 pb-16">
        <div className="max-w-2xl mx-auto px-6">
          <div className="text-center mb-8">
            <Badge variant="success" className="mb-4">
              Payment Successful
            </Badge>
            <h1 className="text-4xl font-bold text-frost-white mb-4">
              Welcome to Mouse! 🎉
            </h1>
            <p className="text-xl text-silver">
              Your subscription is active. Let&apos;s set up your account.
            </p>
          </div>

          <Card className="mb-8">
            <CardContent className="p-8">
              <h2 className="text-xl font-semibold text-frost-white mb-4">
                Create Your Account
              </h2>
              <p className="text-slate-grey mb-6">
                Create an account to manage your license, activate devices, and
                access your customer portal.
              </p>

              <div className="space-y-4">
                <Button
                  href={`/auth/login?returnTo=/welcome/complete&screen_hint=signup${
                    sessionId ? `&session_id=${sessionId}` : ""
                  }`}
                  className="w-full"
                  size="lg"
                >
                  Create Account
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-card-border" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-card-bg text-slate-grey">
                      Already have an account?
                    </span>
                  </div>
                </div>

                <Button
                  href={`/auth/login?returnTo=/welcome/complete${
                    sessionId ? `&session_id=${sessionId}` : ""
                  }`}
                  variant="secondary"
                  className="w-full"
                  size="lg"
                >
                  Sign In
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* What's Next */}
          <div className="bg-card-bg/50 rounded-2xl p-6 border border-card-border">
            <h3 className="text-lg font-semibold text-frost-white mb-4">
              What happens next?
            </h3>
            <ol className="space-y-4">
              <li className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-cerulean-mist/20 text-cerulean-mist flex items-center justify-center font-semibold">
                  1
                </span>
                <div>
                  <p className="font-medium text-frost-white">
                    Create your account
                  </p>
                  <p className="text-sm text-slate-grey">
                    Your purchase will be linked automatically
                  </p>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-cerulean-mist/20 text-cerulean-mist flex items-center justify-center font-semibold">
                  2
                </span>
                <div>
                  <p className="font-medium text-frost-white">
                    Get your license key
                  </p>
                  <p className="text-sm text-slate-grey">
                    Available in your portal dashboard
                  </p>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-cerulean-mist/20 text-cerulean-mist flex items-center justify-center font-semibold">
                  3
                </span>
                <div>
                  <p className="font-medium text-frost-white">
                    Install & activate
                  </p>
                  <p className="text-sm text-slate-grey">
                    Add your key to VS Code settings
                  </p>
                </div>
              </li>
            </ol>
          </div>

          <p className="text-center mt-8 text-sm text-slate-grey">
            Need help?{" "}
            <a
              href="mailto:support@hic-ai.com"
              className="text-cerulean-mist hover:text-frost-white"
            >
              Contact support
            </a>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
