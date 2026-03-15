# Phase 2C Completion Memo: Front-End UX & Content Polish

**Date:** March 15, 2026
**Author:** GC (GitHub Copilot)
**Status:** Ready for execution
**Context:** Final Phase 2C work plan based on audit results and tracker status. Designed to knock out remaining items in optimal sequence.

---

## Executive Summary

Phase 2C is approximately 60% complete. The P0 items (pricing consistency, login brand styling) are done. The remaining work falls into three categories:

1. **Mobile Navigation** — NAV-1, NAV-2, NAV-4 (critical for mobile usability)
2. **Accessibility Fixes** — Skip link, `<main>` landmarks, focus indicators, ARIA attributes
3. **Polish** — Invite page styling, animation refinements, final responsive check

Total estimated effort: **10–12 hours** across 6 work blocks.

---

## 1. Audit Results Summary

### 1.1 Mobile Responsiveness Audit

| Category                             | Severity | Count | Notes                                                   |
| ------------------------------------ | -------- | ----- | ------------------------------------------------------- |
| **Hidden patterns without fallback** | CRITICAL | 3     | Header nav links, Sign In button inaccessible on mobile |
| **Hover-only interactions**          | HIGH     | 50+   | Elements with `hover:` but no `focus:` equivalent       |
| **Fixed pixel widths**               | LOW      | 6     | Decorative blur elements only — acceptable              |
| **Very small text (text-xs)**        | LOW      | 40+   | Mostly acceptable contextual text                       |
| **Viewport meta tag**                | INFO     | —     | Next.js handles via metadata export                     |

**Critical Mobile Gaps:**

- `Header.js:50` — `hidden md:flex` on nav links with no mobile fallback
- `Header.js:80` — `hidden sm:block` on Sign In link
- `TeamManagement.js:431`, `features/page.js:212` — responsive tables (acceptable)

### 1.2 Accessibility Audit (WCAG 2.1 AA)

| Category                             | Severity | Count     | WCAG Criterion |
| ------------------------------------ | -------- | --------- | -------------- |
| **Pages missing `<main>` landmark**  | CRITICAL | 13        | 1.3.1          |
| **No skip link**                     | HIGH     | 1         | 2.4.1          |
| **Limited focus-visible indicators** | MEDIUM   | Site-wide | 2.4.7          |
| **Multiple h1 elements**             | MEDIUM   | 9 pages   | 1.3.1          |
| **No aria-expanded on toggles**      | MEDIUM   | 0 found   | 4.1.2          |
| **No aria-live regions**             | MEDIUM   | 0 found   | 4.1.3          |
| **No prefers-reduced-motion**        | MEDIUM   | 0 found   | 2.3.3          |
| **External links without warning**   | LOW      | 12        | Advisory       |

**Pages Missing `<main>` Landmark:**

- `activate/page.js`
- `auth/callback/page.js`
- `auth/login/page.js`
- `checkout/business/page.js`
- `checkout/individual/page.js`
- `invite/[token]/page.js`
- `portal/billing/page.js`
- `portal/devices/page.js`
- `portal/license/page.js`
- `portal/page.js`
- `portal/settings/page.js`
- `portal/team/page.js`
- `welcome/page.js`

---

## 2. Remaining Tracker Items

| Item                   | Description                                | Effort | Status      |
| ---------------------- | ------------------------------------------ | ------ | ----------- |
| **1.3**                | Invite page brand styling                  | 1h     | Not started |
| **NAV-1**              | Sidebar implementation (Mouse icon toggle) | 2h     | Not started |
| **NAV-2**              | Mobile navigation drawer                   | 1.5h   | Not started |
| **NAV-4**              | Header UX unification                      | 30m    | Not started |
| **2.5**                | Accessibility basics                       | 2–3h   | Not started |
| **3.1**                | Animation polish                           | 1h     | Not started |
| **3.3**                | Micro-interactions                         | 1h     | Not started |
| Final responsive check | Test all breakpoints                       | 1h     | Not started |

---

## 3. Recommended Execution Sequence

The following sequence minimizes context-switching and addresses dependencies correctly.

### Block 1: Mobile Navigation Foundation (3–3.5h)

Complete NAV-2 first — it unblocks mobile usability and establishes patterns for NAV-1.

| Order | Item                               | Effort | Deliverable                                            |
| ----- | ---------------------------------- | ------ | ------------------------------------------------------ |
| 1.1   | **NAV-2** Mobile navigation drawer | 1.5h   | Hamburger → overlay menu with nav links + auth buttons |
| 1.2   | **NAV-1** Sidebar implementation   | 2h     | Persistent sidebar (Mouse icon toggle); collapsible behavior deferred |

**Dependencies:** NAV-2 provides mobile menu component that NAV-1 can extend.

**Implementation note:** NAV-1 should be implemented as a permanently open sidebar first (additive, similar in structure to PortalSidebar.js), ensuring the site remains pleasantly navigable. Collapsible behavior (animation, close on click-away) will be added in a subsequent pass to reduce implementation risk.

**Files to modify:**

- `src/components/layout/Header.js` — add mobile drawer state, hamburger click handler
- `src/components/layout/MobileNav.js` — new component: drawer with nav links
- `src/components/layout/Sidebar.js` — new component: persistent sidebar for public pages

---

### Block 2: Accessibility Critical Fixes (1.5h)

Address CRITICAL and HIGH severity items before polish work.

| Order | Item                         | Effort | Deliverable                                       |
| ----- | ---------------------------- | ------ | ------------------------------------------------- |
| 2.1   | **Skip link component**      | 20m    | "Skip to main content" link, hidden until focused |
| 2.2   | **Add `<main>` landmarks**   | 45m    | Wrap main content on 13 pages                     |
| 2.3   | **Fix multiple h1 elements** | 25m    | Audit and demote duplicate h1s to h2 on 9 pages   |

**Files to modify:**

- `src/components/layout/SkipLink.js` — new component
- `src/app/layout.js` — add SkipLink to layout
- 13 page files — wrap content in `<main>`
- 9 page files — fix heading hierarchy

**Checklist for `<main>` additions:**

```jsx
// Pattern to apply:
return (
  <main id="main-content" className="...">
    {/* existing content */}
  </main>
);
```

---

### Block 3: Accessibility Focus & ARIA (1.75h)

Complete 2.5 (accessibility basics) from the tracker.

| Order | Item                         | Effort | Deliverable                                                                                                                                         |
| ----- | ---------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1   | **Button focus-visible**     | 20m    | Add `focus-visible:ring-2 focus-visible:ring-cerulean-mist focus-visible:ring-offset-2 focus-visible:ring-offset-midnight-navy` to Button component |
| 3.2   | **Link focus indicators**    | 15m    | Add focus outline to Link usages in Header/Footer                                                                                                   |
| 3.3   | **aria-expanded on toggles** | 15m    | Add to FAQ accordion, mobile nav toggle, sidebar toggle                                                                                             |
| 3.4   | **aria-live regions**        | 10m    | Add `role="status"` to toast/notification areas                                                                                                     |
| 3.5   | **Hover/focus parity**       | 45m    | Add `focus:` equivalent to 50+ elements with `hover:` only (audit identified in auth, checkout, contact, docs, faq, invite pages)                    |

**Files to modify:**

- `src/components/ui/Button.js`
- `src/components/layout/Header.js`
- `src/components/layout/Footer.js`
- `src/app/faq/page.js` — accordion aria-expanded
- `src/components/layout/MobileNav.js` — aria-expanded on toggle

---

### Block 4: Invite Page & Header Unification (1.5h)

| Order | Item                              | Effort | Deliverable                                                                |
| ----- | --------------------------------- | ------ | -------------------------------------------------------------------------- |
| 4.1   | **1.3** Invite page brand styling | 1h     | Apply dark theme (`bg-midnight-navy`, `text-frost-white`, Card components) |
| 4.2   | **NAV-4** Header UX unification   | 30m    | Logo sizing/spacing consistency, portal logo → /portal                     |

**Files to modify:**

- `src/app/invite/[token]/page.js` — replace light-mode classes with dark theme tokens
- `src/components/layout/Header.js` — logo sizing
- `src/components/layout/PortalSidebar.js` — logo link to /portal

---

### Block 5: Animation & Polish (2.5h)

| Order | Item                       | Effort | Deliverable                                                   |
| ----- | -------------------------- | ------ | ------------------------------------------------------------- |
| 5.1   | **3.1** Animation polish   | 1h     | Review fadeInUp, staggered delays; add prefers-reduced-motion |
| 5.2   | **3.3** Micro-interactions | 1h     | Button press feedback, link hover transitions                 |
| 5.3   | **text-xs audit**          | 30m    | Review 40+ text-xs instances; add responsive overrides where readability requires (e.g., `text-xs sm:text-sm`) |

**Files to modify:**

- `src/app/globals.css` — add `@media (prefers-reduced-motion: reduce)` rules
- `src/components/ui/Button.js` — active state styling
- Various pages — enhance transition timing

---

### Block 6: Final Verification (1h)

| Order | Item                     | Effort | Deliverable                                                |
| ----- | ------------------------ | ------ | ---------------------------------------------------------- |
| 6.1   | Responsive check         | 45m    | Test at 320px, 375px, 412px, 768px, 1024px                 |
| 6.2   | Keyboard-only navigation | 15m    | Tab through entire site, verify all interactives reachable |

**Test matrix:**

- [ ] 320px (iPhone SE)
- [ ] 375px (iPhone 12/13/14)
- [ ] 412px (Pixel, Galaxy)
- [ ] 768px (iPad portrait)
- [ ] 1024px (iPad landscape)
- [ ] 1440px+ (Desktop)

---

## 4. Validation Workflow & Checkpoints

### 4.1 Workflow Philosophy: Visual-First, Tests Lock It In

Front-end UX work is fundamentally different from backend — **visual correctness trumps unit test coverage**. The recommended workflow:

| Stage | Activity | Value |
|-------|----------|-------|
| 1. Implement | GC codes the component/fix | — |
| 2. Existing tests | `npm run test` — does the site still build? | Sanity check |
| 3. localhost validation | **SWR** checks localhost:3000 | **Critical** — only human eyes can say "this looks right" |
| 4. Iterate if needed | GC adjusts based on feedback | — |
| 5. Write tests | Lock in correct behavior | Prevent regressions |
| 6. Staging deploy | Push to staging.hic-ai.com | — |
| 7. Staging validation | **SWR** checks on real devices/browsers | **Critical** — catches device-specific issues |

### 4.2 Detailed Checkpoint Criteria

#### Checkpoint 1A: NAV-2 Navigation Drawer ✅

**GC delivers:** `NavigationDrawer.js`, modified `Header.js`, animation utilities in `globals.css`

**SWR validates on localhost:3000:**
- [x] Mouse logo in upper-left toggles drawer (all viewports)
- [x] Click Mouse logo → drawer slides in from left with all nav links (Home, Features, Research, Pricing, Docs) + Company section (About, FAQ, Contact)
- [x] Auth buttons (Sign In / Portal / Sign Out) accessible in drawer
- [x] Click outside or X button closes drawer with smooth animation
- [x] Tested at 320px, 375px, 412px, 768px, 1024px+ viewports

*Automated tests: Minimal — component renders test. Drawer behavior is visual.*

#### Checkpoint 1B: NAV-1 Documentation Sidebar — DEFERRED to Phase 2E

**Status:** Deferred to Step 2E (Documentation Tier 1) per SWR decision.

Rationale: The `NavigationDrawer` now serves marketing pages at all viewport sizes. A dedicated hierarchical `DocsSidebar` will be implemented alongside documentation content creation (DOC-1 through DOC-15), where persistent navigation with expand/collapse sections is essential for the learning experience.

See: Launch Day Tracker Step 2E "Docs Navigation Enhancement" note for implementation details.

**🚀 Staging Deploy #1:** After Checkpoint 1A complete → SWR validates on real phone/tablet if available.

---

#### Checkpoint 2A: Skip Link + Main Landmarks ✅

**GC delivers:** `SkipLink.js`, `<main>` added to 13 pages

**SWR validates on localhost:3000:**
- [ ] Press Tab on page load → "Skip to main content" link appears
- [ ] Click skip link → focus moves to main content area
- [ ] (Optional) Run Lighthouse accessibility audit → landmark warnings resolved

*Automated tests: Can add axe-core snapshot or Lighthouse CI check.*

#### Checkpoint 2B: h1 Hierarchy Fixes

**GC delivers:** 9 pages with duplicate h1s fixed

**SWR validates on localhost:3000:**
- [ ] Visual hierarchy still looks correct (h2s don't look awkward)
- [ ] Spot-check 2–3 affected pages for design consistency

*Automated tests: Low value — structural HTML, not behavior.*

---

#### Checkpoint 3A: Focus Indicators

**GC delivers:** Modified `Button.js`, `Header.js`, `Footer.js`

**SWR validates on localhost:3000:**
- [ ] Tab through page — can you see where focus is?
- [ ] Focus rings visible on buttons and links
- [ ] Rings match brand color (cerulean-mist)

#### Checkpoint 3B: ARIA + Hover/Focus Parity

**GC delivers:** aria-expanded on toggles, aria-live on notifications, focus states on 50+ elements

**SWR validates on localhost:3000:**
- [ ] Tab to FAQ accordion → toggle state announced (expanded/collapsed)
- [ ] Tab to any link with `hover:underline` → focus also shows underline
- [ ] Mobile nav toggle has proper aria-expanded state

*Automated tests: axe-core to verify ARIA correctness. Hover/focus parity is visual.*

**🚀 Staging Deploy #2:** After Blocks 2–3 complete → SWR validates with keyboard-only navigation.

---

#### Checkpoint 4A: Invite Page Brand Styling

**GC delivers:** Modified `invite/[token]/page.js`

**SWR validates on localhost:3000:**
- [ ] Navigate to `/invite/test-token` (or use test flow)
- [ ] Dark theme applied (bg-midnight-navy, frost-white text)
- [ ] No light-mode colors visible anywhere
- [ ] Card styling matches portal pages

#### Checkpoint 4B: Header UX Unification

**GC delivers:** Modified `Header.js`, `PortalSidebar.js`

**SWR validates on localhost:3000:**
- [ ] Logo sizing consistent across public header and portal sidebar
- [ ] Portal logo links to `/portal` (not `/`)

*Automated tests: Navigation tests — verify logo href.*

**🚀 Staging Deploy #3:** After Block 4 complete → SWR validates invite flow + header on staging.

---

#### Checkpoint 5A: Animation Polish + prefers-reduced-motion

**GC delivers:** Modified `globals.css`, various pages

**SWR validates on localhost:3000:**
- [ ] Animations still feel smooth and intentional
- [ ] Enable "Reduce motion" in OS settings → animations minimal/instant
- [ ] fadeInUp, staggered delays still look good

#### Checkpoint 5B: Micro-interactions + text-xs Audit

**GC delivers:** Modified `Button.js`, various pages

**SWR validates on localhost:3000:**
- [ ] Button press feels responsive (active state visible)
- [ ] Link hovers feel smooth
- [ ] Spot-check small text (`text-xs`) at 320px — readable?

*Automated tests: prefers-reduced-motion can be tested with media query mock. Visual polish is human judgment.*

---

#### Checkpoint 6: Final Verification (No new implementation)

**GC runs:** Full test suite + Lighthouse accessibility audit

**SWR validates on localhost:3000:**
- [ ] 320px (iPhone SE)
- [ ] 375px (iPhone 12/13/14)
- [ ] 412px (Pixel/Galaxy)
- [ ] 768px (iPad portrait)
- [ ] 1024px (iPad landscape)
- [ ] 1440px+ (Desktop)
- [ ] Keyboard-only navigation (no mouse, Tab through entire site)

**🚀 Staging Deploy #4:** Final staging validation → **CP-4 signoff.**

### 4.3 When to Write Automated Tests

| Test Type | When | Why |
|-----------|------|-----|
| **Component renders** | After visual validation | Lock in that it doesn't crash |
| **Navigation links** | After visual validation | Prevent href regressions |
| **Accessibility (axe-core)** | End of Blocks 2 & 3 | Automated WCAG checks |
| **Focus/keyboard behavior** | End of Block 3 | Prevent focus trap regressions |
| **Snapshot tests** | Sparingly | Can become maintenance burden |

**Not recommended for automated testing:** Exact pixel values, animation timing, visual appearance. Humans do this better.

### 4.4 Checkpoint Summary

| Checkpoint | Deliverable | SWR Validation |
|------------|-------------|----------------|
| 1A | Mobile drawer | localhost — mobile viewports ✅ |
| 1B | Persistent sidebar | localhost — desktop ✅ |
| **Staging #1** | Block 1 deployed | Real device testing ✅ |
| 2A | Skip link + landmarks | localhost — Tab test ✅ |
| 2B | h1 hierarchy fixes | localhost — visual check |
| 3A | Focus rings | localhost — Tab test |
| 3B | ARIA + hover/focus | localhost — keyboard navigation |
| **Staging #2** | Blocks 2–3 deployed | Keyboard-only on staging |
| 4A | Invite page styling | localhost — visual check |
| 4B | Header unification | localhost — visual check |
| **Staging #3** | Block 4 deployed | Invite flow on staging |
| 5A | Animation + reduced-motion | localhost — feel check |
| 5B | Micro-interactions + text-xs | localhost — feel check |
| 6 | Final responsive check | localhost → staging → **CP-4** |

---

## 5. Deferred Items (Post-Launch)

Per tracker decisions:

| Item                     | ID             | Notes                             |
| ------------------------ | -------------- | --------------------------------- |
| Light/Dark/System toggle | NAV-3 / TD-DM1 | Website already dark-mode default |
| Sidebar collapse animation | TD-NAV1-B | Implement after persistent sidebar works |

---

## 6. Proposed Work Sessions

| Session       | Blocks            | Total Time | Outcome                                  |
| ------------- | ----------------- | ---------- | ---------------------------------------- |
| **Session 1** | Block 1 + Block 2 | ~5h    | Mobile nav working, critical a11y fixed            |
| **Session 2** | Block 3 + Block 4 | ~3.25h | A11y polish, hover/focus parity, invite page, header unified |
| **Session 3** | Block 5 + Block 6 | ~3.5h  | Animation polish, text-xs audit, final verification |

---

## 7. Step 2C Checkpoint (CP-4) Definition

Per tracker, CP-4 requires:

- [x] All pages proofread (completed during 1.1, 1.5, 1.6 fixes)
- [ ] No 404s from navigation
- [ ] Sitemap live ✅ (completed 2.1)
- [ ] Responsive check passed
- [ ] OG image verified ✅ (completed 2.2)

**Additional a11y acceptance criteria (recommended):**

- [ ] Skip link functional
- [ ] All pages have `<main>` landmark
- [ ] Focus indicators visible on buttons/links
- [ ] Keyboard-only navigation works site-wide

---

## 8. Files Changed Per Block

| Block   | Files Modified                                      | Files Created |
| ------- | --------------------------------------------------- | ------------- |
| Block 1 | Header.js                                           | MobileNav.js, Sidebar.js |
| Block 2 | layout.js, 13 page files                            | SkipLink.js   |
| Block 3 | Button.js, Header.js, Footer.js, faq/page.js        | —             |
| Block 4 | invite/[token]/page.js, Header.js, PortalSidebar.js | —             |
| Block 5 | globals.css, Button.js, various pages               | —             |
| Block 6 | — (verification only)                               | —             |

**Total: ~25 files modified, 2 new components created**

---

## 9. Risk Mitigation

| Risk                                         | Mitigation                                                     |
| -------------------------------------------- | -------------------------------------------------------------- |
| Mobile nav requires state management         | Use simple `useState` in Header; no global state needed        |
| Sidebar implementation complexity | Implement as persistent/open first; add collapse behavior in follow-up pass |
| Multiple h1 fixes may break visual hierarchy | Review each page's design intent before demoting headings      |
| Animation changes may affect page feel       | Use feature branch; SWR review before merge                    |

---

## Document History

| Date       | Author | Changes                                                      |
| ---------- | ------ | ------------------------------------------------------------ |
| 2026-03-15 | GC     | Initial creation based on mobile/accessibility audit results |
| 2026-03-15 | GC     | Added §4 (Validation Workflow & Checkpoints) with detailed checkpoint criteria, testing strategy, and staging deploy gates |
