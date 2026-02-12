/**
 * Footer Component
 *
 * Site footer with navigation and legal links.
 */

import Link from "next/link";
import { EXTERNAL_URLS, COMPANY_NAME, MARKETPLACE_ENABLED } from "@/lib/constants";

const footerLinks = {
  product: [
    { label: "Features", href: "/features" },
    { label: "Pricing", href: "/pricing" },
    { label: "Documentation", href: "/docs" },
    { label: "Research", href: "/research" },
  ],
  company: [
    { label: "About", href: "/about" },
    { label: "FAQ", href: "/faq" },
    { label: "Contact", href: "/contact" },
  ],
  resources: [
    {
      label: MARKETPLACE_ENABLED ? "VS Code Marketplace" : "VS Code Marketplace (Coming Soon)",
      href: MARKETPLACE_ENABLED ? EXTERNAL_URLS.marketplace : null,
      external: true,
      disabled: !MARKETPLACE_ENABLED,
    },
    { label: "Support", href: "mailto:support@hic-ai.com", external: true },
  ],
  legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
  ],
};

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-midnight-navy border-t border-card-border">
      <div className="max-w-7xl mx-auto px-6 py-12 lg:py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="inline-block">
              <span className="text-lg font-bold tracking-wider text-frost-white">
                MOUSE
              </span>
            </Link>
            <p className="mt-4 text-sm text-slate-grey">
              Precision editing tools for AI coding agents.
            </p>
          </div>

          {/* Product */}
          <div>
            <h3 className="text-sm font-semibold text-frost-white uppercase tracking-wider">
              Product
            </h3>
            <ul className="mt-4 space-y-3">
              {footerLinks.product.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-slate-grey hover:text-frost-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="text-sm font-semibold text-frost-white uppercase tracking-wider">
              Company
            </h3>
            <ul className="mt-4 space-y-3">
              {footerLinks.company.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-slate-grey hover:text-frost-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h3 className="text-sm font-semibold text-frost-white uppercase tracking-wider">
              Resources
            </h3>
            <ul className="mt-4 space-y-3">
              {footerLinks.resources.map((link) => (
                <li key={link.label}>
                  {link.disabled ? (
                    <span className="text-sm text-slate-grey/50 cursor-not-allowed">
                      {link.label}
                    </span>
                  ) : link.external ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-slate-grey hover:text-frost-white transition-colors"
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link
                      href={link.href}
                      className="text-sm text-slate-grey hover:text-frost-white transition-colors"
                    >
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-sm font-semibold text-frost-white uppercase tracking-wider">
              Legal
            </h3>
            <ul className="mt-4 space-y-3">
              {footerLinks.legal.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-slate-grey hover:text-frost-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-8 pt-6 border-t border-card-border">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            {/* Copyright - left */}
            <p className="text-sm text-slate-grey order-2 sm:order-1 sm:flex-1 text-center sm:text-left">
              © {currentYear} {COMPANY_NAME}, Inc. All rights reserved.
            </p>

            {/* Tagline - dead center */}
            <p className="text-xs text-frost-white uppercase tracking-[0.3em] order-1 sm:order-2">
              Tiny but Powerful
            </p>

            {/* VS Code Marketplace link - right */}
            <div className="order-3 sm:flex-1 text-center sm:text-right">
              {MARKETPLACE_ENABLED ? (
                <a
                  href={EXTERNAL_URLS.marketplace}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-slate-grey hover:text-frost-white transition-colors"
                >
                  Get it on VS Code Marketplace →
                </a>
              ) : (
                <span className="text-sm text-slate-grey/50">
                  VS Code Marketplace — Coming Soon
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
