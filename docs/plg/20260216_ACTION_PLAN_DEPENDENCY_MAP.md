# Action Plan Dependency Map

**Date:** February 16, 2026
**Author:** General Counsel
**Purpose:** Standalone reference showing precisely which action plans depend on which others, what checkpoints must be met before proceeding, and where parallel work is safe. Companion to `20260216_PRE_LAUNCH_STATUS_ASSESSMENT_AND_ACTION_PLANS.md`.

---

## Table of Contents

1. [Two Independent Tracks](#two-independent-tracks)
2. [Track A: Website & Lemon Squeezy (Critical Path)](#track-a-website--lemon-squeezy-critical-path)
3. [Track B: Extension Finalization & Audit (hic Repo)](#track-b-extension-finalization--audit-hic-repo)
4. [Convergence: Launch Readiness](#convergence-launch-readiness)
5. [Full Dependency Graph](#full-dependency-graph)
6. [Checkpoint Definitions](#checkpoint-definitions)
7. [Action Plan Dependency Detail](#action-plan-dependency-detail)
8. [What Can Run in Parallel](#what-can-run-in-parallel)
9. [External Blockers & Wait Times](#external-blockers--wait-times)

---

## Two Independent Tracks

The remaining work falls into two largely independent tracks that converge at launch. This is the single most important structural insight for scheduling:

```
TRACK A (Website + LS)              TRACK B (Extension + Audit)
─────────────────────               ────────────────────────────
AP 11.4: Wire up Plausible         AP 9.8–9.10: Heartbeat version
    │                                   wire-up + Update command
    ▼                                   │
AP 11.1–11.3: Privacy/ToS              ▼
    review (reflects Plausible)    AP 2: Security audit
    │                                   (after code is finalized)
    ▼                                   │
AP 1: Front-end UX/content             ▼
    (includes legal pages)         AP 10: Monitoring & observability
    │                                   (health endpoint, alarms)
    ├──▶ AP 5: Docs accuracy            │
    │                                   │
    ▼                                   │
AP 7.1: DMARC record                   │
    │                                   │
    ▼                                   │
AP 8A: LS application ─────────────────┤
    │                                   │
    │  ~~~~ ~1 week wait ~~~~           │
    │                                   │
    ▼                                   ▼
AP 8C/8D: Payment integration     ◄── Both tracks must complete
    │
    ▼
AP 4: Production deployment
    │
    ▼
 LAUNCH
```

**Why two tracks?** Track A is entirely in the `hic-ai-inc.github.io` repo (website) plus external services (LS, DNS, social media). Track B is entirely in the `hic` repo (extension) plus AWS infrastructure. A single developer can interleave sessions on both tracks; two developers could work them fully in parallel.

---

## Track A: Website & Lemon Squeezy (Critical Path)

This is the critical path because it contains the only external wait time (LS review ~1 week).

### Step A1: Plausible Analytics Integration (AP 11.4)

Wire up Plausible analytics on the website. This must be done **before** the Privacy Policy review because the Privacy Policy needs to accurately describe what analytics are collected. Doing the policy review first and then adding Plausible would require re-reviewing the policy.

- **Depends on:** Nothing
- **Checkpoint:** Plausible script tag deployed on staging, data flowing in Plausible dashboard
- **Unlocks:** AP 11.1 (Privacy Policy review can now accurately describe analytics)

### Step A2: Privacy Policy & Terms of Service Review (AP 11.1–11.3)

SWR reviews Privacy Policy and ToS as attorney. Privacy Policy must reflect current architecture including Plausible (from A1), Cognito, DynamoDB, SES, and what data is/isn't collected. ToS must reference refund policy (which exists on `/faq`).

- **Depends on:** A1 (Plausible wired up so policy is accurate)
- **Checkpoint:** Privacy Policy and ToS pages updated on staging, personally approved by SWR
- **Unlocks:** AP 1 (front-end review can proceed knowing legal pages are finalized), AP 8A (ToS/Privacy are part of a strong LS application)

### Step A3: Front-End UX & Content Polish (AP 1)

Proofread all copy, fix broken links, add sitemap, verify OG image, responsive check. This is now focused on making the site presentable enough for both end users and the LS application reviewer.

- **Depends on:** A2 (legal pages finalized — no point proofreading pages that will change)
- **Checkpoint:** All public pages proofread, no 404s, sitemap live, responsive check passed
- **Unlocks:** AP 8A (website presentable for LS), AP 3 (marketing references final content)

### Step A4: Documentation Accuracy (AP 5 essential items: 5.1, 5.2, 5.6)

Audit existing docs pages, verify Getting Started guide, confirm docs link resolves. LS reviewers may click through to docs — they should be accurate and functional.

- **Depends on:** Nothing (can run in parallel with A2/A3 since docs content is independent of legal pages)
- **Checkpoint:** Every docs slug visited and content verified, no 404s from navigation
- **Unlocks:** AP 8A (docs accuracy for LS application), AP 6 (support infra references docs)

### Step A5: DMARC Record (AP 7.1)

Single DNS TXT record addition in GoDaddy. Takes 5 minutes of work plus propagation time.

- **Depends on:** Nothing
- **Checkpoint:** `dig TXT _dmarc.hic-ai.com` returns valid DMARC record
- **Unlocks:** AP 8A (strengthens LS application — shows professional email setup), AP 7 remainder (email deliverability testing is more meaningful with DMARC in place)

### Step A6: Social Media Presence (AP 8.3)

Create Twitter/X account for HIC AI. Minimal but required — LS previously cited lack of social media.

- **Depends on:** Nothing
- **Checkpoint:** Twitter/X account exists with bio, link to hic-ai.com, and at least one post
- **Unlocks:** AP 8A (LS application can reference social media)

### Step A7: Submit LS Application (AP 8.4)

Submit Lemon Squeezy Merchant of Record application. This is the trigger for the ~1 week external wait.

- **Depends on:** A2 ✅ (legal pages accurate), A3 ✅ (website presentable), A4 ✅ (docs functional), A5 ✅ (DMARC live), A6 ✅ (social media exists)
- **Checkpoint:** Application submitted, confirmation email received
- **Unlocks:** ~1 week wait, then AP 8C (if approved) or AP 8D (if rejected)

### Step A8: LS Decision → Payment Integration (AP 8C or 8D)

If approved: Integrate LS checkout, webhooks, license provisioning, Customer Portal. If rejected: Switch Stripe to live mode.

- **Depends on:** A7 + LS decision (external)
- **Checkpoint:** All 4 checkout paths tested E2E through chosen provider, webhook events confirmed firing
- **Unlocks:** AP 4 (production deployment can proceed with payment provider locked in)

---

## Track B: Extension Finalization & Audit (hic Repo)

This track has no external wait times. It is purely development and verification work.

### Step B1: Version Update Wire-up (AP 9.8–9.10)

The last true feature development work. Parse `latestVersion` from heartbeat response, implement `Mouse: Update Version` command, add status bar notification. This is Phase 6 completion.

- **Depends on:** Nothing (server-side heartbeat already returns version fields)
- **Checkpoint:** Extension detects newer version from heartbeat, notification appears, `Mouse: Update Version` downloads and installs VSIX. All tests pass.
- **Unlocks:** AP 2 (security audit should come after this — it's the last code change)

### Step B2: Security Audit (AP 2)

SAST scan, `npm audit`, manual auth flow review, PKCE review, credential scan. Must be done **after** B1 because the security audit should cover the final codebase, not an intermediate state that will change.

- **Depends on:** B1 (all feature code finalized — auditing code that's about to change is wasted effort)
- **Checkpoint:** SAST scan clean or all findings triaged, `npm audit` clean, auth flow review documented with CWE/CVE references, findings memo produced
- **Unlocks:** AP 4 (production deployment requires security sign-off)

### Step B3: Monitoring & Observability (AP 10.1–10.6)

Health endpoint, metric filters, log retention, severity definitions, incident runbook. This is infrastructure work in the website repo but is sequenced here because it's operationally tied to the extension's backend.

- **Depends on:** Nothing (structured logging is already complete; this builds on it)
- **Checkpoint:** `/api/health` returns 200, metric filters deployed, alarms configured, log retention set, runbook exists
- **Unlocks:** AP 4 (cannot deploy to production without monitoring)

> **Note:** B3 can actually run in parallel with B1 and B2. It's independent infrastructure work. Listed here because it feeds into the same convergence point.

---

## Convergence: Launch Readiness

Both tracks must complete before production deployment.

### Convergence Gate: AP 4 (Launch Plan & Production Deployment)

- **Depends on:**
  - Track A: A8 ✅ (payment provider locked in and integrated)
  - Track B: B2 ✅ (security audit complete), B3 ✅ (monitoring in place)
  - AP 7 ✅ (email deliverability verified — transactional emails must work before accepting payments)
  - AP 11 ✅ (legal review complete — ToS/Privacy must be accurate before accepting payments)
- **Checkpoint:** Production environment created in Amplify, secrets populated, CloudFormation deployed, webhooks pointed at production, rollback procedures documented, DNS cut-over plan ready
- **Unlocks:** LAUNCH

---

## Full Dependency Graph

Arrows indicate "must complete before." Items at the same depth level can run in parallel.

```
Level 0 (no dependencies — start immediately):
├── AP 11.4  Plausible integration
├── AP 7.1   DMARC record
├── AP 8.3   Social media presence
├── AP 5*    Docs accuracy (essential items)
├── AP 9.8   Version update wire-up ─┐
├── AP 9.9   Update Version command  ├── AP 9 (feature dev)
├── AP 9.10  Version notification   ─┘
└── AP 10    Monitoring (10.1–10.6)

Level 1 (depends on Level 0 items):
├── AP 11.1–11.3  Privacy/ToS review  [needs: AP 11.4 Plausible]
└── AP 2          Security audit       [needs: AP 9.8–9.10 code finalized]

Level 2 (depends on Level 1 items):
├── AP 1   Front-end UX polish  [needs: AP 11.1–11.3 legal pages finalized]
└── AP 7   Email deliverability (remaining items 7.2–7.6)  [better after: AP 7.1 DMARC]

Level 3 (depends on Level 2 items):
├── AP 8A  LS application  [needs: AP 1 website presentable, AP 5 docs, AP 7.1, AP 8.3 social]
└── AP 3   Marketing plan  [needs: AP 1 content finalized]

Level 4 (depends on Level 3 + external wait):
└── AP 8C/8D  Payment integration  [needs: AP 8A + LS decision]

Level 5 (convergence):
├── AP 4   Production deployment  [needs: AP 8C/8D, AP 2, AP 10, AP 7, AP 11]
├── AP 6   Support infrastructure [needs: AP 5 docs]
└── AP 3   Marketing (finalize)   [needs: AP 1 content]

Level 6:
└── LAUNCH  [needs: AP 4]
```

---

## Checkpoint Definitions

Each checkpoint is a verifiable gate that must be passed before dependent work proceeds.

| ID    | Checkpoint                    | Verification Method                                                         | Gate For                     |
| ----- | ----------------------------- | --------------------------------------------------------------------------- | ---------------------------- |
| CP-1  | Plausible analytics wired up  | Visit staging site → verify network request to Plausible → verify dashboard | AP 11.1 (Privacy Policy)     |
| CP-2  | Privacy Policy accurate       | SWR attorney review of `/privacy` page on staging                           | AP 1, AP 8A                  |
| CP-3  | Terms of Service accurate     | SWR attorney review of `/terms` page on staging; refund xref from `/faq`    | AP 1, AP 8A                  |
| CP-4  | Website presentable           | All pages proofread, no 404s, sitemap live, responsive check, OG verified   | AP 8A (LS application)       |
| CP-5  | Docs functional               | Every docs slug loads, Getting Started guide complete, no nav 404s          | AP 8A (LS application)       |
| CP-6  | DMARC live                    | `dig TXT _dmarc.hic-ai.com` returns valid record                            | AP 7, AP 8A                  |
| CP-7  | Social media exists           | Twitter/X account live with bio + link + at least 1 post                    | AP 8A (LS application)       |
| CP-8  | LS application submitted      | Confirmation email from Lemon Squeezy                                       | AP 8C/8D (after ~1 week)     |
| CP-9  | Version update working        | Extension detects newer version, notification shows, `Update Version` works | AP 2 (security audit)        |
| CP-10 | All extension tests pass      | `npm test` in mouse, mouse-vscode, licensing — 0 failures                   | AP 2 (security audit)        |
| CP-11 | Security audit complete       | Findings memo produced with CWE/CVE refs, SAST clean or triaged             | AP 4 (production deployment) |
| CP-12 | Monitoring operational        | `/api/health` returns 200, metric alarms configured, runbook exists         | AP 4 (production deployment) |
| CP-13 | Email deliverability verified | Test emails reach Gmail + Outlook inboxes (not spam), all types fire        | AP 4 (production deployment) |
| CP-14 | Payment integration tested    | All 4 checkout paths E2E tested, webhooks firing, license provisioned       | AP 4 (production deployment) |
| CP-15 | Production environment ready  | Amplify prod env created, secrets populated, CF deployed, webhooks pointed  | LAUNCH                       |

---

## Action Plan Dependency Detail

### AP 1: Front-End UX & Content

| Dependency           | Type | Reason                                                                                  |
| -------------------- | ---- | --------------------------------------------------------------------------------------- |
| AP 11.1–11.3 (Legal) | Hard | Legal pages must be finalized before proofreading the full site — otherwise rework      |
| AP 11.4 (Plausible)  | Soft | Plausible script should be deployed before finalizing page templates (avoids re-deploy) |

**Depended on by:** AP 3 (marketing references content), AP 8A (LS wants presentable site)

### AP 2: Security Audit

| Dependency            | Type | Reason                                                                                   |
| --------------------- | ---- | ---------------------------------------------------------------------------------------- |
| AP 9.8–9.10 (Phase 6) | Hard | Security audit should cover the _final_ codebase — auditing before last feature is waste |

**Depended on by:** AP 4 (cannot deploy to production without security clearance)

### AP 3: Marketing Plan

| Dependency        | Type | Reason                                                        |
| ----------------- | ---- | ------------------------------------------------------------- |
| AP 1 (UX/Content) | Soft | Marketing materials reference website content and screenshots |

**Depended on by:** Nothing (post-launch is OK)

### AP 4: Launch Plan & Production Deployment

| Dependency          | Type | Reason                                                        |
| ------------------- | ---- | ------------------------------------------------------------- |
| AP 2 (Security)     | Hard | Cannot deploy to production without security sign-off         |
| AP 8C/8D (Payments) | Hard | Must know which payment provider to configure in production   |
| AP 10 (Monitoring)  | Hard | Cannot launch blind — health endpoint and alarms must exist   |
| AP 7 (Email)        | Hard | Transactional emails must work before accepting real payments |
| AP 11 (Legal)       | Hard | Privacy/ToS must be accurate before production accepts users  |

**Depended on by:** LAUNCH

### AP 5: Documentation Plan

| Dependency | Type | Reason                            |
| ---------- | ---- | --------------------------------- |
| None       | —    | Docs are independent content work |

**Depended on by:** AP 6 (support infra references docs), AP 8A (LS reviewers may check docs)

### AP 6: Support Infrastructure

| Dependency  | Type | Reason                                                      |
| ----------- | ---- | ----------------------------------------------------------- |
| AP 5 (Docs) | Soft | Good docs reduce support volume; support pages link to docs |

**Depended on by:** Nothing (should-have for launch, not hard blocker)

### AP 7: Email Verification & Deliverability

| Dependency | Type | Reason                                       |
| ---------- | ---- | -------------------------------------------- |
| None       | —    | SES production is already approved (50K/day) |

**Internal ordering:** Item 7.1 (DMARC) should be done first — it's a DNS change that takes seconds and improves all subsequent email testing.

**Depended on by:** AP 4 (emails must work), AP 8A (DMARC strengthens LS application)

### AP 8: Payments & Lemon Squeezy Migration

| Dependency           | Type | Reason                                                           |
| -------------------- | ---- | ---------------------------------------------------------------- |
| AP 1 (UX/Content)    | Hard | LS requires presentable website for MoR application              |
| AP 5 (Docs)          | Hard | LS reviewers may check docs — must be functional                 |
| AP 7.1 (DMARC)       | Soft | Strengthens application (professional email setup)               |
| AP 8.3 (Social)      | Hard | LS previously rejected citing no social media                    |
| AP 11.1–11.3 (Legal) | Hard | ToS/Privacy must be in place — LS expects a legitimate operation |

**Internal ordering:** Phase A (application) → external wait → Phase C (LS approves) or Phase D (LS rejects)

**Depended on by:** AP 4 (payment provider must be determined before production deployment)

### AP 9: Interoperability & Compatibility

| Dependency          | Type   | Reason                       |
| ------------------- | ------ | ---------------------------- |
| Mouse v0.10.10 VSIX | Met ✅ | Already built and E2E tested |

**Internal note:** Items 9.1–9.7 (compatibility testing) have no dependencies. Items 9.8–9.10 (version update wire-up) are the last feature development work.

**Depended on by:** AP 2 (security audit should come after code is finalized)

### AP 10: Monitoring & Observability

| Dependency         | Type   | Reason                                                 |
| ------------------ | ------ | ------------------------------------------------------ |
| Structured logging | Met ✅ | Already complete (33 handlers, 24 route files, Feb 15) |

**Depended on by:** AP 4 (cannot deploy to production without monitoring)

### AP 11: Legal Review

| Dependency          | Type | Reason                                                                      |
| ------------------- | ---- | --------------------------------------------------------------------------- |
| AP 11.4 (Plausible) | Hard | Privacy Policy must accurately describe analytics — wire up Plausible first |

**Internal ordering:** Wire up Plausible (11.4) → review Privacy Policy (11.1) → review ToS (11.2) → add refund xref (11.3)

**Depended on by:** AP 1 (legal pages must be final before full site proofread), AP 4 (legal must be accurate before production), AP 8A (legal pages strengthen LS application)

---

## What Can Run in Parallel

### Fully Independent (zero overlap, can be done simultaneously)

| Track A Work                  | Track B Work                       |
| ----------------------------- | ---------------------------------- |
| AP 11.4 Plausible integration | AP 9.8–9.10 Version update wire-up |
| AP 11.1–11.3 Legal review     | AP 2 Security audit                |
| AP 1 Front-end polish         | AP 10 Monitoring setup             |
| AP 5 Documentation            |                                    |
| AP 7 Email deliverability     |                                    |
| AP 8A LS application          |                                    |

### Safe Parallel Within Track A

- AP 5 (docs), AP 7.1 (DMARC), AP 8.3 (social media) — all have no dependencies, can start Day 1
- AP 11.4 (Plausible) can start Day 1 — the only thing it blocks is the legal review

### Safe Parallel Within Track B

- AP 9.8–9.10 (version wire-up) and AP 10 (monitoring) are independent
- AP 2 (security audit) must wait for AP 9.8–9.10 to be complete

### NOT Safe to Parallelize

| Work Item                  | Must Wait For                | Why                                         |
| -------------------------- | ---------------------------- | ------------------------------------------- |
| AP 11.1 (Privacy Policy)   | AP 11.4 (Plausible wired up) | Policy must describe actual analytics state |
| AP 1 (Full site proofread) | AP 11.1–11.3 (Legal review)  | Don't proofread pages that will change      |
| AP 2 (Security audit)      | AP 9.8–9.10 (Feature code)   | Audit the final code, not intermediate      |
| AP 8A (LS application)     | AP 1 + AP 5 + AP 8.3         | Application needs presentable site + docs   |
| AP 4 (Production deploy)   | AP 2 + AP 8C/8D + AP 10      | All convergence dependencies                |

---

## External Blockers & Wait Times

| Blocker                    | Estimated Wait | What Can Proceed During Wait                                                        |
| -------------------------- | -------------- | ----------------------------------------------------------------------------------- |
| LS application review      | ~1 week        | All of Track B (AP 9, AP 2, AP 10), AP 7 remainder, AP 5 remainder, AP 6, AP 3 prep |
| DMARC DNS propagation      | 1–48 hours     | Everything — propagation is passive                                                 |
| Plausible account setup    | Minutes        | N/A — effectively instant                                                           |
| Twitter/X account creation | Minutes        | N/A — effectively instant                                                           |

### Time-Sensitivity Ranking

1. **LS application** — longest external wait (~1 week); submit as early as structurally possible
2. **DMARC record** — propagation delay; do Day 1 even though it's a 5-minute task
3. **Everything else** — no external waits; pure development/review effort

---

## Summary: Minimum Viable Path to Launch

The shortest path through the dependency graph, assuming a single developer:

```
Day 1:  AP 11.4 (Plausible, 30m) + AP 7.1 (DMARC, 15m) + AP 8.3 (Social, 30m)
        AP 9.8–9.10 begin (version wire-up, 4–6h)
        AP 5 essential items begin (docs, 2–4h)

Day 2:  AP 11.1–11.3 (Legal review, 2.5h) [Plausible now wired]
        AP 9.8–9.10 continue/complete
        AP 10 begin (monitoring, 4–6h)

Day 3:  AP 1 (Front-end polish, 6–8h) [legal pages now final]
        AP 2 begin (security audit) [version code now final]

Day 4:  AP 8A: Submit LS application [site presentable, docs functional, social exists]
        AP 2 continue/complete
        AP 7 remainder (email testing, 2–3h)
        AP 10 continue/complete

Days 5–10: LS review wait — Track B completes, AP 6, AP 3 prep

Day 11: LS decision → AP 8C (migration, 8–10h) or AP 8D (Stripe live, 3–4h)

Day 12: AP 4 (production deployment, 6–8h)

Day 13: Final verification → LAUNCH
```

This is optimistic but structurally sound. The critical path runs through: Plausible → Legal → UX → LS application → LS wait → Payment integration → Production deploy.
