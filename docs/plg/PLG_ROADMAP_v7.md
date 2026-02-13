# PLG Roadmap v7 — Multi-Seat Implementation → Launch

**Document Version:** 7.0.0  
**Date:** February 12, 2026  
**Owner:** General Counsel  
**Status:** 🟡 PHASE 5 IN PROGRESS — Phases 0–2 complete, Subphase 3B complete (2026-02-12)

---

## ⚡ LAUNCH CONTRACT (Revised v7.0)

> **This section defines the critical path to launch and the sequence of work that must be completed.**

| Decision | Choice | Implication |
|----------|--------|-------------|
| **Launch Posture** | Individual + Business public launch | Full self-service for both tiers |
| **Business Plan UI** | Full checkout enabled | Business tier fully operational |
| **RBAC Status** | ✅ COMPLETE | Owner/Admin/Member roles, Team UI, shared license access |
| **Multi-Seat Device Mgmt** | 🔴 TIER 1 BLOCKER | Per-user device binding, browser-delegated activation, concurrent enforcement |
| **Distribution** | VSIX-only (Marketplace) | npm/npx deprecated; CLI commands ship via VSIX |
| **Update Mechanism** | 🔴 TIER 1 BLOCKER | Heartbeat-driven version notification + `Mouse: Update Version` command |
| **Downgrade Logic** | POST-LAUNCH | Simplifies Tier 1 payments work |

### What's Built (Phases 1-4 Complete)

✅ **Individual tier** — Full self-service: signup → checkout → license → portal → extension  
✅ **Business tier** — Full self-service: signup → checkout → license → team management → shared license for members  
✅ **RBAC Infrastructure** — Cognito Groups, Pre-token Lambda, Role-based UI  
✅ **Org Member License Access** — Members see shared org license key in Portal  
✅ **SES Production** — 50K messages/day, sandbox exited (Feb 11)  
✅ **Business portal bug fixes** — 6 issues found and resolved (Feb 8-9)

### Critical Path to Launch (Phases 5-8)

| Phase | Focus | Status | Est. |
|-------|-------|--------|------|
| **5** | Multi-Seat Device Management | 🟡 IN PROGRESS | 6-8.5 days |
| **6** | Version Updates & Distribution | 🔴 NOT STARTED | TBD |
| **7** | Security Audit & Launch Prep | 🔴 NOT STARTED | TBD |
| **8** | Launch | 🔴 BLOCKED on 5-7 | TBD |

### Why This Sequence

Multi-seat device management (Phase 5) must be complete before we can properly test and audit the system. Version update and distribution cleanup (Phase 6) ensures we can ship fixes to live users from day one. Security audit and launch planning (Phase 7) cannot begin until the feature set is frozen. Launch (Phase 8) follows only when everything is outlined, planned, and ready.

---

## Executive Summary

This document tracks the full PLG pipeline to ship Mouse with self-service capability for Individual and Business tiers. v7 supersedes v6 with updated phasing reflecting the multi-seat device management work, VSIX-only distribution, and version update requirements discovered since Feb 5.

**Current State:** Individual and Business flows **COMPLETE** through RBAC and team management. All portal APIs use DynamoDB as source of truth. Comprehensive test coverage across both repos. SES production approved (50K/day). Mouse v0.10.5 published. Multi-seat device management is the critical path.

### Sprint Phases

| Phase | Focus                              | Status          | Est. |
| ----- | ---------------------------------- | --------------- | ---- |
| **1** | Individual Validation              | ✅ **COMPLETE** | Done |
| **2** | Business RBAC (Owner/Admin/Member) | ✅ **COMPLETE** | Done |
| **3** | Device Management Wire-up          | ✅ **COMPLETE** | Done |
| **4** | VS Code Extension Finalization     | ✅ **COMPLETE** | Done |
| **5** | Multi-Seat Device Management       | 🟡 IN PROGRESS   | 6-8.5 days |
| **6** | Version Updates & Distribution     | 🔴 NOT STARTED  | TBD  |
| **7** | Security Audit & Launch Prep       | 🔴 NOT STARTED  | TBD  |
| **8** | Launch                             | 🔴 BLOCKED      | TBD  |

**North Star:** Ship Mouse with full multi-seat device management, reliable version updates, and cross-client compatibility before launch.

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
| Delete account                     | ✅ DONE | Cascade delete with org dissolution (Feb 2) |

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
**Status:** ✅ **INFRASTRUCTURE COMPLETE** (Feb 2, 2026)  
**Est. Hours:** 0h (complete)  
**Prerequisite:** Phase 1 complete (Individual flow working)

> **Scope:** RBAC affects Portal only. VS Code extension behavior is identical for all users.

### 2.0 Implementation Summary (Feb 2, 2026)

**What was built today:**

| Component | File/Resource | Purpose |
|-----------|---------------|---------|
| Cognito Groups | `plg-cognito.yaml` | mouse-owner, mouse-admin, mouse-member groups |
| Pre-token Lambda | `cognito-pre-token/index.js` | Injects `custom:role` + `custom:org_id` claims into JWT |
| cognito-admin.js | `src/lib/cognito-admin.js` | `assignOwnerRole()`, `assignInvitedRole()`, `getUserRole()` |
| hic-auth-layer | Lambda Layer v1.0.1 | Deployed to AWS for serverless functions |
| Role-based nav | `PortalSidebar.js` | Hides Billing/Team for members |
| Settings UI | `settings/page.js` | Members see "Leave Org", Owners see disabled delete |
| Leave Org API | `leave-organization/route.js` | Members can self-remove from org |
| **Tier Change** | ❌ REMOVED (Feb 2) | Cancel+repurchase model replaces API-based tier switching |
| **Seat Management API** | `api/portal/seats/route.js` | GET/POST seat quantity for Business tier |
| **Org Membership** | `getUserOrgMembership()` in dynamodb.js | Lookup user's organization for status/claims |
| **Account Type Update** | `updateCustomerAccountType()` in dynamodb.js | Update customer tier in DynamoDB |
| **Portal Status** | `api/portal/status/route.js` | Updated to support Business tier org members |

**Key protection implemented:**
- **Business → Individual downgrade**: Blocked if `seatsUsed > 1` (prevents orphaning team members)
- **org_id claim injection**: Pre-token Lambda looks up DynamoDB for org membership, injects into JWT

**What's complete (Feb 2):**
- ✅ Owner invite flow (Team API tested)
- ✅ Member acceptance + role assignment (invite accept route working)
- ✅ Leave organization flow (API implemented)
- ✅ Team UI displays correctly (seats, members, invites)
- ✅ Devices page uses DynamoDB heartbeat data — Fixed Feb 2 (removed Keygen fetch)
- ✅ Team API tokenPayload fix — Fixed all `user.sub`/`user.email`/`user.name` refs Feb 2
- ✅ Tier-switching API removed — Cancel+repurchase model Feb 2
- ✅ **DynamoDB-based auth** — All portal APIs now fetch accountType from DynamoDB, not JWT claims (Feb 2 evening)
- ✅ **Team page routing fix** — Page fetches from `/api/portal/status` instead of JWT claims (Feb 2)
- ✅ **Sidebar Team link fix** — PortalSidebar fetches accountType from API (Feb 2)
- ✅ **Owner seat counting fix** — `getOrgLicenseUsage()` counts owner from org details (Feb 2)
- ✅ **Stripe webhook fix** — Adds owner as org member on Business purchase (Feb 2)

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
| Create `mouse-owner` Cognito Group  | ✅ DONE | CloudFormation `plg-cognito.yaml` (Feb 2) |
| Create `mouse-admin` Cognito Group  | ✅ DONE | CloudFormation `plg-cognito.yaml` (Feb 2) |
| Create `mouse-member` Cognito Group | ✅ DONE | CloudFormation `plg-cognito.yaml` (Feb 2) |
| Assign group on license purchase    | ✅ DONE | Stripe webhook → `assignOwnerRole()` |
| Assign group on invite accept       | ✅ DONE | `assignInvitedRole()` in invite route |

#### 2.2.2 Pre-token Lambda Trigger

**Purpose:** Inject `custom:role` claim into ID token based on Cognito Group membership.

| Task                           | Status  | Notes                          |
| ------------------------------ | ------- | ------------------------------ |
| Create Lambda function         | ✅ DONE | `plg-cognito-pretoken-staging` (Feb 2) |
| Add PreTokenGeneration trigger | ✅ DONE | Cognito User Pool → Triggers   |
| Add CloudFormation template    | ✅ DONE | `plg-cognito.yaml` deployed    |
| Test role claim in ID token    | ⬜ TODO | E2E test pending (SES throttled) |

**Lambda Logic (updated Feb 2):**

```javascript
// Pre-token generation trigger - injects role + org_id claims
import { DynamoDBClient, DynamoDBDocumentClient, QueryCommand } from "hic-dynamodb-layer";

exports.handler = async (event) => {
  const userId = event.userName;
  const groups = event.request.groupConfiguration?.groupsToOverride || [];

  // Determine role from group membership (first match wins)
  let role = "individual";
  if (groups.includes("mouse-owner")) role = "owner";
  else if (groups.includes("mouse-admin")) role = "admin";
  else if (groups.includes("mouse-member")) role = "member";

  // For Business tier users, look up their org membership
  let orgId = null;
  if (role !== "individual") {
    const membership = await getUserOrgMembership(userId);
    if (membership) orgId = membership.orgId;
  }

  // Build claims - always include role, optionally include org_id
  const claims = { "custom:role": role };
  if (orgId) claims["custom:org_id"] = orgId;

  event.response.claimsOverrideDetails = {
    claimsToAddOrOverride: claims,
  };

  return event;
};
```

#### 2.2.3 Portal Middleware Role Checks

| Task                                          | Status  | Notes                                    |
| --------------------------------------------- | ------- | ---------------------------------------- |
| Extract role from ID token                    | ✅ DONE | `AUTH_NAMESPACE/org_role` in JWT claims |
| Create `requireOwner()` middleware            | ✅ DONE | API-level checks in route handlers |
| Create `requireAdmin()` middleware            | ✅ DONE | API-level checks in route handlers |
| Protect `/portal/billing`                     | ✅ DONE | PortalSidebar hides for members |
| Protect `/portal/team`                        | ✅ DONE | PortalSidebar hides for members |
| Protect `/api/portal/settings/delete-account` | ✅ DONE | API rejects non-owners + UI disabled |

#### 2.2.4 Role-Based UI Gating

| Task                               | Status  | Notes                          |
| ---------------------------------- | ------- | ------------------------------ |
| Add `useRole()` hook               | ✅ DONE | Uses `AUTH_NAMESPACE/org_role` from `useUser()` |
| Hide billing nav for Members       | ✅ DONE | `PortalSidebar.js` filters by role |
| Hide team nav for Members          | ✅ DONE | `PortalSidebar.js` filters by role |
| Hide delete account for non-Owners | ✅ DONE | `settings/page.js` shows "Leave Org" for members |
| Show "Contact admin" for Members   | ✅ DONE | Owner guidance in Settings Danger Zone |

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

#### 2.2.6 Organization & Tier Management APIs (NEW — Feb 2)

| Task                                              | Status  | Notes                                      |
| ------------------------------------------------- | ------- | ------------------------------------------ |
| ~~`POST /api/portal/change-tier`~~ — Tier switching   | ❌ REMOVED | Cancel+repurchase model instead         |
| Business→Individual downgrade protection          | ✅ DONE | Blocked if seatsUsed > 1                   |
| `GET /api/portal/seats` — Seat usage              | ✅ DONE | Returns seatLimit, seatsUsed, seatsAvailable |
| `POST /api/portal/seats` — Update quantity        | ✅ DONE | Stripe subscription update with proration  |
| `getUserOrgMembership()` — DynamoDB lookup        | ✅ DONE | Query GSI1 for USER#{userId}/ORG#          |
| `updateCustomerAccountType()` — Tier update       | ✅ DONE | Updates accountType in USER#/PROFILE       |
| Portal status API org member support              | ✅ DONE | Returns orgMembership context              |
| Pre-token Lambda org_id injection                 | ✅ DONE | Injects custom:org_id from DynamoDB lookup |

**Tier Switching Policy (Feb 2, 2026):**

> Cross-tier conversions (Individual ↔ Business) are not supported via API.
> Users who need to change tiers must cancel their current subscription and
> start fresh on the desired tier. This simplification eliminates complex
> edge cases around prorated billing, team member orphaning, Keygen policy
> migrations, and RBAC state transitions.

### 2.3 Implementation Order

1. **Owner experience first** — Full portal access, test all flows
2. **Admin experience second** — Nearly identical to Owner (just disable Owner/delete actions)
3. **Member experience last** — Minimal dashboard with gating

### 2.4 Testing Checklist

| Scenario                                        | Status |
| ----------------------------------------------- | ------ |
| **Role-Based Access**                           |        |
| Owner can access all portal sections            | ⬜     |
| Owner can delete account                        | ✅     |
| Owner can change member roles                   | ⬜     |
| Admin can access billing                        | ⬜     |
| Admin CANNOT delete account                     | ✅     |
| Admin CANNOT change Owner role                  | ⬜     |
| Member sees dashboard only                      | ⬜     |
| Member gets 403 on /billing                     | ⬜     |
| Member sees "Contact admin" messaging           | ⬜     |
| **~~Tier Change~~ (REMOVED — Feb 2)**           |        |
| ~~Tier switching via API~~                      | ❌ N/A | (Cancel+repurchase model)
| **Seat Management (NEW — Feb 2)**               |        |
| GET /api/portal/seats returns usage             | ⬜     |
| POST /api/portal/seats updates quantity         | ⬜     |
| Cannot reduce seats below seatsUsed             | ⬜     |
| **Org Membership (NEW — Feb 2)**                |        |
| Pre-token Lambda injects org_id claim           | ✅     |
| Portal status returns org membership context    | ✅     |
| getUserOrgMembership() returns active membership| ✅     |

---

## 🔧 PHASE 5: Multi-Seat Device Management (NEW in v7)

**Goal:** Implement per-user device tracking with browser-delegated activation (extension opens browser → website handles Cognito auth → extension polls for completion), per-seat concurrent device enforcement, and portal alignment for Business tier multi-user scenarios.  
**Status:** 🟡 IN PROGRESS — Phases 0–2 complete, Subphase 3B complete (2026-02-12); 3A, 3D, 3E, 3F remaining  
**Est. Time:** 6-8.5 days (revised down from 8.5-11.5 — browser-delegated activation eliminates ~450 LOC and 1 subphase)  
**Authoritative Document:** [20260212_MULTI_SEAT_IMPLEMENTATION_PLAN_V3.md](20260212_MULTI_SEAT_IMPLEMENTATION_PLAN_V3.md)  
**Reference Documents:** [Browser-Delegated Activation Proposal](20260212_GC_PROPOSAL_BROWSER_DELEGATED_ACTIVATION.md), [Subphase Plan V2](20260212_PROPOSED_SUBPHASE_PLAN_FOR_MULTI_USER_PHASE_3_V2.md), [Multi-Seat Tech Spec](20260210_GC_TECH_SPEC_MULTI_SEAT_DEVICE_MANAGEMENT.md)

### 5.0 Context

Keygen policy investigation (Feb 11) revealed three critical misconfigurations that must be corrected before implementation:
- Individual `maxMachines` = 2 (business decision is 3)
- `overageStrategy` = NO_OVERAGE on both policies (must be ALWAYS_ALLOW_OVERAGE)
- `heartbeatDuration` = 900s (must be extended to 3600s per D2 resolution)

All enforcement moves to DynamoDB's 2-hour sliding window. Keygen becomes a machine registry and heartbeat tracker only.

### 5.1 Phase Summary

| Sub-Phase | Focus | Environment | Status | Est. |
|-----------|-------|-------------|--------|------|
| **Phase 0** | Keygen Policy Configuration | Keygen API | ✅ COMPLETE | 0.5 day |
| **Phase 1** | Cognito Config + Auth Extraction | AWS + Website | ✅ COMPLETE | 1 day |
| **Phase 2** | DynamoDB Schema & Functions | Website | ✅ COMPLETE | 1 day |
| **Phase 3** | Browser-Delegated Activation + Enforcement + Portal UI | Both repos | 🟡 IN PROGRESS (3B ✅) | 2.5-4 days (5 subphases) |
| **Phase 4** | Hardening & Status Code Alignment | Website | ⬜ NOT STARTED | 1-2 days |

> **Phases 0, 1, 2 can be executed in parallel.** Phase 3 depends on all three. Phase 4 depends on Phase 3.
> **Phase 3 subphased:** See [Proposed Subphase Plan for Phase 3 V2](./20260212_PROPOSED_SUBPHASE_PLAN_FOR_MULTI_USER_PHASE_3_V2.md) for the 5 independently-deployable subphases (3A–3B, 3D–3F; 3C eliminated by browser-delegated model).


> **Deferred cleanup from Phases 0–2 (explicitly scheduled):**
> - **3B:** ~~`CONCURRENT_DEVICE_WINDOW_HOURS` fallbacks `|| 24` → `|| 2` in activate/heartbeat routes + test + function default (6 locations)~~ — ✅ DONE 2026-02-12 (commit `13deabd`)
> - **3E:** `addDeviceActivation()` userId/userEmail guard — throw if not provided (prevents silent unbound device records)
> - **Phase 4:** Remove vestigial `vscode://hic-ai.mouse/callback` from Cognito App Client (Phase 1 artifact, harmless but should be cleaned up)

### 5.2 Key Architecture Decisions (All Resolved)

| # | Decision | Resolution |
|---|----------|------------|
| D1 | Heartbeat strategy | DEACTIVATE_DEAD + NO_REVIVE retained; extension handles transparent re-activation |
| D2 | heartbeatDuration | Extended 900s → 3600s (1 hour) to reduce churn during laptop sleep |
| D3 | ~~OAuth callback client~~ | ~~Add `vscode://hic-ai.mouse/callback`~~ — **Eliminated** by browser-delegated activation (no OAuth in extension) |
| — | Concurrency model | 2-hour sliding window in DynamoDB (`CONCURRENT_DEVICE_WINDOW_HOURS` env var) |
| — | Overage strategy | ALWAYS_ALLOW_OVERAGE — Keygen `maxMachines` is decorative; DynamoDB enforces |

### 5.3 User Journeys (Definition of Done)

| ID | Journey | Description |
|----|---------|-------------|
| UJ-1 | Solo activation | Individual user authenticates + activates on one device |
| UJ-2 | Multi-device | Same user activates on second device, sees both in portal |
| UJ-3 | Device limit hit | User exceeds per-seat limit, gets meaningful error + upgrade nudge |
| UJ-4 | Sleep/wake recovery | Laptop sleeps 1 hour, Mouse works without intervention on wake |
| UJ-5 | Business team member | Team member authenticates with own Cognito identity, activates |
| UJ-6 | Business device scoping | Team member sees only their own devices in portal |
| UJ-7 | Seat limit enforcement | 3rd user on 2-seat license gets "contact admin" message |
| UJ-8 | Device deactivation | User deactivates from portal, frees slot for new device |
| UJ-9 | Heartbeat with identity | Server resolves userId from DDB device record on each heartbeat; per-user activity tracked without extension transmitting identity data (revised per [Auth Strategy Update](20260212_UPDATE_RE_AUTH_STRATEGY_AND_LOCAL_DATA.md), Decision 1) |
| UJ-10 | Offline grace | User offline 48 hours, Mouse works via cached validation |

### 5.4 Success Criteria

- [ ] All user journeys UJ-1 through UJ-10 pass E2E against staging
- [ ] All unit tests pass in both repos with >80% coverage on modified files
- [ ] Extension authenticates users via browser-delegated activation (opens browser → website handles Cognito auth → extension polls for completion)
- [ ] Per-seat device limits enforced via DynamoDB 2-hour sliding window
- [ ] Portal shows per-user device views for Business licenses
- [ ] Sleep/wake recovery works without user intervention
- [ ] Unauthenticated activation rejected with HTTP 401
- [ ] No hardcoded secrets; all credentials from SSM/SecretStorage

---

## 🔄 PHASE 6: Version Updates & Distribution (NEW in v7)

**Goal:** Ensure reliable version update delivery to users, complete VSIX-only distribution migration, and verify cross-client compatibility.  
**Status:** 🔴 NOT STARTED  
**Prerequisites:** Phase 5 complete

### 6.1 Version Update Mechanism (Tier 1)

The heartbeat API already returns `latestVersion`, `releaseNotesUrl`, `updateUrl`, and `readyVersion` fields. The client-side currently **ignores these fields** (per Feb 5 auto-update investigation). This must be wired up.

| Task | Status | Notes |
|------|--------|-------|
| Wire client-side heartbeat response parsing for version fields | ⬜ | Extension must read `latestVersion` from heartbeat |
| Daily version check against heartbeat response | ⬜ | At minimum once per day, compare local vs latest |
| `Mouse: Update Version` command | ⬜ | User-facing command to trigger update |
| Auto-update if user has enabled auto-updates | ⬜ | Leverage VS Code's extension auto-update mechanism |
| Version notification in status bar or notification | ⬜ | Non-intrusive "Update available" indicator |
| `readyVersion` → `latestVersion` promotion via scheduled job | ⬜ | EventBridge rule for daily promotion |

**What we do NOT need:** CI/CD integration, push-to-merge triggering publish, or automated release pipelines. What we need: dedicated build/publish scripts (mostly exist) and reliable client-side notification.

### 6.2 VSIX-Only Distribution (npm/npx Deprecated)

**Decision:** Mouse distribution consolidates to VS Code Marketplace (VSIX) only. npm/npx channel is deprecated.  
**Reference:** [Distribution Decision Matrix](../../packaging/DISTRIBUTION_DECISION_MATRIX.md), [NPM Deprecation Memo](../../plg/docs/20260210_GC_MEMO_NPM_DISTRIBUTION_DEPRECATION_AND_VSIX_ONLY_MIGRATION.md)

| Task | Status | Notes |
|------|--------|-------|
| Set `BUILD_NPM=false` in `scripts/build.sh` | ⬜ | Disable npm build path |
| Delete `packaging/dist/` artifacts | ⬜ | Remove stale npm distribution files |
| Update Release Runbook for VSIX-only workflow | ⬜ | Remove npm publish steps |
| Update licensing README | ⬜ | Remove dual-channel references |
| Verify VSIX build scripts work end-to-end | ⬜ | `scripts/build-vsix.sh` |

### 6.3 Cross-Client Compatibility

Mouse must work across all supported AI coding clients. With npx deprecated, the VSIX installation must provide all workspace initialization, license activation, and management capabilities.

| Client | Initialize Workspace | Status |
|--------|---------------------|--------|
| GitHub Copilot | `Ctrl+Shift+P > Mouse: Initialize Workspace > GitHub Copilot` | ⬜ Verify |
| Cursor | `Ctrl+Shift+P > Mouse: Initialize Workspace > Cursor` | ⬜ Verify |
| Kiro | `Ctrl+Shift+P > Mouse: Initialize Workspace > Kiro` | ⬜ Verify |
| Roo Code | `Ctrl+Shift+P > Mouse: Initialize Workspace > Roo Code` | ⬜ Verify |
| Cline | `Ctrl+Shift+P > Mouse: Initialize Workspace > Cline` | ⬜ Verify |
| Cursor Code CLI | Terminal-based initialization | ⬜ Verify |

### 6.4 CLI Commands via VSIX

Previously, CLI commands (`hic mouse init`, `hic mouse license activate`, etc.) were only available via the npx installation path. These must be accessible from the VSIX distribution for users who prefer terminal workflows.

| Task | Status | Notes |
|------|--------|-------|
| Ensure CLI commands ship with VSIX distribution | ⬜ | e.g., `hic mouse initialize-workspace github-copilot` |
| Verify command parity: Command Palette ↔ CLI | ⬜ | Same result regardless of invocation method |
| MCP config file generation works for all clients | ⬜ | Each dropdown choice produces a working config |
| E2E test each client's MCP config seamlessly | ⬜ | Installation → initialization → tool usage |

### 6.5 Build & Publish Scripts

| Task | Status | Notes |
|------|--------|-------|
| `scripts/build-vsix.sh` — Build VSIX package | ✅ | Exists and working |
| `scripts/release-mouse.sh` — Orchestrate release | ✅ | 6-step process documented |
| `scripts/update-ddb-version.js` — Update VERSION record | ✅ | DynamoDB version tracking |
| `scripts/dist-manifest.json` — Shipped file manifest | ✅ | Source of truth for what ships |
| VS Code Marketplace publish (`vsce publish`) | ⬜ | Publisher account needed |

---

## 🔒 PHASE 7: Security Audit & Launch Preparation (NEW in v7)

**Goal:** Comprehensive security audit of the frozen feature set, followed by launch plan preparation.  
**Status:** 🔴 BLOCKED on Phases 5-6  
**Prerequisites:** Feature set frozen (Phases 5-6 complete, E2E validated)

### 7.1 Security Audit

| Task | Status | Notes |
|------|--------|-------|
| Run Q Developer Code Review SAST | ⬜ | Automated scanning |
| Run additional SAST tools (Snyk, CodeQL) | ⬜ | Dependency + code analysis |
| Manual review: authentication flows | ⬜ | OAuth PKCE, JWT verification, token refresh |
| Manual review: authorization checks | ⬜ | Role-based access, per-user device scoping |
| Review all API endpoints for proper auth | ⬜ | Every route has JWT verification |
| `npm audit` on all packages | ⬜ | Both repos |
| Review OAuth PKCE implementation | ⬜ | New in Phase 5 — critical surface |
| Document findings with CWE/CVE references | ⬜ | Per HIC coding standards |

### 7.2 Security Hygiene (GPT-5.2 Recommendations)

| Task | Status | Notes |
|------|--------|-------|
| Enable 2FA on GitHub org (hic-ai-inc) | ⬜ | |
| Enable 2FA on Stripe dashboard | ⬜ | |
| Enable 2FA on AWS root + IAM admin | ⬜ | |
| Enable 2FA on Keygen dashboard | ⬜ | |
| Verify MFA on Cognito admin accounts | ⬜ | |
| Set up AWS Budget alerts ($50, $100, $250) | ⬜ | |
| Review Lambda concurrency limits | ⬜ | |

### 7.3 Launch Plan Document

| Task | Status | Notes |
|------|--------|-------|
| Deployment checklist (staging → production) | ⬜ | |
| Stripe: Sandbox → Production mode switch | ⬜ | |
| VS Code Marketplace: Publisher account + publish flow | ⬜ | |
| DNS and domain verification | ⬜ | |
| Rollback procedures | ⬜ | |
| Launch day monitoring plan | ⬜ | |
| Communication plan | ⬜ | |
| Post-launch support readiness | ⬜ | |

### 7.4 E2E Testing (Comprehensive)

| Task | Status | Notes |
|------|--------|-------|
| Fresh install → trial → purchase → activate → portal | ⬜ | Full user journey |
| Business: invite → accept → activate → team portal | ⬜ | Multi-user |
| Multi-device concurrent enforcement | ⬜ | Per-seat limits |
| Version update notification + install | ⬜ | Update mechanism |
| Cross-client MCP config validation | ⬜ | All supported clients |
| Cross-browser portal testing (Chrome, Firefox, Safari, Edge) | ⬜ | |
| Mobile responsive testing | ⬜ | Portal on mobile |

### 7.5 Pre-Launch Checklist

| Task | Status | Notes |
|------|--------|-------|
| Deploy CloudFormation stacks to production | ⬜ | `./deploy.sh prod` |
| Stripe webhooks → production URL | ⬜ | |
| KeyGen webhooks → production URL | ⬜ | |
| Cognito callback URLs include production | ⬜ | |
| All env vars set in production Amplify | ⬜ | |
| Custom domain (hic-ai.com) verified | ⬜ | |
| SSL certificate provisioned | ⬜ | |
| Smoke test all critical paths on production | ⬜ | |

---

## 🚀 PHASE 8: Launch (NEW in v7)

**Goal:** Go live with Mouse for Individual and Business self-service.  
**Status:** 🔴 BLOCKED on Phases 5-7  
**Prerequisites:** All previous phases complete, security audit passed, launch plan approved

### 8.1 Launch Day Checklist

| Task | Status | Notes |
|------|--------|-------|
| Switch Stripe to live mode | ⬜ | |
| Publish VSIX to VS Code Marketplace | ⬜ | |
| Deploy production infrastructure | ⬜ | |
| Monitor error logs (CloudWatch) | ⬜ | |
| Monitor Stripe dashboard | ⬜ | |
| Verify first real purchase flow | ⬜ | |

### 8.2 Post-Launch Immediate

| Task | Status | Notes |
|------|--------|-------|
| Monitor for 24h post-launch | ⬜ | |
| Respond to support tickets | ⬜ | |
| Marketing: HN post, Product Hunt | ⬜ | |
| Announce on social media | ⬜ | |

---

## Master Checklist — All Workstreams (v7 Updated)

| #   | Workstream                         | Status                      | Owner      | Blocks       |
| --- | ---------------------------------- | --------------------------- | ---------- | ------------ |
| 1   | Analytics                          | ✅ Script ready             | GC         | —            |
| 2   | Cookie/Privacy Compliance          | ✅ Documented               | GC         | —            |
| 3   | Auth (Cognito — Individual)        | ✅ **COMPLETE**             | GC + Simon | —            |
| 3b  | Amplify Gen 2 Migration            | ✅ **COMPLETE**             | GC + Simon | —            |
| 3c  | Business RBAC                      | ✅ **COMPLETE** (Feb 2)     | GC         | —            |
| 4   | Admin Portal (Individuals + Teams) | ✅ **COMPLETE**             | GC         | —            |
| 5   | Licensing (KeyGen.sh) — Server     | ✅ **COMPLETE**             | Simon      | —            |
| 5b  | Server-Side Heartbeat API          | ✅ **COMPLETE**             | GC         | —            |
| 5c  | Server-Side Trial Token API        | ✅ **COMPLETE**             | GC         | —            |
| 6   | Payments (Stripe)                  | ✅ **COMPLETE**             | Simon      | —            |
| 7   | AWS Infrastructure                 | ✅ **DEPLOYED TO STAGING**  | GC         | —            |
| 7b  | SES Production                     | ✅ **COMPLETE** (Feb 11)    | Simon      | —            |
| 8   | VS Code Extension (VSIX)           | ✅ **PHASE 4 COMPLETE**     | GC + Simon | —            |
| 8b  | **Multi-Seat Device Mgmt (Phase 5)** | 🟡 IN PROGRESS             | GC + Simon | **8**        |
| 8c  | **Version Updates & Distro (Phase 6)** | 🔴 NOT STARTED           | GC + Simon | **8b**       |
| 9   | E2E Testing                        | 🔴 BLOCKED on Phase 5-6    | GC         | **8b, 8c**   |
| 10  | Front-End Polish                   | ⚠️ Partial                  | GC         | —            |
| 11  | Security Audit & Launch Prep (Phase 7) | 🔴 BLOCKED on Phase 5-6 | GC + Simon | **8b, 8c, 9** |
| 12  | Launch (Phase 8)                   | 🔴 BLOCKED on Phase 7      | GC + Simon | **11**       |
| 13  | Support & Community                | ⬜ POST-LAUNCH              | Simon      | **12**       |

> **Latest Milestone (Feb 12, 2026):** Phase 5 Subphase 3B complete — backend accepts JWT, `/activate` page deployed, concurrent device window aligned, 37 new tests, E2E smoke tested. Browser-delegated activation model approved, eliminating ~450 LOC of security-critical code. SES production approved (50K/day, Feb 11). Phases 0–2 complete (Feb 11). Comprehensive test coverage across both repos.

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

**Status:** ✅ **COMPLETE (Individual + Business RBAC)**
**Est. Hours:** 0h remaining — pending final E2E verification
**Documentation:** [Migration Decision](../20260128_AUTH0_TO_COGNITO_MIGRATION_DECISION.md)

### 3.1 Current State

| Component | Status | Details |
|-----------|--------|---------|
| Cognito User Pool | ✅ | `mouse-staging-v2` (`us-east-1_CntYimcMm`) |
| Google OAuth | ✅ | Social login working |
| GitHub OAuth | ⏸️ DEFERRED | Requires OIDC proxy setup |
| Login/Signup/Logout | ✅ | All flows working on staging |
| Protected Routes | ✅ | Middleware validates tokens |
| Business RBAC | ✅ COMPLETE | Owner/Admin/Member roles — pending final E2E |

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

**Status:** ✅ Phases 1-5 COMPLETE (Cognito RBAC complete)  
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
| Cognito: Add user to org on accept                           | ✅     | Cognito config         |
| KeyGen: Create license on accept                           | ✅     | KeyGen config        |
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
| Update Cognito user metadata on role change                  | ✅     | Via cognito-admin.js |
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
| Test license creation flow                | ✅     | Stripe → KeyGen working              |
| Test activation/deactivation              | 🟡     | Portal → KeyGen — pending final E2E  |
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
| Custom domain setup                  | ✅     | staging.hic-ai.com live        |
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
| Branch protection rules               | ⬜     | **TIER 2** — Pre-launch (low effort, high value) |

---

## 8. VS Code Extension (VSIX) — ✅ PHASE 4 COMPLETE

**Status:** ✅ **PHASE 4 COMPLETE** — Mouse v0.10.5 published, licensing architecture refactored, VSIX-only distribution decided  
**Distribution:** VSIX only (VS Code Marketplace). npm/npx channel deprecated (Feb 10).  
**Current Version:** 0.10.5  
**Documentation:** [GC_STRATEGY_FOR_VS_CODE_EXTENSION_MIGRATION.md](../20260123_GC_STRATEGY_FOR_VS_CODE_EXTENSION_MIGRATION.md), [Licensing Architecture Refactor](https://github.com/SimonReiff/hic/blob/main/plg/docs/20260201_GC_TECH_SPEC_LICENSING_ARCHITECTURE_REFACTOR.md), [Distribution Decision Matrix](https://github.com/SimonReiff/hic/blob/main/packaging/DISTRIBUTION_DECISION_MATRIX.md), [NPM Deprecation Memo](https://github.com/SimonReiff/hic/blob/main/plg/docs/20260210_GC_MEMO_NPM_DISTRIBUTION_DEPRECATION_AND_VSIX_ONLY_MIGRATION.md)

### 8.1 Progress Update (Feb 11, 2026)

> ✅ **Server-Side Complete:** Heartbeat API, Trial Token API, Rate Limiting, Integration Tests. Comprehensive test coverage.
>
> ✅ **Client-Side Complete:**
>
> - **Licensing Architecture Refactor:** Consolidated into shared `/licensing/` core library. Single source of truth for state management, validation, heartbeat, and CLI commands.
> - **Unified Version Management:** `mouse/VERSION` as canonical source. `mouse-version.js` syncs across `package.json` files.
> - **Release Pipeline:** `scripts/release-mouse.sh` orchestrates build → VSIX → deploy → DynamoDB → git.
> - **Heartbeat Manager:** Background heartbeat with validation and state persistence.
> - **CLI Commands:** `mouse license status|activate|deactivate|info` subcommands.
> - **VSIX ESM Build:** Fixed imports to use source `/licensing/` directory.
>
> ✅ **E2E Validated:** Mouse v0.10.5 installed, activated with real Keygen license, device registration working, heartbeat successful.
>
> 🔴 **Remaining (Phase 5-6):**
>
> - Multi-seat device management (Phase 5) — OAuth PKCE, per-seat enforcement
> - Version update wire-up (Phase 6) — client-side heartbeat response parsing
> - Cross-client compatibility verification (Phase 6)
> - VS Code Marketplace publish (Phase 8)
>
> ⚠️ **Distribution Change (Feb 10):** npm/npx channel deprecated. VSIX is the sole distribution channel. CLI commands must ship via VSIX for terminal-based workflows.

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

### 8.1.2 Release Pipeline (Feb 11)

| Component                   | Purpose                                           | Status |
| --------------------------- | ------------------------------------------------- | ------ |
| `scripts/release-mouse.sh`  | Orchestrate build → VSIX → deploy → DynamoDB → git | ✅     |
| `VERSION#mouse` in DynamoDB | Latest version record for heartbeat responses     | ✅     |
| Staging deploy              | `staging.hic-ai.com` verified                     | ✅     |
| Production deploy           | `api.hic-ai.com` — pending Phase 8 launch         | ⬜     |

### 8.1.3 Version Update Model (Feb 11)

**Model:** Heartbeat notification + manual command (not CI/CD auto-publish).

The heartbeat response includes `latestVersion` and `updateUrl`. When a newer version is available, the client displays a notification. The user executes the `Mouse: Update Version` VS Code command to download and install the update. This avoids complex auto-update infrastructure while providing a reliable update path.

| Component                                    | Status              |
| -------------------------------------------- | ------------------- |
| Server: `VERSION#mouse` record in DynamoDB   | ✅ Done             |
| Server: Heartbeat returns version metadata   | ✅ Done (staging)   |
| Client: Parse heartbeat version response     | ⬜ Phase 6          |
| Client: `Mouse: Update Version` command      | ⬜ Phase 6          |
| Client: Notification when update available   | ⬜ Phase 6          |
| Production deploy (`api.hic-ai.com`)         | ⬜ Phase 8          |

### 8.2 Work Breakdown (Phases 1-5 ✅ Complete)

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
| Test concurrent session enforcement     | ⬜     | Deferred to Phase 5 (multi-seat)    |

#### Phase 5: Nag Banner System (8-12h) ✅ COMPLETE

| Task                                       | Status | Notes                          |
| ------------------------------------------ | ------ | ------------------------------ |
| Implement deterministic metadata frequency | ✅     | Seeded RNG (mulberry32)        |
| Trial Days 1-7: ~20% of calls              | ✅     | EARLY_TRIAL_PROBABILITY = 0.20 |
| Trial Days 8-12: ~50% of calls             | ✅     | MID_TRIAL_PROBABILITY = 0.50   |
| Trial Days 13-14: ~80% + Last 24h: 100%    | ✅     | FINAL/LAST_DAY_PROBABILITY     |
| Suspended mode (payment failed)            | ✅     | GRACE_PROBABILITY = 1.0        |
| Expired mode: Block all tools              | ✅     | checkToolAccess() blocks       |

#### Phase 6: VSIX Packaging ✅ COMPLETE

| Task                                        | Status | Notes                            |
| ------------------------------------------- | ------ | -------------------------------- |
| Install vsce: `npm install -g @vscode/vsce` | ✅     | Installed                        |
| Build VSIX: `vsce package`                  | ✅     | mouse-0.10.5.vsix                |
| Test sideload: Install from VSIX            | ✅     | Verified working                 |
| Release script: `release-mouse.sh`          | ✅     | Build → VSIX → deploy → DynamoDB |
| VS Code Publisher account (`hic-ai`)        | ⬜     | Phase 8 — marketplace publish    |

#### Phase 7: E2E Testing — see Roadmap Phases 5-8

Remaining E2E testing is subsumed by the multi-seat implementation (Phase 5), version update wire-up (Phase 6), and security audit (Phase 7). See Phases 5-8 above.

### 8.3 Key Design Documents

| Document                                                                                                                                     | Purpose                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| [GC_STRATEGY_FOR_VS_CODE_EXTENSION_MIGRATION.md](../20260123_GC_STRATEGY_FOR_VS_CODE_EXTENSION_MIGRATION.md)                                | Extension architecture, manifest, bundling       |
| [MOUSE_LICENSING_TRIAL_IMPLEMENTATION_PLAN.md](../20260124_MOUSE_LICENSING_TRIAL_IMPLEMENTATION_PLAN.md)                                     | Trial flow, nag UX, license states               |
| [AGENT_SALESPERSON_ENFORCEMENT_MODEL.md](./20260126_AGENT_SALESPERSON_ENFORCEMENT_MODEL.md)                                                  | `_meta.license` injection strategy               |
| [MULTI_SEAT_IMPLEMENTATION_PLAN_V2.md](./20260211_MULTI_SEAT_IMPLEMENTATION_PLAN_V2.md)                                                      | Multi-seat device management (5 phases, 8.5-11.5 days) |
| [Distribution Decision Matrix](https://github.com/SimonReiff/hic/blob/main/packaging/DISTRIBUTION_DECISION_MATRIX.md)                       | VSIX-only distribution rationale                 |
| [NPM Deprecation Memo](https://github.com/SimonReiff/hic/blob/main/plg/docs/20260210_GC_MEMO_NPM_DISTRIBUTION_DEPRECATION_AND_VSIX_ONLY_MIGRATION.md) | npm/npx channel sunset                          |

---

## 9. Back-End E2E Testing & API Wiring

**Status:** ✅ **PHASE 4 COMPLETE** — All portal APIs wired, Team Management working, Device heartbeat working  
**Remaining:** Multi-seat enforcement testing deferred to Phase 5  
**Prerequisites:** Cognito v2 ✅, DynamoDB ✅, Secrets Manager ✅

### 9.0 DynamoDB + API Foundation ✅ COMPLETE (Jan 28)

> ✅ Secure API foundation complete. Signed-in users can access and modify their own protected resources.

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

#### 9.0.5 Phase 5: Portal Data Display ✅ COMPLETE

| Task                                | Status | Notes                   |
| ----------------------------------- | ------ | ----------------------- |
| Dashboard: Show subscription status | ✅     | From DynamoDB record    |
| Dashboard: Show license status      | ✅     | From DynamoDB/Keygen    |
| License page: Display license key   | ✅     | Copy button + reveal    |
| Billing page: Show payment history  | ✅     | Stripe Portal link      |
| Devices page: List active machines  | ✅     | From DynamoDB (Feb 2)   |

### 9.1 Test Scenarios

| Scenario                                          | Status | Coverage               |
| ------------------------------------------------- | ------ | ---------------------- |
| **Purchase Flows**                                |        |                        |
| Individual: Checkout → Payment → License created  | ✅     | UI + Lambda handlers   |
| Team: Checkout → Payment → Org + Licenses created | ✅     | UI + Lambda handlers   |
| **Activation Flows**                              |        |                        |
| Activate license with valid key                   | 🟡     | Pending final E2E      |
| Activate with expired/revoked key                 | 🟡     | Pending final E2E      |
| Concurrent session enforcement                    | ⬜     | Heartbeat timeout      |
| **Portal Flows**                                  |        |                        |
| Login → View dashboard                            | ✅     | Cognito + Portal       |
| Update profile (name fields)                      | ✅     | Settings API wired     |
| View/copy license key                             | ✅     | License page working   |
| Deactivate device                                 | ✅     | Devices page working   |
| Update payment method                             | ✅     | Stripe Portal link     |
| **Team Admin Flows (Feb 2)**                      |        |                        |
| Invite member → Accept → Login                    | ✅     | Full invite flow       |
| Revoke member → License deactivated               | ✅     | TeamManagement.js      |
| Change role (member → admin)                      | ✅     | TeamManagement.js      |
| View seat usage (seats used/available)            | ✅     | Team UI working (Feb 2)|
| Resend expired invites                            | ✅     | Team API working       |
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
| Update feature list (current capabilities) | ✅     | Match v0.10.5       |
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

**Status:** 🟡 **STAGING DEPLOYED** (Jan 27, 2026). Production launch gated by Phases 5-8.  
**SES:** ✅ Production approved (50K/day, sandbox exited Feb 11)  
**Prerequisites:** Phases 5-7 complete → Phase 8 launch

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
| Amplify connected to staging.hic-ai.com      | ✅     | Live with allowlist          |
| SSL certificate provisioned                  | ✅     | ACM verified                 |
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
| Set up support@hic-ai.com                                                       | ✅     | SES receiving configured      |
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

## Document History

| Version   | Date         | Changes                                                                                                                                                                                                     |
| --------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **7.0.0** | Feb 11, 2026 | **v7 — COMPLETE REWRITE.** 8-phase launch structure (Phases 1-4 complete, 5-8 new). Multi-seat device management (Phase 5). VSIX-only distribution (npm/npx deprecated). Version update mechanism (Phase 6). SES production approved (50K/day). 83(b) election filed. Keygen misconfigurations identified. Stale content removed. Mouse v0.10.5. 2-hour concurrent sliding window. OAuth PKCE for device activation. |
| **6.8.2** | Feb 5, 2026  | **Daily-gated extension update payload.** Heartbeat contract removes `minVersion`, always returns version payload. Comprehensive test coverage. |
| **6.0.0** | Feb 1, 2026  | **v6 — CLEANUP.** Removed Auth0 migration history. Condensed Section 3. Added 23 TODOs. Cognito as sole auth provider. |
| **5.0.0** | Jan 30, 2026 | **v5 — PHASE-BASED RESTRUCTURE.** Phase 1 (Individual) + Phase 2 (Business RBAC). Owner/Admin/Member roles. |
| **4.0**   | Jan 26, 2026 | **v4 — Accurate Assessment.** Website ~90% complete, Mouse 80-100h new development. |
| **3.0**   | Jan 26, 2026 | Complete rewrite consolidating all workstreams. |
| **1.0**   | Jan 21, 2026 | Initial roadmap. |

---

## Key Reference Documents

| Document                                                                                                                                     | Purpose                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| [MULTI_SEAT_IMPLEMENTATION_PLAN_V2.md](./20260211_MULTI_SEAT_IMPLEMENTATION_PLAN_V2.md)                                                      | **Phase 5** — Multi-seat device management (5 phases, 8.5-11.5 days) |
| [Distribution Decision Matrix](https://github.com/SimonReiff/hic/blob/main/packaging/DISTRIBUTION_DECISION_MATRIX.md)                       | VSIX-only distribution rationale                               |
| [NPM Deprecation Memo](https://github.com/SimonReiff/hic/blob/main/plg/docs/20260210_GC_MEMO_NPM_DISTRIBUTION_DEPRECATION_AND_VSIX_ONLY_MIGRATION.md) | npm/npx channel sunset                                        |
| [Keygen Investigation Report](https://github.com/SimonReiff/hic/blob/main/plg/docs/20260211_GC_KEYGEN_INVESTIGATION_AND_MULTI_SEAT_ANALYSIS.md) | Keygen misconfiguration analysis + multi-seat planning        |
| [20260126_PRICING_v4.2_FINAL_FEATURE_MATRIX.md](./20260126_PRICING_v4.2_FINAL_FEATURE_MATRIX.md)                                            | Pricing model: Individual $15/mo (3 machines), Business $35/seat (5 machines) |
| [20260126_AGENT_SALESPERSON_ENFORCEMENT_MODEL.md](./20260126_AGENT_SALESPERSON_ENFORCEMENT_MODEL.md)                                         | Soft enforcement via Agent-facing banners in tool responses    |
| [GC_STRATEGY_FOR_VS_CODE_EXTENSION_MIGRATION.md](../20260123_GC_STRATEGY_FOR_VS_CODE_EXTENSION_MIGRATION.md)                                | Extension architecture, manifest, bundling                     |
| [Licensing Architecture Refactor](https://github.com/SimonReiff/hic/blob/main/plg/docs/20260201_GC_TECH_SPEC_LICENSING_ARCHITECTURE_REFACTOR.md) | Shared `/licensing/` library consolidation                   |
```

---

## 🚧 COMPREHENSIVE TODO LIST (v7 — Feb 11, 2026)

> **Purpose:** All remaining work items organized by priority tier. Updated for v7 phase structure. New TODOs added for multi-seat, version updates, and Keygen corrections.

### TODO 1: Device Concurrent Limits Testing

**Priority:** 🔴 TIER 1 — Deployment Blocker (Phase 5)  
**Category:** Multi-Seat Device Management  
**Est. Hours:** Subsumed by Phase 5 implementation (8.5-11.5 days total)

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

**Priority:** ✅ **COMPLETE** (Feb 2-3, 2026)  
**Category:** Portal Development  
**Est. Hours:** 0h (done)  
**Rationale:** Built ahead of schedule. Team UI E2E verified (invites, seats, roles working).

Build out complete portal experiences for all three roles:

| Role | Access | Test Cases |
|------|--------|------------|
| **Owner** | Full access (billing, team, settings, delete account) | ✅ Can see all sections, 🟡 E2E verify |
| **Admin** | Same as Owner EXCEPT delete account, change Owner | ✅ UI built, ⬜ E2E verify |
| **Member** | Dashboard only (license status, their devices) | ✅ Gets hidden nav, sees "Leave Org" not "Delete Account" |

- [x] Implement Cognito Groups (mouse-owner, mouse-admin, mouse-member) — CloudFormation deployed
- [x] Create Pre-token Lambda trigger to inject `custom:role` claim — `plg-cognito-pretoken-staging`
- [x] Build role-based middleware (requireOwner, requireAdmin) — API-level checks in routes
- [x] Implement UI gating (hide nav items based on role) — PortalSidebar + Settings page
- [x] Add Leave Organization API for members — `/api/portal/settings/leave-organization`
- [x] Add cognito-admin.js helpers — `assignOwnerRole()`, `assignInvitedRole()`, etc.
- [x] Fix USER_POOL_ID runtime reading — `getUserPoolId()` function
- [x] Fix SES test mocking — Uses hic-ses-layer alias now
- [x] Test all user journeys for each role — Team UI E2E verified Feb 2

### TODO 3: Email Flow Verification

**Priority:** 🟡 PRE-LAUNCH — Medium Risk  
**Category:** E2E Testing  
**Est. Hours:** 4h  
**Rationale:** Transactional emails should be verified before launch. Tentatively confirmed pending E2E.

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

### TODO 5: Documentation Site (docs.hic-ai.com)

**Priority:** 🔴 TIER 2 — Critical Quality (Pre-Launch)  
**Category:** Documentation  
**Est. Hours:** 8h (MVP Getting Started + Troubleshooting)

Current state: Home page documentation link returns 404. **Must fix before launch.**

**Proposal:** Create dedicated `docs.hic-ai.com` subdomain

- [ ] Set up documentation site infrastructure (consider Docusaurus, GitBook, or Mintlify)
- [ ] Rewrite documentation comprehensively
- [ ] Cover VSIX installation (VS Code Marketplace, sideload)
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

**Priority:** 🔴 TIER 1 — Deployment Blocker  
**Category:** Planning  
**Est. Hours:** 6h (expanded per GPT-5.2 review)

Need comprehensive launch plan covering:

**Deployment Checklist:**
- [ ] Deployment checklist (staging → production)
- [ ] Stripe: Sandbox → Production mode switch
- [x] SES: Sandbox → Production mode switch — ✅ Approved Feb 11 (50K/day)
- [ ] VS Code Marketplace: Publisher account, publish flow
- [ ] DNS and domain configuration verification
- [ ] Rollback procedures
- [ ] Launch day monitoring plan
- [ ] Communication plan (social media, announcements)
- [ ] Post-launch support readiness

**Security Hygiene — TIER 2 (GPT-5.2 recommendation):**
> "Boring but catastrophic if skipped"
- [ ] Enable 2FA on GitHub org (hic-ai-inc)
- [ ] Enable 2FA on Stripe dashboard
- [x] Enable 2FA on AWS root + IAM admin accounts
- [ ] Enable 2FA on Keygen dashboard
- [x] Verify MFA on Cognito admin accounts

**Billing Safeguards — TIER 2 (GPT-5.2 recommendation):**
- [ ] Set up AWS Budget alerts ($50, $100, $250 thresholds)
- [ ] Configure CloudWatch billing alarms
- [ ] Review Lambda provisioned concurrency limits

**Email Deliverability — TIER 2 (GPT-5.2 recommendation):**
- [ ] DMARC record configured (in addition to DKIM/SPF)
- [ ] Test sends to Gmail (verify not spam)
- [ ] Test sends to Outlook (verify not spam)
- [ ] Set up bounce/complaint monitoring in SES
- [x] Review SES sending limits for production — ✅ 50K/day approved

**Support Minimum — TIER 2 (GPT-5.2 recommendation):**
- [ ] support@hic-ai.com exists and routes to SWR
- [ ] Autoresponder: "We received your message, expect response within 24h"
- [ ] Basic triage rule: "billing" vs "bug" → different response templates

### TODO 7: Support Infrastructure

**Priority:** 🟢 POST-LAUNCH — Low Risk  
**Category:** Support  
**Est. Hours:** 4h  
**Rationale:** GitHub Issues exists. Discord/email can come later based on demand.

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

**Priority:** 🟡 POST-LAUNCH — Medium Risk  
**Category:** DevOps  
**Est. Hours:** 8h  
**Rationale:** `release-mouse.sh` works. Automation is efficiency, not blocking.

Per roadmap, complete remaining CI/CD work:

- [x] Release script (`release-mouse.sh`) — ✅ Done
- [ ] Version bump automation (GitHub Actions)
- [ ] Changelog generation
- [ ] Release notes automation
- [ ] Staging → Production promotion workflow

### TODO 9: IP Review

**Priority:** 🟠 PRE-LAUNCH — Blocker  
**Category:** Legal/Documentation  
**Est. Hours:** 4h  
**Rationale:** SWR is an attorney and will handle this himself. Must complete before launch.

- [ ] Review all documentation for proprietary design/implementation details
- [ ] Remove or generalize sensitive technical details
- [ ] Ensure public docs don't expose security-sensitive information
- [ ] Review code comments for proprietary information

### TODO 10: Corporate/Legal Filings

**Priority:** 🔴 TIER 1 — Deployment Blocker  
**Category:** Legal  
**Est. Hours:** 2h (reduced — 83(b) done)  
**WARNING:** Privacy/ToS must be live before payments.

- [x] **Section 83(b) Election** — ✅ Filed Feb 10, 2026
- [ ] **Copyright Application** — Register Mouse software copyright
- [ ] **Provisional Patent Application** — File for any patentable inventions
- [ ] **Privacy Policy & Terms of Service** — Final review before deployment (drafts complete, links active)

### TODO 11: Payment Edge Cases

**Priority:** 🔴 TIER 1 — Deployment Blocker  
**Category:** Payments  
**Est. Hours:** 4h (reduced scope per Launch Contract)

**Tier 1 Scope (Individual-only launch):**

- [ ] Stripe: Sandbox → Production conversion
- [ ] Webhook verification (checkout.session.completed, invoice.paid)
- [ ] Test Individual upgrade/cancel flows
- [ ] Verify proration handling

**Other Payment TODOs (unchanged):**
- [ ] **Lemon Squeezy MoR Application** — Reapply ASAP once website is live
  - Previous rejection reason: "no website or social media presence"
  - Goal: Avoid tax withholding/remittance complexity
  - Interim plan: Handle taxes manually until LS approval

### TODO 12: Monitoring & Status Page (status.hic-ai.com)

**Priority:** 🟢 POST-LAUNCH — Low Risk  
**Category:** Operations  
**Est. Hours:** 4h  
**Rationale:** Nice-to-have for trust. Can monitor manually at first.

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

**Priority:** 🟢 POST-LAUNCH — Low Risk  
**Category:** Analytics  
**Est. Hours:** 6h  
**Rationale:** Can add after launch; not revenue-impacting.

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

**Priority:** 🔴 TIER 1 — Deployment Blocker (Phase 1) / 🟡 POST-LAUNCH (Phases 2-3)  
**Category:** Security  
**Est. Hours:** 8h (Phase 1) + 8h (Phases 2-3)

**Phase 1: Code Review** ← TIER 1: Do before launch
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

- [x] Run `npm audit` on all packages
- [x] Review and minimize unnecessary dependencies
- [ ] Create dependency update policy
- [ ] Consider Dependabot or similar for automated updates

**Phase 3: CI/CD Security Integration**
- [ ] Add SAST scanning to CI/CD pipeline
- [ ] Add dependency vulnerability scanning
- [ ] Configure branch protection rules **(TIER 2 — do pre-launch)**
- [ ] Set up secret scanning

### TODO 15: Front-End UX Polish

**Priority:** 🟢 POST-LAUNCH — Low Risk  
**Category:** Design  
**Est. Hours:** 8h  
**Rationale:** Works > Pretty. Iterate post-launch based on feedback.

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

**Priority:** 🟢 POST-LAUNCH — Low Risk  
**Category:** Marketing  
**Est. Hours:** 8h  
**Rationale:** Launch first, then market. HN post can come anytime.

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

**Priority:** 🔴 TIER 2 — Critical Quality (Pre-Launch)  
**Category:** Operations/Infrastructure  
**Est. Hours:** 2h (verification only)  
**Note:** Only verify PITR is enabled and document restore; full DR plan can come post-launch.

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

**Priority:** 🟡 POST-LAUNCH — Medium Risk  
**Category:** Testing  
**Est. Hours:** 8h  
**Rationale:** Low traffic expected at launch. Scale issues are good problems.

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

### TODO 19: Incident Response Plan + Minimum Monitoring

**Priority:** 🔴 TIER 2 — Critical Quality (Pre-Launch)  
**Category:** Operations  
**Est. Hours:** 6h (merged: incident response + basic monitoring per GPT-5.2 review)

**Rationale:** You don't need a public status page on day 1, but you DO need basic uptime + webhook failure visibility because Stripe/Keygen are core revenue plumbing.

Currently: No paging system, single operator (SWR).

**Tier 2 Minimum (Pre-Launch):**

- [x] CloudWatch Alarms → SNS → Email for:
  - ✅ Lambda errors (checkout, webhooks, portal APIs) — `plg-high-error-rate-staging`
  - ✅ Stripe webhook failures (DLQ depth) — `plg-customer-dlq-depth-staging`
  - ✅ Email delivery failures (DLQ depth) — `plg-email-dlq-depth-staging`
  - ✅ Payment failures — `plg-payment-failures-staging`
  - ✅ Email failures — `plg-email-failures-staging`
- [x] SNS email subscription confirmed — `alerts@hic-ai.com` → `sreiff@hic-ai.com`
- [ ] Document severity levels (P1/P2/P3/P4)
- [ ] Create minimal runbook (site down, payment failure, auth failure)
- [x] Webhook failure containment: DLQ alerting operational (Feb 2)

**POST-LAUNCH (Full Incident Response):**

- [ ] Create full incident response runbook:
  - Data breach procedures
  - Escalation paths
  - Communication templates
- [ ] Define on-call expectations (for now: SWR only)
- [ ] Post-incident review process
- [ ] Public status page (status.hic-ai.com)

### TODO 20: Extension Version Compatibility

**Priority:** 🟡 POST-LAUNCH — Medium Risk  
**Category:** Testing  
**Est. Hours:** 4h  
**Rationale:** VS Code works. Cursor/Kiro testing can follow based on user feedback.

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

**Priority:** 🟡 POST-LAUNCH — Medium Risk  
**Category:** Testing  
**Est. Hours:** 4h  
**Rationale:** Chrome works. Others can be fixed reactively based on bug reports.

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

**Priority:** 🟢 POST-LAUNCH — Low Risk  
**Category:** UX  
**Est. Hours:** 4h  
**Rationale:** Functional > polished at MVP. Iterate on user feedback.

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

**Priority:** 🟡 POST-LAUNCH — Medium Risk  
**Category:** Legal/Payments  
**Est. Hours:** 2h  
**Rationale:** Add to ToS, handle case-by-case initially.

Policy: **No refunds** (except credit card fraud cases).

- [ ] Document refund policy clearly on website
- [ ] Add refund policy link to checkout flow
- [ ] Add refund policy to Terms of Service (if not already)
- [ ] Create internal procedure for handling fraud cases
- [ ] Document Stripe refund process for fraud exceptions

### TODO 24: Multi-Seat Device Management Implementation (NEW — v7)

**Priority:** 🔴 TIER 1 — Deployment Blocker (Phase 5)  
**Category:** Licensing / Multi-Seat  
**Est. Hours:** 6-8.5 days (per Multi-Seat Implementation Plan V3 — revised down from 8.5-11.5 via browser-delegated activation)  
**Reference:** [MULTI_SEAT_IMPLEMENTATION_PLAN_V3.md](./20260212_MULTI_SEAT_IMPLEMENTATION_PLAN_V3.md)

Complete multi-seat device management per the 5-phase plan:

- [x] **Phase 0:** Keygen policy corrections (maxMachines=3, ALWAYS_ALLOW_OVERAGE, heartbeatDuration=3600s) — ✅ Done 2026-02-11
- [x] **Phase 1:** Cognito auth extract + shared verifyAuthToken across 14 routes — ✅ Done 2026-02-11
- [x] **Phase 2:** DynamoDB device schema + 2-hour concurrent sliding window — ✅ Done 2026-02-11
- [ ] **Phase 3:** Browser-delegated activation, server-side enforcement, portal UI — 2.5-4 days (5 subphases, see [subphase plan V2](./20260212_PROPOSED_SUBPHASE_PLAN_FOR_MULTI_USER_PHASE_3_V2.md))
- [ ] **Phase 4:** Hardening, edge cases, monitoring — 1-2 days

### TODO 25: Version Update Wire-up (NEW — v7)

**Priority:** 🔴 TIER 1 — Deployment Blocker (Phase 6)  
**Category:** Extension / Distribution  
**Est. Hours:** 2-3 days

Implement the heartbeat notification + manual command update model:

- [ ] Client-side: Parse `latestVersion` from heartbeat response
- [ ] Client-side: `Mouse: Update Version` VS Code command to download VSIX
- [ ] Client-side: Notification when newer version available
- [ ] Cross-client compatibility testing (VS Code, Cursor, Kiro)
- [ ] VSIX-only distribution verification (CLI commands via VSIX terminal)

### TODO 26: Keygen Policy Corrections (NEW — v7)

**Priority:** 🔴 TIER 1 — Deployment Blocker (Phase 5, Phase 0)  
**Category:** Licensing Configuration  
**Est. Hours:** 0.5 day  
**Reference:** [Keygen Investigation Report](https://github.com/SimonReiff/hic/blob/main/plg/docs/20260211_GC_KEYGEN_INVESTIGATION_AND_MULTI_SEAT_ANALYSIS.md)

Three misconfigurations identified:

| Setting | Current | Required | Policy |
|---------|---------|----------|--------|
| Individual `maxMachines` | 2 | 3 | `91f1947e-0730-48f9-b19a-eb8016ae2f84` |
| Individual `overageStrategy` | NO_OVERAGE | ALWAYS_ALLOW_OVERAGE | Same |
| Both `heartbeatDuration` | 900s (15 min) | 3600s (1 hour) | Both policies |

- [ ] Update Individual policy via Keygen API
- [ ] Update Business policy heartbeatDuration
- [ ] Verify changes in staging

---

## Summary: Priority System (v7)

### Priority Legend

| Tier | Meaning | Action |
|------|---------|--------|
| 🔴 **TIER 1** | Deployment Blocker | MUST complete before production launch |
| 🔴 **TIER 2** | Critical Quality | SHOULD complete before launch; high risk if skipped |
| 🟡 **POST-LAUNCH Medium** | Track Closely | Do soon after launch |
| 🟢 **POST-LAUNCH Low** | Can Wait | Iterate based on user feedback |

---

### 🔴 TIER 1 — Deployment Blockers (Phases 5-8)

| # | TODO | Phase | Notes |
|---|------|-------|-------|
| 24 | Multi-Seat Device Management | Phase 5 | 8.5-11.5 days. Implementation Plan V2 is authoritative. |
| 25 | Version Update Wire-up | Phase 6 | Heartbeat notification + `Mouse: Update Version` command |
| 26 | Keygen Policy Corrections | Phase 5 (Phase 0) | 3 misconfigurations. 0.5 day. Execute first. |
| 6 | Launch Plan Document | Phase 7/8 | 2FA, billing alerts, email deliverability |
| 10 | Corporate/Legal Filings | Phase 7 | 83(b) ✅ done. Privacy/ToS remain. |
| 11 | Payment Edge Cases | Phase 7 | Stripe sandbox→prod |
| 14 | Security Audit (Phase 1) | Phase 7 | SAST + auth review |

---

### 🔴 TIER 2 — Critical Quality

| # | TODO | Category | Notes |
|---|------|----------|-------|
| 5 | Documentation Site (MVP) | Documentation | 404 on docs = bounce |
| 17 | DR/Backups (verify) | Operations | Confirm PITR enabled |
| 19 | Incident Response + Monitoring | Operations | DLQ alarms ✅ done; runbook remains |

---

### 🟡 POST-LAUNCH — Medium Risk

| # | TODO | Category | Notes |
|---|------|----------|-------|
| 8 | CI/CD Pipeline Completion | DevOps | release-mouse.sh works |
| 9 | IP Review | Legal | Should do eventually |
| 14 | Security Audit (Phases 2-3) | Security | Dependency audit |
| 18 | Load/Stress Testing | Testing | Low traffic expected |
| 20 | Extension Version Compat | Testing | VS Code works; test others later |
| 21 | Cross-Browser Testing | Testing | Chrome works |
| 23 | Refund Policy | Legal | Handle case-by-case initially |

---

### 🟢 POST-LAUNCH — Low Risk

| # | TODO | Category | Notes |
|---|------|----------|-------|
| 2 | ~~Business RBAC~~ | Portal | ✅ DONE (Feb 2-3) |
| 3 | Email Flow Verification | Testing | Users have portal access |
| 7 | Support Infrastructure | Support | GitHub Issues exists |
| 12 | Status Page | Operations | Monitor manually |
| 13 | Analytics/CloudWatch | Analytics | Not revenue-impacting |
| 15 | Front-End UX Polish | Design | Works > Pretty |
| 16 | Marketing Strategy | Marketing | Launch first |
| 22 | Onboarding Flow Polish | UX | Functional > polished |

---

### Execution Order (v7)

**Phase 5 → Phase 6 → Phase 7 → Phase 8.** See Phases 5-8 sections above for detailed breakdown.

1. **TODO 26** — Keygen policy corrections (Phase 0, 0.5 day)
2. **TODO 24** — Multi-seat implementation (Phases 1-4, 8-11 days)
3. **TODO 25** — Version update wire-up (Phase 6, 2-3 days)
4. **TODO 14** — Security audit Phase 1 (Phase 7)
5. **TODO 6** — Launch plan document (Phase 7)
6. **TODO 10** — Legal filings (Phase 7)
7. **TODO 11** — Stripe sandbox→prod (Phase 8)
8. 🚀 **LAUNCH** (Phase 8)

> **Key Change from v6:** The critical path is no longer "Individual-only launch with Business deferred." Multi-seat device management is now Tier 1 (Phase 5) and must complete before launch. The Implementation Plan V2 is the authoritative source for Phase 5 execution.

---
