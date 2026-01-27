# PLG Roadmap v3 — Final Sprint to Launch

**Document Version:** 3.0.12  
**Date:** January 26, 2026  
**Owner:** General Counsel  
**Status:** 🚀 ACTIVE — SPRINT TO LAUNCH

---

## Executive Summary

This document consolidates ALL remaining work items to ship Mouse with full PLG self-service capability. It supersedes previous roadmaps and TODO collections, providing a single source of truth for the 1-2 week final sprint.

**North Star:** Ship Mouse with functional self-service purchase, licensing, and admin portal.

**Estimated Total Effort:** ~80-100 hours (10-14 days at 8h/day)

---

## Master Checklist — All Workstreams

| #   | Workstream                         | Status             | Est. Hours | Owner      | Blocks           |
| --- | ---------------------------------- | ------------------ | ---------- | ---------- | ---------------- |
| 1   | Analytics                          | ✅ Script ready    | 4-8h       | GC         | —                |
| 2   | Cookie/Privacy Compliance          | ✅ Documented      | 2h         | GC         | —                |
| 3   | Auth (Auth0 Integration)           | ✅ Dashboard done  | 8-12h      | GC + Simon | 4 (Admin Portal) |
| 4   | Admin Portal (Individuals + Teams) | ✅ Phases 1-5 done | 24-32h     | GC         | 5, 6             |
| 5   | Licensing (KeyGen.sh)              | ✅ **COMPLETE**    | 8-12h      | Simon      | 7                |
| 6   | Payments (Stripe)                  | ✅ **COMPLETE**    | 4-6h       | Simon      | —                |
| 7   | AWS Infrastructure                 | ✅ Templates exist | 4-6h       | GC         | —                |
| 8   | VS Code Extension (VSIX)           | ⬜ Not started     | 4-8h       | Simon      | 5, 6             |
| 9   | Back-End E2E Testing               | ✅ 550 tests pass  | 8-12h      | GC         | 3-8              |
| 10  | Front-End Polish                   | ⚠️ Partial         | 16-24h     | GC         | 9                |
| 11  | Deployment & Launch                | ⬜ Not started     | 8-12h      | GC + Simon | 1-10             |
| 12  | Support & Community                | ⬜ Not started     | 4-8h       | Simon      | —                |

---

## ✅ CI/CD Pipeline — COMPLETE

**Completed:** January 26, 2026  
CI/CD pipeline is now live at `.github/workflows/cicd.yml`. Auto-detects systems, runs tests on push/PR to development and main.

See [Section 7.3](#73-cicd-pipeline--complete) for details.

---

## 1. Analytics

**Status:** ✅ Script-based metrics ready (Plausible deferred)  
**Est. Hours:** 4-8h  
**Documentation:** [20260123_COOKIE_AND_ANALYTICS_COMPLIANCE_STRATEGY.md](./20260123_COOKIE_AND_ANALYTICS_COMPLIANCE_STRATEGY.md)

### 1.1 Decision Made

**Phase 1 (Now):** Script-based metrics pulling directly from Stripe and KeyGen APIs.  
**Phase 2 (Post-Launch):** Plausible Analytics ($9/mo) for visitor/pageview tracking.

### 1.2 Checklist

| Task                                         | Status | Notes                           |
| -------------------------------------------- | ------ | ------------------------------- |
| Create PLG metrics script (`plg-metrics.js`) | ✅     | Pulls from Stripe + KeyGen APIs |
| Add unit tests for metrics script            | ✅     | 17 tests passing with mocks     |
| Add npm scripts (`metrics`, `metrics:json`)  | ✅     | `npm run metrics` for dashboard |
| Sign up for Plausible Analytics              | ⏸️     | Deferred to post-launch         |
| Add Plausible script to `layout.js`          | ⏸️     | Deferred to post-launch         |
| Configure custom events for PLG metrics      | ⏸️     | Deferred to post-launch         |

### 1.3 PLG Metrics to Track (7 Core)

| Metric                       | Current Source              | Post-Launch (Plausible)     |
| ---------------------------- | --------------------------- | --------------------------- |
| **Visitors**                 | N/A (need Plausible)        | Auto pageview               |
| **Pricing Page Views**       | N/A (need Plausible)        | `pageview` on `/pricing`    |
| **Checkout Started**         | Stripe checkout sessions    | `Checkout: Started` event   |
| **Checkout Completed**       | Stripe checkout sessions    | `Checkout: Completed` event |
| **Trial Activations**        | KeyGen machines (monthly)   | `Trial: Activated` event    |
| **Conversions (Trial→Paid)** | Stripe active subscriptions | `Conversion: Trial to Paid` |
| **Churn**                    | Stripe canceled subs        | Server-side via webhooks    |

### 1.4 PLG Metrics Script

```bash
# Run the dashboard
npm run metrics

# JSON output for automation
npm run metrics:json

# Specify time period
npm run metrics -- --period=7d
```

**Script location:** `plg-website/scripts/plg-metrics.js`  
**Tests:** `plg-website/__tests__/unit/scripts/plg-metrics.test.js`

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

| Task                                        | Status | Notes                               |
| ------------------------------------------- | ------ | ----------------------------------- |
| Remove any Google Analytics code            | ⬜     | Verify none exists                  |
| Add Privacy Policy page with cookie section | ✅     | Already exists at `/privacy`        |
| Update Privacy Policy to mention Plausible  | ⬜     | Add "We use Plausible Analytics..." |
| Ensure no third-party tracking scripts      | ⬜     | Audit `<head>` tags                 |
| Add "No tracking cookies" badge (optional)  | ⬜     | Marketing differentiator            |

---

## 3. Auth (Auth0 Integration)

**Status:** ✅ Dashboard configured — Ready for E2E testing  
**Est. Hours:** 8-12h  
**Documentation:** [20260122_SECURITY_CONSIDERATIONS_FOR_AUTH0_INTEGRATION.md](./20260122_SECURITY_CONSIDERATIONS_FOR_AUTH0_INTEGRATION.md)

### 3.1 What's Built

- `src/lib/auth.js` — Role-based auth helpers (`requireAuth`, `requireAdmin`, `requireBillingContact`)
- `src/middleware.js` — Route protection for `/portal/*` and `/admin/*`
- `/api/auth/[auth0]/route.js` — Auth0 login/logout routes
- Auth0 tenant: `dev-vby1x2u5b7c882n5.us.auth0.com`

### 3.2 Auth0 Dashboard Configuration ✅

| Task                                 | Status | Notes                                           |
| ------------------------------------ | ------ | ----------------------------------------------- |
| **Auth0 Dashboard Configuration**    |        |                                                 |
| Create Application (Regular Web App) | ✅     | "Mouse" app with logo configured                |
| Configure callback URLs              | ✅     | localhost + hic-ai.com + staging                |
| Configure logout URLs                | ✅     | localhost + hic-ai.com + staging                |
| Configure web origins (CORS)         | ✅     | localhost + hic-ai.com + staging                |
| Enable Google social connection      | ✅     | Using Auth0 dev keys (swap for prod)            |
| Enable GitHub social connection      | ✅     | Using Auth0 dev keys (swap for prod)            |
| Enable refresh token rotation        | ✅     | 30-day absolute, 15-day inactivity, 10s overlap |
| Enable Organizations (for Teams)     | ⬜     | Required for Business tier `org_roles`          |
| Create custom namespace claims       | ⬜     | `https://hic-ai.com/org_roles` etc              |
| **Environment Variables**            |        |                                                 |
| Set `AUTH0_SECRET`                   | ⬜     | Generate with `openssl rand -hex 32`            |
| Set `AUTH0_BASE_URL`                 | ⬜     | `https://hic-ai.com`                            |
| Set `AUTH0_ISSUER_BASE_URL`          | ✅     | `https://dev-vby1x2u5b7c882n5.us.auth0.com`     |
| Set `AUTH0_CLIENT_ID`                | ⬜     | Copy from Auth0 dashboard → .env.local          |
| Set `AUTH0_CLIENT_SECRET`            | ⬜     | Copy from Auth0 dashboard → .env.local          |
| **Code Integration**                 |        |                                                 |
| Add Auth0 login/logout routes        | ✅     | `/api/auth/[auth0]/route.js`                    |
| Wire portal layout to session        | ⬜     | Show user info in nav                           |
| Implement role-based nav items       | ✅     | PortalSidebar.js + middleware.js                |
| Test login → portal flow             | ⬜     | E2E verification                                |

### 3.3 SSO/SAML (Contact Sales)

Enterprise SSO (SAML, Okta, Azure AD) is available for Business customers via Contact Sales.  
Pricing: $500 setup + $100/org/month. See [v4.2 pricing](./20260126_PRICING_v4.2_FINAL_FEATURE_MATRIX.md#saml-implementation-details).

---

## 4. Admin Portal (Individuals + Teams)

**Status:** ✅ Phases 1-5 COMPLETE (Auth0 wire-up deferred)  
**Est. Hours:** 24-32h  
**Documentation:** [20260125_TEAM_ADMIN_PORTAL.md](./20260125_TEAM_ADMIN_PORTAL.md)

### 4.1 Summary

The Admin Portal is the **largest single work item**. See the full spec for details.

### 4.2 Phase Breakdown

| Phase | Description                              | Est. Hours | Status |
| ----- | ---------------------------------------- | ---------- | ------ |
| 1     | API Endpoints (GET/POST/DELETE team)     | 6h         | ✅     |
| 2     | Invite Flow (accept endpoint, page)      | 6h         | ✅     |
| 3     | Frontend Wire-up (team page, modals)     | 8h         | ✅     |
| 4     | Role Management (PATCH role, Auth0 sync) | 4h         | ✅     |
| 5     | Polish & Edge Cases                      | 4h         | ✅     |

### 4.3 Detailed Checklist

| Task                                                       | Status | Blocks               |
| ---------------------------------------------------------- | ------ | -------------------- |
| **Phase 1: API Endpoints**                                 |        |                      |
| `GET /api/portal/team` — List members + invites            | ✅     | —                    |
| `POST /api/portal/team` (action: invite) — Create invite   | ✅     | —                    |
| `DELETE /api/portal/team` (action: revoke) — Revoke member | ✅     | —                    |
| `DELETE /api/portal/team` (action: cancel) — Cancel invite | ✅     | —                    |
| DynamoDB: `createOrgInvite()`                              | ✅     | —                    |
| DynamoDB: `getOrgInvites()`                                | ✅     | —                    |
| DynamoDB: `deleteOrgInvite()`                              | ✅     | —                    |
| DynamoDB: `getInviteByToken()` + GSI                       | ✅     | —                    |
| **Phase 2: Invite Flow**                                   |        |                      |
| `POST /api/portal/invite/[token]` — Accept invite          | ✅     | Phase 1              |
| DynamoDB: `acceptOrgInvite()`                              | ✅     | Phase 1              |
| `/invite/[token]/page.js` — Acceptance UI                  | ✅     | Phase 1              |
| Auth0: Add user to org on accept                           | ⬜     | Auth0 config         |
| KeyGen: Create license on accept                           | ⬜     | KeyGen config        |
| **Phase 3: Frontend Wire-up**                              |        |                      |
| Update `/portal/team/page.js` to use API                   | ✅     | Phase 1              |
| Create `InviteModal` component                             | ✅     | In TeamManagement.js |
| Create `RevokeConfirmDialog` component                     | ✅     | In TeamManagement.js |
| Wire role change dropdown                                  | ✅     | In TeamManagement.js |
| Update `portal/layout.js` for role-based nav               | ✅     | PortalSidebar.js     |
| Protect `/portal/billing` from team members                | ✅     | middleware.js        |
| Protect `/portal/team` from non-admins                     | ✅     | middleware.js        |
| **Phase 4: Role Management**                               |        |                      |
| `PATCH /api/portal/team/members/:id/role`                  | ✅     | POST action          |
| Update Auth0 user metadata on role change                  | ⏸️     | Auth0 wire-up later  |
| Role change dropdown in team table                         | ✅     | Phase 3              |
| "Last admin" protection logic                              | ✅     | route.js             |
| **Phase 5: Polish**                                        |        |                      |
| Resend invite functionality                                | ✅     | route.js + UI        |
| Invite expiration handling (7-day TTL)                     | ✅     | UI shows expiry      |
| "No seats available" error state                           | ✅     | Existing in flow     |
| Self-revocation prevention                                 | ✅     | route.js             |
| Loading states and error boundaries                        | ✅     | All portal pages     |
| Mobile responsive team table                               | ✅     | Card view on mobile  |

---

## 5. Licensing (KeyGen.sh)

**Status:** ✅ Dashboard configured — Product, policies, and token created  
**Est. Hours:** 8-12h  
**Documentation:** [20260122_SECURITY_CONSIDERATIONS_FOR_KEYGEN_LICENSING.md](./20260122_SECURITY_CONSIDERATIONS_FOR_KEYGEN_LICENSING.md)

### 5.1 What's Built

- `src/lib/keygen.js` — KeyGen API client
- API routes for activate/deactivate/validate
- Webhook handler stub

### 5.2 Simon's KeyGen.sh Dashboard Tasks

| Task                                                      | Status | Notes                                                         |
| --------------------------------------------------------- | ------ | ------------------------------------------------------------- |
| **Account Setup**                                         |        |                                                               |
| Log into KeyGen.sh dashboard                              | ✅     | keygen.sh                                                     |
| Note Account ID                                           | ✅     | `868fccd3-676d-4b9d-90ab-c86ae54419f6`                        |
| Generate Admin API Token                                  | ✅     | Product Token created                                         |
| Generate Product Token (read-only)                        | ✅     | Saved in .env.local                                           |
| **Product Configuration**                                 |        |                                                               |
| Create Product: "Mouse"                                   | ✅     | `4abf1f35-fc54-45ab-8499-10012073ac2d`                        |
| **Policy Configuration**                                  |        |                                                               |
| Create Policy: `policy_individual`                        | ✅     | `91f1947e-0730-48f9-b19a-eb8016ae2f84` (3 machines, Floating) |
| Create Policy: `policy_business`                          | ✅     | `b0bcab98-6693-4c44-ad0d-ee3dbb069aea` (5 machines, Floating) |
| Set policy type: Floating                                 | ✅     | Allows machine swapping                                       |
| Enable heartbeat for concurrent sessions                  | ✅     | 10-min heartbeat, Keep Dead + Always Revive                   |
| **Webhook Configuration**                                 |        |                                                               |
| Add webhook URL: `https://hic-ai.com/api/webhooks/keygen` | ✅     | Endpoint ID: `4c09c047-20ac-4862-a6c5-97937742ad59`           |
| Select events: `*` (all events)                           | ✅     | Subscribed to all license/machine events                      |
| Configure Ed25519 signature verification                  | ✅     | Public key saved in .env.local                                |
| **Environment Variables**                                 |        |                                                               |
| `KEYGEN_ACCOUNT_ID`                                       | ✅     | Saved in .env.local                                           |
| `KEYGEN_PRODUCT_ID`                                       | ✅     | `4abf1f35-fc54-45ab-8499-10012073ac2d`                        |
| `KEYGEN_PRODUCT_TOKEN`                                    | ✅     | Saved in .env.local                                           |
| `KEYGEN_POLICY_ID_INDIVIDUAL`                             | ✅     | Saved in .env.local                                           |
| `KEYGEN_POLICY_ID_BUSINESS`                               | ✅     | Saved in .env.local                                           |
| `KEYGEN_WEBHOOK_PUBLIC_KEY`                               | ✅     | Ed25519 public key saved in .env.local                        |

### 5.3 Code Tasks

| Task                                      | Status | Notes                   |
| ----------------------------------------- | ------ | ----------------------- |
| Update `keygen.js` with heartbeat support | ⬜     | For concurrent sessions |
| Implement machine heartbeat in extension  | ⬜     | 5-min interval          |
| Test license creation flow                | ⬜     | Stripe → KeyGen         |
| Test activation/deactivation              | ⬜     | Portal → KeyGen         |
| Test heartbeat timeout                    | ⬜     | Session expiry          |

---

## 6. Payments (Stripe)

**Status:** ✅ Dashboard configured — Products, prices, and webhooks created  
**Est. Hours:** 4-6h  
**Documentation:** [20260122_SECURITY_CONSIDERATIONS_FOR_STRIPE_PAYMENTS.md](./20260122_SECURITY_CONSIDERATIONS_FOR_STRIPE_PAYMENTS.md)

### 6.1 What's Built

- `src/lib/stripe.js` — Stripe client
- Webhook handler for checkout events
- Checkout pages (need product IDs)

### 6.2 Simon's Stripe Dashboard Tasks

| Task                                                      | Status | Notes                                          |
| --------------------------------------------------------- | ------ | ---------------------------------------------- |
| **Products Created**                                      |        |                                                |
| Mouse Individual — $15/month                              | ✅     | `price_1StthcA4W8nJ0u4TVZkkEcUn`               |
| Mouse Individual — $150/year                              | ✅     | `price_1Sttp1A4W8nJ0u4T0Tw3bqNO`               |
| Mouse Business — $35/seat/month                           | ✅     | `price_1SttsRA4W8nJ0u4TrFSEG9E5`               |
| Mouse Business — $350/seat/year                           | ✅     | `price_1SttsRA4W8nJ0u4TaqmRFVf5`               |
| **Coupons (Optional)**                                    |        |                                                |
| `EARLYADOPTER20` — 20% off first year                     | ⬜     | Time-boxed promo                               |
| **Webhook Configuration**                                 |        |                                                |
| Add webhook URL: `https://hic-ai.com/api/webhooks/stripe` | ✅     | Destination: "PLG Website"                     |
| Select events (15+ event types)                           | ✅     | checkout, subscription, invoice, dispute, etc. |
| Note webhook signing secret                               | ✅     | Saved in .env.local                            |
| **Environment Variables**                                 |        |                                                |
| `STRIPE_SECRET_KEY`                                       | ✅     | Saved in .env.local (test mode)                |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`                      | ✅     | Saved in .env.local (test mode)                |
| `STRIPE_WEBHOOK_SECRET`                                   | ✅     | Saved in .env.local                            |
| `NEXT_PUBLIC_STRIPE_PRICE_INDIVIDUAL_MONTHLY`             | ✅     | Saved in .env.local                            |
| `NEXT_PUBLIC_STRIPE_PRICE_INDIVIDUAL_ANNUAL`              | ✅     | Saved in .env.local                            |
| `NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_MONTHLY`               | ✅     | Saved in .env.local                            |
| `NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_ANNUAL`                | ✅     | Saved in .env.local                            |

### 6.3 Stripe Customer Portal

| Task                         | Status | Notes                                                            |
| ---------------------------- | ------ | ---------------------------------------------------------------- |
| Enable Customer Portal       | ✅     | Activated — `billing.stripe.com/p/login/7sYbJ0a2H2TO2Q74FKa3u00` |
| Configure allowed actions    | ✅     | Update payment methods, view invoices, cancel at period end      |
| Add Terms/Privacy links      | ✅     | hic-ai.com/terms + /privacy linked                               |
| Set support email            | ✅     | billing@hic-ai.com                                               |
| Enable Tax ID on invoices    | ✅     | Customers can add Tax ID                                         |
| Brand portal with HIC colors | ⬜     | Optional polish — can do later                                   |

---

## 7. AWS Infrastructure

**Status:** ✅ Templates exist — need deployment  
**Est. Hours:** 4-6h (deployment + verification)  
**Documentation:** [infrastructure/README.md](../../plg-website/infrastructure/README.md)

### 7.1 Summary

**All 8 CloudFormation templates exist** in `plg-website/infrastructure/cloudformation/`:

| Template              | Size | Purpose                      |
| --------------------- | ---- | ---------------------------- |
| `plg-main-stack.yaml` | 13KB | Orchestrator (nested stacks) |
| `plg-dynamodb.yaml`   | 5KB  | Table + GSIs + Stream        |
| `plg-iam.yaml`        | 13KB | Roles for Amplify/Lambda     |
| `plg-ses.yaml`        | 7KB  | Email domain verification    |
| `plg-messaging.yaml`  | 11KB | SNS + SQS                    |
| `plg-monitoring.yaml` | 15KB | CloudWatch dashboard         |
| `plg-compute.yaml`    | 12KB | Lambda functions             |
| `plg-scheduled.yaml`  | 4KB  | Scheduled tasks              |

**Also exists:**

- `deploy.sh` (24KB) — Full deployment script with dry-run
- `parameters/dev.json`, `parameters/staging.json`, `parameters/prod.json`
- `amplify.yml` — Build settings
- `infrastructure/lambda/` — Lambda function code

### 7.2 Checklist

| Task                                 | Status | Notes                           |
| ------------------------------------ | ------ | ------------------------------- |
| **CloudFormation Templates**         |        |                                 |
| `plg-main-stack.yaml` — Orchestrator | ✅     | 13KB                            |
| `plg-dynamodb.yaml` — Table + GSIs   | ✅     | 5KB                             |
| `plg-iam.yaml` — IAM roles           | ✅     | 13KB                            |
| `plg-ses.yaml` — Email               | ✅     | 7KB                             |
| `plg-messaging.yaml` — SNS/SQS       | ✅     | 11KB                            |
| `plg-monitoring.yaml` — CloudWatch   | ✅     | 15KB                            |
| `plg-compute.yaml` — Lambda          | ✅     | 12KB                            |
| `plg-scheduled.yaml` — Cron jobs     | ✅     | 4KB                             |
| **Deployment Scripts**               |        |                                 |
| `deploy.sh` with dry-run support     | ✅     | 24KB                            |
| Parameter files (dev, staging, prod) | ✅     | All 3 exist                     |
| `amplify.yml`                        | ✅     | Exists                          |
| **Deployment Tasks**                 |        |                                 |
| Review deploy.sh for correctness     | ⬜     | Verify commands                 |
| Dry-run deploy to staging            | ⬜     | `./deploy.sh --dry-run staging` |
| Deploy to staging                    | ⬜     | `./deploy.sh staging`           |
| Verify all resources created         | ⬜     | Check AWS console               |
| Deploy to production                 | ⬜     | `./deploy.sh prod`              |
| **Environment Setup**                |        |                                 |
| AWS Parameter Store secrets          | ⬜     | All API keys                    |
| Secrets Manager for sensitive keys   | ⬜     | Stripe, KeyGen secrets          |

### 7.3 CI/CD Pipeline — ✅ COMPLETE

**Status:** ✅ Complete (January 26, 2026)  
**Actual Time:** ~30 minutes

CI/CD pipeline adapted from SimonReiff/hic and deployed to `.github/workflows/cicd.yml`.

| Task                                  | Status | Notes                                  |
| ------------------------------------- | ------ | -------------------------------------- |
| Create `.github/workflows/` directory | ✅     | Done                                   |
| `cicd.yml` — Run tests on PR/push     | ✅     | Auto-detects systems with package.json |
| Workflow triggers                     | ✅     | push/PR to development and main        |
| Test full CI/CD flow                  | ✅     | PR #1 verified, all tests passed (58s) |
| Branch protection rules               | ⬜     | Optional — add later if needed         |

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

| Task                                              | Status | Notes                                      |
| ------------------------------------------------- | ------ | ------------------------------------------ |
| **Pre-requisites**                                |        |                                            |
| Create VS Code Publisher account                  | ⬜     | marketplace.visualstudio.com               |
| Generate Personal Access Token                    | ⬜     | For vsce publish                           |
| **Extension Manifest**                            |        |                                            |
| Create/update `package.json` with VS Code fields  | ⬜     | `publisher`, `engines`, `activationEvents` |
| Create `extension.js` or `extension.ts`           | ⬜     | VS Code entry point                        |
| Add VS Code extension dependencies                | ⬜     | `@types/vscode`, etc                       |
| **Packaging**                                     |        |                                            |
| Install vsce: `npm install -g @vscode/vsce`       | ⬜     | —                                          |
| Build VSIX: `vsce package`                        | ⬜     | Creates `.vsix` file                       |
| Test sideload: Install from VSIX                  | ⬜     | Verify it works                            |
| **Publishing**                                    |        |                                            |
| Publish pre-release: `vsce publish --pre-release` | ⬜     | Pre-release flag                           |
| Verify Marketplace listing                        | ⬜     | —                                          |
| **Licensing Integration**                         |        |                                            |
| Wire extension to call HIC API for validation     | ⬜     | Currently points to Lemon Squeezy!         |
| Update `http-provider.js` to use `api.hic-ai.com` | ⬜     | Critical fix                               |
| Add heartbeat loop for concurrent sessions        | ⬜     | 5-min interval                             |

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

| Scenario                                          | Status | Coverage                |
| ------------------------------------------------- | ------ | ----------------------- |
| **Purchase Flows**                                |        |                         |
| Individual: Checkout → Payment → License created  | ⬜     | Stripe + KeyGen         |
| Team: Checkout → Payment → Org + Licenses created | ⬜     | Stripe + KeyGen + Auth0 |
| **Activation Flows**                              |        |                         |
| Activate license with valid key                   | ⬜     | KeyGen machine create   |
| Activate with expired/revoked key                 | ⬜     | Error handling          |
| Concurrent session enforcement                    | ⬜     | Heartbeat timeout       |
| **Portal Flows**                                  |        |                         |
| Login → View dashboard                            | ⬜     | Auth0 + Portal          |
| View/copy license key                             | ✅     | Portal license page     |
| Deactivate device                                 | ✅     | Devices page wired      |
| Update payment method                             | ✅     | Stripe Portal link      |
| **Team Admin Flows**                              |        |                         |
| Invite member → Accept → Login                    | ✅     | Full invite flow        |
| Revoke member → License deactivated               | ✅     | TeamManagement.js       |
| Change role (member → admin)                      | ✅     | TeamManagement.js       |
| **Webhook Flows**                                 |        |                         |
| Stripe subscription created                       | ⬜     | License provisioning    |
| Stripe subscription cancelled                     | ⬜     | License revocation      |
| Stripe payment failed                             | ⬜     | Grace period handling   |

### 9.2 Test Environments

| Environment | Purpose        | URL                |
| ----------- | -------------- | ------------------ |
| Local       | Development    | localhost:3000     |
| Staging     | Pre-production | staging.hic-ai.com |
| Production  | Live           | hic-ai.com         |

---

## 10. Front-End Polish

**Status:** ⚠️ Partially complete  
**Est. Hours:** 16-24h  
**Prerequisites:** E2E tests passing

### 10.1 Checklist

| Task                                       | Status | Notes               |
| ------------------------------------------ | ------ | ------------------- |
| **Content Review**                         |        |                     |
| IP review of all docs content              | ⬜     | Legal review        |
| IP review of FAQ content                   | ⬜     | Legal review        |
| Proofread all copy                         | ⬜     | Grammar, tone       |
| **Features Page**                          |        |                     |
| Update feature list (current capabilities) | ✅     | Match v0.9.9        |
| Update model compatibility table           | ✅     | Claude, GPT, Gemini |
| Add screenshots/GIFs                       | ⬜     | Visual demos        |
| **Pricing Page**                           |        |                     |
| Update to 2-tier model (Individual/Team)   | ✅     | v4.2 pricing done   |
| Add "Contact Sales" for Enterprise         | ✅     | On pricing page     |
| Verify checkout links work                 | ✅     | Stripe integration  |
| **Checkout Flows**                         |        |                     |
| Individual checkout → success page         | ✅     | Full flow           |
| Team checkout → success page               | ✅     | Full flow           |
| Error states (payment failed, etc)         | ⬜     | Edge cases          |
| **Legal Pages**                            |        |                     |
| Update Terms of Service                    | ⬜     | Current pricing     |
| Update Privacy Policy (Plausible mention)  | ⬜     | Analytics           |
| Verify all links work                      | ⬜     | No 404s             |
| **SEO & Meta**                             |        |                     |
| Meta tags on all pages                     | ✅     | Title, description  |
| Open Graph tags                            | ⬜     | Social sharing      |
| Sitemap.xml                                | ⬜     | Search indexing     |

---

## 11. Deployment & Launch

**Status:** ⬜ Not started  
**Est. Hours:** 8-12h  
**Prerequisites:** All above complete

### 11.1 Pre-Launch Checklist

| Task                                         | Status | Notes                      |
| -------------------------------------------- | ------ | -------------------------- |
| **Infrastructure**                           |        |                            |
| Deploy CloudFormation stacks                 | ⬜     | Or manual setup            |
| Verify DynamoDB table exists                 | ⬜     | GSIs working               |
| Verify SES domain verified                   | ⬜     | Can send email             |
| **Environment**                              |        |                            |
| All env vars set in Amplify                  | ⬜     | Check .env.example         |
| Secrets in Parameter Store / Secrets Manager | ⬜     | API keys                   |
| **DNS**                                      |        |                            |
| Amplify connected to hic-ai.com              | ⬜     | Custom domain              |
| SSL certificate provisioned                  | ⬜     | HTTPS                      |
| **Third-Party Services**                     |        |                            |
| Stripe webhooks pointing to production       | ⬜     | Update URL                 |
| KeyGen webhooks pointing to production       | ⬜     | Update URL                 |
| Auth0 callback URLs include production       | ⬜     | Update URLs                |
| **Testing**                                  |        |                            |
| Smoke test all critical paths                | ⬜     | Checkout, activate, portal |
| Test on multiple browsers                    | ⬜     | Chrome, Firefox, Safari    |
| Test on mobile                               | ⬜     | Responsive                 |
| **Rollback Plan**                            |        |                            |
| Document rollback procedure                  | ⬜     | If launch fails            |
| Verify can disable signups if needed         | ⬜     | Emergency brake            |

### 11.2 Launch Day Checklist

| Task                       | Status | Notes            |
| -------------------------- | ------ | ---------------- |
| Switch Stripe to live mode | ⬜     | Test → Live      |
| Announce on social media   | ⬜     | Marketing        |
| Monitor error logs         | ⬜     | CloudWatch       |
| Monitor Stripe dashboard   | ⬜     | First payments   |
| Respond to support tickets | ⬜     | Customer success |

---

## 12. Support & Community

**Status:** ⬜ Not started  
**Est. Hours:** 4-8h  
**Owner:** Simon

### 12.1 Philosophy

For launch, we adopt a **docs-first, community-assisted** support model. No full ticketing system required initially.

### 12.2 Support Channels (MVP)

| Channel               | Purpose                                 | Setup Time | Cost     |
| --------------------- | --------------------------------------- | ---------- | -------- |
| **Documentation**     | Self-service knowledge base             | ✅ Exists  | $0       |
| **Discord Community** | User Q&A, bug reports, feature requests | 2h         | $0       |
| **GitHub Issues**     | Bug tracking, feature requests          | 1h         | $0       |
| **Email**             | Billing/account issues only             | 1h         | $0 (SES) |

### 12.3 Checklist

| Task                                                                            | Status | Notes                         |
| ------------------------------------------------------------------------------- | ------ | ----------------------------- |
| **Documentation**                                                               |        |                               |
| Verify docs cover installation                                                  | ⬜     | Step-by-step guide            |
| Verify docs cover licensing/activation                                          | ⬜     | How to enter license key      |
| Verify docs cover common issues/FAQ                                             | ⬜     | Troubleshooting section       |
| Add "Getting Help" page                                                         | ⬜     | Links to all support channels |
| **Discord Community**                                                           |        |                               |
| Create Discord server                                                           | ⬜     | "HIC AI Community"            |
| Create channels: `#general`, `#mouse-help`, `#feature-requests`, `#bug-reports` | ⬜     | Basic structure               |
| Add Discord invite link to website                                              | ⬜     | Footer + Help page            |
| Add Discord invite to extension welcome                                         | ⬜     | Post-install message          |
| Set up basic moderation rules                                                   | ⬜     | Code of conduct               |
| **GitHub Issues**                                                               |        |                               |
| Create issue templates (bug report, feature request)                            | ⬜     | `.github/ISSUE_TEMPLATE/`     |
| Add "Report a Bug" link to extension                                            | ⬜     | Opens GitHub issue            |
| Label structure: `bug`, `feature`, `question`, `wontfix`                        | ⬜     | Triage system                 |
| **Email Support**                                                               |        |                               |
| Set up support@hic-ai.com                                                       | ⬜     | SES receiving                 |
| Create auto-reply with FAQ links                                                | ⬜     | Deflect common questions      |
| Document escalation path                                                        | ⬜     | When to respond personally    |

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

| Channel         | Expected Response         | Notes                 |
| --------------- | ------------------------- | --------------------- |
| Discord         | Community-driven (no SLA) | Best-effort from team |
| GitHub Issues   | Within 1 week             | Triaged weekly        |
| Email (billing) | Within 2 business days    | Simon responds        |
| Security        | Within 24 hours           | Mandatory             |

### 12.6 Future Enhancements (Post-Launch)

| Enhancement                 | When                      | Notes                            |
| --------------------------- | ------------------------- | -------------------------------- |
| Intercom/Crisp chat widget  | If volume warrants        | $50-100/mo                       |
| Zendesk/Freshdesk ticketing | If email volume > 50/week | $15+/agent/mo                    |
| Knowledge base search       | When docs grow            | Algolia DocSearch (free for OSS) |
| Community forum (Discourse) | If Discord gets noisy     | Self-hosted or $100/mo           |

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

### Day 0: CI/CD Pipeline — ✅ COMPLETE

| Task                              | Owner | Status           |
| --------------------------------- | ----- | ---------------- |
| Create GitHub Actions CI workflow | GC    | ✅ Done (Jan 26) |
| Workflow tested via PR #1         | GC    | ✅ Passed (58s)  |
| Merged to development + main      | GC    | ✅ Done          |

### Week 1: Infrastructure & Configuration

| Day         | Focus                  | Tasks                                       |
| ----------- | ---------------------- | ------------------------------------------- |
| **Day 1**   | Stripe + KeyGen Setup  | Simon: Create products, policies, webhooks  |
| **Day 1**   | Analytics              | GC: Sign up Plausible, add script           |
| **Day 2**   | Auth0 Setup            | Simon: Configure application, organizations |
| **Day 2**   | AWS Deploy             | GC: Run deploy.sh to staging, verify        |
| **Day 3-4** | Admin Portal Phase 1-2 | GC: API endpoints, invite flow              |
| **Day 5**   | Admin Portal Phase 3   | GC: Frontend wire-up                        |

### Week 2: Integration & Testing

| Day        | Focus                  | Tasks                                    |
| ---------- | ---------------------- | ---------------------------------------- |
| **Day 6**  | Admin Portal Phase 4-5 | GC: Role management, polish              |
| **Day 7**  | VSIX Packaging         | Simon: Extension manifest, licensing fix |
| **Day 7**  | Support Setup          | Simon: Discord server, issue templates   |
| **Day 8**  | E2E Testing            | GC + Simon: All critical paths           |
| **Day 9**  | Front-End Polish       | GC: Content, pricing, checkout           |
| **Day 10** | Deployment             | GC + Simon: Production setup             |

---

## Risk Register

| Risk                              | Impact | Mitigation                                              |
| --------------------------------- | ------ | ------------------------------------------------------- |
| Auth0 configuration issues        | High   | Start early, allow buffer time                          |
| KeyGen heartbeat complexity       | Medium | Can launch with device-count first, add heartbeat later |
| VSIX marketplace approval delay   | Medium | Submit early, have GitHub Packages as backup            |
| AWS Activate credits not approved | Low    | Continue with pay-as-you-go, minimal cost               |
| Stripe product misconfiguration   | Medium | Test thoroughly in sandbox                              |
| Discord spam/moderation           | Low    | Basic rules, can add bots later                         |

---

## Document History

| Version | Date         | Changes                                                                                                                                                                                                     |
| ------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.0     | Jan 26, 2026 | Complete rewrite consolidating all workstreams                                                                                                                                                              |
| 3.0.1   | Jan 26, 2026 | Corrected AWS status (templates exist), added CI/CD urgency, added Support section                                                                                                                          |
| 3.0.2   | Jan 26, 2026 | CI/CD pipeline complete — `.github/workflows/cicd.yml` deployed and verified                                                                                                                                |
| 3.0.3   | Jan 26, 2026 | v4 pricing complete — Individual $15/mo + Team $35/seat, Enterprise deferred                                                                                                                                |
| 3.0.4   | Jan 26, 2026 | **v4.1 pricing** — Team→Business rename, sessions→machines, 3 machines included, Agent-as-Salesperson enforcement model. See [v4.1 addendum](./20260126_PRICING_v4.1_BUSINESS_TIER_AND_MACHINE_MODEL.md)    |
| 3.0.5   | Jan 26, 2026 | **v4.2 pricing** — Final feature matrix: minSeats=1, machines 3/5, RBAC, audit logging, support tiers, SAML guidance. See [v4.2 final](./20260126_PRICING_v4.2_FINAL_FEATURE_MATRIX.md)                     |
| 3.0.6   | Jan 26, 2026 | **Auth0 complete** — Mouse app configured, Google + GitHub social connections, refresh token rotation, callback/logout URLs for all environments. Remaining: env vars, Organizations for Business tier      |
| 3.0.7   | Jan 26, 2026 | **Stripe products + KeyGen policies** — All 4 price IDs created, Stripe webhook configured. KeyGen policies (Floating, 3/5 machines) created, product token generated                                       |
| 3.0.8   | Jan 26, 2026 | **STRIPE + KEYGEN COMPLETE** — KeyGen webhook with Ed25519 verification, Stripe Customer Portal activated (`billing.stripe.com/p/login/7sYbJ0a2H2TO2Q74FKa3u00`). All third-party services fully configured |
| 2.1     | Jan 23, 2026 | Backend completion status                                                                                                                                                                                   |
| 2.0     | Jan 22, 2026 | Pricing restructure                                                                                                                                                                                         |
| 1.1     | Jan 21, 2026 | Infrastructure updates                                                                                                                                                                                      |
| 1.0     | Jan 21, 2026 | Initial roadmap                                                                                                                                                                                             |

---

## Key Reference Documents (Pricing & Enforcement)

| Document                                                                                                               | Purpose                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [20260126_PRICING_v4.2_FINAL_FEATURE_MATRIX.md](./20260126_PRICING_v4.2_FINAL_FEATURE_MATRIX.md)                       | **CURRENT** — Final pricing model: Individual $15/mo (3 machines), Business $35/seat (5 machines), RBAC, audit, support tiers |
| [20260126_PRICING_v4.1_BUSINESS_TIER_AND_MACHINE_MODEL.md](./20260126_PRICING_v4.1_BUSINESS_TIER_AND_MACHINE_MODEL.md) | Superseded by v4.2 — Team→Business rename, machine model                                                                      |
| [20260126_AGENT_SALESPERSON_ENFORCEMENT_MODEL.md](./20260126_AGENT_SALESPERSON_ENFORCEMENT_MODEL.md)                   | Soft enforcement via Agent-facing banners in tool responses                                                                   |
| [20260126_ADMIN_PORTAL_v4.1_ADDENDUM.md](./20260126_ADMIN_PORTAL_v4.1_ADDENDUM.md)                                     | Admin Portal changes for machine-based dashboard                                                                              |
