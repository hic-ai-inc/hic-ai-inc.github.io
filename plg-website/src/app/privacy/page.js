/**
 * Privacy Policy Page
 *
 * Privacy practices for Mouse software.
 * Last updated: January 2026
 */

import { Header, Footer } from "@/components/layout";

export const metadata = {
  title: "Privacy Policy - Mouse by HIC AI",
  description: "Privacy Policy for Mouse precision editing tools.",
};

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <main className="pt-16 min-h-screen bg-midnight-navy">
        <article className="max-w-4xl mx-auto px-6 py-16">
          <h1 className="text-4xl font-bold text-frost-white mb-2">
            Privacy Policy
          </h1>
          <p className="text-slate-grey mb-12">
            Last updated: January 23, 2026
          </p>

          <div className="prose prose-invert prose-slate max-w-none space-y-8">
            {/* Introduction */}
            <section>
              <p className="text-silver leading-relaxed">
                HIC AI Inc. (&quot;Company,&quot; &quot;we,&quot;
                &quot;us,&quot; or &quot;our&quot;) is committed to protecting
                your privacy. This Privacy Policy explains how we collect, use,
                disclose, and safeguard your information when you use Mouse
                software (the &quot;Software&quot;).
              </p>
              <div className="mt-4 p-4 bg-success/10 border border-success/30 rounded-lg">
                <p className="text-success font-medium mb-2">
                  🔒 Privacy by Design
                </p>
                <p className="text-silver text-sm">
                  Mouse operates <strong>exclusively locally</strong> on your
                  device. We do not collect, transmit, or store your source
                  code, file contents, AI prompts, AI responses, or keystrokes.
                </p>
              </div>
            </section>

            {/* Section 1 */}
            <section>
              <h2 className="text-2xl font-semibold text-frost-white mb-4">
                1. Information We Collect
              </h2>

              <h3 className="text-lg font-medium text-frost-white mb-2">
                Information You Provide
              </h3>
              <ul className="list-disc pl-6 space-y-2 text-silver mb-4">
                <li>Account registration information (email address, name)</li>
                <li>
                  Payment information (processed by Stripe—we do not store card
                  details)
                </li>
                <li>Support inquiries and communications</li>
              </ul>

              <h3 className="text-lg font-medium text-frost-white mb-2">
                Automatically Collected Information
              </h3>
              <ul className="list-disc pl-6 space-y-2 text-silver mb-4">
                <li>License activation and validation requests</li>
                <li>Device identifiers (for device limit enforcement)</li>
                <li>Extension version and VS Code version</li>
                <li>Error logs (crash reports, if you opt in)</li>
              </ul>

              <h3 className="text-lg font-medium text-frost-white mb-2">
                Information We Do NOT Collect
              </h3>
              <ul className="list-disc pl-6 space-y-2 text-silver">
                <li>Your source code or file contents</li>
                <li>AI prompts or conversations</li>
                <li>AI-generated outputs or code suggestions</li>
                <li>Keystrokes or clipboard contents</li>
                <li>File paths or project structure</li>
              </ul>
            </section>

            {/* Section 2 */}
            <section>
              <h2 className="text-2xl font-semibold text-frost-white mb-4">
                2. How We Use Your Information
              </h2>
              <p className="text-silver leading-relaxed mb-4">
                We use the information we collect to:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-silver">
                <li>Provide and maintain the Software</li>
                <li>Process transactions and send related information</li>
                <li>Validate licenses and enforce device limits</li>
                <li>
                  Send administrative communications (receipts, license
                  expiration notices)
                </li>
                <li>Respond to support requests</li>
                <li>Improve and optimize the Software</li>
                <li>Detect and prevent fraud or abuse</li>
              </ul>
            </section>

            {/* Section 3 */}
            <section>
              <h2 className="text-2xl font-semibold text-frost-white mb-4">
                3. How We Share Your Information
              </h2>
              <p className="text-silver leading-relaxed mb-4">
                We do not sell your personal information. We may share
                information with:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-silver">
                <li>
                  <strong className="text-frost-white">
                    Service Providers:
                  </strong>{" "}
                  Third parties that help us operate our business (Stripe for
                  payments, AWS for infrastructure)
                </li>
                <li>
                  <strong className="text-frost-white">
                    Legal Requirements:
                  </strong>{" "}
                  When required by law or to protect our rights
                </li>
                <li>
                  <strong className="text-frost-white">
                    Business Transfers:
                  </strong>{" "}
                  In connection with a merger, acquisition, or sale of assets
                </li>
              </ul>
            </section>

            {/* Section 4 */}
            <section>
              <h2 className="text-2xl font-semibold text-frost-white mb-4">
                4. Data Retention
              </h2>
              <p className="text-silver leading-relaxed">
                We retain your personal information for as long as your account
                is active or as needed to provide services. We will retain and
                use your information as necessary to comply with legal
                obligations, resolve disputes, and enforce our agreements. You
                may request deletion of your account and associated data at any
                time.
              </p>
            </section>

            {/* Section 5 */}
            <section>
              <h2 className="text-2xl font-semibold text-frost-white mb-4">
                5. Data Security
              </h2>
              <p className="text-silver leading-relaxed">
                We implement appropriate technical and organizational measures
                to protect your information, including encryption in transit
                (TLS 1.3), encryption at rest (AES-256), and access controls.
                However, no method of transmission or storage is 100% secure,
                and we cannot guarantee absolute security.
              </p>
            </section>

            {/* Section 6 */}
            <section>
              <h2 className="text-2xl font-semibold text-frost-white mb-4">
                6. Your Rights and Choices
              </h2>
              <p className="text-silver leading-relaxed mb-4">
                Depending on your location, you may have the following rights:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-silver">
                <li>Access and receive a copy of your personal data</li>
                <li>Correct inaccurate personal data</li>
                <li>Request deletion of your personal data</li>
                <li>Object to or restrict processing of your data</li>
                <li>Data portability</li>
                <li>Withdraw consent (where processing is based on consent)</li>
              </ul>
              <p className="text-silver leading-relaxed mt-4">
                To exercise these rights, contact us at{" "}
                <a
                  href="mailto:privacy@hic-ai.com"
                  className="text-cerulean-mist hover:underline"
                >
                  privacy@hic-ai.com
                </a>
                .
              </p>
            </section>

            {/* Section 7 */}
            <section>
              <h2 className="text-2xl font-semibold text-frost-white mb-4">
                7. Telemetry
              </h2>
              <p className="text-silver leading-relaxed mb-4">
                <strong className="text-frost-white">
                  Mouse does not collect telemetry by default.
                </strong>{" "}
                The Software operates entirely locally on your device without
                transmitting usage data to our servers.
              </p>
              <p className="text-silver leading-relaxed mb-4">
                For Enterprise customers, we offer the ability to collect
                anonymized usage analytics through custom arrangements. Such
                telemetry collection requires explicit written consent and is
                configured on a case-by-case basis. Telemetry data may include
                tool usage frequency, operation timing, and error rates—but
                never source code, file contents, or AI conversations.
              </p>
              <p className="text-silver leading-relaxed">
                If your organization is interested in usage analytics for
                internal optimization or compliance purposes, please contact us
                at{" "}
                <a
                  href="mailto:enterprise@hic-ai.com"
                  className="text-cerulean-mist hover:underline"
                >
                  enterprise@hic-ai.com
                </a>{" "}
                to discuss options.
              </p>
            </section>

            {/* Section 8 */}
            <section>
              <h2 className="text-2xl font-semibold text-frost-white mb-4">
                8. International Data Transfers
              </h2>
              <p className="text-silver leading-relaxed">
                Your information may be transferred to and processed in the
                United States, where our servers are located. By using the
                Software, you consent to the transfer of your information to the
                United States, which may have different data protection laws
                than your country.
              </p>
            </section>

            {/* Section 9 */}
            <section>
              <h2 className="text-2xl font-semibold text-frost-white mb-4">
                9. Children&apos;s Privacy
              </h2>
              <p className="text-silver leading-relaxed">
                The Software is not intended for children under 13 years of age.
                We do not knowingly collect personal information from children
                under 13. If we learn we have collected such information, we
                will delete it promptly.
              </p>
            </section>

            {/* Section 10 */}
            <section>
              <h2 className="text-2xl font-semibold text-frost-white mb-4">
                10. California Privacy Rights (CCPA)
              </h2>
              <p className="text-silver leading-relaxed">
                California residents have the right to request disclosure of the
                categories and specific pieces of personal information we have
                collected, the categories of sources, the business purpose for
                collecting the information, and the categories of third parties
                with whom we share information. California residents also have
                the right to request deletion of their personal information and
                to opt out of the sale of their personal information (we do not
                sell personal information).
              </p>
            </section>

            {/* Section 11 */}
            <section>
              <h2 className="text-2xl font-semibold text-frost-white mb-4">
                11. European Privacy Rights (GDPR)
              </h2>
              <p className="text-silver leading-relaxed">
                If you are in the European Economic Area, you have rights under
                the General Data Protection Regulation, including the right to
                access, rectify, erase, restrict processing, data portability,
                and object to processing. Our legal basis for processing is
                performance of a contract (providing the Software) and
                legitimate interests (improving and securing the Software).
              </p>
            </section>

            {/* Section 12 */}
            <section>
              <h2 className="text-2xl font-semibold text-frost-white mb-4">
                12. Changes to This Policy
              </h2>
              <p className="text-silver leading-relaxed">
                We may update this Privacy Policy from time to time. We will
                notify you of any material changes by posting the new Privacy
                Policy on this page and updating the &quot;Last updated&quot;
                date. Your continued use of the Software after any changes
                constitutes acceptance of the updated policy.
              </p>
            </section>

            {/* Contact */}
            <section>
              <h2 className="text-2xl font-semibold text-frost-white mb-4">
                Contact Us
              </h2>
              <p className="text-silver leading-relaxed">
                If you have questions about this Privacy Policy or our privacy
                practices, please contact us at:
              </p>
              <address className="text-silver mt-4 not-italic">
                HIC AI Inc.
                <br />
                Privacy Officer
                <br />
                Email:{" "}
                <a
                  href="mailto:privacy@hic-ai.com"
                  className="text-cerulean-mist hover:underline"
                >
                  privacy@hic-ai.com
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
