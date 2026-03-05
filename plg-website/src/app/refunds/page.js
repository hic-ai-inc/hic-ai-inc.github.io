/**
 * Refund and Cancellation Policy Page
 *
 * Refund and cancellation terms for Mouse software subscriptions.
 * Last updated: March 4, 2026
 */

import { Header, Footer } from "@/components/layout";

export const metadata = {
  title: "Refund & Cancellation Policy - Mouse by HIC AI",
  description:
    "Refund and Cancellation Policy for Mouse precision editing tools.",
};

export default function RefundPolicyPage() {
  return (
    <>
      <Header />
      <main className="pt-16 min-h-screen bg-midnight-navy">
        <article className="max-w-4xl mx-auto px-6 py-16">
          <h1 className="text-4xl font-bold text-frost-white mb-2">
            Refund &amp; Cancellation Policy
          </h1>
          <p className="text-slate-grey mb-12">
            Last updated: March 4, 2026
          </p>

          <div className="prose prose-invert prose-slate max-w-none space-y-8">
            {/* Introduction */}
            <section>
              <p className="text-silver leading-relaxed">
                HIC AI Inc. (&quot;Company,&quot; &quot;we,&quot;
                &quot;us,&quot; or &quot;our&quot;) provides the following
                Refund and Cancellation Policy governing all purchases of Mouse
                software subscriptions (the &quot;Software&quot;). By
                purchasing a subscription, you acknowledge and agree to the
                terms set forth below.
              </p>
            </section>

            {/* Section 1 */}
            <section>
              <h2 className="text-2xl font-semibold text-frost-white mb-4">
                1. Refund Eligibility
              </h2>
              <p className="text-silver leading-relaxed mb-4">
                We offer a 30-day refund policy for initial subscription
                purchases, subject to the following conditions:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-silver">
                <li>
                  Refund requests must be submitted{" "}
                  in writing to{" "}
                  <a
                    href="mailto:billing@hic-ai.com"
                    className="text-cerulean-mist hover:underline"
                  >
                    billing@hic-ai.com
                  </a>{" "}
                  within thirty (30) calendar days of the date of your initial
                  purchase.
                </li>
                <li>
                  Refund requests received within the 30-day window will be
                  honored on a no-questions-asked basis.
                </li>
                <li>
                  Refunds will be processed to the original payment method and
                  may take 5–10 business days to appear on your statement,
                  depending on your financial institution.
                </li>
              </ul>
            </section>

            {/* Section 2 */}
            <section>
              <h2 className="text-2xl font-semibold text-frost-white mb-4">
                2. No Refunds After 30 Days
              </h2>
              <p className="text-silver leading-relaxed">
                After the initial 30-day refund window has elapsed, all
                subscription payments are final and non-refundable. This
                applies to all subsequent renewal charges, whether monthly or
                annual, as well as any plan upgrades or seat additions. We do
                not offer partial refunds for unused portions of a billing
                period.
              </p>
            </section>

            {/* Section 3 */}
            <section>
              <h2 className="text-2xl font-semibold text-frost-white mb-4">
                3. Subscription Cancellation
              </h2>
              <p className="text-silver leading-relaxed mb-4">
                You may cancel your subscription at any time through the
                following process:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-silver mb-4">
                <li>
                  Log in to the{" "}
                  <a
                    href="/portal"
                    className="text-cerulean-mist hover:underline"
                  >
                    Admin Portal
                  </a> on
                  our website.
                </li>
                <li>
                  Navigate to your subscription management settings, which will
                  redirect you to Stripe&apos;s customer portal where you can
                  manage or cancel your subscription.
                </li>
              </ul>
              <p className="text-silver leading-relaxed">
                Cancellation does not immediately
                deactivate your account. You will retain full licensed access to
                Mouse through the remainder of your current billing term
                (monthly or annual). You may reinstate your subscription at any
                time prior to the expiration of the existing term without
                interruption of service.
              </p>
            </section>

            {/* Section 4 */}
            <section>
              <h2 className="text-2xl font-semibold text-frost-white mb-4">
                4. No Refunds for Mid-Term Cancellations
              </h2>
              <p className="text-silver leading-relaxed">
                We do not offer refunds or credits for cancellations made
                mid-month or mid-year for the portion of the subscription term
                already paid. Your access will continue through the end of the
                current billing period, and no further charges will be incurred
                after cancellation takes effect.
              </p>
            </section>

            {/* Section 5 */}
            <section>
              <h2 className="text-2xl font-semibold text-frost-white mb-4">
                5. Business Subscriptions
              </h2>
              <p className="text-silver leading-relaxed">
                The same refund and cancellation terms apply to Business
                subscriptions. The 30-day refund window applies to the initial
                purchase of a Business subscription. Subsequent seat additions
                or renewals are subject to the no-refund policy described in
                Section 2.
              </p>
            </section>

            {/* Section 6 */}
            <section>
              <h2 className="text-2xl font-semibold text-frost-white mb-4">
                6. Billing Concerns
              </h2>
              <p className="text-silver leading-relaxed">
                If you have any concerns regarding billing, charges, or your
                subscription, please contact us at{" "}
                <a
                  href="mailto:billing@hic-ai.com"
                  className="text-cerulean-mist hover:underline"
                >
                  billing@hic-ai.com
                </a>
                . We are committed to resolving any issues promptly and fairly.
              </p>
            </section>

            {/* Section 7 */}
            <section>
              <h2 className="text-2xl font-semibold text-frost-white mb-4">
                7. Changes to This Policy
              </h2>
              <p className="text-silver leading-relaxed">
                We may update this Refund and Cancellation Policy from time to
                time. We will notify you of any material changes by posting the
                revised policy on this page and updating the &quot;Last
                updated&quot; date. Your continued use of the Software after
                any changes constitutes acceptance of the updated policy.
              </p>
            </section>

            {/* Section 8 */}
            <section>
              <h2 className="text-2xl font-semibold text-frost-white mb-4">
                8. Stripe
              </h2>
              <p className="text-silver leading-relaxed">
                We partner with Stripe and Stripe Managed Partners to simplify
                and streamline billing and account management. Notwithstanding
                anything in this Refund Policy to the contrary, to the extent
                that Stripe or SMP&apos;s refund policies are more permissive
                than those set forth in this Refund Policy, the terms of those
                policies will prevail over any conflicting terms herein.
              </p>
            </section>

            {/* Contact */}
            <section>
              <h2 className="text-2xl font-semibold text-frost-white mb-4">
                Contact Us
              </h2>
              <p className="text-silver leading-relaxed">
                If you have questions about this Refund and Cancellation Policy,
                please contact us at:
              </p>
              <address className="text-silver mt-4 not-italic">
                HIC AI Inc.
                <br />
                Billing Department
                <br />
                Email:{" "}
                <a
                  href="mailto:billing@hic-ai.com"
                  className="text-cerulean-mist hover:underline"
                >
                  billing@hic-ai.com
                </a>
              </address>
            </section>
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
