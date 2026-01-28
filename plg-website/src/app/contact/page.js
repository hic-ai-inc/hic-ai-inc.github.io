/**
 * Contact Page
 *
 * Provides clear contact channels for different inquiry types.
 * Optimized for both human visitors and AI assistants seeking support information.
 *
 * @accessibility Optimized for screen readers with clear labeling
 * @audience Customers, prospects, partners, AI assistants
 */

import Link from "next/link";
import { Header, Footer } from "@/components/layout";
import { EXTERNAL_URLS } from "@/lib/constants";

export const metadata = {
  title: "Contact HIC AI | Mouse Support & Sales",
  description:
    "Get in touch with HIC AI. Contact our sales, support, billing, or legal teams. Join our Discord community for help and discussions.",
  keywords: [
    "HIC AI contact",
    "Mouse support",
    "sales inquiry",
    "billing help",
    "technical support",
  ],
};

// Structured contact data for AI assistants and programmatic access
const CONTACT_CHANNELS = [
  {
    id: "sales",
    category: "Sales",
    email: "sales@hic-ai.com",
    icon: "💼",
    title: "Sales Inquiries",
    description:
      "Interested in Mouse for your team or organization? Have questions about pricing, volume discounts, or enterprise features?",
    responseTime: "Within 24 hours",
    bestFor: [
      "Pricing questions",
      "Volume discounts (50+ seats)",
      "Enterprise SSO inquiries",
      "Custom agreements",
      "Partnership opportunities",
    ],
  },
  {
    id: "billing",
    category: "Billing",
    email: "billing@hic-ai.com",
    icon: "💳",
    title: "Billing & Payments",
    description:
      "Questions about invoices, payment methods, subscription changes, or refunds?",
    responseTime: "Within 24 hours",
    bestFor: [
      "Invoice requests",
      "Payment issues",
      "Subscription upgrades/downgrades",
      "Refund requests",
      "Tax documentation (W-9, VAT)",
    ],
  },
  {
    id: "general",
    category: "General",
    email: "info@hic-ai.com",
    icon: "📧",
    title: "General Inquiries",
    description:
      "General questions about HIC AI, Mouse, or anything else? We're happy to help.",
    responseTime: "Within 48 hours",
    bestFor: [
      "General questions",
      "Press inquiries",
      "Speaker requests",
      "Feedback",
    ],
  },
  {
    id: "legal",
    category: "Legal",
    email: "legal@hic-ai.com",
    icon: "⚖️",
    title: "Legal & Compliance",
    description:
      "Questions about terms of service, licensing agreements, or compliance requirements?",
    responseTime: "Within 3 business days",
    bestFor: [
      "Contract questions",
      "Custom licensing terms",
      "Compliance inquiries",
      "Security questionnaires",
    ],
  },
  {
    id: "privacy",
    category: "Privacy",
    email: "privacy@hic-ai.com",
    icon: "🔒",
    title: "Privacy & Data",
    description:
      "Questions about how we handle your data, GDPR requests, or privacy concerns?",
    responseTime: "Within 3 business days",
    bestFor: [
      "Data deletion requests",
      "GDPR/CCPA inquiries",
      "Privacy policy questions",
      "Data processing agreements",
    ],
  },
];

// Community channels
const COMMUNITY_CHANNELS = [
  {
    id: "discord",
    name: "Discord Community",
    icon: "💬",
    description:
      "Join our Discord server for real-time help, feature discussions, and community support. This is the fastest way to get help with technical questions.",
    url: EXTERNAL_URLS.discord,
    cta: "Join Discord",
    status: "Coming Soon",
  },
  {
    id: "github",
    name: "GitHub Issues",
    icon: "🐛",
    description:
      "Found a bug? Have a feature request? Open an issue on our GitHub repository.",
    url: `${EXTERNAL_URLS.github}/issues`,
    cta: "Open Issue",
    status: "Active",
  },
];

export default function ContactPage() {
  return (
    <>
      <Header />

      <main id="main-content" className="min-h-screen bg-deep-space">
        {/* Hero Section */}
        <section
          aria-labelledby="contact-heading"
          className="px-6 py-20 border-b border-slate-grey/20"
        >
          <div className="max-w-4xl mx-auto text-center">
            <h1
              id="contact-heading"
              className="text-4xl md:text-5xl font-bold text-frost-white mb-6"
            >
              Contact Us
            </h1>
            <p className="text-xl text-silver-mist leading-relaxed mb-8">
              We&apos;re here to help. Choose the channel that best fits your
              needs, and we&apos;ll get back to you as quickly as possible.
            </p>

            {/* Quick reference for AI assistants */}
            <aside
              aria-label="Contact summary"
              className="bg-slate-grey/10 rounded-lg p-6 text-left border border-slate-grey/30"
            >
              <h2 className="text-lg font-semibold text-cerulean-mist mb-3">
                Quick Contact Reference
              </h2>
              <ul className="space-y-2 text-silver-mist text-sm">
                <li>
                  <strong className="text-frost-white">Sales:</strong>{" "}
                  <a
                    href="mailto:sales@hic-ai.com"
                    className="text-cerulean-mist hover:underline"
                  >
                    sales@hic-ai.com
                  </a>{" "}
                  — Pricing, volume discounts, enterprise
                </li>
                <li>
                  <strong className="text-frost-white">Billing:</strong>{" "}
                  <a
                    href="mailto:billing@hic-ai.com"
                    className="text-cerulean-mist hover:underline"
                  >
                    billing@hic-ai.com
                  </a>{" "}
                  — Invoices, payments, subscriptions
                </li>
                <li>
                  <strong className="text-frost-white">General:</strong>{" "}
                  <a
                    href="mailto:info@hic-ai.com"
                    className="text-cerulean-mist hover:underline"
                  >
                    info@hic-ai.com
                  </a>{" "}
                  — Questions, press, feedback
                </li>
                <li>
                  <strong className="text-frost-white">Legal:</strong>{" "}
                  <a
                    href="mailto:legal@hic-ai.com"
                    className="text-cerulean-mist hover:underline"
                  >
                    legal@hic-ai.com
                  </a>{" "}
                  — Contracts, compliance
                </li>
                <li>
                  <strong className="text-frost-white">Privacy:</strong>{" "}
                  <a
                    href="mailto:privacy@hic-ai.com"
                    className="text-cerulean-mist hover:underline"
                  >
                    privacy@hic-ai.com
                  </a>{" "}
                  — GDPR, data requests
                </li>
              </ul>
            </aside>
          </div>
        </section>

        {/* Email Contact Channels */}
        <section
          aria-labelledby="email-channels-heading"
          className="px-6 py-16 border-b border-slate-grey/20"
        >
          <div className="max-w-5xl mx-auto">
            <h2
              id="email-channels-heading"
              className="text-3xl font-bold text-frost-white mb-4"
            >
              Email Contacts
            </h2>
            <p className="text-silver-mist mb-10">
              For the fastest response, please email the team most relevant to
              your inquiry:
            </p>

            <div className="grid md:grid-cols-2 gap-6">
              {CONTACT_CHANNELS.map((channel) => (
                <article
                  key={channel.id}
                  id={`contact-${channel.id}`}
                  className="bg-slate-grey/10 rounded-lg p-6 border border-slate-grey/30"
                  aria-labelledby={`${channel.id}-title`}
                >
                  <div className="flex items-start gap-4">
                    <span className="text-3xl" role="img" aria-hidden="true">
                      {channel.icon}
                    </span>
                    <div className="flex-1">
                      <h3
                        id={`${channel.id}-title`}
                        className="text-xl font-semibold text-frost-white mb-1"
                      >
                        {channel.title}
                      </h3>
                      <a
                        href={`mailto:${channel.email}`}
                        className="text-cerulean-mist hover:underline font-mono text-sm"
                      >
                        {channel.email}
                      </a>
                      <p className="text-silver-mist mt-3 text-sm">
                        {channel.description}
                      </p>
                      <p className="text-xs text-silver-mist/70 mt-2">
                        <strong>Response time:</strong> {channel.responseTime}
                      </p>
                      <div className="mt-4">
                        <p className="text-xs font-semibold text-frost-white mb-2">
                          Best for:
                        </p>
                        <ul className="text-xs text-silver-mist/80 space-y-1">
                          {channel.bestFor.map((item, idx) => (
                            <li key={idx} className="flex items-center gap-2">
                              <span className="text-cerulean-mist">•</span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Community Channels */}
        <section
          aria-labelledby="community-channels-heading"
          className="px-6 py-16 border-b border-slate-grey/20"
        >
          <div className="max-w-5xl mx-auto">
            <h2
              id="community-channels-heading"
              className="text-3xl font-bold text-frost-white mb-4"
            >
              Community & Support
            </h2>
            <p className="text-silver-mist mb-10">
              For technical questions, bug reports, and community discussions:
            </p>

            <div className="grid md:grid-cols-2 gap-6">
              {COMMUNITY_CHANNELS.map((channel) => (
                <article
                  key={channel.id}
                  className="bg-slate-grey/10 rounded-lg p-6 border border-slate-grey/30"
                >
                  <div className="flex items-start gap-4">
                    <span className="text-3xl" role="img" aria-hidden="true">
                      {channel.icon}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-semibold text-frost-white">
                          {channel.name}
                        </h3>
                        {channel.status === "Coming Soon" && (
                          <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-1 rounded">
                            Coming Soon
                          </span>
                        )}
                      </div>
                      <p className="text-silver-mist text-sm mb-4">
                        {channel.description}
                      </p>
                      {channel.status === "Active" ? (
                        <a
                          href={channel.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-cerulean-mist hover:underline text-sm font-medium"
                        >
                          {channel.cta}
                          <span aria-hidden="true">→</span>
                        </a>
                      ) : (
                        <span className="text-silver-mist/50 text-sm">
                          {channel.cta} (coming soon)
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Business Support Note */}
        <section
          aria-labelledby="business-support-heading"
          className="px-6 py-16 border-b border-slate-grey/20"
        >
          <div className="max-w-4xl mx-auto">
            <div className="bg-gradient-to-r from-cerulean-mist/10 to-cerulean-mist/5 rounded-lg p-8 border border-cerulean-mist/30">
              <h2
                id="business-support-heading"
                className="text-2xl font-bold text-frost-white mb-4"
              >
                Business License Support
              </h2>
              <p className="text-silver-mist mb-4">
                Business plan customers have access to priority email support
                with 24-hour response times. After signing up for a{" "}
                <Link
                  href="/checkout/business"
                  className="text-cerulean-mist hover:underline"
                >
                  Business plan
                </Link>
                , you&apos;ll receive dedicated support credentials.
              </p>
              <p className="text-silver-mist">
                Need enterprise features like SSO, custom contracts, or
                dedicated support?{" "}
                <a
                  href="mailto:sales@hic-ai.com"
                  className="text-cerulean-mist hover:underline"
                >
                  Contact our sales team
                </a>{" "}
                to discuss your requirements.
              </p>
            </div>
          </div>
        </section>

        {/* Office Information */}
        <section
          aria-labelledby="office-heading"
          className="px-6 py-16 border-b border-slate-grey/20"
        >
          <div className="max-w-4xl mx-auto">
            <h2
              id="office-heading"
              className="text-3xl font-bold text-frost-white mb-6"
            >
              Company Information
            </h2>
            <div className="bg-slate-grey/10 rounded-lg p-6 border border-slate-grey/30">
              <dl className="space-y-4 text-silver-mist">
                <div>
                  <dt className="font-semibold text-frost-white">
                    Company Name
                  </dt>
                  <dd>HIC AI Inc.</dd>
                </div>
                <div>
                  <dt className="font-semibold text-frost-white">
                    Headquarters
                  </dt>
                  <dd>Wilton, Connecticut, USA</dd>
                </div>
                <div>
                  <dt className="font-semibold text-frost-white">Website</dt>
                  <dd>
                    <a
                      href="https://hic-ai.com"
                      className="text-cerulean-mist hover:underline"
                    >
                      hic-ai.com
                    </a>
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        {/* Call to Action */}
        <section aria-labelledby="cta-heading" className="px-6 py-20">
          <div className="max-w-3xl mx-auto text-center">
            <h2
              id="cta-heading"
              className="text-3xl font-bold text-frost-white mb-4"
            >
              Ready to Get Started?
            </h2>
            <p className="text-xl text-silver-mist mb-8">
              Try Mouse free for 14 days. No credit card required.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center px-6 py-3 text-base font-medium rounded-lg bg-cerulean-mist text-deep-space hover:bg-cerulean-mist/90 transition-colors"
              >
                View Pricing
              </Link>
              <Link
                href="/docs/quickstart"
                className="inline-flex items-center justify-center px-6 py-3 text-base font-medium rounded-lg border border-cerulean-mist text-cerulean-mist hover:bg-cerulean-mist/10 transition-colors"
              >
                Read the Docs
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
