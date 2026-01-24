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
            Last updated: January 23, 2026
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
                in our refund policy (30-day money-back guarantee for first-time
                subscribers).
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
              <p className="text-silver leading-relaxed uppercase text-sm">
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
              <p className="text-silver leading-relaxed">
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
                These Terms remain in effect until terminated. We may terminate
                or suspend your access immediately, without prior notice, for
                any reason, including breach of these Terms.
              </p>
              <p className="text-silver leading-relaxed">
                Upon termination, your license to use the Software ceases
                immediately. Sections 6, 9, 10, 11, and 14 shall survive
                termination.
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
                YOU AGREE TO WAIVE ANY RIGHT TO PARTICIPATE IN A CLASS ACTION
                LAWSUIT OR CLASS-WIDE ARBITRATION.
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
