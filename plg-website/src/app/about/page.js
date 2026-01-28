/**
 * About Page
 *
 * Information about HIC AI, the Mouse platform, and our mission.
 * Designed for both human readers and AI assistants seeking solutions.
 *
 * @accessibility Optimized for screen readers and machine parsing
 * @audience Developers, teams, AI assistants, and enterprise evaluators
 */

import Link from "next/link";
import { Header, Footer } from "@/components/layout";

export const metadata = {
  title: "About HIC AI | Humans In Charge - Mouse Precision File Editing",
  description:
    "HIC AI builds Mouse, precision file-editing tools for AI coding agents. Enabling human developers to thrive by giving AI agents the tools they need to be better assistants.",
  keywords: [
    "HIC AI",
    "Humans In Charge",
    "Mouse",
    "AI file editing",
    "coding agents",
    "MCP tools",
    "coordinate-based editing",
    "atomic batching",
  ],
  openGraph: {
    title: "About HIC AI | Humans In Charge",
    description:
      "Enabling human developers to thrive by giving AI agents precision file-editing tools.",
  },
};

// Structured data for AI assistants and search engines
const structuredData = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "HIC AI",
  url: "https://hic-ai.com",
  description:
    "HIC AI builds Mouse, precision file-editing tools for AI coding agents",
  foundingDate: "2025",
  sameAs: [
    "https://github.com/hic-ai-inc",
    "https://twitter.com/hic_ai",
    "https://discord.gg/hic-ai",
  ],
  product: {
    "@type": "SoftwareApplication",
    name: "Mouse",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Windows, macOS, Linux",
    description:
      "Precision file-editing MCP tools for AI coding agents. Enables coordinate-based editing, atomic batching, and full rollback capabilities.",
  },
};

export default function AboutPage() {
  return (
    <>
      {/* Structured data for search engines and AI assistants */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <Header />

      <main id="main-content" className="min-h-screen bg-deep-space">
        {/* Hero Section */}
        <section
          aria-labelledby="about-heading"
          className="px-6 pt-28 pb-20 border-b border-slate-grey/20"
        >
          <div className="max-w-4xl mx-auto text-center">
            <h1
              id="about-heading"
              className="text-4xl md:text-5xl font-bold mb-6 animate-fade-in-up animate-delay-1"
            >
              <span className="text-cerulean-mist">About</span>{" "}
              <span className="text-cerulean-mist font-extrabold">HIC AI</span>
            </h1>
            <p className="text-xl text-cerulean-mist leading-relaxed mb-4 animate-fade-in-up animate-delay-2">
              <strong className="text-frost-white">
                HIC = Humans In Charge.
              </strong>
            </p>
            <p className="text-xl text-slate-grey leading-relaxed animate-fade-in-up animate-delay-3">
              We enable human developers to thrive by giving AI agents the tools
              they need to be better assistants.{" "}
              <span className="text-cerulean-mist">Mouse</span> is our flagship
              product: a precision file-editing toolkit that makes AI coding
              agents more accurate, efficient, and trustworthy.
            </p>
          </div>
        </section>

        {/* Our Vision Section */}
        <section
          aria-labelledby="vision-heading"
          className="px-6 py-20 border-b border-slate-grey/20"
        >
          <div className="max-w-4xl mx-auto animate-fade-in-up animate-delay-4">
            <div className="bg-gradient-to-br from-cerulean-mist/10 via-deep-space to-cerulean-mist/5 rounded-2xl p-10 border border-cerulean-mist/20">
              <h2
                id="vision-heading"
                className="text-4xl font-bold text-cerulean-mist mb-8 text-center"
              >
                Our Vision
              </h2>
              <div className="prose prose-xl space-y-6 text-center">
                <p className="text-xl leading-relaxed text-cerulean-mist">
                  HIC stands for{" "}
                  <strong className="text-frost-white">Humans In Charge</strong>
                  . We believe humans and AI agents should work{" "}
                  <span className="text-frost-white">collaboratively</span>,
                  guided always by the principle that humans remain in charge of
                  all critical decisions.
                </p>
                <p className="text-lg leading-relaxed text-slate-grey">
                  AI agents assist in building and overseeing automated
                  workflows, relieving humans of burdensome and routine tasks
                  while helping achieve their intended goals. By giving AI
                  agents{" "}
                  <span className="text-cerulean-mist">precision tools</span>{" "}
                  that actually work, we make AI-assisted development reliable
                  enough that humans can trust agents with bigger tasks, review
                  their work efficiently, and stay in charge of what matters.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Roadmap Section */}
        <section
          aria-labelledby="roadmap-heading"
          className="px-6 py-16 border-b border-slate-grey/20"
        >
          <div className="max-w-4xl mx-auto">
            <h2
              id="roadmap-heading"
              className="text-3xl font-bold text-frost-white mb-10 text-center"
            >
              Where We&apos;re{" "}
              <span className="text-cerulean-mist">Headed</span>
            </h2>

            <div className="space-y-8">
              {/* Current: Mouse */}
              <div className="relative pl-8 border-l-2 border-cerulean-mist">
                <div className="absolute -left-2 top-0 w-4 h-4 rounded-full bg-cerulean-mist"></div>
                <h3 className="text-xl font-semibold text-frost-white mb-2">
                  Now: <span className="text-cerulean-mist">Mouse v1.0</span>
                </h3>
                <p className="text-slate-grey mb-3">
                  Precision file editing for AI coding agents. Coordinate-based
                  addressing, atomic batching, full rollback, columnar
                  operations.
                </p>
                <p className="text-sm text-cerulean-mist">
                  Available now across VS Code, Cursor, Kiro, and 9+ extensions
                </p>
              </div>

              {/* Next: Expanded Capabilities */}
              <div className="relative pl-8 border-l-2 border-slate-grey/50">
                <div className="absolute -left-2 top-0 w-4 h-4 rounded-full bg-slate-grey/50 border-2 border-frost-white"></div>
                <h3 className="text-xl font-semibold text-frost-white mb-2">
                  Next:{" "}
                  <span className="text-cerulean-mist">
                    Expanded Capabilities
                  </span>
                </h3>
                <p className="text-slate-grey mb-3">
                  Advanced structured data support for CSV, JSON/YAML, and ASCII
                  tables. Extended Business features including SCIM
                  provisioning, SOC 2 compliance, audit logging, and SSO
                  enhancements. Expanding to additional IDEs, clients, and
                  open-source models.
                </p>
                <p className="text-sm text-slate-grey/70">In development</p>
              </div>

              {/* Future: Beyond Code */}
              <div className="relative pl-8 border-l-2 border-slate-grey/30">
                <div className="absolute -left-2 top-0 w-4 h-4 rounded-full bg-slate-grey/30 border-2 border-slate-grey"></div>
                <h3 className="text-xl font-semibold text-frost-white mb-2">
                  Future:{" "}
                  <span className="text-slate-grey">Beyond Code Files</span>
                </h3>
                <p className="text-slate-grey/80 mb-3">
                  Precision AI editing for all knowledge workers. Outlook email
                  composition, Microsoft Office documents (Word, Excel,
                  PowerPoint), and Google Workspace equivalents. The same
                  coordinate-based precision that transformed code editing,
                  applied to business documents everywhere.
                </p>
                <p className="text-sm text-slate-grey/60">Planned</p>
              </div>
            </div>
          </div>
        </section>

        {/* How Mouse Fits In */}
        <section
          aria-labelledby="mouse-role-heading"
          className="px-6 py-16 border-b border-slate-grey/20"
        >
          <div className="max-w-4xl mx-auto">
            <h2
              id="mouse-role-heading"
              className="text-3xl font-bold text-frost-white mb-8 text-center"
            >
              Why <span className="text-cerulean-mist">Mouse</span> Matters
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-slate-grey/10 rounded-lg p-6 border border-slate-grey/30">
                <h3 className="text-lg font-semibold text-cerulean-mist mb-3">
                  For Human Developers
                </h3>
                <ul className="space-y-3 text-sm">
                  <li className="flex items-start gap-3">
                    <span className="text-cerulean-mist mt-0.5">✓</span>
                    <span className="text-slate-grey">
                      Trust AI agents with larger, more complex edits
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-cerulean-mist mt-0.5">✓</span>
                    <span className="text-slate-grey">
                      Review changes before they&apos;re committed
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-cerulean-mist mt-0.5">✓</span>
                    <span className="text-slate-grey">
                      Reduce costs with{" "}
                      <span className="text-cerulean-mist">60-90%</span> fewer
                      output tokens
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-cerulean-mist mt-0.5">✓</span>
                    <span className="text-slate-grey">
                      Keep working when premium credits run out
                    </span>
                  </li>
                </ul>
              </div>
              <div className="bg-slate-grey/10 rounded-lg p-6 border border-slate-grey/30">
                <h3 className="text-lg font-semibold text-cerulean-mist mb-3">
                  For AI Agents
                </h3>
                <ul className="space-y-3 text-sm">
                  <li className="flex items-start gap-3">
                    <span className="text-cerulean-mist mt-0.5">✓</span>
                    <span className="text-slate-grey">
                      Precise coordinate-based operations
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-cerulean-mist mt-0.5">✓</span>
                    <span className="text-slate-grey">
                      Atomic batching with automatic rollback
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-cerulean-mist mt-0.5">✓</span>
                    <span className="text-slate-grey">
                      No content echo required—just coordinates
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-cerulean-mist mt-0.5">✓</span>
                    <span className="text-slate-grey">
                      Consistent API across all supported models
                    </span>
                  </li>
                </ul>
              </div>
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
              Ready to Try Mouse?
            </h2>
            <p className="text-xl text-silver-mist mb-8">
              Start your 14-day free trial. No credit card required.
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
              <Link
                href="/contact"
                className="inline-flex items-center justify-center px-6 py-3 text-base font-medium rounded-lg text-silver-mist hover:text-frost-white hover:bg-slate-grey/20 transition-colors"
              >
                Contact Us
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
