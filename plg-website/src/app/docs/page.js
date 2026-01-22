/**
 * Documentation Index Page
 *
 * Lists all documentation topics with search and category filtering.
 */

import Link from "next/link";
import { Header, Footer, Container } from "@/components/layout";
import { Input, Card, Badge } from "@/components/ui";

// Documentation categories and pages
const docs = [
  {
    category: "Getting Started",
    icon: "🚀",
    items: [
      {
        slug: "installation",
        title: "Installation",
        description: "Install Mouse extension in VS Code or Cursor",
        badge: "Essential",
      },
      {
        slug: "quickstart",
        title: "Quick Start Guide",
        description: "Get up and running in under 5 minutes",
        badge: "Essential",
      },
      {
        slug: "license-activation",
        title: "License Activation",
        description: "Activate your license key in the extension",
      },
    ],
  },
  {
    category: "Core Concepts",
    icon: "📚",
    items: [
      {
        slug: "how-it-works",
        title: "How Mouse Works",
        description: "Understanding the MCP server architecture",
      },
      {
        slug: "edit-operations",
        title: "Edit Operations",
        description: "INSERT, REPLACE, DELETE, FOR_LINES, and ADJUST",
      },
      {
        slug: "batch-editing",
        title: "Batch Editing",
        description: "Atomic multi-file edits with rollback support",
      },
      {
        slug: "dialog-box",
        title: "Dialog Box Review",
        description: "Staged changes and human-in-the-loop approval",
      },
    ],
  },
  {
    category: "Tool Reference",
    icon: "🔧",
    items: [
      {
        slug: "quick-edit",
        title: "quick_edit",
        description: "Single-operation file editing",
        badge: "Tool",
      },
      {
        slug: "batch-quick-edit",
        title: "batch_quick_edit",
        description: "Multi-operation atomic edits",
        badge: "Tool",
      },
      {
        slug: "find-in-file",
        title: "find_in_file",
        description: "Pattern search with column analysis",
        badge: "Tool",
      },
      {
        slug: "save-cancel-changes",
        title: "save_changes / cancel_changes",
        description: "Commit or discard staged edits",
        badge: "Tool",
      },
    ],
  },
  {
    category: "Advanced Features",
    icon: "⚡",
    items: [
      {
        slug: "columnar-editing",
        title: "Columnar Editing",
        description: "FOR_LINES and rect+move patterns",
      },
      {
        slug: "zero-calc-workflow",
        title: "Zero-Calc Workflow",
        description: "Copy-paste rect notation from find_in_file",
        badge: "New",
      },
      {
        slug: "offline-mode",
        title: "Offline Mode",
        description: "License checkout for air-gapped environments",
      },
    ],
  },
  {
    category: "Integration",
    icon: "🔌",
    items: [
      {
        slug: "vscode-setup",
        title: "VS Code Configuration",
        description: "Settings, keybindings, and workspace setup",
      },
      {
        slug: "cursor-setup",
        title: "Cursor IDE Setup",
        description: "Using Mouse with Cursor",
      },
      {
        slug: "agent-prompting",
        title: "Agent Prompting",
        description: "Best practices for AI agent instructions",
      },
    ],
  },
  {
    category: "Troubleshooting",
    icon: "🔍",
    items: [
      {
        slug: "common-errors",
        title: "Common Errors",
        description: "Solutions to frequent issues",
      },
      {
        slug: "license-issues",
        title: "License Issues",
        description: "Activation and validation troubleshooting",
      },
      {
        slug: "debugging",
        title: "Debugging Guide",
        description: "Logs, diagnostics, and support",
      },
    ],
  },
];

export const metadata = {
  title: "Documentation | Mouse by HIC AI",
  description:
    "Complete documentation for Mouse precision editing tools. Installation guides, tool reference, and best practices.",
};

export default function DocsPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-midnight-navy pt-20">
        {/* Hero Section */}
        <section className="py-16 border-b border-frost-white/10">
          <Container>
            <div className="max-w-3xl">
              <h1 className="text-4xl md:text-5xl font-bold mb-4">
                Documentation
              </h1>
              <p className="text-xl text-frost-white/70 mb-8">
                Everything you need to master precision editing with Mouse.
              </p>

              {/* Search */}
              <div className="relative max-w-xl">
                <Input
                  type="search"
                  placeholder="Search documentation..."
                  className="pl-10"
                />
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-frost-white/50"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
            </div>
          </Container>
        </section>

        {/* Documentation Grid */}
        <section className="py-16">
          <Container>
            <div className="grid gap-12">
              {docs.map((category) => (
                <div key={category.category}>
                  <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                    <span>{category.icon}</span>
                    {category.category}
                  </h2>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {category.items.map((item) => (
                      <Link
                        key={item.slug}
                        href={`/docs/${item.slug}`}
                        className="group"
                      >
                        <Card className="h-full hover:border-cerulean-mist/50 transition-colors">
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="font-semibold group-hover:text-cerulean-mist transition-colors">
                              {item.title}
                            </h3>
                            {item.badge && (
                              <Badge
                                variant={
                                  item.badge === "Essential"
                                    ? "default"
                                    : item.badge === "New"
                                      ? "success"
                                      : "secondary"
                                }
                                size="sm"
                              >
                                {item.badge}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-frost-white/60">
                            {item.description}
                          </p>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Container>
        </section>

        {/* Help Section */}
        <section className="py-16 border-t border-frost-white/10">
          <Container>
            <div className="text-center max-w-2xl mx-auto">
              <h2 className="text-2xl font-bold mb-4">Need Help?</h2>
              <p className="text-frost-white/70 mb-8">
                Can&apos;t find what you&apos;re looking for? Our team is here
                to help.
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <a
                  href="https://github.com/hic-ai/mouse/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary"
                >
                  Report an Issue
                </a>
                <a href="mailto:support@hic-ai.com" className="btn btn-ghost">
                  Contact Support
                </a>
              </div>
            </div>
          </Container>
        </section>
      </main>
      <Footer />
    </>
  );
}
