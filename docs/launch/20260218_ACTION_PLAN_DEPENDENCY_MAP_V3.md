# Action Plan Dependency Map v3

**Date:** February 18, 2026 (v3; supersedes v2)
**Author:** General Counsel
**Purpose:** Authoritative sequencing reference for all pre-launch action plans. Shows which plans depend on which others, what checkpoints gate progression, where parallel work is safe, and how phases interleave across action plans. Companion to `20260218_PRE_LAUNCH_STATUS_ASSESSMENT_AND_ACTION_PLANS_V3.md` and `20260218_OPEN_DECISIONS.md`.

---

## Table of Contents

1. [What Changed from v2](#1-what-changed-from-v2)
2. [Structural Overview: Linear Phased Execution](#2-structural-overview-linear-phased-execution)
3. [Phase 0: Quick Wins & Initial Setup (Gate)](#3-phase-0-quick-wins--initial-setup-gate)
4. [Phase 1: Feature Completion & SMP Code Prep](#4-phase-1-feature-completion--smp-code-prep)
5. [Phase 2: Website, Documentation & Legal](#5-phase-2-website-documentation--legal)
6. [Phase 3: Security, Monitoring & SMP Finalization](#6-phase-3-security-monitoring--smp-finalization)
7. [Phase 4: Production Deployment](#7-phase-4-production-deployment)
8. [Phase 5: Launch Sequence](#8-phase-5-launch-sequence)
9. [Full Dependency Graph](#9-full-dependency-graph)
10. [Checkpoint Definitions](#10-checkpoint-definitions)
11. [Action Plan Dependency Detail](#11-action-plan-dependency-detail)
12. [What Can Run in Parallel](#12-what-can-run-in-parallel)
13. [SWR Attorney & Personal Track](#13-swr-attorney--personal-track)
14. [Day-by-Day Timeline](#14-day-by-day-timeline)

---

## 1. What Changed from v2

v2 (Feb 18) was built around a two-track model: Track A (website + MoR application) and Track B (extension + audit), separated by a ~1-week external MoR review wait window. Three developments invalidated that architecture:

1. **SMP eliminates the MoR application wait.** Stripe Managed Payments is an existing feature within our Stripe integration — parameter-level code changes, no external vendor application, no review period. The ~1-week wait that separated Tracks A and B no longer exists.
2. **SEQ-1 resolved: features first.** SWR directed that feature completion (AP 9 version wire-up, E2E client verification) should precede documentation and front-end polish. Rationale: completed features produce E2E screenshots that feed directly into AP 5 docs and AP 1 front-end, avoiding double-work.
3. **B-D7 resolved: 14-day log retention.** Removes the last variable from AP 10 cost modeling.

| Area | v2 | v3 |
|------|-----|-----|
| **Architecture** | Two-track (Track A + Track B) separated by MoR wait | Linear phased execution — 6 phases in dependency order |
| **Feature timing** | Track B (extension) deferred to MoR wait window | Phase 1 — features first, immediately after Phase 0 |
| **MoR strategy** | LS + Paddle dual application → ~1 week external wait | SMP activation — parameter-level Stripe changes, no wait |
| **Docs/front-end timing** | Track A Levels 2–3 (before MoR submission) | Phase 2 — after feature completion, informed by real product |
| **Security audit** | Track B during MoR wait window | Phase 3 — after all feature code finalized |
| **Production deployment** | C1–C4 phased cutover (Days 10–15) | Phase 4 — linear (Phased C1–C4 preserved internally) |
| **Log retention** | B-D7 unresolved | B-D7 resolved: 14 days (Open Decisions Register, Feb 18) |
| **Timeline** | ~15 working days (7 external wait) | ~10 working days (no external wait except 24–48h Marketplace) |
| **Open decisions** | Scattered across documents | Centralized in Open Decisions Register |

---

## 2. Structural Overview: Linear Phased Execution

```
Phase 0 ─── Quick Wins & Setup (~3.5h)
    │         AP 0  │  SWR: begin SMP terms review
    │
Phase 1 ─── Feature Completion (~2–3 days)
    │         AP 9  │  AP 7  [Stream 1B deferred → Phase 3 Stream 3C]
    │
Phase 2 ─── Website, Documentation & Legal (~2–3 days)
    │         AP 11.4 → AP 11.1–11.3 → AP 1 → AP 5
    │         AP 12 Phases 1–2  │  AP 2a
    │
Phase 3 ─── Security, Monitoring & SMP Finalization (~2–2.5 days)
    │         AP 2b  │  AP 10  │  AP 8 Phases 1–3  │  AP 6
    │
Phase 4 ─── Production Deployment (~1–2 days)
    │         AP 4 P0–P7  │  AP 8 Phase 4  │  B-D3 decision
    │
Phase 5 ─── Launch Sequence (~2–3 days)
              AP 4 P8–P9  │  AP 8 Phase 5  │  Marketplace
              AP 13 → AP 12 Phase 3 → LAUNCH
```

**Why this structure?** Each phase produces outputs that the next phase consumes. Phase 0 retires quick risks. Phase 1 finalizes the product (features + payment code). Phase 2 documents and polishes the finalized product. Phase 3 audits and monitors the documented product. Phase 4 deploys the audited product. Phase 5 verifies and launches.

**SWR attorney track** runs in parallel throughout — SMP terms review can begin during Phase 0, with GO/NO-GO needed by Phase 3. Legal review (Privacy/ToS) slots into Phase 2. Patent and IP review proceed during Phase 3+. See §13.

---

## 3. Phase 0: Quick Wins & Initial Setup (Gate)

**Reference:** [AP 0 V2](20260218_AP0_QUICK_WINS_AND_INITIAL_SETUP_V2.md)
**Estimated time:** ~3–3.5 hours
**Dependencies:** None — this is the starting gate

Phase 0 consolidates all fast, zero-dependency tasks. Every item either unblocks downstream work or retires a risk in under 30 minutes.

### Phase 0 Items

| # | Item | Group | Effort | Unlocks |
|---|------|-------|--------|---------|
| 0.1 | Keygen policy verification | Research | 15 min | AP 9 E2E, AP 4 production (prevents silent failure) |
| 0.2 | VS Code Marketplace publisher verification | Research | 15 min | Phase 5 Marketplace submission |
| 0.3 | Twitter/X business account research | Research | 15–30 min | AP 12 Phase 2 → Open Decisions D-5, AP12-H (completed Feb 21) |
| 0.4 | Investigate production `API_BASE_URL` mechanism | Research | 30 min | Open Decisions B-D8, AP 4, AP 9 |
| 0.5 | Fix `setup-cognito.sh` ENVIRONMENT hardcoding | Quick Fix | 5 min | AP 4 P1 |
| 0.6 | Remove orphaned `vscode://` callback URI | Quick Fix | 2 min | Cognito cleanup |
| 0.7 | DMARC record (`_dmarc.hic-ai.com`) | DNS/Infra | 5 min | AP 7 email deliverability |
| 0.8 | Verify all 4 Stripe test-mode checkout paths | SMP Prep | 30 min | AP 8 Phase 1 baseline |
| 0.9 | Stripe checkout audit (forbidden parameters) | SMP Prep | 30 min | AP 8 Phase 2 scope |
| 0.10 | SMP Integration Validation | SMP Prep | 30 min | AP 8 Phases 2–5 readiness |

### Phase 0 Sequencing

Most items are fully independent. One chain: **0.8 → 0.9** (verify current behavior before auditing parameters).

Items 0.8–0.10 overlap with AP 8 Phase 1 (Assessment & Legal Review). The Phase 0 items establish the technical baseline; the attorney review (AP 8 §4, step 1.4) runs in parallel on SWR's track.

### Phase 0 Checkpoint (CP-0)

**Verification:** All 10 items complete. DMARC propagating. Publisher account verified. `API_BASE_URL` mechanism documented. SMP baseline established.
**Unlocks:** Phase 1.

---

## 4. Phase 1: Feature Completion & SMP Code Prep

**Estimated time:** ~2–3 days
**Dependencies:** Phase 0 complete

Phase 1 has three parallel streams. All are independent of each other and can proceed simultaneously.

### Stream 1A: Version Update Wire-up (AP 9.8–9.10)

**Open Decision B-D1 (merged with B-D2):** Immediately before starting this stream, SWR resolves the merged B-D1 decision: keep the custom version notification layer (`/api/version` + `checkForUpdates()` + status bar alert), or rely entirely on VS Code's built-in extension update system. See Open Decisions Register §3c.

**Context:** Feb 16 investigation confirmed that `heartbeat.onSuccess` version parsing, `mouse.checkForUpdates`, `mouse.showUpdateInfo`, and `StatusBarManager.showUpdateAvailable()` are **already implemented.** Scope may be verification + minor cleanup rather than new development.

| # | Item | Status | Effort |
|---|------|--------|--------|
| 9.8 | Parse `latestVersion` from heartbeat response | B-D1 resolved: remove `checkForUpdates()` | Included in combined Stream 1A (~2.5h total) |
| 9.9 | `Mouse: Update Version` command | B-D1 resolved: version via heartbeat only | Included in combined Stream 1A (~2.5h total) |
| 9.10 | Version notification (status bar) | B-D1 resolved: heartbeat-delivered path | Included in combined Stream 1A (~2.5h total) |

Also includes Phase 4 heartbeat status alignment (fix-or-defer decision — Open Decisions AP9-HB, §3c) and VSIX distribution cleanup.

- **Checkpoint (CP-9):** Version notification functional (if B-D1 = keep), or custom code removed (if B-D1 = remove). All tests pass.
- **Unlocks:** Phase 2 (docs describe finalized features), Phase 3 (security audit covers final code)

### ~~Stream 1B: SMP Code Integration — AP 8 AR Phases 1–2~~ — DEFERRED TO PHASE 3 STREAM 3C

> **⚠️ DEFERRED (Feb 24, DEFER-1B):** All Stream 1B work has been moved to Phase 3 Stream 3C. Rationale: avoid premature SMP activation before website/legal/social are complete; consolidate all Stripe/SMP work into a single Phase 3 session. Zero Phase 2 impact confirmed. See deferral recommendation memo and DEFER-1B decision in Execution Tracker §3.

- **CP-SMP-2** is now an internal milestone within Phase 3 Stream 3C Part 1 — it no longer gates Phase 3 from Phase 1.
- **Unlocks:** N/A — absorbed into Phase 3 Stream 3C.

### Stream 1C: Email Deliverability (AP 7.2–7.6)

Can start as soon as DMARC (Phase 0 item 0.7) is propagating. Independent of Streams 1A and 1B.

| # | Item | Effort |
|---|------|--------|
| 7.2 | Test email delivery to Gmail (not spam) | 30 min |
| 7.3 | Test email delivery to Outlook/Hotmail (not spam) | 30 min |
| 7.4 | Verify all transactional email types fire | 1h |
| 7.5 | Bounce/complaint monitoring in SES | 30 min |
| 7.6 | Verify duplicate email prevention fix | 15 min |

**Reference:** [Assessment V3 §8.5](20260218_PRE_LAUNCH_STATUS_ASSESSMENT_AND_ACTION_PLANS_V3.md)

- **Checkpoint (CP-13):** Gmail/Outlook inboxes (not spam), all types verified, bounce monitoring active.
- **Unlocks:** Phase 4 (emails must work before production payments)

### Stream 1D: E2E Client Verification (AP 9.1–9.7)

Smoke-test installation, activation, and MCP tool invocation for each supported client. Can start immediately after Phase 0; benefits from Stream 1A completion (if version notification is included, verify it too).

| # | Item | Status | Effort |
|---|------|--------|--------|
| 9.1 | VS Code: Initialize Workspace → tool usage | ✅ Confirmed | 15 min re-verify |
| 9.2 | Cursor: Initialize Workspace → tool usage | ✅ Confirmed | 15 min re-verify |
| 9.3 | Kiro: Initialize Workspace → tool usage | ✅ Confirmed | 15 min re-verify |
| 9.4 | Roo Code: Initialize Workspace → tool usage | Open | 1h |
| 9.5 | Cline: Initialize Workspace → tool usage | Open | 1h |

**Open Decision AP5-Q2:** Supported clients for Tier 1 docs (Copilot + Cursor recommended, others Tier 2). Items 9.4–9.5 still needed for compatibility claims even if docs are Tier 2.

- **Checkpoint (CP-E2E):** All supported clients verified. Client compatibility matrix confirmed.
- **Unlocks:** Phase 2 AP 5 (docs describe verified flows)

### Phase 1 Summary

| Stream | Work | Effort | Parallel? |
|--------|------|--------|-----------|
| 1A | Version wire-up (AP 9.8–9.10) | 4–6h (may shrink) | ✅ Independent |
| ~~1B~~ | ~~SMP code integration (AP 8 Phases 1–2)~~ | ~~3–4h~~ | DEFERRED → Phase 3 Stream 3C |
| 1C | Email deliverability (AP 7) | 2.5–3h | ✅ Independent |
| 1D | E2E client verification (AP 9.1–9.7) | 2–3h | ✅ Independent |

**Total effort:** ~8–12h (3 active streams). **Elapsed time** with single-developer interleaving: ~2 days.

---

## 5. Phase 2: Website, Documentation & Legal

**Estimated time:** ~2–3 days
**Dependencies:** Phase 1 complete (features finalized, E2E verified, email working)

Phase 2 documents and polishes the finalized product. The internal sequencing within Phase 2 is important — legal review must precede full-site proofreading (don't proofread pages that will change), and docs must follow E2E verification (describe verified flows, not assumptions).

### Step 2A: Plausible Analytics Integration (AP 11.4)

Wire up Plausible analytics on staging. Must precede Privacy Policy because the policy must accurately describe analytics.

- **Effort:** 30 min
- **Checkpoint (CP-1):** Plausible script on staging, data flowing in dashboard.
- **Unlocks:** Step 2B (Privacy Policy)

### Step 2B: Legal Review — Privacy Policy & ToS (AP 11.1–11.3)

SWR reviews Privacy Policy and ToS as attorney. Privacy Policy must reflect Plausible (cookieless), Cognito, DynamoDB, SES, SMP/Link as payment processor. ToS must cross-reference refund policy per SMP's 60-day discretion (AP 8 AR §7.2).

- **Depends on:** 2A (Plausible wired up so policy is accurate)
- **Effort:** 2–2.5h
- **Checkpoint (CP-2):** Privacy Policy and ToS updated on staging, approved by SWR.
- **Unlocks:** 2C (front-end polish), Phase 4 (legal accurate before production)

### Step 2C: Front-End UX & Content Polish (AP 1)

Proofread all copy, fix broken links, add sitemap, verify OG image, responsive check. Informed by completed features (Phase 1) and finalized legal pages (2B).

- **Depends on:** 2B (legal pages finalized)
- **Reference:** [AP 1 V2](20260218_AP1_FRONT_END_UX_PRIORITIZATION_PLAN_V2.md)
- **Effort:** 5–6h (Tier 1–2 items)
- **Checkpoint (CP-4):** All pages proofread, no 404s, sitemap live, responsive check passed, OG image verified.
- **Unlocks:** 2E (docs on polished site), AP 12 Phase 2 (website to link to)

### Step 2D: AP 12 Phases 1–2 — Social Media Presence

**Phase 1** (parallel with 2A–2C): Personal account audit across platforms (~1.5–2h). Delete Facebook.

**Phase 2** (after 2C near-complete): Create HIC AI Twitter/X and LinkedIn company accounts. Populate with real content. Cross-link website ↔ social.

- **Reference:** [AP 12 V2](20260218_AP12_SOCIAL_MEDIA_SEO_AND_CONTENT_DISTRIBUTION_PLAN_V2.md)
- **Effort:** Phase 1: 1.5–2h | Phase 2: 2–3h
- **Checkpoint (CP-7):** HIC AI accounts exist with bio, link to hic-ai.com, real content.

> **Critical distinction:** Company accounts (Phase 2) are safe before private disclosures. SWR's personal LinkedIn update (Phase 3, item 3.6) is the disclosure event and must wait for AP 13 completion. See §13.

### Step 2E: Documentation Accuracy (AP 5 Tier 1)

Audit and rewrite docs pages. Describes verified per-client flows (from Phase 1 E2E verification) on a polished site (from 2C).

- **Depends on:** Phase 1 CP-E2E (clients verified), 2C (site polished)
- **Reference:** [AP 5 V2](20260218_AP5_DOCUMENTATION_STRATEGY_V2.md)
- **Effort:** ~6.5h (Tier 1 items)
- **Checkpoint (CP-5):** Every docs slug visited, content verified, no 404s from navigation.
- **Unlocks:** Phase 3 AP 2b (audit covers documented product), AP 6 (support references docs)

### Step 2F: Website Surface Security Review (AP 2a)

Focused security review of the public-facing website. Not the comprehensive audit (AP 2b in Phase 3) — specifically production readiness of the web surface.

- **Depends on:** 2C near-complete (site in final state), or parallel with 2D/2E (API routes independent of content)
- **Reference:** [Assessment V3 §8.1](20260218_PRE_LAUNCH_STATUS_ASSESSMENT_AND_ACTION_PLANS_V3.md)
- **Effort:** 2–3h
- **Checkpoint (CP-10a):** `npm audit` clean or criticals documented, unauthenticated endpoints reviewed, HTTP headers confirmed, no secrets in client bundle.

### Phase 2 Summary

| Step | Work | Effort | Sequencing |
|------|------|--------|------------|
| 2A | Plausible integration | 30 min | First |
| 2B | Legal review (Privacy/ToS) | 2–2.5h | After 2A |
| 2C | Front-end UX polish (AP 1) | 5–6h | After 2B |
| 2D | Social media Phases 1–2 (AP 12) | 3.5–5h | Phase 1 parallel; Phase 2 after 2C |
| 2E | Documentation Tier 1 (AP 5) | 6.5h | After Phase 1 E2E + 2C |
| 2F | Website surface security (AP 2a) | 2–3h | Parallel with 2D/2E |

**Total effort:** ~20–23h. **Elapsed time:** ~2–3 days.

---

## 6. Phase 3: Security, Monitoring & SMP Finalization

**Estimated time:** ~2 days
**Dependencies:** Phase 1 complete (feature code finalized), Phase 2 complete (docs finalized for IP review)

Phase 3 audits and monitors the finalized product. SMP finalization (Phase 3 of AP 8 AR) also slots here — it requires the SMP-GO attorney decision.

### Stream 3A: Comprehensive Security Audit (AP 2b)

Full SAST scan, auth flow review, authorization review, `package.json` audit across both repos. Must come after Phase 1 (auditing code that's about to change is wasted effort). Builds on AP 2a (Phase 2 Step 2F).

**Open Decisions:** B-D4 (SAST tool), B-D5 (`package.json` standardization), B-D6 (findings memo format) — resolve at start of this stream.

Includes operational security hardening: 2FA on GitHub org, Stripe, Keygen dashboards; AWS budget alerts; Lambda concurrency review.

- **Reference:** [Assessment V3 §8.2](20260218_PRE_LAUNCH_STATUS_ASSESSMENT_AND_ACTION_PLANS_V3.md)
- **Effort:** 5–6h (code audit + operational)
- **Checkpoint (CP-11):** SAST clean or triaged, `npm audit` clean, auth review documented with CWE/CVE refs, 2FA on all critical accounts.
- **Unlocks:** Phase 4 (cannot deploy without security sign-off)

### Stream 3B: Monitoring & Observability (AP 10.1–10.9)

Health endpoint, metric filters, log retention (14 days, B-D7 resolved), severity definitions, incident runbook, PITR verification (Open Decisions AP4-D5), backup restore procedure, CloudWatch launch dashboard.

- **Reference:** [Assessment V3 §8.7](20260218_PRE_LAUNCH_STATUS_ASSESSMENT_AND_ACTION_PLANS_V3.md)
- **Effort:** 6–8h
- **Checkpoint (CP-12):** `/api/health` returns 200, metric filters alarming on 5xx/latency, log retention set to 14 days, severity levels defined, runbook exists, PITR confirmed, launch dashboard ready.
- **Unlocks:** Phase 4 (cannot deploy without monitoring)

### Stream 3C: SMP Complete — AP 8 AR Phases 1–2 + Phase 3 (EXPANDED)

Consolidated Stripe/SMP stream. Absorbs all Stream 1B work (DEFER-1B, Feb 24) as Part 1, then executes original Phase 3 dashboard finalization as Part 2. Executed in sequence within the stream.

**Gate: SMP-GO decision** (Open Decisions #28). ✅ **Resolved Feb 23, 2026.** SWR completed comprehensive attorney review of all Stripe documentation and issued GO. This stream is unblocked. CP-SMP-2 (formerly a Phase 1 gate) is now an internal milestone within Part 1.

- **Reference:** [AP 8 AR §4–6](20260218_AP8_MOR_STRATEGY_AND_PAYMENT_INTEGRATION_AR.md)
- **Effort:** ~5–7h (up from ~30 min; now the largest single stream in Phase 3)
- **Checkpoint (CP-SMP-3):** SMP parameters added, forbidden params removed, all 4 checkout paths verified E2E in test mode, webhooks confirmed, all tests pass, 2FA on Stripe, SMP setup complete, tax categories confirmed, notifications configured.
- **Unlocks:** Phase 4 (SMP ready for production promotion)

### Stream 3D: Support Infrastructure (AP 6)

Verify email routing, auto-reply, Discord server, GitHub Issue templates, support triage.

- **Reference:** [Assessment V3 §8.4](20260218_PRE_LAUNCH_STATUS_ASSESSMENT_AND_ACTION_PLANS_V3.md)
- **Effort:** 4–6h
- **Checkpoint (CP-6):** `support@` reaches SWR, auto-reply works, Discord live, GitHub Issue templates deployed.

### Stream 3E: Branch Protection Rules

Configure `main` branch protection on both repos: prevent force-pushes, prevent deletion, optionally require status checks. No PR requirement — SWR's `development`-first workflow is the primary gate. Independent, 10 minutes. See [Pre-Launch Git Branch Strategy Recommendations](../plg/20260222_PRE_LAUNCH_GIT_BRANCH_STRATEGY_RECOMMENDATIONS.md).

### Phase 3 Summary

| Stream | Work | Effort | Parallel? |
|--------|------|--------|-----------|
| 3A | Security audit (AP 2b) | 5–6h | ✅ Independent of 3B–3E |
| 3B | Monitoring (AP 10) | 6–8h | ✅ Independent of 3A, 3C–3E |
| 3C | SMP complete — AP 8 AR Phases 1–3 (EXPANDED) | ~5–7h | ✅ SMP-GO resolved Feb 23; independent of 3A/3B/3D/3E |
| 3D | Support infrastructure (AP 6) | 4–6h | ✅ Independent |
| 3E | Branch protection (`main` only, no PR req) | 10 min | ✅ Independent |

**Total effort:** ~21–28h. **Elapsed time:** ~2–2.5 days (streams run in parallel; 3C is now the longest stream).

---

## 7. Phase 4: Production Deployment

**Estimated time:** ~1–2 days
**Dependencies:** Phase 3 complete (security audit ✅, monitoring in place ✅, SMP finalized ✅)

Phase 4 is the convergence gate. All prior work feeds into deploying the audited, documented, payment-ready product to production.

**Open Decision B-D3:** SWR resolves EventBridge `readyVersion` gating (deploy or launch without) at the start of this phase. See Open Decisions Register §3b.

### Step 4A: AP 4 P0–P3 — Foundation

| Step | Item | Effort |
|------|------|--------|
| P0 | Naming standardization (`prod` → `production`) | 1.5–2h (per Recommendations memo §3.3; no migration — production S3 buckets don't exist yet) |
| P1 | Cognito production pool + Google OAuth client (D-2) + SES sender (D-3) | 1–2h |
| P2 | CloudFormation `hic-plg-production` stack deployment | 1–2h |
| P3 | Populate production Secrets Manager | 30 min |

**Reference:** [AP 4 V2](20260218_AP4_SWITCH_TO_PRODUCTION_PLAN_V2.md) — P0–P3

### Step 4B: AP 4 P4–P5 + AP 8 Phase 4 — Environment & Payment Setup

| Step | Item | Effort |
|------|------|--------|
| P4 | Create Amplify production branch (same app `d2yhz9h4xdd5rb`, `main` branch — D-1) | 30 min |
| P5 | Verify Amplify build succeeds | 30 min |
| AP 8 4.1 | Create live-mode Stripe products + prices ($15/mo, $150/yr, $35/seat/mo, $350/seat/yr) | 30 min |
| AP 8 4.2 | Create live-mode webhook endpoint | 15 min |
| AP 8 4.3 | Populate Stripe production secrets | 15 min |
| AP 8 4.4 | Set Amplify production Stripe env vars | 15 min |
| AP 8 4.5 | Confirm SMP active in live mode (Open Decisions AP8-D5) | 5 min |
| AP 8 4.6 | Confirm Keygen production webhook | 5 min |

**Reference:** [AP 8 AR §7](20260218_AP8_MOR_STRATEGY_AND_PAYMENT_INTEGRATION_AR.md) — Phase 4

### Step 4C: AP 4 P6–P7 — Vendor Endpoints & DNS

| Step | Item | Effort |
|------|------|--------|
| P6 | Point all vendor webhooks to production URLs | 30 min |
| P7 | DNS cutover + SSL verification | 1–2h (includes propagation) |

**Checkpoint (CP-C1):** `hic-ai.com` loads correctly, SSL valid, marketplace links remain disabled.

### Step 4D: Production VSIX Build

Build the production VSIX with the correct `API_BASE_URL` (informed by Phase 0 item 0.4 investigation and Open Decisions B-D8).

**GC-GAP-2:** Explicit bridge step — production VSIX must be E2E verified before Marketplace submission in Phase 5.

- **Checkpoint (CP-15):** Production environment fully provisioned. All services pointing to production. Website live at `hic-ai.com`. VSIX built with production API URL.
- **Unlocks:** Phase 5.

### Phase 4 Summary

**Total effort:** ~4–8h active work + DNS/build propagation waits. **Elapsed time:** ~1–2 days.

---

## 8. Phase 5: Launch Sequence

**Estimated time:** ~2–3 days (includes 24–48h Marketplace wait)
**Dependencies:** Phase 4 complete (production environment live, all services configured)

### Step 5A: AP 4 P8 + AP 8 Phase 5 — Production E2E & Dogfooding

SWR's dogfooding purchase (OI-4) is simultaneously:
- AP 4 P8 live-payment verification
- AP 8 Phase 5 production verification
- The first real customer transaction

**Operational note (OI-7):** No active staging development during P8 production E2E testing.

| # | Verification | Effort |
|---|-------------|--------|
| 5.1 | SWR purchases Mouse Individual Monthly ($15/mo) — real payment | 15 min |
| 5.2 | Verify full E2E chain (checkout → webhook → Keygen → DynamoDB → emails) | 20 min |
| 5.3 | Verify extension activation (install → Cognito auth → Keygen activate → heartbeat → MCP tools) | 15 min |
| 5.4 | Verify customer portal (subscription visible, manageable) | 5 min |
| 5.5 | Verify MoR compliance indicators (Link entity on receipt, statement descriptor) | 5 min |

**Reference:** [AP 8 AR §8](20260218_AP8_MOR_STRATEGY_AND_PAYMENT_INTEGRATION_AR.md) — Phase 5

- **Checkpoint (CP-C3):** All production E2E flows pass. SWR's dogfooding subscription active.
- **Unlocks:** 5B (Marketplace submission)

### Step 5B: VS Code Marketplace Submission

Submit extension to VS Code Marketplace. 24–48h external review.

**Timing optimization:** Submit at the start of Step 5A (retesting). The review runs in parallel. If retesting reveals issues, the submission can be updated.

Also submit to Open VSX if timeline allows (timeline investigated during Phase 0 item 0.2).

### Step 5C: AP 4 P9 — Analytics & Traffic Activation

**Sequence (GC-GAP-6):** Plausible staging wire-up (Phase 2 Step 2A) → Privacy Policy review (Phase 2 Step 2B) → P9 Plausible reactivation for `hic-ai.com` domain.

| # | Item | Effort |
|---|------|--------|
| P9.1 | Activate Plausible for production domain | 15 min |
| P9.2 | Enable marketplace install links (`MARKETPLACE_ENABLED = true`) | 5 min |
| P9.3 | Confirm `hic-ai.com` appears in search results | 15 min |

### Step 5D: AP 13 + AP 12 Phase 3 — Disclosures & Public Launch

AP 13 private disclosures and AP 12 Phase 3 marketing activities. These are SWR personal tasks (see §13) but affect launch timing.

**Hard sequencing:** AP 13 (all private disclosures) → AP 12 Phase 3 item 3.6 (LinkedIn update — irreversible public disclosure) → Launch marketing.

- **Checkpoint (CP-C4):** Extension live on Marketplace, links enabled, Plausible active, disclosures complete, LinkedIn updated.
- **Unlocks:** **LAUNCH**

---

## 9. Full Dependency Graph

Arrows indicate "must complete before." Items at the same depth can run in parallel.

```
Level 0 — Phase 0 (no dependencies):
├── 0.1–0.7  Research + quick fixes + DNS (parallel)
├── 0.8 → 0.9  Stripe baseline → parameter audit (chain)
└── 0.10  SMP validation

                ┌──── CP-0: Phase 0 complete ────┐
                │                                  │
                ▼                                  ▼

Level 1 — Phase 1 (3 active streams; 1B deferred → Phase 3 Stream 3C):
├── 1A: Resolve B-D1 → AP 9.8–9.10 version wire-up (4–6h)
├── 1C: AP 7.2–7.6 email deliverability (2.5–3h)
└── 1D: AP 9.1–9.7 E2E client verification (2–3h)

                ┌── CP-9, CP-13, CP-E2E ──┐
                │                                      │
                ▼                                      │

Level 2 — Phase 2 (internal sequencing):               │
├── 2A: Plausible integration (30 min)                  │
│   └── 2B: Legal review Privacy/ToS (2–2.5h)          │
│       └── 2C: Front-end UX polish (5–6h)             │
│           └── 2E: Documentation Tier 1 (6.5h)        │
├── 2D: AP 12 Phase 1 (parallel), Phase 2 (after 2C)   │
└── 2F: Website surface security (2–3h, parallel)       │

                ┌── CP-2, CP-4, CP-5, CP-7, CP-10a ──┐
                │                                       │
                ▼                                       │

Level 3 — Phase 3 (parallel streams):                   │
├── 3A: Security audit AP 2b (5–6h) ◄─ B-D4/B-D5/B-D6  │
├── 3B: Monitoring AP 10 (6–8h)                         │
├── 3C: SMP complete AP 8 Phases 1–3 (~5–7h) ◄─ SMP-GO │
├── 3D: Support infra AP 6 (4–6h)                       │
└── 3E: Branch protection (30 min)                      │

                ┌── CP-11, CP-12, CP-SMP-3 ──┐
                │                              │
                ▼                              │

Level 4 — Phase 4 (sequential):                │
├── 4A: AP 4 P0–P3 foundation (3–4h)           │
├── 4B: AP 4 P4–P5 + AP 8 Phase 4 (2h)         │
├── 4C: AP 4 P6–P7 vendor + DNS (1–2h)         │
└── 4D: Production VSIX build                   │

                ┌── CP-15, CP-C1 ──┐
                │                    │
                ▼                    │

Level 5 — Phase 5 (launch sequence):     │
├── 5A: P8 production E2E + dogfooding   │
├── 5B: Marketplace submission (24–48h)  │
├── 5C: P9 analytics + traffic activation│
└── 5D: AP 13 disclosures → AP 12 Ph3   │

                    │
                    ▼
              ══ LAUNCH ══
```

---

## 10. Checkpoint Definitions

| ID | Checkpoint | Verification | Gate For |
|---|---|---|---|
| **CP-0** | Phase 0 complete | All 10 items verified; DMARC propagating; publisher confirmed | Phase 1 |
| **CP-9** | Version update finalized | B-D1 resolved and implemented; all tests pass | Phase 2, Phase 3 |
| **CP-SMP-2** | SMP code integration tested | All 4 checkout paths verified E2E in test mode with SMP | Phase 3 Stream 3C |
| **CP-13** | Email deliverability verified | Gmail/Outlook inboxes (not spam), all types verified, bounce monitoring | Phase 4 |
| **CP-E2E** | All clients verified | 5 supported clients: install → activate → tools work | Phase 2 AP 5 |
| **CP-1** | Plausible wired up | Staging site → Plausible dashboard confirms data | Phase 2 Step 2B |
| **CP-2** | Privacy/ToS accurate | SWR attorney review on staging | Phase 2 Step 2C, Phase 4 |
| **CP-4** | Website presentable | All pages proofread, no 404s, sitemap, responsive, OG verified | AP 12 Phase 2 |
| **CP-5** | Docs functional | Every docs slug loads, Getting Started verified, no nav 404s | Phase 3 AP 2b, AP 6 |
| **CP-7** | Social media exists | HIC AI accounts live with bio, link, real content | Phase 5 marketing |
| **CP-10a** | Website surface security OK | `npm audit` clean, headers verified, endpoints reviewed | Phase 4 |
| **CP-11** | Comprehensive audit complete | SAST clean, `npm audit` clean, auth review documented, 2FA enabled | Phase 4 |
| **CP-12** | Monitoring operational | `/api/health` 200, metrics alarming, runbook exists, PITR confirmed | Phase 4 |
| **CP-SMP-3** | SMP operationally ready | 2FA on Stripe, SMP setup complete, notifications configured | Phase 4 |
| **CP-6** | Support infrastructure live | `support@` works, Discord live, GitHub templates deployed | Phase 5 |
| **CP-15** | Production environment ready | All services on production config; website at `hic-ai.com` | Phase 5 |
| **CP-C1** | Website live at production URL | `hic-ai.com` loads, SSL valid, marketplace links disabled | Phase 5 |
| **CP-C3** | Production E2E pass | All flows verified; SWR dogfooding subscription active | Marketplace submit |
| **CP-C4** | Extension live on Marketplace | VS Code Marketplace approved, install links enabled, Plausible active | LAUNCH |

---

## 11. Action Plan Dependency Detail

### AP 0: Quick Wins & Initial Setup

- **Dependencies:** None — starting gate
- **Depended on by:** Everything

### AP 1: Front-End UX & Content

- **Dependencies:** AP 11.1–11.3 (legal pages finalized), AP 11.4 (Plausible deployed)
- **Depended on by:** AP 5 (docs on polished site), AP 12 Phase 2 (website to link to)

### AP 2a: Website Surface Security Review

- **Dependencies:** AP 1 near-final (soft — API routes reviewable anytime)
- **Depended on by:** Phase 4 (deploy with confidence)

### AP 2b: Comprehensive Security Audit

- **Dependencies:** AP 9.8–9.10 (feature code finalized — hard), AP 2a (avoids re-checking — soft), B-D4/B-D5/B-D6 (scope decisions — hard)
- **Depended on by:** Phase 4 (production deployment requires security sign-off)

### AP 4: Switch to Production (P0–P9)

- **Dependencies:** AP 2b ✅, AP 8 Phase 3 ✅, AP 10 ✅, AP 7 ✅, AP 11 ✅ — convergence gate
- **Depended on by:** LAUNCH

### AP 5: Documentation Strategy

- **Dependencies:** AP 9.1–9.7 (E2E client verification — hard), AP 1 (polished site — soft)
- **Depended on by:** AP 6 (support references docs), AP 2b (audit covers documented product — soft)

### AP 6: Support Infrastructure

- **Dependencies:** AP 5 (docs reduce support volume — soft)
- **Depended on by:** Nothing directly (should-have for launch)

### AP 7: Email Verification & Deliverability

- **Dependencies:** AP 0 item 0.7 (DMARC live — hard)
- **Depended on by:** Phase 4 (emails must work before production payments)

### AP 8: MoR Strategy & Payment Integration (AR)

- **Dependencies:**
  - Phases 1–2: AP 0 Phase 0 items 0.8–0.10 (baseline)
  - Phase 3: SMP-GO attorney decision (Open Decisions #28 — hard)
  - Phase 4: AP 4 P2 (CloudFormation deployed — hard)
  - Phase 5: AP 4 P8 (production E2E — overlapping)
- **Depended on by:** Phase 4 (payment provider configured for production)

### AP 9: Interoperability & Compatibility

- **Items 9.1–9.7:** No hard dependencies beyond Phase 0
- **Items 9.8–9.10:** B-D1 decision (Open Decisions Register §3c — hard)
- **Depended on by:** AP 5 (docs describe verified flows), AP 2b (audit covers final code)

### AP 10: Monitoring & Observability

- **Dependencies:** B-D7 resolved (14 days — ✅), structured logging (✅)
- **Depended on by:** Phase 4 (cannot deploy without monitoring)

### AP 11: Legal Review

- **Dependencies:** AP 11.4 Plausible (Privacy Policy accuracy — hard), AP 5 (IP review after docs — soft)
- **Internal:** 11.4 → 11.1 → 11.2 → 11.3. IP review (11.5–11.7) after AP 5. Filings (11.8–11.9) on SWR track.
- **Depended on by:** AP 1 (legal pages finalized), Phase 4 (legal ready for production)

### AP 12: Social Media, SEO & Content Distribution

- **Dependencies:** AP 0 item 0.3 (Twitter research — hard), AP 1 near-complete (website to link — soft), AP 13 (personal LinkedIn update only — hard)
- **Depended on by:** LAUNCH (LinkedIn updated)

### AP 13: Private Pre-Launch Disclosure

- **Dependencies:** SMP integration verified (SWR has launch certainty — soft)
- **Depended on by:** AP 12 Phase 3 item 3.6 (LinkedIn update — irreversible disclosure)

---

## 12. What Can Run in Parallel

### Phase 1 — All Four Streams Independent

| Stream 1A | Stream 1B | Stream 1C | Stream 1D |
|-----------|-----------|-----------|-----------|
| Version wire-up (hic repo) | SMP code (plg-website) | Email testing (SES/DNS) | Client smoke tests |

### Phase 2 — Parallel Opportunities

| Can Run Together | Must Be Sequential |
|------------------|--------------------|
| 2D Phase 1 (personal audit) + 2A/2B/2C | 2A → 2B → 2C → 2E (Plausible → Legal → UX → Docs) |
| 2F (surface security) + 2D/2E | 2C before AP 12 Phase 2 (website to link) |

### Phase 3 — All Five Streams Independent

Streams 3A through 3E are fully independent. 3C requires SMP-GO but is otherwise independent of 3A/3B.

### Phase 4 — Mostly Sequential

P0 → P1 → P2 → P3 → P4 → P5 → P6 → P7. AP 8 Phase 4 slots between P3 and P6 (needs live-mode Stripe products before env vars).

### Phase 5 — Partially Parallel

| Can Run Together | Must Be Sequential |
|------------------|--------------------|
| 5A (E2E retesting) + 5B (Marketplace submission) | 5A → 5C (verify before enabling traffic) |
| 5D (disclosures) runs on SWR's own schedule | AP 13 → AP 12 Phase 3 item 3.6 |

### NOT Safe to Parallelize

| Work Item | Must Wait For | Why |
|-----------|---------------|-----|
| AP 11.1 (Privacy Policy) | AP 11.4 (Plausible wired up) | Policy must describe actual state |
| AP 1 (Full site proofread) | AP 11.1–11.3 (Legal review) | Don't proofread pages that will change |
| AP 2b (Comprehensive audit) | AP 9.8–9.10 (feature code finalized) | Audit final code, not intermediate |
| AP 5 (Documentation) | AP 9.1–9.7 (E2E verified) | Describe verified flows, not assumptions |
| Phase 4 (Production deploy) | Phase 3 (security + monitoring) | Cannot deploy without sign-off |
| AP 12 item 3.6 (LinkedIn) | AP 13 (private disclosures) | Personal profile change is the disclosure |
| Phase 5 5C (traffic activation) | 5A (production E2E pass) | Verify before enabling discovery |

---

## 13. SWR Attorney & Personal Track

These items run on SWR's schedule, in parallel with GC engineering work. The only hard constraint is when each item's output is consumed by the main execution sequence.

| Item | Hard Deadline | Recommended Timing | Impact If Late |
|------|---------------|--------------------|----|
| **SMP-GO** (Open Decisions #28) | Before Phase 3 Stream 3C start | ✅ **Resolved Feb 23** | ✅ No longer a risk — GO issued |
| **Privacy Policy review** (AP 11.1) | Phase 2 Step 2B | Phase 2 day 1 | Blocks front-end polish, docs |
| **ToS review** (AP 11.2–11.3) | Phase 2 Step 2B | Phase 2 day 1 (same session as Privacy) | Blocks front-end polish |
| **IP review** (AP 11.5–11.7) | Before launch | Phase 3+ (after docs finalized) | Sensitive details publicly visible |
| **Copyright application** (AP 11.8) | Before launch (recommended) | Phase 3+ | IP unprotected |
| **Provisional patent** (AP 11.9) | **Before public launch** | Phase 3+ (start early — TBD effort) | 1-year clock starts at disclosure without filing |
| **Private disclosures** (AP 13) | Before AP 12 Phase 3 item 3.6 | Phase 4–5 (SWR has launch certainty) | Blocks LinkedIn update |
| **LS/Paddle insurance** (OI-3) | Optional — anytime | SWR judgment call | Contingency gap if SMP fails |

**Critical path:** SMP-GO is resolved (✅ Feb 23). The remaining attorney items that can affect the critical path are Privacy Policy/ToS review (Phase 2) and provisional patent filing (pre-launch). Phase 3 SMP finalization is unblocked.

---

## 14. Day-by-Day Timeline

Assumes a single developer (GC) interleaving engineering work, with SWR handling attorney and personal items in parallel. This is optimistic but structurally sound — the critical path is now entirely within our control (no external MoR review wait).

```
Day 1:  ═══ PHASE 0 (~3.5h) ═══
        ├── Group A: Research & verification (0.1–0.4)
        ├── Group B: Quick fixes (0.5–0.6)
        ├── Group C: DNS (0.7 DMARC)
        ├── Group D: SMP baseline (0.8 → 0.9 → 0.10)
        └── SWR: Begin SMP Preview Terms review (Phase 1.4)

        ═══ PHASE 1 BEGINS ═══
        ├── 1B: SMP code integration starts (AP 8 Phases 1–2)
        │       Steps 1.1–1.3 done, begin 2.1–2.3
        └── 1C: Email deliverability begins (DMARC propagating)

Day 2:  ├── 1A: Resolve B-D1 with SWR → version wire-up begins
        ├── 1B: SMP code integration continues (Steps 2.4–2.8)
        ├── 1C: Email deliverability continues/completes
        └── 1D: E2E client verification (AP 9.1–9.7)

Day 3:  ├── 1A: Version wire-up continues/completes
        ├── 1B: SMP code integration completes → CP-SMP-2 ✅
        ├── 1D: Client verification completes → CP-E2E ✅
        └── SWR: SMP-GO decision target (latest)

        ═══ PHASE 2 BEGINS ═══
        ├── 2A: Plausible integration (30 min)
        └── 2D Phase 1: Personal account audit begins (parallel)

Day 4:  ├── 2B: Legal review — Privacy Policy + ToS (2–2.5h)
        │       [Plausible now wired; SWR reviews as attorney]
        ├── 2C: Front-end UX polish begins (5–6h)
        └── 2D Phase 1: Personal account audit continues

Day 5:  ├── 2C: Front-end polish continues/completes
        ├── 2D Phase 2: Social media presence (HIC AI accounts)
        ├── 2E: Documentation Tier 1 begins (6.5h)
        └── 2F: Website surface security review (2–3h, parallel)

Day 6:  ├── 2E: Documentation continues/completes → CP-5 ✅
        └── 2F: Surface security completes → CP-10a ✅

        ═══ PHASE 3 BEGINS ═══
        ├── 3A: Comprehensive security audit begins
        ├── 3B: Monitoring setup begins
        ├── 3C: SMP finalization (30 min) [needs SMP-GO ✅]
        └── 3D: Support infrastructure begins

Day 7:  ├── 3A: Security audit continues/completes → CP-11 ✅
        ├── 3B: Monitoring continues/completes → CP-12 ✅
        └── 3D: Support infrastructure continues/completes

        ═══ PHASE 4 BEGINS ═══
        └── 4A: AP 4 P0–P3 foundation begins
            └── SWR: Resolve B-D3 (EventBridge gating)

Day 8:  ├── 4A: Foundation continues (CloudFormation, Cognito, Secrets)
        ├── 4B: Environment + AP 8 Phase 4 (live Stripe products, env vars)
        ├── 4C: Vendor endpoints + DNS cutover
        └── 4D: Production VSIX build

Day 9:  ═══ PHASE 5 BEGINS ═══
        ├── 5A: Production E2E retesting + SWR dogfooding purchase
        ├── 5B: Submit to VS Code Marketplace (24–48h review)
        │       [Submit early — review runs in parallel with 5A]
        └── SWR: AP 13 private disclosures begin (if not already)

Day 10: ├── 5A: E2E retesting completes → CP-C3 ✅
        ├── 5C: Plausible P9 reactivation + traffic activation
        ├── 5D: AP 13 disclosures continue
        │       (law partner → key client → contacts)
        └── Marketplace review in progress

Day 11: ├── Marketplace listing live (expected) → CP-C4 ✅
        ├── 5D: AP 13 complete → AP 12 Phase 3 LinkedIn update
        └── Final launch preparations

Day 12: ═══════════════ LAUNCH ═══════════════
```

### Timeline Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| ~~SMP-GO delayed past Day 3~~ | ~~Phase 3 3C blocks → cascade to Phase 4~~ | ✅ **Resolved Feb 23** — GO issued. No longer a risk. |
| B-D1 determines custom code removal (not verification) | +1 day in Phase 1 | Removal is still bounded work; no greenfield development |
| Marketplace review takes >48h | +1–2 days on Phase 5 | Submit during 5A to maximize overlap; Open VSX as parallel |
| Phase 4 surfaces infrastructure issues | +1–2 days | AP 4 P0–P9 is extremely detailed; AP 0 de-risked naming and API_BASE_URL |
| AP 13 disclosures take longer than expected | +1–3 days on launch | LinkedIn update is the only hard gate; marketing can proceed with company accounts |
| Patent filing (AP 11.9) not completed pre-launch | Legal risk, not technical | SWR monitors; launch can proceed if filing is imminent |

### Critical Path Summary

```
Phase 0 → Phase 1 (feature completion + SMP code) → Phase 2 (docs + polish)
    → Phase 3 (security + monitoring + SMP finalization)
    → Phase 4 (production deployment) → Phase 5 (E2E + Marketplace + launch)
```

**Critical path effort:** ~25–35 hours of focused work. No external wait periods except 24–48h Marketplace review.
**Total effort across all work:** ~55–75 hours (includes parallel non-critical-path items).
**Timeline:** ~10–12 working days.

---

## Settled Decisions Reflected in This Map

| ID | Decision | Impact on Sequencing |
|---|---|---|
| **SEQ-1** | Feature completion before docs/front-end | Phase 1 (features) → Phase 2 (docs/polish) |
| **D-1** | Same Amplify app, `main` branch | Phase 4 Step 4B |
| **D-2** | New Google OAuth client for production | Phase 4 Step 4A |
| **D-3** | SES custom sender for production Cognito | Phase 4 Step 4A |
| **D-4** | B-D1–B-D8 deferred (now partially resolved) | B-D7 ✅ (14 days). B-D1/B-D2 → pre-Phase 1. B-D3 → pre-Phase 4. B-D4–B-D6 → pre-Phase 3. |
| **B-D7** | 14-day CloudWatch log retention | Phase 3 monitoring setup |
| **OI-4** | SWR's subscription = P8 live payment test | Phase 5 Step 5A |

---

## Open Decisions That Affect This Map

For the full register, see [20260218_OPEN_DECISIONS.md](20260218_OPEN_DECISIONS.md). Decisions with sequencing impact:

| Open Decision | When Needed | Map Impact If Answer Changes |
|---|---|---|
| **B-D1** (custom version update) | Pre-Phase 1 | ✅ Resolved Feb 20: remove `checkForUpdates()`. Stream 1A scope now fully defined — combined heartbeat fixes + API_BASE_URL remediation, ~2.5h, ~15 files. See `20260222_RECOMMENDATIONS_RE_HEARTBEAT_AND_BASE_API_URL_REMEDIATION_PLAN.md`. |
| **B-D3** (EventBridge gating) | Pre-Phase 4 | Phase 4 scope: deploy gating mechanism or omit |
| **SMP-GO** (#28) | Pre-Phase 3 3C | ✅ **Resolved Feb 23: GO.** Stream 3C unblocked. No contingency needed. |
| **B-D4/B-D5/B-D6** | Pre-Phase 3 3A | Phase 3 security audit tool and format decisions |
| **AP4-D5** (DynamoDB PITR) | Phase 3 or Phase 4 | Minor: 15-min task to enable if yes |
| **AP8-D5** (SMP live mode activation) | Phase 4 Step 4B | Operational: may require separate dashboard action |

---

## Document History

| Date | Author | Changes |
|---|---|---|
| 2026-02-16 | GC | v1 — two-track architecture, 14-day timeline, checkpoint definitions |
| 2026-02-18 | GC | v2 — Phase 0 gate, C1–C4 phased cutover, dual-MoR (LS + Paddle), AP 12 consolidation, D-1–D-5 settled, 15-day timeline |
| 2026-02-18 | GC | **v3** — full rewrite. Replaced two-track architecture with linear phased execution (6 phases). Eliminated MoR application wait (~1 week) per SMP-first path. Features moved to Phase 1 per SEQ-1. B-D7 resolved (14 days). Timeline compressed to ~10–12 working days. Cross-references Open Decisions Register. All AP references updated to v2 documents. |
| 2026-02-22 | GC | Surgical updates reflecting Phase 0 item 0.4 completion: B-D8 resolved (production API base URL = `https://hic-ai.com`). Stream 1A scope updated from "TBD per B-D1" to fully defined combined scope (~2.5h, ~15 files). Phase 4 Step 4A P0 effort updated from 30 min to 1.5–2h for `prod`→`production` rename. B-D1 marked resolved in Open Decisions table. |
| 2026-02-23 | SWR | SMP-GO resolved: §6 Stream 3C gate note updated, §13 SWR Attorney track updated, Timeline Risk Assessment SMP-GO risk struck, Open Decisions table SMP-GO marked resolved. Comprehensive SWR attorney review of all Stripe documentation (SMP Preview Terms, General Terms, DPA, payment method provisions, regional terms). Pre-launch investigation flagged: Stripe customer data deletion impact on DynamoDB. |
