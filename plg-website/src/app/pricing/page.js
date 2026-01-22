/**
 * Pricing Page
 *
 * Three-tier pricing: Open Source ($0) / Individual ($10/mo) / Enterprise ($25/seat)
 *
 * @see PLG User Journey - Section 2.2
 * @see Proposed Pricing Changes document
 */

import Link from "next/link";

export const metadata = {
  title: "Pricing - Mouse by HIC AI",
  description:
    "Simple, transparent pricing. Start free, upgrade when you're ready.",
};

const tiers = [
  {
    name: "Open Source",
    price: "$0",
    period: "forever",
    description: "For OSS maintainers and contributors",
    cta: "Apply for OSS",
    ctaLink: "/checkout/oss",
    featured: false,
    features: [
      "1 device activation",
      "Core slop detection",
      "Community support",
      "GitHub verification required",
    ],
    limitations: ["Non-commercial use only", "No priority support"],
  },
  {
    name: "Individual",
    price: "$10",
    period: "/month",
    annualPrice: "$100/year (save $20)",
    description: "For professional developers",
    cta: "Start Free Trial",
    ctaLink: "/checkout/individual",
    featured: true,
    trial: "14-day free trial, no card required",
    features: [
      "3 device activations",
      "Advanced slop detection",
      "Priority email support",
      "Usage analytics dashboard",
      "Early access to new features",
    ],
    limitations: [],
  },
  {
    name: "Enterprise",
    price: "$25",
    period: "/seat/month",
    annualPrice: "Billed annually",
    description: "For teams and organizations",
    cta: "Start Enterprise Trial",
    ctaLink: "/checkout/enterprise",
    featured: false,
    trial: "30-day trial, card required",
    features: [
      "2 devices per seat",
      "SSO (SAML, Okta, Azure AD)",
      "Team management portal",
      "Centralized billing",
      "Dedicated support",
      "Custom onboarding",
      "Volume discounts available",
    ],
    volumeDiscounts: [
      { seats: "10-99", discount: "Standard pricing" },
      { seats: "100-499", discount: "10% off" },
      { seats: "500+", discount: "20% off" },
    ],
  },
];

const faqs = [
  {
    question: "What is execution slop?",
    answer:
      "Execution slop refers to AI-generated code that appears correct but contains subtle logic errors, inefficiencies, or anti-patterns. Mouse detects these issues before they reach your codebase.",
  },
  {
    question: "Can I switch plans later?",
    answer:
      "Yes! You can upgrade or downgrade at any time. When upgrading, you'll be prorated for the remainder of your billing cycle. When downgrading, the change takes effect at your next billing date.",
  },
  {
    question: "What counts as a device?",
    answer:
      "Each VS Code installation on a unique machine counts as one device. You can deactivate old devices anytime from your portal to free up slots.",
  },
  {
    question: "Do you offer refunds?",
    answer:
      "Yes. If you're not satisfied within the first 30 days, contact us for a full refund. No questions asked.",
  },
  {
    question: "How does the OSS tier work?",
    answer:
      "The Open Source tier is free for verified OSS maintainers. You'll need to verify your GitHub account and show active contributions to qualifying open source projects.",
  },
  {
    question: "What payment methods do you accept?",
    answer:
      "We accept all major credit cards (Visa, Mastercard, Amex) via Stripe. Enterprise customers can also pay by invoice.",
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-slate-900/80 backdrop-blur-sm border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center">
              <span className="text-2xl font-bold text-white tracking-wider">
                MOUSE
              </span>
              <span className="ml-2 text-sm text-slate-400">by HIC AI</span>
            </Link>
            <div className="flex items-center space-x-6">
              <Link href="/pricing" className="text-white font-medium">
                Pricing
              </Link>
              <Link
                href="/docs"
                className="text-slate-300 hover:text-white transition"
              >
                Docs
              </Link>
              <Link
                href="/api/auth/login"
                className="text-slate-300 hover:text-white transition"
              >
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Header */}
      <section className="pt-32 pb-12 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Simple, Transparent Pricing
          </h1>
          <p className="text-xl text-slate-300">
            Start free. Upgrade when you're ready. No hidden fees.
          </p>
        </div>
      </section>

      {/* Pricing Tiers */}
      <section className="py-12 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            {tiers.map((tier) => (
              <div
                key={tier.name}
                className={`bg-slate-800 rounded-2xl p-8 ${
                  tier.featured
                    ? "border-2 border-cyan-500 relative"
                    : "border border-slate-700"
                }`}
              >
                {tier.featured && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <span className="bg-cyan-500 text-slate-900 text-sm font-semibold px-4 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}

                <h2 className="text-2xl font-bold text-white mb-2">
                  {tier.name}
                </h2>
                <p className="text-slate-400 mb-4">{tier.description}</p>

                <div className="mb-6">
                  <span className="text-4xl font-bold text-white">
                    {tier.price}
                  </span>
                  <span className="text-slate-400">{tier.period}</span>
                  {tier.annualPrice && (
                    <p className="text-sm text-cyan-400 mt-1">
                      {tier.annualPrice}
                    </p>
                  )}
                </div>

                {tier.trial && (
                  <p className="text-sm text-slate-400 mb-4">{tier.trial}</p>
                )}

                <Link
                  href={tier.ctaLink}
                  className={`block text-center py-3 px-6 rounded-lg font-semibold transition mb-6 ${
                    tier.featured
                      ? "bg-cyan-500 hover:bg-cyan-400 text-slate-900"
                      : "bg-slate-700 hover:bg-slate-600 text-white"
                  }`}
                >
                  {tier.cta}
                </Link>

                <ul className="space-y-3">
                  {tier.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start text-slate-300"
                    >
                      <span className="text-cyan-400 mr-2">✓</span>
                      {feature}
                    </li>
                  ))}
                  {tier.limitations.map((limitation) => (
                    <li
                      key={limitation}
                      className="flex items-start text-slate-500"
                    >
                      <span className="mr-2">–</span>
                      {limitation}
                    </li>
                  ))}
                </ul>

                {tier.volumeDiscounts && (
                  <div className="mt-6 pt-6 border-t border-slate-700">
                    <p className="text-sm font-medium text-white mb-2">
                      Volume Discounts:
                    </p>
                    <ul className="text-sm text-slate-400 space-y-1">
                      {tier.volumeDiscounts.map((vd) => (
                        <li key={vd.seats}>
                          {vd.seats} seats: {vd.discount}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 px-4 bg-slate-800/50">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-12">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            {faqs.map((faq) => (
              <div key={faq.question} className="bg-slate-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-2">
                  {faq.question}
                </h3>
                <p className="text-slate-400">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t border-slate-700">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="mb-4 md:mb-0">
              <span className="text-xl font-bold text-white">MOUSE</span>
              <span className="ml-2 text-sm text-slate-400">by HIC AI</span>
            </div>
            <div className="flex space-x-6 text-slate-400 text-sm">
              <Link href="/privacy" className="hover:text-white transition">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-white transition">
                Terms
              </Link>
              <Link href="/docs" className="hover:text-white transition">
                Documentation
              </Link>
              <a
                href="mailto:support@hic-ai.com"
                className="hover:text-white transition"
              >
                Support
              </a>
            </div>
          </div>
          <div className="mt-8 text-center text-slate-500 text-sm">
            © {new Date().getFullYear()} HIC AI Inc. All rights reserved.
          </div>
        </div>
      </footer>
    </main>
  );
}
