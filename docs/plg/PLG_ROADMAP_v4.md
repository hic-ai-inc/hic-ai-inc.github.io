# PLG Roadmap v4 — Final Sprint to Launch

**Document Version:** 4.13.0  
**Date:** January 29, 2026  
**Owner:** General Counsel  
**Status:** 🟢 AUTH COMPLETE (Individual) — Focus: E2E Individual Path (Amplify Gen 2 Migration)

---

## Executive Summary

This document consolidates ALL remaining work items to ship Mouse with full PLG self-service capability. It supersedes v3 with an **accurate assessment** based on actual code review (not documentation claims).

**Key Finding:** The PLG website backend is ~90% production-ready (better than v3 indicated). However, the Mouse VS Code extension has **zero production code**—only planning documents exist.

**North Star:** Ship Mouse with functional self-service purchase, licensing, and admin portal.

**Estimated Total Effort:** ~110-135 hours (Website: ~30h, Mouse: ~80-100h, AWS: ~8h)

---

## 🔄 DECISION: Migrating from Auth0 to Amazon Cognito

**Issue (Resolved):** Auth0 SDK v4 middleware incompatible with AWS Amplify SSR adapter.

**Root Cause (Confirmed Jan 28):** Fundamental version mismatch between Next.js 16 (`proxy.js`), Auth0 SDK v4 (`middleware.js` deprecated), and Amplify SSR adapter (only recognizes `middleware.js`). See [Migration Decision Memo](../20260128_AUTH0_TO_COGNITO_MIGRATION_DECISION.md).

**Decision:** Replace Auth0 with Amazon Cognito. AWS guarantees Cognito-Amplify compatibility.

**Attempted Fixes (22 builds over 2 days, all unsuccessful):**

- Migrated from `/api/auth/*` to `/auth/*` route convention (SDK v4)
- Renamed `middleware.js` → `proxy.js` then back to `middleware.js`
- Updated Auth0 Dashboard URLs to v4 convention
- Added 27 environment variables to Amplify
- Various middleware matcher configurations
- Cache bypass attempts (all showed `x-nextjs-prerender: 1`)

**Next Steps:** Implement Cognito integration (~6-8 hours). See [Migration Plan](../20260128_AUTH0_TO_COGNITO_MIGRATION_DECISION.md#migration-plan).

---

## Master Checklist — All Workstreams

| #   | Workstream                         | Status                      | Est. Hours | Owner      | Blocks            |
| --- | ---------------------------------- | --------------------------- | ---------- | ---------- | ----------------- |
| 1   | Analytics                          | ✅ Script ready             | 0h (done)  | GC         | —                 |
| 2   | Cookie/Privacy Compliance          | ✅ Documented               | 1h         | GC         | —                 |
| 3   | Auth (Cognito Migration)           | ✅ **COMPLETE** (v2 pool)   | 0h (done)  | GC + Simon | —                 |
| 3b  | **Amplify Gen 2 Migration**        | 🟡 **IN PROGRESS**          | **2-3h**   | GC + Simon | **3** (Auth)      |
| 4   | Admin Portal (Individuals + Teams) | ✅ **COMPLETE** (550 tests) | 0h (done)  | GC         | —                 |
| 5   | Licensing (KeyGen.sh) — Server     | ✅ **COMPLETE**             | 0h (done)  | Simon      | —                 |
| 5b  | **Server-Side Heartbeat API**      | ✅ **COMPLETE** (91 tests)  | 0h (done)  | GC         | —                 |
| 5c  | **Server-Side Trial Token API**    | ✅ **COMPLETE** (33 tests)  | 0h (done)  | GC         | —                 |
| 6   | Payments (Stripe)                  | ✅ **COMPLETE**             | 0h (done)  | Simon      | —                 |
| 7   | AWS Infrastructure                 | ✅ **DEPLOYED TO STAGING**  | 0h (done)  | GC         | —                 |
| 8   | **VS Code Extension (VSIX)**       | 🟡 **IN PROGRESS**          | **60-80h** | GC + Simon | **CRITICAL PATH** |
| 9   | Back-End E2E Testing               | 🟡 **IN PROGRESS**          | 6-10h      | GC         | —                 |
| 10  | Front-End Polish                   | ⚠️ Partial                  | 8-12h      | GC         | —                 |
| 11  | Deployment & Launch                | 🟡 **UNBLOCKED**            | 4-6h       | GC + Simon | **3, 9**          |
| 12  | Support & Community                | ⬜ Not started              | 4-8h       | Simon      | —                 |

> 🔄 **DECISION (Jan 29, 12:30 PM EST):** Migrating from Amplify Gen 1 to Gen 2 for proper IAM runtime credentials. Required for Stripe checkout (Secrets Manager access).
>
> 🔄 **DECISION (Jan 28, 10:30 AM EST):** Abandoning Auth0 for Amazon Cognito due to unfixable Amplify incompatibility. See [Migration Decision](../20260128_AUTH0_TO_COGNITO_MIGRATION_DECISION.md).
>
> 🔴 **RESOLVED (Jan 28):** Auth0 authentication blocker resolved via strategic pivot to Cognito. 22 builds attempted over 2 days; root cause identified as fundamental middleware incompatibility.
>
> ⚠️ **UPDATE (Jan 27):** Server-side heartbeat and trial token APIs are now complete. Mouse client-side licensing implementation is in progress with 139 passing tests.
>
> 🚀 **MILESTONE (Jan 27, 4:13 PM EST):** AWS Infrastructure deployed to staging! DynamoDB table `hic-plg-staging` live, SES domain VERIFIED.
>
> 🚀 **MILESTONE (Jan 27, 5:54 PM EST):** PLG Website deployed to staging via AWS Amplify (Build #10)! Custom domain `staging.hic-ai.com` AVAILABLE.

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

## 3. Auth (Cognito Migration)

**Status:** ✅ **COMPLETE (Individual)** — Login, signup, logout all working on staging  
**Est. Hours:** 0h (Individual done) | 4-6h (Business RBAC deferred)  
**Documentation:** [Migration Decision Memo](../20260128_AUTH0_TO_COGNITO_MIGRATION_DECISION.md), [Original Security Considerations](./20260122_SECURITY_CONSIDERATIONS_FOR_AUTH0_INTEGRATION.md)

> 🎯 **Individual Path Complete:** Auth is fully functional for Individual users. Business/Team RBAC (Owner/Admin/Member roles, Cognito Groups) will be implemented after Individual E2E is stood up with payments + licensing.

### 3.0 Migration Decision (Jan 28, 2026)

🔄 **Decision:** Replace Auth0 with Amazon Cognito due to unfixable middleware incompatibility with AWS Amplify.

**Root Cause:** Auth0 SDK v4 middleware incompatible with Amplify's SSR adapter. Next.js 16 prefers `proxy.js`, Auth0 SDK deprecates `middleware.js`, Amplify only recognizes `middleware.js`. 22 builds attempted over 2 days; all failed.

**See:** [Full Migration Decision Memo](../20260128_AUTH0_TO_COGNITO_MIGRATION_DECISION.md)

### 3.1 Why Cognito?

| Factor | Auth0 | Cognito | Winner |
|--------|-------|---------|--------|
| Amplify compatibility | ❌ Broken | ✅ Native | **Cognito** |
| Free tier | 7,500 MAUs | 50,000 MAUs | **Cognito** |
| Cost per MAU | ~$0.07 | ~$0.0055 | **Cognito** |
| Google login | ✅ Native | ✅ Native | Tie |
| GitHub login | ✅ Native | ⚠️ OIDC setup | Auth0 |
| Custom branding | ✅ Full CSS | ⚠️ Limited | Auth0 |
| SCIM provisioning | ✅ Enterprise | ❌ Build ourselves | Auth0 |

**Bottom Line:** Cognito wins on integration stability, which is non-negotiable. The drawbacks are solvable.

### 3.2 Migration Checklist

| Task                                 | Status | Notes                                           |
| ------------------------------------ | ------ | ----------------------------------------------- |
| **Phase 1: Cognito Resources**       |        |                                                 |
| Create User Pool v1 (`mouse-plg-staging`)| ❌ REPLACED | `us-east-1_MDTi26EOf` — name not required, deleted |
| Create User Pool v2 (`mouse-staging-v2`) | ✅     | `us-east-1_CntYimcMm`, required given_name/family_name |
| Create User Pool Client              | ✅     | `3jobildap1dobb5vfmiul47bvc`, public PKCE        |
| Configure Cognito Domain             | ✅     | `mouse-staging-v2.auth.us-east-1.amazoncognito.com` |
| Configure Google social IdP          | ✅     | Attribute mapping: given_name, family_name, email |
| Configure GitHub OIDC IdP            | ⏸️     | **Deferred** — Cognito requires OIDC well-known |
| Create Cognito Groups for roles      | ⏸️ DEFERRED | Business RBAC — after Individual E2E complete |
| **Phase 2: Code Migration**          |        |                                                 |
| Remove `@auth0/nextjs-auth0` package | ⬜     | Keep for now, remove post-launch               |
| Add `aws-amplify` package            | ✅     | Amplify Auth v6 + aws-jwt-verify               |
| Create `src/lib/cognito.js`          | ✅     | Amplify Auth, PKCE, session helpers            |
| Rewrite `src/lib/auth.js`            | ⬜     | Keep for compatibility, migrate later          |
| Simplify `src/middleware.js`         | ✅     | Simplified for Cognito, removed Auth0 dep      |
| Create `/auth/login/page.js`         | ✅     | Login page with Google button                   |
| Create `/auth/callback/page.js`      | ✅     | Token exchange with PKCE code_verifier          |
| Create `/auth/logout/route.js`       | ✅     | Fixed: uses `logout_uri` per AWS SDK standard   |
| Update portal pages (claim namespace)| ✅     | Client components using useUser()/useAuth()    |
| **Phase 3: Environment Variables**   |        |                                                 |
| Remove `AUTH0_*` from Amplify        | ⬜     | Deferred — keeping for fallback                |
| Add `COGNITO_*` to Amplify           | ✅     | 4 env vars configured in Amplify console        |
| **Phase 4: Test & Deploy**           |        |                                                 |
| Test locally                         | ✅     | Login, signup, protected routes working        |
| Deploy to staging                    | ✅     | Build #14+ deployed, Google OAuth working      |
| E2E test on staging                  | ✅     | Google OAuth, signup, logout all working       |
| **Phase 5: Cleanup**                 |        |                                                 |
| Delete Auth0 application             | ⬜     | Auth0 Dashboard → Applications                  |
| Delete `src/lib/auth0.js`            | ⬜     | No longer needed                                |

### 3.3 SSO/SAML (Contact Sales)

Enterprise SSO (SAML, Okta, Azure AD) is available for Business customers via Contact Sales.  
Pricing: $500 setup + $100/org/month. See [v4.2 pricing](./20260126_PRICING_v4.2_FINAL_FEATURE_MATRIX.md#saml-implementation-details).

---

## 3b. Amplify Gen 2 Migration

**Status:** 🟡 **IN PROGRESS**  
**Est. Hours:** 2-3h  
**Blocks:** Stripe checkout (secrets access)  
**Branch:** `feature/amplify-gen2-migration`

### 3b.1 Problem Statement

**Issue:** Amplify Gen 1 (WEB_COMPUTE platform) doesn't pass IAM credentials to SSR Lambda functions at runtime.  
**Impact:** Checkout API cannot access AWS Secrets Manager where `STRIPE_SECRET_KEY` is stored.  
**Root Cause:** Gen 1 IAM service role only applies during build phase, not runtime.

**Attempted Solutions (rejected):**
- Build-time secrets injection → Secrets in build artifacts (security risk)
- Plaintext env vars → User rejected ("No, we can't do that!")
- Stripe Payment Links → Can't prefill customer email (UX requirement)

**Decision:** Migrate to Amplify Gen 2 for proper IAM runtime integration.

### 3b.2 What Gen 2 Provides

| Capability | Gen 1 | Gen 2 |
|------------|-------|-------|
| IAM for SSR at runtime | ❌ Build-time only | ✅ Full runtime access |
| Secrets management | Manual Secrets Manager | Native `secret()` function |
| Infrastructure as code | amplify.yml only | Full CDK in `amplify/` folder |
| Local development | Limited | `ampx sandbox` environment |

> **Note:** Gen 2 recommends TypeScript but does not require it. Per HIC platform standards, we use **ES6 JavaScript modules** (ESM) for the `amplify/` backend. Files use `.js` extension with `{"type": "module"}` in `amplify/package.json`.

### 3b.3 Migration Checklist

| Task | Status | Notes |
|------|--------|-------|
| **Phase 1: Initialize Gen 2 Backend** | | |
| Run `npm create amplify@latest` | ⬜ | Creates `amplify/` folder |
| Install backend dependencies | ⬜ | `@aws-amplify/backend`, `@aws-amplify/backend-cli` |
| Create `amplify/backend.js` | ⬜ | Entry point (ES6 module, not .ts) |
| Create `amplify/package.json` with ESM | ⬜ | `{"type": "module"}` |
| **Phase 2: Reference Existing Cognito** | | |
| Create `amplify/auth/resource.js` | ⬜ | Use `referenceAuth()` (ES6, not .ts) |
| Configure user pool ID | ⬜ | `us-east-1_CntYimcMm` |
| Configure client ID | ⬜ | `3jobildap1dobb5vfmiul47bvc` |
| Test auth still works | ⬜ | Login, logout, protected routes |
| **Phase 3: Migrate Secrets** | | |
| Add secrets via Amplify Console | ⬜ | Hosting > Secrets > Manage secrets |
| Add `STRIPE_SECRET_KEY` | ⬜ | From AWS Secrets Manager |
| Add `STRIPE_WEBHOOK_SECRET` | ⬜ | From AWS Secrets Manager |
| Update `src/lib/secrets.js` | ⬜ | Use SSM Parameter Store access |
| **Phase 4: Deploy Gen 2 App** | | |
| Delete/archive Gen 1 Amplify app | ⬜ | App ID: `d2yhz9h4xdd5rb` |
| Create new Amplify app (Gen 2) | ⬜ | Auto-detects `amplify/` folder |
| Connect `development` branch | ⬜ | Same repo, new app |
| Configure custom domain | ⬜ | `staging.hic-ai.com` |
| **Phase 5: Verify E2E** | | |
| Test login/logout | ⬜ | Google OAuth |
| Test checkout flow | ⬜ | **Critical** - Stripe session creation |
| Test Settings page | ⬜ | DynamoDB access |
| Verify webhook endpoints | ⬜ | Stripe + KeyGen |

### 3b.4 Key Configuration Values

```
# Existing Cognito (keep)
User Pool ID: us-east-1_CntYimcMm
Client ID: 3jobildap1dobb5vfmiul47bvc
Domain: mouse-staging-v2.auth.us-east-1.amazoncognito.com

# Gen 1 App (to be archived)
Amplify App ID: d2yhz9h4xdd5rb
IAM Role: arn:aws:iam::496998973008:role/plg-amplify-role-staging

# Secrets (to migrate to Gen 2 SSM format)
Secrets Manager: plg/staging/stripe
  - STRIPE_SECRET_KEY
  - STRIPE_WEBHOOK_SECRET
```

### 3b.5 Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Cognito integration breaks | Low | High | Using `referenceAuth()` - minimal code change |
| Secrets access fails | Low | High | Test in sandbox before deploy |
| Domain/DNS issues | Low | Medium | Can revert to Gen 1 app if needed |
| Build time increases | Medium | Low | Acceptable tradeoff for security |

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

| Task                                      | Status | Notes                                |
| ----------------------------------------- | ------ | ------------------------------------ |
| Update `keygen.js` with heartbeat support | ✅     | `machineHeartbeat()` implemented     |
| **Server-side heartbeat API**             | ✅     | `/api/license/heartbeat` — 27 tests  |
| **Server-side trial token API**           | ✅     | `/api/license/trial/init` — 33 tests |
| **Rate limiting module**                  | ✅     | `src/lib/rate-limit.js` — 18 tests   |
| **Heartbeat integration tests**           | ✅     | 13 tests for full request flow       |
| Implement machine heartbeat in extension  | 🟡     | Client-side — in progress            |
| Test license creation flow                | ⬜     | Stripe → KeyGen                      |
| Test activation/deactivation              | ⬜     | Portal → KeyGen                      |
| Test heartbeat timeout                    | ⬜     | Session expiry                       |

### 5.4 Server-Side APIs (NEW — Jan 27, 2026)

**Heartbeat API** — `/api/license/heartbeat`

- POST endpoint for machine heartbeat
- License key format validation with Luhn checksum
- Rate limiting: 10 requests/minute per license key
- Keygen integration via `machineHeartbeat()`
- DynamoDB device tracking via `updateDeviceLastSeen()`

**Trial Token API** — `/api/license/trial/init`

- POST: Initialize new 14-day trial with fingerprint
- GET: Check trial status by fingerprint
- HMAC-SHA256 signed tokens with `TRIAL_TOKEN_SECRET`
- Rate limiting: 5 requests/hour per fingerprint
- Token format: `base64url(payload).base64url(signature)`

**Rate Limiting Module** — `src/lib/rate-limit.js`

- In-memory sliding window algorithm
- Presets: heartbeat (10/min), trialInit (5/hr), validate (20/min), activate (10/hr)
- Middleware helper with standard headers (X-RateLimit-\*)

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

**Status:** ✅ **DEPLOYED TO STAGING** (Jan 27, 2026)  
**Est. Hours:** 0h (complete)  
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

| Task                                 | Status | Notes                          |
| ------------------------------------ | ------ | ------------------------------ |
| **CloudFormation Templates**         |        |                                |
| `plg-main-stack.yaml` — Orchestrator | ✅     | 13KB                           |
| `plg-dynamodb.yaml` — Table + GSIs   | ✅     | 5KB                            |
| `plg-iam.yaml` — IAM roles           | ✅     | 13KB                           |
| `plg-ses.yaml` — Email               | ✅     | 7KB                            |
| `plg-messaging.yaml` — SNS/SQS       | ✅     | 11KB                           |
| `plg-monitoring.yaml` — CloudWatch   | ✅     | 15KB                           |
| `plg-compute.yaml` — Lambda          | ✅     | 12KB                           |
| `plg-scheduled.yaml` — Cron jobs     | ✅     | 4KB                            |
| **Deployment Scripts**               |        |                                |
| `deploy.sh` with dry-run support     | ✅     | 24KB                           |
| Parameter files (dev, staging, prod) | ✅     | All 3 exist                    |
| `amplify.yml`                        | ✅     | Exists                         |
| **Deployment Tasks**                 |        |                                |
| Review deploy.sh for correctness     | ✅     | Fixed for Windows Git Bash     |
| Dry-run deploy to staging            | ✅     | Verified                       |
| Deploy to staging                    | ✅     | `./deploy.sh staging` SUCCESS  |
| Verify all resources created         | ✅     | All 7 nested stacks created    |
| Add SES DNS records to GoDaddy       | ✅     | 4 records added (3 DKIM + TXT) |
| Verify SES domain                    | ✅     | Domain + DKIM VERIFIED! 🎉     |
| **Amplify Deployment**               |        |                                |
| Create Amplify app                   | ✅     | App ID: `d2yhz9h4xdd5rb`       |
| Connect GitHub repo                  | ✅     | `development` branch           |
| Configure amplify.yml                | ✅     | With dm dependency install     |
| Set environment variables (15)       | ✅     | Secrets moved to Secrets Mgr   |
| First successful build               | ✅     | Build #10 SUCCEEDED            |
| Custom domain setup                  | 🟡     | `staging.hic-ai.com` pending   |
| Deploy to production                 | ⬜     | `./deploy.sh prod`             |
| **Environment Setup**                |        |                                |
| AWS Secrets Manager                  | ✅     | 3 secrets: stripe, keygen, app |
| .env.local complete                  | ✅     | All credentials populated      |

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

## 8. VS Code Extension (VSIX) — � IN PROGRESS

**Status:** 🟡 **IN PROGRESS** — Client-side licensing with 139 tests passing  
**Est. Hours:** 60-80h remaining (was 80-100h — server-side now complete)  
**Documentation:** [GC_STRATEGY_FOR_VS_CODE_EXTENSION_MIGRATION.md](../20260123_GC_STRATEGY_FOR_VS_CODE_EXTENSION_MIGRATION.md) (1,628 lines), [MOUSE_LICENSING_TRIAL_IMPLEMENTATION_PLAN.md](../20260124_MOUSE_LICENSING_TRIAL_IMPLEMENTATION_PLAN.md) (1,253 lines)

### 8.1 Progress Update (Jan 27, 2026)

> ✅ **Server-Side Complete:** Heartbeat API (27 tests), Trial Token API (33 tests), Rate Limiting (18 tests), Integration Tests (13 tests). Total: 91 new tests.
>
> 🟡 **Client-Side In Progress:** Security hardening complete (139 tests), fingerprint generation, state management. Ready for API integration.

### 8.2 Work Breakdown (60-80h remaining)

#### Phase 1: Extension Scaffold (8-12h)

| Task                                        | Status | Notes                                |
| ------------------------------------------- | ------ | ------------------------------------ |
| Create `mouse-vscode/` directory structure  | ⬜     | New project                          |
| Create `package.json` with VS Code manifest | ⬜     | `engines.vscode`, `activationEvents` |
| Create `extension.js` entry point           | ⬜     | Lifecycle, status bar                |
| Configure webpack/esbuild bundling          | ⬜     | Bundle MCP server                    |
| Test in Extension Development Host (F5)     | ⬜     | Basic activation                     |

#### Phase 2: MCP Server Integration (8-12h)

| Task                                      | Status | Notes                     |
| ----------------------------------------- | ------ | ------------------------- |
| Bundle existing MCP server into extension | ⬜     | From `hic` repo           |
| Create `McpServerManager` class           | ⬜     | Spawn/kill server process |
| Implement stdio communication             | ⬜     | —                         |
| Create `StatusBarManager` class           | ⬜     | Show status icon          |

#### Phase 3: Licensing Implementation (16-24h)

| Task                                          | Status | Notes                           |
| --------------------------------------------- | ------ | ------------------------------- |
| Create `licensing/config.js`                  | ✅     | Trial constants, URLs           |
| Create `licensing/license-state.js`           | ✅     | Local state storage (139 tests) |
| Create `licensing/license-checker.js`         | ✅     | Main validation logic           |
| Create `licensing/providers/http-provider.js` | ✅     | KeyGen endpoints + 48 tests     |
| Create `licensing/messages.js`                | ✅     | Agent-facing messages           |
| Implement `_meta.license` injection           | ✅     | In server.js (probabilistic)    |
| Implement tool blocking for expired           | ✅     | checkToolAccess() in server.js  |
| Add `license_status` always-available tool    | ✅     | 16 tests passing                |

#### Phase 4: Heartbeat Implementation (8-12h)

| Task                                    | Status | Notes                               |
| --------------------------------------- | ------ | ----------------------------------- |
| **Server-side heartbeat API**           | ✅     | `/api/license/heartbeat` — 27 tests |
| **Server-side rate limiting**           | ✅     | 10 req/min per license key          |
| Implement heartbeat loop in extension   | ✅     | 10-minute interval in mouse-vscode  |
| Store sessionId for concurrent tracking | ✅     | fingerprint.js implemented          |
| Handle heartbeat failures gracefully    | ✅     | Non-blocking background refresh     |
| Test concurrent session enforcement     | ⬜     | Multiple machines                   |

#### Phase 5: Nag Banner System (8-12h)

| Task                                       | Status | Notes                          |
| ------------------------------------------ | ------ | ------------------------------ |
| Implement deterministic metadata frequency | ✅     | Seeded RNG (mulberry32)        |
| Trial Days 1-7: ~20% of calls              | ✅     | EARLY_TRIAL_PROBABILITY = 0.20 |
| Trial Days 8-12: ~50% of calls             | ✅     | MID_TRIAL_PROBABILITY = 0.50   |
| Trial Days 13-14: ~80% + Last 24h: 100%    | ✅     | FINAL/LAST_DAY_PROBABILITY     |
| Suspended mode (payment failed)            | ✅     | GRACE_PROBABILITY = 1.0        |
| Expired mode: Block all tools              | ✅     | checkToolAccess() blocks       |

#### Phase 6: VSIX Packaging (8-12h)

| Task                                        | Status | Notes                        |
| ------------------------------------------- | ------ | ---------------------------- |
| Create VS Code Publisher account (`hic-ai`) | ⬜     | marketplace.visualstudio.com |
| Generate Personal Access Token              | ⬜     | For vsce publish             |
| Install vsce: `npm install -g @vscode/vsce` | ⬜     | —                            |
| Build VSIX: `vsce package`                  | ⬜     | Creates `.vsix` file         |
| Test sideload: Install from VSIX            | ⬜     | Verify it works              |
| Publish pre-release                         | ⬜     | Pre-release flag             |

#### Phase 7: E2E Testing (16-24h)

| Task                              | Status | Notes             |
| --------------------------------- | ------ | ----------------- |
| Test fresh install → trial starts | ⬜     | —                 |
| Test trial countdown (mock time)  | ⬜     | —                 |
| Test trial expiration → block     | ⬜     | —                 |
| Test license key entry            | ⬜     | —                 |
| Test concurrent session limits    | ⬜     | Multiple machines |
| Test heartbeat timeout            | ⬜     | —                 |
| Test offline mode                 | ⬜     | —                 |

### 8.3 Key Design Documents

| Document                                                                                                     | Lines | Purpose                                    |
| ------------------------------------------------------------------------------------------------------------ | ----- | ------------------------------------------ |
| [GC_STRATEGY_FOR_VS_CODE_EXTENSION_MIGRATION.md](../20260123_GC_STRATEGY_FOR_VS_CODE_EXTENSION_MIGRATION.md) | 1,628 | Extension architecture, manifest, bundling |
| [MOUSE_LICENSING_TRIAL_IMPLEMENTATION_PLAN.md](../20260124_MOUSE_LICENSING_TRIAL_IMPLEMENTATION_PLAN.md)     | 1,253 | Trial flow, nag UX, license states         |
| [AGENT_SALESPERSON_ENFORCEMENT_MODEL.md](./20260126_AGENT_SALESPERSON_ENFORCEMENT_MODEL.md)                  | —     | `_meta.license` injection strategy         |

---

## 9. Back-End E2E Testing & API Wiring

**Status:** 🟡 **IN PROGRESS** — Settings API wired, DynamoDB integration active  
**Est. Hours:** 6-10h remaining  
**Prerequisites:** Cognito v2 ✅, DynamoDB ✅, Secrets Manager ✅

### 9.0 Immediate Priority: DynamoDB + API Foundation (Jan 28)

> 🎯 **Current Focus:** Complete the secure API foundation so signed-in users can access and modify their own protected resources. This unlocks all downstream features (licensing display, payment data, webhook integration).

#### 9.0.1 Phase 1: Settings API Wire-up ✅ COMPLETE

| Task | Status | Notes |
| ---- | ------ | ----- |
| Create Cognito User Pool v2 (`mouse-staging-v2`) | ✅ | Required `given_name`/`family_name` at signup |
| Configure Google IdP with attribute mapping | ✅ | Maps given_name, family_name, email, picture |
| Update `cognito.js` for name field extraction | ✅ | Builds fullName from given/middle/family |
| Create `updateCustomerProfile()` in DynamoDB lib | ✅ | Partial update via UpdateCommand |
| Update Settings API for separate name fields | ✅ | Validates givenName, middleName, familyName |
| Update Settings page UI (3-column name grid) | ✅ | First Name, Middle Initial, Last Name |
| Verify JWT auth on protected API routes | ✅ | `getSessionFromRequest()` validates tokens |

#### 9.0.2 Phase 2: Checkout Flow Wire-up 🟡 NEXT

| Task | Status | Notes |
| ---- | ------ | ----- |
| `/api/checkout` → redirect to `checkout.stripe.com` | ⬜ | Smart routing based on auth state |
| Pass `client_reference_id` with Cognito `sub` | ⬜ | Links Stripe customer to DynamoDB record |
| Create/update customer record pre-checkout | ⬜ | Ensure DynamoDB record exists |
| Handle checkout success callback | ⬜ | Update subscription status |
| Handle checkout cancel callback | ⬜ | Track abandoned carts |

#### 9.0.3 Phase 3: Stripe Webhook Integration 🔲 PENDING

| Task | Status | Notes |
| ---- | ------ | ----- |
| `checkout.session.completed` → create customer | ⬜ | Or update if exists |
| `customer.subscription.created` → update status | ⬜ | Set `subscriptionStatus: "active"` |
| `customer.subscription.updated` → sync changes | ⬜ | Plan changes, seat counts |
| `customer.subscription.deleted` → mark cancelled | ⬜ | Set `subscriptionStatus: "cancelled"` |
| `invoice.payment_succeeded` → update billing | ⬜ | Store last payment date |
| `invoice.payment_failed` → trigger grace period | ⬜ | Set `subscriptionStatus: "past_due"` |

#### 9.0.4 Phase 4: KeyGen Webhook Integration 🔲 PENDING

| Task | Status | Notes |
| ---- | ------ | ----- |
| `license.created` → store license key | ⬜ | Link to customer record |
| `license.validated` → update last validation | ⬜ | Track license health |
| `license.suspended` → update status | ⬜ | Payment-related suspension |
| `machine.created` → track device activation | ⬜ | Update device count |
| `machine.deleted` → update device list | ⬜ | Device deactivation |

#### 9.0.5 Phase 5: Portal Data Display 🔲 PENDING

| Task | Status | Notes |
| ---- | ------ | ----- |
| Dashboard: Show subscription status | ⬜ | From DynamoDB record |
| Dashboard: Show license status | ⬜ | From KeyGen via API |
| License page: Display license key | ⬜ | Mask with reveal toggle |
| Billing page: Show payment history | ⬜ | From Stripe via API |
| Devices page: List active machines | ⬜ | From KeyGen via API |

### 9.1 Test Scenarios

| Scenario                                          | Status | Coverage                |
| ------------------------------------------------- | ------ | ----------------------- |
| **Purchase Flows**                                |        |                         |
| Individual: Checkout → Payment → License created  | 🟡     | UI works, webhook TODO  |
| Team: Checkout → Payment → Org + Licenses created | 🟡     | UI works, webhook TODO  |
| **Activation Flows**                              |        |                         |
| Activate license with valid key                   | ⬜     | KeyGen machine create   |
| Activate with expired/revoked key                 | ⬜     | Error handling          |
| Concurrent session enforcement                    | ⬜     | Heartbeat timeout       |
| **Portal Flows**                                  |        |                         |
| Login → View dashboard                            | ✅     | Cognito + Portal        |
| Update profile (name fields)                      | ✅     | Settings API wired      |
| View/copy license key                             | 🟡     | UI exists, data TODO    |
| Deactivate device                                 | 🟡     | UI exists, KeyGen TODO  |
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
| Individual checkout → success page         | ✅     | Auth-gated, tested  |
| Team checkout → success page               | ✅     | Auth-gated, tested  |
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

**Status:** 🟡 **STAGING DEPLOYED** (Jan 27, 2026)  
**Est. Hours:** 4-6h remaining  
**Prerequisites:** All above complete

### 11.1 Pre-Launch Checklist

| Task                                         | Status | Notes                      |
| -------------------------------------------- | ------ | -------------------------- |
| **Infrastructure**                           |        |                            |
| Deploy CloudFormation stacks                 | ✅     | Staging: Jan 27, 2026      |
| Verify DynamoDB table exists                 | ✅     | `hic-plg-staging` ACTIVE   |
| Add SES DNS records to GoDaddy               | ✅     | 4 records added            |
| Verify SES domain verified                   | ✅     | Domain + DKIM verified     |
| **Environment**                              |        |                            |
| All env vars set in Amplify                  | ✅     | 15 variables (secrets moved)|
| Secrets in Parameter Store / Secrets Manager | ✅     | 3 secrets in Secrets Manager |
| **DNS**                                      |        |                            |
| Amplify connected to staging.hic-ai.com      | 🟡     | DNS records added          |
| SSL certificate provisioned                  | 🟡     | ACM verification pending   |
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

## Recommended Execution Order (v4 Revised)

> ⚠️ **v4 Revision:** This timeline has been updated based on actual code analysis. The website is ~90% complete but Mouse requires 80-100h of new development.

### Completed: CI/CD, Stripe, KeyGen, Admin Portal ✅

| Task                          | Owner | Status              |
| ----------------------------- | ----- | ------------------- |
| CI/CD Pipeline                | GC    | ✅ Done (Jan 26)    |
| Stripe Products + Webhooks    | Simon | ✅ Done             |
| KeyGen Policies + Webhooks    | Simon | ✅ Done             |
| Admin Portal Phases 1-5       | GC    | ✅ Done (550 tests) |
| Auth0 Dashboard Configuration | Simon | ✅ Done             |

### Week 1: Website Finalization (Parallel with Mouse)

**Track A: Website (~30h)**

| Day       | Focus            | Tasks                                              |
| --------- | ---------------- | -------------------------------------------------- |
| **Day 1** | Auth0 Wire-up    | GC: Create .env.local, wire portal to live session |
| **Day 2** | AWS Deploy       | GC: Run deploy.sh to staging, verify               |
| **Day 3** | AWS Production   | GC: Deploy to production, verify                   |
| **Day 4** | Front-End Polish | GC: Content review, error states                   |
| **Day 5** | Support Setup    | Simon: Discord server, issue templates             |

**Track B: Mouse Extension (~80-100h)**

| Day         | Focus              | Tasks                                                   |
| ----------- | ------------------ | ------------------------------------------------------- |
| **Day 1-2** | Extension Scaffold | Simon: Create mouse-vscode/, package.json, extension.js |
| **Day 3-4** | MCP Integration    | Simon: Bundle MCP server, McpServerManager              |
| **Day 5**   | Licensing Start    | Simon: license-state.js, license-checker.js             |

### Week 2: Mouse Licensing Implementation

| Day         | Focus          | Tasks                                             |
| ----------- | -------------- | ------------------------------------------------- |
| **Day 6-7** | Licensing Core | Simon: http-provider.js, \_meta.license injection |
| **Day 8-9** | Heartbeat      | Simon: 5-min heartbeat loop, session tracking     |
| **Day 10**  | Nag Banners    | Simon: Trial/expired/suspended states             |

### Week 3: Testing & Launch Prep

| Day           | Focus              | Tasks                              |
| ------------- | ------------------ | ---------------------------------- |
| **Day 11-12** | E2E Testing        | GC + Simon: All critical paths     |
| **Day 13**    | VSIX Packaging     | Simon: vsce package, sideload test |
| **Day 14**    | Marketplace Submit | Simon: Submit for review           |

---

## Risk Register (v4 Updated)

| Risk                            | Impact      | Mitigation                                     |
| ------------------------------- | ----------- | ---------------------------------------------- |
| **Mouse extension not started** | 🔴 Critical | Start immediately, this is the bottleneck      |
| Auth0 wire-up issues            | Medium      | Backend code is complete, just env vars needed |
| VSIX marketplace approval delay | Medium      | Submit early, have GitHub Packages as backup   |
| AWS deployment issues           | Low         | Templates exist and are tested                 |
| Stripe/KeyGen integration       | Low         | Already complete and configured                |

## Document History

| Version | Date         | Changes                                                                                                                                                                                                                                           |
| ------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **4.12** | Jan 29, 2026 | **AUTH COMPLETE (Individual).** Fixed logout bug: changed `redirect_uri` → `logout_uri` per AWS Amplify SDK. Google OAuth + email signup + logout all working. RBAC for Business (Owner/Admin/Member) deferred until Individual E2E complete. Next focus: Checkout → Stripe → KeyGen pipeline. |
| **4.11** | Jan 28, 2026 | **COGNITO v2 + SETTINGS API WIRED.** Created new Cognito User Pool (`mouse-staging-v2`) with required `given_name`/`family_name` at signup. Settings API now persists to DynamoDB with separate name fields. Added Section 9.0 "Immediate Priority" with 5-phase wire-up plan: (1) Settings ✅, (2) Checkout → Stripe, (3) Stripe webhooks, (4) KeyGen webhooks, (5) Portal data display. |
| **4.10** | Jan 28, 2026 | **SECRETS MANAGER COMPLETE.** Migrated secrets from Amplify env vars to AWS Secrets Manager (3 secrets: `plg/staging/stripe`, `keygen`, `app`). Checkout UI with auth-gating working. Env vars reduced from 24→15. Added backup/restore scripts for Amplify. Webhook→License pipeline still TODO. |
| **4.9** | Jan 28, 2026 | **COGNITO AUTH LIVE.** Google OAuth + email signup working on staging. Fixed logout flow (`redirect_uri` param, state clearing). Portal using `useUser()`/`useAuth()` hooks. Settings API with JWT verification via `aws-jwt-verify`. |
| **4.4** | Jan 27, 2026 | **Phase 3-5 COMPLETE.** Added `license_status` tool (16 tests). Implemented tiered nag frequency: 20%/50%/80%/100% with seeded RNG (23 tests). Updated NAG_CONFIG constants. Non-blocking heartbeat failure handling. 119 total licensing tests.  |
| **4.3** | Jan 27, 2026 | **MCP licensing KeyGen integration.** Updated `mouse/src/licensing/` to use KeyGen endpoints (`api.hic-ai.com`). Added http-provider.test.js (48 tests). Clarified dual licensing systems: MCP (tool gating) vs VS Code extension (heartbeat/UI). |
| **4.2** | Jan 27, 2026 | **Multi-workspace Mouse support.** Updated `mcp/src/utils/dm-base/safe-path.js` with `HIC_ALLOWED_DIRECTORIES` env var. Mouse now works across both `hic` and `hic-ai-inc.github.io` repos in multi-root workspaces.                              |
| **4.1** | Jan 27, 2026 | **Server-side APIs complete.** Heartbeat API (27 tests), Trial Token API (33 tests), Rate Limiting (18 tests), Integration tests (13 tests). Fixed `next/headers` dynamic import. 580 total tests passing.                                        |
| 4.0     | Jan 26, 2026 | v4 — Accurate Assessment. Revised based on actual code review. Website ~90% complete, Mouse extension has **zero code** (80-100h work). Updated all estimates.                                                                                    |
| 3.0.8   | Jan 26, 2026 | **STRIPE + KEYGEN COMPLETE** — KeyGen webhook with Ed25519 verification, Stripe Customer Portal activated. All third-party services fully configured                                                                                              |
| 3.0.7   | Jan 26, 2026 | **Stripe products + KeyGen policies** — All 4 price IDs created, Stripe webhook configured. KeyGen policies (Floating, 3/5 machines) created                                                                                                      |
| 3.0.6   | Jan 26, 2026 | **Auth0 complete** — Mouse app configured, Google + GitHub social connections, refresh token rotation, callback/logout URLs for all environments                                                                                                  |
| 4.5.0   | Jan 27, 2026 | **STAGING DEPLOYED** — AWS infrastructure deployed to staging (7 nested stacks), DynamoDB `hic-plg-staging` live, SES pending DNS verification, 57 infrastructure tests, deploy.sh hardened with Lambda package verification                      |
| 3.0.5   | Jan 26, 2026 | **v4.2 pricing** — Final feature matrix: minSeats=1, machines 3/5, RBAC, audit logging, support tiers, SAML guidance                                                                                                                              |
| 3.0.4   | Jan 26, 2026 | **v4.1 pricing** — Team→Business rename, sessions→machines, 3 machines included, Agent-as-Salesperson enforcement model                                                                                                                           |
| 3.0.3   | Jan 26, 2026 | v4 pricing complete — Individual $15/mo + Team $35/seat, Enterprise deferred                                                                                                                                                                      |
| 3.0.2   | Jan 26, 2026 | CI/CD pipeline complete — `.github/workflows/cicd.yml` deployed and verified                                                                                                                                                                      |
| 3.0.1   | Jan 26, 2026 | Corrected AWS status (templates exist), added CI/CD urgency, added Support section                                                                                                                                                                |
| 3.0     | Jan 26, 2026 | Complete rewrite consolidating all workstreams                                                                                                                                                                                                    |
| 2.1     | Jan 23, 2026 | Backend completion status                                                                                                                                                                                                                         |
| 2.0     | Jan 22, 2026 | Pricing restructure                                                                                                                                                                                                                               |
| 1.1     | Jan 21, 2026 | Infrastructure updates                                                                                                                                                                                                                            |
| 1.0     | Jan 21, 2026 | Initial roadmap                                                                                                                                                                                                                                   |

---

## Key Reference Documents (Pricing & Enforcement)

| Document                                                                                                               | Purpose                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [20260126_PRICING_v4.2_FINAL_FEATURE_MATRIX.md](./20260126_PRICING_v4.2_FINAL_FEATURE_MATRIX.md)                       | **CURRENT** — Final pricing model: Individual $15/mo (3 machines), Business $35/seat (5 machines), RBAC, audit, support tiers |
| [20260126_PRICING_v4.1_BUSINESS_TIER_AND_MACHINE_MODEL.md](./20260126_PRICING_v4.1_BUSINESS_TIER_AND_MACHINE_MODEL.md) | Superseded by v4.2 — Team→Business rename, machine model                                                                      |
| [20260126_AGENT_SALESPERSON_ENFORCEMENT_MODEL.md](./20260126_AGENT_SALESPERSON_ENFORCEMENT_MODEL.md)                   | Soft enforcement via Agent-facing banners in tool responses                                                                   |
| [20260126_ADMIN_PORTAL_v4.1_ADDENDUM.md](./20260126_ADMIN_PORTAL_v4.1_ADDENDUM.md)                                     | Admin Portal changes for machine-based dashboard                                                                              |
