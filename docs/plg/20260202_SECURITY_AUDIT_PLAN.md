# Security Audit Plan for hic-ai-inc.github.io

**Document Version:** 1.0.0  
**Date:** February 2, 2026  
**Owner:** SWR + Q Developer  
**Context:** Pre-launch security hardening per PLG Roadmap TODO #14

---

## Executive Summary

This document outlines a comprehensive security audit plan for the hic-ai-inc.github.io repository ahead of production launch. The audit covers three critical areas:

1. **Code Security Review** - SAST scanning, authentication/authorization review, IAM policy validation
2. **Supply Chain Security** - Git repository hygiene, dependency vulnerabilities, distribution channel integrity
3. **DevSecOps Automation** - CI/CD security integration, automated vulnerability detection, monitoring/alerting

**Timeline:** ~50 hours total (22h TIER 1 blockers + 28h TIER 2 critical quality)

**Risk Assessment:** This is your first production deployment with real payments and customer data. Security posture must be solid before launch.

---

## Part 1: Code Security Review (~14h)

### 1.1 SAST (Static Application Security Testing) - 4h

**Objective:** Identify security vulnerabilities in source code before deployment.

**Tools to Use:**

| Tool | Scope | Priority |
|------|-------|----------|
| **Q Developer Code Review** | Full codebase SAST | 🔴 TIER 1 |
| Snyk Code | Dependency vulnerabilities | 🔴 TIER 2 |
| npm audit | Package vulnerabilities | 🔴 TIER 2 |

**Execution Plan:**

```bash
# Step 1: Q Developer Code Review (use built-in tool)
# Run full SAST scan on plg-website/ directory
# Focus areas: API routes, authentication, data handling

# Step 2: Snyk scan (if available)
npx snyk test --all-projects

# Step 3: npm audit
cd plg-website
npm audit --production
npm audit fix --dry-run  # Review before applying
```

**Critical Files to Review:**

- `plg-website/src/app/api/**/*` - All API routes
- `plg-website/src/middleware.js` - Auth middleware
- `plg-website/infrastructure/lambda/**/*` - Lambda functions
- `plg-website/amplify/backend.js` - Amplify backend config

**Common Vulnerabilities to Check:**

- [ ] SQL Injection (N/A - using DynamoDB)
- [ ] XSS (Cross-Site Scripting) in user inputs
- [ ] CSRF protection on state-changing operations
- [ ] Authentication bypass vulnerabilities
- [ ] Authorization flaws (horizontal/vertical privilege escalation)
- [ ] Sensitive data exposure in logs/errors
- [ ] Insecure direct object references
- [ ] Server-Side Request Forgery (SSRF)

### 1.2 Authentication & Authorization Review - 4h

**Objective:** Validate that auth flows are secure and properly implemented.

**Cognito Configuration Review:**

- [ ] User Pool settings (password policy, MFA options)
- [ ] OAuth2 flows properly configured
- [ ] Callback URLs restricted to production domains
- [ ] Token expiration times appropriate (ID: 1h, Refresh: 30d)
- [ ] User attributes properly scoped
- [ ] Pre-token Lambda trigger secure (if implemented)

**API Route Protection:**

Review every API endpoint in `plg-website/src/app/api/`:

| Endpoint | Auth Required? | Role Check? | Status |
|----------|----------------|-------------|--------|
| `/api/checkout` | ✅ Yes | Individual/Owner | ⬜ |
| `/api/portal/*` | ✅ Yes | User-specific | ⬜ |
| `/api/portal/team` | ✅ Yes | Admin+ | ⬜ |
| `/api/portal/billing` | ✅ Yes | Owner | ⬜ |
| `/api/webhooks/stripe` | ❌ No (webhook sig) | N/A | ⬜ |
| `/api/webhooks/keygen` | ❌ No (webhook sig) | N/A | ⬜ |
| `/api/license/heartbeat` | ✅ Yes (license key) | N/A | ⬜ |
| `/api/license/trial/init` | ❌ No (rate limited) | N/A | ⬜ |

**Middleware Validation:**

```javascript
// Check plg-website/src/middleware.js
// Verify:
// 1. JWT validation using aws-jwt-verify
// 2. Protected routes properly gated
// 3. No auth bypass paths
// 4. Proper error handling (don't leak info)
```

**Session Management:**

- [ ] Tokens stored securely (httpOnly cookies or secure storage)
- [ ] No tokens in localStorage (XSS risk)
- [ ] Logout properly invalidates sessions
- [ ] Refresh token rotation working
- [ ] No session fixation vulnerabilities

### 1.3 IAM Policy Review - 3h

**Objective:** Ensure least-privilege access for all AWS resources.

**Lambda Execution Roles:**

Review `plg-website/infrastructure/cloudformation/plg-iam.yaml`:

- [ ] `plg-amplify-compute-role-{env}` - Minimal permissions for Amplify
- [ ] `plg-lambda-execution-role-{env}` - Scoped to specific resources
- [ ] `plg-stream-processor-role-{env}` - DynamoDB Streams + SNS only
- [ ] `plg-email-sender-role-{env}` - SES send only

**Common IAM Issues to Check:**

- [ ] No `*` wildcards in resource ARNs (except where necessary)
- [ ] No overly broad actions (e.g., `s3:*`, `dynamodb:*`)
- [ ] Condition keys used where appropriate
- [ ] Cross-account access properly restricted
- [ ] Resource-based policies reviewed (S3, SNS, SQS)

**Secrets Access:**

- [ ] Secrets Manager access scoped to specific secrets
- [ ] No plaintext secrets in environment variables
- [ ] SSM Parameter Store access minimal

### 1.4 Data Protection Review - 3h

**Objective:** Ensure sensitive data is properly protected.

**Encryption at Rest:**

- [ ] DynamoDB encryption enabled (AWS managed or CMK)
- [ ] S3 buckets encrypted (if used)
- [ ] Secrets Manager uses encryption
- [ ] CloudWatch Logs encrypted (if sensitive data logged)

**Encryption in Transit:**

- [ ] All API endpoints HTTPS only
- [ ] TLS 1.2+ enforced
- [ ] Certificate validation proper
- [ ] No mixed content warnings

**Sensitive Data Handling:**

Review code for proper handling of:

- [ ] License keys (masked in UI, not logged)
- [ ] Payment information (never stored, Stripe only)
- [ ] Email addresses (PII - minimal logging)
- [ ] User passwords (never stored - Cognito handles)
- [ ] API keys/tokens (Secrets Manager only)

**Logging & Monitoring:**

- [ ] No sensitive data in CloudWatch Logs
- [ ] Structured logging with proper sanitization
- [ ] Error messages don't leak system details
- [ ] Audit trail for critical operations

---

## Part 2: Supply Chain Security (~8h)

### 2.1 Git Repository Security - 2h

**GitHub Organization Hardening:**

- [ ] Enable 2FA for all org members (SWR)
- [ ] Branch protection rules on `main` and `development`
  - Require pull request reviews
  - Require status checks to pass
  - Restrict who can push
  - Require signed commits (optional but recommended)
- [ ] Secret scanning enabled (GitHub Advanced Security)
- [ ] Dependabot alerts enabled
- [ ] Code scanning (CodeQL) enabled

**Repository Settings:**

- [ ] Disable force push to protected branches
- [ ] Require linear history (optional)
- [ ] Automatically delete head branches after merge
- [ ] Limit who can create/delete branches

**Access Control:**

- [ ] Review collaborator access levels
- [ ] Remove any unnecessary access
- [ ] Use teams for permission management
- [ ] Audit access logs periodically

### 2.2 Dependency Vulnerability Scanning - 4h

**Current Dependency Posture:**

Unlike Mouse (zero external deps), this project has significant dependencies:

```bash
# Audit all dependencies
cd plg-website
npm audit --production

# Generate dependency tree
npm list --depth=0

# Check for outdated packages
npm outdated
```

**Critical Dependencies to Review:**

| Package | Purpose | Risk Level | Action |
|---------|---------|------------|--------|
| `next` | Framework | High | Keep updated |
| `@aws-amplify/*` | Auth/Backend | High | AWS maintained |
| `stripe` | Payments | Critical | Keep updated |
| `aws-jwt-verify` | Auth | Critical | AWS maintained |
| `aws-sdk` | AWS services | High | AWS maintained |

**Vulnerability Response Plan:**

1. **Critical (CVSS 9.0+):** Patch immediately, deploy hotfix
2. **High (CVSS 7.0-8.9):** Patch within 7 days
3. **Medium (CVSS 4.0-6.9):** Patch within 30 days
4. **Low (CVSS 0.1-3.9):** Patch in next release

**Automated Scanning:**

- [ ] Set up Snyk integration (free for open source)
- [ ] Configure Dependabot to auto-create PRs
- [ ] Add npm audit to CI/CD pipeline
- [ ] Set up Slack/email alerts for new vulnerabilities

### 2.3 Distribution Channel Security - 2h

**Package Distribution:**

Currently: GitHub Pages for static site, Amplify for web app

**Integrity Verification:**

- [ ] Subresource Integrity (SRI) for CDN assets
- [ ] Content Security Policy (CSP) headers
- [ ] X-Frame-Options header
- [ ] X-Content-Type-Options header
- [ ] Referrer-Policy header

**CDN Security (if applicable):**

- [ ] CloudFront signed URLs for private content
- [ ] Origin access identity configured
- [ ] HTTPS only, no HTTP fallback
- [ ] Custom error pages (don't leak info)

**Build Artifact Security:**

- [ ] CI/CD builds in isolated environment
- [ ] No secrets in build logs
- [ ] Artifact signing (optional but recommended)
- [ ] Reproducible builds (verify build integrity)

---

## Part 3: DevSecOps Automation (~28h)

### 3.1 CI/CD Security Integration - 8h

**Current State:** `.github/workflows/cicd.yml` exists, runs tests on PR/push.

**Security Enhancements Needed:**

```yaml
# Add to .github/workflows/cicd.yml

# 1. SAST Scanning
- name: Run SAST scan
  run: |
    npm audit --production
    # Add Snyk or other SAST tool

# 2. Dependency Check
- name: Check dependencies
  run: |
    npm audit --audit-level=high
    npm outdated

# 3. Secret Scanning
- name: Scan for secrets
  uses: trufflesecurity/trufflehog@main
  with:
    path: ./
    base: ${{ github.event.repository.default_branch }}
    head: HEAD

# 4. License Compliance
- name: Check licenses
  run: npx license-checker --production --onlyAllow 'MIT;Apache-2.0;BSD-3-Clause;ISC'
```

**Branch Protection Integration:**

- [ ] Require CI checks to pass before merge
- [ ] Require security scan to pass
- [ ] Block merge if vulnerabilities found
- [ ] Require code review from CODEOWNERS

**Secrets Management in CI:**

- [ ] Use GitHub Secrets for sensitive values
- [ ] Rotate secrets periodically
- [ ] Limit secret access to specific workflows
- [ ] Audit secret usage

### 3.2 Automated Vulnerability Detection - 12h

**Continuous Monitoring Setup:**

**Option 1: Snyk (Recommended)**

```bash
# Install Snyk CLI
npm install -g snyk

# Authenticate
snyk auth

# Test current project
snyk test

# Monitor for new vulnerabilities
snyk monitor

# Add to CI/CD
snyk test --severity-threshold=high
```

**Option 2: GitHub Advanced Security**

- [ ] Enable Dependabot alerts
- [ ] Enable Dependabot security updates
- [ ] Enable CodeQL analysis
- [ ] Configure custom CodeQL queries (optional)

**Option 3: AWS Inspector (for Lambda)**

- [ ] Enable Inspector for Lambda functions
- [ ] Configure scanning schedule
- [ ] Set up SNS notifications for findings

**Vulnerability Workflow:**

```
New Vulnerability Detected
    ↓
Snyk/Dependabot creates PR
    ↓
CI runs tests + security scans
    ↓
If tests pass → Auto-merge (low/medium)
If tests fail → Manual review required
    ↓
Deploy to staging → Verify
    ↓
Deploy to production
```

**Alerting Configuration:**

- [ ] Slack channel for security alerts
- [ ] Email notifications for critical issues
- [ ] PagerDuty integration (optional)
- [ ] Weekly security digest email

### 3.3 Monitoring & Incident Response - 8h

**CloudWatch Alarms (TIER 2 - Pre-Launch):**

```bash
# Create alarms for critical metrics
aws cloudwatch put-metric-alarm \
  --alarm-name plg-lambda-errors-staging \
  --alarm-description "Lambda error rate too high" \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 300 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1 \
  --alarm-actions arn:aws:sns:us-east-1:ACCOUNT:plg-alerts-staging
```

**Critical Alarms to Create:**

- [ ] Lambda error rate (checkout, webhooks, portal APIs)
- [ ] API Gateway 5xx rate
- [ ] DynamoDB throttling
- [ ] Stripe webhook failures (DLQ depth)
- [ ] Keygen API errors
- [ ] SES bounce rate
- [ ] Cognito authentication failures

**Log Aggregation:**

- [ ] CloudWatch Logs Insights queries for common issues
- [ ] Saved queries for security events
- [ ] Log retention policy (90 days minimum)
- [ ] Log export to S3 for long-term storage (optional)

**Incident Response Runbook:**

Create `docs/plg/INCIDENT_RESPONSE_RUNBOOK.md`:

1. **Detection** - How to identify incidents
2. **Triage** - Severity classification (P1/P2/P3/P4)
3. **Containment** - Immediate actions to limit damage
4. **Investigation** - Root cause analysis
5. **Remediation** - Fix and deploy
6. **Post-Mortem** - Document lessons learned

**Minimum Monitoring (TIER 2):**

- [ ] Webhook failure alerting (revenue plumbing)
- [ ] Lambda error alerting (core functionality)
- [ ] API Gateway 5xx alerting (site availability)
- [ ] Email to SWR for all alerts

---

## Part 4: Pre-Launch Security Checklist

### 4.1 TIER 1 Blockers (~8h)

**Must complete before production deployment:**

- [ ] Run Q Developer Code Review SAST on full codebase
- [ ] Manual review of all authentication flows
- [ ] Manual review of all authorization checks
- [ ] Verify all API endpoints have proper auth
- [ ] Review IAM policies for least privilege
- [ ] Verify no secrets in code/config files
- [ ] Test authentication bypass scenarios
- [ ] Test authorization bypass scenarios

### 4.2 TIER 2 Critical (~6h)

**Should complete before deployment (high risk if skipped):**

- [ ] Enable 2FA on GitHub org
- [ ] Enable 2FA on Stripe dashboard
- [ ] Enable 2FA on AWS root + IAM admin
- [ ] Enable 2FA on Keygen dashboard
- [ ] Set up CloudWatch alarms for webhook failures
- [ ] Set up CloudWatch alarms for Lambda errors
- [ ] Set up CloudWatch alarms for API Gateway 5xx
- [ ] Configure branch protection rules
- [ ] Enable Dependabot alerts
- [ ] Run npm audit and fix critical/high issues

### 4.3 POST-LAUNCH Medium (~8h)

**Track closely, do soon after launch:**

- [ ] Full dependency audit and update plan
- [ ] CI/CD security integration (SAST in pipeline)
- [ ] Secret scanning in CI/CD
- [ ] License compliance checking
- [ ] Load testing with security focus
- [ ] Penetration testing (optional but recommended)

### 4.4 POST-LAUNCH Low (~8h)

**Iterate based on feedback:**

- [ ] Public status page (status.hic-ai.com)
- [ ] Full incident response runbook
- [ ] Security training for team members
- [ ] Bug bounty program (when ready)

---

## Part 5: Execution Plan

### Week 1: Foundation (TIER 1 Blockers)

**Day 1-2: SAST & Code Review (8h)**

1. Run Q Developer Code Review on `plg-website/`
2. Review all findings, prioritize by severity
3. Fix critical and high severity issues
4. Document medium/low issues for post-launch

**Day 3: Authentication Review (4h)**

1. Review Cognito configuration
2. Test all auth flows (signup, login, logout, refresh)
3. Verify JWT validation in all protected routes
4. Test session management

**Day 4: Authorization Review (4h)**

1. Review middleware.js authorization logic
2. Test role-based access control
3. Verify no horizontal/vertical privilege escalation
4. Test edge cases (expired tokens, invalid roles)

**Day 5: IAM & Data Protection (6h)**

1. Review all IAM policies in CloudFormation
2. Verify least privilege for all roles
3. Check encryption at rest and in transit
4. Review logging for sensitive data leaks

### Week 2: Supply Chain & Automation (TIER 2)

**Day 6: Git Security (2h)**

1. Enable 2FA for all accounts
2. Configure branch protection rules
3. Enable secret scanning
4. Enable Dependabot

**Day 7-8: Dependency Security (8h)**

1. Run npm audit on all projects
2. Review and update critical dependencies
3. Set up Snyk or similar tool
4. Configure automated scanning

**Day 9-10: Monitoring Setup (8h)**

1. Create CloudWatch alarms for critical metrics
2. Set up SNS topics for alerts
3. Configure email notifications
4. Test alert delivery

### Week 3: Testing & Documentation

**Day 11-12: Security Testing (8h)**

1. Manual penetration testing of auth flows
2. Test common vulnerabilities (XSS, CSRF, etc.)
3. Load testing with security focus
4. Document findings

**Day 13: Documentation (4h)**

1. Create incident response runbook
2. Document security procedures
3. Update README with security info
4. Create SECURITY.md for responsible disclosure

**Day 14: Final Review (4h)**

1. Review all checklist items
2. Verify all TIER 1 items complete
3. Document any deferred items
4. Get sign-off for production deployment

---

## Part 6: Tools & Resources

### Recommended Security Tools

| Tool | Purpose | Cost | Priority |
|------|---------|------|----------|
| **Q Developer Code Review** | SAST scanning | Included | 🔴 TIER 1 |
| Snyk | Dependency scanning | Free tier | 🔴 TIER 2 |
| npm audit | Package vulnerabilities | Free | 🔴 TIER 2 |
| TruffleHog | Secret scanning | Free | 🔴 TIER 2 |
| OWASP ZAP | Penetration testing | Free | 🟡 POST-LAUNCH |
| Burp Suite | Web app security | Free/Paid | 🟡 POST-LAUNCH |

### Security References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [AWS Security Best Practices](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/)
- [CWE/CVE Database](https://cwe.mitre.org/)
- [Stripe Security Guide](https://stripe.com/docs/security)
- [Cognito Security Best Practices](https://docs.aws.amazon.com/cognito/latest/developerguide/security.html)

### Internal Documentation

- `docs/plg/20260122_SECURITY_CONSIDERATIONS_FOR_STRIPE_PAYMENTS.md`
- `docs/plg/20260122_SECURITY_CONSIDERATIONS_FOR_KEYGEN_LICENSING.md`
- `docs/plg/20260122_SECURITY_CONSIDERATIONS_FOR_NEXTJS_PROJECT.md`
- `.amazonq/rules/05-security-requirements.md`

---

## Part 7: Risk Assessment

### High-Risk Areas

| Area | Risk Level | Mitigation |
|------|------------|------------|
| **Payment Processing** | 🔴 Critical | Stripe handles PCI compliance, never store card data |
| **Authentication** | 🔴 Critical | Cognito managed service, proper JWT validation |
| **Authorization** | 🔴 Critical | Middleware checks, role-based access control |
| **Webhook Security** | 🟡 High | Signature verification, replay protection |
| **API Endpoints** | 🟡 High | Rate limiting, input validation, auth checks |
| **Secrets Management** | 🟡 High | AWS Secrets Manager, no plaintext secrets |
| **Dependencies** | 🟡 High | Regular updates, automated scanning |

### Attack Vectors to Consider

1. **Authentication Bypass** - Weak JWT validation, session fixation
2. **Authorization Bypass** - Horizontal/vertical privilege escalation
3. **Payment Fraud** - Stolen cards, chargebacks (Stripe handles)
4. **Account Takeover** - Weak passwords, no MFA (Cognito handles)
5. **Data Breach** - SQL injection (N/A), XSS, CSRF
6. **DDoS** - Rate limiting, CloudFront protection
7. **Supply Chain Attack** - Compromised dependencies
8. **Insider Threat** - Overly broad IAM permissions

---

## Part 8: Success Criteria

### Definition of Done

**TIER 1 (Deployment Blockers):**
- ✅ Q Developer SAST scan complete, critical issues fixed
- ✅ All authentication flows manually tested and secure
- ✅ All authorization checks verified
- ✅ IAM policies reviewed and scoped to least privilege
- ✅ No secrets in code or config files
- ✅ All API endpoints properly protected

**TIER 2 (Critical Quality):**
- ✅ 2FA enabled on all critical accounts
- ✅ CloudWatch alarms configured for critical metrics
- ✅ Branch protection rules enabled
- ✅ Dependabot alerts enabled
- ✅ npm audit shows no critical/high vulnerabilities

**POST-LAUNCH:**
- ✅ CI/CD security integration complete
- ✅ Automated vulnerability scanning operational
- ✅ Incident response runbook documented
- ✅ Security monitoring dashboard created

### Metrics to Track

- **Vulnerability Count:** Critical/High/Medium/Low
- **Mean Time to Remediate (MTTR):** Target <7 days for high
- **Security Scan Coverage:** 100% of code scanned
- **Dependency Freshness:** <30 days outdated
- **Alert Response Time:** <1 hour for critical

---

## Part 9: Next Steps

### Immediate Actions (This Week)

1. **Review this plan with SWR** - Confirm priorities and timeline
2. **Run Q Developer Code Review** - Start with SAST scan
3. **Enable 2FA on all accounts** - GitHub, Stripe, AWS, Keygen
4. **Set up basic monitoring** - CloudWatch alarms for webhooks/Lambda

### Before Launch (Next 2 Weeks)

1. Complete all TIER 1 checklist items
2. Complete all TIER 2 checklist items
3. Document any deferred items with justification
4. Get final security sign-off

### Post-Launch (Ongoing)

1. Monitor security alerts daily
2. Review and update dependencies weekly
3. Conduct security reviews for new features
4. Quarterly security audit

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | Feb 2, 2026 | Initial security audit plan created |

---

**Questions or concerns?** Contact SWR or Q Developer for clarification.
