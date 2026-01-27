/**
 * Welcome Page
 *
 * Post-checkout landing page for account setup.
 * Handles both authenticated users and guest checkout scenarios.
 *
 * @see PLG User Journey - Section 2.4
 */

import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Header, Footer } from "@/components/layout";
import { Button, Card, CardContent, Badge } from "@/components/ui";

export const metadata = {
  title: "Welcome to Mouse",
  description: "Set up your Mouse account and get started",
};

// Force dynamic rendering - requires session check
export const dynamic = "force-dynamic";

export default async function WelcomePage({ searchParams }) {
  const session = await getSession();
  const params = await searchParams;
  const sessionId = params?.session_id;

  // If no session ID and not authenticated, redirect to pricing
  if (!sessionId && !session) {
    redirect("/pricing");
  }

  // If authenticated, redirect to portal
  if (session) {
    redirect("/portal");
  }

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
                  href={`/auth/login?returnTo=/portal&screen_hint=signup${
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
                  href={`/auth/login?returnTo=/portal${
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
