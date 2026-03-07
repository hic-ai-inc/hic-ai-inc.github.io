# SAST Session [N] Findings Template

**Date:** [YYYY-MM-DD]  
**Session:** [N of 5]  
**Files Reviewed:** [List file paths]  
**Focus Areas:** [List specific security concerns]  
**Tool:** Amazon Q Code Review SAST  
**Reviewer:** [Your name]

---

## Executive Summary

**Total Findings:** [N]
- 🔴 Critical: [N]
- 🟠 High: [N]
- 🟡 Medium: [N]
- 🟢 Low: [N]
- ℹ️ Info: [N]

**Launch Blockers:** [N Critical + N High in unauthenticated endpoints]  
**Post-Launch:** [N Medium + N Low]  
**False Positives:** [N]

**Overall Assessment:** [One paragraph summary of security posture]

---

## Critical Findings

### [C-1] [Short descriptive title]

**File:** `[path/to/file.js:line]`  
**CWE:** [CWE-XXX](https://cwe.mitre.org/data/definitions/XXX.html) - [CWE Name]  
**CVE:** [CVE-YYYY-NNNNN](https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-YYYY-NNNNN) *(if applicable)*

**Description:**  
[What is the vulnerability? Be specific about the code pattern or logic flaw.]

**Impact:**  
[What could an attacker do? What data could be exposed? What operations could be performed?]

**Affected Code:**
```javascript
// Line XX-YY
[Paste relevant code snippet]
```

**Remediation:**  
[Specific steps to fix. Include code examples if helpful.]

**Status:** [Choose one]
- [ ] Launch Blocker - Must fix before production
- [ ] Post-Launch - Fix in next sprint
- [ ] False Positive - Explain why

**Assigned To:** [Name]  
**Target Date:** [YYYY-MM-DD]  
**GitHub Issue:** [#NNN](link) *(if created)*

---

### [C-2] [Next critical finding]
[Same format as above]

---

## High Findings

### [H-1] [Short descriptive title]

**File:** `[path/to/file.js:line]`  
**CWE:** [CWE-XXX](https://cwe.mitre.org/data/definitions/XXX.html) - [CWE Name]

**Description:**  
[What is the vulnerability?]

**Impact:**  
[What could an attacker do?]

**Affected Code:**
```javascript
// Line XX-YY
[Paste relevant code snippet]
```

**Remediation:**  
[How to fix?]

**Status:** [Launch Blocker / Post-Launch / False Positive]  
**Assigned To:** [Name]  
**Target Date:** [YYYY-MM-DD]

---

### [H-2] [Next high finding]
[Same format as above]

---

## Medium Findings

### [M-1] [Short descriptive title]

**File:** `[path/to/file.js:line]`  
**CWE:** [CWE-XXX](https://cwe.mitre.org/data/definitions/XXX.html) - [CWE Name]

**Description:**  
[Brief description]

**Impact:**  
[Potential impact]

**Remediation:**  
[How to fix]

**Status:** Post-Launch  
**GitHub Issue:** [#NNN](link)

---

## Low Findings

### [L-1] [Short descriptive title]
**File:** `[path/to/file.js:line]` | **CWE:** [CWE-XXX](link)  
**Description:** [One sentence]  
**Remediation:** [One sentence]

### [L-2] [Next low finding]
[Same brief format]

---

## Info Findings

### [I-1] [Short descriptive title]
**File:** `[path/to/file.js:line]`  
**Description:** [One sentence - code quality, best practice suggestion, etc.]

### [I-2] [Next info finding]
[Same brief format]

---

## False Positives

### [FP-1] [Short descriptive title]
**File:** `[path/to/file.js:line]`  
**Tool Finding:** [What the tool flagged]  
**Why False Positive:** [Explain why this is not actually a vulnerability]  
**Evidence:** [Code context, business logic, or architectural reason]

### [FP-2] [Next false positive]
[Same format]

---

## Security Posture Assessment

### Strengths
- [What is this file/module doing well from a security perspective?]
- [E.g., "Webhook signature verification properly implemented"]
- [E.g., "Input validation comprehensive"]

### Weaknesses
- [What security gaps exist?]
- [E.g., "Error messages leak internal details"]
- [E.g., "Rate limiting not implemented"]

### Recommendations
1. [Specific actionable recommendation]
2. [Another recommendation]
3. [Another recommendation]

---

## Cross-File Concerns

[If findings span multiple files or indicate architectural issues]

### [Concern 1: Title]
**Affected Files:** [List]  
**Description:** [What is the cross-cutting concern?]  
**Recommendation:** [How to address at architectural level?]

---

## Testing Recommendations

[Specific security tests to add based on findings]

1. **[Test Category]:** [Specific test case]
   - File: `[test file path]`
   - Scenario: [What to test]
   - Expected: [What should happen]

2. **[Next test category]:** [Next test case]

---

## Monitoring Recommendations

[CloudWatch alarms, metrics, or log patterns to add based on findings]

1. **[Metric/Alarm Name]:** [What to monitor]
   - Threshold: [Value]
   - Action: [What to do when triggered]

2. **[Next monitoring item]**

---

## Follow-Up Actions

### Immediate (Before Next Session)
- [ ] [Action item 1]
- [ ] [Action item 2]

### Short-Term (Before Launch)
- [ ] [Action item 1]
- [ ] [Action item 2]

### Long-Term (Post-Launch)
- [ ] [Action item 1]
- [ ] [Action item 2]

---

## Session Notes

[Any additional context, observations, or questions that arose during the review]

---

## Appendix: Tool Output

[Optional: Paste raw tool output or link to Code Issues Panel export]

---

## Document History

| Date | Author | Changes |
|------|--------|---------|
| [YYYY-MM-DD] | [Name] | Initial findings documented |
| [YYYY-MM-DD] | [Name] | Updated after remediation |

---

**Next Steps:**
1. Review findings with team
2. Create GitHub issues for Post-Launch items
3. Begin remediation of Launch Blockers
4. Schedule Session [N+1]
