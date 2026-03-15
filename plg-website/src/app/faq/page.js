/**
 * FAQ Page
 *
 * Frequently Asked Questions about Mouse.
 * Consolidated from pricing and other sources.
 */

import { Header, Footer } from "@/components/layout";
import { Badge } from "@/components/ui";

export const metadata = {
  title: "FAQ - Mouse by HIC AI",
  description:
    "Frequently asked questions about Mouse precision editing tools for AI coding agents.",
};

const faqCategories = [
  {
    name: "General",
    icon: "💡",
    faqs: [
      {
        question: "What is Mouse?",
        answer:
          "Mouse is a precision file-editing toolkit for AI coding agents. It provides coordinate-based editing, atomic batching, and full rollback capabilities that eliminate Execution Slop—when an agent makes the right plan, calls the right tool, but still produces the wrong output.",
      },
      {
        question: "What is Execution Slop?",
        answer:
          "Execution Slop is when an AI coding agent understands the task, selects the correct editing operation, but the edit still fails—wrong line, mangled syntax, corrupted file. It's the gap between intent and outcome. Mouse's precision tools close this gap.",
      },
      {
        question: "How is Mouse different from an AI coding agent's built-in file-editing tools?",
        answerJsx: (
          <p className="text-silver leading-relaxed">
            Mouse is the only tool that offers coordinate-based addressing (edit
            by line/column without echoing content), zero content-echo (70%
            fewer tokens), atomic batching (all-or-nothing operations), and
            in-place refinement (adjust staged edits without starting over). See
            our{" "}
            <a href="/features" className="text-cerulean-mist hover:underline">
              Features page
            </a>{" "}
            for a full comparison.
          </p>
        ),
      },
      {
        question: "Does Mouse work with my coding assistant?",
        answerJsx: (
          <p className="text-silver leading-relaxed">
            Mouse is compatible with a range of integrated development
            environments, AI coding clients, and models via the Model Context
            Protocol (MCP), including GitHub Copilot, Cursor, Claude Code, and
            more. Please see our{" "}
            <a
              href="/features#compatibility-heading"
              className="text-cerulean-mist hover:underline"
            >
              Features page
            </a>{" "}
            for a complete compatibility summary.
          </p>
        ),
      },
    ],
  },
  {
    name: "Installation & Setup",
    icon: "🔧",
    faqs: [
      {
        question: "How do I install Mouse?",
        answerJsx: (
          <p className="text-silver leading-relaxed">
            To install Mouse, navigate to the VS Code Marketplace or Open VSX
            inside your IDE, search for &ldquo;Mouse&rdquo; by HIC AI, Inc.,
            and click &ldquo;Install&rdquo;. Then, open the Command Palette
            (Ctrl-Shift-P on a PC), enter &ldquo;Mouse: Initialize
            Workspace&rdquo;, and select your coding assistant from the dropdown
            menu. Click on the popup button to refresh your Developer Window,
            and Mouse will be automatically added to your MCP config file (or
            one will be generated automatically for you if you don&apos;t have
            one already), and your agent is all set to begin using Mouse for
            precision file navigation and editing! Please see our{" "}
            <a href="/docs" className="text-cerulean-mist hover:underline">
              /docs page
            </a>{" "}
            for full details.
          </p>
        ),
      },
      {
        question: "What IDEs does Mouse support?",
        answer:
          "Mouse currently supports VS Code, Cursor, and Kiro. The installation and setup process is identical across all of them.",
      },
      {
        question: "Does Mouse work offline?",
        answer:
          "Yes! Mouse operates entirely locally on your device. It only needs internet connectivity for initial license activation and periodic validation.",
      },
      {
        question: "What are the system requirements?",
        answer:
          "Mouse requires a supported IDE along with Node.js 20+. The extension uses approximately 1.3MB of disk space. There are no special hardware requirements.",
      },
    ],
  },
  {
    name: "Pricing & Billing",
    icon: "💳",
    faqs: [
      {
        question: "How much does Mouse cost?",
        answer:
          "Individual: $15/month ($150/year, save $30). Business: $35/seat/month ($350/seat/year). Both plans include a 14-day free trial. All prices exclude applicable taxes.",
      },
      {
        question: "Is there a free trial?",
        answer:
          "Yes! Individual plans include a 14-day free trial with no credit card required. You get full access to all features during the trial.",
      },
      {
        question: "Can I use Mouse for commercial projects?",
        answer:
          "Yes! Both Individual and Business plans permit commercial use, subject to our Terms of Service.",
      },
      {
        question: "What counts as a device?",
        answerJsx: (
          <>
            <p className="text-silver leading-relaxed">
              Each VS Code installation on a unique machine or container counts
              as one device. Individual plans allow 3 concurrent devices;
              Business plans allow 5 concurrent devices per seat. You can
              deactivate old devices anytime from your portal to free up slots.
            </p>
            <p className="text-silver leading-relaxed mt-3">
              <strong className="text-frost-white">Example:</strong> You
              maintain two repositories on your local laptop at{" "}
              <code className="text-cerulean-mist">~/source/repos/my-repo-1</code>{" "}
              and{" "}
              <code className="text-cerulean-mist">~/source/repos/my-repo-2</code>,
              and you initialize Mouse in both workspaces in VS Code. This
              counts as one device.
            </p>
            <p className="text-silver leading-relaxed mt-3">
              <strong className="text-frost-white">Example:</strong> While
              working on{" "}
              <code className="text-cerulean-mist">~/source/repos/my-repo-1</code>{" "}
              inside VS Code, you decide to spin up a GitHub Codespaces
              container and work in the browser on{" "}
              <code className="text-cerulean-mist">~/source/repos/my-repo-2</code>{" "}
              at the same time. This will count as two devices.
            </p>
          </>
        ),
      },
      {
        question: "Can I switch plans?",
        answerJsx: (
          <p className="text-silver leading-relaxed">
            Unfortunately, we are unable to permit Individual subscriptions to
            convert to Business or vice versa at this time through our
            self-checkout process. If you would like to upgrade from Individual
            to Business or downgrade from Business to Individual, please contact{" "}
            <a
              href="mailto:billing@hic-ai.com"
              className="text-cerulean-mist hover:underline"
            >
              billing@hic-ai.com
            </a>{" "}
            for assistance. You can always switch at any time from monthly to
            annual payment schedules (or vice versa), update your payment
            information, and (for Business subscriptions) add or remove seats.
          </p>
        ),
      },
      {
        question: "Do you offer refunds?",
        answerJsx: (
          <p className="text-silver leading-relaxed">
            Yes. If you&apos;re not satisfied within the first 30 days of your
            initial purchase, contact us at{" "}
            <a
              href="mailto:billing@hic-ai.com"
              className="text-cerulean-mist hover:underline"
            >
              billing@hic-ai.com
            </a>
            {" "}for a full refund. No questions asked. See our{" "}
            <a href="/refunds" className="text-cerulean-mist hover:underline">
              Refund &amp; Cancellation Policy
            </a>
            {" "}for full details.
          </p>
        ),
      },
      {
        question: "What payment methods do you accept?",
        answer:
          "We accept all major credit cards, as well as numerous local payment methods depending on your region. Payments are processed securely by our payment vendor, Stripe, and handled by our merchant of record, Stripe Managed Payments.",
      },
      {
        question: "How will charges appear on my card statements?",
        answer: "Charges for your Mouse subscription will appear as: HIC AI INC.",
      },
      {
        question: "Are there volume discounts?",
        answerJsx: (
          <p className="text-silver leading-relaxed">
            Yes, we provide volume discounts for 100 or more licenses. Please
            contact sales at{" "}
            <a
              href="mailto:sales@hic-ai.com"
              className="text-cerulean-mist hover:underline"
            >
              sales@hic-ai.com
            </a>
            {" "}for more information.
          </p>
        ),
      },
    ],
  },
  {
    name: "Privacy & Security",
    icon: "🔒",
    faqs: [
      {
        question: "Does Mouse send my code to your servers?",
        answer:
          "No. Mouse operates exclusively locally on your device. We do not collect, transmit, or store your source code, file contents, AI prompts, AI responses, or keystrokes.",
        answerJsx: (
          <p className="text-silver leading-relaxed">
            No. Mouse operates exclusively locally on your device. We do not
            collect, transmit, or store your source code, file contents, AI
            prompts, AI responses, or keystrokes. See our{" "}
            <a href="/privacy" className="text-cerulean-mist hover:underline">
              Privacy Policy
            </a>
            {" "}for details.
          </p>
        ),
      },
      {
        question: "What data does Mouse collect?",
        answer:
          "We collect only: account/payment information, license validation requests, and device identifiers (for activation limits). We never see your code or AI conversations.",
      },
      {
        question: "Is Mouse SOC 2 compliant?",
        answer:
          "We are currently pursuing SOC 2 Type II certification. Enterprise customers can request our security documentation and complete a security questionnaire. Contact enterprise@hic-ai.com.",
      },

    ],
  },
  {
    name: "Technical",
    icon: "⚙️",
    faqs: [
      {
        question: "What tools does Mouse provide?",
        answer:
          "Mouse provides 10 tools: 6 file reading tools (read_first_n_lines, read_last_n_lines, read_lines, jump_to_line_n, find_in_file, get_file_metadata), 2 editing tools (quick_edit, batch_quick_edit), and 2 staging tools (save_changes, cancel_changes).",
      },
      {
        question: "What editing operations are supported?",
        answer:
          "Mouse supports INSERT (add lines), REPLACE (find/replace), DELETE (remove lines), REPLACE_RANGE (character-level), FOR_LINES (columnar editing), and ADJUST (relocate content). All operations can be batched atomically.",
      },
      {
        question: "What is atomic batching?",
        answer:
          "Atomic batching groups multiple edits into a single operation. Either all changes succeed or none do—if any edit fails, Mouse automatically rolls back all changes. Your codebase is never left in a broken intermediate state.",
      },
      {
        question: "What is coordinate-based addressing?",
        answer:
          "Instead of matching text patterns (which can fail or match wrong locations), Mouse edits by exact line and column numbers. This eliminates ambiguity and the need to echo file content back in tool calls.",
      },
      {
        question: "What is in-place refinement?",
        answer:
          "When an agent catches its own mistake in staged edits, it can adjust pending changes without starting over. This enables self-correction without human intervention—a capability unique to Mouse.",
      },
    ],
  },
  {
    name: "Support",
    icon: "🤝",
    faqs: [
      {
        question: "How do I get help?",
        answer:
          "Individual plan: Community support via GitHub Issues. Enterprise plan: Priority email support at support@hic-ai.com with 24-hour response time.",
      },
      {
        question: "Where can I report bugs?",
        answer:
          "Please report bugs on our GitHub Issues page. Include your VS Code version, Mouse version, and steps to reproduce the issue.",
      },
      {
        question: "Is there documentation?",
        answer:
          "Yes! Visit our Docs page for installation guides, tool reference, best practices, and troubleshooting guides.",
      },
      {
        question: "Can I request features?",
        answer:
          "Absolutely! Submit feature requests on GitHub Issues. We prioritize based on community feedback and alignment with our roadmap.",
      },
    ],
  },
];

export default function FAQPage() {
  return (
    <>
      <Header />
      <main id="main-content" className="pt-16 min-h-screen bg-midnight-navy">
        {/* Hero */}
        <section className="py-24 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-midnight-navy via-midnight-navy to-midnight-navy/95" />
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-cerulean-mist/10 blur-[100px] rounded-full" />

          <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-frost-white mb-6">
              Frequently Asked Questions
            </h1>
            <p className="text-xl text-silver max-w-2xl mx-auto">
              Everything you need to know about Mouse. Can&apos;t find your
              answer? Contact us at{" "}
              <a
                href="mailto:support@hic-ai.com"
                className="text-cerulean-mist hover:underline"
              >
                support@hic-ai.com
              </a>
            </p>
          </div>
        </section>

        {/* FAQ Categories */}
        <section className="py-16 px-6">
          <div className="max-w-4xl mx-auto space-y-16">
            {faqCategories.map((category) => (
              <div key={category.name}>
                <h2 className="text-2xl font-bold text-frost-white mb-8 flex items-center gap-3">
                  <span>{category.icon}</span>
                  {category.name}
                </h2>
                <div className="space-y-4">
                  {category.faqs.map((faq) => (
                    <details
                      key={faq.question}
                      className="group card cursor-pointer"
                    >
                      <summary className="flex items-center justify-between text-frost-white font-medium list-none">
                        {faq.question}
                        <span className="text-cerulean-mist group-open:rotate-180 transition-transform">
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 9l-7 7-7-7"
                            />
                          </svg>
                        </span>
                      </summary>
                      <div className="mt-4 overflow-hidden transition-all duration-300 ease-in-out">
                        {faq.answerJsx ?? (
                          <p className="text-silver leading-relaxed">
                            {faq.answer}
                          </p>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Still have questions */}
        <section className="py-24 bg-card-bg/30 border-t border-card-border">
          <div className="max-w-3xl mx-auto px-6 text-center">
            <h2 className="text-3xl font-bold text-frost-white mb-4">
              Still Have Questions?
            </h2>
            <p className="text-lg text-silver mb-8">
              We&apos;re here to help. Reach out and we&apos;ll get back to you
              as soon as possible.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="mailto:support@hic-ai.com"
                className="btn btn-primary px-8 py-3"
              >
                Contact Support
              </a>
              <a
                href="https://github.com/hic-ai/mouse/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary px-8 py-3"
              >
                GitHub Issues
              </a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
