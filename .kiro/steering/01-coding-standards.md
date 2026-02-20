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

## Six Core Rules

1. **If you see something, say something** — don't fix silently, communicate
2. **Don't make assumptions** — read the file, verify, then proceed
3. **Security is everyone's responsibility** — consider implications, reference CWE/CVE
4. **Naming discrepancies are high-priority issues** — consistency is critical in AI-generated codebases
5. **Simple is not always easy, but always worth it** — comments explain WHY, not WHAT
6. **Ask for a second opinion** — suggest external review for critical subjects

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
- For 25+ tests: prepare detailed outlines with 'should' statements first

## Security

- Zero hardcoded credentials — use AWS Secrets Manager
- Mask sensitive data: `[REDACTED:api-key]`, `[REDACTED:token]`
- Encrypt at rest and in transit
- Least-privilege IAM policies
- All dependencies via `/dm` layer system only
