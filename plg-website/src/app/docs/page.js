/**
 * Documentation Index Page
 *
 * Lists all documentation topics with search and category filtering.
 */

import Link from "next/link";
import { Header, Footer, Container } from "@/components/layout";
import { Card, Badge } from "@/components/ui";

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
      <main id="main-content" className="min-h-screen bg-midnight-navy pt-20">
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
                {/* Disabled pending hic-ai-inc/mouse public repo creation */}
                <span
                  className="btn btn-secondary opacity-50 cursor-not-allowed"
                  title="Coming soon - pending public repo creation"
                >
                  Report an Issue
                </span>
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
