---
applyTo: "**"
description: "HIC coding standards and quality practices"
---

# HIC Coding Standards

## General Guidelines

- Follow existing project structure and conventions
- Bash + Node.js/JavaScript only (no TypeScript)
- ES6+ syntax everywhere
- AWS SDKs via `dm/facade/helpers/index.js` only
- Use `dm/facade/test-helpers/index.js` instead of Jest

## Code Quality

- Minimal implementations - only code that solves the requirement
- Clear, highly consistent naming is **crucial**
- Test coverage >80% required
- Follow existing patterns in codebase

## Six Core Rules

### Rule #1: If you see something, say something

Notice anything off? Bring it up promptly. Write a shared note, tell your human user, document clearly. Don't fix silently - communicate so everyone learns.

### Rule #2: Don't make assumptions

Large, growing codebase. If you haven't read and understood the relevant code yourself, don't assume. Read the file, verify understanding, then proceed. Make notes if complex.

### Rule #3: Security is everyone's responsibility

Always consider security implications. Unsure? Raise it with the team. Review official docs (CWE/CVE, OWASP). Document issues with specific vulnerability codes.

### Rule #4: Treat naming discrepancies as high-priority issues

Naming conventions are **absolutely critical** in AI-generated codebases. Ambiguities cause unexpected difficulties. Think hard about names for classes, methods, functions, variables, parameters, files, directories.

**Example - Good naming:**
Calculator tools: `get_sum`, `get_difference`, `get_product`, `get_quotient` - highly consistent and descriptive.

**Example - Bad naming:**
Generic names like `request`, `response`, `error` without context. Use `llmRequest`, `validatedUserRequest`, `finalUserRequest` to clarify role and state.

Use Notepad to track naming decisions. Your future self will thank you.

### Rule #5: Simple is not always easy, but it is always worth the effort

Strive for simplicity. Simple code is easier to read, maintain, debug. Break complex tasks into smaller functions. Avoid deep nesting and over-engineering.

**Comments explain WHY, not WHAT.** If you need extensive comments to explain what code does, refactor for clarity first.

Simplicity takes hard work and multiple revisions. Iterate, refine, seek feedback.

### Rule #6: Ask for a second opinion

**Ask another Agent to check your work!** Best way to improve quality.

Ask for specific checks: naming conventions, error handling, security considerations.

For critical subjects: Suggest external AI review (GPT-5 Deep Thinking, Console Q for AWS questions).

Document all feedback so everyone learns.

## Helpful Hints

- Extract hardcoded values to enums
- Think carefully about naming - be proactive, prioritize consistency
- Don't guess about security - identify, document with CVE references, discuss
- Proper input validation with guard clauses (null, nonexistent, out-of-range)
- Keep functions small, single responsibility
- Avoid deep nesting
- DRY (Don't Repeat Yourself)
- Think through error handling
- JSDoc comments for all functions
- Commit frequently with descriptive messages
- Use dependency injection

## Testing

- Use `dm/facade/test-helpers/index.js` (Jest-like replacement)
- Mock AWS SDK via `dm/facade/helpers/index.js`
- Each source file needs companion `.test.js` in parallel `tests/` directory
- For 25+ tests: prepare detailed outlines with 'should' statements first
- Test both success and error paths
- Validate business logic, not implementation details

## Debugging

**Logical and functional debugging only.** For performance optimization, consult team.

- Learn first before acting - read code carefully
- Research existing solutions before implementing your own
- Be surgical - smallest possible change
- Explain your reasoning clearly
- Don't change business logic unless absolutely necessary
- Make notes, talk to pair programmer, keep human user updated
