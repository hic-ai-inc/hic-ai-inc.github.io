# Pre-Launch Execution Tracker

**Created:** February 18, 2026
**Purpose:** Single source of truth for current execution state during the Mouse v0.10.10 pre-launch sprint. Updated daily. Phase-ordered checklists derived from all action plans and the Dependency Map v3.
**Owner:** GC (updates) | SWR (reviews, attorney items, final authority)

---

## How to Use

Scan §1 top-to-bottom for current state. Each checkbox is one actionable unit of work. Phases are sequential; items within a phase may be parallel (noted). Check off items as completed with date. §2 tracks SWR-specific items with deadlines. §3 logs decisions as they're made. §4 captures plan deviations. §5 maps every item to its source document.

**Status:** ☐ = not started | 🔄 = in progress | ✅ = done (date)

---

## 1. Phase-Ordered Checklists

### Phase 0.0 — Stream 1A Pre-Scope Investigation (hic repo)

_Prerequisite to Phase 0. Open `~/source/repos/hic` in a new VS Code window. Ask agent the 5 questions in [20260219_DAILY_PLAN.md Addendum](20260219_DAILY_PLAN.md#addendum--5-questions-for-the-hic-repo-agent). Target: 15–20 min reading, 30 min hard cap._

- [x] **0.0** Heartbeat loop, status allow-list, version wire-up pre-scope — read `licensing/heartbeat.js`, `licensing/validation.js`, `extension.js`; answer all 5 questions; document findings; assess Stream 1A true scope before Phase 0 begins (30m) ✅ (Feb 19–20)

**Phase 0.0 Checkpoint:** ✅ Stream 1A complexity known. B-D1 decision resolved. Comprehensive analysis produced: `docs/plg/20260219_COMPREHENSIVE_ANALYSIS_OF_OPEN_HEARTBEAT_ISSUES.md` (1,250 lines, 12 issues, 11 bugs, 9 active fixes, 4 deferred, 8 user journeys). → Proceed to Phase 0.

---

### Phase 0 — Quick Wins & Initial Setup (~3.5h)

_No dependencies. Starting gate. Suggested order: 0.7 first (DNS propagation), then parallel._

**Group A: Research & Verification**

- [x] **0.1** Keygen policy verification — confirm `maxMachines=3`, `ALWAYS_ALLOW_OVERAGE`, `heartbeatDuration=3600` for both policies (15m) ✅ (Feb 22) — Individual: maxMachines=3, Business: maxMachines=5 per seat. All settings confirmed correct.
- [x] **0.2** VS Code Marketplace publisher — `vsce login hic-ai`, confirm PAT valid, `hic-ai.mouse` ID available (15m) ✅ (Feb 22) — Publisher `hic-ai` created via `hic-ai-publisher@outlook.com`. PAT verified, rotated, stored in Secrets Manager (`hic-ai/vsce-marketplace-pat`). Extension ID `hic-ai.mouse` confirmed available.
- [x] **0.3** Twitter/X business account research — can business account be created without personal? Handle `@hic_ai` available? (15–30m) → feeds D-5, AP12-H ✅ (Feb 21) — see `20260221_TWITTER_X_BUSINESS_ACCOUNT_RESEARCH.md`
- [x] **0.4** Production `API_BASE_URL` investigation — examine `release-mouse.sh`, esbuild config, document mechanism (30m cap) → feeds B-D8 ✅ (Feb 22) — Investigation expanded to comprehensive cross-repo analysis. Three memos produced: `20260222_EXTENSION_REPO_API_BASE_URL_INVESTIGATION.md`, `20260222_API_BASE_URL_AND_PROD_NAMING_INVESTIGATION.md`, `20260222_RECOMMENDATIONS_RE_HEARTBEAT_AND_BASE_API_URL_REMEDIATION_PLAN.md`. B-D8 resolved: production API base URL = `https://hic-ai.com`, Option A remediation. See Recommendations memo for full synthesis with heartbeat findings.

**Group B: Quick Fixes**

- [x] **0.5** Fix `setup-cognito.sh` — change `ENVIRONMENT="staging"` to `ENVIRONMENT="${1:-staging}"` (5m) ✅ (Feb 22) — Usage header updated, unit tests confirmed passing (1,479/1,479).
- [x] **0.6** Remove orphaned `vscode://hic-ai.mouse/callback` from staging Cognito client (2m) ✅ (Feb 22)

**Group C: DNS**

- [x] **0.7** DMARC record — add `_dmarc.hic-ai.com` TXT in GoDaddy, `p=none` monitor-only (5m active + propagation)

**Group D: SMP Baseline** _(chain: 0.8 → 0.9 → 0.10)_

- [x] **0.8** Stripe E2E — verify all 4 test-mode checkout paths end-to-end: Individual Monthly/Annual, Business Monthly/Annual (30m) ✅ (Feb 22) — All 4 paths verified: portal redirect with license key, DynamoDB records correct (Individual maxDevices=3, Business maxDevices=5, all active, Stripe+Keygen IDs populated).
- [x] **0.9** Stripe checkout audit — identify ~16 forbidden parameters against our code per AP 8 AR Phase 1.2 (30m) ✅ (Feb 22) — Audit complete.
- [x] **0.10** Comprehensive Stripe dashboard settings review — audit all test-mode settings: email receipts (verify payment receipts enabled in Stripe, not SES), tax settings, refund policy, decline handling, dispute settings, branding. Document promotion code configuration for future reference (promo codes for YouTube tutorials, seasonal discounts, etc.). (45m) ✅ (Feb 23) — Full dashboard session completed. All 9 areas reviewed and configured. Findings documented in `docs/plg/20260223_RECOMMENDATIONS_RE_STRIPE_DASHBOARD_SETTINGS_FOR_LAUNCH_PLAN_PHASE_0.10.md`. Key outcomes: statement descriptor set, dispute notifications enabled, bank account confirmed, branding uploaded, tax categories updated (TAX-CODE-1), SMP confirmed available. Action item deferred to AP1: standalone refund policy URL required before Stripe refund notification toggle can be enabled.
- [x] **0.11** SMP integration validation — map verified integration against SMP requirements, produce go/no-go (30–45m) ✅ (Feb 23) — SMP-GO issued. All 7 SMP Preview Terms provisions reviewed and accepted by SWR (attorney review). SMP confirmed available in dashboard, reached Step 3 of setup. Code integration (Stream 1B) and final activation (Stream 3C) deferred to their planned phases. See decision SMP-GO in §3.

**Completed:**

- [x] **0.12** Stripe Managed Payments dashboard check — available, active, no KYB needed (Feb 18)

**Phase 0 Checkpoint (CP-0):** ✅ (Feb 23) — All 12 items complete. DMARC propagating. Publisher confirmed. API_BASE_URL documented. SMP baseline established. Stripe dashboard fully reviewed and configured. → Unlocks Phase 1.

---

### Phase 1 — Feature Completion & SMP Code Prep (~2–3 days)

_3 active streams (1A, 1C, 1D) — independent and can run in parallel. Stream 1B deferred to Phase 3 Stream 3C per DEFER-1B decision (Feb 24)._

#### Stream 1A: Version Update Wire-up (AP 9.8–9.10)

_First: SWR resolves B-D1 (keep custom version notification or remove?)_

- [x] **B-D1 decision** — SWR resolves: Option A confirmed — remove `checkForUpdates()` entirely. Version notification via heartbeat-delivered path only. ✅ (Feb 20)
- [ ] **9.8** Parse `latestVersion` from heartbeat response — scope TBD per B-D1 (2–3h)
- [ ] **9.9** `Mouse: Update Version` command — scope TBD per B-D1 (1–2h)
- [ ] **9.10** Version notification (status bar) — scope TBD per B-D1 (1h)
- [x] **AP9-HB** Heartbeat status alignment — fix in Stream 1A ✅ (Feb 21)
- [x] **AP9-WEB** Website heartbeat route fixes — 4 surgical fixes to `route.js` and test suite: (1) add version fields + `nextHeartbeat` to `over_limit` response, (2) clean up dead-code ternaries on `active` path, (3) extract `NEXT_HEARTBEAT_SECONDS=600` to shared constant, (4) fix integration test contradictions (`valid`, `status`, `reason`, realistic Individual license values, full field alignment). Contract tests for all 6 server statuses pinned. 1,483 tests passing. Spec: `.kiro/specs/stream-1a-website-heartbeat-fixes/`. ✅ (Feb 24)
- [ ] Run full test suite — all tests pass post-changes

**Stream 1A Checkpoint (CP-9):** Version notification functional (if keep) or custom code removed (if remove). All tests pass. → Unlocks Phase 2 docs, Phase 3 audit.

#### ~~Stream 1B: SMP Code Integration — AP 8 Phases 1–2~~ — DEFERRED TO PHASE 3 STREAM 3C

> **⚠️ DEFERRED (Feb 24, DEFER-1B):** All Stream 1B work (AP 8 AR Phases 1–2, steps 1.1–1.3 and 2.1–2.10) has been moved to Phase 3 Stream 3C. Rationale: avoid premature SMP activation before website/legal/social are complete; consolidate all Stripe/SMP work into a single Phase 3 session. Zero Phase 2 impact confirmed. Items preserved below for reference — execution occurs in Phase 3 Stream 3C Part 1.

_~~Note: Steps 1.1–1.2 extend Phase 0 items 0.8–0.9. Phase 0 establishes the raw baseline; Stream 1B applies those findings to SMP-specific code changes. Advanced Stripe dashboard operational settings (dispute handling, notification timing, tax categories) are deferred to Phase 3 Stream 3C where they belong.~~_

- [ ] **1.1** Verify all 4 test-mode checkout paths — baseline confirmation (30m)
- [ ] **1.2** Audit forbidden parameters against our code (30m)
- [ ] **1.3** Fee assessment confirmation — document 6.5–8.4% effective rate (15m)
- [ ] **2.1** Add `managed_payments: { enabled: true }` to Checkout Session creation (15m)
- [ ] **2.2** Set Preview version header on Stripe client (15m)
- [ ] **2.3** Remove forbidden parameters — approach per AP8-D1 decision (1–2h)
- [ ] **2.4** Re-verify all 4 checkout paths with SMP enabled (30m) — resolves AP8-D3 (automatic_tax)
- [ ] **2.5** Verify webhook flow — 8 events fire correctly (15m)
- [ ] **2.6** Verify customer portal (15m)
- [ ] **2.7** Verify email notification flow (15m) — AP8-D4 resolved (Feb 21): Stripe/Link handles payment receipts and payment failure notifications as MoR. HIC SES handles license lifecycle emails (suspension warnings, reactivation, cancellation, revocation). No code changes for launch; `paymentFailed` SES template remains as-is, potential duplication with Stripe failure emails deferred to post-launch refinement.
- [ ] **2.8** Set all SMP-related Stripe code and test-mode dashboard configurations — API version pinning, payment method types, any remaining settings not covered by 2.1–2.7 (30m)
- [ ] **2.9** Verify all Stripe configurations end-to-end — dashboard settings consistent with code expectations, all test-mode checkout paths working with all config changes applied (15m)
- [ ] **2.10** Run full test suite — ≥3,459 tests pass (15m)

**~~Stream 1B Checkpoint (CP-SMP-2)~~:** ~~Unlocks Phase 3 Stream 3C.~~ → **DEFERRED:** CP-SMP-2 is now an internal milestone within Phase 3 Stream 3C Part 1. It no longer gates Phase 3 from Phase 1.

#### Stream 1C: Email Deliverability (AP 7.2–7.8)

_Start after DMARC (0.7) is propagating._

- [ ] **7.2** Test email delivery to Gmail — inbox, not spam (30m)
- [ ] **7.3** Test email delivery to Outlook/Hotmail — inbox, not spam (30m)
- [ ] **7.4** Verify all SES transactional email types fire: welcome, license activation, payment failed, subscription cancelled (1h) — _Note: payment receipts/confirmations are sent by Stripe, not SES; excluded from this check_
- [ ] **7.5** Bounce/complaint monitoring active in SES console (30m)
- [ ] **7.6** Verify duplicate email prevention fix is holding (15m)
- [ ] **7.7** SWR review of all email template copy — verify tone, accuracy, branding, legal compliance across all SES templates (30m)
- [ ] **7.8** Verify all links in email templates are valid — click every link in every template; confirm correct destinations, no 404s, no broken anchors (30m)

**Stream 1C Checkpoint (CP-13):** Gmail/Outlook inboxes (not spam), all SES types verified, Stripe receipts confirmed, bounce monitoring active, template copy approved by SWR, all template links valid. → Unlocks Phase 4.

#### Stream 1D: E2E Client Verification (AP 9.1–9.11)

- [ ] **9.1** VS Code: Initialize Workspace → tool usage — re-verify (15m)
- [ ] **9.2** Cursor: Initialize Workspace → tool usage — re-verify (15m)
- [ ] **9.3** Kiro: Initialize Workspace → tool usage — re-verify (15m)
- [ ] **9.4** Roo Code: Initialize Workspace → tool usage — new test (1h)
- [ ] **9.5** Cline: Initialize Workspace → tool usage — new test (1h)
- [ ] **9.6** Kilo Code: Initialize Workspace → tool usage — new test (1h)
- [ ] **9.7** CodeGPT: Initialize Workspace → tool usage — new test (1h)
- [ ] **9.8** Claude Code: Initialize Workspace → tool usage — new test (1h)
- [ ] **9.9** Claude Code CLI: Initialize Workspace → tool usage — new test (30m)
- [ ] **9.10** Copilot CLI: Initialize Workspace → tool usage — new test (30m)
- [ ] **9.11** Other clients — catch-all for any additional MCP-compatible clients discovered during testing (TBD)
- [ ] Evaluate Windsurf compatibility (promising — skipped in earlier testing, revisit)
- [ ] Confirm Augment/Blackbox status — currently require paid subscriptions for evaluation; defer unless free trial available
- [ ] Document client compatibility matrix — finalize supported vs. compatible vs. untested categories

**Stream 1D Checkpoint (CP-E2E):** All tested clients verified. Compatibility matrix finalized (supported / compatible / untested). → Unlocks Phase 2 AP 5.

---

### Phase 2 — Website, Documentation & Legal (~2–3 days)

_Internal sequencing: 2A → 2B → 2C → 2E. Steps 2D and 2F can run in parallel as noted._

#### Step 2A: Plausible Analytics Integration (AP 11.4)

_Note on AP 11 numbering: Assessment V3 §8.8 numbers items by category (11.1–11.3 = legal review, 11.4 = Plausible, 11.5–11.9 = IP/filings). Execution order has always been 11.4 first (Plausible → accurate Privacy Policy), which is why Step 2A precedes Step 2B here. No source document correction needed._

- [ ] **11.4** Wire up Plausible analytics on staging (30m)
- [ ] Verify data flowing in Plausible dashboard

**Step 2A Checkpoint (CP-1):** Plausible script on staging, data confirmed. → Unlocks 2B.

#### Step 2B: Legal Review — Privacy Policy & ToS (AP 11.1–11.3)

_SWR reviews as attorney. Depends on 2A (Plausible wired so policy is accurate)._

- [ ] **11.1** Privacy Policy review — reflect Plausible (cookieless), Cognito, DynamoDB, SES, SMP/Link (1h)
- [ ] **11.2** Terms of Service review — pricing, product details, limitations, seller-of-record (Link / Lemon Squeezy LLC) (1h)
- [ ] **11.3** ToS ↔ refund policy cross-reference — align with SMP's 60-day discretionary window (30m)

**Step 2B Checkpoint (CP-2):** Privacy Policy and ToS updated on staging, approved by SWR. → Unlocks 2C, Phase 4.

#### Step 2C: Front-End UX & Content Polish (AP 1)

_Depends on 2B (legal pages finalized — don't proofread what will change)._

- [ ] **1.1** Fix conflicting pricing on FAQ vs. pricing page (15m)
- [ ] **1.2** Login page — apply brand styling (1–2h)
- [ ] **1.3** Invite page — apply brand styling (1h)
- [ ] **1.4** Mobile navigation — implement responsive nav (1h)
- [ ] **1.5** Fix dead documentation links (30m)
- [ ] **1.6** Remove non-functional search bar (5m)
- [ ] **2.1–2.5** Tier 2 items: sitemap, OG image, 404 page, footer links, accessibility basics
- [ ] **3.1–3.3** Tier 3 items: animation polish, dark mode refinements, micro-interactions
- [ ] Final responsive check across breakpoints

**Step 2C Checkpoint (CP-4):** All pages proofread, no 404s, sitemap live, responsive check passed, OG image verified. → Unlocks 2E, AP 12 Phase 2.

#### Step 2D: Social Media Presence (AP 12 Phases 1–2)

_Phase 1 can run parallel with 2A–2C. Phase 2 after 2C near-complete._

**Phase 1 — Personal Account Audit** (parallel, 1.5–2h):

- [ ] Audit 10 platforms per AP 12 Phase 1 checklist
- [ ] Delete Facebook account
- [ ] Secure/update remaining personal accounts

**Phase 2 — Business Credibility** (after 2C, 2–3h):

- [ ] Create HIC AI Twitter/X account (per D-5 research)
- [ ] Create HIC AI LinkedIn company page
- [ ] Populate GitHub org profile (bio, link, README)
- [ ] Cross-link website ↔ social accounts

**Step 2D Checkpoint (CP-7):** HIC AI accounts exist with bio, link to hic-ai.com, real content. → Unlocks Phase 5 marketing.

#### Step 2E: Documentation Tier 1 (AP 5)

_Depends on CP-E2E (clients verified) and 2C (site polished)._

- [ ] **DOC-1** Update Getting Started guide — verified per-client flows (1h)
- [ ] **DOC-2** Update Installation guide (30m)
- [ ] **DOC-3** Update Configuration guide (30m)
- [ ] **DOC-4** Update Licensing guide — reflect SMP/Link billing (45m)
- [ ] **DOC-5** Update Troubleshooting guide (30m)
- [ ] **DOC-6** NEW: VS Code + Copilot Setup Guide (1h)
- [ ] **DOC-7** NEW: Cursor Setup Guide (45m)
- [ ] **DOC-8** NEW: Common Errors & Solutions (45m)
- [ ] **DOC-9** NEW: Security & Privacy Overview (45m)
- [ ] **DOC-10** Fix FAQ — accurate pricing, working links (30m)
- [ ] **DOC-11** NEW: How to Choose an IDE — quick comparison for beginners; highlight Mouse-supported editors, recommend VS Code as default (45m)
- [ ] **DOC-12** NEW: How to Choose an AI Coding Assistant — overview of Copilot, Cursor, Claude Code, etc.; which ones Mouse supports, advantages/disadvantages (45m)
- [ ] **DOC-13** NEW: How to Install Mouse — zero-to-coding guide for first-time users; prerequisites, step-by-step, 14-day free trial onramp (30m)
- [ ] **DOC-14** NEW: How to Create a GitHub Repository — git basics for beginners; connect to IDE, clone, commit, push (30m)
- [ ] **DOC-15** NEW: Best Practices for Coding with AI Agents Using Mouse — initial guide (will expand significantly post-launch); covers YOLO mode safety, agent supervision, effective prompting, recommended configurations (1h)
- [ ] Verify every docs slug loads, no nav 404s

**Step 2E Checkpoint (CP-5):** Every docs slug visited, content verified, no 404s from navigation. → Unlocks Phase 3 AP 2b, AP 6.

#### Step 2F: Website Surface Security Review (AP 2a)

_Parallel with 2D/2E. API routes independent of content._

- [ ] **2a.1** `npm audit --production` on plg-website — flag/fix criticals (30m)
- [ ] **2a.2** Review 4 unauthenticated endpoints — webhook signatures, rate limits, error sanitization (45m)
- [ ] **2a.3** Verify safeJsonParse fixes deployed (15m)
- [ ] **2a.4** HTTP security headers — CSP, HSTS, X-Frame-Options (15m)
- [ ] **2a.5** Scan client-side bundle for leaked secrets (15m)
- [ ] **2a.6** Verify error responses don't leak stack traces (15m)
- [ ] **2a.7** Review `package.json` for `publishConfig.access`, license consistency (15m)
- [ ] **2a.8** Brief findings note (15m)

**Step 2F Checkpoint (CP-10a):** `npm audit` clean or criticals documented, endpoints reviewed, headers confirmed, no secrets in bundle. → Unlocks Phase 4.

---

### Phase 3 — Security, Monitoring & SMP Finalization (~2 days)

_All 5 streams are independent and can run in parallel. 3C requires SMP-GO._

#### Stream 3A: Comprehensive Security Audit (AP 2b)

_Resolve B-D4/B-D5/B-D6 at stream start._

- [x] **B-D4** decision — Q Developer Code Review ✅ (Feb 21)
- [ ] **B-D5** decision — `package.json` field standardization
- [ ] **B-D6** decision — security findings memo format
- [ ] **2b.1** `npm audit` on hic/mouse, hic/licensing, hic/mouse-vscode (15m)
- [ ] **2b.2** SAST scan on both repos (1–2h)
- [ ] **2b.3** Manual review: auth flows — Cognito OAuth, JWT, token refresh, browser-delegated activation (1h)
- [ ] **2b.4** Manual review: authorization — per-user device scoping, role-based access, seat enforcement (1h)
- [ ] **2b.5** Review OAuth PKCE implementation (30m)
- [ ] **2b.6** Audit all `package.json` files across both repos (30m)
- [ ] **2b.7** Verify secrets audit findings remain remediated (15m)
- [ ] **2b.8** Full scan for hardcoded credentials (30m)
- [ ] **2b.9** Document findings with CWE/CVE references (1h)
- [ ] 2FA hardening: GitHub org, Stripe, Keygen dashboards (~1h)

**Stream 3A Checkpoint (CP-11):** SAST clean or triaged, `npm audit` clean, auth review documented, 2FA enabled. → Unlocks Phase 4.

#### Stream 3B: Monitoring & Observability (AP 10.1–10.9)

- [ ] **10.1** `/api/health` endpoint — 200 + DynamoDB connectivity check (30m) — **critical**
- [ ] **10.2** CloudWatch metric filters + alarms for Amplify SSR logs (2–3h) — **critical**
- [ ] **10.3** Log retention policy — set to 14 days per B-D7 (15m)
- [ ] **10.4** Add Amplify SSR log group to CloudFormation (30m)
- [ ] **10.5** Define severity levels P1–P4 (30m)
- [ ] **10.6** Minimal incident runbook — top 3 failure modes (1h)
- [ ] **10.7** Verify DynamoDB PITR enabled — per AP4-D5 decision (15m)
- [ ] **10.8** Document backup restore procedure (30m)
- [ ] **10.9** CloudWatch launch day dashboard (1–2h)

**Stream 3B Checkpoint (CP-12):** `/api/health` returns 200, metrics alarming, log retention set, runbook exists, PITR confirmed, dashboard ready. → Unlocks Phase 4.

#### Stream 3C: SMP Complete — AP 8 AR Phases 1–2 + Phase 3 (EXPANDED)

_**Gate:** SMP-GO decision (#28) — ✅ **GO issued Feb 23.** All 7 provisions reviewed and accepted. Stream 3C is unblocked and now absorbs all Stream 1B work (DEFER-1B, Feb 24). Estimated effort: ~5–7h._

> **⚠️ PRE-LAUNCH INVESTIGATION REQUIRED — Stripe Customer Deletion Impact:** SMP terms (§7, Data Privacy) allow customers to request deletion of their data from Stripe systems, which cascades to cancellation of subscriptions and deletion of Customer, PaymentMethod, Invoice, and related Stripe objects. A full technical analysis is required before launch to determine the downstream consequences on DynamoDB table lookups (orphaned `stripeCustomerId` / `stripeSubscriptionId` references) and overall system functionality. Key concerns: (1) What happens when our code attempts to look up a deleted Stripe Customer ID? (2) Does our soft-delete pattern handle this gracefully? (3) What happens if a returning customer gets a new Stripe Customer ID — do we handle multiple IDs per person? (4) Any risk of inconsistent state or memory overflow scenarios? This investigation should be scoped and completed during Phase 3C at the latest.

**Part 1 — Code Integration (formerly Stream 1B, AP 8 AR Phases 1–2):**

- [ ] **1.1** Verify all 4 test-mode checkout paths — baseline confirmation (30m)
- [ ] **1.2** Audit forbidden parameters against our code (30m)
- [ ] **1.3** Fee assessment confirmation — document 6.5–8.4% effective rate (15m)
- [ ] **2.1** Add `managed_payments: { enabled: true }` to Checkout Session creation (15m)
- [ ] **2.2** Set Preview version header on Stripe client (15m)
- [ ] **2.3** Remove forbidden parameters — approach per AP8-D1 decision (1–2h)
- [ ] **2.4** Re-verify all 4 checkout paths with SMP enabled (30m) — resolves AP8-D3 (automatic_tax)
- [ ] **2.5** Verify webhook flow — 8 events fire correctly (15m)
- [ ] **2.6** Verify customer portal (15m)
- [ ] **2.7** Verify email notification flow (15m) — AP8-D4 resolved (Feb 21): Stripe/Link handles payment receipts as MoR; HIC SES handles license lifecycle emails
- [ ] **2.8** Set all SMP-related Stripe code and test-mode dashboard configurations (30m)
- [ ] **2.9** Verify all Stripe configurations end-to-end (15m)
- [ ] **2.10** Run full test suite — ≥3,459 tests pass (15m)

**Part 2 — Dashboard Finalization (AP 8 AR Phase 3):**

- [ ] **3.1** Complete SMP setup flow in Stripe Dashboard (15m)
- [ ] **3.2** 2FA on Stripe account (5m)
- [x] **3.3** Confirm tax categories — SaaS, business use (`txcd_10103101`) (5m) ✅ (Feb 23) — Changed from `txcd_10202003` (downloadable software) to `txcd_10103101` (SaaS — electronic download — business use) on all 4 products. SaaS classification is correct for a subscription-licensed VS Code extension with heartbeat validation and continuous updates. Decision made after attorney review and analysis of tax treatment differences across jurisdictions.
- [ ] **3.4** Configure notification settings — 48-hour dispute SLA compliance (5m)

**Stream 3C Checkpoint (CP-SMP-3):** SMP parameters added, forbidden params removed, all 4 checkout paths verified E2E in test mode, webhooks confirmed, all tests pass, 2FA on Stripe, SMP setup complete, tax categories confirmed, notifications configured. → Unlocks Phase 4.

#### Stream 3D: Support Infrastructure (AP 6)

- [ ] **6.1** Verify `support@hic-ai.com` routes to SWR inbox — alias configured in Google Workspace (Feb 21); E2E send/receive test pending (30m)
- [ ] **6.2** Auto-reply template — "received, expect response within 24h" (30m)
- [ ] **6.3** Create Discord server — #general, #mouse-help, #feature-requests, #bug-reports (1h)
- [ ] **6.4** Update Discord invite link in `constants.js` (15m)
- [ ] **6.5** GitHub Issue templates — bug report, feature request (30m)
- [ ] **6.6** "Report a Bug" link in extension → opens GitHub issue (30m)
- [ ] **6.7** Internal support triage procedures (1h)
- [ ] **6.8** Set up `security@hic-ai.com` with 24h response commitment — alias configured in Google Workspace (Feb 21); E2E send/receive test pending (30m)
- [ ] **6.9** Verify `dmarc@hic-ai.com` receives DMARC aggregate reports — alias configured in Google Workspace (Feb 21); verify by checking for report emails ~24–48h after DMARC record propagates (15m)

**Stream 3D Checkpoint (CP-6):** `support@`, `security@`, and `dmarc@` all verified reaching SWR inbox, auto-reply works, Discord live, GitHub templates deployed. → Unlocks Phase 5.

#### Stream 3E: Branch Protection Rules

- [ ] Configure `main` branch protection on both repos — prevent force-pushes, prevent deletion, optionally require status checks (10m)
- No PR requirement — see [Pre-Launch Git Branch Strategy Recommendations](../plg/20260222_PRE_LAUNCH_GIT_BRANCH_STRATEGY_RECOMMENDATIONS.md)

---

### Phase 4 — Production Deployment (~1–2 days)

_Mostly sequential. Convergence gate: Phase 3 CP-11 + CP-12 + CP-SMP-3 required._

_First: SWR resolves B-D3 (EventBridge `readyVersion` gating — deploy or launch without?)_

- [ ] **B-D3 decision** — SWR resolves EventBridge gating

#### Step 4A: Foundation — AP 4 P0–P3

- [ ] **P0** Naming standardization — `prod` → `production` across 9 CF templates + scripts + parameters (1.5–2h per Recommendations memo §3.3; no migration overhead — production S3 buckets don't exist yet)
- [ ] **P0** Fix SES bug in plg-iam.yaml (if present)
- [ ] **P1** Create Cognito production pool + Google OAuth client (D-2) + SES sender (D-3) (1–2h)
- [ ] **P2** Deploy CloudFormation `hic-plg-production` stack (1–2h)
- [ ] **P3** Populate production Secrets Manager — Stripe, Keygen, Cognito secrets (30m)

#### Step 4B: Environment & Payment — AP 4 P4–P5 + AP 8 Phase 4

- [ ] **P4** Create Amplify production branch — same app `d2yhz9h4xdd5rb`, `main` branch (30m)
- [ ] **P5** Verify production build succeeds (30m)
- [ ] **AP8 4.1** Create live-mode Stripe products + prices: $15/mo, $150/yr, $35/seat/mo, $350/seat/yr with tax codes (30m)
- [ ] **AP8 4.2** Create live-mode webhook endpoint → `hic-ai.com/api/webhooks/stripe` (15m)
- [ ] **AP8 4.3** Populate Stripe production secrets in Secrets Manager (15m)
- [ ] **AP8 4.4** Set Amplify production Stripe env vars (15m)
- [ ] **AP8 4.5** Confirm SMP active in live mode — resolves AP8-D5 (5m)
- [ ] **AP8 4.6** Confirm Keygen production webhook (5m)
- [ ] Set all 17 production env vars per AP 4 §7 table

#### Step 4C: Vendor Endpoints & DNS — AP 4 P6–P7

- [ ] **P6** Point all vendor webhooks to production `hic-ai.com` URLs (30m)
- [ ] **P7.1** Add custom domain in Amplify Console (15m)
- [ ] **P7.2** Configure DNS records in GoDaddy (15m)
- [ ] **P7.3** Wait for SSL certificate validation (5–30m)
- [ ] **P7.4** Verify `https://hic-ai.com` resolves (5m)
- [ ] **P7.5** Verify Cognito callback URLs include production domain (5m)

**Step 4C Checkpoint (CP-C1):** `hic-ai.com` loads, SSL valid, marketplace links disabled. → Unlocks Phase 5.

#### Step 4D: Production VSIX Build

- [ ] Build production VSIX with correct `API_BASE_URL` (per B-D8 / Phase 0 item 0.4 findings)
- [ ] E2E verify production VSIX before Marketplace submission (GC-GAP-2)

**Phase 4 Checkpoint (CP-15):** All services on production config, website live at `hic-ai.com`, VSIX built. → Unlocks Phase 5.

---

### Phase 5 — Launch Sequence (~2–3 days incl. 24–48h Marketplace review)

#### Step 5A: Production E2E & Dogfooding — AP 4 P8 + AP 8 Phase 5

_SWR's dogfooding purchase = AP 4 P8 verification = AP 8 Phase 5 = first real transaction (OI-4)._

> **⚠️ Sequencing tension (flagged for SWR decision at Phase 4 end):** The current plan has Step 5A (dogfooding with production VSIX) before Step 5B (Marketplace submission). However, a true end-to-end customer experience test requires downloading Mouse from the VS Code Marketplace itself — not installing a local VSIX. SWR cannot fully verify the real customer journey until the Marketplace listing is live. **Alternative sequence:** (1) Submit to Marketplace, (2) website goes live, (3) after Marketplace approval (24–48h), SWR downloads from Marketplace and completes full E2E dogfooding purchase of a genuine Business Annual 3-seat license. **Hybrid approach:** Pre-verify with production VSIX (Step 5A as-is), then re-verify from Marketplace download after approval. This provides the most authentic E2E verification at the cost of 24–48h before the dogfooding gate is fully satisfied.

- [ ] **5.1** SWR purchases Mouse Business Annual 3-seat ($350/seat/yr) — live payment, genuine dogfooding (15m)
- [ ] **5.2** Verify full E2E chain: checkout → webhook → Keygen license → DynamoDB → emails (20m)
- [ ] **5.3** Verify extension activation: install → Cognito auth → Keygen activate → heartbeat → MCP tools (15m)
- [ ] **5.4** Verify customer portal — subscription visible and manageable (5m)
- [ ] **5.5** Verify MoR compliance indicators — Link entity on receipt, statement descriptor (5m)
- [ ] Verify no errors in CloudWatch production Lambda logs
- [ ] Production CloudWatch dashboard shows healthy metrics

**Step 5A Checkpoint (CP-C3):** All flows pass. SWR dogfooding subscription active. → Unlocks 5B.

#### Step 5B: Marketplace Submission

_Submit early — review runs in parallel with 5A retesting._

- [ ] Submit Mouse extension to VS Code Marketplace (24–48h review)
- [ ] Submit to Open VSX (parallel, if timeline allows)

#### Step 5C: Analytics & Traffic Activation — AP 4 P9

_Depends on 5A passing. Sequence: Plausible staging (Phase 2) → Privacy Policy (Phase 2) → P9 production (GC-GAP-6)._

- [ ] **P9.1** Activate Plausible for `hic-ai.com` production domain (15m)
- [ ] **P9.2** Enable marketplace install links — `MARKETPLACE_ENABLED = true` (5m)
- [ ] **P9.3** Confirm `hic-ai.com` appears in search engine results (15m)
- [ ] Revert staging to allowlist-only access

#### Step 5D: Disclosures & Public Launch — AP 13 + AP 12 Phase 3

_SWR personal. Hard sequencing: AP 13 → AP 12 Phase 3 item 3.6 (LinkedIn = irreversible disclosure)._

- [ ] **13.1** Disclose to law firm partner (first — professional obligation)
- [ ] **13.2** Disclose to key clients
- [ ] **13.3** Disclose to remaining close contacts
- [ ] **13.4** Silence period before public signal
- [ ] **AP12 3.6** Update personal LinkedIn — **irreversible public disclosure**
- [ ] Execute launch content plan (Show HN, blog post, social media)

**Step 5D Checkpoint (CP-C4):** Extension live on Marketplace, links enabled, Plausible active, disclosures complete, LinkedIn updated. → **LAUNCH.**

---

## 2. SWR Action Items

Items requiring SWR's direct action, extracted from all APs. Grouped by hard deadline.

| #   | Item                                                                                                                                                                                       | Hard Deadline        | Phase/Step    | Source                  | Status |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- | ------------- | ----------------------- | ------ |
| S1  | **SMP-GO** — Review 7 SMP Preview Terms provisions (indemnification, liability cap, beta disclaimers, fee changes, data processing, refund policy, 30-day termination). Issue GO or NO-GO. | Before Phase 3 3C    | Begin Phase 0 | AP 8 AR §4.2, OD #28    | ✅ Feb 23 |
| S2  | **B-D1 decision** — Keep custom version update layer or rely on VS Code built-in?                                                                                                          | Before Phase 1 1A    | Phase 1 start | OD §3c                  | ✅ Feb 20 |
| S3  | **Privacy Policy review** — Must reflect Plausible, Cognito, DynamoDB, SES, SMP/Link                                                                                                       | Phase 2 Step 2B      | Day 4         | AP 11.1, OD #29         | ☐      |
| S4  | **ToS review** — Pricing, product details, seller-of-record, SMP 60-day refund window                                                                                                      | Phase 2 Step 2B      | Day 4         | AP 11.2–11.3, OD #30–31 | ☐      |
| S5  | **B-D3 decision** — EventBridge `readyVersion` gating: deploy or launch without?                                                                                                           | Before Phase 4       | Day 7         | OD §3b                  | ☐      |
| S6  | **Pre-Sprint Batch** — Confirm/override GC recommendations on OD #6–15 (AP5-Q1–Q4, AP8-D1–D2, AP4-D5, B-D4/D5/D6)                                                                          | Before Phase 1       | Day 1         | OD §2                   | ☐      |
| S7  | **IP review** — Remove/generalize sensitive technical details from public docs/FAQ                                                                                                         | Before launch        | Phase 3+      | AP 11.5–11.7, OD #32    | ☐      |
| S8  | **Copyright application** — File for Mouse software                                                                                                                                        | Before launch (rec.) | Phase 3+      | AP 11.8, OD #33         | ☐      |
| S9  | **Provisional patent** — File before public launch (disclosure starts 1-year clock)                                                                                                        | **Before launch**    | Phase 3+      | AP 11.9, OD #34         | ☐      |
| S10 | **Private disclosures** — Law partner → key clients → contacts → silence period                                                                                                             | Before AP 12 Phase 3 | Phase 5       | AP 13, OD #35           | ☐      |
| S11 | **Dogfooding purchase** — Buy Mouse Business Annual 3-seat ($350/seat/yr) as live payment test                                                                                                       | Phase 5 Step 5A      | Day 9         | AP 4 P8, OI-4           | ☐      |
| S12 | **LS/Paddle insurance** — Optional backup MoR applications (~2h)                                                                                                                           | Optional, anytime    | SWR judgment  | OD #36, OI-3            | ☐      |

---

## 3. Decision Resolution Log

Decisions resolved during the execution sprint. Complements the Open Decisions Register (which organizes by group). This section is chronological.

| Date   | Decision ID | Resolution                    | Impact                                | By  |
| ------ | ----------- | ----------------------------- | ------------------------------------- | --- |
| Feb 18 | SEQ-1       | Features first, docs second   | Dep Map v3 Phase 1 → Phase 2 ordering | SWR |
| Feb 18 | B-D7        | 14-day log retention          | AP 10.3 scope fixed                   | SWR |
| Feb 18 | B-D1 + B-D2 | Merged → deferred to pre-AP 9 | Phase 1 Stream 1A scope TBD           | SWR |
| Feb 18 | B-D3        | Deferred to pre-deployment    | Phase 4 decision point                | SWR |
| Feb 20 | B-D1        | Option A — remove `checkForUpdates()` entirely | Stream 1A Fix 4 scope locked; version notification via heartbeat only | SWR |
| Feb 20 | ENFORCE-1   | Soft enforcement model for over-limit: never block, never degrade | Journeys B/G business rationale locked in comprehensive analysis | SWR |
| Feb 20 | SES-SNS-1   | Over-limit events → DDB stream → Lambda → SNS → SES email + analytics | §7.2 item 5 added; infrastructure verification required | SWR |
| Feb 21 | AP8-D4      | Payment/receipt email responsibility split: Stripe/Link (as MoR) owns payment receipts and payment failure notifications. HIC SES owns license lifecycle emails (suspension warning, reactivation, cancellation, revocation, welcome, license delivery, trial ending). No code changes for launch; existing `paymentFailed` SES template remains, potential duplication deferred to post-launch. | Stream 1B step 2.7 scope reduced to verification only; no SES template changes needed pre-launch | SWR |
| Feb 21 | SES-SNS-2   | **SES-SNS-1 deferred to post-launch.** Over-limit email notifications are a nice-to-have; heartbeat soft enforcement works without them. Building a new DDB stream → Lambda → SNS → SES pipeline during the sprint adds risk for a non-blocking feature. All SES-SNS implementation and infrastructure work deferred until post-launch. | Removes ~2–4h of unscoped infrastructure work from pre-launch sprint; no impact on launch-blocking items | SWR |
| Feb 20 | TRIAL-1     | Heartbeat to include `trialDaysRemaining`; nag-banner deferred if non-trivial | Journey D updated; nag-banner not launch-blocking | SWR |
| Feb 20 | REVIVAL-1   | Machine revival to show toast notification on success/failure | Journey C updated | SWR |
| Feb 21 | AP5-Q1      | One by one — each doc article reviewed individually before publishing | Doc publishing workflow: individual SWR review per article, not batch | SWR |
| Feb 21 | AP5-Q2      | All clients get their own instruction and setup docs | Overrides GC rec (Copilot + Cursor only); expands Phase 2E doc scope to all supported clients | SWR |
| Feb 21 | AP5-Q3      | Keep Tier 2; possibly remove entirely | Crib sheets remain non-launch-critical; may be cut entirely post-assessment | SWR |
| Feb 21 | AP5-Q4      | No — docs are for how to use Mouse, not why Mouse is superior | No `/research` link in docs section; keeps docs focused on usage | SWR |
| Feb 21 | AP8-D1      | Remove forbidden parameters entirely — no `SMP_ENABLED` flag | AP 8 Phase 2 step 2.3: clean removal, no conditional logic | SWR |
| Feb 21 | AP8-D2      | Deferred to Stripe sitdown — decide in front of dashboard | Preview version header placement TBD during Phase 0/1B Stripe work | SWR |
| Feb 21 | AP4-D5      | Yes — enable PITR on production DynamoDB | AP 10.7 verification step confirmed; ~$2–5/mo at launch scale | SWR |
| Feb 21 | B-D4        | Q Developer Code Review as SAST tool | Phase 3A Stream 3A scope locked; no external SAST tool procurement needed | SWR |
| Feb 21 | AP9-HB      | Fix in Stream 1A | Heartbeat status alignment is a bug fix, not a deferral; scoped into Stream 1A active fixes | SWR |
| Feb 22 | B-D8        | Production API base URL = `https://hic-ai.com`. Option A: change hardcoded URL to production with `process.env.HIC_API_BASE_URL` override for staging. No build pipeline changes. Three dead `api.hic-ai.com` references cleaned up in Stream 1A. | Phase 0 item 0.4 complete; Phase 4 Step 4D becomes trivial (no URL substitution needed at build time) | GC (investigation) / SWR (approved) |
| Feb 22 | PROD-RENAME | Execute `prod` → `production` rename during Phase 4 Step 4A (not deferred). Production S3 buckets don't exist yet — no migration overhead. ~20 files, 1.5–2h, performed atomically during initial production stack deployment. | Phase 4 Step 4A P0 effort updated from 30m to 1.5–2h; naming inconsistency eliminated before launch | SWR |
| Feb 23 | TAX-CODE-1 | Tax code changed from `txcd_10202003` (downloadable software — business use) to `txcd_10103101` (SaaS — electronic download — business use) on all 4 Stripe products. SaaS classification is correct for a subscription-licensed VS Code extension with heartbeat validation and continuous vendor-controlled updates. Decision made after attorney review of tax treatment differences across jurisdictions. | All downstream docs updated (AP 8 AR, SMP Discovery, AP4 V2, AP0/V2, Daily Plan, Recommendations memo). Phase 4 step 4.1 live-mode product creation must use `txcd_10103101`. | SWR |
| Feb 23 | SMP-GO | **GO.** SWR completed comprehensive attorney review of all Stripe Managed Payments legal documentation: SMP Preview Terms (Dec 19, 2025), General Terms (Nov 18, 2025) including §1.4 (Preview Services), DPA, payment method provisions (ACH, Link, Google Pay, etc.), and all regional terms affecting US customers. All 7 provisions in Discovery Memo §7 reviewed and accepted. One investigation flagged for pre-launch: Stripe customer data deletion impact on DynamoDB lookups (orphaned `stripeCustomerId`/`stripeSubscriptionId` references). Phase 3C unblocked. | Phase 3C SMP Finalization unblocked; AP 8 Phases 2–5 unblocked; critical path item retired | SWR |

| Feb 23 | STRIPE-0.10 | Stripe dashboard comprehensive review complete. All 9 areas configured: branding, email receipts, notification settings, payment methods, tax categories, dispute handling, customer portal, bank account, statement descriptor. Refund notification toggle deferred pending standalone refund policy URL (AP1 action item). | Phase 0 item 0.10 complete. AP1 gains new item 1.7 (refund policy page). | SWR |
| Feb 23 | REFUND-POLICY-1 | Standalone refund policy page (`/refund-policy`) required before Stripe refund notification feature can be enabled. Current refund policy exists only as FAQ answer. Add dedicated page during AP1 front-end work, then return to Stripe dashboard to set URL and enable toggle. | New item 1.7 added to AP1 V2 Tier 1. Stream 3C step 3.4 (notification settings) partially deferred pending this page. | SWR |
| Feb 24 | DEFER-1B | Stream 1B (SMP Code Integration) deferred from Phase 1 to Phase 3 Stream 3C. Rationale: avoid premature SMP activation before website/legal/social are complete; consolidate all Stripe/SMP work into single Phase 3 session. Zero Phase 2 impact confirmed. | Phase 1 reduced to 3 active streams (1A, 1C, 1D); Phase 3 Stream 3C expanded to absorb AP 8 AR Phases 1–2 + Phase 3. CP-SMP-2 becomes internal milestone within 3C. Effort: ~5–7h for expanded 3C. | SWR |
| Feb 24 | HB-WEB-1 | Website heartbeat route fixes complete (4 surgical fixes). `NEXT_HEARTBEAT_SECONDS` extracted to `constants.js` at 600s (10 min) to match Extension client, well within Keygen's 3600s window. Over-limit response now includes version fields. Dead-code ternaries removed. Integration test fully aligned with route output. All 1,483 tests passing. Merged to `main`, CI/CD + Amplify deploy confirmed. | Stream 1A server-side prerequisites complete. Extension-side items (9.8–9.10) unblocked. Spec artifacts archived to `docs/completed-specs/`. | GC + SWR |
_Add rows as decisions are made during execution._

---

## 4. Deviation Log

When the plan changes, document it here. No document currently covers this terrain.

| Date | What Changed | Why | Impact on Timeline | Approved By |
| ---- | ------------ | --- | ------------------ | ----------- |
| Feb 19–20 | Phase 0.0 expanded from 30-min pre-scope to 2-day comprehensive investigation | Investigation revealed 12 open issues, 11 bugs, and 2 corrupted prior remediation documents requiring full re-analysis from source code. Produced 1,250-line comprehensive analysis with 9 active fixes, 4 deferred items, 8 user journeys, and SWR business-logic decisions. | +1.5 days on Phase 0.0; net positive — Stream 1A scope is now fully defined with zero ambiguity, all SWR business decisions locked, and implementation can proceed without discovery risk. Phase 0 proper remains unblocked. | SWR |
| Feb 21 | SES-SNS-1 implementation deferred to post-launch | Over-limit email notification pipeline (DDB stream → Lambda → SNS → SES) is a nice-to-have, not launch-blocking. Heartbeat soft enforcement works without email notifications. Sprint risk reduction. | Removes ~2–4h of unscoped work from critical path. No user-facing impact at launch — over-limit users still get soft enforcement via heartbeat response. | SWR |

| Feb 22 | Phase 0 item 0.4 expanded from 30-min investigation to comprehensive cross-repo analysis | API_BASE_URL investigation revealed two distinct issues (extension URL switching + `prod`/`production` naming split) requiring analysis across both repos. Produced 3 investigation memos + 1 Recommendations memo synthesizing findings with prior heartbeat analysis. B-D8 resolved, `prod`→`production` decision locked, Stream 1A scope fully defined with combined heartbeat + API_BASE_URL remediation (~2.5h, ~15 files). | +1 day on Phase 0 item 0.4; net positive — eliminates all remaining ambiguity for Stream 1A and Phase 4 Step 4A. No impact on other Phase 0 items. | SWR |
| Feb 23 | Phase 0 item 0.10 expanded from 45-min dashboard audit to full-day comprehensive review session | SWR spent ~1 day in Stripe dashboard reviewing all settings, configuring branding, notifications, payment methods, tax categories, and dispute handling. Produced 565-line recommendations memo with completion status. Identified AP1 action item (refund policy URL). | +0.5 days on Phase 0 item 0.10; net positive — all Stripe dashboard configuration complete before Phase 1 begins, no context-switch back to dashboard needed until AP1 refund policy page is built. | SWR |
| Feb 24 | Stream 1B (SMP Code Integration) resequenced from Phase 1 to Phase 3 Stream 3C | Avoid premature SMP activation risk before website/legal/social complete; consolidate all Stripe/SMP work into single focused session. See DEFER-1B decision and deferral recommendation memo (`docs/plg/20260224_RECOMMENDATION_RE_DEFERRING_LAUNCH_PLAN_STREAM_1B_SMP_TO_PHASE_3.md`). | Phase 1 effort reduced ~3–4h; Phase 3 Stream 3C effort increases ~5–7h (was ~30 min). Net timeline neutral to slightly positive. | SWR |
_Populated during execution when reality diverges from plan._

---

## 5. Cross-Reference Index

Every checklist item mapped to its authoritative source document and section.

| Phase   | Item(s)              | Source Document                    | Section                            |
| ------- | -------------------- | ---------------------------------- | ---------------------------------- |
| **0**   | 0.1–0.11             | AP 0 V2                            | Groups A–D                         |
| **0**   | 0.12                 | AP 0 V2                            | Group D (completed)                |
| **1A**  | 9.8–9.10, B-D1       | AP 9 (Assessment V3 §8.6) + OD §3c | Dep Map v3 §4 Stream 1A            |
| **1B**  | ~~1.1–1.3, 2.1–2.10~~ | AP 8 AR                            | DEFERRED → Phase 3 Stream 3C Part 1 (DEFER-1B, Feb 24) |
| **1C**  | 7.2–7.8              | Assessment V3 §8.5                 | AP 7 inline                        |
| **1D**  | 9.1–9.11             | Assessment V3 §8.6                 | AP 9 inline                        |
| **2A**  | 11.4                 | Assessment V3 §8.8                 | AP 11 inline                       |
| **2B**  | 11.1–11.3            | Assessment V3 §8.8                 | AP 11 inline                       |
| **2C**  | 1.1–3.3              | AP 1 V2                            | Tiers 1–3                          |
| **2D**  | Phases 1–2           | AP 12 V2                           | §4–5                               |
| **2E**  | DOC-1–DOC-15         | AP 5 V2                            | Tier 1                             |
| **2F**  | 2a.1–2a.8            | Assessment V3 §8.1                 | AP 2a inline                       |
| **3A**  | 2b.1–2b.9, B-D4/5/6  | Assessment V3 §8.2 + OD §2d        | AP 2b inline                       |
| **3B**  | 10.1–10.9            | Assessment V3 §8.7                 | AP 10 inline                       |
| **3C**  | 1.1–1.3, 2.1–2.10, 3.1–3.4, SMP-GO | AP 8 AR §4–6 + OD #28  | Phase 3 (EXPANDED — absorbs Stream 1B per DEFER-1B, Feb 24) |
| **3D**  | 6.1–6.8              | Assessment V3 §8.4                 | AP 6 inline                        |
| **3E**  | Branch protection    | AP 0 V2 (item 0.8)                 | Relocated to Phase 3 by Dep Map v3 |
| **4A**  | P0–P3                | AP 4 V2                            | §3.1–3.4                           |
| **4B**  | P4–P5, AP8 4.1–4.6   | AP 4 V2 §3.5–3.6 + AP 8 AR §7      | Phase 4                            |
| **4C**  | P6–P7                | AP 4 V2                            | §3.7–3.8                           |
| **4D**  | VSIX build, GC-GAP-2 | Dep Map v3 §7 Step 4D              | Bridge step                        |
| **5A**  | P8, AP8 5.1–5.5      | AP 4 V2 §3.9 + AP 8 AR §8          | Phase 5                            |
| **5B**  | Marketplace          | Dep Map v3 §8 Step 5B              | GAP-3                              |
| **5C**  | P9.1–P9.3            | AP 4 V2 §3.10                      | GC-GAP-6 sequence                  |
| **5D**  | 13.1–13.4, AP12 3.6  | Assessment V3 §8.9 + AP 12 V2 §6   | AP 13 + AP 12 Phase 3              |
| **SWR** | S1–S12               | OD §4 + Dep Map v3 §13             | Attorney & Personal Track          |

### Source Document Quick Reference

| Short Name     | Full Path                                                            | Lines |
| -------------- | -------------------------------------------------------------------- | ----- |
| AP 0 V2        | `20260218_AP0_QUICK_WINS_AND_INITIAL_SETUP_V2.md`                    | 307   |
| AP 1 V2        | `20260218_AP1_FRONT_END_UX_PRIORITIZATION_PLAN_V2.md`                | 311   |
| AP 4 V2        | `20260218_AP4_SWITCH_TO_PRODUCTION_PLAN_V2.md`                       | 938   |
| AP 5 V2        | `20260218_AP5_DOCUMENTATION_STRATEGY_V2.md`                          | 572   |
| AP 8 AR        | `20260218_AP8_MOR_STRATEGY_AND_PAYMENT_INTEGRATION_AR.md`            | 753   |
| AP 12 V2       | `20260218_AP12_SOCIAL_MEDIA_SEO_AND_CONTENT_DISTRIBUTION_PLAN_V2.md` | 546   |
| Assessment V3  | `20260218_PRE_LAUNCH_STATUS_ASSESSMENT_AND_ACTION_PLANS_V3.md`       | 445   |
| Dep Map v3     | `20260218_ACTION_PLAN_DEPENDENCY_MAP_V3.md`                          | 853   |
| Open Decisions | `20260218_OPEN_DECISIONS.md`                                         | 235   |

---

## Document History

| Date       | Author | Changes                                                                                                                                                                               |
| ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-02-18 | GC     | Initial creation — comprehensive phase-ordered checklists extracted from 9 planning documents. 5 sections: checklists, SWR items, decision log, deviation log, cross-reference index. |
| 2026-02-18 | GC     | SWR review edits: Phase 0 comprehensive Stripe settings review (0.10), Stream 1B dedup note + config/verify steps (2.8–2.9), Stream 1C email fix (7.4 Stripe receipts, add 7.7–7.8 template review), Stream 1D expanded to 9.6–9.11 (Kilo Code, CodeGPT, Claude Code/CLI, Copilot CLI), AP 11 numbering note, DOC-11–DOC-15 onboarding docs, Phase 5 dogfooding sequencing tension flagged, 5.1 changed to Business Annual 3-seat, 13.2 updated, cross-reference index updated. |
| 2026-02-24 | GC     | Stream 1A website heartbeat fixes complete (AP9-WEB). Added checklist item, decision log entry (HB-WEB-1). Spec artifacts relocated to `docs/completed-specs/stream-1a-website-heartbeat-fixes/`. |
