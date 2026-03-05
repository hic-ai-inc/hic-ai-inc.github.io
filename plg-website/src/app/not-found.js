/**
 * 404 Not Found Page
 *
 * Rendered by Next.js for any unmatched route.
 * App Router convention: not-found.js at the app root.
 *
 * NOTE: Cannot use Header here — Header is a "use client" component that calls
 * useAuth(), which requires CognitoProvider. Next.js renders not-found outside
 * the normal layout tree in some error paths, causing a context failure.
 * Standalone layout avoids the dependency entirely.
 */

import Link from "next/link";

export const metadata = {
  title: "Page Not Found | Mouse by HIC AI",
};

export default function NotFound() {
  return (
    <div className="min-h-screen bg-midnight-navy flex flex-col">
      {/* Minimal header */}
      <header className="px-6 py-5 border-b border-frost-white/10">
        <Link
          href="/"
          className="text-lg font-bold tracking-wider text-frost-white hover:text-cerulean-mist transition-colors"
        >
          MOUSE
        </Link>
      </header>

      {/* Content */}
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-2xl w-full text-center">
          <div className="text-8xl font-bold text-cerulean-mist/20 mb-4 select-none">
            404
          </div>
          <h1 className="text-3xl font-bold text-frost-white mb-4">
            Page not found
          </h1>
          <p className="text-frost-white/60 text-lg mb-10">
            The page you&apos;re looking for doesn&apos;t exist or has been
            moved.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/"
              className="btn btn-primary"
            >
              Go Home
            </Link>
            <Link
              href="/docs"
              className="btn btn-secondary"
            >
              Documentation
            </Link>
            <Link
              href="/contact"
              className="btn btn-ghost"
            >
              Contact Support
            </Link>
          </div>
        </div>
      </main>

      {/* Minimal footer */}
      <footer className="px-6 py-5 border-t border-frost-white/10 text-center">
        <p className="text-sm text-frost-white/30">
          © {new Date().getFullYear()} HIC AI, Inc.
        </p>
      </footer>
    </div>
  );
}
