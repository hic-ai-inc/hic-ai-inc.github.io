#!/bin/bash
# =============================================================================
# Accessibility Audit Script
# =============================================================================
# Purpose: Automated detection of common accessibility issues in PLG website
# Target: WCAG 2.1 AA compliance
# Date: 2026-03-14
#
# Usage: ./scripts/audit-accessibility.sh [options]
# Options:
#   --no-color    Disable colored output
#   --report      Generate detailed report file
#
# Note: This script catches grep-detectable patterns. For full accessibility
# testing, use Lighthouse, axe DevTools, and manual keyboard/screen reader testing.
# =============================================================================

set -e

# Colors
if [[ "$1" == "--no-color" ]]; then
    RED=""
    YELLOW=""
    GREEN=""
    BLUE=""
    NC=""
else
    RED='\033[0;31m'
    YELLOW='\033[0;33m'
    GREEN='\033[0;32m'
    BLUE='\033[0;34m'
    NC='\033[0m'
fi

REPORT_MODE=false
if [[ "$*" == *"--report"* ]]; then
    REPORT_MODE=true
    REPORT_FILE="accessibility-audit-report.txt"
    echo "Accessibility Audit Report - $(date)" > "$REPORT_FILE"
    echo "========================================" >> "$REPORT_FILE"
fi

# Counters
CRITICAL_COUNT=0
HIGH_COUNT=0
MEDIUM_COUNT=0
LOW_COUNT=0

log() {
    echo -e "$1"
    if $REPORT_MODE; then
        echo "$1" | sed 's/\x1b\[[0-9;]*m//g' >> "$REPORT_FILE"
    fi
}

# -----------------------------------------------------------------------------
# Utility Functions
# -----------------------------------------------------------------------------

check_pattern() {
    local desc="$1"
    local pattern="$2"
    local glob="$3"
    local severity="$4"
    local context="${5:-2}"

    log ""
    log "${BLUE}Checking:${NC} $desc"

    # Find files and check pattern
    results=$(find plg-website/src -name "$glob" -type f 2>/dev/null | xargs grep -Hn -E "$pattern" 2>/dev/null || true)

    if [[ -n "$results" ]]; then
        case "$severity" in
            critical) log "${RED}[CRITICAL]${NC} Found issues:"; ((CRITICAL_COUNT++)) || true ;;
            high) log "${RED}[HIGH]${NC} Found issues:"; ((HIGH_COUNT++)) || true ;;
            medium) log "${YELLOW}[MEDIUM]${NC} Found issues:"; ((MEDIUM_COUNT++)) || true ;;
            low) log "${YELLOW}[LOW]${NC} Found issues:"; ((LOW_COUNT++)) || true ;;
        esac
        echo "$results" | head -20 | while read -r line; do
            log "  $line"
        done
        count=$(echo "$results" | wc -l)
        if [[ $count -gt 20 ]]; then
            log "  ... and $((count - 20)) more"
        fi
    else
        log "${GREEN}[PASS]${NC} No issues found"
    fi
}

check_missing_pattern() {
    local desc="$1"
    local should_have="$2"
    local glob="$3"
    local severity="$4"

    log ""
    log "${BLUE}Checking:${NC} $desc"

    # Find files that don't contain the pattern
    results=""
    while IFS= read -r file; do
        if ! grep -q "$should_have" "$file" 2>/dev/null; then
            results+="$file"$'\n'
        fi
    done < <(find plg-website/src -name "$glob" -type f 2>/dev/null)

    if [[ -n "$results" && "$results" != $'\n' ]]; then
        case "$severity" in
            critical) log "${RED}[CRITICAL]${NC} Files missing pattern:"; ((CRITICAL_COUNT++)) || true ;;
            high) log "${RED}[HIGH]${NC} Files missing pattern:"; ((HIGH_COUNT++)) || true ;;
            medium) log "${YELLOW}[MEDIUM]${NC} Files missing pattern:"; ((MEDIUM_COUNT++)) || true ;;
            low) log "${YELLOW}[LOW]${NC} Files missing pattern:"; ((LOW_COUNT++)) || true ;;
        esac
        echo "$results" | grep -v '^$' | head -20 | while read -r line; do
            log "  $line"
        done
    else
        log "${GREEN}[PASS]${NC} All files have required pattern"
    fi
}

# -----------------------------------------------------------------------------
# Audit Checks
# -----------------------------------------------------------------------------

log ""
log "============================================================================="
log "                    ACCESSIBILITY AUDIT - PLG WEBSITE"
log "============================================================================="
log "Target: WCAG 2.1 AA Compliance"
log "Date: $(date)"
log "============================================================================="

# =============================================================================
# SECTION 1: CRITICAL - Images and Alt Text
# =============================================================================

log ""
log "${BLUE}━━━ SECTION 1: TEXT ALTERNATIVES (WCAG 1.1.1) ━━━${NC}"

# Check for images without alt attribute
check_pattern \
    "Images without alt attribute" \
    '<(img|Image)[^>]*(?<!alt=)[^>]*/?>' \
    "*.js" \
    "critical"

# Check for empty alt="" on non-decorative images (harder to detect automatically)
check_pattern \
    "Images with empty alt (verify if decorative)" \
    'alt=""' \
    "*.js" \
    "medium"

# Check for alt text that's just "image" or "photo"
check_pattern \
    "Non-descriptive alt text" \
    'alt="(image|photo|picture|icon|logo)"' \
    "*.js" \
    "medium"

# =============================================================================
# SECTION 2: KEYBOARD ACCESSIBILITY (WCAG 2.1.1, 2.4.7)
# =============================================================================

log ""
log "${BLUE}━━━ SECTION 2: KEYBOARD ACCESSIBILITY ━━━${NC}"

# Check for click handlers without keyboard equivalents
check_pattern \
    "onClick without onKeyDown/onKeyUp (potential keyboard trap)" \
    'onClick=\{[^}]+\}(?![^>]*onKey)' \
    "*.js" \
    "high"

# Check for positive tabindex (disrupts tab order)
check_pattern \
    "Positive tabindex (disrupts natural tab order)" \
    'tabIndex=["'"'"'][1-9]' \
    "*.js" \
    "high"

# Check for tabindex=-1 on potentially interactive elements
check_pattern \
    "tabIndex=-1 (verify element should be non-focusable)" \
    'tabIndex=["'"'"']-1["'"'"']' \
    "*.js" \
    "low"

# Check for focus indicators in Tailwind
log ""
log "${BLUE}Checking:${NC} Focus indicator usage"
focus_visible_count=$(grep -r "focus-visible:" plg-website/src --include="*.js" 2>/dev/null | wc -l || echo "0")
focus_count=$(grep -r "focus:" plg-website/src --include="*.js" 2>/dev/null | wc -l || echo "0")
log "  Found $focus_visible_count uses of focus-visible: and $focus_count uses of focus:"
if [[ $focus_visible_count -lt 5 ]]; then
    log "${YELLOW}[MEDIUM]${NC} Limited focus-visible indicators - keyboard users may not see focus"
    ((MEDIUM_COUNT++)) || true
else
    log "${GREEN}[PASS]${NC} Focus indicators appear to be used"
fi

# =============================================================================
# SECTION 3: SEMANTIC STRUCTURE (WCAG 1.3.1, 2.4)
# =============================================================================

log ""
log "${BLUE}━━━ SECTION 3: SEMANTIC STRUCTURE ━━━${NC}"

# Check for <main> usage in page files
log ""
log "${BLUE}Checking:${NC} Pages with <main> landmark"
page_files=$(find plg-website/src/app -name "page.js" -type f 2>/dev/null)
pages_without_main=""
while IFS= read -r file; do
    if [[ -n "$file" ]] && ! grep -q "<main" "$file" 2>/dev/null; then
        pages_without_main+="$file"$'\n'
    fi
done <<< "$page_files"

if [[ -n "$pages_without_main" && "$pages_without_main" != $'\n' ]]; then
    log "${RED}[CRITICAL]${NC} Pages missing <main> landmark:"
    ((CRITICAL_COUNT++)) || true
    echo "$pages_without_main" | grep -v '^$' | head -20 | while read -r line; do
        log "  $line"
    done
else
    log "${GREEN}[PASS]${NC} All pages have <main> landmark (or check layout.js)"
fi

# Check for multiple h1 elements
log ""
log "${BLUE}Checking:${NC} Multiple h1 elements per page"
while IFS= read -r file; do
    h1_count=$(grep -c "<h1" "$file" 2>/dev/null || echo "0")
    if [[ $h1_count -gt 1 ]]; then
        log "${YELLOW}[MEDIUM]${NC} Multiple h1 in: $file ($h1_count instances)"
        ((MEDIUM_COUNT++)) || true
    fi
done <<< "$page_files"

# Check for skipped heading levels (h1 -> h3 without h2)
check_pattern \
    "Potential heading level skip (h1 followed by h3+)" \
    '<h[1][^>]*>.*<h[3-6]' \
    "*.js" \
    "medium"

# Check for nav landmarks with aria-label
check_pattern \
    "<nav> without aria-label or aria-labelledby" \
    '<nav(?![^>]*aria-label)' \
    "*.js" \
    "medium"

# =============================================================================
# SECTION 4: FORMS AND LABELS (WCAG 1.3.1, 3.3)
# =============================================================================

log ""
log "${BLUE}━━━ SECTION 4: FORMS AND LABELS ━━━${NC}"

# Check for inputs without labels or aria-label
check_pattern \
    "Input elements without aria-label or aria-labelledby" \
    '<input(?![^>]*aria-label)(?![^>]*aria-labelledby)(?![^>]*type=["'"'"']hidden)' \
    "*.js" \
    "high"

# Check for form fields without autocomplete
check_pattern \
    "Email inputs without autocomplete" \
    'type=["'"'"']email["'"'"'](?![^>]*autoComplete)' \
    "*.js" \
    "medium"

# Check for password inputs without autocomplete
check_pattern \
    "Password inputs without autocomplete" \
    'type=["'"'"']password["'"'"'](?![^>]*autoComplete)' \
    "*.js" \
    "low"

# Check for required fields without aria-required
check_pattern \
    "Required fields without aria-required (if required attr not used)" \
    'required(?![^>]*aria-required)' \
    "*.js" \
    "low"

# =============================================================================
# SECTION 5: BUTTONS AND LINKS (WCAG 2.4.4, 2.5.3)
# =============================================================================

log ""
log "${BLUE}━━━ SECTION 5: BUTTONS AND LINKS ━━━${NC}"

# Check for buttons without type attribute
check_pattern \
    "Buttons without type attribute" \
    '<button(?![^>]*type=)' \
    "*.js" \
    "low"

# Check for empty buttons
check_pattern \
    "Potentially empty buttons (icon-only without aria-label)" \
    '<button[^>]*>[\s]*<(svg|icon|img)' \
    "*.js" \
    "high"

# Check for vague link text
check_pattern \
    "Links with vague text ('click here', 'read more', 'learn more')" \
    '>[^<]*(click here|read more|learn more|here)[^<]*</a>' \
    "*.js" \
    "medium"

# Check for empty links
check_pattern \
    "Empty links (no text content)" \
    '<a[^>]*>\s*</a>' \
    "*.js" \
    "high"

# Check for links that open in new tab without warning
check_pattern \
    "External links (target=_blank) - verify they have warning" \
    'target=["'"'"']_blank["'"'"']' \
    "*.js" \
    "low"

# =============================================================================
# SECTION 6: ARIA USAGE (WCAG 4.1.2)
# =============================================================================

log ""
log "${BLUE}━━━ SECTION 6: ARIA USAGE ━━━${NC}"

# Check for aria-hidden on interactive elements
check_pattern \
    "aria-hidden on potentially interactive elements" \
    'aria-hidden=["'"'"']true["'"'"'][^>]*(button|a href|input)' \
    "*.js" \
    "high"

# Check for role without appropriate aria attributes
check_pattern \
    "role='button' without keyboard handling" \
    'role=["'"'"']button["'"'"'](?![^>]*onClick)' \
    "*.js" \
    "high"

# Check for aria-expanded usage
log ""
log "${BLUE}Checking:${NC} aria-expanded usage on toggles"
expanded_count=$(grep -r "aria-expanded" plg-website/src --include="*.js" 2>/dev/null | wc -l || echo "0")
log "  Found $expanded_count uses of aria-expanded"
if [[ $expanded_count -lt 2 ]]; then
    log "${YELLOW}[MEDIUM]${NC} Limited aria-expanded usage - toggles may not announce state"
    ((MEDIUM_COUNT++)) || true
else
    log "${GREEN}[PASS]${NC} aria-expanded appears to be used"
fi

# Check for aria-live regions
log ""
log "${BLUE}Checking:${NC} aria-live region usage"
live_count=$(grep -r "aria-live" plg-website/src --include="*.js" 2>/dev/null | wc -l || echo "0")
role_alert_count=$(grep -r 'role="alert"\|role="status"' plg-website/src --include="*.js" 2>/dev/null | wc -l || echo "0")
log "  Found $live_count aria-live regions and $role_alert_count role=alert/status"
if [[ $((live_count + role_alert_count)) -lt 1 ]]; then
    log "${YELLOW}[MEDIUM]${NC} No live regions found - dynamic content may not be announced"
    ((MEDIUM_COUNT++)) || true
else
    log "${GREEN}[PASS]${NC} Live regions appear to be used"
fi

# =============================================================================
# SECTION 7: COLOR AND CONTRAST
# =============================================================================

log ""
log "${BLUE}━━━ SECTION 7: COLOR AND CONTRAST (Manual Required) ━━━${NC}"

# Check for color-only indicators
check_pattern \
    "Potential color-only indicator (text-red, text-green without icon)" \
    'text-(red|green|yellow|error|success|warning)-[0-9]+' \
    "*.js" \
    "low"

# Check for prefers-reduced-motion
log ""
log "${BLUE}Checking:${NC} prefers-reduced-motion support"
motion_count=$(grep -r "prefers-reduced-motion\|motion-reduce" plg-website/src --include="*.js" --include="*.css" 2>/dev/null | wc -l || echo "0")
log "  Found $motion_count references to reduced motion"
if [[ $motion_count -lt 1 ]]; then
    log "${YELLOW}[MEDIUM]${NC} No prefers-reduced-motion support found"
    ((MEDIUM_COUNT++)) || true
else
    log "${GREEN}[PASS]${NC} Motion preferences appear to be respected"
fi

# =============================================================================
# SECTION 8: LANGUAGE AND DOCUMENT STRUCTURE
# =============================================================================

log ""
log "${BLUE}━━━ SECTION 8: LANGUAGE AND DOCUMENT STRUCTURE (WCAG 3.1.1) ━━━${NC}"

# Check for html lang attribute in layout
log ""
log "${BLUE}Checking:${NC} HTML lang attribute"
if grep -q 'lang="en"\|lang={"en"}' plg-website/src/app/layout.js 2>/dev/null; then
    log "${GREEN}[PASS]${NC} HTML lang attribute found in layout.js"
else
    log "${RED}[CRITICAL]${NC} HTML lang attribute not found in layout.js"
    ((CRITICAL_COUNT++)) || true
fi

# Check for skip link
log ""
log "${BLUE}Checking:${NC} Skip link implementation"
if grep -rq "skip.*main\|skip.*content\|SkipLink" plg-website/src 2>/dev/null; then
    log "${GREEN}[PASS]${NC} Skip link appears to be implemented"
else
    log "${RED}[HIGH]${NC} No skip link found - keyboard users cannot bypass navigation"
    ((HIGH_COUNT++)) || true
fi

# =============================================================================
# SUMMARY
# =============================================================================

log ""
log "============================================================================="
log "                            AUDIT SUMMARY"
log "============================================================================="
log ""
log "${RED}CRITICAL:${NC} $CRITICAL_COUNT categories with issues"
log "${RED}HIGH:${NC}     $HIGH_COUNT categories with issues"
log "${YELLOW}MEDIUM:${NC}   $MEDIUM_COUNT categories with issues"
log "${YELLOW}LOW:${NC}      $LOW_COUNT categories with issues"
log ""

TOTAL=$((CRITICAL_COUNT + HIGH_COUNT + MEDIUM_COUNT + LOW_COUNT))
if [[ $TOTAL -eq 0 ]]; then
    log "${GREEN}✓ No issues detected by automated scan!${NC}"
else
    log "Total: $TOTAL issue categories detected"
fi

log ""
log "${BLUE}Next Steps:${NC}"
log "  1. Review and fix CRITICAL issues first"
log "  2. Run Lighthouse accessibility audit"
log "  3. Test with keyboard-only navigation"
log "  4. Test with a screen reader (VoiceOver, NVDA)"
log "  5. Verify color contrast with WebAIM Contrast Checker"
log ""
log "============================================================================="

if $REPORT_MODE; then
    log "Report saved to: $REPORT_FILE"
fi

# Exit with error code if critical issues found
if [[ $CRITICAL_COUNT -gt 0 ]]; then
    exit 1
fi

exit 0
