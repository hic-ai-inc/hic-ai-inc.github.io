/**
 * Documentation Article Page
 *
 * Dynamic route that renders individual documentation articles.
 * In production, content would come from MDX files or a CMS.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { Header, Footer, Container } from "@/components/layout";
import { Badge } from "@/components/ui";

// Documentation content (would be MDX files or CMS in production)
const docsContent = {
  installation: {
    title: "Installation",
    description: "Install Mouse extension in VS Code or Cursor",
    category: "Getting Started",
    content: `
## Prerequisites

- VS Code 1.85+ or Cursor IDE
- Node.js 18+ (for local MCP server)
- Active license key (Individual, Enterprise, or OSS)

## Installation Methods

### VS Code Marketplace (Recommended)

1. Open VS Code
2. Go to Extensions (Cmd/Ctrl + Shift + X)
3. Search for "Mouse by HIC AI"
4. Click Install

### Manual Installation

Download the \`.vsix\` file from your portal and install:

\`\`\`bash
code --install-extension mouse-hic-ai-x.x.x.vsix
\`\`\`

## Post-Installation

After installing, you'll need to:

1. Configure your license key
2. Verify the MCP server is running
3. (Optional) Customize keybindings

See [License Activation](/docs/license-activation) for the next steps.
    `,
    nextPage: { slug: "quickstart", title: "Quick Start Guide" },
    prevPage: null,
  },
  quickstart: {
    title: "Quick Start Guide",
    description: "Get up and running in under 5 minutes",
    category: "Getting Started",
    content: `
## 5-Minute Quick Start

### Step 1: Verify Installation

After installing the extension, open the command palette (Cmd/Ctrl + Shift + P) and run:

\`\`\`
Mouse: Show Status
\`\`\`

You should see "MCP Server: Running" in the status.

### Step 2: Activate License

1. Open Settings (Cmd/Ctrl + ,)
2. Search for \`mouse.licenseKey\`
3. Paste your license key
4. Restart VS Code

### Step 3: Try Your First Edit

Open any file and ask your AI assistant:

> "Use Mouse to add a comment above line 10"

The assistant will use the \`quick_edit\` tool with an INSERT operation.

### Step 4: Explore Batch Editing

For multiple changes:

> "Use batch_quick_edit to rename 'oldFunction' to 'newFunction' across all files"

## Next Steps

- Learn about [Edit Operations](/docs/edit-operations)
- Explore [Batch Editing](/docs/batch-editing)
- Configure [Agent Prompting](/docs/agent-prompting)
    `,
    nextPage: { slug: "license-activation", title: "License Activation" },
    prevPage: { slug: "installation", title: "Installation" },
  },
  "license-activation": {
    title: "License Activation",
    description: "Activate your license key in the extension",
    category: "Getting Started",
    content: `
## Activating Your License

### Via Settings UI

1. Open VS Code Settings (Cmd/Ctrl + ,)
2. Search for \`mouse.licenseKey\`
3. Paste your license key
4. Restart VS Code to apply

### Via settings.json

Add to your \`settings.json\`:

\`\`\`json
{
  "mouse.licenseKey": "XXXX-XXXX-XXXX-XXXX"
}
\`\`\`

### Via Command Palette

1. Open Command Palette (Cmd/Ctrl + Shift + P)
2. Run "Mouse: Activate License"
3. Paste your key when prompted

## License Validation

Mouse validates your license:

- **On Startup**: Checks license status
- **Periodic Heartbeat**: Every 24 hours
- **Offline Grace**: 7 days without connectivity

## Device Limits

| Plan | Devices |
|------|---------|
| OSS | 2 |
| Individual | 3 |
| Enterprise | 10 per seat |

## Troubleshooting

See [License Issues](/docs/license-issues) for common problems.
    `,
    nextPage: { slug: "how-it-works", title: "How Mouse Works" },
    prevPage: { slug: "quickstart", title: "Quick Start Guide" },
  },
  "how-it-works": {
    title: "How Mouse Works",
    description: "Understanding the MCP server architecture",
    category: "Core Concepts",
    content: `
## Architecture Overview

Mouse implements the **Model Context Protocol (MCP)** to provide AI coding assistants with precise file editing capabilities.

\`\`\`
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│  AI Assistant   │────▶│ MCP Protocol │────▶│ Mouse Server│
│ (Claude, etc.)  │◀────│   (stdio)    │◀────│  (VS Code)  │
└─────────────────┘     └──────────────┘     └─────────────┘
                                                    │
                                              ┌─────┴─────┐
                                              │   Files   │
                                              └───────────┘
\`\`\`

## Key Components

### MCP Server
The extension runs a local MCP server that:
- Receives tool calls from AI assistants
- Validates operations against file state
- Stages changes for review (Dialog Box)
- Applies atomic edits with rollback support

### Tool Interface
Mouse exposes tools via MCP:
- \`quick_edit\` - Single operations
- \`batch_quick_edit\` - Multiple operations
- \`find_in_file\` - Pattern search
- \`save_changes\` / \`cancel_changes\` - Commit/rollback

### Dialog Box
Large or risky operations trigger a review dialog:
- Visual diff of proposed changes
- Approve/reject per-operation
- Full rollback on cancel

## Why MCP?

Traditional AI code editing relies on:
- Full file rewrites (token inefficient)
- Line-based patches (brittle)
- Search/replace (ambiguous)

Mouse's approach:
- **Atomic operations** with precise targeting
- **Staged changes** for human review
- **Rollback support** for safety
    `,
    nextPage: { slug: "edit-operations", title: "Edit Operations" },
    prevPage: { slug: "license-activation", title: "License Activation" },
  },
  "edit-operations": {
    title: "Edit Operations",
    description: "INSERT, REPLACE, DELETE, FOR_LINES, and ADJUST",
    category: "Core Concepts",
    content: `
## Operation Types

Mouse supports six operation types:

### INSERT
Add new content at a specific line:

\`\`\`json
{
  "operation": "insert",
  "afterLine": 10,
  "content": "// New comment"
}
\`\`\`

### REPLACE
Find and replace text:

\`\`\`json
{
  "operation": "replace",
  "find": "oldValue",
  "replace": "newValue",
  "replaceAll": true
}
\`\`\`

### DELETE
Remove lines:

\`\`\`json
{
  "operation": "delete",
  "region": [10, 15]
}
\`\`\`

### REPLACE_RANGE
Character-level precision:

\`\`\`json
{
  "operation": "replace_range",
  "region": [[10, 5], [10, 20]],
  "content": "newText"
}
\`\`\`

### FOR_LINES
Apply same change to multiple lines:

\`\`\`json
{
  "operation": "for_lines",
  "lineRange": [10, 50],
  "colRange": [0, 0],
  "content": "// "
}
\`\`\`

### ADJUST
Move content without modification:

\`\`\`json
{
  "operation": "adjust",
  "rect": [[10, 29], 13, 41],
  "move": [0, 82]
}
\`\`\`
    `,
    nextPage: { slug: "batch-editing", title: "Batch Editing" },
    prevPage: { slug: "how-it-works", title: "How Mouse Works" },
  },
};

// Generate static params for all doc pages
export async function generateStaticParams() {
  return Object.keys(docsContent).map((slug) => ({ slug }));
}

// Generate metadata for each page
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const doc = docsContent[slug];

  if (!doc) {
    return { title: "Not Found | Mouse Documentation" };
  }

  return {
    title: `${doc.title} | Mouse Documentation`,
    description: doc.description,
  };
}

export default async function DocPage({ params }) {
  const { slug } = await params;
  const doc = docsContent[slug];

  if (!doc) {
    notFound();
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-midnight-navy pt-20">
        <Container>
          <div className="py-16 max-w-4xl mx-auto">
            {/* Breadcrumb */}
            <nav className="mb-8 text-sm">
              <ol className="flex items-center gap-2 text-frost-white/60">
                <li>
                  <Link href="/docs" className="hover:text-cerulean-mist">
                    Docs
                  </Link>
                </li>
                <li>/</li>
                <li>
                  <span className="text-frost-white/40">{doc.category}</span>
                </li>
                <li>/</li>
                <li>
                  <span className="text-frost-white">{doc.title}</span>
                </li>
              </ol>
            </nav>

            {/* Header */}
            <header className="mb-12">
              <Badge variant="secondary" className="mb-4">
                {doc.category}
              </Badge>
              <h1 className="text-4xl font-bold mb-4">{doc.title}</h1>
              <p className="text-xl text-frost-white/70">{doc.description}</p>
            </header>

            {/* Content */}
            <article className="prose prose-invert prose-cerulean max-w-none">
              {/* In production, this would render MDX */}
              <div
                className="doc-content"
                dangerouslySetInnerHTML={{
                  __html: formatContent(doc.content),
                }}
              />
            </article>

            {/* Navigation */}
            <nav className="mt-16 pt-8 border-t border-frost-white/10 flex justify-between">
              {doc.prevPage ? (
                <Link
                  href={`/docs/${doc.prevPage.slug}`}
                  className="group flex items-center gap-2 text-frost-white/60 hover:text-cerulean-mist"
                >
                  <svg
                    className="w-5 h-5 group-hover:-translate-x-1 transition-transform"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                  <span>{doc.prevPage.title}</span>
                </Link>
              ) : (
                <div />
              )}
              {doc.nextPage && (
                <Link
                  href={`/docs/${doc.nextPage.slug}`}
                  className="group flex items-center gap-2 text-frost-white/60 hover:text-cerulean-mist"
                >
                  <span>{doc.nextPage.title}</span>
                  <svg
                    className="w-5 h-5 group-hover:translate-x-1 transition-transform"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </Link>
              )}
            </nav>
          </div>
        </Container>
      </main>
      <Footer />
    </>
  );
}

// Simple markdown-like formatting (would use MDX in production)
function formatContent(content) {
  return content
    .replace(
      /^## (.*$)/gim,
      '<h2 class="text-2xl font-bold mt-10 mb-4">$1</h2>',
    )
    .replace(
      /^### (.*$)/gim,
      '<h3 class="text-xl font-semibold mt-8 mb-3">$1</h3>',
    )
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(
      /`([^`]+)`/g,
      '<code class="bg-frost-white/10 px-1.5 py-0.5 rounded text-cerulean-mist text-sm">$1</code>',
    )
    .replace(
      /```(\w+)?\n([\s\S]*?)```/g,
      (_, lang, code) =>
        `<pre class="bg-frost-white/5 border border-frost-white/10 rounded-lg p-4 overflow-x-auto my-4"><code class="text-sm">${code.trim()}</code></pre>`,
    )
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" class="text-cerulean-mist hover:underline">$1</a>',
    )
    .replace(/^\- (.*$)/gim, '<li class="ml-4 text-frost-white/80">$1</li>')
    .replace(
      /^(\d+)\. (.*$)/gim,
      '<li class="ml-4 text-frost-white/80">$2</li>',
    )
    .replace(
      /^\> (.*$)/gim,
      '<blockquote class="border-l-4 border-cerulean-mist/50 pl-4 italic text-frost-white/70 my-4">$1</blockquote>',
    )
    .replace(
      /\n\n/g,
      '</p><p class="text-frost-white/80 leading-relaxed mb-4">',
    )
    .replace(/^\|(.+)\|$/gm, (match) => {
      const cells = match
        .split("|")
        .filter(Boolean)
        .map((c) => c.trim());
      return `<tr>${cells.map((c) => `<td class="border border-frost-white/20 px-4 py-2">${c}</td>`).join("")}</tr>`;
    });
}
