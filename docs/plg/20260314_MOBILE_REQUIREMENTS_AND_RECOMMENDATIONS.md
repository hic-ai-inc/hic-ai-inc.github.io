# Mobile Responsiveness Requirements and Recommendations

**Date:** March 14, 2026
**Author:** GC (GitHub Copilot)
**Status:** Ready for SWR review
**Context:** Phase 2C front-end polish requires mobile-responsive verification. This memo defines production-grade mobile requirements, identifies current gaps, and proposes an automated audit approach.

---

## Executive Summary

The PLG website has **critical mobile navigation gaps** that block usability on mobile devices:

1. Nav links hidden below `md:` breakpoint with no hamburger fallback
2. Sign In link hidden below `sm:` breakpoint
3. Portal/Sign In buttons inaccessible on Android (confirmed by SWR)

**Recommendation:** Run automated audit script first to identify all gaps, then prioritize fixes based on severity.

---

## 1. Production-Grade Mobile Requirements

### 1.1 Layout & Structure

| Requirement                | Implementation                                                                                     | Verification Method                   |
| -------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------- |
| **Fluid grid**             | Use `flex`, `grid`, percentage/viewport units; avoid fixed pixel widths                            | Grep for `w-[0-9]+px`, `width: \d+px` |
| **Breakpoint consistency** | Single breakpoint vocabulary (Tailwind defaults: `sm:640px`, `md:768px`, `lg:1024px`, `xl:1280px`) | Grep for custom media queries         |
| **Container constraints**  | `max-w-*` on content containers to prevent ultra-wide layouts                                      | Visual inspection at 2560px+          |
| **Viewport meta tag**      | `<meta name="viewport" content="width=device-width, initial-scale=1">`                             | Check `layout.js`                     |
| **No horizontal scroll**   | Nothing overflows viewport width                                                                   | Test at 320px, 375px, 412px           |

### 1.2 Typography

| Requirement             | Implementation                                                           | Verification Method                            |
| ----------------------- | ------------------------------------------------------------------------ | ---------------------------------------------- |
| **Fluid text sizing**   | Responsive text classes (`text-sm md:text-base lg:text-lg`) or `clamp()` | Grep for hardcoded `text-[Npx]`                |
| **Line length control** | `max-w-prose` or equivalent on body text (45–75 chars ideal)             | Visual inspection                              |
| **Readable minimum**    | Nothing smaller than 14px on mobile                                      | Grep for `text-xs` without responsive override |

### 1.3 Touch Targets

| Requirement                    | Implementation                                       | Verification Method                             |
| ------------------------------ | ---------------------------------------------------- | ----------------------------------------------- |
| **44×44px minimum**            | Buttons, links, interactive elements meet WCAG 2.5.5 | Audit all `Button`, `Link`, icon-only buttons   |
| **Adequate spacing**           | No adjacent touch targets without 8px+ gap           | Visual inspection + spacing check               |
| **No hover-only interactions** | Everything accessible via tap                        | Grep for `hover:` without `active:` or `focus:` |

### 1.4 Navigation

| Requirement              | Implementation                                     | Verification Method                       |
| ------------------------ | -------------------------------------------------- | ----------------------------------------- |
| **Mobile nav pattern**   | Hamburger → drawer/overlay, or bottom nav          | Verify fallback for `hidden md:` patterns |
| **Accessible hamburger** | `aria-expanded`, `aria-controls`, focus management | Audit `Header.js`                         |
| **No nav truncation**    | All nav items reachable on smallest viewport       | Test at 320px                             |

### 1.5 Images & Media

| Requirement                   | Implementation                                              | Verification Method                          |
| ----------------------------- | ----------------------------------------------------------- | -------------------------------------------- |
| **Responsive images**         | `srcset`/`sizes` or Next.js `<Image>` with `fill` + `sizes` | Grep for `<img>` without responsive handling |
| **Aspect ratio preservation** | `aspect-*` utilities or explicit aspect-ratio CSS           | Visual inspection                            |
| **No fixed dimensions**       | Avoid `width={600} height={400}` without responsive wrapper | Audit `<Image>` usage                        |

### 1.6 Forms & Inputs

| Requirement                 | Implementation                                                           | Verification Method          |
| --------------------------- | ------------------------------------------------------------------------ | ---------------------------- |
| **Full-width on mobile**    | `w-full` or responsive width on inputs                                   | Grep for fixed-width inputs  |
| **Label visibility**        | Labels above or adjacent, not reliant on placeholder                     | Visual inspection            |
| **Appropriate input types** | `type="email"`, `type="tel"`, `inputmode="numeric"` for mobile keyboards | Audit all `<input>` elements |
| **No tiny selects**         | Dropdowns large enough to tap                                            | Visual inspection            |

### 1.7 Performance (Mobile-Critical)

| Requirement               | Implementation                                   | Verification Method                                |
| ------------------------- | ------------------------------------------------ | -------------------------------------------------- |
| **No layout shift (CLS)** | Images have explicit dimensions, fonts preloaded | Lighthouse audit                                   |
| **Fast first paint**      | Critical CSS inlined, minimal blocking JS        | Lighthouse audit                                   |
| **Deferred non-critical** | `loading="lazy"` on below-fold images            | Grep for `<Image>` without `priority` or `loading` |

---

## 2. Testing Matrix

| Viewport Width | Device Class                 | Priority                       |
| -------------- | ---------------------------- | ------------------------------ |
| 320px          | iPhone SE, small Android     | **Critical** — minimum viable  |
| 375px          | iPhone 12/13/14              | **Critical** — primary mobile  |
| 412px          | Pixel, Samsung Galaxy        | **Critical** — primary Android |
| 768px          | iPad portrait                | High — tablet breakpoint       |
| 1024px         | iPad landscape, small laptop | High — desktop threshold       |
| 1440px+        | Desktop                      | Medium — max-width behavior    |

---

## 3. Current PLG Website Gaps

### 3.1 Critical Issues

| Gap                                                   | Location                               | Impact                                                                |
| ----------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------- |
| Nav links hidden on mobile with no hamburger fallback | `Header.js` line 50: `hidden md:flex`  | Users cannot navigate to Features, Pricing, Docs, FAQ, About, Contact |
| Sign In link hidden below sm: breakpoint              | `Header.js` line 80: `hidden sm:block` | Existing users cannot sign in on mobile                               |
| Portal/Sign In inaccessible on Android                | Same root cause                        | Confirmed by SWR testing                                              |
| No mobile drawer/overlay implementation               | Missing component                      | No mobile nav pattern exists                                          |

### 3.2 Unknown Status (Requires Audit)

| Area                     | Question                               | Location                 |
| ------------------------ | -------------------------------------- | ------------------------ |
| Portal sidebar on mobile | Does it collapse? Overlay? Hidden?     | `PortalSidebar.js`       |
| Form inputs              | Fixed widths? Appropriate input types? | All form pages           |
| Touch target sizing      | Do all buttons meet 44px minimum?      | All interactive elements |
| Breakpoint consistency   | Any rogue custom breakpoints?          | Entire codebase          |

---

## 4. Automated Audit Script

### 4.1 Script: `scripts/audit-mobile-responsive.sh`

```bash
#!/usr/bin/env bash
# Mobile Responsiveness Audit Script
# Scans plg-website/src for common mobile anti-patterns

set -euo pipefail

SRC_DIR="plg-website/src"
REPORT_FILE="mobile-audit-report.txt"

echo "=== Mobile Responsiveness Audit ===" | tee "$REPORT_FILE"
echo "Date: $(date)" | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

# 1. Fixed pixel widths (anti-pattern)
echo "--- Fixed Pixel Widths (w-[Npx] or width: Npx) ---" | tee -a "$REPORT_FILE"
grep -rn --include="*.js" --include="*.jsx" 'w-\[[0-9]*px\]' "$SRC_DIR" 2>/dev/null | tee -a "$REPORT_FILE" || echo "  None found ✓" | tee -a "$REPORT_FILE"
grep -rn --include="*.js" --include="*.jsx" 'width:.*[0-9]px' "$SRC_DIR" 2>/dev/null | tee -a "$REPORT_FILE" || echo "  None found ✓" | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

# 2. Hidden without mobile fallback (critical)
echo "--- Hidden Patterns Without Mobile Fallback ---" | tee -a "$REPORT_FILE"
echo "(Review each: does the component have a mobile alternative?)" | tee -a "$REPORT_FILE"
grep -rn --include="*.js" --include="*.jsx" 'hidden md:' "$SRC_DIR" 2>/dev/null | tee -a "$REPORT_FILE" || echo "  None found ✓" | tee -a "$REPORT_FILE"
grep -rn --include="*.js" --include="*.jsx" 'hidden sm:' "$SRC_DIR" 2>/dev/null | tee -a "$REPORT_FILE" || echo "  None found ✓" | tee -a "$REPORT_FILE"
grep -rn --include="*.js" --include="*.jsx" 'hidden lg:' "$SRC_DIR" 2>/dev/null | tee -a "$REPORT_FILE" || echo "  None found ✓" | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

# 3. Hover-only interactions (accessibility concern)
echo "--- Hover-Only Interactions (no focus/active equivalent) ---" | tee -a "$REPORT_FILE"
echo "(Lines with hover: but no focus: or active: on same element)" | tee -a "$REPORT_FILE"
grep -rn --include="*.js" --include="*.jsx" 'hover:' "$SRC_DIR" 2>/dev/null | grep -v 'focus:\|active:' | head -50 | tee -a "$REPORT_FILE" || echo "  None found ✓" | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

# 4. Very small text (potential readability issue on mobile)
echo "--- Very Small Text (text-xs without responsive override) ---" | tee -a "$REPORT_FILE"
grep -rn --include="*.js" --include="*.jsx" 'text-xs' "$SRC_DIR" 2>/dev/null | grep -v 'sm:text-\|md:text-\|lg:text-' | tee -a "$REPORT_FILE" || echo "  None found ✓" | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

# 5. Non-Next.js images (may lack responsive handling)
echo "--- Non-Next.js Images (<img> tags) ---" | tee -a "$REPORT_FILE"
grep -rn --include="*.js" --include="*.jsx" '<img' "$SRC_DIR" 2>/dev/null | tee -a "$REPORT_FILE" || echo "  None found ✓" | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

# 6. Breakpoint usage summary
echo "--- Breakpoint Usage Summary ---" | tee -a "$REPORT_FILE"
echo "sm: $(grep -ro --include="*.js" --include="*.jsx" 'sm:' "$SRC_DIR" 2>/dev/null | wc -l) occurrences" | tee -a "$REPORT_FILE"
echo "md: $(grep -ro --include="*.js" --include="*.jsx" 'md:' "$SRC_DIR" 2>/dev/null | wc -l) occurrences" | tee -a "$REPORT_FILE"
echo "lg: $(grep -ro --include="*.js" --include="*.jsx" 'lg:' "$SRC_DIR" 2>/dev/null | wc -l) occurrences" | tee -a "$REPORT_FILE"
echo "xl: $(grep -ro --include="*.js" --include="*.jsx" 'xl:' "$SRC_DIR" 2>/dev/null | wc -l) occurrences" | tee -a "$REPORT_FILE"
echo "2xl: $(grep -ro --include="*.js" --include="*.jsx" '2xl:' "$SRC_DIR" 2>/dev/null | wc -l) occurrences" | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

# 7. Custom media queries (may indicate rogue breakpoints)
echo "--- Custom Media Queries ---" | tee -a "$REPORT_FILE"
grep -rn --include="*.js" --include="*.jsx" --include="*.css" '@media' "$SRC_DIR" 2>/dev/null | tee -a "$REPORT_FILE" || echo "  None found ✓" | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

# 8. Viewport meta check
echo "--- Viewport Meta Tag ---" | tee -a "$REPORT_FILE"
if grep -r 'viewport' "$SRC_DIR/app/layout.js" 2>/dev/null; then
    echo "  Found in layout.js ✓" | tee -a "$REPORT_FILE"
else
    echo "  WARNING: No viewport meta found in layout.js" | tee -a "$REPORT_FILE"
fi
echo "" | tee -a "$REPORT_FILE"

# 9. Input types audit
echo "--- Input Elements (check for appropriate types) ---" | tee -a "$REPORT_FILE"
grep -rn --include="*.js" --include="*.jsx" '<input\|<Input' "$SRC_DIR" 2>/dev/null | head -30 | tee -a "$REPORT_FILE" || echo "  None found" | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

# 10. Button/link sizing (manual review needed for 44px minimum)
echo "--- Buttons and Links (review for 44px touch target) ---" | tee -a "$REPORT_FILE"
echo "Button components: $(grep -ro --include="*.js" --include="*.jsx" '<Button' "$SRC_DIR" 2>/dev/null | wc -l)" | tee -a "$REPORT_FILE"
echo "Link components: $(grep -ro --include="*.js" --include="*.jsx" '<Link' "$SRC_DIR" 2>/dev/null | wc -l)" | tee -a "$REPORT_FILE"
echo "(Manual review required to verify touch target sizing)" | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

echo "=== Audit Complete ===" | tee -a "$REPORT_FILE"
echo "Report saved to: $REPORT_FILE" | tee -a "$REPORT_FILE"
```

### 4.2 Usage

```bash
cd ~/source/repos/hic-ai-inc.github.io
chmod +x scripts/audit-mobile-responsive.sh
./scripts/audit-mobile-responsive.sh
```

### 4.3 Interpreting Results

| Finding                              | Severity     | Action                                                   |
| ------------------------------------ | ------------ | -------------------------------------------------------- |
| `hidden md:` without mobile fallback | **Critical** | Implement mobile alternative (drawer, bottom nav, etc.)  |
| `hidden sm:`                         | **Critical** | Same as above                                            |
| Fixed pixel widths (`w-[Npx]`)       | High         | Replace with responsive classes or max-width constraints |
| Hover-only interactions              | Medium       | Add `focus:` and `active:` states                        |
| `text-xs` without responsive         | Low          | Evaluate readability at 320px                            |
| `<img>` tags                         | Medium       | Replace with Next.js `<Image>` for optimization          |

---

## 5. Prioritized Fix Sequence

### 5.1 Launch-Critical (Must Fix)

| Priority | Item                                           | Effort | Tracker Reference      |
| -------- | ---------------------------------------------- | ------ | ---------------------- |
| P0       | Mobile navigation drawer (hamburger → overlay) | 1.5h   | NAV-2                  |
| P0       | Sign In/Portal buttons visible on mobile       | 15m    | Part of NAV-2          |
| P1       | Verify portal sidebar mobile behavior          | 30m    | 1.4 audit              |
| P1       | Test all pages at 320px, 375px, 412px          | 1h     | Final responsive check |

### 5.2 Post-Launch Enhancement

| Priority | Item                                           | Effort |
| -------- | ---------------------------------------------- | ------ |
| P2       | Touch target sizing audit and fixes            | 1–2h   |
| P2       | Image srcset/sizes optimization                | 1h     |
| P2       | Form input type audit                          | 30m    |
| P3       | Layout shift (CLS) optimization                | 1h     |
| P3       | Custom breakpoint consolidation (if any found) | 30m    |

---

## 6. Recommended Approach

**Option A: Audit First (Recommended)**

1. Run `audit-mobile-responsive.sh`
2. Review report, categorize findings by severity
3. Fix Critical issues (NAV-2 addresses the main gap)
4. Fix High issues
5. Document Medium/Low for post-launch

**Option B: Fix Known Gaps First**

1. Implement NAV-2 (mobile nav drawer) — addresses confirmed critical issues
2. Run audit to discover additional gaps
3. Fix discovered issues

**Recommendation:** Option A provides visibility into the full scope before committing to fixes. The audit takes ~2 minutes to run and produces actionable output.

---

## 7. Relationship to Tracker Items

| Tracker Item                       | Relationship                                     |
| ---------------------------------- | ------------------------------------------------ |
| **1.4** Mobile navigation          | Audit informs scope; NAV-2 addresses primary gap |
| **NAV-2** Mobile navigation drawer | Direct fix for critical issues                   |
| **Final responsive check**         | Validation pass after all fixes                  |
| **2.5** Accessibility basics       | Overlaps with touch targets, focus states        |

---

## Document History

| Date       | Author | Changes          |
| ---------- | ------ | ---------------- |
| 2026-03-14 | GC     | Initial document |
