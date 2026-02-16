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
10. [Action Plan 12: Personal Social Media Cleanup](#action-plan-12-personal-social-media-cleanup)
11. [Action Plan 13: Private Pre-Launch Disclosure](#action-plan-13-private-pre-launch-disclosure)

---

## Two Independent Tracks

The remaining work falls into two largely independent tracks that converge at launch. This is the single most important structural insight for scheduling:

```
TRACK A (Website + LS)              TRACK B (Extension + Audit)
─────────────────────               ────────────────────────────
AP 11.4: Wire up Plausible         D1–D8: Resolve open decisions
    │                                   (~15 min with SWR)
    ▼                                   │
AP 11.1–11.3: Privacy/ToS              ▼
    review (reflects Plausible)    AP 9.8–9.10: Heartbeat version
    │                                   wire-up + Update command
    ▼                                   │
AP 1: Front-end UX/content             ▼
    (includes legal pages)         AP 2b: Comprehensive security
    │                                   audit (after code finalized)
    ▼                                   │
AP 9.1–9.7: E2E client                 ▼
    verification (hic repo)        AP 10: Monitoring & observability
    │                                   (health endpoint, alarms)
    ├──▶ AP 5: Docs accuracy            │
    │                                   │
    ▼                                   │
AP 2a: Website surface security        │
    review (npm audit, headers,         │
    unauthenticated endpoints)          │
    │                                   │
    ▼                                   │
AP 12a: Delete Facebook                │
    (no disclosure risk)                │
    │                                   │
    ▼                                   │
AP 7.1: DMARC record                   │
    │                                   │
    ▼                                   │
AP 8.3: HIC AI company socials         │
    (Twitter/X — NOT personal)          │
    │                                   │
    ▼                                   │
AP 8A: LS application ─────────────────┤
    │                                   │
    │  ~~~~ ~1 week wait ~~~~           │
    │                                   │
    │  During wait:                     │
    │                                   │
    ▼                                   │
AP 13: Private disclosures             │
    (partner → key clients)             │
    │                                   │
    ▼                                   │
AP 12b: LinkedIn update                │
    (AFTER all private                  │
     disclosures complete)              │
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

### Step A3.5: E2E Client Verification Pass (AP 9.1–9.7, hic repo)

Smoke-test the installation, activation, and MCP tool invocation flow for each supported client: Copilot, Cursor, Kiro, Claude Code CLI, and Roo Code. This is a context switch back to the hic repo, but it must happen before the documentation rewrite because the docs need to describe verified, accurate per-client flows.

**Scope (hic repo — 1–2 hours):**
- Verify `Initialize Workspace` generates correct MCP config per client (`.vscode/mcp.json`, `.cursor/mcp.json`, `.kiro/settings/mcp.json`, `.mcp.json`, global config)
- Confirm CJS build loads in Cursor and Kiro (CJS was added at v0.10.9)
- Confirm Claude Code CLI connects via stdio and can invoke Mouse tools
- Confirm Roo Code global config path works
- Document any client-specific quirks, workarounds, or known issues
- Fix any discovered issues before returning to website repo for documentation

**What this is NOT:** This is not AP 9.8–9.10 (version update wire-up). Those remain in Track B for the LS wait window.

- **Depends on:** A3 (front-end polish complete — natural context-switch point; compatibility claims on the website should be reviewed first)
- **Checkpoint:** All 5 supported clients verified E2E; any fixes committed; client compatibility matrix confirmed accurate
- **Unlocks:** A4 (documentation rewrite can proceed with verified per-client installation/activation flows)

### Step A4: Documentation Accuracy (AP 5 essential items: 5.1, 5.2, 5.6)

Audit existing docs pages, verify Getting Started guide, confirm docs link resolves. LS reviewers may click through to docs — they should be accurate and functional.

- **Depends on:** A3.5 (E2E client verification — docs must describe verified per-client flows, not assumptions)
- **Checkpoint:** Every docs slug visited and content verified, no 404s from navigation
- **Unlocks:** AP 8A (docs accuracy for LS application), AP 6 (support infra references docs)

### Step A4.5: Website Surface Security Review (AP 2a)

Focused security review of the public-facing website before submitting to LS. This is not the comprehensive audit (that's AP 2b in Track B) — it's specifically looking for anything an LS reviewer might notice or that could cause rejection: unprotected endpoints, `npm audit` criticals, missing HTTP security headers, information leakage in error responses.

**Scope (website repo only):**

- `npm audit --production` on plg-website — flag/fix any critical or high vulnerabilities
- Review the 4 unauthenticated endpoints (`/api/license/trial/init`, `/api/webhooks/stripe`, `/api/webhooks/keygen`, public routes) — verify webhook signature validation, rate limiting, error response sanitization
- Verify P0/P1/P2 safeJsonParse fixes are deployed to staging
- Check HTTP security headers on staging.hic-ai.com (CSP, HSTS, X-Frame-Options)
- Quick scan for secrets/keys in client-side bundle (build output inspection)
- Review all `package.json` files in website repo for `publishConfig.access` settings, license field consistency, and accidental public exposure of proprietary packages
- Brief findings note (not the full CWE/CVE memo — that's AP 2b)

**What this is NOT:** This is not the comprehensive SAST scan, auth flow review, PKCE audit, or full credential scan. Those remain in AP 2b after all feature code is finalized.

- **Depends on:** A3 (front-end polish — so the site is in its near-final state when reviewed) or can run in parallel with A3/A4 since it targets API routes and infrastructure, not content
- **Checkpoint:** `npm audit` clean or criticals documented, unauthenticated endpoints verified, HTTP headers confirmed, no secrets in client bundle, brief security note produced
- **Unlocks:** AP 8A (LS application strengthened — SWR can submit with confidence that the site has been security-reviewed)

### Step A5: DMARC Record (AP 7.1)

Single DNS TXT record addition in GoDaddy. Takes 5 minutes of work plus propagation time.

- **Depends on:** Nothing
- **Checkpoint:** `dig TXT _dmarc.hic-ai.com` returns valid DMARC record
- **Unlocks:** AP 8A (strengthens LS application — shows professional email setup), AP 7 remainder (email deliverability testing is more meaningful with DMARC in place)

### Step A5.5: Delete Facebook (AP 12a)

Delete personal Facebook account. This is social media cleanup with zero disclosure risk — removing a profile announces nothing. Sequenced here because SWR is already in the social media headspace while working on DMARC and HIC AI accounts.

- **Depends on:** Nothing (safe anytime; placed here for workflow convenience)
- **Checkpoint:** Facebook account deletion initiated (note: Facebook has a 30-day grace period before permanent deletion)
- **Unlocks:** Nothing directly — this is personal housekeeping

### Step A6: HIC AI Social Media Presence (AP 8.3)

Create Twitter/X account for HIC AI. This is a **company** account only — do NOT update personal profiles (LinkedIn, etc.) at this stage. LS previously cited lack of social media.

- **Depends on:** Nothing
- **Checkpoint:** HIC AI Twitter/X account exists with bio, link to hic-ai.com, and at least one post
- **Unlocks:** AP 8A (LS application can reference social media)

> **Critical distinction:** Creating HIC AI company accounts (AP 8.3) is safe before private disclosures. Updating SWR's _personal_ LinkedIn profile (AP 12b) is the disclosure event and must wait until after AP 13.

### Step A7: Submit LS Application (AP 8.4)

Submit Lemon Squeezy Merchant of Record application. This is the trigger for the ~1 week external wait.

- **Depends on:** A2 ✅ (legal pages accurate), A3 ✅ (website presentable), A4 ✅ (docs functional), A5 ✅ (DMARC live), A6 ✅ (social media exists)
- **Checkpoint:** Application submitted, confirmation email received
- **Unlocks:** ~1 week wait, then AP 8C (if approved) or AP 8D (if rejected)

### Step A7.5: Private Pre-Launch Disclosure (AP 13)

Private conversations with key individuals who must learn about HIC AI directly from SWR before any public profile changes. This slots into the LS wait window (~1 week) for three reasons:

1. **Certainty.** The LS application is submitted, technical work is substantially done, launch is real and imminent. SWR is disclosing a fact, not a hypothetical.
2. **Availability.** The LS wait is dead time for Track A. Track B dev sessions fill some hours, but the disclosure conversations are a different kind of work that fits the interstitial time.
3. **Reversibility.** If LS rejects and launch needs more time, nobody told is waiting on a public announcement. Private disclosures create no public clock.

Recommended internal sequence:

| Order | Who                                 | Why First                                                                                       | Suggested Frame                                                                                       |
| ----- | ----------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1     | Law partner                         | Non-negotiable first. Must hear from SWR in person or by phone, never from LinkedIn.            | "Built a software product on my own time, incorporating, doesn't affect my commitment to [practice]." |
| 2     | Key client ($4B fund / SW engineer) | Likely the most _interested_ rather than concerned. Potential early supporter or even investor. | "My public profile is about to change — wanted you to hear it from me directly."                      |
| 3     | Other key clients/contacts          | Brief, professional. Anyone close enough to warrant a private heads-up.                         | "Nothing changes about my availability to you."                                                       |
| 4     | Silence                             | Let the LinkedIn update do the rest. Anyone not on the private list learns organically.         | —                                                                                                     |

- **Depends on:** A7 (LS application submitted — SWR now has certainty of imminent launch)
- **Checkpoint:** All private disclosure conversations completed. SWR confirms "everyone who needs to hear from me directly has heard from me."
- **Unlocks:** AP 12b (LinkedIn/personal profile update — the irreversible public disclosure)

> **Note on the "neglecting their matters" concern:** The timing works in SWR's favor. This is not a retirement announcement. SWR built this on personal time. Being proactive about telling clients _before_ it becomes public demonstrates exactly the attentiveness they want to see.

### Step A7.6: LinkedIn / Personal Profile Update (AP 12b)

Update LinkedIn profile to reflect "CEO/Founder, HIC AI, Inc." and any other personal social media updates. This is the **irreversible public disclosure event** — once LinkedIn is updated, the information is public and discoverable.

- **Depends on:** A7.5 ✅ (ALL private disclosures complete — partner, key clients, contacts)
- **Checkpoint:** LinkedIn updated, no surprised messages from anyone on the private disclosure list
- **Unlocks:** AP 3 (marketing can now reference SWR's founder story publicly), general public awareness of SWR's role

### Step A8: LS Decision → Payment Integration (AP 8C or 8D)

If approved: Integrate LS checkout, webhooks, license provisioning, Customer Portal. If rejected: Switch Stripe to live mode.

- **Depends on:** A7 + LS decision (external)
- **Checkpoint:** All 4 checkout paths tested E2E through chosen provider, webhook events confirmed firing
- **Unlocks:** AP 4 (production deployment can proceed with payment provider locked in)

> **Sequencing note:** A8 (payment integration) and A7.5/A7.6 (disclosures/LinkedIn) are independent of each other after A7 (LS submission). They can proceed in parallel during the LS wait. However, A7.6 (LinkedIn) should ideally be done before or at the same time as LAUNCH — there should be no gap where the product is live but SWR's public profile doesn't acknowledge it.

---

## Track B: Extension Finalization & Audit (hic Repo)

This track has no external wait times. It is purely development and verification work.

### Step B0: Resolve Open Decisions (D1–D8)

Eight business decisions must be resolved before autonomous execution of Track B can begin. These are documented in the companion assessment doc under "Track B: Open Decisions Before Starting Work." All 8 can be addressed in a single ~15-minute decision session with SWR.

| Decision | Topic | Affects |
|----------|-------|--------|
| D1 | `/api/version` endpoint: create or remove `checkForUpdates()`? | B1 scope |
| D2 | "Update Now" UX: browser redirect acceptable for v1? | B1 scope |
| D3 | EventBridge `readyVersion` gating: deploy or launch without? | B1 scope |
| D4 | SAST tool choice: CodeQL, Snyk, or ESLint plugin? | B2 scope |
| D5 | `package.json` field standardization: `private`/`license` values | B2 scope |
| D6 | Security findings memo: format and location | B2 scope |
| D7 | Log retention: 14 or 30 days? | B3 scope |
| D8 | Production API base URL for `constants.js` | Convergence (AP 4) |

> **Important context (D1–D3):** Investigation on Feb 16 revealed that the heartbeat `onSuccess` version parsing, `mouse.checkForUpdates`, `mouse.showUpdateInfo`, and `StatusBarManager.showUpdateAvailable()` are all **already implemented.** B1 may need verification and decision-driven cleanup, not greenfield implementation. The scope of AP 9.8–9.10 should be reassessed once D1–D3 are resolved.

- **Depends on:** Nothing (decisions only, no code dependencies)
- **Checkpoint:** All 8 decisions documented with chosen option; B1 scope revised if needed
- **Unlocks:** B1, B2, B3 (all Track B steps depend on these decisions being resolved)

### Step B1: Version Update Wire-up (AP 9.8–9.10)

The last true feature development work. Parse `latestVersion` from heartbeat response, implement `Mouse: Update Version` command, add status bar notification. This is Phase 6 completion.

- **Depends on:** B0 (decisions D1–D3 resolved — scope depends on chosen options)
- **Checkpoint:** Extension detects newer version from heartbeat, notification appears, `Mouse: Update Version` downloads and installs VSIX. All tests pass.
- **Unlocks:** AP 2 (security audit should come after this — it's the last code change)

### Step B2: Comprehensive Security Audit (AP 2b)

Full SAST/CodeQL scan across both repos, complete auth flow review (Cognito OAuth, PKCE, token refresh, browser-delegated activation), authorization review (per-user device scoping, seat enforcement, role-based access), and documented findings memo. Must be done **after** B1 because the security audit should cover the final codebase, not an intermediate state that will change.

This is the thorough audit — AP 2a (website surface review, done pre-LS in Track A) already caught the most visible issues. AP 2b covers the deeper attack surface: extension code, auth protocols, cross-repo credential flow, comprehensive `package.json` audit across both repos, and the formal CWE/CVE documentation.

- **Depends on:** B0 (decisions D4–D6 resolved), B1 (all feature code finalized — auditing code that's about to change is wasted effort), AP 2a (website surface review done — no need to repeat those checks)
- **Checkpoint:** SAST scan clean or all findings triaged, `npm audit` clean across all packages, all `package.json` files audited for `publishConfig.access` (no accidental `public`), license field consistency (`UNLICENSED` vs proprietary), repository URLs, and package naming — auth flow review documented with CWE/CVE references, findings memo produced
- **Unlocks:** AP 4 (production deployment requires security sign-off)

### Step B3: Monitoring & Observability (AP 10.1–10.6)

Health endpoint, metric filters, log retention, severity definitions, incident runbook. This is infrastructure work in the website repo but is sequenced here because it's operationally tied to the extension's backend.

- **Depends on:** B0 (decision D7 resolved — log retention period needed for configuration)
- **Checkpoint:** `/api/health` returns 200, metric filters deployed, alarms configured, log retention set, runbook exists
- **Unlocks:** AP 4 (cannot deploy to production without monitoring)

> **Note:** B3 can actually run in parallel with B1 and B2 (after B0 decisions are resolved). It's independent infrastructure work. Listed here because it feeds into the same convergence point.

---

## Convergence: Launch Readiness

Both tracks must complete before production deployment.

### Convergence Gate: AP 4 (Launch Plan & Production Deployment)

- **Depends on:**
  - Track A: A8 ✅ (payment provider locked in and integrated)
  - Track A: A4.5 ✅ (website surface security review done pre-LS)
  - Track B: B2 ✅ (comprehensive security audit complete), B3 ✅ (monitoring in place)
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
├── AP 12a   Delete Facebook (no disclosure risk)
├── AP 7.1   DMARC record
├── AP 8.3   HIC AI company socials (NOT personal profiles)
└── D1–D8   Resolve open decisions (~15 min with SWR) ── Track B gate

Level 0.5 (depends on D1–D8 decisions):
├── AP 9.8   Version update wire-up ─┐
├── AP 9.9   Update Version command  ├── AP 9 (feature dev) [needs: D1–D3]
├── AP 9.10  Version notification   ─┘
└── AP 10    Monitoring (10.1–10.6)  [needs: D7]

Level 1 (depends on Level 0 items):
├── AP 11.1–11.3  Privacy/ToS review  [needs: AP 11.4 Plausible]
└── AP 2b         Comprehensive audit  [needs: D4–D6, AP 9.8–9.10 code finalized, AP 2a done]

Level 2 (depends on Level 1 items):
├── AP 1   Front-end UX polish  [needs: AP 11.1–11.3 legal pages finalized]
├── AP 2a  Website surface security review  [needs: AP 1 near-final, or parallel with A3/A4]
└── AP 7   Email deliverability (remaining items 7.2–7.6)  [better after: AP 7.1 DMARC]

Level 2.5 (hic repo context switch after front-end polish):
└── AP 9.1–9.7  E2E client verification  [needs: AP 1 front-end polish — verify claims before docs]

Level 3 (depends on Level 2 / 2.5 items):
├── AP 5   Docs accuracy (essential items)  [needs: AP 9.1–9.7 E2E verification — docs must describe verified flows]
├── AP 8A  LS application  [needs: AP 1 website presentable, AP 2a surface review, AP 5 docs, AP 7.1, AP 8.3 social]
└── AP 3   Marketing plan  [needs: AP 1 content finalized]

Level 3.5 (during LS wait — personal/disclosure track):
├── AP 13   Private pre-launch disclosures  [needs: AP 8A submitted — gives SWR certainty]
└── AP 12b  LinkedIn / personal profile update  [needs: AP 13 ALL disclosures complete]

Level 4 (depends on Level 3 + external wait):
└── AP 8C/8D  Payment integration  [needs: AP 8A + LS decision]

Level 5 (convergence):
├── AP 4   Production deployment  [needs: AP 8C/8D, AP 2b, AP 10, AP 7, AP 11]
├── AP 6   Support infrastructure [needs: AP 5 docs]
└── AP 3   Marketing (finalize)   [needs: AP 1 content, AP 12b LinkedIn done]

Level 6:
└── LAUNCH  [needs: AP 4, AP 12b (personal profile reflects founder role)]
```

---

## Checkpoint Definitions

Each checkpoint is a verifiable gate that must be passed before dependent work proceeds.

| ID     | Checkpoint                    | Verification Method                                                         | Gate For                     |
| ------ | ----------------------------- | --------------------------------------------------------------------------- | ---------------------------- |
| CP-1   | Plausible analytics wired up  | Visit staging site → verify network request to Plausible → verify dashboard | AP 11.1 (Privacy Policy)     |
| CP-2   | Privacy Policy accurate       | SWR attorney review of `/privacy` page on staging                           | AP 1, AP 8A                  |
| CP-3   | Terms of Service accurate     | SWR attorney review of `/terms` page on staging; refund xref from `/faq`    | AP 1, AP 8A                  |
| CP-4   | Website presentable           | All pages proofread, no 404s, sitemap live, responsive check, OG verified   | AP 8A (LS application)       |
| CP-5   | Docs functional               | Every docs slug loads, Getting Started guide complete, no nav 404s          | AP 8A (LS application)       |
| CP-6   | DMARC live                    | `dig TXT _dmarc.hic-ai.com` returns valid record                            | AP 7, AP 8A                  |
| CP-7   | Social media exists           | Twitter/X account live with bio + link + at least 1 post                    | AP 8A (LS application)       |
| CP-8   | LS application submitted      | Confirmation email from Lemon Squeezy                                       | AP 8C/8D (after ~1 week)     |
| CP-9   | Version update working        | Extension detects newer version, notification shows, `Update Version` works | AP 2b (comprehensive audit)  |
| CP-10  | All extension tests pass      | `npm test` in mouse, mouse-vscode, licensing — 0 failures                   | AP 2b (comprehensive audit)  |
| CP-10a | Website surface security OK   | `npm audit` clean, headers verified, unauthenticated endpoints reviewed     | AP 8A (LS application)       |
| CP-11  | Comprehensive audit complete  | Findings memo produced with CWE/CVE refs, SAST clean or triaged             | AP 4 (production deployment) |
| CP-12  | Monitoring operational        | `/api/health` returns 200, metric alarms configured, runbook exists         | AP 4 (production deployment) |
| CP-13  | Email deliverability verified | Test emails reach Gmail + Outlook inboxes (not spam), all types fire        | AP 4 (production deployment) |
| CP-14  | Payment integration tested    | All 4 checkout paths E2E tested, webhooks firing, license provisioned       | AP 4 (production deployment) |
| CP-15  | Production environment ready  | Amplify prod env created, secrets populated, CF deployed, webhooks pointed  | LAUNCH                       |
| CP-16  | Facebook deletion initiated   | Account deletion request submitted (30-day grace period)                    | Nothing (housekeeping)       |
| CP-17  | Private disclosures complete  | SWR confirms: partner, key clients, and contacts have been told personally  | AP 12b (LinkedIn update)     |
| CP-18  | Personal profiles updated     | LinkedIn reflects CEO/Founder HIC AI, Inc.; no surprised messages received  | LAUNCH, AP 3 (marketing)     |

---

## Action Plan Dependency Detail

### AP 1: Front-End UX & Content

| Dependency           | Type | Reason                                                                                  |
| -------------------- | ---- | --------------------------------------------------------------------------------------- |
| AP 11.1–11.3 (Legal) | Hard | Legal pages must be finalized before proofreading the full site — otherwise rework      |
| AP 11.4 (Plausible)  | Soft | Plausible script should be deployed before finalizing page templates (avoids re-deploy) |

**Depended on by:** AP 3 (marketing references content), AP 8A (LS wants presentable site)

### AP 2a: Website Surface Security Review (pre-LS)

| Dependency        | Type | Reason                                                                                 |
| ----------------- | ---- | -------------------------------------------------------------------------------------- |
| AP 1 (UX/Content) | Soft | Better to review the site in near-final state, but API routes can be reviewed any time |

**Depended on by:** AP 8A (LS application — submit with confidence the site has been security-reviewed)

### AP 2b: Comprehensive Security Audit (post-feature-freeze)

| Dependency             | Type | Reason                                                                                   |
| ---------------------- | ---- | ---------------------------------------------------------------------------------------- |
| AP 9.8–9.10 (Phase 6)  | Hard | Security audit should cover the _final_ codebase — auditing before last feature is waste |
| AP 2a (Surface review) | Soft | Avoids re-checking what AP 2a already covered; builds on AP 2a findings                  |

**Depended on by:** AP 4 (cannot deploy to production without security clearance)

### AP 3: Marketing Plan

| Dependency        | Type | Reason                                                        |
| ----------------- | ---- | ------------------------------------------------------------- |
| AP 1 (UX/Content) | Soft | Marketing materials reference website content and screenshots |

**Depended on by:** Nothing (post-launch is OK)

### AP 4: Launch Plan & Production Deployment

| Dependency          | Type | Reason                                                              |
| ------------------- | ---- | ------------------------------------------------------------------- |
| AP 2b (Security)    | Hard | Cannot deploy to production without comprehensive security sign-off |
| AP 8C/8D (Payments) | Hard | Must know which payment provider to configure in production         |
| AP 10 (Monitoring)  | Hard | Cannot launch blind — health endpoint and alarms must exist         |
| AP 7 (Email)        | Hard | Transactional emails must work before accepting real payments       |
| AP 11 (Legal)       | Hard | Privacy/ToS must be accurate before production accepts users        |

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
| AP 2a (Surface sec.) | Soft | Ensures no visible vulnerabilities before LS reviewer sees site  |
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

### AP 12: Personal Social Media Cleanup

AP 12 is split into two parts with very different risk profiles:

**AP 12a: Delete Facebook**

| Dependency | Type | Reason                                              |
| ---------- | ---- | --------------------------------------------------- |
| None       | —    | Removing a profile discloses nothing; safe any time |

**Depended on by:** Nothing — this is personal housekeeping

**AP 12b: LinkedIn / Personal Profile Update**

| Dependency                  | Type | Reason                                                                                 |
| --------------------------- | ---- | -------------------------------------------------------------------------------------- |
| AP 13 (Private Disclosures) | Hard | Partner and key clients must hear from SWR directly BEFORE LinkedIn announces anything |

**Depended on by:** AP 3 (marketing can reference founder story publicly), LAUNCH (profile should reflect founder role at launch)

> **Why the split?** Deleting an account (12a) and updating an account (12b) have opposite disclosure profiles. 12a removes information — zero risk. 12b adds information — it is the public disclosure event. They must be treated as entirely separate actions with different dependency gates.

### AP 13: Private Pre-Launch Disclosure

| Dependency                   | Type | Reason                                                                                       |
| ---------------------------- | ---- | -------------------------------------------------------------------------------------------- |
| AP 8A (LS application filed) | Soft | SWR should have certainty that launch is imminent before initiating disclosure conversations |

**Internal ordering:** Law partner (first, non-negotiable) → key client ($4B fund / SW engineer) → other key clients/contacts → silence (let LinkedIn do the rest)

**Depended on by:** AP 12b (LinkedIn update — the irreversible public disclosure event)

> **Timing rationale:** The LS wait window (~1 week) is the pragmatically ideal time. SWR has certainty (application submitted, tech nearly done), has time (LS wait is dead time for Track A), and the sequence is reversible (if LS rejects, no public announcement was made).

### AP 11: Legal Review

| Dependency          | Type | Reason                                                                      |
| ------------------- | ---- | --------------------------------------------------------------------------- |
| AP 11.4 (Plausible) | Hard | Privacy Policy must accurately describe analytics — wire up Plausible first |

**Internal ordering:** Wire up Plausible (11.4) → review Privacy Policy (11.1) → review ToS (11.2) → add refund xref (11.3)

**Depended on by:** AP 1 (legal pages must be final before full site proofread), AP 4 (legal must be accurate before production), AP 8A (legal pages strengthen LS application)

---

## What Can Run in Parallel

### Fully Independent (zero overlap, can be done simultaneously)

| Track A Work                          | Track B Work                       |
| ------------------------------------- | ---------------------------------- |
| AP 11.4 Plausible integration         | AP 9.8–9.10 Version update wire-up |
| AP 11.1–11.3 Legal review             | AP 2b Comprehensive security audit |
| AP 1 Front-end polish                 | AP 10 Monitoring setup             |
| AP 2a Website surface security review |                                    |
| AP 5 Documentation                    |                                    |
| AP 7 Email deliverability             |                                    |
| AP 8A LS application                  |                                    |

### Safe Parallel Within Track A

- AP 5 (docs), AP 7.1 (DMARC), AP 8.3 (social media) — all have no dependencies, can start Day 1
- AP 11.4 (Plausible) can start Day 1 — the only thing it blocks is the legal review

### Safe Parallel Within Track B

- AP 9.8–9.10 (version wire-up) and AP 10 (monitoring) are independent
- AP 2 (security audit) must wait for AP 9.8–9.10 to be complete

### NOT Safe to Parallelize

| Work Item                   | Must Wait For                | Why                                           |
| --------------------------- | ---------------------------- | --------------------------------------------- |
| AP 11.1 (Privacy Policy)    | AP 11.4 (Plausible wired up) | Policy must describe actual analytics state   |
| AP 1 (Full site proofread)  | AP 11.1–11.3 (Legal review)  | Don't proofread pages that will change        |
| AP 2b (Comprehensive audit) | AP 9.8–9.10 (Feature code)   | Audit the final code, not intermediate        |
| AP 8A (LS application)      | AP 1 + AP 5 + AP 8.3         | Application needs presentable site + docs     |
| AP 12b (LinkedIn update)    | AP 13 (Private disclosures)  | Public profile change is the disclosure event |
| AP 4 (Production deploy)    | AP 2 + AP 8C/8D + AP 10      | All convergence dependencies                  |

---

## External Blockers & Wait Times

### Known Wait Times

| Blocker                    | Estimated Wait | What Can Proceed During Wait                                                                   |
| -------------------------- | -------------- | ---------------------------------------------------------------------------------------------- |
| LS application review      | ~1 week        | All of Track B (AP 9, AP 2b, AP 10), AP 7 remainder, AP 5 remainder, AP 6, AP 3 prep           |
| DMARC DNS propagation      | 1–48 hours     | Everything — propagation is passive                                                            |
| Plausible account setup    | Minutes        | N/A — effectively instant                                                                      |
| Twitter/X account creation | Minutes        | N/A — effectively instant                                                                      |
| Private disclosure convos  | 1–5 days       | All of Track B; AP 8C/8D when LS decides (disclosures and payment integration are independent) |

### Require Investigation (work to be done in hic-ai-inc.github.io repo)

The following transitions all occur near the end of the critical path (AP 4 / AP 8C/8D). Any unexpected delay at this stage would push launch. Each needs documented expected wait time and a go-live checklist.

| Blocker                                     | Estimated Wait     | Status          | Notes                                                                                                                                                                                                                 |
| ------------------------------------------- | ------------------ | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **VS Code Marketplace publishing**          | **24–48h** (known) | ⚠️ Needs verify | Publisher ID believed to be `hic-ai` (`hic-ai.mouse`). Review process is out of our hands once submitted. Must plan submission timing ≥ 2 days before launch.                                                         |
| **Open VSX publishing**                     | **Unknown**        | ❌ Investigate  | Need to research Open VSX review/approval timeline and account setup requirements. May differ significantly from VS Code Marketplace.                                                                                 |
| **Stripe test → live mode**                 | **Unknown**        | ❌ Investigate  | Currently in test mode. Need to check: account verification requirements, payout schedule activation, webhook endpoint re-pointing, any review period.                                                                |
| **Lemon Squeezy sandbox → live** (if AP 8C) | **Unknown**        | ❌ Investigate  | If LS approves MoR application: what are the steps to go from sandbox/test to live payment processing? Any additional review?                                                                                         |
| **SES staging → production**                | **Unknown**        | ❌ Investigate  | SES is approved for production (50K/day) on current staging stack. Need to verify: does the new Amplify production environment inherit SES production access, or does a new SES identity/configuration need approval? |
| **Keygen endpoint re-pointing**             | **Unknown**        | ❌ Investigate  | When deploying production environment, Keygen webhook URLs and API endpoints must point to production. Research whether this is instant config change or requires Keygen-side verification/propagation.               |
| **Amplify production environment**          | **Unknown**        | ❌ Investigate  | Creating a new Amplify environment (production branch) — need to document: CloudFormation deployment time, Cognito user pool creation, DynamoDB table provisioning, Secrets Manager population.                       |

> **Why this matters:** The timeline currently assumes Day 10–11 is payment integration + production deployment. If any of these transitions involve a multi-day review or approval process, the true launch date shifts. Investigating all of them in the companion repo before reaching that stage prevents surprises.

### Time-Sensitivity Ranking

1. **VS Code Marketplace** — 24–48h review is a hard external wait; must submit ≥ 2 days before intended launch
2. **LS application** — longest known external wait (~1 week); submit as early as structurally possible
3. **Private disclosures (AP 13)** — human conversations take calendar time; start during LS wait
4. **DMARC record** — propagation delay; do Day 1 even though it’s a 5-minute task
5. **Stripe/LS/SES/Keygen transitions** — assumed fast but uninvestigated; research ASAP to de-risk
6. **Facebook deletion (AP 12a)** — 30-day grace period before permanent; start whenever convenient
7. **Everything else** — no external waits; pure development/review effort

---

## Summary: Minimum Viable Path to Launch

The shortest path through the dependency graph, assuming a single developer:

```
Day 1:  AP 11.4 (Plausible, 30m) + AP 7.1 (DMARC, 15m) + AP 12a (Delete Facebook, 15m)
        AP 9.8–9.10 begin (version wire-up, 4–6h)
        AP 5 essential items begin (docs, 2–4h)

Day 2:  AP 11.1–11.3 (Legal review, 2.5h) [Plausible now wired]
        AP 9.8–9.10 continue/complete
        AP 10 begin (monitoring, 4–6h)

Day 3:  AP 1 (Front-end polish, 6–8h) [legal pages now final]
        AP 2a (Website surface security review, 2–3h) [site near-final]
        AP 8.3 (HIC AI Twitter/X account, 30m) [company account only]

Day 4:  AP 8A: Submit LS application [site presentable, security-reviewed, docs functional, social exists]
        AP 2b begin (comprehensive security audit) [version code now final]
        AP 7 remainder (email testing, 2–3h)
        AP 10 continue/complete

Days 5–7: LS wait — Track B completes, AP 6, AP 3 prep
          AP 13: Private disclosures begin
            Day 5: Law partner conversation (in person or phone)
            Day 6: Key client ($4B fund / SW engineer)
            Day 7: Other key clients/contacts as needed

Days 8–9: AP 12b: LinkedIn update [all private disclosures complete]
          Remaining AP 3 prep (can now reference founder story publicly)

Day 10: LS decision → AP 8C (migration, 8–10h) or AP 8D (Stripe live, 3–4h)
        ⚠️ Stripe/LS transition time TBD — may add 0–3 days

Day 11: AP 4 (production deployment, 6–8h)
        ⚠️ Amplify prod env + SES + Keygen re-pointing time TBD

Day 12: Submit to VS Code Marketplace + Open VSX
        ⚠️ VS Code Marketplace: 24–48h review
        ⚠️ Open VSX: TBD

Day 13–14: Extension goes live → LAUNCH
```

This is optimistic but structurally sound. The critical path runs through: Plausible → Legal → UX → LS application → LS wait (during which: private disclosures → LinkedIn update) → Payment integration → Production deploy → Marketplace publishing.

> **⚠️ Timeline risk:** Days 10–14 contain multiple uninvestigated external transitions (Stripe/LS go-live, SES production, Keygen re-pointing, Amplify production deploy, marketplace review). Research in the companion repo is needed to firm up these estimates and prevent surprises.
