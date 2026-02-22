# Open Decisions Register

**Created:** February 18, 2026
**Purpose:** Consolidated register of all open decisions, unresolved items, and pending questions across the Mouse v0.10.10 pre-launch sprint. Living document — updated as decisions are made.
**Maintainer:** GC | **Decision Authority:** SWR

---

## Summary

| Group | Description                                         | Open   | Total  |
| ----- | --------------------------------------------------- | ------ | ------ |
| 1     | Pre-Planning (before Dep Map v3 & Launch Plan)      | 0      | 5      |
| 2     | Pre-Sprint Batch (after planning, before execution) | 5      | 13     |
| 3     | During Execution (resolve as encountered)           | 8      | 11     |
| 4     | SWR Attorney & Personal (parallel track)            | 9      | 9      |
| 5     | GC Operational (SWR awareness only)                 | 5      | 6      |
| —     | Resolution Log (previously resolved)                | —      | 10     |
|       | **Active Open Items**                               | **27** | **49** |

---

## How to Use

1. Review Groups 1–2 before the next work session
2. For each item: confirm GC recommendation, override, or defer
3. GC updates status and moves resolved items to §7
4. Groups 3–5 resolve naturally during execution

**Status Key:**

- ⬜ Open — decision needed
- 🔍 Investigate first — GC delivers findings, then SWR decides
- ⏳ Deferred — intentionally deferred to a specific phase
- ✅ Resolved — decision made (moved to §7 with date)

---

## 1. Pre-Planning Decisions

All 5 pre-planning decisions were addressed on Feb 18 — 2 resolved, 2 deferred to §3, 1 merged. **Dep Map v3 and Launch Plan can now proceed.**

| #   | ID    | Original Decision                                  | Resolution                                           |
| --- | ----- | -------------------------------------------------- | ---------------------------------------------------- |
| 1   | SEQ-1 | Sprint sequencing: features before docs/front-end? | ✅ Yes — build first, document second                |
| 2   | B-D1  | `/api/version` endpoint: keep or remove?           | ⏳ Deferred to pre-AP 9 — merged with B-D2 → §3c    |
| 3   | B-D2  | "Update Now" UX: browser redirect or native?       | ⏳ Merged into B-D1 → §3c (see clarification below) |
| 4   | B-D3  | EventBridge `readyVersion` gating                  | ⏳ Deferred to pre-deployment → §3b                 |
| 5   | B-D7  | CloudWatch log retention: 14 or 30 days?           | ✅ 14 days for launch                                |

**B-D2 clarification:** VS Code's built-in extension update system already handles the standard case for Marketplace extensions — auto-detection of new versions, notification in the Extensions view, and one-click update (or auto-update if the user's toggle is enabled). Mouse will appear as a standard Marketplace extension with these built-in behaviors.

B-D2 was asking about Mouse's *custom* update notification layer — code paths where Mouse itself detects new versions (heartbeat → server returns `latestVersion` → status bar alert → "Update Now" action). The two sub-options were: (a) "Update Now" opens the Marketplace page in a browser, or (b) it triggers VS Code's native extension update API. SWR correctly identified that this is subsumed by B-D1: **does Mouse need this custom layer at all?** If extraneous, B-D2 is moot. If intrinsic, B-D2 follows naturally. Both merged into one deferred decision in §3c.

**Marketplace presentation note:** SWR's question about "walk-through or front-matter or other materials visible in the UI" refers to the extension's Marketplace page (README, CHANGELOG, icon, screenshots in the Extensions view). That's an AP 5 / AP 1 concern, already scoped — not related to B-D1/B-D2.

---

## 2. Pre-Sprint Batch Decisions

Quick judgment calls that don't require investigation. **Resolve in one ~30-minute session after planning documents are finalized, before sprint execution begins.**

### 2a. Documentation Strategy (AP 5)

| #   | ID     | Decision Required                                                                                                            | GC Rec                                                                             | Blocks                     | Status |
| --- | ------ | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------- | ------ |
| 6   | AP5-Q1 | **Content review cadence:** Each doc article through SWR review before publishing, or batch review after Tier 1 is complete? | Batch for Tier 1; individual review only for DOC-9 (Security) and DOC-10 (Billing) | Doc publishing workflow    | ✅ Feb 21 — One by one. Each article reviewed individually before publishing. |
| 7   | AP5-Q2 | **Supported clients for Tier 1 docs:** All 5 AI clients, or Copilot + Cursor only for launch?                                | Copilot + Cursor for Tier 1; others in Tier 2 post-launch                          | Doc writing scope & effort | ✅ Feb 21 — All clients get their own instruction and setup docs. |
| 8   | AP5-Q3 | **AI Agent Crib Sheets:** Promote Copilot crib sheet (DOC-16) to Tier 1?                                                     | Keep in Tier 2 — valuable but not launch-critical                                  | Effort allocation          | ✅ Feb 21 — Keep Tier 2; possibly remove entirely. |
| 9   | AP5-Q4 | **Research paper reference:** Link to `/research` from docs section?                                                         | Yes — adds credibility, minimal effort                                             | Docs index structure       | ✅ Feb 21 — No. Docs are for how to use Mouse, not why Mouse is superior. |

**Source:** AP 5 V2, §11 (Open Questions for SWR), lines 529–539.

### 2b. Payment Integration (AP 8 AR)

| #   | ID     | Decision Required                                                                                              | GC Rec                                                   | Blocks                           | Status |
| --- | ------ | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------- | ------ |
| 10  | AP8-D1 | **Forbidden parameter removal approach:** (a) Remove entirely, or (b) guard behind `SMP_ENABLED` flag?         | (a) Remove entirely — cleaner for v1, no flag complexity | AP 8 Phase 2 code implementation | ✅ Feb 21 — Remove entirely. |
| 11  | AP8-D2 | **Stripe Preview version header placement:** Global on Stripe client init, or per-request on Checkout Session? | Global on client init — simpler, applies consistently    | AP 8 Phase 2 implementation      | ⏳ Feb 21 — Deferred to Stripe sitdown; decide in front of dashboard. |

**Source:** AP 8 AR, §5.2 (Phase 2), lines 208–228.

### 2c. Infrastructure (AP 4)

| #   | ID     | Decision Required                                                     | GC Rec                                          | Blocks                                         | Status |
| --- | ------ | --------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------- | ------ |
| 12  | AP4-D5 | **DynamoDB PITR:** Enable Point-in-Time Recovery on production table? | Yes — data safety net; ~$2–5/mo at launch scale | AP 4 P2 (CF template), AP 10.7 (data recovery) | ✅ Feb 21 — Yes, enable PITR on production. |

**Source:** AP 4 V2, §12 (Open Items), line 737.

### 2d. Security Audit (AP 2b)

| #   | ID   | Decision Required                                                                                  | GC Rec                                          | Blocks      | Status |
| --- | ---- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------- | ------ |
| 13  | B-D4 | **SAST tool choice:** Which static analysis tool for the security audit?                           | GC proposes during AP 2b planning; SWR approves | AP 2b scope | ✅ Feb 21 — Q Developer Code Review. |
| 14  | B-D5 | **`package.json` field standardization:** Standardize fields across all packages in the workspace? | GC proposes convention; SWR approves            | AP 2b scope | ⬜     |
| 15  | B-D6 | **Security findings memo format:** Where and how to document security findings?                    | GC proposes template + location; SWR approves   | AP 2b scope | ⬜     |

**Source:** Pre-Launch Assessment V3, §5.3 (Deferred Decisions), lines 179–181.

### 2e. Social Media (AP 12) — Investigation Required

| #   | ID     | Decision Required                                                                                                                                                 | GC Rec                                                  | Blocks                               | Status |
| --- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------ | ------ |
| 16  | D-5    | **Twitter/X business account:** Can a business account be created without a personal account?                                                                     | GC researches (AP 0 item 0.3, 15 min), then SWR decides | AP 12 Phase 2, content strategy      | ✅ Feb 21 — Yes. No personal account required. See `20260221_TWITTER_X_BUSINESS_ACCOUNT_RESEARCH.md`. |
| 17  | AP12-H | **`@hic_ai` handle availability:** Is the handle available on Twitter/X? If taken, code references need updating in `constants.js`, `about/page.js`, `layout.js`. | GC verifies during AP 0 item 0.3 research               | AP 12 Phase 2, possibly code changes | ⏳ Feb 21 — Cannot verify programmatically. SWR checks during signup. See research memo. |

**Source:** AP 12 V2, lines 108, 135–137. Investigation prerequisite: GC operational item #42.

### 2f. Production Build — Investigation Required

| #   | ID   | Decision Required                                                                                                                | GC Rec                                                                       | Blocks                                | Status |
| --- | ---- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------- | ------ |
| 18  | B-D8 | **Production `API_BASE_URL` mechanism:** How does `licensing/constants.js` switch from staging to production for the VSIX build? | GC investigates (AP 0 item 0.4, 30-min hard cap), then SWR confirms approach | AP 4 P3+, AP 9, production VSIX build | ✅ Feb 22 — Production API base URL = `https://hic-ai.com`. Option A (point to production, env var override for staging). `prod` → `production` rename during Phase 4 Step 4A. No build pipeline changes. See `20260222_RECOMMENDATIONS_RE_HEARTBEAT_AND_BASE_API_URL_REMEDIATION_PLAN.md`. |

**Source:** Pre-Launch Assessment V3 line 183; Decision & Gap Analysis lines 109–117; AP 0 V2 lines 75–84. Investigation prerequisite: GC operational item #41.

**Estimated resolution time:** ~30 minutes for items 6–15 (confirm/override). Items 16–18 require GC investigation first (AP 0 items 0.3 and 0.4).

---

## 3. During-Execution Decisions

These require hands-on-keyboard context. They resolve naturally during the relevant sprint phase and are captured in the Dep Map v3 at the appropriate points.

### 3a. Payment Integration (AP 8 AR)

| #   | ID     | Decision Required                                                                                                                      | When                  | Status |
| --- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------ |
| 19  | AP8-D3 | **`automatic_tax` removal:** Does SMP handle tax calculation automatically when this Stripe parameter is removed? Verify in test mode. | AP 8 Phase 2 step 2.4 | ⏳     |
| 20  | AP8-D4 | **Email notification duplication:** ✅ RESOLVED (Feb 21). Stripe/Link (as MoR) handles payment receipts and payment failure notifications. HIC SES handles license lifecycle emails (suspension, reactivation, cancellation, revocation, etc.). Existing `paymentFailed` SES template remains for launch; potential duplication with Stripe failure emails deferred to post-launch refinement. | AP 8 Phase 2 step 2.7 | ✅     |
| 21  | AP8-D5 | **SMP live mode activation:** Does SMP require separate activation for live mode distinct from test mode?                              | AP 8 Phase 4 step 4.5 | ⏳     |

**Source:** AP 8 AR, lines 208–268, 448–450.

### 3b. Production Deployment (AP 4)

| #   | ID       | Decision Required                                                                                                                                          | When                                        | Status |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------ |
| 22  | AP4-D6   | **`setup-cognito.sh` v1 pool defaults:** Fix script, or use env var override workaround per P1.4?                                                          | AP 4 P1 (minor friction, workaround exists) | ⏳     |
| 23  | OI-7     | **Staging freeze during P8:** Add precondition note to AP 4 P8 — no active staging development during production E2E testing.                              | AP 4 P8 (documentation note)                | ⏳     |
| 24  | GC-GAP-2 | **Production VSIX E2E bridge step:** Explicit verification step needed between AP 4 P7/P8 and Marketplace submission. Build into Dep Map v3.               | AP 4 P7–P8 boundary                         | ⏳     |
| 25  | GC-GAP-6 | **Plausible → Privacy Policy → P9 sequence:** Analytics staging wire-up, then Privacy Policy update, then P9 reactivation. Must be explicit in scheduling. | AP 4 P9                                     | ⏳     |
| —   | B-D3     | **EventBridge `readyVersion` gating:** Deploy the mechanism, or launch without? SWR deferred to pre-deployment context. *Moved from §1.* | Pre-deployment (AP 4 P7) | ⏳     |

**Source:** AP 4 V2 line 738; Decision & Gap Analysis lines 121–167, 320–325.

### 3c. Feature Completion (AP 9)

| #   | ID        | Decision Required                                                                                                 | When                                             | Status |
| --- | --------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------ |
| —   | B-D1     | **Custom version update vs. VS Code built-in:** Keep `/api/version` + `checkForUpdates()` + status bar notification, or rely entirely on VS Code's native extension update system? If extraneous, remove custom code; if intrinsic, wire up AP 9.8–9.10. *Merged B-D1+B-D2, moved from §1.* | Immediately before AP 9 start | ✅ Feb 20 — Option A: remove `checkForUpdates()` entirely. Version notification via heartbeat-delivered path only. |
| 26  | AP9-SCOPE | **Phase 4 hardening scope:** Which extension hardening items are launch-required vs. post-launch?                 | During AP 9 execution — after feature assessment | ⏳     |
| 27  | AP9-HB    | **Heartbeat status alignment:** Fix or defer the misalignment between heartbeat status codes and expected values? | During AP 9 — scoped for fix-or-defer decision   | ✅ Feb 21 — Fix in Stream 1A. |

**Source:** Pre-Launch Assessment V3, lines 192–193.

---

## 4. SWR Attorney & Personal Track

Parallel to GC's engineering work. These are SWR-only items with hard deadline constraints noted. SWR schedules at own discretion within the constraints.

| #   | ID      | Item                                                                                                                                                                                                            | Hard Deadline                                   | Blocks                                                                            | Status |
| --- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------- | ------ |
| 28  | SMP-GO  | **SMP Preview Terms attorney review** — 7 provisions requiring legal analysis (AP 8 AR §4.2: indemnification, liability cap, beta disclaimers, fee changes, data processing, refund policy, 30-day termination) | Before AP 8 Phase 3 (staging integration)       | **Highest priority.** All downstream: AP 8 Phases 2–5, production payment, launch | ⬜     |
| 29  | AP11-1  | **Privacy Policy review** — must reflect Plausible (cookieless analytics), Cognito (auth), DynamoDB (data), SES (email), SMP/Link (payment processor)                                                           | Before AP 4 P9 (analytics reactivation)         | Legal compliance, launch                                                          | ⬜     |
| 30  | AP11-2  | **Terms of Service review** — pricing, product details, limitations, seller-of-record (Link / Lemon Squeezy LLC)                                                                                                | Before launch                                   | Legal compliance                                                                  | ⬜     |
| 31  | AP11-3  | **ToS ↔ refund policy cross-reference** — must align with SMP's 60-day discretionary refund window (AP 8 AR §7.2)                                                                                               | Before launch                                   | Legal consistency                                                                 | ⬜     |
| 32  | AP11-57 | **IP review of public docs/FAQ** — remove or generalize sensitive technical details before production exposure                                                                                                  | Before launch                                   | IP protection                                                                     | ⬜     |
| 33  | AP11-8  | **File copyright application** — Mouse software                                                                                                                                                                 | Before launch (recommended)                     | IP protection                                                                     | ⬜     |
| 34  | AP11-9  | **File provisional patent application** — public launch disclosure starts the 1-year statutory clock under 35 U.S.C. §102(b)(1)                                                                                 | **Before public launch**                        | IP protection, launch timing constraint                                           | ⬜     |
| 35  | AP13    | **Pre-launch disclosures** — 4 tiers: (1) law firm partner, (2) key client, (3) remaining professional contacts, (4) silence period before public announcement                                                  | Before AP 12 Phase 3 (LinkedIn personal update) | Relationship management, social media timing                                      | ⬜     |
| 36  | OI-3    | **LS/Paddle insurance applications** — submit during sprint as backup MoR path? ~2h effort, runs in background.                                                                                                 | Optional — SWR judgment call, anytime           | Contingency if SMP Preview fails post-launch                                      | ⬜     |

**Critical path note:** SMP-GO (#28) is the single highest-priority attorney item. SWR can begin review during AP 0 / Phase 1 engineering work. The GO/NO-GO gate is needed before AP 8 Phase 3 begins. All other attorney items (#29–36) have later deadlines.

**Source:** Pre-Launch Assessment V3, §8 (AP 11, AP 13), lines 388–421; AP 8 AR §4.2, lines 151–185; AP 8 AR §14, lines 674–679.

---

## 5. GC Operational Items

GC-owned tasks listed for SWR awareness. These are not decisions — they are execution items that may surface findings requiring SWR input (which would be added to this register).

| #   | ID      | Task                                                                                                                                          | Phase         | Feeds Decision            | Status |
| --- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------- | ------ |
| 37  | TODO-26 | **Keygen policy corrections** — verify in dashboard (15 min)                                                                                  | AP 0 item 0.1 | —                         | ⬜     |
| 38  | AP6-1   | **`support@hic-ai.com` email routing** — send test email, verify receipt                                                                      | AP 6 item 6.1 | —                         | ⬜     |
| 39  | AP1-8   | **Open Graph image** — verify image URL resolves                                                                                              | AP 1 item 1.8 | —                         | ⬜     |
| 40  | AP6-3   | **Discord server** — create server, update placeholder link in code                                                                           | AP 6 item 6.3 | —                         | ⬜     |
| 41  | AP0-4   | **`API_BASE_URL` investigation** — examine `release-mouse.sh`, esbuild config, determine if constant is baked at build time (30-min hard cap) | AP 0 item 0.4 | → B-D8 (#18)              | ✅ Feb 22 |
| 42  | AP0-3   | **Twitter/X research** — business account requirements, `@hic_ai` handle availability (15 min)                                                | AP 0 item 0.3 | → D-5 (#16), AP12-H (#17) | ✅ Feb 21 |

---

## 6. Companion Documents Pending

Not decisions, but tracked here for completeness as they affect the overall planning state.

| #   | Document                                                                                         | Status                                 | Depends On             |
| --- | ------------------------------------------------------------------------------------------------ | -------------------------------------- | ---------------------- |
| 43  | **Dependency Map v3** — rewrite of v2 for SMP-first path, linear sequencing, compressed timeline | Ready to write — Group 1 resolved Feb 18 | All pre-planning inputs resolved |
| 44  | **Launch Plan** — operational day-by-day execution guide                                         | Not started — requires Dep Map v3      | Dep Map v3             |

---

## 7. Resolution Log

Resolved decisions are moved here with date and resolution. This section also includes items resolved during prior planning sessions for audit trail completeness.

### Resolved During Current Planning Sprint

| ID   | Decision                                                     | Resolution                                                    | Date   | By  |
| ---- | ------------------------------------------------------------ | ------------------------------------------------------------- | ------ | --- |
| D-1  | Same Amplify app or new?                                     | Same app `d2yhz9h4xdd5rb`, `main` branch                      | Feb 17 | SWR |
| D-2  | Google OAuth: reuse staging client or new?                   | New client for production                                     | Feb 17 | SWR |
| D-3  | Cognito email sending mechanism                              | SES custom sender from verified domain                        | Feb 17 | SWR |
| D-4  | Defer B-D1–B-D8 until after SMP integration?                 | Yes — but now reconsidering timing per SEQ-1                  | Feb 17 | SWR |
| OI-2 | Unified Social Media Action Plan needed?                     | Absorbed into AP 12 V2                                        | Feb 17 | GC  |
| OI-4 | P8 live payment test = SWR dogfooding subscription?          | Yes — SWR's own subscription is the P8 test; no refund needed | Feb 17 | SWR |
| OI-5 | Remove `vscode://hic-ai.mouse/callback` from staging Cognito | Absorbed into AP 0 item 0.6                                   | Feb 17 | GC  |
| OI-6 | Fix `setup-cognito.sh` ENVIRONMENT hardcoding                | Absorbed into AP 0 item 0.5                                   | Feb 17 | GC  |
| SEQ-1 | Sprint sequencing: feature completion before docs/front-end? | Yes — build first, document second                            | Feb 18 | SWR |
| B-D7  | CloudWatch log retention: 14 or 30 days?                     | 14 days for launch; extend post-launch if needed              | Feb 18 | SWR |

---

## Document History

| Date         | Change                                                                                                                                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Feb 18, 2026 | Initial creation — 42 open items across 6 groups; 8 previously resolved items in log. Sources: AP 0 V2, AP 1 V2, AP 4 V2, AP 5 V2, AP 8 AR, AP 12 V2, Pre-Launch Assessment V3, Decision & Gap Analysis Update. |
| Feb 18, 2026 | SWR addressed Group 1: SEQ-1 ✅ (features first), B-D7 ✅ (14 days). B-D1+B-D2 merged → §3c (pre-AP 9). B-D3 → §3b (pre-deployment). B-D2 clarification added. Active: 42→39, resolved: 8→10. |
| Feb 21, 2026 | SWR batch decisions: AP5-Q1 ✅, AP5-Q2 ✅, AP5-Q3 ✅, AP5-Q4 ✅, AP8-D1 ✅, AP8-D2 ⏳ (deferred to Stripe sitdown), AP4-D5 ✅, B-D4 ✅, AP9-HB ✅. Also: AP8-D4 ✅ (Feb 21, earlier session), B-D1 ✅ (Feb 20, status updated). Active: 39→29. |
| Feb 22, 2026 | B-D8 ✅ (production API base URL = `https://hic-ai.com`, Option A remediation). AP0-4 ✅ (investigation complete). `prod`→`production` rename decision locked (Phase 4 Step 4A). Active: 29→27. |
