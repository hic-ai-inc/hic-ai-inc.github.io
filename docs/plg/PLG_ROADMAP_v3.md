# PLG Roadmap v3 — Final Sprint to Launch

**Document Version:** 3.0  
**Date:** January 26, 2026  
**Owner:** General Counsel  
**Status:** ��� ACTIVE — SPRINT TO LAUNCH

---

## Executive Summary

This document consolidates ALL remaining work items to ship Mouse with full PLG self-service capability. It supersedes previous roadmaps and TODO collections, providing a single source of truth for the 1-2 week final sprint.

**North Star:** Ship Mouse with functional self-service purchase, licensing, and admin portal.

**Estimated Total Effort:** ~80-100 hours (10-14 days at 8h/day)

---

## Master Checklist — All Workstreams

| # | Workstream | Status | Est. Hours | Owner | Blocks |
|---|------------|--------|------------|-------|--------|
| 1 | Analytics | ⬜ Not started | 4-8h | GC | — |
| 2 | Cookie/Privacy Compliance | ✅ Documented | 2h | GC | — |
| 3 | Auth (Auth0 Integration) | ⚠️ Partial | 8-12h | GC | 4 (Admin Portal) |
| 4 | Admin Portal (Individuals + Teams) | ⬜ Not started | 24-32h | GC | 3, 5, 6 |
| 5 | Licensing (KeyGen.sh) | ⚠️ Partial | 8-12h | Simon | 7 |
| 6 | Payments (Stripe) | ⚠️ Partial | 4-6h | Simon | — |
| 7 | AWS Infrastructure | ✅ Templates exist | 4-6h | GC | — |
| 8 | VS Code Extension (VSIX) | ⬜ Not started | 4-8h | Simon | 5, 6 |
| 9 | Back-End E2E Testing | ⬜ Not started | 8-12h | GC | 3-8 |
| 10 | Front-End Polish | ⬜ Not started | 16-24h | GC | 9 |
| 11 | Deployment & Launch | ⬜ Not started | 8-12h | GC + Simon | 1-10 |
| 12 | Support & Community | ⬜ Not started | 4-8h | Simon | — |

---

## ��� URGENT: CI/CD Pipeline First

**Before any other work**, set up CI/CD for the PLG website. Currently NO GitHub Actions workflows exist.

See [Section 7.3](#73-cicd-pipeline--urgent--do-first) for details.

---

## 1. Analytics

**Status:** ⬜ Not started  
**Est. Hours:** 4-8h  
**Documentation:** [20260123_COOKIE_AND_ANALYTICS_COMPLIANCE_STRATEGY.md](./20260123_COOKIE_AND_ANALYTICS_COMPLIANCE_STRATEGY.md)

### 1.1 Decision Made
We will use **Plausible Analytics** ($9/mo) — cookie-free, GDPR-compliant, no consent banner required.

### 1.2 Checklist

| Task | Status | Notes |
|------|--------|-------|
| Sign up for Plausible Analytics | ⬜ | plausible.io — $9/mo |
| Add Plausible script to `_document.js` or `layout.js` | ⬜ | `<script defer data-domain="hic-ai.com" src="...">` |
| Configure custom events for PLG metrics | ⬜ | See 1.3 |
| Create Bash script for metrics pull | ⬜ | `scripts/analytics-report.sh` |
| Test tracking on staging | ⬜ | Verify events fire |

### 1.3 PLG Metrics to Track (7 Core)

| Metric | Plausible Event | How to Trigger |
|--------|-----------------|----------------|
| **Visitors** | Auto | Default pageview |
| **Pricing Page Views** | `pageview` on `/pricing` | Auto |
| **Checkout Started** | `Checkout: Started` | Fire on checkout page load |
| **Checkout Completed** | `Checkout: Completed` | Fire on success redirect |
| **Trial Activations** | `Trial: Activated` | Fire from extension on first use |
| **Conversions (Trial→Paid)** | `Conversion: Trial to Paid` | Fire on first payment |
| **Churn** | Server-side only | Track via Stripe webhooks |

### 1.4 Bash Script for Metrics

```bash
#!/bin/bash
# scripts/analytics-report.sh
# Pull PLG metrics from Plausible API

SITE_ID="hic-ai.com"
API_KEY="${PLAUSIBLE_API_KEY}"
DATE_RANGE="30d"

curl -s "https://plausible.io/api/v1/stats/aggregate?site_id=$SITE_ID&period=$DATE_RANGE&metrics=visitors,pageviews,bounce_rate,visit_duration" \
  -H "Authorization: Bearer $API_KEY" | jq .
```

---

## 2. Cookie/Privacy Compliance

**Status:** ✅ Documented  
**Est. Hours:** 2h (implementation)  
**Documentation:** [20260123_COOKIE_AND_ANALYTICS_COMPLIANCE_STRATEGY.md](./20260123_COOKIE_AND_ANALYTICS_COMPLIANCE_STRATEGY.md)

### 2.1 Decision Made
**No cookie consent banner needed** if we:
1. Use Plausible (no cookies)
2. Auth0 session cookies are "essential" (no consent required)
3. No advertising/marketing cookies

### 2.2 Checklist

| Task | Status | Notes |
|------|--------|-------|
| Remove any Google Analytics code | ⬜ | Verify none exists |
| Add Privacy Policy page with cookie section | ✅ | Already exists at `/privacy` |
| Update Privacy Policy to mention Plausible | ⬜ | Add "We use Plausible Analytics..." |
| Ensure no third-party tracking scripts | ⬜ | Audit `<head>` tags |
| Add "No tracking cookies" badge (optional) | ⬜ | Marketing differentiator |

---

## 3. Auth (Auth0 Integration)

**Status:** ⚠️ Partial — Code exists, not wired to portal  
**Est. Hours:** 8-12h  
**Documentation:** [20260122_SECURITY_CONSIDERATIONS_FOR_AUTH0_INTEGRATION.md](./20260122_SECURITY_CONSIDERATIONS_FOR_AUTH0_INTEGRATION.md)

### 3.1 What's Built
- `src/lib/auth.js` — Role-based auth helpers (`requireAuth`, `requireAdmin`, `requireBillingContact`)
- `src/middleware.js` — Route protection for `/portal/*` and `/admin/*`
- Auth0 account created

### 3.2 What's Missing

| Task | Status | Notes |
|------|--------|-------|
| **Auth0 Dashboard Configuration** | | |
| Create Application (Regular Web App) | ⬜ | Get Client ID + Secret |
| Configure callback URLs | ⬜ | `https://hic-ai.com/api/auth/callback` |
| Configure logout URLs | ⬜ | `https://hic-ai.com` |
| Enable Organizations (for Teams) | ⬜ | Required for `org_roles` |
| Create custom namespace claims | ⬜ | `https://hic-ai.com/org_roles` etc |
| **Environment Variables** | | |
| Set `AUTH0_SECRET` | ⬜ | Generate with `openssl rand -hex 32` |
| Set `AUTH0_BASE_URL` | ⬜ | `https://hic-ai.com` |
| Set `AUTH0_ISSUER_BASE_URL` | ⬜ | `https://YOUR_TENANT.auth0.com` |
| Set `AUTH0_CLIENT_ID` | ⬜ | From Auth0 dashboard |
| Set `AUTH0_CLIENT_SECRET` | ⬜ | From Auth0 dashboard |
| **Code Integration** | | |
| Add Auth0 login/logout routes | ⬜ | `/api/auth/[auth0]/route.js` |
| Wire portal layout to session | ⬜ | Show user info in nav |
| Implement role-based nav items | ⬜ | Per Team Admin Portal spec |
| Test login → portal flow | ⬜ | E2E verification |

### 3.3 SSO/SAML (Deferred)
SSO is **post-launch** (Enterprise tier). Auth0 supports it via Enterprise Connections when ready.

---

## 4. Admin Portal (Individuals + Teams)

**Status:** ⬜ Not started  
**Est. Hours:** 24-32h  
**Documentation:** [20260125_TEAM_ADMIN_PORTAL.md](./20260125_TEAM_ADMIN_PORTAL.md)

### 4.1 Summary
The Admin Portal is the **largest single work item**. See the full spec for details.

### 4.2 Phase Breakdown

| Phase | Description | Est. Hours | Status |
|-------|-------------|------------|--------|
| 1 | API Endpoints (GET/POST/DELETE team) | 6h | ⬜ |
| 2 | Invite Flow (accept endpoint, page) | 6h | ⬜ |
| 3 | Frontend Wire-up (team page, modals) | 8h | ⬜ |
| 4 | Role Management (PATCH role, Auth0 sync) | 4h | ⬜ |
| 5 | Polish & Edge Cases | 4h | ⬜ |

### 4.3 Detailed Checklist

| Task | Status | Blocks |
|------|--------|--------|
| **Phase 1: API Endpoints** | | |
| `GET /api/portal/team` — List members + invites | ⬜ | — |
| `POST /api/portal/team/invite` — Create invite | ⬜ | — |
| `DELETE /api/portal/team/members/:id` — Revoke member | ⬜ | — |
| `DELETE /api/portal/team/invites/:id` — Cancel invite | ⬜ | — |
| DynamoDB: `createInvite()` | ⬜ | — |
| DynamoDB: `getOrgInvites()` | ⬜ | — |
| DynamoDB: `deleteInvite()` | ⬜ | — |
| DynamoDB: `getInviteByToken()` + GSI | ⬜ | — |
| **Phase 2: Invite Flow** | | |
| `POST /api/portal/team/invite/:token/accept` | ⬜ | Phase 1 |
| DynamoDB: `acceptInvite()` | ⬜ | Phase 1 |
| `/invite/[token]/page.js` — Acceptance UI | ⬜ | Phase 1 |
| Auth0: Add user to org on accept | ⬜ | Auth0 config |
| KeyGen: Create license on accept | ⬜ | KeyGen config |
| **Phase 3: Frontend Wire-up** | | |
| Update `/portal/team/page.js` to use API | ⬜ | Phase 1 |
| Create `InviteModal` component | ⬜ | — |
| Create `RevokeConfirmDialog` component | ⬜ | — |
| Wire role change dropdown | ⬜ | — |
| Update `portal/layout.js` for role-based nav | ⬜ | — |
| Protect `/portal/billing` from team members | ⬜ | Auth helpers |
| Protect `/portal/team` from non-admins | ⬜ | Auth helpers |
| **Phase 4: Role Management** | | |
| `PATCH /api/portal/team/members/:id/role` | ⬜ | Phase 1 |
| Update Auth0 user metadata on role change | ⬜ | Auth0 Management API |
| Role change dropdown in team table | ⬜ | Phase 3 |
| "Last admin" protection logic | ⬜ | — |
| **Phase 5: Polish** | | |
| Resend invite functionality | ⬜ | — |
| Invite expiration handling (7-day TTL) | ⬜ | — |
| "No seats available" error state | ⬜ | — |
| Self-revocation prevention | ⬜ | — |
| Loading states and error boundaries | ⬜ | — |
| Mobile responsive team table | ⬜ | — |

---

## 5. Licensing (KeyGen.sh)

**Status:** ⚠️ Partial — Account created, code exists, not configured  
**Est. Hours:** 8-12h  
**Documentation:** [20260122_SECURITY_CONSIDERATIONS_FOR_KEYGEN_LICENSING.md](./20260122_SECURITY_CONSIDERATIONS_FOR_KEYGEN_LICENSING.md)

### 5.1 What's Built
- `src/lib/keygen.js` — KeyGen API client
- API routes for activate/deactivate/validate
- Webhook handler stub

### 5.2 Simon's KeyGen.sh Dashboard Tasks

| Task | Status | Notes |
|------|--------|-------|
| **Account Setup** | | |
| Log into KeyGen.sh dashboard | ⬜ | keygen.sh |
| Note Account ID | ⬜ | For env vars |
| Generate Admin API Token | ⬜ | For server-side calls |
| Generate Product Token (read-only) | ⬜ | For client validation |
| **Product Configuration** | | |
| Create Product: "Mouse" | ⬜ | Main product |
| **Policy Configuration** | | |
| Create Policy: `policy_individual` | ⬜ | maxMachines: 2, heartbeat: 900s |
| Create Policy: `policy_team` | ⬜ | maxMachines: 5, heartbeat: 900s |
| Set overage strategy: `ALWAYS_ALLOW_OVERAGE` | ⬜ | Per pricing spec |
| Enable heartbeat for concurrent sessions | ⬜ | 5-min ping, 15-min expiry |
| **Webhook Configuration** | | |
| Add webhook URL: `https://hic-ai.com/api/webhooks/keygen` | ⬜ | — |
| Select events: `license.created`, `license.revoked`, `machine.activated` | ⬜ | — |
| Note webhook secret | ⬜ | For signature verification |
| **Environment Variables** | | |
| `KEYGEN_ACCOUNT_ID` | ⬜ | From dashboard |
| `KEYGEN_PRODUCT_ID` | ⬜ | From product creation |
| `KEYGEN_ADMIN_TOKEN` | ⬜ | For license creation |
| `KEYGEN_PRODUCT_TOKEN` | ⬜ | For validation (optional) |
| `KEYGEN_POLICY_INDIVIDUAL_ID` | ⬜ | From policy creation |
| `KEYGEN_POLICY_TEAM_ID` | ⬜ | From policy creation |
| `KEYGEN_WEBHOOK_SECRET` | ⬜ | From webhook config |

### 5.3 Code Tasks

| Task | Status | Notes |
|------|--------|-------|
| Update `keygen.js` with heartbeat support | ⬜ | For concurrent sessions |
| Implement machine heartbeat in extension | ⬜ | 5-min interval |
| Test license creation flow | ⬜ | Stripe → KeyGen |
| Test activation/deactivation | ⬜ | Portal → KeyGen |
| Test heartbeat timeout | ⬜ | Session expiry |

---

## 6. Payments (Stripe)

**Status:** ⚠️ Partial — Account created, code exists, products not created  
**Est. Hours:** 4-6h  
**Documentation:** [20260122_SECURITY_CONSIDERATIONS_FOR_STRIPE_PAYMENTS.md](./20260122_SECURITY_CONSIDERATIONS_FOR_STRIPE_PAYMENTS.md)

### 6.1 What's Built
- `src/lib/stripe.js` — Stripe client
- Webhook handler for checkout events
- Checkout pages (need product IDs)

### 6.2 Simon's Stripe Dashboard Tasks

| Task | Status | Notes |
|------|--------|-------|
| **Products to Create** | | |
| `mouse_individual_monthly` — $15/month | ⬜ | metadata: `{tier: "individual", maxConcurrent: 2}` |
| `mouse_individual_annual` — $150/year | ⬜ | metadata: `{tier: "individual", maxConcurrent: 2}` |
| `mouse_team_monthly` — $35/month | ⬜ | metadata: `{tier: "team", maxConcurrent: 5}` |
| `mouse_team_annual` — $350/year | ⬜ | metadata: `{tier: "team", maxConcurrent: 5}` |
| **Coupons (Optional)** | | |
| `EARLYADOPTER20` — 20% off first year | ⬜ | Time-boxed promo |
| **Webhook Configuration** | | |
| Add webhook URL: `https://hic-ai.com/api/webhooks/stripe` | ⬜ | — |
| Select events: `checkout.session.completed`, `customer.subscription.*`, `invoice.*` | ⬜ | — |
| Note webhook signing secret | ⬜ | For signature verification |
| **Environment Variables** | | |
| `STRIPE_SECRET_KEY` | ⬜ | sk_live_... (or sk_test_...) |
| `STRIPE_PUBLISHABLE_KEY` | ⬜ | pk_live_... |
| `STRIPE_WEBHOOK_SECRET` | ⬜ | whsec_... |
| `STRIPE_PRICE_INDIVIDUAL_MONTHLY` | ⬜ | price_... |
| `STRIPE_PRICE_INDIVIDUAL_ANNUAL` | ⬜ | price_... |
| `STRIPE_PRICE_TEAM_MONTHLY` | ⬜ | price_... |
| `STRIPE_PRICE_TEAM_ANNUAL` | ⬜ | price_... |

### 6.3 Stripe Customer Portal

| Task | Status | Notes |
|------|--------|-------|
| Enable Customer Portal | ⬜ | Stripe Dashboard → Settings → Customer Portal |
| Configure allowed actions | ⬜ | Update payment, cancel subscription |
| Brand portal with HIC colors | ⬜ | Optional polish |

---

## 7. AWS Infrastructure

**Status:** ✅ Templates exist — need deployment  
**Est. Hours:** 4-6h (deployment + verification)  
**Documentation:** [infrastructure/README.md](../../plg-website/infrastructure/README.md)

### 7.1 Summary
**All 8 CloudFormation templates exist** in `plg-website/infrastructure/cloudformation/`:

| Template | Size | Purpose |
|----------|------|----------|
| `plg-main-stack.yaml` | 13KB | Orchestrator (nested stacks) |
| `plg-dynamodb.yaml` | 5KB | Table + GSIs + Stream |
| `plg-iam.yaml` | 13KB | Roles for Amplify/Lambda |
| `plg-ses.yaml` | 7KB | Email domain verification |
| `plg-messaging.yaml` | 11KB | SNS + SQS |
| `plg-monitoring.yaml` | 15KB | CloudWatch dashboard |
| `plg-compute.yaml` | 12KB | Lambda functions |
| `plg-scheduled.yaml` | 4KB | Scheduled tasks |

**Also exists:**
- `deploy.sh` (24KB) — Full deployment script with dry-run
- `parameters/dev.json`, `parameters/staging.json`, `parameters/prod.json`
- `amplify.yml` — Build settings
- `infrastructure/lambda/` — Lambda function code

### 7.2 Checklist

| Task | Status | Notes |
|------|--------|-------|
| **CloudFormation Templates** | | |
| `plg-main-stack.yaml` — Orchestrator | ✅ | 13KB |
| `plg-dynamodb.yaml` — Table + GSIs | ✅ | 5KB |
| `plg-iam.yaml` — IAM roles | ✅ | 13KB |
| `plg-ses.yaml` — Email | ✅ | 7KB |
| `plg-messaging.yaml` — SNS/SQS | ✅ | 11KB |
| `plg-monitoring.yaml` — CloudWatch | ✅ | 15KB |
| `plg-compute.yaml` — Lambda | ✅ | 12KB |
| `plg-scheduled.yaml` — Cron jobs | ✅ | 4KB |
| **Deployment Scripts** | | |
| `deploy.sh` with dry-run support | ✅ | 24KB |
| Parameter files (dev, staging, prod) | ✅ | All 3 exist |
| `amplify.yml` | ✅ | Exists |
| **Deployment Tasks** | | |
| Review deploy.sh for correctness | ⬜ | Verify commands |
| Dry-run deploy to staging | ⬜ | `./deploy.sh --dry-run staging` |
| Deploy to staging | ⬜ | `./deploy.sh staging` |
| Verify all resources created | ⬜ | Check AWS console |
| Deploy to production | ⬜ | `./deploy.sh prod` |
| **Environment Setup** | | |
| AWS Parameter Store secrets | ⬜ | All API keys |
| Secrets Manager for sensitive keys | ⬜ | Stripe, KeyGen secrets |

### 7.3 CI/CD Pipeline (��� URGENT — Do First)

**Status:** ⬜ GitHub Actions workflow does NOT exist  
**Priority:** ��� HIGH — Should be first infrastructure task

No `.github/workflows/` directory exists. Need to create:

| Task | Status | Est. | Notes |
|------|--------|------|-------|
| Create `.github/workflows/` directory | ⬜ | — | — |
| `ci.yml` — Run tests on PR | ⬜ | 1h | Jest + ESLint |
| `deploy-staging.yml` — Deploy on merge to `develop` | ⬜ | 2h | Auto-deploy staging |
| `deploy-prod.yml` — Deploy on merge to `main` | ⬜ | 1h | Manual approval gate |
| Add branch protection rules | ⬜ | 30m | Require CI pass |
| Test full CI/CD flow | ⬜ | 1h | End-to-end verification |

**Recommended CI/CD Flow:**
```
feature/* → PR → CI tests → merge to develop → auto-deploy staging
develop → PR → CI tests → merge to main → manual approval → deploy prod
```

---

## 8. VS Code Extension (VSIX) Packaging

**Status:** ⬜ Not started  
**Est. Hours:** 4-8h  
**Documentation:** [packaging/README.md](../../../hic/packaging/README.md), [packaging/SETUP.md](../../../hic/packaging/SETUP.md)

### 8.1 Current State
Mouse is currently distributed via GitHub Packages (`@hic/mouse`). For VS Code Marketplace:

### 8.2 Checklist

| Task | Status | Notes |
|------|--------|-------|
| **Pre-requisites** | | |
| Create VS Code Publisher account | ⬜ | marketplace.visualstudio.com |
| Generate Personal Access Token | ⬜ | For vsce publish |
| **Extension Manifest** | | |
| Create/update `package.json` with VS Code fields | ⬜ | `publisher`, `engines`, `activationEvents` |
| Create `extension.js` or `extension.ts` | ⬜ | VS Code entry point |
| Add VS Code extension dependencies | ⬜ | `@types/vscode`, etc |
| **Packaging** | | |
| Install vsce: `npm install -g @vscode/vsce` | ⬜ | — |
| Build VSIX: `vsce package` | ⬜ | Creates `.vsix` file |
| Test sideload: Install from VSIX | ⬜ | Verify it works |
| **Publishing** | | |
| Publish pre-release: `vsce publish --pre-release` | ⬜ | Pre-release flag |
| Verify Marketplace listing | ⬜ | — |
| **Licensing Integration** | | |
| Wire extension to call HIC API for validation | ⬜ | Currently points to Lemon Squeezy! |
| Update `http-provider.js` to use `api.hic-ai.com` | ⬜ | Critical fix |
| Add heartbeat loop for concurrent sessions | ⬜ | 5-min interval |

### 8.3 Critical: Extension Licensing Fix

The Mouse extension currently has **Lemon Squeezy** endpoints hardcoded:
- `mouse/src/licensing/providers/http-provider.js` → Points to `api.lemonsqueezy.com`
- Must be updated to call `api.hic-ai.com/api/license/*`

---

## 9. Back-End E2E Testing

**Status:** ⬜ Not started  
**Est. Hours:** 8-12h  
**Prerequisites:** Items 3-8 complete

### 9.1 Test Scenarios

| Scenario | Status | Coverage |
|----------|--------|----------|
| **Purchase Flows** | | |
| Individual: Checkout → Payment → License created | ⬜ | Stripe + KeyGen |
| Team: Checkout → Payment → Org + Licenses created | ⬜ | Stripe + KeyGen + Auth0 |
| **Activation Flows** | | |
| Activate license with valid key | ⬜ | KeyGen machine create |
| Activate with expired/revoked key | ⬜ | Error handling |
| Concurrent session enforcement | ⬜ | Heartbeat timeout |
| **Portal Flows** | | |
| Login → View dashboard | ⬜ | Auth0 + Portal |
| View/copy license key | ⬜ | Portal |
| Deactivate device | ⬜ | Portal + KeyGen |
| Update payment method | ⬜ | Portal + Stripe |
| **Team Admin Flows** | | |
| Invite member → Accept → Login | ⬜ | Full invite flow |
| Revoke member → License deactivated | ⬜ | Admin action |
| Change role (member → admin) | ⬜ | Auth0 metadata |
| **Webhook Flows** | | |
| Stripe subscription created | ⬜ | License provisioning |
| Stripe subscription cancelled | ⬜ | License revocation |
| Stripe payment failed | ⬜ | Grace period handling |

### 9.2 Test Environments

| Environment | Purpose | URL |
|-------------|---------|-----|
| Local | Development | localhost:3000 |
| Staging | Pre-production | staging.hic-ai.com |
| Production | Live | hic-ai.com |

---

## 10. Front-End Polish

**Status:** ⬜ Not started  
**Est. Hours:** 16-24h  
**Prerequisites:** E2E tests passing

### 10.1 Checklist

| Task | Status | Notes |
|------|--------|-------|
| **Content Review** | | |
| IP review of all docs content | ⬜ | Legal review |
| IP review of FAQ content | ⬜ | Legal review |
| Proofread all copy | ⬜ | Grammar, tone |
| **Features Page** | | |
| Update feature list (current capabilities) | ⬜ | Match v0.9.9 |
| Update model compatibility table | ⬜ | Claude, GPT, Gemini |
| Add screenshots/GIFs | ⬜ | Visual demos |
| **Pricing Page** | | |
| Update to 2-tier model (Individual/Team) | ⬜ | Remove Enterprise |
| Add "Contact Sales" for Enterprise | ⬜ | Placeholder |
| Verify checkout links work | ⬜ | Stripe integration |
| **Checkout Flows** | | |
| Individual checkout → success page | ⬜ | Full flow |
| Team checkout → success page | ⬜ | Full flow |
| Error states (payment failed, etc) | ⬜ | Edge cases |
| **Legal Pages** | | |
| Update Terms of Service | ⬜ | Current pricing |
| Update Privacy Policy (Plausible mention) | ⬜ | Analytics |
| Verify all links work | ⬜ | No 404s |
| **SEO & Meta** | | |
| Meta tags on all pages | ⬜ | Title, description |
| Open Graph tags | ⬜ | Social sharing |
| Sitemap.xml | ⬜ | Search indexing |

---

## 11. Deployment & Launch

**Status:** ⬜ Not started  
**Est. Hours:** 8-12h  
**Prerequisites:** All above complete

### 11.1 Pre-Launch Checklist

| Task | Status | Notes |
|------|--------|-------|
| **Infrastructure** | | |
| Deploy CloudFormation stacks | ⬜ | Or manual setup |
| Verify DynamoDB table exists | ⬜ | GSIs working |
| Verify SES domain verified | ⬜ | Can send email |
| **Environment** | | |
| All env vars set in Amplify | ⬜ | Check .env.example |
| Secrets in Parameter Store / Secrets Manager | ⬜ | API keys |
| **DNS** | | |
| Amplify connected to hic-ai.com | ⬜ | Custom domain |
| SSL certificate provisioned | ⬜ | HTTPS |
| **Third-Party Services** | | |
| Stripe webhooks pointing to production | ⬜ | Update URL |
| KeyGen webhooks pointing to production | ⬜ | Update URL |
| Auth0 callback URLs include production | ⬜ | Update URLs |
| **Testing** | | |
| Smoke test all critical paths | ⬜ | Checkout, activate, portal |
| Test on multiple browsers | ⬜ | Chrome, Firefox, Safari |
| Test on mobile | ⬜ | Responsive |
| **Rollback Plan** | | |
| Document rollback procedure | ⬜ | If launch fails |
| Verify can disable signups if needed | ⬜ | Emergency brake |

### 11.2 Launch Day Checklist

| Task | Status | Notes |
|------|--------|-------|
| Switch Stripe to live mode | ⬜ | Test → Live |
| Announce on social media | ⬜ | Marketing |
| Monitor error logs | ⬜ | CloudWatch |
| Monitor Stripe dashboard | ⬜ | First payments |
| Respond to support tickets | ⬜ | Customer success |

---

## 12. Support & Community

**Status:** ⬜ Not started  
**Est. Hours:** 4-8h  
**Owner:** Simon

### 12.1 Philosophy
For launch, we adopt a **docs-first, community-assisted** support model. No full ticketing system required initially.

### 12.2 Support Channels (MVP)

| Channel | Purpose | Setup Time | Cost |
|---------|---------|------------|------|
| **Documentation** | Self-service knowledge base | ✅ Exists | $0 |
| **Discord Community** | User Q&A, bug reports, feature requests | 2h | $0 |
| **GitHub Issues** | Bug tracking, feature requests | 1h | $0 |
| **Email** | Billing/account issues only | 1h | $0 (SES) |

### 12.3 Checklist

| Task | Status | Notes |
|------|--------|-------|
| **Documentation** | | |
| Verify docs cover installation | ⬜ | Step-by-step guide |
| Verify docs cover licensing/activation | ⬜ | How to enter license key |
| Verify docs cover common issues/FAQ | ⬜ | Troubleshooting section |
| Add "Getting Help" page | ⬜ | Links to all support channels |
| **Discord Community** | | |
| Create Discord server | ⬜ | "HIC AI Community" |
| Create channels: `#general`, `#mouse-help`, `#feature-requests`, `#bug-reports` | ⬜ | Basic structure |
| Add Discord invite link to website | ⬜ | Footer + Help page |
| Add Discord invite to extension welcome | ⬜ | Post-install message |
| Set up basic moderation rules | ⬜ | Code of conduct |
| **GitHub Issues** | | |
| Create issue templates (bug report, feature request) | ⬜ | `.github/ISSUE_TEMPLATE/` |
| Add "Report a Bug" link to extension | ⬜ | Opens GitHub issue |
| Label structure: `bug`, `feature`, `question`, `wontfix` | ⬜ | Triage system |
| **Email Support** | | |
| Set up support@hic-ai.com | ⬜ | SES receiving |
| Create auto-reply with FAQ links | ⬜ | Deflect common questions |
| Document escalation path | ⬜ | When to respond personally |

### 12.4 Support Triage Process

```
User Issue
    │
    ├─→ Installation/Usage → Point to docs
    │
    ├─→ Bug Report → GitHub Issue → Triage weekly
    │
    ├─→ Feature Request → GitHub Issue or Discord
    │
    ├─→ Billing/Account → support@hic-ai.com → Simon responds
    │
    └─→ Security Issue → security@hic-ai.com → Immediate response
```

### 12.5 Response Time Expectations (Published)

| Channel | Expected Response | Notes |
|---------|-------------------|-------|
| Discord | Community-driven (no SLA) | Best-effort from team |
| GitHub Issues | Within 1 week | Triaged weekly |
| Email (billing) | Within 2 business days | Simon responds |
| Security | Within 24 hours | Mandatory |

### 12.6 Future Enhancements (Post-Launch)

| Enhancement | When | Notes |
|-------------|------|-------|
| Intercom/Crisp chat widget | If volume warrants | $50-100/mo |
| Zendesk/Freshdesk ticketing | If email volume > 50/week | $15+/agent/mo |
| Knowledge base search | When docs grow | Algolia DocSearch (free for OSS) |
| Community forum (Discourse) | If Discord gets noisy | Self-hosted or $100/mo |

---

## Dependencies Graph

```
┌─────────────────────────────────────────────────────────────────┐
│                         LAUNCH                                   │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌─────────────────────────────────────────────────────────────────┐
│                    11. Deployment & Launch                       │
└─────────────────────────────────────────────────────────────────┘
                              ▲
          ┌───────────────────┼───────────────────┐
          │                   │                   │
┌─────────┴─────────┐ ┌───────┴───────┐ ┌────────┴────────┐
│ 10. Front-End     │ │ 12. Support   │ │ 9. E2E Testing  │
│ Polish            │ │ & Community   │ │                 │
└─────────┬─────────┘ └───────────────┘ └────────┬────────┘
          │                                       │
          └───────────────────┬───────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
┌─────────┴─────────┐ ┌───────┴───────┐ ┌────────┴────────┐
│ 4. Admin Portal   │ │ 8. VSIX      │ │ 7. AWS Infra    │
│ (Individuals +    │ │ Packaging    │ │ (Deploy only)   │
│ Teams)            │ │              │ │                 │
└─────────┬─────────┘ └───────┬───────┘ └────────┬────────┘
          │                   │                   │
          │                   │        ┌──────────┘
          │                   │        │
┌─────────┴─────────┐ ┌───────┴───────┐│
│ 3. Auth (Auth0)   │ │ 5. Licensing  ││
│                   │ │ (KeyGen)      ││
└───────────────────┘ └───────┬───────┘│
                              │        │
                      ┌───────┴───────┐│
                      │ 6. Payments   ││
                      │ (Stripe)      ││
                      └───────────────┘│
                                       │
                      ┌────────────────┘
                      │
        ��� ┌──────────┴──────────┐
           │ 7.3 CI/CD Pipeline  │ ← DO THIS FIRST
           │ (GitHub Actions)    │
           └─────────────────────┘

Parallel workstreams (no dependencies):
├── 1. Analytics
├── 2. Cookie Compliance
└── 12. Support & Community (partial)
```

---

## Recommended Execution Order

### Day 0: CI/CD Pipeline (��� URGENT)

| Task | Owner | Est. |
|------|-------|------|
| Create GitHub Actions CI workflow | GC | 1h |
| Create staging deploy workflow | GC | 2h |
| Create prod deploy workflow | GC | 1h |
| Add branch protection rules | Simon | 30m |

### Week 1: Infrastructure & Configuration

| Day | Focus | Tasks |
|-----|-------|-------|
| **Day 1** | Stripe + KeyGen Setup | Simon: Create products, policies, webhooks |
| **Day 1** | Analytics | GC: Sign up Plausible, add script |
| **Day 2** | Auth0 Setup | Simon: Configure application, organizations |
| **Day 2** | AWS Deploy | GC: Run deploy.sh to staging, verify |
| **Day 3-4** | Admin Portal Phase 1-2 | GC: API endpoints, invite flow |
| **Day 5** | Admin Portal Phase 3 | GC: Frontend wire-up |

### Week 2: Integration & Testing

| Day | Focus | Tasks |
|-----|-------|-------|
| **Day 6** | Admin Portal Phase 4-5 | GC: Role management, polish |
| **Day 7** | VSIX Packaging | Simon: Extension manifest, licensing fix |
| **Day 7** | Support Setup | Simon: Discord server, issue templates |
| **Day 8** | E2E Testing | GC + Simon: All critical paths |
| **Day 9** | Front-End Polish | GC: Content, pricing, checkout |
| **Day 10** | Deployment | GC + Simon: Production setup |

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Auth0 configuration issues | High | Start early, allow buffer time |
| KeyGen heartbeat complexity | Medium | Can launch with device-count first, add heartbeat later |
| VSIX marketplace approval delay | Medium | Submit early, have GitHub Packages as backup |
| AWS Activate credits not approved | Low | Continue with pay-as-you-go, minimal cost |
| Stripe product misconfiguration | Medium | Test thoroughly in sandbox |
| Discord spam/moderation | Low | Basic rules, can add bots later |

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 3.0 | Jan 26, 2026 | Complete rewrite consolidating all workstreams |
| 3.0.1 | Jan 26, 2026 | Corrected AWS status (templates exist), added CI/CD urgency, added Support section |
| 2.1 | Jan 23, 2026 | Backend completion status |
| 2.0 | Jan 22, 2026 | Pricing restructure |
| 1.1 | Jan 21, 2026 | Infrastructure updates |
| 1.0 | Jan 21, 2026 | Initial roadmap |

---

**Document Status:** ACTIVE — SPRINT TO LAUNCH  
**Next Action:** ��� Create CI/CD pipeline FIRST, then Stripe + KeyGen + Auth0 configuration (Simon) + Analytics + AWS deploy (GC)
