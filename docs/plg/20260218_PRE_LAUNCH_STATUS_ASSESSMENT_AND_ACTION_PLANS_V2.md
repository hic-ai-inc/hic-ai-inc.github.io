# Pre-Launch Status Assessment & Action Plans v2

**Date:** February 18, 2026 (v2; supersedes February 16 v1)
**Author:** General Counsel
**Purpose:** Slim orchestration document indexing all pre-launch action plans, tracking status, and recording settled decisions. Delegates execution detail to standalone AP documents. For sequencing and scheduling, see the companion Dependency Map.
**Methodology:** Builds on v1 (Feb 16) assessment of 66 commits across 3 repos, incorporating all decisions from the Feb 17 Decision & Gap Analysis session, the Dependency Map Gap Analysis, and the standalone AP documents produced Feb 16–17.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [The Delta: Work Accomplished Feb 12–16](#2-the-delta-work-accomplished-feb-1216)
3. [Updated Phase Status](#3-updated-phase-status)
4. [Updated TODO Status](#4-updated-todo-status)
5. [Settled Decisions](#5-settled-decisions)
6. [Items Requiring Further Investigation](#6-items-requiring-further-investigation)
7. [Action Plan Registry](#7-action-plan-registry)
8. [Action Plan Detail: Inline Plans](#8-action-plan-detail-inline-plans)
9. [Bottom Line](#9-bottom-line)

---

## 1. Executive Summary

The project is in significantly stronger shape than the PLG Roadmap v7.0 (dated Feb 12) reflects. Phase 5 (Multi-Seat Device Management) Phase 3 — the largest and most complex body of work — is **fully complete** across all subphases (3A–3F). Security work that v7.0 listed as "blocked on Phases 5–6" is **substantially underway**: secrets audit complete (4 findings remediated), structured logging rolled out across all 33 handlers in 24 route files, safe JSON parsing hardened, IAM tightened in CloudFormation. The extension has advanced from v0.10.5 to v0.10.10 with CJS build output for Cursor/Kiro compatibility and multi-client Initialize Workspace support.

**Test health (Feb 16):** 3,459 tests passing / 0 failing across mouse (1,605), mouse-vscode (198), licensing (177), plg-website (1,479).

**True remaining blockers for launch:**

1. **MoR application (LS + Paddle)** — Must be submitted ASAP; review takes ~1 week. Without an MoR, SWR bears global tax compliance obligations on every sale in every jurisdiction. Dual-submission hedges against rejection. (See AP 8.)
2. **Version update wire-up** (Phase 6 — client-side heartbeat version parsing + `Mouse: Update Version` command)
3. **`/api/health` endpoint** + monitoring metric filters/alarms for Amplify SSR log group
4. **Security audit formalization** (SAST scan + auth flow manual review)
5. **Payment migration** (LS/Paddle if approved; Stripe live-mode as emergency fallback)
6. **Production Amplify environment** creation + phased deployment (P0–P9 per AP 4)
7. **Legal review** of Privacy Policy and Terms of Service (must reflect Plausible analytics; must include IP review)
8. **Provisional patent filing** — public launch starts the 1-year clock under US patent law

**Key strategic decisions (settled Feb 17):**

- Production uses same Amplify app, new branch (D-1)
- New Google OAuth client for production — clean isolation (D-2)
- SES custom sender (`noreply@hic-ai.com`) for production Cognito, not `COGNITO_DEFAULT` (D-3)
- B-D1 through B-D8 deferred until after MoR applications submitted (D-4)
- MoR applications submitted to LS _and_ Paddle in parallel, not LS alone
- SWR's own paid subscription = the P8 live payment verification (dogfooding from Day 1)
- Social media consolidated into AP 12; private disclosures remain distinct as AP 13

**Estimated total effort to launch:** ~45–65 hours of focused work, of which ~25–35 hours are on the critical path. The sole remaining feature gap is the version update wire-up (AP 9, items 9.8–9.10). All other work is operational, quality assurance, or legal.

---

## 2. The Delta: Work Accomplished Feb 12–16

_Unchanged from v1 — historical record. This section documents specific commits and achievements. See v1 for full detail._

### Summary

| Repo                     | Commits | Key Accomplishments                                                                                                                                                                                                             |
| ------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **hic**                  | 9       | Phase 3A (browser-delegated activation), Phase 3D (machine recovery + heartbeat-first startup), v0.10.6–v0.10.10 (CJS build, multi-client Initialize Workspace)                                                                 |
| **hic-ai-inc.github.io** | 52      | Phase 3B/3E/3F (authenticated activation, per-seat enforcement, portal device views), secrets audit (4 findings remediated), structured logging (33 handlers, 24 files), safe JSON parsing, IAM hardening, environment gate fix |
| **hic-e2e-clean**        | 5       | E2E testing of Mouse v0.10.6–v0.10.10                                                                                                                                                                                           |

### Documentation Produced (Feb 12–16)

- Code quality review for commit 78de6e8
- Auth Strategy Update (Decisions 1 & 2)
- Device lifecycle model correction
- Heartbeat status alignment memo (4-phase remediation plan)
- Secrets hygiene audit report (4 findings, all remediated)
- Structured logging integration report (33 handlers, 24 files)
- Pre-launch monitoring & observability recommendations
- Safety utilities audit report

---

## 3. Updated Phase Status

| Phase | Focus                          | Actual Status (Feb 18)                                                                                                                                                                                                                                                         |
| ----- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1** | Individual Validation          | ✅ COMPLETE                                                                                                                                                                                                                                                                    |
| **2** | Business RBAC                  | ✅ COMPLETE                                                                                                                                                                                                                                                                    |
| **3** | Device Management Wire-up      | ✅ COMPLETE                                                                                                                                                                                                                                                                    |
| **4** | VS Code Extension              | ✅ COMPLETE                                                                                                                                                                                                                                                                    |
| **5** | Multi-Seat Device Mgmt         | **🟢 Phase 3 COMPLETE** (all 6 subphases 3A–3F). Phase 4 hardening scoped for fix-or-defer at AP 9 time.                                                                                                                                                                       |
| **6** | Version Updates & Distribution | **🟡 PARTIALLY DONE** — CJS build, multi-client init verified. Investigation (Feb 16) confirmed heartbeat `onSuccess` version parsing, `mouse.checkForUpdates`, and `StatusBarManager.showUpdateAvailable()` are already implemented. Scope reassessment needed per B-D1–B-D3. |
| **7** | Security Audit & Launch Prep   | **🟡 SUBSTANTIALLY UNDERWAY** — Secrets audit ✅, structured logging ✅, safe JSON parsing ✅, IAM hardened ✅. SAST scan, formal auth review, and monitoring setup remain.                                                                                                    |
| **8** | Launch                         | Blocked on remaining Phase 6–7 items + MoR approval + production deployment                                                                                                                                                                                                    |

---

## 4. Updated TODO Status

| #   | TODO                             | Status (Feb 18)            | Notes                                                                                                                                |
| --- | -------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Device Concurrent Limits Testing | ✅ DONE                    | Phase 3E per-seat enforcement implemented & E2E tested                                                                               |
| 2   | Business RBAC                    | ✅ DONE                    | —                                                                                                                                    |
| 3   | Email Flow Verification          | Open                       | AP 7 — needs E2E verification of all transactional emails                                                                            |
| 5   | Documentation Site               | **Partial**                | `/docs` page exists with dynamic slug routing. ~5 articles have content; ~15 slugs 404. See AP 5.                                    |
| 6   | Launch Plan Document             | **Superseded**             | AP 4 standalone doc (P0–P9 phased plan) replaces the original flat checklist                                                         |
| 7   | Support Infrastructure           | Open                       | AP 6 — Discord, GitHub Issues, email routing                                                                                         |
| 8   | CI/CD Pipeline                   | ✅ Exists                  | `release-mouse.sh` working, GitHub Actions active                                                                                    |
| 9   | IP Review                        | Open                       | AP 11, items 11.5–11.7 — SWR handles personally                                                                                      |
| 10  | Corporate/Legal                  | **Partial**                | 83(b) ✅. Privacy/ToS pages exist, need final review. Patent filing needed pre-launch.                                               |
| 11  | Payment Edge Cases               | Open                       | AP 8 — MoR application + payment integration                                                                                         |
| 12  | Monitoring & Status Page         | **Partial**                | Alarms exist (DLQ, errors, payment, email). Structured logging ✅. Health endpoint, metric filters, launch dashboard remain (AP 10). |
| 13  | Analytics & CloudWatch           | Open                       | Plausible wire-up is Track A Step A1                                                                                                 |
| 14  | Security Audit                   | **Substantially advanced** | Secrets ✅, logging ✅, safe JSON ✅, IAM ✅. SAST + auth review remain (AP 2b).                                                     |
| 15  | Front-End UX Polish              | Open                       | AP 1 — comprehensive audit complete, prioritized execution plan ready                                                                |
| 16  | Marketing Strategy               | Open                       | AP 3 — post-launch OK, prep during LS wait                                                                                           |
| 17  | DR & Backups                     | Open                       | AP 10, items 10.7–10.8                                                                                                               |
| 18  | Load/Stress Testing              | Open                       | Post-launch backlog                                                                                                                  |
| 19  | Incident Response + Monitoring   | **Partial**                | DLQ alarms ✅, SNS ✅. Health endpoint, metric filters, severity defs, runbook remain (AP 10).                                       |
| 20  | Extension Version Compat         | **Significant progress**   | VS Code, Cursor, Kiro confirmed. Roo Code and Cline need testing (AP 9).                                                             |
| 21  | Cross-Browser Testing            | Open                       | Post-launch backlog                                                                                                                  |
| 22  | Onboarding Flow Polish           | Open                       | Post-launch backlog                                                                                                                  |
| 23  | Refund Policy                    | **Partial**                | Exists on `/faq`; needs ToS cross-reference (AP 11)                                                                                  |
| 24  | Multi-Seat Implementation        | **Phase 3 ✅ COMPLETE**    | Phase 4 hardening: fix-or-defer at AP 9 time                                                                                         |
| 25  | Version Update Wire-up           | **Investigation needed**   | Feb 16 found much already implemented. B-D1–B-D3 (deferred) will determine remaining scope.                                          |
| 26  | Keygen Policy Corrections        | **Needs verification**     | AP 0, item 0.1 — confirm in Keygen dashboard                                                                                         |

---

## 5. Settled Decisions

Decisions resolved during the Feb 17 session. These are settled for all downstream planning.

| ID       | Decision                       | Chosen Option                                                   | Impact                                                                                                |
| -------- | ------------------------------ | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **D-1**  | Amplify production environment | Same existing app (`d2yhz9h4xdd5rb`), new branch (e.g., `main`) | AP 4 P4 — no new app, shared build settings, env var separation via existing scripts                  |
| **D-2**  | Google OAuth for production    | New dedicated OAuth client (not reuse staging)                  | AP 4 P1 — clean isolation, new client in Google Cloud Console                                         |
| **D-3**  | Cognito email sending          | SES custom sender (`noreply@hic-ai.com`), not `COGNITO_DEFAULT` | AP 4 P1 — `setup-cognito.sh` must be invoked with SES config                                          |
| **D-4**  | B-D1–B-D8 (Track B decisions)  | Deferred until after MoR applications submitted                 | Track A takes absolute priority; Track B resumes during MoR review wait                               |
| **D-5**  | Social media planning          | Unified Social Media AP (new AP 12) consolidating all accounts  | Replaces scattered AP 8.3/12/13 social media elements; AP 13 remains separate for private disclosures |
| **OI-4** | P8 live payment test           | SWR's own paid subscription = the live verification             | No refund needed; dogfooding from Day 1; HIC AI Inc Mercury account; ~$1–2 net monthly cost           |

### Resolved External Blockers

| Blocker                                            | Resolution                                                                                                                                                                                                        |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SES production access for new environment**      | **Not a blocker.** SES production mode is account-wide, not stack-specific. New environment inherits 50K/day sending. New sending identities need DNS verification, but `hic-ai.com` records already in place.    |
| **Stripe test-to-live switch**                     | **Instant** once business profile is complete (SWR already completed). Swap API keys, recreate products/prices/webhooks in live mode. First payout has 7–14 day hold, but payments accepted immediately.          |
| **Staging preservation during production cutover** | **Additive deployment.** Staging remains permanently intact. Production is created alongside it. No staging resources modified or torn down. Staging reverts to allowlist-only access after production goes live. |

### Deferred Decisions (B-D1 through B-D8)

Per D-4, these are explicitly deferred until after the MoR applications are submitted. They gate Track B work, which resumes during the MoR review wait window.

| Decision | Topic                                                          | Affects                              |
| -------- | -------------------------------------------------------------- | ------------------------------------ |
| B-D1     | `/api/version` endpoint: create or remove `checkForUpdates()`? | AP 9 scope                           |
| B-D2     | "Update Now" UX: browser redirect acceptable for v1?           | AP 9 scope                           |
| B-D3     | EventBridge `readyVersion` gating: deploy or launch without?   | AP 9 scope                           |
| B-D4     | SAST tool choice                                               | AP 2b scope                          |
| B-D5     | `package.json` field standardization                           | AP 2b scope                          |
| B-D6     | Security findings memo format/location                         | AP 2b scope                          |
| B-D7     | Log retention: 14 or 30 days?                                  | AP 10 scope                          |
| B-D8     | Production API base URL                                        | AP 4 scope (see also AP 0, item 0.4) |

> **Note on B-D1–B-D3:** Feb 16 investigation revealed that heartbeat `onSuccess` version parsing, `mouse.checkForUpdates`, `mouse.showUpdateInfo`, and `StatusBarManager.showUpdateAvailable()` are all already implemented. The scope of AP 9.8–9.10 will likely shrink significantly when B-D1–B-D3 are resolved.

---

## 6. Items Requiring Further Investigation

Updated from v1 — several items now resolved or absorbed into AP 0.

| Item                                | Status             | Resolution / Next Step                                                              |
| ----------------------------------- | ------------------ | ----------------------------------------------------------------------------------- |
| Keygen policy corrections (TODO 26) | **AP 0, item 0.1** | 15-min dashboard check                                                              |
| `support@hic-ai.com` email routing  | Open               | AP 6, item 6.1 — send test email and verify receipt                                 |
| Heartbeat status alignment          | Open               | Scoped for fix-or-defer during AP 9 (version wire-up); see heartbeat alignment memo |
| Phase 4 hardening scope             | Open               | Decision at AP 9 time: which Phase 4 items are launch-required vs. post-launch      |
| Production Amplify environment      | **D-1 resolved**   | Same app, new branch. Full plan in AP 4.                                            |
| VS Code Marketplace publish flow    | **AP 0, item 0.2** | `vsce login hic-ai` verification                                                    |
| Docs content quality                | Open               | AP 5 — comprehensive strategy with tiered approach                                  |
| Open Graph image                    | Open               | AP 1, item 1.8 — verify image URL resolves                                          |
| Discord server                      | Open               | AP 6, item 6.3 — create server, update placeholder link                             |
| Production `API_BASE_URL` mechanism | **AP 0, item 0.4** | 30-min investigation                                                                |
| SES production access               | **RESOLVED**       | Account-wide; not a blocker                                                         |
| Stripe test-to-live timeline        | **RESOLVED**       | Instant once business profile complete                                              |
| Staging preservation                | **RESOLVED**       | Additive deployment; staging permanently intact                                     |

---

## 7. Action Plan Registry

Each action plan is a self-contained point-A-to-point-B plan with steps in internal dependency order. Action plans do not prescribe scheduling — the Dependency Map handles interleaving and sequencing across plans.

| AP     | Title                               | Priority                                | Est. Effort          | Detail Location                                                                               | Status                                      |
| ------ | ----------------------------------- | --------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **0**  | Quick Wins & Initial Setup          | High — opening gate                     | ~3–3.5h              | [Standalone](20260217_AP0_QUICK_WINS_AND_INITIAL_SETUP.md)                                    | Not started                                 |
| **1**  | Front-End UX & Content              | High-value, not hard gate               | 5–6h (Tier 1–2)      | [Standalone](20260216_AP1_FRONT_END_UX_PRIORITIZATION_PLAN.md)                                | Not started                                 |
| **2a** | Website Surface Security Review     | Pre-MoR                                 | 2–3h                 | [Inline §8.1](#81-ap-2a-website-surface-security-review)                                      | Not started                                 |
| **2b** | Comprehensive Security Audit        | **Launch blocker**                      | 4–5h                 | [Inline §8.2](#82-ap-2b-comprehensive-security-audit)                                         | Not started                                 |
| **3**  | Marketing Plan                      | Post-launch OK                          | 8–12h                | Absorbed into AP 12 Phases 3–4; [Inline §8.3](#83-ap-3-marketing-plan) retained for reference  | Superseded by AP 12                         |
| **4**  | Switch to Production                | **Launch blocker**                      | 4–8h                 | [Standalone](20260217_AP4_SWITCH_TO_PRODUCTION_PLAN.md) — phased P0–P9 plan                   | Not started                                 |
| **5**  | Documentation Strategy              | Near-blocker (MoR dep)                  | ~6.5h (Tier 1)       | [Standalone](20260216_AP5_DOCUMENTATION_STRATEGY.md)                                          | Not started                                 |
| **6**  | Support Infrastructure              | Should-have                             | 4–6h                 | [Inline §8.4](#84-ap-6-support-infrastructure)                                                | Not started                                 |
| **7**  | Email Verification & Deliverability | **Launch blocker**                      | 3–4h                 | [Inline §8.5](#85-ap-7-email-verification--deliverability)                                    | Item 7.1 (DMARC) absorbed into AP 0         |
| **8**  | MoR Strategy & Payment Integration  | **Launch blocker**                      | 6–10h + ~1 week wait | [Standalone](20260218_AP8_MOR_STRATEGY_AND_PAYMENT_INTEGRATION.md) | Not started; feasibility assessment in AP 0 |
| **9**  | Interoperability & Compatibility    | Contains **Tier 1 blockers** (9.8–9.10) | 4–6h                 | [Inline §8.6](#86-ap-9-interoperability--compatibility)                                       | Partially done (9.1–9.3 verified)           |
| **10** | Monitoring & Observability          | **Launch blocker** (10.1–10.9)          | 6–8h                 | [Inline §8.7](#87-ap-10-monitoring--observability)                                            | Partially done (alarms, logging exist)      |
| **11** | Legal Review (Full Scope)           | **Launch blocker**                      | 4–6h                 | [Inline §8.8](#88-ap-11-legal-review)                                                         | Partially done (83(b) ✅, pages exist)      |
| **12** | Social Media, SEO & Content Distribution | Pre-MoR (Phases 1–2) + Pre-launch (Phase 3) + Ongoing | 12–18h               | [Standalone](20260218_AP12_SOCIAL_MEDIA_SEO_AND_CONTENT_DISTRIBUTION_PLAN.md)                 | Not started                                 |
| **13** | Private Pre-Launch Disclosure       | Pre-launch (blocks AP 12b)              | 3–5 days elapsed     | [Inline §8.9](#89-ap-13-private-pre-launch-disclosure)                                        | Not started; SWR personal planning          |

### Companion Planning Documents

| Document                                                                       | Purpose                                                                                                                                                                                          |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Action Plan Dependency Map](20260216_ACTION_PLAN_DEPENDENCY_MAP.md)           | Track A/B structure, step sequencing, checkpoint definitions, parallel work table. **Needs v2 revision** to incorporate Phase 0, C1–C4 cutover phasing, resolved blockers, and AP restructuring. |
| [Dependency Map Gap Analysis](20260217_DEPENDENCY_MAP_GAP_ANALYSIS.md)         | 12 gaps identified (GAP-1–GAP-12). Most absorbed into AP 0 or natural AP homes.                                                                                                                  |
| [Decision & Gap Analysis Update](20260217_DECISION_AND_GAP_ANALYSIS_UPDATE.md) | D-1–D-5 decisions, GC-GAP-1–9 responses, OI-1–7 open items, recommended Steps A–E.                                                                                                               |
| [LS Migration Plan](20260216_PROPOSED_PLANS_FOR_LEMON_SQUEEZY_MIGRATION.md)    | Detailed LS-specific migration feasibility and implementation plan.                                                                                                                              |

---

## 8. Action Plan Detail: Inline Plans

Action plans with standalone documents (AP 0, 1, 4, 5, 8, 12) are described only in the Registry above. The following plans are maintained inline because their scope is compact enough that a standalone document would add overhead without adding clarity.

---

### 8.1 AP 2a: Website Surface Security Review

**Effort:** 2–3 hours | **Priority:** Pre-MoR application | **Dependencies:** AP 1 near-final (or parallel — API routes are independent of content)

Focused review of the public-facing website for anything an MoR reviewer might notice. This is **not** the comprehensive audit — that's AP 2b.

| #    | Item                                                                                                                                                 | Status    | Effort     |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------- |
| 2a.1 | `npm audit --production` on plg-website — flag/fix criticals/highs                                                                                   | Open      | 30m        |
| 2a.2 | Review 4 unauthenticated endpoints (trial init, Stripe webhook, Keygen webhook, public routes) — webhook signatures, rate limits, error sanitization | Open      | 45m        |
| 2a.3 | Verify safeJsonParse P0/P1/P2 fixes deployed to staging                                                                                              | ✅ Feb 15 | 15m verify |
| 2a.4 | Check HTTP security headers (CSP, HSTS, X-Frame-Options)                                                                                             | Open      | 15m        |
| 2a.5 | Scan client-side bundle for leaked secrets/keys                                                                                                      | Open      | 15m        |
| 2a.6 | Verify error responses don't leak stack traces on unauthenticated routes                                                                             | Open      | 15m        |
| 2a.7 | Review `package.json` files for `publishConfig.access`, license consistency                                                                          | Open      | 15m        |
| 2a.8 | Brief findings note (not full CWE/CVE memo)                                                                                                          | Open      | 15m        |

**Done when:** `npm audit` clean or criticals documented, unauthenticated endpoints verified, HTTP headers confirmed, no secrets in client bundle, brief security note produced.

---

### 8.2 AP 2b: Comprehensive Security Audit

**Effort:** 4–5 hours | **Priority:** Launch blocker | **Dependencies:** AP 9.8–9.10 complete (feature code finalized); AP 2a done; B-D4–B-D6 resolved

Full security audit covering both repos. Builds on AP 2a.

| #    | Item                                                                                        | Status         | Effort     |
| ---- | ------------------------------------------------------------------------------------------- | -------------- | ---------- |
| 2b.1 | `npm audit` on hic/mouse, hic/licensing, hic/mouse-vscode                                   | Open           | 15m        |
| 2b.2 | SAST scan (tool per B-D4) on both repos                                                     | Open           | 1–2h       |
| 2b.3 | Manual review: auth flows (Cognito OAuth, JWT, token refresh, browser-delegated activation) | Open           | 1h         |
| 2b.4 | Manual review: authorization (per-user device scoping, role-based access, seat enforcement) | Open           | 1h         |
| 2b.5 | Review OAuth PKCE implementation                                                            | Open           | 30m        |
| 2b.6 | Audit all `package.json` files across both repos                                            | Open           | 30m        |
| 2b.7 | Verify secrets audit findings remain remediated                                             | ✅ Feb 15      | 15m verify |
| 2b.8 | Full scan for hardcoded credentials                                                         | Partially done | 30m        |
| 2b.9 | Document findings with CWE/CVE references                                                   | Open           | 1h         |

**Also includes (from Gap Analysis):** 2FA hardening on GitHub org, Stripe, Keygen dashboards (~1h additional). These are account-level operational security, not code — a different attack surface than the SAST/auth review but the same security mindset.

**Done when:** SAST clean or triaged, `npm audit` clean across all packages, auth flow review documented with CWE/CVE codes, 2FA enabled on all critical accounts.

---

### 8.3 AP 3: Marketing Plan

**Effort:** 8–12 hours | **Priority:** Post-launch OK, prep in advance | **Dependencies:** AP 1 content finalized

| #   | Item                                                 | Status | Effort |
| --- | ---------------------------------------------------- | ------ | ------ |
| 3.1 | "Show HN" post draft                                 | Open   | 2h     |
| 3.2 | Demo video (Mouse across supported clients)          | Open   | 3h     |
| 3.3 | Blog post about the build journey                    | Open   | 3h     |
| 3.4 | Twitter/X launch thread                              | Open   | 1h     |
| 3.5 | Product Hunt launch page                             | Open   | 1h     |
| 3.6 | `EARLYADOPTER20` coupon (20% off first year)         | Open   | 15m    |
| 3.7 | Reddit posts (r/programming, r/vscode, r/artificial) | Open   | 1h     |
| 3.8 | LinkedIn content for enterprise/AI-forward teams     | Open   | 30m    |

**Done when:** HN post draft reviewed, demo video recorded, social media launch calendar created.

---

### 8.4 AP 6: Support Infrastructure

**Effort:** 4–6 hours | **Priority:** Should-have for launch | **Dependencies:** AP 5 (docs reduce support volume)

| #   | Item                                                                                         | Status  | Effort |
| --- | -------------------------------------------------------------------------------------------- | ------- | ------ |
| 6.1 | Verify `support@hic-ai.com` routes to SWR inbox                                              | Unclear | 30m    |
| 6.2 | Auto-reply template ("received, expect response within 24h")                                 | Open    | 30m    |
| 6.3 | Create Discord server with channels (#general, #mouse-help, #feature-requests, #bug-reports) | Open    | 1h     |
| 6.4 | Update Discord invite link in `constants.js`                                                 | Open    | 15m    |
| 6.5 | GitHub Issue templates (bug report, feature request)                                         | Open    | 30m    |
| 6.6 | "Report a Bug" link in extension (opens GitHub issue)                                        | Open    | 30m    |
| 6.7 | Internal support triage procedures                                                           | Open    | 1h     |
| 6.8 | Set up `security@hic-ai.com` with 24h response commitment                                    | Open    | 30m    |

**Done when:** Test email to `support@` reaches SWR, auto-reply confirmed, Discord live with real invite link, GitHub Issue templates deployed.

---

### 8.5 AP 7: Email Verification & Deliverability

**Effort:** 2.5–3 hours (DMARC moved to AP 0) | **Priority:** Launch blocker | **Dependencies:** AP 0 item 0.7 (DMARC live and propagated)

| #   | Item                                                                                                                          | Status                      | Effort     |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ---------- |
| 7.1 | DMARC record                                                                                                                  | **Moved to AP 0, item 0.7** | —          |
| 7.2 | Test email delivery to Gmail (not spam-filtered)                                                                              | Open                        | 30m        |
| 7.3 | Test email delivery to Outlook/Hotmail (not spam-filtered)                                                                    | Open                        | 30m        |
| 7.4 | Verify all transactional emails fire: welcome, license delivery, payment confirmation, payment failed, subscription cancelled | Open                        | 1h         |
| 7.5 | Bounce/complaint monitoring in SES console                                                                                    | Open                        | 30m        |
| 7.6 | Verify duplicate email prevention fix (Feb 14) is holding                                                                     | ✅ Fix deployed             | 15m verify |

**Done when:** Test emails reach Gmail/Outlook inboxes (not spam), all transactional email types verified, bounce/complaint monitoring active.

---

### 8.6 AP 9: Interoperability & Compatibility

**Effort:** 4–6 hours | **Priority:** Contains **Tier 1 blockers** (9.8–9.10 = Phase 6) | **Dependencies:** B-D1–B-D3 for scope of 9.8–9.10

**E2E Client Verification (Steps 1–5):**

| #   | Item                                        | Status              | Effort        |
| --- | ------------------------------------------- | ------------------- | ------------- |
| 9.1 | VS Code: Initialize Workspace → tool usage  | ✅ Confirmed        | 15m re-verify |
| 9.2 | Cursor: Initialize Workspace → tool usage   | ✅ Confirmed Feb 15 | 15m re-verify |
| 9.3 | Kiro: Initialize Workspace → tool usage     | ✅ Confirmed Feb 15 | 15m re-verify |
| 9.4 | Roo Code: Initialize Workspace → tool usage | Open                | 1h            |
| 9.5 | Cline: Initialize Workspace → tool usage    | Open                | 1h            |

**Version Update Wire-up (Steps 8–10) — Phase 6 completion:**

| #    | Item                                                      | Status                                                       | Effort |
| ---- | --------------------------------------------------------- | ------------------------------------------------------------ | ------ |
| 9.8  | Parse `latestVersion` from heartbeat response             | **Scope TBD** — Feb 16 found this may already be implemented | 2–3h   |
| 9.9  | `Mouse: Update Version` command                           | **Scope TBD** — commands may already be registered           | 1–2h   |
| 9.10 | Version notification (status bar or VS Code notification) | **Scope TBD**                                                | 1h     |

> **Important:** Feb 16 investigation found that heartbeat `onSuccess` already parses `readyVersion || latestVersion`, compares against installed version, and calls `statusBarManager.showUpdateAvailable()`. The `mouse.checkForUpdates` and `mouse.showUpdateInfo` commands are registered. B-D1–B-D3 (deferred to MoR wait window) will determine whether this is verification-only or requires additional work.

**Phase 4 hardening** (heartbeat status alignment, Cognito callback cleanup, enforcement edge case tests) is scoped for fix-or-defer when 9.8–9.10 work begins.

**Cross-browser/mobile testing** (9.6–9.7) deferred to post-launch backlog.

**Done when:** All supported clients verified, version notification functional, `Mouse: Update Version` works.

---

### 8.7 AP 10: Monitoring & Observability

**Effort:** 6–8 hours | **Priority:** Launch blocker (10.1–10.9) | **Dependencies:** B-D7 (log retention); structured logging ✅

| #     | Item                                                    | Status                         | Effort |
| ----- | ------------------------------------------------------- | ------------------------------ | ------ |
| 10.1  | `/api/health` endpoint (200 + DynamoDB check)           | **Does not exist — critical**  | 30m    |
| 10.2  | CloudWatch metric filters + alarms for Amplify SSR logs | **Not done — critical**        | 2–3h   |
| 10.3  | Log retention policy (per B-D7)                         | Not done — unbounded cost risk | 15m    |
| 10.4  | Add Amplify SSR log group to CloudFormation             | Not done                       | 30m    |
| 10.5  | Define severity levels (P1–P4)                          | Not done                       | 30m    |
| 10.6  | Minimal incident runbook (top 3 failure modes)          | Not done                       | 1h     |
| 10.7  | Verify DynamoDB PITR enabled                            | Open                           | 15m    |
| 10.8  | Document backup restore procedure                       | Open                           | 30m    |
| 10.9  | CloudWatch launch day dashboard                         | Open                           | 1–2h   |
| 10.10 | External uptime monitoring (UptimeRobot / Better Stack) | Open                           | 30m    |

**Already done:** Structured logging (33 handlers, 24 files), DLQ alarms, Lambda error/payment/email failure alarms, SNS → email confirmed.

**Pre-launch:** Items 10.1–10.9. **Post-launch:** Item 10.10.

**Done when:** `/api/health` returns 200, metric filters alarming on 5xx/latency, log retention set, severity levels defined, runbook exists, PITR confirmed, launch dashboard ready.

---

### 8.8 AP 11: Legal Review

**Effort:** 4–6h | **Priority:** Launch blocker | **Dependencies:** AP 0 item 0.7 (DMARC) + Plausible wire-up (Track A Step A1) for accurate Privacy Policy

| #    | Item                                                                                                          | Status      | Effort |
| ---- | ------------------------------------------------------------------------------------------------------------- | ----------- | ------ |
| 11.1 | Privacy Policy review — must reflect Plausible (cookieless), Cognito, DynamoDB, SES, what is/isn't collected  | Page exists | 1h     |
| 11.2 | Terms of Service review — pricing, product details, limitations                                               | Page exists | 1h     |
| 11.3 | ToS cross-reference to refund policy (on `/faq`)                                                              | Partial     | 30m    |
| 11.4 | Wire up Plausible analytics on staging                                                                        | Open        | 30m    |
| 11.5 | IP review of public-facing documentation content                                                              | Open        | 1–2h   |
| 11.6 | IP review of FAQ for proprietary detail exposure                                                              | Open        | 30m    |
| 11.7 | Remove/generalize sensitive technical details from public docs                                                | Open        | 1h     |
| 11.8 | File copyright application (Mouse software)                                                                   | Open        | 1h     |
| 11.9 | File provisional patent application — **must complete before public launch** (disclosure starts 1-year clock) | Open        | TBD    |

> **Internal ordering:** 11.4 (Plausible) must happen before 11.1 (Privacy Policy) — the policy must accurately describe the analytics approach. 11.5–11.7 (IP review) best done after AP 5 (docs finalized). 11.8–11.9 (filings) have no technical dependencies but are SWR personal legal tasks — best done during LS wait window.

**Done when:** Privacy Policy and ToS reviewed and approved by SWR (as attorney), refund cross-referenced in ToS, no proprietary details exposed, patent application filed, copyright application filed.

---

### 8.9 AP 13: Private Pre-Launch Disclosure

**Effort:** 3–5 days elapsed (~3–5h actual) | **Priority:** Pre-launch (blocks AP 12 LinkedIn update) | **Dependencies:** MoR applications submitted (SWR has certainty of launch direction)

Private, direct conversations with key individuals before any public disclosure. AP 13 is distinct from AP 12 (Social Media) — these are in-person professional conversations, not social media activity.

| #    | Item                                         | Sequencing                           |
| ---- | -------------------------------------------- | ------------------------------------ |
| 13.1 | Law firm partner                             | **First** — professional obligation  |
| 13.2 | Key client ($4B fund / SW engineer)          | **Second** — strategic early adopter |
| 13.3 | Remaining close contacts (clients, personal) | **Third** — broader circle           |
| 13.4 | Silence period before public signal          | **Fourth** — buffer                  |

> SWR is actively thinking through this plan separately. The specific contacts and approach are personal decisions that don't require GC planning. The only constraint AP 13 imposes on other plans: AP 12's LinkedIn update (the irreversible public disclosure) cannot happen until AP 13 is complete.

**Done when:** SWR confirms all planned private conversations completed and readiness for public disclosure.

---

## 9. Bottom Line

The project's actual state is dramatically ahead of what PLG Roadmap v7.0 documents. The largest body of technical work — multi-seat device management Phase 3 — is complete. Security hardening that the roadmap called "blocked" is well underway. The extension works across 3+ clients with CJS compatibility. 3,459 tests pass with zero failures.

**The true distance to launch is ~45–65 hours of focused work**, of which ~25–35 hours are on the critical path. The sole remaining feature gap is the version update wire-up (AP 9.8–9.10), which may be largely complete already pending B-D1–B-D3 decisions. All other work is operational (deploy, integrate payments, verify emails), quality assurance (security audit, monitoring), or legal (Privacy/ToS review, patent filing).

**Critical path:** Phase 0 quick wins → Track A (website polish, docs, MoR applications) → MoR wait window (Track B: version wire-up, security audit, monitoring; personal: disclosures) → Payment integration → Production deployment (P0–P9) → Marketplace publishing → Launch.

**The single most time-sensitive action** is submitting the MoR applications (LS + Paddle) because the external review period (~1 week) cannot be compressed. Phase 0 and early Track A work exist to make that application as strong as possible, as fast as possible.

---

## Document History

| Date       | Author | Changes                                                                                                                                                                                                                                     |
| ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-02-16 | GC     | v1 — comprehensive assessment with 13 inline action plans                                                                                                                                                                                   |
| 2026-02-18 | GC     | v2 — refactored to orchestration document; inline APs condensed; standalone APs referenced; decisions from Feb 17 session incorporated; AP 0 added; AP 12 scope redefined (social media); AP 8 expanded to dual-MoR strategy; OI-4 resolved |
