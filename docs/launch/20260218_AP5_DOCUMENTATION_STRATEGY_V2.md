# AP 5: Documentation Strategy

**Date:** February 18, 2026 (v2; supersedes February 16 v1)
**Author:** GC (GitHub Copilot)
**Status:** Ready for SWR review
**Context:** Comprehensive documentation plan for the Mouse PLG website. Covers the full scope of what excellent documentation looks like, triaged into pre-launch essentials vs. post-launch builds, with production readiness and customer credibility as the gating constraints.

---

## Why Documentation Is the Product

Simon, you named the exact parallel. AWS won you — and millions of other developers — not with a beautiful site or the cheapest price, but with documentation so thorough that you could _always find the answer._ Their pricing page is notoriously complicated, but it's _transparent._ Their docs aren't beautiful, but they're _complete._ That combination — transparent pricing + excellent docs — is the trust formula for developer tools.

Mouse has a version of the same opportunity:

1. **The product is invisible.** Mouse runs behind the scenes. Users don't interact with Mouse — they interact with their AI agent, who interacts with Mouse. This means users can't _feel_ the product the way they feel a UI. They experience it through outcomes (faster edits, fewer errors, less token burn), and those outcomes need to be _explained_ to be attributed to Mouse. Documentation is how you make the invisible visible.

2. **The safety net is the value prop.** You described it yourself: Mouse doesn't eliminate hallucinations or mistakes. It gives you a cushion and safety net so you can be _less conservative_ with AI oversight. That's a sophisticated value proposition. It requires education, not just marketing copy. Documentation is where that education happens.

3. **The audience evaluates competence through docs.** Developers will click "Docs" within the first 60 seconds of evaluating a tool. If they find accurate, well-organized, technically precise documentation, they conclude: "These people know what they're doing." If they find 404s, stale content, or vague hand-waving, they conclude the opposite — regardless of how good the product actually is.

4. **Customers will check the docs before buying.** A developer seeing a docs section with 75% 404 rates (15 of 20 slugs) would conclude: incomplete product. The docs need to be _functional and credible_ before production launch.

---

## Current State: Honest Assessment

| Metric                        | Value                                          | Grade                    |
| ----------------------------- | ---------------------------------------------- | ------------------------ |
| Doc slugs listed in index     | 20                                             | —                        |
| Slugs with actual content     | 5 (25%)                                        | F                        |
| Slugs that would 404          | 15 (75%)                                       | F                        |
| Content quality of existing 5 | Decent — accurate, covers basics               | B-                       |
| FAQ questions                 | 27 across 6 categories                         | B+ (good breadth)        |
| FAQ pricing accuracy          | Wrong ($25 vs $35, "Enterprise" vs "Business"); canonical: Individual $15/mo ($150/yr), Business $35/seat/mo ($350/seat/yr) | F                        |
| Docs search bar               | Non-functional (decorative)                    | F                        |
| Content delivery system       | Inline JS objects, regex markdown renderer     | C (works, doesn't scale) |

**Bottom line:** The _structure_ is good (categories, navigation, slug-based routing), the _existing content_ is serviceable, and the _FAQ_ is surprisingly comprehensive. But 75% of the docs index is dead links, the search bar is broken, and the FAQ has trust-destroying pricing inaccuracies. The gap isn't "we need to build a docs system" — it's "we need to populate it with real content and fix the broken parts."

---

## What Excellent Documentation Covers

Here is the full scope of what Mouse documentation should eventually cover, drawn from the best developer tool documentation (AWS, Stripe, Tailwind, Vercel) and organized by the question the user is trying to answer:

### Category 1: "How do I get started?" — Installation & Setup

| Topic                                 | Audience                | Why It Matters                                        |
| ------------------------------------- | ----------------------- | ----------------------------------------------------- |
| Installation from VS Code Marketplace | New user (VS Code)      | First touchpoint — must be frictionless               |
| Installation from Open VSX            | New user (Cursor, Kiro) | Different marketplace, different steps                |
| Workspace initialization per client   | All users               | `Initialize Workspace` behaves differently per client |
| VS Code + Copilot configuration       | Copilot users           | May need manual MCP server start                      |
| Cursor configuration                  | Cursor users            | CJS build path, .cursor/mcp.json                      |
| Kiro configuration                    | Kiro users              | .kiro/settings/mcp.json                               |
| Claude Code CLI configuration         | Claude Code users       | Global MCP config path                                |
| Roo Code configuration                | Roo Code users          | Global config path specifics                          |
| First edit walkthrough                | All users               | "Hello world" moment — prove it works                 |
| License activation                    | All users               | Settings UI, settings.json, or Command Palette        |
| Trial → paid transition               | Trial users             | What happens when trial ends, how to upgrade          |

### Category 2: "How does it work?" — Core Concepts

| Topic                                                                             | Audience                      | Why It Matters                                |
| --------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------- |
| Architecture overview (MCP protocol, stdio, local-only)                           | Technical evaluators          | Answers "what is this, architecturally?"      |
| The 6 edit operations (INSERT, REPLACE, DELETE, REPLACE_RANGE, FOR_LINES, ADJUST) | Developers wanting precision  | Reference for understanding what Mouse can do |
| Coordinate-based vs. content-based editing                                        | Evaluators, experienced users | Key differentiator — why coordinates matter   |
| Zero content-echo explained                                                       | Evaluators                    | Token savings, no copy-paste errors           |
| Atomic batching and rollback                                                      | Evaluators, power users       | All-or-nothing safety                         |
| The Dialog Box (staged changes, visual diff, approve/reject)                      | All users                     | The "safety net" — central to the value prop  |
| Batch editing workflow (batch_quick_edit → review → save/cancel)                  | Power users                   | Multi-edit workflow                           |
| In-place refinement of staged edits                                               | Power users                   | Unique capability — adjust without restart    |
| Offline mode / local-only operation                                               | Security-conscious evaluators | Zero network dependency for editing           |

### Category 3: "How much does it cost?" — Billing & Pricing

| Topic                                           | Audience                | Why It Matters                              |
| ----------------------------------------------- | ----------------------- | ------------------------------------------- |
| Pricing overview (Individual vs Business)       | Prospects               | Transparent, single-source-of-truth pricing |
| What's included in each plan                    | Prospects               | Feature comparison                          |
| Trial details (14 days, no card, full features) | Prospects               | Remove friction from trying                 |
| How billing works (monthly/annual, Stripe)      | Customers               | Expectations for charges                    |
| How to upgrade/downgrade                        | Customers               | Self-service transitions                    |
| How to add/remove seats (Business)              | Team admins             | Seat management                             |
| Refund policy                                   | Customers               | Pro-rata, within 30 days                    |
| Student/nonprofit discounts                     | Special audiences       | Promo codes and verification                |
| Volume discounts (Business)                     | Larger teams            | Transparent scaling pricing                 |
| Tax handling (Merchant of Record)               | International customers | Why prices may include tax                  |

### Category 4: "I need help" — Support & Contact

| Topic                                 | Audience                    | Why It Matters                     |
| ------------------------------------- | --------------------------- | ---------------------------------- |
| Getting help channels overview        | All users                   | Where to go for what kind of issue |
| Email support (support@hic-ai.com)    | Paid customers              | Response time expectations         |
| Community (Discord)                   | All users                   | Self-service peer support          |
| bug reports (GitHub Issues)           | All users                   | How to file effectively            |
| Feature requests                      | All users                   | Where and how to request           |
| Security issues (security@hic-ai.com) | Security researchers        | Responsible disclosure process     |
| Status page / known issues            | Users experiencing problems | Is it just me?                     |

### Category 5: "Is it secure?" — Security & Privacy

| Topic                                                                                     | Audience                                  | Why It Matters                             |
| ----------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------ |
| Security architecture (local-only, no cloud, MCP stdio)                                   | Security-conscious evaluators, enterprise | The #1 question for any tool touching code |
| What data Mouse collects (heartbeat: license validation, version check — that's it)       | Privacy-conscious users                   | Transparency builds trust                  |
| What data Mouse does NOT collect (no code, no keystrokes, no file contents, no telemetry) | Privacy-conscious users                   | Equally important as what _is_ collected   |
| Network requests explained (heartbeat to api.hic-ai.com, frequency, payload)              | Security teams, enterprise                | Full transparency on network activity      |
| Offline operation and grace period (7-day offline grace)                                  | Air-gapped / restricted environments      | Proves it works without network            |
| SOC 2 status (pursuing, not yet achieved)                                                 | Enterprise evaluators                     | Honest about where you are                 |
| Encryption and data protection                                                            | Enterprise evaluators                     | At rest, in transit                        |
| Responsible disclosure policy                                                             | Security researchers                      | How to report vulnerabilities              |
| GDPR / data protection                                                                    | International users, enterprise           | Compliance posture                         |

### Category 6: "Something's broken" — Troubleshooting

| Topic                                                               | Audience                   | Why It Matters                       |
| ------------------------------------------------------------------- | -------------------------- | ------------------------------------ |
| Common errors and their meanings                                    | All users                  | Self-service resolution              |
| Mouse not loading / MCP server not starting                         | New users                  | Most common first-run issue          |
| License activation failures                                         | New users                  | Second most common issue             |
| Client-specific issues (Copilot MCP quirks, Cursor CJS, Kiro paths) | Multi-client users         | Per-client gotchas                   |
| "Device limit reached"                                              | Multi-device users         | How to deactivate old devices        |
| Heartbeat failures / offline mode triggers                          | Users with network issues  | What happens when connection drops   |
| Extension conflicts                                                 | Users with many extensions | How to diagnose tool conflicts       |
| How to collect diagnostic info for bug reports                      | Users before filing a bug  | Makes support more efficient         |
| Rollback and recovery after failed edits                            | Users after an error       | How the safety net works in practice |

### Category 7: "How do I get the most out of this?" — Best Practices & Tips

| Topic                                               | Audience             | Why It Matters                                |
| --------------------------------------------------- | -------------------- | --------------------------------------------- |
| Prompting your AI agent to use Mouse effectively    | All users            | The #1 thing users can do to improve outcomes |
| When to use quick_edit vs batch_quick_edit          | Intermediate users   | Right tool for the job                        |
| The find_in_file → quick_edit workflow              | Intermediate users   | Search-then-edit pattern                      |
| Working with large files                            | Power users          | Strategies for 1000+ line files               |
| Multi-file refactoring with batch operations        | Power users          | Complex workflow guidance                     |
| Columnar editing patterns                           | Power users          | Advanced capability                           |
| Reducing token usage (leveraging zero content-echo) | Cost-conscious users | Practical advice for credit conservation      |
| Setting up workspace-specific configurations        | Teams                | Consistent team setups                        |

### Category 8: "Help my AI agent use this better" — AI Agent Crib Sheets

This is a _unique_ documentation category that no other developer tool has, because no other developer tool is primarily consumed by AI agents rather than humans. This content is designed to be copy-pasted into system prompts, `.github/copilot-instructions.md`, `.cursorrules`, or similar agent configuration files.

| Topic                                                                  | Audience          | Why It Matters                            |
| ---------------------------------------------------------------------- | ----------------- | ----------------------------------------- |
| Copilot instructions for Mouse                                         | Copilot users     | Drop-in instructions block                |
| Cursor rules for Mouse                                                 | Cursor users      | Drop-in .cursorrules content              |
| Claude Code system prompt additions                                    | Claude Code users | Drop-in system prompt content             |
| General MCP tool usage guidelines                                      | All AI agents     | Tool selection heuristics                 |
| Operation selection guide (when to INSERT vs REPLACE vs REPLACE_RANGE) | All AI agents     | Reduces operation misuse                  |
| Error recovery patterns for agents                                     | All AI agents     | What to do when an edit fails             |
| Token-efficient editing patterns                                       | All AI agents     | Concrete examples of efficient tool calls |

**Why this category matters disproportionately:** Mouse's value scales with how well the AI agent uses it. A user who drops a well-crafted crib sheet into their agent config will see dramatically better results than one who doesn't. This documentation _directly increases the product's value_ — it's not just describing the product, it's _improving_ it.

### Category 9: "Who built this and why?" — About HIC AI

| Topic                                     | Audience                     | Why It Matters         |
| ----------------------------------------- | ---------------------------- | ---------------------- |
| Company vision (Humans In Charge)         | Evaluators, investors, press | Why the company exists |
| The problem Mouse solves (execution slop) | Evaluators                   | Category framing       |
| Research and evidence base                | Technical evaluators         | Credibility            |
| Roadmap (current → next → future)         | Evaluators, existing users   | Where this is going    |
| Team (when appropriate)                   | Evaluators                   | Who's behind this      |

---

## Triage: What Must Exist Before Production Launch

Production launch requires _functional, credible documentation._ A prospective customer will:

1. Click "Docs" from the nav
2. See a docs index page
3. Click 2–3 articles to verify they load and contain real content
4. Possibly look for a Getting Started guide
5. Possibly look for pricing/billing info (but this is on `/pricing` and `/faq` already)

They are **not** going to read every article or evaluate technical depth. They're checking: "Is this a real product with real documentation, or a placeholder?" (Note: This same bar would also satisfy any future MoR application reviewer if the contingency path to LS or Paddle is ever activated — see AP 8 AR §14.)

### Tier 1: Must-Have for Production Launch (Pre-Launch Gate)

These articles must exist, be accurate, and link correctly. This is the minimum bar to pass the "is this real?" test.

| #    | Article                        | Slug                 | Status                | Action                                                                               | Effort |
| ---- | ------------------------------ | -------------------- | --------------------- | ------------------------------------------------------------------------------------ | ------ |
| DOC-1  | Installation                   | `installation`       | EXISTS — needs update | Verify accuracy, update for current clients, remove stale npx refs                   | 30m    |
| DOC-2  | Quick Start Guide              | `quickstart`         | EXISTS — needs update | Verify activation flow matches current UX, test walkthrough end-to-end               | 45m    |
| DOC-3  | License Activation             | `license-activation` | EXISTS — needs update | Verify 3 activation methods still accurate, update device limits if changed          | 30m    |
| DOC-4  | How Mouse Works                | `how-it-works`       | EXISTS — needs update | Verify architecture diagram accuracy, ensure MCP description is current              | 30m    |
| DOC-5  | Edit Operations                | `edit-operations`    | EXISTS — decent       | Verify JSON examples are correct, fix broken "Next" link to batch-editing            | 15m    |
| DOC-6  | VS Code + Copilot Setup        | `vscode-setup`       | MISSING (404)         | **Write new.** MCP config, manual server start note, copilot-instructions.md         | 1h     |
| DOC-7  | Cursor Setup                   | `cursor-setup`       | MISSING (404)         | **Write new.** CJS build, .cursor/mcp.json, any quirks from E2E verification         | 45m    |
| DOC-8  | Troubleshooting: Common Errors | `common-errors`      | MISSING (404)         | **Write new.** Top 5–7 errors a new user might hit, with resolutions                 | 1h     |
| DOC-9  | Security & Privacy Overview    | NEW                  | MISSING (no slug)     | **Write new.** Local-only architecture, what is/isn't collected, heartbeat explained | 1h     |
| DOC-10 | Billing & Pricing FAQ          | —                    | EXISTS on `/faq`      | **Fix** pricing discrepancies (FAQ vs constants.js), verify all billing Q&As         | 30m    |

**Total for Tier 1: ~6.5 hours**

This gives prospective customers (and any future MoR reviewer) a documentation section with:

- A clear Getting Started path (DOC-1 → DOC-2 → DOC-3)
- A conceptual foundation (DOC-4, DOC-5)
- Client-specific setup for the two largest audiences (DOC-6, DOC-7)
- A troubleshooting page (DOC-8)
- A security page (DOC-9) — critical for credibility
- Accurate billing info (DOC-10)

### What to Do With the 15 Dead Slugs

**AP 1 already recommended removing dead links.** This plan concurs. For production launch:

1. **Remove from docs index:** All slugs that don't have content (15 currently, minus the ones we're writing above)
2. **Don't stub with "Coming Soon":** That looks worse than not listing the article
3. **Restructure the docs index** to reflect what actually exists (see § Recommended Docs Index below)

After writing DOC-6, DOC-7, DOC-8, and DOC-9, the docs index will have **9–10 real articles** across a focused set of categories. That's a respectable documentation section for a v1 product.

### Tier 2: Should-Have for Launch (Post-Tier-1, Pre-Launch)

These don't need to exist for production launch day but should exist before real users start signing up in volume. Write these after Tier 1 is complete, in parallel with other pre-launch work.

| #    | Article                          | Slug                | Effort | Why                                                                                 |
| ---- | -------------------------------- | ------------------- | ------ | ----------------------------------------------------------------------------------- |
| DOC-11 | Batch Editing                    | `batch-editing`     | 45m    | Completes the Core Concepts section; referenced by existing edit-operations article |
| DOC-12 | Dialog Box Review                | `dialog-box`        | 45m    | The safety net / staged changes flow — central to value prop                        |
| DOC-13 | Kiro Setup                       | `kiro-setup`        | 30m    | Third supported IDE; growing user base                                              |
| DOC-14 | Claude Code CLI Setup            | `claude-code-setup` | 30m    | CLI users are power users; different config path                                    |
| DOC-15 | Other Agents Setup               | `other-agents-setup`| 45m    | Covers Roo Code, Cline, Kilo Code, CodeGPT; completes client coverage               |
| DOC-16 | AI Agent Crib Sheet: Copilot     | `agent-copilot`     | 1h     | Directly improves product value for largest user segment                            |
| DOC-17 | AI Agent Crib Sheet: General     | `agent-prompting`   | 1h     | Operation selection, error recovery, token efficiency                               |
| DOC-18 | License Issues (Troubleshooting) | `license-issues`    | 30m    | Second troubleshooting article; covers activation edge cases                        |
| DOC-19 | Getting Help                     | `getting-help`      | 30m    | Support channels overview — where to go for what                                    |

**Total for Tier 2: ~6.5 hours**

### Tier 3: Build Over Time (Post-Launch)

These represent the full documentation vision. They don't need to exist at launch but should be on the roadmap. Each one adds genuine value to users.

| #     | Category                  | Articles                                                                | Notes                                           |
| ----- | ------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------- |
| DOC-20+ | Tool Reference            | `quick-edit`, `batch-quick-edit`, `find-in-file`, `save-cancel-changes` | Full reference docs for each tool with examples |
| DOC-25+ | Advanced Features         | `columnar-editing`, `zero-calc-workflow`, `offline-mode`                | Power user content                              |
| DOC-30+ | Best Practices            | Working with large files, multi-file refactoring, token reduction       | Workflow guidance                               |
| DOC-35+ | AI Agent Crib Sheets      | Per-client instruction blocks for Cursor, Claude Code, Kiro, Roo Code   | Copy-pasteable agent configs                    |
| DOC-40+ | Security Deep Dive        | Responsible disclosure, GDPR, network request audit log                 | Enterprise-grade transparency                   |
| DOC-45+ | Team Administration       | Seat management, invite flow, RBAC, audit logging                       | Business plan content                           |
| DOC-50+ | API/Integration Reference | Webhook payloads, Keygen events, license validation protocol            | For integrators                                 |

---

## Recommended Docs Index (Post-Tier 1)

After completing Tier 1 work, restructure the docs index to show only what exists:

```
Getting Started 🚀
├── Installation                    [DOC-1, exists]
├── Quick Start Guide               [DOC-2, exists]
└── License Activation              [DOC-3, exists]

Core Concepts 📚
├── How Mouse Works                 [DOC-4, exists]
└── Edit Operations                 [DOC-5, exists]

Integration Guides 🔌
├── VS Code + GitHub Copilot        [DOC-6, new]
└── Cursor IDE                      [DOC-7, new]

Security & Privacy 🔒
└── Security Overview               [DOC-9, new]

Troubleshooting 🔍
└── Common Errors                   [DOC-8, new]
```

**After Tier 2**, it grows to:

```
Getting Started 🚀
├── Installation
├── Quick Start Guide
└── License Activation

Core Concepts 📚
├── How Mouse Works
├── Edit Operations
├── Batch Editing                   [DOC-11]
└── Dialog Box Review               [DOC-12]

Integration Guides 🔌
├── VS Code + GitHub Copilot
├── Cursor IDE
├── Kiro                            [DOC-13]
├── Claude Code CLI                 [DOC-14]
└── Other Agents (Roo, Cline, Kilo, CodeGPT) [DOC-15]

AI Agent Configuration 🤖
├── Copilot Instructions            [DOC-16]
└── Prompting Best Practices        [DOC-17]

Security & Privacy 🔒
└── Security Overview

Troubleshooting 🔍
├── Common Errors
├── License Issues                  [DOC-18]
└── Getting Help                    [DOC-19]
```

---

## Content Principles

These principles govern how every article should be written. They are derived from what makes AWS, Stripe, and Tailwind docs effective.

### 1. Accuracy Over Completeness

A short, accurate article is infinitely better than a long, inaccurate one. Every claim, every code example, every configuration snippet must be _verified against the current codebase._ This is why the dependency map puts E2E client verification (A3.5) _before_ documentation (A4).

**Concrete rule:** Every installation or configuration instruction must be tested by actually following the steps in a clean environment. If you haven't tested it, don't publish it.

### 2. Show, Don't Tell

Instead of "Mouse uses coordinate-based addressing," show:

```json
{
  "tool": "quick_edit",
  "parameters": {
    "file_path": "src/app.js",
    "operation": "replace",
    "line": 42,
    "content": "const result = processData(input);"
  }
}
```

Every concept should be accompanied by a concrete, copy-pasteable example.

### 3. One Job Per Page

Each documentation page answers _one question._ The installation page answers "how do I install Mouse?" It does not also cover configuration, activation, or first use — those are separate pages with clear "Next" navigation.

### 4. Assume Intelligence, Not Context

The audience is developers — assume they're smart but don't assume they know what MCP is, what stdio transport means, or why coordinate-based editing matters. Explain concepts the first time they appear, but don't be condescending about it.

### 5. Single Source of Truth for Data

Pricing, device limits, trial duration, supported clients — these must come from `src/lib/constants.js` or be explicitly reconciled with it. The FAQ/pricing discrepancy is the object lesson. Any data that appears in documentation must match the authoritative source, and ideally should reference where to find that source.

### 6. Error Messages Are Documentation

Every error message Mouse produces should be documented with: what it means, why it happened, and how to fix it. This is the highest-ROI documentation you can write, because it's what users search for when they're frustrated.

### 7. Respect the Reader's Time

AWS docs are thorough, but they also front-load the answer. The first paragraph of every page should tell you what the page covers and whether it's the right page for your question. Developers scan, then read. Structure for scanning (headers, code blocks, tables) and ensure the scan alone provides 80% of the value.

---

## Infrastructure Decision: Content Delivery

Currently, all doc content lives as inline JavaScript objects in `[slug]/page.js`. The existing regex-based markdown renderer handles h2, h3, bold, italic, code blocks, inline code, links, lists, blockquotes, and tables. A code comment reads: "would use MDX in production."

**Recommendation for pre-launch: Stay with inline JS.** Reasons:

1. It works. The renderer handles everything needed for the Tier 1 and Tier 2 articles.
2. Migrating to MDX or a CMS is a _separate project_ that would delay documentation writing.
3. The constraint (inline JS) actually helps — it forces articles to stay focused and prevents scope creep into complex layouts.
4. Post-launch, if the docs section grows beyond ~20 articles, that's the right time to invest in MDX, a proper markdown pipeline, or a docs framework (Nextra, Fumadocs, etc.).

**One improvement worth making now:** Extract the `docsContent` object out of `[slug]/page.js` into a separate file (e.g., `src/lib/docs-content.js` or `src/data/docs/`). This separates content from rendering logic, makes articles easier to find and edit, and prepares for eventual migration to MDX or flat files without touching the page component.

---

## Writing Guidelines for Each Article

### DOC-6: VS Code + GitHub Copilot Setup

**This is the single most important new article.** Copilot has the largest user base and the most configuration nuances.

Structure:

1. **Prerequisites** — Mouse installed, Copilot extension active, VS Code 1.85+
2. **Initialize Workspace** — Command Palette → `Mouse: Initialize Workspace` → select "GitHub Copilot"
3. **What Initialize Does** — Creates `.vscode/mcp.json` with Mouse MCP server config
4. **Verify Connection** — How to confirm Copilot can see Mouse tools (e.g., ask Copilot to "use Mouse to check its status")
5. **Manual MCP Server Start** — If tools aren't available, may need to click "Start" in MCP server list; explain where to find this
6. **Copilot Instructions** — Brief mention that adding Mouse instructions to `.github/copilot-instructions.md` improves results; link to DOC-16 (agent crib sheet) when it exists
7. **Known Quirks** — Any Copilot-specific behaviors discovered during E2E verification (A3.5)
8. **`tool_search_tool_regex` Bugs** — Reference the 3 bugs documented in `docs/issues/20260217_REPORT_ON_BLOCKING_REQUIREMENT_SYSTEM_INSTRUCTIONS_ISSUE.md`: (1) false system instruction claiming MCP tools are unavailable until "discovered" via search, (2) ranking algorithm that systematically disadvantages short-description tools like `save_changes`, and (3) UI feedback layer displaying stale "blocked" messages even after the search tool is disabled. Recommend users set `"github.copilot.chat.anthropic.toolSearchTool.enabled": false` until these are resolved upstream.

### DOC-7: Cursor IDE Setup

Structure:

1. **Prerequisites** — Mouse installed from Open VSX (not VS Code Marketplace), Cursor 0.x+
2. **Install from Open VSX** — Step-by-step
3. **Initialize Workspace** — Command Palette → `Mouse: Initialize Workspace` → select "Cursor"
4. **What Initialize Does** — Creates `.cursor/mcp.json`
5. **CJS Build Note** — Mouse ships both ESM and CJS builds; Cursor uses the CJS build (automatic since v0.10.9)
6. **Verify Connection** — How to confirm Cursor agent can invoke Mouse tools
7. **Known Quirks** — Any Cursor-specific behaviors from E2E verification

### DOC-8: Common Errors

Structure:

- **Format per error:** Error message (exact text) → What it means → Why it happened → How to fix it
- **Priority errors to document:**
  1. "MCP server not found" / tools not appearing
  2. "License key invalid" / activation failure
  3. "Device limit reached"
  4. "Heartbeat failed" / offline mode triggered
  5. "File not found" (wrong path in tool call)
  6. "Line out of range" (coordinate beyond file length)
  7. "Batch operation failed — all changes rolled back"

### DOC-9: Security & Privacy Overview

**This article does more for trust-building than any other single page.** Model it after Plausible's data policy page — forthright, specific, and short.

Structure:

1. **Architecture: Local Only** — Mouse runs entirely within your editor. Code never leaves your machine. No cloud processing, no remote servers for editing operations.
2. **Network Requests: Exactly One** — The only network request Mouse makes is a license heartbeat to `api.hic-ai.com`. This checks license validity and current version. It does NOT send code, file names, file contents, keystrokes, or any workspace data.
3. **What the Heartbeat Contains** — License key, device fingerprint, extension version. That's it.
4. **What Mouse Does NOT Collect** — (bulleted list) No source code, no file contents, no file names, no directory structure, no keystrokes, no clipboard data, no telemetry, no usage analytics, no crash reports.
5. **Offline Operation** — Mouse works fully offline with a grace period after last successful heartbeat and can also be restored by simply re-entering the license key if needed. All editing operations are local and require no network.
6. **Data Protection** — All communication with api.hic-ai.com is over HTTPS/TLS. License keys are stored in VS Code's settings (user-local). No credentials are stored in plaintext files.
7. **Third-Party Services** — Cognito (authentication), Stripe (payments), Keygen (license management). Links to each service's security page. No third party receives your code.
8. **SOC 2** — "We are pursuing SOC 2 Type I certification. We don't have it yet, and we won't claim to until we do." (Honest > aspirational.)
9. **Responsible Disclosure** — security@hic-ai.com, response commitment.

---

## Dependency Map Integration

This plan refines the AP 5 scope in the dependency map:

| Dependency Map Step                      | This Plan's Equivalent     | Notes                                            |
| ---------------------------------------- | -------------------------- | ------------------------------------------------ |
| A4 (AP 5 essential items: 5.1, 5.2, 5.6) | Tier 1 (DOC-1 through DOC-10)  | Expanded from 3 items to 10; same ~6.5h estimate |
| AP 5 (remaining, pre-launch)             | Tier 2 (DOC-11 through DOC-19) | 9 articles, ~6.5h, after Tier 1 complete          |
| AP 5 (post-launch)                       | Tier 3 (DOC-20+)             | Ongoing post-launch build-out                    |

**Critical dependency remains:** DOC-6 and DOC-7 (client-specific setup guides) depend on A3.5 (E2E client verification). Don't write up installation instructions for a client you haven't tested.

**New dependency identified:** DOC-9 (Security & Privacy Overview) should be reviewed by SWR for accuracy of legal/compliance claims, similar to how AP 11.1–11.3 requires SWR review. The DOC-9 article should not make claims about GDPR compliance or data protection that haven't been verified.

---

## Execution Sequence

### Phase 1: Pre-Launch (Tier 1)

**Prerequisite:** AP 1 dead-link removal and search-bar removal complete (from AP 1 plan §1.5, §1.6).

| Order | Task                                                       | Depends On                                          | Time |
| ----- | ---------------------------------------------------------- | --------------------------------------------------- | ---- |
| 1     | Fix FAQ pricing discrepancies (DOC-10)                       | Nothing                                             | 30m  |
| 2     | Update existing 5 articles (DOC-1 through DOC-5)               | Nothing (but improves after A3.5)                   | 2.5h |
| 3     | Restructure docs index (remove dead slugs, new categories) | DOC-10, dead link removal from AP 1                   | 30m  |
| 4     | Write Security & Privacy Overview (DOC-9)                    | Nothing (but SWR review needed)                     | 1h   |
| 5     | Write Common Errors (DOC-8)                                  | A3.5 (E2E verification, for client-specific errors) | 1h   |
| 6     | Write VS Code + Copilot Setup (DOC-6)                        | A3.5 (E2E verification)                             | 1h   |
| 7     | Write Cursor Setup (DOC-7)                                   | A3.5 (E2E verification)                             | 45m  |

**Items 1–4 can begin immediately** (before A3.5 E2E verification), spending ~4.5h getting the existing content and structure right.

**Items 5–7 require A3.5 completion** (E2E client verification), adding ~2.75h after that prerequisite is met.

### Phase 2: Pre-Launch Continued (Tier 2)

Write DOC-11 through DOC-19 in priority order:

| Priority | Article                              | Reason                                  |
| -------- | ------------------------------------ | --------------------------------------- |
| 1        | DOC-12: Dialog Box Review              | Central to safety-net value prop        |
| 2        | DOC-16: AI Agent Crib Sheet (Copilot)  | Directly increases product value        |
| 3        | DOC-11: Batch Editing                  | Completes core concepts                 |
| 4        | DOC-17: Agent Prompting Best Practices | Increases product value for all clients |
| 5        | DOC-13: Kiro Setup                     | Third IDE coverage                      |
| 6        | DOC-14: Claude Code CLI Setup          | Power user coverage                     |
| 7        | DOC-15: Other Agents Setup (Roo Code, Cline, Kilo Code, CodeGPT) | Complete client coverage |
| 8        | DOC-18: License Issues                 | Support deflection                      |
| 9        | DOC-19: Getting Help                   | Support channel clarity                 |

### Phase 3: Post-Launch (Tier 3)

Driven by user feedback and support ticket patterns. The most common support question should become the next documentation article. Track what users ask about in Discord/email/GitHub Issues and let that drive the writing priority.

---

## What Great Looks Like: The AWS Parallel

You asked about the AWS comparison. Here's the specific parallel:

| AWS Docs Quality                              | Mouse Docs Equivalent                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| **Every service has a Getting Started**       | Every supported client has an Integration Guide                          |
| **Transparent pricing with calculator**       | Single-source pricing on `/pricing`, reconciled across FAQ and docs      |
| **Security whitepaper**                       | Security & Privacy Overview (DOC-9) — forthright and specific              |
| **Troubleshooting with exact error messages** | Common Errors (DOC-8) — searchable by error text                           |
| **API reference for every call**              | Tool Reference for each Mouse operation (Tier 3)                         |
| **Best practices guides**                     | AI Agent Crib Sheets — unique to Mouse's position as an AI-consumed tool |
| **FAQs per service**                          | Comprehensive FAQ already exists (27 Q&As) — fix and maintain            |

The key difference: AWS has hundreds of people writing docs. You have an AI agent and yourself. The strategy is therefore: **be excellent where it matters most (getting started, security, troubleshooting), be adequate everywhere else, and be honest about gaps by not listing content that doesn't exist.**

---

## The "Contact Sales" Concern

You mentioned a "Contact Sales" refrain. For context: the pricing page shows "Contact Sales" only for Enterprise SSO — which is appropriate because SSO implementation genuinely needs a conversation. For Individual and Business plans, pricing is fully transparent and self-service. This is the right approach: transparent self-service pricing for the majority of users, human conversation only where the scope is genuinely variable.

If you're concerned about _perception_ of "Contact Sales" appearing anywhere, consider renaming it to "Let's Talk" or "Schedule a Call" — same function, less corporate-wall connotation. But this is a minor wording issue, not a transparency issue. Your pricing is actually very clear.

---

## Relationship to Other Action Plans

| AP                                | Relationship to AP 5                                                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **AP 1 (UX Polish)**              | AP 1 §1.5 (remove dead docs links) and §1.6 (remove search bar) are **prerequisites** for AP 5. Must complete first. |
| **AP 2a (Surface Security)**      | Security Overview doc (DOC-9) should align with AP 2a findings.                                                        |
| **AP 6 (Support Infrastructure)** | AP 5 reduces support volume. AP 6 references docs. Getting Help (DOC-19) bridges the two.                              |
| **AP 8 (AR) Payment Integration** | Tier 1 docs are a **hard dependency** for production launch (and would satisfy any future MoR reviewer if contingency path activated). |
| **AP 9.1–9.7 (E2E Verification)** | Integration guides (DOC-6, DOC-7) are **hard dependents** on E2E verification.                                           |
| **AP 11 (Legal)**                 | DOC-9 (Security Overview) should be reviewed alongside Privacy Policy for consistency.                                 |

---

## Open Questions for SWR

1. **Content review cadence:** Should each doc article go through SWR review before publishing, or is a batch review after Tier 1 is complete acceptable? (Recommendation: batch review for Tier 1, individual review only for DOC-9 Security and DOC-10 Billing since those have legal/financial implications.)

2. **Supported clients for docs:** The dependency map includes 5 clients for E2E testing (Copilot, Cursor, Kiro, Claude Code CLI, Roo Code). Should all 5 get Tier 1 integration guides, or is Copilot + Cursor sufficient for launch, with the other 3 in Tier 2? (Recommendation: Copilot + Cursor in Tier 1, others in Tier 2.)

3. **AI Agent Crib Sheets priority:** The crib sheets (DOC-16, DOC-17) are in Tier 2, but they directly increase product value and could differentiate Mouse during evaluation. Should one (the Copilot crib sheet) be promoted to Tier 1? (Recommendation: Keep in Tier 2 — pre-launch focus should be on installation, setup, and troubleshooting, but real users will benefit hugely from crib sheets post-launch.)

4. **Research paper in docs:** The research paper is available at `/research` with a downloadable PDF. Should it also be referenced from the docs section? (Recommendation: Yes — add a "Research & Evidence" link in the docs index that points to `/research`, but don't duplicate the content.)

---

## Summary

| Tier                                | Articles                                             | Effort  | Gate           |
| ----------------------------------- | ---------------------------------------------------- | ------- | -------------- |
| **Tier 1** (Must-have for launch)   | 10 articles (5 existing updated + 4 new + 1 FAQ fix) | ~6.5h   | Production launch |
| **Tier 2** (Should-have for launch) | 9 articles                                           | ~6.5h   | Launch         |
| **Tier 3** (Post-launch)            | 20+ articles                                         | Ongoing | User feedback  |

The documentation doesn't need to be AWS-scale. It needs to be _accurate, functional, and honest._ Nine to ten real articles covering installation, concepts, security, and troubleshooting — with no dead links, no fake search bars, and no pricing contradictions — will clear the production-readiness bar and give early users a credible resource. The AI Agent Crib Sheets in Tier 2 are the unique differentiator that no competitor has, and the ongoing Tier 3 build-out driven by real user questions will compound over time.

The goal is not to document everything before launch. The goal is to document the right things, accurately, and make it obvious where to go next.

---

## Document History

| Date       | Author | Changes                                                    |
| ---------- | ------ | ---------------------------------------------------------- |
| 2026-02-16 | GC     | Initial document — full documentation strategy with triage |
| 2026-02-18 | GC     | v2: Reframed triage from "LS application gate" to "production launch gate" — SMP is now primary payment path (no third-party MoR reviewer). Updated canonical pricing references. LS/Paddle MoR reviewer language replaced with customer/production-readiness framing throughout. Tier structure and content plan unchanged. |
