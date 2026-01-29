/**
 * Welcome Page
 *
 * Post-checkout landing page for account setup.
 * Handles both authenticated users and guest checkout scenarios.
 *
 * Auth routing is handled client-side by WelcomeRouter because
 * Amplify auth is only configured in browser context (SSR limitation).
 *
 * @see PLG User Journey - Section 2.4
 */

import { Suspense } from "react";
import WelcomeRouter from "./WelcomeRouter";
import WelcomeContent from "./WelcomeContent";

export const metadata = {
  title: "Welcome to Mouse",
  description: "Set up your Mouse account and get started",
};

// Server-side loading fallback
function WelcomeLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-void-black">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cerulean-mist mx-auto mb-4"></div>
        <p className="text-silver">Loading...</p>
      </div>
    </div>
  );
}

export default function WelcomePage() {
  return (
    <Suspense fallback={<WelcomeLoading />}>
      <WelcomeRouter>
        <WelcomeContent />
      </WelcomeRouter>
    </Suspense>
  );
}
