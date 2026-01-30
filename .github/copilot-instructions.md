# HIC AI Copilot Instructions

## Tool Preference: Mouse over Built-ins

For file editing, prefer Mouse MCP tools (`quick_edit`, `batch_quick_edit`) over built-in tools (`replace_string_in_file`, `multi_replace_string_in_file`). Mouse tools have better accuracy and are purpose-built for this workspace.

| Task           | Tool               |
| -------------- | ------------------ |
| Single edit    | `quick_edit`       |
| Multiple edits | `batch_quick_edit` |
| Search first   | `find_in_file`     |

---

## User Preferences

**Human In Charge:** Simon (direct) / SWR (references)

## Communication

- **Concise & direct** - skip preambles, match depth to task
- **Thorough documentation** - comprehensive memos for major decisions
- **Planning before implementation** - Q Developer as Chief Reviewer, SWR final approval

## Technical Philosophy

- **Security first** - extra diligence for foundational primitives
- **Boring design, extraordinary value** - AWS best practices, proven architectures
- **Quality over speed** - get it right, test thoroughly

## Naming

- Direct: "Simon" / References: "SWR"
- Platform: `human:swr`, `hic-platform-human-signature-swr`

---

# HIC System Foundations

## Vision

**HIC = Humans In Charge**

- **Human Users** - Policy, approval, ownership, responsibility
- **AI Agents** - Execution, tactical decisions, aligned with Human
- **Alignment is the architecture** - Every action traces to a Human

## MCP Architecture

Local relay exposes tools to AI agents in VS Code:

- **Server:** `mcp/src/core/`
- **Tools:** 4 groups (~27 functions): calculator, datetime, notepad, mouse
- **Registry:** `tools/registry/tool-registry.js`

## Dependency Management (/dm)

- `dm/layers/` - Lambda layers, AWS SDK bundles
- `dm/facade/test-helpers/` - Jest-like testing (zero external deps)
- **Constraints:** Bash + Node.js only. No TypeScript, no Jest, no direct AWS SDK imports.

## Notepad

**USE CONSTANTLY** for session memory and agent coordination:

- `make_note` / `make_shared_note` - Remember and coordinate
- `list_notes` / `search_notes` - Review context
- 25-line max per note

## Workflow

Feature branches (`feature/*`) → `development` → `main` after tests pass.

## Amplify Environment Variables — CRITICAL

**NEVER write raw AWS CLI commands for Amplify env vars. ALWAYS use existing scripts:**

| Task | Script |
|------|--------|
| View/backup vars | `./scripts/backup-amplify-env.sh development` |
| Add/update vars | `./scripts/update-amplify-env.sh KEY=value` |
| Restore vars | `./scripts/restore-amplify-env.sh <backup-file>` |

**Why:** Amplify has TWO levels of env vars (app-level AND branch-level). Our scripts update BOTH. Raw CLI commands like `aws amplify get-app --query 'app.environmentVariables'` only show app-level, missing branch-level vars where the real config lives.

---

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

---

# HIC Architecture Patterns

## Design Patterns

- Serverless (Lambda, Step Functions, DynamoDB)
- Event-driven (SNS/SQS)
- Least-privilege IAM
- Dependency injection for testability

## Local Development

MCP relay connects AI agents to HIC Local Tool Registry:

**Agents → MCP Server → Tool Registry → Tools**

Each component independently testable. Single Node process exposes tools to Copilot and Q Developer.

## Remote Development

Serverless microservices on AWS Lambda with DynamoDB, SNS/SQS, Cognito, API Gateway. CloudFormation for IaC.

**Lambda Pattern:** Lambdas orchestrate, delegating to services/utilities via `/dm` layers.

**Constraints:** JavaScript (Node.js 20.x) + Bash only. No external dependencies except AWS SDKs via `/dm`.

---

# HIC MCP Tools

**4 tool groups, ~27 tools**

## Mouse - File Editing

| Task           | Tool               | Notes                    |
| -------------- | ------------------ | ------------------------ |
| Single edit    | `quick_edit`       | Instant save             |
| Multiple edits | `batch_quick_edit` | Must call `save_changes` |
| Search first   | `find_in_file`     | Use before complex edits |
| New file       | `create_file`      | Then Mouse for edits     |

**Operations:** insert, replace, delete, replace_range, for_lines, adjust

## Notepad - Memory & Coordination

- `make_note` / `make_shared_note` - Remember / coordinate with other agent
- `list_notes` / `search_notes` - Review context
- 25-line max per note

## Calculator - Deterministic Math

- `get_sum([10, 20, 30])` → 60
- `get_difference(100, 37)` → 63
- `get_product([3, 4, 5])` → 60
- `get_quotient(a, b)` → precise division

**Always use for arithmetic. Never mental math.**

## DateTime - Timezone-Safe

- `get_utc_date()` / `get_utc_time()` - For code/logs
- `get_local_time("EST")` - For humans
- `get_unix_timestamp()` - For calculations

---

# HIC Security Requirements

## Principles

- Least-privilege access everywhere
- Encrypted data (DynamoDB, S3, Secrets Manager)
- Zero hardcoded credentials
- Comprehensive sanitized audit logging

## Data Protection

- Mask sensitive data: `[REDACTED:api-key]`, `[REDACTED:token]`
- Use AWS Secrets Manager for credentials
- Never log: passwords, tokens, secrets, PII
- Encrypt at rest and in transit

## Authentication & Authorization

- OAuth2.1 best practices
- Short-lived tokens, rotating refresh tokens
- Minimum IAM roles, tightly scoped

## Dependencies

All via `/dm` layer system. Document security review findings with CVE references.

## References

- [AWS Well-Architected Security](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE/CVE Database](https://cwe.mitre.org/)

---

## Reminder

Please remember **Only** use `quick_edit` or `batch_quick_edit` for all file edits; do not use `replace_string_in_file` or `multi_replace_string_in_file`.
