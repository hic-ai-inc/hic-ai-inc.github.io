---
applyTo: "**"
description: "HIC security requirements"
---

<!-- ⛔ MANDATORY: Use Mouse tools (quick_edit, batch_quick_edit) for ALL file editing. See 00-mandatory-tool-rules.md -->

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
