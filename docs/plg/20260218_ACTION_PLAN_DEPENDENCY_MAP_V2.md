# Action Plan Dependency Map v2

**Date:** February 18, 2026 (v2; supersedes February 16 v1)
**Author:** General Counsel
**Purpose:** Authoritative sequencing reference for all pre-launch action plans. Shows which plans depend on which others, what checkpoints gate progression, where parallel work is safe, and how the phased production cutover (C1–C4) replaces the v1 monolithic deployment. Companion to `20260218_PRE_LAUNCH_STATUS_ASSESSMENT_AND_ACTION_PLANS_V2.md`.

---

## Table of Contents

1. [What Changed from v1](#1-what-changed-from-v1)
2. [Structural Overview: Phase 0 → Two Tracks → Phased Cutover](#2-structural-overview-phase-0--two-tracks--phased-cutover)
3. [Phase 0: Quick Wins & Initial Setup (Gate)](#3-phase-0-quick-wins--initial-setup-gate)
4. [Track A: Website, MoR Application & Critical Path](#4-track-a-website-mor-application--critical-path)
5. [Track B: Extension Finalization & Audit](#5-track-b-extension-finalization--audit)
6. [Convergence: Phased Production Cutover (C1–C4)](#6-convergence-phased-production-cutover-c1c4)
7. [Full Dependency Graph](#7-full-dependency-graph)
8. [Checkpoint Definitions](#8-checkpoint-definitions)
9. [Action Plan Dependency Detail](#9-action-plan-dependency-detail)
10. [What Can Run in Parallel](#10-what-can-run-in-parallel)
11. [External Blockers & Wait Times](#11-external-blockers--wait-times)
12. [Minimum Viable Path to Launch (Day-by-Day)](#12-minimum-viable-path-to-launch-day-by-day)

---

## 1. What Changed from v1

The v1 Dependency Map (Feb 16) established the two-track architecture (Track A: website + LS | Track B: extension + audit). v2 incorporates everything learned from the Feb 17 Decision & Gap Analysis session, the 12-item Gap Analysis, AP 0 through AP 13, and the C1–C4 cutover phasing from GAP-12. Major structural changes:

| Area                      | v1                                        | v2                                                                                                                                                       |
| ------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 0**               | Did not exist                             | New opening gate — 10 items, ~3.5h, all zero-dependency, must complete before Track A/B diverge                                                          |
| **MoR strategy**          | LS only                                   | Dual-MoR: LS + Paddle submitted in parallel (AP 8); Stripe emergency fallback defined                                                                    |
| **Social media**          | Scattered (AP 8.3, AP 12, AP 13 elements) | Consolidated into AP 12 (4-phase plan); AP 13 (private disclosures) remains separate                                                                     |
| **AP 3 (Marketing)**      | Standalone inline plan                    | Absorbed into AP 12 Phases 3–4; inline plan retained for reference only                                                                                  |
| **Production deployment** | Single convergence gate ("Day 11")        | Phased C1–C4 cutover: website live → backend infra → E2E retesting → traffic activation                                                                  |
| **Gap items**             | Not in dependency graph                   | All 12 GAP items + 9 GC-GAP items placed in track sequence with explicit checkpoints                                                                     |
| **External blockers**     | 7 items marked "❌ Investigate"           | SES (resolved — account-wide), Stripe go-live (resolved — instant), staging preservation (resolved — additive). Marketplace + Cognito timing still open. |
| **Track B gating**        | B-D1–B-D8 resolve before Track B starts   | B-D1–B-D8 deferred per D-4 to MoR wait window; Track B resumes after MoR applications submitted                                                          |
| **Plausible sequencing**  | Step A1 → Privacy Policy                  | Now explicit: staging wire-up → Privacy Policy review → P9 reactivation for production domain                                                            |
| **Decisions settled**     | None documented                           | D-1 through D-5 + OI-4 settled; deferred decisions (B-D1–B-D8) explicit                                                                                  |
| **Timeline**              | Day 1–14, linear                          | Day 1–15+, phased with C1 starting before Track B completion                                                                                             |

---

## 2. Structural Overview: Phase 0 → Two Tracks → Phased Cutover

```
                         Phase 0
                   Quick Wins & Setup
                      (~3–3.5h)
                          │
              ┌───────────┴───────────┐
              │                       │
         TRACK A                 [DEFERRED]
    Website + MoR               Track B waits
    (Critical Path)             until MoR apps
         │                      are submitted
         │                      (D-4)
         │                           │
    MoR Applications ────────────────┤
    (LS + Paddle)                    │
         │                           │
         │  ~~~~ ~1 week wait ~~~~   │
         │                           │
         │                      TRACK B
         │                   Extension +
         │                   Audit Resumes
         │                   (B-D1–B-D8
         │                    during wait)
         │                           │
         ▼                           ▼
    ┌────────────────────────────────────┐
    │    C1–C4: Phased Production       │
    │    Cutover (replaces monolithic    │
    │    "Day 11" from v1)              │
    └────────────────────────────────────┘
                    │
                    ▼
                 LAUNCH
```

**Why this structure?** Phase 0 retires risks and unblocks both tracks. D-4 (settled Feb 17) prioritizes Track A absolutely — the MoR applications are the single most time-sensitive action because the external review period (~1 week) cannot be compressed. Track B resumes during the wait window, when Track A is blocked on external review. The C1–C4 phased cutover replaces the v1 assumption that production deployment is a single event.

---

## 3. Phase 0: Quick Wins & Initial Setup (Gate)

**Reference:** [AP 0: Quick Wins & Initial Setup](20260217_AP0_QUICK_WINS_AND_INITIAL_SETUP.md)
**Estimated time:** ~3–3.5 hours
**Dependencies:** None — this is the starting gate

Phase 0 consolidates all fast, zero-dependency tasks that must complete before Track A/B work begins. Every item satisfies at least one criterion: it must come first (downstream chains depend on it) or it is fast and clears the decks (<30 min, retires risk).

### Phase 0 Items

| #    | Item                                            | Group     | Effort    | Unlocks                                                                  |
| ---- | ----------------------------------------------- | --------- | --------- | ------------------------------------------------------------------------ |
| 0.1  | Keygen policy verification                      | Research  | 15 min    | AP 9 E2E testing, AP 4 production deployment (silent failure prevention) |
| 0.2  | VS Code Marketplace publisher verification      | Research  | 15 min    | C4 Marketplace submission (de-risks 24–48h external wait)                |
| 0.3  | Twitter/X business account research             | Research  | 15–30 min | AP 12 Phase 2 planning (personal vs. business account answer)            |
| 0.4  | Investigate production `API_BASE_URL` mechanism | Research  | 30 min    | AP 4 production VSIX build, AP 9 version wire-up                         |
| 0.5  | Fix `setup-cognito.sh` ENVIRONMENT hardcoding   | Quick Fix | 5 min     | AP 4 P1 (prevents creating `mouse-staging-*` in production)              |
| 0.6  | Remove orphaned `vscode://` callback URI        | Quick Fix | 2 min     | Cognito cleanup (housekeeping)                                           |
| 0.7  | DMARC record (`_dmarc.hic-ai.com`)              | DNS/Infra | 5 min     | AP 7 email deliverability, MoR applications (professional email)         |
| 0.8  | AP 8.6: Verify all 4 Stripe checkout paths      | MoR Prep  | 30 min    | AP 8 Phase 1 feasibility assessment (must validate before mapping)       |
| 0.9  | LS Phase 1: Feasibility assessment              | MoR Prep  | 45–60 min | Surfaces A-D1 decision; confirms migration viability                     |
| 0.10 | MoR application research & account setup        | MoR Prep  | 30 min    | MoR application submission readiness                                     |

### Phase 0 Sequencing

Most items are fully independent and can run in parallel. Two exceptions:

- **0.8 → 0.9:** Stripe E2E validation must complete before LS feasibility assessment (must map _verified_ behavior, not assumptions)
- **0.9 → A-D1 decision:** LS feasibility assessment surfaces the DynamoDB field naming decision. SWR resolves A-D1 before LS Phase 2 (which happens during the MoR wait window, not Phase 0).

### Phase 0 Checkpoint (CP-0)

**Verification:** All 10 items complete. DMARC propagating. No unexpected blockers surfaced. A-D1 decision queued for SWR. Publisher account verified. `API_BASE_URL` mechanism documented.

**Unlocks:** Track A begins.

---

## 4. Track A: Website, MoR Application & Critical Path

This is the critical path because it contains the only external wait times (MoR review ~1 week, Marketplace review 24–48h).

### Step A1: Plausible Analytics Integration (AP 11.4)

Wire up Plausible analytics on staging. Must precede Privacy Policy review because the policy must accurately describe analytics (Plausible is cookieless/GDPR-compliant — this enables honest "no cookie consent banner needed" language in the Privacy Policy).

- **Depends on:** Phase 0 complete
- **Effort:** 30 min
- **Checkpoint (CP-1):** Plausible script tag on staging, data flowing in Plausible dashboard
- **Unlocks:** AP 11.1 (Privacy Policy can now accurately describe analytics)
- **Handoff to production:** Plausible reactivated for `hic-ai.com` domain at P9 (AP 4). Staging wire-up → Privacy Policy → P9 reactivation is the explicit sequence.

### Step A2: Legal Review (AP 11.1–11.3)

SWR reviews Privacy Policy and ToS as attorney. Privacy Policy must reflect Plausible (cookieless), Cognito, DynamoDB, SES, and what data is/isn't collected. ToS must reference refund policy on `/faq`.

- **Depends on:** A1 (Plausible wired up so policy is accurate)
- **Effort:** 2–2.5 hours
- **Checkpoint (CP-2):** Privacy Policy and ToS pages updated on staging, personally approved by SWR
- **Unlocks:** AP 1 (front-end review can proceed with legal pages finalized), MoR applications (ToS/Privacy strengthen application)

### Step A3: Front-End UX & Content Polish (AP 1)

Proofread all copy, fix broken links, add sitemap, verify OG image, responsive check. Focused on making the site presentable for end users _and_ MoR application reviewers.

- **Depends on:** A2 (legal pages finalized — no point proofreading pages that will change)
- **Effort:** 5–6 hours (Tier 1–2 items)
- **Checkpoint (CP-4):** All public pages proofread, no 404s, sitemap live, responsive check passed
- **Unlocks:** MoR applications (presentable website), AP 5 (docs review on polished site)

### Step A3.5: AP 12 Phase 1–2 — Social Media Presence (AP 12)

Personal account audit (Phase 1) can run in parallel with earlier steps. MoR-ready social media presence (Phase 2) must complete before MoR applications.

**Phase 1 (parallel with A1–A3):**

- Personal account audit across all platforms (~1.5–2h)
- Delete Facebook (zero disclosure risk — removing a profile announces nothing)

**Phase 2 (before MoR submission):**

- Create HIC AI Twitter/X account (informed by AP 0.3 research)
- Create HIC AI LinkedIn company page
- Populate accounts with real content (not empty profiles)
- Cross-link website ↔ social accounts

- **Depends on:** AP 0 item 0.3 (Twitter/X research); Phase 2 depends on AP 1 near-complete (website to link to)
- **Effort:** Phase 1: 1.5–2h | Phase 2: 2–3h
- **Checkpoint (CP-7):** HIC AI accounts exist with bio, link to hic-ai.com, and real content. Facebook deletion initiated.
- **Unlocks:** MoR applications (LS previously rejected citing no social media)

> **Critical distinction:** Creating HIC AI _company_ accounts (Phase 2) is safe before private disclosures. Updating SWR's _personal_ LinkedIn (Phase 3, item 3.6) is the disclosure event and must wait until AP 13 is complete.

### Step A4: E2E Client Verification Pass (AP 9.1–9.7)

Smoke-test installation, activation, and MCP tool invocation for each supported client: Copilot, Cursor, Kiro, Claude Code CLI, Roo Code. This is a context switch to the hic repo, but must happen before docs review because docs must describe verified flows.

- **Depends on:** A3 (natural context-switch point after front-end polish; compatibility claims reviewed)
- **Effort:** 1–2 hours
- **Checkpoint (CP-E2E):** All 5 supported clients verified E2E; client compatibility matrix confirmed accurate
- **Unlocks:** AP 5 (documentation rewrite describes verified per-client flows)

### Step A5: Documentation Accuracy (AP 5 essential items: 5.1, 5.2, 5.6)

Audit existing docs pages, verify Getting Started guide, confirm docs link resolves. MoR reviewers may check docs.

- **Depends on:** A4 (E2E client verification — docs must describe verified flows, not assumptions)
- **Effort:** ~6.5 hours (Tier 1 items)
- **Checkpoint (CP-5):** Every docs slug visited, content verified, no 404s from navigation
- **Unlocks:** MoR applications (docs functional for LS/Paddle reviewers), AP 6 (support infra references docs)

### Step A5.5: Website Surface Security Review (AP 2a)

Focused security review of the public-facing website before MoR submission. Not the comprehensive audit (that's AP 2b in Track B) — specifically what an MoR reviewer might notice or that could cause rejection.

- **Depends on:** A3 (site in near-final state), or can run in parallel with A4/A5 (API routes independent of content)
- **Effort:** 2–3 hours
- **Checkpoint (CP-10a):** `npm audit` clean or criticals documented, unauthenticated endpoints verified, HTTP headers confirmed, no secrets in client bundle
- **Unlocks:** MoR applications (submit with confidence site has been security-reviewed)

### Step A6: Email Deliverability Full Pass (AP 7.2–7.6)

Test all transactional emails end-to-end. AP 7.1 (DMARC) is in Phase 0; remaining items here.

- **Depends on:** Phase 0 item 0.7 (DMARC live and propagated)
- **Effort:** 2.5–3 hours
- **Checkpoint (CP-13):** Test emails reach Gmail + Outlook inboxes (not spam), all transactional email types verified, bounce/complaint monitoring active
- **Unlocks:** AP 4 (emails must work before accepting real payments)

> **Scheduling flexibility:** Can run anytime after DMARC propagation. Natural placement during or after A3–A5. Also safe to do during MoR wait window.

### Step A7: Submit MoR Applications (AP 8A — LS + Paddle simultaneously)

Submit Lemon Squeezy _and_ Paddle Merchant of Record applications. Dual submission per D-4 — hedges against rejection. This triggers the ~1 week external wait.

- **Depends on:** A2 ✅ (legal pages accurate), A3 ✅ (website presentable), A3.5 Phase 2 ✅ (social media exists), A5 ✅ (docs functional), CP-10a ✅ (surface security review), Phase 0 item 0.7 ✅ (DMARC live)
- **Effort:** ~2 hours (both applications)
- **Checkpoint (CP-8):** Confirmation emails from LS and Paddle received
- **Unlocks:** ~1 week wait → MoR decision, during which:

### Work During MoR Wait Window (~1 week)

The wait window is the most productive phase of the sprint. Track A is blocked on external review; the following work proceeds in parallel:

**Track B resumes** (see §5 — B-D1–B-D8 → version wire-up → security audit → monitoring)

**LS Phase 2 specification** (~2–3h): Detailed file-by-file migration spec, written during the wait. If LS approves, execution begins immediately from this spec. If LS rejects, effort was "free" (filled otherwise-dead time).

**Paddle preliminary research** (~1h): API review, concept mapping, SDK assessment. Not a full migration spec — just enough to accelerate planning if Paddle is the selected path.

**IP Review** (AP 11.5–11.7, ~2.5–3.5h): SWR conducts IP review of public-facing documentation and FAQ after AP 5 (docs finalized). Best done during the wait window while docs are fresh.

**Legal filings** (AP 11.8–11.9): Copyright application and provisional patent filing. No technical dependencies — SWR personal legal tasks. **Patent must complete before public launch** (disclosure starts 1-year clock).

**Private disclosures** (AP 13): Personal conversations with key individuals. Ideal during the wait — SWR has certainty (application submitted, tech nearly done), has time (wait window), and sequence is reversible.

| Order | Who                                 | Why                                                |
| ----- | ----------------------------------- | -------------------------------------------------- |
| 1     | Law firm partner                    | Non-negotiable first — must hear from SWR directly |
| 2     | Key client ($4B fund / SW engineer) | Most interested, potential early supporter         |
| 3     | Other key clients/contacts          | Brief, professional                                |
| 4     | Silence                             | Let LinkedIn do the rest                           |

**LinkedIn update** (AP 12 Phase 3, item 3.6 / AP 13 gate): Update SWR's LinkedIn to reflect CEO/Founder, HIC AI, Inc. **Only after ALL private disclosures complete.** This is the irreversible public disclosure event.

### Step A8: MoR Decision → Payment Integration

| Scenario                           | Path       | Action                                                                                  |
| ---------------------------------- | ---------- | --------------------------------------------------------------------------------------- |
| LS approves (regardless of Paddle) | **Path A** | Execute LS migration from Phase 2 spec (~8–10h)                                         |
| LS rejects, Paddle approves        | **Path B** | Build + execute Paddle migration plan (~10–14h)                                         |
| Both approve                       | **Path A** | Use LS (preferred); Paddle as future backup                                             |
| Both reject                        | **Path C** | Stripe live mode (~3–4h); restrict geography; reapply with traction data within 30 days |

- **Depends on:** A7 + MoR decision (external)
- **Checkpoint (CP-14):** All 4 checkout paths E2E tested through chosen provider, webhooks confirmed firing, license provisioned correctly
- **Unlocks:** C2 (backend infrastructure cutover requires payment provider locked in)

---

## 5. Track B: Extension Finalization & Audit

Track B is entirely in the hic repo (extension) plus AWS infrastructure. Per D-4, Track B is explicitly deferred until after MoR applications are submitted (Step A7). It resumes during the MoR wait window.

### Step B0: Resolve Open Decisions (B-D1–B-D8)

Eight business decisions gate autonomous Track B execution. All 8 can be addressed in a single ~15-minute session with SWR.

| Decision | Topic                                                            | Affects    |
| -------- | ---------------------------------------------------------------- | ---------- |
| B-D1     | `/api/version` endpoint: create or remove `checkForUpdates()`?   | B1 scope   |
| B-D2     | "Update Now" UX: browser redirect acceptable for v1?             | B1 scope   |
| B-D3     | EventBridge `readyVersion` gating: deploy or launch without?     | B1 scope   |
| B-D4     | SAST tool choice: CodeQL, Snyk, or ESLint plugin?                | B2 scope   |
| B-D5     | `package.json` field standardization: `private`/`license` values | B2 scope   |
| B-D6     | Security findings memo: format and location                      | B2 scope   |
| B-D7     | Log retention: 14 or 30 days?                                    | B3 scope   |
| B-D8     | Production API base URL (informed by AP 0 item 0.4)              | AP 4 scope |

> **Important context (B-D1–B-D3):** Feb 16 investigation found that heartbeat `onSuccess` version parsing, `mouse.checkForUpdates`, `mouse.showUpdateInfo`, and `StatusBarManager.showUpdateAvailable()` are all **already implemented.** B1 scope may shrink to verification + decision-driven cleanup, not greenfield development.

- **Depends on:** MoR applications submitted (D-4 — Track B deferred until then)
- **Checkpoint (CP-B0):** All 8 decisions documented with chosen option; B1 scope revised
- **Unlocks:** B1, B2, B3

### Step B1: Version Update Wire-up (AP 9.8–9.10) + Phase 6 Completion

The last true feature development work. Parse `latestVersion` from heartbeat response, implement `Mouse: Update Version` command, add status bar notification. Includes VSIX distribution cleanup (remove dead npm distribution code, update release runbook) and Phase 4 heartbeat status alignment (absorbed into B1 naturally — same codebase, same context switch).

- **Depends on:** B0 (decisions B-D1–B-D3 determine scope)
- **Effort:** 4–6 hours (may shrink given existing implementation)
- **Checkpoint (CP-9):** Extension detects newer version from heartbeat, notification appears, `Mouse: Update Version` works. All tests pass. Distribution artifacts cleaned up.
- **Unlocks:** B2 (security audit covers final codebase)

### Step B2: Comprehensive Security Audit (AP 2b) + 2FA Hardening

Full SAST scan, comprehensive auth flow review, authorization review, `package.json` audit across both repos, and formal CWE/CVE findings memo. Must come after B1 because auditing code that's about to change is wasted effort.

**Also includes operational security hardening:**

| Task                                | Status |
| ----------------------------------- | ------ |
| 2FA on GitHub org (hic-ai-inc)      | Open   |
| 2FA on Stripe dashboard             | Open   |
| 2FA on Keygen dashboard             | Open   |
| AWS Budget alerts ($50, $100, $250) | Open   |
| Review Lambda concurrency limits    | Open   |

These are account-level operational security — a different attack surface than code audit but the same security mindset.

- **Depends on:** B0 (B-D4–B-D6 resolved), B1 (all feature code finalized), AP 2a (surface review done — no re-checking)
- **Effort:** 4–5 hours (code audit) + ~1 hour (2FA/operational)
- **Checkpoint (CP-11):** SAST clean or triaged, `npm audit` clean across all packages, auth flow review documented with CWE/CVE refs, 2FA on all critical accounts, findings memo produced
- **Unlocks:** C2 (cannot deploy to production without security sign-off)

> **Post-migration note:** B2 runs during the MoR wait, _before_ payment migration changes. A scoped post-migration security spot-check (AP 8 Phase 2 §2.8) covers the ~10 files changed during migration. This spot-check is the final security gate before C2.

### Step B3: Monitoring & Observability (AP 10.1–10.9)

Health endpoint, metric filters, log retention, severity definitions, incident runbook, PITR verification, backup restore procedure, CloudWatch launch dashboard.

- **Depends on:** B0 (B-D7 log retention resolved)
- **Effort:** 6–8 hours
- **Checkpoint (CP-12):** `/api/health` returns 200, metric filters alarming on 5xx/latency, log retention set, severity levels defined, runbook exists, PITR confirmed, launch dashboard ready
- **Unlocks:** C2 (cannot deploy to production without monitoring)

> **B3 parallelism:** B3 can run in parallel with B1 and B2 (after B0). It is independent infrastructure work that feeds into the same convergence point (C2).

### Step B3.5: Branch Protection Rules

Set up branch protection on both repos (`development` → PR required). No dependencies, 30 minutes, meaningful protection during the sprint.

- **Depends on:** Nothing (safe anytime; placed here for Track B workflow convenience)
- **Effort:** 30 min
- **Checkpoint:** Both repos have branch protection active on `development`
- **Unlocks:** Nothing directly — process safety

---

## 6. Convergence: Phased Production Cutover (C1–C4)

The v1 Dependency Map treated AP 4 (production deployment) as a single "Day 11" event. In reality, the staging-to-production transition is a **phased sequence** touching every infrastructure layer. Each phase is independently verifiable and rollback-capable.

**Reference:** [AP 4: Switch to Production Plan](20260217_AP4_SWITCH_TO_PRODUCTION_PLAN.md) — P0 through P9 phased plan

### C1: Website Goes Live at `hic-ai.com`

The PLG website can go live at the production domain **before** the extension is published or Track B is complete. This is low-risk because marketplace install links are currently disabled (`MARKETPLACE_ENABLED = false`).

**AP 4 steps involved:** P0 (naming standardization), P4 (create Amplify production environment), P5 (verify build), P7 (DNS + SSL)

**Prerequisites:**

- AP 4 P0 complete (naming conventions standardized: `prod` → `production`)
- Amplify production environment created (same app, new branch — D-1)
- DNS pointed from GoDaddy, SSL verified

**Can begin:** After Track A Step A7 (MoR applications submitted) — the website is polished and the social media presence exists. There is no need to wait for Track B completion.

- **Checkpoint (CP-C1):** `hic-ai.com` loads correctly, SSL valid, marketplace links remain disabled, all pages render, no DNS resolution issues
- **Unlocks:** C2 (backend infra overlays on the live website)

### C2: Backend Infrastructure Cutover

The complex, high-risk phase. Each backend service switches from staging to production configuration. This is the true convergence gate — **both tracks must complete before C2 can proceed.**

**AP 4 steps involved:** P1 (Cognito), P2 (CloudFormation), P3 (Secrets), P4 (Amplify env vars), P6 (vendor endpoints)

**Service-by-service cutover:**

| Service              | Production Action                                                                                                                                       | Risk                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **CloudFormation**   | Deploy `hic-plg-production` stack via `./deploy.sh production` — creates DynamoDB table, Lambda functions, IAM roles, SES identity, monitoring, SNS/SQS | High — ordering matters                                                        |
| **Cognito**          | New production pool via `setup-cognito.sh` + Google OAuth client (D-2)                                                                                  | High — auth is foundational                                                    |
| **Secrets Manager**  | Create `plg/production/*` (payment live keys, Keygen tokens, app secrets)                                                                               | Medium — manual but straightforward                                            |
| **Amplify env vars** | 17+ env vars via `update-amplify-env.sh` with CF outputs + secrets + Cognito IDs                                                                        | Medium — well-understood                                                       |
| **Keygen**           | Add production webhook endpoint (same account — already live mode)                                                                                      | Medium — instant config change                                                 |
| **Stripe/LS/Paddle** | Point webhooks to production URL; live-mode keys if Stripe direct                                                                                       | High if Stripe (new products in live mode); Medium if LS/Paddle (API key swap) |
| **SES**              | **Not a blocker** — account-wide production mode (50K/day). Domain already verified.                                                                    | ✅ Resolved                                                                    |

**Critical ordering within C2:**

1. CloudFormation stacks deploy first (creates Cognito groups, DynamoDB, Lambdas)
2. Secrets Manager population depends on CF outputs
3. Amplify env vars depend on Secrets + CF outputs
4. Webhook re-pointing depends on production API endpoints being live
5. SES: no action needed (account-wide, resolved Feb 17)

**Prerequisites (both tracks complete):**

- Track A: A8 ✅ (payment provider locked in), A2 ✅ (legal pages), A6 ✅ (email verified)
- Track B: B2 ✅ (security audit complete), B3 ✅ (monitoring in place)
- AP 11 ✅ (legal review complete — ToS/Privacy accurate before accepting payments)
- Post-migration security spot-check ✅ (if payment migration modified code)

- **Effort:** 4–8 hours (spread across 1–2 days for external waits)
- **Checkpoint (CP-15):** Production environment fully provisioned — Cognito pool, DynamoDB table, Lambda functions, secrets populated, env vars set, webhooks pointed at production
- **Unlocks:** C3 (production E2E retesting)

### C3: End-to-End Retesting on Production

After C2, a subset of staging E2E testing repeats against production infrastructure. Happy-path only — edge cases validated on staging.

**Retesting scope:**

- **Auth flow:** Cognito sign-up → verify email → sign in → token refresh (new pool, new callbacks)
- **Payment flow:** Checkout → purchase → webhook fires → license created (live-mode payment)
- **License activation:** Install extension → authenticate via production Cognito → activate license via production Keygen → heartbeat confirms
- **Email delivery:** Transactional emails send and arrive via production SES identity
- **Webhook reliability:** MoR/Keygen → production API — payloads match expected format
- **Portal flows:** Customer portal login, subscription management, device management

**P8 / OI-4 integration:** SWR's own paid subscription purchase is the P8 verification AND the C3 live payment test. No separate test transaction needed. SWR's ongoing subscription serves as continuous live monitoring (dogfooding from Day 1). HIC AI Inc Mercury account; ~$1–2 net monthly cost.

- **Effort:** 1–2 days
- **Checkpoint (CP-C3):** All production E2E flows pass. SWR's dogfooding subscription active.
- **Unlocks:** C4 (traffic activation + marketplace publish)

### C4: Traffic Activation

The final phase enables public discovery. Contains a hard external wait (marketplace review).

**Steps:**

1. Enable marketplace install links on website (flip `MARKETPLACE_ENABLED` to `true`)
2. Submit to VS Code Marketplace (24–48h review — submit during C3 to overlap)
3. Submit to Open VSX (timeline needs investigation — AP 0 item 0.2 de-risked publisher verification)
4. Activate Plausible analytics for `hic-ai.com` domain (AP 11.4 → P9 reactivation)
5. Begin AP 12 Phase 3 marketing activities (if not already underway)
6. Confirm `hic-ai.com` appears correctly in search results

> **Timing optimization:** Submit to VS Code Marketplace at the start of C3 (retesting). The 24–48h review runs in parallel with production E2E retesting. If retesting reveals issues, the marketplace submission can be updated or cancelled.

- **Effort:** 1–2 hours active work + 24–48h marketplace wait
- **Checkpoint (CP-C4):** Extension live on VS Code Marketplace, website links enabled, Plausible active, search presence verified
- **Unlocks:** **LAUNCH**

### C1–C4 Summary

| Phase  | Scope                                          | Timing                                  | Duration                    |
| ------ | ---------------------------------------------- | --------------------------------------- | --------------------------- |
| **C1** | Website live at `hic-ai.com`                   | Can precede Track B completion          | 2–4 hours + DNS propagation |
| **C2** | Backend infrastructure cutover                 | Both tracks complete (convergence gate) | 4–8 hours across 1–2 days   |
| **C3** | Production E2E retesting + dogfooding purchase | After C2                                | 1–2 days                    |
| **C4** | Marketplace publish + traffic activation       | Overlaps C3 (submit early)              | 24–48h external wait        |

**Net effect:** v1's "Day 11" becomes approximately Days 10–15, but with dramatically better risk management — each phase is independently verifiable and rollback-capable.

---

## 7. Full Dependency Graph

Arrows indicate "must complete before." Items at the same depth level can run in parallel.

```
Level 0 — Phase 0 (no dependencies, start immediately):
├── 0.1  Keygen policy verification (15 min)
├── 0.2  Marketplace publisher verification (15 min)
├── 0.3  Twitter/X business account research (15–30 min)
├── 0.4  Investigate API_BASE_URL mechanism (30 min)
├── 0.5  Fix setup-cognito.sh hardcoding (5 min)
├── 0.6  Remove orphaned vscode:// callback URI (2 min)
├── 0.7  DMARC record (5 min + propagation)
├── 0.8  Stripe test-mode E2E validation (30 min)
│   └── 0.9  LS Phase 1 feasibility assessment (45–60 min) [needs 0.8]
└── 0.10 MoR application research & account setup (30 min)

                    ┌─── CP-0: Phase 0 complete ───┐
                    │                               │
                    ▼                               │

Level 1 — Track A begins (depends on Phase 0):      │
├── A1   Plausible integration (30 min)              │
├── A3.5 AP 12 Phase 1: Personal account audit       │
│        (1.5–2h, parallel with A1–A3)               │
└── A6   Email deliverability (AP 7.2–7.6, 2.5–3h)  │
         [needs only 0.7 DMARC — can start early]    │
                                                     │
Level 1.5 (depends on A1):                           │
└── A2   Legal review: Privacy/ToS (2–2.5h)          │
         [needs A1 Plausible wired up]               │
                                                     │
Level 2 (depends on A2):                             │
├── A3   Front-end UX polish (5–6h)                  │
│        [needs A2 legal pages finalized]            │
└── A3.5 AP 12 Phase 2: MoR-ready presence (2–3h)   │
         [needs A3 near-complete for website link]   │
                                                     │
Level 2.5 (context switch after front-end):          │
└── A4   E2E client verification, AP 9.1–9.7 (1–2h) │
         [needs A3 front-end — verify claims first]  │
                                                     │
Level 3 (depends on Level 2/2.5):                    │
├── A5   Docs accuracy, AP 5 essential (6.5h)        │
│        [needs A4 — docs describe verified flows]   │
└── A5.5 Website surface security (AP 2a, 2–3h)     │
         [needs A3 near-final, or parallel w/ A4/A5] │
                                                     │
Level 4 — MoR submission:                            │
└── A7   Submit MoR applications, LS + Paddle        │
         [needs A2, A3, A3.5 Ph2, A5, A5.5, 0.7]    │
                                                     │
         ───── ~1 week MoR wait ─────                │
                                                     │
Level 4.5 — MoR wait window work:                    │
├── Track B resumes ◄───────────────────────────────┘
│   ├── B0   B-D1–B-D8 decisions (15 min w/ SWR)
│   ├── B1   Version wire-up + distribution cleanup (4–6h) [needs B0]
│   ├── B2   Comprehensive security audit + 2FA (5–6h) [needs B1, B0]
│   ├── B3   Monitoring & observability (6–8h) [needs B0, parallel w/ B1]
│   └── B3.5 Branch protection rules (30 min)
├── LS Phase 2 spec (2–3h)
├── Paddle preliminary research (1h)
├── IP review, AP 11.5–11.7 (2.5–3.5h) [needs A5 docs finalized]
├── Legal filings, AP 11.8–11.9 (1h + TBD) [patent before launch]
├── AP 13 private disclosures (3–5 days elapsed)
│   └── AP 12 Phase 3 item 3.6: LinkedIn update [needs AP 13 ALL complete]
└── AP 6  Support infrastructure (4–6h) [needs A5 docs]

Level 5 — MoR decision:
└── A8   Payment integration
         [needs A7 + MoR decision]
         ├── LS approved → execute Phase 2 spec (8–10h)
         ├── Paddle approved → build + execute plan (10–14h)
         └── Both reject → Stripe live mode (3–4h)

Level 6 — Phased cutover:
├── C1   Website live at hic-ai.com
│        [can start at A7, does not need Track B]
├── C2   Backend infrastructure cutover
│        [needs A8 + B2 + B3 + AP 7 + AP 11 — true convergence]
├── C3   Production E2E retesting + dogfooding purchase
│        [needs C2]
└── C4   Marketplace publish + traffic activation
         [needs C3; submit to Marketplace at start of C3 for overlap]

Level 7:
└── LAUNCH
    [needs C4 + AP 12 Phase 3 LinkedIn update + AP 11.9 patent filed]
```

---

## 8. Checkpoint Definitions

Each checkpoint is a verifiable gate that must be passed before dependent work proceeds.

| ID         | Checkpoint                     | Verification Method                                                        | Gate For                 |
| ---------- | ------------------------------ | -------------------------------------------------------------------------- | ------------------------ |
| **CP-0**   | Phase 0 complete               | All 10 items verified; DMARC propagating; publisher account confirmed      | Track A                  |
| **CP-1**   | Plausible wired up             | Visit staging site → network request to Plausible → dashboard confirms     | AP 11.1 (Privacy Policy) |
| **CP-2**   | Privacy/ToS accurate           | SWR attorney review on staging                                             | AP 1, MoR applications   |
| **CP-4**   | Website presentable            | All pages proofread, no 404s, sitemap, responsive, OG verified             | MoR applications         |
| **CP-5**   | Docs functional                | Every docs slug loads, Getting Started verified, no nav 404s               | MoR applications, AP 6   |
| **CP-7**   | Social media exists            | HIC AI accounts live with bio, link, real content                          | MoR applications         |
| **CP-8**   | MoR applications submitted     | Confirmation emails from LS and Paddle                                     | Wait window work         |
| **CP-9**   | Version update working         | Extension detects newer version, notification shows, Update Version works  | B2 (audit)               |
| **CP-10a** | Website surface security OK    | `npm audit` clean, headers verified, endpoints reviewed                    | MoR applications         |
| **CP-11**  | Comprehensive audit complete   | SAST clean, `npm audit` clean, auth review documented, 2FA enabled         | C2                       |
| **CP-12**  | Monitoring operational         | `/api/health` 200, metric alarms configured, runbook exists, PITR verified | C2                       |
| **CP-13**  | Email deliverability verified  | Gmail/Outlook inboxes (not spam), all types fire, bounce monitoring active | C2                       |
| **CP-14**  | Payment integration tested     | All 4 checkout paths E2E, webhooks firing, license provisioned             | C2                       |
| **CP-15**  | Production environment ready   | Cognito, DynamoDB, Lambdas, secrets, env vars, webhooks — all production   | C3                       |
| **CP-C1**  | Website live at production URL | `hic-ai.com` loads, SSL valid, marketplace links disabled                  | C2                       |
| **CP-C3**  | Production E2E pass            | All flows verified on production; SWR dogfooding subscription active       | C4                       |
| **CP-C4**  | Extension live on Marketplace  | VS Code Marketplace approved, install links enabled, Plausible active      | LAUNCH                   |
| **CP-16**  | Facebook deletion initiated    | Account deletion request submitted                                         | Nothing (housekeeping)   |
| **CP-17**  | Private disclosures complete   | SWR confirms: partner, key clients, contacts told personally               | AP 12 LinkedIn update    |
| **CP-18**  | Personal profiles updated      | LinkedIn reflects CEO/Founder HIC AI, Inc.                                 | LAUNCH                   |
| **CP-E2E** | All clients verified           | 5 supported clients: install → activate → tools work                       | AP 5 (docs)              |
| **CP-B0**  | Track B decisions resolved     | All 8 B-D decisions documented                                             | B1, B2, B3               |

---

## 9. Action Plan Dependency Detail

### AP 0: Quick Wins & Initial Setup

| Dependency | Type | Reason                    |
| ---------- | ---- | ------------------------- |
| None       | —    | This is the starting gate |

**Depended on by:** Track A (all), Track B (deferred but Phase 0 items inform scope)

### AP 1: Front-End UX & Content

| Dependency           | Type | Reason                                                                        |
| -------------------- | ---- | ----------------------------------------------------------------------------- |
| AP 11.1–11.3 (Legal) | Hard | Legal pages must be finalized before proofreading the full site               |
| AP 11.4 (Plausible)  | Soft | Plausible script deployed before finalizing page templates (avoids re-deploy) |

**Depended on by:** MoR applications (presentable site), AP 12 Phase 2 (website to link to), AP 5 (docs on polished site)

### AP 2a: Website Surface Security Review

| Dependency        | Type | Reason                                                                  |
| ----------------- | ---- | ----------------------------------------------------------------------- |
| AP 1 (near-final) | Soft | Better to review in near-final state, but API routes reviewable anytime |

**Depended on by:** MoR applications (submit with confidence)

### AP 2b: Comprehensive Security Audit

| Dependency       | Type | Reason                                           |
| ---------------- | ---- | ------------------------------------------------ |
| AP 9.8–9.10 (B1) | Hard | Audit the final codebase, not intermediate state |
| AP 2a            | Soft | Avoids re-checking what AP 2a covered            |
| B-D4–B-D6        | Hard | Tool choice, format, scope decisions             |

**Depended on by:** C2 (production deployment requires security sign-off)

### AP 4: Switch to Production (C1–C4)

| Dependency         | Type | Reason                                                   |
| ------------------ | ---- | -------------------------------------------------------- |
| AP 2b (Security)   | Hard | Cannot deploy without comprehensive security sign-off    |
| AP 8 A8 (Payments) | Hard | Must know payment provider for production secrets        |
| AP 10 (Monitoring) | Hard | Cannot launch blind                                      |
| AP 7 (Email)       | Hard | Transactional emails must work before accepting payments |
| AP 11 (Legal)      | Hard | ToS/Privacy accurate before accepting users              |

**Depended on by:** LAUNCH

### AP 5: Documentation Strategy

| Dependency                    | Type | Reason                                       |
| ----------------------------- | ---- | -------------------------------------------- |
| AP 9.1–9.7 (E2E verification) | Hard | Docs must describe verified per-client flows |

**Depended on by:** AP 6 (support references docs), MoR applications (reviewers may check docs)

### AP 6: Support Infrastructure

| Dependency  | Type | Reason                                                 |
| ----------- | ---- | ------------------------------------------------------ |
| AP 5 (Docs) | Soft | Good docs reduce support volume; support links to docs |

**Depended on by:** Nothing (should-have for launch, not hard blocker)

### AP 7: Email Verification & Deliverability

| Dependency            | Type | Reason                                                 |
| --------------------- | ---- | ------------------------------------------------------ |
| AP 0 item 0.7 (DMARC) | Hard | DMARC must be live and propagated before email testing |

**Internal ordering:** 7.1 (DMARC, Phase 0) → 7.2–7.6 (remaining items, Step A6)

**Depended on by:** C2 (emails must work), MoR applications (DMARC strengthens application)

### AP 8: MoR Strategy & Payment Integration

| Dependency               | Type | Reason                                        |
| ------------------------ | ---- | --------------------------------------------- |
| AP 1 (UX/Content)        | Hard | MoR requires presentable website              |
| AP 2a (Surface security) | Soft | Submit with confidence                        |
| AP 5 (Docs)              | Hard | MoR reviewers may check docs                  |
| AP 7.1 (DMARC)           | Soft | Strengthens application (professional email)  |
| AP 12 Phase 2 (Social)   | Hard | LS previously rejected citing no social media |
| AP 11.1–11.3 (Legal)     | Hard | ToS/Privacy in place — legitimate operation   |

**Internal ordering:** AP 8.6 (Stripe E2E, Phase 0) → Phase 1 (feasibility, Phase 0) → Application (A7) → Phase 2 (wait window) → A8 (execution)

**Depended on by:** C2 (payment provider must be determined for production config)

### AP 9: Interoperability & Compatibility

**Items 9.1–9.7 (client verification):** No hard dependencies beyond front-end polish being complete. Step A4 in Track A.

**Items 9.8–9.10 (version wire-up):** Depend on B-D1–B-D3 decisions. Step B1 in Track B.

**Depended on by:** AP 5 (docs describe verified flows), AP 2b (audit covers final code)

### AP 10: Monitoring & Observability

| Dependency           | Type   | Reason                                      |
| -------------------- | ------ | ------------------------------------------- |
| B-D7 (log retention) | Hard   | Configuration depends on retention decision |
| Structured logging   | Met ✅ | Already complete (33 handlers, 24 files)    |

**Depended on by:** C2 (cannot deploy without monitoring)

### AP 11: Legal Review (Full Scope)

| Dependency            | Type | Reason                                               |
| --------------------- | ---- | ---------------------------------------------------- |
| AP 11.4 (Plausible)   | Hard | Privacy Policy must accurately describe analytics    |
| AP 5 (Docs finalized) | Soft | IP review (11.5–11.7) best done after docs finalized |

**Internal ordering:** 11.4 Plausible → 11.1 Privacy Policy → 11.2 ToS → 11.3 refund xref. 11.5–11.7 IP review after AP 5. 11.8–11.9 filings during wait window.

**Depended on by:** AP 1 (legal pages finalized), C2 (legal accurate before production), MoR applications

### AP 12: Social Media, SEO & Content Distribution

| Dependency                       | Type | Reason                                                              |
| -------------------------------- | ---- | ------------------------------------------------------------------- |
| AP 0 item 0.3 (Twitter research) | Hard | Personal vs. business account answer needed                         |
| AP 1 (UX near-complete)          | Soft | Website to link to from social accounts                             |
| AP 13 (Private disclosures)      | Hard | **LinkedIn update only** — company accounts safe before disclosures |

**Depended on by:** MoR applications (social media presence), LAUNCH (LinkedIn reflects founder role)

### AP 13: Private Pre-Launch Disclosure

| Dependency            | Type | Reason                               |
| --------------------- | ---- | ------------------------------------ |
| AP 8A (MoR submitted) | Soft | SWR has certainty of imminent launch |

**Internal ordering:** Law partner (first, non-negotiable) → key client → other contacts → silence

**Depended on by:** AP 12 Phase 3 item 3.6 (LinkedIn update — irreversible public disclosure)

---

## 10. What Can Run in Parallel

### Fully Independent (zero overlap, can be done simultaneously)

| Track A Work                   | Track B Work                       |
| ------------------------------ | ---------------------------------- |
| AP 11.4 Plausible integration  | AP 9.8–9.10 Version update wire-up |
| AP 11.1–11.3 Legal review      | AP 2b Comprehensive security audit |
| AP 1 Front-end polish          | AP 10 Monitoring setup             |
| AP 12 Phase 1 (personal audit) | B3.5 Branch protection             |
| AP 2a Website surface security |                                    |
| AP 5 Documentation             |                                    |
| AP 7 Email deliverability      |                                    |
| AP 8 MoR applications          |                                    |

### Safe Parallel Within Phase 0

All 10 items are independent except 0.8 → 0.9 (Stripe validation → LS feasibility). Everything else can run in any order.

### Safe Parallel Within Track A

- A1 (Plausible), A6 (Email/AP 7), A3.5 Phase 1 (personal account audit) — all can start immediately after Phase 0
- A5 (Docs) and A5.5 (Surface security) — independent of each other
- A3.5 Phase 2 (social media presence) can run alongside A3 (front-end polish)

### Safe Parallel Within Track B (MoR wait window)

- B1 (version wire-up) and B3 (monitoring) are independent after B0
- B2 (security audit) must wait for B1 completion
- B3.5 (branch protection) is independent of everything

### Safe Parallel During MoR Wait Window

- Track B work (B0 → B1/B3 parallel → B2)
- LS Phase 2 specification
- IP review (AP 11.5–11.7)
- Legal filings (AP 11.8–11.9)
- AP 13 private disclosures
- AP 6 support infrastructure

### NOT Safe to Parallelize

| Work Item                   | Must Wait For                 | Why                                              |
| --------------------------- | ----------------------------- | ------------------------------------------------ |
| AP 11.1 (Privacy Policy)    | AP 11.4 (Plausible wired up)  | Policy must describe actual analytics state      |
| AP 1 (Full site proofread)  | AP 11.1–11.3 (Legal review)   | Don't proofread pages that will change           |
| AP 2b (Comprehensive audit) | AP 9.8–9.10 (B1 feature code) | Audit the final code, not intermediate           |
| MoR applications (A7)       | AP 1 + AP 5 + AP 12 Ph2       | Applications need presentable site, docs, social |
| AP 12 item 3.6 (LinkedIn)   | AP 13 (Private disclosures)   | Public profile change is the disclosure event    |
| C2 (Backend cutover)        | A8 + B2 + B3 + AP 7 + AP 11   | All convergence dependencies                     |
| C3 (Production retesting)   | C2                            | Infrastructure must exist first                  |

---

## 11. External Blockers & Wait Times

### Known Wait Times

| Blocker                              | Estimated Wait   | What Proceeds During Wait                                                                                          |
| ------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| MoR application review (LS + Paddle) | ~1 week          | All of Track B, LS Phase 2, Paddle research, IP review, legal filings, AP 13 disclosures, AP 6, AP 12 Phase 3 prep |
| VS Code Marketplace review           | 24–48h           | Submit at start of C3; retesting runs in parallel                                                                  |
| DMARC DNS propagation                | 1–48 hours       | Everything — propagation is passive                                                                                |
| Private disclosure conversations     | 1–5 days elapsed | All of Track B; payment integration (independent after A7)                                                         |
| Facebook deletion grace period       | 30 days          | Everything — runs in background                                                                                    |
| DNS/SSL propagation (C1)             | Hours            | Other C1 verification steps                                                                                        |

### Resolved Blockers (from v1 "❌ Investigate")

| Blocker (v1)              | Resolution (Feb 17)                                                                                             |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **SES production access** | **Not a blocker.** Account-wide, not stack-specific. 50K/day. `hic-ai.com` domain already verified.             |
| **Stripe test → live**    | **Instant.** Business profile already complete. Swap keys, recreate products/prices + webhooks in live mode.    |
| **Staging preservation**  | **Additive deployment.** Staging permanently intact. Production added alongside. No staging resources modified. |

### Remaining Unknowns

| Item                           | Estimated Wait     | Status            | Mitigation                                                                  |
| ------------------------------ | ------------------ | ----------------- | --------------------------------------------------------------------------- |
| Open VSX publishing timeline   | Unknown            | ❌ Needs research | AP 0 item 0.2 de-risks publisher account; Open VSX research during MoR wait |
| Cognito pool provisioning time | Minutes (believed) | ⚠️ Unverified     | CloudFormation creates pool resources — should be fast; verify at P1        |
| Keygen webhook propagation     | Instant (believed) | ⚠️ Unverified     | Config change in dashboard; verify during C2                                |
| Google OAuth app review        | Minutes–hours      | ⚠️ Unverified     | Create OAuth client early; staging client already approved                  |

### Time-Sensitivity Ranking

1. **MoR applications** — longest external wait (~1 week); submit as early as structurally possible
2. **VS Code Marketplace** — 24–48h review; submit ≥2 days before intended launch (during C3)
3. **Provisional patent filing** — must complete before public disclosure (LAUNCH)
4. **Private disclosures (AP 13)** — human conversations take calendar time; start during MoR wait
5. **DMARC record** — propagation delay; do in Phase 0 even though it's a 5-minute task
6. **Facebook deletion (AP 12 Phase 1)** — 30-day grace period; start whenever convenient

---

## 12. Minimum Viable Path to Launch (Day-by-Day)

Assumes a single developer (SWR) interleaving work sessions. This is optimistic but structurally sound — the critical path is dictated by external waits, not work volume.

```
Day 1:  PHASE 0 (~3.5h)
        ├── Group A: Research (0.1–0.4)
        ├── Group B: Quick fixes (0.5–0.6)
        ├── Group C: DNS (0.7 DMARC)
        ├── Group D: MoR prep (0.8 Stripe E2E → 0.9 LS feasibility → 0.10 account setup)
        └── A-D1 decision queued for SWR (DynamoDB field naming)

        TRACK A BEGINS
        ├── A1: Plausible integration (30 min)
        ├── A3.5 Phase 1: Personal account audit (1.5–2h, parallel)
        └── A6: Email deliverability begins (DMARC now propagating)

Day 2:  ├── A2: Legal review — Privacy Policy + ToS (2–2.5h) [Plausible now wired]
        ├── A3: Front-end UX polish (5–6h) [legal pages now finalized]
        └── A6: Email deliverability continues/completes

Day 3:  ├── A3 continues if needed
        ├── A3.5 Phase 2: MoR-ready social media presence (2–3h)
        ├── A4: E2E client verification, AP 9.1–9.7 (1–2h) [context switch to hic repo]
        └── A5.5: Website surface security review (2–3h) [parallel with A4]

Day 4:  ├── A5: Documentation accuracy (6.5h) [clients now verified]
        └── A7: SUBMIT MoR APPLICATIONS — LS + Paddle
            └── ═══════ EXTERNAL WAIT BEGINS (~1 week) ═══════

Day 5:  MoR WAIT WINDOW — TRACK B RESUMES
        ├── B0: Resolve B-D1–B-D8 (15 min with SWR)
        ├── B1: Version wire-up begins (4–6h) [scope informed by B-D1–B-D3]
        ├── B3: Monitoring begins (6–8h) [parallel with B1]
        └── LS Phase 2 spec begins (2–3h)

Day 6:  ├── B1 continues/completes
        ├── B3 continues
        ├── LS Phase 2 spec completes
        ├── Paddle preliminary research (1h)
        └── AP 13: Private disclosures begin
            └── Day 6: Law partner conversation

Day 7:  ├── B2: Comprehensive security audit begins (5–6h) [B1 now complete]
        ├── B3 continues/completes
        ├── IP review, AP 11.5–11.7 (2.5–3.5h)
        ├── Legal filings, AP 11.8–11.9 (patent filing critical)
        └── AP 13: Key client conversation

Day 8:  ├── B2 continues/completes
        ├── B3.5: Branch protection (30 min)
        ├── AP 6: Support infrastructure (4–6h) [docs now done]
        ├── AP 13: Remaining contacts
        └── AP 12 Phase 3 item 3.6: LinkedIn update [IF AP 13 complete]

Day 9:  ├── C1: Website live at hic-ai.com (2–4h + DNS propagation)
        │   [Can start now — website polished, doesn't need Track B]
        └── AP 12 Phase 3: Pre-launch content prep

Day 10: MoR DECISION ARRIVES (approximate)
        └── A8: Payment integration
            ├── LS approved → execute Phase 2 spec (8–10h)
            ├── Paddle approved → build + execute plan (10–14h)
            └── Both reject → Stripe live mode (3–4h)

Day 11: ├── A8 continues if needed (LS/Paddle migration)
        └── Post-migration security spot-check

Day 12: C2: Backend infrastructure cutover (4–8h)
        ├── CF stack deployment
        ├── Cognito production pool
        ├── Secrets + env vars
        ├── Webhook re-pointing
        └── Submit to VS Code Marketplace [start of C4, overlaps C3]

Day 13: C3: Production E2E retesting
        ├── Auth flow verification
        ├── Payment flow (SWR dogfooding purchase = P8)
        ├── License activation verification
        ├── Email delivery verification
        └── Portal flow verification

Day 14: C3 completes
        C4: Traffic activation
        ├── Enable marketplace install links
        ├── Activate Plausible for hic-ai.com
        ├── Confirm Marketplace listing live
        └── Final search presence check

Day 15: ══════════════ LAUNCH ══════════════
```

### Timeline Risk Assessment

| Risk                                         | Impact            | Mitigation                                                                                    |
| -------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------- |
| MoR review takes >1 week                     | +1–3 days         | Track B work and wait window activities continue; no wasted time                              |
| Marketplace review takes >48h                | +1–2 days         | Submit during C3 to maximize overlap; Open VSX as parallel channel                            |
| Payment migration takes >10h                 | +1 day            | LS Phase 2 spec pre-built for immediate execution; option (b) DynamoDB naming minimizes scope |
| Both MoR applications rejected               | Replanning needed | Stripe direct (~3–4h); restrict geography; reapply with traction data in 30 days              |
| C2 surfaces unexpected infrastructure issues | +1–2 days         | AP 4 P0–P9 is extremely detailed; AP 0 de-risked naming conventions and API_BASE_URL          |
| AP 13 disclosures take longer than expected  | +1–3 days         | LinkedIn update is the only hard gate; marketing can proceed with company accounts            |

### Critical Path Summary

```
Phase 0 → A1 (Plausible) → A2 (Legal) → A3 (UX) → A5 (Docs) → A7 (MoR submission)
    → ~1 week wait → A8 (Payment integration) → C2 (Backend cutover)
    → C3 (E2E retesting) → C4 (Marketplace + traffic) → LAUNCH
```

**Total critical path:** ~25–35 hours of focused work + ~7–10 days of external waits.
**Total effort across all tracks:** ~45–65 hours.

---

## Settled Decisions Reflected in This Map

| ID       | Decision                                    | Impact on Sequencing                            |
| -------- | ------------------------------------------- | ----------------------------------------------- |
| **D-1**  | Same Amplify app, new branch for production | C1/C2 use existing app `d2yhz9h4xdd5rb`         |
| **D-2**  | New Google OAuth client for production      | C2 P1 creates new client (not reuse staging)    |
| **D-3**  | SES custom sender for production Cognito    | C2 P1 configures SES, not `COGNITO_DEFAULT`     |
| **D-4**  | Track B deferred until MoR apps submitted   | Track B resumes at MoR wait window, not Phase 0 |
| **D-5**  | Unified Social Media AP (AP 12)             | Replaces scattered AP 8.3/12/13 social elements |
| **OI-4** | SWR's subscription = P8 live payment test   | C3 dogfooding purchase is the verification      |

---

## Document History

| Date       | Author | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-02-16 | GC     | v1 — two-track architecture, step sequencing, checkpoint definitions, 14-day timeline                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-02-18 | GC     | v2 — comprehensive revision incorporating Phase 0 (AP 0), C1–C4 cutover phasing (replacing monolithic Day 11), dual-MoR strategy (AP 8 LS + Paddle), AP 12 consolidation (social media + SEO), all 12 GAP items + 9 GC-GAP items placed in track sequence, D-1 through D-5 + OI-4 settled decisions, resolved external blockers (SES, Stripe go-live, staging preservation), deferred B-D1–B-D8 per D-4, explicit Plausible staging → Privacy Policy → P9 reactivation sequence, updated checkpoints and timeline |
