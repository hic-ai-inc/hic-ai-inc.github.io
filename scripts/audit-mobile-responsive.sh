#!/usr/bin/env bash
# Mobile Responsiveness Audit Script
# Scans plg-website/src for common mobile anti-patterns
#
# Usage: ./scripts/audit-mobile-responsive.sh
# Output: mobile-audit-report.txt

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
if grep -q 'viewport' "$SRC_DIR/app/layout.js" 2>/dev/null; then
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
echo "Report saved to: $REPORT_FILE"
