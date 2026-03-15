/**
 * SkipLink Component
 *
 * Accessibility feature that allows keyboard users to skip directly
 * to the main content, bypassing navigation elements.
 * Hidden by default, appears on focus (first Tab press).
 */

"use client";

export default function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-cerulean-mist focus:text-midnight-navy focus:rounded-lg focus:font-medium focus:outline-none focus:ring-2 focus:ring-frost-white"
    >
      Skip to main content
    </a>
  );
}
