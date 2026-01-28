/**
 * Header Component
 *
 * Main navigation header for marketing pages.
 */

"use client";

import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/cognito-provider";
import { NAV_LINKS, EXTERNAL_URLS } from "@/lib/constants";
import Button from "@/components/ui/Button";

export default function Header() {
  const { user, isLoading, logout } = useAuth();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-midnight-navy/80 backdrop-blur-md border-b border-card-border">
      <div className="flex items-center h-16">
        {/* Logo Icon - Left corner, fills header height, will toggle sidebar */}
        <button
          className="h-14 w-14 ml-3 my-1 flex items-center justify-center flex-shrink-0 hover:bg-white/5 transition-colors overflow-hidden rounded"
          aria-label="Toggle sidebar"
          onClick={() => {
            // TODO: Implement sidebar toggle
            console.log("Sidebar toggle clicked");
          }}
        >
          <Image
            src="/images/mouse-logo.png"
            alt="Mouse Logo"
            width={192}
            height={192}
            priority
            className="h-48 w-48 scale-100"
            style={{ objectFit: "none", objectPosition: "center 55%" }}
          />
        </button>

        {/* Main Nav Content */}
        <nav className="flex-1 max-w-7xl mx-auto px-6 flex items-center justify-between">
          {/* Brand Text */}
          <Link href="/" className="flex items-center">
            <span className="text-xl font-bold tracking-wider text-frost-white">
              MOUSE
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-silver hover:text-frost-white transition-colors text-sm font-medium"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Auth Buttons - Show default (logged out) state immediately, no loading flicker */}
          <div className="flex items-center gap-4">
            {!isLoading && user ? (
              <>
                <Button href="/portal" variant="primary" size="sm">
                  Portal
                </Button>
                <button
                  onClick={logout}
                  className="text-silver hover:text-frost-white transition-colors text-sm font-medium"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/auth/login"
                  className="text-silver hover:text-frost-white transition-colors text-sm font-medium hidden sm:block"
                >
                  Sign In
                </Link>
                <Button href="/pricing" variant="primary" size="sm">
                  Get Started
                </Button>
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
