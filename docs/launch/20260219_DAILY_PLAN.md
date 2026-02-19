# Daily Plan — February 19, 2026

**Author:** GC
**Owner:** SWR
**Purpose:** Operational day plan for the first full day of Mouse v0.10.10 pre-launch sprint execution. Three sessions structured around SWR's availability constraints.
**Companion documents:** [Execution Tracker](20260218_LAUNCH_EXECUTION_TRACKER.md) | [Open Decisions](20260218_OPEN_DECISIONS.md) | [Dependency Map v3](20260218_ACTION_PLAN_DEPENDENCY_MAP_V3.md)

---

## Session Overview

| Session               | Time                          | Mode                         | Goal                                                             |
| --------------------- | ----------------------------- | ---------------------------- | ---------------------------------------------------------------- |
| **1 — Early Morning** | First block, full focus       | Fully interactive            | Stream 1A pre-scope → Phase 0 complete                           |
| **2 — Mid-Morning**   | Second block, split attention | Sporadic / prompt-and-return | Streams 1B + 1C running autonomously; SMP-GO review              |
| **3 — Evening**       | Third block, full focus       | Fully interactive            | Stream 1D (Codespace E2E testing) + Phase 1 review + legal items |

---

## Session 1 — Early Morning

**Target outcome:** Stream 1A scope fully understood. Phase 0 checkpoint (CP-0) cleared. All Pre-Sprint Batch decisions made. GC has clear marching orders for all Phase 1 streams before mid-morning begins.

### Step 1.0 — Stream 1A Pre-Scope Investigation (First Priority)

**Repo:** `~/source/repos/hic` ← switch here first
**Effort:** ~20–30 minutes of reading; GC executes, SWR reviews findings
**Why first:** This is the only item in the day that could materially destabilize the schedule. Converting the unknown complexity of Stream 1A into a known scope before touching anything else means the rest of the day proceeds with confidence regardless of what the investigation reveals.

Open `~/source/repos/hic` in a new VS Code window and ask the agent the **5 questions in the Addendum** at the end of this document. The agent should read the relevant source files and return concrete answers — not analysis, not recommendations, just what the code actually says. This should take 15–20 minutes of reading.

**What you're trying to learn:**

1. Whether a recurring heartbeat `setInterval` loop exists (your instinct says it doesn't — the docs don't confirm it does)
2. The exact current state of `VALID_HEARTBEAT_STATUSES` vs. what the back-end actually emits
3. Whether the version wire-up (9.8–9.10) is functionally complete, partially stubbed, or not started
4. The true scope of Stream 1A: verification-only, surgical fixes, or genuine development

**Outcome options:**

- **Best case:** Loop exists, version wire-up is complete, AP9-HB fix is 30 minutes. Stream 1A becomes a quick verification task you can do late morning or during an early-evening slot.
- **Expected case:** Loop is absent or broken, status mismatch fix is clearly scoped to 3–4 files, version wire-up needs minor completion. Stream 1A is 2–4 hours of SWR-present work, schedulable for evening.
- **Worst case:** Loop absent, version wire-up is a stub requiring real development. Stream 1A is a full half-day. You know this before Phase 0 begins and can adjust.

Once findings are in hand, note your Stream 1A assessment in the Execution Tracker and proceed to Phase 0 with full situational awareness.

---

### Step 1.1 — Pre-Sprint Batch Decisions (OD §2, items 6–15)

**Repo:** `hic-ai-inc.github.io` ← switch back here
**Effort:** ~30–40 minutes
**Why here:** These are ten judgment calls where GC has already provided a recommendation. Your job is confirm, override, or ask a clarifying question. Once locked, GC has clear Phase 1 instructions for every stream and will not need to surface clarification questions during mid-morning.

Work through Open Decisions Register §2 (items 6–15) top to bottom:

| #   | ID     | Decision                                                           | GC Rec                                                 |
| --- | ------ | ------------------------------------------------------------------ | ------------------------------------------------------ |
| 6   | AP5-Q1 | Doc review cadence: batch Tier 1 or article-by-article?            | Batch for Tier 1; individual for DOC-9 and DOC-10 only |
| 7   | AP5-Q2 | Supported clients for Tier 1 docs: all 5 or Copilot + Cursor only? | Copilot + Cursor for Tier 1; others in Tier 2          |
| 8   | AP5-Q3 | AI Agent Crib Sheet (DOC-16): promote to Tier 1?                   | Keep Tier 2                                            |
| 9   | AP5-Q4 | Link to `/research` from docs section?                             | Yes                                                    |
| 10  | AP8-D1 | Forbidden parameter removal: remove entirely or guard behind flag? | Remove entirely                                        |
| 11  | AP8-D2 | Stripe Preview version header: global or per-request?              | Global on client init                                  |
| 12  | AP4-D5 | DynamoDB PITR: enable on production table?                         | Yes (~$2–5/mo)                                         |
| 13  | B-D4   | SAST tool choice?                                                  | GC proposes during AP 2b; SWR approves                 |
| 14  | B-D5   | `package.json` field standardization?                              | GC proposes convention; SWR approves                   |
| 15  | B-D6   | Security findings memo format?                                     | GC proposes template + location; SWR approves          |

---

### Step 1.2 — B-D1 Decision

**Effort:** ~5 minutes
**Why here:** Resolving this now gives GC a targeted Stream 1A brief. With Stream 1A pre-scope findings in hand (Step 1.0), this should be an easy call.

Decide: keep the custom version notification layer (`/api/version` + `checkForUpdates()` + status bar alert), or rely entirely on VS Code's built-in extension update system?

**GC recommendation:** Remove the custom layer. VS Code's built-in update system handles this natively for Marketplace extensions. The custom layer was designed for a self-hosted distribution path that no longer applies. If the pre-scope confirms the version wire-up is substantially complete, the counter-argument for keeping it grows stronger — weigh accordingly.

Once decided, GC updates the Open Decisions Register (§3c) and the Execution Tracker.

---

### Step 1.3 — Phase 0, Group A: Research Items (0.1–0.4)

**Effort:** ~1 hour (GC executes, findings returned to SWR)
**Parallelizable:** Kick 0.4 off first (hardest), then 0.1, 0.3, 0.2 in sequence. All four can be run or queued while SWR handles other items.

| #   | Item                                                                                                                     | Effort | Outputs                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ------ | ----------------------------------------------------------- |
| 0.1 | Keygen policy verification — confirm `maxMachines=3`, `ALWAYS_ALLOW_OVERAGE`, `heartbeatDuration=3600` for both policies | 15m    | Feeds Execution Tracker; flags if policy is wrong           |
| 0.2 | VS Code Marketplace publisher — `vsce login hic-ai`, PAT validity, `hic-ai.mouse` ID                                     | 15m    | Feeds Phase 5 Marketplace submission                        |
| 0.3 | Twitter/X business account research — can business account exist without personal? `@hic_ai` available?                  | 15–30m | Feeds decisions D-5 and AP12-H                              |
| 0.4 | `API_BASE_URL` investigation — examine `release-mouse.sh`, esbuild config, document mechanism (30m hard cap)             | 30m    | Feeds decision B-D8; unblocks Phase 4 production VSIX build |

SWR reviews findings as they land and makes decisions D-5, AP12-H, and B-D8 before the session ends.

---

### Step 1.4 — Phase 0, Group B: Quick Fixes (0.5–0.6)

**Effort:** ~7 minutes total (GC executes, SWR reviews and approves)

| #   | Fix                                                                                  | Effort |
| --- | ------------------------------------------------------------------------------------ | ------ |
| 0.5 | `setup-cognito.sh` — change `ENVIRONMENT="staging"` to `ENVIRONMENT="${1:-staging}"` | 5m     |
| 0.6 | Remove orphaned `vscode://hic-ai.mouse/callback` URI from staging Cognito App Client | 2m     |

Both are trivial. Commit and move on.

---

### Step 1.5 — Phase 0, Group C: DMARC (0.7)

**Effort:** ~5 minutes of active work in GoDaddy (+ propagation time in background)
**Why here:** If done during Session 1, DMARC will be propagating — or fully propagated — by the time Stream 1C email deliverability testing begins in Session 2. Propagation typically completes in 1–2 hours but can take up to 24. No reason to delay.

Add TXT record `_dmarc.hic-ai.com` with value `v=DMARC1; p=none; rua=mailto:dmarc@hic-ai.com` in GoDaddy. Note start time for propagation tracking.

---

### Step 1.6 — Phase 0, Group D: Stripe Baseline (0.8–0.11)

**Effort:** ~2 hours (most SWR-interactive part of Phase 0)
**Note:** This is the only Phase 0 work that genuinely requires your active presence in the Stripe test dashboard throughout. Plan to be at the keyboard, uninterrupted.

| #    | Item                                                                                                                                                       | Effort | Notes                                   |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------- |
| 0.8  | Verify all 4 test-mode checkout paths E2E: Individual Monthly/Annual, Business Monthly/Annual                                                              | 30m    | Baseline before any SMP changes         |
| 0.9  | Audit forbidden parameters against our code per AP 8 AR Phase 1.2 (~16 parameters)                                                                         | 30m    | Feeds Stream 1B step 2.3 scope          |
| 0.10 | Comprehensive Stripe dashboard settings review: email receipts, tax, refund policy, decline handling, dispute settings, branding, promo code configuration | 45m    | Operational settings; document findings |
| 0.11 | SMP integration go/no-go assessment — map verified integration against SMP requirements                                                                    | 30–45m | Outputs go/no-go determination          |

**Phase 0 Checkpoint (CP-0):** All 11 items complete. DMARC propagating. Publisher confirmed. `API_BASE_URL` documented. SMP baseline established. → Phase 1 streams are unblocked.

---

### End-of-Session 1 Handoff to GC

Before shifting to mid-morning legal work, confirm the following with GC:

1. Pre-Sprint Batch decisions 6–15 are locked in the Open Decisions Register
2. B-D1 is resolved
3. Phase 0 checkpoint (CP-0) is confirmed or documented as partial with specific items outstanding
4. Stream 1A findings memo is available for review
5. GC has explicit instructions for all four Phase 1 streams to work semi-autonomously through Session 2

---

## Session 2 — Mid-Morning

**Mode:** SWR is doing legal document review. Available to read a GC response and type a brief follow-up prompt every 15–30 minutes, but cannot do intensive interactive work. Context-switching frequently between law firm work and HIC work.

**SWR's role this session:** Prompt → return to binders → review GC output → brief directional feedback → back to binders. No code review, no architectural decisions, no interactive testing.

**GC's role this session:** Drive all four Phase 1 engineering streams autonomously. Surface only go/no-go or fork-in-the-road questions that require SWR input. Everything else gets decided and executed without interruption.

---

### Mid-Morning Task A — Stream 1B: SMP Code Integration (AP 8 Phases 1–2)

**GC leads. SWR confirms checkpoints.**

GC works through steps 1.1–2.10 of Stream 1B. SWR's only required touchpoints:

- **Confirm forbidden parameter removal approach** (AP8-D1, decided in Session 1) is applied correctly — a one-line confirmation when GC reports
- **Checkout path verification** (step 2.4) — SWR may need to glance at the Stripe test dashboard to confirm all 4 paths still pass with SMP enabled; 5 minutes, schedulable as a binder break
- Final go/no-go on CP-SMP-2 when GC reports checkpoint reached

All code changes (2.1–2.3, 2.8), webhook verification (2.5), customer portal (2.6), email check (2.7), and test suite run (2.10) are GC-only work.

---

### Mid-Morning Task B — Stream 1C: Email Deliverability (AP 7.2–7.8)

**GC leads. SWR confirms inbox delivery.**

GC runs email deliverability tests to Gmail and Outlook, verifies all SES transactional email types fire correctly, checks bounce monitoring, and verifies duplicate prevention fix.

**SWR's only required touchpoints:**

- **Inbox check:** SWR glances at their personal Gmail and Outlook/Hotmail inboxes to confirm GC's test emails landed in inbox (not spam). This takes 30 seconds and can happen whenever convenient — just tell GC what you find.
- **Template copy review (item 7.7):** SWR reads all SES email templates and approves tone, accuracy, branding, and legal compliance. ~30 minutes. Schedule this as a dedicated binder break — it is reading and light editing, compatible with the legal document review mode.
- **Template link verification (item 7.8):** GC handles this entirely.

Note: If DMARC from Step 1.5 is not yet propagated, GC notes this and proceeds — deliverability testing is still valid without DMARC active, and DMARC status is verifiable separately.

---

### Mid-Morning Task C — SMP-GO Legal Review (S1)

**SWR only. Most important attorney item in the entire sprint.**

Review the 7 SMP Preview Terms provisions documented in AP 8 AR §4.2:

1. Indemnification
2. Liability cap / beta disclaimers
3. Fee change mechanics
4. Data processing obligations
5. Refund policy alignment with SMP's 60-day discretionary window
6. 30-day termination clause
7. Any other provisions flagged during review

This is attorney-mode reading — no keyboard required, no code context needed. It is intentionally compatible with mid-morning legal document review mode: you are already in lawyer-reading mode with binders open. The SMP terms are another set of documents to analyze. The output is a single decision: **GO** (Stream 3C and production live payments are unblocked) or **NO-GO with conditions** (specific provisions require renegotiation or mitigation before proceeding).

**Hard constraint:** SMP-GO must be issued before Phase 3 Stream 3C begins. Completing it today keeps the 10-working-day timeline on track.

When ready, issue the GO/NO-GO to GC and note it in the Open Decisions Register (OD #28).

---

### Mid-Morning Task D — Decisions D-5, AP12-H, B-D8 (if not resolved in Session 1)

If Session 1 ran long and the downstream decisions from the research items (0.3, 0.4) were not made, handle them now. Each is a quick call once GC's findings are in hand:

- **D-5:** Twitter/X business account strategy
- **AP12-H:** `@hic_ai` handle — use as-is or update code references?
- **B-D8:** Production `API_BASE_URL` mechanism — confirm GC's documented approach

These are prompt-and-confirm interactions, compatible with mid-morning mode.

---

### Mid-Morning Monitoring Checkpoints

At natural binder breaks, check in with GC on status:

| Check-in            | What to ask                                           |
| ------------------- | ----------------------------------------------------- |
| After ~1h           | Stream 1B progress — any blockers?                    |
| After ~2h           | Stream 1C email tests — inbox confirmation needed     |
| When ready          | SMP-GO decision                                       |
| Before session ends | What is blocked / what needs SWR input for Session 3? |

---

## Session 3 — Evening

**Mode:** Full focus, fully interactive. Back to standard working mode.

**Target outcome:** Stream 1D complete (compatibility matrix finalized). Phase 1 reviewed and unblocked. Legal items advanced. Setup for continued Phase 1 / Phase 2 entry tomorrow.

---

### Step 3.0 — Phase 1 Review and Handoff

**Effort:** ~30 minutes
GC briefs SWR on Stream 1B and 1C status. Any blocked decisions from mid-morning that need SWR input are resolved here. Likely candidates:

- AP8-D3: Does SMP handle tax calculation automatically when `automatic_tax` is removed? (Emerges from step 2.4)
- AP8-D4: Does SMP/Link email receipt duplication require suppression of SES receipts? (Emerges from step 2.7)
- AP9-HB: Based on pre-scope findings (Step 1.0), GC recommends fix or defer on heartbeat status alignment
- AP9-SCOPE: Which Phase 4 hardening items are launch-required vs. post-launch?

This is also when SWR reviews the Stream 1A pre-scope findings memo if not already reviewed in the morning (at minimum, confirm: is Stream 1A schedulable for tomorrow morning's focused session or does it need to be done tonight?).

---

### Step 3.1 — Stream 1D: E2E Client Verification

**Effort:** 4–6 hours (GC + SWR together; SWR drives Codespace setup and interactive testing)
**Repo:** `hic-e2e-clean` Codespace

This is hands-on but low-cognitive. For each client: spin up Codespace (~4–5 minutes to load), install Mouse, initialize workspace, install the client, update API key if needed, prompt the agent to use Mouse tools, verify response, test activation flow.

Prioritized client order based on Execution Tracker:

| #    | Client            | Re-verify or New | Est. |
| ---- | ----------------- | ---------------- | ---- |
| 9.1  | VS Code (Copilot) | Re-verify        | 15m  |
| 9.2  | Cursor            | Re-verify        | 15m  |
| 9.3  | Kiro              | Re-verify        | 15m  |
| 9.4  | Roo Code          | New test         | 1h   |
| 9.5  | Cline             | New test         | 1h   |
| 9.6  | Kilo Code         | New test         | 1h   |
| 9.7  | CodeGPT           | New test         | 1h   |
| 9.8  | Claude Code       | New test         | 1h   |
| 9.9  | Claude Code CLI   | New test         | 30m  |
| 9.10 | Copilot CLI       | New test         | 30m  |

For each client: document pass/fail and any UX nits in a running notes file. If Stream 1A version notification is complete by this point, verify it during each client test as well.

Note: Windsurf is flagged as promising — attempt during this session if time allows after primary clients are verified. Augment/Blackbox: defer unless free trial becomes available.

At session end, finalize the compatibility matrix (supported / compatible / untested) and update the Execution Tracker.

**Stream 1D Checkpoint (CP-E2E):** All tested clients verified. Compatibility matrix complete.

---

### Step 3.2 — Email Template Review (7.7) — If Not Done Mid-Morning

**Effort:** ~30 minutes
SWR reviews all SES email templates: welcome, license activation, payment failed, subscription cancelled. Verify tone, accuracy, branding, legal compliance. Approve or note required changes for GC to implement.

---

### Step 3.3 — Legal Items: Privacy Policy and ToS (AP 11.1–11.3) — If Energy Allows

**Effort:** ~2 hours
These are classic evening attorney tasks — reading and editing documents. No technical dependencies except that Step 2A (Plausible analytics wire-up) should precede them. GC can complete Step 2A (11.4, ~30 min) while SWR is finishing Phase 1 review, so the legal documents are ready when SWR sits down.

If completed tonight, Step 2B checkpoint (CP-2) clears and Phase 2 is meaningfully pulled forward.

| #    | Item                                                                                     | Effort |
| ---- | ---------------------------------------------------------------------------------------- | ------ |
| 11.1 | Privacy Policy review — reflect Plausible (cookieless), Cognito, DynamoDB, SES, SMP/Link | 1h     |
| 11.2 | ToS review — pricing, product details, limitations, seller-of-record                     | 1h     |
| 11.3 | ToS ↔ refund policy cross-reference — SMP 60-day discretionary window                    | 30m    |

---

## EOD Tomorrow — Target State

| Item                                     | Target Status                                       |
| ---------------------------------------- | --------------------------------------------------- |
| Stream 1A scope                          | ✅ Fully understood; work scheduled                 |
| Phase 0 (CP-0)                           | ✅ Complete (or 1–2 items noted as outstanding)     |
| Pre-Sprint Batch decisions (OD §2, 6–15) | ✅ All resolved                                     |
| B-D1                                     | ✅ Resolved                                         |
| SMP-GO (S1)                              | ✅ GO/NO-GO issued                                  |
| Stream 1B                                | 🔄 In progress; likely at or near CP-SMP-2          |
| Stream 1C                                | 🔄 In progress; inbox tests done, template approved |
| Stream 1D                                | ✅ Complete; compatibility matrix final             |
| Legal (11.1–11.3)                        | 🔄 Started / possibly complete                      |

That is a strong Day 1. It keeps the 10-working-day timeline on track and positions Session 1 of Day 2 for full focus on Stream 1A implementation (or confirmation that it's done).

---

## Addendum — 5 Questions for the `hic` Repo Agent

**Instructions for SWR:** Open `~/source/repos/hic` in a new VS Code window. This is the first thing you do tomorrow morning before touching anything else. Ask the agent the following five questions verbatim. The agent should read the relevant source files and return concrete answers — what the code actually says, not analysis or recommendations. Target reading time is 15–20 minutes; do not let it run longer than 30.

---

**Question 1:**

> Does a recurring heartbeat `setInterval` exist in `licensing/heartbeat.js`? Is there a `setInterval` or equivalent scheduled loop? What is the interval set to? Is it started at extension activation and kept running for the lifetime of the session, or is the heartbeat only fired once (e.g., at startup or at license activation)?

---

**Question 2:**

> What is the exact current content of `VALID_HEARTBEAT_STATUSES` in `licensing/validation.js`? List every status string in the array verbatim.

---

**Question 3:**

> In the heartbeat handler switch statement in `licensing/heartbeat.js`, what cases are explicitly handled for `over_limit` and `machine_not_found`? Are these explicit cases, aliases, or do they fall through to a default or error handler?

---

**Question 4:**

> Is the `mouse.checkForUpdates` command registered in `extension.js` (or equivalent activation file)? Is it wired to a handler, and if so, what does that handler do?

---

**Question 5:**

> In the `onSuccess` callback of the heartbeat (in `licensing/heartbeat.js` or wherever it is defined), what happens with `latestVersion` or `readyVersion` from the server response? Is the version comparison logic complete and does it call `statusBarManager.showUpdateAvailable()` or equivalent, or is this a partial implementation or stub?

---

_End of Daily Plan — February 19, 2026_
