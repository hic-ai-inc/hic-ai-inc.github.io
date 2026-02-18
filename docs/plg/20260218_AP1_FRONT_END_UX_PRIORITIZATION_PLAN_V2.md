# AP 1: Front-End UX Prioritization Plan

**Date:** February 18, 2026 (v2; supersedes February 16 v1)
**Author:** GC (GitHub Copilot)
**Status:** Ready for SWR review
**Context:** Comprehensive audit of the PLG website (`plg-website/`) to guide AP 1 (Front-End UX & Content Polish) work. Findings prioritized for a developer audience evaluating Mouse as critical infrastructure.

---

## Guiding Principle

**Functional credibility beats visual polish.** Amazon, Craigslist, and Netflix are not pretty — but they are consistent, functional, and trustworthy. Developers evaluate credibility through _consistency and absence of mistakes_, not through flashy design. A site that has beautiful animations but shows different pricing on two pages, or breaks on mobile, or switches from dark mode to light mode on the login page — that site signals "this was rushed."

The goal of AP 1 is not to make the site beautiful. It is to eliminate every signal that would cause a developer to doubt the competence behind the product.

---

## Current State: Audit Summary

### What's Strong

| Area                  | Grade | Notes                                                                                                                                                     |
| --------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Design System**     | A-    | Well-defined tokens in `globals.css` via `@theme inline`, semantic colors, component classes in `@layer components`. Tailwind v4 approach.                |
| **Homepage**          | A     | Clear value prop, quantified claims (3.6× slower, 58% more, p < 0.000001), correct CTA hierarchy ("Start Free Trial" primary, "Read the Docs" secondary). |
| **Pricing Page**      | A     | Clean two-card grid, thorough FAQ, off-ramp for trial users, tax disclosure.                                                                              |
| **Portal**            | A-    | Comprehensive auth-gated CRUD pages, loading/error/empty states, role-based access.                                                                       |
| **Component Library** | B+    | Small but intentional: `Button` (4 variants, 3 sizes, loading state), `Card` composition, `Badge`, `Input`/`Textarea`/`Select` with error states.         |
| **Typography**        | A     | Inter (body) + Manrope (headings) via `next/font/google` with `display: "swap"`. Consistent scale across pages.                                           |
| **Animations**        | A     | Tasteful `fadeInUp` with staggered delays on About page. `transition-colors` on interactive elements. No heavy scroll-triggered effects.                  |

### What Needs Work

| Area                  | Grade | Notes                                                                                                     |
| --------------------- | ----- | --------------------------------------------------------------------------------------------------------- |
| **Brand Consistency** | C+    | Login and invite pages are entirely off-brand (light-mode generic). Two pages use undefined color tokens. |
| **Documentation**     | C+    | Good structure but ~14 doc slugs 404. Search input is decorative only.                                    |
| **Responsive Design** | C     | Pages are responsive where implemented, but no mobile navigation exists.                                  |
| **Data Consistency**  | D     | FAQ page and pricing page show conflicting pricing information.                                           |
| **Accessibility**     | C     | Good on About/Contact, absent elsewhere. No `focus-visible` rings on buttons/links.                       |

---

## Page Inventory (25 routes)

| Route                  | File                                  | Lines | Purpose                                       |
| ---------------------- | ------------------------------------- | ----- | --------------------------------------------- |
| `/`                    | `src/app/page.js`                     | 224   | Marketing homepage                            |
| `/features`            | `src/app/features/page.js`            | 676   | Comparison matrix, differentiators, evidence  |
| `/pricing`             | `src/app/pricing/page.js`             | 281   | Two-tier pricing cards + FAQ                  |
| `/research`            | `src/app/research/page.js`            | 446   | Research paper summary, findings, methodology |
| `/docs`                | `src/app/docs/page.js`                | 284   | Documentation index with categories           |
| `/docs/[slug]`         | `src/app/docs/[slug]/page.js`         | 469   | Individual doc articles                       |
| `/faq`                 | `src/app/faq/page.js`                 | 304   | Full FAQ with collapsible sections            |
| `/about`               | `src/app/about/page.js`               | 326   | Company info, vision, roadmap                 |
| `/contact`             | `src/app/contact/page.js`             | 471   | Contact channels, community, office info      |
| `/privacy`             | `src/app/privacy/page.js`             | 337   | Privacy policy                                |
| `/terms`               | `src/app/terms/page.js`               | 355   | Terms of service                              |
| `/auth/login`          | `src/app/auth/login/page.js`          | 199   | Cognito login (Google + email)                |
| `/auth/callback`       | `src/app/auth/callback/page.js`       | 139   | OAuth callback handler                        |
| `/checkout/individual` | `src/app/checkout/individual/page.js` | 418   | Individual plan → Stripe                      |
| `/checkout/business`   | `src/app/checkout/business/page.js`   | 394   | Business plan → Stripe                        |
| `/welcome`             | `src/app/welcome/page.js`             | 31    | Redirect handler (backwards compat)           |
| `/welcome/complete`    | `src/app/welcome/complete/page.js`    | 342   | Post-checkout license provisioning            |
| `/portal`              | `src/app/portal/page.js`              | 435   | Dashboard — license, devices, quick actions   |
| `/portal/license`      | `src/app/portal/license/page.js`      | 259   | License key display + activation instructions |
| `/portal/devices`      | `src/app/portal/devices/page.js`      | 285   | Device management with usage bar              |
| `/portal/billing`      | `src/app/portal/billing/page.js`      | 400   | Subscription/payment via Stripe Portal        |
| `/portal/team`         | `src/app/portal/team/page.js`         | 90    | Team management (Business only)               |
| `/portal/settings`     | `src/app/portal/settings/page.js`     | 636   | Profile, notifications, account deletion      |
| `/activate`            | `src/app/activate/page.js`            | 255   | Browser-delegated device activation           |
| `/invite/[token]`      | `src/app/invite/[token]/page.js`      | 341   | Team invite acceptance                        |

---

## Tier 1: Trust-Destroying Issues

These actively undermine the "critical infrastructure component" positioning. A developer evaluating Mouse who encounters any of these will form a negative impression.

### 1.1 Conflicting Pricing Data Between FAQ and Pricing Pages

**Severity:** P0 — Trust destroyer
**Effort:** 15 minutes
**Files:** `src/app/faq/page.js`, `src/app/pricing/page.js`

The FAQ page says Enterprise is "$25/seat/month" with "2 devices per seat" and volume discounts of "2–9 seats standard, 10–99 at 5% off, 100–499 at 10% off." The pricing page (canonical) says Business is "$35/seat/month" with "5 devices per seat" and volume discounts of "50–99 at 10% off, 100–499 at 15% off." The canonical prices are: Individual $15/mo ($150/yr), Business $35/seat/mo ($350/seat/yr).

A developer comparing these pages — and they will — loses trust immediately. The pricing page is likely canonical; the FAQ data needs to be reconciled to match.

**Action:** Reconcile FAQ pricing data to match the pricing page. Consider referencing constants from `src/lib/constants.js` to prevent future drift.

### 1.2 Login Page Uses Off-Brand Light-Mode Design

**Severity:** P0 — First impression for every trial/paid user
**Effort:** 1–2 hours
**File:** `src/app/auth/login/page.js` (199 lines)

The login page uses `bg-gray-50`, `bg-white`, `text-gray-900`, `text-gray-600`, `bg-blue-600`, `text-blue-600` — a generic light-mode design that looks nothing like the rest of the site. This is the first thing users see when they click "Sign In."

**Action:** Restyle to use existing dark theme tokens (`bg-midnight-navy`, `text-frost-white`, `text-silver`, `bg-cerulean-mist`). The Card component and existing form patterns from portal pages provide a direct template.

### 1.3 Invite Page Uses Off-Brand Light-Mode Design

**Severity:** P0 — Seen by highest-value Business customers
**Effort:** 1 hour
**File:** `src/app/invite/[token]/page.js` (341 lines)

Same issue as login: `bg-gray-50`, `bg-white`, `text-gray-900`, `bg-red-100`, `bg-green-100`. The invite page is what Business customers — the highest-value users — see when joining a team.

**Action:** Restyle to match dark theme. Use `Card` components and semantic color tokens for status messages.

### 1.4 No Mobile Navigation

**Severity:** P1 — Blocks mobile browsing entirely
**Effort:** 1 hour
**File:** `src/components/layout/Header.js`

The header hides nav links below the `md:` breakpoint (`hidden md:flex` at line 51) and the sidebar toggle button is a `// TODO: Implement sidebar toggle` (lines 22–28). Mobile visitors cannot access Features, Pricing, Docs, FAQ, About, or Contact from the header. They are trapped on whatever page they land on.

**Action:** Implement a basic slide-out drawer or dropdown menu triggered by the existing hamburger button. Use a simple state toggle + `fixed inset-0` overlay pattern. The PortalSidebar component provides a reference for the drawer approach.

### 1.5 Dead Documentation Links (14+ 404s)

**Severity:** P1 — Signals incomplete product
**Effort:** 30 minutes
**File:** `src/app/docs/[slug]/page.js`

The docs index links to ~20 articles but only ~6 have content in the `docsContent` object (`installation`, `quickstart`, `license-activation`, `how-it-works`, `edit-operations`, `batch-editing`). The other ~14 slugs (e.g., `dialog-box`, `quick-edit`, `batch-quick-edit`, `columnar-editing`, `vscode-setup`, `cursor-setup`, `common-errors`) will 404.

**Action:** Remove dead links from the docs index page. Do NOT stub with "Coming soon" placeholder content — that looks worse. Keep only the 6 articles that have real content. Re-add links as content is written post-launch.

### 1.6 Non-Functional Docs Search Bar

**Severity:** P1 — Broken UI invites interaction then fails silently
**Effort:** 5 minutes to remove (recommended), 1–2 hours to implement
**File:** `src/app/docs/page.js` (lines 183–197)

The search input on the docs index page is a static `<Input>` with no `onChange`, no state, no filtering logic. It looks functional, invites interaction, and then does nothing. This is worse than not having search at all.

**Action:** Remove the search input for now. Add it back post-launch when there's enough documentation content to warrant search functionality and when it can be properly implemented.

---

## Tier 2: Consistency Issues (Quick Wins)

These are things a careful evaluator might catch. Each takes minutes to fix but collectively they raise the quality floor.

### 2.1 Undefined Color Tokens on About and Contact Pages

**Severity:** P1 — Silently broken styling
**Effort:** 10 minutes
**Files:** `src/app/about/page.js`, `src/app/contact/page.js`

Both pages use `bg-deep-space` and `text-silver-mist`, which are **not defined** in the `@theme inline` block in `globals.css`. These classes silently produce no visual effect, meaning broken backgrounds and potentially invisible text.

**Action:** Either define `--color-deep-space` and `--color-silver-mist` in the theme, or replace with existing tokens (`bg-midnight-navy` and `text-silver`). The latter is simpler and more consistent.

### 2.2 Undefined `outline` Button Variant

**Severity:** P1 — Unstyled button on the main portal page
**Effort:** 5 minutes
**File:** `src/app/portal/page.js` (line 159), `src/components/ui/index.js`

`<Button variant="outline">` is used on the portal dashboard but the Button component's `variants` map only defines `primary`, `secondary`, `ghost`, `danger`. The `outline` variant renders with `undefined` class, losing all button styling.

**Action:** Either add an `outline` variant definition to the Button component, or change the usage to `secondary` or `ghost`.

### 2.3 Stray `3;` at Top of Features Page

**Severity:** P3 — Code smell visible in view-source
**Effort:** 1 minute
**File:** `src/app/features/page.js` (line 1)

The file begins with `3; /**` — a stray numeric literal before the doc comment. Harmless in execution but visible as an accidental edit if anyone inspects the page source.

**Action:** Remove the `3;`.

### 2.4 Hardcoded Colors Instead of Design Tokens

**Severity:** P2 — Design system inconsistency
**Effort:** 30 minutes
**Files:** Multiple

The following hardcoded Tailwind colors appear where semantic tokens should be used:

| Hardcoded                       | Should Be                   | Found In                                  |
| ------------------------------- | --------------------------- | ----------------------------------------- |
| `text-green-400`                | `text-success`              | `features/page.js` (compatibility tables) |
| `text-amber-400`                | `text-warning`              | `features/page.js`                        |
| `text-red-400`                  | `text-error`                | `portal/devices/page.js` (error state)    |
| `bg-green-900/30`               | `bg-success/20`             | `portal/billing/page.js` (success banner) |
| `bg-red-500/20`                 | `bg-error/20`               | Various portal pages                      |
| `text-green-400`/`text-red-400` | `text-success`/`text-error` | `TeamManagement.js` (invite statuses)     |

**Action:** Find-and-replace sweep across the affected files. Use the semantic tokens already defined in the design system.

### 2.5 Raw `<Link>` Elements Bypassing Button Component

**Severity:** P2 — Design system drift risk
**Effort:** 20 minutes
**Files:** `src/app/about/page.js` (lines 299–314), `src/app/contact/page.js` (line 453)

CTA buttons on About and Contact pages use raw `<Link>` with manually composed Tailwind classes instead of the `<Button>` component. This bypasses the design system and creates drift risk when Button styles are updated.

**Action:** Replace with `<Button href="..." variant="primary">` (the Button component already handles `href` → Link rendering).

---

## Tier 3: Worth Doing But Not Urgent

### 3.1 Logo Image Optimization

**Severity:** P3 — Performance hygiene
**Effort:** 15 minutes
**Files:** `src/components/layout/Header.js` (lines 30–38), `src/components/layout/PortalSidebar.js` (line 83)

A 192×192 image is loaded at full size and cropped via `objectFit: "none"` + `objectPosition: "center 55%"` to display at ~56×56. This means ~36KB+ is loaded for a small logo on every page.

**Action:** Crop the source image to actual display dimensions. Remove inline styles in favor of Tailwind `object-*` utilities if needed.

### 3.2 Accessibility Fundamentals

**Severity:** P3 — Developer respect signal
**Effort:** 1–2 hours
**Files:** Most marketing and portal pages

`aria-label` and `aria-labelledby` are used well on About and Contact pages but are absent from Homepage, Pricing, Features, FAQ, Docs, and all Portal pages. No `focus-visible` ring on buttons or links except form inputs (which get `focus:border-cerulean-mist`).

**Action:** Add `focus-visible:ring-2 focus-visible:ring-cerulean-mist` to Button component base styles. Add `aria-label` to icon-only buttons and interactive sections. Add `role="region"` and `aria-labelledby` to major page sections.

### 3.3 Checkout Pages Missing Layout Landmarks

**Severity:** P3 — Accessibility / structure
**Effort:** 10 minutes
**Files:** `src/app/checkout/individual/page.js`, `src/app/checkout/business/page.js`

Checkout pages render content directly without a `<main>` element or Header/Footer. While this may be intentional (immersive checkout experience), a `<main>` landmark should still be present for screen readers.

**Action:** Wrap checkout content in `<main>` element.

---

## What NOT to Do

| Don't                                       | Why                                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------- |
| Add animations, parallax, or scroll effects | Clean static approach is correct for developer audience                      |
| Redesign the homepage                       | Already strong — quantified claims, clear value prop, correct CTA hierarchy  |
| Build proper MDX documentation system       | Post-launch. Inline content approach works for the 6 current articles        |
| Add light mode toggle                       | Dark-only is on-brand for developer tools                                    |
| Add cookie banner                           | Not needed (Plausible is cookie-free)                                        |
| Build Modal/Toast/Dropdown components       | Don't build components you don't currently need                              |
| Add client-side error tracking (Sentry)     | Server-side errors are in CloudWatch. Add later if evidence of client issues |
| Add session replay (Hotjar/FullStory)       | Overkill before 1,000 users                                                  |
| Implement A/B testing                       | Get baseline conversion data from Plausible first                            |

---

## Recommended Execution Order

| #   | Item                                               | Time   | Impact                                      | Ref        |
| --- | -------------------------------------------------- | ------ | ------------------------------------------- | ---------- |
| 1   | Reconcile FAQ/Pricing data                         | 15 min | Eliminates trust-destroying contradiction   | §1.1       |
| 2   | Remove dead doc links + search bar                 | 30 min | Eliminates 404s and broken UI               | §1.5, §1.6 |
| 3   | Fix undefined tokens (`deep-space`, `silver-mist`) | 10 min | Fixes invisible text and broken backgrounds | §2.1       |
| 4   | Fix `variant="outline"` and stray `3;`             | 10 min | Removes code smell artifacts                | §2.2, §2.3 |
| 5   | Restyle login page to dark theme                   | 1–2h   | Fixes the most-seen off-brand page          | §1.2       |
| 6   | Restyle invite page to dark theme                  | 1h     | Fixes Business customer experience          | §1.3       |
| 7   | Add mobile hamburger nav                           | 1h     | Unlocks mobile browsing                     | §1.4       |
| 8   | Replace hardcoded colors with tokens               | 30 min | Design system consistency sweep             | §2.4       |
| 9   | Replace raw `<Link>` CTAs with Button              | 20 min | Design system consistency                   | §2.5       |
| 10  | Optimize logo image                                | 15 min | Performance hygiene                         | §3.1       |
| 11  | Accessibility fundamentals                         | 1–2h   | Developer respect signal                    | §3.2       |
| 12  | Checkout `<main>` landmarks                        | 10 min | Accessibility structure                     | §3.3       |

**Items 1–8 total: ~5–6 hours.** These are the ones that materially affect developer perception.

Items 9–12 are optional polish (~2–3 hours) that can be deferred post-launch without consequence.

---

## Where the Real Content Lift Is

The website UX work above ensures the _container_ for content is credible. The real value accrues from **documentation** — not the 6 articles currently live, but a growing library of genuinely helpful guides:

- AI workflow best practices
- MCP configuration per client (Copilot, Cursor, Kiro, Claude Code, Roo Code)
- Common AI coding anti-patterns and how Mouse addresses them
- "How to think about coding with AI assistants" educational content
- Tool reference guides for each Mouse operation
- Troubleshooting guides for common editor-specific issues

Developers buy from people who teach them something useful. The AP 1 work removes reasons to doubt; the documentation content gives reasons to believe.

---

## Relationship to Other Action Plans

- **AP 11.1–11.3 (Legal):** Privacy Policy and ToS will be updated independently by SWR. AP 1 should not touch `/privacy` or `/terms` content.
- **AP 5 (Docs):** Dead link removal (§1.5) and search bar removal (§1.6) are pre-conditions for AP 5 to establish an accurate documentation baseline.
- **AP 8 (AR) Payment Integration:** Items 1–8 above should complete before production launch. A credible, consistent website is a prerequisite for customer acquisition regardless of payment provider.
- **AP 2a (Website Surface Security):** Security review should happen after AP 1 completes (site in near-final state).

---

## Document History

| Date       | Author | Changes                                                 |
| ---------- | ------ | ------------------------------------------------------- |
| 2026-02-16 | GC     | Initial document based on comprehensive front-end audit |
| 2026-02-18 | GC     | v2: Updated canonical pricing references ($35/seat/mo Business, $150/yr Individual Annual, $350/seat/yr Business Annual). Replaced LS application cross-reference with AP 8 (AR) — SMP is now the primary payment path; no third-party MoR application gate. |
