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
        question: "How is Mouse different from other AI coding tools?",
        answer:
          "Mouse is the only tool that offers coordinate-based addressing (edit by line/column without echoing content), zero content-echo (70% fewer tokens), atomic batching (all-or-nothing operations), and in-place refinement (adjust staged edits without starting over). See our Features page for a full comparison.",
      },
      {
        question: "Does Mouse work with my AI assistant?",
        answer:
          "Mouse works with any AI coding agent that supports MCP (Model Context Protocol), including GitHub Copilot, Cursor, Claude, and others. The agent uses Mouse tools instead of its default file-editing tools.",
      },
    ],
  },
  {
    name: "Installation & Setup",
    icon: "🔧",
    faqs: [
      {
        question: "How do I install Mouse?",
        answer:
          "Install Mouse via npx: `npx @get-hic/mouse --token=<your-token>`. This installs the MCP server components to your project's .hic/ directory. Then configure your VS Code settings to use the Mouse server. See our Docs for detailed instructions.",
      },
      {
        question: "What IDEs does Mouse support?",
        answer:
          "Mouse currently supports VS Code and Cursor. Both IDEs use the same installation process. Support for additional IDEs is planned for future releases.",
      },
      {
        question: "Does Mouse work offline?",
        answer:
          "Yes! Mouse operates entirely locally on your device. It only needs internet connectivity for initial license activation and periodic validation (every 7 days). You can also use offline checkout mode for air-gapped environments.",
      },
      {
        question: "What are the system requirements?",
        answer:
          "Mouse requires Node.js 18+ and VS Code 1.85+ (or Cursor). The extension uses approximately 1.3MB of disk space. There are no special hardware requirements.",
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
          "Individual: $15/month ($150/year, save $30). Enterprise: $25/seat/month or $250/seat/year (2 seat minimum). Both plans include a free trial—14 days for Individual, 30 days for Enterprise. All prices exclude applicable taxes.",
      },
      {
        question: "Is there a free trial?",
        answer:
          "Yes! Individual plans include a 14-day free trial with no credit card required. Enterprise plans include a 30-day trial. You get full access to all features during the trial.",
      },
      {
        question: "Can I use Mouse for commercial projects?",
        answer:
          "Yes! Both Individual and Enterprise plans permit commercial use, subject to our Terms of Service.",
      },
      {
        question: "What counts as a device?",
        answer:
          "Each VS Code installation on a unique machine counts as one device. Individual plans allow 3 devices; Enterprise plans allow 2 devices per seat. You can deactivate old devices anytime from your portal to free up slots.",
      },
      {
        question: "Can I switch plans?",
        answer:
          "Yes! You can upgrade or downgrade at any time. When upgrading, you'll be prorated for the remainder of your billing cycle. When downgrading, the change takes effect at your next billing date.",
      },
      {
        question: "Do you offer refunds?",
        answer:
          "Yes. If you're not satisfied within the first 30 days, contact us for a full refund. No questions asked.",
      },
      {
        question: "What payment methods do you accept?",
        answer:
          "We accept all major credit cards, PayPal, and local payment methods depending on your region. Payments are processed securely by our payment partner.",
      },
      {
        question: "Are there volume discounts?",
        answer:
          "Yes, for Enterprise plans: 2-9 seats at standard pricing, 10-99 seats at 5% off, 100-499 seats at 10% off, 500-999 seats at 15% off, and 1,000+ seats at 20% off. Discounts apply to all seats in your order.",
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
          "No. Mouse operates exclusively locally on your device. We do not collect, transmit, or store your source code, file contents, AI prompts, AI responses, or keystrokes. See our Privacy Policy for details.",
      },
      {
        question: "What data does Mouse collect?",
        answer:
          "We collect only: account/payment information, license validation requests, device identifiers (for activation limits), and optional crash reports (opt-in only). We never see your code or AI conversations.",
      },
      {
        question: "Is Mouse SOC 2 compliant?",
        answer:
          "We are currently pursuing SOC 2 Type II certification. Enterprise customers can request our security documentation and complete a security questionnaire. Contact enterprise@hic-ai.com.",
      },
      {
        question: "Can I use Mouse in an air-gapped environment?",
        answer:
          "Yes. Mouse supports offline checkout mode for air-gapped environments. You can validate your license for up to 30 days without network connectivity.",
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
      <main className="pt-16 min-h-screen bg-midnight-navy">
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
                      <p className="mt-4 text-silver leading-relaxed">
                        {faq.answer}
                      </p>
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
