# AP 12: Social Media, SEO & Content Distribution Plan

**Date:** February 18, 2026
**Author:** General Counsel
**Status:** Not started
**Priority:** Pre-MoR (Phases 1–2) + Pre-launch (Phase 3) + Ongoing (Phase 4)
**Estimated total effort:** 12–18 hours (excluding ongoing Phase 4 cadence)
**Dependencies:** AP 0 item 0.3 (Twitter/X account research), AP 13 (private disclosures gate LinkedIn update)
**Replaces/consolidates:** Former AP 12 (2-item personal cleanup), former AP 8.3 (social media for MoR), social media elements of OI-2

---

## Table of Contents

1. [Purpose & Scope](#1-purpose--scope)
2. [Strategic Context](#2-strategic-context)
3. [Phase 1: Personal Account Audit & Cleanup](#3-phase-1-personal-account-audit--cleanup)
4. [Phase 2: Minimal MoR-Ready Presence](#4-phase-2-minimal-mor-ready-presence)
5. [Phase 3: Pre-Launch Foundation](#5-phase-3-pre-launch-foundation)
6. [Phase 4: Post-Launch Content Engine](#6-phase-4-post-launch-content-engine)
7. [SEO Strategy](#7-seo-strategy)
8. [Content Distribution Workflow](#8-content-distribution-workflow)
9. [Platform-Specific Guidance](#9-platform-specific-guidance)
10. [Disclosure Sequencing & Timing Constraints](#10-disclosure-sequencing--timing-constraints)
11. [Sustainability for a Solo Founder](#11-sustainability-for-a-solo-founder)
12. [Definition of Done (by Phase)](#12-definition-of-done-by-phase)

---

## 1. Purpose & Scope

This plan addresses four objectives:

1. **Personal account hygiene** — audit SWR's existing personal social media accounts across all major platforms, identify duplicates or abandoned accounts, and either consolidate, deactivate, or delete as appropriate.
2. **MoR application readiness** — establish the minimum viable social media presence that demonstrates legitimacy to LS, Paddle, or any MoR reviewer. LS previously rejected (Jan 30, 2026) citing "no website or social media presence." This time the application must clear that bar on the first attempt.
3. **Pre-launch foundation** — create a content infrastructure that makes post-launch amplification effortless rather than frantic.
4. **Post-launch content engine** — define a sustainable, recurring cadence for content creation and distribution that drives traffic to the funnel (extension install entrypoints + website → Marketplace/Open VSX links) without burning out a solo founder who dislikes social media.

Additionally, this plan incorporates an **SEO strategy** integrated with the content distribution approach, because the two are mutually reinforcing. Mouse's competitive positioning on "AI slop" — a term with significant search volume and zero proven solutions — represents a rare organic search opportunity that would be a missed opportunity if not deliberately pursued.

**Out of scope:** AP 13 (private pre-launch disclosures). AP 13 remains a separate plan for personal, in-person conversations. The only interface between AP 12 and AP 13 is a hard dependency: LinkedIn profile update (Phase 3, item 3.6) cannot happen until AP 13 is complete.

---

## 2. Strategic Context

### The LS Rejection Lesson

> **January 30, 2026:** Lemon Squeezy declined the MoR application — reason: "no website or social media presence."

This was a binary pass/fail gate. The reapplication must present:
- A live, professional website (staging.hic-ai.com is live; production hic-ai.com will be live by application time per AP 4)
- Active social media accounts with real content (not freshly-created empty profiles)
- Evidence of a real business building a real product

### SWR's Relationship with Social Media

SWR has a strong personal preference against social media use. This plan acknowledges that reality and designs around it:
- Minimize time-per-week commitment
- Favor write-once-distribute-many workflows
- Prioritize platforms where developers actually congregate
- Design for content that SWR enjoys producing (technical writing, research analysis) over content SWR finds burdensome (video editing, frequent hot-takes)

### The Funnel

All social media activity exists to drive traffic through one funnel:

```
Content (blog / article / video / post)
  → Website (hic-ai.com)
    → Extension Install (Marketplace, Open VSX, Manual VSIX)
      → Free Trial (14-day)
        → Paid Subscription
```

Every piece of content should contain or link to the "top of funnel" — the website, which in turn links to installation paths. The website already has (or will have per AP 1) links to VS Code Marketplace and Open VSX.

### The "AI Slop" Opportunity

Mouse's tagline is "The first proven treatment for execution slop." The website metadata already uses this language. The `/research` page presents peer-review-ready data: 67 paired trials, 3 preregistered studies, statistically significant results.

**Search landscape (Feb 2026):** "AI slop" is a widely discussed problem. Merriam-Webster named "slop" its 2025 Word of the Year. But nobody is claiming to have a proven, data-backed solution. Mouse has:
- Rigorous statistical analysis
- Reproducible benchmarks
- A working product
- A research page that already exists

This creates a rare SEO moat: Mouse can credibly answer the search query "how to fix AI slop" with data, not opinions. This opportunity is time-sensitive — competitors will eventually enter this space.

---

## 3. Phase 1: Personal Account Audit & Cleanup

**Effort:** 1.5–2 hours | **When:** Anytime (no dependencies; can run in parallel with AP 0)

SWR should systematically audit all personal social media accounts. The goals are:
- Know exactly what exists under SWR's name/email
- Eliminate abandoned or duplicate accounts that could create confusion
- Ensure no personal account conflicts with or undermines the professional HIC AI presence

### 3.1 Platform Audit Checklist

For each platform, SWR should check: Does an account exist? Under which email(s)? Active or dormant? Personal content that should be preserved?

| # | Platform | Action | Effort | Notes |
|---|----------|--------|--------|-------|
| 1.1 | **Facebook** | Search for account(s) under all known emails. If found: deactivate or delete. Zero business value for a developer tools product. | 15m | Reduces personal surface area. No disclosure risk — Facebook deletion is invisible to professional network. |
| 1.2 | **Instagram** | Search for account(s) under all known emails. If found: deactivate or delete. Minimal developer audience. | 15m | Same rationale as Facebook. If SWR can't recall creating one, it may not exist — but worth checking. |
| 1.3 | **LinkedIn** | Locate primary profile. Check for duplicates. **Do NOT update yet** — LinkedIn is the irreversible disclosure event (Phase 3, gated by AP 13). | 15m | Note current state: headline, about section, experience entries. Plan the update content but don't execute until AP 13 clears. |
| 1.4 | **Twitter/X** | Search for existing personal account under all known emails. Note: AP 0 item 0.3 researches whether a personal account is required to create a business account. | 15m | If a personal account exists, note the handle and whether it has any content or followers. This informs D-5 (Still open). |
| 1.5 | **YouTube** | Check for existing Google account's YouTube channel. May exist automatically via Google account. | 10m | YouTube channels are created automatically with Google accounts. Check if one already exists, what it's named, whether it has any content. |
| 1.6 | **Reddit** | Search for existing account(s). If found: assess whether to keep for personal use (separate from HIC AI) or consolidate. | 10m | Reddit is pseudonymous — personal and professional accounts can coexist cleanly. Note: SWR may want a dedicated `hic-ai` or `mouse-hic` Reddit account for product posts. |
| 1.7 | **Discord** | Check for existing account(s). One will be needed for the HIC AI Discord server (AP 6 item 6.3). | 10m | Discord accounts are typically email-based. SWR's existing account (if any) can own the HIC AI server. |
| 1.8 | **Slack** | Check for accounts on any developer-relevant Slack workspaces (e.g., VS Code community, relevant open-source projects). | 10m | Slack is workspace-based, not profile-based. Low priority. Note any existing presences. |
| 1.9 | **dev.to / Hashnode** | Check for existing accounts. If none, plan to create during Phase 3 (content infrastructure). | 10m | Key developer blogging platforms. Cross-posting target. |
| 1.10 | **Hacker News** | Check for existing account. If none, create one. HN accounts age matters for credibility; an older account with some history reads better than a brand-new one posting a "Show HN." | 10m | If no account exists, creating one now (even with minimal activity) gives it a few weeks of age before the Show HN post. |

### 3.2 Deliverable

A brief personal inventory note (for SWR's reference only — not committed to repo):
- Which platforms have accounts, under which email
- Which accounts to delete/deactivate (Facebook, Instagram, any duplicates)
- Which accounts to preserve/create (LinkedIn, Twitter/X, YouTube, Reddit, Discord, HN, dev.to)
- Any content worth preserving before deletion

**Done when:** SWR has verified every platform, deleted/deactivated Facebook and Instagram (if they exist), and has a clear picture of the starting state for Phase 2.

---

## 4. Phase 2: Minimal MoR-Ready Presence

**Effort:** 2–3 hours | **When:** During early Track A (before MoR application submission) | **Dependencies:** AP 0 item 0.3 (Twitter/X research) complete; Phase 1 audit complete

The goal is **not** to build a thriving social media presence. The goal is to cross the threshold that an MoR reviewer (LS or Paddle) would consider "has a social media presence." The Jan 30 rejection was for *zero* presence, not *insufficient* presence.

### 4.1 What MoR Reviewers Look For

MoR reviewers assess legitimacy. They want to see:
- A real business with a real product (website handles this)
- Some evidence of public communication (social accounts with content)
- Not a fly-by-night operation or fraud attempt

They do **not** require:
- Large followings
- Frequent posting history
- Presence on every platform

### 4.2 Minimum Viable Accounts

| # | Platform | Account Type | Required Content | Effort | Notes |
|---|----------|-------------|-----------------|--------|-------|
| 2.1 | **Twitter/X** | `@hic_ai` (business) or equivalent available handle | 3–5 tweets: product announcement, link to website, link to research page, a technical insight | 1h | The website already references `https://twitter.com/hic_ai` in `constants.js`, `about/page.js` structured data, and `layout.js` Twitter card meta. **This handle must match.** If it's taken, update all code references. |
| 2.2 | **GitHub** | `hic-ai-inc` org (already exists) | Ensure org profile has description, website link, avatar | 15m | Already exists at `https://github.com/hic-ai-inc`. Confirm public repos are visible and the `mouse` repo (if public) has a proper README. |
| 2.3 | **LinkedIn** (Company Page) | HIC AI, Inc. company page | Basic company info, logo, description, website link, 1–2 posts | 30m | **Critical distinction:** A *company page* is not the same as SWR's *personal profile update*. A company page can be created without updating SWR's personal profile. The company page does not trigger the same professional network disclosure risk as a personal profile update. SWR's personal LinkedIn update (Phase 3, item 3.6) remains gated by AP 13. |
| 2.4 | **Website** | Already live | Ensure social links in footer/header point to real, active accounts | 15m | Update `EXTERNAL_URLS` in `constants.js` if any handles change. Verify the structured data `sameAs` array in `about/page.js` matches. |

### 4.3 Content for Initial Tweets/Posts

The initial content batch should demonstrate that HIC AI is a legitimate, active business. Suggested seed content:

1. **Product announcement:** "Mouse: precision file-editing MCP tools for AI coding agents. The first proven treatment for Execution Slop. [link to hic-ai.com]"
2. **Research highlight:** "67 paired trials. 3 preregistered studies. Statistically significant results. Mouse reduces file-editing failures by AI agents. Read the research: [link to /research]"
3. **Technical insight:** A brief, genuinely useful observation about MCP tool design, AI agent behavior, or code editing reliability — something a developer would find interesting independent of Mouse.
4. **"Building in public" signal:** "Building AI coding tools as a solo founder. Mouse is live and in beta — website and docs at hic-ai.com."

These four posts, spaced over a few days, create the appearance of an active, legitimate account — which it is, just nascent.

### 4.4 MoR Application Social Media Checklist

Before submitting LS / Paddle / any MoR applications, verify:

- [ ] Twitter/X account exists, has 3+ posts with real content, links to website
- [ ] GitHub org is public, has avatar, description, website URL
- [ ] LinkedIn company page exists with basic info (personal profile update NOT required)
- [ ] Website social links point to real, active accounts (not placeholder URLs)
- [ ] Website structured data (`sameAs` array in `about/page.js`) matches actual accounts
- [ ] Website Twitter card meta in `layout.js` points to correct handle
- [ ] Include social media links in MoR application where the form requests them

**Done when:** All checklist items verified. MoR application(s) can be submitted with confidence that the "no social media presence" rejection will not recur.

---

## 5. Phase 3: Pre-Launch Foundation

**Effort:** 4–6 hours | **When:** During MoR review wait window (overlaps with Track B work) | **Dependencies:** Phase 2 complete; AP 13 complete (for item 3.6 only)

This phase builds the infrastructure for sustained post-launch content distribution. The goal is to have everything ready so that on launch day, amplifying the launch is a matter of pushing a button, not building a system.

### 5.1 Content Infrastructure

| # | Item | Effort | Notes |
|---|------|--------|-------|
| 3.1 | **Blog infrastructure** — Add `/blog` route to Next.js website with MDX or Markdown support | 2h | This is the content hub. Every other platform gets a summary + link back here. Blog posts live on `hic-ai.com/blog`, giving SEO value to the domain. If full blog infra is too heavy pre-launch, a `/blog` page that links to external dev.to posts is an acceptable interim step. |
| 3.2 | **dev.to account** — Create `hic-ai` or `mouse-hic-ai` organization or personal dev.to account | 15m | Dev.to supports canonical URL tags — posts can point back to `hic-ai.com/blog` as the canonical source, preserving SEO value while getting dev.to's distribution. |
| 3.3 | **YouTube channel** — Create HIC AI channel (or rename existing if one exists via Google account) | 30m | Upload channel avatar, banner, description with links. Don't need any videos yet — just the channel ready for the demo video. |
| 3.4 | **Reddit account** — Create or designate a Reddit account for HIC AI product posts | 15m | Separate from SWR personal Reddit (if any). Will be used for r/programming, r/vscode, r/artificial, r/MachineLearning, r/ExperiencedDevs posts. **Note:** New Reddit accounts have posting restrictions in many subreddits. Creating the account now gives it age and some karma before launch day. |
| 3.5 | **Hacker News account** — Ensure account exists and has some non-promotional comment history | 15m | HN is allergic to purely promotional accounts. If the account was created in Phase 1, use the wait window to leave a few genuine, thoughtful comments on relevant threads (AI tooling, developer experience, code editing). This builds credibility before the Show HN post. |
| 3.6 | **LinkedIn personal profile update** — Update headline, about section, add HIC AI Inc. experience entry | 30m | **GATED BY AP 13.** This is the irreversible professional network disclosure. Do not execute until SWR confirms all private disclosures are complete and silence period observed. |

### 5.2 Pre-Launch Content Drafts

Prepare these during the MoR wait window so they're ready to publish on launch day:

| # | Content Piece | Platform(s) | Effort | Notes |
|---|---------------|-------------|--------|-------|
| 3.7 | **"Show HN" post draft** | Hacker News | 1h | Title: "Show HN: Mouse – Precision editing tools for AI agents (67 trials, statistically significant)." Body: concise, technical, honest about what it is and isn't. HN rewards understatement. Link to website. |
| 3.8 | **Launch blog post** — "Why I Built Mouse" or "The AI Slop Problem Nobody's Solving" | Blog (website or dev.to) | 1–2h | The cornerstone content piece. Tells the story: the problem (Execution Slop), why it matters, what SWR built, the research backing. This is the article that gets linked from everywhere else. |
| 3.9 | **Demo video** — Mouse in action across VS Code / Copilot, Cursor, Kiro | YouTube | 2–3h recording + light editing | See §9.5 for video production guidance. This is a "v1 demo" — screen recording with voice narration, minimal editing. Not polished; authentic. |
| 3.10 | **Twitter/X launch thread draft** | Twitter/X | 30m | 5–8 tweet thread: problem → solution → data → demo → try it. Prepared in advance, posted on launch day. |
| 3.11 | **Reddit posts draft** | Reddit | 30m | Adapt the blog post into subreddit-appropriate formats. Each subreddit has different norms — r/vscode wants specific technical detail; r/programming wants broader context; r/artificial wants AI implications. |

**Done when:** Blog infrastructure exists (or dev.to account ready as interim), YouTube channel created, all content drafts written and reviewed, LinkedIn update content planned (not yet published).

---

## 6. Phase 4: Post-Launch Content Engine

**Effort:** ~2–3 hours/week ongoing | **When:** Post-launch, indefinite

### 6.1 Content Cadence

A sustainable rhythm for a solo founder who dislikes social media:

| Frequency | Content Type | Platform(s) | Time | Notes |
|-----------|-------------|-------------|------|-------|
| **Weekly** | Technical blog post or article | Blog → dev.to → Twitter/X → Reddit → LinkedIn | 1.5–2h | This is the engine. One piece of substantive content per week, distributed everywhere. Topics: new features, technical deep-dives, AI agent behavior observations, benchmark updates, customer stories. |
| **Per release** | Changelog + release tweet | Twitter/X, blog, GitHub releases | 30m | Every extension update gets a brief "what's new" post. |
| **Monthly** | YouTube video (when feasible) | YouTube → Twitter/X → Reddit | 2–4h per video (infrequent; see §9.5) | Do not commit to a schedule for videos. Make them when there's something genuinely worth showing and when the production burden is manageable. Quality > frequency. |
| **Ad hoc** | Community responses | Discord, GitHub Issues, HN, Reddit | 30m/day | Respond to questions, issues, and discussions. This is customer engagement, not content creation — but it builds reputation and surfaces blog post ideas. |

### 6.2 Content Categories

Recurring topic categories that generate indefinite material:

| Category | Example Titles | SEO Value |
|----------|---------------|-----------|
| **Benchmark updates** | "Mouse v0.11: 23% fewer edit failures — here's the data" | High — reinforces "proven treatment" positioning |
| **Technical deep-dives** | "How coordinate-based editing eliminates line drift" | High — long-tail keyword capture |
| **AI agent behavior** | "What Claude does differently from GPT when editing files" | Very high — people search for AI model comparisons |
| **Build journal** | "Building a VS Code extension as a solo founder: month 3" | Medium — builds community, shows authenticity |
| **Customer stories** | "How [user] reduced their edit failure rate by X%" | High — social proof + use-case keywords |
| **Execution Slop series** | "Execution Slop: what it is, why it happens, how to fix it" | Very high — owns the category term |

### 6.3 Write-Once-Distribute-Many Workflow

To minimize time burden, every content piece follows one path:

1. **Write the blog post** on the website (or dev.to as interim)
2. **Auto-extract:** Title + first paragraph → Twitter thread. Key insight → LinkedIn post. Full text → dev.to (with canonical URL pointing to website). Summary → Reddit post (subreddit-appropriate).
3. **Cross-link:** Every distributed post links back to the blog post on `hic-ai.com/blog`

This means SWR writes **one thing per week** and distributes it mechanically. The distribution step should take < 30 minutes.

---

## 7. SEO Strategy

### 7.1 The Opportunity

Mouse occupies a unique position: it's the only product with **data-backed claims** about reducing AI coding failures. The search landscape for "AI slop" related terms is:
- High interest (widespread awareness post-Merriam-Webster Word of the Year)
- Zero solutions (everyone discusses the problem; nobody claims to fix it)
- Growing volume (AI tool adoption continues to accelerate)

The website already has foundational SEO in place:
- Meta title: "Mouse — Precision Editing Tools for AI Coding Agents"
- Meta description: "The first proven treatment for execution slop."
- Keywords: "precision editing", "AI coding agents", "execution slop"
- Open Graph and Twitter Card meta tags configured
- Structured data (JSON-LD) on `/about` page
- `/research` page with detailed statistical methodology

### 7.2 Target Keywords

**Primary cluster — "AI slop" (high volume, zero competition for solutions):**

| Keyword | Search Intent | Target Page | Current Position |
|---------|--------------|-------------|-----------------|
| "AI slop" | Informational | Blog post: "What is Execution Slop?" | Not ranked |
| "how to fix AI slop" | Solution-seeking | Blog post + `/research` | Not ranked |
| "how to reduce AI slop" | Solution-seeking | Blog post + `/features` | Not ranked |
| "how to get rid of AI slop" | Solution-seeking | Blog post + `/research` | Not ranked |
| "AI slop in code" | Informational/solution | Blog post + `/features` | Not ranked |
| "execution slop" | Branded/informational | `/` (homepage) + `/features` | Likely first (owned term) |

**Secondary cluster — "AI coding tools" (competitive but relevant):**

| Keyword | Search Intent | Target Page |
|---------|--------------|-------------|
| "AI code editor" | Comparison/discovery | Homepage |
| "AI coding agent tools" | Discovery | `/features` |
| "Mouse AI" / "Mouse code editor" | Branded | Homepage |
| "MCP tools for coding" | Technical | `/docs` + blog |
| "VS Code AI extension" | Discovery | Homepage + Marketplace listing |

**Long-tail cluster — technical (low competition, high conversion):**

| Keyword | Target Content |
|---------|---------------|
| "coordinate-based editing AI" | Blog deep-dive + `/features` |
| "AI file editing failures" | Blog post + `/research` |
| "line drift problem AI coding" | Blog deep-dive |
| "atomic file editing MCP" | `/docs` + blog |
| "AI agent precision editing" | `/features` + blog |

### 7.3 SEO Action Items

| # | Item | Effort | Priority | Phase |
|---|------|--------|----------|-------|
| 7.1 | **Title tag optimization** — Ensure each page has a unique, keyword-rich `<title>`. Homepage should target "AI slop" cluster. | 30m | High | Pre-MoR (AP 1 overlap) |
| 7.2 | **Meta description optimization** — Each page should have a compelling, unique meta description containing target keywords. Currently some pages may share the default from `layout.js`. | 30m | High | Pre-MoR (AP 1 overlap) |
| 7.3 | **Cornerstone "AI Slop" content page** — Either a dedicated `/blog/what-is-execution-slop` article or expansion of the `/features` page. Must comprehensively define the problem, cite the research, and present Mouse as the solution. This is the page that ranks for "how to fix AI slop." | 2h | High | Phase 3 (MoR wait) |
| 7.4 | **Internal linking audit** — Ensure all pages cross-link to the cornerstone content. The `/research` page should link to the explanation; the explanation should link to `/research`; both should link to `/features` and trial signup. | 30m | Medium | Pre-launch |
| 7.5 | **Schema.org structured data expansion** — Add `SoftwareApplication` schema to homepage (currently only on `/about`). Add `ScholarlyArticle` or `TechArticle` schema to `/research`. Add `FAQPage` schema to `/faq`. | 1h | Medium | Pre-launch |
| 7.6 | **Sitemap and robots.txt** — Verify Next.js generates a proper sitemap. Submit to Google Search Console. | 15m | High | Pre-MoR |
| 7.7 | **Google Search Console setup** — Register `hic-ai.com`, verify ownership (DNS TXT or HTML file), monitor indexing status. | 15m | High | Pre-MoR |
| 7.8 | **Open Graph image validation** — The `layout.js` references `/images/og-image.png`. AP 1 item 1.8 already flags verification that this URL resolves. Confirm dimensions (1200x630) and that the image is compelling. | 15m | High | Pre-MoR (AP 1) |
| 7.9 | **Blog post SEO discipline** — Every blog post targets 1–2 keywords, has a proper H1, uses keyword in URL slug, first paragraph, and subheadings. Include internal links to at least 2 other pages on the site. | Ongoing | High | Phase 4 |
| 7.10 | **Backlink strategy (organic)** — Publish research summary on dev.to (with canonical URL). Answer questions on Stack Overflow / Reddit about AI code editing. Guest post on AI-focused blogs. Each backlink to `hic-ai.com` improves domain authority. | Ongoing | Medium | Phase 4 |
| 7.11 | **Marketplace listing SEO** — VS Code Marketplace listing (once published) should use target keywords in title, description, and tags. Marketplace listings rank in Google. | 30m | High | Pre-launch |

### 7.4 Competitive Moat

The SEO advantage is **first-mover** combined with **evidence-based claims**. Competitors can eventually build similar tools, but Mouse will have:
- The earliest published research with statistical analysis
- The most backlinks and content history
- Domain authority built through consistent technical content
- Ownership of the "Execution Slop" term (which SWR coined, and which the website defines)

This advantage compounds over time. Starting now, even with minimal effort, builds a foundation that becomes increasingly difficult for competitors to replicate.

---

## 8. Content Distribution Workflow

### 8.1 Per-Article Workflow (Weekly)

```
1. Write article (blog or dev.to)                           ~1.5h
2. Post to dev.to with canonical URL → hic-ai.com/blog/...  ~10m
3. Tweet thread (3-5 tweets summarizing key insight + link)  ~10m
4. Reddit post to 1-2 relevant subreddits                   ~10m
5. LinkedIn post (if appropriate for the topic)              ~5m
6. Total distribution time: ~35 minutes
```

### 8.2 Per-Release Workflow

```
1. Update CHANGELOG                                          ~15m
2. GitHub Release with notes                                  ~10m
3. Tweet: "Mouse vX.Y.Z — [headline feature]. [link]"        ~5m
4. Blog post only if release is significant                   ~optional
```

### 8.3 Launch Day Workflow

Pre-drafted content (from Phase 3) published in sequence:

```
1. Blog post goes live                                        ~5m (already written)
2. HN "Show HN" post                                         ~5m
3. Twitter/X launch thread                                    ~5m (already drafted)
4. Reddit posts (r/programming, r/vscode, r/artificial)       ~15m
5. dev.to cross-post                                          ~10m
6. LinkedIn post                                              ~5m
7. Product Hunt launch (if page prepared)                     ~10m
8. Email to any early-access list                             ~10m
```

---

## 9. Platform-Specific Guidance

### 9.1 Twitter/X

**Handle:** `@hic_ai` (currently referenced in website code — verify availability)
**Voice:** Technical, data-driven, understated. Not promotional. Think "engineer sharing findings" not "startup marketing."
**Cadence:** 3–5 tweets/week. Most are links to blog posts or technical observations. Occasional engagement with AI/dev tool conversations.
**Key value:** Fast distribution, developer audience, link embedding for SEO (nofollow but still drives traffic).

### 9.2 Hacker News

**Strategy:** Show HN is the highest-leverage single post for developer tool adoption. HN also rewards ongoing authentic participation.
**Rules:** No self-promotion outside Show HN. Comments should be genuinely helpful. Let others share the blog posts organically. If someone posts a Mouse-related link, SWR can comment as the creator but should not be the one submitting it repeatedly.
**Timing:** Show HN on launch day. Aim for early morning US Eastern time (9–10am) for maximum visibility.

### 9.3 Reddit

**Subreddits:**
- `r/programming` (~5M members) — technical content, link posts OK
- `r/vscode` (~300K) — directly relevant audience
- `r/artificial` (~700K) — AI-focused, interested in agent tooling
- `r/ExperiencedDevs` (~200K) — senior developers who understand the problem
- `r/MachineLearning` (~3M) — more academic; research angle works here

**Rules:** Each subreddit has different self-promotion rules. Read them. Most allow occasional self-promotional posts if the account has genuine non-promotional history. This is why Phase 3 includes building some comment karma first.

### 9.4 dev.to

**Strategy:** Cross-post every blog article with `canonical_url` pointing to `hic-ai.com/blog/...`. Dev.to has strong Google indexing and a built-in developer audience. The canonical URL ensures dev.to content funnels SEO value to the primary domain rather than competing with it.
**Tags:** `#ai`, `#vscode`, `#devtools`, `#productivity`, `#codeeditor`

### 9.5 YouTube

**Realistic assessment:** SWR finds video production time-consuming and labor-intensive. The plan must respect this constraint.

**V1 approach (launch):**
- One demo video: 3–5 minutes
- Screen recording with voice narration (OBS Studio or similar)
- No fancy editing — cuts only for obvious mistakes
- Show Mouse working across 2–3 clients (VS Code, Cursor, Kiro)
- Record in one take if possible; accept imperfections
- Title optimized for search: "Mouse: AI Agent Precision Editing Tools — Demo" or "How to Fix AI Code Editing Failures — Mouse Demo"

**Future approach (when/if process becomes easier):**
- AI-assisted video editing tools are improving rapidly — reassess quarterly
- Consider tools like Descript (text-based editing), Loom (quick capture), or AI summarization services
- Short-form clips (30–60 seconds) extracted from longer demos for Twitter/LinkedIn
- Never commit to a schedule. Publish videos when the value justifies the effort.

**Bottom line:** One demo video for launch. Additional videos only when something genuinely warrants showing and the production burden is manageable. Do not let perfect be the enemy of filmed.

### 9.6 LinkedIn

**Company page:** Professional, minimal content. Company description, logo, website link, 1–2 posts about the product.
**Personal profile:** Updated only after AP 13 private disclosures. Headline: something like "Founder @ HIC AI | Building precision tools for AI coding agents." Experience entry for HIC AI, Inc. Brief, professional, understated.
**Ongoing:** Share blog posts when the topic is relevant to the LinkedIn audience (which skews more enterprise/management than developer). Not every blog post needs a LinkedIn share — only those with broader industry relevance.

### 9.7 Product Hunt

**Timing:** Not launch day. PH launches benefit from preparation (hunter network, teaser page, coordinated upvotes). Consider 1–2 weeks post-launch, once initial bugs are squashed and the first wave of user feedback is incorporated.
**Prep during Phase 3:** Create PH product page, upload screenshots, write tagline. Find a PH hunter (someone with an established PH following) who's willing to submit it.

---

## 10. Disclosure Sequencing & Timing Constraints

These constraints are inviolable:

| Constraint | Reason | Impact |
|-----------|--------|--------|
| **LinkedIn personal profile** cannot be updated until AP 13 is complete | Irreversible disclosure to professional network, including law firm partner | Phase 3, item 3.6 blocked |
| **LinkedIn company page** can be created before AP 13 | Company pages are less discoverable to personal connections; lower disclosure risk | Phase 2 OK |
| **Twitter/X business account** can be created before AP 13 | Less fraught than LinkedIn for professional network disclosure (per SWR); pseudonymous discovery less likely | Phase 2 OK, but use judgment |
| **Any public "by [SWR full name]" attribution** gates on AP 13 | Blog post bylines, YouTube channel "about" with full name, etc. | If pre-AP 13 content needs attribution, use "HIC AI" not SWR's name |
| **MoR application** does not require LinkedIn personal update | Applications need business social presence, not founder personal profile | Phase 2 sufficient for MoR |

---

## 11. Sustainability for a Solo Founder

### 11.1 Time Budget

| Activity | Time/Week | Notes |
|----------|-----------|-------|
| Write one blog post | 1.5h | The core content creation — everything else derives from this |
| Distribute to all platforms | 30m | Mechanical; see §8.1 workflow |
| Community engagement (Discord, GH Issues, HN, Reddit) | 30m | Reactive, not proactive — respond when someone engages |
| **Total** | **~2.5h/week** | Sustainable indefinitely. Increase only when it feels right, not because a plan says to. |

### 11.2 Principles

1. **Write what you find interesting.** Technical deep-dives and research analysis, not "engagement bait." If SWR is genuinely interested in the topic, the writing will be good. If not, skip it.
2. **Batch and schedule.** Write on the day of the week that works best. Schedule distribution for the next day. Don't check social media outside of those windows.
3. **Don't chase metrics.** Early-stage developer tools grow through product quality and word-of-mouth, not follower counts. Social media exists to plant seeds.
4. **Delegate distribution eventually.** When revenue justifies it, hire a part-time content assistant or use an AI writing assistant to draft distribution posts from the blog content. SWR's time should be on product and technical writing.
5. **Social media as a funnel, not a lifestyle.** The goal is to drive traffic to the website and extension installs. Every post should contain a link. If a post doesn't serve the funnel, it's optional.

### 11.3 Tools to Reduce Friction

| Tool | Purpose | Cost |
|------|---------|------|
| **Buffer** or **Typefully** | Schedule tweets, cross-post | Free tier or ~$15/mo |
| **dev.to** canonical URLs | Cross-post blogs without SEO penalty | Free |
| **OBS Studio** | Screen recording for videos | Free |
| **Descript** (future) | Text-based video editing | $24/mo — only if video becomes regular |
| **Google Search Console** | Monitor SEO performance, track keyword rankings | Free |
| **Plausible** | Website analytics (already planned, AP 11.4) | Already planned |

---

## 12. Definition of Done (by Phase)

### Phase 1: Personal Account Audit

- [ ] All platforms checked (Facebook, Instagram, LinkedIn, Twitter/X, YouTube, Reddit, Discord, Slack, dev.to, HN)
- [ ] Facebook and Instagram deactivated/deleted (if they exist)
- [ ] Inventory note created (SWR personal reference)

### Phase 2: MoR-Ready Presence

- [ ] Twitter/X `@hic_ai` account active with 3+ substantive posts
- [ ] GitHub org profile complete (avatar, description, website link)
- [ ] LinkedIn company page created with basic info
- [ ] Website social links verified (all point to real, active accounts)
- [ ] Website structured data `sameAs` array matches actual accounts
- [ ] SEO items 7.6–7.7 complete (sitemap, Google Search Console)
- [ ] MoR application social media fields ready to fill

### Phase 3: Pre-Launch Foundation

- [ ] Blog infrastructure operational (website `/blog` route or dev.to interim)
- [ ] dev.to account created
- [ ] YouTube channel created and configured
- [ ] Reddit account created/designated with some non-promotional history
- [ ] HN account active with genuine comment history
- [ ] LinkedIn personal profile updated (only after AP 13 complete)
- [ ] Show HN draft written and reviewed
- [ ] Launch blog post drafted
- [ ] Demo video recorded
- [ ] Twitter launch thread drafted
- [ ] Reddit launch posts drafted
- [ ] SEO items 7.1–7.5 complete (title tags, meta descriptions, cornerstone content, internal links, schema)
- [ ] Cornerstone "Execution Slop" content published

### Phase 4: Ongoing

- [ ] Weekly blog post published and distributed (steady state)
- [ ] Community engagement responsive (< 24h on Discord/GH Issues)
- [ ] SEO keyword rankings tracked quarterly via Google Search Console

---

## Relationship to Other Action Plans

| AP | Interface with AP 12 |
|----|---------------------|
| **AP 0** | Item 0.3 (Twitter/X research) unblocks Phase 2 |
| **AP 1** | SEO items 7.1–7.2, 7.8 overlap with front-end UX review |
| **AP 3** | AP 3 (Marketing) is subsumed into Phase 3–4 of AP 12. The items in AP 3 (Show HN draft, demo video, launch thread, Reddit posts, Product Hunt) are now explicitly part of this plan. **AP 3 should be considered absorbed by AP 12.** |
| **AP 5** | Documentation quality improves SEO; `/docs` pages are indexable content |
| **AP 6** | Discord server (AP 6.3) is also referenced here as a community platform |
| **AP 8** | MoR application requires Phase 2 completion |
| **AP 11** | Plausible wire-up (11.4) feeds SEO analytics; Privacy Policy must reflect analytics approach |
| **AP 13** | Private disclosures gate Phase 3, item 3.6 (LinkedIn personal update). No other items blocked. |

---

## Document History

| Date | Author | Changes |
|------|--------|---------|
| 2026-02-18 | GC | v1 — comprehensive social media, SEO, and content distribution plan consolidating former AP 12, AP 8.3, and OI-2 |
