/**
 * Pricing Page
 *
 * Two-tier pricing: Individual ($15/mo) / Enterprise ($25/seat for 2+ seats)
 * Volume discounts for Enterprise: 5% (10+), 10% (100+), 15% (500+), 20% (1000+)
 *
 * @see PLG User Journey - Section 2.2
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
    cta: "Start Free Trial",
    ctaLink: "/checkout/individual",
    featured: true,
    trial: "14-day free trial, no card required",
    features: [
      "Single user license",
      "3 device activations",
      "Full Mouse editing toolkit",
      "Best-in-class file navigation tools",
      "Commercial use permitted",
      "Early access to new features",
      "Community support",
    ],
    limitations: [],
  },
  {
    name: "Enterprise",
    price: "$25",
    period: "/seat/month",
    annualPrice: "$250/seat/year (save $50/seat)",
    description: "For teams of 2 or more",
    cta: "Start Enterprise Trial",
    ctaLink: "/checkout/enterprise",
    featured: false,
    trial: "30-day trial for teams",
    features: [
      "Minimum 2 seats",
      "2 devices per seat",
      "Full Mouse editing toolkit",
      "SSO (SAML, Okta, Azure AD)",
      "Team management portal",
      "Centralized billing",
      "Priority email support",
    ],
    limitations: [],
    volumeDiscounts: [
      { seats: "2-9", discount: "Standard pricing" },
      { seats: "10-99", discount: "5% off" },
      { seats: "100-499", discount: "10% off" },
      { seats: "500-999", discount: "15% off" },
      { seats: "1,000+", discount: "20% off" },
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
    question: "Can I use Mouse for commercial projects?",
    answer:
      "Yes! Both Individual and Enterprise plans permit commercial use, subject to our Terms of Service.",
  },
  {
    question: "What payment methods do you accept?",
    answer:
      "We accept all major credit cards, PayPal, and local payment methods depending on your region. Payments are processed securely by our payment partner.",
  },
  {
    question: "Are prices shown before or after tax?",
    answer:
      "All prices shown are before applicable taxes. Sales tax, VAT, or GST will be calculated and added at checkout based on your location.",
  },
  {
    question: "What's the minimum seat count for Enterprise?",
    answer:
      "Enterprise licenses require a minimum of 2 seats. For single-user commercial use, the Individual plan is the right choice.",
  },
  {
    question: "How do volume discounts work?",
    answer:
      "Volume discounts apply automatically based on the number of seats purchased: 5% off for 10-99 seats, 10% off for 100-499 seats, 15% off for 500-999 seats, and 20% off for 1,000+ seats. Discounts apply to all seats in your order.",
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
              Start with a free trial. Upgrade when you're ready.
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
