# Pre-Launch Status Assessment & Action Plans

**Date:** February 16, 2026
**Author:** General Counsel
**Purpose:** Comprehensive cross-repo assessment of project status since last PLG Roadmap update (Feb 12), with 11 self-contained action plans for launch readiness.
**Methodology:** Full review of PLG Roadmap v7.0, cross-referenced against 66 commits across 3 repos (hic, hic-ai-inc.github.io, hic-e2e-clean), all test suites run (3,459 tests passing / 0 failing), and key infrastructure items verified.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [The Delta: Work Accomplished Feb 12–16](#the-delta-work-accomplished-feb-1216)
3. [Updated Phase Status](#updated-phase-status)
4. [Updated TODO Status](#updated-todo-status)
5. [Items Requiring Further Investigation](#items-requiring-further-investigation)
6. [Action Plans Overview](#action-plans-overview)
7. [Track B: Open Decisions Before Starting Work](#track-b-open-decisions-before-starting-work)
8. [Action Plan 1: Front-End UX & Content](#action-plan-1-front-end-ux--content)
9. [Action Plan 2: Security Audit](#action-plan-2-security-audit)
10. [Action Plan 3: Marketing Plan](#action-plan-3-marketing-plan)
11. [Action Plan 4: Launch Plan & Deployment Checklist](#action-plan-4-launch-plan--deployment-checklist)
12. [Action Plan 5: Documentation Plan](#action-plan-5-documentation-plan)
13. [Action Plan 6: Support Infrastructure](#action-plan-6-support-infrastructure)
14. [Action Plan 7: Email Verification & Deliverability](#action-plan-7-email-verification--deliverability)
15. [Action Plan 8: Payments & Lemon Squeezy Migration](#action-plan-8-payments--lemon-squeezy-migration)
16. [Action Plan 9: Interoperability & Compatibility](#action-plan-9-interoperability--compatibility)
17. [Action Plan 10: Monitoring & Observability](#action-plan-10-monitoring--observability)
18. [Action Plan 11: Legal Review](#action-plan-11-legal-review)
19. [Action Plan 12: Personal Social Media Cleanup](#action-plan-12-personal-social-media-cleanup)
20. [Action Plan 13: Private Pre-Launch Disclosure](#action-plan-13-private-pre-launch-disclosure)
21. [Recommended Execution Order](#recommended-execution-order)
22. [Bottom Line](#bottom-line)

---

## Executive Summary

The project is in significantly stronger shape than the PLG Roadmap v7.0 (dated Feb 12) reflects. Phase 5 (Multi-Seat Device Management) Phase 3 — the largest and most complex body of work — is **fully complete** across all subphases (3A–3F). Security work that v7.0 listed as "blocked on Phases 5–6" is **substantially underway**: secrets audit complete (4 findings remediated), structured logging rolled out across all 33 handlers in 24 route files, safe JSON parsing hardened, IAM tightened in CloudFormation. The extension has advanced from v0.10.5 to v0.10.10 with CJS build output for Cursor/Kiro compatibility and multi-client Initialize Workspace support.

**True remaining blockers for launch:**

1. **Lemon Squeezy MoR application** — Must be submitted ASAP; LS review takes ~1 week. Without an MoR, SWR bears global tax compliance obligations on every sale in every jurisdiction (see AP 8).
2. Version update wire-up (Phase 6 — client-side heartbeat version parsing + `Mouse: Update Version` command)
3. `/api/health` endpoint + monitoring metric filters/alarms for Amplify SSR log group
4. Security audit formalization (SAST scan + auth flow manual review)
5. Stripe → Lemon Squeezy payment migration (if LS approves; far easier pre-launch than post-launch)
6. Production Amplify environment creation + deployment
7. Legal review of Terms of Service and Privacy Policy

**Key business decision:** SWR is willing to delay launch to have Lemon Squeezy as Merchant of Record from Day 1, avoiding global tax compliance exposure. The LS application should be submitted as early as possible, since their previous rejection cited lack of "website and social media" — both of which now exist. Website polish (AP 1), documentation accuracy (AP 5), and email deliverability (AP 7) are therefore prerequisites to a strong LS application.

---

## The Delta: Work Accomplished Feb 12–16

### hic repo (9 commits)

- **Phase 3A complete**: Browser-delegated activation — extension opens browser, user authenticates via Cognito Hosted UI, extension polls `/api/license/validate` for completion
- **Phase 3D complete**: Machine recovery + heartbeat-first startup flow — fixes expiry bug, handles `HEARTBEAT_NOT_STARTED` gracefully
- **v0.10.6–v0.10.10**: Five version bumps, including a fix for activation hang (missing const), CJS build output, and multi-client Initialize Workspace
- **Multi-client Initialize Workspace**: Added Cursor and Kiro to supported clients dropdown, with per-client MCP config path resolution (`copilot → .vscode/mcp.json`, `cursor → .cursor/mcp.json`, `kiro → .kiro/settings/mcp.json`)
- **CJS build output**: Switched esbuild from ESM to CJS format — ESM extension host support requires VS Code 1.100+, which Cursor and Kiro forks lack
- **Heartbeat status alignment memo**: Documented mismatch between backend heartbeat statuses and extension allow-list; phased remediation plan proposed

### hic-ai-inc.github.io (52 commits)

**Multi-Seat Completion (Feb 12–14):**

- **Phase 3B**: Authenticated activation, `/activate` page deployed, optional JWT in heartbeat, 2-hour concurrent device window aligned — 37 new tests, E2E smoke tested
- **Phase 3E**: Require auth on activation + per-seat enforcement — unauthenticated activation returns 401
- **Phase 3F**: Portal per-user device views, read-only device lifecycle (portal is read-only, no user-initiated deactivation), portal member device count fix, device identity drift fix (fingerprint-keyed lifecycle)
- **Device-related fixes**: Hardened portal devices flow, restored truncated catch block, fixed active device count display, prevented duplicate licenseDelivery emails on pairing MODIFY events

**Security & Infrastructure (Feb 14–15):**

- **Secrets hygiene audit**: 4 findings identified and ALL remediated:
  - FINDING-1 (HIGH): Stripe test key in plaintext Amplify env vars → removed from both app-level and branch-level
  - FINDING-2 (LOW): Legacy 25-key mega-secret with no code references → soft-deleted
  - FINDING-3 (MEDIUM): Dual storage (SSM + Secrets Manager) sync risk → Secrets Manager now canonical
  - FINDING-4 (LOW): Emergency `process.env` fallback in production → replaced with `throw new Error()`
- **Structured logging**: Complete rollout across 33 handlers in 24 route files, validated in CloudWatch. Reusable `api-log.js` adapter with unit tests. 6-commit implementation plan executed fully.
- **Safe JSON parsing**: P0/P1/P2 fixes deployed with test coverage (safety utilities audit report produced)
- **IAM hardening**: AmplifyComputeRole added to CloudFormation with CloudWatch Logs permissions, DynamoDB ARN ref instead of hardcoded `plg-*` glob
- **Environment gate fix**: Flipped `=== "development"` to `!== "production"` (latent bug discovered during secrets remediation)

**Documentation produced:**

- Code quality review for commit 78de6e8 (security vulnerabilities, coding defects)
- Auth Strategy Update (Decisions 1 & 2 — heartbeat resolves userId from DDB, no identity transmitted by extension)
- Device lifecycle model correction (portal is read-only)
- Heartbeat status alignment memo (4-phase remediation plan)
- Secrets hygiene audit report (4 findings, all remediated)
- Structured logging integration report (33 handlers, 24 files)
- Pre-launch monitoring & observability recommendations (9 items across 2 tiers)
- Safety utilities audit report

### hic-e2e-clean (5 commits)

- Tested Mouse v0.10.6, v0.10.7, v0.10.8, v0.10.9, v0.10.10 in clean E2E environment
- Each version validated: install → activate → tool usage

### Test Health (Feb 16)

| Package      | Tests     | Status            |
| ------------ | --------- | ----------------- |
| mouse        | 1,605     | ✅ All passing    |
| mouse-vscode | 198       | ✅ All passing    |
| licensing    | 177       | ✅ All passing    |
| plg-website  | 1,479     | ✅ All passing    |
| **Total**    | **3,459** | **✅ 0 failures** |

---

## Updated Phase Status

| Phase | Focus                          | Roadmap v7.0 Said (Feb 12)    | Actual Status (Feb 16)                                                                                                                                                                            |
| ----- | ------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | Individual Validation          | ✅ COMPLETE                   | ✅ No change                                                                                                                                                                                      |
| **2** | Business RBAC                  | ✅ COMPLETE                   | ✅ No change                                                                                                                                                                                      |
| **3** | Device Management Wire-up      | ✅ COMPLETE                   | ✅ No change                                                                                                                                                                                      |
| **4** | VS Code Extension              | ✅ COMPLETE                   | ✅ No change                                                                                                                                                                                      |
| **5** | Multi-Seat Device Mgmt         | 🟡 IN PROGRESS (3B done only) | **🟢 Phase 3 COMPLETE** (all 6 subphases 3A–3F done). Phase 4 hardening NOT STARTED.                                                                                                              |
| **6** | Version Updates & Distribution | 🔴 NOT STARTED                | **🟡 PARTIALLY DONE** — CJS build, multi-client init (Cursor/Kiro/Copilot verified). Version notification wire-up still not done.                                                                 |
| **7** | Security Audit & Launch Prep   | 🔴 NOT STARTED                | **🟡 SUBSTANTIALLY UNDERWAY** — Secrets audit ✅, structured logging ✅, safe JSON parsing ✅, IAM hardened ✅. SAST scan, formal auth review, monitoring metric filters, and launch plan remain. |
| **8** | Launch                         | 🔴 BLOCKED                    | Still blocked on remaining Phase 5–7 items                                                                                                                                                        |

---

## Updated TODO Status

| #   | TODO                             | Roadmap v7.0 Status | Actual Status (Feb 16)                              | Notes                                                                                                                                                |
| --- | -------------------------------- | ------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Device Concurrent Limits Testing | 🔴 Tier 1           | **✅ DONE**                                         | Phase 3E per-seat enforcement implemented & E2E tested                                                                                               |
| 2   | Business RBAC                    | ✅ Done             | ✅ No change                                        |                                                                                                                                                      |
| 3   | Email Flow Verification          | 🟡 Pre-launch       | Still open                                          | Needs E2E verification of all transactional emails                                                                                                   |
| 5   | Documentation Site               | 🔴 Tier 2           | **Partial**                                         | `/docs` page exists with dynamic slug routing. No `docs.hic-ai.com` subdomain. Content quality TBD.                                                  |
| 6   | Launch Plan Document             | 🔴 Tier 1           | Still open                                          |                                                                                                                                                      |
| 7   | Support Infrastructure           | 🟢 Post-launch      | Still open                                          | Discord placeholder link exists in code                                                                                                              |
| 8   | CI/CD Pipeline                   | 🟡 Post-launch      | ✅ CI/CD exists in both repos                       | `release-mouse.sh` working, GitHub Actions workflows active                                                                                          |
| 9   | IP Review                        | 🟠 Pre-launch       | Still open                                          |                                                                                                                                                      |
| 10  | Corporate/Legal                  | 🔴 Tier 1           | **Partial**                                         | 83(b) ✅. Privacy and ToS pages exist but need final legal review.                                                                                   |
| 11  | Payment Edge Cases               | 🔴 Tier 1           | Still open                                          | Stripe sandbox → production is the core remaining work                                                                                               |
| 12  | Monitoring & Status Page         | 🟢 Post-launch      | **Partial**                                         | CloudWatch alarms exist (DLQ, errors, payment, email). Structured logging complete. Monitoring recommendations doc produced but NOT yet implemented. |
| 13  | Analytics & CloudWatch           | 🟢 Post-launch      | Still open                                          |                                                                                                                                                      |
| 14  | Security Audit                   | 🔴 Tier 1           | **Substantially advanced**                          | Secrets audit ✅, structured logging ✅, safe JSON ✅, IAM hardened ✅. SAST scan and formal auth review remain.                                     |
| 15  | Front-End UX Polish              | 🟢 Post-launch      | Still open                                          |                                                                                                                                                      |
| 16  | Marketing Strategy               | 🟢 Post-launch      | Still open                                          |                                                                                                                                                      |
| 17  | DR & Backups                     | 🔴 Tier 2           | Still open                                          | Verify PITR enabled, document restore procedure                                                                                                      |
| 18  | Load/Stress Testing              | 🟡 Post-launch      | Still open                                          |                                                                                                                                                      |
| 19  | Incident Response + Monitoring   | 🔴 Tier 2           | **Partial**                                         | DLQ alarms ✅, SNS email subscription ✅. Health endpoint, metric filters for Amplify SSR, severity defs, and runbook remain.                        |
| 20  | Extension Version Compat         | 🟡 Post-launch      | **Significant progress**                            | VS Code, Cursor, Kiro all confirmed working with CJS build                                                                                           |
| 21  | Cross-Browser Testing            | 🟡 Post-launch      | Still open                                          |                                                                                                                                                      |
| 22  | Onboarding Flow Polish           | 🟢 Post-launch      | Still open                                          |                                                                                                                                                      |
| 23  | Refund Policy                    | 🟡 Post-launch      | **Partial** — exists on FAQ page                    | Refund policy published at staging.hic-ai.com/faq; should also be referenced in ToS                                                                  |
| 24  | Multi-Seat Implementation        | 🔴 Tier 1           | **Phase 3 ✅ COMPLETE**. Phase 4 hardening remains. | Phase 4: heartbeat status alignment, Cognito cleanup, enforcement tests                                                                              |
| 25  | Version Update Wire-up           | 🔴 Tier 1           | Still open                                          | Client-side heartbeat version parsing not wired                                                                                                      |
| 26  | Keygen Policy Corrections        | 🔴 Tier 1           | Marked done per Phase 0 (Feb 11)                    | **Needs verification** — should confirm in Keygen dashboard                                                                                          |

---

## Items Requiring Further Investigation

| Item                                    | Uncertainty                                                                                                                                                                                     | How to Verify                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Keygen policy corrections (TODO 26)** | Roadmap says Phase 0 done Feb 11, but were `maxMachines=3`, `ALWAYS_ALLOW_OVERAGE`, and `heartbeatDuration=3600s` actually applied?                                                             | Check Keygen dashboard or query Keygen API                                 |
| **`support@hic-ai.com` email routing**  | SES is configured for receiving, but does mail actually route to SWR's inbox?                                                                                                                   | Send a test email and verify receipt                                       |
| **Heartbeat status alignment**          | Extension allow-list doesn't match backend status codes. Happy path (`active`) works; edge cases (`over_limit` vs `concurrent_limit`, `machine_not_found`) may fail silently.                   | Dedicated testing of non-happy-path journeys; see heartbeat alignment memo |
| **Phase 4 hardening scope**             | How much of Phase 4 (multi-seat hardening) is truly needed for launch vs. can be safely deferred? Key items: heartbeat status alignment, Cognito callback cleanup, enforcement edge case tests. | **Decision required from SWR**: scope Phase 4 for launch vs. post-launch   |
| **Production Amplify environment**      | No production branch or Amplify environment exists yet. Only `staging.hic-ai.com` is deployed.                                                                                                  | Create production environment in Amplify console or CLI                    |
| **VS Code Marketplace publish flow**    | Publisher `hic-ai` is configured in `package.json`, but has it been verified with `vsce login`?                                                                                                 | Run `vsce login hic-ai` and verify PAT is configured                       |
| **Docs content quality**                | `/docs` page route exists with dynamic slug routing, but content completeness and accuracy not verified. The roadmap previously noted docs links returning 404.                                 | Visit staging.hic-ai.com/docs; review all doc slugs for content quality    |
| **Open Graph image**                    | OG meta tags are fully configured with a 1200×630 image, but the image file's existence wasn't verified.                                                                                        | Verify the image URL resolves; test with social preview tools              |
| **Discord server**                      | `discord.gg/hic-ai` exists as a placeholder link in `constants.js`, but the actual Discord server may not exist.                                                                                | Navigate to the URL; create server if needed                               |

---

## Action Plans Overview

| #   | Action Plan                         | Est. Effort | Priority                                 | Dependencies                  |
| --- | ----------------------------------- | ----------- | ---------------------------------------- | ----------------------------- |
| 1   | Front-End UX & Content              | 6–8h        | High-value, not blocking                 | None                          |
| 2a  | Website Surface Security Review     | 2–3h        | Pre-LS (strengthens application)         | AP 1 (near-final site)        |
| 2b  | Comprehensive Security Audit        | 4–5h        | **LAUNCH BLOCKER**                       | AP 9.8–9.10 (code finalized)  |
| 3   | Marketing Plan                      | 8–12h       | Post-launch OK, prep in advance          | AP 1 (content finalized)      |
| 4   | Launch Plan & Deployment            | 6–8h        | **LAUNCH BLOCKER**                       | AP 2, AP 8 substantially done |
| 5   | Documentation Plan                  | 6–10h       | High-value, near-blocker                 | None                          |
| 6   | Support Infrastructure              | 4–6h        | Should-have for launch                   | AP 5 (docs)                   |
| 7   | Email Verification & Deliverability | 3–4h        | **LAUNCH BLOCKER**                       | None                          |
| 8   | Payments & Lemon Squeezy Migration  | 6–10h       | **LAUNCH BLOCKER** (LS application ASAP) | AP 1, AP 5, AP 7 (LS prereqs) |
| 9   | Interoperability & Compatibility    | 4–6h        | **Contains TIER 1 blockers** (9.8–9.10)  | Mouse v0.10.10 VSIX           |
| 10  | Monitoring & Observability          | 6–8h        | **LAUNCH BLOCKER** (items 10.1–10.6)     | Structured logging ✅         |
| 11  | Legal Review                        | 4–6h        | **LAUNCH BLOCKER**                       | None                          |
| 12  | Personal Social Media Cleanup       | 1–2h        | Pre-launch (12b blocks marketing/launch) | 12a: None; 12b: AP 13         |
| 13  | Private Pre-Launch Disclosure       | 3–5 days    | Pre-launch (blocks AP 12b)               | AP 8A submitted (certainty)   |

---

## Track B: Open Decisions Before Starting Work

Track B (AP 9, AP 2b, AP 10 — all in the hic repo) is well-specified at the task level, but **8 business decisions must be resolved before an agent can execute autonomously.** These should be addressed in a single decision session (~15 minutes) at the start of Track B work.

### AP 9: Version Update (3 decisions)

> **Important context:** Investigation on Feb 16 revealed that the Feb 5 auto-update report's findings about "onSuccess ignoring version fields" have been **subsequently implemented.** Heartbeat `onSuccess` now parses `readyVersion || latestVersion`, compares against installed version, and calls `statusBarManager.showUpdateAvailable()`. The `mouse.checkForUpdates` and `mouse.showUpdateInfo` commands are registered and functional. **B1 may need verification, not implementation.** The scope of AP 9.8–9.10 should be reassessed at the start of Track B.

| # | Decision | Context | Options |
|---|----------|---------|--------|
| **D1** | `/api/version` endpoint — create it, or remove `checkForUpdates()`? | `mouse.checkForUpdates` calls `https://api.hic-ai.com/version`, which may not exist in the website repo. The heartbeat-delivered version data already works as an alternative. | (a) Create endpoint in website repo; (b) Remove `checkForUpdates()` and rely solely on heartbeat |
| **D2** | "Update Now" UX — is browser redirect acceptable for v1? | When the user clicks "Update Now," the extension either opens a browser to the download URL (manual VSIX install) or calls `workbench.extensions.installExtension` (only works if published on Marketplace). VS Code's API has no automated VSIX-download-and-install mechanism. | (a) Accept browser redirect for v1; (b) Defer "Update Now" entirely, show notification only |
| **D3** | EventBridge rule for `readyVersion` daily gating — deploy, or launch with immediate notifications? | CloudFormation template exists but the rule isn't deployed to AWS. Without it, `latestVersion` is used directly (users see update notifications immediately upon release, with no 24-hour soak period). | (a) Deploy EventBridge rule (adds soak period); (b) Launch without it (immediate notification) |

### AP 2b: Security Audit (3 decisions)

| # | Decision | Context | Options |
|---|----------|---------|--------|
| **D4** | Which SAST tool? | No SAST config exists beyond `npm audit`. AP 2b.2 estimates 1–2h for setup. | (a) CodeQL (free, GitHub-native); (b) Snyk (free tier, needs account); (c) ESLint security plugin (lightweight) |
| **D5** | `package.json` field standardization | Inconsistent across 8 packages. `mouse/` and `mcp/` lack `"private": true` (accidental `npm publish` risk). `mouse/benchmark/package.json` has `"license": "MIT"` (wrong for proprietary code). `llm/` uses `PROPRIETARY`; `mouse-vscode/` uses `SEE LICENSE IN LICENSE.md`; others have no license field. | (a) All non-published: `"private": true` + `"license": "UNLICENSED"`; (b) Same but `"license": "PROPRIETARY"`; (c) Per-package decision |
| **D6** | Security findings memo — format and location? | Coding standards require CWE/CVE documentation, but no template or prior example exists in `docs/security/`. | (a) Markdown memo in `docs/security/`; (b) Memo in `plg/docs/`; (c) Inline in PR description only |

### AP 10: Monitoring (1 decision)

| # | Decision | Context | Options |
|---|----------|---------|--------|
| **D7** | Log retention period — 14 or 30 days? | AP 10.3 lists both. Shorter = lower cost; longer = more debugging runway. | (a) 14 days; (b) 30 days |

### AP 4: Launch Deployment (1 decision)

| # | Decision | Context | Options |
|---|----------|---------|--------|
| **D8** | Production API base URL? | `licensing/constants.js` has `API_BASE_URL` hardcoded to `https://staging.hic-ai.com`. Must be changed before production VSIX release. | (a) `https://hic-ai.com`; (b) `https://api.hic-ai.com`; (c) Other |

---

## Action Plan 1: Front-End UX & Content

**Estimated effort:** 6–8 hours across 1–2 sessions
**Priority:** High-value but not a hard launch gate
**Dependencies:** None — can start anytime

| #   | Item                                                                            | Current Status        | Effort     |
| --- | ------------------------------------------------------------------------------- | --------------------- | ---------- |
| 1.1 | Proofread all copy (home, features, pricing, FAQ, about, contact, docs index)   | Open                  | 2h         |
| 1.2 | Add screenshots/GIFs to features page                                           | Open                  | 2h         |
| 1.3 | Review responsive design on mobile/tablet (at least Chrome DevTools)            | Open                  | 1h         |
| 1.4 | Remove any Mouse emoji (🐭) from production UI; standardize SVG/PNG logo usage  | Open                  | 30m        |
| 1.5 | Verify all internal links work (no 404s)                                        | Open                  | 30m        |
| 1.6 | Add `sitemap.xml` (Next.js `app/sitemap.js` convention)                         | Not present           | 30m        |
| 1.7 | Loading states and error states for checkout error paths (payment failed, etc.) | Open                  | 1h         |
| 1.8 | Verify Open Graph 1200×630 image exists and renders on social preview tools     | OG tags configured ✅ | 15m verify |

**Definition of done:** All public-facing pages proofread, no broken links, responsive check passed, sitemap deployed, OG preview verified.

---

## Action Plan 2a: Website Surface Security Review (Pre-LS)

**Estimated effort:** 2–3 hours in a single session
**Priority:** Pre-LS application (strengthens LS submission; catches visible vulnerabilities)
**Dependencies:** AP 1 (site near-final) — or can run in parallel with AP 1 since API routes are independent of content

Focused review of the public-facing website for anything an LS reviewer might notice or that could cause rejection. This is **not** the comprehensive audit — that’s AP 2b.

| #    | Item                                                                                                                                                                   | Current Status              | Effort |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------ |
| 2a.1 | Run `npm audit --production` on plg-website — flag/fix criticals and highs                                                                                             | Open                        | 30m    |
| 2a.2 | Review 4 unauthenticated endpoints (trial init, Stripe webhook, Keygen webhook, public routes)                                                                         | Open                        | 45m    |
| 2a.3 | Verify P0/P1/P2 safeJsonParse fixes deployed to staging                                                                                                                | ✅ Fixes implemented Feb 15 | 15m    |
| 2a.4 | Check HTTP security headers on staging.hic-ai.com (CSP, HSTS, X-Frame-Options)                                                                                         | Open                        | 15m    |
| 2a.5 | Scan client-side bundle for leaked secrets/keys (build output inspection)                                                                                              | Open                        | 15m    |
| 2a.6 | Verify error responses don’t leak stack traces or internal details on unauthenticated routes                                                                           | Open                        | 15m    |
| 2a.7 | Review all `package.json` files in website repo for `publishConfig.access` settings, license field consistency, and accidental public exposure of proprietary packages | Open                        | 15m    |
| 2a.8 | Produce brief findings note (not full CWE/CVE memo — that’s AP 2b)                                                                                                     | Open                        | 15m    |

**What’s already done:** safeJsonParse P0/P1/P2 fixes (Feb 15), secrets audit (4 findings remediated), structured logging (33 handlers).

**Definition of done:** `npm audit` clean or criticals documented, unauthenticated endpoints verified (webhook signatures, rate limits, error sanitization), HTTP headers confirmed, no secrets in client bundle, brief security note produced.

---

## Action Plan 2b: Comprehensive Security Audit (Post-Feature-Freeze)

**Estimated effort:** 4–5 hours across 1–2 sessions
**Priority:** LAUNCH BLOCKER
**Dependencies:** AP 9.8–9.10 (feature code finalized); AP 2a (avoids re-checking website surface)

Full security audit covering both repos, deep auth/authz review, and formal documented findings. Builds on AP 2a’s website surface review.

| #    | Item                                                                                                                                                                                                | Current Status                   | Effort     |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ---------- |
| 2b.1 | Run `npm audit` on hic/mouse, hic/licensing, hic/mouse-vscode                                                                                                                                       | Open                             | 15m        |
| 2b.2 | Run SAST tool (CodeQL or Snyk) on both repos                                                                                                                                                        | Open                             | 1–2h       |
| 2b.3 | Manual review: authentication flows (Cognito OAuth, JWT verification, token refresh, browser-delegated activation)                                                                                  | Open                             | 1h         |
| 2b.4 | Manual review: authorization checks (per-user device scoping, role-based API access, seat enforcement)                                                                                              | Open                             | 1h         |
| 2b.5 | Review OAuth PKCE implementation in browser-delegated activation flow                                                                                                                               | Open                             | 30m        |
| 2b.6 | Audit all `package.json` files across both repos for: `publishConfig.access` (no accidental `public`), license field consistency (`UNLICENSED` vs proprietary), repository URLs, and package naming | Open                             | 30m        |
| 2b.7 | Verify all 4 secrets audit findings remain remediated                                                                                                                                               | ✅ Done Feb 15                   | 15m verify |
| 2b.8 | Verify no hardcoded credentials in committed code (full scan)                                                                                                                                       | Partially done via secrets audit | 30m        |
| 2b.9 | Document all findings with CWE/CVE references (per HIC coding standards)                                                                                                                            | Open                             | 1h         |

**What’s already done and doesn’t need repeating:**

- AP 2a website surface review (npm audit, headers, unauthenticated endpoints)
- Secrets hygiene audit (4 findings — all remediated, E2E validated)
- Structured logging (33 handlers across 24 route files)
- Safe JSON parsing (P0/P1/P2 fixes + test coverage)
- IAM hardening (AmplifyComputeRole in CloudFormation, ARN-based DynamoDB scope)

**Definition of done:** SAST scan clean (or all findings triaged), `npm audit` clean across all packages, auth flow review documented, PKCE reviewed, all endpoints confirmed auth-gated, findings memo written with CWE/CVE codes.

---

## Action Plan 3: Marketing Plan

**Estimated effort:** 8–12 hours across 2–3 sessions
**Priority:** Post-launch OK, but preparation should begin before launch
**Dependencies:** Website content finalized (Action Plan 1)

| #   | Item                                                                              | Current Status | Effort |
| --- | --------------------------------------------------------------------------------- | -------------- | ------ |
| 3.1 | Write "Show HN" post draft                                                        | Open           | 2h     |
| 3.2 | Create demo video showing Mouse in action across supported clients                | Open           | 3h     |
| 3.3 | Write detailed blog post about the build journey                                  | Open           | 3h     |
| 3.4 | Prepare Twitter/X thread about the build process and AI-human collaboration story | Open           | 1h     |
| 3.5 | Plan Product Hunt launch (create page, screenshots, tagline, hunter outreach)     | Open           | 1h     |
| 3.6 | Create `EARLYADOPTER20` coupon in Stripe dashboard (20% off first year)           | Open           | 15m    |
| 3.7 | Draft Reddit posts for r/programming, r/vscode, r/artificial, r/MachineLearning   | Open           | 1h     |
| 3.8 | LinkedIn content targeting enterprise developers and AI-forward teams             | Open           | 30m    |

**Definition of done:** HN post draft reviewed by SWR, demo video recorded, blog post draft complete, social media launch calendar created.

---

## Action Plan 4: Launch Plan & Deployment Checklist

**Estimated effort:** 6–8 hours across 1–2 sessions
**Priority:** LAUNCH BLOCKER
**Dependencies:** Action Plans 2 (security) and 8 (Stripe) should be substantially done first

| #    | Item                                                                                             | Current Status                                              | Effort |
| ---- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ------ |
| 4.1  | Write formal Launch Plan document (standalone, comprehensive)                                    | Open                                                        | 2h     |
| 4.2  | Create staging → production deployment checklist (step-by-step)                                  | Open                                                        | 1h     |
| 4.3  | Create production environment in Amplify (connect `main` branch or create dedicated prod branch) | Open — only staging exists                                  | 1h     |
| 4.4  | Create `plg/production/*` secrets in AWS Secrets Manager                                         | Open — identified in secrets audit as deferred Phase 3 item | 30m    |
| 4.5  | Populate production Amplify environment variables (use `scripts/update-amplify-env.sh`)          | Open                                                        | 30m    |
| 4.6  | Deploy CloudFormation stacks to production (`./deploy.sh prod`)                                  | Open                                                        | 1h     |
| 4.7  | Point Stripe webhooks to production URL                                                          | Open                                                        | 15m    |
| 4.8  | Point Keygen webhooks to production URL                                                          | Open                                                        | 15m    |
| 4.9  | Update Cognito callback URLs to include production domain                                        | Open                                                        | 15m    |
| 4.10 | Verify custom domain (hic-ai.com) with SSL certificate                                           | Partial — `staging.hic-ai.com` works                        | 30m    |
| 4.11 | Document rollback procedures (Amplify rollback, CloudFormation rollback, DNS revert)             | Open                                                        | 1h     |
| 4.12 | DNS cut-over plan (staging → production, or parallel deployment)                                 | Open                                                        | 30m    |

**Definition of done:** Launch plan document approved by SWR, production environment created, all secrets populated, CloudFormation deployed, webhooks pointed at production, rollback procedures documented and tested.

---

## Action Plan 5: Documentation Plan

**Estimated effort:** 6–10 hours across 1–2 sessions
**Priority:** High-value, near-blocker (docs link returning 404 = bounce)
**Dependencies:** None

| #   | Item                                                                                    | Current Status                                     | Effort     |
| --- | --------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------- |
| 5.1 | Audit existing docs pages — visit every slug, verify content quality and accuracy       | Partial — `/docs` page exists with dynamic routing | 1h         |
| 5.2 | Write/verify Getting Started guide (VSIX install → license activate → first tool use)   | Open                                               | 2h         |
| 5.3 | Write/verify Troubleshooting guide (common issues, error messages, recovery steps)      | Open                                               | 1h         |
| 5.4 | Write editor-specific instructions (VS Code, Cursor, Kiro) including MCP config details | Partial — multi-client init verified working       | 1h         |
| 5.5 | Write FAQ content covering licensing, activation, team management, supported clients    | Open                                               | 1h         |
| 5.6 | Verify docs link from homepage resolves correctly (no 404)                              | Open                                               | 15m        |
| 5.7 | Add "Getting Help" page linking support@, Discord, GitHub Issues                        | Open                                               | 30m        |
| 5.8 | API reference for webhooks (if applicable for integrators)                              | Open                                               | 1h         |
| 5.9 | Verify installation docs are current (npx references removed per Feb 12 commit)         | Updated Feb 12                                     | 30m verify |

**Definition of done:** Every docs page reviewed for accuracy, Getting Started guide tested by a fresh user (or simulated), no 404s from any navigation link, FAQ covers top anticipated questions.

---

## Action Plan 6: Support Infrastructure

**Estimated effort:** 4–6 hours across 1 session
**Priority:** Should-have for launch; critical for post-launch
**Dependencies:** Documentation (Action Plan 5) should be done first to reduce support volume

| #   | Item                                                                                                                      | Current Status                                      | Effort |
| --- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------ |
| 6.1 | Verify `support@hic-ai.com` routes to SWR's inbox                                                                         | Unclear — SES configured but routing unverified     | 30m    |
| 6.2 | Create auto-reply template ("We received your message, expect response within 24h")                                       | Open                                                | 30m    |
| 6.3 | Create Discord server ("HIC AI Community") with channels (`#general`, `#mouse-help`, `#feature-requests`, `#bug-reports`) | Open — placeholder link `discord.gg/hic-ai` in code | 1h     |
| 6.4 | Update Discord invite link in `src/lib/constants.js` with real URL                                                        | Open                                                | 15m    |
| 6.5 | Create GitHub Issue templates (bug report, feature request) in `.github/ISSUE_TEMPLATE/`                                  | Open                                                | 30m    |
| 6.6 | Add "Report a Bug" link to extension (opens GitHub issue)                                                                 | Open                                                | 30m    |
| 6.7 | Write internal support triage procedures (billing vs bug vs security → routing rules)                                     | Open                                                | 1h     |
| 6.8 | Set up `security@hic-ai.com` with 24h response commitment (if not already done)                                           | Open                                                | 30m    |

**Definition of done:** Test email to support@ reaches SWR, auto-reply confirmed, Discord server live with real invite link, GitHub Issue templates deployed, triage doc written.

---

## Action Plan 7: Email Verification & Deliverability

**Estimated effort:** 3–4 hours across 1 session
**Priority:** LAUNCH BLOCKER
**Dependencies:** None — SES production approved (50K/day, Feb 11)

| #   | Item                                                               | Current Status                                     | Effort     |
| --- | ------------------------------------------------------------------ | -------------------------------------------------- | ---------- |
| 7.1 | Add DMARC DNS record to GoDaddy                                    | Open — DKIM and SPF are done, DMARC not configured | 30m        |
| 7.2 | Test email delivery to Gmail (verify not spam-filtered)            | Open                                               | 30m        |
| 7.3 | Test email delivery to Outlook/Hotmail (verify not spam-filtered)  | Open                                               | 30m        |
| 7.4 | Verify all transactional emails fire correctly:                    | Open                                               | 1h         |
|     | — Welcome email                                                    |                                                    |            |
|     | — License key delivery                                             |                                                    |            |
|     | — Payment confirmation                                             |                                                    |            |
|     | — Payment failed (grace period notification)                       |                                                    |            |
|     | — Subscription cancelled                                           |                                                    |            |
| 7.5 | Set up bounce/complaint monitoring in SES console                  | Open                                               | 30m        |
| 7.6 | Verify duplicate email prevention fix (deployed Feb 14) is holding | ✅ Fix deployed                                    | 15m verify |

**Definition of done:** DMARC record live, test emails reach Gmail and Outlook inboxes (not spam), all transactional email types verified, bounce/complaint monitoring active.

---

## Action Plan 8: Payments & Lemon Squeezy Migration

**Estimated effort:** 6–10 hours across 2–3 sessions (plus LS review wait time of ~1 week)
**Priority:** LAUNCH BLOCKER — LS application is the most time-sensitive item due to external review period
**Dependencies:** Website in presentable shape (AP 1), docs accurate (AP 5), emails working (AP 7) — all strengthen the LS application

### Why This Matters

Without a Merchant of Record (MoR), SWR is personally responsible for calculating, collecting, remitting, and complying with sales tax / VAT / GST obligations in every jurisdiction where a customer purchases a license. A $15/month subscriber in Singapore, Estonia, or South Korea creates immediate tax compliance exposure that is operationally unworkable for a solo founder. Lemon Squeezy acts as MoR, handling all tax obligations globally for a percentage of revenue.

LS previously rejected our application citing lack of "website and social media presence." Both now exist (`staging.hic-ai.com` is live, social accounts can be created). LS invited us to reapply. The application should go out as soon as the website is polished enough to make a strong impression.

**Key insight:** Migrating from Stripe to Lemon Squeezy is significantly easier pre-launch (no existing subscribers to migrate) than post-launch. This is the optimal window.

### Phase A: LS Application (Do Immediately)

| #   | Item                                                                              | Current Status                                 | Effort |
| --- | --------------------------------------------------------------------------------- | ---------------------------------------------- | ------ |
| 8.1 | Ensure website is presentable for LS review (AP 1 items 1.1, 1.5, 1.6 at minimum) | In progress                                    | 2–4h   |
| 8.2 | Ensure documentation is accurate and matches product (AP 5 items 5.1, 5.2, 5.6)   | In progress                                    | 2–4h   |
| 8.3 | Create social media presence (Twitter/X account for HIC AI at minimum)            | Open                                           | 30m    |
| 8.4 | Submit Lemon Squeezy MoR application with link to `staging.hic-ai.com`            | Open — previously rejected, invited to reapply | 30m    |
| 8.5 | Wait for LS review (~1 week estimated)                                            | Blocked on 8.4                                 | 0h     |

### Phase B: Stripe Maintenance (While Waiting for LS)

Keep Stripe operational as fallback and for test validation:

| #   | Item                                                                                           | Current Status                      | Effort |
| --- | ---------------------------------------------------------------------------------------------- | ----------------------------------- | ------ |
| 8.6 | Verify all 4 Stripe test-mode checkout paths still work (Individual/Business × Monthly/Annual) | Open                                | 30m    |
| 8.7 | Create `EARLYADOPTER20` coupon in Stripe (20% off first year, time-boxed)                      | Open                                | 15m    |
| 8.8 | Ensure refund policy is referenced in Terms of Service (policy exists on `/faq`)               | Partial — exists on FAQ, not in ToS | 30m    |

### Phase C: If LS Approves — Migration (Pre-Launch)

| #    | Item                                                                               | Current Status         | Effort |
| ---- | ---------------------------------------------------------------------------------- | ---------------------- | ------ |
| 8.9  | Create LS products + variants (Individual Monthly/Annual, Business Monthly/Annual) | Blocked on LS approval | 1h     |
| 8.10 | Integrate LS checkout SDK / hosted checkout into website (replace Stripe checkout) | Blocked on LS approval | 2–3h   |
| 8.11 | Update webhook handler for LS events (replace Stripe webhook handler)              | Blocked on LS approval | 2–3h   |
| 8.12 | Update license provisioning flow (LS purchase → Keygen license creation)           | Blocked on LS approval | 1–2h   |
| 8.13 | Update Customer Portal link (LS provides its own portal)                           | Blocked on LS approval | 30m    |
| 8.14 | Create `EARLYADOPTER20` equivalent coupon in LS                                    | Blocked on LS approval | 15m    |
| 8.15 | E2E test all 4 checkout paths through LS                                           | Blocked on LS approval | 1h     |
| 8.16 | Remove or archive Stripe integration code                                          | Blocked on LS approval | 30m    |

### Phase D: If LS Rejects — Stripe Live Mode (Fallback)

| #    | Item                                                                   | Current Status               | Effort |
| ---- | ---------------------------------------------------------------------- | ---------------------------- | ------ |
| 8.17 | Switch Stripe from test to live mode                                   | Open — currently `sk_test_*` | 30m    |
| 8.18 | Create live-mode products + price IDs                                  | Open                         | 30m    |
| 8.19 | Update webhook endpoint to production URL with live signing secret     | Open                         | 15m    |
| 8.20 | Test all 4 checkout paths on live mode                                 | Open                         | 1h     |
| 8.21 | Verify proration handling for seat changes                             | Open                         | 30m    |
| 8.22 | Research manual tax compliance obligations (immediate-term workaround) | Open                         | 2h     |
| 8.23 | Reapply to LS again post-launch with demonstrated traction             | Deferred                     | N/A    |

**Definition of done (LS path):** LS application approved, all 4 checkout paths working through LS, webhook events trigger license provisioning, Customer Portal functional, refund policy referenced in ToS.
**Definition of done (Stripe fallback):** Live-mode Stripe configured, all 4 checkout paths tested, webhook receiving confirmed, refund policy in ToS, tax compliance plan documented.

---

## Action Plan 9: Interoperability & Compatibility

**Estimated effort:** 4–6 hours across 1–2 sessions
**Priority:** Contains TIER 1 blockers (items 9.8–9.10 are Phase 6)
**Dependencies:** Mouse v0.10.10 VSIX built

| #    | Item                                                                                    | Current Status                | Effort        |
| ---- | --------------------------------------------------------------------------------------- | ----------------------------- | ------------- |
| 9.1  | Verify VS Code: Initialize Workspace → tool usage E2E                                   | ✅ Confirmed working          | 15m re-verify |
| 9.2  | Verify Cursor: Initialize Workspace → tool usage E2E                                    | ✅ Confirmed working (Feb 15) | 15m re-verify |
| 9.3  | Verify Kiro: Initialize Workspace → tool usage E2E                                      | ✅ Confirmed working (Feb 15) | 15m re-verify |
| 9.4  | Test Roo Code: Initialize Workspace → tool usage E2E                                    | Open                          | 1h            |
| 9.5  | Test Cline: Initialize Workspace → tool usage E2E                                       | Open                          | 1h            |
| 9.6  | Cross-browser portal testing (Chrome, Firefox, Safari, Edge)                            | Open                          | 2h            |
| 9.7  | Mobile responsive portal testing                                                        | Open                          | 1h            |
| 9.8  | **Version update wire-up** — parse `latestVersion` from heartbeat response              | **OPEN — TIER 1 BLOCKER**     | 2–3h          |
| 9.9  | **`Mouse: Update Version` command** — VS Code command to download + install VSIX update | **OPEN — TIER 1 BLOCKER**     | 1–2h          |
| 9.10 | Version notification in status bar or VS Code notification                              | Open                          | 1h            |

> **Critical note:** Items 9.8–9.10 constitute the remaining **Phase 6** work and are Tier 1 launch blockers. The server side already returns `latestVersion`, `updateUrl`, `releaseNotesUrl`, and `readyVersion` in heartbeat responses. The client side currently **ignores these fields**. This is the last true feature gap before launch.

**Definition of done:** All supported clients tested with Initialize Workspace, version update notification fires when newer version available, `Mouse: Update Version` command downloads and installs VSIX, cross-browser portal check passed.

---

## Action Plan 10: Monitoring & Observability

**Estimated effort:** 6–8 hours across 1–2 sessions
**Priority:** LAUNCH BLOCKER (items 10.1–10.6)
**Dependencies:** Structured logging complete (✅ done Feb 15)
**Reference:** `20260215_RECOMMENDATIONS_RE_PRE_LAUNCH_MONITORING_ENHANCEMENTS.md`

| #     | Item                                                                                            | Current Status                                                       | Effort |
| ----- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------ |
| 10.1  | Create `/api/health` endpoint (returns 200 + DynamoDB connectivity check)                       | **Does not exist — CRITICAL**                                        | 30m    |
| 10.2  | Add CloudWatch metric filters + alarms for Amplify SSR log group                                | **Not done — CRITICAL** (logging data flows but nobody is listening) | 2–3h   |
| 10.3  | Set CloudWatch log group retention policy (14 or 30 days)                                       | Not done — **unbounded cost risk**                                   | 15m    |
| 10.4  | Add Amplify SSR log group to CloudFormation (currently manually created)                        | Not done                                                             | 30m    |
| 10.5  | Define severity levels (P1: site down, P2: payment failure, P3: feature degraded, P4: cosmetic) | Not done                                                             | 30m    |
| 10.6  | Write minimal incident runbook (site down, payment failure, auth failure recovery steps)        | Not done — 5/8 TODO-19 items done, 3 remain                          | 1h     |
| 10.7  | Verify DynamoDB Point-in-Time Recovery (PITR) is enabled                                        | Open                                                                 | 15m    |
| 10.8  | Document backup restore procedure with step-by-step instructions                                | Open                                                                 | 30m    |
| 10.9  | CloudWatch dashboard for launch day (Lambda invocations, errors, latency, DynamoDB capacity)    | Open — high-value                                                    | 1–2h   |
| 10.10 | External uptime monitoring (UptimeRobot or Better Stack free tier)                              | Open                                                                 | 30m    |

**What's already done:**

- Structured logging across all 33 handlers in 24 route files (CloudWatch)
- DLQ depth alarms for Stripe and email queues
- Lambda error rate alarm (`plg-high-error-rate-staging`)
- Payment failure alarm (`plg-payment-failures-staging`)
- Email failure alarm (`plg-email-failures-staging`)
- SNS → email subscription confirmed (`alerts@hic-ai.com` → `sreiff@hic-ai.com`)

**Definition of done:** `/api/health` returns 200, metric filters alarm on 5xx errors and latency spikes, log retention set, severity levels defined, runbook exists for top 3 failure modes, PITR confirmed.

---

## Action Plan 11: Legal Review

**Estimated effort:** 4–6 hours across 1–2 sessions
**Priority:** LAUNCH BLOCKER (Privacy/ToS must be live and accurate before payments)
**Dependencies:** None

| #     | Item                                                                                           | Current Status               | Effort |
| ----- | ---------------------------------------------------------------------------------------------- | ---------------------------- | ------ |
| 11.1  | Final review of Privacy Policy (`/privacy`) — verify accuracy, update for current architecture | Page exists at `/privacy`    | 1h     |
| 11.2  | Final review of Terms of Service (`/terms`) — verify accuracy, update pricing/product details  | Page exists at `/terms`      | 1h     |
| 11.3  | Ensure ToS references refund policy (policy exists on `/faq`, needs ToS cross-reference)       | Partial — on FAQ, not in ToS | 30m    |
| 11.4  | Verify Privacy Policy mentions "no tracking cookies" and that Plausible is deferred            | Open                         | 15m    |
| 11.5  | IP review of all public-facing documentation content                                           | Open                         | 1–2h   |
| 11.6  | IP review of FAQ content for proprietary detail exposure                                       | Open                         | 30m    |
| 11.7  | Remove or generalize sensitive technical details from any public docs                          | Open                         | 1h     |
| 11.8  | File copyright application (Register Mouse software copyright)                                 | Open                         | 1h     |
| 11.9  | Evaluate provisional patent application (if applicable)                                        | Open                         | TBD    |
| 11.10 | Set up branch protection rules on both repos (`development` → PR required)                     | Open                         | 30m    |

**Definition of done:** Privacy Policy and ToS reviewed by SWR (as attorney), refund policy cross-referenced in ToS (source on FAQ), no proprietary details exposed in public content, branch protection enabled.

---

## Action Plan 12: Personal Social Media Cleanup

**Estimated effort:** 1–2 hours
**Priority:** Pre-launch (12b is a public disclosure event — must follow AP 13)
**Dependencies:** 12a: None; 12b: AP 13 (all private disclosures completed)

AP 12 is split into two sub-tasks with different risk profiles:

| #   | Item                                                                                    | Current Status | Effort | Risk Profile                                      |
| --- | --------------------------------------------------------------------------------------- | -------------- | ------ | ------------------------------------------------- |
| 12a | Delete personal Facebook account (reduces public surface area, zero disclosure content) | Open           | 30m    | Safe anytime — no signal                          |
| 12b | Update LinkedIn profile (headline, about, experience entry for HIC AI Inc.)             | Open           | 1h     | **Disclosure event** — irreversible public signal |

**Key constraint:** 12b (LinkedIn update) is an irreversible public disclosure. Once updated, the professional network sees the venture. This creates a hard dependency: AP 13 (private disclosures) must be fully complete before 12b.

**Definition of done:** Facebook account deleted or deactivated. LinkedIn updated with HIC AI Inc. details. All updates made only after AP 13 private disclosures are complete.

---

## Action Plan 13: Private Pre-Launch Disclosure

**Estimated effort:** 3–5 days (elapsed time; actual effort ~3–5 hours across conversations)
**Priority:** Pre-launch (blocks AP 12b; fits perfectly in LS wait window)
**Dependencies:** AP 8A submitted (provides certainty of direction)

Private, in-person or direct conversations with key individuals before any public disclosure.

| #    | Item                                                                                  | Current Status | Effort    | Sequencing                                         |
| ---- | ------------------------------------------------------------------------------------- | -------------- | --------- | -------------------------------------------------- |
| 13.1 | Disclose to law firm partner (professional courtesy, potential conflict check)        | Open           | 1 meeting | **First** — professional obligation                |
| 13.2 | Disclose to key client (strategic — $4B fund manager who is also a software engineer) | Open           | 1 meeting | **Second** — highest-value early adopter candidate |
| 13.3 | Disclose to remaining close contacts (friends, family, select colleagues)             | Open           | 1–3 days  | **Third** — broader circle, lower urgency          |
| 13.4 | Observe silence period (allow private disclosures to settle before public signal)     | Open           | 1–2 days  | **Fourth** — buffer before AP 12b                  |

**Sequencing rationale:** Partner first (professional obligation and potential conflict), key client second (strategic relationship — a $4B fund manager who happens to be a software engineer is the ideal early-adopter), remaining contacts third, then a silence buffer before the irreversible LinkedIn update.

**Definition of done:** All planned private conversations completed. Silence period observed. SWR confirms readiness for public disclosure (AP 12b).

---

## Recommended Execution Order

### Immediate Priority: LS Application Prerequisites

The Lemon Squeezy application has an external dependency (~1 week review time) that makes it the most time-sensitive item. Work should be front-loaded to get the application submitted ASAP, then other critical-path items can proceed in parallel while waiting for LS review.

| Order | Action Plan                                         | Key Rationale                                                       |
| ----- | --------------------------------------------------- | ------------------------------------------------------------------- |
| **1** | **AP 1 (essential items)** — Website polish         | LS requires a presentable website; fix broken links, proofread copy |
| **1a** | **AP 9 (items 9.1–9.7)** — E2E client verification (hic repo) | Verify all 5 clients E2E before writing docs; claims must match reality |
| **2** | **AP 5 (essential items)** — Documentation accuracy | LS will review docs; must describe verified per-client flows (needs AP 9.1–9.7) |
| **3** | **AP 2a** — Website surface security review         | Catch visible vulnerabilities before LS reviewer sees the site      |
| **4** | **AP 7 (item 7.1)** — DMARC record                  | Quick DNS change; improves email deliverability before LS reviews   |
| **5** | **AP 8 Phase A** — Submit LS application            | Submit ASAP; ~1 week external wait time                             |

### While Waiting for LS Review (~1 week): Critical Path

| Order  | Action Plan                                           | Key Rationale                                                    |
| ------ | ----------------------------------------------------- | ---------------------------------------------------------------- |
| **6**  | **AP 9 (items 9.8–9.10)** — Version update wire-up    | Last true Tier 1 feature blocker; everything else is operational |
| **7**  | **AP 10 (items 10.1–10.6)** — Monitoring essentials   | Cannot launch blind; need health endpoint and alarms             |
| **8**  | **AP 2b** — Comprehensive security audit              | Formal SAST + auth review covering both repos; builds on AP 2a   |
| **9**  | **AP 11** — Legal review                              | Privacy/ToS must be accurate before accepting payments           |
| **9a** | **AP 12a** — Delete Facebook                          | Zero-risk cleanup; can be done anytime during wait               |
| **9b** | **AP 13** — Private disclosures (13.1→13.2→13.3→13.4) | Fits LS wait window; must complete before AP 12b                 |
| **9c** | **AP 12b** — Update LinkedIn                          | After AP 13 completes; irreversible public disclosure            |
| **10** | **AP 7 (remaining items)** — Email deliverability     | DMARC + verification of all transactional email flows            |

### On LS Decision: Payment Integration

| Order  | Action Plan                                                 | Key Rationale                                                   |
| ------ | ----------------------------------------------------------- | --------------------------------------------------------------- |
| **11** | **AP 8 Phase C** (if approved) or **Phase D** (if rejected) | Payment integration is gate to production launch                |
| **12** | **AP 4** — Launch plan + production deployment              | Creates the production environment; depends on payment decision |

### High-Value Work (parallel with critical path where possible)

| Order  | Action Plan                 | Key Rationale                                    |
| ------ | --------------------------- | ------------------------------------------------ |
| **13** | **AP 5 (remaining)** — Docs | Can work in parallel; reduces support burden     |
| **14** | **AP 1 (remaining)** — UX   | Can work in parallel; improves first impressions |
| **15** | **AP 6** — Support setup    | Should be ready at launch                        |
| **16** | **AP 3** — Marketing        | Post-launch OK but prepare materials in advance  |

### Parallelization Opportunities

- **AP 1 → AP 9.1–9.7 → AP 5** are sequential (verify clients before writing docs); **AP 11** can run in parallel with any of them
- **AP 7 item 7.1** (DMARC) can be done in minutes — do it first
- **AP 2a** can run pre-LS (website surface review has no hard dependencies); **AP 2b** starts after AP 9 feature code finalizes
- **AP 9 (9.8–9.10)** is the only feature development work and can start any time
- Most critical-path work (AP 2, 7, 9, 10, 11) can proceed during LS review wait

---

## Bottom Line

The project's actual state is dramatically ahead of what the PLG Roadmap v7.0 documents. The largest body of technical work — multi-seat device management Phase 3 — is complete. Security hardening that the roadmap called "blocked" is well underway. The extension works across 3 clients (VS Code, Cursor, Kiro) with CJS compatibility. 3,459 tests pass with zero failures.

**The true distance to launch is approximately 45–65 hours of focused work** across the 13 action plans (11 technical/operational + 2 personal/disclosure), of which perhaps 25–35 hours are on the critical path. The remaining work is predominantly operational (deploy to production, integrate payment provider, verify emails, write launch plan) and quality assurance (security audit, legal review, monitoring) rather than new feature development. The sole remaining feature gap is the version update wire-up (Action Plan 9, items 9.8–9.10), estimated at 4–6 hours.

**Critical sequencing insight:** The Lemon Squeezy MoR application is the single most time-sensitive item because it has an external review period (~1 week) that cannot be compressed. Submitting the application early — after minimal website polish and docs cleanup — allows all other critical-path work to proceed in parallel. If LS approves, payment migration is straightforward pre-launch (no existing subscribers). If LS rejects, Stripe live mode is a well-understood fallback with the significant caveat that SWR would bear global tax compliance obligations directly until an MoR is eventually secured.

**Next steps:** Generate detailed standalone versions of each action plan, then update the PLG Roadmap to v8.0 reflecting all progress and the precise remaining work.
