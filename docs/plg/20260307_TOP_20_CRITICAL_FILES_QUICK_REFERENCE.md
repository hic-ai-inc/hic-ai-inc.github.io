# Top 20 Critical Files - Quick Reference

**Purpose:** One-page reference for Phase 3 SAST security audit  
**Full Plan:** See `20260307_PHASE_3_SAST_STRATEGIC_EXECUTION_PLAN.md`

---

## The Top 20 (Grouped by Session)

### 🔴 Session 1: Unauthenticated Attack Surface (1-1.5h)
1. `plg-website/src/app/api/webhooks/stripe/route.js` - Payment webhooks, signature verification
2. `plg-website/src/app/api/webhooks/keygen/route.js` - License webhooks, signature verification
3. `plg-website/src/app/api/license/trial/init/route.js` - Trial creation, rate limiting

**Focus:** Signature verification, replay protection, rate limiting, input validation

---

### 🟠 Session 2: Payment & Licensing Core (1-1.5h)
4. `plg-website/src/app/api/checkout/route.js` - Payment initiation, Stripe sessions
5. `plg-website/src/lib/stripe.js` - Stripe API integration, webhook verification
15. `plg-website/src/lib/keygen.js` - Keygen API integration, license operations

**Focus:** Payment flow security, PCI-DSS compliance, license provisioning

---

### 🟠 Session 3: Authentication & Authorization (1.5-2h)
6. `plg-website/src/middleware.js` - JWT validation, route protection
7. `plg-website/src/lib/auth.js` - Cognito integration, token handling
8. `plg-website/src/lib/auth-verify.js` - JWT verification, claims extraction
9. `plg-website/infrastructure/lambda/cognito-pre-token/index.js` - Custom claims, RBAC
10. `plg-website/infrastructure/lambda/cognito-post-confirmation/index.js` - User provisioning

**Focus:** JWT validation, auth bypass prevention, RBAC implementation

---

### 🟠 Session 4: Multi-Tenant & Device Management (1.5-2h)
11. `plg-website/src/app/api/portal/team/route.js` - Multi-tenant isolation, invites
12. `plg-website/src/app/api/portal/devices/route.js` - Device enumeration, per-seat enforcement
13. `plg-website/src/app/api/license/heartbeat/route.js` - Device validation, concurrent limits
14. `plg-website/src/app/api/license/activate/route.js` - Browser-delegated activation

**Focus:** Tenant isolation, device enumeration, concurrent limits

---

### 🟡 Session 5: Data Access & Infrastructure (1-1.5h)
16. `plg-website/src/lib/dynamodb.js` - DynamoDB queries, PK/SK design
17. `plg-website/infrastructure/cloudformation/plg-iam.yaml` - IAM policies, least privilege
18. `plg-website/infrastructure/lambda/stream-processor/index.js` - DynamoDB Streams, SNS
19. `plg-website/src/app/api/portal/billing/route.js` - Stripe customer portal
20. `plg-website/src/lib/secrets.js` - AWS Secrets Manager, credential handling

**Focus:** Database access patterns, IAM policies, secret management

---

## Per-Session Workflow

1. **Pre-Scan** (5-10 min) - Review file purpose, identify concerns
2. **Run SAST** (15-30 min) - Invoke Code Review tool
3. **Analyze** (15-30 min) - Review findings, categorize severity
4. **Document** (15-20 min) - Create findings memo with CWE/CVE refs
5. **Plan** (10-15 min) - Determine launch blockers vs. post-launch

**Total per session:** 60-105 minutes

---

## Launch Blocker Criteria

Must fix before launch:
- ✅ No Critical findings unresolved
- ✅ No High findings in unauthenticated endpoints
- ✅ No auth bypass vulnerabilities
- ✅ No payment data exposure risks
- ✅ No secrets in code or logs

---

## Extension Repo (Phase 4)

After completing website repo, review these 10 files from `~/source/repos/hic`:

1. `mouse-vscode/src/extension.js`
2. `mouse-vscode/src/licensing/index.js`
3. `mouse-vscode/src/licensing/http-client.js`
4. `mouse-vscode/src/licensing/validation.js`
5. `mouse-vscode/src/licensing/state.js`
6. `mouse/src/core/tool-registry.js`
7. `mouse/src/core/server.js`
8. `mouse/src/tools/mouse/quick-edit.js`
9. `mouse/src/tools/mouse/batch-quick-edit.js`
10. `mouse/src/tools/notepad/make-note.js`

**Estimated:** 3-4h (2 sessions)

---

## Timeline

**Days 1-2:** Sessions 1-4 (website repo)  
**Day 3:** Session 5 + consolidate findings  
**Days 4-5:** Fix Critical/High findings  
**Phase 4:** Extension repo (2 sessions)

**Total Effort:** 6-8h website + 3-4h extension = 9-12h total

---

**Ready to start?** Begin with Session 1 (files 1-3) when you're ready to invoke the Code Review tool.
