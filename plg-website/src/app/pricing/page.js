/**
 * Pricing Page
 *
 * Two-tier pricing: Individual ($15/mo) / Business ($35/seat/mo)
 * Volume discounts for Business: 10% (50+), 15% (100+), 20% (500+)
 *
 * @see 20260126_PRICING_v4.2_FINAL_FEATURE_MATRIX.md
 */

import Link from "next/link";
import { Header, Footer } from "@/components/layout";
import { Button, Badge } from "@/components/ui";

export const metadata = {
  title: "Pricing - Mouse by HIC AI",
  description:
    "Simple, transparent pricing. Start free, upgrade when you're ready.",
};

const tiers = [
  {
    name: "Individual",
    price: "$15",
    period: "/month",
    annualPrice: "$150/year (save $30)",
    description: "For professional developers",
    cta: "Activate License",
    ctaLink: "/checkout/individual",
    featured: true,
    trial: null,
    features: [
      "All Mouse precision editing tools",
      "3 concurrent machines",
      "Commercial use allowed",
      "Social login (Google, GitHub, Microsoft)",
      "Usage dashboard",
      "Discord community support",
      "Documentation access",
      "Early access to new features",
    ],
    limitations: [],
  },
  {
    name: "Business",
    price: "$35",
    period: "/seat/month",
    annualPrice: "$350/seat/year (save $70/seat)",
    description: "For teams and power users",
    cta: "Activate License",
    ctaLink: "/checkout/business",
    featured: false,
    trial: null,
    features: [
      "Everything in Individual",
      "5 concurrent machines per seat",
      "Team management portal",
      "Invite & manage team members",
      "Role-based access control (RBAC)",
      "Full audit logging & exports",
      "License reassignment",
      "Email support (24h response)",
      "Volume discounts (50+ seats)",
      "Enterprise SSO (Contact Sales)",
    ],
    limitations: [],
    volumeDiscounts: [
      { seats: "1-49", discount: "Standard pricing" },
      { seats: "50-99", discount: "10% off" },
      { seats: "100-499", discount: "15% off" },
      { seats: "500+", discount: "20% off" },
    ],
  },
];

const faqs = [
  {
    question: "What is Execution Slop?",
    answer:
      "Execution Slop is when an AI coding agent makes the right plan, calls the right tool, but still produces the wrong output. Mouse's precision editing tools eliminate this problem by giving agents coordinate-based addressing and atomic operations.",
  },
  {
    question: "Can I switch plans later?",
    answer:
      "Yes! You can upgrade from Individual to Business at any time. When upgrading, you'll be prorated for the remainder of your billing cycle. You can also add seats to Business plans anytime.",
  },
  {
    question: "What counts as a machine?",
    answer:
      "Each unique device (laptop, desktop, or Dev Container) counts as one machine. Multiple VS Code windows on the same device count as one machine. You can deactivate old machines anytime from your portal.",
  },
  {
    question: "Do you offer refunds?",
    answer:
      "Yes. If you're not satisfied within the first 30 days, contact us for a full refund. No questions asked.",
  },
  {
    question: "Can I use Mouse for commercial projects?",
    answer:
      "Yes! Both Individual and Business plans permit commercial use, subject to our Terms of Service.",
  },
  {
    question: "What payment methods do you accept?",
    answer:
      "We accept all major credit cards, PayPal, and local payment methods depending on your region. Payments are processed securely by Stripe.",
  },
  {
    question: "What's the difference between Individual and Business?",
    answer:
      "Business includes 5 machines per seat (vs 3), team management features, RBAC, full audit logging, email support, and volume discounts. Solo developers who need more machines or email support can upgrade to Business.",
  },
  {
    question: "Do you offer Enterprise SSO (SAML)?",
    answer:
      "Yes, Enterprise SSO with SAML, Okta, and Azure AD is available for Business customers. Contact Sales to set up SSO for your organization.",
  },
  {
    question: "How do volume discounts work?",
    answer:
      "Volume discounts apply automatically for Business plans: 10% off for 50-99 seats, 15% off for 100-499 seats, and 20% off for 500+ seats. Discounts apply to all seats in your subscription.",
  },
];

export default function PricingPage() {
  return (
    <>
      <Header />
      <main className="pt-16 min-h-screen bg-midnight-navy">
        {/* Header */}
        <section className="py-24 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-midnight-navy via-midnight-navy to-midnight-navy/95" />
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-cerulean-mist/10 blur-[100px] rounded-full" />

          <div className="relative z-10 max-w-4xl mx-auto text-center px-6">
            <h1 className="text-4xl md:text-5xl font-bold text-frost-white mb-4">
              Simple, Transparent Pricing
            </h1>
            <p className="text-xl text-silver">
              Eliminate execution slop with precision editing tools.
            </p>
          </div>
        </section>

        {/* Pricing Tiers */}
        <section className="py-12 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="grid md:grid-cols-2 gap-8">
              {tiers.map((tier) => (
                <div
                  key={tier.name}
                  className={`card ${
                    tier.featured
                      ? "border-2 border-cerulean-mist relative"
                      : ""
                  }`}
                >
                  {tier.featured && (
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                      <Badge variant="info">Most Popular</Badge>
                    </div>
                  )}

                  <h2 className="text-2xl font-bold text-frost-white mb-2">
                    {tier.name}
                  </h2>
                  <p className="text-slate-grey mb-4">{tier.description}</p>

                  <div className="mb-6">
                    <span className="text-4xl font-bold text-frost-white">
                      {tier.price}
                    </span>
                    <span className="text-slate-grey">{tier.period}</span>
                    {tier.annualPrice && (
                      <p className="text-sm text-cerulean-mist mt-1">
                        {tier.annualPrice}
                      </p>
                    )}
                  </div>

                  {tier.trial && (
                    <p className="text-sm text-slate-grey mb-4">{tier.trial}</p>
                  )}

                  <Button
                    href={tier.ctaLink}
                    variant={tier.featured ? "primary" : "secondary"}
                    className="w-full mb-6"
                  >
                    {tier.cta}
                  </Button>

                  <ul className="space-y-3">
                    {tier.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start text-silver"
                      >
                        <span className="text-success mr-2">✓</span>
                        {feature}
                      </li>
                    ))}
                    {tier.limitations.map((limitation) => (
                      <li
                        key={limitation}
                        className="flex items-start text-slate-grey"
                      >
                        <span className="mr-2">–</span>
                        {limitation}
                      </li>
                    ))}
                  </ul>

                  {tier.volumeDiscounts && (
                    <div className="mt-6 pt-6 border-t border-card-border">
                      <p className="text-sm font-medium text-frost-white mb-2">
                        Volume Discounts:
                      </p>
                      <ul className="text-sm text-slate-grey space-y-1">
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


            {/* Off-ramp for users not ready to purchase */}
            <div className="text-center mt-12 p-6 rounded-lg border border-card-border bg-card-bg/50">
              <p className="text-frost-white font-medium mb-2">
                Not ready to purchase?
              </p>
              <p className="text-silver text-sm mb-4">
                Try Mouse free for 14 days—no account or credit card required.
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <a
                  href="https://marketplace.visualstudio.com/items?itemName=hic-ai.mouse"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cerulean-mist hover:underline text-sm"
                >
                  Install from VS Code Marketplace →
                </a>
                <Link
                  href="/docs/installation"
                  className="text-cerulean-mist hover:underline text-sm"
                >
                  Or install with npx in any editor →
                </Link>
              </div>
            </div>

            {/* Tax note */}
            <p className="text-center text-slate-grey text-sm mt-8">
              All prices are in USD and exclude applicable taxes (sales tax,
              VAT, GST).
              <br />
              Taxes are calculated at checkout based on your location.
            </p>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-20 px-6 bg-card-bg/30 border-t border-card-border">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-frost-white text-center mb-12">
              Frequently Asked Questions
            </h2>
            <div className="space-y-6">
              {faqs.map((faq) => (
                <div key={faq.question} className="card">
                  <h3 className="text-lg font-semibold text-frost-white mb-2">
                    {faq.question}
                  </h3>
                  <p className="text-silver">{faq.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
