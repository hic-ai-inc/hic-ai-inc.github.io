---
applyTo: "**"
description: "HIC security and authorization boundaries"
---

# HIC Security Requirements

## Security Principles

- Enterprise-grade security locally and on AWS
- Least-privilege access everywhere
- Secure coding per `02-coding-standards.md`
- Encrypted data (DynamoDB, S3, Secrets Manager)
- Zero hardcoded credentials
- Comprehensive sanitized audit logging

## Core References

- [AWS Well-Architected - Security Pillar](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/welcome.html)
- [AWS SDK Security Best Practices](https://docs.aws.amazon.com/sdk-for-javascript/latest/developer-guide/security.html)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE/CVE Database](https://cwe.mitre.org/)

## Data Protection

- Mask sensitive data: `[REDACTED:api-key]`, `[REDACTED:token]`
- Use AWS Secrets Manager for credentials, API keys, tokens
- Never log: passwords, tokens, secrets, PII, sensitive identifiers
- Encrypt at rest (DynamoDB, S3) and in transit (TLS/HTTPS)

## Authentication & Authorization

**Authentication:**
- OAuth2.1 best practices for human and M2M
- Mathematical signatures (JWTs) issued by Cognito
- Short-lived tokens, rotating refresh tokens

**Authorization:**
- Minimum IAM roles, tightly scoped to resources
- Enforce boundaries for all components
- Review IAM policies for over-permissions
- See `03-architecture-patterns.md` for enforcement details

## Dependency Security

**All dependencies via `/dm` layer system:**
- AWS SDKs only - no npm packages except through `/dm`
- Document security review findings
- Include CVE scanning in PR descriptions
- See `01-system-foundations.md` for `/dm` details

## Pre-Deployment Checklist

- [ ] No hardcoded credentials, magic values, secrets
- [ ] All inputs validated with guard clauses
- [ ] Sensitive data masked in logs
- [ ] IAM permissions least privilege
- [ ] Dependencies documented with CWE/CVE references
- [ ] Code follows `02-coding-standards.md` Rule #3
- [ ] Logging uses base layer utilities (safeLog, safeParseJson, HicLog)

## Base Layer Security Utilities

Available in `/dm/layers/base/src/`:

- **safeLog()** - Logs without exposing sensitive data
- **safeParseJson()** - Safe JSON parsing with error handling
- **HicLog** - Structured logger with sanitization

## Security Best Practices

**Do your homework:**
- Most issues discoverable via official docs (AWS, CWE/CVE, OWASP)
- Document issues with specific vulnerability codes (e.g., "Line 83: [CWE-117](https://cwe.mitre.org/data/definitions/117.html) log injection risk")
- Never assume - always verify and validate

**Naming discrepancies are security issues:**
- Treat as high-priority - can lead to vulnerabilities

**If you see something, say something:**
- Communicate security issues immediately for research and resolution
