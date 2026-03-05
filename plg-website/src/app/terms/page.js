/**
 * Terms of Service Page
 *
 * Legal terms for using Mouse software.
 * Last updated: January 2026
 */

import { Header, Footer } from "@/components/layout";

export const metadata = {
  title: "Terms of Service - Mouse by HIC AI",
  description: "Terms of Service for Mouse precision editing tools.",
};

export default function TermsPage() {
  return (
    <>
      <Header />
      <main className="pt-16 min-h-screen bg-midnight-navy">
        <article className="max-w-4xl mx-auto px-6 py-16">
          <h1 className="text-4xl font-bold text-frost-white mb-2">
            Terms of Service
          </h1>
          <p className="text-slate-grey mb-12">
            Last updated: March 4, 2026
          </p>

          <div className="prose prose-invert prose-slate max-w-none space-y-8">
            {/* Introduction */}
            <section>
              <p className="text-silver leading-relaxed">
                These Terms of Service (&quot;Terms&quot;) govern your access to
                and use of Mouse software, services, and documentation
                (collectively, the &quot;Software&quot;) provided by HIC AI Inc.
                (&quot;Company,&quot; &quot;we,&quot; &quot;us,&quot; or
                &quot;our&quot;). By installing, accessing, or using the
                Software, you agree to be bound by these Terms.
              </p>
            </section>

            {/* Section 1 */}
            <section>
              <h2 className="text-2xl font-semibold text-frost-white mb-4">
                1. Definitions
              </h2>
              <ul className="list-disc pl-6 space-y-2 text-silver">
                <li>
                  <strong className="text-frost-white">
                    &quot;Software&quot;
                  </strong>{" "}
                  means the Mouse VS Code extension, MCP server components,
                  documentation, and any updates or modifications thereto.
                </li>
                <li>
                  <strong className="text-frost-white">&quot;User&quot;</strong>{" "}
                  means any individual or entity that installs, accesses, or
                  uses the Software.
                </li>
                <li>
                  <strong className="text-frost-white">
                    &quot;License Key&quot;
                  </strong>{" "}
                  means the unique activation code provided upon purchase or
                  trial registration.
                </li>
                <li>
                  <strong className="text-frost-white">
                    &quot;Device&quot;
                  </strong>{" "}
                  means a unique VS Code installation on a physical or virtual
                  machine.
                </li>
                <li>
                  <strong className="text-frost-white">
                    &quot;Customer&quot;
                  </strong>{" "}
                  means any person or entity who purchases a license
                  subscription for the Software.
                </li>
              </ul>
            </section>

            {/* Section 2 */}
            <section>
              <h2 className="text-2xl font-semibold text-frost-white mb-4">
                2. License Grant
              </h2>
              <p className="text-silver leading-relaxed mb-4">
                Subject to your compliance with these Terms and payment of
                applicable fees, we grant you a limited, non-exclusive,
                non-transferable, revocable license to install and use the
                Software on the number of Devices permitted by your subscription
                tier.
              </p>
              <p className="text-silver leading-relaxed">
                This license permits use for both personal and commercial
                purposes, subject to the restrictions below.
              </p>
              <h3 className="text-lg font-medium text-frost-white mb-2 mt-6">
                Trial License
              </h3>
              <p className="text-silver leading-relaxed mb-4">
                Mouse is distributed as a VS Code extension and may be
                installed free of charge. Upon installation, you will receive a
                fourteen (14) day trial license that provides full access to
                all Mouse functionality. During the trial period, the Software
                will display informational notices (&quot;nag banners&quot;),
                including a status bar indicator (e.g., &quot;Mouse: Trial
                (14d)&quot;) and periodic messages accompanying a percentage of
                Mouse tool responses informing the AI assistant that the Mouse
                tools are not yet activated and that the trial term will expire.
                We reserve the right to increase or change the frequency,
                positioning, or behavior of nag banners at any time.
              </p>
              <p className="text-silver leading-relaxed mb-4">
                We recommend purchasing a subscription prior to expiration of
                the trial period to remove all nag banners and obtain the full
                benefits of a licensed version of Mouse. We reserve the right
                to change the terms of the trial license at any time, without
                prior notice, including the right to cease offering trial
                licenses free of charge or without requiring account
                registration in advance.
              </p>
              <p className="text-silver leading-relaxed">
                If the Mouse tools remain unlicensed beyond the expiration of
                the license period — whether fourteen (14) days in the case of
                a trial license, or upon expiration of an existing subscription
                term without payment of the applicable renewal fee — the Mouse
                tools will be placed in an expired state and, with the
                exception of the <code className="text-cerulean-mist">license_status</code> tool,
                will be disabled. To reactivate the Mouse tools after
                expiration, you will need to process payment for a subscription
                and enter a valid, active license key. To avoid disruption, we
                encourage you to complete your purchase prior to expiration of
                the trial period.
              </p>
            </section>

            {/* Section 3 */}
            <section>
              <h2 className="text-2xl font-semibold text-frost-white mb-4">
                3. License Restrictions
              </h2>
              <p className="text-silver leading-relaxed mb-4">You may not:</p>
              <ul className="list-disc pl-6 space-y-2 text-silver">
                <li>
                  Copy, modify, or distribute the Software except as expressly
                  permitted
                </li>
                <li>
                  Reverse engineer, decompile, or disassemble the Software
                </li>
                <li>
                  Remove or alter any proprietary notices or labels on the
                  Software
                </li>
                <li>
                  Use the Software to develop a competing product or service
                </li>
                <li>
                  Share, transfer, or sublicense your License Key to third
                  parties
                </li>
                <li>
                  Use automated means to circumvent device activation limits
                </li>
                <li>
                  Use the Software in violation of any applicable law or
                  regulation
                </li>
              </ul>
            </section>

            {/* Section 4 */}
            <section>
              <h2 className="text-2xl font-semibold text-frost-white mb-4">
                4. Registration and Account
              </h2>
              <p className="text-silver leading-relaxed">
                To activate the Software, you must provide accurate registration
                information. You are responsible for maintaining the
                confidentiality of your account credentials and License Key. You
                agree to notify us immediately of any unauthorized use of your
                account.
              </p>
            </section>

            {/* Section 5 */}
            <section>
              <h2 className="text-2xl font-semibold text-frost-white mb-4">
                5. Fees and Payment
              </h2>
              <p className="text-silver leading-relaxed mb-4">
                Subscription fees are billed in advance on a monthly or annual
                basis. All fees are non-refundable except as expressly provided
                in our{" "}
                <a
                  href="/refunds"
                  className="text-cerulean-mist hover:underline"
                >
                  refund policy
                </a>{" "}
                (30-day money-back guarantee for first-time subscribers).
              </p>
              <p className="text-silver leading-relaxed">
                We reserve the right to change pricing with 30 days&apos;
                notice. Price changes will not affect your current billing
                cycle.
              </p>
            </section>

            {/* Section 6 */}
            <section>
              <h2 className="text-2xl font-semibold text-frost-white mb-4">
                6. Intellectual Property
              </h2>
              <p className="text-silver leading-relaxed">
                The Software, including all intellectual property rights
                therein, is and shall remain our exclusive property. These Terms
                do not grant you any rights to our trademarks, service marks, or
                logos. Any feedback you provide may be used by us without
                restriction or compensation.
              </p>
            </section>

            {/* Section 7 */}
            <section>
              <h2 className="text-2xl font-semibold text-frost-white mb-4">
                7. AI-Generated Outputs
              </h2>
              <p className="text-silver leading-relaxed mb-4">
                The Software provides editing tools for AI coding agents. You
                acknowledge that:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-silver">
                <li>
                  We do not control the AI models or their outputs—Mouse only
                  provides the editing tools
                </li>
                <li>
                  You are solely responsible for reviewing and validating all
                  code changes
                </li>
                <li>
                  We make no warranties regarding the correctness, safety, or
                  fitness of AI-generated code
                </li>
                <li>
                  You assume all risk associated with using AI-assisted code
                  editing
                </li>
              </ul>
            </section>

            {/* Section 8 */}
            <section>
              <h2 className="text-2xl font-semibold text-frost-white mb-4">
                8. Data and Privacy
              </h2>
              <p className="text-silver leading-relaxed">
                Our collection and use of personal information is governed by
                our{" "}
                <a
                  href="/privacy"
                  className="text-cerulean-mist hover:underline"
                >
                  Privacy Policy
                </a>
                . The Software operates locally on your device and does not
                transmit your source code, file contents, or AI
                prompts/responses to our servers.
              </p>
            </section>

            {/* Section 9 */}
            <section>
              <h2 className="text-2xl font-semibold text-frost-white mb-4">
                9. Warranty Disclaimer
              </h2>
              <p className="text-silver leading-relaxed uppercase text-sm">
                THE SOFTWARE IS PROVIDED &quot;AS IS&quot; AND &quot;AS
                AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR
                IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF
                MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
                NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SOFTWARE WILL BE
                UNINTERRUPTED, ERROR-FREE, OR COMPLETELY SECURE.
              </p>
            </section>

            {/* Section 10 */}
            <section>
              <h2 className="text-2xl font-semibold text-frost-white mb-4">
                10. Limitation of Liability
              </h2>
              <p className="text-frost-white leading-relaxed uppercase text-base font-bold">
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL WE BE
                LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
                PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, USE, OR
                GOODWILL, ARISING OUT OF OR RELATED TO THESE TERMS OR THE
                SOFTWARE. OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNTS PAID
                BY YOU IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.
              </p>
            </section>

            {/* Section 11 */}
            <section>
              <h2 className="text-2xl font-semibold text-frost-white mb-4">
                11. Indemnification
              </h2>
              <p className="text-frost-white leading-relaxed text-base font-bold">
                You agree to indemnify, defend, and hold harmless the Company
                and its officers, directors, employees, and agents from any
                claims, damages, losses, or expenses arising out of your use of
                the Software or violation of these Terms.
              </p>
            </section>

            {/* Section 12 */}
            <section>
              <h2 className="text-2xl font-semibold text-frost-white mb-4">
                12. Term and Termination
              </h2>
              <p className="text-silver leading-relaxed mb-4">
                These Terms remain in effect until the expiration of the
                subscription term or earlier cancellation or termination. We
                may suspend or terminate your access to the Software if, in
                our sole but reasonable discretion, we determine that:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-silver mb-4">
                <li>
                  You have failed to pay the subscription fees when due,
                  notwithstanding any grace period we may provide within our
                  sole discretion to become current on payment;
                </li>
                <li>
                  You have materially breached these Terms or any applicable
                  law or regulation;
                </li>
                <li>
                  Your use of the Software poses a security risk or may cause
                  harm to the Company, other users, or third parties;
                </li>
                <li>
                  Your use of the Software may expose the Company to legal
                  liability;
                </li>
                <li>
                  You are using the Software to facilitate or further any
                  unlawful activity; or
                </li>
                <li>
                  You engage in conduct that is abusive, threatening, or
                  harassing toward Company personnel or representatives.
                </li>
              </ul>
              <p className="text-silver leading-relaxed mb-4">
                Where practicable, we will provide you with reasonable notice
                and an opportunity to cure any curable breach before
                termination. However, we reserve the right to suspend access
                immediately and without prior notice where we reasonably
                believe immediate action is necessary to protect the Company,
                its users, or third parties.
              </p>
              <p className="text-silver leading-relaxed mb-4">
                All notices, complaints, claims, and disputes
                (&quot;Notices&quot;) shall be made in writing and transmitted
                by email, and both parties agree that email service of any
                Notice shall be sufficient if made upon the other
                party&apos;s valid email address. Each User is identified by
                the unique email address provided by that User during the
                registration process or invited by a multi-seat Business
                license owner or admin user. You must maintain that email
                address at all times during the term of the license and may
                not change your user email address, which uniquely identifies
                your subscription. You agree to contact us immediately if you
                are no longer able to utilize that email address for any
                reason, by writing to:{" "}
                <a
                  href="mailto:billing@hic-ai.com"
                  className="text-cerulean-mist hover:underline"
                >
                  billing@hic-ai.com
                </a>
                . Service of any Notice shall be deemed effective upon
                transmission if sent by you to:{" "}
                <a
                  href="mailto:legal@hic-ai.com"
                  className="text-cerulean-mist hover:underline"
                >
                  legal@hic-ai.com
                </a>
                , and if sent by the Company, to the Customer&apos;s or
                User&apos;s email address, as applicable. In case of a
                Business license, service upon the Owner (primary billing)
                account shall be deemed sufficient to effectuate service upon
                the account, and the Company shall not be obligated to
                transmit additional copies of the Notice to other members of
                your team.
              </p>
              <p className="text-silver leading-relaxed mb-4">
                If we terminate your subscription for cause during a prepaid
                annual term, no refund will be issued for the remaining portion
                of the term.
              </p>
              <p className="text-silver leading-relaxed mb-4">
                Upon termination, your license to use the Software ceases
                immediately. Sections 6, 9, 10, 11, and 14 shall survive
                termination.
              </p>
              <p className="text-silver leading-relaxed">
                You are always entitled to cancel your subscription at any
                time. If you are a first-time subscriber, you may be entitled
                to a refund if your request is made within 30 days of your
                first purchase. Please see our{" "}
                <a
                  href="/refunds"
                  className="text-cerulean-mist hover:underline"
                >
                  Refund and Cancellation Policy
                </a>{" "}
                for more details.
              </p>
            </section>

            {/* Section 13 */}
            <section>
              <h2 className="text-2xl font-semibold text-frost-white mb-4">
                13. Dispute Resolution
              </h2>
              <p className="text-silver leading-relaxed mb-4">
                Any dispute arising from these Terms shall be resolved through
                binding arbitration administered by the American Arbitration
                Association in accordance with its Commercial Arbitration Rules.
                The arbitration shall be conducted in Fairfield County,
                Connecticut.
              </p>
              <p className="text-silver leading-relaxed">
                TO THE GREATEST EXTENT PERMITTED UNDER APPLICABLE LAW, YOU
                HEREBY WAIVE ANY RIGHT TO PARTICIPATE IN A CLASS ACTION LAWSUIT
                OR CLASS WIDE ARBITRATION.
              </p>
            </section>

            {/* Section 14 */}
            <section>
              <h2 className="text-2xl font-semibold text-frost-white mb-4">
                14. General Provisions
              </h2>
              <p className="text-silver leading-relaxed mb-4">
                <strong className="text-frost-white">Governing Law:</strong>{" "}
                These Terms are governed by the laws of the State of Delaware,
                without regard to conflict of law principles.
              </p>
              <p className="text-silver leading-relaxed mb-4">
                <strong className="text-frost-white">Entire Agreement:</strong>{" "}
                These Terms constitute the entire agreement between you and the
                Company regarding the Software.
              </p>
              <p className="text-silver leading-relaxed mb-4">
                <strong className="text-frost-white">Severability:</strong> If
                any provision is found unenforceable, the remaining provisions
                shall continue in effect.
              </p>
              <p className="text-silver leading-relaxed">
                <strong className="text-frost-white">Modifications:</strong> We
                may modify these Terms at any time by posting the revised terms.
                Your continued use constitutes acceptance of the modified Terms.
              </p>
            </section>

            {/* Contact */}
            <section>
              <h2 className="text-2xl font-semibold text-frost-white mb-4">
                Contact Us
              </h2>
              <p className="text-silver leading-relaxed">
                If you have questions about these Terms, please contact us at:
              </p>
              <address className="text-silver mt-4 not-italic">
                HIC AI Inc.
                <br />
                Email:{" "}
                <a
                  href="mailto:legal@hic-ai.com"
                  className="text-cerulean-mist hover:underline"
                >
                  legal@hic-ai.com
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
