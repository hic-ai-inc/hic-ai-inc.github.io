# Decision & Gap Analysis Update

**Date:** February 17, 2026
**Author:** GC (from SWR session)
**Purpose:** Memorializes all decisions made, gap analysis responses, and new open items arising from GC's review of the four pre-launch planning documents (`20260216_PRE_LAUNCH_STATUS_ASSESSMENT_AND_ACTION_PLANS.md`, `20260216_ACTION_PLAN_DEPENDENCY_MAP.md`, `20260217_DEPENDENCY_MAP_GAP_ANALYSIS.md`, `20260217_AP4_SWITCH_TO_PRODUCTION_PLAN.md`). Also records GC's recommended next steps (Steps A–E) for the documentation and planning sprint.

---

## Table of Contents

1. [Explicit Decisions Made](#1-explicit-decisions-made)
2. [GC Gap Analysis — SWR Responses](#2-gc-gap-analysis--swr-responses)
3. [New Open Items Arising from This Session](#3-new-open-items-arising-from-this-session)
4. [Recommended Next Steps (GC Steps A–E)](#4-recommended-next-steps-gc-steps-ae)

---

## 1. Explicit Decisions Made

The following decisions were resolved by SWR during this session and should be treated as settled for all downstream planning and implementation.

---

### D-1: Amplify Production Environment — Same App, New Branch

**Decision:** Use the same existing Amplify app (`d2yhz9h4xdd5rb`), connected to a new branch (e.g., `main`), for the production environment.

**Rationale:** No meaningful isolation benefit from a new app given full env-var separation. New branch on the same app is simpler: shared build settings, existing `amplify.yml` applies, env var management via existing scripts. The `AWS_APP_ID` concern (SSM path structure) is handled via env var override.

**Impact on AP4:** P4 step "Decision: Same App or New App?" is resolved. SSM paths use the existing app ID with production-specific overrides.

---

### D-2: Google OAuth — New Client for Production

**Decision:** Create a new Google OAuth client for production (not reuse the existing staging client with an added redirect URI).

**Rationale:** Clean isolation. A production Cognito pool should have a dedicated Google OAuth client. Reusing the staging client would mean both staging and production share Google OAuth credentials, which is operationally messy and creates a minor security risk (a compromised staging environment could generate OAuth tokens for production users).

**Impact on AP4:** P1.4 (Google OAuth setup) creates a new OAuth 2.0 client in Google Cloud Console with authorized origins and redirect URIs for the production Cognito domain only.

---

### D-3: Cognito Email Sending — SES Custom Sender

**Decision:** Configure the production Cognito user pool to use SES as the custom email sender (`noreply@hic-ai.com`), not `COGNITO_DEFAULT`.

**Rationale:** `COGNITO_DEFAULT` is limited to 50 emails/day — unsuitable for production. SES is already production-approved (account-wide, 50K/day) and the `hic-ai.com` domain is already verified. SES custom sender provides branded confirmation and MFA emails from `noreply@hic-ai.com`.

**Impact on AP4:** `setup-cognito.sh` must be invoked with SES email configuration parameters. This must be resolved before P1 execution. The script's SES settings should be reviewed and confirmed as part of P0/pre-P1 preparation.

---

### D-4: B-D1 through B-D8 — Deferred Until After LS Email Submission

**Decision:** The eight Track B open decisions (B-D1 through B-D8) are explicitly deferred. The immediate goal is to advance to the Lemon Squeezy MoR application submission as rapidly as possible, without being blocked by Track B decisions that are not prerequisites for the LS application.

**Additional context:**

- The LS MoR application will likely be submitted in parallel with applications to one or more other MoR platforms (e.g., **Paddle**, and possibly others), rather than relying on a single LS decision. This hedges against another LS rejection and maximizes the chance of having an MoR in place before launch.
- Once the LS/Paddle applications are submitted, an approximately one-week review window opens. B-D1 through B-D8 will be resolved during that window, when Track B work resumes in earnest.

**Impact on Dependency Map:** Track A critical path (LS application prerequisites) takes absolute priority. Track B work does not begin until the application is submitted.

---

### D-5: Twitter/X Account — Deferred Pending Research

**Decision:** The question of whether a personal Twitter/X account is required to create a professional HIC AI, Inc. business account is **not yet resolved**. This decision requires research before the Social Media Action Plan can be executed.

**Context:** SWR has strong personal preference against social media use generally. However, customer engagement, vendor communication, blog post promotion, and status updates for HIC AI, Inc. make a professional social media presence unavoidable. A comprehensive Social Media Action Plan — covering both SWR's personal accounts and all HIC AI professional accounts, pre-launch and post-launch, including all sequencing and disclosure timing concerns — is required. That plan will address the Twitter/X personal-vs-business account question explicitly.

**Impact on current plans:** The Social Media Action Plan should be created as a new, unified AP 12/13 replacement or superset, grouping all of: personal account cleanup (former AP 12), professional account creation (former AP 8.3), LS application social media prerequisite, personal disclosure sequencing (former AP 13), and post-launch social media strategy. See Section 3 (New Open Items) for the full scope.

---

## 2. GC Gap Analysis — SWR Responses

GC identified 9 gaps during document review (labeled GC-GAP-1 through GC-GAP-9 to distinguish from the existing GAP-1 through GAP-12 in `20260217_DEPENDENCY_MAP_GAP_ANALYSIS.md`). SWR responses are recorded here.

---

### GC-GAP-1: `licensing/constants.js` API Base URL Mechanism for Production VSIX

**GC observation:** B-D8 identifies the decision (what URL to use for production), but neither the Dependency Map nor AP4 specifies _where in the build/release flow_ the `API_BASE_URL` constant is changed from `staging.hic-ai.com` to `hic-ai.com`.

**SWR response:** Candidly complicated. The answer may be intertwined with the broader naming-convention and environment-standardization cleanup and might surface naturally during that process. This should be flagged for **prompt investigation** and pursued explicitly in subsequent planning steps — it must be resolved before the production VSIX is built and published.

**Status:** Open — flagged for investigation. Add to Phase 0 investigation checklist.

---

### GC-GAP-2: Production VSIX Build Artifact — E2E Verification Before Publishing

**GC observation:** The production VSIX (pointing at `hic-ai.com`) has not been built or tested yet. It needs its own E2E verification pass before Marketplace submission. The dependency chain between AP4 (infrastructure) and GAP-3 (Marketplace publish) lacks an explicit bridging step.

**SWR clarification on `release-mouse.sh`:** The script runs a full build sequence (version bump, build, etc.). With `--no-vsix` flag, it culminates in copying the build over to the `hic-e2e-clean` repo for E2E testing. Without the flag, the same VSIX file copied to the repo is promoted and published to VS Code Marketplace and Open VSX (last publish step not yet wired up). The concern about `API_BASE_URL` impacting publication is acknowledged but may not affect the mechanics of publication itself.

**SWR decision:** Agreed. For the **initial production deployment**, there must be an explicit step during which E2E tests are run on the production artifact (the VSIX built against the production endpoint) before publishing to any marketplace. This step sits between AP4 (P7/P8 infrastructure verified) and GAP-3 (Marketplace submission).

**Status:** Confirmed. Add as an explicit step in Track B / AP4-to-P9 bridge. The exact mechanism for injecting the production API URL at build time is part of GC-GAP-1 investigation.

---

### GC-GAP-3: `setup-cognito.sh` ENVIRONMENT Hardcoding Risk

**GC observation:** `setup-cognito.sh` hardcodes `ENVIRONMENT="staging"`. Running it as-is creates a `mouse-staging-*` pool in production — a high-consequence mistake during a high-pressure launch sprint. Fix is 5 minutes.

**SWR response:** Agreed. Add to Phase 0.

**Status:** Confirmed. Phase 0 cleanup item.

---

### GC-GAP-4: Google OAuth for Production — Reuse vs. New Client

**GC observation:** Decision between reusing the existing staging OAuth client (add production redirect URI) vs. creating a new client for isolation.

**SWR response:** Fully agree — new dedicated Google OAuth client for production. (Resolved as D-2 above.)

**Status:** Resolved as D-2.

---

### GC-GAP-5: Pre-Token Lambda Function Name in CF Template

**GC observation:** The CF stack (`plg-cognito.yaml`) must attach `plg-cognito-pretoken-production` (after P0 naming fix). If the function name is hardcoded anywhere rather than using `!Sub`, P2 could attach the wrong function.

**SWR response:** This check should be handled **inside the naming-convention cleanup Action Plan** (P0). The `prod` → `production` rename pass will encounter and resolve any hardcoded references in `plg-cognito.yaml`.

**Status:** Absorbed into P0 naming-convention cleanup scope. Verify `!Sub` usage vs. hardcoded function names during P0.

---

### GC-GAP-6: Plausible Analytics — Staging Wire-Up vs. Production Activation Timing

**GC observation:** Step A1 in the Dependency Map (Plausible wire-up) is the _first_ Track A step (before Privacy Policy review). AP4 P9 activates Plausible at public launch. The handoff between the two isn't explicit.

**SWR response:** The wire-up on staging must happen first. The primary reason — beyond Technical completeness — is that the Privacy Policy needs to reflect GDPR compliance _without cookie consent banners_, which the use of Plausible enables (Plausible being cookieless/GDPR-compliant by design). LS reviewers and users need to see an honest Privacy Policy that accurately reflects the analytics approach. The handoff is: wire up on staging → review Privacy Policy → [LS application period] → reactivate for `hic-ai.com` domain at P9. This sequence should be made explicit in the revised Dependency Map.

**Status:** Confirmed. Plausible staging wire-up → Privacy Policy review → P9 reactivation for production. Should be explicit in v2 Dependency Map.

---

### GC-GAP-7: Twitter/X Account — Personal Account Requirement & Disclosure Sequencing

**GC observation:** Creating a HIC AI company Twitter account before private disclosures (AP 13) could be discoverable by the law firm partner before the in-person conversation. The Dependency Map addresses this risk for LinkedIn but not for Twitter.

**SWR response:** Not certain a personal Twitter account is required to create a business account — research needed. Acknowledges that Twitter/X is less fraught than LinkedIn for the professional network disclosure risk, but the timing concerns still apply. Most importantly, SWR acknowledges that social media use for HIC AI is unavoidable for customer engagement, vendor communication, blog posts, and status updates, despite personal preference against it.

**Action required:** A comprehensive, unified **Social Media Action Plan** is needed that:

- Groups all personal social media cleanup (former AP 12)
- Groups all HIC AI professional account creation (former AP 8.3)
- Addresses the LS application social media prerequisite
- Addresses personal disclosure sequencing and professional risk (former AP 13 context)
- Includes a post-launch social media strategy that is sustainable and not torturous for SWR to follow
- Resolves the Twitter/X personal-vs-business account research question explicitly

This replaces and supersedes the current AP 12, AP 13, and AP 8.3 in terms of social media scope.

**Status:** Open — New Action Plan required. See Section 3.

---

### GC-GAP-8: `vscode://hic-ai.mouse/callback` Orphaned URI in Staging Cognito Pool

**GC observation:** The staging Cognito pool has a `vscode://hic-ai.mouse/callback` entry that is orphaned (VS Code extension uses browser-based JWT auth, not callback URIs). Flagged for removal in AP4 Section 10 but no corresponding cleanup task in the Gap Analysis.

**SWR response:** Agreed. Remove in Phase 0.

**Status:** Confirmed. Phase 0 cleanup item.

---

### GC-GAP-9: P8 Live Payment Testing — Sensitivity and Dogfooding Concern

**GC observation:** P8 requires a real live payment. With Stripe, refund timing on a new live account (7–14 day first-payout hold) may complicate instant refund of the verification charge.

**SWR response:** Agreed this is sensitive. The minimum viable approach is the smallest possible live purchase with an immediate refund attempt. However, SWR raises a critical additional subtlety: **dogfooding requirement**. For product integrity and credibility, SWR needs to maintain Mouse on their local machine running the publicly-released version — the same version customers use. This means SWR will be operating under a live subscription at all times post-launch. This creates a tension:

- How is the P8 test payment managed if SWR already has (or needs to create) a live subscription for dogfooding purposes?
- Does the test purchase = SWR's own production subscription?
- Or does it need to be a separate "test account" transaction that is then refunded?

This is a new open design question. The P8 test payment and SWR's ongoing dogfooding subscription may be the same event — the "test" of the payment system is SWR's own first real purchase. If this is the approach, there is no refund, and the Stripe new-account payout hold is irrelevant. The dogfooding subscription serves as the live verification.

**Status:** Open — New design decision needed. See Section 3, Item OI-4.

---

## 3. New Open Items Arising from This Session

The following are new items that should be incorporated into the v2 planning documents.

---

### OI-1: Investigation — Production `API_BASE_URL` Mechanism in Extension Build

**Description:** How and where is `licensing/constants.js` `API_BASE_URL` changed from `https://staging.hic-ai.com` to `https://hic-ai.com` for the production VSIX? Options include: (a) committed constant change before production release tag, (b) environment variable injected at `release-mouse.sh` build time, (c) build flag, (d) something else. The answer may emerge from the P0 naming-convention cleanup investigation.

**Priority:** High — must be resolved before production VSIX is built.

**Suggested placement:** Track B, Phase 0 investigation checklist (parallel with B-D1–B-D8, but specifically flagged as high-consequence).

---

### OI-2: New Action Plan — Social Media (Unified, Comprehensive)

**Description:** A unified Social Media Action Plan consolidating and replacing the social media elements currently scattered across AP 8.3, AP 12, and AP 13. Full scope:

**Pre-launch:**

- Research: Can a HIC AI, Inc. business Twitter/X account be created without a personal account? If not, what is required, and how does it interact with professional disclosure risk?
- Create HIC AI, Inc. accounts: Twitter/X, and any other relevant platforms (LinkedIn company page, etc.)
- Manage sequencing against professional disclosure obligations (law firm partner, key clients)
- SWR personal account cleanup (Facebook deletion, etc.)
- SWR LinkedIn update — timing, content, sequencing relative to disclosures

**Post-launch:**

- Sustainable social media workflow for a solo founder who personally dislikes social media
- Content categories: product announcements, blog post links, status updates, customer engagement, vendor/community engagement
- Automation tools and scheduling workflows to minimize ongoing time burden
- Delegation plan (if/when applicable)

**Replaces:** AP 8.3, AP 12, AP 13 (social media and disclosure components)

---

### OI-3: Phase 0 Checklist Item — Parallel MoR Applications

**Description:** Per D-4, the LS application will be submitted in parallel with at least one additional MoR platform (Paddle confirmed; others TBD). The Social Media Action Plan and LS Application prerequisites need to be understood as prerequisites for **all MoR applications**, not just LS. The Dependency Map's AP 8A step should reflect multi-MoR parallel submission.

**Action needed:** When revising the Dependency Map, update AP 8A to reflect "Submit MoR applications (LS + Paddle + others)" rather than a single LS application.

---

### OI-4: P8 Design Decision — Live Payment Test vs. Dogfooding Subscription

**Description:** The P8 production E2E verification requires a live payment to confirm the Stripe (or LS) → Keygen → DynamoDB licensing flow works end-to-end. Separately, SWR has a dogfooding requirement: maintain Mouse on local machine running the current public release version at all times (same version as customers, to detect issues first).

**Decision to make:** Is SWR's first live production subscription purchase the same event as the P8 payment verification? If yes:

- No refund needed
- Stripe new-account payout hold is irrelevant (it's not a test transaction)
- SWR's ongoing paid subscription serves as continuous live monitoring
- The "test" in P8 is SWR's own purchase

If no (separate test account approach):

- A second account/email is needed for P8 verification
- The test charge is refunded after verification
- Stripe payout timing matters if the refund must settle before launch

**Suggested resolution:** The dogfooding-as-P8-test approach is cleaner and eliminates the "how do I refund" problem entirely. SWR's live subscription becomes the first real production transaction and the ongoing health check. Recommend this approach but flag that it means SWR has real money on the table from Day 1 — any payment failure affecting renewal on SWR's account would be immediately visible, which is actually the point.

**Status:** Open decision. Should be documented in AP4 P8 section.

---

### OI-5: Phase 0 Cleanup Item — Remove `vscode://hic-ai.mouse/callback` from Staging Cognito Pool

**Description:** The orphaned `vscode://hic-ai.mouse/callback` callback URI in the staging Cognito pool (`mouse-staging-v2`) should be removed during Phase 0. It is vestigial from the Phase 1 auth implementation, replaced by browser-based JWT auth. It does not exist in production (which hasn't been created yet) — no migration needed.

**Effort:** 2 minutes (Cognito Console or AWS CLI)

**Suggested placement:** Phase 0 cleanup checklist.

---

### OI-6: Phase 0 Cleanup Item — Fix `setup-cognito.sh` ENVIRONMENT Hardcoding

**Description:** `scripts/setup-cognito.sh` hardcodes `ENVIRONMENT="staging"`. Must be updated to accept the environment as a CLI parameter (or have the variable easily overridable) before P1 production Cognito pool creation.

**Effort:** 5 minutes

**Suggested placement:** Phase 0 cleanup checklist.

---

### OI-7: P8 Explicit Note — No Active Staging Development During Production E2E Testing

**Description:** During P8, SWR is running E2E tests against production infrastructure using a live payment method. The additive architecture (separate CF stacks, separate DynamoDB tables) prevents data cross-contamination, but for operational clarity, AP4 P8 should include an explicit note: no active development commits to staging should be in progress during P8 production testing. This prevents ambiguity about which environment any anomalies originate from.

**Effort:** 0 (documentation only)

**Suggested placement:** Add to AP4 P8 section as a precondition note.

---

## 4. Recommended Next Steps (GC Steps A–E)

GC recommends completing the documentation and planning sprint in the following sequence before shifting to implementation. These steps are reproduced here for reference and tracking.

---

### Step A: Create Phase 0 — "Quick Wins & Housekeeping" Action Plan

Create a new, standalone Phase 0 Action Plan that batches all zero-dependency, short-duration pre-launch items. Estimated total: ~3 hours. Items include:

- GAP-1 from Gap Analysis doc: Keygen policy verification (15 min)
- GAP-2 from Gap Analysis doc: 2FA hardening + AWS budget alerts + Lambda concurrency review (1 hr)
- GAP-3 from Gap Analysis doc: VS Code Marketplace publisher verification — `vsce login hic-ai` (15 min)
- GAP-8 from Gap Analysis doc: Branch protection rules on both repos (30 min)
- GC-GAP-3: Fix `setup-cognito.sh` ENVIRONMENT hardcoding (5 min) ← OI-6 above
- GC-GAP-8: Remove `vscode://hic-ai.mouse/callback` from staging Cognito pool (5 min) ← OI-5 above
- OI-1: Investigate production `API_BASE_URL` mechanism in extension build (flag + time-box)
- GAP-5 from Gap Analysis doc: Stripe test-mode E2E validation — verify all 4 checkout paths (30 min)
- GAP-6 from Gap Analysis doc: LS migration feasibility assessment (45–60 min, depends on GAP-5)
- Naming convention investigation: check `plg-cognito.yaml` for hardcoded function names vs. `!Sub` (sub-item of P0 naming cleanup)

---

### Step B: Revise AP 11 (Legal) to Full Scope

Revise the Legal action plan to cover the complete AP 11.1–11.9 scope, including:

- AP 11.5–11.7: IP review of public docs (GAP-4 from Gap Analysis doc)
- AP 11.8–11.9: Copyright application + provisional patent filing (GAP-11 from Gap Analysis doc) — **must complete before launch** (patent clock starts at public disclosure)

---

### Step C: Replace Old AP 4 with the Switch to Production Plan

Retire the original AP 4 items (4.1–4.12) and replace with the phased P0–P9 structure from `20260217_AP4_SWITCH_TO_PRODUCTION_PLAN.md`. Incorporate:

- D-1 (same app, new branch) → P4
- D-2 (new Google OAuth client) → P1
- D-3 (SES custom sender) → P1
- OI-4 (dogfooding = P8 test purchase) → P8
- OI-7 (no active staging dev during P8) → P8 precondition note

---

### Step D: Update the Dependency Map (v2)

Produce a clean v2 `ACTION_PLAN_DEPENDENCY_MAP.md` incorporating:

- Phase 0 as a new Level 0 convergence point before Track A/B diverge
- All 12 Gap Analysis items from the Gap Analysis doc, placed appropriately in the track graph
- GC-GAP items (GC-GAP-1 through GC-GAP-9) incorporated
- C1/C2/C3/C4 cutover phasing replacing the monolithic "Day 11" AP 4
- GAP-3 (Marketplace publish) as an explicit post-AP4 step with 24–48h external wait modeled
- Plausible staging wire-up → Privacy Policy → P9 reactivation sequence explicit (resolving GC-GAP-6)
- Social Media Action Plan replacing AP 8.3 / AP 12 / AP 13 social components
- Multi-MoR parallel submission (OI-3) in AP 8A
- Resolved external blockers updated: SES (not a blocker), Stripe go-live (instant), staging preserved additively
- All new checkpoints for Phase 0 items

---

### Step E: Write the Launch Plan (Operational Output)

Write a standalone **Launch Plan** document — the culmination of the multi-day planning sprint — as a day-by-day, action-by-action operational guide. This is not a planning document; it is an execution document. It:

- Derives its sequence from the v2 Dependency Map
- Assigns each step to a day on the ~13-day timeline
- References the relevant detailed document for each step (AP4 for P0–P9, etc.)
- Includes go/no-go criteria at each phase boundary
- Includes rollback procedures for each reversible step
- Is written to be followed by SWR (or a delegated agent) without needing to consult the underlying planning documents for the main execution path

---

_This memo was prepared February 17, 2026, following GC's review of the four pre-launch planning documents and SWR's responses. It supersedes any conflicting earlier guidance on the decisions listed in Section 1._
