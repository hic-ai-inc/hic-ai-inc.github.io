# Accessibility Requirements and Recommendations

**Date:** March 14, 2026
**Author:** GC (GitHub Copilot)
**Status:** Ready for SWR review
**Context:** Phase 2C front-end polish requires accessibility verification. This memo defines WCAG AA compliance requirements, identifies audit strategies, and proposes automated detection approaches.

---

## Executive Summary

Web accessibility ensures that people with disabilities can perceive, understand, navigate, and interact with websites. WCAG 2.1 AA is the industry standard for compliance and often a legal requirement. This memo outlines a complete accessibility strategy for the PLG website.

**Goal:** Full WCAG 2.1 AA compliance, with AAA where practical.

---

## 1. WCAG 2.1 AA Requirements by Category

### 1.1 Perceivable

Users must be able to perceive the information being presented.

| Criterion                   | ID     | Requirement                                               | Implementation                         |
| --------------------------- | ------ | --------------------------------------------------------- | -------------------------------------- |
| **Text Alternatives**       | 1.1.1  | All non-text content has text alternative                 | `alt` on images, `aria-label` on icons |
| **Captions**                | 1.2.2  | Captions for prerecorded audio in video                   | N/A (no video currently)               |
| **Audio Description**       | 1.2.5  | Audio description for prerecorded video                   | N/A (no video currently)               |
| **Info and Relationships**  | 1.3.1  | Information structure conveyed programmatically           | Semantic HTML, ARIA landmarks          |
| **Meaningful Sequence**     | 1.3.2  | Content order is logical                                  | DOM order matches visual order         |
| **Sensory Characteristics** | 1.3.3  | Instructions don't rely solely on shape/color/location    | Use text labels, not just icons        |
| **Orientation**             | 1.3.4  | Content not restricted to single orientation              | No orientation locks                   |
| **Input Purpose**           | 1.3.5  | Input purpose can be programmatically determined          | `autocomplete` attributes on forms     |
| **Contrast (Minimum)**      | 1.4.3  | 4.5:1 for normal text, 3:1 for large text                 | Verify all color combinations          |
| **Resize Text**             | 1.4.4  | Text resizable to 200% without loss of functionality      | Use relative units (rem, em)           |
| **Images of Text**          | 1.4.5  | Use actual text, not images of text                       | Avoid text in images                   |
| **Reflow**                  | 1.4.10 | Content reflows at 320px without horizontal scroll        | Responsive design                      |
| **Non-text Contrast**       | 1.4.11 | 3:1 contrast for UI components and graphics               | Button borders, icons                  |
| **Text Spacing**            | 1.4.12 | No loss of content when text spacing increased            | Flexible containers                    |
| **Content on Hover/Focus**  | 1.4.13 | Hover/focus content is dismissible, hoverable, persistent | Tooltip behavior                       |

### 1.2 Operable

Users must be able to operate the interface.

| Criterion                | ID    | Requirement                                          | Implementation                   |
| ------------------------ | ----- | ---------------------------------------------------- | -------------------------------- |
| **Keyboard**             | 2.1.1 | All functionality available via keyboard             | Tab through all interactives     |
| **No Keyboard Trap**     | 2.1.2 | Keyboard focus can always be moved away              | Check modals, dropdowns          |
| **Skip Links**           | 2.4.1 | Skip to main content link available                  | Add skip link component          |
| **Page Titled**          | 2.4.2 | Pages have descriptive titles                        | Check all `<title>` elements     |
| **Focus Order**          | 2.4.3 | Focus order preserves meaning and operability        | Tab order follows visual flow    |
| **Link Purpose**         | 2.4.4 | Link purpose clear from link text or context         | Avoid "click here"               |
| **Multiple Ways**        | 2.4.5 | Multiple ways to locate pages                        | Navigation, sitemap, search      |
| **Headings and Labels**  | 2.4.6 | Headings and labels describe topic/purpose           | Descriptive headings             |
| **Focus Visible**        | 2.4.7 | Keyboard focus indicator is visible                  | `focus-visible` rings            |
| **Pointer Gestures**     | 2.5.1 | Multipoint gestures have single-pointer alternatives | N/A (no complex gestures)        |
| **Pointer Cancellation** | 2.5.2 | Down-event doesn't trigger action                    | Use `click`, not `mousedown`     |
| **Label in Name**        | 2.5.3 | Visible labels in accessible name                    | Button text matches `aria-label` |
| **Motion Actuation**     | 2.5.4 | Motion-triggered functions have alternatives         | N/A (no motion triggers)         |

### 1.3 Understandable

Users must be able to understand the information and interface.

| Criterion                     | ID    | Requirement                                     | Implementation              |
| ----------------------------- | ----- | ----------------------------------------------- | --------------------------- |
| **Language of Page**          | 3.1.1 | Page language specified in HTML                 | `<html lang="en">`          |
| **Language of Parts**         | 3.1.2 | Language changes specified                      | `lang` attr on foreign text |
| **On Focus**                  | 3.2.1 | Focus doesn't trigger context change            | No auto-submit on focus     |
| **On Input**                  | 3.2.2 | Input doesn't trigger unexpected context change | Warn before auto-navigation |
| **Consistent Navigation**     | 3.2.3 | Navigation consistent across pages              | Same header/footer          |
| **Consistent Identification** | 3.2.4 | Same functionality identified consistently      | Same icons/labels           |
| **Error Identification**      | 3.3.1 | Errors identified and described                 | Error messages in forms     |
| **Labels or Instructions**    | 3.3.2 | Labels or instructions for user input           | Form field labels           |
| **Error Suggestion**          | 3.3.3 | Error correction suggestions provided           | Helpful error messages      |
| **Error Prevention**          | 3.3.4 | Reversible submissions for legal/financial      | Confirmation dialogs        |

### 1.4 Robust

Content must be robust enough for assistive technologies.

| Criterion             | ID    | Requirement                                 | Implementation               |
| --------------------- | ----- | ------------------------------------------- | ---------------------------- |
| **Parsing**           | 4.1.1 | Valid HTML (deprecated in WCAG 2.2)         | Use valid HTML5              |
| **Name, Role, Value** | 4.1.2 | Custom components have accessible name/role | ARIA on custom widgets       |
| **Status Messages**   | 4.1.3 | Status messages announced to screen readers | `role="status"`, `aria-live` |

---

## 2. PLG Website Specific Requirements

### 2.1 Component-Level Requirements

| Component               | Requirements                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| **Button**              | `focus-visible` ring, accessible name (text or `aria-label`), minimum 44×44px touch target     |
| **Link**                | Descriptive text (not "click here"), `focus-visible` indicator, distinguishable from body text |
| **Input**               | Associated `<label>`, `autocomplete` where applicable, error state with `aria-describedby`     |
| **Modal/Dialog**        | `role="dialog"`, `aria-modal="true"`, focus trap, ESC to close, return focus on close          |
| **Sidebar**             | `<nav>` landmark, `aria-expanded` on toggle, `aria-label` for region                           |
| **Header**              | `<header>` landmark, skip link target                                                          |
| **Footer**              | `<footer>` landmark                                                                            |
| **Cards**               | Semantic structure, focusable if interactive                                                   |
| **Tables**              | `<th>` with `scope`, `<caption>` where helpful                                                 |
| **Icons**               | `aria-hidden="true"` if decorative, `aria-label` if meaningful                                 |
| **Loading States**      | `aria-busy="true"`, `aria-live` for completion                                                 |
| **Toast/Notifications** | `role="alert"` or `role="status"`, `aria-live`                                                 |

### 2.2 Page-Level Requirements

| Page Type           | Requirements                                                                     |
| ------------------- | -------------------------------------------------------------------------------- |
| **All Pages**       | `<main>` landmark, `<h1>` present, logical heading hierarchy, `<html lang="en">` |
| **Marketing Pages** | Skip link, proper section landmarks                                              |
| **Portal Pages**    | `<main>` landmark (sidebar is `<nav>`), breadcrumb or clear location indicator   |
| **Forms**           | Field labels, error summary, inline validation messages                          |
| **Checkout**        | Error prevention (confirmation), clear progress indication                       |

---

## 3. Automated Audit Capabilities

### 3.1 Grep-Detectable Issues

| Issue                                | Detection Pattern                                         | Severity |
| ------------------------------------ | --------------------------------------------------------- | -------- |
| Images without alt                   | `<img` or `<Image` without `alt=`                         | High     |
| Icon-only buttons without aria-label | `<button>` containing only icon, no `aria-label`          | High     |
| Missing `<main>` landmark            | Page files without `<main>`                               | High     |
| Missing `lang` attribute             | `<html` without `lang=`                                   | High     |
| Links with vague text                | `href=` with text like "click here", "read more"          | Medium   |
| Missing focus indicators             | Interactive elements without `focus:` or `focus-visible:` | High     |
| Form inputs without labels           | `<input` without associated `<label>` or `aria-label`     | High     |
| Multiple h1 elements                 | More than one `<h1>` per page                             | Medium   |
| Skipped heading levels               | h1 followed by h3 (missing h2)                            | Medium   |
| Empty links/buttons                  | `<a>` or `<button>` with no text content                  | High     |
| Positive tabindex                    | `tabindex="[1-9]"` (disrupts natural order)               | Medium   |
| Autofocus misuse                     | `autoFocus` outside of modals                             | Low      |
| Missing button type                  | `<button` without `type=`                                 | Low      |

### 3.2 Requires Manual/Tool Review

| Issue                       | Detection Method                       |
| --------------------------- | -------------------------------------- |
| Color contrast              | Lighthouse, axe DevTools, manual check |
| Logical focus order         | Manual keyboard testing                |
| Screen reader compatibility | VoiceOver, NVDA testing                |
| Heading hierarchy logic     | Manual review of heading structure     |
| ARIA correctness            | axe DevTools, manual review            |
| Motion/animation respect    | Check for `prefers-reduced-motion`     |
| Touch target sizing         | Manual measurement or computed styles  |

---

## 4. Implementation Checklist

### 4.1 Global/Component Fixes

- [ ] **Skip Link** — Add "Skip to main content" link at top of page, hidden until focused
- [ ] **Focus Rings** — Add `focus-visible:ring-2 focus-visible:ring-cerulean-mist focus-visible:ring-offset-2` to Button component
- [ ] **Focus Rings on Links** — Add focus indicator to all `<Link>` elements
- [ ] **Icon Accessibility** — Audit all icons: decorative get `aria-hidden="true"`, meaningful get `aria-label`
- [ ] **Button Type** — Ensure all `<button>` have explicit `type="button"` or `type="submit"`
- [ ] **Input Labels** — Verify all inputs have associated labels (via `htmlFor` or wrapping `<label>`)
- [ ] **Autocomplete** — Add `autocomplete` attributes to common form fields (email, name, etc.)

### 4.2 Page-Level Fixes

- [ ] **Main Landmarks** — Add `<main>` to all pages that lack it
- [ ] **Heading Hierarchy** — Audit and fix heading levels (h1 → h2 → h3, no skips)
- [ ] **Page Titles** — Verify all pages have descriptive `<title>` via metadata
- [ ] **HTML Lang** — Verify `<html lang="en">` in layout

### 4.3 Color Contrast Audit

Current color tokens to verify (against `bg-midnight-navy` #0a1628):

| Token                | Hex     | Use Case       | Min Ratio |
| -------------------- | ------- | -------------- | --------- |
| `text-frost-white`   | #f8fafc | Body text      | 4.5:1     |
| `text-silver`        | #94a3b8 | Secondary text | 4.5:1     |
| `text-slate-grey`    | #64748b | Tertiary text  | 4.5:1 ⚠️  |
| `text-cerulean-mist` | #38bdf8 | Links, accents | 4.5:1     |
| `text-success`       | #4ade80 | Success states | 3:1 (UI)  |
| `text-warning`       | #fbbf24 | Warning states | 3:1 (UI)  |
| `text-error`         | #f87171 | Error states   | 3:1 (UI)  |

⚠️ `text-slate-grey` (#64748b) on `bg-midnight-navy` (#0a1628) = ~4.2:1 — **borderline, verify**

### 4.4 ARIA Implementation

| Pattern             | ARIA Needs                                                         |
| ------------------- | ------------------------------------------------------------------ |
| Sidebar toggle      | `aria-expanded`, `aria-controls`, `aria-label`                     |
| Mobile menu         | `aria-expanded`, `aria-controls`, focus management                 |
| Theme toggle        | `aria-pressed` or `aria-label` with current state                  |
| Accordion (FAQ)     | `aria-expanded`, `aria-controls`                                   |
| Tabs                | `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected` |
| Loading button      | `aria-busy="true"`, `aria-disabled="true"`                         |
| Toast notifications | `role="alert"` or `role="status"`, `aria-live="polite"`            |

---

## 5. Testing Strategy

### 5.1 Automated Testing

| Tool                       | Purpose                       | Integration                        |
| -------------------------- | ----------------------------- | ---------------------------------- |
| **axe-core**               | Runtime accessibility testing | Can integrate with Jest/Playwright |
| **Lighthouse**             | Accessibility scoring         | CI/CD or manual                    |
| **eslint-plugin-jsx-a11y** | Lint-time checks              | Add to ESLint config               |
| **Custom grep script**     | Quick pattern detection       | `scripts/audit-accessibility.sh`   |

### 5.2 Manual Testing Protocol

1. **Keyboard-only navigation** — Tab through entire site, verify all functionality
2. **Screen reader testing** — VoiceOver (Mac), NVDA (Windows), or TalkBack (Android)
3. **Zoom testing** — 200% browser zoom, verify no content loss
4. **High contrast mode** — Windows High Contrast Mode compatibility
5. **Reduced motion** — Enable `prefers-reduced-motion`, verify animations respect it

### 5.3 User Testing

Consider recruiting users with disabilities for feedback:

- Screen reader users
- Keyboard-only users
- Users with low vision
- Users with motor impairments

---

## 6. ESLint Integration (Recommended)

Add `eslint-plugin-jsx-a11y` for lint-time accessibility checks:

```bash
npm install --save-dev eslint-plugin-jsx-a11y
```

```js
// eslint.config.mjs
import jsxA11y from "eslint-plugin-jsx-a11y";

export default [
  // ... existing config
  {
    plugins: {
      "jsx-a11y": jsxA11y,
    },
    rules: {
      "jsx-a11y/alt-text": "error",
      "jsx-a11y/anchor-has-content": "error",
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/aria-role": "error",
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/heading-has-content": "error",
      "jsx-a11y/html-has-lang": "error",
      "jsx-a11y/img-redundant-alt": "warn",
      "jsx-a11y/interactive-supports-focus": "warn",
      "jsx-a11y/label-has-associated-control": "error",
      "jsx-a11y/no-autofocus": "warn",
      "jsx-a11y/no-redundant-roles": "warn",
      "jsx-a11y/role-has-required-aria-props": "error",
      "jsx-a11y/tabindex-no-positive": "error",
    },
  },
];
```

---

## 7. Prioritization

### 7.1 Critical (Must Fix)

| Item                              | Impact                                 | Effort |
| --------------------------------- | -------------------------------------- | ------ |
| Skip link                         | Keyboard users can't bypass navigation | 30m    |
| Focus indicators on buttons/links | Keyboard users can't see focus         | 1h     |
| `<main>` landmarks on all pages   | Screen readers can't find main content | 30m    |
| Alt text on all images            | Screen readers announce nothing        | 30m    |
| Form label associations           | Screen readers can't identify fields   | 1h     |

### 7.2 High Priority

| Item                        | Impact                           | Effort |
| --------------------------- | -------------------------------- | ------ |
| Heading hierarchy           | Document structure unclear       | 1h     |
| ARIA on interactive widgets | Custom widgets not announced     | 2h     |
| Color contrast verification | Low vision users can't read      | 1h     |
| Icon accessibility          | Decorative vs meaningful unclear | 1h     |

### 7.3 Medium Priority

| Item                    | Impact                   | Effort |
| ----------------------- | ------------------------ | ------ |
| Autocomplete attributes | Minor friction for users | 30m    |
| Button type attributes  | Edge case form issues    | 15m    |
| eslint-plugin-jsx-a11y  | Ongoing prevention       | 30m    |

---

## 8. Relationship to Tracker Items

| Tracker Item                       | Relationship                                      |
| ---------------------------------- | ------------------------------------------------- |
| **2.5** Accessibility basics       | Primary implementation item                       |
| **NAV-1/NAV-2** Sidebar/mobile nav | Must include ARIA implementation                  |
| **NAV-3** Theme toggle             | Must include `aria-pressed` or state announcement |
| **1.2/1.3** Login/Invite pages     | Must include focus indicators, form labels        |

---

## Document History

| Date       | Author | Changes          |
| ---------- | ------ | ---------------- |
| 2026-03-14 | GC     | Initial document |
