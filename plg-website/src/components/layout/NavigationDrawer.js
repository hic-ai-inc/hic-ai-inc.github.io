/**
 * NavigationDrawer Component
 *
 * Slide-out drawer for site navigation.
 * Displays nav links and auth buttons on all viewports.
 * Triggered by clicking the Mouse logo in the header.
 */

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { NAV_LINKS } from "@/lib/constants";
import Button from "@/components/ui/Button";

/**
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the drawer is open
 * @param {() => void} props.onClose - Callback to close the drawer
 * @param {Object|null} props.user - Current user object (null if not authenticated)
 * @param {() => void} props.logout - Logout function
 */
// Additional nav links for mobile (from footer)
const MOBILE_NAV_LINKS = [
  { label: "Home", href: "/" },
  ...NAV_LINKS,
];

const COMPANY_LINKS = [
  { label: "About", href: "/about" },
  { label: "FAQ", href: "/faq" },
  { label: "Contact", href: "/contact" },
];

export default function NavigationDrawer({ isOpen, onClose, user, logout }) {
  const drawerRef = useRef(null);
  const [isClosing, setIsClosing] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // Sync visibility with isOpen
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setIsClosing(false);
    }
  }, [isOpen]);

  // Handle close with animation
  const handleClose = () => {
    setIsClosing(true);
  };

  // After close animation ends, hide and notify parent
  const handleAnimationEnd = () => {
    if (isClosing) {
      setIsVisible(false);
      setIsClosing(false);
      onClose();
    }
  };

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen && !isClosing) {
        handleClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isClosing]);

  // Prevent body scroll when drawer is visible
  useEffect(() => {
    if (isVisible) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isVisible]);

  // Close when clicking outside the drawer
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && !isClosing) {
      handleClose();
    }
  };

  if (!isVisible) return null;

  return (
    <div
      className="fixed inset-0 z-50"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Mobile navigation"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Drawer */}
      <nav
        ref={drawerRef}
        className={`absolute top-0 left-0 h-full w-72 bg-midnight-navy border-r border-card-border shadow-2xl flex flex-col ${isClosing ? 'animate-slide-out-left' : 'animate-slide-in-left'}`}
        onAnimationEnd={handleAnimationEnd}
      >
        {/* Header with close button - X positioned where Mouse logo is */}
        <div className="flex items-center p-4 border-b border-card-border">
          <button
            onClick={handleClose}
            className="p-2 text-silver hover:text-frost-white transition-colors rounded-lg hover:bg-white/5"
            aria-label="Close menu"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Navigation Links */}
        <div className="flex-1 overflow-y-auto py-4">
          {/* Primary Navigation */}
          <ul className="space-y-1 px-3">
            {MOBILE_NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={handleClose}
                  className="block px-4 py-3 text-silver hover:text-frost-white hover:bg-white/5 rounded-lg transition-colors font-medium"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          {/* Company Links */}
          <div className="mt-6 pt-4 border-t border-card-border mx-3">
            <span className="px-4 text-xs font-semibold text-silver/60 uppercase tracking-wider">Company</span>
            <ul className="mt-2 space-y-1">
              {COMPANY_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={handleClose}
                    className="block px-4 py-3 text-silver hover:text-frost-white hover:bg-white/5 rounded-lg transition-colors font-medium"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Auth Section */}
        <div className="p-4 border-t border-card-border space-y-3">
          {user ? (
            <>
              <Button
                href="/portal"
                variant="primary"
                className="w-full justify-center"
                onClick={handleClose}
              >
                Portal
              </Button>
              <button
                onClick={() => {
                  logout();
                  handleClose();
                }}
                className="w-full px-4 py-2 text-silver hover:text-frost-white transition-colors text-sm font-medium rounded-lg hover:bg-white/5"
              >
                Sign Out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/auth/login"
                onClick={handleClose}
                className="block w-full px-4 py-2 text-center text-silver hover:text-frost-white transition-colors text-sm font-medium rounded-lg hover:bg-white/5"
              >
                Sign In
              </Link>
              <Button
                href="/pricing"
                variant="primary"
                className="w-full justify-center"
                onClick={handleClose}
              >
                Get Started
              </Button>
            </>
          )}
        </div>
      </nav>
    </div>
  );
}
