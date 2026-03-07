# Phase 3 SAST Strategic Execution Plan

**Date:** March 7, 2026  
**Author:** Q Developer  
**Purpose:** Strategic plan for focused Code Review SAST scanning across hic-ai-inc.github.io repository  
**Context:** Pre-Phase 3 security audit per Launch Plan AP 2b and Security Audit Plan V2

---

## Executive Summary

The hic-ai-inc.github.io repository contains a complex full-stack application with significant attack surface:
- **25 API routes** (4 unauthenticated, 21 authenticated)
- **6 Lambda functions** (Cognito triggers, stream processors, scheduled tasks)
- **9 CloudFormation stacks** (IAM, DynamoDB, Cognito, SES, SNS/SQS, monitoring)
- **13 shared library modules** (auth, payments, licensing, database)
- **External integrations:** Stripe, Keygen, Cognito, SES, Plausible

**Challenge:** Code Review SAST tool works best on small file sets (1-5 files), but we have a large codebase.

**Solution:** Phased approach with 20 critical files grouped into 5 focused review sessions.

**Estimated Effort:** 6-8 hours total (4-5h SAST scanning + 2-3h findings documentation)

---

## Methodology: Risk-Based Prioritization

Files prioritized by:

1. **Attack Surface** (unauthenticated endpoints, webhooks)
2. **Sensitive Data** (payments, auth tokens, PII)
3. **Authorization Boundaries** (RBAC, multi-tenant isolation)
4. **External Integrations** (Stripe, Keygen signature verification)
5. **Infrastructure Security** (IAM policies, Lambda triggers)

---

## Top 20 Critical Files

### Tier 1: Highest Risk (Revenue & Auth Plumbing)

| # | File | Risk Factors | Priority |
|---|------|--------------|----------|
| 1 | `plg-website/src/app/api/webhooks/stripe/route.js` | Unauthenticated, payment events, signature verification, idempotency | 🔴 Critical |
| 2 | `plg-website/src/app/api/webhooks/keygen/route.js` | Unauthenticated, license provisioning, signature verification | 🔴 Critical |
| 3 | `plg-website/src/app/api/license/trial/init/route.js` | Unauthenticated, rate limiting, fingerprint-based abuse prevention | 🔴 Critical |
| 4 | `plg-website/src/app/api/checkout/route.js` | Payment initiation, Stripe session creation, user data handling | 🔴 Critical |
| 5 | `plg-website/src/lib/stripe.js` | Stripe API integration, payment processing, webhook signature verification | 🔴 Critical |

### Tier 2: High Risk (Auth & Authorization)

| # | File | Risk Factors | Priority |
|---|------|--------------|----------|
| 6 | `plg-website/src/middleware.js` | JWT validation, route protection, auth bypass prevention | 🟠 High |
| 7 | `plg-website/src/lib/auth.js` | Cognito integration, token handling, session management | 🟠 High |
| 8 | `plg-website/src/lib/auth-verify.js` | JWT verification, token validation, claims extraction | 🟠 High |
| 9 | `plg-website/infrastructure/lambda/cognito-pre-token/index.js` | Custom claims injection, group-based RBAC | 🟠 High |
| 10 | `plg-website/infrastructure/lambda/cognito-post-confirmation/index.js` | User provisioning, DynamoDB writes, email triggers | 🟠 High |

### Tier 3: High Risk (Multi-Tenant & Device Management)

| # | File | Risk Factors | Priority |
|---|------|--------------|----------|
| 11 | `plg-website/src/app/api/portal/team/route.js` | Multi-tenant isolation, role-based access, invite management | 🟠 High |
| 12 | `plg-website/src/app/api/portal/devices/route.js` | Device enumeration, per-seat enforcement, deactivation | 🟠 High |
| 13 | `plg-website/src/app/api/license/heartbeat/route.js` | Device validation, concurrent limits, license status updates | 🟠 High |
| 14 | `plg-website/src/app/api/license/activate/route.js` | Browser-delegated activation, device fingerprinting, license binding | 🟠 High |
| 15 | `plg-website/src/lib/keygen.js` | Keygen API integration, license validation, activation/deactivation | 🟠 High |

### Tier 4: Medium-High Risk (Data Access & IAM)

| # | File | Risk Factors | Priority |
|---|------|--------------|----------|
| 16 | `plg-website/src/lib/dynamodb.js` | DynamoDB queries, PK/SK design, cross-tenant isolation | 🟡 Medium-High |
| 17 | `plg-website/infrastructure/cloudformation/plg-iam.yaml` | IAM policies, least privilege, resource scoping | 🟡 Medium-High |
| 18 | `plg-website/infrastructure/lambda/stream-processor/index.js` | DynamoDB Streams, SNS publishing, event propagation | 🟡 Medium-High |
| 19 | `plg-website/src/app/api/portal/billing/route.js` | Stripe customer portal, subscription management, payment method updates | 🟡 Medium-High |
| 20 | `plg-website/src/lib/secrets.js` | AWS Secrets Manager, API key retrieval, credential handling | 🟡 Medium-High |

---

## Phased Execution Plan

### Phase 1: Unauthenticated Attack Surface (Session 1)
**Files:** 1-3 (Stripe webhook, Keygen webhook, Trial init)  
**Focus:** Signature verification, replay protection, rate limiting, input validation  
**Effort:** 1-1.5h  
**Success Criteria:**
- Webhook signature verification confirmed secure
- Replay attack prevention validated
- Rate limiting effective against abuse
- No secrets leaked in error responses

### Phase 2: Payment & Licensing Core (Session 2)
**Files:** 4-5, 15 (Checkout, Stripe lib, Keygen lib)  
**Focus:** Payment flow security, Stripe integration, license provisioning  
**Effort:** 1-1.5h  
**Success Criteria:**
- No PCI-DSS violations (card data never stored)
- Stripe API calls properly authenticated
- License provisioning idempotent
- Error handling doesn't leak sensitive data

### Phase 3: Authentication & Authorization (Session 3)
**Files:** 6-10 (Middleware, Auth libs, Cognito Lambdas)  
**Focus:** JWT validation, auth bypass prevention, RBAC implementation  
**Effort:** 1.5-2h  
**Success Criteria:**
- JWT validation robust (signature, expiration, issuer)
- No auth bypass paths
- RBAC claims properly enforced
- Token refresh secure

### Phase 4: Multi-Tenant & Device Management (Session 4)
**Files:** 11-14 (Team, Devices, Heartbeat, Activation)  
**Focus:** Tenant isolation, device enumeration, concurrent limits  
**Effort:** 1.5-2h  
**Success Criteria:**
- Cross-tenant data access prevented
- Device enumeration scoped to user
- Concurrent device limits enforced
- Activation flow secure

### Phase 5: Data Access & Infrastructure (Session 5)
**Files:** 16-20 (DynamoDB, IAM, Stream processor, Billing, Secrets)  
**Focus:** Database access patterns, IAM policies, secret management  
**Effort:** 1-1.5h  
**Success Criteria:**
- DynamoDB queries prevent cross-tenant leaks
- IAM policies follow least privilege
- Secrets never logged or exposed
- Stream processing idempotent

---

## Execution Workflow (Per Session)

### Step 1: Pre-Scan Preparation (5-10 min)
- Review file purpose and data flows
- Identify known vulnerabilities from Security Audit Plan V2
- Note specific concerns (e.g., "webhook replay protection")

### Step 2: Run Code Review SAST (15-30 min)
```
Invoke Code Review tool with:
- scopeOfReview: FULL_REVIEW
- fileLevelArtifacts: [list of 3-5 files for this session]
- userRequirement: "Security audit focusing on [session-specific concerns]"
```

### Step 3: Findings Analysis (15-30 min)
- Review all findings in Code Issues Panel
- Categorize by severity (Critical/High/Medium/Low)
- Cross-reference with CWE/CVE databases
- Identify false positives

### Step 4: Documentation (15-20 min)
- Document findings in session-specific memo
- Include CWE/CVE references
- Propose remediation for Critical/High issues
- Track Medium/Low for post-launch

### Step 5: Remediation Planning (10-15 min)
- Determine launch blockers vs. post-launch
- Create GitHub issues for tracking
- Update Security Audit Plan status

---

## Findings Documentation Format

For each session, create: `docs/plg/20260307_SAST_SESSION_[N]_FINDINGS.md`

### Template Structure:
```markdown
# SAST Session [N] Findings

**Date:** [Date]
**Files Reviewed:** [List]
**Focus Areas:** [List]
**Tool:** Amazon Q Code Review SAST

## Summary
- Total Findings: [N]
- Critical: [N]
- High: [N]
- Medium: [N]
- Low: [N]
- Info: [N]

## Critical Findings

### [C-1] [Title]
**File:** [path:line]
**CWE:** [CWE-XXX](https://cwe.mitre.org/data/definitions/XXX.html)
**Description:** [What is the vulnerability?]
**Impact:** [What could an attacker do?]
**Remediation:** [How to fix?]
**Status:** [Launch Blocker / Post-Launch / False Positive]

## High Findings
[Same format]

## Medium Findings
[Same format]

## Low/Info Findings
[Brief list]

## False Positives
[List with justification]

## Recommendations
[Overall security posture improvements]
```

---

## Success Criteria (Overall)

### Launch Blockers (Must Fix)
- [ ] No Critical findings unresolved
- [ ] No High findings in unauthenticated endpoints
- [ ] No auth bypass vulnerabilities
- [ ] No payment data exposure risks
- [ ] No secrets in code or logs

### Post-Launch (Track & Fix)
- [ ] Medium findings documented with GitHub issues
- [ ] Low findings tracked for future sprints
- [ ] Security monitoring covers identified risks
- [ ] Incident response plan includes SAST findings

---

## Integration with Existing Plans

### Security Audit Plan V2 (docs/plg/20260202_SECURITY_AUDIT_PLAN_V2.md)
- This plan implements **Part 1, Section 1.1** (SAST scanning)
- Complements **Section 1.2** (Auth/Authz manual review)
- Feeds into **Section 1.4** (Data protection review)

### Launch Plan AP 2b (docs/launch/20260218_PRE_LAUNCH_STATUS_ASSESSMENT_AND_ACTION_PLANS_V3.md)
- This is the **comprehensive security audit** (AP 2b)
- Estimated 4-5h aligns with AP 2b budget
- Findings will inform **B-D4** (SAST tool choice validation)

---

## Additional Files for Manual Review (Not SAST)

These files require manual security review but are less suited for SAST:

### CloudFormation Stacks (Manual IAM Review)
- `plg-website/infrastructure/cloudformation/plg-cognito.yaml`
- `plg-website/infrastructure/cloudformation/plg-dynamodb.yaml`
- `plg-website/infrastructure/cloudformation/plg-messaging.yaml`
- `plg-website/infrastructure/cloudformation/plg-monitoring.yaml`

### Configuration Files (Manual Review)
- `plg-website/amplify/backend.js` (Amplify Gen 2 config)
- `plg-website/next.config.mjs` (Next.js security headers)
- `plg-website/src/middleware.js` (already in SAST list)

### Deployment Scripts (Manual Review)
- `plg-website/infrastructure/deploy.sh`
- `plg-website/scripts/setup-cognito.sh`
- `plg-website/scripts/setup-stripe-portal.js`

---

## Timeline & Scheduling

### Recommended Schedule (5 sessions over 3-5 days)

**Day 1:**
- Morning: Session 1 (Unauthenticated endpoints)
- Afternoon: Session 2 (Payment & Licensing)

**Day 2:**
- Morning: Session 3 (Auth & Authorization)
- Afternoon: Session 4 (Multi-Tenant & Devices)

**Day 3:**
- Morning: Session 5 (Data Access & Infrastructure)
- Afternoon: Consolidate findings, create remediation plan

**Days 4-5:**
- Fix Critical/High findings
- Update Security Audit Plan status
- Prepare for manual review sessions

---

## Companion Repository: hic (Extension Repo)

After completing this repo, apply same methodology to `~/source/repos/hic`:

### Top 10 Critical Files (Extension Repo)
1. `mouse-vscode/src/extension.js` (Extension entry point, command registration)
2. `mouse-vscode/src/licensing/index.js` (License validation, heartbeat)
3. `mouse-vscode/src/licensing/http-client.js` (API communication, token handling)
4. `mouse-vscode/src/licensing/validation.js` (License validation logic)
5. `mouse-vscode/src/licensing/state.js` (License state management)
6. `mouse/src/core/tool-registry.js` (MCP tool registration, authorization)
7. `mouse/src/core/server.js` (MCP server, tool invocation)
8. `mouse/src/tools/mouse/quick-edit.js` (File editing, path validation)
9. `mouse/src/tools/mouse/batch-quick-edit.js` (Batch operations, atomic edits)
10. `mouse/src/tools/notepad/make-note.js` (Note creation, input sanitization)

**Estimated Effort:** 3-4h (2 sessions)

---

## Risk Mitigation

### If SAST Tool Limitations Encountered
- **Issue:** Tool times out on large files
- **Mitigation:** Split file into logical sections, review separately

### If Too Many False Positives
- **Issue:** Tool flags non-issues, wastes time
- **Mitigation:** Document false positive patterns, focus on high-confidence findings

### If Critical Findings Require Architectural Changes
- **Issue:** Fix requires significant refactoring
- **Mitigation:** Assess launch risk, consider temporary mitigation, schedule post-launch fix

---

## Next Steps

1. **Review this plan with SWR** - Confirm priorities and timeline
2. **Schedule Session 1** - Block 1.5h for unauthenticated endpoints
3. **Prepare findings template** - Create `docs/plg/20260307_SAST_SESSION_1_FINDINGS.md`
4. **Run first SAST scan** - Files 1-3 (webhooks + trial init)
5. **Document findings** - Use template format
6. **Iterate through sessions** - Complete all 5 phases

---

## Questions for SWR

1. **Timing:** Should we complete all 5 sessions before remediation, or fix-as-we-go?
2. **Scope:** Should we include Extension repo in Phase 3, or defer to Phase 4?
3. **Findings:** What severity threshold for launch blockers? (Critical only, or Critical + High?)
4. **Documentation:** Should findings go in `docs/plg/` or separate `docs/security/` directory?

---

## Document History

| Date | Author | Changes |
|------|--------|---------|
| 2026-03-07 | Q Developer | Initial strategic plan created |

---

**Ready to proceed?** Let me know when you'd like to start Session 1, and I'll invoke the Code Review tool on files 1-3.
