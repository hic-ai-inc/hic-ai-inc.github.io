---
applyTo: "**"
description: "HIC coding standards and quality practices"
---

<!-- ⛔ MANDATORY: Use Mouse tools (quick_edit, batch_quick_edit) for ALL file editing. See 00-mandatory-tool-rules.md -->

# HIC Coding Standards

## General

- Bash + Node.js/JavaScript only (no TypeScript)
- ES6+ syntax, AWS SDKs via `dm/facade/helpers/` only
- Use `dm/facade/test-helpers/` instead of Jest
- Test coverage >80%

## Six Core Rules

1. **If you see something, say something** - Don't fix silently, communicate
2. **Don't make assumptions** - Read the file, verify, then proceed
3. **Security is everyone's responsibility** - Document with CWE/CVE codes
4. **Treat naming discrepancies as high-priority** - Critical in AI codebases
5. **Simple is worth the effort** - Comments explain WHY, not WHAT
6. **Ask for a second opinion** - Use another Agent to check your work

## Testing

- Each source file needs companion `.test.js` in parallel `tests/` directory
- For 25+ tests: prepare detailed outlines first
- Test success and error paths

## Debugging

- Learn first, be surgical, smallest possible change
- Don't change business logic unless necessary
