/**
 * Footer Component
 *
 * Site footer with navigation and legal links.
 */

import Link from "next/link";
import Image from "next/image";
import { EXTERNAL_URLS, COMPANY_NAME } from "@/lib/constants";

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
      label: "VS Code Marketplace",
      href: EXTERNAL_URLS.marketplace,
      external: true,
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
            <Link href="/" className="flex items-center gap-4">
              <div className="h-8 w-8 flex items-center justify-center overflow-hidden rounded flex-shrink-0">
                <Image
                  src="/images/mouse-logo.png"
                  alt="Mouse Logo"
                  width={192}
                  height={192}
                  className="h-28 w-28 scale-100"
                  style={{ objectFit: "none", objectPosition: "center 55%" }}
                />
              </div>
              <span className="text-xl font-bold tracking-wider text-frost-white">
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
                <li key={link.href}>
                  {link.external ? (
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
              <a
                href={EXTERNAL_URLS.marketplace}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-slate-grey hover:text-frost-white transition-colors"
              >
                Get it on VS Code Marketplace →
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
