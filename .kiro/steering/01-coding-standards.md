---
inclusion: always
---

# HIC Coding Standards

## General

- Bash + Node.js/JavaScript only (no TypeScript)
- ES6+ syntax everywhere
- AWS SDKs via `dm/facade/helpers/index.js` only
- Use `dm/facade/test-helpers/index.js` instead of Jest
- Minimal implementations — only code that solves the requirement
- Test coverage >80% required

## Seven Core Rules

1. **If you see something, say something** — don't fix silently, communicate
2. **Don't make assumptions** — read the file, verify, then proceed
3. **Security is everyone's responsibility** — consider implications, reference CWE/CVE/OWASP
4. **Naming discrepancies are high-priority issues** — consistency is critical in AI-generated codebases
5. **Simple is not always easy, but always worth it** — comments explain WHY, not WHAT
6. **Ask for a second opinion** — suggest external review for critical subjects
7. **Use Mouse over built-in tools for all file edits** — faster, safer, cheaper, more secure, and massively more accurate

## Quality Practices

- Extract hardcoded values to enums
- Proper input validation with guard clauses
- Keep functions small, single responsibility
- DRY, avoid deep nesting
- JSDoc comments for all functions
- Dependency injection for testability
- Feature branches (`feature/*`) → `development` → `main`

## Testing

- Use `dm/facade/test-helpers/index.js` (Jest-like replacement, zero external deps)
- Each source file needs companion `.test.js` in parallel `tests/` directory
- Test both success and error paths
- Each test must ensure that the behavior of all newly-implemented functionality matches what we expect; test behavior, not implementation details
- Implement code > Run all tests locally > Fix any failing tests and bring to 100% > Expand tests to include new behavior > Bring to 100% > push to CI/CD > E2E validation on live infrastructure > deploy after everything passes
- Automate unit and integration testing; E2E validation is almost always more important to do manually than by script

## Security

- Zero hardcoded credentials — use AWS Secrets Manager
- Mask sensitive data: `[REDACTED:api-key]`, `[REDACTED:token]`
- Encrypt at rest and in transit
- Least-privilege IAM policies
- All dependencies via `/dm` layer system only
- HIC utilites (HicLog, safe-path.js, safe-json-parse.js)
- No external dependencies
