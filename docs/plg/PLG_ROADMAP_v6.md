# PLG Roadmap v6 — Final Sprint: Business RBAC → Launch

**Document Version:** 6.0.0  
**Date:** February 1, 2026  
**Owner:** General Counsel  
**Status:** ✅ PHASES 1, 3, 4 COMPLETE — Individual E2E validated, Device Management wired, VS Code Extension ready

---

## Executive Summary

This document consolidates the final sprint to ship Mouse with full PLG self-service capability. v5 supersedes v4 with a **phase-based approach** for the remaining work.

**Current State:** Individual flow **COMPLETE**. Full E2E testing validated Feb 1: real Stripe payment, Keygen license activation, DynamoDB records, portal pages all working. Multiple bugs discovered and fixed during E2E testing session.

### Sprint Phases (New in v5)

| Phase | Focus                              | Status          | Est. Hours |
| ----- | ---------------------------------- | --------------- | ---------- |
| **1** | Individual Validation              | ✅ **COMPLETE** | 0h (done)  |
| **2** | Business RBAC (Owner/Admin/Member) | ⬜ Next         | 16-24h     |
| **3** | Device Management Wire-up          | ✅ **COMPLETE** | 0h (done)  |
| **4** | VS Code Extension Finalization     | ✅ **COMPLETE** | 0h (done)  |
| **5** | Launch                             | 🟡 Ready        | 4-8h       |

**North Star:** Ship Mouse with Individual self-service first, then Business role-based access controls.

**Estimated Total Effort:** ~20-32 hours remaining (Phases 1, 3, 4 complete; Phase 2 RBAC + Phase 5 Launch remaining)

---

## 🎯 PHASE 1: Individual Validation (✅ COMPLETE)

**Goal:** Complete E2E Individual user flow: signup → checkout → license → portal  
**Status:** ✅ **COMPLETE** (Feb 1, 2026)  
**Est. Hours:** 0h (done)

### 1.1 Individual Flow Checklist

| Task                               | Status  | Notes                                     |
| ---------------------------------- | ------- | ----------------------------------------- |
| **Authentication**                 |         |                                           |
| Cognito signup/login               | ✅ DONE | Google OAuth + email working              |
| Portal protected routes            | ✅ DONE | Middleware auth check                     |
| JWT verification in APIs           | ✅ DONE | `aws-jwt-verify` in all portal APIs       |
| **Dashboard**                      |         |                                           |
| Display user info                  | ✅ DONE | Name, email from Cognito                  |
| Display license status             | ✅ DONE | Real status from DynamoDB (Feb 1)         |
| Display device count               | ✅ DONE | Real count from DynamoDB (Feb 1)          |
| **Checkout**                       |         |                                           |
| Stripe checkout redirect           | ✅ DONE | All 4 price IDs working                   |
| Post-checkout license provisioning | ✅ DONE | Stripe webhook → Keygen working           |
| Success page with license key      | ✅ DONE | License displayed + copy button           |
| License key display UX             | ✅ DONE | Compact format (Jan 31)                   |
| **Billing Page**                   |         |                                           |
| Display subscription info          | ✅ DONE | stripeCustomerId fix (Feb 1)              |
| Stripe Customer Portal link        | ✅ DONE | Working                                   |
| **Devices Page**                   |         |                                           |
| Display devices list               | ✅ DONE | From DynamoDB LICENSE#/DEVICE# records    |
| Show device count / max            | ✅ DONE | Uses PRICING constants (Feb 1)            |
| Fingerprint deduplication          | ✅ DONE | Prevents duplicate device records (Feb 1) |
| **License Page**                   |         |                                           |
| Display license key                | ✅ DONE | Copy button working                       |
| Activation instructions            | ✅ DONE | Updated for Mouse UI commands (Feb 1)     |
| **Settings**                       |         |                                           |
| Display/update preferences         | ✅ DONE | JWT auth, DynamoDB                        |
| Export data                        | ✅ DONE | Working                                   |
| Delete account                     | ⬜ TODO | Verify cascade delete                     |

### 1.2 Success Criteria

- [x] Fresh user can: signup → checkout → receive license key → see dashboard
- [x] License key appears in portal License page
- [x] Device count shows correctly (wired to DynamoDB Feb 1)
- [x] Settings preferences persist
- [x] Billing page shows subscription details
- [x] Email delivery working (SES verified)

---

## 🔐 PHASE 2: Business RBAC (Owner/Admin/Member)

**Goal:** Implement role-based access control for Business tier  
**Status:** ⬜ Not Started  
**Est. Hours:** 16-24h  
**Prerequisite:** Phase 1 complete (Individual flow working)

> **Scope:** RBAC affects Portal only. VS Code extension behavior is identical for all users.

### 2.1 Role Definitions

| Role       | Description                | Portal Access                                                                         |
| ---------- | -------------------------- | ------------------------------------------------------------------------------------- |
| **Owner**  | Business license purchaser | Full access (billing, team, settings, delete account)                                 |
| **Admin**  | Delegated administrator    | Same as Owner EXCEPT: cannot delete account, cannot change/remove Owner               |
| **Member** | Team member                | Dashboard only: license status, their devices, "Contact your administrator" messaging |

### 2.2 Implementation Plan

#### 2.2.1 Cognito Groups (Infrastructure)

| Task                                | Status  | Notes                                 |
| ----------------------------------- | ------- | ------------------------------------- |
| Create `mouse-owner` Cognito Group  | ⬜ TODO | AWS Console or CloudFormation         |
| Create `mouse-admin` Cognito Group  | ⬜ TODO |                                       |
| Create `mouse-member` Cognito Group | ⬜ TODO |                                       |
| Assign group on license purchase    | ⬜ TODO | Stripe webhook → assign `mouse-owner` |
| Assign group on invite accept       | ⬜ TODO | Based on invite role                  |

#### 2.2.2 Pre-token Lambda Trigger

**Purpose:** Inject `custom:role` claim into ID token based on Cognito Group membership.

| Task                           | Status  | Notes                          |
| ------------------------------ | ------- | ------------------------------ |
| Create Lambda function         | ⬜ TODO | `plg-cognito-pretrigger-{env}` |
| Add PreTokenGeneration trigger | ⬜ TODO | Cognito User Pool → Triggers   |
| Add CloudFormation template    | ⬜ TODO | `plg-cognito.yaml`             |
| Test role claim in ID token    | ⬜ TODO | Decode JWT to verify           |

**Lambda Logic:**

```javascript
// Pre-token generation trigger
exports.handler = async (event) => {
  const groups = event.request.groupConfiguration?.groupsToOverride || [];

  // Determine role from group membership (first match wins)
  let role = "individual"; // default for Individual tier
  if (groups.includes("mouse-owner")) role = "owner";
  else if (groups.includes("mouse-admin")) role = "admin";
  else if (groups.includes("mouse-member")) role = "member";

  // Add to ID token claims
  event.response.claimsOverrideDetails = {
    claimsToAddOrOverride: {
      "custom:role": role,
    },
  };

  return event;
};
```

#### 2.2.3 Portal Middleware Role Checks

| Task                                          | Status  | Notes                                    |
| --------------------------------------------- | ------- | ---------------------------------------- |
| Extract role from ID token                    | ⬜ TODO | `req.user.role` from `custom:role` claim |
| Create `requireOwner()` middleware            | ⬜ TODO | 403 if not Owner                         |
| Create `requireAdmin()` middleware            | ⬜ TODO | 403 if not Owner or Admin                |
| Protect `/portal/billing`                     | ⬜ TODO | Require Owner                            |
| Protect `/portal/team`                        | ⬜ TODO | Require Admin                            |
| Protect `/api/portal/settings/delete-account` | ⬜ TODO | Require Owner                            |

#### 2.2.4 Role-Based UI Gating

| Task                               | Status  | Notes                          |
| ---------------------------------- | ------- | ------------------------------ |
| Add `useRole()` hook               | ⬜ TODO | Extract role from auth context |
| Hide billing nav for Members       | ⬜ TODO | `PortalSidebar.js`             |
| Hide team nav for Members          | ⬜ TODO | `PortalSidebar.js`             |
| Hide delete account for non-Owners | ⬜ TODO | `settings/page.js`             |
| Show "Contact admin" for Members   | ⬜ TODO | Dashboard messaging            |

#### 2.2.5 Member Experience

**Member Dashboard shows:**

- License tier and status (active/suspended/expired)
- Their registered devices
- Organization name
- "Contact your administrator" messaging for billing/team questions

**Members CANNOT:**

- Access `/portal/billing`
- Access `/portal/team`
- Change organization settings
- Delete account

### 2.3 Implementation Order

1. **Owner experience first** — Full portal access, test all flows
2. **Admin experience second** — Nearly identical to Owner (just disable Owner/delete actions)
3. **Member experience last** — Minimal dashboard with gating

### 2.4 Testing Checklist

| Scenario                              | Status |
| ------------------------------------- | ------ |
| Owner can access all portal sections  | ⬜     |
| Owner can delete account              | ⬜     |
| Owner can change member roles         | ⬜     |
| Admin can access billing              | ⬜     |
| Admin CANNOT delete account           | ⬜     |
| Admin CANNOT change Owner role        | ⬜     |
| Member sees dashboard only            | ⬜     |
| Member gets 403 on /billing           | ⬜     |
| Member sees "Contact admin" messaging | ⬜     |

---


## Master Checklist — All Workstreams (v6 Updated)

> **v5 Note:** Business RBAC moved to Phase 2 (after Individual validation). See [Phase 2: Business RBAC](#-phase-2-business-rbac-owneradminmember) for detailed implementation plan.

| #   | Workstream                         | Status                      | Est. Hours | Owner      | Blocks       |
| --- | ---------------------------------- | --------------------------- | ---------- | ---------- | ------------ |
| 1   | Analytics                          | ✅ Script ready             | 0h (done)  | GC         | —            |
| 2   | Cookie/Privacy Compliance          | ✅ Documented               | 1h         | GC         | —            |
| 3   | Auth (Cognito — Individual)        | ✅ **COMPLETE** (v2 pool)   | 0h (done)  | GC + Simon | —            |
| 3b  | **Amplify Gen 2 Migration**        | ✅ **STRUCTURE COMPLETE**   | 0h (done)  | GC + Simon | **3** (Auth) |
| 3c  | **Business RBAC (Phase 2)**        | ⬜ **NEXT PRIORITY**        | **16-24h** | GC         | **Phase 1**  |
| 4   | Admin Portal (Individuals + Teams) | ✅ **COMPLETE** (550 tests) | 0h (done)  | GC         | —            |
| 5   | Licensing (KeyGen.sh) — Server     | ✅ **COMPLETE**             | 0h (done)  | Simon      | —            |
| 5b  | **Server-Side Heartbeat API**      | ✅ **COMPLETE** (91 tests)  | 0h (done)  | GC         | —            |
| 5c  | **Server-Side Trial Token API**    | ✅ **COMPLETE** (33 tests)  | 0h (done)  | GC         | —            |
| 6   | Payments (Stripe)                  | ✅ **COMPLETE**             | 0h (done)  | Simon      | —            |
| 7   | AWS Infrastructure                 | ✅ **DEPLOYED TO STAGING**  | 0h (done)  | GC         | —            |
| 8   | **VS Code Extension (VSIX)**       | ✅ **PHASE 4 COMPLETE**     | **4-6h**   | GC + Simon | **B1-B4**    |
| 9   | Back-End E2E Testing               | 🟡 **LAMBDAS DEPLOYED**     | 4-6h       | GC         | —            |
| 10  | Front-End Polish                   | ⚠️ Partial                  | 8-12h      | GC         | —            |
| 11  | Deployment & Launch                | 🟡 **UNBLOCKED**            | 4-6h       | GC + Simon | **3, 9**     |
| 12  | Support & Community                | ⬜ Not started              | 4-8h       | Simon      | —            |

> **Latest Milestone (Feb 1, 2026):** Full E2E testing complete! Real Stripe payment, Keygen license, Mouse v0.10.1 device registration, all portal pages working. 823 unit tests passing.


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
2. Cognito session cookies are "essential" (no consent required)
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

## 3. Auth (Cognito)

**Status:** ✅ **COMPLETE (Individual)** | ⏸️ **DEFERRED (Business RBAC)**
**Est. Hours:** 0h remaining for Individual | 4-6h for Business RBAC
**Documentation:** [Migration Decision](../20260128_AUTH0_TO_COGNITO_MIGRATION_DECISION.md)

### 3.1 Current State

| Component | Status | Details |
|-----------|--------|---------|
| Cognito User Pool | ✅ | `mouse-staging-v2` (`us-east-1_CntYimcMm`) |
| Google OAuth | ✅ | Social login working |
| GitHub OAuth | ⏸️ DEFERRED | Requires OIDC proxy setup |
| Login/Signup/Logout | ✅ | All flows working on staging |
| Protected Routes | ✅ | Middleware validates tokens |
| Business RBAC | ⏸️ DEFERRED | Owner/Admin/Member roles — post-MVP |

### 3.2 Key Configuration

```
User Pool ID: us-east-1_CntYimcMm
Client ID: 3jobildap1dobb5vfmiul47bvc
Domain: mouse-staging-v2.auth.us-east-1.amazoncognito.com
```

### 3.3 Amplify Gen 2 Backend

**Status:** ✅ **STRUCTURE COMPLETE**

| Component | Status | Details |
|-----------|--------|---------|
| CDK Bootstrap | ✅ | `aws://496998973008/us-east-1` |
| `amplify/` folder | ✅ | ES6 JavaScript modules |
| Compute Role | ✅ | `plg-amplify-compute-role-staging` |
| SSM Parameter Access | ✅ | `/plg/secrets/*` for Stripe keys |
| Checkout Flow | ✅ | All 4 paths working (Individual/Business × Monthly/Annual) |

### 3.4 SSO/SAML (Contact Sales)

Enterprise SSO available for Business customers: $500 setup + $100/org/month.

---

## 4. Admin Portal (Individuals + Teams)

**Status:** ✅ Phases 1-5 COMPLETE (Cognito RBAC deferred)  
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
| 4     | Role Management (PATCH role, Cognito sync) | 4h         | ✅     |
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
| Cognito: Add user to org on accept                           | ⬜     | Cognito config         |
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
| Update Cognito user metadata on role change                  | ⏸️     | Cognito RBAC later  |
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

## 8. VS Code Extension (VSIX) — ✅ PHASE 4 COMPLETE

**Status:** ✅ **PHASE 4 COMPLETE** — VSIX v0.10.1 built and tested, licensing architecture refactored, CI/CD pipeline ready  
**Est. Hours:** 4-6h remaining (marketplace publish + production API deploy only)  
**Documentation:** [GC_STRATEGY_FOR_VS_CODE_EXTENSION_MIGRATION.md](../20260123_GC_STRATEGY_FOR_VS_CODE_EXTENSION_MIGRATION.md) (1,628 lines), [MOUSE_LICENSING_TRIAL_IMPLEMENTATION_PLAN.md](../20260124_MOUSE_LICENSING_TRIAL_IMPLEMENTATION_PLAN.md) (1,253 lines), [Licensing Architecture Refactor](https://github.com/SimonReiff/hic/blob/main/plg/docs/20260201_GC_TECH_SPEC_LICENSING_ARCHITECTURE_REFACTOR.md), [Auto-Update Integration Addendum](https://github.com/SimonReiff/hic/blob/main/plg/docs/20260201_GC_TECH_SPEC_ADDENDUM_AUTO_UPDATE_INTEGRATION.md)

### 8.1 Progress Update (Feb 1, 2026)

> ✅ **Server-Side Complete:** Heartbeat API (27 tests), Trial Token API (33 tests), Rate Limiting (18 tests), Integration Tests (13 tests). Total: 91 server tests.
>
> ✅ **Client-Side Complete (Feb 1):**
>
> - **Licensing Architecture Refactor:** Consolidated all licensing logic into shared `/licensing/` core library at `/hic/licensing/`. Single source of truth for state management, validation, heartbeat, and CLI commands.
> - **Unified Version Management (v0.10.0):** `mouse/VERSION` file as canonical source. `mouse-version.js` script syncs version across all `package.json` files.
> - **CI/CD Pipeline Phase 1 & 2:** GitHub workflows for version bump (`version-bump.yml`), release (`release.yml`), and VSIX publish (`publish-vsix.yml`) with production gate.
> - **Heartbeat Manager:** Robust background heartbeat with proper validation and state persistence.
> - **CLI Commands:** Unified `hic` CLI with `mouse license status|activate|deactivate|info` subcommands.
> - **Core Validate Command:** License validation with grace period support.
> - **VSIX ESM Build:** Fixed imports to use source `/licensing/` directory.
>
> ✅ **E2E Validated (Feb 1):** Mouse v0.10.1 installed, activated with real Keygen license, device registration working, heartbeat successful.
>
> 🟡 **Remaining (4-6h):**
>
> - Auto-Update Integration (blocked on B1-B4 server-side work — see Addendum)
> - VS Code Marketplace publish
> - Production API deployment (`api.hic-ai.com`)

### 8.1.1 Licensing Architecture Refactor (Feb 1)

The client-side licensing was consolidated from 3 separate implementations into a single shared library:

| Component        | Location                            | Purpose                                         |
| ---------------- | ----------------------------------- | ----------------------------------------------- |
| **Core Library** | `/hic/licensing/`                   | Shared state, validation, constants             |
| `state.js`       | `/licensing/state.js`               | `LicenseStateManager` - canonical state storage |
| `validation.js`  | `/licensing/validation.js`          | Heartbeat response validation                   |
| `constants.js`   | `/licensing/constants.js`           | Status values, URLs, timing                     |
| `heartbeat.js`   | `/licensing/heartbeat.js`           | Heartbeat manager                               |
| **Commands**     | `/licensing/commands/`              | CLI command implementations                     |
| `status.js`      | `/licensing/commands/status.js`     | `hic mouse license status`                      |
| `activate.js`    | `/licensing/commands/activate.js`   | License activation                              |
| `deactivate.js`  | `/licensing/commands/deactivate.js` | Device deactivation                             |
| `validate.js`    | `/licensing/commands/validate.js`   | Grace period validation                         |
| **Consumers**    |                                     | Use shared library                              |
| MCP Server       | `/mouse/src/licensing/`             | Imports from `/licensing/`                      |
| VSIX             | `/mouse-vscode/src/licensing/`      | Imports from `/licensing/`                      |
| CLI              | `/packaging/cli/bin/`               | `hic mouse` commands                            |

### 8.1.2 CI/CD Pipeline (Feb 1)

| Phase       | Workflow           | Trigger         | Purpose                                    |
| ----------- | ------------------ | --------------- | ------------------------------------------ |
| **Phase 1** | `version-bump.yml` | Manual          | Increment VERSION, sync package.json files |
| **Phase 2** | `release.yml`      | Push to main    | Create GitHub Release with changelog       |
| **Phase 2** | `publish-vsix.yml` | Release created | Build VSIX, publish to Marketplace         |

**Production Gate:** `PRODUCTION_READY` repository variable must be `true` for marketplace publish. Currently `false` (staging only).

### 8.1.3 Auto-Update Integration Blockers (Feb 1)

Per the [Auto-Update Addendum](https://github.com/SimonReiff/hic/blob/main/plg/docs/20260201_GC_TECH_SPEC_ADDENDUM_AUTO_UPDATE_INTEGRATION.md), the following server-side blockers must be resolved before auto-update can be implemented:

| Blocker | Description                                                  | Status                                              |
| ------- | ------------------------------------------------------------ | --------------------------------------------------- |
| **B0**  | Fix user-to-license lookup (query by email only)             | ✅ **RESOLVED** (Feb 1) — Portal devices page fixed |
| **B1**  | Add `VERSION#mouse` record to DynamoDB                       | ⬜ TODO                                             |
| **B2**  | Heartbeat returns `latestVersion`, `minVersion`, `updateUrl` | ⬜ TODO                                             |
| **B3**  | Deploy to staging.hic-ai.com                                 | ⬜ TODO                                             |
| **B4**  | Deploy to api.hic-ai.com (production)                        | ⬜ TODO                                             |

Once B1-B4 are complete, client-side auto-update (C1-C7) can be implemented per the spec.

### 8.2 Work Breakdown (4-6h remaining)

#### Phase 1: Extension Scaffold ✅ COMPLETE

| Task                                        | Status | Notes                                |
| ------------------------------------------- | ------ | ------------------------------------ |
| Create `mouse-vscode/` directory structure  | ✅     | Complete in hic repo                 |
| Create `package.json` with VS Code manifest | ✅     | `engines.vscode`, `activationEvents` |
| Create `extension.js` entry point           | ✅     | Lifecycle, status bar, MCP provider  |
| Configure webpack/esbuild bundling          | ✅     | Bundle MCP server                    |
| Test in Extension Development Host (F5)     | ✅     | 139 tests passing                    |

#### Phase 2: MCP Server Integration ✅ COMPLETE

| Task                                      | Status | Notes                      |
| ----------------------------------------- | ------ | -------------------------- |
| Bundle existing MCP server into extension | ✅     | From `hic` repo            |
| Create `McpServerManager` class           | ✅     | McpRelayProvider class     |
| Implement stdio communication             | ✅     | Spawn/kill server process  |
| Create `StatusBarManager` class           | ✅     | StatusBarManager.js exists |

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

#### Phase 6: VSIX Packaging 🟡 IN PROGRESS (4-6h remaining)

| Task                                        | Status | Notes                        |
| ------------------------------------------- | ------ | ---------------------------- |
| Create VS Code Publisher account (`hic-ai`) | ⬜     | marketplace.visualstudio.com |
| Generate Personal Access Token              | ⬜     | For vsce publish             |
| Install vsce: `npm install -g @vscode/vsce` | ✅     | Installed                    |
| Build VSIX: `vsce package`                  | ✅     | mouse-0.9.9.vsix exists      |
| Test sideload: Install from VSIX            | ✅     | Verified working             |
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

| Task                                             | Status | Notes                                         |
| ------------------------------------------------ | ------ | --------------------------------------------- |
| Create Cognito User Pool v2 (`mouse-staging-v2`) | ✅     | Required `given_name`/`family_name` at signup |
| Configure Google IdP with attribute mapping      | ✅     | Maps given_name, family_name, email, picture  |
| Update `cognito.js` for name field extraction    | ✅     | Builds fullName from given/middle/family      |
| Create `updateCustomerProfile()` in DynamoDB lib | ✅     | Partial update via UpdateCommand              |
| Update Settings API for separate name fields     | ✅     | Validates givenName, middleName, familyName   |
| Update Settings page UI (3-column name grid)     | ✅     | First Name, Middle Initial, Last Name         |
| Verify JWT auth on protected API routes          | ✅     | `getSessionFromRequest()` validates tokens    |

#### 9.0.2 Phase 2: Checkout Flow Wire-up ✅ COMPLETE (Feb 1)

| Task                                                | Status | Notes                                    |
| --------------------------------------------------- | ------ | ---------------------------------------- |
| `/api/checkout` → redirect to `checkout.stripe.com` | ✅     | Smart routing based on auth state        |
| Pass `client_reference_id` with Cognito `sub`       | ✅     | Links Stripe customer to DynamoDB record |
| Create/update customer record pre-checkout          | ✅     | Ensure DynamoDB record exists            |
| Handle checkout success callback                    | ✅     | Update subscription status               |
| Handle checkout cancel callback                     | ⬜     | Track abandoned carts (deferred)         |

#### 9.0.3 Phase 3: Stripe Webhook Integration ✅ COMPLETE (Jan 29)

| Task                                             | Status | Notes                  |
| ------------------------------------------------ | ------ | ---------------------- |
| `checkout.session.completed` → create customer   | ✅     | customer-update Lambda |
| `customer.subscription.created` → update status  | ✅     | customer-update Lambda |
| `customer.subscription.updated` → sync changes   | ✅     | customer-update Lambda |
| `customer.subscription.deleted` → mark cancelled | ✅     | customer-update Lambda |
| `invoice.payment_succeeded` → update billing     | ✅     | customer-update Lambda |
| `invoice.payment_failed` → trigger grace period  | ✅     | customer-update Lambda |

#### 9.0.4 Phase 4: KeyGen Webhook Integration 🔲 PENDING

| Task                                         | Status | Notes                      |
| -------------------------------------------- | ------ | -------------------------- |
| `license.created` → store license key        | ⬜     | Link to customer record    |
| `license.validated` → update last validation | ⬜     | Track license health       |
| `license.suspended` → update status          | ⬜     | Payment-related suspension |
| `machine.created` → track device activation  | ⬜     | Update device count        |
| `machine.deleted` → update device list       | ⬜     | Device deactivation        |

#### 9.0.5 Phase 5: Portal Data Display 🔲 PENDING

| Task                                | Status | Notes                   |
| ----------------------------------- | ------ | ----------------------- |
| Dashboard: Show subscription status | ⬜     | From DynamoDB record    |
| Dashboard: Show license status      | ⬜     | From KeyGen via API     |
| License page: Display license key   | ⬜     | Mask with reveal toggle |
| Billing page: Show payment history  | ⬜     | From Stripe via API     |
| Devices page: List active machines  | ⬜     | From KeyGen via API     |

### 9.1 Test Scenarios

| Scenario                                          | Status | Coverage               |
| ------------------------------------------------- | ------ | ---------------------- |
| **Purchase Flows**                                |        |                        |
| Individual: Checkout → Payment → License created  | ✅     | UI + Lambda handlers   |
| Team: Checkout → Payment → Org + Licenses created | ✅     | UI + Lambda handlers   |
| **Activation Flows**                              |        |                        |
| Activate license with valid key                   | ⬜     | KeyGen machine create  |
| Activate with expired/revoked key                 | ⬜     | Error handling         |
| Concurrent session enforcement                    | ⬜     | Heartbeat timeout      |
| **Portal Flows**                                  |        |                        |
| Login → View dashboard                            | ✅     | Cognito + Portal       |
| Update profile (name fields)                      | ✅     | Settings API wired     |
| View/copy license key                             | 🟡     | UI exists, data TODO   |
| Deactivate device                                 | 🟡     | UI exists, KeyGen TODO |
| Update payment method                             | ✅     | Stripe Portal link     |
| **Team Admin Flows**                              |        |                        |
| Invite member → Accept → Login                    | ✅     | Full invite flow       |
| Revoke member → License deactivated               | ✅     | TeamManagement.js      |
| Change role (member → admin)                      | ✅     | TeamManagement.js      |
| **Webhook Flows**                                 |        |                        |
| Stripe subscription created                       | ✅     | customer-update Lambda |
| Stripe subscription cancelled                     | ✅     | customer-update Lambda |
| Stripe payment failed                             | ⬜     | Grace period handling  |

### 9.2 Test Environments

| Environment | Purpose        | URL                |
| ----------- | -------------- | ------------------ |
| Local       | Development    | localhost:3000     |
| Staging     | Pre-production | staging.hic-ai.com |
| Production  | Live           | hic-ai.com         |

### 9.3 Test License Provisioning Endpoint (NEW — Jan 29, 2026)

**Purpose:** Enable E2E testing of the full payment→license→email pipeline without requiring real Stripe payments.

**Endpoint:** `POST /api/admin/provision-test-license`

**Security:**

- Staging-only (returns 403 in production)
- Requires `x-admin-key` header (from Secrets Manager `plg/staging/app`)
- All records marked with `testMode: true` for identification

**What It Does:**

1. Creates a **real Keygen license** (not mocked)
2. Writes customer record to DynamoDB (for Admin Portal)
3. Writes license record to DynamoDB with `eventType: LICENSE_CREATED`
4. DynamoDB Streams → stream-processor → SNS → email-sender → SES
5. Returns full license key for VS Code extension testing

**Usage:**

```bash
curl -X POST https://staging.mouse.hic-ai.com/api/admin/provision-test-license \
  -H "Content-Type: application/json" \
  -H "x-admin-key: <TEST_ADMIN_KEY from Secrets Manager>" \
  -d '{"email": "test@example.com", "planType": "individual"}'
```

**Response:**

```json
{
  "success": true,
  "license": {
    "id": "keygen-license-id",
    "key": "XXXX-XXXX-XXXX-XXXX",
    "planType": "individual",
    "expiresAt": "2027-01-29T..."
  },
  "customer": {
    "userId": "test-user-xxx",
    "email": "test@example.com"
  }
}
```

### 9.4 Clear Path Forward: Individual Flow Completion (Jan 30+)

> 🎯 **Strategy:** Complete the Individual path end-to-end before tackling Business/RBAC. The Business path is largely the same (Owner ≈ Individual), with Admin/Member having fewer pages.

#### Phase A: Validate Test Endpoint (Next Session)

| Task                                       | Status | Notes                              |
| ------------------------------------------ | ------ | ---------------------------------- |
| Call test endpoint with real email         | ⬜     | Verify real Keygen license created |
| Verify DynamoDB records created            | ⬜     | LICENSE# and USER# records         |
| Verify stream-processor logs LICENSE event | ⬜     | CloudWatch logs                    |
| Verify email-sender Lambda triggers        | ⬜     | CloudWatch logs                    |
| **Verify email arrives with license key**  | ⬜     | **Critical validation**            |
| Test license key in VS Code extension      | ⬜     | Activate and remove trial          |

#### Phase B: Admin Portal Wire-up

| Task                                    | Status | Notes                         |
| --------------------------------------- | ------ | ----------------------------- |
| Dashboard: Display subscription status  | ⬜     | From DynamoDB customer record |
| Dashboard: Display license key (masked) | ⬜     | From DynamoDB license record  |
| Billing: Show Stripe payment history    | ⬜     | Stripe API or portal link     |
| Billing: Update payment method          | ⬜     | Stripe Customer Portal        |
| Devices: List active machines           | ⬜     | From KeyGen API               |
| Devices: Deactivate device              | ⬜     | KeyGen machine delete         |

#### Phase C: Subscription Lifecycle Testing

| Task                                      | Status | Notes                            |
| ----------------------------------------- | ------ | -------------------------------- |
| Test subscription renewal (mock)          | ⬜     | Stripe test clock or webhook     |
| Test payment failure → grace period       | ⬜     | `invoice.payment_failed` webhook |
| Test grace period expiry → suspension     | ⬜     | scheduled-tasks Lambda           |
| Test payment method update → reactivation | ⬜     | Stripe Customer Portal           |
| Test subscription cancellation            | ⬜     | Cancel at period end             |
| Test resubscription after cancellation    | ⬜     | New checkout flow                |

#### Phase D: Email Pipeline Verification

| Task                          | Status | Notes                        |
| ----------------------------- | ------ | ---------------------------- |
| License delivery email        | ⬜     | LICENSE_CREATED event        |
| Payment received confirmation | ⬜     | CUSTOMER_CREATED event       |
| Payment failed notice         | ⬜     | PAYMENT_FAILED event         |
| Subscription renewal reminder | ⬜     | TRIAL_ENDING or scheduled    |
| Cancellation confirmation     | ⬜     | SUBSCRIPTION_CANCELLED event |

#### Phase E: VS Code Extension Finalization

| Task                           | Status | Notes                           |
| ------------------------------ | ------ | ------------------------------- |
| Activate License command       | ⬜     | Enter key, validate with Keygen |
| Trial nag banner removal       | ⬜     | After valid license activation  |
| Heartbeat loop                 | ✅     | Already implemented             |
| Concurrent session enforcement | ⬜     | Test with multiple machines     |
| VSIX marketplace publish       | ⬜     | After all validations pass      |

#### Phase F: Business/RBAC (After Individual Complete)

| Task                                      | Status | Notes                              |
| ----------------------------------------- | ------ | ---------------------------------- |
| Cognito Groups for roles                  | ⬜     | Owner, Admin, Member               |
| Owner account = Individual + Team page    | ⬜     | Nearly identical                   |
| Admin account = Owner - Billing           | ⬜     | Subset of pages                    |
| Member account = Dashboard + Devices only | ⬜     | Minimal pages                      |
| Team seat management                      | ⬜     | Already built in TeamManagement.js |
| Invite flow (already complete)            | ✅     | Working                            |

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

| Task                                         | Status | Notes                        |
| -------------------------------------------- | ------ | ---------------------------- |
| **Infrastructure**                           |        |                              |
| Deploy CloudFormation stacks                 | ✅     | Staging: Jan 27, 2026        |
| Verify DynamoDB table exists                 | ✅     | `hic-plg-staging` ACTIVE     |
| Add SES DNS records to GoDaddy               | ✅     | 4 records added              |
| Verify SES domain verified                   | ✅     | Domain + DKIM verified       |
| **Environment**                              |        |                              |
| All env vars set in Amplify                  | ✅     | 15 variables (secrets moved) |
| Secrets in Parameter Store / Secrets Manager | ✅     | 3 secrets in Secrets Manager |
| **DNS**                                      |        |                              |
| Amplify connected to staging.hic-ai.com      | 🟡     | DNS records added            |
| SSL certificate provisioned                  | 🟡     | ACM verification pending     |
| **Third-Party Services**                     |        |                              |
| Stripe webhooks pointing to production       | ⬜     | Update URL                   |
| KeyGen webhooks pointing to production       | ⬜     | Update URL                   |
| Cognito callback URLs include production       | ⬜     | Update URLs                  |
| **Testing**                                  |        |                              |
| Smoke test all critical paths                | ⬜     | Checkout, activate, portal   |
| Test on multiple browsers                    | ⬜     | Chrome, Firefox, Safari      |
| Test on mobile                               | ⬜     | Responsive                   |
| **Rollback Plan**                            |        |                              |
| Document rollback procedure                  | ⬜     | If launch fails              |
| Verify can disable signups if needed         | ⬜     | Emergency brake              |

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

````
┌─────────────────────────────────────────────────────────────────┐

---

## 🎯 Validation Plan (Jan 29, 2026)

**Context:** All 4 PLG Lambda functions deployed to staging. 696 tests pass locally. Need to validate E2E functionality in AWS.

### Phase 1: Lambda Smoke Tests ✅ COMPLETE (Jan 29)

| Lambda | Function | Test Method | Result |
| ------ | -------- | ----------- | ------ |
| `plg-stream-processor-staging` | DynamoDB stream event classification | `aws lambda invoke` with test event | ✅ Pass |
| `plg-email-sender-staging` | SES email delivery | `aws lambda invoke` with LICENSE_CREATED event | ✅ Pass |
| `plg-customer-update-staging` | Subscription event handling | `aws lambda invoke` with SQS event | ✅ Pass |
| `plg-scheduled-tasks-staging` | Trial reminder/win-back emails | `aws lambda invoke` with EventBridge event | ✅ Pass |

### Phase 2: Integration Validation (NEXT)

| Test | Steps | Status |
| ---- | ----- | ------ |
| **Checkout → DynamoDB** | 1. Complete Stripe test checkout, 2. Verify customer record created in DynamoDB | ⬜ TODO |
| **Webhook → SNS → SQS** | 1. Trigger Stripe webhook, 2. Verify message in CustomerUpdate queue | ⬜ TODO |
| **customer-update → DynamoDB** | 1. Process SQS message, 2. Verify subscription status updated | ⬜ TODO |
| **scheduled-tasks → SES** | 1. Trigger trial-reminder job, 2. Verify email sent via CloudWatch logs | ⬜ TODO |

### Phase 3: End-to-End Flow

| Flow | Test Steps | Status |
| ---- | ---------- | ------ |
| **New Customer Purchase** | 1. Sign up → 2. Checkout (Individual Monthly) → 3. Verify customer record → 4. Verify license created | ⬜ TODO |
| **Subscription Cancellation** | 1. Cancel via Stripe Portal → 2. Verify webhook → 3. Verify license status → 4. Verify cancellation email | ⬜ TODO |
| **Payment Failure** | 1. Use Stripe test card 4000000000009995 → 2. Verify failure count incremented → 3. Verify grace period email | ⬜ TODO |

### Validation Commands Reference

```bash
# Invoke Lambda directly
aws lambda invoke --function-name plg-customer-update-staging \
  --payload fileb://test-event.json response.json

# View CloudWatch logs
aws logs tail /aws/lambda/plg-customer-update-staging --follow

# Query DynamoDB customer record
aws dynamodb get-item --table-name hic-plg-staging \
  --key '{"PK": {"S": "USER#<user-id>"}, "SK": {"S": "PROFILE"}}'

# Check SQS queue depth
aws sqs get-queue-attributes --queue-url <queue-url> \
  --attribute-names ApproximateNumberOfMessages
````

│ LAUNCH │
└─────────────────────────────────────────────────────────────────┘
▲
│
┌─────────────────────────────────────────────────────────────────┐
│ 11. Deployment & Launch │
└─────────────────────────────────────────────────────────────────┘
▲
┌───────────────────┼───────────────────┐
│ │ │
┌─────────┴─────────┐ ┌───────┴───────┐ ┌────────┴────────┐
│ 10. Front-End │ │ 12. Support │ │ 9. E2E Testing │
│ Polish │ │ & Community │ │ │
└─────────┬─────────┘ └───────────────┘ └────────┬────────┘
│ │
└───────────────────┬───────────────────┘
│
┌───────────────────┼───────────────────┐
│ │ │
┌─────────┴─────────┐ ┌───────┴───────┐ ┌────────┴────────┐
│ 4. Admin Portal │ │ 8. VSIX │ │ 7. AWS Infra │
│ (Individuals + │ │ Packaging │ │ (Deploy only) │
│ Teams) │ │ │ │ │
└─────────┬─────────┘ └───────┬───────┘ └────────┬────────┘
│ │ │
│ │ ┌──────────┘
│ │ │
┌─────────┴─────────┐ ┌───────┴───────┐│
│ 3. Auth (Cognito) │ │ 5. Licensing ││
│ │ │ (KeyGen) ││
└───────────────────┘ └───────┬───────┘│
│ │
┌───────┴───────┐│
│ 6. Payments ││
│ (Stripe) ││
└───────────────┘│
│
┌────────────────┘
│
��� ┌──────────┴──────────┐
│ 7.3 CI/CD Pipeline │ ← DO THIS FIRST
│ (GitHub Actions) │
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
| Cognito Configuration | Simon | ✅ Done             |

### Week 1: Website Finalization (Parallel with Mouse)

**Track A: Website (~30h)**

| Day       | Focus            | Tasks                                              |
| --------- | ---------------- | -------------------------------------------------- |
| **Day 1** | Auth Wire-up    | GC: Create .env.local, wire portal to live session |
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
| Auth integration issues            | Medium      | Backend code is complete, just env vars needed |
| VSIX marketplace approval delay | Medium      | Submit early, have GitHub Packages as backup   |
| AWS deployment issues           | Low         | Templates exist and are tested                 |
| Stripe/KeyGen integration       | Low         | Already complete and configured                |

## Document History

| Version | Date         | Changes                                                                                                                                                                                                                                           |
| ------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **6.0.0** | Feb 1, 2026  | **v6 — CLEANUP & CURRENT STATE.** Removed Auth0→Cognito migration history (replaced Auth0 with Cognito references). Condensed Section 3 (Auth) from 256→43 lines. Updated status items. Added 23 comprehensive TODOs. All references now reflect Cognito as the auth provider. |
| **5.0.0** | Jan 30, 2026 | **v5 — PHASE-BASED RESTRUCTURE.** Added Phase 1 (Individual Validation) and Phase 2 (Business RBAC) sections. Standardized on "Owner" role (not "Billing Contact"). Added Pre-token Lambda trigger plan for role claims. Member experience: dashboard only with "Contact administrator" messaging. RBAC affects Portal only, not VS Code extension. Implementation order: Owner → Admin → Member. |
| **4.18** | Jan 30, 2026 | **Dashboard + Settings page JWT auth fixes.** Added `migrateCustomerUserId()` for webhook-created temp userId migration. Changed Settings APIs to use `idToken` with JWT verification. Cleaned all test data (Keygen, DynamoDB, Cognito). |
| **4.16** | Jan 29, 2026 | **LAMBDAS DEPLOYED.** All 4 PLG Lambda functions deployed to staging: `customer-update`, `scheduled-tasks`, `email-sender`, `stream-processor`. 696 tests passing (28 new Lambda unit tests). Full webhook integration for Stripe subscription lifecycle. Added SES facade helper (`dm/facade/helpers/ses.js`). Added validation plan for E2E testing. |
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
```


---

## 🚧 COMPREHENSIVE TODO LIST (SWR Notes — Feb 1, 2026)

> **Purpose:** Brain dump of all remaining work items. To be consolidated with existing roadmap sections in a future pass. Captured here for cognitive relief and completeness.

### TODO 1: Device Concurrent Limits Testing

**Priority:** High  
**Category:** E2E Testing

- [ ] Install Mouse in multiple containers to test concurrent device behavior
- [ ] Verify soft limits are enforced (warning at limit)
- [ ] Verify hard limits are enforced (block at limit+1)
- [ ] Test edge cases:
  - Activating same license on machine A, then machine B, then machine A again
  - Network disconnection during heartbeat
  - Offline mode behavior
  - Device deactivation and reactivation
  - Hitting limit then deactivating one device to make room

### TODO 2: Business RBAC Implementation

**Priority:** High  
**Category:** Portal Development

Build out complete portal experiences for all three roles:

| Role | Access | Test Cases |
|------|--------|------------|
| **Owner** | Full access (billing, team, settings, delete account) | Can see all sections, can delete account, can change roles |
| **Admin** | Same as Owner EXCEPT delete account, change Owner | Cannot see delete account button, cannot demote Owner |
| **Member** | Dashboard only (license status, their devices) | Gets 403 on /billing, /team; sees "Contact your administrator" messaging |

- [ ] Implement Cognito Groups (mouse-owner, mouse-admin, mouse-member)
- [ ] Create Pre-token Lambda trigger to inject `custom:role` claim
- [ ] Build role-based middleware (requireOwner, requireAdmin)
- [ ] Implement UI gating (hide nav items based on role)
- [ ] Test all user journeys for each role

### TODO 3: Email Flow Verification

**Priority:** Medium  
**Category:** E2E Testing

- [ ] Test auth code flow route with Yopmail temp accounts
- [ ] Verify Welcome email delivery to temp accounts
- [ ] Verify License Key email delivery
- [ ] Verify all transactional emails:
  - Welcome email
  - License key delivery
  - Payment confirmation
  - Subscription renewal
  - Payment failed (grace period)
  - Subscription cancelled
  - License suspended

### TODO 4: VSIX/npx Delivery Parity

**Priority:** High  
**Category:** Extension Development

Ensure identical UX regardless of installation method:

| Step | VSIX Route | npx Route | Parity Status |
|------|------------|-----------|---------------|
| Installation | VS Code Marketplace / sideload | `npx @get-hic/mouse init` | ⬜ Verify |
| Initialization | `Ctrl+Shift+P > Mouse: Initialize Workspace` | `hic mouse init` | ⬜ Verify |
| License Activation | `Mouse: Enter License Key` | `hic mouse license activate` | ⬜ Verify |
| Status Check | `Mouse: Show License Status` | `hic mouse license status` | ⬜ Verify |
| Deactivation | `Mouse: Deactivate Device` | `hic mouse license deactivate` | ⬜ Verify |

- [ ] Test complete flow via VSIX (Command Palette)
- [ ] Test complete flow via npx (Terminal)
- [ ] Document both flows in user documentation
- [ ] Ensure error messages and UX are consistent

### TODO 5: Documentation Site (docs.hic-ai.com)

**Priority:** High  
**Category:** Documentation

Current state: Home page documentation link returns 404.

**Proposal:** Create dedicated `docs.hic-ai.com` subdomain

- [ ] Set up documentation site infrastructure (consider Docusaurus, GitBook, or Mintlify)
- [ ] Rewrite documentation comprehensively
- [ ] Cover both delivery routes:
  - npx installation and usage
  - VSIX installation (VS Code Marketplace, sideload)
- [ ] Cover multiple editors:
  - VS Code
  - Cursor
  - Kiro
  - Visual Studio (investigate compatibility)
- [ ] Getting Started guide
- [ ] Troubleshooting guide
- [ ] API reference (if applicable)
- [ ] FAQ

### TODO 6: Launch Plan Document

**Priority:** Critical  
**Category:** Planning

Need comprehensive launch plan covering:

- [ ] Deployment checklist (staging → production)
- [ ] Stripe: Sandbox → Production mode switch
- [ ] SES: Sandbox → Production mode switch
- [ ] VS Code Marketplace: Publisher account, publish flow
- [ ] DNS and domain configuration verification
- [ ] Rollback procedures
- [ ] Launch day monitoring plan
- [ ] Communication plan (social media, announcements)
- [ ] Post-launch support readiness

### TODO 7: Support Infrastructure

**Priority:** Medium  
**Category:** Support

**Options to consider:**

| Channel | Pros | Cons |
|---------|------|------|
| Discord | Community building, real-time support | Requires moderation |
| GitHub Issues (hic-ai-inc.github.io) | Integrated with code, public visibility | May get spam |
| Email support | Professional, private | Labor-intensive |

- [ ] Decide on primary support channel
- [ ] Set up Discord server (if chosen)
- [ ] Configure GitHub Issues for hic-ai-inc.github.io repo
  - Issue templates for bug reports
  - Issue templates for feature requests
- [ ] Create comprehensive docs to reduce support volume
- [ ] Set up support email (support@hic-ai.com)

### TODO 8: CI/CD Pipeline Completion

**Priority:** High  
**Category:** DevOps

Per roadmap, complete remaining CI/CD work:

- [ ] Auto-update integration (blocked on B1-B4)
- [ ] Automated VSIX packaging and deployment
- [ ] Version bump automation
- [ ] Changelog generation
- [ ] Release notes automation
- [ ] Staging → Production promotion workflow

### TODO 9: IP Review

**Priority:** Medium  
**Category:** Legal/Documentation

- [ ] Review all documentation for proprietary design/implementation details
- [ ] Remove or generalize sensitive technical details
- [ ] Ensure public docs don't expose security-sensitive information
- [ ] Review code comments for proprietary information

### TODO 10: Corporate/Legal Filings

**Priority:** High (Time-Sensitive)  
**Category:** Legal

- [ ] **Section 83(b) Election** — File within 30 days of stock grant
- [ ] **Copyright Application** — Register Mouse software copyright
- [ ] **Provisional Patent Application** — File for any patentable inventions
- [ ] **Privacy Policy & Terms of Service** — Final review before deployment (drafts complete, links active)
- [ ] Consult with legal counsel on timing and requirements

### TODO 11: Payment Edge Cases

**Priority:** High  
**Category:** Payments

**Critical Edge Case: Business → Individual Downgrade**

| Scenario | Allowed? | Action |
|----------|----------|--------|
| Business (1 user, Owner only) → Individual | ✅ Yes | Allow downgrade |
| Business (multi-user) → Individual | ❌ No | Block with error message |

If multi-user Business tries to downgrade:
1. Display error: "Please cancel extra licenses first"
2. Force cancellation of additional seats
3. Once down to 1 user, allow downgrade to Individual

**Other Payment TODOs:**

- [ ] Implement downgrade blocking logic
- [ ] Stripe: Sandbox → Production conversion
- [ ] **Lemon Squeezy MoR Application** — Reapply ASAP once website is live
  - Previous rejection reason: "no website or social media presence"
  - Goal: Avoid tax withholding/remittance complexity
  - Interim plan: Handle taxes manually until LS approval

### TODO 12: Monitoring & Status Page (status.hic-ai.com)

**Priority:** Medium  
**Category:** Operations

Need health monitoring for:

| Service | Endpoint | Monitor Type |
|---------|----------|--------------|
| Website | https://hic-ai.com | Uptime, response time |
| Auth API | Cognito endpoints | Availability |
| Payments API | Stripe webhooks | Webhook delivery |
| Licensing API | Keygen endpoints | API health |
| Email | SES delivery | Delivery rate, bounces |

- [ ] Set up status page at `status.hic-ai.com`
- [ ] Consider services: Statuspage.io, UptimeRobot, Better Stack
- [ ] Configure alerts for downtime
- [ ] Create incident response procedures

### TODO 13: Analytics & CloudWatch Integration

**Priority:** Medium  
**Category:** Analytics

Current state: PLG metrics script exists but no CloudFormation/CloudWatch integration.

- [ ] Wire up CloudWatch logs to analytics
- [ ] Create CloudWatch dashboards for:
  - Lambda invocation metrics
  - Error rates
  - API latency
  - DynamoDB read/write capacity
- [ ] Set up CloudWatch alarms for anomalies
- [ ] Integrate with PLG metrics script
- [ ] Consider adding Plausible Analytics post-launch (deferred per roadmap)

### TODO 14: Security Audit

**Priority:** Critical  
**Category:** Security

**Phase 1: Code Review**
- [ ] Run Q Developer Code Review SAST
- [ ] Run additional SAST tools (Snyk, CodeQL)
- [ ] Manual review of authentication flows
- [ ] Manual review of authorization checks
- [ ] Review all API endpoints for proper auth

**Phase 2: Dependency Audit**

Unlike Mouse (zero external deps), this project has dependencies:
- AWS SDK
- Stripe SDK
- Keygen SDK
- Next.js ecosystem
- Various npm packages

- [ ] Run `npm audit` on all packages
- [ ] Review and minimize unnecessary dependencies
- [ ] Create dependency update policy
- [ ] Consider Dependabot or similar for automated updates

**Phase 3: CI/CD Security Integration**
- [ ] Add SAST scanning to CI/CD pipeline
- [ ] Add dependency vulnerability scanning
- [ ] Configure branch protection rules
- [ ] Set up secret scanning

### TODO 15: Front-End UX Polish

**Priority:** Medium  
**Category:** Design

- [ ] Fix alignment and spacing issues throughout portal
- [ ] Standardize Mouse logo usage:
  - ✅ Use SVG/PNG logo
  - ❌ Remove all Mouse emoji (🐭) from UI
  - ASCII art logo acceptable in terminal output
- [ ] Review responsive design on mobile/tablet
- [ ] Accessibility audit (WCAG compliance)
- [ ] Loading states and error states polish
- [ ] Consistent button styles and interactions

### TODO 16: Marketing Strategy

**Priority:** High (Post-Launch)  
**Category:** Marketing

**Goal:** Raise awareness of Mouse and drive traffic to hic-ai.com

**Idea: "Show HN" Post**

> **Title:** "I just built an entire PLG-driven sales pipeline by myself in 10 days using Claude Opus 4.5"
>
> **Angle:** Document the journey of building a complete PLG SaaS (Mouse) using AI assistance, which:
> 1. Drives traffic to hic-ai.com
> 2. Gets people talking about building with Claude
> 3. Introduces Mouse as a tool for AI-assisted development
> 4. Demonstrates the product (meta: we used AI to build an AI tool)

**Other Marketing Ideas:**

- [ ] Write detailed blog post about the build journey
- [ ] Create demo video showing Mouse in action
- [ ] Twitter/X thread about the build process
- [ ] Reddit posts in relevant subreddits (r/programming, r/vscode, r/artificial)
- [ ] Product Hunt launch
- [ ] Dev.to / Hashnode articles
- [ ] LinkedIn posts targeting enterprise developers
- [ ] Consider sponsoring AI/developer newsletters

### TODO 17: Disaster Recovery & Backups

**Priority:** High  
**Category:** Operations/Infrastructure

- [ ] Verify DynamoDB Point-in-Time Recovery (PITR) is enabled
- [ ] Document backup retention policy
- [ ] Create restore runbook with step-by-step instructions
- [ ] Test restore procedure from backup (at least once)
- [ ] Document RTO (Recovery Time Objective) and RPO (Recovery Point Objective)
- [ ] S3 bucket versioning for any stored assets
- [ ] Lambda function code backup strategy
- [ ] Secrets Manager backup considerations
- [ ] Create disaster recovery checklist

### TODO 18: Load/Stress Testing

**Priority:** Medium  
**Category:** Testing

Ensure system can handle traffic spikes:

- [ ] Define load testing scenarios:
  - 100 concurrent users hitting checkout
  - 1000 concurrent heartbeat requests
  - Burst traffic patterns
- [ ] Set up load testing tool (Artillery, k6, or Locust)
- [ ] Test Lambda cold start behavior under load
- [ ] Test DynamoDB read/write capacity under load
- [ ] Test Cognito auth endpoints under load
- [ ] Document performance baselines
- [ ] Identify and address bottlenecks
- [ ] Consider auto-scaling configurations

### TODO 19: Incident Response Plan

**Priority:** High  
**Category:** Operations

Currently: No paging system, single operator (SWR).

- [ ] Document incident severity levels (P1/P2/P3/P4)
- [ ] Create incident response runbook:
  - Site down procedures
  - Payment system failure procedures
  - Auth system failure procedures
  - Data breach procedures
- [ ] Set up alerting (CloudWatch Alarms → SNS → Email/SMS)
- [ ] Define on-call expectations (for now: SWR only)
- [ ] Create incident communication templates
- [ ] Document escalation paths (even if just "SWR handles everything")
- [ ] Post-incident review process

### TODO 20: Extension Version Compatibility

**Priority:** Medium  
**Category:** Testing

Test Mouse on latest versions of supported editors before deployment:

| Editor | Version to Test | Status |
|--------|-----------------|--------|
| VS Code | Latest stable | ⬜ |
| Cursor | Latest stable | ⬜ |
| Kiro | Latest stable | ⬜ |

- [ ] Test installation flow on each editor
- [ ] Test license activation on each editor
- [ ] Test MCP tool functionality on each editor
- [ ] Document any editor-specific quirks
- [ ] Update documentation with editor-specific instructions if needed

### TODO 21: Cross-Browser Testing

**Priority:** Medium  
**Category:** Testing

Test portal functionality across browsers:

| Browser | Status |
|---------|--------|
| Chrome (latest) | ⬜ |
| Firefox (latest) | ⬜ |
| Safari (latest) | ⬜ |
| Edge (latest) | ⬜ |

- [ ] Test complete purchase flow in each browser
- [ ] Test portal navigation and functionality
- [ ] Test responsive design on mobile browsers
- [ ] Document any browser-specific issues
- [ ] Fix critical cross-browser issues before launch

### TODO 22: Onboarding Flow Polish

**Priority:** Medium  
**Category:** UX

Goal: Super-simple, completely seamless first-time user experience.

- [ ] Review post-purchase flow messaging
- [ ] Add clearer "what to do next" guidance after checkout
- [ ] Add help access information at key touchpoints:
  - Where to get help (support@hic-ai.com, Discord, GitHub Issues)
  - Link to documentation
- [ ] Test complete onboarding flow as new user
- [ ] Simplify any confusing steps
- [ ] Add tooltips or inline help where needed
- [ ] Ensure error messages are helpful and actionable

### TODO 23: Refund Policy

**Priority:** Medium  
**Category:** Legal/Payments

Policy: **No refunds** (except credit card fraud cases).

- [ ] Document refund policy clearly on website
- [ ] Add refund policy link to checkout flow
- [ ] Add refund policy to Terms of Service (if not already)
- [ ] Create internal procedure for handling fraud cases
- [ ] Document Stripe refund process for fraud exceptions

---

## Summary: TODO Priority Matrix

| Priority | TODOs | Est. Hours |
|----------|-------|------------|
| **Critical** | 6 (Launch Plan), 10 (Legal), 14 (Security) | 20-30h |
| **High** | 1 (Devices), 2 (RBAC), 4 (Parity), 5 (Docs), 8 (CI/CD), 11 (Payments), 16 (Marketing), 17 (DR/Backups), 19 (Incident Response) | 80-100h |
| **Medium** | 3 (Emails), 7 (Support), 9 (IP), 12 (Monitoring), 13 (Analytics), 15 (UX), 18 (Load Testing), 20 (Editor Compat), 21 (Browsers), 22 (Onboarding), 23 (Refund) | 50-70h |

**Total Estimated Remaining Work:** 150-200 hours

> **Note:** This is a rough estimate. Some items may take longer, some may be parallelizable, and some may be deferred post-launch. Marketing (TODO 16) and Pricing Optimization are post-launch priorities.

---

